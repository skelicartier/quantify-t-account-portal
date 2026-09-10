import { z } from "zod";

import {
  mapAccountActivityEvents,
  mapAccountSessions,
  type AccountActivityEventDto,
  type AccountSessionDto,
} from "@/lib/dto/session";
import { fetchAccountApiActivity, fetchAccountApiSessions } from "@/lib/admin/account-api";

export const ACCOUNT_SESSIONS_ENDPOINT = "sessions";
export const ACCOUNT_ACTIVITY_ENDPOINT = "activity";

export const ACCOUNT_SESSION_LIMIT = 50;
export const ACCOUNT_ACTIVITY_LIMIT = 100;

type AzureUserResult = { id: string; email: string; [key: string]: unknown } | null;

export type AccountSessionDataClient = {
  getUser: () => Promise<AzureUserResult>;
  getAccessToken: () => string | null;
};

export const ACCOUNT_SESSIONS_UNAVAILABLE_MESSAGE = "Account sessions are temporarily unavailable.";
export const ACCOUNT_ACTIVITY_UNAVAILABLE_MESSAGE = "Account activity is temporarily unavailable.";

export class AccountSessionsUnavailableError extends Error {
  constructor() {
    super(ACCOUNT_SESSIONS_UNAVAILABLE_MESSAGE);
    this.name = "AccountSessionsUnavailableError";
  }
}

export class AccountActivityUnavailableError extends Error {
  constructor() {
    super(ACCOUNT_ACTIVITY_UNAVAILABLE_MESSAGE);
    this.name = "AccountActivityUnavailableError";
  }
}

async function currentVerifiedUserId(
  client: AccountSessionDataClient,
  unavailable: () => Error,
): Promise<string | null> {
  let identity: AzureUserResult;
  try {
    identity = await client.getUser();
  } catch {
    throw unavailable();
  }

  const userId = identity?.id;
  if (!userId) return null;
  if (!z.string().uuid().safeParse(userId).success) throw unavailable();
  return userId;
}

export async function loadAccountSessions(
  client: AccountSessionDataClient,
  options: { now?: Date } = {},
): Promise<AccountSessionDto[] | null> {
  const userId = await currentVerifiedUserId(client, () => new AccountSessionsUnavailableError());
  if (!userId) return null;

  const accessToken = client.getAccessToken();
  if (!accessToken) throw new AccountSessionsUnavailableError();

  let rows: unknown;
  try {
    rows = (await fetchAccountApiSessions(accessToken)).sessions;
  } catch {
    throw new AccountSessionsUnavailableError();
  }

  try {
    return mapAccountSessions(userId, rows, options);
  } catch {
    throw new AccountSessionsUnavailableError();
  }
}

export async function loadAccountActivityEvents(
  client: AccountSessionDataClient,
): Promise<AccountActivityEventDto[] | null> {
  const userId = await currentVerifiedUserId(client, () => new AccountActivityUnavailableError());
  if (!userId) return null;

  const accessToken = client.getAccessToken();
  if (!accessToken) throw new AccountActivityUnavailableError();

  let rows: unknown;
  try {
    rows = (await fetchAccountApiActivity(accessToken)).events;
  } catch {
    throw new AccountActivityUnavailableError();
  }

  try {
    return mapAccountActivityEvents(userId, rows);
  } catch {
    throw new AccountActivityUnavailableError();
  }
}
