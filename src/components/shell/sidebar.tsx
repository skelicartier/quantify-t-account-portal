import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { SidebarIdentity } from "@/components/shell/sidebar-identity";
import type { ShellIdentity, ShellSection } from "@/components/shell/shell-types";

type SidebarProps = {
  section: ShellSection;
  identity: ShellIdentity;
  nav: ReactNode;
  signOutAction: () => Promise<void>;
};

export function Sidebar({ section, identity, nav, signOutAction }: SidebarProps) {
  return (
    <aside className="sidebar" id="shell-sidebar">
      <BrandMark href={section === "admin" ? "/admin" : "/account"} />
      <p className="eyebrow sidebar__section">
        {section === "admin" ? "Administration" : "Account"}
      </p>
      {nav}
      <SidebarIdentity section={section} identity={identity} signOutAction={signOutAction} />
    </aside>
  );
}
