import { INITIAL_LOGIN_STATE } from "@/lib/auth/login";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  clearPortalSupabaseAuthCookies: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  clearPortalSupabaseAuthCookies: mocks.clearPortalSupabaseAuthCookies,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { logout } from "@/app/account/actions";
import { login } from "@/app/login/actions";

describe("authentication Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearPortalSupabaseAuthCookies.mockResolvedValue(undefined);
  });

  it("rejects malformed login input before creating a Supabase client", async () => {
    const formData = new FormData();
    formData.set("email", "not-an-email");
    formData.set("password", "");

    const result = await login(INITIAL_LOGIN_STATE, formData);

    expect(result.status).toBe("error");
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns one generic message for rejected credentials", async () => {
    const submittedPassword = "incorrect-password-value";
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: { signInWithPassword },
    });
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", submittedPassword);

    const result = await login(INITIAL_LOGIN_STATE, formData);

    expect(result).toEqual({
      status: "error",
      message: "Unable to sign in with those credentials.",
      fieldErrors: { email: [], password: [] },
    });
    expect(JSON.stringify(result)).not.toContain(submittedPassword);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("maps returned operational failures to a non-credential service message", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Request rate limit reached", code: "over_request_rate_limit" },
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: { signInWithPassword },
    });
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "not-returned");

    await expect(login(INITIAL_LOGIN_STATE, formData)).resolves.toMatchObject({
      status: "error",
      message: "Secure sign-in is temporarily unavailable. Please try again.",
    });
  });

  it("redirects a successful login only to an approved account path", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: "verified-user" }, session: { access_token: "not-returned" } },
      error: null,
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: { signInWithPassword },
    });
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "correct-password");
    formData.set("next", "https://evil.example/steal");

    await expect(login(INITIAL_LOGIN_STATE, formData)).rejects.toThrow("NEXT_REDIRECT:/account");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("uses local-scope sign-out and guarantees browser-cookie cleanup", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createServerSupabaseClient.mockResolvedValue({ auth: { signOut } });

    await expect(logout()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.clearPortalSupabaseAuthCookies).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("retries provider sign-out and reports incomplete revocation after cookie cleanup", async () => {
    const signOut = vi.fn().mockResolvedValue({
      error: { message: "session refresh failed", code: "refresh_token_not_found" },
    });
    mocks.createServerSupabaseClient.mockResolvedValue({ auth: { signOut } });

    await expect(logout()).rejects.toThrow("NEXT_REDIRECT:/login?notice=logout-incomplete");
    expect(signOut).toHaveBeenCalledTimes(2);
    expect(signOut).toHaveBeenNthCalledWith(1, { scope: "local" });
    expect(signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(mocks.clearPortalSupabaseAuthCookies).toHaveBeenCalledOnce();
  });

  it("does not claim logout succeeded when browser-cookie cleanup fails", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    mocks.createServerSupabaseClient.mockResolvedValue({ auth: { signOut } });
    mocks.clearPortalSupabaseAuthCookies.mockRejectedValue(new Error("cookie write failed"));

    await expect(logout()).rejects.toThrow("cookie write failed");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
