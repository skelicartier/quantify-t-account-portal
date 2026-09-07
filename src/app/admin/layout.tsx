import type { ReactNode } from "react";

import { logout } from "@/app/account/actions";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { BrandMark } from "@/components/brand/brand-mark";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="account-shell admin-shell">
      <header className="account-header">
        <BrandMark href="/admin" />
        <AdminNavigation />
        <div className="account-header__actions">
          <a className="account-header__identity" href="/account">
            Account
          </a>
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
