"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";
import { PageTransition } from "./page-transition";
import { SectionNav } from "./section-nav";
import { SyncStatus } from "./sync-status";
import { NotificationsBell } from "./notifications-bell";
import { DateRangePicker } from "./date-range-picker";
import { UserMenu } from "./user-menu";
import {
  COMMAND_EVENT,
  RAIL_EVENT,
  channelTabsFor,
  resolveModule,
  resolveScreen,
  type ModuleKey,
} from "./nav-items";
import { WorkspaceProvider } from "./workspace-provider";

gsap.registerPlugin(useGSAP);

/**
 * Parks an incoming Instagram OAuth code from the URL into localStorage so it
 * survives a login round-trip (the Settings page consumes and removes it).
 * Mounted OUTSIDE <Authenticated> on purpose: it must run even when the
 * session is missing, which is exactly when the code would otherwise be lost.
 */
function OAuthCodeCatcher() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ig_code") || params.get("code");
    if (!code) return;
    try {
      window.localStorage.setItem(
        "ig_oauth_code",
        JSON.stringify({ code, ts: Date.now() }),
      );
    } catch {
      // storage unavailable — nothing we can do
    }
  }, []);
  return null;
}

/** When the session is confirmed missing, send the user to login. */
function RedirectToLogin() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login");
  }, [router]);
  return <ShellFallback />;
}

/**
 * Šina ikonica: izbor se pamti na ovom uređaju. Čitanje i pisanje moraju da
 * prežive privatni prozor i izuzetak — pamćenje je pogodnost, ne uslov.
 */
const RAIL_KEY = "enigma:nav:rail";

function readRail(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}

function writeRail(rail: boolean) {
  // `--sidebar-width` čita ovaj atribut (globals.css), pa je širina nova pre
  // nego što React iscrta sledeći kadar i pre nego što je pokret izmeri.
  if (rail) document.documentElement.dataset.sidebar = "rail";
  else delete document.documentElement.dataset.sidebar;
  try {
    window.localStorage.setItem(RAIL_KEY, rail ? "1" : "0");
  } catch {
    // tiho odustani
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Boja mesta (UI Boost §3.4). Na koloni sadržaja atribut je u stablu, pa je
  // tačan od prvog kadra; na `<html>` ga upisuje efekat, da ga naslede i
  // portali (dijalog, popover, meni), koji se crtaju van te kolone.
  const modul = resolveModule(pathname);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.module = modul;
    return () => {
      delete root.dataset.module;
    };
  }, [modul]);

  // Širina bočne trake se zna pre sesije, pa i zamena ljuske (dok se sesija
  // proverava) već stoji u izabranom obliku — bez skoka kad stigne prava.
  useEffect(() => {
    const root = document.documentElement;
    if (readRail()) root.dataset.sidebar = "rail";
    return () => {
      delete root.dataset.sidebar;
    };
  }, []);

  return (
    <>
      <OAuthCodeCatcher />

      {/* No flash: the shell only mounts once the auth token is confirmed. */}
      <AuthLoading>
        <ShellFallback />
      </AuthLoading>

      <Unauthenticated>
        <RedirectToLogin />
      </Unauthenticated>

      <Authenticated>
        <WorkspaceProvider>
          <ShellFrame modul={modul}>{children}</ShellFrame>
        </WorkspaceProvider>
      </Authenticated>
    </>
  );
}

/**
 * Prava ljuska. Montira se tek pod `<Authenticated>` (klijent, posle
 * hidratacije), pa je čitanje `localStorage`-a u inicijalizatoru bezbedno i
 * traka je u izabranom obliku od prvog kadra.
 *
 * Slojevi (jedna skala, ništa između): gornja traka 30 · bočna i donja traka
 * 40 · sve što se otvara preko strane (dijalog, list, meni, oblačić) 50.
 */
