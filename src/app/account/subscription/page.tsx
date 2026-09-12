import type { Metadata } from "next";

import { AccountSubscription } from "@/components/account/account-subscription";
import { requireCurrentSubscription } from "@/lib/dal/subscription";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Subscription" };
export const dynamic = "force-dynamic";

export default async function AccountSubscriptionPage() {
  const view = await requireCurrentSubscription();

  return <AccountSubscription view={view} now={requestNow()} />;
}
