import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  engageAccountApiKillSwitch,
  fetchAccountApiAccountLifecycle,
  fetchAccountApiBrokerAuthorisations,
  fetchAccountApiBrokerConnections,
  fetchAccountApiMe,
  fetchAccountApiProfile,
  requestAccountApiAccountDeletion,
  requestAccountApiStepUp,
  resumeAccountApiTrading,
  revokeAccountApiBrokerAuthorisation,
  type AccountApiKillSwitch,
} from "@/lib/admin/account-api";
import { killSwitchHeadline, summariseKillSwitch } from "@/lib/account/kill-switch";

/**
 * The live-order gates, access by application and the erasure statement, as the console's
 * client reads them. Every payload here is the shape the service's handler builds — read
 * from `broker_routes.py`, `step_up.py`, `access.py` and `dto.py` — and the schemas are
 * `.strict()`, so a field the service sends that the console does not declare fails here
 * before it fails a page.
 */

const ENVIRONMENT = { QT_ACCOUNT_API_URL: "https://account-api.example.test/api/v1" };
const CONNECTION = "5c1f7b90-0a2e-4f3b-9d61-7c2a4e6b8d01";
type TestFetcher = (input: URL, init: RequestInit) => Promise<Response>;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetcherFor(payload: unknown, status = 200) {
  return vi.fn<TestFetcher>(async () => jsonResponse(payload, status));
}

function sent(fetcher: ReturnType<typeof fetcherFor>): { url: URL; init: RequestInit } {
  const call = fetcher.mock.calls[0];
  if (!call) throw new Error("no request was made");
  return { url: call[0], init: call[1] };
}

const connectionRow = {
  id: CONNECTION,
  broker: "alpaca",
  name: "Live desk",
  account_reference: "PA3XYZ",
  paper: false,
  is_active: true,
  credential_fingerprint: "cce6dbe02a53",
  credential_last_four: "XXXX",
  last_test_at: "2026-10-05T21:05:36Z",
  last_test_success: true,
  trading_enabled: false,
  trading_halted: true,
  last_error: "",
  created_at: "2026-10-05T21:05:36Z",
  updated_at: "2026-10-05T21:05:36Z",
};

const sweep = {
  ok: true,
  correlation_id: "qt-kill",
  trading_halted: true,
  halted_at: "2026-10-05T21:05:36Z",
  already_halted: false,
  connections_switched_off: 1,
  authorisations_revoked: 2,
  cancelled: 1,
  in_flight: 1,
  in_flight_known: true,
  complete: false,
  connections: [
    {
      connection_id: CONNECTION,
      broker: "alpaca",
      paper: false,
      trading_enabled: false,
      working_orders: 3,
      cancels: [
        {
          connection_id: CONNECTION,
          broker_order_id: "ord-1",
          client_order_id: "qt-1",
          symbol: "AAPL",
          outcome: "cancel_requested",
          broker_status: "new",
          broker_message: "",
          requested_at: "2026-10-05T21:05:36Z",
          recorded: true,
        },
        {
          connection_id: CONNECTION,
          broker_order_id: "ord-2",
          client_order_id: "qt-2",
          symbol: "MSFT",
          outcome: "refused",
          broker_status: "filled",
          broker_message: "order is already filled",
          requested_at: "2026-10-05T21:05:36Z",
          recorded: false,
        },
        {
          connection_id: CONNECTION,
          broker_order_id: "ord-3",
          client_order_id: "qt-3",
          symbol: "NVDA",
          outcome: "already_cancelling",
          broker_status: "pending_cancel",
          broker_message: "The broker is already cancelling this order.",
          requested_at: "2026-10-05T21:05:36Z",
          recorded: true,
        },
      ],
      record_failures: [{ broker_order_id: "ord-2", outcome: "refused" }],
      complete: false,
      in_flight: [
        {
          id: "9a1b2c3d-0000-4000-8000-000000000001",
          connection_id: CONNECTION,
          client_order_id: "qt-4",
          symbol: "TSLA",
          side: "buy",
          quantity: 5,
          order_type: "market",
          limit_price: null,
          stop_price: null,
          time_in_force: "day",
          paper: false,
          estimated_value: 1250,
          state: "submitted",
          broker_order_id: "",
          broker_message: "",
          submitted_at: "2026-10-05T21:05:30Z",
          settled_at: null,
          confirmation_basis: "typed",
          authorisation_id: "",
        },
      ],
    },
  ],
};

