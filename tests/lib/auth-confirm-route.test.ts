const mocks = vi.hoisted(() => ({
  AzureAuthClient: vi.fn(),
}));

vi.mock("@/lib/azure-auth-config", () => ({
  getAzureAuthConfig: () => ({
    apiUrl: "https://account-api.example.com",
    cookieName: "qt-session",
    refreshTokenName: "qt-refresh",
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  }),
}));

vi.mock("@/lib/azure-auth-client", () => ({
  AzureAuthClient: mocks.AzureAuthClient,
}));

import { GET } from "@/app/auth/confirm/route";

const confirmedLocation = "https://console.quantifyterminal.com/auth/confirmed";
const invalidLocation =
  "https://console.quantifyterminal.com/auth/confirmed?reason=invalid-confirm-link";

describe("authentication confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://console.quantifyterminal.com";
  });

  it("confirms a single Azure email token and lands on the verified page", async () => {
    const confirmEmail = vi.fn().mockResolvedValue(undefined);
    mocks.AzureAuthClient.mockImplementation(function (this: Record<string, unknown>) {
      this.confirmEmail = confirmEmail;
    });

    const response = await GET(
      new Request("https://console.quantifyterminal.com/auth/confirm?token=confirm-token"),
    );

    expect(mocks.AzureAuthClient).toHaveBeenCalledWith("https://account-api.example.com");
    expect(confirmEmail).toHaveBeenCalledWith("confirm-token");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(confirmedLocation);
  });

  it.each([
    "https://console.quantifyterminal.com/auth/confirm",
    "https://console.quantifyterminal.com/auth/confirm?token=one&token=two",
    `https://console.quantifyterminal.com/auth/confirm?token=${"a".repeat(4097)}`,
  ])("sends malformed links to one canonical generic failure page", async (url) => {
    const response = await GET(new Request(url));

    expect(mocks.AzureAuthClient).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(invalidLocation);
  });

  it("uses the same generic page for expired or rejected tokens", async () => {
    const confirmEmail = vi.fn().mockRejectedValue(new Error("Sensitive provider detail"));
    mocks.AzureAuthClient.mockImplementation(function (this: Record<string, unknown>) {
      this.confirmEmail = confirmEmail;
    });

    const response = await GET(
      new Request("https://console.quantifyterminal.com/auth/confirm?token=expired"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(invalidLocation);
    expect(JSON.stringify([...response.headers])).not.toContain("Sensitive provider detail");
  });
});

describe("email confirmation for a desktop sign-up", () => {
  const HANDOFF_PATH = "/connect/desktop?handoff=c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw";
  const confirmUrl = "https://console.quantifyterminal.com/auth/confirm?token=confirm-token";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://console.quantifyterminal.com";
    mocks.AzureAuthClient.mockImplementation(function (this: Record<string, unknown>) {
      this.confirmEmail = vi.fn().mockResolvedValue(undefined);
    });
  });

  it("carries the waiting app's handoff to the verified page and spends the cookie", async () => {
    const response = await GET(
      new Request(confirmUrl, {
        headers: { cookie: `theme=dark; qt-connect-return=${encodeURIComponent(HANDOFF_PATH)}` },
      }),
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("https://console.quantifyterminal.com");
    expect(location.pathname).toBe("/auth/confirmed");
    expect(location.searchParams.get("next")).toBe(HANDOFF_PATH);
    expect(location.searchParams.get("reason")).toBeNull();
    expect(response.headers.get("set-cookie")).toBe(
      "qt-connect-return=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
    );
  });

  it("ignores a return cookie that is not a valid handoff", async () => {
    const response = await GET(
      new Request(confirmUrl, { headers: { cookie: "qt-connect-return=%2Fadmin" } }),
    );

    expect(response.headers.get("location")).toBe(confirmedLocation);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not carry the handoff when the token is rejected", async () => {
    mocks.AzureAuthClient.mockImplementation(function (this: Record<string, unknown>) {
      this.confirmEmail = vi.fn().mockRejectedValue(new Error("expired"));
    });

    const response = await GET(
      new Request(confirmUrl, {
        headers: { cookie: `qt-connect-return=${encodeURIComponent(HANDOFF_PATH)}` },
      }),
    );

    expect(response.headers.get("location")).toBe(invalidLocation);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
