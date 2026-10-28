import type { ComponentType } from "react";
import {
  GitMerge,
  LayoutDashboard,
  LineChart,
  Megaphone,
  MessageCircleReply,
  Newspaper,
  PlaySquare,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";
import { FacebookIcon, InstagramIcon, ThreadsIcon } from "./brand-glyphs";

/** Pita da li je modul uključen u projektu (`useModulUkljucen`). */
export type Ukljucen = (modul: ModuleKey) => boolean;

export type NavIcon = ComponentType<{ className?: string }>;

/**
 * Trinaest modula — svaki ima svoju boju (UI Boost §3.2). Ključ je isti kao u
 * `app/globals.css` (`--mod-<ključ>`, `[data-module="<ključ>"]`), pa se menja u
 * paru. Redosled prati bočnu traku posle preuređenja, da susedne boje ostanu
 * različite.
 */
export const MODULE_KEYS = [
  "tabla",
  "leadovi",
  "novosti",
  "instagram",
  "facebook",
  "youtube",
  "threads",
  "oglasi",
  "analitika",
  "atribucija",
  "openreply",
  "pravila",
  "sistem",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type NavItem = {
  /** Ime govori šta je unutra: „Kontrolna tabla", ne „Početna". */
  label: string;
  /** Skraćeni natpis za donju traku na telefonu, kada pun ne stane u ćeliju. */
  short?: string;
  href: string;
  icon: NavIcon;
  /** Modul kome ekran pripada — određuje boju mesta (`data-module`). */
  module: ModuleKey;
  /** Ekran radi nad periodom, pa gornja traka na njemu nosi birač perioda. */
  range: boolean;
};

export type NavSection = {
  /** Grupisano po smislu, ne po abecedi. */
  title: string;
  items: NavItem[];
};

/**
 * Jedini izvor istine za bočnu traku, donju traku i mrvicu u gornjoj traci.
 *
 * Grupe prate posao, ne tehnologiju (UI Boost §7.1): Leadovi su svakodnevni
 * rad, pa stoje uz Kontrolnu tablu; Novosti su CMS, ne kanal. Redosled unutar
 * grupa drži susedne boje modula različitim (§3.3).
 */
export const navSections: NavSection[] = [
  {
    title: "Radni sto",
    items: [
      {
        label: "Kontrolna tabla",
        short: "Tabla",
        href: "/",
        module: "tabla",
        icon: LayoutDashboard,
        range: true,
      },
      { label: "Leadovi", href: "/leadovi", module: "leadovi", icon: Users, range: false },
      { label: "Novosti", href: "/novosti", module: "novosti", icon: Newspaper, range: false },
    ],
  },
  {
    title: "Kanali",
    items: [
      { label: "Instagram", href: "/instagram", module: "instagram", icon: InstagramIcon, range: true },
      { label: "Facebook", href: "/facebook", module: "facebook", icon: FacebookIcon, range: true },
      { label: "YouTube", href: "/youtube", module: "youtube", icon: PlaySquare, range: true },
      { label: "Threads", href: "/threads", module: "threads", icon: ThreadsIcon, range: true },
      { label: "Oglasi", href: "/ads", module: "oglasi", icon: Megaphone, range: true },
    ],
  },
  {
    title: "Analitika",
    items: [
      { label: "Analitika", href: "/analytics", module: "analitika", icon: LineChart, range: true },
      { label: "Atribucija", href: "/atribucija", module: "atribucija", icon: GitMerge, range: true },
    ],
  },
  {
    title: "Automatizacija",
    items: [
      {
        label: "OpenReply",
        href: "/openreply",
        module: "openreply",
        icon: MessageCircleReply,
        range: true,
      },
      { label: "Pravila", href: "/rules", module: "pravila", icon: ShieldAlert, range: false },
    ],
  },
];

/**
 * Podešavanja stoje odvojeno, na dnu bočne trake (zupčanik uz karticu igrača):
 * to nije mesto na kom se radi, nego mesto na kom se sistem namešta.
 */
export const settingsNavItem: NavItem = {
  label: "Podešavanja",
  href: "/settings",
  module: "sistem",
  icon: Settings,
  range: false,
};

const SETTINGS_SECTION = "Sistem";

export const navItems: NavItem[] = [
  ...navSections.flatMap((s) => s.items),
  settingsNavItem,
];

/**
 * Donja traka na telefonu: tri stavke + „Danas" (zvono) + „Više" (§7.3). Sve
 * ostalo je u listu „Više", pa nijedan izlaz ne nestaje, a traka nikad ne
 * kliza vodoravno.
 */
const MOBILE_BAR_HREFS = ["/", "/leadovi", "/instagram"];
const MOBILE_BAR_CELLS = MOBILE_BAR_HREFS.length;

export const mobileBarItems: NavItem[] = navItems.filter((item) =>
  MOBILE_BAR_HREFS.includes(item.href),
);

/**
 * Grupe bočne trake samo sa uključenim modulima (PROJEKTI-PLAN §8, „Moduli“);
 * grupa bez ijedne stavke nestaje cela.
 */
export function vidljiveSekcije(ukljucen: Ukljucen): NavSection[] {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => ukljucen(item.module)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Tri ćelije donje trake u projektu: podrazumevane stavke koje su uključene,
 * a mesto isključene popuni sledeća uključena stavka navigacije, pa traka
 * nikad nema praznu ćeliju.
 */
export function donjaTraka(ukljucen: Ukljucen): NavItem[] {
  const prve = mobileBarItems.filter((item) => ukljucen(item.module));
  const dopuna = navItems.filter(
    (item) =>
      item !== settingsNavItem &&
      !prve.includes(item) &&
      ukljucen(item.module),
  );
  return [...prve, ...dopuna].slice(0, MOBILE_BAR_CELLS);
}

/**
 * Ekran koji ima svoje mesto u gornjoj traci, ali ne i u navigaciji — otvara
 * se sa matičnog ekrana i ima sopstveni izlaz nazad.
 */
export type Screen = {
  href: string;
  /** Grupa bočne trake u kojoj je modul ekrana („Kanali", „Analitika"…). */
  section: string;
  title: string;
  range: boolean;
  module: ModuleKey;
  /**
   * Stavka navigacije iznad ovog ekrana — prvi deo mrvice. Nema je kod ekrana
   * koji je i sam stavka navigacije. Mrvica je tako uvek „modul / podekran",
   * nikad „grupa / modul" na jednom ekranu a „modul / podekran" na drugom.
   */
  parent?: { href: string; label: string };
};

/** Podekran: modul mu određuje i boju, i grupu, i prvi deo mrvice. */
type ExtraScreen = Pick<Screen, "href" | "title" | "range" | "module">;

const EXTRA_SCREENS: ExtraScreen[] = [
  // Napredak je lični pregled uz radni sto, pa nosi boju Kontrolne table.
  // Namerno NIJE četrnaesti, zlatni modul: zlatna je u sistemu rezervisana za
  // nagradu (XP, bedž, završena misija) — kao boja mesta bi izgubila to
  // značenje baš na ekranu na kom je ima najviše.
  {
    href: "/napredak",
    module: "tabla",
    title: "Napredak",
    range: false,
  },
  {
    href: "/leadovi/uvoz",
    module: "leadovi",
    title: "Uvoz leadova iz tabele",
    range: false,
  },
  {
    href: "/openreply/automatizacije",
    module: "openreply",
    title: "Automatizacije i dnevnik poruka",
    range: false,
  },
  // YouTube automatizacije više nije top-level stavka nego podekran YouTube-a
  // (kao „/openreply/automatizacije"). Bez ovog reda `resolveScreen` bi pao na
  // „/youtube" i gornja traka bi pokazala birač perioda — a ovaj ekran ne radi
  // nad periodom.
  {
    href: "/youtube/automatizacije",
    module: "youtube",
    title: "Automatizacije",
    range: false,
  },
  {
    href: "/instagram/objavi",
    module: "instagram",
    title: "Nova objava",
    range: false,
  },
  {
    href: "/instagram/komentari",
    module: "instagram",
    title: "Moderacija komentara",
    range: false,
  },
  {
    href: "/instagram/publika",
    module: "instagram",
    title: "Publika i demografija",
    range: false,
  },
  {
    href: "/instagram/stories",
    module: "instagram",
    title: "Priče",
    range: false,
  },
  {
    href: "/instagram/inbox",
    module: "instagram",
    title: "Poruke",
    range: false,
  },
  {
    href: "/facebook/komentari",
    module: "facebook",
    title: "Moderacija komentara",
    range: false,
  },
  {
    href: "/analytics/sticanje",
    module: "analitika",
    title: "Sticanje korisnika",
    range: true,
  },
  {
    href: "/analytics/oglasi",
    module: "analitika",
    title: "Plaćeni oglasi (Google Ads)",
    range: true,
  },
  {
    href: "/analytics/sadrzaj",
    module: "analitika",
    title: "Sadržaj i stranice",
    range: true,
  },
  {
    href: "/analytics/posetioci",
    module: "analitika",
    title: "Posetioci i ponašanje",
    range: true,
  },
  {
    href: "/analytics/uzivo",
    module: "analitika",
    title: "Uživo (poslednjih 30 minuta)",
    range: false,
  },
  {
    href: "/analytics/retencija",
    module: "analitika",
    title: "Retencija i kohorte",
    range: false,
  },
  // Detalj objave se otvara iz mreže, nema svoju stavku u navigaciji. Bez ovog
  // reda `resolveScreen` bi pao na „/instagram" i gornja traka bi na njemu
  // pokazala birač perioda — a detalj objave ne radi nad periodom. Href je
  // segment pre `[mediaId]`, pa hvata svaki `/instagram/objave/<id>`.
  {
    href: "/instagram/objave",
    module: "instagram",
    title: "Detalj objave",
    range: false,
  },
  {
    href: "/ads/publike",
    module: "oglasi",
    title: "Publike",
    range: false,
  },
  {
    href: "/ads/nova-kampanja",
    module: "oglasi",
    title: "Nova kampanja",
    range: false,
  },
];

/**
 * Sve rute poređane od najduže ka najkraćoj, da bi „/youtube/automatizacije"
 * pobedilo „/youtube" pri traženju najboljeg poklapanja. Bez toga bi obe
 * stavke bile aktivne istovremeno, a klizni indikator ne bi znao kuda ide.
 */
const SECTION_OF = new Map<ModuleKey, string>([
  ...navSections.flatMap((section) =>
    section.items.map((item) => [item.module, section.title] as const),
  ),
  [settingsNavItem.module, SETTINGS_SECTION],
]);

const ROUTES: Array<{ href: string; item?: NavItem; screen: Screen }> = [
  ...EXTRA_SCREENS.map((extra) => {
    const parent = navItems.find((item) => item.module === extra.module);
    return {
      href: extra.href,
      screen: {
        ...extra,
        section: SECTION_OF.get(extra.module) ?? "",
        parent: parent && { href: parent.href, label: parent.label },
      },
    };
  }),
  ...navItems.map((item) => ({
    href: item.href,
    item,
    screen: {
      href: item.href,
      section: SECTION_OF.get(item.module) ?? "",
      title: item.label,
      range: item.range,
      module: item.module,
    },
  })),
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
 * Modul rute — boja mesta. Ruta van registra (i sve što nije ekran aplikacije)
 * pada na brend cijan, pa nijedan ekran ne ostane bez boje.
 */
export function resolveModule(pathname: string): ModuleKey {
  return resolveScreen(pathname)?.module ?? "tabla";
}

/**
 * Da li je ruta upisana u registar. Meni korisnika i kartica igrača ovim
 * pitaju za ekran koji tek stiže (`/napredak`): dok ga registar nema, veza se
 * ne crta — nema mrtve kontrole — a čim se ekran upiše, pojavi se sama.
 */
export function screenExists(href: string): boolean {
  return ROUTES.some((r) => r.href === href);
}

/**
 * Ekrani čija adresa nosi ID iz projekta (`/instagram/objave/<id>`). Pri
 * prelasku u drugi projekat taj ID tamo ne postoji, pa se ide na roditelja.
 * Profil firme (`/leadovi/<id>`) već pada na „/leadovi“, jer nema svoj red.
 */
const EKRANI_SA_ID: ReadonlySet<string> = new Set(["/instagram/objave"]);

/**
 * Ekran za prelazak u drugi projekat (`putanjaZaPrelazak` u `lib/rutiranje`):
 * adresa iz registra i modul. `undefined` za rutu van registra.
 */
export function ekranZaPrelazak(
  putanja: string,
): { href: string; modul: ModuleKey } | undefined {
  const screen = resolveScreen(putanja);
  if (screen === undefined) return undefined;
  const href = EKRANI_SA_ID.has(screen.href)
    ? (screen.parent?.href ?? "/")
    : screen.href;
  return { href, modul: screen.module };
}

/**
 * Stavka „Novi projekat“ u biraču projekta stoji tek kad ekran `/novi`
 * postoji (isti obrazac kao `screenExists`: nema mrtve kontrole). Pali je
 * korak koji pravi čarobnjak novog projekta.
 */
export const NOVI_PROJEKAT_POSTOJI = true;
export const NOVI_PROJEKAT_HREF = "/novi";

/** Ekran napretka (upisan u `EXTRA_SCREENS`). */
export const NAPREDAK_HREF = "/napredak";

/**
 * Režim poziva (B6): fokus prikaz na Leadovima, jedna firma na ekranu. Stanje
 * je u adresi (`?rezim=poziv`), pa u njega vode i ⌘K, i misija „Pozovi…", i
 * dugme na jezičku „Danas" — a „nazad" u pregledaču iz njega izlazi.
 */
export const REZIM_POZIVA_HREF = "/leadovi?rezim=poziv";

/**
 * Događaji ljuske. Kontrole koje žive daleko jedna od druge (dugme u traci,
 * ⌘K, bočna traka) ne dele stanje nego poruku na `window`.
 */
export const COMMAND_EVENT = "enigma:command";
export const RAIL_EVENT = "enigma:rail";

/** Stavka navigacije jednog modula — za ikonicu i naziv u zaglavlju strane. */
export function moduleNavItem(module: ModuleKey): NavItem | undefined {
  return navItems.find((item) => item.module === module);
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
    { href: "/instagram/inbox", label: "Poruke" },
    { href: "/instagram/komentari", label: "Komentari" },
    { href: "/instagram/objavi", label: "Nova objava" },
  ],
  "/facebook": [
    { href: "/facebook", label: "Pregled" },
    { href: "/facebook/komentari", label: "Komentari" },
  ],
  "/threads": [
    { href: "/threads", label: "Pregled" },
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
