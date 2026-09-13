import "server-only";

import { cache } from "react";

import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  fetchAccountApiBrokerConnections,
  type AccountApiBrokerConnections,
} from "@/lib/admin/account-api";
import { requireSatisfiedAssurance } from "@/lib/dal/assurance-guard";
import { createServerAzureClient } from "@/lib/supabase/server";

/**
 * Reading this account's broker connections.
 *
 * Degrades rather than throws. The brokers page has real content even when the Account API
 * is unreachable — what a connection is, that credentials live on the server, how to revoke
 * one at the broker — and a page that renders an error instead of that is less useful during
 * exactly the incident when someone is trying to disconnect a broker.
 *
 * `unconfigured` is called out separately from `unavailable` because they need opposite
 * responses: one is an operator setting a key, the other is waiting.
 */
export type BrokerConnectionsView =
  | { status: "ready"; data: AccountApiBrokerConnections }
  | { status: "unconfigured" }
  | { status: "unavailable" };

export const getBrokerConnections = cache(async (): Promise<BrokerConnectionsView> => {
  // Read is AAL2-gated too, not only the writes. The fingerprints and the order history are
  // not secrets, but they say which brokerage accounts a person holds — and that is exactly
  // what someone reading a walked-away-from session would want.
  await requireSatisfiedAssurance();

  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken) return { status: "unavailable" };

  try {
    const data = await fetchAccountApiBrokerConnections(accessToken);
    return data.encryption_configured ? { status: "ready", data } : { status: "unconfigured" };
  } catch (error) {
    if (error instanceof AccountApiRequestError || error instanceof AccountApiUnavailableError) {
      return { status: "unavailable" };
    }
    throw error;
  }
});