describe("step-up", () => {
  it("posts the password and purpose to auth/step-up and reads the grant", async () => {
    const fetcher = fetcherFor({
      ok: true,
      correlation_id: "qt-step",
      step_up: {
        grant: "g".repeat(43),
        purpose: "resume",
        expires_at: "2026-10-05T21:10:36Z",
        single_use: true,
        max_uses: 1,
        connection_id: null,
      },
    });

    const result = await requestAccountApiStepUp(
      "token",
      { password: "correct horse", purpose: "resume" },
      { idempotencyKey: "portal-step-1", environment: ENVIRONMENT, fetcher },
    );

    const { url, init } = sent(fetcher);
    expect(url.pathname).toBe("/api/v1/auth/step-up");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ password: "correct horse", purpose: "resume" });
    expect(result.step_up.grant).toBe("g".repeat(43));
    expect(result.step_up.single_use).toBe(true);
  });

  it("still reads the first shape of the answer, before grants carried their uses", async () => {
    const fetcher = fetcherFor({
      ok: true,
      correlation_id: "qt-step",
      step_up: { grant: "g", purpose: "arm", expires_at: "2026-10-05T21:10:36Z", single_use: true },
    });
    await expect(
      requestAccountApiStepUp(
        "token",
        { password: "x", purpose: "arm" },
        { idempotencyKey: "portal-step-2", environment: ENVIRONMENT, fetcher },
      ),
    ).resolves.toMatchObject({ step_up: { purpose: "arm" } });
  });

  it("surfaces a wrong password as the service's typed refusal", async () => {
    const fetcher = fetcherFor(
      {
        ok: false,
        correlation_id: "qt-step",
        error: {
          code: "unauthenticated",
          message: "A bearer token is required.",
          details: { reason: "invalid credentials" },
        },
      },
      401,
    );
    const failure = await requestAccountApiStepUp(
      "token",
      { password: "wrong", purpose: "resume" },
      { idempotencyKey: "portal-step-3", environment: ENVIRONMENT, fetcher },
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AccountApiRequestError);
    expect((failure as AccountApiRequestError).details.reason).toBe("invalid credentials");
  });
});

