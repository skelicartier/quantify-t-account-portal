/**
 * The forms themselves have to render the wait — not just the helper that computes it.
 *
 * `tests/lib/rate-limit.test.ts` proves the recognition and the wording in isolation. That
 * proves nothing about whether the actions CALL it, and the failure mode being guarded is
 * exactly that: an action that keeps returning its generic "temporarily unavailable" state
 * tells a rate-limited person the product is broken, and a person who believes that retries
 * immediately and keeps retrying — which is the behaviour the limit exists to stop, now
 * actively encouraged by the console.
 *
 * Each test drives the real action with a mocked client and asserts on the state the form
 * would render.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";
import { AzureAuthError } from "@/lib/azure-auth-client";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  forgotPassword: vi.fn(),
  confirmEmail: vi.fn(),
  registerSession: vi.fn(),
  requireSameOrigin: vi.fn(),
  verifyChallenge: vi.fn(),
  clearRecoveryAuthorization: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@/lib/security/action-origin", () => ({
  requireSameOriginServerAction: mocks.requireSameOrigin,
}));
vi.mock("@/lib/auth/turnstile", () => ({ verifyChallenge: mocks.verifyChallenge }));
vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: async () => ({
    signInWithPassword: mocks.signInWithPassword,
    signUp: mocks.signUp,
  }),
}));
vi.mock("@/lib/account/session-lifecycle", () => ({
  registerCurrentAccountApiSession: mocks.registerSession,
}));
vi.mock("@/lib/auth/recovery-authorization", () => ({
  clearRecoveryAuthorization: mocks.clearRecoveryAuthorization,
}));
vi.mock("@/lib/azure-auth-config", () => ({
  getAzureAuthConfig: () => ({ apiUrl: "https://account.example/api/v1" }),
}));
vi.mock("@/lib/azure-auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/azure-auth-client")>();
  return {
    ...actual,
    AzureAuthClient: class {
      resetPassword = mocks.resetPassword;
      forgotPassword = mocks.forgotPassword;
      confirmEmail = mocks.confirmEmail;
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { login } from "@/app/login/actions";
import { signup } from "@/app/signup/actions";
import { requestPasswordRecovery } from "@/app/forgot-password/actions";
import { resetPassword } from "@/app/reset-password/actions";
import { GET as confirmEmailRoute } from "@/app/auth/confirm/route";

const LIMITED = new AzureAuthError({
  status: 429,
  code: "rate_limited",
  message: "Too many attempts. Wait before trying again.",
  correlationId: "c-1",
  details: { retry_after_seconds: 300 },
});

function loginForm(): FormData {
  const form = new FormData();
  form.set("email", "someone@example.com");
  form.set("password", "a-perfectly-fine-password");
  form.set(CHALLENGE_FIELD_NAME, "");
  return form;
}

function signupForm(): FormData {
  const form = new FormData();
  form.set("fullName", "Someone");
  form.set("email", "someone@example.com");
  form.set("password", "a-perfectly-fine-password");
  form.set("passwordConfirmation", "a-perfectly-fine-password");
  form.set("legalConsent", "on");
  form.set(CHALLENGE_FIELD_NAME, "");
  return form;
}

function resetForm(): FormData {
  const form = new FormData();
  form.set("password", "a-perfectly-fine-password");
  form.set("passwordConfirmation", "a-perfectly-fine-password");
  form.set("token", "a-recovery-token");
  return form;
}

const IDLE = { status: "idle" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSameOrigin.mockResolvedValue(undefined);
  mocks.verifyChallenge.mockResolvedValue({ ok: true });
  mocks.cookies.mockResolvedValue({ set: vi.fn(), get: vi.fn() });
});

describe("signing in", () => {
  it("tells a limited visitor how long to wait", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: null, error: LIMITED });

    const state = await login(IDLE, loginForm());

    expect(state.status).toBe("error");
    expect(state.message).toBe("Too many attempts. Wait about 5 minutes before trying again.");
  });

  it("does not call it a credential problem", async () => {
    // The failure this replaces. Told their credentials are wrong when the service never
    // looked at them, somebody goes to reset a password that was never the problem — and
    // password recovery is itself the limit most worth not spending.
    mocks.signInWithPassword.mockResolvedValue({ data: null, error: LIMITED });

    const state = await login(IDLE, loginForm());

    expect(state.message).not.toMatch(/credentials/iu);
    expect(state.message).not.toMatch(/unavailable/iu);
  });

  it("names neither the bucket nor the account", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: null,
      error: new AzureAuthError({
        status: 429,
        code: "rate_limited",
        message: "refused",
        correlationId: null,
        details: { retry_after_seconds: 60, scope: "login:email" },
      }),
    });

    const state = await login(IDLE, loginForm());

    expect(String(state.message).toLowerCase()).not.toContain("login:");
    expect(String(state.message).toLowerCase()).not.toContain("account");
    expect(state.message).not.toContain("someone@example.com");
  });

  it("still says 'wrong credentials' for a real credential rejection", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: null,
      error: new AzureAuthError({
        status: 401,
        code: "unauthenticated",
        message: "invalid credentials",
        correlationId: null,
        details: {},
      }),
    });

    const state = await login(IDLE, loginForm());

    expect(state.message).toMatch(/credentials/iu);
  });

  it("catches a limit thrown rather than returned", async () => {
    // `signInWithPassword` returns its error, but the session registration that follows
    // throws — and a limit reached there used to land in the catch-all as an outage.
    mocks.signInWithPassword.mockResolvedValue({ data: { session: { token: "t" } }, error: null });
    mocks.registerSession.mockRejectedValue(LIMITED);

    const state = await login(IDLE, loginForm());

    expect(state.message).toBe("Too many attempts. Wait about 5 minutes before trying again.");
  });
});

describe("registering", () => {
  it("tells a limited visitor how long to wait", async () => {
    mocks.signUp.mockResolvedValue({ error: LIMITED });

    const state = await signup(IDLE, signupForm());

    expect(state.status).toBe("error");
    expect(state.message).toBe("Too many attempts. Wait about 5 minutes before trying again.");
  });

  it("does not report a limit as an existing account", async () => {
    // `existingAccountState` reads `code` off any object, so a refusal that reached it first
    // would be misread — and "an account with this email already exists" is a statement about
    // somebody else's address that the service went to some trouble not to make.
    mocks.signUp.mockResolvedValue({ error: LIMITED });

    const state = await signup(IDLE, signupForm());

    expect(state.status).not.toBe("exists");
    expect(state.message).not.toMatch(/already exists/iu);
  });

  it("still reports a genuine existing account", async () => {
    mocks.signUp.mockResolvedValue({
      error: { code: "account_exists", details: { confirmed: true } },
    });

    const state = await signup(IDLE, signupForm());

    expect(state.status).toBe("exists");
  });

  it("catches a limit thrown rather than returned", async () => {
    mocks.signUp.mockRejectedValue(LIMITED);

    const state = await signup(IDLE, signupForm());

    expect(state.message).toBe("Too many attempts. Wait about 5 minutes before trying again.");
  });
});

describe("asking for a recovery email", () => {
  it("answers identically whether or not the limit bit", async () => {
    // THE DELIBERATE ABSENCE. Recovery is limited, and the service enforces it silently so
    // this route cannot be used to test which addresses are registered. A console that said
    // "too many attempts" here would hand that back: an attacker learns an address is real
    // because asking about it repeatedly started being refused.
    mocks.forgotPassword.mockResolvedValue(undefined);
    const unlimited = await requestPasswordRecovery(IDLE, recoveryForm());

    mocks.forgotPassword.mockRejectedValue(LIMITED);
    const limited = await requestPasswordRecovery(IDLE, recoveryForm());

    expect(unlimited.status).toBe("accepted");
    expect(limited.message).not.toMatch(/too many/iu);
    expect(limited.message).not.toMatch(/wait/iu);
  });
});

function recoveryForm(): FormData {
  const form = new FormData();
  form.set("email", "someone@example.com");
  form.set(CHALLENGE_FIELD_NAME, "");
  return form;
}

describe("spending a recovery token", () => {
  it("tells a limited visitor to wait rather than to request another email", async () => {
    // The wrong answer here is expensive: "invalid or expired" sends them to request a fresh
    // recovery email, which spends the one budget that actually costs money to exhaust.
    mocks.resetPassword.mockRejectedValue(LIMITED);

    const state = await resetPassword(IDLE, resetForm());

    expect(state.message).toBe("Too many attempts. Wait about 5 minutes before trying again.");
    expect(state.message).not.toMatch(/expired/iu);
  });

  it("still reports a genuinely dead token as dead", async () => {
    mocks.resetPassword.mockRejectedValue(
      new AzureAuthError({
        status: 400,
        code: "invalid_token",
        message: "expired",
        correlationId: null,
        details: {},
      }),
    );

    const state = await resetPassword(IDLE, resetForm());

    expect(state.message).not.toMatch(/too many/iu);
  });
});

describe("opening a confirmation link", () => {
  const url = "https://console.example/auth/confirm?token=abc";

  it("does not call a limited attempt a dead link", async () => {
    mocks.confirmEmail.mockRejectedValue(LIMITED);

    const response = await confirmEmailRoute(new Request(url));

    expect(response.status).toBe(303);
    expect(response.headers.get("location") ?? "").toContain("reason=too-many-attempts");
  });

  it("still calls a dead link dead", async () => {
    mocks.confirmEmail.mockRejectedValue(new Error("expired"));

    const response = await confirmEmailRoute(new Request(url));

    expect(response.headers.get("location") ?? "").toContain("reason=invalid-confirm-link");
  });
});
