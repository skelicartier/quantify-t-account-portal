import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PortfolioAccounts } from "@/components/account/portfolio-accounts";
import {
  INITIAL_PORTFOLIO_ACTION_STATE,
  type PortfolioActionState,
} from "@/lib/account/portfolio-input";
import type { AccountApiPortfolio } from "@/lib/admin/account-api";

/** A no-op server action, so the forms render without reaching anything. */
const noop = async (): Promise<PortfolioActionState> => INITIAL_PORTFOLIO_ACTION_STATE;

function portfolio(overrides: Partial<AccountApiPortfolio> = {}): AccountApiPortfolio {
  return {
    id: "3f1b6c20-8d4a-4e59-91b7-0c2a5e8d4f10",
    name: "Main",
    base_currency: "USD",
    benchmark_symbol: "SPY",
    starting_cash: 250000,
    cash_balance: 182430.5,
    is_paper: false,
    is_default: true,
    created_at: "2026-01-16T10:00:00Z",
    updated_at: "2026-09-10T10:00:00Z",
    ...overrides,
  };
}

function renderPage(portfolios: readonly AccountApiPortfolio[], maxPortfolios = 100) {
  return render(
    <PortfolioAccounts
      portfolios={portfolios}
      maxPortfolios={maxPortfolios}
      create={noop}
      rename={noop}
      makeDefault={noop}
      close={noop}
    />,
  );
}

const SECOND = portfolio({
  id: "9c7e2a11-5b3d-4f88-a0c6-1d4f7b2e9a35",
  name: "Momentum sandbox",
  benchmark_symbol: "QQQ",
  starting_cash: 100000,
  cash_balance: 100000,
  is_paper: true,
  is_default: false,
});

