import "server-only";

import { randomUUID } from "node:crypto";

import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  postAccountApiJson,
} from "@/lib/admin/account-api";

type SupabaseSessionReader = {
  auth: {
    getSession: () => Promise<{
      data?: { session?: { access_token?: string | null } | null };
      error?: unknown;
    }>;
  };
};

async function currentAccessToken(supabase: SupabaseSessionReader): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const token = data?.session?.access_token?.trim();
    return token || null;
  } catch {
    return null;
  }
}

async function postSessionLifecycle(
  route: string,
  accessToken: string,
  body: Readonly<Record<string, unknown>>,
): Promise<boolean> {
  try {
    await postAccountApiJson(route, accessToken, body, {
      idempotencyKey: `portal-${randomUUID()}`,
    });
    return true;
  } catch (error) {
    if (error instanceof AccountApiUnavailableError || error instanceof AccountApiRequestError) {
      return false;
    }
    return false;
  }
}

export async function registerCurrentAccountApiSession(
  supabase: SupabaseSessionReader,
): Promise<boolean> {
  const accessToken = await currentAccessToken(supabase);
  if (!accessToken) return false;
  return postSessionLifecycle("sessions/register", accessToken, {
    source: "portal",
    device_name: "Web portal",
  });
}

export async function heartbeatAccountApiSession(accessToken: string): Promise<boolean> {
  const token = accessToken.trim();
  if (!token) return false;
  return postSessionLifecycle("sessions/heartbeat", token, { device_name: "Web portal" });
}

export async function heartbeatCurrentAccountApiSession(
  supabase: SupabaseSessionReader,
): Promise<boolean> {
  const accessToken = await currentAccessToken(supabase);
  if (!accessToken) return false;
  return heartbeatAccountApiSession(accessToken);
}

export async function endCurrentAccountApiSession(
  supabase: SupabaseSessionReader,
): Promise<boolean> {
  const accessToken = await currentAccessToken(supabase);
  if (!accessToken) return false;
  return postSessionLifecycle("sessions/end", accessToken, { reason: "signed-out" });
}
