import type { Metadata } from "next";

import { AccountOverview } from "@/components/account/account-overview";
import { getAdminEntry } from "@/lib/admin/access";
import { requireCurrentAccount } from "@/lib/dal/account";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = {
  title: "Account overview",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const account = await requireCurrentAccount();
  const entry = await getAdminEntry();
  return (
    <AccountOverview
      account={account}
      canEnterAdmin={entry?.canEnterAdmin ?? false}
      now={requestNow()}
    />
  );
}
