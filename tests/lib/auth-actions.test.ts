import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";
import { INITIAL_LOGIN_STATE } from "@/lib/auth/login";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  clearPortalAzureAuthCookies: vi.fn(),
  endCurrentAccountApiSession: vi.fn(),
  registerCurrentAccountApiSession: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
  clearPortalAzureAuthCookies: mocks.clearPortalAzureAuthCookies,
}));
vi.mock("@/lib/account/session-lifecycle", () => ({
  endCurrentAccountApiSession: mocks.endCurrentAccountApiSession,
  registerCurrentAccountApiSession: mocks.registerCurrentAccountApiSession,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { logout } from "@/app/account/actions";
import { login } from "@/app/login/actions";

function loginForm(password = "correct-password"): FormData {
  const formData = new FormData();
  formData.set("email", "User@Example.com");
  formData.set("password", password);
  formData.set(CHALLENGE_FIELD_NAME, "turnstile-response");
  return formData;
}

describe("authentication Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearPortalAzureAuthCookies.mockResolvedValue(undefined);
    mocks.endCurrentAccountApiSession.mockResolvedValue(false);
    mocks.registerCurrentAccountApiSession.mockResolvedValue(false);
  });

  it("rejects malformed login input before creating an Azure client", async () => {
    const formData = new FormData();
    formData.set("email", "not-an-email");
    formData.set("password", "");

    const result = await login(INITIAL_LOGIN_STATE, formData);

    expect(result.status).toBe("error");
    expect(mocks.createServerAzureClient).not.toHaveBeenCalled();
  });

  it("returns one generic message for rejected credentials", async () => {
    const submittedPassword = "incorrect-password-value";
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "unauthenticated", message: "invalid credentials" },
    });
    mocks.createServerAzureClient.mockResolvedValue({ signInWithPassword });

    const result = await login(INITIAL_LOGIN_STATE, loginForm(submittedPassword));

    expect(result).toEqual({
      status: "error",
      message: "Unable to sign in with those credentials.",
      fieldErrors: { email: [], password: [], challenge: [] },
    });
    expect(JSON.stringify(result)).not.toContain(submittedPassword);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("maps operational failures to a non-credential service message", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "network_error", message: "transport failed" },
    });
    mocks.createServerAzureClient.mockResolvedValue({ signInWithPassword });

    await expect(login(INITIAL_LOGIN_STATE, loginForm("not-returned"))).resolves.toMatchObject({
      status: "error",
      message: "Secure sign-in is temporarily unavailable. Please try again.",
    });
  });

  it("redirects a successful login only to an approved account path", async () => {
    const azure = {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: { id: "verified-user" },
          session: {
            access_token: "not-returned",
            refresh_token: "not-returned-refresh",
            expires_in: 3600,
          },
        },
        error: null,
      }),
      getAccessToken: vi.fn(() => "not-returned"),
    };
    mocks.createServerAzureClient.mockResolvedValue(azure);
    const formData = loginForm();
    formData.set("next", "https://evil.example/steal");

    await expect(login(INITIAL_LOGIN_STATE, formData)).rejects.toThrow("NEXT_REDIRECT:/account");
    expect(mocks.registerCurrentAccountApiSession).toHaveBeenCalledWith(azure);
    expect(azure.signInWithPassword).toHaveBeenCalledWith("user@example.com", "correct-password");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("revokes the Azure session and guarantees browser-cookie cleanup", async () => {
    const azure = { signOut: vi.fn().mockResolvedValue({ error: null }), getAccessToken: vi.fn() };
    mocks.createServerAzureClient.mockResolvedValue(azure);

    await expect(logout()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(mocks.endCurrentAccountApiSession).toHaveBeenCalledWith(azure);
    expect(azure.signOut).toHaveBeenCalledOnce();
    expect(mocks.clearPortalAzureAuthCookies).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("reports incomplete revocation after cookie cleanup when Azure sign-out fails", async () => {
    const azure = { signOut: vi.fn().mockRejectedValue(new Error("provider unavailable")) };
    mocks.createServerAzureClient.mockResolvedValue(azure);

    await expect(logout()).rejects.toThrow("NEXT_REDIRECT:/login?notice=logout-incomplete");
    expect(mocks.clearPortalAzureAuthCookies).toHaveBeenCalledOnce();
  });

  it("does not claim logout succeeded when browser-cookie cleanup fails", async () => {
    const azure = { signOut: vi.fn().mockResolvedValue({ error: null }) };
    mocks.createServerAzureClient.mockResolvedValue(azure);
    mocks.clearPortalAzureAuthCookies.mockRejectedValue(new Error("cookie write failed"));

    await expect(logout()).rejects.toThrow("cookie write failed");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("desktop handoff through sign-in and sign-out", () => {
  const HANDOFF_PATH = "/connect/desktop?handoff=c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw";
  const HANDOFF_QUERY = new URLSearchParams({ next: HANDOFF_PATH }).toString();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearPortalAzureAuthCookies.mockResolvedValue(undefined);
    mocks.endCurrentAccountApiSession.mockResolvedValue(false);
    mocks.registerCurrentAccountApiSession.mockResolvedValue(false);
  });

  it("returns a successful login to the desktop handoff it was asked for", async () => {
    mocks.createServerAzureClient.mockResolvedValue({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: { id: "verified-user" },
          session: { access_token: "t", refresh_token: "r", expires_in: 3600 },
        },
        error: null,
      }),
      getAccessToken: vi.fn(() => "t"),
    });
    const formData = loginForm();
    formData.set("next", HANDOFF_PATH);

    await expect(login(INITIAL_LOGIN_STATE, formData)).rejects.toThrow(
      `NEXT_REDIRECT:${HANDOFF_PATH}`,
    );
  });

  it("keeps the handoff across sign-out so the visitor can switch accounts", async () => {
    mocks.createServerAzureClient.mockResolvedValue({
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getAccessToken: vi.fn(),
    });
    const formData = new FormData();
    formData.set("next", HANDOFF_PATH);

    await expect(logout(formData)).rejects.toThrow(`NEXT_REDIRECT:/login?${HANDOFF_QUERY}`);
  });

  it("drops any other sign-out destination", async () => {
    mocks.createServerAzureClient.mockResolvedValue({
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getAccessToken: vi.fn(),
    });
    const formData = new FormData();
    formData.set("next", "/admin");

    await expect(logout(formData)).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("reports an incomplete sign-out without losing the handoff", async () => {
    mocks.createServerAzureClient.mockResolvedValue({
      signOut: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });
    const formData = new FormData();
    formData.set("next", HANDOFF_PATH);

    await expect(logout(formData)).rejects.toThrow(
      `NEXT_REDIRECT:/login?notice=logout-incomplete&${HANDOFF_QUERY}`,
    );
  });
});
