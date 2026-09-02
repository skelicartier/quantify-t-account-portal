const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACCESS_TOKEN = "recovery-access-token";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  clearPortalSupabaseAuthCookies: vi.fn(),
  issueRecoveryAuthorization: vi.fn(),
  clearRecoveryAuthorization: vi.fn(),
  getSupabasePublicConfiguration: vi.fn(() => ({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_test_value",
    siteUrl: "https://account.quantifyterminal.com",
    turnstileSiteKey: "turnstile-public-value",
    cookieOptions: { name: "sb-project-auth-token", secure: true },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  clearPortalSupabaseAuthCookies: mocks.clearPortalSupabaseAuthCookies,
}));
vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicConfiguration: mocks.getSupabasePublicConfiguration,
}));
vi.mock("@/lib/auth/recovery-authorization", () => ({
  issueRecoveryAuthorization: mocks.issueRecoveryAuthorization,
  clearRecoveryAuthorization: mocks.clearRecoveryAuthorization,
}));

import { GET } from "@/app/auth/confirm/route";

function exchangeResult(redirectType: "recovery" | null | undefined) {
  const data: Record<string, unknown> = {
    session: { access_token: ACCESS_TOKEN },
    user: { id: USER_ID },
  };
  if (redirectType !== undefined) data.redirectType = redirectType;
  return { data, error: null };
}

function installClient(result: ReturnType<typeof exchangeResult>) {
  const exchangeCodeForSession = vi.fn().mockResolvedValue(result);
  const signOut = vi.fn().mockResolvedValue({ error: null });
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { exchangeCodeForSession, signOut },
  });
  return { exchangeCodeForSession, signOut };
}

const failureLocation = "https://account.quantifyterminal.com/login?notice=invalid-auth-link";

describe("authentication confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.issueRecoveryAuthorization.mockResolvedValue(undefined);
    mocks.clearRecoveryAuthorization.mockResolvedValue(undefined);
    mocks.clearPortalSupabaseAuthCookies.mockResolvedValue(undefined);
  });

  it("accepts signup only when the exchange reports a non-recovery redirect", async () => {
    const { exchangeCodeForSession } = installClient(exchangeResult(null));

    const response = await GET(
      new Request("https://evil.example/auth/confirm?code=one-time-code&flow=signup&next=/admin"),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://account.quantifyterminal.com/account");
    expect(mocks.issueRecoveryAuthorization).not.toHaveBeenCalled();
    expect(mocks.clearRecoveryAuthorization).toHaveBeenCalledOnce();
  });

  it("issues a bound marker only for a trusted recovery exchange", async () => {
    installClient(exchangeResult("recovery"));

    const response = await GET(
      new Request(
        "https://account.quantifyterminal.com/auth/confirm?code=recovery-code&flow=recovery",
      ),
    );

    expect(mocks.issueRecoveryAuthorization).toHaveBeenCalledWith({
      userId: USER_ID,
      accessToken: ACCESS_TOKEN,
      secure: true,
    });
    expect(mocks.clearRecoveryAuthorization).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://account.quantifyterminal.com/reset-password",
    );
  });

  it.each([
    ["recovery", null],
    ["signup", "recovery"],
    ["recovery", undefined],
  ] as const)(
    "rejects %s when trusted redirect type is %s and clears the exchanged session",
    async (flow, redirectType) => {
      const { signOut } = installClient(exchangeResult(redirectType));

      const response = await GET(
        new Request(`https://account.quantifyterminal.com/auth/confirm?code=code&flow=${flow}`),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(failureLocation);
      expect(mocks.issueRecoveryAuthorization).not.toHaveBeenCalled();
      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(mocks.clearPortalSupabaseAuthCookies).toHaveBeenCalledOnce();
      expect(mocks.clearRecoveryAuthorization).toHaveBeenCalledOnce();
    },
  );

  it.each([
    "https://evil.example/auth/confirm?flow=signup",
    "https://evil.example/auth/confirm?code=first&code=second&flow=signup",
    "https://evil.example/auth/confirm?code=code&flow=unknown",
    "https://evil.example/auth/confirm?token_hash=token&type=signup",
  ])("sends malformed links to one canonical generic failure route", async (url) => {
    const exchangeCodeForSession = vi.fn();
    mocks.createServerSupabaseClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

    const response = await GET(new Request(url));

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(failureLocation);
  });

  it("uses the same generic route for expired or rejected codes", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "flow_state_expired", message: "Sensitive provider detail" },
    });
    mocks.createServerSupabaseClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

    const response = await GET(
      new Request("https://account.quantifyterminal.com/auth/confirm?code=expired&flow=recovery"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(failureLocation);
    expect(JSON.stringify([...response.headers])).not.toContain("Sensitive provider detail");
  });

  it("clears the exchanged session if recovery marker issuance fails", async () => {
    const { signOut } = installClient(exchangeResult("recovery"));
    mocks.issueRecoveryAuthorization.mockRejectedValue(new Error("cookie write failed"));

    const response = await GET(
      new Request("https://account.quantifyterminal.com/auth/confirm?code=code&flow=recovery"),
    );

    expect(response.headers.get("location")).toBe(failureLocation);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.clearPortalSupabaseAuthCookies).toHaveBeenCalledOnce();
    expect(mocks.clearRecoveryAuthorization).toHaveBeenCalledOnce();
  });
});