describe("the kill switch", () => {
  it("sends the press's own Idempotency-Key and the reason", async () => {
    const fetcher = fetcherFor(sweep);

    await engageAccountApiKillSwitch(
      "token",
      { reason: "runaway strategy" },
      { idempotencyKey: "portal-kill-abc", environment: ENVIRONMENT, fetcher },
    );

    const { url, init } = sent(fetcher);
    expect(url.pathname).toBe("/api/v1/me/brokers/kill-switch");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("portal-kill-abc");
    expect(JSON.parse(String(init.body))).toEqual({ reason: "runaway strategy" });
  });

  it("reads the full sweep, a replay and a press while the first is still sweeping", async () => {
    const options = { idempotencyKey: "k-12345678", environment: ENVIRONMENT };
    const full = await engageAccountApiKillSwitch(
      "t",
      {},
      { ...options, fetcher: fetcherFor(sweep) },
    );
    expect(full.connections?.[0]?.cancels).toHaveLength(3);

    const replay = await engageAccountApiKillSwitch(
      "t",
      {},
      { ...options, fetcher: fetcherFor({ ...sweep, replayed: true }) },
    );
    expect(replay.replayed).toBe(true);

    const running = await engageAccountApiKillSwitch(
      "t",
      {},
      {
        ...options,
        fetcher: fetcherFor({
          ok: true,
          correlation_id: "qt",
          trading_halted: true,
          halted_at: "2026-10-05T21:05:36Z",
          sweep_in_progress: true,
          complete: false,
        }),
      },
    );
    expect(running.sweep_in_progress).toBe(true);
  });

  it("refuses an answer carrying a field nobody declared", async () => {
    await expect(
      engageAccountApiKillSwitch(
        "t",
        {},
        {
          idempotencyKey: "k-12345678",
          environment: ENVIRONMENT,
          fetcher: fetcherFor({ ...sweep, api_key: "leak" }),
        },
      ),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
  });

  it("reduces the sweep to what the person who pressed it needs", () => {
    const result = summariseKillSwitch(sweep as AccountApiKillSwitch);
    const connection = result.connections[0]!;

    expect(connection.counts).toEqual({
      cancel_requested: 1,
      already_cancelling: 1,
      refused: 1,
      unreachable: 0,
    });
    expect(connection.problems).toEqual([
      { symbol: "MSFT", outcome: "refused", message: "order is already filled" },
    ]);
    expect(connection.inFlight).toEqual([
      { symbol: "TSLA", side: "buy", quantity: 5, clientOrderId: "qt-4" },
    ]);
    expect(connection.unrecorded).toBe(1);
    expect(result.authorisationsRevoked).toBe(2);
    expect(killSwitchHeadline(result)).toMatch(/not complete. Check your broker/u);
  });

  it("says plainly when nothing was left working, and when orders in flight could not be read", () => {
    const clean = summariseKillSwitch({
      ...(sweep as AccountApiKillSwitch),
      complete: true,
      connections: [],
    });
    expect(killSwitchHeadline(clean)).toBe(
      "Trading is halted. No working orders were found at any broker.",
    );

    const blind = summariseKillSwitch({
      ...(sweep as AccountApiKillSwitch),
      in_flight_known: false,
    });
    expect(killSwitchHeadline(blind)).toMatch(/could not be checked/u);

    const running = summariseKillSwitch({
      ok: true,
      correlation_id: "qt",
      trading_halted: true,
      halted_at: null,
      sweep_in_progress: true,
      complete: false,
    });
    expect(killSwitchHeadline(running)).toMatch(/still cancelling/u);
  });
});

describe("resume", () => {
  it("names one connection with the grant, or the account", async () => {
    const answer = {
      ok: true,
      correlation_id: "qt",
      resumed: true,
      scope: "connection",
      message: "Connected.",
      trading_halted: false,
      connections_still_halted: 0,
      connection: { ...connectionRow, trading_enabled: true, trading_halted: false },
    };
    const fetcher = fetcherFor(answer);
    const result = await resumeAccountApiTrading(
      "t",
      { connection_id: CONNECTION, step_up: "grant" },
      { idempotencyKey: "k-1", environment: ENVIRONMENT, fetcher },
    );
    expect(sent(fetcher).url.pathname).toBe("/api/v1/me/brokers/trading/resume");
    expect(JSON.parse(String(sent(fetcher).init.body))).toEqual({
      connection_id: CONNECTION,
      step_up: "grant",
    });
    expect(result.connection?.trading_halted).toBe(false);
  });

  it("reads the refusal for a kill switch pressed during the resume", async () => {
    const result = await resumeAccountApiTrading(
      "t",
      { scope: "account", step_up: "grant" },
      {
        idempotencyKey: "k-2",
        environment: ENVIRONMENT,
        fetcher: fetcherFor({
          ok: true,
          correlation_id: "qt",
          resumed: false,
          scope: "account",
          trading_halted: true,
          message:
            "The kill switch was pressed during the resume, so trading stays off. Resume again when you are ready.",
        }),
      },
    );
    expect(result).toMatchObject({ resumed: false, scope: "account", trading_halted: true });
  });
});

describe("standing authorisations", () => {
  const authorisation = {
    id: "a1b2c3d4-0000-4000-8000-000000000001",
    connection_id: CONNECTION,
    account: "PA3XYZ",
    broker: "alpaca",
    strategy: "Mean reversion",
    max_order_value: 5000,
    max_orders: 10,
    used_orders: 3,
    remaining: 7,
    expires_at: "2026-10-06T21:00:00Z",
    created_at: "2026-10-05T21:00:00Z",
    revoked_at: null,
    revoke_reason: "",
    state: "active",
  };

  it("lists them with a GET and revokes one with a POST to its own path", async () => {
    const list = fetcherFor({ ok: true, correlation_id: "qt", authorisations: [authorisation] });
    const listed = await fetchAccountApiBrokerAuthorisations("t", {
      environment: ENVIRONMENT,
      fetcher: list,
    });
    expect(sent(list).url.pathname).toBe("/api/v1/me/brokers/authorisations");
    expect(sent(list).init.method).toBe("GET");
    expect(listed.authorisations[0]?.state).toBe("active");

    const revoke = fetcherFor({
      ok: true,
      correlation_id: "qt",
      authorisation: { ...authorisation, state: "revoked", revoked_at: "2026-10-05T22:00:00Z" },
    });
    const revoked = await revokeAccountApiBrokerAuthorisation(
      "t",
      authorisation.id,
      {},
      { idempotencyKey: "k-3", environment: ENVIRONMENT, fetcher: revoke },
    );
    expect(sent(revoke).url.pathname).toBe(
      `/api/v1/me/brokers/authorisations/${authorisation.id}/revoke`,
    );
    expect(JSON.parse(String(sent(revoke).init.body))).toEqual({});
    expect(revoked.state).toBe("revoked");
  });
});

describe("the shapes this change touched", () => {
  it("reads each connection's halt and the account's", async () => {
    const result = await fetchAccountApiBrokerConnections("t", {
      environment: ENVIRONMENT,
      fetcher: fetcherFor({
        ok: true,
        correlation_id: "qt",
        connections: [connectionRow],
        implemented_brokers: ["alpaca", "upstox"],
        encryption_configured: true,
        trading_halted: true,
        halted_at: "2026-10-05T21:05:36Z",
      }),
    });
    expect(result.trading_halted).toBe(true);
    expect(result.connections[0]?.trading_halted).toBe(true);
  });

  it("reads a profile that carries its access status", async () => {
    const result = await fetchAccountApiProfile("t", {
      environment: ENVIRONMENT,
      fetcher: fetcherFor({
        ok: true,
        correlation_id: "qt",
        profile: {
          user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
          first_name: "Noor",
          last_name: "Haddad",
          email: "applicant@example.test",
          phone: "",
          country: "",
          is_admin: false,
          is_active: true,
          timezone: "UTC",
          default_currency: "USD",
          subscription_tier: "free",
          two_factor_enabled: false,
          notify_price_alerts: true,
          notify_portfolio_moves: false,
          notify_news_digest: true,
          data_refresh_rate: "realtime",
          theme_preference: "dark",
          profile_version: 1,
          created_at: "2026-10-05T21:00:00Z",
          last_login_at: "2026-10-05T21:00:00Z",
          updated_at: "2026-10-05T21:00:00Z",
          access_status: "pending",
        },
      }),
    });
    expect(result.profile.access_status).toBe("pending");
  });

  it("reads the erasure statement a deletion request answers with", async () => {
    const result = await requestAccountApiAccountDeletion(
      "t",
      { expected_revision: "rev", confirmation: "DELETE MY ACCOUNT" },
      {
        idempotencyKey: "k-4",
        environment: ENVIRONMENT,
        fetcher: fetcherFor(
          {
            ok: true,
            correlation_id: "qt",
            revision: "rev-2",
            deletion: {
              id: "25000000-0000-4000-8000-000000000001",
              status: "pending",
              requested_at: "2026-10-05T21:00:00Z",
              scheduled_delete_at: "2026-10-19T21:00:00Z",
              cancelled_at: "",
              completed_at: "",
              cooling_off_seconds: 1_209_600,
              can_cancel: true,
              legal_hold: false,
              hold_reason: "",
              cleanup: { sessions: "pending" },
              attempts: 0,
              max_attempts: 3,
              next_attempt_at: "",
              last_error: "",
              offline_desktop_cache_note: "not-remotely-deletable",
            },
            event: { id: "e1", event_type: "account.deletion_requested" },
            replayed: false,
            legacy_mirrored: true,
            erasure: { erased: "Every record is erased.", kept: ["A tombstone."] },
          },
          201,
        ),
      },
    );
    expect(result.erasure).toEqual({ erased: "Every record is erased.", kept: ["A tombstone."] });
  });
});

describe("the structured fields the console branches on", () => {
  it("reads the access status from me", async () => {
    const me = await fetchAccountApiMe("t", {
      environment: ENVIRONMENT,
      fetcher: fetcherFor({
        ok: true,
        correlation_id: "qt",
        user: {
          user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
          email: "applicant@example.test",
          is_active: true,
          access_status: "pending",
        },
        role: {
          effective: "user",
          database: "user",
          legacy: null,
          mismatch: "none",
          break_glass: false,
        },
        capabilities: ["account:read-self"],
        environment: "production",
      }),
    });
    expect(me.user.access_status).toBe("pending");
  });

  it("reads why and since when trading is off, for the account and each connection", async () => {
    const result = await fetchAccountApiBrokerConnections("t", {
      environment: ENVIRONMENT,
      fetcher: fetcherFor({
        ok: true,
        correlation_id: "qt",
        connections: [
          { ...connectionRow, halted_at: "2026-10-05T21:05:36Z", halt_reason: "account deletion" },
        ],
        implemented_brokers: ["alpaca"],
        encryption_configured: true,
        trading_halted: true,
        halted_at: "2026-10-05T21:05:36Z",
        halt_reason: "account deletion",
      }),
    });
    expect(result.halt_reason).toBe("account deletion");
    expect(result.connections[0]).toMatchObject({
      halted_at: "2026-10-05T21:05:36Z",
      halt_reason: "account deletion",
    });
  });

  it("reads each resume refusal's code, and null on success", async () => {
    const answer = (reason: string | null, resumed: boolean) =>
      resumeAccountApiTrading(
        "t",
        { scope: "account", step_up: "grant" },
        {
          idempotencyKey: "k-5",
          environment: ENVIRONMENT,
          fetcher: fetcherFor({
            ok: true,
            correlation_id: "qt",
            resumed,
            reason,
            scope: "account",
            trading_halted: !resumed,
            ...(resumed ? { connections_still_halted: 0 } : { message: "words" }),
          }),
        },
      );
    expect((await answer(null, true)).reason).toBeNull();
    expect((await answer("broker_test_failed", false)).reason).toBe("broker_test_failed");
    expect((await answer("kill_switch_pressed_during_resume", false)).reason).toBe(
      "kill_switch_pressed_during_resume",
    );
  });

  it("reads a deletion held for the brokers, with its cleanup step held", async () => {
    const held = {
      id: "25000000-0000-4000-8000-000000000001",
      status: "blocked",
      requested_at: "2026-10-05T21:00:00Z",
      scheduled_delete_at: "2026-10-19T21:00:00Z",
      cancelled_at: "",
      completed_at: "",
      cooling_off_seconds: 1_209_600,
      can_cancel: true,
      legal_hold: false,
      hold_reason: "",
      cleanup: {
        audit_tombstone: "pending",
        auth: "pending",
        azure: "pending",
        brokers: "held",
        documents: "complete",
        sessions: "complete",
        storage: "pending",
      },
      attempts: 0,
      max_attempts: 3,
      next_attempt_at: "2026-10-19T21:15:00Z",
      last_error: "waiting for the broker to confirm cancellation",
      hold: {
        code: "broker_cancellation",
        next_check_at: "2026-10-19T21:15:00Z",
        held_until: "2026-10-22T21:00:00Z",
      },
      offline_desktop_cache_note: "not-remotely-deletable",
    };
    const lifecycle = await fetchAccountApiAccountLifecycle("t", {
      environment: ENVIRONMENT,
      fetcher: fetcherFor({
        ok: true,
        correlation_id: "qt",
        revision: "rev",
        generated_at: "2026-10-19T21:05:00Z",
        export_queue: { job_limit: 50, returned: 0, per_user_limit: 3 },
        exports: [],
        deletion: { active: held, requests: [held] },
      }),
    });
    expect(lifecycle.deletion.active?.hold?.code).toBe("broker_cancellation");
    expect(lifecycle.deletion.active?.cleanup.brokers).toBe("held");
  });
});
