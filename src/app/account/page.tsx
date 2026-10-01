import type { Metadata } from "next";

import { AccountOverview } from "@/components/account/account-overview";
import { getAdminEntry } from "@/lib/admin/access";
import {
  getCurrentActivityEvents,
  getCurrentSessions,
  requireCurrentAccount,
} from "@/lib/dal/account";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = {
  title: "Account overview",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const account = await requireCurrentAccount();
  // The briefing's lists are extras: a failed read shows as such, never as a broken page.
  const [entry, sessions, events] = await Promise.allSettled([
    getAdminEntry(),
    getCurrentSessions(),
    getCurrentActivityEvents(),
  ]);
  return (
    <AccountOverview
      account={account}
      sessions={sessions.status === "fulfilled" ? sessions.value : null}
      events={events.status === "fulfilled" ? events.value : null}
      role={entry.status === "fulfilled" ? (entry.value?.me.role.effective ?? null) : null}
      now={requestNow()}
    />
  );
}
