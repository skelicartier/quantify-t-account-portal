"use client";

import { OctagonX } from "lucide-react";
import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { LocalTime } from "@/components/ui/local-time";
import { StatusPill } from "@/components/ui/status-pill";
import {
  INITIAL_BROKER_ACTION_STATE,
  type BrokerActionState,
  type StandingAuthorisation,
  type StandingAuthorisationsView,
} from "@/lib/account/broker-input";
import {
  CANCEL_OUTCOME_LABELS,
  INITIAL_KILL_SWITCH_STATE,
  haltReasonText,
  newPressKey,
  type KillSwitchActionState,
  type KillSwitchResult,
} from "@/lib/account/kill-switch";
import { formatNumber, pluralize } from "@/lib/format";

type BrokerAction = (state: BrokerActionState, formData: FormData) => Promise<BrokerActionState>;
type KillSwitchAction = (
  state: KillSwitchActionState,
  formData: FormData,
) => Promise<KillSwitchActionState>;

/** Connection id → the name the customer gave it, so results never print a bare id. */
export type ConnectionNames = Readonly<Record<string, string>>;

function connectionLabel(names: ConnectionNames, id: string): string {
  return names[id] || `Connection ····${id.slice(-4)}`;
}

function Result({ state }: { state: BrokerActionState }) {
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

/**
 * An action whose dialog closes when it succeeds and stays open, with the refusal, when it
 * does not. The refusal shown is only ever one produced since this opening, so reopening the
 * dialog never greets the person with a stale "wrong password".
 */
function useDialogAction(action: BrokerAction) {
  const [open, setOpen] = useState(false);
  const [openedWith, setOpenedWith] = useState<BrokerActionState | null>(null);
  const [state, formAction, pending] = useActionState(
    async (previous: BrokerActionState, formData: FormData) => {
      const next = await action(previous, formData);
      if (next.status === "success") setOpen(false);
      return next;
    },
    INITIAL_BROKER_ACTION_STATE,
  );
  return {
    open,
    pending,
    formAction,
    state,
    dialogError: open && state !== openedWith && state.status === "error" ? state.message : null,
    outcome: !open && state !== openedWith ? state : INITIAL_BROKER_ACTION_STATE,
    show() {
      setOpenedWith(state);
      setOpen(true);
    },
    hide() {
      setOpen(false);
    },
  };
}

type ResumeControlProps = {
  resume: BrokerAction;
  /**
   * Whether there is anything to resume. The control stays mounted when there is not, so the
   * answer to a resume that just worked is still on the page after it re-renders without
   * the halt — unmounting it with the button took the confirmation with it.
   */
  available?: boolean;
} & (
  | { scope: "connection"; connectionId: string; connectionName: string }
  | { scope: "account"; connectionId?: undefined; connectionName?: undefined }
);

/**
 * Turn trading back on — one connection, or the account's halt — with the password.
 *
 * The password field is uncontrolled inside a form whose action is a function, so React
 * clears it after every attempt; it lives in the page only for as long as it takes to press
 * the button, and the server action forwards it to the account service and drops it.
 */
export function ResumeControl(props: ResumeControlProps) {
  const { resume, scope, available = true } = props;
  const id = useId();
  const control = useDialogAction(resume);
  const titleId = `${id}-title`;
  const name = props.connectionName ?? "";

  return (
    <div className="stack stack--tight">
      {(available || control.open) && (
        <div>
          <Button onClick={control.show} disabled={control.pending}>
            {scope === "account" ? "Lift the account's halt" : "Resume"}
          </Button>
        </div>
      )}
      <Result state={control.outcome} />
      <Dialog
        open={control.open}
        onClose={control.hide}
        titleId={titleId}
        title={
          scope === "account" ? "Lift the account's halt?" : `Turn trading back on for ${name}?`
        }
      >
        <form action={control.formAction} className="form">
          <input type="hidden" name="scope" value={scope} />
          {scope === "connection" && (
            <>
              <input type="hidden" name="connection_id" value={props.connectionId} />
              <input type="hidden" name="connection_name" value={name} />
            </>
          )}
          <div className="dialog__body">
            {scope === "account" ? (
              <p>
                Orders are accepted again on connections that are switched on. Connections the kill
                switch switched off stay off until each one is resumed and passes a test.
              </p>
            ) : (
              <p>
                The account service tests this connection at the broker now. Trading comes back only
                if the test passes; if it fails, the connection stays off and says why.
              </p>
            )}
            <p>Standing authorisations the kill switch revoked stay revoked.</p>
          </div>
          <Field
            id={`${id}-password`}
            label="Your password"
            hint="Asked every time trading is turned back on. The account service checks it; it is never kept here."
            error={control.dialogError ?? undefined}
          >
            <Input
              id={`${id}-password`}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              invalid={Boolean(control.dialogError)}
              aria-describedby={[
                control.dialogError ? `${id}-password-error` : "",
                `${id}-password-hint`,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </Field>
          <div className="dialog__actions">
            <Button variant="ghost" onClick={control.hide} disabled={control.pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={control.pending}
              aria-busy={control.pending}
            >
              {control.pending ? "Checking…" : "Turn trading back on"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

const SWEEP_COLUMNS = [
  { key: "connection", label: "Connection" },
  { key: "working", label: "Working orders", align: "end" as const },
  { key: "requested", label: CANCEL_OUTCOME_LABELS.cancel_requested, align: "end" as const },
  { key: "cancelling", label: CANCEL_OUTCOME_LABELS.already_cancelling, align: "end" as const },
  { key: "refused", label: CANCEL_OUTCOME_LABELS.refused, align: "end" as const },
  { key: "unreachable", label: CANCEL_OUTCOME_LABELS.unreachable, align: "end" as const },
  { key: "in-flight", label: "In flight", align: "end" as const },
  { key: "swept", label: "Swept" },
];

/** What the sweep found, connection by connection, with the broker's refusals in its words. */
export function SweepResult({
  result,
  message,
  names,
}: {
  result: KillSwitchResult;
  message: string;
  names: ConnectionNames;
}) {
  const facts: string[] = [];
  if (result.replayed) facts.push("This is the answer to your earlier press.");
  if (result.alreadyHalted) {
    facts.push("Trading was already halted; this press asked every broker again.");
  }
  if (result.connectionsSwitchedOff !== null && result.connectionsSwitchedOff > 0) {
    facts.push(`${pluralize(result.connectionsSwitchedOff, "connection")} switched off.`);
  }
  if (result.authorisationsRevoked !== null && result.authorisationsRevoked > 0) {
    facts.push(`${pluralize(result.authorisationsRevoked, "standing authorisation")} revoked.`);
  }
  const unrecorded = result.connections.reduce((sum, connection) => sum + connection.unrecorded, 0);
  if (unrecorded > 0) {
    facts.push(
      `${pluralize(unrecorded, "cancel")} reached the broker but could not be recorded, so your activity may not show ${unrecorded === 1 ? "it" : "them"}.`,
    );
  }
  const problems = result.connections.flatMap((connection) =>
    connection.problems.map((problem) => ({ ...problem, connectionId: connection.connectionId })),
  );
  const flying = result.connections.flatMap((connection) =>
    connection.inFlight.map((order) => ({ ...order, connectionId: connection.connectionId })),
  );

  return (
    <div className="sweep" aria-live="polite">
      <Callout
        tone={result.complete ? "success" : "danger"}
        role={result.complete ? "status" : "alert"}
        title={result.complete ? "Sweep complete" : "Sweep not complete"}
      >
        <p>{message}</p>
        {facts.length > 0 && <p>{facts.join(" ")}</p>}
      </Callout>

      {result.connections.length > 0 && (
        <DataTable
          caption="What the kill switch did at each broker"
          columns={SWEEP_COLUMNS}
          minWidth={860}
        >
          {result.connections.map((connection) => (
            <tr key={connection.connectionId}>
              <td>
                <span className="data-table__primary">
                  {connectionLabel(names, connection.connectionId)}
                </span>
                <span className="data-table__secondary">
                  {connection.paper ? "Paper" : "Live money"}
                </span>
              </td>
              <td className="data-table__num">{formatNumber(connection.workingOrders)}</td>
              <td className="data-table__num">
                {formatNumber(connection.counts.cancel_requested)}
              </td>
              <td className="data-table__num">
                {formatNumber(connection.counts.already_cancelling)}
              </td>
              <td className="data-table__num">{formatNumber(connection.counts.refused)}</td>
              <td className="data-table__num">{formatNumber(connection.counts.unreachable)}</td>
              <td className="data-table__num">{formatNumber(connection.inFlight.length)}</td>
              <td>
                <StatusPill
                  value={connection.complete ? "complete" : "partial"}
                  label={connection.complete ? "Complete" : "Not complete"}
                />
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {problems.length > 0 && (
        <div className="stack stack--tight">
          <h4 className="card__title">What the brokers said</h4>
          <ul className="sweep__problems">
            {problems.map((problem, index) => (
              <li key={`${problem.connectionId}-${index}`}>
                <strong>{connectionLabel(names, problem.connectionId)}</strong>
                {problem.symbol ? ` · ${problem.symbol}` : ""} —{" "}
                {CANCEL_OUTCOME_LABELS[problem.outcome]}
                {problem.message ? `: ${problem.message}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {flying.length > 0 && (
        <div className="stack stack--tight">
          <h4 className="card__title">Still on its way to a broker</h4>
          <ul className="sweep__problems">
            {flying.map((order) => (
              <li key={`${order.connectionId}-${order.clientOrderId}`}>
                <strong>{connectionLabel(names, order.connectionId)}</strong> ·{" "}
                <span className="mono">
                  {order.side.toUpperCase()} {formatNumber(order.quantity)} {order.symbol}
                </span>{" "}
                — cancelled by the account service the moment the broker accepts it.
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type KillSwitchPanelProps = {
  /** Null when the connection list could not be read: the switch still works without it. */
  tradingHalted: boolean | null;
  /**
   * The account is not admitted. The switch stays — stopping is open whatever the access
   * state — but turning trading back on is part of the product, so no resume is offered.
   */
  held?: boolean;
  haltedAt: string | null;
  /** Why the account was halted, as `me/brokers` reports it. */
  haltReason?: string | null;
  names: ConnectionNames;
  killSwitch: KillSwitchAction;
  resume: BrokerAction;
};

/**
 * The account's kill switch: stop every connection, revoke every standing authorisation and
 * cancel every working order, in one press.
 *
 * A confirm dialog, because the press is immediate and broad — but no password: stopping must
 * never be harder than doing nothing. Each opening of the dialog makes a fresh key for that
 * press, which the server action sends as the Idempotency-Key.
 */
export function KillSwitchPanel({
  tradingHalted,
  haltedAt,
  haltReason = null,
  names,
  killSwitch,
  resume,
  held = false,
}: KillSwitchPanelProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pressKey, setPressKey] = useState("");
  const [state, formAction, pending] = useActionState(
    async (previous: KillSwitchActionState, formData: FormData) => {
      const next = await killSwitch(previous, formData);
      setOpen(false);
      return next;
    },
    INITIAL_KILL_SWITCH_STATE,
  );
  // The server's word when it has one; a press's own answer only when the state could not be
  // read, so lifting the halt afterwards is not contradicted by an old sweep result.
  const halted = tradingHalted === true || (tradingHalted === null && state.result !== null);

  function press() {
    setPressKey(newPressKey());
    setOpen(true);
  }

  return (
    <Card
      title="Kill switch"
      titleId="kill-switch-heading"
      danger
      description="Stops all trading on this account at once: every connection is switched off, every standing authorisation is revoked, and each broker is asked to cancel every working order, paper included."
    >
      <div className="stack">
        <div className="kill-switch">
          <div className="kill-switch__state">
            {halted ? (
              <>
                <StatusPill value="halted" tone="danger" label="Trading halted" />
                {haltedAt && (
                  <span className="data-table__secondary">
                    Since <LocalTime value={haltedAt} />
                  </span>
                )}
                {haltReasonText(haltReason) && (
                  <span className="data-table__secondary">
                    Reason: {haltReasonText(haltReason)}
                  </span>
                )}
              </>
            ) : tradingHalted === false ? (
              <StatusPill value="on" tone="live" label="Trading allowed" />
            ) : (
              <span className="data-table__secondary">
                The trading state could not be read. The switch still works.
              </span>
            )}
          </div>
          <div className="kill-switch__actions">
            <Button variant="danger" onClick={press} disabled={pending} aria-busy={pending}>
              <OctagonX size={16} aria-hidden="true" />
              {pending ? "Stopping…" : halted ? "Cancel working orders again" : "Stop all trading"}
            </Button>
          </div>
        </div>

        {tradingHalted !== null && !held && (
          <ResumeControl scope="account" resume={resume} available={tradingHalted} />
        )}

        {state.status === "error" && (
          <Callout tone="danger" role="alert" compact>
            {state.message}
          </Callout>
        )}
        {state.result && (
          <SweepResult result={state.result} message={state.message} names={names} />
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        titleId={`${id}-title`}
        tone="danger"
        title="Stop all trading on this account?"
      >
        <form action={formAction} className="form">
          <input type="hidden" name="press_key" value={pressKey} />
          <div className="dialog__body">
            <p>This happens at once, before anything else is checked:</p>
            <ul>
              <li>every broker connection is switched off;</li>
              <li>every standing authorisation is revoked;</li>
              <li>each broker is asked to cancel every working order, paper included.</li>
            </ul>
            <p>
              Turning trading back on takes your password, and each connection is tested at the
              broker before it trades again.
            </p>
          </div>
          <Field
            id={`${id}-reason`}
            label="Reason"
            note="Optional"
            hint="Kept with the halt in your account's activity."
          >
            <Input id={`${id}-reason`} name="reason" maxLength={200} autoComplete="off" />
          </Field>
          <div className="dialog__actions">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Keep trading
            </Button>
            <Button variant="danger" type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "Stopping…" : "Stop all trading"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

function RevokeControl({
  authorisation,
  revoke,
}: {
  authorisation: StandingAuthorisation;
  revoke: BrokerAction;
}) {
  const id = useId();
  const control = useDialogAction(revoke);
  return (
    <div className="stack stack--tight">
      <div>
        <Button variant="danger" size="small" onClick={control.show} disabled={control.pending}>
          Revoke
        </Button>
      </div>
      <Result state={control.outcome} />
      <Dialog
        open={control.open}
        onClose={control.hide}
        titleId={`${id}-title`}
        tone="danger"
        title={`Revoke the authorisation for ${authorisation.strategy}?`}
      >
        <form action={control.formAction} className="form">
          <input type="hidden" name="authorisation_id" value={authorisation.id} />
          <input type="hidden" name="strategy" value={authorisation.strategy} />
          <div className="dialog__body">
            <p>
              Automated orders under it stop at once. Orders already sent are not cancelled — the
              kill switch does that.
            </p>
            <p>Arming a new authorisation takes your password in the desktop app.</p>
          </div>
          {control.dialogError && (
            <Callout tone="danger" role="alert" compact>
              {control.dialogError}
            </Callout>
          )}
          <div className="dialog__actions">
            <Button variant="ghost" onClick={control.hide} disabled={control.pending}>
              Keep it
            </Button>
            <Button
              variant="danger"
              type="submit"
              disabled={control.pending}
              aria-busy={control.pending}
            >
              {control.pending ? "Revoking…" : "Revoke"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

const AUTHORISATION_COLUMNS = [
  { key: "strategy", label: "Strategy" },
  { key: "connection", label: "Connection" },
  { key: "ceiling", label: "Largest order", align: "end" as const },
  { key: "orders", label: "Orders used" },
  { key: "expires", label: "Ends" },
  { key: "state", label: "State" },
  { key: "actions", label: "Actions" },
];

const AUTHORISATION_STATE_LABELS: Record<StandingAuthorisation["state"], string> = {
  active: "Active",
  expired: "Ended",
  used: "All orders used",
  revoked: "Revoked",
};

/**
 * Standing authorisations: what lets a strategy in the desktop app send live orders without a
 * person confirming each one. Listed and revoked here; armed in the desktop app, where the
 * strategy runs, with the password.
 */
export function StandingAuthorisations({
  view,
  names,
  revoke,
}: {
  view: StandingAuthorisationsView;
  names: ConnectionNames;
  revoke: BrokerAction;
}) {
  return (
    <Card
      title="Standing authorisations"
      titleId="authorisations-heading"
      description="What lets a strategy in the desktop app send live orders without you confirming each one. Each is armed in the desktop app with your password, for one strategy on one connection, for at most a day. Revoke one here and its orders stop at once; the kill switch revokes them all."
    >
      {view.status === "unavailable" ? (
        <Callout tone="danger" role="alert" compact>
          Your standing authorisations could not be read. The kill switch still revokes every one of
          them.
        </Callout>
      ) : (
        <DataTable
          caption="Standing authorisations"
          columns={AUTHORISATION_COLUMNS}
          minWidth={900}
          isEmpty={view.items.length === 0}
          empty={
            <EmptyState
              title="No standing authorisations"
              description="None has been armed. Live orders from the desktop app each need you to confirm them."
              compact
            />
          }
        >
          {view.items.map((authorisation) => (
            <tr key={authorisation.id}>
              <td>
                <span className="data-table__primary">{authorisation.strategy}</span>
                {authorisation.account && (
                  <span className="data-table__secondary mono">{authorisation.account}</span>
                )}
              </td>
              <td>{connectionLabel(names, authorisation.connection_id)}</td>
              <td className="data-table__num">{formatNumber(authorisation.max_order_value)}</td>
              <td>
                {`${formatNumber(authorisation.used_orders)} of ${formatNumber(authorisation.max_orders)}`}
              </td>
              <td>
                <LocalTime value={authorisation.expires_at} />
              </td>
              <td>
                <StatusPill
                  value={authorisation.state === "expired" ? "expired" : authorisation.state}
                  tone={
                    authorisation.state === "active"
                      ? "live"
                      : authorisation.state === "revoked"
                        ? "danger"
                        : "neutral"
                  }
                  label={AUTHORISATION_STATE_LABELS[authorisation.state]}
                />
                {authorisation.state === "revoked" && authorisation.revoke_reason && (
                  <span className="data-table__secondary">{authorisation.revoke_reason}</span>
                )}
              </td>
              <td className="data-table__actions">
                {authorisation.state === "active" ? (
                  <RevokeControl authorisation={authorisation} revoke={revoke} />
                ) : (
                  <span className="quiet">None</span>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Card>
  );
}
