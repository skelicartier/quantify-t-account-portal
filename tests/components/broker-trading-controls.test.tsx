import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  KillSwitchPanel,
  ResumeControl,
  StandingAuthorisations,
} from "@/components/account/broker-trading-controls";
import {
  INITIAL_BROKER_ACTION_STATE,
  type BrokerActionState,
  type StandingAuthorisation,
} from "@/lib/account/broker-input";
import type { KillSwitchActionState, KillSwitchResult } from "@/lib/account/kill-switch";

const CONNECTION = "5c1f7b90-0a2e-4f3b-9d61-7c2a4e6b8d01";
const names = { [CONNECTION]: "Live desk" };
const noop = async (): Promise<BrokerActionState> => INITIAL_BROKER_ACTION_STATE;

const incomplete: KillSwitchResult = {
  complete: false,
  haltedAt: "2026-10-05T21:05:36Z",
  alreadyHalted: false,
  sweepInProgress: false,
  replayed: false,
  connectionsSwitchedOff: 1,
  authorisationsRevoked: 2,
  cancelRequested: 1,
  inFlight: 1,
  inFlightKnown: true,
  connections: [
    {
      connectionId: CONNECTION,
      paper: false,
      workingOrders: 3,
      complete: false,
      counts: { cancel_requested: 1, already_cancelling: 1, refused: 1, unreachable: 0 },
      problems: [{ symbol: "MSFT", outcome: "refused", message: "order is already filled" }],
      inFlight: [{ symbol: "TSLA", side: "buy", quantity: 5, clientOrderId: "qt-4" }],
      unrecorded: 1,
    },
  ],
};

