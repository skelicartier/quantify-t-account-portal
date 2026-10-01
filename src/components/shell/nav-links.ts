import {
  Activity,
  Bell,
  CreditCard,
  Database,
  Landmark,
  LayoutDashboard,
  MonitorSmartphone,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Marks the link current for nested routes (e.g. a user detail page under Users). */
  activePrefix?: string;
};

export const ACCOUNT_LINKS: readonly NavLink[] = [
  { href: "/account", label: "Overview", icon: LayoutDashboard },
  { href: "/account/profile", label: "Profile", icon: UserRound },
  { href: "/account/subscription", label: "Subscription", icon: CreditCard },
  { href: "/account/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/account/portfolios", label: "Portfolios", icon: Wallet },
  { href: "/account/brokers", label: "Brokers", icon: Landmark },
  { href: "/account/security", label: "Security", icon: ShieldCheck },
  { href: "/account/sessions", label: "Sessions", icon: MonitorSmartphone },
  { href: "/account/activity", label: "Activity", icon: Activity },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/account/data", label: "Data", icon: Database },
];
