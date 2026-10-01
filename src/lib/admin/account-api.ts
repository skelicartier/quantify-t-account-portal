import "server-only";

import { z } from "zod";

import { ASSIGNABLE_ROLES, type AssignableRole } from "@/lib/admin/role-labels";

export { ASSIGNABLE_ROLES, type AssignableRole };
/** The versioned path every Account API route lives under (`host.json` routePrefix). */
export const ACCOUNT_API_ROUTE_PREFIX = "/api/v1";
/** The audit event types every plan and override change is recorded under. */
export const SUBSCRIPTION_CHANGED_EVENT = "account.subscription_changed";
export const ENTITLEMENT_CHANGED_EVENT = "account.entitlement_changed";

type Fetcher = (input: URL, init: RequestInit) => Promise<Response>;

export class AccountApiUnavailableError extends Error {
  readonly correlationId: string | null;

  constructor(correlationId: string | null = null) {
    super("Account administration is temporarily unavailable.");
    this.name = "AccountApiUnavailableError";
    this.correlationId = correlationId;
  }
}

/**
 * Server-side breadcrumb for an Account API failure. Deliberately narrow: the route,
 * the outcome, and the correlation id are enough to find the matching backend log line,
 * and nothing that could carry a token, a body, or a header is ever included.
 */
function logAccountApiFailure(
  route: string,
  method: string,
  detail: Readonly<Record<string, string | number | null>>,
): void {
  const fields = Object.entries({ route, method, ...detail })
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.error(`[account-api] ${fields}`);
}

function schemaIssuePaths(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => issue.path.map(String).join(".") || "<root>")
    .join(",");
}

function parseAccountApiPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  route: string,
  method = "GET",
): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  const correlationId =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { correlation_id?: unknown }).correlation_id === "string"
      ? (payload as { correlation_id: string }).correlation_id
      : null;
  logAccountApiFailure(route, method, {
    outcome: "schema_mismatch",
    issues: schemaIssuePaths(parsed.error),
    correlation_id: correlationId,
  });
  throw new AccountApiUnavailableError(correlationId);
}

export class AccountApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string | null;
  readonly details: Readonly<Record<string, unknown>>;

  constructor({
    status,
    code,
    message,
    correlationId,
    details = {},
  }: {
    status: number;
    code: string;
    message: string;
    correlationId: string | null;
    details?: Readonly<Record<string, unknown>>;
  }) {
    super(message);
    this.name = "AccountApiRequestError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
    this.details = details;
  }
}

// Derived, never retyped. A hand-written second copy of the role list is how a role the
// API started returning becomes a schema mismatch on `/me`, which fails every page at
// once rather than the one place that cares.
const roleSchema = z.enum(ASSIGNABLE_ROLES);
const nullableRoleSchema = roleSchema.nullable();
const correlationSchema = z.string().min(1).max(160);

const accountApiErrorSchema = z
  .object({
    ok: z.literal(false),
    correlation_id: correlationSchema.optional(),
    error: z
      .object({
        code: z.string().min(1).max(96),
        message: z.string().min(1).max(240),
      })
      .passthrough(),
  })
  .passthrough();

export const accountApiMeSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    user: z
      .object({
        user_id: z.guid(),
        email: z.string().email().max(254),
        is_active: z.boolean(),
      })
      .strict(),
    role: z
      .object({
        effective: roleSchema,
        database: nullableRoleSchema,
        legacy: nullableRoleSchema,
        mismatch: z.string().min(1).max(96),
        break_glass: z.boolean(),
      })
      .strict(),
    capabilities: z.array(z.string().min(1).max(96)).max(64),
    environment: z.string().min(1).max(64),
  })
  .strict();

// A profile created before the versioned write path exists carries version 0; that is a
// readable profile, not a malformed one, and the compare-and-swap still works from 0.
const profileVersionSchema = z.number().int().nonnegative();

