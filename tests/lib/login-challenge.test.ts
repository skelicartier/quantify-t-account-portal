const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { login, verifyLoginChallenge } from "@/app/login/actions";
import { INITIAL_LOGIN_CHALLENGE_STATE, INITIAL_LOGIN_STATE } from "@/lib/auth/login";

type ClientOptions = {
  signInError?: unknown;
  factors?: Array<Record<string, unknown>>;
  currentLevel?: string | null;
  nextLevel?: string | null;
  challengeResult?: unknown;
  verifyResult?: unknown;
  assuranceThrows?: boolean;
};

function installClient(options: ClientOptions = {}) {
  const events: string[] = [];
  const signInWithPassword = vi.fn(async () => {
    events.push("signInWithPassword");
    return { data: {}, error: options.signInError ?? null };
  });
  const listFactors = vi.fn(async () => {
    events.push("listFactors");
    if (options.assuranceThrows) throw new Error("transport failed");
    return { data: { all: options.factors ?? [] }, error: null };
  });
  const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
    data: { currentLevel: options.currentLevel ?? "aal1", nextLevel: options.nextLevel ?? "aal1" },
    error: null,
  }));
  const challenge = vi.fn(async () => {
    events.push("challenge");
    return options.challengeResult ?? { data: { id: "challenge-1" }, error: null };
  });
  const verify = vi.fn(async () => {
    events.push("verify");
    return options.verifyResult ?? { data: {}, error: null };
  });

  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: {
      signInWithPassword,
      mfa: { listFactors, getAuthenticatorAssuranceLevel, challenge, verify },
    },
  });

  return { events, signInWithPassword, challenge, verify };
}

const verifiedFactor = {
  id: "factor-verified",
  factor_type: "totp",
  status: "verified",
};

function loginForm(next = "/account/security"): FormData {
  const data = new FormData();
  data.set("email", "user@example.com");
  data.set("password", "correct-horse-battery-staple");
  data.set("cf-turnstile-response", "turnstile-token");
  data.set("next", next);
  return data;
}

function challengeForm(code = "123456", next = "/account/security"): FormData {
  const data = new FormData();
  data.set("code", code);
  data.set("next", next);
  return data;
}

beforeEach(() => vi.clearAllMocks());

describe("login with a second factor", () => {
  it("stops at the challenge instead of redirecting when a factor is unsatisfied", async () => {
    installClient({ factors: [verifiedFactor], currentLevel: "aal1", nextLevel: "aal2" });

    const state = await login(INITIAL_LOGIN_STATE, loginForm());

    expect(state.status).toBe("mfa-required");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects normally when no factor is enrolled", async () => {
    installClient({ currentLevel: "aal1", nextLevel: "aal1" });

    await expect(login(INITIAL_LOGIN_STATE, loginForm())).rejects.toThrowError(
      "NEXT_REDIRECT:/account/security",
    );
  });

  it("redirects normally when the session already satisfies the factor", async () => {
    installClient({ factors: [verifiedFactor], currentLevel: "aal2", nextLevel: "aal2" });

    await expect(login(INITIAL_LOGIN_STATE, loginForm("/account"))).rejects.toThrowError(
      "NEXT_REDIRECT:/account",
    );
  });

  it("does not resolve assurance when the password is rejected", async () => {
    const { events } = installClient({ signInError: { code: "invalid_credentials" } });

    const state = await login(INITIAL_LOGIN_STATE, loginForm());

    expect(state.status).toBe("error");
    expect(events).toEqual(["signInWithPassword"]);
  });
});

