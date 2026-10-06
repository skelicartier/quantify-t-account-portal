import { z } from "zod";

/**
 * What a brokerage connection is allowed to contain, checked before it leaves the browser.
 *
 * The Account API checks all of this again — it has to, since nothing stops a token holder
 * posting to it directly — but a broker credential is the one secret in this product that
 * can move a customer's money, so the console refuses a malformed one rather than forwarding
 * it and rendering whatever comes back.
 *
 * Two things are deliberately NOT in this file, and both are load-bearing:
 *
 *   * There is no `base_url` field. The desktop let a stored connection carry its own, and
 *     the adapter used it. On a server that holds the real credential that is an
 *     exfiltration primitive: point it at a host you control and the service dials it with
 *     the customer's live key in the Authorization header. The host is the server's.
 *
 *   * There is no field for reading a secret back. A stored credential is identified by its
 *     fingerprint and last four characters and never by its value, the same way the managed
 *     provider keys work in the admin console.
 */

/**
 * The brokers that can actually be connected.
 *
 * Deliberately two. The desktop offered thirty-one and implemented adapters for these two;
 * the other twenty-nine accepted and stored a live trading credential that the product could
 * never spend — liability with no benefit. The Account API refuses them, and this list
 * mirrors that refusal so the form never offers a choice the service will reject.
 */
export const BROKERS = [
  {
    id: "alpaca",
    name: "Alpaca",
    region: "US",
    /** Alpaca signs every request with a key/secret pair. */
    fields: ["api_key", "secret_key"] as const,
    help: "Generate a key pair in the Alpaca dashboard under API Keys. Paper and live keys are different.",
  },
  {
    id: "upstox",
    name: "Upstox",
    region: "India",
    /** Upstox authenticates with an OAuth bearer token, held in the passphrase field. */
    fields: ["passphrase"] as const,
    help: "Paste the access token from your Upstox app's OAuth exchange. It expires daily and must be reconnected.",
  },
] as const;

export type Broker = (typeof BROKERS)[number];
export type BrokerId = Broker["id"];

export const BROKER_IDS = BROKERS.map((broker) => broker.id) as [BrokerId, ...BrokerId[]];

export function brokerById(id: string): Broker | undefined {
  return BROKERS.find((broker) => broker.id === id);
}

/** The three fields a credential can occupy. Closed, so indexing the label map is total. */
export const CREDENTIAL_FIELDS = ["api_key", "secret_key", "passphrase"] as const;
export type CredentialField = (typeof CREDENTIAL_FIELDS)[number];

/** Human labels, so the form does not print snake_case at a customer. */
export const CREDENTIAL_LABELS: Record<CredentialField, string> = {
  api_key: "API key",
  secret_key: "API secret",
  passphrase: "Access token",
};

/**
 * A credential value.
 *
 * Bounded but otherwise unvalidated on purpose: brokers change their key formats without
 * warning, and a console that refuses a valid new-format key because a regex predates it is
 * worse than one that lets the broker say no. The connection test is the real check.
 */
const credential = z
  .string()
  .trim()
  .min(8, "That looks too short to be a credential.")
  .max(4096)
  .refine((value) => !/\s/u.test(value), "A credential should not contain spaces.");

const optionalCredential = z.union([z.literal(""), credential]);

const positiveMoney = z.union([z.literal(""), z.coerce.number().positive().max(100_000_000)]);

const positiveCount = z.union([z.literal(""), z.coerce.number().int().positive().max(10_000)]);

