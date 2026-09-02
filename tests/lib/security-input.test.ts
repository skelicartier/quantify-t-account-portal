import {
  PASSWORD_MAXIMUM_LENGTH,
  PASSWORD_MINIMUM_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_REUSE_MESSAGE,
} from "@/lib/auth/password-policy";
import {
  parseCurrentPasswordFormData,
  parseEmailChangeFormData,
  parseFactorRemovalFormData,
  parsePasswordChangeFormData,
  parseTotpCodeFormData,
  parseTotpCodeOnlyFormData,
  TOTP_CODE_LENGTH,
} from "@/lib/auth/security-input";

const VALID_PASSWORD = "correct-horse-battery-staple";

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("password change parsing", () => {
  it("accepts a policy-compliant change", () => {
    const parsed = parsePasswordChangeFormData(
      form([
        ["currentPassword", "old-password-value"],
        ["password", VALID_PASSWORD],
        ["passwordConfirmation", VALID_PASSWORD],
      ]),
    );

    expect(parsed).toStrictEqual({
      success: true,
      data: { currentPassword: "old-password-value", password: VALID_PASSWORD },
    });
  });

  it("enforces the shared minimum length", () => {
    const short = "a".repeat(PASSWORD_MINIMUM_LENGTH - 1);
    const parsed = parsePasswordChangeFormData(
      form([
        ["currentPassword", "old-password-value"],
        ["password", short],
        ["passwordConfirmation", short],
      ]),
    );

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.state.fieldErrors.password[0]).toContain(`${PASSWORD_MINIMUM_LENGTH}`);
  });

  it("enforces the shared maximum length", () => {
    const long = "a".repeat(PASSWORD_MAXIMUM_LENGTH + 1);
    const parsed = parsePasswordChangeFormData(
      form([
        ["currentPassword", "old-password-value"],
        ["password", long],
        ["passwordConfirmation", long],
      ]),
    );

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.state.fieldErrors.password[0]).toContain(`${PASSWORD_MAXIMUM_LENGTH}`);
  });

  it("rejects a confirmation mismatch on the confirmation field", () => {
    const parsed = parsePasswordChangeFormData(
      form([
        ["currentPassword", "old-password-value"],
        ["password", VALID_PASSWORD],
        ["passwordConfirmation", `${VALID_PASSWORD}-different`],
      ]),
    );

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.state.fieldErrors.passwordConfirmation).toContain(PASSWORD_MISMATCH_MESSAGE);
  });

  it("rejects reusing the current password", () => {
    const parsed = parsePasswordChangeFormData(
      form([
        ["currentPassword", VALID_PASSWORD],
        ["password", VALID_PASSWORD],
        ["passwordConfirmation", VALID_PASSWORD],
      ]),
    );

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.state.fieldErrors.password).toContain(PASSWORD_REUSE_MESSAGE);
  });

  it("rejects a duplicated field rather than trusting one value", () => {
    const parsed = parsePasswordChangeFormData(
      form([
        ["currentPassword", "old-password-value"],
        ["password", VALID_PASSWORD],
        ["password", "second-value-injected"],
        ["passwordConfirmation", VALID_PASSWORD],
      ]),
    );

    expect(parsed.success).toBe(false);
  });

  it("never echoes password material in the rejection state", () => {
    const parsed = parsePasswordChangeFormData(
      form([
        ["currentPassword", "old-password-value"],
        ["password", "short"],
        ["passwordConfirmation", "mismatched"],
      ]),
    );

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const serialized = JSON.stringify(parsed.state);
    expect(serialized).not.toContain("old-password-value");
    expect(serialized).not.toContain("short");
    expect(serialized).not.toContain("mismatched");
  });
});

