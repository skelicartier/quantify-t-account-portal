/**
 * Azure Account API Server Auth Client
 *
 * Replaces Supabase server client for auth in server components/actions.
 */

import "server-only";

import { cookies } from "next/headers";

import { AzureAuthClient, AuthUser } from "@/lib/azure-auth-client";
import type { SignupConsentMetadata } from "@/lib/auth/consent";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";

type ServerClientOptions = {
  cookieWriteMode?: "required" | "best-effort";
};

export async function createServerAzureClient({
  cookieWriteMode = "required",
}: ServerClientOptions = {}) {
  const config = getAzureAuthConfig();
  const cookieStore = await cookies();

  return {
    /**
     * Get current user from session
     */
    async getUser(): Promise<AuthUser | null> {
      const accessToken = cookieStore.get(config.cookieName)?.value;
      const refreshToken = cookieStore.get(config.refreshTokenName)?.value;
      const client = new AzureAuthClient(config.apiUrl);

      function writeSession(session: {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      }): void {
        try {
          cookieStore.set(config.cookieName, session.access_token, {
            ...config.cookieOptions,
            maxAge: session.expires_in,
          });
          cookieStore.set(config.refreshTokenName, session.refresh_token, config.cookieOptions);
        } catch (error) {
          if (cookieWriteMode === "required") throw error;
        }
      }

      async function refreshUser(): Promise<AuthUser | null> {
        if (!refreshToken) return null;
        try {
          const session = await client.refreshSession(accessToken ?? null, refreshToken);
          if (
            !session.access_token ||
            !session.refresh_token ||
            !Number.isSafeInteger(session.expires_in) ||
            session.expires_in <= 0
          ) {
            return null;
          }
          writeSession(session);
          return await client.getUser(session.access_token);
        } catch {
          return null;
        }
      }

      if (!accessToken) return await refreshUser();

      try {
        return await client.getUser(accessToken);
      } catch {
        return await refreshUser();
      }
    },

    /**
     * Get access token
     */
    getAccessToken(): string | null {
      const cookie = cookieStore.get(config.cookieName);
      return cookie?.value || null;
    },

    /**
     * Get refresh token
     */
    getRefreshToken(): string | null {
      const cookie = cookieStore.get(config.refreshTokenName);
      return cookie?.value || null;
    },

    /**
     * Set session cookies
     */
    setSession(session: { access_token: string; refresh_token: string; expires_in: number }) {
      if (
        !session.access_token ||
        !session.refresh_token ||
        !Number.isSafeInteger(session.expires_in) ||
        session.expires_in <= 0
      ) {
        throw new Error("Login response did not include a valid session.");
      }
      try {
        cookieStore.set(config.cookieName, session.access_token, {
          ...config.cookieOptions,
          maxAge: session.expires_in,
        });
        cookieStore.set(config.refreshTokenName, session.refresh_token, config.cookieOptions);
      } catch (error) {
        if (cookieWriteMode === "required") throw error;
      }
    },

    /**
     * Clear session cookies
     */
    clearSession() {
      cookieStore.set(config.cookieName, "", { ...config.cookieOptions, maxAge: 0 });
      cookieStore.set(config.refreshTokenName, "", { ...config.cookieOptions, maxAge: 0 });
    },

    /**
     * Sign in with email/password
     */
    async signInWithPassword(email: string, password: string) {
      const client = new AzureAuthClient(config.apiUrl);
      try {
        const result = await client.signIn(email, password);
        if (!result.session) throw new Error("Login response did not include a session.");
        this.setSession(result.session);
        return { data: result, error: null };
      } catch (e) {
        return {
          data: null,
          error:
            e && typeof e === "object" && "code" in e
              ? e
              : { code: null, message: e instanceof Error ? e.message : "Login failed" },
        };
      }
    },

    /**
     * Sign up with email/password
     */
    async signUp(
      email: string,
      password: string,
      firstName = "",
      lastName = "",
      consent?: SignupConsentMetadata,
    ) {
      const client = new AzureAuthClient(config.apiUrl);
      try {
        const result = await client.signUp(email, password, firstName, lastName, consent);
        return { data: result, error: null };
      } catch (e) {
        return {
          data: null,
          error:
            e && typeof e === "object" && "code" in e
              ? e
              : { code: null, message: e instanceof Error ? e.message : "Signup failed" },
        };
      }
    },

    /**
     * Sign out
     */
    async signOut() {
      const accessToken = this.getAccessToken();
      const refreshToken = this.getRefreshToken();
      if (accessToken || refreshToken) {
        const client = new AzureAuthClient(config.apiUrl);
        await client.signOut(accessToken, refreshToken);
      }
      this.clearSession();
      return { error: null };
    },
  };
}

export async function clearPortalAzureAuthCookies(): Promise<void> {
  const config = getAzureAuthConfig();
  const cookieStore = await cookies();
  cookieStore.set(config.cookieName, "", { ...config.cookieOptions, maxAge: 0 });
  cookieStore.set(config.refreshTokenName, "", { ...config.cookieOptions, maxAge: 0 });
}
