import type { CookieOptionsWithName } from "@supabase/ssr";

import { parsePublicEnvironment } from "@/lib/env/public-env";

export function getSupabaseAuthStorageKey(url: string): string {
  const projectReference = new URL(url).hostname.split(".")[0];
  if (!projectReference) throw new Error("Supabase URL does not contain a project reference.");
  return `sb-${projectReference}-auth-token`;
}

export function getSupabaseAuthCookieOptions(
  url: string,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
): CookieOptionsWithName {
  return {
    name: getSupabaseAuthStorageKey(url),
    httpOnly: true,
    secure: nodeEnvironment === "production",
    sameSite: "lax",
    path: "/",
  };
}

export function getSupabasePublicConfiguration(): {
  url: string;
  publishableKey: string;
  siteUrl: string;
  turnstileSiteKey: string;
  cookieOptions: CookieOptionsWithName;
} {
  const environment = parsePublicEnvironment({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;

  return {
    url,
    publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    siteUrl: environment.NEXT_PUBLIC_SITE_URL,
    turnstileSiteKey: environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    cookieOptions: getSupabaseAuthCookieOptions(url),
  };
}
