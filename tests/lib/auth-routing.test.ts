import {
  buildLoginRedirectUrl,
  isProtectedAccountPath,
  isProtectedPortalPath,
} from "@/lib/auth/route-policy";

describe("protected account route policy", () => {
  it.each(["/account", "/account/", "/account/security"])("protects %s", (pathname) => {
    expect(isProtectedAccountPath(pathname)).toBe(true);
  });

  it.each(["/", "/login", "/accounting", "/api/account"])("does not overmatch %s", (pathname) => {
    expect(isProtectedAccountPath(pathname)).toBe(false);
  });

  it("returns anonymous users to the same account path after login", () => {
    const destination = buildLoginRedirectUrl(
      new URL("https://console.quantifyterminal.com/account/security?tab=sessions"),
    );

    expect(destination.origin).toBe("https://console.quantifyterminal.com");
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe("/account/security?tab=sessions");
  });

  it("holds no administration: /admin is neither protected nor a place sign-in returns to", () => {
    // The product's administration is run from HQ; the console is the customer's account.
    expect(isProtectedPortalPath("/admin")).toBe(false);
    expect(isProtectedPortalPath("/admin/users")).toBe(false);
    const destination = buildLoginRedirectUrl(
      new URL("https://console.quantifyterminal.com/admin/roles?include=matches"),
    );
    expect(destination.searchParams.get("next")).toBeNull();
  });
});

describe("desktop handoff route policy", () => {
  it("protects the connect page and returns to the same handoff after login", () => {
    expect(isProtectedPortalPath("/connect/desktop")).toBe(true);
    expect(isProtectedPortalPath("/connect")).toBe(false);
    expect(isProtectedPortalPath("/connect/desktop/extra")).toBe(false);

    const destination = buildLoginRedirectUrl(
      new URL(
        "https://console.quantifyterminal.com/connect/desktop?handoff=c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw",
      ),
    );

    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe(
      "/connect/desktop?handoff=c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw",
    );
  });
});
