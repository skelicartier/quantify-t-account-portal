import {
  CONSENT_SCHEMA_VERSION,
  LEGAL_CONSENT_FIELD_NAME,
  PRIVACY_URL,
  PRIVACY_VERSION,
  TERMS_URL,
  TERMS_VERSION,
  createSignupConsentMetadata,
  isLegalConsentAccepted,
} from "@/lib/auth/consent";

describe("signup consent contract", () => {
  it("requires an explicit checked value rather than trusting truthy input", () => {
    expect(LEGAL_CONSENT_FIELD_NAME).toBe("legalConsent");
    expect(isLegalConsentAccepted("on")).toBe(true);
    expect(isLegalConsentAccepted("true")).toBe(false);
    expect(isLegalConsentAccepted(null)).toBe(false);
  });

  it("creates versioned metadata from server-owned constants and time", () => {
    const capturedAt = new Date("2026-09-02T06:00:00.000Z");

    expect(createSignupConsentMetadata(capturedAt)).toEqual({
      consent_schema_version: CONSENT_SCHEMA_VERSION,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      consent_source: "account_portal_signup",
      consent_captured_at: "2026-09-02T06:00:00.000Z",
    });
    expect(TERMS_URL).toBe("https://www.quantifyterminal.com/terms");
    expect(PRIVACY_URL).toBe("https://www.quantifyterminal.com/privacy");
  });

  it("rejects invalid server timestamps", () => {
    expect(() => createSignupConsentMetadata(new Date(Number.NaN))).toThrow(
      "Consent capture time is invalid.",
    );
  });
});
