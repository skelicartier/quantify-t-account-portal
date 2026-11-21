"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { ACCESS_MESSAGES, accessRefusal } from "@/lib/account/access";
import {
  AccountApiRequestError,
  createAccountApiBrokerConnection,
  deleteAccountApiBrokerConnection,
  engageAccountApiKillSwitch,
  RESUME_REFUSED_BROKER_TEST,
  RESUME_REFUSED_KILL_SWITCH,
  requestAccountApiStepUp,
  resumeAccountApiTrading,
  revokeAccountApiBrokerAuthorisation,
  testAccountApiBrokerConnection,
} from "@/lib/admin/account-api";
import {
  brokerConnectionSchema,
  brokerById,
  CREDENTIAL_FIELDS,
  type BrokerActionState,
} from "@/lib/account/broker-input";
import {
  killSwitchHeadline,
  summariseKillSwitch,
  type KillSwitchActionState,
} from "@/lib/account/kill-switch";
import { rateLimitMessage, rateLimitWaitSeconds } from "@/lib/auth/rate-limit";
import { requireMutationAssurance } from "@/lib/dal/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

/**
 * Connecting, testing and removing a brokerage account.
 *
 * These are the highest-consequence writes a customer can make in this console: the value
 * they submit can place orders against real money. Three properties hold across all three:
 *
 *  1. **AAL2 first.** Gated through `requireMutationAssurance`, the same guard the password
 *     and TOTP changes use. A session someone walked away from should not be able to attach
 *     a live trading credential.
 *  2. **The secret is forwarded, never stored or logged here.** It goes from the request
 *     body into the Account API call in one step. Nothing in this file writes it to a
 *     variable that outlives the call, returns it, or puts it in an action state — the
 *     action state is the thing React serialises back to the browser.
 *  3. **No read path exists.** There is deliberately no action that fetches a credential,
 *     because there is no route that serves one.
 */

const failure = (message: string): BrokerActionState => ({ status: "error", message });

/** The gate, in one place so a fourth action cannot be written without it. */
async function authorize(): Promise<{ accessToken: string } | BrokerActionState> {
  await requireSameOriginServerAction();
  const { decision } = await requireMutationAssurance();
  if (decision !== "satisfied") {
    return failure("Confirm with your passkey before changing a broker connection.");
  }
  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken) return failure("Sign in again to manage broker connections.");
  return { accessToken };
}

function describe(error: unknown, fallback: string): string {
  const hold = accessRefusal(error);
  if (hold) return ACCESS_MESSAGES[hold];
  if (error instanceof AccountApiRequestError) {
    // The service's own refusals are the useful ones here — "no adapter for that broker",
    // "this connection has reached its orders for today" — and they are server-authored.
    if (error.status === 400 || error.status === 403 || error.status === 404) {
      return error.message;
    }
    if (error.status === 429) return "Too many attempts. Try again shortly.";
  }
  return fallback;
}

export async function connectBroker(
  _previous: BrokerActionState,
  formData: FormData,
): Promise<BrokerActionState> {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const parsed = brokerConnectionSchema.safeParse({
    broker: text("broker"),
    name: text("name"),
    paper: formData.get("paper") !== "false",
    api_key: text("api_key"),
    secret_key: text("secret_key"),
    passphrase: text("passphrase"),
    max_order_value: text("max_order_value"),
    max_orders_per_day: text("max_orders_per_day"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return failure(first?.message ?? "Check the connection details.");
  }

  const broker = brokerById(parsed.data.broker);
  if (!broker) return failure("Choose a broker.");

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    // Only the fields this broker actually authenticates with are sent. A credential the
    // adapter would never read is a secret stored for nothing.
    const credentials: Record<string, string> = {};
    for (const field of CREDENTIAL_FIELDS) {
      if ((broker.fields as readonly string[]).includes(field) && parsed.data[field]) {
        credentials[field] = parsed.data[field];
      }
    }

    await createAccountApiBrokerConnection(
      gate.accessToken,
      {
        broker: parsed.data.broker,
        name: parsed.data.name,
        paper: parsed.data.paper,
        ...credentials,
        ...(parsed.data.max_order_value === ""
          ? {}
          : { max_order_value: parsed.data.max_order_value }),
        ...(parsed.data.max_orders_per_day === ""
          ? {}
          : { max_orders_per_day: parsed.data.max_orders_per_day }),
      },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/account/brokers");
    return {
      status: "success",
      message: `${broker.name} connected. Test it before trading — trading stays off until a test passes.`,
    };
  } catch (error) {
    return failure(describe(error, "That broker connection could not be saved."));
  }
}

export async function testBrokerConnection(
  _previous: BrokerActionState,
  formData: FormData,
): Promise<BrokerActionState> {
  const connectionId = String(formData.get("connection_id") ?? "").trim();
  if (!connectionId) return failure("Choose a connection to test.");

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    const result = (await testAccountApiBrokerConnection(gate.accessToken, connectionId, {
      idempotencyKey: `portal-${randomUUID()}`,
    })) as { ok?: boolean; message?: string; trading_halted?: boolean };
    revalidatePath("/account/brokers");

    // A broker that rejects the credential is a successful test with a negative answer, not
    // an error: the request worked and told us something true.
    if (result?.ok === false) {
      return failure(result.message || "The broker rejected these credentials.");
    }
    // While the kill switch holds, a pass records the result and leaves trading off: turning
    // it back on is the person's decision, made with their password, not a routine test's.
    if (result?.trading_halted === true) {
      return {
        status: "success",
        message:
          "The test passed. Trading stays off because the kill switch is on — resume this connection to trade with it.",
      };
    }
    return { status: "success", message: "Connected. Trading is now enabled for this connection." };
  } catch (error) {
    return failure(describe(error, "That connection could not be tested."));
  }
}

export async function disconnectBroker(
  _previous: BrokerActionState,
  formData: FormData,
): Promise<BrokerActionState> {
  const connectionId = String(formData.get("connection_id") ?? "").trim();
  const confirmation = String(formData.get("confirm_name") ?? "").trim();
  const expected = String(formData.get("connection_name") ?? "").trim();
  if (!connectionId) return failure("Choose a connection to remove.");
  // Typed confirmation, because removing a connection also removes its order history and
  // there is no undo.
  if (!expected || confirmation !== expected) {
    return failure("Type the connection name to remove it.");
  }

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    await deleteAccountApiBrokerConnection(gate.accessToken, connectionId, {
      idempotencyKey: `portal-${randomUUID()}`,
    });
    revalidatePath("/account/brokers");
    return {
      status: "success",
      message: `${expected} removed. Revoke the key at your broker too.`,
    };
  } catch (error) {
    return failure(describe(error, "That connection could not be removed."));
  }
}

