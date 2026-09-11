"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { endCurrentAccountApiSession } from "@/lib/account/session-lifecycle";
import { desktopConnectNextPath } from "@/lib/auth/desktop-connect";
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

/**
 * Signs out. A desktop handoff in `next` survives the sign-out, so "Not you?" on the
 * connect page returns the visitor to the same handoff once they sign in again.
 */
export async function logout(formData?: FormData): Promise<void> {
  await requireSameOriginServerAction();
  const returnTo =
    formData instanceof FormData ? desktopConnectNextPath(formData.get("next")) : null;
  const providerLogoutConfirmed = await revokeCurrentProviderSession();

  await clearPortalAzureAuthCookies();
  revalidatePath("/", "layout");
  const query = new URLSearchParams();
  if (!providerLogoutConfirmed) query.set("notice", "logout-incomplete");
  if (returnTo) query.set("next", returnTo);
  const search = query.toString();
  redirect(search ? `/login?${search}` : "/login");
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
