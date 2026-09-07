import { z } from "zod";

export type AccountSessionStatus = "active" | "expired" | "revoked";

export type AccountSessionDto = {
  id: string;
  userId: string;
  source: string;
  provider: string;
  clientInstanceId: string | null;
  deviceName: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  status: AccountSessionStatus;
};

export type AccountActivityOutcome = "success" | "failure" | "blocked" | "unknown";

export type AccountActivityEventDto = {
  id: string;
  userId: string;
  sessionId: string | null;
  eventType: string;
  outcome: AccountActivityOutcome;
  source: string;
  occurredAt: string;
  createdAt: string;
};

const sourceSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/u);
const eventTypeSchema = z.string().regex(/^[a-z][a-z0-9_.-]{2,63}$/u);
const nullableTextSchema = z.string().nullable();

const sessionRowSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    source: sourceSchema,
    provider: sourceSchema,
    client_instance_id: z.string().max(256).nullable(),
    device_name: z.string().max(200).nullable(),
    created_at: z.string(),
    last_seen_at: z.string(),
    expires_at: nullableTextSchema,
    revoked_at: nullableTextSchema,
    revoke_reason: nullableTextSchema,
  })
  .strict();

const activityRowSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    session_id: z.string().uuid().nullable(),
    event_type: eventTypeSchema,
    outcome: z.enum(["success", "failure", "blocked", "unknown"]),
    source: sourceSchema,
    occurred_at: z.string(),
    created_at: z.string(),
  })
  .strict();

function cleanText(value: string | null | undefined, maximumLength: number): string | null {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ").slice(0, maximumLength);
  return normalized || null;
}

function safeDate(value: string | null | undefined): string | null {
  const normalized = cleanText(value, 80);
  return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : null;
}

function requiredDate(value: string): string {
  const normalized = safeDate(value);
  if (!normalized) throw new Error("Account session timestamp is invalid.");
  return normalized;
}

function sessionStatus(
  expiresAt: string | null,
  revokedAt: string | null,
  now: Date,
): AccountSessionStatus {
  if (revokedAt) return "revoked";
  if (expiresAt && Date.parse(expiresAt) <= now.getTime()) return "expired";
  return "active";
}

export function mapAccountSessions(
  userId: string,
  rows: unknown,
  options: { now?: Date } = {},
): AccountSessionDto[] {
  const parsed = z.array(sessionRowSchema).max(50).safeParse(rows);
  const now = options.now ?? new Date();
  if (!parsed.success || Number.isNaN(now.getTime())) {
    throw new Error("Account sessions are invalid.");
  }

  return parsed.data.map((row) => {
    if (row.user_id !== userId) throw new Error("Account session owner mismatch.");
    const createdAt = requiredDate(row.created_at);
    const lastSeenAt = requiredDate(row.last_seen_at);
    const expiresAt = safeDate(row.expires_at);
    const revokedAt = safeDate(row.revoked_at);

    return {
      id: row.id,
      userId: row.user_id,
      source: row.source,
      provider: row.provider,
      clientInstanceId: cleanText(row.client_instance_id, 256),
      deviceName: cleanText(row.device_name, 120),
      createdAt,
      lastSeenAt,
      expiresAt,
      revokedAt,
      revokeReason: cleanText(row.revoke_reason, 200),
      status: sessionStatus(expiresAt, revokedAt, now),
    };
  });
}

export function mapAccountActivityEvents(userId: string, rows: unknown): AccountActivityEventDto[] {
  const parsed = z.array(activityRowSchema).max(100).safeParse(rows);
  if (!parsed.success) throw new Error("Account activity events are invalid.");

  return parsed.data.map((row) => {
    if (row.user_id !== userId) throw new Error("Account activity owner mismatch.");
    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      eventType: row.event_type,
      outcome: row.outcome,
      source: row.source,
      occurredAt: requiredDate(row.occurred_at),
      createdAt: requiredDate(row.created_at),
    };
  });
}
