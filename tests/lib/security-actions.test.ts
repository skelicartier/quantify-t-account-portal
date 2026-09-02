const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const CURRENT_EMAIL = "user@example.com";
const CURRENT_PASSWORD = "old-password-value";
const NEW_PASSWORD = "correct-horse-battery-staple";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  verifyCurrentPassword: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("@/lib/supabase/verification-client", () => ({
  verifyCurrentPassword: mocks.verifyCurrentPassword,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicConfiguration: () => ({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_test",
    siteUrl: "https://account.example.invalid",
    turnstileSiteKey: "turnstile",
    cookieOptions: { name: "sb-project-auth-token", secure: true },
  }),
}));

import {
  changeEmail,
  changePassword,
  confirmTotpEnrollment,
  removeTotpFactor,
  startTotpEnrollment,
} from "@/app/account/security/actions";
import { INITIAL_TOTP_ENROLLMENT_STATE } from "@/lib/auth/security-input";
import {
  INITIAL_EMAIL_CHANGE_STATE,
  INITIAL_PASSWORD_CHANGE_STATE,
} from "@/lib/auth/security-input";

type ClientOptions = {
  authenticated?: boolean;
  updateUserError?: unknown;
  signOutThrows?: boolean;
  signOutError?: unknown;
  factors?: Array<Record<string, unknown>>;
  factorsThrow?: boolean;
  currentLevel?: string | null;
  nextLevel?: string | null;
  levelError?: unknown;
  enrollResult?: unknown;
  challengeResult?: unknown;
  verifyResult?: unknown;
  unenrollError?: unknown;
};

function installClient(options: ClientOptions = {}) {
  const events: string[] = [];
  const getUser = vi.fn(async () => {
    events.push("getUser");
    const authenticated = options.authenticated ?? true;
    return {
      data: { user: authenticated ? { id: USER_ID, email: CURRENT_EMAIL } : null },
      error: authenticated ? null : { code: "bad_jwt" },
    };
  });
  const updateUser = vi.fn(async () => {
    events.push("updateUser");
    return { data: {}, error: options.updateUserError ?? null };
  });
  const signOut = vi.fn(async (scope?: unknown) => {
    events.push(`signOut:${JSON.stringify(scope)}`);
    if (options.signOutThrows) throw new Error("signOut failed");
    return { error: options.signOutError ?? null };
  });
  const listFactors = vi.fn(async () => {
    events.push("listFactors");
    if (options.factorsThrow) throw new Error("factor transport failed");
    return { data: { all: options.factors ?? [] }, error: null };
  });
  const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
    data: { currentLevel: options.currentLevel ?? "aal1", nextLevel: options.nextLevel ?? "aal1" },
    error: options.levelError ?? null,
  }));
  const enroll = vi.fn(async () => {
    events.push("enroll");
    return (
      options.enrollResult ?? {
        data: {
          id: "factor-new",
          totp: {
            qr_code: "data:image/svg+xml;utf-8,<svg/>",
            secret: "SECRETVALUE",
            uri: "otpauth://",
          },
        },
        error: null,
      }
    );
  });
  const challenge = vi.fn(async () => {
    events.push("challenge");
    return options.challengeResult ?? { data: { id: "challenge-1" }, error: null };
  });
  const verify = vi.fn(async () => {
    events.push("verify");
    return options.verifyResult ?? { data: {}, error: null };
  });
  const unenroll = vi.fn(async () => {
    events.push("unenroll");
    return { data: {}, error: options.unenrollError ?? null };
  });

  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: {
      getUser,
      updateUser,
      signOut,
      mfa: { listFactors, getAuthenticatorAssuranceLevel, enroll, challenge, verify, unenroll },
    },
  });

  return { events, getUser, updateUser, signOut, enroll, challenge, verify, unenroll };
}

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

const verifiedFactor = {
  id: "factor-verified",
  factor_type: "totp",
  status: "verified",
  friendly_name: "Phone",
  created_at: "2026-09-01T10:00:00.000Z",
};

const pendingFactor = { id: "factor-new", factor_type: "totp", status: "unverified" };

/** An AAL1 session on an account that has a verified factor: the challenge is owed. */
const UNSATISFIED: ClientOptions = {
  factors: [verifiedFactor],
  currentLevel: "aal1",
  nextLevel: "aal2",
};

