const mocks = vi.hoisted(() => ({
  postAccountApiJson: vi.fn(),
}));

vi.mock("@/lib/admin/account-api", () => {
  class AccountApiUnavailableError extends Error {}
  class AccountApiRequestError extends Error {}
  return {
    AccountApiRequestError,
    AccountApiUnavailableError,
    postAccountApiJson: mocks.postAccountApiJson,
  };
});

import {
  endCurrentAccountApiSession,
  heartbeatAccountApiSession,
  heartbeatCurrentAccountApiSession,
  registerCurrentAccountApiSession,
} from "@/lib/account/session-lifecycle";

function azureWithToken(accessToken: string | null) {
  return {
    getUser: vi.fn(async () => (accessToken ? { id: "user-1", email: "test@example.com" } : null)),
    getAccessToken: vi.fn(() => accessToken),
  };
}

describe("Account API session lifecycle hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers the completed portal session with a server-generated idempotency key", async () => {
    mocks.postAccountApiJson.mockResolvedValue({ ok: true });
    const azure = azureWithToken(" bearer-token ");

    await expect(registerCurrentAccountApiSession(azure)).resolves.toBe(true);

    expect(mocks.postAccountApiJson).toHaveBeenCalledWith(
      "sessions/register",
      "bearer-token",
      { source: "portal", device_name: "Web portal" },
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^portal-/u) }),
    );
  });

  it("ends the current portal session before provider sign-out when a token exists", async () => {
    mocks.postAccountApiJson.mockResolvedValue({ ok: true });
    const azure = azureWithToken("bearer-token");

    await expect(endCurrentAccountApiSession(azure)).resolves.toBe(true);

    expect(mocks.postAccountApiJson).toHaveBeenCalledWith(
      "sessions/end",
      "bearer-token",
      { reason: "signed-out" },
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^portal-/u) }),
    );
  });

  it("returns false when no token is available for register", async () => {
    const azure = azureWithToken(null);
    await expect(registerCurrentAccountApiSession(azure)).resolves.toBe(false);
    expect(mocks.postAccountApiJson).not.toHaveBeenCalled();
  });

  it("returns false when no token is available for end", async () => {
    const azure = azureWithToken(null);
    await expect(endCurrentAccountApiSession(azure)).resolves.toBe(false);
    expect(mocks.postAccountApiJson).not.toHaveBeenCalled();
  });

  it("sends a heartbeat with a trimmed token", async () => {
    mocks.postAccountApiJson.mockResolvedValue({ ok: true });
    await expect(heartbeatAccountApiSession(" token ")).resolves.toBe(true);
    expect(mocks.postAccountApiJson).toHaveBeenCalledWith(
      "sessions/heartbeat",
      "token",
      { device_name: "Web portal" },
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^portal-/u) }),
    );
  });

  it("returns false on heartbeat with empty token", async () => {
    await expect(heartbeatAccountApiSession("  ")).resolves.toBe(false);
    expect(mocks.postAccountApiJson).not.toHaveBeenCalled();
  });

  it("heartbeats current session from azure reader", async () => {
    mocks.postAccountApiJson.mockResolvedValue({ ok: true });
    const azure = azureWithToken("bearer-token");
    await expect(heartbeatCurrentAccountApiSession(azure)).resolves.toBe(true);
  });
});
