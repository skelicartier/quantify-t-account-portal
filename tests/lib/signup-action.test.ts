import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";
import { LEGAL_CONSENT_FIELD_NAME } from "@/lib/auth/consent";
import { INITIAL_SIGNUP_STATE } from "@/lib/auth/signup";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));

import { signup } from "@/app/signup/actions";

const HANDOFF_PATH =
  "/connect/desktop?state=c2VjcmV0LXN0YXRlLWZyb20tdGhlLWFwcA&port=53321&challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

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

    expect(signUp).toHaveBeenCalledWith(
      "new.user@example.com",
      "twelve-character-password",
      "",
      "",
    );
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

describe("signup with a desktop handoff", () => {
  beforeEach(() => vi.clearAllMocks());

  function acceptingClient() {
    return {
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: "new-user" }, session: null },
        error: null,
      }),
    };
  }

  it("remembers the handoff so email confirmation can return to the app", async () => {
    mocks.createServerAzureClient.mockResolvedValue(acceptingClient());
    const formData = signupFormData();
    formData.set("next", HANDOFF_PATH);

    const result = await signup(INITIAL_SIGNUP_STATE, formData);

    expect(result.status).toBe("accepted");
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "qt-connect-return",
      HANDOFF_PATH,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 1800 }),
    );
  });

  it("does not remember any other destination", async () => {
    mocks.createServerAzureClient.mockResolvedValue(acceptingClient());
    const formData = signupFormData();
    formData.set("next", "/admin");

    const result = await signup(INITIAL_SIGNUP_STATE, formData);

    expect(result.status).toBe("accepted");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("does not remember the handoff when registration fails", async () => {
    mocks.createServerAzureClient.mockResolvedValue({
      signUp: vi.fn().mockResolvedValue({ data: null, error: { message: "refused" } }),
    });
    const formData = signupFormData();
    formData.set("next", HANDOFF_PATH);

    const result = await signup(INITIAL_SIGNUP_STATE, formData);

    expect(result.status).toBe("error");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
