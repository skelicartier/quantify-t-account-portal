/**
 * Azure Account API Auth Client
 *
 * Replaces browser/SSR Supabase auth with the dedicated Account API.
 * Stores JWT in httpOnly cookies and provides user/session management.
 */

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
    try {
      res = await fetch(this.endpoint(path), init);
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
  async signUp(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
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
   * Update password
   */
  async updatePassword(accessToken: string, newPassword: string): Promise<void> {
    await this.request("/auth/password/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ password: newPassword }),
    });
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
