import type { Metadata } from "next";

import { AccessHoldPage } from "@/components/account/access-banner";
import {
  AccountOvernight,
  OVERNIGHT_TABS,
  type OvernightTab,
} from "@/components/account/account-overnight";
import { getCurrentAccessHold } from "@/lib/dal/access";
import { getOvernightBrief, getOvernightMornings } from "@/lib/dal/overnight";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Overnight" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function OvernightPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestedTab = first(params.tab);
  const tab: OvernightTab = OVERNIGHT_TABS.some((entry) => entry.key === requestedTab)
    ? (requestedTab as OvernightTab)
    : "today";

  // The morning brief is the product; a held account reads its state instead of a refusal.
  const hold = await getCurrentAccessHold();
  if (hold) return <AccessHoldPage title="Overnight" titleId="overnight-heading" hold={hold} />;

  const view = await getOvernightMornings();
  if (view.status === "access") {
    return (
      <AccessHoldPage
        title="Overnight"
        titleId="overnight-heading"
        hold={view.access}
        withMessage
      />
    );
  }
  const requested = first(params.date);
  const latest = view.status === "ready" ? view.mornings[0]?.date : undefined;
  // A date the URL names is read as asked, so an old link says it is old rather than
  // quietly showing today; with none, the newest morning opens.
  const date = requested && /^\d{4}-\d{2}-\d{2}$/u.test(requested) ? requested : latest;
  const brief = date && tab !== "mornings" ? await getOvernightBrief(date) : null;

  return (
    <AccountOvernight
      view={view}
      date={date}
      brief={brief}
      tab={tab}
      item={first(params.item)}
      doc={first(params.doc)}
      now={requestNow()}
    />
  );
}
