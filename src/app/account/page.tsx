import type { Metadata } from "next";

import { logout } from "@/app/account/actions";
import { AccountOverview } from "@/components/account/account-overview";
import { requireCurrentAccount } from "@/lib/dal/account";

export const metadata: Metadata = {
  title: "Account overview",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const account = await requireCurrentAccount();
  return <AccountOverview account={account} logoutAction={logout} />;
}
