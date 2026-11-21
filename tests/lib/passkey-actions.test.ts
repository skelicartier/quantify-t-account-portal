const mocks = vi.hoisted(() => {
  class AccountApiRequestError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(status: number, code: string, details: Record<string, unknown> = {}) {
      super(code);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }
  return {
    AccountApiRequestError,
    requireSameOriginServerAction: vi.fn(),
    portalOrigin: vi.fn(),
    createServerAzureClient: vi.fn(),
    revalidatePath: vi.fn(),
    requestRegistration: vi.fn(),
    completeRegistration: vi.fn(),
    requestChallenge: vi.fn(),
    verify: vi.fn(),
    remove: vi.fn(),
  };
});

vi.mock("@/lib/security/action-origin", () => ({
  requireSameOriginServerAction: mocks.requireSameOriginServerAction,
  portalOrigin: mocks.portalOrigin,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/account-api", () => ({
  AccountApiRequestError: mocks.AccountApiRequestError,
  requestAccountApiPasskeyRegistration: mocks.requestRegistration,
  completeAccountApiPasskeyRegistration: mocks.completeRegistration,
  requestAccountApiPasskeyChallenge: mocks.requestChallenge,
  verifyAccountApiPasskey: mocks.verify,
  removeAccountApiPasskey: mocks.remove,
}));

import {
  beginPasskeyRegistration,
  beginPasskeyVerification,
  finishPasskeyRegistration,
  finishPasskeyVerification,
  removePasskey,
} from "@/app/account/security/passkey-actions";

const ORIGIN = "https://console.example.test";
const PASSKEY_ID = "0b6f8a52-1111-4222-8333-444455556666";
const CREDENTIAL = { id: "cred", response: { clientDataJSON: "a", attestationObject: "b" } };

function refusal(status: number, code: string, details: Record<string, unknown> = {}) {
  return new mocks.AccountApiRequestError(status, code, details);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSameOriginServerAction.mockResolvedValue(undefined);
  mocks.portalOrigin.mockReturnValue(ORIGIN);
  mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => "access-token" });
  mocks.requestRegistration.mockResolvedValue({ public_key: { challenge: "c1" } });
  mocks.requestChallenge.mockResolvedValue({ public_key: { challenge: "c2" } });
  mocks.completeRegistration.mockResolvedValue({});
  mocks.verify.mockResolvedValue({});
  mocks.remove.mockResolvedValue({});
});

