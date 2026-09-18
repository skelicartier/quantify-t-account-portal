import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";
import {
  CONSENT_SCHEMA_VERSION,
  LEGAL_CONSENT_FIELD_NAME,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "@/lib/auth/consent";
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

const HANDOFF_PATH = "/connect/desktop?handoff=c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw";

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

    // The fifth argument is the consent record. The tick box was always enforced; the
    // versions were never sent, so the account service could say somebody consented and
    // not to what. Only this side knows, because only this side renders the links.
    expect(signUp).toHaveBeenCalledWith(
      "new.user@example.com",
      "twelve-character-password",
      "",
      "",
      expect.objectContaining({
        consent_schema_version: CONSENT_SCHEMA_VERSION,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        consent_source: "account_portal_signup",
        consent_captured_at: expect.any(String),
      }),
    );
    expect(result.status).toBe("accepted");
    expect(JSON.stringify(result)).not.toContain("twelve-character-password");
    expect(JSON.stringify(result)).not.toContain("turnstile-response");
  });

  it("says so when the address already has an account, and whether a new link went out", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: null,
      error: {
        status: 409,
        code: "account_exists",
        message: "An account with this email address already exists.",
        details: { confirmed: true, confirmation_resent: false },
      },
    });
    mocks.createServerAzureClient.mockResolvedValue({ signUp });

    const existing = await signup(INITIAL_SIGNUP_STATE, signupFormData());
    expect(existing).toMatchObject({
      status: "exists",
      account: { confirmed: true, confirmationResent: false },
    });
    expect(existing.message).toMatch(/already exists/u);

    signUp.mockResolvedValue({
      data: null,
      error: {
        status: 409,
        code: "account_exists",
        message: "already",
        details: { confirmed: false, confirmation_resent: true },
      },
    });
    const unverified = await signup(INITIAL_SIGNUP_STATE, signupFormData());
    expect(unverified).toMatchObject({
      status: "exists",
      account: { confirmed: false, confirmationResent: true },
    });
    expect(unverified.message).toMatch(/not verified|new confirmation/iu);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
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
