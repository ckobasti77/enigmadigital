"use client";

import { usePrecica } from "@/components/app/use-precica";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { stilProjekta } from "@/lib/boja-projekta";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./app-sidebar";
import { JaLink } from "./ja-link";
import { MeniJa } from "./meni-ja";
import { MobileNav, VISE_EVENT } from "./mobile-nav";
import { OpsegProvider } from "./opseg-ljuske";
import { useJaNalog } from "./podaci-ljuske";
import { PripremaRadnogDela } from "./prostor/priprema-radnog-dela";
import { VezaTraka } from "./prostor/zajednicko/veza-traka";
import { ProjekatZnak } from "./projekat-znak";
import { TrakaProjekata } from "./traka-projekata";
import { CommandPalette } from "./command-palette";
import { PageTransition } from "./page-transition";
import { SectionNav } from "./section-nav";
import { SyncStatus } from "./sync-status";
import { NotificationsBell } from "./notifications-bell";
import { DateRangePicker } from "./date-range-picker";
import { UserMenu } from "./user-menu";
import { useNapredakFeedback } from "./napredak/napredak-feedback";
import { NapredakIzvor } from "./napredak/napredak-izvor";
import { Toaster } from "./toaster";
import { CuvarNapustanjaProvider } from "./prostor/cuvar-napustanja";
import { DokumentiProvider } from "./prostor/dokumenti/dokumenti-kontekst";
import { ShortcutProvider } from "./prostor/precice/precice-provider";
import { ProjekatLink } from "./projekat-link";
import {
  useEkranPutanja,
  useModulUkljucen,
  useProjekat,
  useProjekatOpciono,
} from "./projekat-provider";
import {
  COMMAND_EVENT,
  RAIL_EVENT,
  channelTabsFor,
  resolveModule,
  resolveScreen,
  type ModuleKey,
  type Opseg,
} from "./nav-items";

gsap.registerPlugin(useGSAP);

/**
 * Šina ikonica: izbor se pamti na ovom uređaju. Čitanje i pisanje moraju da
 * prežive privatni prozor i izuzetak — pamćenje je pogodnost, ne uslov.
 */
const RAIL_KEY = "enigma:nav:rail";

/**
 * Bez sačuvanog izbora meni je u šini na `md`–`lg` (SPAJANJE, plan S07 D12):
 * pored trake projekata od 72 px puna širina menija bi sadržaju ostavila
 * premalo mesta.
 */
const USKO = "(max-width: 1023px)";

export function readRail(): boolean {
  try {
    const sacuvano = window.localStorage.getItem(RAIL_KEY);
    if (sacuvano !== null) return sacuvano === "1";
    return window.matchMedia(USKO).matches;
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

/**
 * Ljuska ekrana. Prijavu proverava `AuthGate` iznad nje (layout `app/(app)`),
 * pa se ljuska montira tek uz potvrđenu sesiju.
 *
 * Dva opsega (SPAJANJE P14, plan S07 §2.4): `projekat` (ispod
 * `ProjekatProvider`-a, layout `[projekat]`) i `ja` (lični nivo bez projekta,
 * layout `(ja)`). U oba su traka projekata levo (u hubu), meni pored nje
 * (meni „Ja“ ili meni projekta), gornja traka, donja traka na telefonu, ⌘K i
 * Napredak. Samo projekat ima čuvar modula, traku u boji projekta i pripremu
 * radnog dela.
 */
export function AppShell({
  opseg = "projekat",
  children,
}: {
  opseg?: Opseg;
  children: React.ReactNode;
}) {
  const ekran = useEkranPutanja();
  // Boja mesta (UI Boost §3.4). Na koloni sadržaja atribut je u stablu, pa je
  // tačan od prvog kadra; na `<html>` ga upisuje efekat, da ga naslede i
  // portali (dijalog, popover, meni), koji se crtaju van te kolone. „Ja“ nosi
  // boju Kontrolne table (D5).
  const modul = opseg === "ja" ? "tabla" : resolveModule(ekran);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.module = modul;
    return () => {
      delete root.dataset.module;
    };
  }, [modul]);

  return (
    <OpsegProvider opseg={opseg}>
      <ShellFrame modul={modul} opseg={opseg}>
        {children}
      </ShellFrame>
    </OpsegProvider>
  );
}

/**
 * Prava ljuska. Montira se tek pod `<Authenticated>` iz `AuthGate`-a (klijent,
 * posle hidratacije), pa je čitanje `localStorage`-a u inicijalizatoru
 * bezbedno i traka je u izabranom obliku od prvog kadra.
 *
 * Slojevi (jedna skala, ništa između): gornja traka 30 · bočna i donja traka
 * 40 · sve što se otvara preko strane (dijalog, list, meni, oblačić) 50.
 */