describe("adding a passkey", () => {
  it("sends the password with the console's own address, never one the browser names", async () => {
    const result = await beginPasskeyRegistration("correct horse");

    expect(result).toEqual({ status: "ok", value: { challenge: "c1" } });
    expect(mocks.requestRegistration).toHaveBeenCalledWith(
      "access-token",
      { password: "correct horse", origin: ORIGIN },
      { idempotencyKey: expect.stringMatching(/^portal-[0-9a-f-]{36}$/u) },
    );
  });

  it.each([[""], [undefined], [42], ["x".repeat(2000)]])(
    "asks for the password before asking the service anything (%s)",
    async (password) => {
      const result = await beginPasskeyRegistration(password);

      expect(result).toMatchObject({ status: "error", reason: "password" });
      expect(mocks.requestRegistration).not.toHaveBeenCalled();
    },
  );

  it("stores what the device made under a trimmed, bounded name", async () => {
    const result = await finishPasskeyRegistration(`  Work laptop ${"x".repeat(200)}`, CREDENTIAL);

    expect(result).toEqual({ status: "ok", value: null });
    const body = mocks.completeRegistration.mock.calls[0]![1] as { name: string };
    expect(body.name.startsWith("Work laptop")).toBe(true);
    expect(body.name.length).toBe(80);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/security");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it.each([[null], ["text"], [[1, 2]], [{ blob: "x".repeat(30_000) }]])(
    "passes nothing on that is not a credential of a sane size (%#)",
    async (credential) => {
      const result = await finishPasskeyRegistration("Laptop", credential);

      expect(result.status).toBe("error");
      expect(mocks.completeRegistration).not.toHaveBeenCalled();
    },
  );
});

describe("what each refusal says", () => {
  it.each([
    [refusal(401, "unauthenticated", { reason: "invalid credentials" }), "password", /not correct/u],
    [refusal(401, "unauthenticated", { reason: "token expired" }), "signed-out", /sign in again/iu],
    [refusal(429, "rate_limited", { retry_after_seconds: 60 }), "rate-limited", /too many attempts/iu],
    [refusal(403, "second_factor_required", { second_factor: "passkey", fresh: true }), "needs-passkey", /already has/u],
    [refusal(403, "second_factor_required", { second_factor: "enrol" }), "needs-enrolment", /add a passkey/iu],
    [refusal(400, "malformed_request", { origin: "not a console address" }), "address", /this address/u],
    [refusal(400, "malformed_request", { challenge: "expired" }), "expired", /start again/iu],
    [refusal(400, "malformed_request", { passkeys: "an account holds at most 10" }), "refused", /remove one first/iu],
    [refusal(403, "forbidden", { session: "no session" }), "signed-out", /sign in again/iu],
    [refusal(403, "forbidden", { passkey: "that passkey did not verify" }), "refused", /not accepted/u],
    [refusal(503, "upstream_unavailable"), "unavailable", /temporarily unavailable/u],
    [new Error("socket hang up"), "unavailable", /temporarily unavailable/u],
  ])("%o", async (failure, reason, message) => {
    mocks.requestRegistration.mockRejectedValue(failure);

    const result = await beginPasskeyRegistration("pw");

    expect(result).toMatchObject({ status: "error", reason });
    expect((result as { message: string }).message).toMatch(message);
  });

  it("never repeats the service's own words, which may name internals", async () => {
    mocks.verify.mockRejectedValue(
      refusal(403, "forbidden", { passkey: "the sign count did not move forward; a cloned key?" }),
    );

    const result = await finishPasskeyVerification(CREDENTIAL);

    expect((result as { message: string }).message).not.toMatch(/sign count|cloned/u);
  });
});

describe("proving and removing", () => {
  it("asks for a challenge for the console's own address", async () => {
    await expect(beginPasskeyVerification()).resolves.toEqual({
      status: "ok",
      value: { challenge: "c2" },
    });
    expect(mocks.requestChallenge.mock.calls[0]![1]).toEqual({ origin: ORIGIN });
  });

  it("says an account with no passkey has none, rather than that the service is down", async () => {
    mocks.requestChallenge.mockRejectedValue(refusal(404, "not_found", { passkeys: "none" }));

    await expect(beginPasskeyVerification()).resolves.toMatchObject({ reason: "needs-enrolment" });
  });

  it("carries the device's answer back and refreshes what the pages show", async () => {
    await expect(finishPasskeyVerification(CREDENTIAL)).resolves.toEqual({ status: "ok", value: null });
    expect(mocks.verify.mock.calls[0]![1]).toEqual({ credential: CREDENTIAL });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/passkey");
  });

  it("removes only a well-formed id, and reports a missing one plainly", async () => {
    await expect(removePasskey("1 OR 1=1")).resolves.toMatchObject({ status: "error" });
    expect(mocks.remove).not.toHaveBeenCalled();

    await expect(removePasskey(PASSKEY_ID)).resolves.toEqual({ status: "ok", value: null });
    expect(mocks.remove.mock.calls[0]![1]).toEqual({ passkey_id: PASSKEY_ID });

    mocks.remove.mockRejectedValue(refusal(404, "not_found", { passkey: "unknown" }));
    await expect(removePasskey(PASSKEY_ID)).resolves.toMatchObject({ reason: "refused" });
  });
});

describe("who may call these at all", () => {
  it("refuses a request that did not come from the console's own pages", async () => {
    mocks.requireSameOriginServerAction.mockRejectedValue(new Error("cross-origin"));

    await expect(beginPasskeyRegistration("pw")).resolves.toMatchObject({ status: "error" });
    await expect(finishPasskeyVerification(CREDENTIAL)).resolves.toMatchObject({ status: "error" });
    await expect(removePasskey(PASSKEY_ID)).resolves.toMatchObject({ status: "error" });
    expect(mocks.requestRegistration).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["no session", null, ORIGIN],
    ["no configured address", "access-token", null],
  ])("does nothing with %s", async (_label, token, origin) => {
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => token });
    mocks.portalOrigin.mockReturnValue(origin);

    await expect(beginPasskeyVerification()).resolves.toMatchObject({ reason: "signed-out" });
    expect(mocks.requestChallenge).not.toHaveBeenCalled();
  });
});