function ShellFrame({
  modul,
  children,
}: {
  modul: ModuleKey;
  children: React.ReactNode;
}) {
  const [rail, setRail] = useState(readRail);
  const sidebarRef = useRef<HTMLElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  // Uvlaka kolone pri prethodnom crtanju: razlika je put koji sadržaj pređe.
  const lastInset = useRef<number | null>(null);

  const toggleRail = useCallback(() => setRail((prev) => !prev), []);

  // Pre pokreta ispod (isti redosled efekata): kada pokret izmeri kolonu,
  // nova širina trake je već na snazi.
  useLayoutEffect(() => {
    writeRail(rail);
  }, [rail]);

  // Prekidač šine sa tastature ide kroz ⌘K, koji šalje ovaj događaj.
  useEffect(() => {
    window.addEventListener(RAIL_EVENT, toggleRail);
    return () => window.removeEventListener(RAIL_EVENT, toggleRail);
  }, [toggleRail]);

  // Skupljanje i širenje trake. Širina se menja odjednom (jedan reflow, a ne
  // jedan po kadru — grafikoni se ne mere jedanaest puta), a oko vidi pokret:
  // sadržaj doklizi sa starog mesta na novo, natpisi u traci uđu za njim.
  // Samo `transform` i `opacity`; pod reduced-motion samo neprozirnost natpisa.
  useGSAP(
    () => {
      const column = columnRef.current;
      const sidebar = sidebarRef.current;
      if (!column) return;

      const inset = parseFloat(getComputedStyle(column).paddingLeft) || 0;
      const shift = lastInset.current === null ? 0 : lastInset.current - inset;
      lastInset.current = inset;
      // Prvo crtanje ili telefon (traka ne postoji): nema šta da se pomeri.
      if (shift === 0) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        // Natpisi ulaze samo kad se traka širi; pri skupljanju ih više nema.
        const labels =
          shift < 0 && sidebar
            ? gsap.utils.toArray<HTMLElement>("[data-nav-fade]", sidebar)
            : [];

        if (ctx.conditions?.still) {
          if (labels.length > 0) {
            gsap.fromTo(
              labels,
              { opacity: 0 },
              {
                opacity: 1,
                duration: DUR_REDUCED,
                ease: "none",
                overwrite: "auto",
                clearProps: "opacity",
              },
            );
          }
          return;
        }

        const content = gsap.utils.toArray<HTMLElement>(
          ":scope > header, :scope > main",
          column,
        );
        // Dok sadržaj klizi sa desne strane, kolona ga odseca — inače bi strana
        // na tren dobila vodoravni klizač.
        gsap.set(column, { overflowX: "clip" });

        const tl = gsap.timeline({
          defaults: { duration: DUR_UI, ease: EASE_UI, overwrite: "auto" },
          onComplete: () => {
            // Zaostala transformacija bi zarobila svaki `position: fixed`
            // element ispod sebe (fioke, pregledi).
            gsap.set(content, { clearProps: "transform" });
            gsap.set(column, { clearProps: "overflowX" });
            if (labels.length > 0) {
              gsap.set(labels, { clearProps: "opacity,transform" });
            }
          },
        });
        tl.fromTo(content, { x: shift }, { x: 0 }, 0);
        if (labels.length > 0) {
          tl.fromTo(labels, { opacity: 0, x: -6 }, { opacity: 1, x: 0 }, 0);
        }
      });

      // Sledeći klik kreće od čistog stanja, a ne preko tvina u letu.
      return () => mm.revert();
    },
    { dependencies: [rail] },
  );

  return (
    <>
      {/* The sidebar and header are fixed/sticky chrome, so the column is
          inset by the sidebar width rather than sharing a flex row. */}
      {/* Prvi Tab na strani: četrnaest veza navigacije stoji između tastature
          i sadržaja. Vidi se tek kad dobije fokus. */}
      <a
        href="#sadrzaj"
        className="sr-only rounded-lg bg-surface-raised px-3 py-2 text-ui font-medium text-foreground shadow-elev-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
      >
        Preskoči na sadržaj
      </a>
      <AppSidebar ref={sidebarRef} rail={rail} onToggleRail={toggleRail} />
      <div
        ref={columnRef}
        data-module={modul}
        className="aurora-top flex min-w-0 min-h-full flex-1 flex-col md:pl-[var(--sidebar-width)]"
      >
        <Header rail={rail} />
        <main
          id="sadrzaj"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-[var(--content-max)] flex-1 flex-col px-[var(--gutter)] py-8 pb-24 outline-none md:pb-8"
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
    </>
  );
}

/**
 * Gornja traka (UI Boost §7.2): gde sam (mrvica sa tačkom modula), nad kojim
 * periodom gledam, ⌘K, šta me čeka, koliko su brojevi sveži, i moj nalog.
 * Sadržaj klizi ispod nje, a granicu nosi gradijentna maska iz D1 — ne linija
 * od jednog piksela.
 */
/**
 * Red gornje trake drži istu širinu i iste ivice kao sadržaj ispod njega. Bez
 * toga se na širem prikazu (i čim se bočna traka skupi u šinu) mrvica i
 * kontrole razmaknu do ivica prozora, a sadržaj ostane u sredini.
 */
const ROW = "mx-auto w-full max-w-[var(--content-max)] px-[var(--gutter)]";

