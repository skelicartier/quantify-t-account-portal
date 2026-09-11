import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";
import { LEGAL_CONSENT_FIELD_NAME } from "@/lib/auth/consent";
import { parseSignupFormData } from "@/lib/auth/signup";

describe("signup input policy", () => {
  function validFormData(): FormData {
    const formData = new FormData();
    formData.set("email", "  New.User@Example.COM ");
    formData.set("password", "  twelve+ chars  ");
    formData.set("passwordConfirmation", "  twelve+ chars  ");
    formData.set(LEGAL_CONSENT_FIELD_NAME, "on");
    formData.set(CHALLENGE_FIELD_NAME, "turnstile-response");
    return formData;
  }

  it("normalizes email while preserving password bytes and approved public inputs", () => {
    expect(parseSignupFormData(validFormData())).toEqual({
      success: true,
      data: {
        email: "new.user@example.com",
        password: "  twelve+ chars  ",
        captchaToken: "turnstile-response",
        firstName: "",
        lastName: "",
      },
    });
  });

  it("requires matching 12-128 character passwords", () => {
    const formData = validFormData();
    formData.set("password", "short");
    formData.set("passwordConfirmation", "different");

    const result = parseSignupFormData(formData);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected invalid signup input");
    expect(result.state.fieldErrors.password).not.toHaveLength(0);
    expect(result.state.fieldErrors.passwordConfirmation).not.toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("different");
  });

  it("requires explicit legal consent and a completed challenge", () => {
    const formData = validFormData();
    formData.delete(LEGAL_CONSENT_FIELD_NAME);
    formData.delete(CHALLENGE_FIELD_NAME);

    const result = parseSignupFormData(formData);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected invalid signup input");
    expect(result.state.fieldErrors.legalConsent).not.toHaveLength(0);
    expect(result.state.fieldErrors.challenge).not.toHaveLength(0);
  });

  it("never returns submitted credentials in validation state", () => {
    const submittedSecret = "x".repeat(129);
    const formData = validFormData();
    formData.set("email", "invalid");
    formData.set("password", submittedSecret);
    formData.set("passwordConfirmation", submittedSecret);

    const result = parseSignupFormData(formData);

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(submittedSecret);
  });

  it("splits an optional full name into first and last names and rejects symbols", () => {
    const formData = validFormData();
    formData.set("fullName", "  Jaswinder   Singh Gill ");
    const parsed = parseSignupFormData(formData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.firstName).toBe("Jaswinder");
      expect(parsed.data.lastName).toBe("Singh Gill");
    }

    formData.set("fullName", "<script>");
    const rejected = parseSignupFormData(formData);
    expect(rejected.success).toBe(false);
    if (!rejected.success) {
      expect(rejected.state.fieldErrors.fullName).toEqual(["Use letters only in your name."]);
    }
  });
});