const accountProfileSchema = z
  .object({
    user_id: z.guid(),
    first_name: z.string().max(80),
    last_name: z.string().max(80),
    email: z.string().max(254),
    phone: z.string().max(32),
    country: z.string().max(80),
    is_admin: z.boolean(),
    is_active: z.boolean(),
    timezone: z.string().max(80),
    default_currency: z.string().max(3),
    subscription_tier: z.string().max(64),
    two_factor_enabled: z.boolean(),
    notify_price_alerts: z.boolean(),
    notify_portfolio_moves: z.boolean(),
    notify_news_digest: z.boolean(),
    data_refresh_rate: z.string().max(64),
    theme_preference: z.string().max(64),
    profile_version: profileVersionSchema,
    created_at: z.string().max(64),
    last_login_at: z.string().max(64),
    updated_at: z.string().max(64),
  })
  .strict();

const accountProfileMutationReceiptSchema = z
  .object({
    user_id: z.guid(),
    profile_version: profileVersionSchema,
    updated_at: z.string().max(64),
  })
  .strict();

export const accountApiProfileSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    profile: accountProfileSchema,
  })
  .strict();

export const accountApiProfileUpdateSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    profile: accountProfileMutationReceiptSchema,
  })
  .strict();

const adminSessionSchema = z
  .object({
    id: z.guid(),
    user_id: z.guid(),
    source: z.string().min(1).max(32),
    provider: z.string().min(1).max(32),
    client_instance_id: z.string().max(256).nullable(),
    device_name: z.string().max(200).nullable(),
    created_at: z.string().max(64).nullable(),
    last_seen_at: z.string().max(64).nullable(),
    expires_at: z.string().max(64).nullable(),
    revoked_at: z.string().max(64).nullable(),
    revoke_reason: z.string().max(80).nullable(),
  })
  .strict();

const adminActivitySchema = z
  .object({
    id: z.guid(),
    user_id: z.guid().nullable(),
    session_id: z.guid().nullable(),
    event_type: z.string().min(1).max(96),
    outcome: z.enum(["success", "failure", "blocked", "unknown"]),
    source: z.string().min(1).max(32),
    occurred_at: z.string().max(64).nullable(),
    created_at: z.string().max(64).nullable(),
  })
  .strict();

const accountActivitySchema = adminActivitySchema
  .extend({
    user_id: z.guid(),
  })
  .strict();

export const accountApiSessionsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    sessions: z.array(adminSessionSchema).max(50),
  })
  .strict();

export const accountApiActivitySchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    events: z.array(accountActivitySchema).max(100),
  })
  .strict();

// --------------------------------------------------------------- subscriptions
// One entitlement as the API resolved it. A metered or counted feature carries numbers,
// a boolean feature carries `enabled`, and exactly one of the two is present for a given
// key — which is why the fields are optional here rather than a union of two objects the
// caller would have to narrow before it could read `source`.
const entitlementFeatureSchema = z
  .object({
    period: z.enum(["day", "month", "lifetime"]),
    source: z.string().min(1).max(16),
    /** `null` is unlimited, never zero. */
    limit: z.number().int().nonnegative().nullable().optional(),
    used: z.number().int().nonnegative().optional(),
    reserved: z.number().int().nonnegative().optional(),
    remaining: z.number().int().nonnegative().nullable().optional(),
    /** An absolute instant, so the client renders it in the reader's own timezone. */
    resets_at: z.string().min(1).max(64).optional(),
    period_key: z.string().min(1).max(64).optional(),
    enabled: z.boolean().optional(),
    reason: z.string().max(200).optional(),
  })
  .strict();

export const accountApiEntitlementsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    /**
     * The plan these allowances belong to. During a trial that is the trial's plan, not
     * the tier stored on the profile — the label and the numbers have to come from the
     * same place or the page reads "Included with Free" beside 1,000 AI chats.
     */
    plan: z.string().min(1).max(50),
    /** Sent only when it differs from `plan`: the tier the account drops back to. */
    stored_plan: z.string().min(1).max(50).optional(),
    /** The cache key: it moves on every entitlement change. */
    entitlement_version: z.number().int().nonnegative(),
    chat_model: z.string().min(1).max(64).optional(),
    generated_at: z.string().max(64),
    ttl_seconds: z.number().int().nonnegative(),
    /** Present only while a trial is live. */
    trial_ends_at: z.string().min(1).max(64).optional(),
    features: z.record(z.string().min(1).max(64), entitlementFeatureSchema),
  })
  .strict();

