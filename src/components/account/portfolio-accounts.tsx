"use client";

import { useActionState, useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, describedBy } from "@/components/ui/field";
import { LocalTime } from "@/components/ui/local-time";
import { StatusPill } from "@/components/ui/status-pill";
import {
  formatMoney,
  INITIAL_PORTFOLIO_ACTION_STATE,
  MAX_NAME_LENGTH,
  type PortfolioActionState,
} from "@/lib/account/portfolio-input";
import type { AccountApiPortfolio } from "@/lib/admin/account-api";

type PortfolioAction = (
  state: PortfolioActionState,
  formData: FormData,
) => Promise<PortfolioActionState>;

type Props = {
  portfolios: readonly AccountApiPortfolio[];
  maxPortfolios: number;
  create: PortfolioAction;
  rename: PortfolioAction;
  makeDefault: PortfolioAction;
  close: PortfolioAction;
};

function Result({ state }: { state: PortfolioActionState }) {
  if (!state.message) return null;
  return (
    <Callout
      tone={state.status === "error" ? "danger" : "success"}
      role={state.status === "error" ? "alert" : "status"}
      compact
    >
      {state.message}
    </Callout>
  );
}

const COLUMNS = [
  { key: "portfolio", label: "Portfolio" },
  { key: "cash", label: "Cash", align: "end" as const },
  { key: "benchmark", label: "Benchmark" },
  { key: "mode", label: "Mode" },
  { key: "opened", label: "Opened" },
  { key: "actions", label: "Actions" },
];

/**
 * One row's controls, revealed on request.
 *
 * The first version of this table rendered every row as an open edit form: two text inputs,
 * a Save button, and a live "Close" confirmation field, on every portfolio. Six controls per
 * row turned a list of two books into a wall of boxes, and it put a destructive control in
 * the reading position on a page whose main job is to be read. Renaming and closing are both
 * deliberate acts, so both are asked for before they appear.
 */
