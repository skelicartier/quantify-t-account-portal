import type { AccountApiMe } from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";
import { INITIAL_ADMIN_USER_ROLE_STATE } from "@/lib/admin/user-role";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const TARGET_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  fetchAccountApiMe: vi.fn(),
  getCurrentAssurance: vi.fn(),
  revalidatePath: vi.fn(),
  setAccountApiAdminUserRole: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({
  getCurrentAssurance: mocks.getCurrentAssurance,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/account-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
  return {
    ...actual,
    fetchAccountApiMe: mocks.fetchAccountApiMe,
    setAccountApiAdminUserRole: mocks.setAccountApiAdminUserRole,
  };
});

import { updateAdminUserRole } from "@/app/admin/users/[userId]/actions";
import { AccountApiRequestError } from "@/lib/admin/account-api";

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
  capabilities: ["account:read-self", "account:read-any", "roles:write"],
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

function form(userId = TARGET_ID, role = "admin", confirm = true): FormData {
  const data = new FormData();
  data.set("userId", userId);
  data.set("role", role);
  if (confirm) data.set("confirm", "on");
  return data;
}

describe("admin user role action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => "token" });
    mocks.fetchAccountApiMe.mockResolvedValue(me);
    mocks.getCurrentAssurance.mockResolvedValue(assurance);
    mocks.setAccountApiAdminUserRole.mockResolvedValue({
      ok: true,
      role: { effective: "admin" },
    });
  });

  it("posts the role through the Account API with a server idempotency key", async () => {
    const result = await updateAdminUserRole(INITIAL_ADMIN_USER_ROLE_STATE, form());

    expect(result).toEqual({ status: "success", message: "Role set to Admin." });
    expect(mocks.setAccountApiAdminUserRole).toHaveBeenCalledWith("token", TARGET_ID, "admin", {
      idempotencyKey: expect.stringMatching(/^portal-/u),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/users/${TARGET_ID}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/roles");
  });

  it("refuses when the Account API did not grant role management", async () => {
    mocks.fetchAccountApiMe.mockResolvedValue({
      ...me,
      role: { ...me.role, effective: "admin", database: "admin" },
      capabilities: ["account:read-self", "account:read-any", "users:set-active"],
    });

    const result = await updateAdminUserRole(INITIAL_ADMIN_USER_ROLE_STATE, form());

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot change/i);
    expect(mocks.setAccountApiAdminUserRole).not.toHaveBeenCalled();
  });

  it("requires AAL2 before posting the role change", async () => {
    mocks.getCurrentAssurance.mockResolvedValue({
      ...assurance,
      currentLevel: "aal1",
      challengeRequired: true,
    });

    const result = await updateAdminUserRole(INITIAL_ADMIN_USER_ROLE_STATE, form());

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/passkey/i);
    expect(mocks.setAccountApiAdminUserRole).not.toHaveBeenCalled();
  });

  it("refuses to change the caller's own role before calling the Account API", async () => {
    const result = await updateAdminUserRole(INITIAL_ADMIN_USER_ROLE_STATE, form(USER_ID));

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot change/i);
    expect(mocks.setAccountApiAdminUserRole).not.toHaveBeenCalled();
  });

  it("rejects an unknown role and a missing confirmation without calling the Account API", async () => {
    const unknown = await updateAdminUserRole(
      INITIAL_ADMIN_USER_ROLE_STATE,
      form(TARGET_ID, "superuser"),
    );
    const unconfirmed = await updateAdminUserRole(
      INITIAL_ADMIN_USER_ROLE_STATE,
      form(TARGET_ID, "admin", false),
    );

    expect(unknown.status).toBe("error");
    expect(unknown.message).toMatch(/available roles/i);
    expect(unconfirmed.status).toBe("error");
    expect(unconfirmed.message).toMatch(/confirm/i);
    expect(mocks.setAccountApiAdminUserRole).not.toHaveBeenCalled();
    expect(mocks.fetchAccountApiMe).not.toHaveBeenCalled();
  });

  it("explains a last-owner refusal from the Account API", async () => {
    mocks.setAccountApiAdminUserRole.mockRejectedValue(
      new AccountApiRequestError({
        status: 409,
        code: "last_owner_protected",
        message: "The last active Owner cannot be demoted or deactivated.",
        correlationId: "qt-1",
      }),
    );

    const result = await updateAdminUserRole(
      INITIAL_ADMIN_USER_ROLE_STATE,
      form(TARGET_ID, "user"),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/without an active owner/i);
  });
});