// ------------------------------------------------------------------ kill switch

/** A press's own key, as the browser generated it when the confirm dialog opened. */
const PRESS_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const KILL_SWITCH_UNREACHED =
  "The kill switch could not reach the account service. Press it again — a second press is safe — or revoke the key at your broker, which works regardless of this page.";

/**
 * Stop all trading on this account, now.
 *
 * Deliberately lighter than every other broker write: same origin and a session, and no
 * second-factor gate. Stopping trading is the one act in this console that must never be
 * harder than doing nothing, and the service holds the same line — the halt needs no step-up
 * and happens before the body is even read.
 *
 * Each press carries its own Idempotency-Key, made in the browser when the confirm dialog
 * opened. A double submit or a retry of that press replays the first answer instead of
 * sweeping twice; a fresh press makes a fresh key, so it re-asks every broker and retries
 * every order still working, which is what pressing again should do.
 */
export async function engageKillSwitch(
  _previous: KillSwitchActionState,
  formData: FormData,
): Promise<KillSwitchActionState> {
  const submitted = String(formData.get("press_key") ?? "")
    .trim()
    .toLowerCase();
  const pressKey = PRESS_KEY_PATTERN.test(submitted) ? submitted : randomUUID();
  const reason = String(formData.get("reason") ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 200);
  const failed = (message: string): KillSwitchActionState => ({
    status: "error",
    message,
    result: null,
  });

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) {
      return failed(
        "Sign in again to stop trading from here. To stop it right now, revoke the key at your broker.",
      );
    }
    const response = await engageAccountApiKillSwitch(accessToken, reason ? { reason } : {}, {
      idempotencyKey: `portal-kill-${pressKey}`,
    });
    revalidatePath("/account/brokers");
    const result = summariseKillSwitch(response);
    return { status: "success", message: killSwitchHeadline(result), result };
  } catch (error) {
    const hold = accessRefusal(error);
    if (hold) return failed(ACCESS_MESSAGES[hold]);
    const wait = rateLimitWaitSeconds(error);
    if (wait !== null) return failed(rateLimitMessage(wait));
    return failed(KILL_SWITCH_UNREACHED);
  }
}

// ------------------------------------------------------------------ resume

/**
 * Why a step-up and the act it unlocks were refused, for the dialog that asked.
 *
 * A wrong password is `unauthenticated` with `reason: invalid credentials` from `auth/step-up`
 * itself; the same code with no such reason is the session ending, and the two need opposite
 * answers. Wrong passwords count against the sign-in limit, so a 429 says to wait.
 */
