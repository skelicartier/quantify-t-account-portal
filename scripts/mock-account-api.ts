/**
 * Local stand-in for the Account API, for driving the console without any cloud.
 *
 *   npx tsx scripts/mock-account-api.ts            # http://127.0.0.1:7071/api/v1
 *   MOCK_DEGRADE=admin/metrics,notifications ...    # make named routes answer 503
 *
 * Sign in with any password as one of:
 *   owner@example.test · admin@example.test · support@example.test · user@example.test
 *
 * Every payload mirrors the shapes the portal's zod schemas accept (they are the same
 * fixtures the unit tests validate), so a page that renders here renders in production.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_PORT ?? 7071);
const DEGRADED = new Set(
  String(process.env.MOCK_DEGRADE ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

type Persona = "owner" | "admin" | "support" | "user";

const CAPABILITIES: Record<Persona, string[]> = {
  owner: [
    "account:read-self",
    "roles:read-report",
    "account:read-any",
    "audit:read",
    "audit:write",
    "roles:write",
    "users:set-active",
    "sessions:revoke-any",
    "notifications:write",
    "configuration:read",
    "credentials:read-status",
    "releases:read-status",
    "releases:publish",
    "subscription:write",
    "secrets:read",
    "secrets:write",
    "support:read",
    "support:read-all",
    "support:reply",
    "support:manage",
    "staff:write",
  ],
  admin: [
    "account:read-self",
    "roles:read-report",
    "account:read-any",
    "audit:read",
    "audit:write",
    "users:set-active",
    "sessions:revoke-any",
    "notifications:write",
    "subscription:write",
    // Reading the inventory without being able to change it is a real, shipped state, so
    // the mock has a persona in it — otherwise the read-only rendering is never exercised.
    "secrets:read",
    "support:read",
    "support:read-all",
    "support:reply",
    "support:manage",
    "staff:write",
  ],
  // An agent, not a manager: their own queue plus the unassigned pile, and no reading of
  // somebody else's. The narrow case is the one worth having a persona for.
  support: [
    "account:read-self",
    "account:read-any",
    "audit:read",
    "audit:write",
    "support:read",
    "support:reply",
  ],
  user: ["account:read-self"],
};

const PEOPLE = [
  {
    id: "4c7715ea-9ae3-4abd-b2f7-2d2c9a037d9b",
    email: "owner@example.test",
    first: "Aaryan",
    last: "Saroha",
    role: "owner" as Persona,
    tier: "professional",
    active: true,
  },
  {
    id: "8b2d4e61-1c3a-4f5b-8d9e-2a4c6b8d0f11",
    email: "admin@example.test",
    first: "Maya",
    last: "Chen",
    role: "admin" as Persona,
    tier: "professional",
    active: true,
  },
  {
    id: "5c1e7a93-2b4d-4e6f-9a1b-3c5d7e9f0a22",
    email: "support@example.test",
    first: "Jordan",
    last: "Okafor",
    role: "support" as Persona,
    tier: "free",
    active: true,
  },
  {
    id: "9d3f5b71-4c6e-4a8b-9c0d-1e3f5a7b9c33",
    email: "user@example.test",
    first: "Sam",
    last: "Rivera",
    role: "user" as Persona,
    tier: "free",
    active: true,
  },
  {
    id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c55",
    email: "priya@example.test",
    first: "Priya",
    last: "Natarajan",
    role: "user" as Persona,
    tier: "professional",
    active: true,
  },
  {
    id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d66",
    email: "leo@example.test",
    first: "Leo",
    last: "Martins",
    role: "user" as Persona,
    tier: "free",
    active: false,
  },
];

const SESSION_IDS = [
  "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66",
  "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e67",
  "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e68",
];

const roles: Record<string, Persona> = Object.fromEntries(PEOPLE.map((p) => [p.id, p.role]));
const tokens = new Map<string, string>(); // access token → user id

function iso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString().replace(/\.\d{3}Z$/u, "Z");
}

function correlation(): string {
  return `qt-${randomUUID().replace(/-/gu, "")}`;
}

/** Thirty days of deterministic daily aggregates so charts render the same every run. */
function metricSeries() {
  const days = 30;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dates = Array.from({ length: days }, (_, index) => {
    const day = new Date(today.getTime() - (days - 1 - index) * 86_400_000);
    return day.toISOString().slice(0, 10);
  });
  const wave = (index: number, base: number, amp: number) =>
    Math.max(0, Math.round(base + amp * Math.sin(index / 3) + ((index * 7) % 5)));
  return {
    days,
    signups: dates.map((date, index) => ({ date, count: wave(index, 11, 6) })),
    sign_ins: dates.map((date, index) => ({ date, count: wave(index, 110, 40) })),
    auth_events: dates.map((date, index) => ({
      date,
      success: wave(index, 260, 90),
      failure: wave(index, 6, 5),
      blocked: index % 9 === 0 ? 2 : 0,
    })),
  };
}

function roleProjection(userId: string) {
  const effective = roles[userId] ?? "user";
  const owner = effective === "owner";
  return {
    effective,
    database: effective,
    legacy: owner ? "admin" : effective,
    mismatch: owner ? "expected-owner-projection" : "match",
    break_glass: false,
  };
}

function person(userId: string) {
  return PEOPLE.find((p) => p.id === userId) ?? PEOPLE[3]!;
}

function summary(p: (typeof PEOPLE)[number]) {
  return {
    user: {
      user_id: p.id,
      email: p.email,
      first_name: p.first,
      last_name: p.last,
      display_name: `${p.first} ${p.last}`,
      is_active: p.active,
      subscription_tier: p.tier,
      created_at: iso(60 * 24 * 90),
      last_login_at: p.active ? iso(37) : "",
      updated_at: iso(60 * 5),
    },
    role: roleProjection(p.id),
  };
}

function session(
  userId: string,
  index: number,
  options: { revoked?: boolean; expired?: boolean } = {},
) {
  return {
    id: SESSION_IDS[index] ?? randomUUID(),
    user_id: userId,
    source: index === 0 ? "portal" : "desktop",
    provider: "azure",
    client_instance_id: null,
    device_name:
      index === 0 ? "Safari on macOS" : index === 1 ? "MacBook Pro" : "Windows workstation",
    created_at: iso(60 * 24 * (index + 1)),
    last_seen_at: iso(index === 0 ? 2 : 60 * (index * 6 + 3)),
    expires_at: options.expired
      ? iso(60)
      : new Date(Date.now() + 86_400_000 * 20).toISOString().replace(/\.\d{3}Z$/u, "Z"),
    revoked_at: options.revoked ? iso(60 * 9) : null,
    revoke_reason: options.revoked ? "signed-out" : null,
  };
}

function activity(userId: string) {
  const types = [
    ["session.registered", "success"],
    ["session.heartbeat", "success"],
    ["login.success", "success"],
    ["login.failure", "failure"],
    ["mfa.challenge", "blocked"],
    ["password.changed", "success"],
    ["session.ended", "success"],
    ["session.revoked", "success"],
    // The account's own view of a plan change; /account/subscription reads its history
    // out of this trail.
    ["account.subscription_changed", "success"],
    ["account.entitlement_changed", "success"],
  ] as const;
  return types.map(([event_type, outcome], index) => ({
    id: randomUUID(),
    user_id: userId,
    session_id: SESSION_IDS[index % 3] ?? null,
    event_type,
    outcome,
    source: index % 2 === 0 ? "portal" : "account-api",
    occurred_at: iso(index * 95 + 4),
    created_at: iso(index * 95 + 4),
  }));
}

function profile(userId: string) {
  const p = person(userId);
  return {
    user_id: p.id,
    first_name: p.first,
    last_name: p.last,
    email: p.email,
    phone: "+1 415 555 0100",
    country: "United States",
    is_admin: p.role !== "user",
    is_active: p.active,
    timezone: "America/New_York",
    default_currency: "USD",
    subscription_tier: p.tier,
    two_factor_enabled: false,
    notify_price_alerts: true,
    notify_portfolio_moves: false,
    notify_news_digest: true,
    data_refresh_rate: "realtime",
    theme_preference: "dark",
    profile_version: 4,
    created_at: iso(60 * 24 * 90),
    last_login_at: iso(37),
    updated_at: iso(60 * 5),
  };
}

const notice = (
  id: string,
  title: string,
  body: string,
  severity: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  title,
  body,
  severity,
  display: "center",
  dismissible: true,
  active: true,
  created_at: iso(60 * 24 * 2),
  starts_at: iso(60 * 24),
  expires_at: new Date(Date.now() + 86_400_000 * 14).toISOString().replace(/\.\d{3}Z$/u, "Z"),
  actions: [
    {
      label: "Release notes",
      url: "https://www.quantifyterminal.com/blog",
      kind: "link",
      primary: true,
    },
  ],
  ...extra,
});

const NOTIFICATIONS = [
  notice(
    "notice-release-2026-09",
    "Terminal 2.4 is available",
    "Options analytics, faster screeners and a refreshed portfolio workspace. Update from the desktop app when convenient.",
    "info",
  ),
  notice(
    "notice-maintenance-window",
    "Scheduled maintenance on Saturday",
    "Market data will pause for roughly 20 minutes at 02:00 UTC while we upgrade the pricing cluster.",
    "warning",
  ),
  notice(
    "notice-security-reminder",
    "Turn on two-factor authentication",
    "Accounts with an authenticator app are protected even if a password leaks. It takes two minutes in Security.",
    "success",
    { actions: [] },
  ),
];

const ROLE_REPORT = () => ({
  legacy_source_available: true,
  legacy_retirement_ready: false,
  legacy_blob_entry_count: 4,
  legacy_unparsable_entry_count: 0,
  legacy_entry_count: 5,
  legacy_bootstrap_count: 1,
  counts_by_mismatch: { match: 4, "expected-owner-projection": 1, "missing-in-database": 1 },
  counts_by_role: { owner: 1, admin: 1, support: 1, user: 3 },
  total_users: 6,
  break_glass_disclosed: true,
  entries: [
    {
      user_id: PEOPLE[0]!.id,
      effective_role: "owner",
      database_role: "owner",
      legacy_role: "admin",
      mismatch: "expected-owner-projection",
      break_glass: false,
    },
    {
      user_id: PEOPLE[5]!.id,
      effective_role: "user",
      database_role: null,
      legacy_role: "user",
      mismatch: "missing-in-database",
      break_glass: false,
    },
  ],
});

// ---- subscriptions ---------------------------------------------------------------
// The same catalogue the Account API publishes, in the shape its DTO emits, so a page
// that renders against this mock renders against production.
type PlanKey = "free" | "pro" | "desk" | "teams";