export const brokerConnectionSchema = z
  .object({
    broker: z.enum(BROKER_IDS),
    name: z.string().trim().min(1, "Give this connection a name.").max(120),
    /**
     * Paper by default everywhere in this flow. A forgotten field should not be the
     * difference between a simulated and a real order.
     */
    paper: z.boolean(),
    api_key: optionalCredential,
    secret_key: optionalCredential,
    passphrase: optionalCredential,
    /**
     * Ceilings. Empty means "use the service's default", which is deliberately low — the
     * number that protects someone from a runaway client is the one nobody set.
     */
    max_order_value: positiveMoney,
    max_orders_per_day: positiveCount,
  })
  .strict()
  .superRefine((value, ctx) => {
    const broker = brokerById(value.broker);
    if (!broker) return;
    for (const field of broker.fields) {
      if (!value[field]) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `${broker.name} needs a ${CREDENTIAL_LABELS[field].toLowerCase()}.`,
        });
      }
    }
    // A field the chosen broker does not use must be empty rather than ignored: silently
    // storing a credential the adapter will never read is storing a secret for nothing.
    for (const field of CREDENTIAL_FIELDS) {
      if (!(broker.fields as readonly string[]).includes(field) && value[field]) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `${broker.name} does not use this field.`,
        });
      }
    }
  });

export type BrokerConnectionInput = z.infer<typeof brokerConnectionSchema>;

/** One connection as the Account API returns it — never a secret, only its fingerprint. */
export type BrokerConnection = {
  id: string;
  broker: string;
  name: string;
  account_reference: string;
  paper: boolean;
  is_active: boolean;
  credential_fingerprint: string;
  credential_last_four: string;
  last_test_at: string | null;
  last_test_success: boolean;
  /** The connection's own switch. Off means the service refuses orders on it. */
  trading_enabled: boolean;
  /**
   * Switched off by the account's kill switch and not yet resumed. A routine test does not
   * turn such a connection back on; only a resume, with the password, does.
   */
  trading_halted: boolean;
  /** When the halt that switched this connection off happened, and why. */
  halted_at: string | null;
  halt_reason: string | null;
  last_error: string;
  created_at: string | null;
  updated_at: string | null;
};

/** One standing authorisation as the Account API lists it (`_authorisation_view`). */
export type StandingAuthorisation = {
  id: string;
  connection_id: string;
  account: string;
  broker: string;
  strategy: string;
  max_order_value: number | null;
  max_orders: number;
  used_orders: number;
  remaining: number;
  expires_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
  revoke_reason: string;
  state: "active" | "expired" | "used" | "revoked";
};

export type StandingAuthorisationsView =
  { status: "ready"; items: readonly StandingAuthorisation[] } | { status: "unavailable" };

export type BrokerActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_BROKER_ACTION_STATE: BrokerActionState = { status: "idle", message: "" };

/**
 * Whether this connection may place an order.
 *
 * Mirrors the Account API's own gate rather than inventing a second one: enabled, tested,
 * and tested recently. The console shows the same answer the service will give, so a
 * customer is not told they are ready and then refused.
 */
export const TEST_FRESHNESS_DAYS = 30;

export function connectionReadiness(
  connection: BrokerConnection,
  now: number,
): { ready: boolean; reason: string } {
  // The kill switch first: the service refuses a halted connection before it reads anything
  // else about it, and the only way back is a resume with the password, not a test.
  if (connection.trading_halted) {
    return {
      ready: false,
      reason: "Switched off by the kill switch. Resume this connection to trade with it again.",
    };
  }
  // Checked next, because it is the one the customer can act on immediately and the one the
  // service checks before anything else. Saying "Ready" for a connection whose switch is off
  // promises something the order route will refuse.
  if (!connection.trading_enabled) {
    return { ready: false, reason: "Trading is switched off for this connection." };
  }
  if (!connection.last_test_success) {
    return { ready: false, reason: "Test this connection before trading with it." };
  }
  if (!connection.last_test_at) {
    return { ready: false, reason: "Test this connection before trading with it." };
  }
  const age = now - new Date(connection.last_test_at).getTime();
  if (Number.isNaN(age)) {
    return { ready: false, reason: "Test this connection before trading with it." };
  }
  if (age > TEST_FRESHNESS_DAYS * 24 * 60 * 60 * 1000) {
    return {
      ready: false,
      reason: `Re-test this connection — the last check is over ${TEST_FRESHNESS_DAYS} days old.`,
    };
  }
  return { ready: true, reason: "" };
}
