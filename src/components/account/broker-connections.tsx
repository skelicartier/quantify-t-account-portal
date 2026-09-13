"use client";

import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { LocalTime } from "@/components/ui/local-time";
import { StatusPill } from "@/components/ui/status-pill";
import {
  BROKERS,
  CREDENTIAL_LABELS,
  INITIAL_BROKER_ACTION_STATE,
  brokerById,
  connectionReadiness,
  type BrokerActionState,
  type BrokerConnection,
} from "@/lib/account/broker-input";

type BrokerAction = (state: BrokerActionState, formData: FormData) => Promise<BrokerActionState>;

type Props = {
  connections: readonly BrokerConnection[];
  now: number;
  connect: BrokerAction;
  test: BrokerAction;
  disconnect: BrokerAction;
};

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
 * The connect form.
 *
 * The credential inputs are `type="password"` with `autoComplete="off"`: a broker key is a
 * password in every sense that matters, and a browser that offers to remember it puts it
 * somewhere this design spent a lot of effort taking it out of.
 */
function ConnectForm({ connect }: { connect: BrokerAction }) {
  const [state, formAction, pending] = useActionState(connect, INITIAL_BROKER_ACTION_STATE);
  const id = useId();
  const [brokerId, setBrokerId] = useState<string>(BROKERS[0].id);
  const [live, setLive] = useState(false);
  const broker = brokerById(brokerId) ?? BROKERS[0];

  return (
    <form className="form" action={formAction}>
      <div className="form-grid">
        <Field id={`${id}-broker`} label="Broker" hint={broker.help}>
          <Select
            id={`${id}-broker`}
            name="broker"
            value={brokerId}
            onChange={(event) => setBrokerId(event.currentTarget.value)}
          >
            {BROKERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {option.region}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-name`} label="Name" hint="How this connection appears in the terminal.">
          <Input id={`${id}-name`} name="name" required maxLength={120} placeholder={broker.name} />
        </Field>

        {/* Said once, under the last of them, rather than repeated verbatim under each.
            Two and sometimes three identical twenty-word paragraphs stacked down the form
            made the one thing worth reading here look like boilerplate. */}
        {broker.fields.map((field, index) => (
          <Field
            key={field}
            id={`${id}-${field}`}
            label={CREDENTIAL_LABELS[field]}
            className="form-grid__span"
            hint={
              index === broker.fields.length - 1
                ? "Sent straight to the account service and encrypted there. Never stored in this browser, and never sent to the desktop app."
                : undefined
            }
          >
            <Input
              id={`${id}-${field}`}
              name={field}
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        ))}

        <Field
          id={`${id}-max-value`}
          label="Largest single order"
          hint="Optional. Left empty, the service applies its own low default."
        >
          <Input
            id={`${id}-max-value`}
            name="max_order_value"
            inputMode="decimal"
            placeholder="25000"
          />
        </Field>
        <Field id={`${id}-max-count`} label="Orders per day" hint="Optional.">
          <Input
            id={`${id}-max-count`}
            name="max_orders_per_day"
            inputMode="numeric"
            placeholder="50"
          />
        </Field>

        <div className="form-grid__span">
          <Checkbox
            id={`${id}-live`}
            name="paper"
            value="false"
            checked={live}
            onChange={(event) => setLive(event.currentTarget.checked)}
            tone={live ? "danger" : "default"}
            label="These are live-trading credentials"
            description="Leave this clear for paper keys. A live connection can place orders against real money."
          />
        </div>
      </div>

      {live && (
        <Callout tone="danger" role="status" compact>
          Orders placed with this connection use real money. Trading stays switched off until a
          connection test passes, and every order is checked against the limits above.
        </Callout>
      )}

      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "Connecting…" : "Connect broker"}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

function TestButton({ connection, test }: { connection: BrokerConnection; test: BrokerAction }) {
  const [state, formAction, pending] = useActionState(test, INITIAL_BROKER_ACTION_STATE);
  return (
    <div className="stack stack--tight">
      <form action={formAction}>
        <input type="hidden" name="connection_id" value={connection.id} />
        <Button type="submit" disabled={pending}>
          {pending ? "Testing…" : "Test"}
        </Button>
      </form>
      <Result state={state} />
    </div>
  );
}

function DisconnectForm({
  connection,
  disconnect,
}: {
  connection: BrokerConnection;
  disconnect: BrokerAction;
}) {
  const [state, formAction, pending] = useActionState(disconnect, INITIAL_BROKER_ACTION_STATE);
  const id = useId();
  const [confirmation, setConfirmation] = useState("");
  return (
    <div className="stack stack--tight">
      <form action={formAction} className="inline-actions">
        <input type="hidden" name="connection_id" value={connection.id} />
        <input type="hidden" name="connection_name" value={connection.name} />
        <label className="sr-only" htmlFor={`${id}-confirm`}>
          Type {connection.name} to remove this connection
        </label>
        <Input
          id={`${id}-confirm`}
          name="confirm_name"
          value={confirmation}
          onChange={(event) => setConfirmation(event.currentTarget.value)}
          placeholder={connection.name}
          autoComplete="off"
        />
        <Button
          variant="danger"
          type="submit"
          disabled={pending || confirmation.trim() !== connection.name}
        >
          {pending ? "Removing…" : "Remove"}
        </Button>
      </form>
      <Result state={state} />
    </div>
  );
}

const COLUMNS = [
  { key: "broker", label: "Broker" },
  { key: "credential", label: "Credential" },
  { key: "mode", label: "Mode" },
  { key: "state", label: "State" },
  { key: "actions", label: "Actions" },
] as const;

export function BrokerConnections({ connections, now, connect, test, disconnect }: Props) {
  return (
    <div className="board">
      <Card
        eyebrow="Connected brokers"
        title="Your brokerage connections"
        titleId="broker-list-heading"
        description="Credentials are held by the account service and never reach the desktop app. The terminal sends an order; the service places it."
      >
        <DataTable
          caption="Broker connections"
          columns={COLUMNS}
          minWidth={860}
          isEmpty={connections.length === 0}
          empty={
            <EmptyState
              title="No broker connected"
              description="Connect one below to place orders from the terminal."
            />
          }
        >
          {connections.map((connection) => {
            const readiness = connectionReadiness(connection, now);
            return (
              <tr key={connection.id}>
                <td>
                  <span className="data-table__primary">{connection.name}</span>
                  <span className="data-table__secondary">
                    {brokerById(connection.broker)?.name ?? connection.broker}
                    {connection.account_reference ? ` · ${connection.account_reference}` : ""}
                  </span>
                </td>
                <td>
                  {/* The credential is named, never shown. Same posture as the managed
                      provider keys: enough to recognise which key is stored, and nothing
                      that helps anyone use it. */}
                  <span className="data-table__primary mono">
                    {connection.credential_last_four
                      ? `····${connection.credential_last_four}`
                      : "Stored"}
                  </span>
                  <span className="data-table__secondary mono">
                    {connection.credential_fingerprint}
                  </span>
                </td>
                <td>
                  <StatusPill
                    value={connection.paper ? "enabled" : "disabled"}
                    tone={connection.paper ? "neutral" : "danger"}
                    label={connection.paper ? "Paper" : "Live money"}
                  />
                </td>
                <td>
                  <StatusPill
                    value={readiness.ready ? "enabled" : "disabled"}
                    tone={readiness.ready ? "live" : "attention"}
                    label={readiness.ready ? "Ready" : "Needs a test"}
                  />
                  {connection.last_test_at ? (
                    <span className="data-table__secondary">
                      <LocalTime value={connection.last_test_at} />
                    </span>
                  ) : (
                    <span className="data-table__secondary">Never tested</span>
                  )}
                  {connection.last_error && (
                    <span className="data-table__secondary">{connection.last_error}</span>
                  )}
                </td>
                <td className="data-table__actions">
                  <TestButton connection={connection} test={test} />
                  <DisconnectForm connection={connection} disconnect={disconnect} />
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Card>

      <Card
        eyebrow="Add a broker"
        title="Connect a brokerage account"
        titleId="broker-connect-heading"
        description="Only brokers the service has a working adapter for can be connected. Storing a key the product cannot use would be risk with no benefit."
      >
        <ConnectForm connect={connect} />
      </Card>
    </div>
  );
}
