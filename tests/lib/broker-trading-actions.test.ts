import { INITIAL_BROKER_ACTION_STATE } from "@/lib/account/broker-input";
import { INITIAL_KILL_SWITCH_STATE } from "@/lib/account/kill-switch";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  engageAccountApiKillSwitch: vi.fn(),
  requestAccountApiStepUp: vi.fn(),
  resumeAccountApiTrading: vi.fn(),
  revokeAccountApiBrokerAuthorisation: vi.fn(),
  requireMutationAssurance: vi.fn(),
  requireSameOriginServerAction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/admin/account-api", async () => ({
  ...(await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api")),
  engageAccountApiKillSwitch: mocks.engageAccountApiKillSwitch,
  requestAccountApiStepUp: mocks.requestAccountApiStepUp,
  resumeAccountApiTrading: mocks.resumeAccountApiTrading,
  revokeAccountApiBrokerAuthorisation: mocks.revokeAccountApiBrokerAuthorisation,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({
  requireMutationAssurance: mocks.requireMutationAssurance,
}));
vi.mock("@/lib/security/action-origin", () => ({
  requireSameOriginServerAction: mocks.requireSameOriginServerAction,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  engageKillSwitch,
  resumeTrading,
  revokeStandingAuthorisation,
} from "@/app/account/brokers/actions";
import { ACCESS_DECLINED_MESSAGE, ACCESS_PENDING_MESSAGE } from "@/lib/account/access";
import { AccountApiRequestError, AccountApiUnavailableError } from "@/lib/admin/account-api";

const CONNECTION = "5c1f7b90-0a2e-4f3b-9d61-7c2a4e6b8d01";
const PRESS = "0f8e2d9c-4b1a-4c3d-9e8f-7a6b5c4d3e2f";
const PASSWORD = "correct horse battery staple";
const GRANT = "grant-that-must-never-reach-the-browser";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function apiError(
  status: number,
  code: string,
  details: Record<string, unknown> = {},
  message = "server-authored refusal",
): AccountApiRequestError {
  return new AccountApiRequestError({ status, code, message, correlationId: null, details });
}

const sweep = {
  ok: true as const,
  correlation_id: "qt",
  trading_halted: true,
  halted_at: "2026-10-05T21:05:36Z",
  already_halted: false,
  connections_switched_off: 1,
  authorisations_revoked: 0,
  cancelled: 1,
  in_flight: 0,
  in_flight_known: true,
  complete: true,
  connections: [
    {
      connection_id: CONNECTION,
      broker: "alpaca",
      paper: false,
      trading_enabled: false,
      working_orders: 1,
      cancels: [
        {
          connection_id: CONNECTION,
          broker_order_id: "ord-1",
          client_order_id: "qt-1",
          symbol: "AAPL",
          outcome: "cancel_requested" as const,
          broker_status: "new",
          broker_message: "",
          requested_at: "2026-10-05T21:05:36Z",
          recorded: true,
        },
      ],
      record_failures: [],
      complete: true,
      in_flight: [],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => "console-token" });
  mocks.requireMutationAssurance.mockResolvedValue({ decision: "satisfied" });
  mocks.requireSameOriginServerAction.mockResolvedValue(undefined);
  mocks.requestAccountApiStepUp.mockResolvedValue({
    ok: true,
    correlation_id: "qt",
    step_up: {
      grant: GRANT,
      purpose: "resume",
      expires_at: "2026-10-05T21:10:36Z",
      single_use: true,
      max_uses: 1,
      connection_id: null,
    },
  });
});

describe("engageKillSwitch", () => {
  it("sends the press's own key as the Idempotency-Key, and the reason", async () => {
    mocks.engageAccountApiKillSwitch.mockResolvedValue(sweep);

    const state = await engageKillSwitch(
      INITIAL_KILL_SWITCH_STATE,
      form({ press_key: PRESS, reason: "  runaway   strategy " }),
    );

    expect(mocks.engageAccountApiKillSwitch).toHaveBeenCalledWith(
      "console-token",
      { reason: "runaway strategy" },
      { idempotencyKey: `portal-kill-${PRESS}` },
    );
    expect(state.status).toBe("success");
    expect(state.result?.complete).toBe(true);
    expect(state.message).toMatch(/every working order was cancelled/u);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/brokers");
  });

  it("asks for no second factor: stopping must never be harder than doing nothing", async () => {
    mocks.engageAccountApiKillSwitch.mockResolvedValue(sweep);
    mocks.requireMutationAssurance.mockResolvedValue({ decision: "challenge-required" });

    const state = await engageKillSwitch(INITIAL_KILL_SWITCH_STATE, form({ press_key: PRESS }));

    expect(state.status).toBe("success");
    expect(mocks.requireMutationAssurance).not.toHaveBeenCalled();
  });

  it("makes its own key when the browser sent none that looks like one", async () => {
    mocks.engageAccountApiKillSwitch.mockResolvedValue(sweep);

    await engageKillSwitch(INITIAL_KILL_SWITCH_STATE, form({ press_key: "not a key" }));

    const options = mocks.engageAccountApiKillSwitch.mock.calls[0]?.[2] as {
      idempotencyKey: string;
    };
    expect(options.idempotencyKey).toMatch(/^portal-kill-[0-9a-f-]{36}$/u);
    expect(options.idempotencyKey).not.toContain("not a key");
  });

  it("tells the person to press again, or go to the broker, when it could not be reached", async () => {
    mocks.engageAccountApiKillSwitch.mockRejectedValue(new AccountApiUnavailableError());

    const state = await engageKillSwitch(INITIAL_KILL_SWITCH_STATE, form({ press_key: PRESS }));

    expect(state).toMatchObject({ status: "error", result: null });
    expect(state.message).toMatch(/a second press is safe/u);
    expect(state.message).toMatch(/revoke the key at your broker/u);
  });

  it("says the access sentence if the service holds the account back", async () => {
    mocks.engageAccountApiKillSwitch.mockRejectedValue(apiError(403, "access_declined"));

    const state = await engageKillSwitch(INITIAL_KILL_SWITCH_STATE, form({ press_key: PRESS }));

    expect(state.message).toBe(ACCESS_DECLINED_MESSAGE);
  });
});

describe("resumeTrading", () => {
  const connectionForm = () =>
    form({
      scope: "connection",
      connection_id: CONNECTION,
      connection_name: "Live desk",
      password: PASSWORD,
    });

  it("steps up with the password, then resumes the connection with the grant", async () => {
    mocks.resumeAccountApiTrading.mockResolvedValue({
      ok: true,
      correlation_id: "qt",
      resumed: true,
      scope: "connection",
      message: "Connected.",
      trading_halted: false,
      connections_still_halted: 0,
    });

    const state = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());

    expect(mocks.requestAccountApiStepUp).toHaveBeenCalledWith(
      "console-token",
      { password: PASSWORD, purpose: "resume" },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(mocks.resumeAccountApiTrading).toHaveBeenCalledWith(
      "console-token",
      { connection_id: CONNECTION, step_up: GRANT },
      expect.anything(),
    );
    expect(state).toEqual({ status: "success", message: "Trading is back on for Live desk." });
    // Neither the password nor the grant may travel back to the browser.
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
    expect(JSON.stringify(state)).not.toContain(GRANT);
  });

  it("lifts the account's halt and says which connections stay off", async () => {
    mocks.resumeAccountApiTrading.mockResolvedValue({
      ok: true,
      correlation_id: "qt",
      resumed: true,
      scope: "account",
      trading_halted: false,
      connections_still_halted: 2,
    });

    const state = await resumeTrading(
      INITIAL_BROKER_ACTION_STATE,
      form({ scope: "account", password: PASSWORD }),
    );

    expect(mocks.resumeAccountApiTrading).toHaveBeenCalledWith(
      "console-token",
      { scope: "account", step_up: GRANT },
      expect.anything(),
    );
    expect(state.message).toBe(
      "The account's halt is lifted. 2 connections the kill switch switched off stay off until each is resumed.",
    );
  });

  it("says the account stays halted while other connections are still off", async () => {
    mocks.resumeAccountApiTrading.mockResolvedValue({
      ok: true,
      correlation_id: "qt",
      resumed: true,
      scope: "connection",
      trading_halted: true,
      connections_still_halted: 1,
    });

    const state = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());

    expect(state.message).toBe(
      "Trading is back on for Live desk. The account stays halted until the other 1 connection is resumed.",
    );
  });

  it("reports a failed connection test in the broker's words, and trading stays off", async () => {
    mocks.resumeAccountApiTrading.mockResolvedValue({
      ok: true,
      correlation_id: "qt",
      resumed: false,
      reason: "broker_test_failed",
      scope: "connection",
      message: "The broker rejected these credentials.",
      trading_halted: true,
    });

    const state = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());

    expect(state).toEqual({
      status: "error",
      message: "The broker rejected these credentials. Trading stays off for Live desk.",
    });
  });

  it("asks for the password again when the kill switch was pressed while the resume ran", async () => {
    mocks.resumeAccountApiTrading.mockResolvedValue({
      ok: true,
      correlation_id: "qt",
      resumed: false,
      reason: "kill_switch_pressed_during_resume",
      scope: "connection",
      trading_halted: true,
      message:
        "The kill switch was pressed during the resume, so trading stays off. Resume again when you are ready.",
    });

    const state = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());

    // The grant was spent on the refused resume, so the answer says the password is needed.
    expect(state).toEqual({
      status: "error",
      message:
        "The kill switch was pressed during the resume, so trading stays off. Enter your password again when you are ready to resume.",
    });
  });

  it("words a refusal by its code, never by which fields happen to be present", async () => {
    // A broker test failure that also names its scope is still a broker test failure.
    mocks.resumeAccountApiTrading.mockResolvedValueOnce({
      ok: true,
      correlation_id: "qt",
      resumed: false,
      reason: "broker_test_failed",
      scope: "account",
      message: "Key expired.",
      trading_halted: true,
    });
    const tested = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());
    expect(tested.message).toBe("Key expired. Trading stays off for Live desk.");

    // A code this console does not know yet is shown by the service's own message.
    mocks.resumeAccountApiTrading.mockResolvedValueOnce({
      ok: true,
      correlation_id: "qt",
      resumed: false,
      reason: "something_new",
      message: "A new refusal, worded by the service.",
      trading_halted: true,
    });
    const unknown = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());
    expect(unknown).toEqual({ status: "error", message: "A new refusal, worded by the service." });
  });

  it("tells a wrong password apart from an ended session", async () => {
    mocks.requestAccountApiStepUp.mockRejectedValueOnce(
      apiError(401, "unauthenticated", { reason: "invalid credentials" }),
    );
    const wrong = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());
    expect(wrong.message).toBe("That password is not correct. Nothing was changed.");

    mocks.requestAccountApiStepUp.mockRejectedValueOnce(apiError(401, "session_invalid"));
    const ended = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());
    expect(ended.message).toMatch(/Sign in again/u);
    expect(mocks.resumeAccountApiTrading).not.toHaveBeenCalled();
  });

  it("says to wait when wrong passwords have used up the sign-in limit", async () => {
    mocks.requestAccountApiStepUp.mockRejectedValue(
      apiError(429, "rate_limited", { retry_after_seconds: 240 }),
    );

    const state = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());

    expect(state.message).toBe("Too many attempts. Wait about 4 minutes before trying again.");
  });

  it("refuses without a password, before anything is sent", async () => {
    const data = connectionForm();
    data.delete("password");

    const state = await resumeTrading(INITIAL_BROKER_ACTION_STATE, data);

    expect(state.status).toBe("error");
    expect(mocks.requestAccountApiStepUp).not.toHaveBeenCalled();
  });

  it("is held back by the second-factor gate like every other way of turning trading on", async () => {
    mocks.requireMutationAssurance.mockResolvedValue({ decision: "challenge-required" });

    const state = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());

    expect(state.status).toBe("error");
    expect(mocks.requestAccountApiStepUp).not.toHaveBeenCalled();
  });

  it("says the access sentence when the account is held", async () => {
    mocks.requestAccountApiStepUp.mockRejectedValue(apiError(403, "access_pending"));

    const state = await resumeTrading(INITIAL_BROKER_ACTION_STATE, connectionForm());

    expect(state.message).toBe(ACCESS_PENDING_MESSAGE);
  });
});

