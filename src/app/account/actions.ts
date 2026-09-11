"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { endCurrentAccountApiSession } from "@/lib/account/session-lifecycle";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { clearPortalAzureAuthCookies, createServerAzureClient } from "@/lib/supabase/server";
import { CONSOLE_THEME_COOKIE, CONSOLE_THEME_MAX_AGE_SECONDS, isConsoleTheme } from "@/lib/theme";

async function revokeCurrentProviderSession(): Promise<boolean> {
  try {
    const azure = await createServerAzureClient();
    await endCurrentAccountApiSession(azure);
    const { error } = await azure.signOut();
    if (error) return false;
    return true;
  } catch {
    // Browser-cookie cleanup remains mandatory when the provider is unavailable.
  }
  return false;
}

export async function logout(): Promise<void> {
  await requireSameOriginServerAction();
  const providerLogoutConfirmed = await revokeCurrentProviderSession();

  await clearPortalAzureAuthCookies();
  revalidatePath("/", "layout");
  redirect(providerLogoutConfirmed ? "/login" : "/login?notice=logout-incomplete");
}

/**
 * Remembers the console theme on this device. Unknown values are ignored rather than
 * stored, so the cookie only ever holds a theme the stylesheet knows.
 */
export async function setConsoleTheme(formData: FormData): Promise<void> {
  await requireSameOriginServerAction();
  const theme = formData.get("theme");
  if (!isConsoleTheme(theme)) return;

  const store = await cookies();
  store.set(CONSOLE_THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONSOLE_THEME_MAX_AGE_SECONDS,
  });
  revalidatePath("/", "layout");
}
