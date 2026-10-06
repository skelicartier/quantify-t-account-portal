import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import {
  ACCESS_MESSAGES,
  ACCESS_TITLES,
  OPEN_ACCOUNT_PAGES,
  type AccessHold,
} from "@/lib/account/access";

/** The pages a held account can still use, as links, in one sentence. */
export function OpenAccountPages() {
  return (
    <p className="access-open">
      Open to you now:{" "}
      {OPEN_ACCOUNT_PAGES.map((page, index) => (
        <span key={page.href}>
          {index > 0 && (index === OPEN_ACCOUNT_PAGES.length - 1 ? " and " : ", ")}
          <Link href={page.href}>{page.label}</Link>
        </span>
      ))}
      .
    </p>
  );
}

/**
 * The account's state, above every console page while it is held.
 *
 * A pending account reads the review sentence; a declined one reads the declined sentence,
 * which also tells it that its data can still be exported or deleted. Tinted and fully
 * bordered in the hold's tone, never a coloured strip down one side.
 */
export function AccessBanner({ hold }: { hold: AccessHold }) {
  return (
    <Callout
      tone={hold === "declined" ? "danger" : "attention"}
      role="status"
      title={ACCESS_TITLES[hold]}
      className="callout--banner"
    >
      <p>{ACCESS_MESSAGES[hold]}</p>
      <OpenAccountPages />
    </Callout>
  );
}

type AccessHoldPageProps = {
  title: string;
  titleId: string;
  hold: AccessHold;
  /**
   * Say the access sentence here too. Set when the hold was learnt from the page's own read
   * being refused, which means the layout's banner is not showing it.
   */
  withMessage?: boolean;
};

/**
 * What a page behind the access gate shows a held account, in place of an error.
 *
 * Overnight, Subscription and Portfolios read routes the API refuses until the application
 * is approved (Brokers keeps its safety acts open and says so on its own page). Rendering their usual "could not be reached" would tell an
 * applicant the product is broken; this says what is actually true.
 */
export function AccessHoldPage({ title, titleId, hold, withMessage = false }: AccessHoldPageProps) {
  return (
    <>
      <PageHeader title={title} titleId={titleId} />
      <div className="page-content">
        <Callout
          tone={hold === "declined" ? "danger" : "attention"}
          role="status"
          title={
            hold === "pending"
              ? "Opens once your application is approved"
              : "Not available on this account"
          }
        >
          {withMessage && (
            <>
              <p>{ACCESS_MESSAGES[hold]}</p>
              <OpenAccountPages />
            </>
          )}
        </Callout>
      </div>
    </>
  );
}
