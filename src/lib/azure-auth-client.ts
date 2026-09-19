/**
 * Azure Account API Auth Client
 *
 * Replaces browser/SSR Supabase auth with the dedicated Account API.
 * Stores JWT in httpOnly cookies and provides user/session management.
 */

import type { SignupConsentMetadata } from "@/lib/auth/consent";

const COOKIE_NAME = "qt-session";
const REFRESH_COOKIE_NAME = "qt-refresh";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  email_confirmed: boolean;
  role: string;
  profile: Record<string, unknown> | null;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface AuthResponse {
  user: AuthUser;
  session?: AuthSession;
}

export class AzureAuthError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly correlationId: string | null;
  /** The API's typed `details` for the code (for example `account_exists` says whether the account is verified). */
  readonly details: Readonly<Record<string, unknown>>;

  constructor({
    status,
    code,
    message,
    correlationId,
    details = {},
  }: {
    status: number;
    code: string | null;
    message: string;
    correlationId: string | null;
    details?: Record<string, unknown>;
  }) {
    super(message);
    this.name = "AzureAuthError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
    this.details = details;
  }
}

/** The header the Account API reads to learn who a proxied call is acting for. */
export const CLIENT_ADDRESS_HEADER = "X-QT-Client-Address";

/**
 * The address of the person this request is being made for.
 *
 * WHY THE SERVICE CANNOT WORK THIS OUT ITSELF. The console calls the Account API from its own
 * server, so what the service observes is the console's egress — in production a rotating pool
 * of AWS addresses, none of them the person signing in. Its per-source rate limits are keyed on
 * that, which makes them both blind (a thousand accounts tried from one browser look like
 * ordinary console traffic) and unfair (five strangers landing on the same egress address share
 * a budget of five signups an hour). Saying who the call is for is what fixes both.
 *
 * The service keys on the PAIR of what it observed and what is claimed here, so a forged value
 * cannot spend anybody else's budget — see `source_key` in the service's throttle module.
 *
 * Read through a dynamic import so this module stays usable outside a request: every path that
 * has no headers — a test, a build-time render — simply forwards nothing, and the service falls
 * back to what it observes.
 */
async function callerAddress(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const list = await headers();
    // `x-real-ip` is set by the platform and is the single address it saw. The leftmost
    // `x-forwarded-for` entry is the fallback, and it is the client-supplied end of that
    // header — which is why the service treats a claim as a claim rather than as fact.
    const direct = (list.get("x-real-ip") ?? "").trim();
    if (direct) return direct;
    const forwarded = (list.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
    return forwarded;
  } catch {
    return "";
  }
}

