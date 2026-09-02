const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  cookies: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
// If the isolated client ever reached for request cookies or the SSR factory, these
// would be called and the test would fail: reauthentication must not touch them.
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicConfiguration: () => ({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_test",
    siteUrl: "https://account.example.invalid",
    turnstileSiteKey: "turnstile",
    cookieOptions: { name: "sb-project-auth-token", secure: true },
  }),
}));

import {
  createIsolatedSupabaseClient,
  verifyCurrentPassword,
} from "@/lib/supabase/verification-client";

function installIsolated(
  options: {
    signInResult?: unknown;
    signInThrows?: boolean;
  } = {},
) {
  const signInWithPassword = vi.fn(async () => {
    if (options.signInThrows) throw new Error("transport failed");
    return (
      options.signInResult ?? {
        data: {
          session: { access_token: "isolated-token" },
          user: { id: "user-1", email: "user@example.com" },
        },
        error: null,
      }
    );
  });
  const signOut = vi.fn(async () => ({ error: null }));
  mocks.createClient.mockReturnValue({ auth: { signInWithPassword, signOut } });
  return { signInWithPassword, signOut };
}

beforeEach(() => vi.clearAllMocks());

describe("isolated reauthentication client", () => {
  it("persists nothing and never refreshes or reads the URL", () => {
    installIsolated();

    createIsolatedSupabaseClient();

    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "sb_publishable_test",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      },
    );
  });

  it("verifies a correct password without touching request cookies or the SSR client", async () => {
    const { signInWithPassword, signOut } = installIsolated();

    await expect(verifyCurrentPassword("user@example.com", "right-password")).resolves.toBe(
      "verified",
    );

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "right-password",
    });
    // The transient session is dropped, and no cookie surface was involved at all.
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_credentials"],
    ["invalid_grant"],
    ["email_not_confirmed"],
    ["user_banned"],
    ["user_not_found"],
  ])("reports a positive credential rejection for %s", async (code) => {
    installIsolated({ signInResult: { data: {}, error: { code } } });

    await expect(verifyCurrentPassword("user@example.com", "wrong")).resolves.toBe("rejected");
  });

  it.each([
    ["a rate limit", { data: {}, error: { code: "over_request_rate_limit" } }],
    ["an unknown error", { data: {}, error: { message: "boom" } }],
    ["a missing session", { data: { session: null, user: null }, error: null }],
  ])("fails closed as unavailable for %s", async (_label, signInResult) => {
    installIsolated({ signInResult });

    await expect(verifyCurrentPassword("user@example.com", "right-password")).resolves.toBe(
      "unavailable",
    );
  });

  it("fails closed when the transport throws", async () => {
    installIsolated({ signInThrows: true });

    await expect(verifyCurrentPassword("user@example.com", "right-password")).resolves.toBe(
      "unavailable",
    );
  });

  it("refuses a session issued for a different address", async () => {
    installIsolated({
      signInResult: {
        data: {
          session: { access_token: "isolated-token" },
          user: { id: "user-1", email: "someone.else@example.com" },
        },
        error: null,
      },
    });

    await expect(verifyCurrentPassword("user@example.com", "right-password")).resolves.toBe(
      "unavailable",
    );
  });

  it("still drops the transient session when verification fails", async () => {
    const { signOut } = installIsolated({
      signInResult: { data: {}, error: { code: "invalid_credentials" } },
    });

    await verifyCurrentPassword("user@example.com", "wrong");

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
