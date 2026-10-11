"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Search, CornerDownLeft, Bell } from "lucide-react";
import {
  channelTabs,
  navItems,
  navSections,
  resolveScreen,
  type NavIcon,
} from "./nav-items";
import { useStaMeCeka } from "./use-sta-me-ceka";
import { cn } from "@/lib/utils";

type Destination = {
  /** Jedinstven ključ i DOM id — `href` nije jedinstven (zadatak i ekran mogu
   *  da dele rutu, npr. `/settings`), pa se ne sme koristiti kao ključ. */
  id: string;
  href: string;
  title: string;
  /** Desni natpis: sekcija (ekran) ili natpis radnje (zadatak, npr. „Zovi"). */
  section: string;
  icon?: NavIcon;
  /** Zadatak iz zvona (A7 §4) — crta se na vrhu, sa ikonicom zvona. */
  isTask?: boolean;
};

/** Ikonica kanala kome podekran pripada — da lista ne bude gola. */
const iconFor = (href: string): NavIcon | undefined =>
  navItems.find((i) => href === i.href || href.startsWith(`${i.href}/`))?.icon;

/**
 * Sve što se može otvoriti, jednom sračunato: 19 ekrana kao ravna lista.
 * Podekrani kanala nose svoj opisni naziv iz `resolveScreen` (npr. „Publika i
 * demografija"), ne kratki natpis sa trake.
 */
const DESTINATIONS: Destination[] = [
  ...navSections.flatMap((section) =>
    section.items.map((item) => ({
      id: `screen:${item.href}`,
      href: item.href,
      title: item.label,
      section: section.title,
      icon: item.icon,
    })),
  ),
  ...Object.entries(channelTabs).flatMap(([base, tabs]) =>
    tabs
      .filter((tab) => tab.href !== base)
      .map((tab) => {
        const screen = resolveScreen(tab.href);
        return {
          id: `screen:${tab.href}`,
          href: tab.href,
          title: screen?.title ?? tab.label,
          section: screen?.section ?? "",
          icon: iconFor(tab.href),
        };
      }),
  ),
];

/** Bez dijakritike i malim slovima — „price" nalazi „Priče". */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * ⌘K skok na bilo koji od 19 ekrana. Sa toliko ekrana traka i bočni meni
 * pamte gde je šta; paleta ne traži da pamtiš put — kucaš ime i skočiš.
 *
 * Građena na postojećem Dialog primitivu (fokus-zamka, Escape, scrim), bez
 * `cmdk` zavisnosti — ostaje unutar sistema. Lista je `role="listbox"`, unos
 * nosi `aria-activedescendant` na istaknutu stavku, pa i čitač ekrana prati
 * izbor dok se kuca.
 */
export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const staMeCeka = useStaMeCeka();

  // Zadaci iz zvona (A7 §4): paleta ne skače samo na ekran, nego i na posao
  // koji čeka. Svaki nosi natpis radnje („Zovi", „Sinhronizuj") desno i vodi
  // na istu adresu kao dugme u zvonu (`veza`). Vrh liste, ikonica zvona.
  const zadaciItems = useMemo<Destination[]>(
    () =>
      (staMeCeka?.zadaci ?? []).map((z) => ({
        id: `task:${z.kljuc}`,
        href: z.veza,
        title: z.naslov,
        section: z.radnja,
        isTask: true,
      })),
    [staMeCeka],
  );

  // Svako otvaranje kreće čisto: prazan upit, prva stavka istaknuta. Reset ide
  // u samu radnju otvaranja, ne u efekat na `open`.
  const openPalette = useCallback(() => {
    setQuery("");
    setActive(0);
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
    window.addEventListener("enigma:command", openPalette);
    return () => window.removeEventListener("enigma:command", openPalette);
  }, [openPalette]);

  const results = useMemo(() => {
    const svi = [...zadaciItems, ...DESTINATIONS];
    const q = fold(query.trim());
    if (!q) return svi;
    return svi.filter((d) => {
      const hay = fold(`${d.title} ${d.section}`);
      return hay.includes(q);
    });
  }, [query, zadaciItems]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      if (href !== pathname) router.push(href);
    },
    [pathname, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) =>
        results.length ? (a - 1 + results.length) % results.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const dest = results[active];
      if (dest) go(dest.href);
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
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-surface-overlay backdrop-blur-sm transition-opacity duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Popup
          initialFocus={() => inputRef.current}
          aria-label="Komandna paleta"
          className="material-thick fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-line shadow-elev-3 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search className="size-4 shrink-0 text-text-muted" />
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
                results[active] ? `cmd-${results[active].id}` : undefined
              }
              placeholder="Skoči na ekran ili zadatak…"
              className="h-12 w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-text-muted"
            />
            <kbd className="hidden shrink-0 rounded border border-line-soft px-1.5 py-0.5 text-micro text-text-muted sm:inline">
              ESC
            </kbd>
          </div>

          <ul
            ref={listRef}
            id="command-palette-list"
            role="listbox"
            aria-label="Ekrani"
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-text-muted">
                Nema ekrana za: {query}
              </li>
            ) : (
              results.map((dest, i) => {
                const Icon = dest.isTask ? Bell : dest.icon;
                const isActive = i === active;
                return (
                  <li key={dest.id}>
                    <button
                      type="button"
                      id={`cmd-${dest.id}`}
                      role="option"
                      aria-selected={isActive}
                      data-active={isActive}
                      onClick={() => go(dest.href)}
                      onPointerMove={() => setActive(i)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-surface-raised text-foreground"
                          : "text-text-secondary",
                      )}
                    >
                      {Icon && (
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            dest.isTask
                              ? "text-accent-400"
                              : isActive
                                ? "text-accent-400"
                                : "text-text-muted",
                          )}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {dest.title}
                      </span>
                      {dest.section && (
                        <span
                          className={cn(
                            "shrink-0 text-micro",
                            dest.isTask ? "text-accent-400" : "text-text-muted",
                          )}
                        >
                          {dest.section}
                        </span>
                      )}
                      {isActive && (
                        <CornerDownLeft className="size-3.5 shrink-0 text-text-muted" />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
