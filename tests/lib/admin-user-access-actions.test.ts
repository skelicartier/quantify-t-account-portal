import { AccountApiRequestError, type AccountApiMe } from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";
import { DEFAULT_APPROVAL_REASON, INITIAL_ADMIN_USER_ACCESS_STATE } from "@/lib/admin/user-access";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const TARGET_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  decideAccountApiAdminUserAccess: vi.fn(),
  fetchAccountApiMe: vi.fn(),
  getCurrentAssurance: vi.fn(),
  requireSameOriginServerAction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({
  getCurrentAssurance: mocks.getCurrentAssurance,
}));
vi.mock("@/lib/security/action-origin", () => ({
  requireSameOriginServerAction: mocks.requireSameOriginServerAction,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/account-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
  return {
    ...actual,
    decideAccountApiAdminUserAccess: mocks.decideAccountApiAdminUserAccess,
    fetchAccountApiMe: mocks.fetchAccountApiMe,
  };
});

import { decideAdminUserAccess } from "@/app/admin/users/[userId]/actions";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-me",
  user: { user_id: USER_ID, email: "owner@example.test", is_active: true },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "expected-owner-projection",
    break_glass: false,
  },
  capabilities: ["account:read-self", "account:read-any", "users:set-active"],
  environment: "staging",
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

function decided(status: "approved" | "declined", extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    correlation_id: "qt-access",
    user_id: TARGET_ID,
    access: {
      status,
      decided_at: "2026-11-21T08:00:00Z",
      decided_by: USER_ID,
      reason: "A reason",
    },
    unchanged: false,
    sessions_revoked: 0,
    trading: null,
    decision_emailed: true,
    event: { id: "9", event_type: `account.access_${status}` },
    ...extra,
  };
}

function form(decision: string, reason = "", userId = TARGET_ID): FormData {
  const data = new FormData();
  data.set("userId", userId);
  data.set("decision", decision);
  if (reason) data.set("reason", reason);
  return data;
}

