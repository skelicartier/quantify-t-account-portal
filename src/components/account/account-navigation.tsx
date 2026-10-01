"use client";

import { ACCOUNT_LINKS } from "@/components/shell/nav-links";
import { SidebarNav } from "@/components/shell/sidebar-nav";

// Client-side on purpose: the link table carries icon components, which can only be
// handed to the client navigation from inside the client bundle.
export function AccountNavigation({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <SidebarNav
      label="Account sections"
      heading="Account"
      links={ACCOUNT_LINKS}
      collapsed={collapsed}
    />
  );
}