describe("KillSwitchPanel", () => {
  it("asks before stopping, with a fresh key for each press", async () => {
    const user = userEvent.setup();
    const pressed: FormData[] = [];
    const killSwitch = vi.fn(async (_state: KillSwitchActionState, data: FormData) => {
      pressed.push(data);
      return { status: "success" as const, message: "Trading is halted.", result: incomplete };
    });
    const panel = (halted: boolean) => (
      <KillSwitchPanel
        tradingHalted={halted}
        haltedAt={halted ? "2026-10-05T21:05:36Z" : null}
        names={names}
        killSwitch={killSwitch}
        resume={noop}
      />
    );
    const { rerender } = render(panel(false));

    expect(screen.getByText("Trading allowed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop all trading" }));
    const dialog = screen.getByRole("dialog", { name: "Stop all trading on this account?" });
    expect(dialog).toHaveTextContent("every standing authorisation is revoked");
    // The reason is optional, and its label is a plain sentence-case field name.
    expect(within(dialog).getByLabelText("Reason")).not.toBeRequired();

    await user.click(within(dialog).getByRole("button", { name: "Stop all trading" }));

    await waitFor(() => expect(killSwitch).toHaveBeenCalledOnce());
    const key = String(pressed[0]?.get("press_key"));
    expect(key).toMatch(/^[0-9a-f-]{36}$/u);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The action revalidates the page, which re-renders with the account halted.
    rerender(panel(true));

    // A second press is a second key: it re-asks every broker rather than replaying the first.
    await user.click(await screen.findByRole("button", { name: "Cancel working orders again" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Stop all trading" }),
    );
    await waitFor(() => expect(killSwitch).toHaveBeenCalledTimes(2));
    expect(String(pressed[1]?.get("press_key"))).not.toBe(key);
  });

  it("shows what the sweep did at each broker, in the broker's words", async () => {
    const user = userEvent.setup();
    const killSwitch = vi.fn(async () => ({
      status: "success" as const,
      message: "Trading is halted, but the sweep is not complete.",
      result: incomplete,
    }));
    render(
      <KillSwitchPanel
        tradingHalted={false}
        haltedAt={null}
        names={names}
        killSwitch={killSwitch}
        resume={noop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stop all trading" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Stop all trading" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sweep not complete");
    expect(alert).toHaveTextContent("2 standing authorisations revoked.");
    expect(alert).toHaveTextContent("1 cancel reached the broker but could not be recorded");
    const row = screen.getByRole("row", { name: /Live desk/u });
    expect(row).toHaveTextContent("Live money");
    expect(row).toHaveTextContent("Not complete");
    expect(screen.getByText(/order is already filled/u)).toBeInTheDocument();
    expect(screen.getByText(/BUY 5 TSLA/u)).toBeInTheDocument();
    for (const heading of ["Cancel requested", "Already cancelling", "Refused", "Unreachable"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
  });

  it("stays offered when the trading state could not be read, and when the account is held", () => {
    render(
      <KillSwitchPanel
        tradingHalted={null}
        haltedAt={null}
        names={{}}
        killSwitch={vi.fn()}
        resume={noop}
        held
      />,
    );
    expect(screen.getByText(/could not be read. The switch still works/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop all trading" })).toBeEnabled();
  });

  it("says since when and why the account's trading is off", () => {
    render(
      <KillSwitchPanel
        tradingHalted
        haltedAt="2026-10-05T21:05:36Z"
        haltReason="strategy   misbehaving"
        names={names}
        killSwitch={vi.fn()}
        resume={noop}
      />,
    );

    expect(screen.getByText(/^Since/u)).toBeInTheDocument();
    expect(screen.getByText("Reason: Strategy misbehaving")).toBeInTheDocument();
  });

  it("offers the account resume only while halted, and never to a held account", () => {
    const { rerender } = render(
      <KillSwitchPanel
        tradingHalted
        haltedAt="2026-10-05T21:05:36Z"
        names={names}
        killSwitch={vi.fn()}
        resume={noop}
      />,
    );
    expect(screen.getByText("Trading halted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lift the account's halt" })).toBeInTheDocument();

    rerender(
      <KillSwitchPanel
        tradingHalted
        haltedAt="2026-10-05T21:05:36Z"
        names={names}
        killSwitch={vi.fn()}
        resume={noop}
        held
      />,
    );
    expect(screen.queryByRole("button", { name: "Lift the account's halt" })).toBeNull();
  });
});

describe("ResumeControl", () => {
  it("asks for the password, keeps the dialog open on a refusal, and clears the field", async () => {
    const user = userEvent.setup();
    const resume = vi.fn(async () => ({
      status: "error" as const,
      message: "That password is not correct. Nothing was changed.",
    }));
    render(
      <ResumeControl
        scope="connection"
        connectionId={CONNECTION}
        connectionName="Live desk"
        resume={resume}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Resume" }));
    const dialog = screen.getByRole("dialog", { name: "Turn trading back on for Live desk?" });
    const password = within(dialog).getByLabelText("Your password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    // Focus starts in the dialog, so the password can be typed at once.
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.type(password, "wrong-password");
    await user.click(within(dialog).getByRole("button", { name: "Turn trading back on" }));

    await waitFor(() => expect(resume).toHaveBeenCalledOnce());
    const sent = (resume.mock.calls[0] as unknown as [BrokerActionState, FormData])[1];
    expect(sent.get("scope")).toBe("connection");
    expect(sent.get("connection_id")).toBe(CONNECTION);
    expect(
      await within(screen.getByRole("dialog")).findByText(/That password is not correct/u),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByLabelText("Your password")).toHaveValue("");
  });

  it("closes on success and says what happened outside the dialog", async () => {
    const user = userEvent.setup();
    const resume = vi.fn(async () => ({
      status: "success" as const,
      message: "Trading is back on for Live desk.",
    }));
    render(
      <ResumeControl
        scope="connection"
        connectionId={CONNECTION}
        connectionName="Live desk"
        resume={resume}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.type(screen.getByLabelText("Your password"), "right");
    await user.click(screen.getByRole("button", { name: "Turn trading back on" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Trading is back on for Live desk.",
    );
  });

  it("keeps the answer on the page once there is nothing left to resume", async () => {
    const user = userEvent.setup();
    const resume = vi.fn(async () => ({
      status: "success" as const,
      message: "Trading is back on for Live desk.",
    }));
    const { rerender } = render(
      <ResumeControl
        scope="connection"
        connectionId={CONNECTION}
        connectionName="Live desk"
        resume={resume}
        available
      />,
    );
    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.type(screen.getByLabelText("Your password"), "right");
    await user.click(screen.getByRole("button", { name: "Turn trading back on" }));
    await screen.findByRole("status");

    // The page re-renders with the connection no longer halted.
    rerender(
      <ResumeControl
        scope="connection"
        connectionId={CONNECTION}
        connectionName="Live desk"
        resume={resume}
        available={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Trading is back on for Live desk.");
  });

  it("closes on Escape without sending anything", async () => {
    const user = userEvent.setup();
    const resume = vi.fn(noop);
    render(<ResumeControl scope="account" resume={resume} />);

    await user.click(screen.getByRole("button", { name: "Lift the account's halt" }));
    expect(screen.getByRole("dialog", { name: "Lift the account's halt?" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(resume).not.toHaveBeenCalled();
  });
});

describe("StandingAuthorisations", () => {
  const authorisation: StandingAuthorisation = {
    id: "a1b2c3d4-0000-4000-8000-000000000001",
    connection_id: CONNECTION,
    account: "PA3XYZ",
    broker: "alpaca",
    strategy: "Mean reversion",
    max_order_value: 5000,
    max_orders: 10,
    used_orders: 3,
    remaining: 7,
    expires_at: "2026-10-06T21:00:00Z",
    created_at: "2026-10-05T21:00:00Z",
    revoked_at: null,
    revoke_reason: "",
    state: "active",
  };

  it("lists each one in full and revokes an active one after asking", async () => {
    const user = userEvent.setup();
    const revoke = vi.fn(async () => ({
      status: "success" as const,
      message: "Revoked. Automated orders for Mean reversion stop at once.",
    }));
    render(
      <StandingAuthorisations
        view={{
          status: "ready",
          items: [
            authorisation,
            {
              ...authorisation,
              id: "a1b2c3d4-0000-4000-8000-000000000002",
              strategy: "Breakout",
              state: "revoked",
              revoke_reason: "kill switch",
            },
          ],
        }}
        names={names}
        revoke={revoke}
      />,
    );

    const active = screen.getByRole("row", { name: /Mean reversion/u });
    expect(active).toHaveTextContent("Live desk");
    expect(active).toHaveTextContent("5,000");
    expect(active).toHaveTextContent("3 of 10");
    const revoked = screen.getByRole("row", { name: /Breakout/u });
    expect(revoked).toHaveTextContent("kill switch");
    expect(within(revoked).queryByRole("button", { name: "Revoke" })).toBeNull();

    await user.click(within(active).getByRole("button", { name: "Revoke" }));
    const dialog = screen.getByRole("dialog", {
      name: "Revoke the authorisation for Mean reversion?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(revoke).toHaveBeenCalledOnce());
    const sent = (revoke.mock.calls[0] as unknown as [BrokerActionState, FormData])[1];
    expect(sent.get("authorisation_id")).toBe(authorisation.id);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Revoked. Automated orders for Mean reversion stop at once.",
    );
  });

  it("says so when the list could not be read, and that the kill switch still covers it", () => {
    render(<StandingAuthorisations view={{ status: "unavailable" }} names={names} revoke={noop} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/kill switch still revokes/u);
  });
});
