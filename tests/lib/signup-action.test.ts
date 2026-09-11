import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";
import { LEGAL_CONSENT_FIELD_NAME } from "@/lib/auth/consent";
import { INITIAL_SIGNUP_STATE } from "@/lib/auth/signup";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
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

  it("creates the account through the Azure auth client", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: "new-user" }, session: null },
      error: null,
    });
    mocks.createServerAzureClient.mockResolvedValue({ signUp });

    const result = await signup(INITIAL_SIGNUP_STATE, signupFormData());

    expect(signUp).toHaveBeenCalledWith("new.user@example.com", "twelve-character-password", "", "");
    expect(result.status).toBe("accepted");
    expect(JSON.stringify(result)).not.toContain("twelve-character-password");
    expect(JSON.stringify(result)).not.toContain("turnstile-response");
  });

  it("returns the same accepted state for an existing address handled by the API", async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null });
    mocks.createServerAzureClient.mockResolvedValue({ signUp });

    const duplicateResult = await signup(INITIAL_SIGNUP_STATE, signupFormData());

    expect(duplicateResult.status).toBe("accepted");
  });

  it("rejects invalid input before creating an Azure client", async () => {
    const formData = signupFormData();
    formData.delete(LEGAL_CONSENT_FIELD_NAME);

    const result = await signup(INITIAL_SIGNUP_STATE, formData);

    expect(result.status).toBe("error");
    expect(mocks.createServerAzureClient).not.toHaveBeenCalled();
  });
});