function describeStepUp(error: unknown, fallback: string): string {
  const hold = accessRefusal(error);
  if (hold) return ACCESS_MESSAGES[hold];
  const wait = rateLimitWaitSeconds(error);
  if (wait !== null) return rateLimitMessage(wait);
  if (error instanceof AccountApiRequestError) {
    if (error.status === 401) {
      return error.details.reason === "invalid credentials"
        ? "That password is not correct. Nothing was changed."
        : "Your session has ended. Sign in again to turn trading back on.";
    }
    if (error.code === "step_up_required") {
      return "Enter your password again to turn trading back on.";
    }
    if (error.status === 404) return "That connection no longer exists. Reload the page.";
    if (error.status === 400 || error.status === 403 || error.status === 423) return error.message;
  }
  return fallback;
}

/**
 * Turn trading back on after the kill switch — one connection, or the account's halt.
 *
 * Asks for the account password every time, because the bearer token the kill switch stopped
 * must not be able to turn trading back on by itself. The password goes from this request
 * straight to `auth/step-up`; the single-use grant it returns goes straight to
 * `trading/resume`. Neither is stored, logged or put in the action state, which is what
 * React sends back to the browser.
 *
 * A connection resumes only after a fresh test at the broker, made by the service at that
 * moment; a failed test leaves it off, says why, and does not spend the grant.
 */
export async function resumeTrading(
  _previous: BrokerActionState,
  formData: FormData,
): Promise<BrokerActionState> {
  const scope = formData.get("scope") === "account" ? "account" : "connection";
  const connectionId = String(formData.get("connection_id") ?? "").trim();
  const connectionName = String(formData.get("connection_name") ?? "").trim() || "this connection";
  const password = formData.get("password");
  if (scope === "connection" && !connectionId) return failure("Choose a connection to resume.");
  if (typeof password !== "string" || password.length === 0) {
    return failure("Enter your password to turn trading back on.");
  }

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    const stepUp = await requestAccountApiStepUp(
      gate.accessToken,
      { password, purpose: "resume" },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    const result = await resumeAccountApiTrading(
      gate.accessToken,
      scope === "account"
        ? { scope: "account", step_up: stepUp.step_up.grant }
        : { connection_id: connectionId, step_up: stepUp.step_up.grant },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/account/brokers");

    if (!result.resumed) {
      // Worded by the service's refusal code, never inferred from which fields came back.
      if (result.reason === RESUME_REFUSED_KILL_SWITCH) {
        // The kill switch was pressed while this resume ran: the person's latest word. The
        // grant was spent, so turning trading back on asks for the password again.
        return failure(
          "The kill switch was pressed during the resume, so trading stays off. Enter your password again when you are ready to resume.",
        );
      }
      if (result.reason === RESUME_REFUSED_BROKER_TEST) {
        // The service tested the connection at the broker and it failed; trading stays off.
        return failure(
          `${result.message || "The connection test did not pass."} Trading stays off for ${connectionName}.`,
        );
      }
      return failure(result.message || "Trading could not be turned back on. Please try again.");
    }
    const still = result.connections_still_halted ?? 0;
    const stillPhrase = `${still} ${still === 1 ? "connection" : "connections"}`;
    if (scope === "account") {
      return {
        status: "success",
        message:
          still > 0
            ? `The account's halt is lifted. ${stillPhrase} the kill switch switched off ${still === 1 ? "stays" : "stay"} off until each is resumed.`
            : "The account's halt is lifted.",
      };
    }
    return {
      status: "success",
      message: result.trading_halted
        ? `Trading is back on for ${connectionName}. The account stays halted until the other ${stillPhrase} ${still === 1 ? "is" : "are"} resumed.`
        : `Trading is back on for ${connectionName}.`,
    };
  } catch (error) {
    return failure(describeStepUp(error, "Trading could not be turned back on. Please try again."));
  }
}

// ------------------------------------------------------------------ standing authorisations

/**
 * Revoke one standing authorisation. Automated orders under it stop at once.
 *
 * Like the kill switch, this only ever narrows what can trade, so it asks for no second
 * factor: a gate on taking permission away protects nobody. Revoking one already revoked
 * changes nothing on the service.
 */
export async function revokeStandingAuthorisation(
  _previous: BrokerActionState,
  formData: FormData,
): Promise<BrokerActionState> {
  const authorisationId = String(formData.get("authorisation_id") ?? "").trim();
  const strategy = String(formData.get("strategy") ?? "").trim() || "this strategy";
  if (!/^[A-Za-z0-9-]{1,64}$/u.test(authorisationId)) {
    return failure("Choose an authorisation to revoke.");
  }

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return failure("Sign in again to revoke an authorisation.");
    await revokeAccountApiBrokerAuthorisation(
      accessToken,
      authorisationId,
      {},
      {
        idempotencyKey: `portal-${randomUUID()}`,
      },
    );
    revalidatePath("/account/brokers");
    return {
      status: "success",
      message: `Revoked. Automated orders for ${strategy} stop at once; arming a new authorisation takes your password in the desktop app.`,
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 404) {
      return failure("That authorisation no longer exists. Reload the page.");
    }
    return failure(describe(error, "That authorisation could not be revoked. Please try again."));
  }
}
