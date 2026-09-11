import type { Metadata } from "next";

import { AccountActivity } from "@/components/account/account-activity";
import { requireCurrentActivityEvents } from "@/lib/dal/account";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function AccountActivityPage() {
  const events = await requireCurrentActivityEvents();
  return <AccountActivity events={events} now={requestNow()} />;
}
