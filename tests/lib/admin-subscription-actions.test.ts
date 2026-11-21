import type { AccountApiMe } from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";
import {
  INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
  INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
} from "@/lib/admin/subscription";

const OWNER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const TARGET_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  fetchAccountApiMe: vi.fn(),
  getCurrentAssurance: vi.fn(),
  requireSameOriginServerAction: vi.fn(),
  revalidatePath: vi.fn(),
  setAccountApiAdminUserSubscription: vi.fn(),
  setAccountApiAdminUserEntitlement: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({ getCurrentAssurance: mocks.getCurrentAssurance }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/security/action-origin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security/action-origin")>(
    "@/lib/security/action-origin",
  );
  return { ...actual, requireSameOriginServerAction: mocks.requireSameOriginServerAction };
});
vi.mock("@/lib/admin/account-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
  return {
    ...actual,
    fetchAccountApiMe: mocks.fetchAccountApiMe,
    setAccountApiAdminUserSubscription: mocks.setAccountApiAdminUserSubscription,
    setAccountApiAdminUserEntitlement: mocks.setAccountApiAdminUserEntitlement,
  };
});

import {
  updateAdminUserEntitlement,
  updateAdminUserSubscription,
} from "@/app/admin/users/[userId]/actions";
import { AccountApiRequestError } from "@/lib/admin/account-api";
import { SameOriginActionError } from "@/lib/security/action-origin";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-me",
  user: { user_id: OWNER_ID, email: "owner@example.test", is_active: true },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "expected-owner-projection",
    break_glass: false,
  },
  capabilities: ["account:read-self", "account:read-any", "subscription:write"],
  environment: "production",
};

const assurance: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: "aal2",
  requiredLevel: "aal2",
  mfaEnrolled: true,
  challengeRequired: false,
  levelReadable: true,
  factorsReadable: true,
};

function planForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("userId", TARGET_ID);
  data.set("plan", "desk");
  data.set("expectedProfileVersion", "4");
  data.set("confirm", "on");
  for (const [key, value] of Object.entries(overrides)) {
    if (value === "") data.delete(key);
    else data.set(key, value);
  }
  return data;
}

function overrideForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("userId", TARGET_ID);
  data.set("featureKey", "deep_research");
  data.set("intent", "grant");
  data.set("allowance", "100");
  data.set("expiresInDays", "90");
  data.set("reason", "Northgate pilot, agreed 60 days");
  for (const [key, value] of Object.entries(overrides)) {
    if (value === "") data.delete(key);
    else data.set(key, value);
  }
  return data;
}