function ShellFrame({
  modul,
  opseg,
  children,
}: {
  modul: ModuleKey;
  opseg: Opseg;
  children: React.ReactNode;
}) {
  // Panel domen (zaključan na jedan projekat) nema traku projekata (D4); njenu
  // širinu gasi `data-traka="ne"` iz layout-a `(app)`.
  const panel = useProjekatOpciono()?.rezim === "panel";
  const [rail, setRail] = useState(readRail);
  const sidebarRef = useRef<HTMLElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  // Uvlaka kolone pri prethodnom crtanju: razlika je put koji sadržaj pređe.
  const lastInset = useRef<number | null>(null);

  const toggleRail = useCallback(() => setRail((prev) => !prev), []);
  // +XP, završena misija, nov nivo i dostignuće — iz promene `napredak.stanje`.
  const nagrade = useNapredakFeedback();

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
    // Radni deo (SPAJANJE S08): prečice (bez globalnog `?` do S24), čuvar
    // nesačuvanog teksta i jedan Toaster za celu ljusku.
    <ShortcutProvider>
    <CuvarNapustanjaProvider>
    <OkvirDokumenata aktivan={opseg === "projekat"}>
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
      {!panel && <TrakaProjekata />}
      {opseg === "ja" ? (
        <MeniJa ref={sidebarRef} rail={rail} onToggleRail={toggleRail} />
      ) : (
        <AppSidebar ref={sidebarRef} rail={rail} onToggleRail={toggleRail} />
      )}
      {opseg === "projekat" && <TrakaProjekta />}
      {opseg === "projekat" && <PripremaRadnogDela />}
      <VezaTraka />
      <div
        ref={columnRef}
        data-module={modul}
        className="aurora-top flex min-w-0 min-h-full flex-1 flex-col md:pl-[calc(var(--traka-width)_+_var(--sidebar-width))]"
      >
        <Header rail={rail} opseg={opseg} panel={panel} />
        <main
          id="sadrzaj"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-[var(--content-max)] flex-1 flex-col px-[var(--gutter)] py-8 pb-24 outline-none md:pb-8"
        >
          {opseg === "projekat" ? (
            <ModulCuvar modul={modul}>
              <PageTransition>{children}</PageTransition>
            </ModulCuvar>
          ) : (
            <PageTransition>{children}</PageTransition>
          )}
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
      {/* Jedina pretplata na napredak, iza granice greške: kartica igrača, ⌘K
          i nagrade čitaju ono što ona upiše, pa ih pad upita ne obara. */}
      <NapredakIzvor />
      {nagrade}
      <Toaster />
    </OkvirDokumenata>
    </CuvarNapustanjaProvider>
    </ShortcutProvider>
  );
}

/**
 * Dokumenti projekta (SPAJANJE S10): stablo oblasti u meniju i ekrani oblasti
 * i stranice dele projekat sa oblastima i dijaloge „Nova stranica“ i „Nova
 * oblast“. Samo u opsegu projekta; „Ja“ ih nema.
 */
function OkvirDokumenata({ aktivan, children }: { aktivan: boolean; children: React.ReactNode }) {
  return aktivan ? <DokumentiProvider>{children}</DokumentiProvider> : <>{children}</>;
}

/**
 * Ekran modula koji je isključen u ovom projektu se ne crta: ruta vodi na
 * kontrolnu tablu (PROJEKTI-PLAN §8, „Moduli“). Odluka čeka potvrđen
 * projekat, da stara adresa ne skoči pre nego što su moduli poznati.
 */
function ModulCuvar({
  modul,
  children,
}: {
  modul: ModuleKey;
  children: React.ReactNode;
}) {
  const { spreman, prefiks } = useProjekat();
  const ukljucen = useModulUkljucen();
  const router = useRouter();
  const iskljucen = spreman && !ukljucen(modul);
  useEffect(() => {
    if (iskljucen) router.replace(prefiks || "/");
  }, [iskljucen, prefiks, router]);
  return iskljucen ? null : <>{children}</>;
}

/**
 * Traka od 2 px preko cele širine, u boji projekta (peta uloga boje,
 * identitet): čiji je ovo ekran, i kad je bočna traka skupljena ili je nema.
 * Crta se tek kad je projekat potvrđen, da ne trepne podrazumevanom bojom.
 */
