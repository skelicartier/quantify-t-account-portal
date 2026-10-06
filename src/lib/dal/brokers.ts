import "server-only";

import { cache } from "react";

import { accessRefusal, type AccessHold } from "@/lib/account/access";
import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  fetchAccountApiBrokerAuthorisations,
  fetchAccountApiBrokerConnections,
  type AccountApiBrokerConnections,
  type BrokerAuthorisation,
} from "@/lib/admin/account-api";
import { requireSatisfiedAssurance } from "@/lib/dal/assurance-guard";
import { createServerAzureClient } from "@/lib/supabase/server";

/**
 * Reading this account's broker connections.
 *
 * Degrades rather than throws. The brokers page has real content even when the Account API
 * is unreachable — what a connection is, that credentials live on the server, how to revoke
 * one at the broker, and the kill switch, which is a write that does not depend on this read
 * — and a page that renders an error instead of that is less useful during exactly the
 * incident when someone is trying to stop trading.
 *
 * `unconfigured` is called out separately from `unavailable` because they need opposite
 * responses: one is an operator setting a key, the other is waiting. `access` is a held
 * account (pending or declined), which the page answers with the access message.
 *
 * The standing authorisations are read beside the connections and degrade on their own: a
 * list that cannot be read is said so under the connections, never by hiding them.
 */
export type BrokerAuthorisationsView =
  { status: "ready"; items: BrokerAuthorisation[] } | { status: "unavailable" };

export type BrokerConnectionsView =
  | { status: "ready"; data: AccountApiBrokerConnections; authorisations: BrokerAuthorisationsView }
  | { status: "unconfigured" }
  | { status: "unavailable" }
  | { status: "access"; access: AccessHold };

async function readAuthorisations(accessToken: string): Promise<BrokerAuthorisationsView> {
  try {
    const data = await fetchAccountApiBrokerAuthorisations(accessToken);
    return { status: "ready", items: data.authorisations };
  } catch (error) {
    if (error instanceof AccountApiRequestError || error instanceof AccountApiUnavailableError) {
      return { status: "unavailable" };
    }
    throw error;
  }
}

export const getBrokerConnections = cache(async (): Promise<BrokerConnectionsView> => {
  // Read is AAL2-gated too, not only the writes. The fingerprints and the order history are
  // not secrets, but they say which brokerage accounts a person holds — and that is exactly
  // what someone reading a walked-away-from session would want.
  await requireSatisfiedAssurance();

  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken) return { status: "unavailable" };

  try {
    const [data, authorisations] = await Promise.all([
      fetchAccountApiBrokerConnections(accessToken),
      readAuthorisations(accessToken),
    ]);
    return data.encryption_configured
      ? { status: "ready", data, authorisations }
      : { status: "unconfigured" };
  } catch (error) {
    const hold = accessRefusal(error);
    if (hold) return { status: "access", access: hold };
    if (error instanceof AccountApiRequestError || error instanceof AccountApiUnavailableError) {
      return { status: "unavailable" };
    }
    throw error;
  }
});
