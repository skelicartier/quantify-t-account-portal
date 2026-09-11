/**
 * The browser handoff behind the desktop app's "Sign in with browser".
 *
 * The app generates a `state` and a PKCE verifier, listens on a loopback port, and opens
 * `/connect/desktop?state&port&challenge`. Once the visitor is signed in and clicks
 * Connect, the console asks the Account API for a one-time code bound to the challenge
 * and sends the browser to `http://127.0.0.1:<port>/callback?code&state`, where the app
 * redeems the code with its verifier. Only the loopback host is ever a redirect target,
 * and the verifier never leaves the app.
 */

export const DESKTOP_CONNECT_PATH = "/connect/desktop";

/** Remembers a pending handoff across email confirmation: set at sign-up, read by /auth/confirm. */
export const DESKTOP_CONNECT_RETURN_COOKIE = "qt-connect-return";
export const DESKTOP_CONNECT_RETURN_MAX_AGE_SECONDS = 30 * 60;

const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const PORT_PATTERN = /^\d{4,5}$/u;
const MIN_PORT = 1024;
const MAX_PORT = 65_535;
const PLACEHOLDER_ORIGIN = "https://console.quantifyterminal.invalid";

export type DesktopConnectParams = {
  state: string;
  port: number;
  challenge: string;
};

export type DesktopConnectActionState = {
  status: "idle" | "error";
  message: string | null;
};

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
 * The three handoff parameters, or null unless every one is present exactly once and
 * well-formed: the app's `state`, an unprivileged loopback `port`, and the 43-character
 * base64url SHA-256 challenge of a verifier the app keeps to itself.
 */
export function parseDesktopConnectParams(source: ParamSource): DesktopConnectParams | null {
  const state = single(source, "state");
  const port = single(source, "port");
  const challenge = single(source, "challenge");
  if (state === null || port === null || challenge === null) return null;
  if (!STATE_PATTERN.test(state) || !CHALLENGE_PATTERN.test(challenge)) return null;
  if (!PORT_PATTERN.test(port)) return null;
  const portNumber = Number(port);
  if (portNumber < MIN_PORT || portNumber > MAX_PORT) return null;
  return { state, port: portNumber, challenge };
}

export function isDesktopConnectPath(pathname: string): boolean {
  return pathname === DESKTOP_CONNECT_PATH;
}

/** The canonical page path for a handoff, safe to carry as a post-login `next`. */
export function desktopConnectPath(params: DesktopConnectParams): string {
  const query = new URLSearchParams({
    state: params.state,
    port: String(params.port),
    challenge: params.challenge,
  });
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

/** Where the browser goes once the code exists: the app's loopback listener, never anywhere else. */
export function loopbackCallbackUrl(port: number, code: string, state: string): string {
  const query = new URLSearchParams({ code, state });
  return `http://127.0.0.1:${port}/callback?${query.toString()}`;
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
