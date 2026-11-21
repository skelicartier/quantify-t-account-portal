import type { AccountApiMe } from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";
import { INITIAL_ADMIN_STAFF_STATE } from "@/lib/admin/staff-input";

const ADMIN_ID = "8b2d4e61-1c3a-4f5b-8d9e-2a4c6b8d0f11";
const TARGET_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  fetchAccountApiMe: vi.fn(),
  getCurrentAssurance: vi.fn(),
  revalidatePath: vi.fn(),
  requireSameOriginServerAction: vi.fn(),
  setAccountApiAdminStaffRole: vi.fn(),
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
    setAccountApiAdminStaffRole: mocks.setAccountApiAdminStaffRole,
  };
});

import { setStaffRole } from "@/app/admin/access/actions";
import { AccountApiRequestError } from "@/lib/admin/account-api";
import { SameOriginActionError } from "@/lib/security/action-origin";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-me",
  user: { user_id: ADMIN_ID, email: "admin@example.test", is_active: true },
  role: {
    effective: "admin",
    database: "admin",
    legacy: "admin",
    mismatch: "match",
    break_glass: false,
  },
  capabilities: ["account:read-self", "account:read-any", "staff:write"],
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

function form(fields: { userId?: string; role?: string; reason?: string } = {}): FormData {
  const data = new FormData();
  data.set("userId", fields.userId ?? TARGET_ID);
  data.set("role", fields.role ?? "support");
  data.set("reason", fields.reason ?? "Joining the support desk.");
  data.set("confirm", "on");
  return data;
}

describe("staff access action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => "token" });
    mocks.fetchAccountApiMe.mockResolvedValue(me);
    mocks.getCurrentAssurance.mockResolvedValue(assurance);
    mocks.requireSameOriginServerAction.mockResolvedValue(undefined);
    mocks.setAccountApiAdminStaffRole.mockResolvedValue({ ok: true, changed: true });
  });

  it("grants a staff role with its own key and refreshes everywhere the role shows", async () => {
    const result = await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form());

    expect(result.status).toBe("success");
    expect(mocks.setAccountApiAdminStaffRole).toHaveBeenCalledWith(
      "token",
      TARGET_ID,
      { role: "support", reason: "Joining the support desk." },
      { idempotencyKey: expect.stringMatching(/^portal-/u) },
    );
    for (const path of [
      "/admin/access",
      "/admin/roles",
      "/admin/users",
      `/admin/users/${TARGET_ID}`,
    ]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it.each(["owner", "admin"])("refuses to send %s without asking the service", async (role) => {
    // The point of this section existing separately: an Admin may staff a desk and may not
    // promote somebody to their own level. The service refuses it too — that is the
    // guarantee — but a console that would happily send it is lying about what it does.
    const result = await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form({ role }));

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/set from Roles/i);
    expect(mocks.setAccountApiAdminStaffRole).not.toHaveBeenCalled();
  });

  it("sends the user role as the way to remove access", async () => {
    // One way to say it, so there is no second code path that forgets a guard.
    const result = await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form({ role: "user" }));

    expect(result.status).toBe("success");
    expect(result.message).toMatch(/removed/i);
    expect(mocks.setAccountApiAdminStaffRole).toHaveBeenCalledWith(
      "token",
      TARGET_ID,
      expect.objectContaining({ role: "user" }),
      expect.anything(),
    );
  });

  it("requires a reason", async () => {
    // A role nobody can account for is how access outlives the reason for it.
    const result = await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form({ reason: "   " }));

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/why/i);
    expect(mocks.setAccountApiAdminStaffRole).not.toHaveBeenCalled();
  });

  it("refuses anything that is not an account id", async () => {
    const result = await setStaffRole(
      INITIAL_ADMIN_STAFF_STATE,
      form({ userId: "admin@example.test" }),
    );

    expect(result.status).toBe("error");
    expect(mocks.fetchAccountApiMe).not.toHaveBeenCalled();
  });

  it("checks the origin before it reads the caller", async () => {
    mocks.requireSameOriginServerAction.mockRejectedValue(new SameOriginActionError());

    const result = await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form());

    expect(result.status).toBe("error");
    expect(mocks.fetchAccountApiMe).not.toHaveBeenCalled();
  });

  it("refuses an account without the staff capability", async () => {
    mocks.fetchAccountApiMe.mockResolvedValue({
      ...me,
      role: { ...me.role, effective: "support_manager", database: "support_manager" },
      capabilities: ["account:read-self", "account:read-any", "support:manage"],
    });

    const result = await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form());

    expect(result).toEqual({
      status: "error",
      userId: TARGET_ID,
      message: "This account cannot change staff access.",
    });
  });

  it("refuses a member of staff who has not cleared their second factor", async () => {
    mocks.getCurrentAssurance.mockResolvedValue({ ...assurance, currentLevel: "aal1" });

    const result = await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form());

    expect(result.message).toMatch(/passkey/i);
    expect(mocks.setAccountApiAdminStaffRole).not.toHaveBeenCalled();
  });

  it("says nothing changed when the account already holds the role", async () => {
    // So the operator is not left wondering whether the save worked.
    mocks.setAccountApiAdminStaffRole.mockResolvedValue({ ok: true, changed: false });

    const result = await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form());

    expect(result.status).toBe("success");
    expect(result.message).toMatch(/Nothing changed/i);
  });

  it("explains a refusal from the service without repeating its words", async () => {
    mocks.setAccountApiAdminStaffRole.mockRejectedValue(
      new AccountApiRequestError({
        status: 403,
        code: "forbidden",
        message: "admin/staff/7e5f9c11 target_role=owner (qt-9f2c)",
        correlationId: "qt-9f2c",
      }),
    );

    const result = await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form());

    expect(result.message).toMatch(/out of reach/i);
    expect(result.message).not.toMatch(/admin\/staff/u);
    expect(result.message).not.toMatch(/qt-/u);
  });

  it("says nothing was saved when the service is unreachable", async () => {
    mocks.setAccountApiAdminStaffRole.mockRejectedValue(new Error("socket hang up"));

    const result = await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form());

    expect(result.message).toMatch(/nothing was saved/i);
  });

  it("names an account that does not exist rather than blaming the network", async () => {
    mocks.setAccountApiAdminStaffRole.mockRejectedValue(
      new AccountApiRequestError({
        status: 404,
        code: "not_found",
        message: "no such user",
        correlationId: "qt-9f2c",
      }),
    );

    expect((await setStaffRole(INITIAL_ADMIN_STAFF_STATE, form())).message).toMatch(
      /no account with that id/i,
    );
  });
});
