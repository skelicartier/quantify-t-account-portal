"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { addPasskey, removePasskey } from "@/lib/passkeys/ceremony";
import { PASSKEY_NAME_MAX, type PasskeyListItem, type PasskeyState } from "@/lib/passkeys/state";

type PasskeyPanelProps = {
  passkeys: readonly PasskeyListItem[];
  /** Null when the service could not say: nothing here is offered on a guess. */
  state: PasskeyState | null;
  maxPasskeys: number;
  now: number;
};

const COLUMNS: readonly DataTableColumn[] = [
  { key: "name", label: "Passkey" },
  { key: "added", label: "Added" },
  { key: "used", label: "Last used" },
  { key: "remove", label: "", align: "end" },
];

type Notice = { tone: "success" | "danger"; text: string };

function summary(state: PasskeyState): string {
  if (!state.enrolled) {
    if (state.staff && state.mode === "required") {
      return "Administration stays closed to this account until it has a passkey.";
    }
    return state.staff
      ? "Until you add a passkey, your password alone opens Administration."
      : "Add a passkey to ask for your fingerprint whenever this console is opened.";
  }
  return state.staff
    ? "The console and Administration ask for your passkey in every new session, and again before anything is changed."
    : "The console asks for your passkey in every new session.";
}

/**
 * The account's passkeys: what there is, adding one, removing one.
 *
 * Adding always takes the current password. On an account that already has a passkey
 * the device also asks for that one first, and removing asks for it too. Those rules are
 * the service's; this panel only walks a person through the prompts in order.
 */
export function PasskeyPanel({ passkeys, state, maxPasskeys, now }: PasskeyPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"add" | string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  if (state === null) {
    return (
      <Callout tone="attention" role="status">
        Passkey status could not be read just now. Reload the page before changing anything here.
      </Callout>
    );
  }

  const full = passkeys.length >= maxPasskeys;

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("currentPassword") ?? "");
    const name = String(data.get("passkeyName") ?? "");
    setNotice(null);
    setPasswordError(null);
    if (!password) {
      setPasswordError("Enter your current password.");
      return;
    }
    setBusy("add");
    const result = await addPasskey({ password, name });
    setBusy(null);
    if (result.status === "ok") {
      form.reset();
      setNotice({ tone: "success", text: "Passkey added. This session is confirmed with it." });
      router.refresh();
      return;
    }
    if (result.reason === "password") setPasswordError(result.message);
    else setNotice({ tone: "danger", text: result.message });
  }

  async function remove(passkey: PasskeyListItem) {
    if (busy) return;
    setNotice(null);
    setBusy(passkey.id);
    const result = await removePasskey(passkey.id);
    setBusy(null);
    setConfirming(null);
    if (result.status === "ok") {
      setNotice({ tone: "success", text: `Removed ${passkey.name}.` });
      router.refresh();
      return;
    }
    setNotice({ tone: "danger", text: result.message });
  }

  return (
    <div className="stack">
      <p className="passkey-status">
        <StatusPill value={state.enrolled ? "on" : "off"} label={state.enrolled ? "On" : "Off"} />
        <span>{summary(state)}</span>
      </p>

      <DataTable
        caption="Passkeys on this account"
        columns={COLUMNS}
        isEmpty={passkeys.length === 0}
        scroll={false}
      >
        {passkeys.map((passkey) => (
          <tr key={passkey.id}>
            <td>
              <span className="data-table__primary">{passkey.name}</span>
            </td>
            <td>
              <Timestamp value={passkey.createdAt} now={now} />
            </td>
            <td>
              <Timestamp value={passkey.lastUsedAt} now={now} fallback="Not yet" />
            </td>
            <td className="data-table__num">
              {confirming === passkey.id ? (
                <span className="passkey-row-actions">
                  <Button
                    size="small"
                    variant="danger"
                    busy={busy === passkey.id}
                    disabled={busy !== null}
                    onClick={() => remove(passkey)}
                  >
                    Remove it
                  </Button>
                  <Button size="small" disabled={busy !== null} onClick={() => setConfirming(null)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button
                  size="small"
                  disabled={busy !== null}
                  aria-label={`Remove ${passkey.name}`}
                  onClick={() => {
                    setNotice(null);
                    setConfirming(passkey.id);
                  }}
                >
                  Remove
                </Button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>

      {notice && (
        <Callout
          tone={notice.tone}
          role={notice.tone === "success" ? "status" : "alert"}
          compact
        >
          {notice.text}
        </Callout>
      )}

      {full ? (
        <Callout compact>
          This account holds {maxPasskeys} passkeys, the most it can. Remove one to add another.
        </Callout>
      ) : (
        <form className="form" onSubmit={add} noValidate>
          <Field
            id="security-passkey-name"
            label="Name for this device"
            hint="Something you will recognise later, such as MacBook Touch ID."
          >
            <Input
              id="security-passkey-name"
              name="passkeyName"
              type="text"
              autoComplete="off"
              maxLength={PASSKEY_NAME_MAX}
              disabled={busy !== null}
            />
          </Field>
          <Field
            id="security-passkey-password"
            label="Current password"
            error={passwordError ?? undefined}
          >
            <Input
              id="security-passkey-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              disabled={busy !== null}
              invalid={Boolean(passwordError)}
            />
          </Field>
          <div className="form-actions">
            <Button variant="primary" type="submit" busy={busy === "add"} disabled={busy !== null}>
              {busy === "add" ? "Waiting for your device" : "Add a passkey"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
