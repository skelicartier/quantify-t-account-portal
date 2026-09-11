import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { SidebarClock } from "@/components/shell/sidebar-clock";
import { SidebarIdentity } from "@/components/shell/sidebar-identity";
import type { ShellIdentity, ShellSection } from "@/components/shell/shell-types";
import { ThemeToggle } from "@/components/shell/theme-toggle";

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
      <div className="sidebar__status">
        <div className="sidebar__status-row">
          <span className="sidebar__status-dot">Online</span>
          <SidebarClock />
        </div>
        <div className="sidebar__status-row">
          <span className="sidebar__status-label">Theme</span>
          <ThemeToggle />
        </div>
      </div>
      <SidebarIdentity section={section} identity={identity} signOutAction={signOutAction} />
    </aside>
  );
}