/**
 * The same account, but with the provider helper reporting no factor requirement —
 * which is what a caller who strips `factors` from their own unsigned session cookie
 * would produce on the server. The attested factor list still shows the factor.
 */
const UNSATISFIED_WITH_TAMPERED_SESSION: ClientOptions = {
  factors: [verifiedFactor],
  currentLevel: "aal1",
  nextLevel: "aal1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCurrentPassword.mockResolvedValue("verified");
});

describe("password change action", () => {
  it("reauthenticates before updating and then signs out other sessions", async () => {
    const { events, updateUser } = installClient();

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(mocks.verifyCurrentPassword).toHaveBeenCalledWith(CURRENT_EMAIL, CURRENT_PASSWORD);
    // The assurance read comes first, before any password leaves the process.
    expect(events).toEqual(["listFactors", "getUser", "updateUser", 'signOut:{"scope":"others"}']);
    expect(updateUser).toHaveBeenCalledWith({ password: NEW_PASSWORD });
    expect(result).toMatchObject({ status: "success" });
    expect(result.message).toContain("were signed out");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/security");
  });

  it("rejects a wrong current password without touching the account", async () => {
    mocks.verifyCurrentPassword.mockResolvedValue("rejected");
    const { events, updateUser } = installClient();

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(result.status).toBe("error");
    expect(result.fieldErrors.currentPassword[0]).toBe("That password is not correct.");
    expect(updateUser).not.toHaveBeenCalled();
    expect(events).toEqual(["listFactors", "getUser"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when reauthentication is unavailable", async () => {
    mocks.verifyCurrentPassword.mockResolvedValue("unavailable");
    const { updateUser } = installClient();

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain("temporarily unavailable");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("reports failure when the provider rejects the update", async () => {
    installClient({ updateUserError: { message: "weak password" } });

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain("weak password");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["a thrown sign-out", { signOutThrows: true }],
    ["a reported sign-out failure", { signOutError: { message: "cannot revoke" } }],
  ])("succeeds but does not claim other sessions died on %s", async (_label, options) => {
    installClient(options);

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    // The password is already rotated, so this is a success — but the copy must not
    // tell the owner that other sessions were signed out when they were not.
    expect(result.status).toBe("success");
    expect(result.message).toContain("could not be signed out");
    expect(result.message).not.toContain("were signed out");
    expect(JSON.stringify(result)).not.toContain("cannot revoke");
  });

  it("never verifies or updates without a verified caller", async () => {
    const { updateUser } = installClient({ authenticated: false });

    const result = await changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm());

    expect(result.status).toBe("error");
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe("email change action", () => {
  it("reauthenticates, then requests confirmation through the email-change callback", async () => {
    const { updateUser } = installClient();

    const result = await changeEmail(INITIAL_EMAIL_CHANGE_STATE, emailForm());

    expect(mocks.verifyCurrentPassword).toHaveBeenCalledWith(CURRENT_EMAIL, CURRENT_PASSWORD);
    expect(updateUser).toHaveBeenCalledWith(
      { email: "new.address@example.com" },
      { emailRedirectTo: "https://account.example.invalid/auth/confirm?flow=email-change" },
    );
    expect(result.status).toBe("success");
    expect(result.message).toContain("both");
  });

  it("refuses the address that is already verified", async () => {
    const { updateUser } = installClient();

    const result = await changeEmail(
      INITIAL_EMAIL_CHANGE_STATE,
      emailForm({ email: CURRENT_EMAIL }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors.email[0]).toContain("already your verified email");
    expect(updateUser).not.toHaveBeenCalled();
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
  });

  it("rejects a wrong current password", async () => {
    mocks.verifyCurrentPassword.mockResolvedValue("rejected");
    const { updateUser } = installClient();

    const result = await changeEmail(INITIAL_EMAIL_CHANGE_STATE, emailForm());

    expect(result.fieldErrors.currentPassword[0]).toBe("That password is not correct.");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("gives one generic outcome when the provider rejects the address", async () => {
    installClient({ updateUserError: { code: "email_exists", message: "already registered" } });

    const result = await changeEmail(INITIAL_EMAIL_CHANGE_STATE, emailForm());

    expect(result.status).toBe("error");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("already registered");
    expect(serialized).not.toContain("email_exists");
  });
});

describe("TOTP enrollment actions", () => {
  it("reauthenticates, then clears abandoned unverified factors before enrolling", async () => {
    const { events, unenroll } = installClient({
      factors: [{ id: "factor-stale", factor_type: "totp", status: "unverified" }],
    });

    const state = await startTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, enrollmentForm());

    expect(mocks.verifyCurrentPassword).toHaveBeenCalledWith(CURRENT_EMAIL, CURRENT_PASSWORD);
    expect(unenroll).toHaveBeenCalledWith({ factorId: "factor-stale" });
    expect(events).toEqual(["listFactors", "getUser", "unenroll", "enroll"]);
    expect(state).toMatchObject({
      status: "pending-verification",
      factorId: "factor-new",
      secret: "SECRETVALUE",
    });
  });

  it("refuses to start enrollment without the current password", async () => {
    const { events, enroll } = installClient();

    const state = await startTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, new FormData());

    expect(state.status).toBe("error");
    expect(state.fieldErrors.currentPassword[0]).toContain("current password");
    expect(events).toEqual([]);
    expect(enroll).not.toHaveBeenCalled();
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
  });

  it("refuses to start enrollment on a wrong current password", async () => {
    mocks.verifyCurrentPassword.mockResolvedValue("rejected");
    const { enroll } = installClient();

    const state = await startTotpEnrollment(
      INITIAL_TOTP_ENROLLMENT_STATE,
      enrollmentForm("wrong-password"),
    );

    // Otherwise a stolen password-less session could enroll its own authenticator and
    // leave the owner needing an identity-verified support review.
    expect(state.status).toBe("error");
    expect(state.fieldErrors.currentPassword[0]).toBe("That password is not correct.");
    expect(enroll).not.toHaveBeenCalled();
  });

  it("fails closed when reauthentication is unavailable", async () => {
    mocks.verifyCurrentPassword.mockResolvedValue("unavailable");
    const { enroll } = installClient();

    const state = await startTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, enrollmentForm());

    expect(state.status).toBe("error");
    expect(state.message).toContain("temporarily unavailable");
    expect(enroll).not.toHaveBeenCalled();
  });

  it("refuses a second authenticator while one is already verified", async () => {
    const { enroll } = installClient({
      factors: [verifiedFactor],
      currentLevel: "aal2",
      nextLevel: "aal2",
    });

    const state = await startTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, enrollmentForm());

    expect(state.status).toBe("error");
    expect(state.message).toContain("already set up");
    expect(enroll).not.toHaveBeenCalled();
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
  });

  it("verifies a challenge to complete enrollment", async () => {
    const { events } = installClient({ factors: [pendingFactor] });

    const state = await confirmTotpEnrollment(
      { ...INITIAL_TOTP_ENROLLMENT_STATE, factorId: "factor-new" },
      codeForm(),
    );

    expect(events).toEqual(["listFactors", "getUser", "challenge", "verify"]);
    expect(state.status).toBe("success");
    // The secret is dropped once the factor is verified.
    expect(state.secret).toBeNull();
    expect(state.qrCode).toBeNull();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/security");
  });

  it("refuses a factor id the provider does not report as pending", async () => {
    const { events, challenge } = installClient({ factors: [verifiedFactor] });

    const state = await confirmTotpEnrollment(
      { ...INITIAL_TOTP_ENROLLMENT_STATE, factorId: "factor-verified" },
      codeForm("123456", "factor-verified"),
    );

    // The form is not a source of factor ids: only this caller's own pending
    // enrollment may be challenged.
    expect(state.status).toBe("error");
    expect(challenge).not.toHaveBeenCalled();
    expect(events).toEqual(["listFactors"]);
  });

  it("keeps the enrollment open and reports a rejected code", async () => {
    installClient({
      factors: [pendingFactor],
      verifyResult: { data: null, error: { message: "invalid code" } },
    });
    const previous = {
      ...INITIAL_TOTP_ENROLLMENT_STATE,
      factorId: "factor-new",
      qrCode: "data:image/svg+xml;utf-8,<svg/>",
      secret: "SECRETVALUE",
    };

    const state = await confirmTotpEnrollment(previous, codeForm("000000"));

    expect(state.status).toBe("pending-verification");
    expect(state.factorId).toBe("factor-new");
    expect(state.fieldErrors.code[0]).toContain("not valid");
    expect(JSON.stringify(state)).not.toContain("invalid code");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed code before contacting the provider", async () => {
    const { events } = installClient({ factors: [pendingFactor] });

    const state = await confirmTotpEnrollment(
      { ...INITIAL_TOTP_ENROLLMENT_STATE, factorId: "factor-new" },
      codeForm("12x456"),
    );

    expect(state.status).toBe("pending-verification");
    expect(state.fieldErrors.code[0]).toContain("6-digit");
    expect(events).toEqual([]);
  });
});

describe("factor removal action", () => {
  it("requires the current password and only removes a verified owned factor", async () => {
    const { events, unenroll } = installClient({
      factors: [verifiedFactor],
      currentLevel: "aal2",
      nextLevel: "aal2",
    });

    const state = await removeTotpFactor(INITIAL_TOTP_ENROLLMENT_STATE, removalForm());

    expect(mocks.verifyCurrentPassword).toHaveBeenCalledWith(CURRENT_EMAIL, CURRENT_PASSWORD);
    expect(unenroll).toHaveBeenCalledWith({ factorId: "factor-verified" });
    expect(events).toEqual(["listFactors", "getUser", "unenroll"]);
    expect(state.status).toBe("success");
  });

  it("removes a second verified factor and does not claim password-only sign-in", async () => {
    const secondFactor = { ...verifiedFactor, id: "factor-second", friendly_name: "Backup" };
    const { unenroll } = installClient({
      factors: [verifiedFactor, secondFactor],
      currentLevel: "aal2",
      nextLevel: "aal2",
    });

    const state = await removeTotpFactor(
      INITIAL_TOTP_ENROLLMENT_STATE,
      removalForm("factor-second"),
    );

    expect(unenroll).toHaveBeenCalledWith({ factorId: "factor-second" });
    expect(state.status).toBe("success");
    // One factor remains, so telling the owner sign-in is password-only would be false.
    expect(state.message).toContain("still required at sign-in");
    expect(state.message).not.toContain("only your password");
  });

  it("reports password-only sign-in when the last factor is removed", async () => {
    installClient({ factors: [verifiedFactor], currentLevel: "aal2", nextLevel: "aal2" });

    const state = await removeTotpFactor(INITIAL_TOTP_ENROLLMENT_STATE, removalForm());

    expect(state.message).toContain("only your password");
  });

  it("gives every enrollment attempt a distinct friendly name", async () => {
    const { enroll } = installClient();
    const names = new Set<string>();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await startTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, enrollmentForm());
      const lastCall = enroll.mock.calls.at(-1) as Array<{ friendlyName?: string }> | undefined;
      names.add(String(lastCall?.[0]?.friendlyName));
    }

    // A name derived from the date alone collides with a surviving unverified factor
    // and the provider then refuses every further attempt until the next day.
    expect(names.size).toBe(3);
  });

  it("refuses a factor the provider does not report as verified", async () => {
    const { unenroll } = installClient({
      factors: [{ id: "factor-other", factor_type: "totp", status: "unverified" }],
    });

    const state = await removeTotpFactor(
      INITIAL_TOTP_ENROLLMENT_STATE,
      removalForm("factor-other"),
    );

    expect(state.status).toBe("error");
    expect(unenroll).not.toHaveBeenCalled();
  });

  it("refuses removal on a wrong current password", async () => {
    mocks.verifyCurrentPassword.mockResolvedValue("rejected");
    const { unenroll } = installClient({
      factors: [verifiedFactor],
      currentLevel: "aal2",
      nextLevel: "aal2",
    });

    const state = await removeTotpFactor(
      INITIAL_TOTP_ENROLLMENT_STATE,
      removalForm("factor-verified", "wrong-password"),
    );

    expect(state.fieldErrors.currentPassword[0]).toBe("That password is not correct.");
    expect(unenroll).not.toHaveBeenCalled();
  });

  it("rejects a submission with no password before contacting the provider", async () => {
    const { events } = installClient({ factors: [verifiedFactor] });
    const data = new FormData();
    data.set("factorId", "factor-verified");

    const state = await removeTotpFactor(INITIAL_TOTP_ENROLLMENT_STATE, data);

    expect(state.status).toBe("error");
    expect(events).toEqual([]);
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
  });
});

describe("assurance enforcement on security actions", () => {
  it.each([
    ["changePassword", () => changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm())],
    ["changeEmail", () => changeEmail(INITIAL_EMAIL_CHANGE_STATE, emailForm())],
    [
      "startTotpEnrollment",
      () => startTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, enrollmentForm()),
    ],
    [
      "confirmTotpEnrollment",
      () => confirmTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, codeForm()),
    ],
    ["removeTotpFactor", () => removeTotpFactor(INITIAL_TOTP_ENROLLMENT_STATE, removalForm())],
  ])("%s refuses a session that still owes its second factor", async (_label, run) => {
    // The action is its own endpoint: the page guard cannot protect it, and an
    // attacker who knows the password passes reauthentication by definition.
    const { updateUser, enroll, challenge, unenroll } = installClient(UNSATISFIED);

    const state = await run();

    expect(state.status).toBe("error");
    expect(state.message).toContain("authenticator code");
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
    expect(challenge).not.toHaveBeenCalled();
    expect(unenroll).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["changePassword", () => changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm())],
    ["changeEmail", () => changeEmail(INITIAL_EMAIL_CHANGE_STATE, emailForm())],
    [
      "startTotpEnrollment",
      () => startTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, enrollmentForm()),
    ],
    [
      "confirmTotpEnrollment",
      () => confirmTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, codeForm()),
    ],
    ["removeTotpFactor", () => removeTotpFactor(INITIAL_TOTP_ENROLLMENT_STATE, removalForm())],
  ])("%s still refuses when the session's own factor list is stripped", async (_label, run) => {
    // On the server the provider helper reads an unsigned cookie, so its factor
    // requirement is caller-controlled. The decision must come from the attested
    // list instead, or deleting one cookie key would switch this whole layer off.
    const { updateUser, enroll, challenge, unenroll } = installClient(
      UNSATISFIED_WITH_TAMPERED_SESSION,
    );

    const state = await run();

    expect(state.status).toBe("error");
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
    expect(challenge).not.toHaveBeenCalled();
    expect(unenroll).not.toHaveBeenCalled();
  });

  it.each([
    ["changePassword", () => changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm())],
    ["changeEmail", () => changeEmail(INITIAL_EMAIL_CHANGE_STATE, emailForm())],
  ])("%s fails closed when the assurance level cannot be read", async (_label, run) => {
    const { updateUser } = installClient({ levelError: { message: "session unreadable" } });

    const state = await run();

    expect(state.status).toBe("error");
    expect(state.message).toContain("temporarily unavailable");
    expect(updateUser).not.toHaveBeenCalled();
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
  });

  it.each([
    ["changePassword", () => changePassword(INITIAL_PASSWORD_CHANGE_STATE, passwordForm())],
    ["changeEmail", () => changeEmail(INITIAL_EMAIL_CHANGE_STATE, emailForm())],
    [
      "startTotpEnrollment",
      () => startTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, enrollmentForm()),
    ],
    [
      "confirmTotpEnrollment",
      () => confirmTotpEnrollment(INITIAL_TOTP_ENROLLMENT_STATE, codeForm()),
    ],
    ["removeTotpFactor", () => removeTotpFactor(INITIAL_TOTP_ENROLLMENT_STATE, removalForm())],
  ])("%s refuses on an unreadable factor inventory", async (_label, run) => {
    // Without the attested list there is no honest answer to "is a factor owed", and a
    // refused mutation is a retry while an allowed one is unrecoverable.
    const { updateUser, enroll, challenge, unenroll } = installClient({ factorsThrow: true });

    const state = await run();

    expect(state.status).toBe("error");
    expect(state.message).toContain("temporarily unavailable");
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
    expect(challenge).not.toHaveBeenCalled();
    expect(unenroll).not.toHaveBeenCalled();
  });
});
