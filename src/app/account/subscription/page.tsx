import type { Metadata } from "next";

import { AccessHoldPage } from "@/components/account/access-banner";
import { AccountSubscription } from "@/components/account/account-subscription";
import { AccountAccessHeldError, getCurrentAccessHold } from "@/lib/dal/access";
import { requireCurrentSubscription, type AccountSubscriptionView } from "@/lib/dal/subscription";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Subscription" };
export const dynamic = "force-dynamic";

const TITLE = "Subscription";
const TITLE_ID = "account-subscription-heading";

export default async function AccountSubscriptionPage() {
  // A plan is part of the product. A held account has none to read yet, and says so.
  const hold = await getCurrentAccessHold();
  if (hold) return <AccessHoldPage title={TITLE} titleId={TITLE_ID} hold={hold} />;

  let view: AccountSubscriptionView;
  try {
    view = await requireCurrentSubscription();
  } catch (error) {
    if (error instanceof AccountAccessHeldError) {
      return <AccessHoldPage title={TITLE} titleId={TITLE_ID} hold={error.hold} withMessage />;
    }
    throw error;
  }

  return <AccountSubscription view={view} now={requestNow()} />;
}
