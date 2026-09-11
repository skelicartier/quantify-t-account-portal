import nextConfig from "../../next.config";

describe("credential-surface security headers", () => {
  it("enforces a Cloudflare-compatible CSP rather than report-only policy", async () => {
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find(({ source }) => source === "/:path*");
    const csp = globalRule?.headers.find(({ key }) => key === "Content-Security-Policy")?.value;

    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
    expect(csp).toContain(
      "connect-src 'self' https://challenges.cloudflare.com https://*.azurewebsites.net",
    );
    expect(csp).not.toContain("supabase.co");
    expect(
      globalRule?.headers.some(({ key }) => key === "Content-Security-Policy-Report-Only"),
    ).toBe(false);
  });

  it("marks every credential and callback route private and no-store", async () => {
    const rules = await nextConfig.headers?.();
    const noStoreSources = new Set(
      rules
        ?.filter(({ headers }) =>
          headers.some(({ key, value }) => key === "Cache-Control" && value.includes("no-store")),
        )
        .map(({ source }) => source),
    );

    expect(noStoreSources).toEqual(
      new Set([
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/account/:path*",
        "/admin/:path*",
        "/auth/:path*",
        "/connect/:path*",
      ]),
    );
  });
});