const accountExportDownloadSchema = z
  .object({
    available: z.boolean(),
    private: z.boolean(),
    encrypted: z.boolean(),
    source_locked: z.boolean(),
    // Older API builds described the encrypted artifact as JSON; both are the same file.
    content_type: z.enum(["application/octet-stream", "application/json"]),
    filename: z.string().min(1).max(180),
    expires_at: z.string().max(64),
    ttl_seconds: z.number().int().positive().max(3600),
    byte_count: z.number().int().nonnegative().max(100_000_000),
    sha256: z.string().max(64),
    url: z.string().url().max(2048).nullable(),
  })
  .strict();

const accountExportJobSchema = z
  .object({
    id: z.guid(),
    format: z.literal("json"),
    status: z.enum(["queued", "retry", "ready", "failed", "expired"]),
    requested_at: z.string().max(64),
    generated_at: z.string().max(64),
    expires_at: z.string().max(64),
    attempts: z.number().int().nonnegative().max(100),
    max_attempts: z.number().int().positive().max(10),
    next_attempt_at: z.string().max(64),
    last_error: z.string().max(240),
    byte_count: z.number().int().nonnegative().max(100_000_000),
    sections: z.array(z.string().min(1).max(40)).max(32),
    download: accountExportDownloadSchema,
  })
  .strict();

const accountDeletionRequestSchema = z
  .object({
    id: z.guid(),
    status: z.enum(["pending", "cancelled", "processing", "completed", "failed", "blocked"]),
    requested_at: z.string().max(64),
    scheduled_delete_at: z.string().max(64),
    cancelled_at: z.string().max(64),
    completed_at: z.string().max(64),
    cooling_off_seconds: z
      .number()
      .int()
      .positive()
      .max(31 * 24 * 60 * 60),
    can_cancel: z.boolean(),
    legal_hold: z.boolean(),
    hold_reason: z.string().max(120),
    cleanup: z
      .record(
        z.string().min(1).max(40),
        z.enum(["pending", "source-locked", "retry", "complete", "failed", "skipped"]),
      )
      .refine((value) => Object.keys(value).length <= 16),
    attempts: z.number().int().nonnegative().max(100),
    max_attempts: z.number().int().positive().max(10),
    next_attempt_at: z.string().max(64),
    last_error: z.string().max(240),
    offline_desktop_cache_note: z.literal("not-remotely-deletable"),
  })
  .strict();

export const accountApiAccountLifecycleSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    generated_at: z.string().min(1).max(64),
    export_queue: z
      .object({
        job_limit: z.number().int().positive().max(500),
        returned: z.number().int().nonnegative().max(50),
        per_user_limit: z.number().int().positive().max(50),
      })
      .strict(),
    exports: z.array(accountExportJobSchema).max(50),
    deletion: z
      .object({
        active: accountDeletionRequestSchema.nullable(),
        requests: z.array(accountDeletionRequestSchema).max(10),
      })
      .strict(),
  })
  .strict();

export const accountApiAccountExportRequestSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    export: accountExportJobSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.literal("account.export_requested"),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

export const accountApiAccountExportDownloadSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    export: accountExportJobSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.literal("account.export_download_requested"),
      })
      .strict()
      .nullable(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

export const accountApiAccountDeletionResultSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    deletion: accountDeletionRequestSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.enum(["account.deletion_requested", "account.deletion_cancelled"]),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

const notificationActionSchema = z
  .object({
    label: z.string().max(60),
    url: z.string().max(500),
    kind: z.string().max(24),
    primary: z.boolean(),
  })
  .strict();

const notificationSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().max(140),
    body: z.string().max(4000),
    severity: z.enum(["info", "success", "warning", "critical"]),
    display: z.enum(["popup", "center"]),
    dismissible: z.boolean(),
    active: z.boolean(),
    created_at: z.string().max(64),
    starts_at: z.string().max(64),
    expires_at: z.string().max(64),
    actions: z.array(notificationActionSchema).max(4),
  })
  .strict();

export const accountApiNotificationsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    notifications: z.array(notificationSchema).max(200),
  })
  .strict();

export const accountApiNotificationReceiptSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    receipt: z
      .object({
        notification_id: z.string().min(1).max(64),
        status: z.enum(["seen", "read", "dismissed", "clicked"]),
      })
      .strict(),
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
      })
      .strict(),
    replayed: z.boolean(),
  })
  .strict();

const notificationReceiptStatusSchema = z.enum(["seen", "read", "dismissed", "clicked"]);

const notificationStateEntrySchema = z
  .object({
    notification_id: z.string().min(1).max(64),
    status: notificationReceiptStatusSchema,
    occurred_at: z.string().max(64),
  })
  .strict();

const notificationReceiptHistoryEntrySchema = notificationStateEntrySchema
  .extend({
    id: z.string().max(64),
    created_at: z.string().max(64),
  })
  .strict();

export const accountApiNotificationStateSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    state: z.array(notificationStateEntrySchema).max(200),
    receipts: z.array(notificationReceiptHistoryEntrySchema).max(100),
  })
  .strict();

export type AccountApiMe = z.infer<typeof accountApiMeSchema>;
export type AccountApiProfile = z.infer<typeof accountApiProfileSchema>;
export type AccountApiProfileUpdate = z.infer<typeof accountApiProfileUpdateSchema>;
export type AccountApiSessions = z.infer<typeof accountApiSessionsSchema>;
export type AccountApiActivity = z.infer<typeof accountApiActivitySchema>;
export type AccountApiEntitlements = z.infer<typeof accountApiEntitlementsSchema>;
export type AccountApiEntitlementFeature = z.infer<typeof entitlementFeatureSchema>;
export type AccountApiAccountLifecycle = z.infer<typeof accountApiAccountLifecycleSchema>;
export type AccountApiAccountExportRequest = z.infer<typeof accountApiAccountExportRequestSchema>;
export type AccountApiAccountExportDownload = z.infer<typeof accountApiAccountExportDownloadSchema>;
export type AccountApiAccountDeletionResult = z.infer<typeof accountApiAccountDeletionResultSchema>;
export type AccountApiNotifications = z.infer<typeof accountApiNotificationsSchema>;
export type AccountApiNotificationState = z.infer<typeof accountApiNotificationStateSchema>;
export type AccountApiNotificationReceipt = z.infer<typeof accountApiNotificationReceiptSchema>;
export type AccountApiNotificationReceiptStatus =
  AccountApiNotificationReceipt["receipt"]["status"];

type AccountApiFetchOptions = {
  environment?: Readonly<Partial<Record<string, string>>>;
  fetcher?: Fetcher;
  query?: Readonly<Record<string, string>>;
};

type AccountApiAccountExportBody = {
  expected_revision?: string;
  format: "json";
  confirmation: string;
};

type AccountApiAccountDeletionBody = {
  expected_revision?: string;
  confirmation: string;
};

type AccountApiAccountDeletionCancelBody = AccountApiAccountDeletionBody & {
  request_id: string;
};

/**
 * Mirrors PROFILE_UPDATE_ALLOWED_FIELDS in the Account API's `auth_routes.py`.
 *
 * Every key here is one the server accepts; anything else is refused with the field name, so
 * this type is the first of four gates a new field has to pass and the only one that fails at
 * compile time rather than at runtime.
 */
export type AccountApiProfileUpdateBody = {
  expected_profile_version: number;
  // identity
  first_name?: string;
  last_name?: string;
  phone?: string;
  country?: string;
  // who the holder is
  display_name?: string;
  occupation?: string;
  company?: string;
  bio?: string;
  website?: string;
  // what they follow, in the terminal's own vocabulary
  interests?: string;
  markets?: string;
  primary_workflow?: string;
  experience_level?: string;
  // how the terminal behaves
  timezone?: string;
  default_currency?: string;
  ui_density?: string;
  start_tab?: string;
  time_format?: string;
  show_market_times_in_local?: boolean;
  gain_colour?: string;
  change_display?: string;
  pulse_min_severity?: string;
  pulse_desktop_alerts?: boolean;
  research_ai_drafting?: boolean;
  // what reaches their inbox
  notify_price_alerts?: boolean;
  notify_portfolio_moves?: boolean;
  notify_news_digest?: boolean;
  notify_weekly_summary?: boolean;
  notify_research_complete?: boolean;
  notify_security_alerts?: boolean;
};

