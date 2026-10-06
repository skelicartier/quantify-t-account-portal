/**
 * The browser handoff behind the desktop app's "Sign in with browser".
 *
 * The app asks the Account API to begin a handoff (a PKCE challenge in, an opaque id and
 * a short user code out), opens `/connect/desktop?handoff=<id>` and polls the API with
 * the id and its verifier. Here the signed-in visitor sees the code and the requesting
 * device and approves (or cancels) the request; the app's next poll then signs it in.
 * The browser is never redirected anywhere, nothing listens on the visitor's computer,
 * and the verifier never leaves the app.
 */

export const DESKTOP_CONNECT_PATH = "/connect/desktop";

/** Remembers a pending handoff across email confirmation: set at sign-up, read by /auth/confirm. */
export const DESKTOP_CONNECT_RETURN_COOKIE = "qt-connect-return";
export const DESKTOP_CONNECT_RETURN_MAX_AGE_SECONDS = 30 * 60;

const HANDOFF_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;
const PLACEHOLDER_ORIGIN = "https://console.quantifyterminal.invalid";

export type DesktopConnectParams = {
  handoff: string;
};

export type DesktopConnectActionState =
  | { status: "idle"; message: null }
  | { status: "error"; message: string }
  // The account has not been admitted: the service's own sentence, said as the account's state
  // rather than as a failure to retry.
  | { status: "access"; message: string; access: "pending" | "declined" }
  | { status: "connected"; message: null; userCode: string }
  | { status: "cancelled"; message: null };

export const INITIAL_DESKTOP_CONNECT_STATE: DesktopConnectActionState = {
  status: "idle",
  message: null,
};

export type DesktopConnectAction = (
  previousState: DesktopConnectActionState,
  formData: FormData,
) => Promise<DesktopConnectActionState>;

/** Anything with `getAll`: a URLSearchParams or a FormData. */
type ParamSource = { getAll(name: string): ReadonlyArray<unknown> };

function single(source: ParamSource, name: string): string | null {
  const values = source.getAll(name);
  const value = values.length === 1 ? values[0] : null;
  return typeof value === "string" ? value : null;
}

/**
 * The handoff id, or null unless it is present exactly once and shaped like one. The id
 * is opaque to the console: it identifies a pending request on the Account API and is
 * useless without the verifier the app keeps to itself.
 */
export function parseDesktopConnectParams(source: ParamSource): DesktopConnectParams | null {
  const handoff = single(source, "handoff");
  if (handoff === null || !HANDOFF_ID_PATTERN.test(handoff)) return null;
  return { handoff };
}

export function isDesktopConnectPath(pathname: string): boolean {
  return pathname === DESKTOP_CONNECT_PATH;
}

/** The canonical page path for a handoff, safe to carry as a post-login `next`. */
export function desktopConnectPath(params: DesktopConnectParams): string {
  const query = new URLSearchParams({ handoff: params.handoff });
  return `${DESKTOP_CONNECT_PATH}?${query.toString()}`;
}

/** Whether an already-sanitized `next` path returns the visitor to the desktop app. */
export function isDesktopConnectNextPath(nextPath: string): boolean {
  return nextPath.startsWith(`${DESKTOP_CONNECT_PATH}?`);
}

/**
 * The canonical handoff path for an untrusted `next`-style value, or null when it is not
 * exactly the connect page with a well-formed handoff. Used wherever a handoff has to
 * survive a hop the visitor controls: sign-out, sign-up, email confirmation.
 */
export function desktopConnectNextPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(`${DESKTOP_CONNECT_PATH}?`)) return null;
  let destination: URL;
  try {
    destination = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (destination.origin !== PLACEHOLDER_ORIGIN || !isDesktopConnectPath(destination.pathname)) {
    return null;
  }
  const handoff = parseDesktopConnectParams(destination.searchParams);
  return handoff ? desktopConnectPath(handoff) : null;
}

export function loginPathForDesktopConnect(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

/** The pending handoff remembered by the return cookie, if the cookie carries a valid one. */
export function readDesktopConnectReturn(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== DESKTOP_CONNECT_RETURN_COOKIE) continue;
    try {
      return desktopConnectNextPath(decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}

/** A `Set-Cookie` value that stores the handoff (or clears it when `value` is null). */
export function desktopConnectReturnCookie(
  value: string | null,
  options: { secure: boolean },
): string {
  const attributes = [
    `${DESKTOP_CONNECT_RETURN_COOKIE}=${value === null ? "" : encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${value === null ? 0 : DESKTOP_CONNECT_RETURN_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}
