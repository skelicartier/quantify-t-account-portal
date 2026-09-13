"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  createAccountApiBrokerConnection,
  deleteAccountApiBrokerConnection,
  testAccountApiBrokerConnection,
} from "@/lib/admin/account-api";
import {
  brokerConnectionSchema,
  brokerById,
  CREDENTIAL_FIELDS,
  type BrokerActionState,
} from "@/lib/account/broker-input";
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
    return failure("Verify your authenticator code before changing a broker connection.");
  }
  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken) return failure("Sign in again to manage broker connections.");
  return { accessToken };
}

function describe(error: unknown, fallback: string): string {
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
    })) as { ok?: boolean; message?: string };
    revalidatePath("/account/brokers");

    // A broker that rejects the credential is a successful test with a negative answer, not
    // an error: the request worked and told us something true.
    if (result?.ok === false) {
      return failure(result.message || "The broker rejected these credentials.");
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