type AccountApiJsonRequestOptions = AccountApiFetchOptions & {
  body?: Readonly<Record<string, unknown>>;
  idempotencyKey?: string;
  method?: "GET" | "POST";
};

function isLocalOrigin(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function resolveAccountApiBaseUrl(
  environment: Readonly<Partial<Record<string, string>>> = process.env,
): URL {
  const raw = String(environment.QT_ACCOUNT_API_URL ?? "").trim();
  if (!raw) throw new AccountApiUnavailableError();

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AccountApiUnavailableError();
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (!isLocalOrigin(url) && url.protocol !== "https:") ||
    (isLocalOrigin(url) && !["http:", "https:"].includes(url.protocol))
  ) {
    throw new AccountApiUnavailableError();
  }

  // The API publishes every route under `/api/v1`. Accept the base with or without that
  // suffix so a host-only value (the shape the auth client already tolerates) cannot send
  // this client to the platform's bodyless 404.
  const pathname = url.pathname.replace(/\/+$/u, "");
  url.pathname = pathname.endsWith(ACCOUNT_API_ROUTE_PREFIX)
    ? pathname
    : `${pathname}${ACCOUNT_API_ROUTE_PREFIX}`;
  return url;
}

export function buildAccountApiUrl(baseUrl: URL, route: string): URL {
  const routeName = route.replace(/^\/+/u, "");
  const url = new URL(baseUrl.toString());
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/${routeName}`;
  return url;
}

async function parseJson(response: Response, route: string, method: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    logAccountApiFailure(route, method, {
      outcome: "non_json_response",
      status: response.status,
      correlation_id: response.headers.get("x-correlation-id"),
    });
    throw new AccountApiUnavailableError(response.headers.get("x-correlation-id"));
  }
}

async function fetchAccountApiJson(
  route: string,
  accessToken: string,
  options: AccountApiJsonRequestOptions = {},
): Promise<unknown> {
  const token = accessToken.trim();
  if (!token) throw new AccountApiUnavailableError();

  const baseUrl = resolveAccountApiBaseUrl(options.environment);
  const url = buildAccountApiUrl(baseUrl, route);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(name, value);
  }
  const method = options.method ?? (options.body ? "POST" : "GET");
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  let body: string | undefined;
  if (options.body) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
    if (!options.idempotencyKey) throw new AccountApiUnavailableError();
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  let response: Response;
  try {
    const requestInit: RequestInit = {
      method,
      cache: "no-store",
      headers,
    };
    if (body !== undefined) {
      requestInit.body = body;
    }
    response = await (options.fetcher ?? fetch)(url, requestInit);
  } catch (error) {
    logAccountApiFailure(route, method, {
      outcome: "network_error",
      reason: error instanceof Error ? error.name : "unknown",
    });
    throw new AccountApiUnavailableError();
  }
  const payload = await parseJson(response, route, method);

  if (!response.ok) {
    const parsed = accountApiErrorSchema.safeParse(payload);
    if (!parsed.success) {
      logAccountApiFailure(route, method, {
        outcome: "unrecognized_error_body",
        status: response.status,
        correlation_id: response.headers.get("x-correlation-id"),
      });
      throw new AccountApiUnavailableError(response.headers.get("x-correlation-id"));
    }
    // 401 is the caller's session ending, not a service fault; everything else is
    // worth a breadcrumb because the caller will render it as a generic failure.
    if (response.status !== 401) {
      logAccountApiFailure(route, method, {
        outcome: "api_error",
        status: response.status,
        code: parsed.data.error.code,
        correlation_id: parsed.data.correlation_id ?? null,
      });
    }
    throw new AccountApiRequestError({
      status: response.status,
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      correlationId: parsed.data.correlation_id ?? null,
      details:
        "details" in parsed.data.error &&
        parsed.data.error.details &&
        typeof parsed.data.error.details === "object"
          ? (parsed.data.error.details as Record<string, unknown>)
          : {},
    });
  }

  return payload;
}

export async function postAccountApiJson(
  route: string,
  accessToken: string,
  body: Readonly<Record<string, unknown>>,
  options: AccountApiFetchOptions & { idempotencyKey: string } = { idempotencyKey: "" },
): Promise<unknown> {
  return fetchAccountApiJson(route, accessToken, {
    ...options,
    body,
    method: "POST",
  });
}

export async function fetchAccountApiMe(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiMe> {
  const payload = await fetchAccountApiJson("me", accessToken, options);
  return parseAccountApiPayload(accountApiMeSchema, payload, "me", "GET");
}

const HANDOFF_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;

/** A browser→desktop sign-in request as the console may see it: never the challenge. */
export const accountApiHandoffSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    status: z.enum(["pending", "approved", "denied", "redeemed", "expired"]),
    user_code: z.string().min(1).max(16),
    device_name: z.string().max(120),
    client: z.string().max(16),
    intent: z.enum(["login", "signup"]),
    created_at: z.string().max(64),
    expires_at: z.string().max(64),
    approved_at: z.string().max(64).nullable(),
  })
  .strict();

export type AccountApiHandoff = z.infer<typeof accountApiHandoffSchema>;

function handoffRoute(handoffId: string, suffix = ""): string {
  const id = handoffId.trim();
  if (!HANDOFF_ID_PATTERN.test(id)) throw new AccountApiUnavailableError();
  return `auth/handoff/${encodeURIComponent(id)}${suffix}`;
}

/** The pending request the app opened this page for, for the signed-in visitor to judge. */
export async function fetchAccountApiHandoff(
  accessToken: string,
  handoffId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiHandoff> {
  const route = handoffRoute(handoffId);
  const payload = await fetchAccountApiJson(route, accessToken, options);
  return parseAccountApiPayload(accountApiHandoffSchema, payload, route, "GET");
}

/** Binds the request to the visitor's account; the app's next poll signs it in. */
export async function approveAccountApiHandoff(
  accessToken: string,
  handoffId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiHandoff> {
  const route = handoffRoute(handoffId, "/approve");
  const payload = await postAccountApiJson(route, accessToken, {}, options);
  return parseAccountApiPayload(accountApiHandoffSchema, payload, route, "POST");
}

/** "Not you?": cancels the request so the app stops waiting. */
export async function denyAccountApiHandoff(
  accessToken: string,
  handoffId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiHandoff> {
  const route = handoffRoute(handoffId, "/deny");
  const payload = await postAccountApiJson(route, accessToken, {}, options);
  return parseAccountApiPayload(accountApiHandoffSchema, payload, route, "POST");
}

export async function fetchAccountApiProfile(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiProfile> {
  const payload = await fetchAccountApiJson("auth/user/profile", accessToken, options);
  return parseAccountApiPayload(accountApiProfileSchema, payload, "auth/user/profile", "GET");
}

export async function updateAccountApiProfile(
  accessToken: string,
  body: AccountApiProfileUpdateBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiProfileUpdate> {
  const payload = await postAccountApiJson("auth/user/profile/update", accessToken, body, options);
  return parseAccountApiPayload(
    accountApiProfileUpdateSchema,
    payload,
    "auth/user/profile/update",
    "POST",
  );
}

export async function fetchAccountApiSessions(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiSessions> {
  const payload = await fetchAccountApiJson("sessions", accessToken, options);
  return parseAccountApiPayload(accountApiSessionsSchema, payload, "sessions", "GET");
}

// ------------------------------------------------------------------------- portfolios
//
// A portfolio is the book a trade lands in. Nothing here is a secret, but the shapes are
// `.strict()` for the same reason everything else is: a field the service starts sending is
// a decision somebody should make here before it reaches a page.

export const portfolioSchema = z
  .object({
    id: z.string().max(64),
    name: z.string().max(80),
    base_currency: z.string().max(10),
    benchmark_symbol: z.string().max(20),
    starting_cash: z.number(),
    cash_balance: z.number(),
    is_paper: z.boolean(),
    is_default: z.boolean(),
    created_at: z.string().max(64).nullable(),
    updated_at: z.string().max(64).nullable(),
  })
  .strict();

export type AccountApiPortfolio = z.infer<typeof portfolioSchema>;

export const accountApiPortfoliosSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    portfolios: z.array(portfolioSchema).max(100),
    max_portfolios: z.number().int().positive(),
  })
  .strict();

export type AccountApiPortfolios = z.infer<typeof accountApiPortfoliosSchema>;

export async function fetchAccountApiPortfolios(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiPortfolios> {
  const payload = await fetchAccountApiJson("me/portfolios", accessToken, options);
  return parseAccountApiPayload(accountApiPortfoliosSchema, payload, "me/portfolios", "GET");
}

export async function createAccountApiPortfolio(
  accessToken: string,
  body: Readonly<Record<string, unknown>>,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  return postAccountApiJson("me/portfolios/create", accessToken, body, options);
}

export async function updateAccountApiPortfolio(
  accessToken: string,
  portfolioId: string,
  body: Readonly<Record<string, unknown>>,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  return postAccountApiJson(
    `me/portfolios/${encodeURIComponent(portfolioId)}/update`,
    accessToken,
    body,
    options,
  );
}

export async function deleteAccountApiPortfolio(
  accessToken: string,
  portfolioId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  return postAccountApiJson(
    `me/portfolios/${encodeURIComponent(portfolioId)}/delete`,
    accessToken,
    {},
    options,
  );
}

// ------------------------------------------------------------------ broker connections
//
// The service never returns a credential, so neither does anything here. Each schema is
// `.strict()`, which is the enforcement: a field the API started sending — including one
// named `api_key` — fails the parse instead of reaching a component that might render it.

export const brokerConnectionSchema = z
  .object({
    id: z.string().max(64),
    broker: z.string().max(40),
    name: z.string().max(120),
    account_reference: z.string().max(120),
    paper: z.boolean(),
    is_active: z.boolean(),
    credential_fingerprint: z.string().max(32),
    credential_last_four: z.string().max(8),
    last_test_at: z.string().max(64).nullable(),
    last_test_success: z.boolean(),
    // The connection's own kill switch. `.strict()` means this has to be declared here the
    // moment the service starts sending it, or every broker read fails to parse.
    trading_enabled: z.boolean(),
    last_error: z.string().max(400),
    created_at: z.string().max(64).nullable(),
    updated_at: z.string().max(64).nullable(),
  })
  .strict();

export const accountApiBrokerConnectionsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    connections: z.array(brokerConnectionSchema).max(50),
    implemented_brokers: z.array(z.string().max(40)).max(50),
    encryption_configured: z.boolean(),
  })
  .strict();

export type AccountApiBrokerConnections = z.infer<typeof accountApiBrokerConnectionsSchema>;

export async function fetchAccountApiBrokerConnections(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiBrokerConnections> {
  const payload = await fetchAccountApiJson("me/brokers", accessToken, options);
  return parseAccountApiPayload(accountApiBrokerConnectionsSchema, payload, "me/brokers", "GET");
}

export async function createAccountApiBrokerConnection(
  accessToken: string,
  body: Readonly<Record<string, unknown>>,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  // `me/brokers/create`, not `me/brokers`. The service registers the bare path as GET only,
  // so a POST to it is refused — and the mock used to accept both, which is exactly how this
  // shipped: every create in production answered "method not allowed" while the local check
  // passed. The mock now mirrors the real route table.
  return postAccountApiJson("me/brokers/create", accessToken, body, options);
}

export async function testAccountApiBrokerConnection(
  accessToken: string,
  connectionId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  return postAccountApiJson(
    `me/brokers/${encodeURIComponent(connectionId)}/test`,
    accessToken,
    {},
    options,
  );
}

export async function deleteAccountApiBrokerConnection(
  accessToken: string,
  connectionId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  // Expressed as a POST to an explicit `/delete` rather than an HTTP DELETE because
  // `fetchAccountApiJson` requires an Idempotency-Key on every body-carrying call, and a
  // delete that can be replayed safely is worth more here than method purity.
  return postAccountApiJson(
    `me/brokers/${encodeURIComponent(connectionId)}/delete`,
    accessToken,
    {},
    options,
  );
}

export async function fetchAccountApiActivity(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiActivity> {
  const payload = await fetchAccountApiJson("activity", accessToken, options);
  return parseAccountApiPayload(accountApiActivitySchema, payload, "activity", "GET");
}

export async function fetchAccountApiAccountLifecycle(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAccountLifecycle> {
  const payload = await fetchAccountApiJson("account/lifecycle", accessToken, options);
  return parseAccountApiPayload(
    accountApiAccountLifecycleSchema,
    payload,
    "account/lifecycle",
    "GET",
  );
}

export async function requestAccountApiAccountExport(
  accessToken: string,
  body: AccountApiAccountExportBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAccountExportRequest> {
  const payload = await postAccountApiJson(
    "account/exports/request",
    accessToken,
    {
      format: body.format,
      confirmation: body.confirmation,
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAccountExportRequestSchema,
    payload,
    "account/exports/request",
    "POST",
  );
}

export async function fetchAccountApiAccountExportDownload(
  accessToken: string,
  exportId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAccountExportDownload> {
  const parsedExportId = z.guid().safeParse(exportId.trim().toLowerCase());
  if (!parsedExportId.success) throw new AccountApiUnavailableError();
  const payload = await fetchAccountApiJson(
    `account/exports/${encodeURIComponent(parsedExportId.data)}/download`,
    accessToken,
    options,
  );
  return parseAccountApiPayload(
    accountApiAccountExportDownloadSchema,
    payload,
    `account/exports/${encodeURIComponent(parsedExportId.data)}/download`,
    "GET",
  );
}

export async function requestAccountApiAccountDeletion(
  accessToken: string,
  body: AccountApiAccountDeletionBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAccountDeletionResult> {
  const payload = await postAccountApiJson(
    "account/deletion/request",
    accessToken,
    {
      confirmation: body.confirmation,
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAccountDeletionResultSchema,
    payload,
    "account/deletion/request",
    "POST",
  );
}

export async function cancelAccountApiAccountDeletion(
  accessToken: string,
  body: AccountApiAccountDeletionCancelBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAccountDeletionResult> {
  const parsedRequestId = z.guid().safeParse(body.request_id.trim().toLowerCase());
  if (!parsedRequestId.success) throw new AccountApiUnavailableError();
  const payload = await postAccountApiJson(
    "account/deletion/cancel",
    accessToken,
    {
      request_id: parsedRequestId.data,
      confirmation: body.confirmation,
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAccountDeletionResultSchema,
    payload,
    "account/deletion/cancel",
    "POST",
  );
}

/** What the signed-in caller may do, and how much of it is left. */
export async function fetchAccountApiEntitlements(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiEntitlements> {
  const payload = await fetchAccountApiJson("me/entitlements", accessToken, options);
  return parseAccountApiPayload(accountApiEntitlementsSchema, payload, "me/entitlements", "GET");
}

export async function fetchAccountApiNotifications(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiNotifications> {
  const payload = await fetchAccountApiJson("notifications", accessToken, options);
  return parseAccountApiPayload(accountApiNotificationsSchema, payload, "notifications", "GET");
}

export async function fetchAccountApiNotificationState(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiNotificationState> {
  const payload = await fetchAccountApiJson("notifications/state", accessToken, options);
  return parseAccountApiPayload(
    accountApiNotificationStateSchema,
    payload,
    "notifications/state",
    "GET",
  );
}

export async function recordAccountApiNotificationReceipt(
  accessToken: string,
  notificationId: string,
  status: AccountApiNotificationReceiptStatus,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiNotificationReceipt> {
  const parsedId = z
    .string()
    .min(6)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]{5,63}$/u)
    .safeParse(notificationId.trim().toLowerCase());
  if (!parsedId.success) throw new AccountApiUnavailableError();
  const payload = await postAccountApiJson(
    "notifications/receipts",
    accessToken,
    { notification_id: parsedId.data, status },
    options,
  );
  return parseAccountApiPayload(
    accountApiNotificationReceiptSchema,
    payload,
    "notifications/receipts",
    "POST",
  );
}
