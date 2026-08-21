import type { ComponentType } from "react";
import {
  Bot,
  Camera,
  GitMerge,
  LayoutDashboard,
  LineChart,
  Megaphone,
  MessageCircleReply,
  PlaySquare,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";

export type NavIcon = ComponentType<{ className?: string }>;

export type NavItem = {
  /** Ime govori šta je unutra: „Kontrolna tabla", ne „Početna". */
  label: string;
  /** Skraćeni natpis za donju traku na telefonu, kada pun ne stane u ćeliju. */
  short?: string;
  href: string;
  icon: NavIcon;
  /** Ekran radi nad periodom, pa gornja traka na njemu nosi birač perioda. */
  range: boolean;
  /**
   * Donja traka na telefonu ima devet ćelija i ni jednu više. Šta ne stane
   * ovde, dostupno je sa svog matičnog ekrana (i iz bočne trake na širem
   * ekranu), pa nijedan izlaz ne nestaje.
   */
  mobile?: boolean;
};

export type NavSection = {
  /** Grupisano po smislu, ne po abecedi. */
  title: string;
  items: NavItem[];
};

/** Jedini izvor istine za bočnu traku, donju traku i naslov u gornjoj traci. */
export const navSections: NavSection[] = [
  {
    title: "Pregled",
    items: [
      {
        label: "Kontrolna tabla",
        short: "Tabla",
        href: "/",
        icon: LayoutDashboard,
        range: true,
      },
      { label: "Analitika", href: "/analytics", icon: LineChart, range: true },
      { label: "Atribucija", href: "/atribucija", icon: GitMerge, range: true },
    ],
  },
  {
    title: "Kanali",
    items: [
      { label: "Instagram", href: "/instagram", icon: Camera, range: true },
      {
        label: "Facebook",
        href: "/facebook",
        icon: Users,
        range: true,
      },
      { label: "YouTube", href: "/youtube", icon: PlaySquare, range: true },
      { label: "Oglasi", href: "/ads", icon: Megaphone, range: true },
    ],
  },
  {
    title: "Automatizacija",
    items: [
      {
        label: "OpenReply",
        href: "/openreply",
        icon: MessageCircleReply,
        range: true,
      },
      {
        label: "YouTube automatizacije",
        href: "/youtube/automatizacije",
        icon: Bot,
        range: false,
        mobile: false,
      },
      { label: "Pravila", href: "/rules", icon: ShieldAlert, range: false },
    ],
  },
  {
    title: "Sistem",
    items: [
      { label: "Podešavanja", href: "/settings", icon: Settings, range: false },
    ],
  },
];

export const navItems: NavItem[] = navSections.flatMap((s) => s.items);

export const mobileNavItems: NavItem[] = navItems.filter(
  (item) => item.mobile !== false,
);

/**
 * Ekran koji ima svoje mesto u gornjoj traci, ali ne i u navigaciji — otvara
 * se sa matičnog ekrana i ima sopstveni izlaz nazad.
 */
export type Screen = {
  href: string;
  /** Sekcija u kojoj ekran živi — leva polovina naslova u gornjoj traci. */
  section: string;
  title: string;
  range: boolean;
};

const EXTRA_SCREENS: Screen[] = [
  {
    href: "/openreply/automatizacije",
    section: "Automatizacija",
    title: "Automatizacije i DM log",
    range: false,
  },
  {
    href: "/instagram/objavi",
    section: "Kanali",
    title: "Nova objava",
    range: false,
  },
  {
    href: "/instagram/komentari",
    section: "Kanali",
    title: "Moderacija komentara",
    range: false,
  },
  {
    href: "/instagram/publika",
    section: "Kanali",
    title: "Publika i demografija",
    range: false,
  },
  {
    href: "/instagram/stories",
    section: "Kanali",
    title: "Priče (Stories)",
    range: false,
  },
  {
    href: "/instagram/inbox",
    section: "Kanali",
    title: "Poruke (Inbox)",
    range: false,
  },
  {
    href: "/facebook/komentari",
    section: "Kanali",
    title: "Moderacija komentara",
    range: false,
  },
];

/**
 * Sve rute poređane od najduže ka najkraćoj, da bi „/youtube/automatizacije"
 * pobedilo „/youtube" pri traženju najboljeg poklapanja. Bez toga bi obe
 * stavke bile aktivne istovremeno, a klizni indikator ne bi znao kuda ide.
 */
const ROUTES: Array<{ href: string; item?: NavItem; screen: Screen }> = [
  ...navSections.flatMap((section) =>
    section.items.map((item) => ({
      href: item.href,
      item,
      screen: {
        href: item.href,
        section: section.title,
        title: item.label,
        range: item.range,
      },
    })),
  ),
  ...EXTRA_SCREENS.map((screen) => ({ href: screen.href, screen })),
].sort((a, b) => b.href.length - a.href.length);

function matches(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Tačno jedna stavka je aktivna: ona sa najdužim poklapanjem putanje. */
export function isNavActive(pathname: string, href: string): boolean {
  return activeHref(pathname) === href;
}

/** `undefined` znači ruta van registra — indikator se tada ne prikazuje. */
export function activeHref(pathname: string): string | undefined {
  return ROUTES.find((r) => r.item && matches(pathname, r.href))?.href;
}

/** Sekcija, naziv ekrana i da li mu treba birač perioda — za gornju traku. */
export function resolveScreen(pathname: string): Screen | undefined {
  return ROUTES.find((r) => matches(pathname, r.href))?.screen;
}
