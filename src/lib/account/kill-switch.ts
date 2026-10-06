import type { AccountApiKillSwitch, BrokerCancelOutcome } from "@/lib/admin/account-api";

/**
 * The kill switch's answer, reduced to what the person who pressed it needs to read.
 *
 * The service halts first and sweeps second: one transaction switches every connection off,
 * revokes every standing authorisation and marks the account halted, then each broker is
 * asked for every working order and each is asked to cancel. What comes back says, per
 * connection, which cancels were requested, which the broker was already cancelling, which it
 * refused (in its own words) and which could not reach it, and which orders were still on
 * their way to a broker. `complete` is true only when nothing is left working and nothing is
 * in flight; otherwise the person must look at the broker themselves, and saying so plainly
 * is the point of this view.
 *
 * Held in a server action's state, which React sends to the browser: nothing here is a
 * secret — order ids, symbols and the broker's own refusal text.
 */

export const CANCEL_OUTCOME_LABELS: Record<BrokerCancelOutcome, string> = {
  cancel_requested: "Cancel requested",
  already_cancelling: "Already cancelling",
  refused: "Refused",
  unreachable: "Unreachable",
};

export type KillSwitchConnectionResult = {
  connectionId: string;
  paper: boolean;
  workingOrders: number;
  complete: boolean;
  counts: Record<BrokerCancelOutcome, number>;
  /** Cancels the broker refused or that could not reach it, with what it said. */
  problems: Array<{ symbol: string; outcome: "refused" | "unreachable"; message: string }>;
  /** Orders still on their way to a broker; the order route cancels each on acceptance. */
  inFlight: Array<{ symbol: string; side: string; quantity: number; clientOrderId: string }>;
  /** Cancels sent to the broker whose record could not be written. */
  unrecorded: number;
};

export type KillSwitchResult = {
  complete: boolean;
  haltedAt: string | null;
  alreadyHalted: boolean;
  /** A second press while the first is still sweeping: the halt holds, no counts yet. */
  sweepInProgress: boolean;
  /** A retried press, answered with the first press's result. */
  replayed: boolean;
  connectionsSwitchedOff: number | null;
  authorisationsRevoked: number | null;
  cancelRequested: number | null;
  inFlight: number | null;
  /** False when the orders on their way to a broker could not be read at all. */
  inFlightKnown: boolean;
  connections: KillSwitchConnectionResult[];
};

export type KillSwitchActionState = {
  status: "idle" | "success" | "error";
  message: string;
  result: KillSwitchResult | null;
};

export const INITIAL_KILL_SWITCH_STATE: KillSwitchActionState = {
  status: "idle",
  message: "",
  result: null,
};

/**
 * A fresh key for one press of the kill switch, made in the browser when the confirm dialog
 * opens and sent as the press's Idempotency-Key: a retried submit of that press replays its
 * answer, and the next press gets a new key and sweeps again.
 */
export function newPressKey(): string {
  return crypto.randomUUID();
}

/**
 * Why trading is off, as a sentence: the service's own words for a halt it made ("account
 * deletion", "access declined") or what the person typed when they pressed the kill switch.
 * Null when no reason was given.
 */
export function haltReasonText(reason: string | null | undefined): string | null {
  const text = (reason ?? "").replace(/\s+/gu, " ").trim();
  if (!text) return null;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function emptyCounts(): Record<BrokerCancelOutcome, number> {
  return { cancel_requested: 0, already_cancelling: 0, refused: 0, unreachable: 0 };
}

export function summariseKillSwitch(response: AccountApiKillSwitch): KillSwitchResult {
  const connections = (response.connections ?? []).map((connection) => {
    const counts = emptyCounts();
    const problems: KillSwitchConnectionResult["problems"] = [];
    for (const cancel of connection.cancels) {
      counts[cancel.outcome] += 1;
      if (cancel.outcome === "refused" || cancel.outcome === "unreachable") {
        problems.push({
          symbol: cancel.symbol,
          outcome: cancel.outcome,
          message: cancel.broker_message,
        });
      }
    }
    return {
      connectionId: connection.connection_id,
      paper: connection.paper,
      workingOrders: connection.working_orders,
      complete: connection.complete,
      counts,
      problems,
      inFlight: connection.in_flight.map((order) => ({
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        clientOrderId: order.client_order_id,
      })),
      unrecorded: connection.record_failures.length,
    };
  });
  return {
    complete: response.complete,
    haltedAt: response.halted_at,
    alreadyHalted: response.already_halted === true,
    sweepInProgress: response.sweep_in_progress === true,
    replayed: response.replayed === true,
    connectionsSwitchedOff: response.connections_switched_off ?? null,
    authorisationsRevoked: response.authorisations_revoked ?? null,
    cancelRequested: response.cancelled ?? null,
    inFlight: response.in_flight ?? null,
    inFlightKnown: response.in_flight_known !== false,
    connections,
  };
}

/** One sentence for the result: halted, and whether anything may still be working. */
export function killSwitchHeadline(result: KillSwitchResult): string {
  if (result.sweepInProgress) {
    return "Trading is halted. The sweep from your first press is still cancelling orders; press again in a moment to see what it found.";
  }
  if (result.complete) {
    return result.connections.some((connection) => connection.workingOrders > 0)
      ? "Trading is halted and every working order was cancelled or is being cancelled."
      : "Trading is halted. No working orders were found at any broker.";
  }
  if (!result.inFlightKnown) {
    return "Trading is halted, but orders on their way to a broker could not be checked. Look at your broker for orders that may still be working, or press again.";
  }
  return "Trading is halted, but the sweep is not complete. Check your broker for orders that may still be working, or press again to retry every order still listed.";
}