const PLAN_LIMITS: Record<PlanKey, Record<string, number | boolean | null>> = {
  free: {
    ai_chat: 20,
    deep_research: 1,
    pulse_universe: 25,
    tracked_symbols: 50,
    watchlists: 2,
    portfolios: 1,
    saved_screens: 2,
    history_years: 5,
    point_in_time: false,
    export: false,
  },
  pro: {
    ai_chat: 300,
    deep_research: 10,
    pulse_universe: 250,
    tracked_symbols: 500,
    watchlists: 25,
    portfolios: 10,
    saved_screens: 50,
    history_years: 15,
    point_in_time: true,
    export: true,
  },
  desk: {
    ai_chat: 1000,
    deep_research: 40,
    pulse_universe: 2000,
    tracked_symbols: 5000,
    watchlists: null,
    portfolios: 100,
    saved_screens: null,
    history_years: null,
    point_in_time: true,
    export: true,
  },
  teams: {
    ai_chat: 1000,
    deep_research: 40,
    pulse_universe: 2000,
    tracked_symbols: 5000,
    watchlists: null,
    portfolios: null,
    saved_screens: null,
    history_years: null,
    point_in_time: true,
    export: true,
  },
};

const FEATURE_PERIODS: Record<string, "month" | "lifetime"> = {
  ai_chat: "month",
  deep_research: "month",
  pulse_universe: "lifetime",
  tracked_symbols: "lifetime",
  watchlists: "lifetime",
  portfolios: "lifetime",
  saved_screens: "lifetime",
  history_years: "lifetime",
  point_in_time: "lifetime",
  export: "lifetime",
};

const BOOLEAN_FEATURES = new Set(["point_in_time", "export"]);
const QUOTA_FEATURES = ["ai_chat", "deep_research"] as const;
const CHAT_MODELS: Record<PlanKey, string> = {
  free: "gemini-flash",
  pro: "claude-haiku",
  desk: "claude-sonnet",
  teams: "claude-sonnet",
};

function canonicalPlan(tier: string): PlanKey {
  const value = String(tier ?? "")
    .trim()
    .toLowerCase();
  if (value === "free" || value === "pro" || value === "desk" || value === "teams") return value;
  const legacy: Record<string, PlanKey> = {
    professional: "desk",
    premium: "desk",
    starter: "pro",
    plus: "pro",
  };
  return legacy[value] ?? "free";
}

type OverrideRow = {
  feature_key: string;
  source: string;
  source_ref: string;
  limit_value: number | null;
  bool_value: boolean | null;
  effective_from: string;
  effective_to: string;
  granted_by: string;
  reason: string;
};

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/u, "Z");
}

/** Seeded so the console shows an override beside a plan default without a write first. */
const entitlementOverrides = new Map<string, OverrideRow[]>([
  [
    PEOPLE[0]!.id,
    [
      {
        feature_key: "ai_chat",
        source: "override",
        source_ref: "",
        limit_value: 5000,
        bool_value: null,
        effective_from: iso(60 * 24 * 30),
        effective_to: inDays(335),
        granted_by: PEOPLE[0]!.id,
        reason: "Founder account, internal testing",
      },
    ],
  ],
  [
    PEOPLE[4]!.id,
    [
      {
        feature_key: "deep_research",
        source: "override",
        source_ref: "",
        limit_value: 100,
        bool_value: null,
        effective_from: iso(60 * 24 * 7),
        effective_to: inDays(53),
        granted_by: PEOPLE[0]!.id,
        reason: "Northgate pilot, agreed 60 days",
      },
    ],
  ],
]);

/** Deterministic spend, chosen so the allowance watch has something to show. */
const USAGE: Record<string, Record<string, { used: number; reserved: number }>> = {
  [PEOPLE[0]!.id]: { ai_chat: { used: 412, reserved: 2 }, deep_research: { used: 6, reserved: 0 } },
  [PEOPLE[1]!.id]: {
    ai_chat: { used: 940, reserved: 0 },
    deep_research: { used: 38, reserved: 1 },
  },
  [PEOPLE[2]!.id]: { ai_chat: { used: 3, reserved: 0 }, deep_research: { used: 0, reserved: 0 } },
  [PEOPLE[3]!.id]: { ai_chat: { used: 19, reserved: 0 }, deep_research: { used: 1, reserved: 0 } },
  [PEOPLE[4]!.id]: { ai_chat: { used: 61, reserved: 0 }, deep_research: { used: 44, reserved: 2 } },
  [PEOPLE[5]!.id]: { ai_chat: { used: 22, reserved: 0 }, deep_research: { used: 1, reserved: 0 } },
};

const subscriptionVersions = new Map<string, number>();

/** Open trial windows, keyed by account. A trial is a window on a plan, not a plan. */
const trialEnds = new Map<string, string>();

const TRIAL_PLAN: PlanKey = "desk";
/** The trial's own Deep Research cap, applied before overrides so it can still be raised. */
const TRIAL_DEEP_RESEARCH_CAP = 8;

function entitlementVersion(userId: string): number {
  return subscriptionVersions.get(userId) ?? 1;
}

function liveTrialEnd(userId: string): string | null {
  const value = trialEnds.get(userId);
  if (!value) return null;
  return Date.parse(value) > Date.now() ? value : null;
}

/** The plan whose allowances actually apply, which during a trial is the trial's. */
function effectivePlan(userId: string, tier: string): PlanKey {
  return liveTrialEnd(userId) ? TRIAL_PLAN : canonicalPlan(tier);
}

function periodKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function periodResetsAt(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0),
  ).toISOString();
  return next.replace(/\.\d{3}Z$/u, "Z");
}

function usageCounters(userId: string) {
  const spend = USAGE[userId] ?? {};
  return QUOTA_FEATURES.filter((feature) => spend[feature]).map((feature) => ({
    feature_key: feature,
    period_key: periodKey(),
    used: spend[feature]!.used,
    reserved: spend[feature]!.reserved,
    updated_at: iso(45),
  }));
}

/** Plan defaults overlaid with the account's overrides: the more generous wins. */
/**
 * One entitlement document, used by both `me/entitlements` and the admin read.
 *
 * `plan` is the plan the numbers belong to — the trial's while one is open — and
 * `stored_plan` appears only when that differs from the tier on the profile, which is the
 * one case a reader needs both: what the account has now, and what it drops back to.
 */
function entitlementDocument(userId: string, tier: string) {
  const plan = effectivePlan(userId, tier);
  const stored = canonicalPlan(tier);
  const trial = liveTrialEnd(userId);
  return {
    plan,
    ...(stored === plan ? {} : { stored_plan: stored }),
    entitlement_version: entitlementVersion(userId),
    chat_model: CHAT_MODELS[plan],
    generated_at: iso(0),
    ttl_seconds: 300,
    ...(trial ? { trial_ends_at: trial } : {}),
    features: resolvedEntitlements(userId, plan),
  };
}

function resolvedEntitlements(userId: string, plan: PlanKey) {
  const onTrial = liveTrialEnd(userId) !== null;
  const limits = PLAN_LIMITS[plan];
  const overrides = entitlementOverrides.get(userId) ?? [];
  const spend = USAGE[userId] ?? {};
  const features: Record<string, Record<string, unknown>> = {};
  for (const [feature, period] of Object.entries(FEATURE_PERIODS)) {
    const applied = overrides.find(
      (row) => row.feature_key === feature && Date.parse(row.effective_to) > Date.now(),
    );
    if (BOOLEAN_FEATURES.has(feature)) {
      const enabled = applied?.bool_value === true || limits[feature] === true;
      features[feature] = {
        period,
        source: applied && applied.bool_value === true ? "override" : "plan",
        enabled,
        ...(applied?.reason ? { reason: applied.reason } : {}),
      };
      continue;
    }
    const planLimit = limits[feature];
    let limit = typeof planLimit === "number" ? planLimit : null;
    let source = "plan";
    let trialCapped = false;
    if (onTrial && feature === "deep_research") {
      limit = TRIAL_DEEP_RESEARCH_CAP;
      trialCapped = true;
    }
    if (
      applied &&
      (applied.limit_value === null || (limit !== null && applied.limit_value > limit))
    ) {
      limit = applied.limit_value;
      source = "override";
    }
    const counters = spend[feature] ?? { used: 0, reserved: 0 };
    const used = period === "month" ? counters.used : 0;
    const reserved = period === "month" ? counters.reserved : 0;
    features[feature] = {
      period,
      source,
      limit,
      used,
      reserved,
      remaining: limit === null ? null : Math.max(0, limit - used - reserved),
      ...(period === "month" ? { resets_at: periodResetsAt(), period_key: periodKey() } : {}),
      ...(applied && source === "override" && applied.reason
        ? { reason: applied.reason }
        : trialCapped && source === "plan"
          ? { reason: "trial" }
          : {}),
    };
  }
  return features;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    request.on("data", (chunk) => (data += chunk));
    request.on("end", () => resolve(data));
  });
}

function send(response: ServerResponse, status: number, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "x-correlation-id": String(payload.correlation_id ?? ""),
  });
  response.end(body);
}

function fail(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  send(response, status, {
    ok: false,
    correlation_id: correlation(),
    error: { code, message, details },
  });
}

function ok(response: ServerResponse, payload: Record<string, unknown>, status = 200) {
  send(response, status, { ok: true, correlation_id: correlation(), ...payload });
}

// ---- managed credentials ---------------------------------------------------------
//
// A mirror of the service's catalogue, with fabricated fingerprints only. No value is
// stored, sent, or derivable from anything here — which is the same property the real
// inventory has, so a page that renders against this renders against production.
//
//   MOCK_SECRET_STORE=unreadable  # exercise the "cannot read what is stored" state

type MockSecretEntry = {
  fingerprint: string;
  prefix: string;
  length: number;
  position: number;
  set_by: string;
  set_at: string;
  verification: { state: string; checked_at: string | null };
};

type MockSecretSlot = {
  slot: string;
  namespace: "api" | "geo";
  label: string;
  kind: "single" | "multi" | "identifier";
  group: string | null;
  hint: string;
  blast_radius: string;
  prefixes: string[];
};

function slotEntry(
  slot: string,
  namespace: "api" | "geo",
  label: string,
  kind: "single" | "multi" | "identifier",
  blast: string,
  extra: Partial<MockSecretSlot> = {},
): MockSecretSlot {
  return {
    slot,
    namespace,
    label,
    kind,
    group: null,
    hint: "",
    blast_radius: blast,
    prefixes: [],
    ...extra,
  };
}

