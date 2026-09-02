export const LEGAL_CONSENT_FIELD_NAME = "legalConsent";
export const CONSENT_SCHEMA_VERSION = "1";
export const TERMS_VERSION = "2026-09-02";
export const PRIVACY_VERSION = "2026-09-02";
export const TERMS_URL = "https://www.quantifyterminal.com/terms";
export const PRIVACY_URL = "https://www.quantifyterminal.com/privacy";

export type SignupConsentMetadata = {
  consent_schema_version: typeof CONSENT_SCHEMA_VERSION;
  terms_version: typeof TERMS_VERSION;
  privacy_version: typeof PRIVACY_VERSION;
  consent_source: "account_portal_signup";
  consent_captured_at: string;
};

export function isLegalConsentAccepted(value: unknown): boolean {
  return value === "on";
}

export function createSignupConsentMetadata(capturedAt = new Date()): SignupConsentMetadata {
  if (Number.isNaN(capturedAt.getTime())) {
    throw new Error("Consent capture time is invalid.");
  }

  return {
    consent_schema_version: CONSENT_SCHEMA_VERSION,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    consent_source: "account_portal_signup",
    consent_captured_at: capturedAt.toISOString(),
  };
}
