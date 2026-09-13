import type { Metadata } from "next";

import {
  closePortfolio,
  createPortfolio,
  makePortfolioDefault,
  renamePortfolio,
} from "@/app/account/portfolios/actions";
import { PortfolioAccounts } from "@/components/account/portfolio-accounts";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { getPortfolios } from "@/lib/dal/portfolios";

export const metadata: Metadata = { title: "Portfolios" };
export const dynamic = "force-dynamic";

export default async function PortfoliosPage() {
  const view = await getPortfolios();

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Portfolios"
        titleId="portfolios-heading"
        description="The books your trades are recorded against. They follow your account, so the terminal finds them on any machine you sign in to."
      />
      <div className="page-content">
        {view.status === "unavailable" && (
          <Callout tone="danger" role="alert" title="The account service could not be reached">
            Your portfolios are unchanged — this is a read that failed. Reload in a moment.
          </Callout>
        )}
        {view.status === "ready" && (
          <PortfolioAccounts
            portfolios={view.data.portfolios}
            maxPortfolios={view.data.max_portfolios}
            create={createPortfolio}
            rename={renamePortfolio}
            makeDefault={makePortfolioDefault}
            close={closePortfolio}
          />
        )}
      </div>
    </>
  );
}
