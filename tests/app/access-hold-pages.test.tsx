import { render, screen } from "@testing-library/react";

/**
 * The pages behind the access gate, for an account that has not been admitted: each shows the
 * hold in place of its usual "could not be reached", and Brokers keeps the kill switch.
 */

const mocks = vi.hoisted(() => ({
  getCurrentAccessHold: vi.fn(),
  getBrokerConnections: vi.fn(),
  getPortfolios: vi.fn(),
  getOvernightMornings: vi.fn(),
  getOvernightBrief: vi.fn(),
  requireCurrentSubscription: vi.fn(),
}));

vi.mock("@/lib/dal/access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dal/access")>("@/lib/dal/access");
  return { ...actual, getCurrentAccessHold: mocks.getCurrentAccessHold };
});
vi.mock("@/lib/dal/account", () => ({ getCurrentAccount: vi.fn() }));
vi.mock("@/lib/dal/brokers", () => ({ getBrokerConnections: mocks.getBrokerConnections }));
vi.mock("@/lib/dal/portfolios", () => ({ getPortfolios: mocks.getPortfolios }));
vi.mock("@/lib/dal/overnight", () => ({
  getOvernightMornings: mocks.getOvernightMornings,
  getOvernightBrief: mocks.getOvernightBrief,
}));
vi.mock("@/lib/dal/subscription", () => ({
  requireCurrentSubscription: mocks.requireCurrentSubscription,
}));
vi.mock("@/app/account/brokers/actions", () => ({
  connectBroker: vi.fn(),
  disconnectBroker: vi.fn(),
  engageKillSwitch: vi.fn(),
  resumeTrading: vi.fn(),
  revokeStandingAuthorisation: vi.fn(),
  testBrokerConnection: vi.fn(),
}));
vi.mock("@/app/account/portfolios/actions", () => ({
  closePortfolio: vi.fn(),
  createPortfolio: vi.fn(),
  makePortfolioDefault: vi.fn(),
  renamePortfolio: vi.fn(),
}));
vi.mock("@/lib/request-time", () => ({ requestNow: () => Date.parse("2026-10-06T00:00:00Z") }));

import BrokersPage from "@/app/account/brokers/page";
import OvernightPage from "@/app/account/overnight/page";
import PortfoliosPage from "@/app/account/portfolios/page";
import AccountSubscriptionPage from "@/app/account/subscription/page";
import { AccountAccessHeldError } from "@/lib/dal/access";

const PENDING =
  "Your application is being reviewed. We will email you as soon as it has been decided.";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentAccessHold.mockResolvedValue(null);
});

describe("pages behind the access gate", () => {
  it("holds Overnight, Portfolios and Subscription without reading what the API would refuse", async () => {
    mocks.getCurrentAccessHold.mockResolvedValue("pending");

    render(await OvernightPage({ searchParams: Promise.resolve({}) }));
    render(await PortfoliosPage());
    render(await AccountSubscriptionPage());

    expect(screen.getAllByText("Opens once your application is approved")).toHaveLength(3);
    expect(mocks.getOvernightMornings).not.toHaveBeenCalled();
    expect(mocks.getPortfolios).not.toHaveBeenCalled();
    expect(mocks.requireCurrentSubscription).not.toHaveBeenCalled();
    // The layout's banner says the sentence; the page does not say it twice.
    expect(screen.queryByText(PENDING)).toBeNull();
  });

  it("says the sentence itself when only the page's own read was refused", async () => {
    mocks.getPortfolios.mockResolvedValue({ status: "access", access: "declined" });
    mocks.requireCurrentSubscription.mockRejectedValue(new AccountAccessHeldError("pending"));

    render(await PortfoliosPage());
    render(await AccountSubscriptionPage());

    expect(screen.getByText("Not available on this account")).toBeVisible();
    expect(screen.getByText(/export or delete your data/u)).toBeVisible();
    expect(screen.getByText(PENDING)).toBeVisible();
  });

  it("lets every other subscription failure reach the error boundary", async () => {
    mocks.requireCurrentSubscription.mockRejectedValue(new Error("outage"));

    await expect(AccountSubscriptionPage()).rejects.toThrow("outage");
  });
});

describe("the brokers page", () => {
  it("keeps the kill switch for an account whose connection list the API refuses", async () => {
    mocks.getBrokerConnections.mockResolvedValue({ status: "access", access: "pending" });

    render(await BrokersPage());

    expect(
      screen.getByText("Connecting a broker opens once your application is approved"),
    ).toBeVisible();
    expect(screen.getByText(PENDING)).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop all trading" })).toBeEnabled();
  });

  it("keeps the kill switch through an outage", async () => {
    mocks.getBrokerConnections.mockResolvedValue({ status: "unavailable" });

    render(await BrokersPage());

    expect(screen.getByText("The account service could not be reached")).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop all trading" })).toBeEnabled();
  });

  it("shows a held account its connections with only the acts that take risk away", async () => {
    mocks.getCurrentAccessHold.mockResolvedValue("declined");
    mocks.getBrokerConnections.mockResolvedValue({
      status: "ready",
      data: {
        ok: true,
        correlation_id: "qt",
        connections: [],
        implemented_brokers: ["alpaca", "upstox"],
        encryption_configured: true,
        trading_halted: false,
        halted_at: null,
      },
      authorisations: { status: "ready", items: [] },
    });

    render(await BrokersPage());

    expect(screen.getByRole("button", { name: "Stop all trading" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Connect broker" })).toBeNull();
    expect(screen.getByText("Connecting a broker is not available on this account")).toBeVisible();
  });
});
