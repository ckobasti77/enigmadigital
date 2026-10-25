"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowRightLeft,
  Bell,
  CornerDownLeft,
  Megaphone,
  PanelLeft,
  PhoneCall,
  Search,
  SquarePen,
  Trophy,
  Upload,
} from "lucide-react";
import {
  COMMAND_EVENT,
  NAPREDAK_HREF,
  RAIL_EVENT,
  REZIM_POZIVA_HREF,
  channelTabs,
  moduleNavItem,
  navItems,
  resolveModule,
  resolveScreen,
  type ModuleKey,
  type NavIcon,
} from "./nav-items";
import { ModuleTile } from "./module-tile";
import { useStaMeCeka } from "./use-sta-me-ceka";
import { ikonaMisije, vezaMisije } from "./napredak/napredak-ikone";
import { useNapredak } from "./napredak/use-napredak";
import { useEkranPutanja, useProjekat, useProjekatHref } from "./projekat-provider";
import { ProjektiZaPaletu, type ProjekatZaPrelazak } from "./projekat-birac";
import { ProjekatZnak } from "./projekat-znak";
import { QuietBoundary } from "./quiet-boundary";
import { fold } from "@/lib/pretraga";
import { cn } from "@/lib/utils";

type Entry = {
  /** Jedinstven ključ i DOM id — `href` nije jedinstven (zadatak i ekran mogu
   *  da dele rutu, npr. `/settings`), pa se ne sme koristiti kao ključ. */
  id: string;
  title: string;
  /** Desni natpis: modul (ekran) ili natpis radnje (zadatak, npr. „Zovi"). */
  hint: string;
  icon: NavIcon;
  /** Modul u čijoj je boji pločica; bez njega je pločica neutralna. */
  module?: ModuleKey;
  /** Kuda vodi. Stavka bez adrese radi nešto na mestu (`run`). */
  href?: string;
  run?: () => void;
  /** Desni natpis je sama radnja, pa nosi boju modula. */
  emphasis?: boolean;
  /** XP koji stavka nosi (misija dana) — zlatno, jer je nagrada. */
  xp?: number;
  /**
   * „Prebaci na <projekat>“: adresa je već puna (drugi projekat), pa ne ide
   * kroz prefiks tekućeg; uz natpis stoji znak tog projekta.
   */
  projekat?: Pick<ProjekatZaPrelazak, "ime" | "boja" | "logoUrl">;
};

type Section = { key: string; title: string; entries: Entry[] };

/**
 * Radnje koje nisu ekran nego namera. Samo ono što danas postoji: stavka
 * koja vodi na praznu stranu ne ulazi u spisak.
 */
const ACTIONS: Entry[] = [
  {
    id: `action:${REZIM_POZIVA_HREF}`,
    title: "Započni režim poziva",
    hint: "Leadovi",
    href: REZIM_POZIVA_HREF,
    icon: PhoneCall,
    module: "leadovi",
  },
  {
    id: "action:/leadovi/uvoz",
    title: "Uvezi leadove",
    hint: "Leadovi",
    href: "/leadovi/uvoz",
    icon: Upload,
    module: "leadovi",
  },
  {
    id: "action:/instagram/objavi",
    title: "Nova objava",
    hint: "Instagram",
    href: "/instagram/objavi",
    icon: SquarePen,
    module: "instagram",
  },
  {
    id: "action:/ads/nova-kampanja",
    title: "Nova kampanja",
    hint: "Oglasi",
    href: "/ads/nova-kampanja",
    icon: Megaphone,
    module: "oglasi",
  },
];

/** Bočna traka postoji tek od ove širine, pa i radnja koja je skuplja. */
const DESKTOP = "(min-width: 768px)";

const RAIL_ACTION: Entry = {
  id: "action:rail",
  title: "Skupi ili proširi bočnu traku",
  hint: "Prikaz",
  icon: PanelLeft,
  run: () => window.dispatchEvent(new CustomEvent(RAIL_EVENT)),
};

const ACTION_HREFS = new Set(ACTIONS.map((a) => a.href));

/**
 * Sve što se može otvoriti, jednom sračunato: stavke navigacije, pa podekrani.
 * Podekran nosi svoj opisni naziv iz `resolveScreen` (npr. „Publika i
 * demografija"), a desno ime modula kome pripada. Ekran koji je već među
 * radnjama („Nova objava") se ne ponavlja.
 */
