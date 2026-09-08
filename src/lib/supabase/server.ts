/**
 * Azure SQL Server Client
 * 
 * Replaces Supabase server client for auth in server components/actions.
 */

import "server-only";

import { cookies } from "next/headers";

import { AzureAuthClient, AuthUser, getSessionFromCookies } from "@/lib/azure-auth-client";
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
      const { accessToken } = getSessionFromCookies({
        headers: {
          get: (name: string) => {
            const cookie = cookieStore.get(name);
            return cookie?.value || null;
          },
        },
      } as Request);

      if (!accessToken) return null;

      try {
        const client = new AzureAuthClient(config.apiUrl);
        return await client.getUser(accessToken);
      } catch {
        return null;
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
     * Set session cookies
     */
    setSession(session: { access_token: string; refresh_token: string; expires_in: number }) {
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
        this.setSession(result.session);
        return { data: result, error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : "Login failed" } };
      }
    },

    /**
     * Sign up with email/password
     */
    async signUp(email: string, password: string, _options?: { data?: Record<string, unknown> }) {
      const client = new AzureAuthClient(config.apiUrl);
      try {
        const result = await client.signUp(email, password);
        this.setSession(result.session);
        return { data: result, error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : "Signup failed" } };
      }
    },

    /**
     * Sign out
     */
    async signOut() {
      const accessToken = this.getAccessToken();
      if (accessToken) {
        const client = new AzureAuthClient(config.apiUrl);
        await client.signOut(accessToken);
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
