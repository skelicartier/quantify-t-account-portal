import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";
import { parseRecoveryRequestFormData, parseResetPasswordFormData } from "@/lib/auth/recovery";

describe("password recovery input policy", () => {
  it("normalizes a recovery email and requires a public challenge token", () => {
    const formData = new FormData();
    formData.set("email", "  User@Example.COM ");
    formData.set(CHALLENGE_FIELD_NAME, "turnstile-response");

    expect(parseRecoveryRequestFormData(formData)).toEqual({
      success: true,
      data: { email: "user@example.com", captchaToken: "turnstile-response" },
    });
  });

  it("rejects malformed recovery input without echoing it", () => {
    const formData = new FormData();
    formData.set("email", "not-an-email");

    const result = parseRecoveryRequestFormData(formData);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected invalid recovery input");
    expect(result.state.fieldErrors.email).not.toHaveLength(0);
    expect(result.state.fieldErrors.challenge).not.toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("not-an-email");
  });

  it("preserves matching reset-password bytes within the 12-128 character policy", () => {
    const formData = new FormData();
    formData.set("password", "  new secure password  ");
    formData.set("passwordConfirmation", "  new secure password  ");

    expect(parseResetPasswordFormData(formData)).toEqual({
      success: true,
      data: { password: "  new secure password  " },
    });
  });

  it("rejects mismatched reset passwords without returning either value", () => {
    const formData = new FormData();
    formData.set("password", "first-secret-value");
    formData.set("passwordConfirmation", "second-secret-value");

    const result = parseResetPasswordFormData(formData);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected invalid reset input");
    expect(result.state.fieldErrors.passwordConfirmation).not.toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("first-secret-value");
    expect(JSON.stringify(result)).not.toContain("second-secret-value");
  });
});