describe("PortfolioAccounts", () => {
  describe("the list reads as a list", () => {
    it("shows each book's figures without putting them in input boxes", () => {
      const { container } = renderPage([portfolio(), SECOND]);

      // The first version rendered every row as an open edit form — two inputs and a Save
      // button per portfolio — which turned a list of two books into a wall of controls.
      // Hidden fields are excluded: the claim is about boxes a reader SEES, and the
      // "Make default" form legitimately carries a hidden portfolio id.
      expect(container.querySelectorAll('tbody input:not([type="hidden"])')).toHaveLength(0);
      expect(screen.getByRole("row", { name: /Main/iu })).toHaveTextContent("$182,430.50");
    });

    it("formats money in the book's own currency", () => {
      renderPage([portfolio({ base_currency: "GBP", cash_balance: 1234.5 })]);

      expect(screen.getByRole("row", { name: /Main/iu })).toHaveTextContent("£1,234.50");
    });

    it("does not fail a page over a currency code it does not recognise", () => {
      renderPage([portfolio({ base_currency: "XYZ", cash_balance: 10 })]);

      expect(screen.getByRole("row", { name: /Main/iu })).toHaveTextContent("XYZ");
    });

    it("marks a real-money book differently from a paper one", () => {
      renderPage([portfolio(), SECOND]);

      expect(screen.getByRole("row", { name: /Main/iu })).toHaveTextContent("Real money");
      expect(screen.getByRole("row", { name: /Momentum/iu })).toHaveTextContent("Paper");
    });

    it("says what being the default means rather than only labelling it", () => {
      renderPage([portfolio(), SECOND]);

      expect(screen.getByRole("row", { name: /Main/iu })).toHaveTextContent(/New trades go here/iu);
    });
  });

  describe("destructive controls are asked for, not left open", () => {
    it("shows no confirmation field until Close is pressed", () => {
      renderPage([portfolio(), SECOND]);

      expect(screen.queryByLabelText(/Type Main to close/iu)).not.toBeInTheDocument();
    });

    it("asks for the book's own name once Close is pressed", async () => {
      const user = userEvent.setup();
      renderPage([portfolio(), SECOND]);

      const row = screen.getByRole("row", { name: /Main/iu });
      await user.click(within(row).getByRole("button", { name: "Close" }));

      const confirm = within(row).getByLabelText(/Type Main to close/iu);
      const submit = within(row).getByRole("button", { name: "Close" });
      expect(submit).toBeDisabled();

      await user.type(confirm, "Main");
      expect(submit).toBeEnabled();
    });

    it("is not satisfied by a near miss", async () => {
      const user = userEvent.setup();
      renderPage([portfolio(), SECOND]);

      const row = screen.getByRole("row", { name: /Main/iu });
      await user.click(within(row).getByRole("button", { name: "Close" }));
      await user.type(within(row).getByLabelText(/Type Main to close/iu), "main");

      expect(within(row).getByRole("button", { name: "Close" })).toBeDisabled();
    });

    it("offers no way to close the only portfolio, and says why", () => {
      renderPage([portfolio()]);

      const row = screen.getByRole("row", { name: /Main/iu });
      expect(within(row).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
      expect(row).toHaveTextContent("Your only portfolio");
    });
  });

  describe("renaming", () => {
    it("reveals the fields only when asked", async () => {
      const user = userEvent.setup();
      renderPage([portfolio(), SECOND]);

      const row = screen.getByRole("row", { name: /Main/iu });
      expect(within(row).queryByLabelText(/Name for Main/iu)).not.toBeInTheDocument();

      await user.click(within(row).getByRole("button", { name: "Rename" }));

      expect(within(row).getByLabelText(/Name for Main/iu)).toHaveValue("Main");
      expect(within(row).getByLabelText(/Benchmark for Main/iu)).toHaveValue("SPY");
    });

    it("returns to the row once the save succeeds", async () => {
      // The row used to stay a form for ever: the save worked, the new name appeared, the
      // success message appeared — and "Make default" and "Close" stayed unreachable unless
      // the reader thought to press Cancel on a change they had already committed.
      const user = userEvent.setup();
      const saved = async (): Promise<PortfolioActionState> => ({
        status: "success",
        message: "Saved.",
        fieldErrors: INITIAL_PORTFOLIO_ACTION_STATE.fieldErrors,
      });
      render(
        <PortfolioAccounts
          portfolios={[portfolio(), SECOND]}
          maxPortfolios={100}
          create={noop}
          rename={saved}
          makeDefault={noop}
          close={noop}
        />,
      );

      const row = screen.getByRole("row", { name: /Main/iu });
      await user.click(within(row).getByRole("button", { name: "Rename" }));
      await user.click(within(row).getByRole("button", { name: "Save" }));

      expect(within(row).queryByLabelText(/Name for Main/iu)).not.toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Rename" })).toBeVisible();
    });

    it("can be reopened after a save, rather than closing itself again", async () => {
      // The effect-based version of the fix above re-fired on every render and slammed the
      // form shut the moment it was reopened.
      const user = userEvent.setup();
      const saved = async (): Promise<PortfolioActionState> => ({
        status: "success",
        message: "Saved.",
        fieldErrors: INITIAL_PORTFOLIO_ACTION_STATE.fieldErrors,
      });
      render(
        <PortfolioAccounts
          portfolios={[portfolio(), SECOND]}
          maxPortfolios={100}
          create={noop}
          rename={saved}
          makeDefault={noop}
          close={noop}
        />,
      );

      const row = screen.getByRole("row", { name: /Main/iu });
      await user.click(within(row).getByRole("button", { name: "Rename" }));
      await user.click(within(row).getByRole("button", { name: "Save" }));
      await user.click(within(row).getByRole("button", { name: "Rename" }));

      expect(within(row).getByLabelText(/Name for Main/iu)).toBeVisible();
    });

    it("can be backed out of without changing anything", async () => {
      const user = userEvent.setup();
      renderPage([portfolio(), SECOND]);

      const row = screen.getByRole("row", { name: /Main/iu });
      await user.click(within(row).getByRole("button", { name: "Rename" }));
      await user.click(within(row).getByRole("button", { name: "Cancel" }));

      expect(within(row).queryByLabelText(/Name for Main/iu)).not.toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Rename" })).toBeVisible();
    });
  });

  describe("the default", () => {
    it("is offered on the books that are not it", () => {
      renderPage([portfolio(), SECOND]);

      const other = screen.getByRole("row", { name: /Momentum/iu });
      expect(within(other).getByRole("button", { name: "Make default" })).toBeVisible();
    });

    it("is not offered on the book that already is it", () => {
      renderPage([portfolio(), SECOND]);

      const current = screen.getByRole("row", { name: /Main/iu });
      expect(
        within(current).queryByRole("button", { name: "Make default" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("opening a new book", () => {
    it("defaults to paper, with the warning off", () => {
      renderPage([portfolio()]);

      expect(screen.getByLabelText(/holds real money/iu)).not.toBeChecked();
    });

    it("says the paper flag becomes fixed once a book has trades", () => {
      renderPage([portfolio()]);

      expect(screen.getByText(/cannot be changed/iu)).toBeVisible();
    });

    it("replaces the form with an explanation once the account is at its ceiling", () => {
      renderPage([portfolio(), SECOND], 2);

      expect(screen.queryByRole("button", { name: /Open portfolio/iu })).not.toBeInTheDocument();
      expect(screen.getByText(/most portfolios it can \(2\)/iu)).toBeVisible();
    });
  });

  it("tells an account with no portfolio what happens when it opens one", () => {
    renderPage([]);

    expect(screen.getByText(/first one you open becomes the default/iu)).toBeVisible();
  });
});