const SCREENS: Entry[] = [
  ...navItems.map((item) => ({
    id: `screen:${item.href}`,
    href: item.href,
    title: item.label,
    hint: resolveScreen(item.href)?.section ?? "",
    icon: item.icon,
    module: item.module,
  })),
  // Napredak nema stavku u bočnoj traci (otvara ga kartica igrača), pa ga
  // paleta navodi sama.
  {
    id: `screen:${NAPREDAK_HREF}`,
    href: NAPREDAK_HREF,
    title: resolveScreen(NAPREDAK_HREF)?.title ?? "Napredak",
    hint: resolveScreen(NAPREDAK_HREF)?.section ?? "",
    icon: Trophy,
    module: resolveModule(NAPREDAK_HREF),
  },
  ...Object.entries(channelTabs).flatMap(([base, tabs]) =>
    tabs
      .filter((tab) => tab.href !== base && !ACTION_HREFS.has(tab.href))
      .map((tab) => {
        const screen = resolveScreen(tab.href);
        const modul = screen?.module ?? resolveModule(tab.href);
        return {
          id: `screen:${tab.href}`,
          href: tab.href,
          title: screen?.title ?? tab.label,
          hint: screen?.parent?.label ?? "",
          icon: moduleNavItem(modul)?.icon ?? Search,
          module: modul,
        };
      }),
  ),
];

/** Po adresi — za „Nedavno", koje pamti samo adrese. */
const BY_HREF = new Map<string, Entry>(
  [...SCREENS, ...ACTIONS].flatMap((e) => (e.href ? [[e.href, e]] : [])),
);

/** Nedavno otvoreni ekrani pamte se na ovom uređaju. */
const RECENT_KEY = "enigma:cmd:recent";
const RECENT_KEPT = 6;
const RECENT_SHOWN = 4;

/**
 * Bez upita paleta pokazuje samo najhitnije zadatke: sa svih devet na vrhu
 * ekrani bi ostali ispod preloma, a paleta je pre svega skok na ekran. Ostali
 * zadaci su u zvonu i izlaze čim se počne kucati.
 */
const TASKS_SHOWN = 3;

/** Mora da preživi privatni prozor i izuzetak — bez sačuvane vrednosti prazno. */
function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(RECENT_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberScreen(href: string) {
  try {
    const next = [href, ...readRecent().filter((h) => h !== href)];
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(next.slice(0, RECENT_KEPT)),
    );
  } catch {
    // Pamćenje je pogodnost, ne uslov — tiho odustani.
  }
}

/**
 * ⌘K — skok na ekran ili pravo na posao (UI Boost §7.4).
 *
 * Sekcije: **Radnje** (ono što čeka u zvonu, pa stalne radnje), **Projekti**
 * (samo u hubu: „Prebaci na <projekat>“, na isti ekran u tom projektu),
 * **Misije dana** (nezavršene, svaka vodi pravo u svoj posao), **Nedavno**
 * (poslednji otvoreni ekrani) i **Ekrani** (svi). Svaka stavka nosi pločicu u
 * boji svog modula, pa se spisak čita i po boji. Dok se kuca, „Nedavno" se
 * sklanja — isti ekran bi se inače javio dvaput.
 *
 * Građena na postojećem Dialog primitivu (fokus-zamka, Escape, scrim), bez
 * `cmdk` zavisnosti. Lista je `role="listbox"` sa grupama, unos nosi
 * `aria-activedescendant` na istaknutu stavku, pa i čitač ekrana prati izbor
 * dok se kuca.
 */
