import type { Metadata } from "next";

import {
  connectBroker,
  disconnectBroker,
  testBrokerConnection,
} from "@/app/account/brokers/actions";
import { BrokerConnections } from "@/components/account/broker-connections";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { getBrokerConnections } from "@/lib/dal/brokers";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Brokers" };
export const dynamic = "force-dynamic";

export default async function BrokersPage() {
  const view = await getBrokerConnections();
  const now = requestNow();

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Brokers"
        titleId="brokers-heading"
        description="Connect a brokerage account here. Your credentials stay with the account service — the desktop app never receives them."
      />
      <div className="page-content">
        {view.status === "unconfigured" && (
          <Callout tone="danger" role="alert" title="Broker connections are not configured">
            This deployment has no broker encryption key, so it will refuse to store a credential.
            That refusal is deliberate: accepting a brokerage key it cannot encrypt would be worse
            than declining it.
          </Callout>
        )}
        {view.status === "unavailable" && (
          <Callout tone="danger" role="alert" title="The account service could not be reached">
            Your connections are unchanged — this is a read that failed. To stop trading right now,
            revoke the key at your broker; that works regardless of this page.
          </Callout>
        )}
        {view.status === "ready" && (
          <BrokerConnections
            connections={view.data.connections}
            now={now}
            connect={connectBroker}
            test={testBrokerConnection}
            disconnect={disconnectBroker}
          />
        )}
      </div>
    </>
  );
}
