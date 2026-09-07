/**
 * Azure SQL Auth Client
 * 
 * Replaces @supabase/ssr with custom auth using Azure SQL + JWT.
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
  session: AuthSession;
}

export class AzureAuthClient {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  /**
   * Sign up with email/password
   */
  async signUp(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ): Promise<AuthResponse> {
    const res = await fetch(`${this.apiUrl}/api/v1/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Signup failed");
    }

    return data;
  }

  /**
   * Sign in with email/password
   */
  async signIn(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${this.apiUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Login failed");
    }

    return data;
  }

  /**
   * Sign out
   */
  async signOut(accessToken: string): Promise<void> {
    await fetch(`${this.apiUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  /**
   * Get current user from access token
   */
  async getUser(accessToken: string): Promise<AuthUser> {
    const res = await fetch(`${this.apiUrl}/api/v1/auth/user`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Failed to get user");
    }

    return data.user;
  }

  /**
   * Refresh access token
   */
  async refreshSession(
    accessToken: string,
    refreshToken: string
  ): Promise<AuthSession> {
    const res = await fetch(`${this.apiUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Refresh failed");
    }

    return data.session;
  }

  /**
   * Update password
   */
  async updatePassword(
    accessToken: string,
    newPassword: string
  ): Promise<void> {
    const res = await fetch(`${this.apiUrl}/api/v1/auth/password/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ password: newPassword }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Password update failed");
    }
  }

  /**
   * Get user role
   */
  async getUserRole(accessToken: string): Promise<string> {
    const res = await fetch(`${this.apiUrl}/api/v1/auth/user/role`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Failed to get role");
    }

    return data.role;
  }

  /**
   * Get user profile
   */
  async getUserProfile(accessToken: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.apiUrl}/api/v1/auth/user/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Failed to get profile");
    }

    return data.profile;
  }
}

/**
 * Server-side cookie helpers for Next.js
 */
export function setSessionCookie(
  response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } },
  session: AuthSession
): void {
  response.cookies.set(COOKIE_NAME, session.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: session.expires_in,
  });
  response.cookies.set(REFRESH_COOKIE_NAME, session.refresh_token, COOKIE_OPTIONS);
}

export function clearSessionCookies(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }): void {
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
