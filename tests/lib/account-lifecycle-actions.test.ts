import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";
import { INITIAL_RECOVERY_REQUEST_STATE, INITIAL_RESET_PASSWORD_STATE } from "@/lib/auth/recovery";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACCESS_TOKEN = "verified-recovery-access-token";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  clearPortalSupabaseAuthCookies: vi.fn(),
  consumeRecoveryAuthorization: vi.fn(),
  clearRecoveryAuthorization: vi.fn(),
  getSupabasePublicConfiguration: vi.fn(() => ({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_test_value",
    siteUrl: "https://account.quantifyterminal.com",
    turnstileSiteKey: "turnstile-public-value",
    cookieOptions: { name: "sb-project-auth-token" },
  })),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  clearPortalSupabaseAuthCookies: mocks.clearPortalSupabaseAuthCookies,
}));
vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicConfiguration: mocks.getSupabasePublicConfiguration,
}));
vi.mock("@/lib/auth/recovery-authorization", () => ({
  consumeRecoveryAuthorization: mocks.consumeRecoveryAuthorization,
  clearRecoveryAuthorization: mocks.clearRecoveryAuthorization,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { requestPasswordRecovery } from "@/app/forgot-password/actions";
import { resetPassword } from "@/app/reset-password/actions";

function recoveryFormData(): FormData {
  const formData = new FormData();
  formData.set("email", "User@Example.com");
  formData.set(CHALLENGE_FIELD_NAME, "turnstile-response");
  return formData;
}

function resetFormData(): FormData {
  const formData = new FormData();
  formData.set("password", "new-password-value");
  formData.set("passwordConfirmation", "new-password-value");
  return formData;
}

describe("recovery Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearPortalSupabaseAuthCookies.mockResolvedValue(undefined);
    mocks.clearRecoveryAuthorization.mockResolvedValue(undefined);
  });

  it("returns one accepted recovery state for existing and unknown addresses", async () => {
    const resetPasswordForEmail = vi
      .fn()
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({
        data: {},
        error: { code: "user_not_found", message: "User not found" },
      });
    mocks.createServerSupabaseClient.mockResolvedValue({ auth: { resetPasswordForEmail } });

    const existingResult = await requestPasswordRecovery(
      INITIAL_RECOVERY_REQUEST_STATE,
      recoveryFormData(),
    );
    const unknownResult = await requestPasswordRecovery(
      INITIAL_RECOVERY_REQUEST_STATE,
      recoveryFormData(),
    );

    expect(existingResult).toEqual(unknownResult);
    expect(existingResult.status).toBe("accepted");
    expect(resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: "https://account.quantifyterminal.com/auth/confirm?flow=recovery",
      captchaToken: "turnstile-response",
    });
  });

  it("rejects a request without a verified session and clears a stale marker", async () => {
    const updateUser = vi.fn();
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        updateUser,
      },
    });

    const result = await resetPassword(INITIAL_RESET_PASSWORD_STATE, resetFormData());

    expect(result.status).toBe("error");
    expect(result.message).toContain("invalid or has expired");
    expect(mocks.clearRecoveryAuthorization).toHaveBeenCalledOnce();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects an ordinary authenticated session without a recovery marker", async () => {
    const updateUser = vi.fn();
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mocks.consumeRecoveryAuthorization.mockResolvedValue(false);
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: ACCESS_TOKEN } },
          error: null,
        }),
        getUser,
        updateUser,
      },
    });

    const result = await resetPassword(INITIAL_RESET_PASSWORD_STATE, resetFormData());

    expect(result.status).toBe("error");
    expect(result.message).toContain("invalid or has expired");
    expect(getUser).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(mocks.consumeRecoveryAuthorization).toHaveBeenCalledWith({
      userId: USER_ID,
      accessToken: ACCESS_TOKEN,
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("consumes the bound marker before updating and clears only the local portal session", async () => {
    const events: string[] = [];
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: ACCESS_TOKEN } },
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mocks.consumeRecoveryAuthorization.mockImplementation(async () => {
      events.push("consume");
      return true;
    });
    const updateUser = vi.fn().mockImplementation(async () => {
      events.push("update");
      return { data: { user: {} }, error: null };
    });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: { getSession, getUser, updateUser, signOut },
    });

    await expect(resetPassword(INITIAL_RESET_PASSWORD_STATE, resetFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/login?notice=password-updated",
    );

    expect(getUser).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(mocks.consumeRecoveryAuthorization).toHaveBeenCalledWith({
      userId: USER_ID,
      accessToken: ACCESS_TOKEN,
    });
    expect(events).toEqual(["consume", "update"]);
    expect(updateUser).toHaveBeenCalledWith({ password: "new-password-value" });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.clearPortalSupabaseAuthCookies).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