function TrakaProjekta() {
  const { spreman, brend } = useProjekat();
  if (!spreman) return null;
  return (
    <div
      aria-hidden
      data-projekat=""
      style={stilProjekta(brend.boja)}
      className="pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5 bg-projekat"
    />
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

function Header({
  rail,
  opseg,
  panel,
}: {
  rail: boolean;
  opseg: Opseg;
  panel: boolean;
}) {
  const ekran = useEkranPutanja();
  const screen = resolveScreen(ekran, opseg);
  const allTabs = opseg === "projekat" ? channelTabsFor(ekran) : undefined;
  // Jedan jedini podekran nije izbor, pa mu ne treba traka.
  const tabs = allTabs && allTabs.length > 1 ? allTabs : undefined;

  return (
    <header className="material edge-fade-b sticky top-0 z-30 flex shrink-0 flex-col">
      <div className={cn(ROW, "flex h-[var(--chrome-height)] items-center gap-3")}>
        {/* Na telefonu nema trake ni menija: znak opsega (projekat ili ja)
            otvara list „Više“ sa projektima (P15). */}
        <ZnakOpsega opseg={opseg} panel={panel} className="md:hidden" />
        <Breadcrumb screen={screen} opseg={opseg} />

        <div className="flex shrink-0 items-center gap-2">
          {screen?.range && (
            // useSearchParams traži Suspense granicu na statičkim rutama;
            // ljuska je iznad stranice, pa granica mora da stoji ovde.
            <Suspense fallback={<Skeleton className="hidden h-8 w-40 md:block" />}>
              <DateRangePicker compact className="hidden md:flex" />
            </Suspense>
          )}
          {/* Telefon: isti izbor kao jedno dugme („28 d ▾“), pa traka
              ostaje u jednom redu; mrvica se skraćuje pre nego što se lomi. */}
          {screen?.range && (
            <Suspense fallback={<Skeleton className="h-8 w-16 md:hidden" />}>
              <DateRangePicker variant="meni" className="md:hidden" />
            </Suspense>
          )}
          <CommandTrigger />
          {/* Zvono „Čeka te“ stoji na SVAKOM ekranu. U hubu je u zaglavlju i
              na telefonu (P15); u panelu je na telefonu ćelija donje trake,
              pod palcem, kao pre spajanja (D4). */}
          <NotificationsBell className={panel ? "hidden md:inline-flex" : undefined} />
          {opseg === "projekat" && <SyncStatus className="hidden sm:inline-flex" />}
          {/* Meni korisnika je na dnu trake projekata; ovde samo gde trake
              nema: na telefonu i u panelu (D11). */}
          <UserMenu className={panel ? undefined : "md:hidden"} />
        </div>
      </div>

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
function Breadcrumb({
  screen,
  opseg,
}: {
  screen: ReturnType<typeof resolveScreen>;
  opseg: Opseg;
}) {
  // „Ja“ nema prefiks projekta, pa roditelj ide kroz `JaLink`.
  const Veza = opseg === "ja" ? JaLink : ProjekatLink;
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
              <Veza
                href={screen.parent.href}
                className="text-text-muted transition-colors hover:text-foreground"
              >
                {screen.parent.label}
              </Veza>
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

/**
 * Znak opsega u zaglavlju na telefonu (SPAJANJE P15, plan S07 §2.2): znak
 * tekućeg projekta, a u „Ja“ moj avatar. Dodir otvara list „Više“ na
 * spisku projekata. U panelu (jedan projekat, bez prelaska) je samo znak.
 */
function ZnakOpsega({
  opseg,
  panel,
  className,
}: {
  opseg: Opseg;
  panel: boolean;
  className?: string;
}) {
  const projekat = useProjekatOpciono();
  const nalog = useJaNalog();
  const znak =
    opseg === "projekat" ? (
      projekat?.spreman && projekat.ime !== null ? (
        <ProjekatZnak
          projekat={{ ime: projekat.ime, boja: projekat.brend.boja, logoUrl: projekat.brend.logoUrl }}
          velicina="md"
          oznaka={panel}
        />
      ) : (
        <Skeleton className="size-7 rounded-md" />
      )
    ) : nalog === undefined ? (
      <Skeleton className="size-7 rounded-full" />
    ) : (
      <Avatar size="sm" className="size-7">
        {nalog.avatarUrl && <AvatarImage src={nalog.avatarUrl} alt="" />}
        <AvatarFallback>{nalog.inicijali}</AvatarFallback>
      </Avatar>
    );

  if (panel) return <span className={cn("flex shrink-0 items-center", className)}>{znak}</span>;

  const ime = opseg === "projekat" ? (projekat?.ime ?? "Projekat") : "Ja";
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(VISE_EVENT, { detail: "projekti" }))}
      aria-label={`${ime}: projekti i svi ekrani`}
      className={cn(
        "-ml-1.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors active:bg-surface-raised",
        className,
      )}
    >
      {znak}
    </button>
  );
}

/** Otvara komandnu paletu klikom — parnjak globalnoj prečici (Ctrl K / Cmd K). */
function CommandTrigger() {
  const precica = usePrecica("K");
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(COMMAND_EVENT))}
      aria-label="Komandna paleta"
      title={`Komandna paleta (${precica})`}
      className="hover-lift inline-flex size-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent text-text-muted transition-colors hover:text-foreground md:h-8 md:w-auto md:border-line md:px-2.5"
    >
      <Search className="size-5 md:size-4" />
      <kbd className="hidden font-sans text-micro font-medium lg:inline">
        {precica}
      </kbd>
    </button>
  );
}
