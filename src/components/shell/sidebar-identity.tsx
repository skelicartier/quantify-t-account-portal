import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import type { ShellIdentity, ShellSection } from "@/components/shell/shell-types";
import { Badge, EnvBadge, RoleBadge } from "@/components/ui/badge";
import { planLabel } from "@/lib/admin/plan-catalogue";

type SidebarIdentityProps = {
  section: ShellSection;
  identity: ShellIdentity;
  signOutAction: () => Promise<void>;
};

export function SidebarIdentity({ section, identity, signOutAction }: SidebarIdentityProps) {
  const showAdminSwitch = section === "account" && identity.canEnterAdmin;
  return (
    <div className="identity">
      <div className="identity__person">
        <span className="avatar" aria-hidden="true">
          {identity.initials}
        </span>
        <span>
          <span className="identity__name">{identity.displayName}</span>
          <span className="identity__email">{identity.email ?? "Verified account"}</span>
        </span>
      </div>
      <div className="identity__badges">
        {section === "admin" ? (
          <>
            <RoleBadge role={identity.role} />
            <EnvBadge environment={identity.environment} />
          </>
        ) : (
          <>
            {identity.plan && <Badge>{planLabel(identity.plan)} plan</Badge>}
            {identity.role && identity.role !== "user" && <RoleBadge role={identity.role} />}
          </>
        )}
      </div>
      <div className="identity__actions">
        {showAdminSwitch && (
          <Link className="btn btn--small" href="/admin">
            Admin console
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        )}
        {section === "admin" && (
          <Link className="btn btn--small" href="/account">
            Account
          </Link>
        )}
        <form action={signOutAction}>
          <button className="btn btn--small btn--ghost" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
