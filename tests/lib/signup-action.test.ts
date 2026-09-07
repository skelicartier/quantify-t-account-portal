import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";
import { LEGAL_CONSENT_FIELD_NAME } from "@/lib/auth/consent";
import { INITIAL_SIGNUP_STATE } from "@/lib/auth/signup";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getSupabasePublicConfiguration: vi.fn(() => ({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_test_value",
    siteUrl: "https://console.quantifyterminal.com",
    turnstileSiteKey: "turnstile-public-value",
    cookieOptions: { name: "sb-project-auth-token" },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicConfiguration: mocks.getSupabasePublicConfiguration,
}));

import { signup } from "@/app/signup/actions";

function signupFormData(): FormData {
  const formData = new FormData();
  formData.set("email", "New.User@Example.com");
  formData.set("password", "twelve-character-password");
  formData.set("passwordConfirmation", "twelve-character-password");
  formData.set(LEGAL_CONSENT_FIELD_NAME, "on");
  formData.set(CHALLENGE_FIELD_NAME, "turnstile-response");
  return formData;
}

describe("signup Server Action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the publishable SSR client with fixed callback, CAPTCHA, and server consent metadata", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: "new-user" }, session: null },
      error: null,
    });
    mocks.createServerSupabaseClient.mockResolvedValue({ auth: { signUp } });

    const result = await signup(INITIAL_SIGNUP_STATE, signupFormData());

    expect(signUp).toHaveBeenCalledWith({
      email: "new.user@example.com",
      password: "twelve-character-password",
      options: {
        emailRedirectTo: "https://console.quantifyterminal.com/auth/confirm?flow=signup",
        captchaToken: "turnstile-response",
        data: {
          consent_schema_version: "1",
          terms_version: "2026-09-02",
          privacy_version: "2026-09-02",
          consent_source: "account_portal_signup",
          consent_captured_at: expect.any(String),
        },
      },
    });
    expect(result.status).toBe("accepted");
    expect(JSON.stringify(result)).not.toContain("twelve-character-password");
    expect(JSON.stringify(result)).not.toContain("turnstile-response");
  });

  it("returns the same accepted state for an existing address", async () => {
    const signUp = vi.fn().mockResolvedValueOnce({ data: { user: null }, error: null });
    mocks.createServerSupabaseClient.mockResolvedValue({ auth: { signUp } });
    const normalResult = await signup(INITIAL_SIGNUP_STATE, signupFormData());

    signUp.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "user_already_exists", message: "User already registered" },
    });
    const duplicateResult = await signup(INITIAL_SIGNUP_STATE, signupFormData());

    expect(duplicateResult).toEqual(normalResult);
  });

  it("rejects invalid input before creating a Supabase client", async () => {
    const formData = signupFormData();
    formData.delete(LEGAL_CONSENT_FIELD_NAME);

    const result = await signup(INITIAL_SIGNUP_STATE, formData);

    expect(result.status).toBe("error");
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