const SECRET_CATALOGUE: MockSecretSlot[] = [
  slotEntry("OPENROUTER_API_KEY", "api", "OpenRouter", "multi", "AI chat and Deep Research.", {
    hint: "Holds several keys; the app rotates across them.",
    prefixes: ["sk-or-v1-", "sk-or-"],
  }),
  slotEntry("GEMINI_API_KEY", "api", "Google Gemini", "multi", "The Free plan's chat model.", {
    prefixes: ["AIza"],
  }),
  slotEntry("OPENAI_API_KEY", "api", "OpenAI", "multi", "An alternate chat provider.", {
    prefixes: ["sk-proj-", "sk-"],
  }),
  slotEntry("NVIDIA_API_KEY", "api", "NVIDIA NIM", "multi", "An alternate chat provider.", {
    prefixes: ["nvapi-"],
  }),
  slotEntry("POLYGON_API_KEY", "api", "Polygon", "single", "Intraday quotes and aggregates."),
  slotEntry("ALPHA_VANTAGE_API_KEY", "api", "Alpha Vantage", "single", "Fallback quotes.", {
    hint: "Free tier is 25 requests a day in total.",
  }),
  slotEntry("FMP_API_KEY", "api", "Financial Modeling Prep", "single", "Dividends and filings."),
  slotEntry("COINGECKO_API_KEY", "api", "CoinGecko", "single", "Crypto prices and market data."),
  slotEntry("NEWSDATA_API_KEY", "api", "NewsData", "single", "One of three news sources."),
  slotEntry("NEWSAPI_API_KEY", "api", "NewsAPI", "single", "One of three news sources.", {
    hint: "Free tier is 100 requests a day.",
  }),
  slotEntry("GNEWS_API_KEY", "api", "GNews", "single", "One of three news sources."),
  slotEntry("opensky_client_id", "geo", "OpenSky client ID", "identifier", "Aircraft tracking.", {
    group: "opensky_1",
    hint: "A registration value, not a secret.",
  }),
  slotEntry(
    "opensky_client_secret",
    "geo",
    "OpenSky client secret",
    "single",
    "Aircraft tracking.",
    {
      group: "opensky_1",
    },
  ),
  slotEntry(
    "opensky_client_id_2",
    "geo",
    "OpenSky client ID (second)",
    "identifier",
    "A second OpenSky client, for more quota.",
    { group: "opensky_2", hint: "A registration value, not a secret." },
  ),
  slotEntry(
    "opensky_client_secret_2",
    "geo",
    "OpenSky client secret (second)",
    "single",
    "A second OpenSky client, for more quota.",
    { group: "opensky_2" },
  ),
  slotEntry("adsbexchange_api_key", "geo", "ADS-B Exchange", "single", "Alternate aircraft data."),
  slotEntry("ucdp_token", "geo", "UCDP", "single", "Verified conflict events on the map."),
  slotEntry("reliefweb_appname", "geo", "ReliefWeb appname", "identifier", "Situation reports.", {
    hint: "A registration string, not a secret. Often an email address.",
  }),
  slotEntry("firms_map_key", "geo", "NASA FIRMS", "single", "Wildfire and thermal hotspots."),
  slotEntry("aisstream_key", "geo", "AISStream", "single", "Live ship tracking."),
];

/** Stable, fabricated, and derived from nothing that was ever a credential. */
function fabricatedFingerprint(slot: string, salt: number): string {
  return createHash("sha256").update(`mock|${slot}|${salt}`).digest("hex").slice(0, 16);
}

const OWNER_ID = "4c7715ea-9ae3-4abd-b2f7-2d2c9a037d9b";

function seededEntry(
  slot: string,
  index: number,
  length: number,
  prefix: string,
  state: string,
  minutesAgo: number,
): MockSecretEntry {
  return {
    fingerprint: fabricatedFingerprint(slot, index),
    prefix,
    length,
    position: index,
    set_by: OWNER_ID,
    set_at: iso(60 * 24 * (index + 3)),
    verification: {
      state,
      checked_at: state === "unverified" || state === "unsupported" ? null : iso(minutesAgo),
    },
  };
}

const secretStore = new Map<string, MockSecretEntry[]>([
  // A rotation pool, one member of which the provider has stopped accepting: the case the
  // page exists for, and the one a single-row-per-slot design would hide.
  [
    "OPENROUTER_API_KEY",
    [
      seededEntry("OPENROUTER_API_KEY", 0, 73, "sk-or-v1-", "valid", 42),
      seededEntry("OPENROUTER_API_KEY", 1, 73, "sk-or-v1-", "no-quota", 44),
      seededEntry("OPENROUTER_API_KEY", 2, 64, "sk-or-", "valid", 46),
    ],
  ],
  ["GEMINI_API_KEY", [seededEntry("GEMINI_API_KEY", 0, 39, "AIza", "valid", 180)]],
  ["FMP_API_KEY", [seededEntry("FMP_API_KEY", 0, 20, "", "rejected", 15)]],
  ["POLYGON_API_KEY", [seededEntry("POLYGON_API_KEY", 0, 32, "", "valid", 300)]],
  ["ALPHA_VANTAGE_API_KEY", [seededEntry("ALPHA_VANTAGE_API_KEY", 0, 16, "", "unsupported", 0)]],
  ["opensky_client_id", [seededEntry("opensky_client_id", 0, 27, "", "unsupported", 0)]],
  ["opensky_client_secret", [seededEntry("opensky_client_secret", 0, 32, "", "unverified", 0)]],
  ["reliefweb_appname", [seededEntry("reliefweb_appname", 0, 24, "", "unsupported", 0)]],
]);

const secretHistory = new Map<string, MockSecretEntry[]>();

/**
 * The receipt a credential write answers with — the same envelope the real service uses.
 *
 * Built in one place so the mock cannot drift from the contract the console parses. A mock
 * that answers a shape the service never sends makes every screenshot and preflight run
 * green against a page that would fail on the first real write.
 */
function secretWriteReceipt(slot: MockSecretSlot, action: "set" | "append" | "revoke" | "restore") {
  return {
    slot: secretSlotView(slot),
    action,
    metadata_lagging: false,
    event: { id: randomUUID(), event_type: "admin.secret_changed" },
    replayed: false,
  };
}

function secretSlotView(slot: MockSecretSlot) {
  const entries = secretStore.get(slot.slot) ?? [];
  return {
    slot: slot.slot,
    namespace: slot.namespace,
    label: slot.label,
    kind: slot.kind,
    group: slot.group,
    hint: slot.hint,
    blast_radius: slot.blast_radius,
    is_secret: slot.kind !== "identifier",
    configured: entries.length > 0,
    distribution: "every-device",
    // The switch that would make a slot server-only lives on another service, so the
    // honest answer is the worst case plus "this is not observable from here".
    distribution_certain: false,
    entries: entries.map((entry, index) => ({ ...entry, position: index })),
  };
}

function secretsDocument() {
  const unreadable = process.env.MOCK_SECRET_STORE === "unreadable";
  return {
    generated_at: iso(0),
    store: unreadable
      ? { state: "unreadable", dependency: "app-config-store" }
      : { state: "ready", dependency: null },
    slots: SECRET_CATALOGUE.map((slot) =>
      unreadable
        ? { ...secretSlotView(slot), configured: false, entries: [] }
        : secretSlotView(slot),
    ),
  };
}

function authUser(userId: string) {
  const p = person(userId);
  return {
    id: p.id,
    email: p.email,
    first_name: p.first,
    last_name: p.last,
    is_active: p.active,
    email_confirmed: true,
    role: p.role,
    profile: null,
  };
}

/** Desktop sign-in requests, keyed by the handoff id itself (the real API stores a hash). */
type MockHandoff = {
  challenge: string;
  status: "pending" | "approved" | "denied" | "redeemed";
  userId: string | null;
  userCode: string;
  deviceName: string;
  intent: "login" | "signup";
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
};
const handoffs = new Map<string, MockHandoff>();

function handoffDto(entry: MockHandoff) {
  return {
    status: entry.status,
    user_code: entry.userCode,
    device_name: entry.deviceName,
    client: "desktop",
    intent: entry.intent,
    created_at: entry.createdAt,
    expires_at: entry.expiresAt,
    approved_at: entry.approvedAt,
  };
}

