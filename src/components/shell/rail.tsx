"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { AccountNavigation } from "@/components/account/account-navigation";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { RailIdentity } from "@/components/shell/rail-identity";
import type { ShellIdentity } from "@/components/shell/shell-types";

const RAIL_KEY = "qt-console-rail";
const RAIL_EVENT = "qt-console-rail-change";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(RAIL_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(RAIL_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The rail's width preference, per device. Server and hydration render expanded. */
export function useRailCollapsed(): boolean {
  return useSyncExternalStore(subscribe, readCollapsed, () => false);
}

function setRailCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(RAIL_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // A private window keeps the choice for the page's lifetime only.
  }
  window.dispatchEvent(new Event(RAIL_EVENT));
}

type RailProps = {
  identity: ShellIdentity;
  signOutAction: () => Promise<void>;
};

/**
 * The left rail: the wordmark, the account's sections and — for staff — administration,
 * then who is signed in as a menu. One rail for the whole console: there is no separate
 * "admin console" to switch into. Collapses to icons and remembers that per device.
 */
export function Rail({ identity, signOutAction }: RailProps) {
  const collapsed = useRailCollapsed();

  useEffect(() => {
    document.documentElement.toggleAttribute("data-rail-collapsed", collapsed);
  }, [collapsed]);

  return (
    <aside className="rail" id="shell-sidebar" data-collapsed={collapsed || undefined}>
      <div className="rail__head">
        <BrandMark />
        <button
          type="button"
          className="rail__collapse"
          onClick={() => setRailCollapsed(!collapsed)}
          aria-pressed={collapsed}
          title={collapsed ? "Expand the rail" : "Collapse the rail"}
        >
          {collapsed ? (
            <PanelLeftOpen size={15} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={15} strokeWidth={1.8} aria-hidden="true" />
          )}
          <span className="sr-only">{collapsed ? "Expand the rail" : "Collapse the rail"}</span>
        </button>
      </div>

      <div className="rail__groups">
        <AccountNavigation collapsed={collapsed} />
        {identity.canEnterAdmin && <AdminNavigation collapsed={collapsed} />}
      </div>

      <RailIdentity identity={identity} signOutAction={signOutAction} collapsed={collapsed} />
    </aside>
  );
}
