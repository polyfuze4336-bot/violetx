import {
  Dumbbell,
  History,
  LayoutDashboard,
  MessageSquareText,
  Ruler,
  Settings,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden from coaches (read-only users). */
  ownerOnly?: boolean;
  /** Shown in the mobile bottom navigation bar (most common actions). */
  bottomNav?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    bottomNav: true,
  },
  {
    href: "/dashboard/measurements",
    label: "Measurements",
    icon: Ruler,
    bottomNav: true,
  },
  {
    href: "/dashboard/strength",
    label: "Strength",
    icon: TrendingUp,
    bottomNav: true,
  },
  { href: "/dashboard/exercises", label: "Exercises", icon: Dumbbell },
  { href: "/dashboard/history", label: "History", icon: History },
  {
    href: "/dashboard/import",
    label: "Import",
    icon: MessageSquareText,
    ownerOnly: true,
  },
  {
    href: "/dashboard/records",
    label: "Records",
    icon: Trophy,
    bottomNav: true,
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    ownerOnly: true,
  },
];

