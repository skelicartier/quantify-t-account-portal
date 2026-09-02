import {
  parsePreferencesFormData,
  parseProfileFormData,
  PROFILE_COUNTRY_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_PHONE_MAX_LENGTH,
  PROFILE_TIMEZONE_MAX_LENGTH,
} from "@/lib/account/profile-input";

const PROFILE_SCALAR_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "country",
  "profileVersion",
] as const;
const PREFERENCE_SCALAR_FIELDS = ["timezone", "defaultCurrency", "profileVersion"] as const;
const PREFERENCE_CHECKBOX_FIELDS = [
  "notifyPriceAlerts",
  "notifyPortfolioMoves",
  "notifyNewsDigest",
] as const;

function profileForm(): FormData {
  const form = new FormData();
  form.set("firstName", "  Avery   ");
  form.set("lastName", " Stone ");
  form.set("phone", "+1 (415) 555-0100");
  form.set("country", " United States ");
  form.set("profileVersion", "7");
  return form;
}

function preferencesForm(): FormData {
  const form = new FormData();
  form.set("timezone", "America/New_York");
  form.set("defaultCurrency", "usd");
  form.set("notifyPriceAlerts", "on");
  form.set("notifyNewsDigest", "on");
  form.set("profileVersion", "7");
  return form;
}

function appendExistingValue(form: FormData, field: string): void {
  const value = form.get(field);
  if (typeof value !== "string") throw new Error(`Expected ${field} to contain one string.`);
  form.append(field, value);
}

