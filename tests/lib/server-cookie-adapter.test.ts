const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { clearPortalAzureAuthCookies, createServerAzureClient } from "@/lib/supabase/server";

describe("Azure SQL server client adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    });
  });

  it("creates a server client without throwing", async () => {
    const client = await createServerAzureClient();
    expect(client).toBeDefined();
    expect(typeof client.getUser).toBe("function");
    expect(typeof client.getAccessToken).toBe("function");
  });

  it("returns null user when no session cookie exists", async () => {
    const client = await createServerAzureClient();
    const user = await client.getUser();
    expect(user).toBeNull();
  });

  it("clears auth cookies", async () => {
    const setFn = vi.fn();
    mocks.cookies.mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
      set: setFn,
    });

    await clearPortalAzureAuthCookies();
    expect(setFn).toHaveBeenCalled();
  });
});
