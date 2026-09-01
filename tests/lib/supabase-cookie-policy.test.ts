import { getSupabaseAuthCookieOptions, getSupabaseAuthStorageKey } from "@/lib/supabase/config";

describe("Supabase authentication cookie policy", () => {
  it("uses the same project-scoped key as the pinned Supabase client", () => {
    expect(getSupabaseAuthStorageKey("https://project-ref.supabase.co")).toBe(
      "sb-project-ref-auth-token",
    );
  });

  it("makes production session cookies HttpOnly, Secure, same-site, and site-wide", () => {
    expect(getSupabaseAuthCookieOptions("https://project-ref.supabase.co", "production")).toEqual({
      name: "sb-project-ref-auth-token",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("allows local HTTP development without making cookies script-readable", () => {
    expect(
      getSupabaseAuthCookieOptions("https://project-ref.supabase.co", "development"),
    ).toMatchObject({ httpOnly: true, secure: false, sameSite: "lax", path: "/" });
  });
});
