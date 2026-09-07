const mocks = vi.hoisted(() => ({
  AzureAuthClient: vi.fn(),
}));

vi.mock("@/lib/azure-auth-config", () => ({
  getAzureAuthConfig: () => ({
    apiUrl: "https://test-api.example.com",
    cookieName: "qt-session",
    refreshTokenName: "qt-refresh",
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  }),
}));

vi.mock("@/lib/azure-auth-client", () => ({
  AzureAuthClient: mocks.AzureAuthClient,
}));

import { verifyCurrentPassword } from "@/lib/supabase/verification-client";

function installIsolated(
  options: {
    signInResult?: unknown;
    signInThrows?: boolean;
  } = {},
) {
  const signIn = vi.fn(async () => {
    if (options.signInThrows) throw new Error("transport failed");
    return (
      options.signInResult ?? {
        user: { id: "user-1", email: "user@example.com" },
        session: { access_token: "isolated-token" },
      }
    );
  });
  mocks.AzureAuthClient.mockReturnValue({ signIn });
  return { signIn };
}

beforeEach(() => vi.clearAllMocks());

describe("isolated reauthentication client", () => {
  it("creates an Azure auth client with the correct API URL", () => {
    installIsolated();
    verifyCurrentPassword("user@example.com", "right-password");
    expect(mocks.AzureAuthClient).toHaveBeenCalledWith("https://test-api.example.com");
  });

  it("verifies a correct password without touching cookies", async () => {
    const { signIn } = installIsolated();

    await expect(verifyCurrentPassword("user@example.com", "right-password")).resolves.toBe(
      "verified",
    );

    expect(signIn).toHaveBeenCalledWith("user@example.com", "right-password");
  });

  it("reports rejected for failed sign-in", async () => {
    installIsolated({ signInResult: { user: null } });

    await expect(verifyCurrentPassword("user@example.com", "wrong")).resolves.toBe("rejected");
  });

  it("reports rejected when sign-in throws", async () => {
    installIsolated({ signInThrows: true });

    await expect(verifyCurrentPassword("user@example.com", "wrong")).resolves.toBe("unavailable");
  });

  it("reports unavailable when email does not match", async () => {
    installIsolated({
      signInResult: {
        user: { id: "user-1", email: "someone.else@example.com" },
        session: { access_token: "isolated-token" },
      },
    });

    await expect(verifyCurrentPassword("user@example.com", "right-password")).resolves.toBe(
      "unavailable",
    );
  });
});
