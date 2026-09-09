"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { endCurrentAccountApiSession } from "@/lib/account/session-lifecycle";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { clearPortalAzureAuthCookies, createServerAzureClient } from "@/lib/supabase/server";

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