describe("subscription server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => "token" });
    mocks.fetchAccountApiMe.mockResolvedValue(me);
    mocks.getCurrentAssurance.mockResolvedValue(assurance);
    mocks.requireSameOriginServerAction.mockResolvedValue(undefined);
    mocks.setAccountApiAdminUserSubscription.mockResolvedValue({
      user_id: TARGET_ID,
      plan: "desk",
      previous_plan: "pro",
      profile_version: 5,
      entitlement_version: 8,
      overrides: [],
      trial_ends_at: "",
      unchanged: false,
      event: { id: "evt", event_type: "account.subscription_changed" },
      replayed: false,
      legacy_mirrored: true,
    });
    mocks.setAccountApiAdminUserEntitlement.mockResolvedValue({
      user_id: TARGET_ID,
      plan: "pro",
      previous_plan: "",
      profile_version: 4,
      entitlement_version: 9,
      overrides: [
        {
          feature_key: "deep_research",
          source: "override",
          source_ref: "",
          limit_value: 100,
          bool_value: null,
          effective_from: "2026-09-12T00:00:00Z",
          effective_to: "2026-12-11T00:00:00Z",
          granted_by: OWNER_ID,
          reason: "Northgate pilot, agreed 60 days",
        },
      ],
      trial_ends_at: "",
      unchanged: false,
      event: { id: "evt", event_type: "account.entitlement_changed" },
      replayed: false,
      legacy_mirrored: true,
    });
  });

  it("checks the request origin before it reads a session or writes anything", async () => {
    mocks.requireSameOriginServerAction.mockRejectedValueOnce(new SameOriginActionError());

    const result = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm(),
    );

    expect(result.status).toBe("error");
    expect(mocks.createServerAzureClient).not.toHaveBeenCalled();
    expect(mocks.setAccountApiAdminUserSubscription).not.toHaveBeenCalled();
  });

  it("applies a plan with the form's expected version and a server idempotency key", async () => {
    const result = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm(),
    );

    expect(result.status).toBe("success");
    expect(result.message).toContain("Desk");
    expect(result.expectedProfileVersion).toBe(5);
    expect(mocks.setAccountApiAdminUserSubscription).toHaveBeenCalledWith(
      "token",
      TARGET_ID,
      { plan: "desk", expected_profile_version: 4 },
      { idempotencyKey: expect.stringMatching(/^portal-/u) },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/users/${TARGET_ID}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/subscriptions");
  });

  it("asks for the trial only when the operator ticked it", async () => {
    await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm({ startTrial: "on" }),
    );

    expect(mocks.setAccountApiAdminUserSubscription).toHaveBeenCalledWith(
      "token",
      TARGET_ID,
      { plan: "desk", expected_profile_version: 4, trial_days: 14 },
      expect.anything(),
    );
  });

  it("refuses a plan change without the confirmation or with an unknown plan", async () => {
    const unconfirmed = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm({ confirm: "" }),
    );
    expect(unconfirmed.status).toBe("error");

    const unknownPlan = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm({ plan: "enterprise" }),
    );
    expect(unknownPlan.status).toBe("error");
    expect(mocks.setAccountApiAdminUserSubscription).not.toHaveBeenCalled();
  });

  it("refuses a caller without the subscription capability, and a caller changing their own plan", async () => {
    mocks.fetchAccountApiMe.mockResolvedValueOnce({
      ...me,
      capabilities: ["account:read-self", "account:read-any"],
    });
    const unprivileged = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm(),
    );
    expect(unprivileged.status).toBe("error");

    const self = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm({ userId: OWNER_ID }),
    );
    expect(self.status).toBe("error");
    expect(mocks.setAccountApiAdminUserSubscription).not.toHaveBeenCalled();
  });

  it("refuses a privileged caller who has not satisfied the second factor", async () => {
    mocks.getCurrentAssurance.mockResolvedValueOnce({
      ...assurance,
      currentLevel: "aal1",
      challengeRequired: true,
    });

    const result = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm(),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/passkey/iu);
    expect(mocks.setAccountApiAdminUserSubscription).not.toHaveBeenCalled();
  });

  it("hands a stale plan write back with the version the API named, without retrying", async () => {
    mocks.setAccountApiAdminUserSubscription.mockRejectedValueOnce(
      new AccountApiRequestError({
        status: 409,
        code: "revision_conflict",
        message: "stale",
        correlationId: "qt-conflict",
        details: { profile_version: 9 },
      }),
    );

    const result = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm(),
    );

    expect(result.status).toBe("conflict");
    expect(result.expectedProfileVersion).toBe(9);
    expect(result.message).toContain("9");
    expect(mocks.setAccountApiAdminUserSubscription).toHaveBeenCalledTimes(1);
  });

  it("records an override with its reason and expiry and returns the new override set", async () => {
    const result = await updateAdminUserEntitlement(
      INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
      overrideForm(),
    );

    expect(result.status).toBe("success");
    expect(result.overrides[0]?.limit_value).toBe(100);
    expect(mocks.setAccountApiAdminUserEntitlement).toHaveBeenCalledWith(
      "token",
      TARGET_ID,
      {
        feature_key: "deep_research",
        limit_value: 100,
        expires_in_days: 90,
        reason: "Northgate pilot, agreed 60 days",
      },
      { idempotencyKey: expect.stringMatching(/^portal-/u) },
    );
  });

  it("sends an unlimited override as a null limit", async () => {
    await updateAdminUserEntitlement(
      INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
      overrideForm({ unlimited: "on", allowance: "" }),
    );

    expect(mocks.setAccountApiAdminUserEntitlement).toHaveBeenCalledWith(
      "token",
      TARGET_ID,
      expect.objectContaining({ limit_value: null }),
      expect.anything(),
    );
  });

  it("refuses a grant with no reason, no expiry, or no number", async () => {
    const noReason = await updateAdminUserEntitlement(
      INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
      overrideForm({ reason: "short" }),
    );
    expect(noReason.status).toBe("error");
    expect(noReason.message).toMatch(/reason/iu);

    const noExpiry = await updateAdminUserEntitlement(
      INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
      overrideForm({ expiresInDays: "forever" }),
    );
    expect(noExpiry.status).toBe("error");
    expect(noExpiry.message).toMatch(/expires/iu);

    const noNumber = await updateAdminUserEntitlement(
      INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
      overrideForm({ allowance: "lots" }),
    );
    expect(noNumber.status).toBe("error");
    expect(mocks.setAccountApiAdminUserEntitlement).not.toHaveBeenCalled();
  });

  it("removes an override without asking for a reason or an expiry", async () => {
    const data = new FormData();
    data.set("userId", TARGET_ID);
    data.set("featureKey", "deep_research");
    data.set("intent", "remove");

    const result = await updateAdminUserEntitlement(INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE, data);

    expect(result.status).toBe("success");
    expect(mocks.setAccountApiAdminUserEntitlement).toHaveBeenCalledWith(
      "token",
      TARGET_ID,
      { feature_key: "deep_research", remove: true },
      expect.anything(),
    );
  });

  it("refuses an override for a feature the catalogue does not publish", async () => {
    const result = await updateAdminUserEntitlement(
      INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
      overrideForm({ featureKey: "everything" }),
    );

    expect(result.status).toBe("error");
    expect(mocks.setAccountApiAdminUserEntitlement).not.toHaveBeenCalled();
  });

  it("refuses an override from a caller without the subscription capability", async () => {
    mocks.fetchAccountApiMe.mockResolvedValueOnce({ ...me, capabilities: ["account:read-any"] });

    const result = await updateAdminUserEntitlement(
      INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
      overrideForm(),
    );

    expect(result.status).toBe("error");
    expect(mocks.setAccountApiAdminUserEntitlement).not.toHaveBeenCalled();
  });

  it("only says a trial was started when the receipt carries one", async () => {
    /**
     * The message used to be written from the form's own checkbox, so it said "with a
     * 14-day trial" whether or not one had been written — and for a long time none ever
     * was, because the API validated `trial_days` and then ignored it. Only the receipt
     * is evidence.
     */
    mocks.setAccountApiAdminUserSubscription.mockResolvedValueOnce({
      user_id: TARGET_ID,
      plan: "desk",
      previous_plan: "free",
      profile_version: 5,
      entitlement_version: 8,
      overrides: [],
      trial_ends_at: "",
      unchanged: false,
      event: { id: "evt", event_type: "account.subscription_changed" },
      replayed: false,
      legacy_mirrored: true,
    });

    const silent = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm({ startTrial: "on" }),
    );
    expect(silent.status).toBe("success");
    expect(silent.message).not.toMatch(/trial/iu);

    mocks.setAccountApiAdminUserSubscription.mockResolvedValueOnce({
      user_id: TARGET_ID,
      plan: "desk",
      previous_plan: "free",
      profile_version: 5,
      entitlement_version: 8,
      overrides: [],
      trial_ends_at: "2026-09-26T10:00:00Z",
      unchanged: false,
      event: { id: "evt", event_type: "account.subscription_changed" },
      replayed: false,
      legacy_mirrored: true,
    });

    const started = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm({ startTrial: "on" }),
    );
    expect(started.status).toBe("success");
    expect(started.message).toContain("trial until 2026-09-26");
  });

  it("says plainly that nothing changed when the API wrote nothing", async () => {
    /**
     * Resubmitting the plan an account already has writes nothing, because doing so would
     * bump `entitlement_version` and invalidate the cached entitlement document on every
     * device the account is signed in to. "Plan set to Desk" would claim that happened.
     */
    mocks.setAccountApiAdminUserSubscription.mockResolvedValueOnce({
      user_id: TARGET_ID,
      plan: "desk",
      previous_plan: "desk",
      profile_version: 4,
      entitlement_version: 8,
      overrides: [],
      trial_ends_at: "",
      unchanged: true,
      event: null,
      replayed: false,
      legacy_mirrored: false,
    });

    const result = await updateAdminUserSubscription(
      INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
      planForm(),
    );

    expect(result.status).toBe("success");
    expect(result.message).toMatch(/already on Desk/iu);
    expect(result.message).not.toMatch(/Plan set to/iu);
    expect(result.expectedProfileVersion).toBe(4);
  });

  it("keeps the override table on screen when a value is refused", async () => {
    /**
     * Returning an empty list on a validation error wiped the table the operator was
     * reading from, so a mistyped number made the screen say the account had no overrides
     * at all — a far more alarming claim than "that value was rejected".
     */
    const standing = {
      ...INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
      overrides: [
        {
          feature_key: "deep_research",
          source: "override",
          source_ref: "",
          limit_value: 100,
          bool_value: null,
          effective_from: "2026-09-12T00:00:00Z",
          effective_to: "2026-12-11T00:00:00Z",
          granted_by: OWNER_ID,
          reason: "Northgate pilot, agreed 60 days",
        },
      ],
    };

    const result = await updateAdminUserEntitlement(
      standing,
      overrideForm({ allowance: "not-a-number" }),
    );

    expect(result.status).toBe("error");
    expect(result.overrides).toEqual(standing.overrides);
    expect(mocks.setAccountApiAdminUserEntitlement).not.toHaveBeenCalled();
  });

  it("passes the API's explanation of a refused override through to the operator", async () => {
    /**
     * The API refuses an override that resolves to nothing and its message names the
     * allowance the account would actually end up with. Replacing that with "check and
     * retry" leaves the operator retrying the same number.
     */
    mocks.setAccountApiAdminUserEntitlement.mockRejectedValueOnce(
      new AccountApiRequestError({
        status: 400,
        code: "malformed_request",
        message: "grants nothing",
        correlationId: "qt-1",
        details: {
          deep_research:
            "this account's effective limit is 40 and would become 40, not the value " +
            "requested, because an override can only raise a limit.",
        },
      }),
    );

    const result = await updateAdminUserEntitlement(
      INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
      overrideForm({ allowance: "10" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("would become 40");
  });
});