function Header({ rail }: { rail: boolean }) {
  const pathname = usePathname();
  const screen = resolveScreen(pathname);
  const allTabs = channelTabsFor(pathname);
  // Jedan jedini podekran nije izbor, pa mu ne treba traka.
  const tabs = allTabs && allTabs.length > 1 ? allTabs : undefined;

  return (
    <header className="material edge-fade-b sticky top-0 z-30 flex shrink-0 flex-col">
      <div className={cn(ROW, "flex h-[var(--chrome-height)] items-center gap-3")}>
        <Breadcrumb screen={screen} />

        <div className="flex shrink-0 items-center gap-2">
          {screen?.range && (
            // useSearchParams traži Suspense granicu na statičkim rutama;
            // ljuska je iznad stranice, pa granica mora da stoji ovde.
            <Suspense fallback={<Skeleton className="hidden h-8 w-40 md:block" />}>
              <DateRangePicker compact className="hidden md:flex" />
            </Suspense>
          )}
          <CommandTrigger />
          {/* Zvono stoji na SVAKOM ekranu: ovde na širem, a na telefonu kao
              ćelija „Danas" u donjoj traci, pod palcem. */}
          <NotificationsBell className="hidden md:inline-flex" />
          <SyncStatus className="hidden sm:inline-flex" />
          <UserMenu />
        </div>
      </div>

      {/* Na telefonu naslov i birač perioda ne staju u isti red, pa birač
          dobija svoj — i dalje u ljusci, i dalje isti izbor. */}
      {screen?.range && (
        <div className={cn(ROW, "material-edge-t py-2 md:hidden")}>
          <Suspense fallback={<Skeleton className="h-8 w-56" />}>
            {/* Svoj red — ima mesta, pa razrešen opseg (imenilac) uvek stoji. */}
            <DateRangePicker />
          </Suspense>
        </div>
      )}

      {/* Druga ravan navigacije. Na širem ekranu je u bočnoj traci (podstavke
          aktivnog modula), pa ovde stoji na telefonu — i kada je traka
          skupljena u šinu, jer tada podstavki tamo nema. Živi u ljusci, ne u
          telu strane, da ostane zakačena i ne bledi ponovo pri prelasku
          između podekrana. */}
      {tabs && (
        <div className={cn(ROW, !rail && "md:hidden")}>
          <SectionNav tabs={tabs} />
        </div>
      )}
    </header>
  );
}

/**
 * Mrvica: tačka u boji modula, modul, pa podekran. Uvek tim redom — na
 * ekranu koji je sam stavka navigacije stoji samo modul.
 */
function Breadcrumb({ screen }: { screen: ReturnType<typeof resolveScreen> }) {
  return (
    <nav
      aria-label="Putanja"
      className="flex min-w-0 flex-1 items-center gap-2.5"
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-mod" />
      {screen ? (
        <ol className="flex min-w-0 items-baseline gap-1.5 text-sm">
          {screen.parent && (
            <li className="hidden shrink-0 items-baseline gap-1.5 sm:flex">
              <Link
                href={screen.parent.href}
                className="text-text-muted transition-colors hover:text-foreground"
              >
                {screen.parent.label}
              </Link>
              <span aria-hidden className="text-line-strong">
                /
              </span>
            </li>
          )}
          <li
            aria-current="page"
            className="min-w-0 truncate font-medium text-foreground"
          >
            {screen.title}
          </li>
        </ol>
      ) : (
        <span className="heading-caps text-micro font-medium text-text-muted">
          Enigma
        </span>
      )}
    </nav>
  );
}

/** Otvara komandnu paletu klikom — parnjak globalnom ⌘K prečicom. */
function CommandTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(COMMAND_EVENT))}
      aria-label="Komandna paleta"
      title="Komandna paleta (⌘K)"
      className="hover-lift inline-flex size-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent text-text-muted transition-colors hover:text-foreground md:h-8 md:w-auto md:border-line md:px-2.5"
    >
      <Search className="size-5 md:size-4" />
      <kbd className="hidden font-sans text-micro font-medium lg:inline">
        ⌘K
      </kbd>
    </button>
  );
}

function ShellFallback() {
  return (
    <>
      <div className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] md:block" />
      <div className="flex min-w-0 min-h-full flex-1 flex-col md:pl-[var(--sidebar-width)]">
        <div className="material h-[var(--chrome-height)] shrink-0" />
        <div className="mx-auto flex w-full max-w-[var(--content-max)] flex-1 flex-col gap-4 px-[var(--gutter)] py-8">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-32 w-full max-w-2xl" />
        </div>
      </div>
    </>
  );
}
