import {
  INITIAL_PREFERENCES_ACTION_STATE,
  INITIAL_PROFILE_ACTION_STATE,
} from "@/lib/account/profile-input";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  updateAccountApiProfile: vi.fn(),
  requireMutationAssurance: vi.fn(),
  requireSameOriginServerAction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/admin/account-api", async () => ({
  ...(await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api")),
  updateAccountApiProfile: mocks.updateAccountApiProfile,
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
import { AccountApiRequestError } from "@/lib/admin/account-api";

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
  updateProfileVersion?: number;
  updateUserId?: string;
  updateError?: Error;
  updateThrows?: boolean;
  assuranceDecision?: "satisfied" | "challenge-required" | "unavailable";
  accessToken?: string | null;
}) {
  const authenticated = options?.authenticated ?? true;
  const accessToken = options && "accessToken" in options ? options.accessToken : "bearer-token";
  mocks.updateAccountApiProfile.mockImplementation(async (_accessToken, body) => {
    if (options?.updateThrows) throw new Error("provider transport failed");
    if (options?.updateError) throw options.updateError;
    return {
      profile: {
        user_id: options?.updateUserId ?? USER_ID,
        profile_version: options?.updateProfileVersion ?? body.expected_profile_version + 1,
        updated_at: "2026-09-09T10:00:00Z",
      },
    };
  });
  mocks.createServerAzureClient.mockResolvedValue({
    getUser: vi.fn().mockResolvedValue(authenticated ? { id: USER_ID } : null),
    getAccessToken: vi.fn(() => accessToken),
  });
  mocks.requireMutationAssurance.mockResolvedValue({
    decision: options?.assuranceDecision ?? "satisfied",
  });
  mocks.requireSameOriginServerAction.mockResolvedValue(undefined);
}

describe("profile Server Actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates profile fields through an owner and version scoped Account API mutation", async () => {
    installClient();

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result).toMatchObject({
      status: "success",
      message: "Profile saved.",
      profileVersion: 5,
    });
    expect(mocks.updateAccountApiProfile).toHaveBeenCalledWith(
      "bearer-token",
      {
        expected_profile_version: 4,
        first_name: "Avery",
        last_name: "Stone",
        phone: "+1 415 555 0100",
        country: "United States",
        // The descriptive half of the profile. A form that renders a field must send it even
        // when it is empty, or clearing a value would be indistinguishable from not touching
        // it and the field could never be emptied once set.
        display_name: "",
        occupation: "",
        company: "",
        website: "",
        bio: "",
        experience_level: "",
        interests: "",
        markets: "",
        primary_workflow: "",
      },
      { idempotencyKey: expect.any(String) },
    );
    expect(JSON.stringify(mocks.updateAccountApiProfile.mock.calls)).not.toContain("p_user_id");
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
    expect(mocks.updateAccountApiProfile).toHaveBeenCalledWith(
      "bearer-token",
      {
        expected_profile_version: 5,
        timezone: "America/New_York",
        default_currency: "USD",
        notify_price_alerts: true,
        notify_portfolio_moves: false,
        notify_news_digest: true,
        notify_weekly_summary: false,
        notify_research_complete: false,
        notify_security_alerts: false,
        ui_density: "comfortable",
        time_format: "24h",
        show_market_times_in_local: false,
        gain_colour: "green_up",
        change_display: "percent",
        pulse_min_severity: "medium",
        pulse_desktop_alerts: false,
        research_ai_drafting: false,
      },
      { idempotencyKey: expect.any(String) },
    );
    expect(JSON.stringify(mocks.updateAccountApiProfile.mock.calls)).not.toContain("photo");
    expect(JSON.stringify(mocks.updateAccountApiProfile.mock.calls)).not.toContain("passcode");
  });

  it("returns a stale state and committed version when the Account API reports a conflict", async () => {
    installClient({
      updateError: new AccountApiRequestError({
        status: 409,
        code: "revision_conflict",
        message: "stale",
        correlationId: "qt-test",
        details: { profile_version: 11 },
      }),
    });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result).toMatchObject({ status: "stale", profileVersion: 11 });
  });

  it("keeps stale retry safe when the committed version read is unavailable", async () => {
    installClient({
      updateError: new AccountApiRequestError({
        status: 409,
        code: "revision_conflict",
        message: "stale",
        correlationId: "qt-test",
      }),
    });

    const result = await updatePreferences(INITIAL_PREFERENCES_ACTION_STATE, preferencesForm());

    expect(result).toMatchObject({ status: "stale", profileVersion: null });
  });

  it("does not mutate without a verified Azure account session", async () => {
    installClient({ authenticated: false });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain("session");
    expect(mocks.updateAccountApiProfile).not.toHaveBeenCalled();
  });

  it("does not mutate without a bearer token", async () => {
    installClient({ accessToken: null });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain("session");
    expect(mocks.updateAccountApiProfile).not.toHaveBeenCalled();
  });

  it.each([
    ["owed challenge", "challenge-required", "passkey"],
    ["unreadable assurance", "unavailable", "temporarily unavailable"],
  ] as const)("refuses a mutation with %s", async (_label, assuranceDecision, message) => {
    installClient({ assuranceDecision });

    const result = await updatePreferences(INITIAL_PREFERENCES_ACTION_STATE, preferencesForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain(message);
    expect(mocks.updateAccountApiProfile).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong owner", { updateUserId: "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66" }],
    ["wrong version", { updateProfileVersion: 4 }],
    ["provider error", { updateThrows: true }],
  ] as const)("fails closed for a %s update result", async (_label, options) => {
    installClient(options);

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain("temporarily unavailable");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
