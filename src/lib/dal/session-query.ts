import { z } from "zod";

import type { AccountIdentity } from "@/lib/dto/account";
import {
  mapAccountActivityEvents,
  mapAccountSessions,
  type AccountActivityEventDto,
  type AccountSessionDto,
} from "@/lib/dto/session";

export const ACCOUNT_SESSION_COLUMNS = [
  "id",
  "user_id",
  "source",
  "provider",
  "client_instance_id",
  "device_name",
  "created_at",
  "last_seen_at",
  "expires_at",
  "revoked_at",
  "revoke_reason",
].join(",");

export const ACCOUNT_ACTIVITY_COLUMNS = [
  "id",
  "user_id",
  "session_id",
  "event_type",
  "outcome",
  "source",
  "occurred_at",
  "created_at",
].join(",");

export const ACCOUNT_SESSION_LIMIT = 50;
export const ACCOUNT_ACTIVITY_LIMIT = 100;

type AuthResult = {
  data: { user: AccountIdentity | null };
  error: unknown;
};

type QueryResult = {
  data: unknown;
  error: unknown;
};

type OrderedQuery = {
  limit: (count: number) => Promise<QueryResult>;
};

type OwnerQuery = {
  order: (column: string, options: { ascending: boolean }) => OrderedQuery;
};

type SelectQuery = {
  eq: (column: "user_id", value: string) => OwnerQuery;
};

export type AccountSessionDataClient = {
  auth: {
    getUser: () => Promise<AuthResult>;
  };
  from: (table: "account_sessions" | "auth_events") => {
    select: (columns: string) => SelectQuery;
  };
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
  let auth: AuthResult;
  try {
    auth = await client.auth.getUser();
  } catch {
    throw unavailable();
  }

  const userId = auth.data.user?.id;
  if (auth.error || !userId) return null;
  if (!z.string().uuid().safeParse(userId).success) throw unavailable();
  return userId;
}

export async function loadAccountSessions(
  client: AccountSessionDataClient,
  options: { now?: Date } = {},
): Promise<AccountSessionDto[] | null> {
  const userId = await currentVerifiedUserId(client, () => new AccountSessionsUnavailableError());
  if (!userId) return null;

  let result: QueryResult;
  try {
    result = await client
      .from("account_sessions")
      .select(ACCOUNT_SESSION_COLUMNS)
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false })
      .limit(ACCOUNT_SESSION_LIMIT);
  } catch {
    throw new AccountSessionsUnavailableError();
  }

  if (result.error) throw new AccountSessionsUnavailableError();

  try {
    return mapAccountSessions(userId, result.data, options);
  } catch {
    throw new AccountSessionsUnavailableError();
  }
}

export async function loadAccountActivityEvents(
  client: AccountSessionDataClient,
): Promise<AccountActivityEventDto[] | null> {
  const userId = await currentVerifiedUserId(client, () => new AccountActivityUnavailableError());
  if (!userId) return null;

  let result: QueryResult;
  try {
    result = await client
      .from("auth_events")
      .select(ACCOUNT_ACTIVITY_COLUMNS)
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(ACCOUNT_ACTIVITY_LIMIT);
  } catch {
    throw new AccountActivityUnavailableError();
  }

  if (result.error) throw new AccountActivityUnavailableError();

  try {
    return mapAccountActivityEvents(userId, result.data);
  } catch {
    throw new AccountActivityUnavailableError();
  }
}
