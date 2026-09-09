import { ZodError } from "zod";

import { parsePublicEnvironment } from "@/lib/env/public-env";

const validEnvironment = {
  NEXT_PUBLIC_SITE_URL: "https://console.quantifyterminal.com",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
};

describe("parsePublicEnvironment", () => {
  it("returns an allow-listed public configuration", () => {
    expect(parsePublicEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("rejects an insecure or non-origin site URL", () => {
    expect(() =>
      parsePublicEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_SITE_URL: "http://account.example.com",
      }),
    ).toThrow(ZodError);
    expect(() =>
      parsePublicEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_SITE_URL: "https://account.example.com/path",
      }),
    ).toThrow(ZodError);
  });

  it("does not copy unknown secret-shaped values into the result", () => {
    const parsed = parsePublicEnvironment({
      ...validEnvironment,
      NEXT_PUBLIC_SUPABASE_URL: "https://legacy.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_legacy",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
      BREVO_API_KEY: "must-not-leak",
    });

    expect(parsed).not.toHaveProperty("NEXT_PUBLIC_SUPABASE_URL");
    expect(parsed).not.toHaveProperty("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(parsed).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(parsed).not.toHaveProperty("BREVO_API_KEY");
  });
});