export class AzureAuthClient {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl.replace(/\/+$/u, "");
  }

  private endpoint(path: string): string {
    const apiBase = this.apiUrl.endsWith("/api/v1") ? this.apiUrl : `${this.apiUrl}/api/v1`;
    return `${apiBase}${path}`;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response;
    // Attached here rather than at each call site: there are ten places that build this
    // client, and a header that has to be remembered at every one of them is a header that
    // will be missing from the next one somebody adds.
    const caller = await callerAddress();
    const init2: RequestInit = caller
      ? {
          ...init,
          headers: { ...(init.headers as Record<string, string>), [CLIENT_ADDRESS_HEADER]: caller },
        }
      : init;
    try {
      res = await fetch(this.endpoint(path), init2);
    } catch (error) {
      void error;
      throw new AzureAuthError({
        status: 0,
        code: "network_error",
        message: "Authentication service is unreachable.",
        correlationId: null,
      });
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new AzureAuthError({
        status: res.status,
        code: "invalid_response",
        message: "Authentication service returned an invalid response.",
        correlationId: res.headers.get("x-correlation-id"),
      });
    }

    if (!res.ok || (data && typeof data === "object" && (data as { ok?: unknown }).ok === false)) {
      const error =
        data && typeof data === "object" && "error" in data
          ? (data as { error?: { code?: unknown; message?: unknown; details?: unknown } }).error
          : null;
      const correlationId =
        data &&
        typeof data === "object" &&
        typeof (data as { correlation_id?: unknown }).correlation_id === "string"
          ? (data as { correlation_id: string }).correlation_id
          : res.headers.get("x-correlation-id");
      throw new AzureAuthError({
        status: res.status,
        code: typeof error?.code === "string" ? error.code : null,
        message:
          typeof error?.message === "string" ? error.message : "Authentication request failed.",
        correlationId,
        details:
          error?.details && typeof error.details === "object"
            ? (error.details as Record<string, unknown>)
            : {},
      });
    }

    return data as T;
  }

  /**
   * Sign up with email/password
   */
  /**
   * Create an account.
   *
   * `consent` records which terms and privacy versions the person was shown when they
   * ticked the box. The tick was always enforced; the versions were never sent, so the
   * account service could say that somebody consented and not to what. Only this side
   * knows, because only this side rendered the links.
   */
  async signUp(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
    consent?: SignupConsentMetadata,
  ): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        ...(consent ? { consent } : {}),
      }),
    });
  }

  /**
   * Sign in with email/password
   */
  async signIn(email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  }

  /**
   * Sign out
   */
  async signOut(accessToken: string | null, refreshToken?: string | null): Promise<void> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    await this.request("/auth/logout", {
      method: "POST",
      headers,
      body: JSON.stringify({ refresh_token: refreshToken ?? "" }),
    });
  }

  /**
   * Get current user from access token
   */
  async getUser(accessToken: string): Promise<AuthUser> {
    const data = await this.request<{ user: AuthUser }>("/auth/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data.user;
  }

  /**
   * Refresh access token
   */
  async refreshSession(accessToken: string | null, refreshToken: string): Promise<AuthSession> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const data = await this.request<{ session: AuthSession }>("/auth/refresh", {
      method: "POST",
      headers,
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return data.session;
  }

  /**
   * Change the signed-in account's password.
   *
   * The current password goes to the service, not only to the reauthentication call this
   * console makes first. That check is a convenience for the person typing; the service is
   * what holds the credential, and it used to accept a bearer token and a new password
   * with nothing else — so anything holding a token could take the account over.
   *
   * Returns how many other sessions the service ended, so the success copy can say what
   * actually happened rather than guess.
   */
  async updatePassword(
    accessToken: string,
    newPassword: string,
    currentPassword: string,
  ): Promise<number> {
    const data = await this.request<{ other_sessions_revoked?: number }>("/auth/password/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ password: newPassword, current_password: currentPassword }),
    });
    return typeof data?.other_sessions_revoked === "number" ? data.other_sessions_revoked : -1;
  }

  /**
   * Get user role
   */
  async getUserRole(accessToken: string): Promise<string> {
    const data = await this.request<{ role: string }>("/auth/user/role", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data.role;
  }

  /**
   * Get user profile
   */
  async getUserProfile(accessToken: string): Promise<Record<string, unknown>> {
    const data = await this.request<{ profile: Record<string, unknown> }>("/auth/user/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data.profile;
  }

  /**
   * Confirm email address via token
   */
  async confirmEmail(token: string): Promise<void> {
    await this.request("/auth/confirm-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  }

  /**
   * Request password reset email
   */
  async forgotPassword(email: string): Promise<void> {
    await this.request("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }

  /**
   * Reset password via token
   */
  async resetPassword(token: string, password: string): Promise<void> {
    await this.request("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
  }
}

/**
 * Server-side cookie helpers for Next.js
 */
export function setSessionCookie(
  response: {
    cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void };
  },
  session: AuthSession,
): void {
  response.cookies.set(COOKIE_NAME, session.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: session.expires_in,
  });
  response.cookies.set(REFRESH_COOKIE_NAME, session.refresh_token, COOKIE_OPTIONS);
}

export function clearSessionCookies(response: {
  cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void };
}): void {
  response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}

export function getSessionFromCookies(request: Request): {
  accessToken: string | undefined;
  refreshToken: string | undefined;
} {
  const accessToken = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
    ?.split("=")[1];
  const refreshToken = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`))
    ?.split("=")[1];

  return { accessToken: accessToken || undefined, refreshToken: refreshToken || undefined };
}
