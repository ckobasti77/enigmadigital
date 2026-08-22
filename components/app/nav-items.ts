import type { ComponentType } from "react";
import {
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
  // YouTube automatizacije više nije top-level stavka nego podekran YouTube-a
  // (kao „/openreply/automatizacije"). Bez ovog reda `resolveScreen` bi pao na
  // „/youtube" i gornja traka bi pokazala birač perioda — a ovaj ekran ne radi
  // nad periodom.
  {
    href: "/youtube/automatizacije",
    section: "Kanali",
    title: "YouTube automatizacije",
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
  {
    href: "/analytics/sticanje",
    section: "Analitika",
    title: "Sticanje korisnika",
    range: true,
  },
  {
    href: "/analytics/oglasi",
    section: "Analitika",
    title: "Plaćeni oglasi (Google Ads)",
    range: true,
  },
  {
    href: "/analytics/sadrzaj",
    section: "Analitika",
    title: "Sadržaj i stranice",
    range: true,
  },
  {
    href: "/analytics/posetioci",
    section: "Analitika",
    title: "Posetioci i ponašanje",
    range: true,
  },
  {
    href: "/analytics/uzivo",
    section: "Analitika",
    title: "Uživo (poslednjih 30 minuta)",
    range: false,
  },
  {
    href: "/analytics/retencija",
    section: "Analitika",
    title: "Retencija i kohorte",
    range: false,
  },
  // Detalj objave se otvara iz mreže, nema svoju stavku u navigaciji. Bez ovog
  // reda `resolveScreen` bi pao na „/instagram" i gornja traka bi na njemu
  // pokazala birač perioda — a detalj objave ne radi nad periodom. Href je
  // segment pre `[mediaId]`, pa hvata svaki `/instagram/objave/<id>`.
  {
    href: "/instagram/objave",
    section: "Kanali",
    title: "Detalj objave",
    range: false,
  },
  {
    href: "/ads/publike",
    section: "Kanali",
    title: "Publike",
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

/**
 * Najduže poklapanje putanje među ponuđenim href-ovima — jedno pravilo za oba
 * nivoa navigacije. Tako i „/instagram/objave/<id>" (bez svoje stavke) pada na
 * „/instagram", umesto da ostane bez ijedne obeležene stavke.
 */
export function bestHref(
  pathname: string,
  hrefs: readonly string[],
): string | undefined {
  let best: string | undefined;
  for (const href of hrefs) {
    if (matches(pathname, href) && (best === undefined || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

/** Kandidati za prvi nivo: samo top-level stavke; podekrani padaju na roditelja. */
const NAV_HREFS: readonly string[] = navItems.map((i) => i.href);

/** Tačno jedna stavka je aktivna: ona sa najdužim poklapanjem putanje. */
export function isNavActive(pathname: string, href: string): boolean {
  return activeHref(pathname) === href;
}

/**
 * Href aktivne stavke PRVOG nivoa (roditelja). `undefined` znači ruta van
 * registra — indikator se tada ne prikazuje.
 */
export function activeHref(pathname: string): string | undefined {
  return bestHref(pathname, NAV_HREFS);
}

/** Sekcija, naziv ekrana i da li mu treba birač perioda — za gornju traku. */
export function resolveScreen(pathname: string): Screen | undefined {
  return ROUTES.find((r) => matches(pathname, r.href))?.screen;
}

/**
 * Druga ravan navigacije. Kanal u bočnoj traci vodi na svoj pregled; podekrani
 * žive u traci sa jezičcima (`SectionNav`) na vrhu tog kanala, ista na svakom
 * njegovom ekranu. Bez ovoga je šest Instagram ekrana skriveno iza jedne
 * stavke — dostupni samo lovom na dugme sa početne strane kanala.
 *
 * Kratki natpisi namerno: traka mora da stane u red i da klizi na telefonu.
 * Puni, opisniji naziv ekrana i dalje nosi breadcrumb u gornjoj traci.
 */
export type ChannelTab = {
  href: string;
  label: string;
  /**
   * Naziv grupe u traci podekrana. Kada bar jedan tab kanala ima grupu,
   * `SectionNav` crta razdelnik + sitan natpis pred svakom grupom; kanali bez
   * grupa se renderuju kao ravna traka (nepromenjeno). Susedni tabovi sa istim
   * `group` čine jedan klaster, pa redosled u nizu određuje i redosled grupa.
   */
  group?: string;
};

export const channelTabs: Record<string, readonly ChannelTab[]> = {
  // Sedam ekrana bez hijerarhije klizalo je u ravnoj traci. Grupe ih dele na
  // ono što se gleda svaki dan i ono u šta se roni povremeno; dnevno ide prvo,
  // pa se vidi bez pomeranja. „Detaljno" prati putanju: sticanje → sadržaj →
  // posetioci → oglasi → retencija.
  "/analytics": [
    { href: "/analytics", label: "Pregled", group: "Svakodnevno" },
    { href: "/analytics/uzivo", label: "Uživo", group: "Svakodnevno" },
    { href: "/analytics/sticanje", label: "Sticanje", group: "Detaljno" },
    { href: "/analytics/sadrzaj", label: "Sadržaj", group: "Detaljno" },
    { href: "/analytics/posetioci", label: "Posetioci", group: "Detaljno" },
    { href: "/analytics/oglasi", label: "Oglasi", group: "Detaljno" },
    { href: "/analytics/retencija", label: "Retencija", group: "Detaljno" },
  ],
  "/instagram": [
    { href: "/instagram", label: "Pregled" },
    { href: "/instagram/publika", label: "Publika" },
    { href: "/instagram/stories", label: "Priče" },
    { href: "/instagram/inbox", label: "Inbox" },
    { href: "/instagram/komentari", label: "Komentari" },
    { href: "/instagram/objavi", label: "Nova objava" },
  ],
  "/facebook": [
    { href: "/facebook", label: "Pregled" },
    { href: "/facebook/komentari", label: "Komentari" },
  ],
  "/youtube": [
    { href: "/youtube", label: "Pregled" },
    { href: "/youtube/automatizacije", label: "Automatizacije" },
  ],
  "/openreply": [
    { href: "/openreply", label: "Pregled" },
    { href: "/openreply/automatizacije", label: "Automatizacije" },
  ],
  "/ads": [
    { href: "/ads", label: "Pregled" },
    { href: "/ads/publike", label: "Publike" },
  ],
} as const;

/** Podekrani kanala kome ekran pripada, ili `undefined` van kanala. */
export function channelTabsFor(
  pathname: string,
): readonly ChannelTab[] | undefined {
  const base = Object.keys(channelTabs).find((b) => matches(pathname, b));
  return base ? channelTabs[base] : undefined;
}

/**
 * Aktivan jezičak: onaj sa najdužim poklapanjem putanje. Detalj objave
 * (`/instagram/objave/<id>`) tako pada na „Pregled", jer mreža objava živi
 * tamo — a ne ostaje bez ijednog obeleženog jezička.
 */
export function activeChannelTab(
  pathname: string,
  tabs: readonly ChannelTab[],
): string | undefined {
  return bestHref(
    pathname,
    tabs.map((t) => t.href),
  );
}

/**
 * Podstavke jedne stavke bočne trake, izvedene iz `channelTabs` — jedan spisak
 * ostaje jedan. `undefined` znači stavka bez podstranica (nema sevrona).
 */
export function navChildrenFor(
  href: string,
): readonly ChannelTab[] | undefined {
  return channelTabs[href];
}
