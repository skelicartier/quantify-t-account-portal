const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const CURRENT_EMAIL = "user@example.com";
const CURRENT_PASSWORD = "old-password-value";
const NEW_PASSWORD = "correct-horse-battery-staple";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  verifyCurrentPassword: vi.fn(),
  requireMutationAssurance: vi.fn(),
  AzureAuthClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/supabase/verification-client", () => ({
  verifyCurrentPassword: mocks.verifyCurrentPassword,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({
  requireMutationAssurance: mocks.requireMutationAssurance,
}));
vi.mock("@/lib/azure-auth-config", () => ({
  getAzureAuthConfig: () => ({
    apiUrl: "https://account-api.example.com",
    cookieName: "qt-session",
    refreshTokenName: "qt-refresh",
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  }),
}));
vi.mock("@/lib/azure-auth-client", () => ({
  AzureAuthClient: mocks.AzureAuthClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  changeEmail,
  changePassword,
  confirmTotpEnrollment,
  removeTotpFactor,
  startTotpEnrollment,
} from "@/app/account/security/actions";
import {
  INITIAL_EMAIL_CHANGE_STATE,
  INITIAL_PASSWORD_CHANGE_STATE,
  INITIAL_TOTP_ENROLLMENT_STATE,
} from "@/lib/auth/security-input";

function passwordForm(overrides: Partial<Record<string, string>> = {}): FormData {
  const data = new FormData();
  data.set("currentPassword", overrides.currentPassword ?? CURRENT_PASSWORD);
  data.set("password", overrides.password ?? NEW_PASSWORD);
  data.set("passwordConfirmation", overrides.passwordConfirmation ?? NEW_PASSWORD);
  return data;
}

function emailForm(overrides: Partial<Record<string, string>> = {}): FormData {
  const data = new FormData();
  data.set("currentPassword", overrides.currentPassword ?? CURRENT_PASSWORD);
  data.set("email", overrides.email ?? "new.address@example.com");
  return data;
}

function codeForm(code = "123456", factorId = "factor-new"): FormData {
  const data = new FormData();
  data.set("factorId", factorId);
  data.set("code", code);
  return data;
}

function enrollmentForm(currentPassword = CURRENT_PASSWORD): FormData {
  const data = new FormData();
  data.set("currentPassword", currentPassword);
  return data;
}

function removalForm(factorId = "factor-verified", currentPassword = CURRENT_PASSWORD): FormData {
  const data = new FormData();
  data.set("currentPassword", currentPassword);
  data.set("factorId", factorId);
  return data;
}

function installAzure(options: { authenticated?: boolean; accessToken?: string | null } = {}) {
  const user =
    options.authenticated === false
      ? null
      : {
          id: USER_ID,
          email: CURRENT_EMAIL,
          first_name: "Avery",
          last_name: "Stone",
          is_active: true,
          email_confirmed: true,
          role: "user",
          profile: null,
        };
  const azure = {
    getUser: vi.fn(async () => user),
    getAccessToken: vi.fn(() =>
      Object.prototype.hasOwnProperty.call(options, "accessToken")
        ? (options.accessToken ?? null)
        : "access-token",
    ),
  };
  mocks.createServerAzureClient.mockResolvedValue(azure);
  return azure;
}

function satisfyAssurance(extra: Record<string, unknown> = {}) {
  mocks.requireMutationAssurance.mockResolvedValue({
    decision: "satisfied",
    assurance: {
      verifiedTotpFactors: [],
      unverifiedTotpFactorIds: [],
      currentLevel: "aal1",
      requiredLevel: "aal1",
      mfaEnrolled: false,
      challengeRequired: false,
      levelReadable: true,
      factorsReadable: true,
      ...extra,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  satisfyAssurance();
  installAzure();
  mocks.verifyCurrentPassword.mockResolvedValue("verified");
  mocks.AzureAuthClient.mockImplementation(function (this: Record<string, unknown>) {
    // The service answers with how many other sessions it ended; -1 means it could not.
    this.updatePassword = vi.fn().mockResolvedValue(-1);
  });
});

describe("password change action", () => {
  it("reauthenticates before updating through the Azure Account API", async () => {
    const authClient = { updatePassword: vi.fn().mockResolvedValue(-1) };
    mocks.AzureAuthClient.mockImplementation(function (this: Record<string, unknown>) {
      this.updatePassword = authClient.updatePassword;
    });

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(mocks.verifyCurrentPassword).toHaveBeenCalledWith(CURRENT_EMAIL, CURRENT_PASSWORD);
    expect(mocks.AzureAuthClient).toHaveBeenCalledWith("https://account-api.example.com");
    // The current password goes to the service too. Reauthenticating here is a convenience
    // for the person typing; the service holds the credential and used to accept a bearer
    // token and a new password with nothing else.
    expect(authClient.updatePassword).toHaveBeenCalledWith(
      "access-token",
      NEW_PASSWORD,
      CURRENT_PASSWORD,
    );
    expect(result).toMatchObject({ status: "success" });
    expect(result.message).toContain("could not be signed out");
    expect(JSON.stringify(result)).not.toContain(NEW_PASSWORD);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/security");
  });

  it("rejects a wrong current password without touching the account", async () => {
    mocks.verifyCurrentPassword.mockResolvedValue("rejected");
    const authClient = { updatePassword: vi.fn().mockResolvedValue(-1) };
    mocks.AzureAuthClient.mockImplementation(function (this: Record<string, unknown>) {
      this.updatePassword = authClient.updatePassword;
    });

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(result.status).toBe("error");
    expect(result.fieldErrors.currentPassword[0]).toBe("That password is not correct.");
    expect(authClient.updatePassword).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when no Azure access token is available", async () => {
    installAzure({ accessToken: null });
    const authClient = { updatePassword: vi.fn().mockResolvedValue(-1) };
    mocks.AzureAuthClient.mockImplementation(function (this: Record<string, unknown>) {
      this.updatePassword = authClient.updatePassword;
    });

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain("temporarily unavailable");
    expect(authClient.updatePassword).not.toHaveBeenCalled();
  });

  it("does not expose provider details when the password update fails", async () => {
    const authClient = {
      updatePassword: vi.fn().mockRejectedValue(new Error("Sensitive provider detail")),
    };
    mocks.AzureAuthClient.mockImplementation(function (this: Record<string, unknown>) {
      this.updatePassword = authClient.updatePassword;
    });

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain("Sensitive provider detail");
  });
});

describe("source-locked security actions", () => {
  it("keeps Azure email change unavailable after reauthentication", async () => {
    const result = await changeEmail(INITIAL_EMAIL_CHANGE_STATE, emailForm());

    expect(mocks.verifyCurrentPassword).toHaveBeenCalledWith(CURRENT_EMAIL, CURRENT_PASSWORD);
    expect(result.status).toBe("error");
    expect(result.message).toContain("temporarily unavailable");
  });

  it("still rejects the already-verified address before reauthentication", async () => {
    const result = await changeEmail(
      INITIAL_EMAIL_CHANGE_STATE,
      emailForm({ email: CURRENT_EMAIL }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors.email[0]).toContain("already your verified email");
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
  });

  it("keeps Azure TOTP enrollment unavailable", async () => {
    const state = await startTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, enrollmentForm());

    expect(state.status).toBe("error");
    expect(state.message).toContain("temporarily unavailable");
  });

  it("keeps Azure TOTP verification unavailable even for a pending factor id", async () => {
    satisfyAssurance({ unverifiedTotpFactorIds: ["factor-new"] });

    const state = await confirmTotpEnrollment(
      { ...INITIAL_TOTP_ENROLLMENT_STATE, factorId: "factor-new" },
      codeForm(),
    );

    expect(state.status).toBe("error");
    expect(state.message).toContain("temporarily unavailable");
  });

  it("keeps Azure TOTP removal unavailable after password verification", async () => {
    satisfyAssurance({
      verifiedTotpFactors: [{ id: "factor-verified", friendlyName: "Phone", createdAt: null }],
    });

    const state = await removeTotpFactor(INITIAL_TOTP_ENROLLMENT_STATE, removalForm());

    expect(mocks.verifyCurrentPassword).toHaveBeenCalledWith(CURRENT_EMAIL, CURRENT_PASSWORD);
    expect(state.status).toBe("error");
    expect(state.message).toContain("temporarily unavailable");
  });

  it("refuses all security changes before reauthentication when a challenge is owed", async () => {
    mocks.requireMutationAssurance.mockResolvedValue({
      decision: "challenge-required",
      assurance: {},
    });

    const state = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(state.status).toBe("error");
    expect(state.message).toContain("passkey");
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
  });
});

describe("password change reports what happened to the other sessions", () => {
  function clientReturning(count: number) {
    const authClient = { updatePassword: vi.fn().mockResolvedValue(count) };
    mocks.AzureAuthClient.mockImplementation(function (this: Record<string, unknown>) {
      this.updatePassword = authClient.updatePassword;
    });
    return authClient;
  }

  it("says they were signed out when the service ended some", async () => {
    clientReturning(3);

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(result).toMatchObject({ status: "success" });
    expect(result.message).toContain("Other signed-in sessions were signed out");
  });

  it("says there were none rather than implying a failure", async () => {
    clientReturning(0);

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(result.message).toContain("No other sessions were signed in");
  });

  it("still tells the truth when the service could not end them", async () => {
    clientReturning(-1);

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(result.message).toContain("could not be signed out");
  });
});