describe("profile input policy", () => {
  it("normalizes desktop-compatible profile fields and a positive version", () => {
    expect(parseProfileFormData(profileForm())).toEqual({
      success: true,
      data: {
        firstName: "Avery",
        lastName: "Stone",
        phone: "+1 (415) 555-0100",
        country: "United States",
        profileVersion: 7,
      },
    });
  });

  it.each(PROFILE_SCALAR_FIELDS)("rejects a missing profile scalar: %s", (field) => {
    const form = profileForm();
    form.delete(field);

    expect(parseProfileFormData(form)).toMatchObject({
      success: false,
      state: { status: "error" },
    });
  });

  it.each(PROFILE_SCALAR_FIELDS)("rejects a duplicate profile scalar: %s", (field) => {
    const form = profileForm();
    appendExistingValue(form, field);

    expect(parseProfileFormData(form)).toMatchObject({
      success: false,
      state: { status: "error" },
    });
  });

  it.each([
    ["firstName", PROFILE_NAME_MAX_LENGTH, "A"],
    ["lastName", PROFILE_NAME_MAX_LENGTH, "B"],
    ["phone", PROFILE_PHONE_MAX_LENGTH, "1"],
    ["country", PROFILE_COUNTRY_MAX_LENGTH, "C"],
  ] as const)("enforces the inclusive %s length boundary", (field, maximum, character) => {
    const accepted = profileForm();
    accepted.set(field, character.repeat(maximum));
    expect(parseProfileFormData(accepted).success).toBe(true);

    const rejected = profileForm();
    rejected.set(field, character.repeat(maximum + 1));
    expect(parseProfileFormData(rejected)).toMatchObject({
      success: false,
      state: { status: "error" },
    });
  });

  it.each(["firstName", "lastName", "country"] as const)(
    "rejects a normalized-empty required profile field: %s",
    (field) => {
      const form = profileForm();
      form.set(field, "   ");

      expect(parseProfileFormData(form)).toMatchObject({
        success: false,
        state: { status: "error" },
      });
    },
  );

  it("accepts an explicitly empty optional phone", () => {
    const form = profileForm();
    form.set("phone", "   ");

    expect(parseProfileFormData(form)).toMatchObject({
      success: true,
      data: { phone: "" },
    });
  });

  it("enforces positive safe-integer profile-version boundaries", () => {
    const minimum = profileForm();
    minimum.set("profileVersion", "1");
    expect(parseProfileFormData(minimum).success).toBe(true);

    const maximum = profileForm();
    maximum.set("profileVersion", String(Number.MAX_SAFE_INTEGER));
    expect(parseProfileFormData(maximum).success).toBe(true);

    for (const value of ["0", "7.5", String(Number.MAX_SAFE_INTEGER + 1)]) {
      const rejected = profileForm();
      rejected.set("profileVersion", value);
      expect(parseProfileFormData(rejected)).toMatchObject({
        success: false,
        state: { status: "error" },
      });
    }
  });

  it("rejects control characters, invalid phone characters, and non-string scalars", () => {
    const malformed = profileForm();
    malformed.set("lastName", "Stone\u0000Admin");
    malformed.set("phone", "javascript:alert(1)");
    malformed.set("country", new File(["country"], "country.txt", { type: "text/plain" }));

    const result = parseProfileFormData(malformed);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Malformed profile unexpectedly passed.");
    expect(result.state.fieldErrors.lastName).not.toHaveLength(0);
    expect(result.state.fieldErrors.phone).not.toHaveLength(0);
    expect(result.state.fieldErrors.country).not.toHaveLength(0);
  });

  it("normalizes preferences without inferring an unchecked notification", () => {
    expect(parsePreferencesFormData(preferencesForm())).toEqual({
      success: true,
      data: {
        timezone: "America/New_York",
        defaultCurrency: "USD",
        notifyPriceAlerts: true,
        notifyPortfolioMoves: false,
        notifyNewsDigest: true,
        profileVersion: 7,
      },
    });
  });

  it("treats every absent checkbox as false", () => {
    const form = preferencesForm();
    for (const field of PREFERENCE_CHECKBOX_FIELDS) form.delete(field);

    expect(parsePreferencesFormData(form)).toMatchObject({
      success: true,
      data: {
        notifyPriceAlerts: false,
        notifyPortfolioMoves: false,
        notifyNewsDigest: false,
      },
    });
  });

  it.each(PREFERENCE_SCALAR_FIELDS)("rejects a missing preference scalar: %s", (field) => {
    const form = preferencesForm();
    form.delete(field);

    expect(parsePreferencesFormData(form)).toMatchObject({
      success: false,
      state: { status: "error" },
    });
  });

  it.each(PREFERENCE_SCALAR_FIELDS)("rejects a duplicate preference scalar: %s", (field) => {
    const form = preferencesForm();
    appendExistingValue(form, field);

    expect(parsePreferencesFormData(form)).toMatchObject({
      success: false,
      state: { status: "error" },
    });
  });

  it.each(PREFERENCE_CHECKBOX_FIELDS)("rejects a duplicate checkbox value: %s", (field) => {
    const form = preferencesForm();
    form.set(field, "on");
    form.append(field, "on");

    expect(parsePreferencesFormData(form)).toMatchObject({
      success: false,
      state: { status: "error" },
    });
  });

  it.each(PREFERENCE_CHECKBOX_FIELDS)("rejects an unexpected checkbox value: %s", (field) => {
    const form = preferencesForm();
    form.set(field, "true");

    expect(parsePreferencesFormData(form)).toMatchObject({
      success: false,
      state: { status: "error" },
    });
  });

  it("enforces the server-side timezone length boundary", () => {
    const form = preferencesForm();
    form.set("timezone", "A".repeat(PROFILE_TIMEZONE_MAX_LENGTH + 1));

    const result = parsePreferencesFormData(form);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Overlong timezone unexpectedly passed.");
    expect(result.state.fieldErrors.timezone).toContain("Timezone is too long.");
  });

  it.each([
    ["timezone", "Not/A_Timezone"],
    ["defaultCurrency", "ZZZ"],
    ["defaultCurrency", "US"],
    ["defaultCurrency", "USDD"],
    ["profileVersion", "7.5"],
  ])("rejects an invalid %s preference", (field, value) => {
    const form = preferencesForm();
    form.set(field, value);
    expect(parsePreferencesFormData(form)).toMatchObject({
      success: false,
      state: { status: "error" },
    });
  });
});
