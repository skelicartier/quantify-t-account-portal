import { ZodError } from "zod";

import { parsePublicEnvironment } from "@/lib/env/public-env";

const validEnvironment = {
  NEXT_PUBLIC_SITE_URL: "https://account.quantifyterminal.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example_value_123",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
};

describe("parsePublicEnvironment", () => {
  it("returns an allow-listed public configuration", () => {
    expect(parsePublicEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("rejects insecure, non-Supabase, or secret-key configuration", () => {
    expect(() =>
      parsePublicEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: "http://project.supabase.co",
      }),
    ).toThrow(ZodError);
    expect(() =>
      parsePublicEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: "https://credential-proxy.example.com",
      }),
    ).toThrow(ZodError);
    expect(() =>
      parsePublicEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ["sb", "secret", "must-never-be-accepted"].join("_"),
      }),
    ).toThrow(ZodError);
    expect(() =>
      parsePublicEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_SITE_URL: "http://account.example.com",
      }),
    ).toThrow(ZodError);
  });

  it("does not copy unknown secret-shaped values into the result", () => {
    const parsed = parsePublicEnvironment({
      ...validEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
      BREVO_API_KEY: "must-not-leak",
    });

    expect(parsed).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(parsed).not.toHaveProperty("BREVO_API_KEY");
  });
});