function bearer(request: IncomingMessage): string | null {
  const header = String(request.headers.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const userId = tokens.get(token);
  return userId ?? null;
}

// ---- release deploy function -----------------------------------------------------
//
// A second service, served from the same process on purpose. The console reaches the
// release function at `QT_UPDATE_DEPLOY_URL`, whose routes live under `/api` rather than
// `/api/v1`, so pointing that variable at this mock's origin exercises the real client
// against the real shapes without a second port to start and wait on.
//
// Its envelope is the deploy function's own — `{ok, error: "text"}` — not the Account
// API's `{error: {code, message}}`. Using `fail()` here would make the console's release
// error handling pass against a shape production never sends.

type MockRelease = Record<string, unknown>;

const releaseCatalogue: MockRelease[] = [
  {
    name: "Quantify Terminal",
    title: "Faster charts",
    version: "1.4.0",
    description: "Chart rendering is roughly twice as fast on large books.",
    features: ["Faster charts", "New geopolitics layers"],
    severity: "recommended",
    channel: "stable",
    download_page_url: "https://www.quantifyterminal.com/download",
    windows_url: "https://releases.example.test/quantify-terminal-1.4.0.exe",
    mac_url: "https://releases.example.test/quantify-terminal-1.4.0.dmg",
    linux_appimage_url: "",
    linux_deb_url: "",
    linux_rpm_url: "",
    checksums: { windows: "a".repeat(64), mac: "b".repeat(64) },
    force_update: false,
    min_supported_version: "",
    disabled: false,
    created_at: "2026-09-10T09:00:00Z",
    signature: "ff".repeat(32),
  },
  {
    name: "Quantify Terminal",
    title: "Pulse severity tuning",
    version: "1.3.0",
    description: "Pulse suppression no longer hides a second move on the same symbol.",
    features: ["Pulse suppression fix"],
    severity: "low",
    channel: "stable",
    download_page_url: "https://www.quantifyterminal.com/download",
    windows_url: "https://releases.example.test/quantify-terminal-1.3.0.exe",
    mac_url: "",
    linux_appimage_url: "",
    linux_deb_url: "",
    linux_rpm_url: "",
    checksums: { windows: "c".repeat(64) },
    force_update: false,
    min_supported_version: "",
    disabled: false,
    created_at: "2026-08-22T09:00:00Z",
    signature: "ee".repeat(32),
  },
];
let releaseCurrentVersion = "1.4.0";

function releaseFail(response: ServerResponse, status: number, error: string) {
  send(response, status, { ok: false, error });
}

/**
 * The service's authentication limits, in the shape the console has to handle.
 *
 * A mock that never refuses is how the console's rate-limit path stays untested: every flow
 * signs in cleanly, nothing ever returns 429, and the branch that tells somebody how long to
 * wait is exercised by unit tests alone. The last time this mock was more permissive than the
 * service it certified a real bug — a broker create posting to a GET-only route — so it
 * mirrors the policy rather than approximating it.
 *
 * Deliberately simplified in one way only: there is no exponential backoff here, because the
 * console's behaviour does not depend on the second lock being longer than the first. The
 * numbers that ARE mirrored are the ones a client can observe: the threshold, the 429, the
 * code, and `retry_after_seconds`.
 */
const LOGIN_ATTEMPT_BUDGET = 5;
const LOGIN_LOCK_SECONDS = 60;
const loginAttempts = new Map<string, { count: number; lockedUntilMs: number }>();

function loginBucket(key: string): { count: number; lockedUntilMs: number } {
  const existing = loginAttempts.get(key);
  if (existing) return existing;
  const fresh = { count: 0, lockedUntilMs: 0 };
  loginAttempts.set(key, fresh);
  return fresh;
}

/** Seconds still to wait, or 0 when this caller may try. */
function loginWaitSeconds(key: string, nowMs: number): number {
  const bucket = loginBucket(key);
  if (bucket.lockedUntilMs > nowMs) return Math.ceil((bucket.lockedUntilMs - nowMs) / 1000);
  // The lock has been served: a fresh chance, not a counter still over the threshold. Without
  // this the first lock silently lasts forever, which is the exact defect the service's own
  // MERGE had to be fixed for.
  if (bucket.lockedUntilMs > 0) {
    bucket.count = 0;
    bucket.lockedUntilMs = 0;
  }
  return 0;
}

function recordLoginFailure(key: string, nowMs: number): void {
  const bucket = loginBucket(key);
  bucket.count += 1;
  if (bucket.count >= LOGIN_ATTEMPT_BUDGET)
    bucket.lockedUntilMs = nowMs + LOGIN_LOCK_SECONDS * 1000;
}

function handleReleaseRoute(
  route: string,
  method: string,
  json: Record<string, unknown>,
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  if (route !== "deploy_update" && route !== "release_history") return false;

  const userId = bearer(request);
  if (!userId) {
    releaseFail(response, 401, "Invalid or expired session.");
    return true;
  }
  const caller = person(userId);
  if (caller.role !== "owner" && caller.role !== "admin") {
    releaseFail(response, 403, "Administrator access required.");
    return true;
  }

  if (route === "release_history") {
    send(response, 200, {
      ok: true,
      signing_configured: process.env.MOCK_RELEASE_SIGNING !== "unconfigured",
      current_version: releaseCurrentVersion,
      releases: releaseCatalogue.map((entry) => {
        const { signature, ...rest } = entry;
        return { ...rest, signed: Boolean(signature) };
      }),
    });
    return true;
  }

  if (method !== "POST") {
    releaseFail(response, 405, "Method not allowed.");
    return true;
  }
  // Owner-only, mirroring PUBLISH_RELEASE. An Admin can read the catalogue and not change it.
  if (caller.role !== "owner") {
    releaseFail(response, 403, "Publishing a release requires an Owner account.");
    return true;
  }
  if (process.env.MOCK_RELEASE_SIGNING === "unconfigured") {
    releaseFail(response, 503, "Release signing is not configured on this deployment.");
    return true;
  }
  const version = String(json.version ?? "").trim();
  if (!version) {
    releaseFail(response, 400, "version is required.");
    return true;
  }
  const manifest: MockRelease = { ...json, version, signature: "ff".repeat(32) };
  const index = releaseCatalogue.findIndex((entry) => entry.version === version);
  if (index >= 0) releaseCatalogue.splice(index, 1);
  releaseCatalogue.unshift(manifest);
  const serving = json.disabled !== true || releaseCurrentVersion === version;
  if (serving) releaseCurrentVersion = version;
  send(response, 200, { ok: true, version, serving });
  return true;
}

/**
 * Broker connections, per user.
 *
 * Never holds a credential value — only a fabricated digest and the last four characters,
 * which is the same property the real store has. The shape is written out rather than left
 * as a loose record so that a field added here without being added to the console's
 * `.strict()` schema fails the type check before it fails a page render.
 */
type MockBrokerConnection = {
  id: string;
  user_id: string;
  broker: string;
  name: string;
  account_reference: string;
  paper: boolean;
  is_active: boolean;
  credential_fingerprint: string;
  credential_last_four: string;
  last_test_at: string | null;
  last_test_success: boolean;
  trading_enabled: boolean;
  last_error: string;
  created_at: string;
  updated_at: string;
};

const brokerConnections: MockBrokerConnection[] = [];

/** The only shape of a connection the mock returns — an allowlist, like `public_view`. */
function publicBrokerView(row: MockBrokerConnection) {
  const { user_id: _owner, ...view } = row;
  void _owner;
  return view;
}

/**
 * A portfolio, written out for the same reason: a field added here and not to the console's
 * `.strict()` schema fails the type check rather than a page render.
 */
type MockPortfolio = {
  id: string;
  user_id: string;
  name: string;
  base_currency: string;
  benchmark_symbol: string;
  starting_cash: number;
  cash_balance: number;
  is_paper: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

const portfolios: MockPortfolio[] = [
  {
    id: "3f1b6c20-8d4a-4e59-91b7-0c2a5e8d4f10",
    user_id: OWNER_ID,
    name: "Main",
    base_currency: "USD",
    benchmark_symbol: "SPY",
    starting_cash: 250000,
    cash_balance: 182430.5,
    is_paper: false,
    is_default: true,
    created_at: iso(60 * 24 * 240),
    updated_at: iso(60 * 24 * 3),
  },
  {
    id: "9c7e2a11-5b3d-4f88-a0c6-1d4f7b2e9a35",
    user_id: OWNER_ID,
    name: "Momentum sandbox",
    base_currency: "USD",
    benchmark_symbol: "QQQ",
    starting_cash: 100000,
    cash_balance: 100000,
    is_paper: true,
    is_default: false,
    created_at: iso(60 * 24 * 30),
    updated_at: iso(60 * 24 * 30),
  },
];

/**
 * What each book holds, which is what makes a close refusable. Keyed separately because the
 * service counts these with their own query rather than storing a total on the portfolio.
 */
const portfolioContents: Record<string, { holdings: number; transactions: number }> = {
  "3f1b6c20-8d4a-4e59-91b7-0c2a5e8d4f10": { holdings: 7, transactions: 214 },
};

function publicPortfolioView(row: MockPortfolio) {
  const { user_id: _owner, ...view } = row;
  void _owner;
  return view;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  const route = url.pathname.replace(/^\/api\/v1\/?/u, "").replace(/\/+$/u, "");
  const method = request.method ?? "GET";
  const body = method === "POST" ? await readBody(request) : "";
  const json = body ? (JSON.parse(body) as Record<string, unknown>) : {};

  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/v1/")) {
    const releaseRoute = url.pathname.replace(/^\/api\/?/u, "").replace(/\/+$/u, "");
    if (handleReleaseRoute(releaseRoute, method, json, request, response)) return;
  }

  if (DEGRADED.has(route)) {
    fail(response, 503, "upstream_unavailable", "A dependency is unavailable. Please retry.");
    return;
  }

  // ---- auth ---------------------------------------------------------------------
  if (route === "health") return ok(response, { status: "ok", environment: "mock" });
  if (route === "auth/login") {
    const email = String(json.email ?? "");
    const bucketKey = email.trim().toLowerCase();
    const nowMs = Date.now();
    const wait = loginWaitSeconds(bucketKey, nowMs);
    // Checked before the credential is looked at, as the service does — password hashing is
    // expensive and a locked-out caller must not be able to spend it.
    if (wait > 0) {
      return fail(response, 429, "rate_limited", "Too many attempts. Wait before trying again.", {
        retry_after_seconds: wait,
      });
    }
    const p = PEOPLE.find((candidate) => candidate.email === email.toLowerCase());
    if (!p) {
      recordLoginFailure(bucketKey, nowMs);
      return fail(
        response,
        401,
        "invalid_credentials",
        "Unable to sign in with those credentials.",
      );
    }
    // Proved: somebody who mistyped four times and then got it right is not one slip from a
    // lockout for the rest of the window.
    loginAttempts.delete(bucketKey);
    const token = `mock-${p.role}-${randomUUID()}`;
    tokens.set(token, p.id);
    return ok(response, {
      user: authUser(p.id),
      session: { access_token: token, refresh_token: `refresh-${token}`, expires_in: 3600 },
    });
  }
  if (route === "auth/refresh") {
    const refresh = String(json.refresh_token ?? "");
    const token = refresh.replace(/^refresh-/u, "");
    const userId = tokens.get(token);
    if (!userId)
      return fail(response, 401, "session_invalid", "That session is invalid or expired.");
    return ok(response, {
      session: { access_token: token, refresh_token: refresh, expires_in: 3600 },
    });
  }
  if (route === "auth/logout") return ok(response, {});
  if (route === "auth/signup") {
    const email = String(json.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(json.password ?? "");
    if (!email || password.length < 8)
      return fail(response, 400, "malformed_request", "email and password are required");
    const existing = PEOPLE.find((candidate) => candidate.email === email);
    if (existing) {
      return fail(
        response,
        409,
        "account_exists",
        "An account with this email address already exists. Sign in or reset your password.",
        {
          confirmed: existing.email !== "leo@example.test",
          confirmation_resent: existing.email === "leo@example.test",
        },
      );
    }
    return ok(response, {
      user: {
        id: randomUUID(),
        email,
        first_name: String(json.first_name ?? ""),
        email_confirmed: false,
      },
      session: null,
    });
  }
  if (route === "auth/handoff/begin") {
    // The desktop app starts a browser sign-in: a challenge in, an id and a code out.
    const challenge = String(json.challenge ?? "");
    const intent = json.intent === "signup" ? "signup" : "login";
    if (!/^[A-Za-z0-9_-]{43}$/u.test(challenge) || json.client !== "desktop")
      return fail(response, 400, "malformed_request", "Expected a desktop client challenge.");
    const id = randomBytes(32).toString("base64url");
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from(
      { length: 8 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
    handoffs.set(id, {
      challenge,
      status: "pending",
      userId: null,
      userCode: `${code.slice(0, 4)}-${code.slice(4)}`,
      deviceName: String(json.device_name ?? "").slice(0, 120),
      intent,
      createdAt: iso(0),
      expiresAt: iso(intent === "signup" ? -30 : -10),
      approvedAt: null,
    });
    const entry = handoffs.get(id)!;
    return ok(response, {
      handoff_id: id,
      user_code: entry.userCode,
      expires_at: entry.expiresAt,
      poll_interval_seconds: 2,
    });
  }
  if (route === "auth/handoff/poll") {
    // The app polls with its verifier; the first poll after approval mints its session.
    const id = String(json.handoff_id ?? "");
    const verifier = String(json.verifier ?? "");
    const entry = handoffs.get(id);
    if (
      !entry ||
      entry.status === "redeemed" ||
      entry.challenge !== createHash("sha256").update(verifier).digest("base64url")
    )
      return fail(response, 401, "unauthenticated", "handoff invalid");
    if (entry.status !== "approved" || !entry.userId)
      return ok(response, { status: entry.status, expires_at: entry.expiresAt });
    entry.status = "redeemed";
    const p = person(entry.userId);
    const token = `mock-${p.role}-${randomUUID()}`;
    tokens.set(token, p.id);
    return ok(response, {
      status: "approved",
      user: authUser(p.id),
      session: { access_token: token, refresh_token: `refresh-${token}`, expires_in: 3600 },
    });
  }

  const userId = bearer(request);
  if (!userId) return fail(response, 401, "unauthenticated", "A bearer token is required.");
  const persona = roles[userId] ?? "user";
  const me = person(userId);

  const handoffMatch = route.match(
    /^auth\/handoff\/([A-Za-z0-9_-]{32,128})(?:\/(approve|deny))?$/u,
  );
  if (handoffMatch) {
    const entry = handoffs.get(handoffMatch[1]!);
    if (!entry) return fail(response, 404, "not_found", "No such request.");
    const decision = handoffMatch[2];
    if (!decision) {
      if (method !== "GET") return fail(response, 405, "method_not_allowed", "GET only.");
      return ok(response, handoffDto(entry));
    }
    if (method !== "POST") return fail(response, 405, "method_not_allowed", "POST only.");
    if (entry.status !== "pending")
      return fail(response, 409, "revision_conflict", "That request is no longer pending.", {
        handoff: entry.status,
      });
    if (decision === "approve") {
      entry.status = "approved";
      entry.userId = userId;
      entry.approvedAt = iso(0);
    } else {
      entry.status = "denied";
    }
    return ok(response, handoffDto(entry));
  }
  if (route === "auth/user") return ok(response, { user: authUser(userId) });
  if (route === "auth/user/profile") return ok(response, { profile: profile(userId) });
  if (route === "auth/user/profile/update") {
    const expected = Number(json.expected_profile_version ?? 0);
    if (expected !== 4)
      return fail(response, 409, "revision_conflict", "This page is out of date.");
    return ok(response, { profile: { user_id: userId, profile_version: 5, updated_at: iso(0) } });
  }
  if (route === "auth/password/update") return ok(response, {});

  // ---- self ---------------------------------------------------------------------
  if (route === "me") {
    return ok(response, {
      user: { user_id: me.id, email: me.email, is_active: me.active },
      role: roleProjection(me.id),
      capabilities: CAPABILITIES[persona],
      environment: "production",
    });
  }
  if (route === "me/entitlements") {
    return ok(response, entitlementDocument(me.id, me.tier));
  }
  // Spending an allowance, against the same USAGE store the entitlement document reads — so
  // a client that reserves here sees the number move when it asks again, and exhausts the
  // allowance after the right number of tries. A mock that always answered "allowed" would
  // let a desktop build with no metering in it look perfectly healthy against this server,
  // which is the one thing this file exists to prevent.
  if (route === "me/usage/reserve") {
    const featureKey = String(json.feature_key ?? "");
    if (featureKey !== "deep_research") {
      fail(response, 400, "malformed_request", "Not a client-metered feature.");
      return;
    }
    const feature = entitlementDocument(me.id, me.tier).features[featureKey] as Record<
      string,
      unknown
    >;
    const limit = typeof feature.limit === "number" ? feature.limit : null;
    const spend = (USAGE[me.id] ??= {});
    const counter = (spend[featureKey] ??= { used: 0, reserved: 0 });
    if (limit !== null && counter.used + counter.reserved + 1 > limit) {
      fail(response, 429, "quota_exceeded", "Your Deep Research allowance is used.", {
        feature_key: featureKey,
        plan: canonicalPlan(me.tier),
        used: counter.used,
        reserved: counter.reserved,
        limit,
        remaining: 0,
        period: "month",
        period_key: periodKey(),
        resets_at: periodResetsAt(),
      });
      return;
    }
    counter.reserved += 1;
    ok(response, {
      feature_key: featureKey,
      event_id: `00000000-0000-4000-8000-${String(counter.used + counter.reserved).padStart(12, "0")}`,
      plan: canonicalPlan(me.tier),
      period: "month",
      period_key: periodKey(),
      used: counter.used,
      reserved: counter.reserved,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - counter.used - counter.reserved),
      resets_at: periodResetsAt(),
    });
    return;
  }
  if (route === "me/usage/settle") {
    const outcome = String(json.outcome ?? "");
    if (outcome !== "commit" && outcome !== "release") {
      fail(response, 400, "malformed_request", "Outcome must be commit or release.");
      return;
    }
    const counter = USAGE[me.id]?.deep_research;
    const settled = Boolean(counter && counter.reserved > 0);
    if (counter && counter.reserved > 0) {
      counter.reserved -= 1;
      if (outcome === "commit") counter.used += 1;
    }
    ok(response, { event_id: String(json.event_id ?? ""), outcome, settled });
    return;
  }
  if (route.startsWith("sessions/")) {
    return ok(response, { session: session(userId, 0), event: null, replayed: false });
  }
  if (route === "sessions") {
    return ok(response, {
      sessions: [session(userId, 0), session(userId, 1), session(userId, 2, { revoked: true })],
    });
  }
  if (route === "activity") return ok(response, { events: activity(userId) });
  if (route === "notifications")
    return ok(response, { revision: "rev-notices-3", notifications: NOTIFICATIONS });
  if (route === "notifications/state") {
    return ok(response, {
      state: [
        { notification_id: "notice-security-reminder", status: "read", occurred_at: iso(60 * 20) },
      ],
      receipts: [
        {
          id: randomUUID(),
          notification_id: "notice-security-reminder",
          status: "read",
          occurred_at: iso(60 * 20),
          created_at: iso(60 * 20),
        },
        {
          id: randomUUID(),
          notification_id: "notice-release-2026-09",
          status: "seen",
          occurred_at: iso(60 * 26),
          created_at: iso(60 * 26),
        },
      ],
    });
  }
  if (route === "notifications/receipts") {
    return ok(response, {
      receipt: { notification_id: String(json.notification_id), status: String(json.status) },
      event: { id: randomUUID(), event_type: "notification.receipt" },
      replayed: false,
    });
  }
  if (route === "account/lifecycle") {
    return ok(response, {
      revision: "rev-lifecycle-2",
      generated_at: iso(0),
      export_queue: { job_limit: 50, returned: 1, per_user_limit: 3 },
      exports: [
        {
          id: "24000000-0000-4000-8000-000000000001",
          format: "json",
          status: "ready",
          requested_at: iso(60 * 30),
          generated_at: iso(60 * 29),
          expires_at: new Date(Date.now() + 86_400_000 * 6)
            .toISOString()
            .replace(/\.\d{3}Z$/u, "Z"),
          attempts: 1,
          max_attempts: 3,
          next_attempt_at: "",
          last_error: "",
          byte_count: 48_213,
          sections: ["profile", "sessions", "activity"],
          download: {
            available: true,
            private: true,
            encrypted: true,
            source_locked: true,
            content_type: "application/octet-stream",
            filename: "quantify-account-export-24000000-0000-4000-8000-000000000001.json.enc",
            expires_at: new Date(Date.now() + 900_000).toISOString().replace(/\.\d{3}Z$/u, "Z"),
            ttl_seconds: 900,
            byte_count: 48_213,
            sha256: "b".repeat(64),
            url: null,
          },
        },
      ],
      deletion: { active: null, requests: [] },
    });
  }
  if (
    route === "account/exports/request" ||
    route === "account/deletion/request" ||
    route === "account/deletion/cancel"
  ) {
    return fail(response, 409, "revision_conflict", "This page changed. Reload and try again.");
  }

  // ---- admin --------------------------------------------------------------------
  const caps = CAPABILITIES[persona];
  const requires = (capability: string) => {
    if (!caps.includes(capability)) {
      fail(response, 403, "forbidden", "This account is not permitted to do that.");
      return false;
    }
    return true;
  };

  if (route === "admin/metrics") {
    if (!requires("account:read-any")) return;
    return ok(response, {
      generated_at: iso(1),
      window: { hours: 24, since: iso(60 * 24) },
      accounts: {
        total: 1284,
        active: 1231,
        inactive: 53,
        created_24h: 18,
        logged_in_24h: 412,
        created_7d: 96,
        created_30d: 341,
        logged_in_7d: 803,
      },
      series: metricSeries(),
      sessions: {
        total: 3120,
        active: 611,
        expired: 2350,
        revoked: 159,
        by_source: { portal: 240, desktop: 371 },
      },
      auth_events_24h: {
        total: 2074,
        by_type: { "session.registered": 402, "login.success": 611 },
        by_outcome: { success: 2011, failure: 51, blocked: 12 },
        by_source: { portal: 700, "account-api": 1374 },
      },
      limits: {
        row_limit: 10000,
        accounts_truncated: false,
        sessions_truncated: false,
        events_truncated: false,
      },
    });
  }
  if (route === "admin/role-report") {
    if (!requires("roles:read-report")) return;
    return ok(response, ROLE_REPORT());
  }
  if (route === "admin/users") {
    if (!requires("account:read-any")) return;
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status") ?? "";
    if (status && status !== "active" && status !== "inactive") {
      return fail(response, 400, "malformed_request", "expected active or inactive");
    }
    const matching = PEOPLE.filter((p) => {
      if (q && !`${p.email} ${p.first} ${p.last}`.toLowerCase().includes(q)) return false;
      if (status === "active" && !p.active) return false;
      if (status === "inactive" && p.active) return false;
      return true;
    });
    const page = matching.slice(offset, offset + limit).map(summary);
    return ok(response, {
      generated_at: iso(0),
      pagination: {
        limit,
        offset,
        has_more: offset + limit < matching.length,
        next_offset: offset + limit < matching.length ? offset + limit : null,
        total: matching.length,
      },
      users: page,
    });
  }
  const userMatch = route.match(/^admin\/users\/([^/]+)$/u);
  if (userMatch) {
    if (!requires("account:read-any")) return;
    const target = PEOPLE.find((p) => p.id === userMatch[1]);
    if (!target) return fail(response, 404, "not_found", "No such account.");
    return ok(response, {
      ...summary(target),
      sessions: [session(target.id, 0), session(target.id, 1, { expired: true })],
      activity: activity(target.id).slice(0, 5),
    });
  }
  if (route === "admin/subscriptions") {
    if (!requires("account:read-any")) return;
    const plans: Record<string, number> = {};
    for (const candidate of PEOPLE) {
      if (!candidate.active) continue;
      plans[candidate.tier] = (plans[candidate.tier] ?? 0) + 1;
    }
    return ok(response, {
      generated_at: iso(0),
      plans,
      total_accounts: Object.values(plans).reduce((sum, count) => sum + count, 0),
    });
  }
  const usageMatch = route.match(/^admin\/users\/([^/]+)\/usage$/u);
  if (usageMatch) {
    if (!requires("account:read-any")) return;
    const target = PEOPLE.find((p) => p.id === usageMatch[1]);
    if (!target) return fail(response, 404, "not_found", "No such account.");
    return ok(response, {
      user_id: target.id,
      plan: canonicalPlan(target.tier),
      generated_at: iso(0),
      counters: usageCounters(target.id),
    });
  }
  const adminEntitlementsMatch = route.match(/^admin\/users\/([^/]+)\/entitlements$/u);
  if (adminEntitlementsMatch) {
    if (!requires("account:read-any")) return;
    const target = PEOPLE.find((p) => p.id === adminEntitlementsMatch[1]);
    if (!target) return fail(response, 404, "not_found", "No such account.");
    return ok(response, {
      user_id: target.id,
      profile_version: 4,
      ...entitlementDocument(target.id, target.tier),
    });
  }
  const subscriptionMatch = route.match(/^admin\/users\/([^/]+)\/subscription$/u);
  if (subscriptionMatch && method === "POST") {
    if (!requires("subscription:write")) return;
    const target = PEOPLE.find((p) => p.id === subscriptionMatch[1]);
    if (!target) return fail(response, 404, "not_found", "No such account.");
    if (target.id === userId) return fail(response, 403, "forbidden", "cannot change own plan");
    // The mock's profiles are all at version 4, like the profile update route above, so
    // the console's compare-and-swap and its conflict path are both exercised.
    if (json.expected_profile_version !== 4) {
      return fail(response, 409, "revision_conflict", "This page is out of date.", {
        profile_version: 4,
      });
    }
    const previous = canonicalPlan(target.tier);
    const trialDays = Number(json.trial_days ?? 0);
    const trialWasLive = liveTrialEnd(target.id) !== null;
    // Nothing to change: the submitted plan is the one the account is on and there is no
    // trial to start or end. Writing anyway would bump entitlement_version, which
    // invalidates the cached entitlement document on every signed-in device.
    if (previous === canonicalPlan(String(json.plan)) && trialDays === 0 && !trialWasLive) {
      return ok(response, {
        user_id: target.id,
        plan: previous,
        previous_plan: previous,
        profile_version: 4,
        entitlement_version: entitlementVersion(target.id),
        overrides: [],
        trial_ends_at: "",
        unchanged: true,
        event: null,
        replayed: false,
        legacy_mirrored: false,
      });
    }
    target.tier = String(json.plan);
    // Zero days clears a running trial, so moving to a paid plan ends it.
    if (trialDays > 0) {
      trialEnds.set(target.id, inDays(trialDays));
    } else {
      trialEnds.delete(target.id);
    }
    const version = entitlementVersion(target.id) + 1;
    subscriptionVersions.set(target.id, version);
    return ok(response, {
      user_id: target.id,
      plan: target.tier,
      previous_plan: previous,
      profile_version: 5,
      entitlement_version: version,
      overrides: [],
      trial_ends_at: liveTrialEnd(target.id) ?? "",
      unchanged: false,
      event: { id: randomUUID(), event_type: "account.subscription_changed" },
      replayed: false,
      legacy_mirrored: true,
    });
  }
  const entitlementMatch = route.match(/^admin\/users\/([^/]+)\/entitlement$/u);
  if (entitlementMatch && method === "POST") {
    if (!requires("subscription:write")) return;
    const target = PEOPLE.find((p) => p.id === entitlementMatch[1]);
    if (!target) return fail(response, 404, "not_found", "No such account.");
    const feature = String(json.feature_key ?? "");
    if (!FEATURE_PERIODS[feature]) {
      return fail(response, 400, "malformed_request", "unknown feature", {
        feature_key: "unknown feature",
      });
    }
    const rows = (entitlementOverrides.get(target.id) ?? []).filter(
      (row) => row.feature_key !== feature,
    );
    if (json.remove !== true) {
      const reason = String(json.reason ?? "").trim();
      if (!reason) {
        return fail(response, 400, "malformed_request", "reason is required", {
          reason: "required",
        });
      }
      // resolve() is max-wins, so a limit at or below what the account already has, and a
      // flag turned off, both resolve to nothing. Storing them would report "override
      // recorded" for a row with no effect.
      const current = resolvedEntitlements(target.id, effectivePlan(target.id, target.tier))[
        feature
      ] as Record<string, unknown> | undefined;
      if (BOOLEAN_FEATURES.has(feature)) {
        if (json.bool_value !== true) {
          return fail(response, 400, "malformed_request", "grants nothing", {
            [feature]:
              `this account already has this feature ${current?.enabled ? "on" : "off"}; ` +
              "an override can only turn a feature on, so this would record a row that " +
              "grants nothing. To take a feature away, move the account to a plan that " +
              "does not include it.",
          });
        }
      } else {
        const standing = (current?.limit ?? null) as number | null;
        const asked = typeof json.limit_value === "number" ? (json.limit_value as number) : null;
        const wouldApply = asked === null || standing === null ? null : Math.max(standing, asked);
        if (asked !== null && (standing === null || wouldApply !== asked)) {
          const effective = standing === null ? "unlimited" : String(standing);
          return fail(response, 400, "malformed_request", "grants nothing", {
            [feature]:
              standing === null || wouldApply === standing
                ? `this account's effective limit is already ${effective}; an override can ` +
                  "only raise a limit, so this would record a row that grants nothing. To " +
                  "lower a limit, move the account to a plan with a lower one."
                : `this account's effective limit is ${effective} and would become ` +
                  `${wouldApply}, not the value requested, because an override can only ` +
                  "raise a limit. Ask for at least that much, or move the account to a " +
                  "plan with a lower one.",
          });
        }
      }
      rows.push({
        feature_key: feature,
        source: "override",
        source_ref: "",
        limit_value: typeof json.limit_value === "number" ? (json.limit_value as number) : null,
        bool_value: typeof json.bool_value === "boolean" ? (json.bool_value as boolean) : null,
        effective_from: iso(0),
        effective_to: inDays(Number(json.expires_in_days ?? 90)),
        granted_by: userId,
        reason,
      });
    }
    entitlementOverrides.set(target.id, rows);
    const version = entitlementVersion(target.id) + 1;
    subscriptionVersions.set(target.id, version);
    return ok(response, {
      user_id: target.id,
      plan: effectivePlan(target.id, target.tier),
      previous_plan: "",
      profile_version: 4,
      entitlement_version: version,
      overrides: rows,
      trial_ends_at: liveTrialEnd(target.id) ?? "",
      unchanged: false,
      event: { id: randomUUID(), event_type: "account.entitlement_changed" },
      replayed: false,
      legacy_mirrored: true,
    });
  }
  const roleMatch = route.match(/^admin\/users\/([^/]+)\/role$/u);
  if (roleMatch && method === "POST") {
    if (!requires("roles:write")) return;
    const target = PEOPLE.find((p) => p.id === roleMatch[1]);
    if (!target) return fail(response, 404, "not_found", "No such account.");
    if (target.id === userId) return fail(response, 403, "forbidden", "cannot change own role");
    roles[target.id] = String(json.role) as Persona;
    target.role = roles[target.id]!;
    return ok(response, {
      ...summary(target),
      event: { id: randomUUID(), event_type: "account.role_changed" },
      replayed: false,
      legacy_mirrored: true,
    });
  }
  const activationMatch = route.match(/^admin\/users\/([^/]+)\/activation$/u);
  if (activationMatch && method === "POST") {
    if (!requires("users:set-active")) return;
    const target = PEOPLE.find((p) => p.id === activationMatch[1]);
    if (!target) return fail(response, 404, "not_found", "No such account.");
    target.active = Boolean(json.is_active);
    return ok(response, {
      ...summary(target),
      event: {
        id: randomUUID(),
        event_type: target.active ? "account.activated" : "account.deactivated",
      },
      replayed: false,
      legacy_mirrored: true,
    });
  }
  const revokeMatch = route.match(/^admin\/users\/([^/]+)\/sessions\/([^/]+)\/revoke$/u);
  if (revokeMatch && method === "POST") {
    if (!requires("sessions:revoke-any")) return;
    return ok(response, {
      session: session(revokeMatch[1]!, 0, { revoked: true }),
      event: { id: randomUUID(), event_type: "session.revoked", outcome: "success" },
      replayed: false,
      legacy_mirrored: true,
    });
  }
  if (route === "admin/audit-events/search") {
    if (!requires("audit:read")) return;
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const filters: Record<string, string> = {};
    for (const key of [
      "event_type",
      "outcome",
      "source",
      "subject_user_id",
      "actor_user_id",
      "session_id",
      "request_id",
    ]) {
      const value = url.searchParams.get(key);
      if (value) filters[key] = value;
    }
    const generatedEvents = PEOPLE.flatMap((p, index) =>
      activity(p.id)
        .slice(0, 3)
        .map((event, position) => ({
          id: randomUUID(),
          subject_user_id: p.id,
          subject_email: p.email,
          actor_user_id: position === 0 ? PEOPLE[0]!.id : null,
          actor_email: position === 0 ? PEOPLE[0]!.email : null,
          session_id: event.session_id,
          event_type: event.event_type,
          outcome: event.outcome,
          source: event.source,
          request_id: `qt-req-${index}${position}`,
          occurred_at: iso(index * 30 + position * 7),
          created_at: iso(index * 30 + position * 7),
          summary: { actor_role: persona === "support" ? "redacted" : "owner" },
        })),
    );
    // Plan and override changes live in the same trail; the subscriptions page reads
    // them back by filtering on these two types.
    const planChanges = [
      {
        subject: PEOPLE[4]!,
        event_type: "account.subscription_changed",
        minutes: 90,
      },
      {
        subject: PEOPLE[0]!,
        event_type: "account.entitlement_changed",
        minutes: 60 * 26,
      },
      {
        subject: PEOPLE[5]!,
        event_type: "account.subscription_changed",
        minutes: 60 * 72,
      },
    ].map((change) => ({
      id: randomUUID(),
      subject_user_id: change.subject.id,
      subject_email: change.subject.email,
      actor_user_id: PEOPLE[0]!.id,
      actor_email: PEOPLE[0]!.email,
      session_id: null,
      event_type: change.event_type,
      outcome: "success" as const,
      source: "account-api",
      request_id: `qt-req-plan-${change.minutes}`,
      occurred_at: iso(change.minutes),
      created_at: iso(change.minutes),
      summary: { actor_role: persona === "support" ? "redacted" : "owner" },
    }));
    const events = [...generatedEvents, ...planChanges].filter(
      (event) => !filters.event_type || event.event_type === filters.event_type,
    );
    return ok(response, {
      generated_at: iso(0),
      pagination: {
        limit,
        offset,
        has_more: events.length > offset + limit,
        next_offset: events.length > offset + limit ? offset + limit : null,
      },
      filters,
      events: events.slice(offset, offset + limit),
    });
  }
  const reportJob = (status: "ready" | "queued", id: string) => ({
    id,
    report_type: "audit-events",
    format: "csv",
    filters: status === "ready" ? { event_type: "session.revoked" } : {},
    status,
    queued_at: iso(status === "ready" ? 60 * 5 : 12),
    generated_at: status === "ready" ? iso(60 * 4) : "",
    expires_at: new Date(Date.now() + 86_400_000).toISOString().replace(/\.\d{3}Z$/u, "Z"),
    attempts: status === "ready" ? 1 : 0,
    max_attempts: 3,
    next_attempt_at: status === "ready" ? "" : iso(-5),
    last_error: "",
    // Within the service's ceiling (REPORT_MAX_ROWS = 1000): a report never carries more.
    row_count: status === "ready" ? 846 : 0,
    download: {
      available: status === "ready",
      private: true,
      source_locked: true,
      content_type: "text/csv; charset=utf-8",
      filename: `audit-events-${id}.csv`,
      expires_at: new Date(Date.now() + 900_000).toISOString().replace(/\.\d{3}Z$/u, "Z"),
      ttl_seconds: 900,
      byte_count: status === "ready" ? 98_304 : 0,
      sha256: status === "ready" ? "c".repeat(64) : "",
      url: null,
    },
  });
  if (route === "admin/reports") {
    if (!requires("audit:read")) return;
    return ok(response, {
      revision: "rev-reports-2",
      generated_at: iso(0),
      queue: { job_limit: 200, returned: 2 },
      jobs: [
        reportJob("ready", "23000000-0000-4000-8000-000000000001"),
        reportJob("queued", "23000000-0000-4000-8000-000000000002"),
      ],
    });
  }
  if (route === "admin/reports/enqueue") {
    if (!requires("audit:read")) return;
    return ok(response, {
      revision: "rev-reports-3",
      job: reportJob("queued", randomUUID()),
      event: { id: randomUUID(), event_type: "reports.queued" },
      replayed: false,
      legacy_mirrored: true,
    });
  }
  const SUPPORT_MESSAGES = [
    {
      id: "msg_00000000000000000001",
      author: "customer",
      author_name: "priya@example.test",
      body: "Exports have failed since this morning. The button spins and nothing downloads.",
      at: iso(180),
    },
    {
      id: "msg_00000000000000000002",
      author: "staff",
      author_name: "sam@example.test",
      body: "Thanks — which format, and does it fail for every portfolio or one?",
      at: iso(150),
    },
    {
      id: "msg_00000000000000000003",
      author: "customer",
      author_name: "priya@example.test",
      body: "CSV, and it is every portfolio.",
      at: iso(20),
    },
  ];
  const SUPPORT_CONVERSATIONS = [
    {
      id: "sup_0000000000000000aaaa",
      subject: "Exports have stopped working",
      status: "open",
      priority: "urgent",
      created_at: iso(180),
      updated_at: iso(20),
      message_count: SUPPORT_MESSAGES.length,
      last_author: "customer",
      last_at: iso(20),
      account_id: PEOPLE[3]!.id,
      account_email: PEOPLE[3]!.email,
      assignee_id: persona === "support" ? PEOPLE[2]!.id : "",
      assignee_name: persona === "support" ? PEOPLE[2]!.email : "",
      unread: true,
    },
    {
      id: "sup_0000000000000000bbbb",
      subject: "How do I move my watchlists to a new machine?",
      status: "pending",
      priority: "normal",
      created_at: iso(2880),
      updated_at: iso(600),
      message_count: 4,
      last_author: "staff",
      last_at: iso(600),
      account_id: PEOPLE[3]!.id,
      account_email: PEOPLE[3]!.email,
      assignee_id: PEOPLE[1]!.id,
      assignee_name: PEOPLE[1]!.email,
      unread: false,
    },
    {
      id: "sup_0000000000000000cccc",
      subject: "Duplicate charge on my October invoice",
      status: "resolved",
      priority: "high",
      created_at: iso(10080),
      updated_at: iso(4320),
      message_count: 6,
      last_author: "staff",
      last_at: iso(4320),
      account_id: PEOPLE[3]!.id,
      account_email: PEOPLE[3]!.email,
      assignee_id: "",
      assignee_name: "",
      unread: false,
    },
  ];
  const supportConversation = (id: string) => {
    const summary = SUPPORT_CONVERSATIONS.find((row) => row.id === id) ?? SUPPORT_CONVERSATIONS[0]!;
    return {
      id: summary.id,
      subject: summary.subject,
      status: summary.status,
      priority: summary.priority,
      created_at: summary.created_at,
      updated_at: summary.updated_at,
      messages: SUPPORT_MESSAGES,
      account_id: summary.account_id,
      account_email: summary.account_email,
      assignee_id: summary.assignee_id,
      assignee_name: summary.assignee_name,
      app_version: "3.1.0",
      platform: "macOS",
      unread: summary.unread,
    };
  };
  const CAPABILITY_MATRIX: Record<string, string[]> = {
    owner: [
      "account:read-any",
      "account:read-self",
      "audit:read",
      "audit:write",
      "configuration:read",
      "credentials:read-status",
      "notifications:write",
      "releases:publish",
      "releases:read-status",
      "roles:read-report",
      "roles:write",
      "secrets:read",
      "secrets:write",
      "sessions:revoke-any",
      "staff:write",
      "subscription:write",
      "support:manage",
      "support:read",
      "support:read-all",
      "support:reply",
      "users:set-active",
    ],
    admin: [
      "account:read-any",
      "account:read-self",
      "audit:read",
      "audit:write",
      "notifications:write",
      "roles:read-report",
      "secrets:read",
      "sessions:revoke-any",
      "staff:write",
      "subscription:write",
      "support:manage",
      "support:read",
      "support:read-all",
      "support:reply",
      "users:set-active",
    ],
    support_manager: [
      "account:read-any",
      "account:read-self",
      "audit:read",
      "audit:write",
      "support:manage",
      "support:read",
      "support:read-all",
      "support:reply",
    ],
    billing_manager: ["account:read-any", "account:read-self", "audit:write", "subscription:write"],
    auditor: [
      "account:read-any",
      "account:read-self",
      "audit:read",
      "configuration:read",
      "roles:read-report",
    ],
    support: [
      "account:read-any",
      "account:read-self",
      "audit:read",
      "audit:write",
      "support:read",
      "support:reply",
    ],
    user: ["account:read-self"],
  };
  const GRANTABLE = ["support_manager", "billing_manager", "auditor", "support", "user"];
  const staffMember = (person: (typeof PEOPLE)[number], role: string) => ({
    user_id: person.id,
    email: person.email,
    display_name: `${person.first} ${person.last}`,
    is_active: person.active,
    role,
    capabilities: CAPABILITY_MATRIX[role] ?? [],
    mismatch: "match",
    break_glass: false,
    profile_readable: true,
  });
  if (route === "admin/staff") {
    if (!requires("account:read-any")) return;
    return ok(response, {
      generated_at: iso(0),
      members: [
        staffMember(PEOPLE[0]!, "owner"),
        staffMember(PEOPLE[1]!, "admin"),
        staffMember(PEOPLE[2]!, "support_manager"),
      ],
      roles: Object.keys(CAPABILITY_MATRIX).map((role) => ({
        role,
        capabilities: CAPABILITY_MATRIX[role]!,
        grantable: GRANTABLE.includes(role),
      })),
      grantable_roles: GRANTABLE,
      can_grant: caps.includes("staff:write"),
      can_assign_any_role: caps.includes("roles:write"),
      legacy_readable: true,
    });
  }
  const staffWrite = route.match(/^admin\/staff\/([0-9a-f-]{36})$/u);
  if (staffWrite) {
    if (!requires("staff:write")) return;
    const requested = String(json.role ?? "");
    if (!GRANTABLE.includes(requested)) {
      return fail(response, 400, "malformed_request", "That is not a role this route sets.");
    }
    return ok(response, {
      member: { ...staffMember(PEOPLE[3]!, requested), user_id: staffWrite[1]! },
      changed: true,
      event: { id: randomUUID(), event_type: "account.role_changed" },
      replayed: false,
    });
  }
  if (route === "admin/support") {
    if (!requires("support:read")) return;
    // The service narrows the queue before it answers; the mock does the same, or the
    // agent persona renders a page it could never actually see.
    const seesAll = caps.includes("support:read-all");
    const visible = seesAll
      ? SUPPORT_CONVERSATIONS
      : SUPPORT_CONVERSATIONS.filter(
          (row) => !row.assignee_id || row.assignee_id === PEOPLE[2]!.id,
        );
    return ok(response, {
      conversations: visible,
      unread: visible.filter((row) => row.unread).length,
      sees_all: seesAll,
      can_reply: caps.includes("support:reply"),
      can_manage: caps.includes("support:manage"),
      statuses: ["open", "pending", "resolved"],
      priorities: ["low", "normal", "high", "urgent"],
    });
  }
  const supportDetail = route.match(
    /^admin\/support\/([A-Za-z0-9_-]{1,64})(?:\/(reply|manage))?$/u,
  );
  if (supportDetail) {
    const action = supportDetail[2];
    const capability =
      action === "reply"
        ? "support:reply"
        : action === "manage"
          ? "support:manage"
          : "support:read";
    if (!requires(capability)) return;
    return ok(response, { conversation: supportConversation(supportDetail[1]!), replayed: false });
  }
  if (route === "admin/notifications") {
    if (!requires("notifications:write")) return;
    return ok(response, {
      revision: "rev-notices-3",
      notifications: NOTIFICATIONS.map((n) => ({
        ...n,
        target: { mode: "all", user_ids: [], emails: [] },
      })),
    });
  }
  if (route === "admin/notifications/update") {
    if (!requires("notifications:write")) return;
    return ok(response, {
      revision: "rev-notices-4",
      count: NOTIFICATIONS.length,
      event: { id: randomUUID(), event_type: "notification.updated" },
      replayed: false,
      legacy_mirrored: true,
    });
  }
  const emailJob = (status: "queued" | "retry" | "sent", subject: string, index: number) => ({
    id: `3100000${index}-0000-4000-8000-000000000001`,
    subject,
    body: "Plain-text body.",
    target: {
      mode: index === 1 ? "selected" : "all",
      user_ids: index === 1 ? [PEOPLE[3]!.id] : [],
      emails: [],
    },
    status,
    queued_at: iso(60 * (index + 1)),
    scheduled_at: status === "queued" ? iso(-30) : "",
    attempts: status === "sent" ? 1 : status === "retry" ? 2 : 0,
    max_attempts: 3,
    next_attempt_at: status === "retry" ? iso(-10) : status === "queued" ? iso(-30) : "",
    last_error: status === "retry" ? "Provider returned 429" : "",
    last_attempt_at: status === "queued" ? "" : iso(20),
    completed_at: status === "sent" ? iso(20) : "",
  });
  if (route === "admin/email") {
    if (!requires("notifications:write")) return;
    return ok(response, {
      revision: "rev-email-5",
      generated_at: iso(0),
      quota: { daily_limit: 25, queued_24h: 3, queue_limit: 500 },
      jobs: [
        emailJob("queued", "Maintenance on Saturday", 0),
        emailJob("retry", "Your export is ready", 1),
        emailJob("sent", "Welcome to Quantify Terminal", 2),
      ],
    });
  }
  if (route === "admin/email/enqueue") {
    if (!requires("notifications:write")) return;
    return ok(response, {
      revision: "rev-email-6",
      job: emailJob("queued", String(json.subject ?? "Queued email"), 3),
      event: { id: randomUUID(), event_type: "notification.email_queued" },
      replayed: false,
      legacy_mirrored: true,
    });
  }
  if (route === "admin/configuration") {
    if (!requires("configuration:read")) return;
    return ok(response, {
      generated_at: iso(0),
      environment: "production",
      cors: { allowed_origin_count: 2, wildcard_allowed: false },
      limits: {
        max_body_bytes: 16384,
        upstream_timeout_seconds: 12,
        idempotency_ttl_seconds: 86400,
        reservation_lease_seconds: 180,
        email_worker_batch_limit: 5,
        artifact_worker_batch_limit: 2,
        deletion_worker_batch_limit: 1,
        signed_download_ttl_seconds: 900,
      },
      features: {
        email_worker_enabled: true,
        artifact_worker_enabled: false,
        deletion_worker_enabled: false,
        signed_downloads_enabled: false,
        account_export_encryption_configured: true,
        private_artifact_storage_configured: true,
        legacy_role_source_configured: true,
        break_glass_owner_count: 1,
        legacy_bootstrap_admin_count: 1,
      },
    });
  }
  if (route === "admin/credentials") {
    if (!requires("credentials:read-status")) return;
    return ok(response, {
      generated_at: iso(0),
      credentials: [
        {
          name: "azure_sql_connection_string",
          configured: true,
          secret: true,
          rotation: "source-locked",
        },
        {
          name: "azure_auth_jwt_secret",
          configured: true,
          secret: true,
          rotation: "source-locked",
        },
        { name: "azure_storage", configured: true, secret: true, rotation: "source-locked" },
        { name: "brevo_api_key", configured: true, secret: true, rotation: "source-locked" },
        { name: "brevo_sender_email", configured: true, secret: false, rotation: "source-locked" },
        {
          name: "account_export_encryption_key",
          configured: true,
          secret: true,
          rotation: "source-locked",
        },
        { name: "release_signing_key", configured: false, secret: true, rotation: "source-locked" },
      ],
    });
  }
  if (route === "admin/secrets") {
    if (!requires("secrets:read")) return;
    return ok(response, secretsDocument());
  }
  const secretWrite = route.match(/^admin\/secrets\/([A-Za-z0-9_]{1,80})(?:\/(revoke|restore))?$/u);
  if (secretWrite) {
    const slot = SECRET_CATALOGUE.find((entry) => entry.slot === secretWrite[1]);
    if (!slot) return fail(response, 404, "not_found", "No such credential.");
    if (!requires("secrets:write")) return;
    if (method !== "POST") return fail(response, 405, "method_not_allowed", "POST only.");
    const action = secretWrite[2] ?? "set";
    if (action === "restore") {
      const prior = secretHistory.get(slot.slot);
      if (!prior) return fail(response, 404, "not_found", "Nothing is kept for this credential.");
      secretStore.set(slot.slot, prior);
      secretHistory.delete(slot.slot);
      return ok(response, secretWriteReceipt(slot, "restore"));
    }
    const existing = secretStore.get(slot.slot) ?? [];
    if (action === "revoke") {
      if (existing.length > 0) secretHistory.set(slot.slot, existing);
      secretStore.set(slot.slot, []);
      return ok(response, secretWriteReceipt(slot, "revoke"));
    }
    const value = String(json.value ?? "");
    if (!value.trim()) {
      return fail(response, 400, "empty_value_rejected", "A credential value is required.");
    }
    // The mock never keeps the value: it stores what the real service stores about one.
    const appended = json.mode === "append" && slot.kind === "multi";
    if (existing.length > 0) secretHistory.set(slot.slot, existing);
    const kept = appended ? existing : [];
    secretStore.set(slot.slot, [
      ...kept,
      {
        fingerprint: fabricatedFingerprint(slot.slot, kept.length + Date.now()),
        prefix: slot.prefixes.find((prefix) => value.startsWith(prefix)) ?? "",
        length: value.length,
        position: kept.length,
        set_by: userId,
        set_at: iso(0),
        verification: { state: "unverified", checked_at: null },
      },
    ]);
    return ok(response, secretWriteReceipt(slot, appended ? "append" : "set"));
  }
  // ---- broker connections ----------------------------------------------------------
  //
  // Fabricated fingerprints only. No value is stored here and none is derivable from what
  // is — the same property the real store has, so a page that renders against this renders
  // against production.
  if (route === "me/brokers" && method === "GET") {
    return ok(response, {
      // user_id is stripped, not filtered out afterwards: the real route returns
      // `broker_vault.public_view`, which is an allowlist, and the console's schema is
      // `.strict()` — so a mock that returns one extra field fails the parse exactly the way
      // production would. That is the point of keeping the shapes identical.
      connections: brokerConnections
        .filter((row) => row.user_id === userId)
        .map((row) => publicBrokerView(row)),
      implemented_brokers: ["alpaca", "upstox"],
      encryption_configured: process.env.MOCK_BROKER_ENCRYPTION !== "unconfigured",
    });
  }
  // Deliberately `me/brokers/create`, matching the service's route table. An earlier version
  // of this mock answered POST on the bare `me/brokers` too, and that leniency hid a console
  // that was posting creates to a GET-only route in production.
  if (route === "me/brokers/create" && method === "POST") {
    const broker = String(json.broker ?? "");
    if (!["alpaca", "upstox"].includes(broker)) {
      return fail(response, 400, "malformed_request", "no adapter; available: alpaca, upstox");
    }
    const primary = String(json.passphrase ?? json.api_key ?? json.secret_key ?? "");
    if (!primary) return fail(response, 400, "malformed_request", "credentials are required");
    const created = {
      id: randomUUID(),
      user_id: userId,
      broker,
      name: String(json.name ?? broker),
      account_reference: "",
      paper: json.paper !== false,
      is_active: true,
      credential_fingerprint: createHash("sha256").update(primary).digest("hex").slice(0, 12),
      credential_last_four: primary.length >= 12 ? primary.slice(-4) : "",
      last_test_at: null as string | null,
      last_test_success: false,
      // A new connection cannot trade until it has been tested, which is what the service
      // does: `record_broker_test_result` is what turns this on.
      trading_enabled: false,
      last_error: "",
      created_at: iso(0),
      updated_at: iso(0),
    };
    brokerConnections.unshift(created);
    return ok(response, { connection: publicBrokerView(created) });
  }
  if (route.startsWith("me/brokers/") && method === "POST") {
    const [, , connectionId, action] = route.split("/");
    const row = brokerConnections.find(
      (item) => item.id === connectionId && item.user_id === userId,
    );
    if (!row) return fail(response, 404, "not_found", "No such broker connection.");
    if (action === "delete") {
      brokerConnections.splice(brokerConnections.indexOf(row), 1);
      return ok(response, { deleted: true });
    }
    if (action === "test") {
      // MOCK_BROKER_TEST=reject exercises the "broker said no" branch, which is a
      // successful request with a negative answer rather than an error.
      if (process.env.MOCK_BROKER_TEST === "reject") {
        row.last_test_success = false;
        row.last_test_at = iso(0);
        row.last_error = "The broker rejected these credentials.";
        return ok(response, { ok: false, message: row.last_error });
      }
      row.last_test_success = true;
      row.last_test_at = iso(0);
      row.trading_enabled = true;
      row.last_error = "";
      row.account_reference = row.broker === "upstox" ? "UP1234" : "PA3XYZ";
      return ok(response, { ok: true, message: "Connected.", connection: publicBrokerView(row) });
    }
    return fail(response, 404, "not_found", `No route for ${method} ${route}.`);
  }

  // ---- portfolios ------------------------------------------------------------------
  //
  // Models the three rules the service enforces, because a mock that did not would let a
  // page pass here and fail in production: exactly one default, the last book is never
  // closed, and a book holding anything is never closed.
  if (route === "me/portfolios" && method === "GET") {
    return ok(response, {
      portfolios: portfolios.filter((row) => row.user_id === userId).map(publicPortfolioView),
      max_portfolios: 100,
    });
  }
  if (route === "me/portfolios/create" && method === "POST") {
    const name = String(json.name ?? "").trim();
    if (!name) return fail(response, 400, "malformed_request", "A portfolio needs a name.");
    const mine = portfolios.filter((row) => row.user_id === userId);
    if (mine.some((row) => row.name === name)) {
      return fail(response, 403, "forbidden", "That name is already used by another portfolio.");
    }
    const startingCash = Number(json.starting_cash ?? 0);
    const created = {
      id: randomUUID(),
      user_id: userId,
      name,
      base_currency: String(json.base_currency ?? "USD"),
      benchmark_symbol: String(json.benchmark_symbol ?? "SPY"),
      starting_cash: startingCash,
      cash_balance: startingCash,
      is_paper: json.is_paper !== false,
      // The first book is the default whatever the request said.
      is_default: Boolean(json.is_default) || mine.length === 0,
      created_at: iso(0),
      updated_at: iso(0),
    };
    if (created.is_default) {
      for (const row of mine) row.is_default = false;
    }
    portfolios.push(created);
    return ok(response, { portfolio: publicPortfolioView(created) }, 201);
  }
  if (route.startsWith("me/portfolios/") && method === "POST") {
    const [, , portfolioId, action] = route.split("/");
    const row = portfolios.find((item) => item.id === portfolioId && item.user_id === userId);
    if (!row) return fail(response, 404, "not_found", "No such portfolio.");
    const mine = portfolios.filter((item) => item.user_id === userId);

    if (action === "update") {
      if (typeof json.name === "string") {
        const name = json.name.trim();
        if (mine.some((item) => item.id !== row.id && item.name === name)) {
          return fail(response, 403, "forbidden", "That name is already used.");
        }
        row.name = name;
      }
      if (typeof json.benchmark_symbol === "string") row.benchmark_symbol = json.benchmark_symbol;
      if (typeof json.base_currency === "string") row.base_currency = json.base_currency;
      if (json.is_paper !== undefined && Boolean(json.is_paper) !== row.is_paper) {
        const contents = portfolioContents[row.id];
        if (contents && (contents.holdings || contents.transactions)) {
          return fail(
            response,
            403,
            "forbidden",
            "This portfolio has trades, so it cannot change between paper and real money.",
          );
        }
        row.is_paper = Boolean(json.is_paper);
      }
      if (json.is_default !== undefined) {
        if (!json.is_default && row.is_default) {
          return fail(
            response,
            403,
            "forbidden",
            "Make another portfolio the default instead of clearing this one.",
          );
        }
        if (json.is_default) {
          for (const item of mine) item.is_default = false;
          row.is_default = true;
        }
      }
      row.updated_at = iso(0);
      return ok(response, { portfolio: publicPortfolioView(row) });
    }

    if (action === "delete") {
      if (mine.length <= 1) {
        return fail(response, 403, "forbidden", "An account keeps at least one portfolio.");
      }
      const contents = portfolioContents[row.id];
      if (contents && (contents.holdings || contents.transactions)) {
        return fail(
          response,
          403,
          "forbidden",
          `This portfolio still holds ${contents.holdings} position(s) and ${contents.transactions} transaction(s).`,
        );
      }
      portfolios.splice(portfolios.indexOf(row), 1);
      const remaining = portfolios.filter((item) => item.user_id === userId);
      if (remaining.length && !remaining.some((item) => item.is_default)) {
        remaining[0]!.is_default = true;
      }
      return ok(response, { portfolios: remaining.map(publicPortfolioView) });
    }
    return fail(response, 404, "not_found", `No route for ${method} ${route}.`);
  }

  if (route === "admin/releases") {
    if (!requires("releases:read-status")) return;
    return ok(response, {
      generated_at: iso(0),
      release_management: {
        configured: true,
        publish_enabled: true,
        rollback_enabled: true,
        requires_https_url: true,
        requires_checksum: true,
        requires_server_signature: true,
        status: "console",
      },
    });
  }
  if (route === "admin/audit-events")
    return ok(response, { event: { id: randomUUID() }, replayed: false });

  fail(response, 404, "not_found", `No route for ${method} ${route}.`);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `mock account api listening on http://127.0.0.1:${PORT}/api/v1 (degraded: ${[...DEGRADED].join(", ") || "none"})`,
  );
});
