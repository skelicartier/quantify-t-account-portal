const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  clearAuthCookiesAtScopes: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
  clearAuthCookiesAtScopes: mocks.clearAuthCookiesAtScopes,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { clearPortalSupabaseAuthCookies, createServerSupabaseClient } from "@/lib/supabase/server";

type CapturedClientOptions = {
  cookieOptions: {
    name?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
    path?: string;
  };
  cookies: {
    setAll: (
      values: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      headers: Record<string, string>,
    ) => void;
  };
};

function capturedOptions(): CapturedClientOptions {
  const call = mocks.createServerClient.mock.calls.at(-1) as unknown as unknown[];
  return call[2] as CapturedClientOptions;
}

describe("server Supabase cookie adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_value_1234567890");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
    mocks.createServerClient.mockReturnValue({ auth: {} });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes the hardened policy to the pinned SSR client", async () => {
    mocks.cookies.mockResolvedValue({ getAll: vi.fn(() => []), set: vi.fn() });

    await createServerSupabaseClient();

    expect(capturedOptions().cookieOptions).toMatchObject({
      name: "sb-project-ref-auth-token",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("requires cookie writes for Server Actions but tolerates them in read-only components", async () => {
    const writeError = new Error("cookie store is read-only");
    const set = vi.fn(() => {
      throw writeError;
    });
    mocks.cookies.mockResolvedValue({ getAll: vi.fn(() => []), set });

    await createServerSupabaseClient();
    expect(() =>
      capturedOptions().cookies.setAll(
        [{ name: "sb-project-ref-auth-token", value: "value", options: {} }],
        {},
      ),
    ).toThrow(writeError);

    await createServerSupabaseClient({ cookieWriteMode: "best-effort" });
    expect(() =>
      capturedOptions().cookies.setAll(
        [{ name: "sb-project-ref-auth-token", value: "value", options: {} }],
        {},
      ),
    ).not.toThrow();
  });

  it("targets only the configured project's cookie family during forced logout cleanup", async () => {
    mocks.cookies.mockResolvedValue({
      getAll: vi.fn(() => [
        { name: "sb-project-ref-auth-token.0", value: "chunk" },
        { name: "unrelated-cookie", value: "keep" },
      ]),
      set: vi.fn(),
    });
    mocks.clearAuthCookiesAtScopes.mockResolvedValue(undefined);

    await clearPortalSupabaseAuthCookies();

    expect(mocks.clearAuthCookiesAtScopes).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: "sb-project-ref-auth-token",
        scopes: [expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" })],
      }),
    );
  });
});
