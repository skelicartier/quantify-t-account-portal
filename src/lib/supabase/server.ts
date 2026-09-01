import "server-only";

import { clearAuthCookiesAtScopes, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfiguration } from "@/lib/supabase/config";

type ServerClientOptions = {
  cookieWriteMode?: "required" | "best-effort";
};

export async function createServerSupabaseClient({
  cookieWriteMode = "required",
}: ServerClientOptions = {}) {
  const cookieStore = await cookies();
  const { url, publishableKey, cookieOptions } = getSupabasePublicConfiguration();

  return createServerClient(url, publishableKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch (error) {
          if (cookieWriteMode === "required") throw error;
          // Server Components cannot write cookies. The proxy refresh path performs that write.
        }
      },
    },
  });
}

export async function clearPortalSupabaseAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  const { cookieOptions } = getSupabasePublicConfiguration();
  const { name: storageKey, ...scope } = cookieOptions;
  if (!storageKey) throw new Error("Supabase authentication cookie name is unavailable.");

  await clearAuthCookiesAtScopes({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      for (const { name, value, options } of cookiesToSet) {
        cookieStore.set(name, value, options);
      }
    },
    storageKey,
    scopes: [scope],
  });
}
