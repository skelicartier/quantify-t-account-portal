import {
  INITIAL_PREFERENCES_ACTION_STATE,
  INITIAL_PROFILE_ACTION_STATE,
} from "@/lib/account/profile-input";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  azureFrom: vi.fn(),
  azureUpdate: vi.fn(),
  requireMutationAssurance: vi.fn(),
  requireSameOriginServerAction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/dal/azure-sql-client", () => ({
  azureFrom: mocks.azureFrom,
  azureUpdate: mocks.azureUpdate,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({
  requireMutationAssurance: mocks.requireMutationAssurance,
}));
vi.mock("@/lib/security/action-origin", () => ({
  requireSameOriginServerAction: mocks.requireSameOriginServerAction,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updatePreferences } from "@/app/account/preferences/actions";
import { updateProfile } from "@/app/account/profile/actions";

function profileForm(): FormData {
  const form = new FormData();
  form.set("firstName", "Avery");
  form.set("lastName", "Stone");
  form.set("phone", "+1 415 555 0100");
  form.set("country", "United States");
  form.set("profileVersion", "4");
  return form;
}

function preferencesForm(): FormData {
  const form = new FormData();
  form.set("timezone", "America/New_York");
  form.set("defaultCurrency", "USD");
  form.set("notifyPriceAlerts", "on");
  form.set("notifyNewsDigest", "on");
  form.set("profileVersion", "5");
  return form;
}

function installClient(options?: {
  authenticated?: boolean;
  updateData?: unknown;
  updateError?: unknown;
  updateThrows?: boolean;
  committedVersion?: number | null;
  assuranceDecision?: "satisfied" | "challenge-required" | "unavailable";
}) {
  const authenticated = options?.authenticated ?? true;
  const execute = vi.fn().mockResolvedValue({
    data:
      options && "committedVersion" in options
        ? { profile_version: options.committedVersion }
        : { profile_version: 9 },
    error: null,
  });
  const single = vi.fn(() => ({ execute }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  mocks.azureFrom.mockReturnValue({ select });
  mocks.azureUpdate.mockImplementation(async (_table, values, conditions) => {
    if (options?.updateThrows) throw new Error("provider transport failed");
    if (options?.updateError !== undefined) return { data: null, error: options.updateError };
    if (options && "updateData" in options) return { data: options.updateData, error: null };
    return {
      data: {
        user_id: conditions[0].value,
        profile_version: values.profile_version,
      },
      error: null,
    };
  });
  mocks.createServerAzureClient.mockResolvedValue({
    getUser: vi.fn().mockResolvedValue(authenticated ? { id: USER_ID } : null),
  });
  mocks.requireMutationAssurance.mockResolvedValue({
    decision: options?.assuranceDecision ?? "satisfied",
  });
  mocks.requireSameOriginServerAction.mockResolvedValue(undefined);
  return { execute, select, eq };
}

describe("profile Server Actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates profile fields through an owner and version scoped Azure SQL mutation", async () => {
    installClient();

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result).toMatchObject({
      status: "success",
      message: "Profile saved.",
      profileVersion: 5,
    });
    expect(mocks.azureUpdate).toHaveBeenCalledWith(
      "app_profiles",
      expect.objectContaining({
        first_name: "Avery",
        last_name: "Stone",
        phone: "+1 415 555 0100",
        country: "United States",
        profile_version: 5,
      }),
      [
        { column: "user_id", value: USER_ID },
        { column: "profile_version", value: 4 },
      ],
    );
    expect(JSON.stringify(mocks.azureUpdate.mock.calls)).not.toContain("p_user_id");
    expect(mocks.revalidatePath.mock.calls.flat()).toEqual([
      "/account",
      "/account/profile",
      "/account/preferences",
    ]);
  });

  it("updates preference fields without touching retired photo or passcode data", async () => {
    installClient();

    const result = await updatePreferences(INITIAL_PREFERENCES_ACTION_STATE, preferencesForm());

    expect(result).toMatchObject({ status: "success", profileVersion: 6 });
    expect(mocks.azureUpdate).toHaveBeenCalledWith(
      "app_profiles",
      expect.objectContaining({
        timezone: "America/New_York",
        default_currency: "USD",
        notify_price_alerts: true,
        notify_portfolio_moves: false,
        notify_news_digest: true,
        profile_version: 6,
      }),
      [
        { column: "user_id", value: USER_ID },
        { column: "profile_version", value: 5 },
      ],
    );
    expect(JSON.stringify(mocks.azureUpdate.mock.calls)).not.toContain("photo");
    expect(JSON.stringify(mocks.azureUpdate.mock.calls)).not.toContain("passcode");
  });

  it("returns a stale state and committed version when the exact version update matches no row", async () => {
    const { select, eq, execute } = installClient({ updateData: null, committedVersion: 11 });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result).toMatchObject({ status: "stale", profileVersion: 11 });
    expect(mocks.azureFrom).toHaveBeenCalledWith("app_profiles");
    expect(select).toHaveBeenCalledWith("profile_version");
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(execute).toHaveBeenCalled();
  });

  it("keeps stale retry safe when the committed version read is unavailable", async () => {
    installClient({ updateData: null, committedVersion: null });

    const result = await updatePreferences(INITIAL_PREFERENCES_ACTION_STATE, preferencesForm());

    expect(result).toMatchObject({ status: "stale", profileVersion: null });
  });

  it("does not mutate without a verified Azure account session", async () => {
    installClient({ authenticated: false });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain("session");
    expect(mocks.azureUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["owed challenge", "challenge-required", "authenticator code"],
    ["unreadable assurance", "unavailable", "temporarily unavailable"],
  ] as const)("refuses a mutation with %s", async (_label, assuranceDecision, message) => {
    installClient({ assuranceDecision });

    const result = await updatePreferences(INITIAL_PREFERENCES_ACTION_STATE, preferencesForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain(message);
    expect(mocks.azureUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "wrong owner",
      { user_id: "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66", profile_version: 5 },
      undefined,
    ],
    ["wrong version", { user_id: USER_ID, profile_version: 4 }, undefined],
    ["provider error", null, { code: "57014" }],
  ] as const)("fails closed for a %s update result", async (_label, updateData, updateError) => {
    installClient({ updateData, updateError });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain("temporarily unavailable");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
