const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  registerCurrentAccountApiSession: vi.fn(),
  requireSameOriginServerAction: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/account/session-lifecycle", () => ({
  registerCurrentAccountApiSession: mocks.registerCurrentAccountApiSession,
}));
vi.mock("@/lib/security/action-origin", () => ({
  requireSameOriginServerAction: mocks.requireSameOriginServerAction,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { login, verifyLoginChallenge } from "@/app/login/actions";
import { INITIAL_LOGIN_CHALLENGE_STATE, INITIAL_LOGIN_STATE } from "@/lib/auth/login";

function loginForm(next = "/account/security"): FormData {
  const data = new FormData();
  data.set("email", "User@Example.com");
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSameOriginServerAction.mockResolvedValue(undefined);
  mocks.registerCurrentAccountApiSession.mockResolvedValue(true);
});

describe("Azure login", () => {
  it("redirects after a successful password session and registers Account API lifecycle", async () => {
    const azure = {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session: { access_token: "token", refresh_token: "refresh", expires_in: 3600 } },
        error: null,
      }),
    };
    mocks.createServerAzureClient.mockResolvedValue(azure);

    await expect(login(INITIAL_LOGIN_STATE, loginForm())).rejects.toThrowError(
      "NEXT_REDIRECT:/account/security",
    );

    expect(azure.signInWithPassword).toHaveBeenCalledWith(
      "user@example.com",
      "correct-horse-battery-staple",
    );
    expect(mocks.registerCurrentAccountApiSession).toHaveBeenCalledWith(azure);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("does not run assurance/MFA discovery when credentials are rejected", async () => {
    const azure = {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "unauthenticated", message: "invalid credentials" },
      }),
    };
    mocks.createServerAzureClient.mockResolvedValue(azure);

    const state = await login(INITIAL_LOGIN_STATE, loginForm("not-used"));

    expect(state).toMatchObject({
      status: "error",
      message: "Unable to sign in with those credentials.",
    });
    expect(mocks.registerCurrentAccountApiSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("maps Azure auth transport failures to the secure sign-in outage message", async () => {
    mocks.createServerAzureClient.mockRejectedValue(new Error("configuration detail"));

    const state = await login(INITIAL_LOGIN_STATE, loginForm());

    expect(state).toMatchObject({
      status: "error",
      message: "Secure sign-in is temporarily unavailable. Please try again.",
    });
    expect(JSON.stringify(state)).not.toContain("configuration detail");
  });
});

describe("source-locked login challenge verification", () => {
  it("validates the code, keeps same-origin protection, and redirects to an account path", async () => {
    await expect(
      verifyLoginChallenge(INITIAL_LOGIN_CHALLENGE_STATE, challengeForm()),
    ).rejects.toThrowError("NEXT_REDIRECT:/account/security");

    expect(mocks.requireSameOriginServerAction).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("sanitizes a hostile challenge destination before redirecting", async () => {
    await expect(
      verifyLoginChallenge(
        INITIAL_LOGIN_CHALLENGE_STATE,
        challengeForm("123456", "https://evil.test/"),
      ),
    ).rejects.toThrowError("NEXT_REDIRECT:/account");
  });

  it("rejects malformed codes before any origin or provider work", async () => {
    const state = await verifyLoginChallenge(INITIAL_LOGIN_CHALLENGE_STATE, challengeForm("12345"));

    expect(state.status).toBe("error");
    expect(state.fieldErrors.code[0]).toContain("6-digit");
    expect(mocks.requireSameOriginServerAction).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