function RowActions({
  portfolio,
  rename,
  makeDefault,
  close,
  isOnly,
}: {
  portfolio: AccountApiPortfolio;
  rename: PortfolioAction;
  makeDefault: PortfolioAction;
  close: PortfolioAction;
  isOnly: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "renaming" | "closing">("idle");
  const [renameState, renameAction, renaming] = useActionState(
    rename,
    INITIAL_PORTFOLIO_ACTION_STATE,
  );
  const [defaultState, defaultAction, settingDefault] = useActionState(
    makeDefault,
    INITIAL_PORTFOLIO_ACTION_STATE,
  );
  const [closeState, closeAction, closing] = useActionState(close, INITIAL_PORTFOLIO_ACTION_STATE);
  const id = useId();
  const [confirmation, setConfirmation] = useState("");

  if (mode === "renaming") {
    return (
      <div className="stack stack--tight">
        <form action={renameAction} className="inline-actions">
          <input type="hidden" name="portfolioId" value={portfolio.id} />
          <label className="sr-only" htmlFor={`${id}-name`}>
            Name for {portfolio.name}
          </label>
          <Input
            id={`${id}-name`}
            name="name"
            defaultValue={portfolio.name}
            maxLength={MAX_NAME_LENGTH}
            invalid={Boolean(renameState.fieldErrors.name[0])}
          />
          <label className="sr-only" htmlFor={`${id}-benchmark`}>
            Benchmark for {portfolio.name}
          </label>
          <Input
            id={`${id}-benchmark`}
            name="benchmarkSymbol"
            defaultValue={portfolio.benchmark_symbol}
            maxLength={20}
            invalid={Boolean(renameState.fieldErrors.benchmarkSymbol[0])}
          />
          <Button variant="primary" type="submit" disabled={renaming}>
            {renaming ? "Saving…" : "Save"}
          </Button>
          <Button type="button" onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </form>
        <Result state={renameState} />
      </div>
    );
  }

  if (mode === "closing") {
    return (
      <div className="stack stack--tight">
        <form action={closeAction} className="inline-actions">
          <input type="hidden" name="portfolioId" value={portfolio.id} />
          <input type="hidden" name="portfolioName" value={portfolio.name} />
          <label className="sr-only" htmlFor={`${id}-confirm`}>
            Type {portfolio.name} to close this portfolio
          </label>
          <Input
            id={`${id}-confirm`}
            name="confirmName"
            value={confirmation}
            onChange={(event) => setConfirmation(event.currentTarget.value)}
            placeholder={`Type ${portfolio.name}`}
            autoComplete="off"
            invalid={Boolean(closeState.fieldErrors.confirmName[0])}
          />
          <Button
            variant="danger"
            type="submit"
            disabled={closing || confirmation.trim() !== portfolio.name}
          >
            {closing ? "Closing…" : "Close"}
          </Button>
          <Button type="button" onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </form>
        <Result state={closeState} />
      </div>
    );
  }

  return (
    <div className="stack stack--tight">
      <div className="inline-actions">
        <Button type="button" onClick={() => setMode("renaming")}>
          Rename
        </Button>
        {!portfolio.is_default && (
          <form action={defaultAction}>
            <input type="hidden" name="portfolioId" value={portfolio.id} />
            <Button type="submit" disabled={settingDefault}>
              {settingDefault ? "Setting…" : "Make default"}
            </Button>
          </form>
        )}
        {/* Said, not hidden. A control that simply vanishes leaves the reader wondering
            whether they missed it; one that explains itself answers the question. */}
        {isOnly ? (
          <span className="quiet">Your only portfolio</span>
        ) : (
          <Button type="button" variant="danger" onClick={() => setMode("closing")}>
            Close
          </Button>
        )}
      </div>
      <Result state={defaultState} />
      <Result state={closeState} />
    </div>
  );
}

function OpenPortfolioForm({
  create,
  atLimit,
  maxPortfolios,
}: {
  create: PortfolioAction;
  atLimit: boolean;
  maxPortfolios: number;
}) {
  const [state, formAction, pending] = useActionState(create, INITIAL_PORTFOLIO_ACTION_STATE);
  const id = useId();
  const [real, setReal] = useState(false);
  const errors = state.fieldErrors;

  if (atLimit) {
    return (
      <Callout tone="attention" role="status" compact>
        This account holds the most portfolios it can ({maxPortfolios}). Close one to open another.
      </Callout>
    );
  }

  return (
    <form className="form" action={formAction}>
      <div className="form-grid">
        <Field id={`${id}-name`} label="Name" error={errors.name[0]}>
          <Input
            id={`${id}-name`}
            name="name"
            required
            maxLength={MAX_NAME_LENGTH}
            placeholder="Growth"
            invalid={Boolean(errors.name[0])}
            aria-describedby={describedBy(`${id}-name`, { error: errors.name[0] })}
          />
        </Field>
        <Field
          id={`${id}-benchmark`}
          label="Benchmark"
          hint="What this book is measured against."
          error={errors.benchmarkSymbol[0]}
        >
          <Input
            id={`${id}-benchmark`}
            name="benchmarkSymbol"
            defaultValue="SPY"
            maxLength={20}
            invalid={Boolean(errors.benchmarkSymbol[0])}
          />
        </Field>
        <Field id={`${id}-currency`} label="Currency" error={errors.baseCurrency[0]}>
          <Input
            id={`${id}-currency`}
            name="baseCurrency"
            defaultValue="USD"
            maxLength={3}
            invalid={Boolean(errors.baseCurrency[0])}
          />
        </Field>
        <Field
          id={`${id}-cash`}
          label="Opening balance"
          note="Optional"
          hint="Left blank, the book starts at zero."
          error={errors.startingCash[0]}
        >
          <Input
            id={`${id}-cash`}
            name="startingCash"
            inputMode="decimal"
            placeholder="100000"
            invalid={Boolean(errors.startingCash[0])}
          />
        </Field>

        <div className="form-grid__span">
          <Checkbox
            id={`${id}-real`}
            name="isPaper"
            value="false"
            checked={real}
            onChange={(event) => setReal(event.currentTarget.checked)}
            tone={real ? "danger" : "default"}
            label="This book holds real money"
            description="Leave this clear for a paper portfolio. Once a book has trades recorded against it, this cannot be changed."
          />
        </div>
      </div>

      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "Opening…" : "Open portfolio"}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function PortfolioAccounts({
  portfolios,
  maxPortfolios,
  create,
  rename,
  makeDefault,
  close,
}: Props) {
  const isOnly = portfolios.length <= 1;

  return (
    <div className="board">
      <Card
        eyebrow="Your portfolios"
        title="Books your trades are recorded against"
        titleId="portfolio-list-heading"
        description="The default is where a trade goes when you do not pick one. A portfolio that holds positions or history is not closed — empty it first."
      >
        <DataTable
          caption="Portfolios"
          columns={COLUMNS}
          minWidth={980}
          scroll={false}
          isEmpty={portfolios.length === 0}
          empty={
            <Callout tone="attention" role="status" compact>
              This account has no portfolio yet. The first one you open becomes the default.
            </Callout>
          }
        >
          {portfolios.map((portfolio) => (
            <tr key={portfolio.id}>
              <td>
                <span className="data-table__primary">{portfolio.name}</span>
                {portfolio.is_default && (
                  <span className="data-table__secondary">
                    New trades go here unless you pick another
                  </span>
                )}
              </td>
              <td className="data-table__num">
                <span className="data-table__primary num">
                  {formatMoney(portfolio.cash_balance, portfolio.base_currency)}
                </span>
                <span className="data-table__secondary num">
                  opened with {formatMoney(portfolio.starting_cash, portfolio.base_currency)}
                </span>
              </td>
              <td>
                <Badge>{portfolio.benchmark_symbol}</Badge>
              </td>
              <td>
                {/* Paper and real money are not interchangeable labels, and the service
                    freezes this once a book has trades. Marking it here is what stops
                    someone reading a simulated P&L as their own. */}
                <StatusPill
                  value={portfolio.is_paper ? "enabled" : "disabled"}
                  tone={portfolio.is_paper ? "neutral" : "danger"}
                  label={portfolio.is_paper ? "Paper" : "Real money"}
                />
              </td>
              <td>
                {portfolio.created_at ? (
                  <LocalTime value={portfolio.created_at} />
                ) : (
                  <span className="quiet">Unknown</span>
                )}
              </td>
              <td className="data-table__actions">
                <RowActions
                  portfolio={portfolio}
                  rename={rename}
                  makeDefault={makeDefault}
                  close={close}
                  isOnly={isOnly}
                />
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>

      <Card
        eyebrow="Open a portfolio"
        title="Start a new book"
        titleId="portfolio-create-heading"
        description="A separate book for a separate mandate — a paper strategy you are testing, or a real account you keep apart from the rest."
      >
        <OpenPortfolioForm
          create={create}
          atLimit={portfolios.length >= maxPortfolios}
          maxPortfolios={maxPortfolios}
        />
      </Card>
    </div>
  );
}
