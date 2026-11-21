"use client";

import { ADMIN_LINKS } from "@/components/shell/nav-links";
import { SidebarNav } from "@/components/shell/sidebar-nav";

// Client-side on purpose: the link table carries icon components, which can only be
// handed to the client navigation from inside the client bundle.
export function AdminNavigation({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <SidebarNav
      label="Administration sections"
      heading="Administration"
      links={ADMIN_LINKS}
      collapsed={collapsed}
    />
  );
}
