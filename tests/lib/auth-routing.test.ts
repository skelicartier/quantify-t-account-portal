import { buildLoginRedirectUrl, isProtectedAccountPath } from "@/lib/auth/route-policy";

describe("protected account route policy", () => {
  it.each(["/account", "/account/", "/account/security"])("protects %s", (pathname) => {
    expect(isProtectedAccountPath(pathname)).toBe(true);
  });

  it.each(["/", "/login", "/accounting", "/api/account"])("does not overmatch %s", (pathname) => {
    expect(isProtectedAccountPath(pathname)).toBe(false);
  });

  it("returns anonymous users to the same account path after login", () => {
    const destination = buildLoginRedirectUrl(
      new URL("https://account.quantifyterminal.com/account/security?tab=sessions"),
    );

    expect(destination.origin).toBe("https://account.quantifyterminal.com");
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe("/account/security?tab=sessions");
  });
});
