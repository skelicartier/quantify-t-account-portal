import type { AccountApiMe } from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";
import { INITIAL_ADMIN_USER_ACTIVATION_STATE } from "@/lib/admin/user-activation";
import { INITIAL_ADMIN_USER_SESSION_REVOCATION_STATE } from "@/lib/admin/user-session-revocation";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const TARGET_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";
const SESSION_ID = "8e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  fetchAccountApiMe: vi.fn(),
  getCurrentAssurance: vi.fn(),
  revalidatePath: vi.fn(),
  revokeAccountApiAdminUserSession: vi.fn(),
  setAccountApiAdminUserActive: vi.fn(),
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
    revokeAccountApiAdminUserSession: mocks.revokeAccountApiAdminUserSession,
    setAccountApiAdminUserActive: mocks.setAccountApiAdminUserActive,
  };
});

import {
  revokeAdminUserSession,
  updateAdminUserActivation,
} from "@/app/admin/users/[userId]/actions";

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
  capabilities: [
    "account:read-self",
    "account:read-any",
    "users:set-active",
    "sessions:revoke-any",
  ],
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

function form(userId = TARGET_ID, isActive = false): FormData {
  const data = new FormData();
  data.set("userId", userId);
  data.set("isActive", String(isActive));
  return data;
}

function revokeForm(userId = TARGET_ID, sessionId = SESSION_ID): FormData {
  const data = new FormData();
  data.set("userId", userId);
  data.set("sessionId", sessionId);
  return data;
}

describe("admin user activation action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerAzureClient.mockResolvedValue({
      getAccessToken: () => "token",
    });
    mocks.fetchAccountApiMe.mockResolvedValue(me);
    mocks.getCurrentAssurance.mockResolvedValue(assurance);
    mocks.revokeAccountApiAdminUserSession.mockResolvedValue({ ok: true });
    mocks.setAccountApiAdminUserActive.mockResolvedValue({ ok: true });
  });

  it("posts activation through the Account API with a server idempotency key", async () => {
    const result = await updateAdminUserActivation(INITIAL_ADMIN_USER_ACTIVATION_STATE, form());

    expect(result).toEqual({ status: "success", message: "User deactivated." });
    expect(mocks.setAccountApiAdminUserActive).toHaveBeenCalledWith("token", TARGET_ID, false, {
      idempotencyKey: expect.stringMatching(/^portal-/u),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/users/${TARGET_ID}`);
  });

  it("refuses when the Account API did not grant activation", async () => {
    mocks.fetchAccountApiMe.mockResolvedValue({
      ...me,
      capabilities: ["account:read-self", "account:read-any"],
    });

    const result = await updateAdminUserActivation(INITIAL_ADMIN_USER_ACTIVATION_STATE, form());

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot change/i);
    expect(mocks.setAccountApiAdminUserActive).not.toHaveBeenCalled();
  });

  it("requires AAL2 before posting the status change", async () => {
    mocks.getCurrentAssurance.mockResolvedValue({
      ...assurance,
      currentLevel: "aal1",
      challengeRequired: true,
    });

    const result = await updateAdminUserActivation(INITIAL_ADMIN_USER_ACTIVATION_STATE, form());

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/passkey/i);
    expect(mocks.setAccountApiAdminUserActive).not.toHaveBeenCalled();
  });

  it("asks for the passkey again when the session's confirmation is no longer recent", async () => {
    // Reading is still open to this session; the service wants a proof from the last
    // quarter of an hour before it changes who somebody is.
    const passkey = {
      mode: "when-enrolled" as const,
      staff: true,
      enrolled: true,
      count: 1,
      required: true,
      verified: true,
      fresh: false,
      verifiedUntil: "2026-11-21T21:00:00Z",
      freshUntil: null,
    };
    mocks.getCurrentAssurance.mockResolvedValue({
      ...assurance,
      currentLevel: "aal2",
      requiredLevel: "aal2",
      mfaEnrolled: true,
      passkey,
    });

    const stale = await updateAdminUserActivation(INITIAL_ADMIN_USER_ACTIVATION_STATE, form());

    expect(stale.status).toBe("error");
    expect(stale.message).toMatch(/passkey/i);
    expect(mocks.setAccountApiAdminUserActive).not.toHaveBeenCalled();

    mocks.getCurrentAssurance.mockResolvedValue({
      ...assurance,
      currentLevel: "aal2",
      requiredLevel: "aal2",
      mfaEnrolled: true,
      passkey: { ...passkey, fresh: true, freshUntil: "2026-11-21T09:15:00Z" },
    });

    const fresh = await updateAdminUserActivation(INITIAL_ADMIN_USER_ACTIVATION_STATE, form());

    expect(fresh.status).toBe("success");
    expect(mocks.setAccountApiAdminUserActive).toHaveBeenCalledTimes(1);
  });

  it("refuses self-deactivation before calling the Account API", async () => {
    const result = await updateAdminUserActivation(
      INITIAL_ADMIN_USER_ACTIVATION_STATE,
      form(USER_ID, false),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot change/i);
    expect(mocks.setAccountApiAdminUserActive).not.toHaveBeenCalled();
  });
});

describe("admin user session revocation action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerAzureClient.mockResolvedValue({
      getAccessToken: () => "token",
    });
    mocks.fetchAccountApiMe.mockResolvedValue(me);
    mocks.getCurrentAssurance.mockResolvedValue(assurance);
    mocks.revokeAccountApiAdminUserSession.mockResolvedValue({ ok: true });
    mocks.setAccountApiAdminUserActive.mockResolvedValue({ ok: true });
  });

  it("posts session revocation through the Account API with a server idempotency key", async () => {
    const result = await revokeAdminUserSession(
      INITIAL_ADMIN_USER_SESSION_REVOCATION_STATE,
      revokeForm(),
    );

    expect(result).toEqual({ status: "success", message: "Session revoke recorded." });
    expect(mocks.revokeAccountApiAdminUserSession).toHaveBeenCalledWith(
      "token",
      TARGET_ID,
      SESSION_ID,
      {
        idempotencyKey: expect.stringMatching(/^portal-/u),
        reason: "admin-revoked",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/users/${TARGET_ID}`);
  });

  it("refuses when the Account API did not grant session revocation", async () => {
    mocks.fetchAccountApiMe.mockResolvedValue({
      ...me,
      capabilities: ["account:read-self", "account:read-any", "users:set-active"],
    });

    const result = await revokeAdminUserSession(
      INITIAL_ADMIN_USER_SESSION_REVOCATION_STATE,
      revokeForm(),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot change/i);
    expect(mocks.revokeAccountApiAdminUserSession).not.toHaveBeenCalled();
  });

  it("requires AAL2 before posting the session revocation", async () => {
    mocks.getCurrentAssurance.mockResolvedValue({
      ...assurance,
      currentLevel: "aal1",
      challengeRequired: true,
    });

    const result = await revokeAdminUserSession(
      INITIAL_ADMIN_USER_SESSION_REVOCATION_STATE,
      revokeForm(),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/passkey/i);
    expect(mocks.revokeAccountApiAdminUserSession).not.toHaveBeenCalled();
  });

  it("refuses self-session revocation before calling the Account API", async () => {
    const result = await revokeAdminUserSession(
      INITIAL_ADMIN_USER_SESSION_REVOCATION_STATE,
      revokeForm(USER_ID),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot change/i);
    expect(mocks.revokeAccountApiAdminUserSession).not.toHaveBeenCalled();
  });
});
