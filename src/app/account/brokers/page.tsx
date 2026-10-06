import type { Metadata } from "next";

import {
  connectBroker,
  disconnectBroker,
  engageKillSwitch,
  resumeTrading,
  revokeStandingAuthorisation,
  testBrokerConnection,
} from "@/app/account/brokers/actions";
import { OpenAccountPages } from "@/components/account/access-banner";
import { BrokerConnections } from "@/components/account/broker-connections";
import { KillSwitchPanel } from "@/components/account/broker-trading-controls";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { ACCESS_MESSAGES } from "@/lib/account/access";
import { getCurrentAccessHold } from "@/lib/dal/access";
import { getBrokerConnections } from "@/lib/dal/brokers";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Brokers" };
export const dynamic = "force-dynamic";

export default async function BrokersPage() {
  // Read even for a held account: the API decides what a pending or declined account may
  // see, and the safety acts — the kill switch above all — stay available whatever its state.
  const [view, bannerHold] = await Promise.all([getBrokerConnections(), getCurrentAccessHold()]);
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
            press the kill switch below, or revoke the key at your broker; that works regardless of
            this page.
          </Callout>
        )}
        {view.status === "access" && (
          <Callout
            tone={view.access === "declined" ? "danger" : "attention"}
            role="status"
            title={
              view.access === "pending"
                ? "Connecting a broker opens once your application is approved"
                : "Connecting a broker is not available on this account"
            }
          >
            {/* The layout's banner says the sentence when it knows the status; say it here
                when only this page's refused read did. */}
            {!bannerHold && (
              <>
                <p>{ACCESS_MESSAGES[view.access]}</p>
                <OpenAccountPages />
              </>
            )}
          </Callout>
        )}
        {/* The kill switch is a write that needs none of the reads above, so it is offered
            whenever the list could not be shown — an outage or a held account alike. */}
        {(view.status === "unavailable" || view.status === "access") && (
          <KillSwitchPanel
            tradingHalted={null}
            haltedAt={null}
            names={{}}
            killSwitch={engageKillSwitch}
            resume={resumeTrading}
            held={view.status === "access"}
          />
        )}
        {view.status === "ready" && (
          <BrokerConnections
            connections={view.data.connections}
            hold={bannerHold}
            tradingHalted={view.data.trading_halted}
            haltedAt={view.data.halted_at}
            haltReason={view.data.halt_reason}
            authorisations={view.authorisations}
            now={now}
            connect={connectBroker}
            test={testBrokerConnection}
            disconnect={disconnectBroker}
            killSwitch={engageKillSwitch}
            resume={resumeTrading}
            revoke={revokeStandingAuthorisation}
          />
        )}
      </div>
    </>
  );
}
