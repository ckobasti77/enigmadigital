"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ChevronRight } from "lucide-react";
import { DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  activeChannelTab,
  activeHref,
  navChildrenFor,
  navSections,
  type ChannelTab,
  type NavItem,
} from "./nav-items";
import { useWorkspace } from "./workspace-provider";
import { Skeleton } from "@/components/ui/skeleton";

/** Sekcije koje je operater ručno otvorio pamte se između učitavanja. */
const OPEN_KEY = "enigma:nav:open";

/** Mora da preživi privatni prozor i izuzetak — bez sačuvane vrednosti vrati prazno. */
function readOpen(): string[] {
  try {
    const raw = window.localStorage.getItem(OPEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeOpen(hrefs: string[]) {
  try {
    window.localStorage.setItem(OPEN_KEY, JSON.stringify(hrefs));
  } catch {
    // Pamćenje otvorenih sekcija je pogodnost, ne uslov — tiho odustani.
  }
}

export function AppSidebar() {
  const pathname = usePathname();
  // Najduže poklapanje bira roditelja: „/instagram/objave/<id>" pada na
  // „/instagram", nikad bez oznake.
  const activeParent = activeHref(pathname);

  // Ručno otvorene sekcije. Sidebar se montira tek pod <Authenticated> (klijent,
  // posle hidratacije), pa je čitanje localStorage-a u inicijalizatoru bezbedno
  // i sekcije su otvorene od prvog frejma, bez skoka.
  const [manualOpen, setManualOpen] = useState<Set<string>>(
    () => new Set(readOpen()),
  );

  const persist = useCallback((next: Set<string>) => {
    writeOpen([...next]);
    return next;
  }, []);

  // Sevron: slobodan toggle.
  const toggle = useCallback(
    (href: string) => {
      setManualOpen((prev) => {
        const next = new Set(prev);
        if (next.has(href)) next.delete(href);
        else next.add(href);
        return persist(next);
      });
    },
    [persist],
  );

  // Klik na natpis roditelja: samo obezbedi da je otvoreno, nikad ne zatvaraj.
  const ensureOpen = useCallback(
    (href: string) => {
      setManualOpen((prev) => {
        if (prev.has(href)) return prev;
        return persist(new Set(prev).add(href));
      });
    },
    [persist],
  );

  return (
    <aside className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] flex-col md:flex">
      <div className="flex h-[var(--chrome-height)] shrink-0 items-center px-5">
        <span className="heading-caps text-micro font-medium text-accent-400">
          Enigma
        </span>
        <span className="heading-caps ml-1.5 text-micro font-medium text-text-muted">
          / Command
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <nav aria-label="Glavna navigacija">
          {navSections.map((section) => (
            <div key={section.title} className="mt-5 first:mt-2">
              <p className="heading-caps px-3 pb-1.5 text-micro font-medium text-text-muted">
                {section.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const children = navChildrenFor(item.href);
                  return children ? (
                    <NavGroup
                      key={item.href}
                      item={item}
                      tabs={children}
                      pathname={pathname}
                      activeParent={activeParent}
                      open={
                        manualOpen.has(item.href) || activeParent === item.href
                      }
                      onToggle={() => toggle(item.href)}
                      onNavigate={() => ensureOpen(item.href)}
                    />
                  ) : (
                    <NavLeaf
                      key={item.href}
                      item={item}
                      active={activeParent === item.href}
                    />
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <WorkspaceFooter />
    </aside>
  );
}

/**
 * Cijan kičma uz levu ivicu aktivnog LISTA — naslednica putujućeg „rail"-a iz
 * jednonivoske trake. Po-stavci, ne jedna putujuća: ugnježdena harmonika menja
 * `offsetTop` svih stavki ispod pri svakom širenju, pa bi merena pozicija bila
 * u letu; ova traka se ne meri i preživi reflow besplatno.
 */
function ActiveBar() {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent-400"
    />
  );
}

/** Stavka bez podstranica: nema sevrona, ponaša se kao i do sada. Ona je list. */
function NavLeaf({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg py-2 pl-4 pr-3 text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-accent text-foreground"
            : "text-text-muted hover:bg-sidebar-accent/50 hover:text-foreground",
        )}
      >
        {active && <ActiveBar />}
        <Icon
          className={cn(
            "size-4 shrink-0",
            active
              ? "text-accent-400"
              : "text-text-muted group-hover:text-foreground",
          )}
        />
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}

/**
 * Proširiva stavka: roditelj je I LINK I PREKIDAČ. Natpis navigira na pregled
 * kanala i širi podstavke; sevron širi/skuplja bez navigacije. Podstavke se
 * izvode iz `channelTabs` (jedan spisak ostaje jedan).
 */
function NavGroup({
  item,
  tabs,
  pathname,
  activeParent,
  open,
  onToggle,
  onNavigate,
}: {
  item: NavItem;
  tabs: readonly ChannelTab[];
  pathname: string;
  activeParent: string | undefined;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const parentActive = activeParent === item.href;
  const activeChild = parentActive
    ? activeChannelTab(pathname, tabs)
    : undefined;

  const rootRef = useRef<HTMLLIElement>(null);
  const ulRef = useRef<HTMLUListElement>(null);
  const chevronRef = useRef<SVGSVGElement>(null);
  // Prvi commit: nameštanje stanja od prvog frejma, ne pokret.
  const firstRun = useRef(true);
  const prevOpen = useRef(open);

  const slug = item.href.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "root";
  const listId = `nav-${slug}`;
  const labelId = `${listId}-label`;

  // Susedni tabovi sa istim `group` čine jedan klaster (Analitika:
  // Svakodnevno/Detaljno). Kada nijedan nema grupu — ravna lista.
  const groups: { name?: string; tabs: ChannelTab[] }[] = [];
  for (const tab of tabs) {
    const last = groups[groups.length - 1];
    if (last && last.name === tab.group) last.tabs.push(tab);
    else groups.push({ name: tab.group, tabs: [tab] });
  }
  const showGroups = groups.length > 1 && groups.some((g) => g.name);

  useGSAP(
    () => {
      const ul = ulRef.current;
      if (!ul) return;
      const changed = prevOpen.current !== open;
      prevOpen.current = open;
      // Instant kad se ništa nije promenilo ili na prvom prikazu: sekcija sa
      // aktivnom rutom je otvorena od prvog frejma, bez animacije otvaranja.
      const instant = firstRun.current || !changed;
      firstRun.current = false;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const still = Boolean(ctx.conditions?.still);
        const snap = instant || still;

        if (chevronRef.current) {
          const rotate = open ? 90 : 0;
          if (snap) gsap.set(chevronRef.current, { rotate });
          else
            gsap.to(chevronRef.current, {
              rotate,
              duration: DUR_UI,
              ease: EASE_UI,
              overwrite: "auto",
            });
        }

        if (open) {
          ul.hidden = false;
          if (snap) {
            gsap.set(ul, { height: "auto", opacity: 1, overflow: "visible" });
          } else {
            gsap.set(ul, { overflow: "hidden" });
            gsap.fromTo(
              ul,
              { height: 0, opacity: 0 },
              {
                height: "auto",
                opacity: 1,
                duration: DUR_UI,
                ease: EASE_UI,
                overwrite: "auto",
                // Auto visina posle širenja: ugnježdene promene i resize rade.
                onComplete: () =>
                  gsap.set(ul, { height: "auto", overflow: "visible" }),
              },
            );
          }
        } else if (snap) {
          gsap.set(ul, { height: 0, opacity: 0, overflow: "hidden" });
          // `hidden` sklanja podstavke zatvorene sekcije iz tab-reda.
          ul.hidden = true;
        } else {
          gsap.set(ul, { overflow: "hidden" });
          gsap.to(ul, {
            height: 0,
            opacity: 0,
            duration: DUR_UI,
            ease: EASE_UI,
            overwrite: "auto",
            onComplete: () => {
              ul.hidden = true;
            },
          });
        }
      });
    },
    { dependencies: [open], scope: rootRef },
  );

  const renderChild = (tab: ChannelTab) => {
    const selected = tab.href === activeChild;
    return (
      <li key={tab.href}>
        <Link
          href={tab.href}
          aria-current={selected ? "page" : undefined}
          className={cn(
            // Uvučeno pod natpis roditelja (pl-11 = pl-4 + ikona + gap); bez
            // ikone na drugom nivou, samo tekst. `text-secondary` drži kontrast
            // ≥ 4.5:1 iako je uvučeno.
            "group relative flex items-center rounded-lg py-1.5 pl-11 pr-3 text-sm transition-colors",
            selected
              ? "font-medium text-foreground"
              : "text-text-secondary hover:bg-sidebar-accent/50 hover:text-foreground",
          )}
        >
          {selected && <ActiveBar />}
          <span className="truncate">{tab.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <li ref={rootRef}>
      <div
        className={cn(
          "group relative flex items-center rounded-lg transition-colors",
          parentActive
            ? "text-foreground"
            : "text-text-muted hover:bg-sidebar-accent/50 hover:text-foreground",
        )}
      >
        <Link
          href={item.href}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-sm font-medium"
        >
          <Icon
            className={cn(
              "size-4 shrink-0",
              parentActive
                ? "text-accent-400"
                : "text-text-muted group-hover:text-foreground",
            )}
          />
          <span id={labelId} className="truncate">
            {item.label}
          </span>
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`${open ? "Skupi" : "Proširi"} ${item.label}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-foreground"
        >
          <ChevronRight ref={chevronRef} className="size-4" aria-hidden />
        </button>
      </div>

      <ul
        ref={ulRef}
        id={listId}
        aria-labelledby={labelId}
        className="flex flex-col gap-0.5 overflow-hidden"
      >
        {showGroups
          ? groups.flatMap((group, gi) => [
              group.name ? (
                <li key={`g-${gi}`}>
                  <p className="heading-caps px-3 pl-11 pb-1 pt-2 text-micro text-text-muted">
                    {group.name}
                  </p>
                </li>
              ) : null,
              ...group.tabs.map(renderChild),
            ])
          : tabs.map(renderChild)}
      </ul>
    </li>
  );
}

/** Čiji su ovo podaci — stoji uz navigaciju, ne uz stanje ekrana. */
function WorkspaceFooter() {
  const { workspace, user, isLoading } = useWorkspace();

  return (
    <div className="material-edge-t shrink-0 px-5 py-3">
      {isLoading ? (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      ) : (
        <>
          <p className="truncate text-sm font-medium text-foreground">
            {workspace?.name ?? "Radni prostor"}
          </p>
          <p className="truncate text-micro text-text-muted">
            {user?.email ?? "—"}
          </p>
        </>
      )}
    </div>
  );
}
