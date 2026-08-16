import {
  Dumbbell,
  History,
  Home,
  Map,
  MessageSquareText,
  Ruler,
  Salad,
  Settings,
  Sparkles,
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
  { href: "/dashboard", label: "Home", icon: Home, bottomNav: true },
  {
    href: "/dashboard/coach",
    label: "AI Coach",
    icon: Sparkles,
    ownerOnly: true,
    bottomNav: true,
  },
  { href: "/dashboard/weight", label: "Progress", icon: TrendingUp },
  {
    href: "/dashboard/strength",
    label: "Strength",
    icon: Dumbbell,
    bottomNav: true,
  },
  { href: "/dashboard/measurements", label: "Measurements", icon: Ruler },
  {
    href: "/dashboard/nutrition",
    label: "Nutrition",
    icon: Salad,
    ownerOnly: true,
  },
  { href: "/dashboard/gym", label: "Gym Journey", icon: Map, bottomNav: true },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/records", label: "Records", icon: Trophy },
  {
    href: "/dashboard/import",
    label: "Import",
    icon: MessageSquareText,
    ownerOnly: true,
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    ownerOnly: true,
  },
];
