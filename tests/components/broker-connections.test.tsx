import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BrokerConnections } from "@/components/account/broker-connections";
import {
  brokerById,
  INITIAL_BROKER_ACTION_STATE,
  type BrokerActionState,
  type BrokerConnection,
} from "@/lib/account/broker-input";

const NOW = Date.parse("2026-09-13T12:00:00Z");

/** A no-op server action, so the form can render without reaching anything. */
const noop = async (): Promise<BrokerActionState> => INITIAL_BROKER_ACTION_STATE;

/**
 * One connection, exactly as `BrokerConnection` declares it.
 *
 * Deliberately not cast. An earlier draft ended `as BrokerConnection`, which let the fixture
 * carry a `trading_enabled` the type does not have and omit four fields it does — so the
 * tests were rendering a shape the API never sends.
 */
function connection(overrides: Partial<BrokerConnection> = {}): BrokerConnection {
  return {
    id: "5c1f7b90-0a2e-4f3b-9d61-7c2a4e6b8d01",
    broker: "alpaca",
    name: "Paper desk",
    account_reference: "",
    paper: true,
    is_active: true,
    credential_fingerprint: "9f2c41aa7be3",
    credential_last_four: "0API",
    last_test_at: "2026-09-13T11:00:00Z",
    last_test_success: true,
    trading_enabled: true,
    last_error: "",
    created_at: "2026-09-13T10:00:00Z",
    updated_at: "2026-09-13T11:00:00Z",
    ...overrides,
  };
}

function renderPage(connections: readonly BrokerConnection[] = []) {
  return render(
    <BrokerConnections
      connections={connections}
      now={NOW}
      connect={noop}
      test={noop}
      disconnect={noop}
    />,
  );
}

describe("BrokerConnections", () => {
  describe("the credential never comes back", () => {
    it("names a stored credential without showing it", () => {
      renderPage([connection()]);

      const row = screen.getByRole("row", { name: /Paper desk/iu });
      expect(row).toHaveTextContent("····0API");
      expect(row).toHaveTextContent("9f2c41aa7be3");
    });

    it("says a credential is stored even when the service sent no last four", () => {
      renderPage([connection({ credential_last_four: "" })]);

      expect(screen.getByRole("row", { name: /Paper desk/iu })).toHaveTextContent("Stored");
    });

    it("takes every secret in a password field the browser is told not to remember", () => {
      const { container } = renderPage();

      // Named one by one, from the broker catalogue rather than from the rendered markup.
      // An earlier version of this test collected `input[type="password"]` and asserted about
      // whatever it found — which still passed when one of the two was changed to a text
      // input, because the survivor satisfied it. The failure it exists to catch is exactly
      // one secret being typed in the clear.
      const secretFields = brokerById("alpaca")!.fields;
      expect(secretFields.length).toBeGreaterThan(0);

      for (const field of secretFields) {
        const input = container.querySelector(`input[name="${field}"]`);
        expect(input, `no input is named ${field}`).not.toBeNull();
        expect(input).toHaveAttribute("type", "password");
        expect(input).toHaveAttribute("autocomplete", "off");
        expect(input).toBeRequired();
      }
    });
  });

  describe("live money is never the quiet default", () => {
    it("starts on paper, with no warning to dismiss", () => {
      renderPage();

      expect(screen.getByLabelText(/live-trading credentials/iu)).not.toBeChecked();
      expect(screen.queryByText(/use real money/iu)).not.toBeInTheDocument();
    });

    it("warns as soon as the connection is marked live", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByLabelText(/live-trading credentials/iu));

      expect(screen.getByText(/use real money/iu)).toBeVisible();
    });

    it("marks a live connection differently from a paper one in the list", () => {
      renderPage([connection({ paper: false, name: "Live desk" })]);

      expect(screen.getByRole("row", { name: /Live desk/iu })).toHaveTextContent("Live money");
    });
  });

  describe("removing a connection", () => {
    it("refuses until the connection's own name is typed", async () => {
      const user = userEvent.setup();
      renderPage([connection()]);

      const row = screen.getByRole("row", { name: /Paper desk/iu });
      const remove = within(row).getByRole("button", { name: "Remove" });
      expect(remove).toBeDisabled();

      await user.type(within(row).getByLabelText(/Type Paper desk/iu), "Paper desk");

      expect(remove).toBeEnabled();
    });

    it("is not satisfied by a near miss", async () => {
      const user = userEvent.setup();
      renderPage([connection()]);

      const row = screen.getByRole("row", { name: /Paper desk/iu });
      await user.type(within(row).getByLabelText(/Type Paper desk/iu), "paper desk");

      expect(within(row).getByRole("button", { name: "Remove" })).toBeDisabled();
    });
  });

  describe("readiness", () => {
    it("holds a never-tested connection back from trading", () => {
      renderPage([connection({ last_test_at: null, last_test_success: false })]);

      const row = screen.getByRole("row", { name: /Paper desk/iu });
      expect(row).toHaveTextContent("Needs a test");
      expect(row).toHaveTextContent("Never tested");
    });

    it("holds a connection back when its trading switch is off", () => {
      // The service checks this before anything else and refuses the order. Saying "Ready"
      // here promised something the order route would decline.
      renderPage([connection({ trading_enabled: false })]);

      expect(screen.getByRole("row", { name: /Paper desk/iu })).toHaveTextContent("Needs a test");
    });

    it("surfaces the reason the last test failed", () => {
      renderPage([connection({ last_test_success: false, last_error: "Key rejected by Alpaca" })]);

      expect(screen.getByRole("row", { name: /Paper desk/iu })).toHaveTextContent(
        "Key rejected by Alpaca",
      );
    });
  });

  it("tells an account with no connection what to do rather than showing an empty table", () => {
    renderPage();

    expect(screen.getByText("No broker connected")).toBeVisible();
    expect(screen.queryByRole("table", { name: "Broker connections" })).not.toBeInTheDocument();
  });
});
