import "server-only";

import { randomUUID } from "node:crypto";

import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  postAccountApiJson,
} from "@/lib/admin/account-api";

type AzureSessionReader = {
  getUser: () => Promise<{ id: string } | null>;
  getAccessToken: () => string | null;
};

async function currentAccessToken(reader: AzureSessionReader): Promise<string | null> {
  try {
    return reader.getAccessToken();
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
  reader: AzureSessionReader,
): Promise<boolean> {
  const accessToken = await currentAccessToken(reader);
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
  reader: AzureSessionReader,
): Promise<boolean> {
  const accessToken = await currentAccessToken(reader);
  if (!accessToken) return false;
  return heartbeatAccountApiSession(accessToken);
}

export async function endCurrentAccountApiSession(
  reader: AzureSessionReader,
): Promise<boolean> {
  const accessToken = await currentAccessToken(reader);
  if (!accessToken) return false;
  return postSessionLifecycle("sessions/end", accessToken, { reason: "signed-out" });
}
