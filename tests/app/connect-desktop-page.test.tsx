import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getDesktopConnectIdentity: vi.fn(),
  connectDesktop: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/lib/admin/access", () => ({
  getDesktopConnectIdentity: mocks.getDesktopConnectIdentity,
}));
vi.mock("@/app/connect/desktop/actions", () => ({ connectDesktop: mocks.connectDesktop }));
vi.mock("@/app/account/actions", () => ({ logout: mocks.logout }));

import ConnectDesktopPage from "@/app/connect/desktop/page";

const STATE = "c2VjcmV0LXN0YXRlLWZyb20tdGhlLWFwcA";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const PATH = `/connect/desktop?state=${STATE}&port=53321&challenge=${CHALLENGE}`;

function page(searchParams: Record<string, string | string[] | undefined>) {
  return ConnectDesktopPage({ searchParams: Promise.resolve(searchParams) });
}

describe("ConnectDesktopPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDesktopConnectIdentity.mockResolvedValue({
      accessToken: "console-token",
      me: {
        user: {
          user_id: "4c7715ea-9ae3-4abd-b2f7-2d2c9a037d9b",
          email: "owner@example.test",
          is_active: true,
        },
        role: { effective: "owner" },
        capabilities: [],
        environment: "production",
      },
    });
  });

  it("asks the signed-in visitor to connect the waiting app", async () => {
    render(await page({ state: STATE, port: "53321", challenge: CHALLENGE }));

    expect(mocks.getDesktopConnectIdentity).toHaveBeenCalledWith(PATH);
    expect(
      screen.getByRole("heading", { name: "Connect Quantify Terminal on this computer" }),
    ).toBeVisible();
    expect(screen.getByText("owner@example.test")).toBeVisible();
    expect(screen.getByText("127.0.0.1:53321")).toBeVisible();

    const connect = screen.getByRole("button", { name: "Connect" });
    const form = connect.closest("form");
    expect(form).not.toBeNull();
    expect(form?.querySelector('input[name="state"]')).toHaveValue(STATE);
    expect(form?.querySelector('input[name="port"]')).toHaveValue("53321");
    expect(form?.querySelector('input[name="challenge"]')).toHaveValue(CHALLENGE);

    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(signOut.closest("form")?.querySelector('input[name="next"]')).toHaveValue(PATH);
    // A signed-in surface: follows the console theme rather than the always-dark canvas.
    expect(screen.getByRole("main")).toHaveClass("auth--console");
  });

  it("explains an incomplete link without looking up the session", async () => {
    render(await page({ state: STATE }));

    expect(mocks.getDesktopConnectIdentity).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "This connection link is incomplete" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your account" })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  it("refuses repeated or malformed parameters", async () => {
    render(await page({ state: STATE, port: ["53321", "53322"], challenge: CHALLENGE }));

    expect(mocks.getDesktopConnectIdentity).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("lets the identity guard send a signed-out visitor to sign in", async () => {
    mocks.getDesktopConnectIdentity.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));

    await expect(page({ state: STATE, port: "53321", challenge: CHALLENGE })).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
  });
});
