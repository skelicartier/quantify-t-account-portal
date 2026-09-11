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
import { randomUUID } from "node:crypto";

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
  ],
  support: ["account:read-self", "account:read-any", "audit:read", "audit:write"],
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

function fail(response: ServerResponse, status: number, code: string, message: string) {
  send(response, status, { ok: false, correlation_id: correlation(), error: { code, message } });
}

function ok(response: ServerResponse, payload: Record<string, unknown>, status = 200) {
  send(response, status, { ok: true, correlation_id: correlation(), ...payload });
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

function bearer(request: IncomingMessage): string | null {
  const header = String(request.headers.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const userId = tokens.get(token);
  return userId ?? null;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  const route = url.pathname.replace(/^\/api\/v1\/?/u, "").replace(/\/+$/u, "");
  const method = request.method ?? "GET";
  const body = method === "POST" ? await readBody(request) : "";
  const json = body ? (JSON.parse(body) as Record<string, unknown>) : {};

  if (DEGRADED.has(route)) {
    fail(response, 503, "upstream_unavailable", "A dependency is unavailable. Please retry.");
    return;
  }

  // ---- auth ---------------------------------------------------------------------
  if (route === "health") return ok(response, { status: "ok", environment: "mock" });
  if (route === "auth/login") {
    const email = String(json.email ?? "");
    const p = PEOPLE.find((candidate) => candidate.email === email.toLowerCase());
    if (!p)
      return fail(
        response,
        401,
        "invalid_credentials",
        "Unable to sign in with those credentials.",
      );
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

  const userId = bearer(request);
  if (!userId) return fail(response, 401, "unauthenticated", "A bearer token is required.");
  const persona = roles[userId] ?? "user";
  const me = person(userId);

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
    const events = PEOPLE.flatMap((p, index) =>
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
    ).filter((event) => !filters.event_type || event.event_type === filters.event_type);
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
    row_count: status === "ready" ? 1204 : 0,
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
  if (route === "admin/releases") {
    if (!requires("releases:read-status")) return;
    return ok(response, {
      generated_at: iso(0),
      release_management: {
        configured: false,
        publish_enabled: false,
        rollback_enabled: false,
        requires_https_url: true,
        requires_checksum: true,
        requires_server_signature: true,
        status: "source-locked",
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
