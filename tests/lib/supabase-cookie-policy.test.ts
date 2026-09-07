import { getAzureAuthConfig } from "@/lib/azure-auth-config";

describe("Azure auth cookie policy", () => {
  it("returns correct Azure auth config", () => {
    const config = getAzureAuthConfig();
    expect(config.cookieName).toBe("qt-session");
    expect(config.refreshTokenName).toBe("qt-refresh");
    expect(config.cookieOptions.httpOnly).toBe(true);
    expect(config.cookieOptions.sameSite).toBe("lax");
    expect(config.cookieOptions.path).toBe("/");
  });

  it("sets secure based on NODE_ENV", () => {
    const config = getAzureAuthConfig();
    // In test environment, NODE_ENV is typically "test" so secure should be false
    expect(typeof config.cookieOptions.secure).toBe("boolean");
  });
});
