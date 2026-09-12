import {
  Activity,
  Bell,
  CreditCard,
  Database,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Mail,
  MonitorSmartphone,
  Rocket,
  ScrollText,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserRound,
  Users,
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
  { href: "/account/security", label: "Security", icon: ShieldCheck },
  { href: "/account/sessions", label: "Sessions", icon: MonitorSmartphone },
  { href: "/account/activity", label: "Activity", icon: Activity },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/account/data", label: "Data", icon: Database },
];

export const ADMIN_LINKS: readonly NavLink[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users, activePrefix: "/admin/users/" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: Gauge },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/email", label: "Email", icon: Mail },
  { href: "/admin/audit", label: "Audit", icon: ScrollText },
  { href: "/admin/reports", label: "Reports", icon: FileText },
  { href: "/admin/configuration", label: "Configuration", icon: Settings2 },
  { href: "/admin/credentials", label: "Credentials", icon: KeyRound },
  { href: "/admin/releases", label: "Releases", icon: Rocket },
  { href: "/admin/roles", label: "Roles", icon: UserCog },
];