describe("login challenge verification", () => {
  it("ignores any factor id in the submission entirely", async () => {
    const { challenge } = installClient({
      factors: [verifiedFactor],
      currentLevel: "aal1",
      nextLevel: "aal2",
    });
    const tampered = challengeForm();
    tampered.set("factorId", "attacker-factor");

    await expect(
      verifyLoginChallenge(INITIAL_LOGIN_CHALLENGE_STATE, tampered),
    ).rejects.toThrowError("NEXT_REDIRECT:/account/security");

    expect(challenge).toHaveBeenCalledWith({ factorId: "factor-verified" });
    expect(challenge).toHaveBeenCalledTimes(1);
  });

  it("tries each verified factor so a second authenticator still works", async () => {
    const secondFactor = { ...verifiedFactor, id: "factor-second" };
    const verifyResults = [{ data: null, error: { message: "invalid totp" } }, { error: null }];
    const { challenge, verify } = installClient({
      factors: [verifiedFactor, secondFactor],
      currentLevel: "aal1",
      nextLevel: "aal2",
    });
    verify.mockImplementation(async () => verifyResults.shift() ?? { error: null });

    await expect(
      verifyLoginChallenge(INITIAL_LOGIN_CHALLENGE_STATE, challengeForm()),
    ).rejects.toThrowError("NEXT_REDIRECT:/account/security");

    expect(challenge).toHaveBeenNthCalledWith(1, { factorId: "factor-verified" });
    expect(challenge).toHaveBeenNthCalledWith(2, { factorId: "factor-second" });
  });

  it("stops at the first factor that accepts the code", async () => {
    const secondFactor = { ...verifiedFactor, id: "factor-second" };
    const { challenge } = installClient({
      factors: [verifiedFactor, secondFactor],
      currentLevel: "aal1",
      nextLevel: "aal2",
    });

    await expect(
      verifyLoginChallenge(INITIAL_LOGIN_CHALLENGE_STATE, challengeForm()),
    ).rejects.toThrowError("NEXT_REDIRECT:/account/security");

    expect(challenge).toHaveBeenCalledTimes(1);
  });

  it("uses a provider-verified factor, not the submitted id, then redirects", async () => {
    const { challenge, verify } = installClient({
      factors: [verifiedFactor],
      currentLevel: "aal1",
      nextLevel: "aal2",
    });

    await expect(
      verifyLoginChallenge(INITIAL_LOGIN_CHALLENGE_STATE, challengeForm()),
    ).rejects.toThrowError("NEXT_REDIRECT:/account/security");

    expect(challenge).toHaveBeenCalledWith({ factorId: "factor-verified" });
    expect(verify).toHaveBeenCalledWith({
      factorId: "factor-verified",
      challengeId: "challenge-1",
      code: "123456",
    });
  });

  it("confines the post-challenge redirect to the account area", async () => {
    installClient({ factors: [verifiedFactor], currentLevel: "aal1", nextLevel: "aal2" });

    await expect(
      verifyLoginChallenge(
        INITIAL_LOGIN_CHALLENGE_STATE,
        challengeForm("123456", "https://evil.test/"),
      ),
    ).rejects.toThrowError("NEXT_REDIRECT:/account");
  });

  it("reports a rejected code without redirecting", async () => {
    installClient({
      factors: [verifiedFactor],
      verifyResult: { data: null, error: { message: "invalid totp" } },
    });

    const state = await verifyLoginChallenge(
      INITIAL_LOGIN_CHALLENGE_STATE,
      challengeForm("000000"),
    );

    expect(state.status).toBe("error");
    expect(state.message).toContain("not valid");
    expect(JSON.stringify(state)).not.toContain("invalid totp");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rejects a malformed code before contacting the provider", async () => {
    const { events } = installClient({ factors: [verifiedFactor] });

    const state = await verifyLoginChallenge(INITIAL_LOGIN_CHALLENGE_STATE, challengeForm("12345"));

    expect(state.status).toBe("error");
    expect(state.fieldErrors.code[0]).toContain("6-digit");
    expect(events).toEqual([]);
  });

  it("fails closed when no verified factor exists", async () => {
    const { challenge } = installClient({ factors: [] });

    const state = await verifyLoginChallenge(INITIAL_LOGIN_CHALLENGE_STATE, challengeForm());

    expect(state.status).toBe("error");
    expect(challenge).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not call a wrong code wrong when a later factor was never asked", async () => {
    const secondFactor = { ...verifiedFactor, id: "factor-second" };
    const challengeResults = [
      { data: { id: "challenge-1" }, error: null },
      { data: null, error: { message: "rate limited" } },
    ];
    const { challenge } = installClient({
      factors: [verifiedFactor, secondFactor],
      verifyResult: { data: null, error: { message: "invalid totp" } },
    });
    challenge.mockImplementation(async () => challengeResults.shift() ?? { data: null, error: {} });

    const state = await verifyLoginChallenge(
      INITIAL_LOGIN_CHALLENGE_STATE,
      challengeForm("000000"),
    );

    // The second factor's authenticator was never asked, so the code cannot be
    // reported as invalid on its account.
    expect(state.status).toBe("error");
    expect(state.message).toContain("temporarily unavailable");
    expect(state.message).not.toContain("not valid");
  });

  it("fails closed when the challenge cannot be created", async () => {
    const { verify } = installClient({
      factors: [verifiedFactor],
      challengeResult: { data: null, error: { message: "rate limited" } },
    });

    const state = await verifyLoginChallenge(INITIAL_LOGIN_CHALLENGE_STATE, challengeForm());

    expect(state.status).toBe("error");
    expect(verify).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).not.toContain("rate limited");
  });
});
