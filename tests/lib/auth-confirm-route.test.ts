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

const invalidLocation = "https://console.quantifyterminal.com/login?notice=invalid-confirm-link";

describe("authentication confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://console.quantifyterminal.com";
  });

  it("confirms a single Azure email token", async () => {
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
    expect(response.headers.get("location")).toBe(
      "https://console.quantifyterminal.com/login?notice=email-confirmed",
    );
  });

  it.each([
    "https://console.quantifyterminal.com/auth/confirm",
    "https://console.quantifyterminal.com/auth/confirm?token=one&token=two",
    `https://console.quantifyterminal.com/auth/confirm?token=${"a".repeat(4097)}`,
  ])("sends malformed links to one canonical generic failure route", async (url) => {
    const response = await GET(new Request(url));

    expect(mocks.AzureAuthClient).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(invalidLocation);
  });

  it("uses the same generic route for expired or rejected tokens", async () => {
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