export function CommandPalette() {
  const router = useRouter();
  const pathname = useEkranPutanja();
  const ka = useProjekatHref();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [desktop, setDesktop] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const staMeCeka = useStaMeCeka();
  const napredak = useNapredak();
  const { rezim } = useProjekat();
  // Drugi projekti stižu samo dok je paleta otvorena, u hubu (vidi dole).
  const [drugiProjekti, setDrugiProjekti] = useState<ProjekatZaPrelazak[]>([]);

  const currentHref = resolveScreen(pathname)?.href;

  // Svaki otvoren ekran ulazi u „Nedavno", ne samo onaj otvoren kroz paletu.
  useEffect(() => {
    if (currentHref && BY_HREF.has(currentHref)) rememberScreen(currentHref);
  }, [currentHref]);

  // Zadaci iz zvona (A7 §4): paleta ne skače samo na ekran, nego i na posao
  // koji čeka. Svaki nosi natpis radnje („Zovi", „Sinhronizuj") desno, vodi na
  // istu adresu kao dugme u zvonu i ima pločicu modula u koji vodi.
  const tasks = useMemo<Entry[]>(
    () =>
      (staMeCeka?.zadaci ?? []).map((z) => {
        const modul = resolveModule(z.veza.split(/[?#]/)[0]);
        return {
          id: `task:${z.kljuc}`,
          href: z.veza,
          title: z.naslov,
          hint: z.radnja,
          icon: moduleNavItem(modul)?.icon ?? Bell,
          module: modul,
          emphasis: true,
        };
      }),
    [staMeCeka],
  );

  // Misije dana: samo nezavršene — završena više nije posao. Desno piše dokle
  // se stiglo i koliko nosi, a Enter vodi na istu adresu kao dugme na kartici.
  const misije = useMemo<Entry[]>(() => {
    if (!napredak?.ukljucen || !napredak.spremno) return [];
    return napredak.misije
      .filter((m) => !m.zavrsena)
      .map((m) => ({
        id: `mission:${m.kljuc}`,
        href: vezaMisije(m.kljuc, m.veza),
        title: m.naslov,
        hint: `${m.napredak} / ${m.cilj}`,
        xp: m.xp,
        icon: ikonaMisije(m.kljuc),
        module: resolveModule(m.veza.split(/[?#]/)[0]),
      }));
  }, [napredak]);

  // „Prebaci na <projekat>“: isti ekran u drugom projektu. Panel je
  // zaključan na jedan projekat, pa tamo sekcije nema.
  const projekti = useMemo<Entry[]>(
    () =>
      rezim !== "hub"
        ? []
        : drugiProjekti.map((p) => ({
            id: `projekat:${p.workspaceId}`,
            href: p.href,
            title: `Prebaci na ${p.ime}`,
            hint: "Projekat",
            icon: ArrowRightLeft,
            projekat: { ime: p.ime, boja: p.boja, logoUrl: p.logoUrl },
          })),
    [rezim, drugiProjekti],
  );

  // Svako otvaranje kreće čisto: prazan upit, prva stavka istaknuta, sveže
  // „Nedavno". Sve ide u samu radnju otvaranja, ne u efekat na `open`.
  const openPalette = useCallback(() => {
    setQuery("");
    setActive(0);
    setRecent(readRecent());
    setDesktop(window.matchMedia(DESKTOP).matches);
    setOpen(true);
  }, []);

  // Globalni ⌘K / Ctrl+K prekidač. `preventDefault` da ne okine „pretraga"
  // browsera. Radi i kad je paleta otvorena — tada je zatvara. Listener zavisi
  // od `open` da bi iz zatvaranja čitao svežu vrednost, bez ref-a.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openPalette]);

  // Otvaranje sa dugmeta u traci — telefon nema ⌘K, pa mora da postoji i klik.
  useEffect(() => {
    window.addEventListener(COMMAND_EVENT, openPalette);
    return () => window.removeEventListener(COMMAND_EVENT, openPalette);
  }, [openPalette]);

  const sections = useMemo<Section[]>(() => {
    const q = fold(query.trim());
    const match = (list: Entry[]) =>
      q ? list.filter((e) => fold(`${e.title} ${e.hint}`).includes(q)) : list;

    const recentEntries = q
      ? []
      : recent
          .filter((href) => href !== currentHref)
          .flatMap((href) => {
            const entry = BY_HREF.get(href);
            return entry ? [{ ...entry, id: `recent:${href}` }] : [];
          })
          .slice(0, RECENT_SHOWN);

    return [
      {
        key: "radnje",
        title: "Radnje",
        entries: match([
          ...(q ? tasks : tasks.slice(0, TASKS_SHOWN)),
          ...ACTIONS,
          ...(desktop ? [RAIL_ACTION] : []),
        ]),
      },
      { key: "projekti", title: "Projekti", entries: match(projekti) },
      { key: "misije", title: "Misije dana", entries: match(misije) },
      { key: "nedavno", title: "Nedavno", entries: recentEntries },
      { key: "ekrani", title: "Ekrani", entries: match(SCREENS) },
    ].filter((section) => section.entries.length > 0);
  }, [query, tasks, projekti, misije, recent, currentHref, desktop]);

  const flat = useMemo(() => sections.flatMap((s) => s.entries), [sections]);

  const choose = useCallback(
    (entry: Entry) => {
      setOpen(false);
      if (entry.run) entry.run();
      else if (entry.projekat && entry.href) router.push(entry.href);
      else if (entry.href && entry.href !== pathname) router.push(ka(entry.href));
    },
    [pathname, router, ka],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = flat[active];
      if (entry) choose(entry);
    }
  };

  // Istaknuta stavka uvek u vidnom polju liste.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {open && rezim === "hub" && (
        // Pad spiska projekata ne sme da obori paletu: sekcija tada izostane.
        <QuietBoundary>
          <ProjektiZaPaletu onProjekti={setDrugiProjekti} />
        </QuietBoundary>
      )}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-surface-overlay backdrop-blur-sm",
            "transition-opacity duration-(--duration-fast) ease-(--ease-ui)",
            "data-closed:opacity-0 data-open:opacity-100 data-starting-style:opacity-0",
          )}
        />
        <DialogPrimitive.Popup
          initialFocus={() => inputRef.current}
          aria-label="Komandna paleta"
          className={cn(
            "material-thick fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-line shadow-elev-3 outline-hidden",
            // Prelaz, ne keyframe: prekidiv je, a pod reduced-motion ostaje
            // samo neprozirnost (globalno pravilo).
            "transition-[opacity,scale] duration-(--duration-fast) ease-(--ease-ui)",
            "data-open:scale-100 data-open:opacity-100",
            "data-closed:scale-[0.98] data-closed:opacity-0",
            "data-starting-style:scale-[0.98] data-starting-style:opacity-0",
          )}
        >
          {/* F15: polje ispunjava ceo red i nosi zaobljenje vrha palete, pa
              okvir fokusa (`focus-inset`, unutra) prati ivicu palete umesto da
              ga ona odseče. Lupa leži preko polja i ne hvata klik. */}
          <div className="focus-inset relative shrink-0 border-b border-line">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0); // sužena lista: istaknuta stavka opet od vrha
              }}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded
              aria-controls="command-palette-list"
              aria-activedescendant={
                flat[active] ? `cmd-${flat[active].id}` : undefined
              }
              aria-label="Pretraga radnji i ekrana"
              placeholder="Skoči na ekran ili radnju…"
              className="h-12 w-full min-w-0 rounded-t-xl bg-transparent pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-text-muted"
            />
          </div>

          <div
            ref={listRef}
            id="command-palette-list"
            role="listbox"
            aria-label="Radnje i ekrani"
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {flat.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-text-muted">
                Nema rezultata za: {query}
              </p>
            ) : (
              sections.map((section) => (
                <div
                  key={section.key}
                  role="group"
                  aria-labelledby={`cmd-sec-${section.key}`}
                  className="pb-1 last:pb-0"
                >
                  <p
                    id={`cmd-sec-${section.key}`}
                    className="heading-caps px-2.5 pb-1 pt-2 text-micro text-text-muted"
                  >
                    {section.title}
                  </p>
                  {section.entries.map((entry) => {
                    const index = flat.indexOf(entry);
                    const isActive = index === active;
                    const Icon = entry.icon;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        id={`cmd-${entry.id}`}
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive}
                        data-module={entry.module}
                        onClick={() => choose(entry)}
                        onPointerMove={() => setActive(index)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                          isActive
                            ? "bg-surface-raised text-foreground"
                            : "text-text-secondary",
                        )}
                      >
                        {entry.module ? (
                          <ModuleTile icon={Icon} />
                        ) : (
                          <span
                            aria-hidden
                            className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-surface-raised text-text-muted ring-1 ring-line-soft"
                          >
                            <Icon className="size-4" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {entry.title}
                        </span>
                        {entry.projekat && (
                          <ProjekatZnak projekat={entry.projekat} velicina="xs" />
                        )}
                        {entry.hint && (
                          <span
                            className={cn(
                              "shrink-0 text-micro",
                              entry.emphasis ? "text-mod" : "text-text-muted",
                            )}
                          >
                            {entry.hint}
                          </span>
                        )}
                        {entry.xp !== undefined && (
                          <span className="shrink-0 font-mono text-micro font-medium text-xp tabular-nums">
                            +{entry.xp} XP
                          </span>
                        )}
                        {/* Uvek zauzima mesto, da natpis desno ne skače dok
                            izbor ide gore-dole. */}
                        <CornerDownLeft
                          aria-hidden
                          className={cn(
                            "size-3.5 shrink-0 text-text-muted",
                            !isActive && "invisible",
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="hidden shrink-0 items-center gap-4 border-t border-line px-4 py-2 text-micro text-text-muted sm:flex">
            <span className="flex items-center gap-1.5">
              <Key>↑</Key>
              <Key>↓</Key>
              izbor
            </span>
            <span className="flex items-center gap-1.5">
              <Key>Enter</Key>
              otvori
            </span>
            <span className="flex items-center gap-1.5">
              <Key>Esc</Key>
              zatvori
            </span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line-soft px-1.5 py-0.5 font-sans text-micro text-text-secondary">
      {children}
    </kbd>
  );
}
