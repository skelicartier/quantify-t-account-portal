import {
  buildLoginRedirectUrl,
  isProtectedAccountPath,
  isProtectedAdminPath,
  isProtectedPortalPath,
} from "@/lib/auth/route-policy";

describe("protected account route policy", () => {
  it.each(["/account", "/account/", "/account/security"])("protects %s", (pathname) => {
    expect(isProtectedAccountPath(pathname)).toBe(true);
  });

  it.each(["/", "/login", "/accounting", "/api/account"])("does not overmatch %s", (pathname) => {
    expect(isProtectedAccountPath(pathname)).toBe(false);
  });

  it.each(["/admin", "/admin/", "/admin/users", "/admin/roles"])(
    "protects admin path %s",
    (pathname) => {
      expect(isProtectedAdminPath(pathname)).toBe(true);
      expect(isProtectedPortalPath(pathname)).toBe(true);
    },
  );

  it.each(["/administrator", "/api/admin", "/administer"])(
    "does not overmatch admin-like path %s",
    (pathname) => {
      expect(isProtectedAdminPath(pathname)).toBe(false);
      expect(isProtectedPortalPath(pathname)).toBe(false);
    },
  );

  it("returns anonymous users to the same account path after login", () => {
    const destination = buildLoginRedirectUrl(
      new URL("https://console.quantifyterminal.com/account/security?tab=sessions"),
    );

    expect(destination.origin).toBe("https://console.quantifyterminal.com");
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe("/account/security?tab=sessions");
  });

  it("returns anonymous administrators to the same admin path after login", () => {
    const destination = buildLoginRedirectUrl(
      new URL("https://console.quantifyterminal.com/admin/roles?include=matches"),
    );

    expect(destination.origin).toBe("https://console.quantifyterminal.com");
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe("/admin/roles?include=matches");
  });
});

describe("desktop handoff route policy", () => {
  it("protects the connect page and returns to the same handoff after login", () => {
    expect(isProtectedPortalPath("/connect/desktop")).toBe(true);
    expect(isProtectedPortalPath("/connect")).toBe(false);
    expect(isProtectedPortalPath("/connect/desktop/extra")).toBe(false);

    const destination = buildLoginRedirectUrl(
      new URL("https://console.quantifyterminal.com/connect/desktop?state=abc&port=53321"),
    );

    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe("/connect/desktop?state=abc&port=53321");
  });
});
