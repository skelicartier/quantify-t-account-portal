import type { Metadata } from "next";

import { AccountSessions } from "@/components/account/account-sessions";
import { requireCurrentSessions } from "@/lib/dal/account";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Sessions" };
export const dynamic = "force-dynamic";

export default async function AccountSessionsPage() {
  const sessions = await requireCurrentSessions();
  return <AccountSessions sessions={sessions} now={requestNow()} />;
}
