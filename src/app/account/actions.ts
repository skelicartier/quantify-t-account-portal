"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearPortalSupabaseAuthCookies, createServerSupabaseClient } from "@/lib/supabase/server";

async function revokeCurrentProviderSession(): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (!error) return true;
      } catch {
        // Retry once, then report incomplete provider cleanup without retaining cookies.
      }
    }
  } catch {
    // Browser-cookie cleanup remains mandatory when the provider is unavailable.
  }
  return false;
}

export async function logout(): Promise<void> {
  const providerLogoutConfirmed = await revokeCurrentProviderSession();

  await clearPortalSupabaseAuthCookies();
  revalidatePath("/", "layout");
  redirect(providerLogoutConfirmed ? "/login" : "/login?notice=logout-incomplete");
}
