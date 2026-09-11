import { BrandMark } from "@/components/brand/brand-mark";
import { MobileNavToggle } from "@/components/shell/mobile-nav-toggle";
import type { ShellSection } from "@/components/shell/shell-types";

export function Topbar({ section }: { section: ShellSection }) {
  return (
    <div className="topbar">
      <MobileNavToggle />
      <BrandMark compact href={section === "admin" ? "/admin" : "/account"} />
      <span className="topbar__section">{section === "admin" ? "Admin" : "Account"}</span>
    </div>
  );
}
