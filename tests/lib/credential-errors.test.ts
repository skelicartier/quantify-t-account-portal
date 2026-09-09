import { CREDENTIAL_REJECTION_CODES, isCredentialRejection } from "@/lib/auth/credential-errors";
import { isCredentialRejection as loginClassifier } from "@/lib/auth/login";

describe("credential rejection classification", () => {
  it("is one shared definition, not a copy per call site", () => {
    // Sign-in and current-password reauthentication must never disagree about what
    // counts as a rejection: one of them treating an outage as a wrong password would
    // lie to the user, the other would refuse a legitimate change.
    expect(loginClassifier).toBe(isCredentialRejection);
    expect([...CREDENTIAL_REJECTION_CODES].sort()).toStrictEqual([
      "account_inactive",
      "email_not_confirmed",
      "invalid_credentials",
      "invalid_grant",
      "unauthenticated",
      "user_banned",
      "user_not_found",
    ]);
  });

  it.each([...CREDENTIAL_REJECTION_CODES])("treats %s as a positive rejection", (code) => {
    expect(isCredentialRejection({ code, message: "provider detail" })).toBe(true);
  });

  it.each([
    ["an outage code", { code: "over_request_rate_limit" }],
    ["an unrelated code", { code: "validation_failed" }],
    ["no code at all", { message: "Invalid login credentials" }],
    ["a non-string code", { code: 400 }],
    ["a plain error", new Error("boom")],
    ["null", null],
    ["undefined", undefined],
  ])("does not classify %s as a rejection", (_label, error) => {
    // Anything ambiguous reads as unavailable: the fail-safe answer is "retry later",
    // never "your password is wrong" and never a mutation that proceeds.
    expect(isCredentialRejection(error)).toBe(false);
  });
});
