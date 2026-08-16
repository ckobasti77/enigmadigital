import type { ComponentType } from "react";
import {
  LayoutDashboard,
  LineChart,
  Camera,
  MessageCircleReply,
  GitMerge,
  Settings,
} from "lucide-react";

export type NavIcon = ComponentType<{ className?: string }>;

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
};

// Single source of truth for both the desktop sidebar and the mobile bottom bar.
export const navItems: NavItem[] = [
  { label: "Pregled", href: "/", icon: LayoutDashboard },
  { label: "Analitika", href: "/analytics", icon: LineChart },
  { label: "Instagram", href: "/instagram", icon: Camera },
  { label: "OpenReply", href: "/openreply", icon: MessageCircleReply },
  { label: "Atribucija", href: "/atribucija", icon: GitMerge },
  { label: "Podešavanja", href: "/settings", icon: Settings },
];

export function isNavActive(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}