describe("admin application decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => "token" });
    mocks.fetchAccountApiMe.mockResolvedValue(me);
    mocks.getCurrentAssurance.mockResolvedValue(assurance);
    mocks.requireSameOriginServerAction.mockResolvedValue(undefined);
    mocks.decideAccountApiAdminUserAccess.mockResolvedValue(decided("approved"));
  });

  it("approves with the standing reason when none is typed, and refreshes every page that shows it", async () => {
    const result = await decideAdminUserAccess(INITIAL_ADMIN_USER_ACCESS_STATE, form("approved"));

    expect(result).toEqual({
      status: "success",
      message: "Application approved. The applicant has been emailed.",
    });
    expect(mocks.decideAccountApiAdminUserAccess).toHaveBeenCalledWith(
      "token",
      TARGET_ID,
      { status: "approved", reason: DEFAULT_APPROVAL_REASON },
      { idempotencyKey: expect.stringMatching(/^portal-/u) },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/users/${TARGET_ID}`);
  });

  it("keeps the reason that was typed, with its whitespace collapsed", async () => {
    await decideAdminUserAccess(
      INITIAL_ADMIN_USER_ACCESS_STATE,
      form("approved", "  Fund manager,\n references   checked "),
    );

    expect(mocks.decideAccountApiAdminUserAccess).toHaveBeenCalledWith(
      "token",
      TARGET_ID,
      { status: "approved", reason: "Fund manager, references checked" },
      expect.anything(),
    );
  });

  it("will not decline without a reason", async () => {
    const result = await decideAdminUserAccess(INITIAL_ADMIN_USER_ACCESS_STATE, form("declined"));

    expect(result).toEqual({ status: "error", message: "Give the reason for declining first." });
    expect(mocks.decideAccountApiAdminUserAccess).not.toHaveBeenCalled();
  });

  it("says what a decline did to the account's sessions and trading", async () => {
    mocks.decideAccountApiAdminUserAccess.mockResolvedValue(
      decided("declined", {
        sessions_revoked: 2,
        trading: { trading_halted: true, authorisations_revoked: 1, cancelled: 3, complete: true },
        decision_emailed: false,
      }),
    );

    const result = await decideAdminUserAccess(
      INITIAL_ADMIN_USER_ACCESS_STATE,
      form("declined", "Outside the markets we serve"),
    );

    expect(result.status).toBe("success");
    expect(result.message).toBe(
      "Application declined. 2 sessions were ended. Its trading was halted and every working order cancelled. The email to the applicant could not be sent, so tell them directly.",
    );
  });

  it("says nothing changed when the decision already stood", async () => {
    mocks.decideAccountApiAdminUserAccess.mockResolvedValue({
      ok: true,
      correlation_id: "qt-access",
      user_id: TARGET_ID,
      access: { status: "approved", decided_at: null, decided_by: null, reason: "" },
      unchanged: true,
      event: null,
    });

    const result = await decideAdminUserAccess(INITIAL_ADMIN_USER_ACCESS_STATE, form("approved"));

    expect(result).toEqual({
      status: "success",
      message: "This application was already approved. Nothing changed.",
    });
  });

  it("refuses a reason longer than the service keeps", async () => {
    const result = await decideAdminUserAccess(
      INITIAL_ADMIN_USER_ACCESS_STATE,
      form("declined", "x".repeat(401)),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/400 characters/u);
    expect(mocks.decideAccountApiAdminUserAccess).not.toHaveBeenCalled();
  });

  it("refuses a decision that is neither approve nor decline", async () => {
    const result = await decideAdminUserAccess(INITIAL_ADMIN_USER_ACCESS_STATE, form("pending"));

    expect(result.status).toBe("error");
    expect(mocks.decideAccountApiAdminUserAccess).not.toHaveBeenCalled();
  });

  it("refuses when the Account API did not grant the capability", async () => {
    mocks.fetchAccountApiMe.mockResolvedValue({
      ...me,
      capabilities: ["account:read-self", "account:read-any"],
    });

    const result = await decideAdminUserAccess(INITIAL_ADMIN_USER_ACCESS_STATE, form("approved"));

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot decide/iu);
    expect(mocks.decideAccountApiAdminUserAccess).not.toHaveBeenCalled();
  });

  it("refuses deciding your own application", async () => {
    const result = await decideAdminUserAccess(
      INITIAL_ADMIN_USER_ACCESS_STATE,
      form("approved", "", USER_ID),
    );

    expect(result.status).toBe("error");
    expect(mocks.decideAccountApiAdminUserAccess).not.toHaveBeenCalled();
  });

  it("requires the second factor a privileged session owes before posting", async () => {
    mocks.getCurrentAssurance.mockResolvedValue({
      ...assurance,
      currentLevel: "aal1",
      challengeRequired: true,
    });

    const result = await decideAdminUserAccess(INITIAL_ADMIN_USER_ACCESS_STATE, form("approved"));

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/authenticator/iu);
    expect(mocks.decideAccountApiAdminUserAccess).not.toHaveBeenCalled();
  });

  it("does not post from another origin", async () => {
    mocks.requireSameOriginServerAction.mockRejectedValue(new Error("cross-origin"));

    const result = await decideAdminUserAccess(INITIAL_ADMIN_USER_ACCESS_STATE, form("approved"));

    expect(result.status).toBe("error");
    expect(mocks.decideAccountApiAdminUserAccess).not.toHaveBeenCalled();
  });

  it.each([
    [403, /cannot decide/iu],
    [404, /not found/iu],
    [400, /refused that decision/iu],
    [503, /temporarily unavailable/iu],
  ])("turns a %i from the service into a sentence", async (status, sentence) => {
    mocks.decideAccountApiAdminUserAccess.mockRejectedValue(
      new AccountApiRequestError({
        status,
        code: "refused",
        message: "refused",
        correlationId: "qt-correlation",
      }),
    );

    const result = await decideAdminUserAccess(INITIAL_ADMIN_USER_ACCESS_STATE, form("approved"));

    expect(result.status).toBe("error");
    expect(result.message).toMatch(sentence);
  });
});
