const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  azureFrom: vi.fn(),
  heartbeatCurrentAccountApiSession: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/dal/azure-sql-client", () => ({
  azureFrom: mocks.azureFrom,
}));
vi.mock("@/lib/account/session-lifecycle", () => ({
  heartbeatCurrentAccountApiSession: mocks.heartbeatCurrentAccountApiSession,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requireCurrentAccount, requireCurrentProfile } from "@/lib/dal/account";
import { requireMutationAssurance } from "@/lib/dal/assurance-guard";

function profileRow() {
  return {
    user_id: USER_ID,
    first_name: "Avery",
    last_name: "Stone",
    phone: "",
    country: "United States",
    is_active: true,
    subscription_tier: "free",
    timezone: "UTC",
    default_currency: "USD",
    notify_price_alerts: true,
    notify_portfolio_moves: true,
    notify_news_digest: false,
    profile_version: 3,
    created_at: "2024-01-03T03:04:05.000Z",
    last_login_at: null,
    updated_at: "2026-09-02T08:00:00.000Z",
  };
}

function installClient(options: { authenticated?: boolean; clientThrows?: boolean } = {}) {
  if (options.clientThrows) {
    mocks.createServerAzureClient.mockRejectedValue(new Error("configuration missing"));
    return;
  }
  const user =
    options.authenticated === false
      ? null
      : {
          id: USER_ID,
          email: "user@example.com",
          first_name: "Avery",
          last_name: "Stone",
          is_active: true,
          email_confirmed: true,
          role: "user",
          profile: null,
        };
  const azure = {
    getUser: vi.fn(async () => user),
    getAccessToken: vi.fn(() => "access-token"),
  };
  mocks.createServerAzureClient.mockResolvedValue(azure);
  mocks.azureFrom.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => ({
          execute: vi.fn(async () => ({ data: profileRow(), error: null })),
        })),
      })),
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.heartbeatCurrentAccountApiSession.mockResolvedValue(true);
});

describe("Azure assurance enforcement on protected routes", () => {
  it.each([
    ["requireCurrentAccount", requireCurrentAccount],
    ["requireCurrentProfile", requireCurrentProfile],
  ])("%s serves an authenticated Azure password session", async (_label, guard) => {
    installClient();

    await expect(guard()).resolves.toMatchObject({ userId: USER_ID });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.heartbeatCurrentAccountApiSession).toHaveBeenCalled();
  });

  it("redirects an unauthenticated visitor to plain login", async () => {
    installClient({ authenticated: false });

    await expect(requireCurrentAccount()).rejects.toThrowError("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("reports unavailable when the Azure client cannot be created", async () => {
    installClient({ clientThrows: true });

    await expect(requireCurrentAccount()).rejects.toThrowError(
      "Account data is temporarily unavailable.",
    );
  });
});

describe("Azure assurance enforcement on mutations", () => {
  it("permits a verified Azure password session while TOTP is source-locked", async () => {
    installClient();

    const { decision, assurance } = await requireMutationAssurance();

    expect(decision).toBe("satisfied");
    expect(assurance).toMatchObject({
      currentLevel: "aal1",
      requiredLevel: "aal1",
      factorsReadable: true,
      mfaEnrolled: false,
    });
  });

  it("refuses mutations when no Azure user can be verified", async () => {
    installClient({ authenticated: false });

    await expect(requireMutationAssurance()).resolves.toMatchObject({ decision: "unavailable" });
  });
});
