import type { ReactNode } from "react";

import { logout } from "@/app/account/actions";
import { AccountNavigation } from "@/components/account/account-navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { requireCurrentAccount } from "@/lib/dal/account";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const account = await requireCurrentAccount();
  return (
    <div className="account-shell">
      <header className="account-header">
        <BrandMark href="/account" />
        <AccountNavigation />
        <div className="account-header__actions">
          <span className="account-header__identity">{account.email ?? "Verified account"}</span>
          <form action={logout}>
            <button className="button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
