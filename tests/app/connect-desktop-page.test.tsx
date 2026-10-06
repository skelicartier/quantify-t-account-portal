import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getDesktopConnectIdentity: vi.fn(),
  fetchAccountApiHandoff: vi.fn(),
  connectDesktop: vi.fn(),
  cancelDesktopConnect: vi.fn(),
  logout: vi.fn(),
  getCurrentAccessHold: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("@/lib/admin/access", () => ({
  getDesktopConnectIdentity: mocks.getDesktopConnectIdentity,
}));
vi.mock("@/lib/admin/account-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
  return { ...actual, fetchAccountApiHandoff: mocks.fetchAccountApiHandoff };
});
vi.mock("@/app/connect/desktop/actions", () => ({
  connectDesktop: mocks.connectDesktop,
  cancelDesktopConnect: mocks.cancelDesktopConnect,
}));
vi.mock("@/app/account/actions", () => ({ logout: mocks.logout }));
vi.mock("@/lib/dal/access", () => ({ getCurrentAccessHold: mocks.getCurrentAccessHold }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import ConnectDesktopPage from "@/app/connect/desktop/page";
import { AccountApiRequestError } from "@/lib/admin/account-api";

const HANDOFF = "c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw";
const PATH = `/connect/desktop?handoff=${HANDOFF}`;

const pending = {
  ok: true as const,
  correlation_id: "qt-handoff",
  status: "pending" as const,
  user_code: "K7X4-P2M9",
  device_name: "Aaryan's MacBook Pro",
  client: "desktop",
  intent: "login" as const,
  created_at: "2026-09-12T00:00:00Z",
  expires_at: "2026-09-12T00:10:00Z",
  approved_at: null,
};

function page(searchParams: Record<string, string | string[] | undefined>) {
  return ConnectDesktopPage({ searchParams: Promise.resolve(searchParams) });
}

function apiError(status: number): AccountApiRequestError {
  return new AccountApiRequestError({
    status,
    code: "refused",
    message: "provider detail",
    correlationId: null,
  });
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
    mocks.fetchAccountApiHandoff.mockResolvedValue(pending);
    mocks.getCurrentAccessHold.mockResolvedValue(null);
  });

  it("takes the status from me when it carries one, without another read", async () => {
    mocks.getDesktopConnectIdentity.mockResolvedValue({
      accessToken: "console-token",
      me: {
        user: {
          user_id: "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e77",
          email: "applicant@example.test",
          is_active: true,
          access_status: "pending",
        },
        role: { effective: "user" },
        capabilities: [],
        environment: "production",
      },
    });

    render(await page({ handoff: HANDOFF }));

    expect(screen.getByRole("heading", { name: "Application under review" })).toBeVisible();
    expect(mocks.getCurrentAccessHold).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("says an application is under review instead of offering a Connect that can only fail", async () => {
    mocks.getCurrentAccessHold.mockResolvedValue("pending");

    render(await page({ handoff: HANDOFF }));

    expect(screen.getByRole("heading", { name: "Application under review" })).toBeVisible();
    expect(
      screen.getByText(
        "Your application is being reviewed. We will email you as soon as it has been decided.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("tells a declined account the desktop app will not connect, and what it can still do", async () => {
    mocks.getCurrentAccessHold.mockResolvedValue("declined");

    render(await page({ handoff: HANDOFF }));

    expect(screen.getByRole("heading", { name: "Application not approved" })).toBeVisible();
    expect(screen.getByText(/export or delete your data/u)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("shows the signed-in visitor the request's code and device before they decide", async () => {
    render(await page({ handoff: HANDOFF }));

    expect(mocks.getDesktopConnectIdentity).toHaveBeenCalledWith(PATH);
    expect(mocks.fetchAccountApiHandoff).toHaveBeenCalledWith("console-token", HANDOFF);
    expect(
      screen.getByRole("heading", { name: "Connect Quantify Terminal on this computer" }),
    ).toBeVisible();
    expect(screen.getByText("K7X4-P2M9")).toBeVisible();
    expect(screen.getByText("Aaryan's MacBook Pro")).toBeVisible();
    expect(screen.getByText("owner@example.test")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/127\.0\.0\.1|localhost/u);

    const connect = screen.getByRole("button", { name: "Connect" });
    expect(connect.closest("form")?.querySelector('input[name="handoff"]')).toHaveValue(HANDOFF);
    const cancel = screen.getByRole("button", { name: "Cancel request" });
    expect(cancel.closest("form")?.querySelector('input[name="handoff"]')).toHaveValue(HANDOFF);

    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(signOut.closest("form")?.querySelector('input[name="next"]')).toHaveValue(PATH);
    // A signed-in surface: follows the console theme rather than the always-dark canvas.
    expect(screen.getByRole("main")).toHaveClass("auth--console");
  });

  it("explains an incomplete link without looking up the session", async () => {
    render(await page({}));

    expect(mocks.getDesktopConnectIdentity).not.toHaveBeenCalled();
    expect(mocks.fetchAccountApiHandoff).not.toHaveBeenCalled();
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
    render(await page({ handoff: [HANDOFF, HANDOFF] }));
    expect(mocks.getDesktopConnectIdentity).not.toHaveBeenCalled();

    render(await page({ handoff: "short" }));
    expect(mocks.getDesktopConnectIdentity).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("lets the identity guard send a signed-out visitor to sign in", async () => {
    mocks.getDesktopConnectIdentity.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));

    await expect(page({ handoff: HANDOFF })).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("goes back through sign-in when the Account API session has ended", async () => {
    mocks.fetchAccountApiHandoff.mockRejectedValueOnce(apiError(401));

    await expect(page({ handoff: HANDOFF })).rejects.toThrow(
      `NEXT_REDIRECT:/login?next=${encodeURIComponent(PATH)}`,
    );
  });

  it.each([
    ["an unknown request", apiError(404), "This sign-in request has expired"],
    ["an expired request", { ...pending, status: "expired" }, "This sign-in request has expired"],
    ["an approved request", { ...pending, status: "approved" }, "Already connected"],
    ["a redeemed request", { ...pending, status: "redeemed" }, "Already connected"],
    ["a cancelled request", { ...pending, status: "denied" }, "This request was cancelled"],
  ])("explains %s instead of offering Connect", async (_label, answer, heading) => {
    if (answer instanceof Error) mocks.fetchAccountApiHandoff.mockRejectedValueOnce(answer);
    else mocks.fetchAccountApiHandoff.mockResolvedValueOnce(answer);

    render(await page({ handoff: HANDOFF }));

    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("asks the visitor to reload when the service is unavailable", async () => {
    mocks.fetchAccountApiHandoff.mockRejectedValueOnce(apiError(503));

    render(await page({ handoff: HANDOFF }));

    expect(
      screen.getByRole("heading", { name: "The connection service is unavailable" }),
    ).toBeVisible();
  });
});