describe("email change parsing", () => {
  it("normalizes the address and keeps the reauthentication password", () => {
    const parsed = parseEmailChangeFormData(
      form([
        ["currentPassword", "old-password-value"],
        ["email", "  New.Address@Example.COM  "],
      ]),
    );

    expect(parsed).toStrictEqual({
      success: true,
      data: { currentPassword: "old-password-value", email: "new.address@example.com" },
    });
  });

  it.each([
    ["missing address", [["currentPassword", "old-password-value"]]],
    [
      "malformed address",
      [
        ["currentPassword", "old-password-value"],
        ["email", "not-an-email"],
      ],
    ],
    ["missing password", [["email", "new@example.com"]]],
    [
      "duplicated address",
      [
        ["currentPassword", "old-password-value"],
        ["email", "a@example.com"],
        ["email", "b@example.com"],
      ],
    ],
  ])("rejects %s", (_label, entries) => {
    const parsed = parseEmailChangeFormData(form(entries as Array<[string, string]>));
    expect(parsed.success).toBe(false);
  });
});

describe("TOTP code parsing", () => {
  it("accepts an exact numeric code and trims surrounding whitespace", () => {
    const parsed = parseTotpCodeFormData(
      form([
        ["factorId", "factor-1"],
        ["code", " 123456 "],
      ]),
    );

    expect(parsed).toStrictEqual({
      success: true,
      data: { factorId: "factor-1", code: "123456" },
    });
  });

  it.each([
    ["too short", "12345"],
    ["too long", "1234567"],
    ["non-numeric", "12a456"],
    ["empty", ""],
  ])("rejects a %s code", (_label, code) => {
    const parsed = parseTotpCodeFormData(
      form([
        ["factorId", "factor-1"],
        ["code", code],
      ]),
    );

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.fieldErrors.code[0]).toContain(`${TOTP_CODE_LENGTH}`);
  });

  it("rejects a missing factor id", () => {
    const parsed = parseTotpCodeFormData(form([["code", "123456"]]));
    expect(parsed.success).toBe(false);
  });
});

describe("factor removal parsing", () => {
  it("requires both the current password and a factor id", () => {
    expect(
      parseFactorRemovalFormData(
        form([
          ["currentPassword", "old-password-value"],
          ["factorId", "factor-1"],
        ]),
      ),
    ).toStrictEqual({
      success: true,
      data: { currentPassword: "old-password-value", factorId: "factor-1" },
    });

    expect(parseFactorRemovalFormData(form([["factorId", "factor-1"]])).success).toBe(false);
    expect(
      parseFactorRemovalFormData(form([["currentPassword", "old-password-value"]])).success,
    ).toBe(false);
  });
});

describe("code-only challenge parsing", () => {
  it("accepts a bare six-digit code and ignores any submitted factor id", () => {
    expect(
      parseTotpCodeOnlyFormData(
        form([
          ["code", "123456"],
          ["factorId", "attacker-factor"],
        ]),
      ),
    ).toStrictEqual({ success: true, data: { code: "123456" } });
  });

  it.each([["12345"], ["1234567"], ["12x456"], [""]])("rejects %s", (code) => {
    expect(parseTotpCodeOnlyFormData(form([["code", code]])).success).toBe(false);
  });

  it("rejects a duplicated code field", () => {
    expect(
      parseTotpCodeOnlyFormData(
        form([
          ["code", "123456"],
          ["code", "654321"],
        ]),
      ).success,
    ).toBe(false);
  });
});

describe("enrollment reauthentication parsing", () => {
  it("requires exactly one current password", () => {
    expect(
      parseCurrentPasswordFormData(form([["currentPassword", "old-password-value"]])),
    ).toStrictEqual({ success: true, data: { currentPassword: "old-password-value" } });
    expect(parseCurrentPasswordFormData(form([])).success).toBe(false);
    expect(parseCurrentPasswordFormData(form([["currentPassword", ""]])).success).toBe(false);
    expect(
      parseCurrentPasswordFormData(
        form([
          ["currentPassword", "one"],
          ["currentPassword", "two"],
        ]),
      ).success,
    ).toBe(false);
  });
});
