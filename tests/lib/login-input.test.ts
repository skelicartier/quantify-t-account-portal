import { parseLoginFormData, sanitizeNextPath } from "@/lib/auth/login";

const HANDOFF = "c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw";
const CONNECT_PATH = `/connect/desktop?handoff=${HANDOFF}`;

describe("login input policy", () => {
  it("normalizes email without transforming the password", () => {
    const formData = new FormData();
    formData.set("email", "  User@Example.COM ");
    formData.set("password", "  keep password spacing  ");
    formData.set("cf-turnstile-response", "turnstile-response");
    formData.set("next", "/account/security?tab=sessions");

    const result = parseLoginFormData(formData);

    expect(result).toEqual({
      success: true,
      data: {
        email: "user@example.com",
        password: "  keep password spacing  ",
        captchaToken: "turnstile-response",
        nextPath: "/account/security?tab=sessions",
      },
    });
  });

  it("returns field errors without echoing submitted credentials", () => {
    const submittedSecret = "x".repeat(1_025);
    const formData = new FormData();
    formData.set("email", "not-an-email");
    formData.set("password", submittedSecret);

    const result = parseLoginFormData(formData);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected invalid login input");
    expect(result.state.fieldErrors.email).not.toHaveLength(0);
    expect(result.state.fieldErrors.password).not.toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain(submittedSecret);
  });

  it.each([
    ["/account", "/account"],
    ["/account/profile?from=login", "/account/profile?from=login"],
    ["/admin", "/admin"],
    ["/admin/users?status=active", "/admin/users?status=active"],
    ["/admin/roles?include=matches", "/admin/roles?include=matches"],
    ["https://evil.example/account", "/account"],
    ["//evil.example/account", "/account"],
    ["/account/%2e%2e/admin", "/account"],
    [null, "/account"],
    // The desktop handoff is a destination only with a complete, well-formed handoff.
    [CONNECT_PATH, CONNECT_PATH],
    [`/connect/desktop?x=1&handoff=${HANDOFF}`, CONNECT_PATH],
    ["/connect/desktop", "/account"],
    ["/connect/desktop?handoff=short", "/account"],
    [`/connect/desktop?state=${HANDOFF}&port=53321&challenge=${"c".repeat(43)}`, "/account"],
    [`/connect/other?handoff=${HANDOFF}`, "/account"],
  ])("sanitizes the post-login destination %s", (input, expected) => {
    expect(sanitizeNextPath(input)).toBe(expected);
  });
});