describe("revokeStandingAuthorisation", () => {
  const id = "a1b2c3d4-0000-4000-8000-000000000001";

  it("revokes by id with no second factor, and says orders under it stop", async () => {
    mocks.requireMutationAssurance.mockResolvedValue({ decision: "challenge-required" });
    mocks.revokeAccountApiBrokerAuthorisation.mockResolvedValue({ id, state: "revoked" });

    const state = await revokeStandingAuthorisation(
      INITIAL_BROKER_ACTION_STATE,
      form({ authorisation_id: id, strategy: "Mean reversion" }),
    );

    expect(mocks.revokeAccountApiBrokerAuthorisation).toHaveBeenCalledWith(
      "console-token",
      id,
      {},
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(state.status).toBe("success");
    expect(state.message).toMatch(/Mean reversion stop at once/u);
  });

  it("refuses an id that is not one, and explains one that has gone", async () => {
    const bad = await revokeStandingAuthorisation(
      INITIAL_BROKER_ACTION_STATE,
      form({ authorisation_id: "../../admin" }),
    );
    expect(bad.status).toBe("error");
    expect(mocks.revokeAccountApiBrokerAuthorisation).not.toHaveBeenCalled();

    mocks.revokeAccountApiBrokerAuthorisation.mockRejectedValue(apiError(404, "not_found"));
    const gone = await revokeStandingAuthorisation(
      INITIAL_BROKER_ACTION_STATE,
      form({ authorisation_id: id }),
    );
    expect(gone.message).toMatch(/no longer exists/u);
  });
});
