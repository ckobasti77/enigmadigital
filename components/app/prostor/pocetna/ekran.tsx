"use client";

// Preneto iz Devotion apps/web/components/workspace/command-center-view.tsx (main @ c05c40f), SPAJANJE S20.
import { Suspense, useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Lock, Plus } from "lucide-react";
import { findStartupRow, locateStartupRow, type StartupTaskSection, type WorkspaceMini } from "@/lib/prostor";

import { PageHeader } from "@/components/app/page-header";
import { CommandTop, FokusZadatak } from "@/components/app/overview/command-focus";
import { OverviewDashboard, OverviewSkeleton } from "@/components/app/overview/overview-dashboard";
import { StaMeCeka } from "@/components/app/overview/today-block";
import { useStaMeCeka } from "@/components/app/use-sta-me-ceka";
import { useProjekat } from "@/components/app/projekat-provider";
import { QuietBoundary } from "@/components/app/quiet-boundary";
import { NapredakKartica, useStanjeNapretka } from "@/components/app/prostor/danas/napredak-kartica";
import { useDokumenti } from "@/components/app/prostor/dokumenti/dokumenti-kontekst";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { useStartupTaskCommands } from "@/components/app/prostor/zadaci/use-startup-task-commands";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { Button } from "@/components/ui/button";
import { COMMAND_BLOCK_TEXT } from "@/lib/prostor";
import { COMMAND_CENTER_LIST, type WorkloadFilter } from "@/lib/prostor/modeli/command-center-model";
import {
  limitiPocetne,
  podnaslovPocetne,
  sastavPocetne,
  type BlokPocetne,
  type LimitiPocetne,
  type SastavPocetne,
} from "@/lib/prostor/modeli/pocetna-model";
import type { ProfileWithAvatar, StartupWithAreas } from "@/lib/prostor/rute";
import type { Today } from "@/lib/prostor/web/danas";

import { BlockBoundary } from "./blok";
import { JaviBrojProvider, useBrojeviZaglavlja } from "./brojevi-zaglavlja";
import { WaitingBlock } from "./ideje-glasanje";
import { RecentBlock } from "./nedavne-izmene";
import { GornjiPojasSkeleton, PocetnaSkeleton } from "./pocetna-skeleton";
import { PulseBlock } from "./puls-kartica";
import { CommandRowsProvider, type CommandRowsValue } from "./rows-context";
import { TeamBlock } from "./tim";
import { TriageBlock } from "./trijaza";
import { ForYouBlock } from "./za-tebe";

/**
 * ============================================================================
 * POČETNA PROJEKTA (`/[projekat]`, O10, P18; SPAJANJE S20, plan S18 §2)
 * ============================================================================
 *
 * Jedna početna: gore Za tebe (fokus), Trijaža (Sredi rokove, Zastarelo) i
 * Čeka te; desno još Ideje za glasanje i Tim; ispod Brojke (Enigmin
 * `OverviewDashboard` u celini, bez izmene), Puls tima i Nedavne izmene.
 * Šta se crta odlučuje `sastavPocetne` (uloga, režim), ne ovaj fajl.
 *
 * Ništa od Kontrolne table ne nestaje (plan S18 §2.1): „Šta me čeka" i Brojke
 * ostaju; napredak sa misijama je na Danas, a u panelu (gde Danas nema) ostaje
 * ovde. Posmatrač vidi samo Enigmine blokove i nijedan upit radnog dela.
 *
 * Svaki blok radnog dela ima svoju granicu (`BlockBoundary`), pa pad jednog ne
 * obara ostale. Redovi zadataka dele jedan skup radnji
 * (`useStartupTaskCommands`: završi sa „Poništi", rok, prioritet, status,
 * panel, prečice). Radni ekran se ne animira pri učitavanju.
 */
export function PocetnaEkran() {
  const { uloga, rezim } = useProjekat();
  const sastav = sastavPocetne({ uloga, rezim });
  if (sastav.skelet) {
    return (
      <div className="flex w-full flex-1 flex-col gap-6">
        <PageHeader variant="module" />
        <PocetnaSkeleton />
      </div>
    );
  }
  if (!sastav.smeRadniDeo) return <PocetnaPosmatrac sastav={sastav} />;
  return <PocetnaUrednik sastav={sastav} />;
}

// ── širina ekrana (granice blokova) ──────────────────────────────────────────

const SIROKO = "(min-width: 48rem)";

function pretplatiSiroko(promena: () => void) {
  const upit = window.matchMedia(SIROKO);
  upit.addEventListener("change", promena);
  return () => upit.removeEventListener("change", promena);
}

/** 1536/1440 su „široko", telefon (390) je „usko" (plan S18 §2.3). */
function useSiroko(): boolean {
  return useSyncExternalStore(
    pretplatiSiroko,
    () => window.matchMedia(SIROKO).matches,
    () => true,
  );
}

// ── Brojke (Enigma, bez izmene) ──────────────────────────────────────────────

function Brojke() {
  return (
    <section aria-label="Brojke" className="flex flex-1 flex-col">
      {/* `useSearchParams` (period) traži granicu Suspense na statičkoj ruti. */}
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewDashboard />
      </Suspense>
    </section>
  );
}

// ── posmatrač (client_viewer) ────────────────────────────────────────────────

const INFO_POSMATRAC_HUB = (
  <>
    Gore je posao koji čeka, iz istog izvora kao zvono. Ispod su GA4 sesije,
    Instagram doseg, OpenReply poruke i leadovi koji još nisu zvani. Period se
    bira u gornjoj traci, pamti se za ovaj projekat i prenosi na ekrane koji ga
    koriste.
  </>
);

const INFO_POSMATRAC_PANEL = (
  <>
    Gore su misije dana i nedeljni ciljevi, izvedeni iz onoga što je stvarno
    urađeno. Ispod je spisak iz zvona, pa GA4 sesije, Instagram doseg, OpenReply
    poruke i leadovi koji još nisu zvani. Period se bira u gornjoj traci, pamti
    se za ovaj projekat i prenosi na ekrane koji ga koriste.
  </>
);

/**
 * Posmatrač (plan S18 E9, E10): samo Enigmini blokovi. Nema bloka radnog
 * dela, nema „zaključano" mesta i nema poziva projektnih upita radnog dela.
 */
function PocetnaPosmatrac({ sastav }: { sastav: SastavPocetne }) {
  const panel = sastav.glavna.includes("commandTop");
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description={
          panel
            ? "Šta danas da uradiš, šta te čeka i kako kanali stoje u izabranom periodu."
            : "Šta te čeka i kako kanali stoje u izabranom periodu."
        }
        info={panel ? INFO_POSMATRAC_PANEL : INFO_POSMATRAC_HUB}
      />
      {sastav.glavna.map((blok) => (
        <EnigminBlok key={blok} blok={blok} />
      ))}
      {sastav.dole.includes("brojke") ? <Brojke /> : null}
    </div>
  );
}

function EnigminBlok({ blok }: { blok: BlokPocetne }) {
  switch (blok) {
    case "commandTop":
      // `CommandTop` kakav je bio: napredak i misije (ili fokus zadatka) i svoje „Šta me čeka".
      return <CommandTop />;
    case "fokusZadatak":
      return (
        <QuietBoundary>
          <FokusZadatak sabira={false} />
        </QuietBoundary>
      );
    case "staMeCeka":
      // Prvi zadatak već nosi fokus iznad: lista ga ne ponavlja (kao `CommandTop`).
      return <StaMeCeka preskociPrvi />;
    default:
      return null;
  }
}

// ── owner / urednik ──────────────────────────────────────────────────────────

const INFO_UREDNIK = (
  <>
    Gore su tvoji otvoreni zadaci u ovom projektu, trijaža celog tima i posao
    koji te čeka. Ispod su brojke kanala i poslovanja za period iz gornje trake,
    puls tima ove nedelje i nedavne izmene.
  </>
);

function PocetnaUrednik({ sastav }: { sastav: SastavPocetne }) {
  const { projekat, profil, otvoriNovuStranicu } = useDokumenti();
  const today = useToday();
  const siroko = useSiroko();
  const limiti = limitiPocetne(siroko);
  const staMeCeka = useStaMeCeka();
  const { brojevi, javi } = useBrojeviZaglavlja();
  const podnaslov = podnaslovPocetne(
    { zaTebe: brojevi.zaTebe, otvorenihUTimu: brojevi.otvorenihUTimu, cekaTe: staMeCeka?.zadaci.length },
    !siroko,
  );

  return (
    <JaviBrojProvider javi={javi}>
      <div className="flex w-full flex-1 flex-col gap-8 pb-8">
        <PageHeader
          variant="module"
          description={podnaslov ?? undefined}
          info={INFO_UREDNIK}
          actions={
            <Button variant="primary" onClick={() => otvoriNovuStranicu({ initialKind: "task" })}>
              <Plus aria-hidden="true" /> Novi zadatak
            </Button>
          }
        />

        {profil === null ? (
          <EmptyState
            icon={Lock}
            headingAs="h2"
            title="Radni deo još nije spreman."
            description="Profil tima se pravi pri prvom ulasku. Osveži stranicu."
          />
        ) : !projekat || !profil ? (
          <GornjiPojasSkeleton />
        ) : (
          <GornjiPojas sastav={sastav} projekat={projekat} profil={profil} today={today} limiti={limiti} />
        )}

        {sastav.dole.includes("brojke") ? <Brojke /> : null}

        <div className="grid items-start gap-x-8 gap-y-8 xl:grid-cols-[20rem_minmax(0,1fr)]">
          {sastav.dole.includes("pulsTima") ? (
            <BlockBoundary id="cc-puls" title="Puls tima" errorText="Puls tima nije učitan.">
              <PulseBlock now={today.now} />
            </BlockBoundary>
          ) : null}
          {sastav.dole.includes("nedavneIzmene") ? (
            <BlockBoundary id="cc-nedavne-izmene" title="Nedavne izmene" errorText={COMMAND_BLOCK_TEXT.recentError}>
              <RecentBlock now={today.now} limit={limiti.nedavne} />
            </BlockBoundary>
          ) : null}
        </div>
      </div>
    </JaviBrojProvider>
  );
}

/**
 * Gornji pojas: Za tebe i Trijaža levo, Čeka te, (Napredak u panelu), Ideje za
 * glasanje i Tim desno (od `xl`; ispod je jedna kolona istim redom, P18).
 */
function GornjiPojas({
  sastav,
  projekat,
  profil,
  today,
  limiti,
}: {
  sastav: SastavPocetne;
  projekat: StartupWithAreas;
  profil: ProfileWithAvatar;
  today: Today;
  limiti: LimitiPocetne;
}) {
  const { uloga, platformaVlasnik } = useProjekat();
  const { idi } = useProstorNavigacija();
  const now = today.now;
  const [memberFilter, setMemberFilter] = useState<WorkloadFilter>(null);
  // Trijaža i Tim dele iste pretplate: „Pokušaj ponovo" ponovo montira oba (jedan bi ostavio grešku živom kroz drugi).
  const [triageAttempt, setTriageAttempt] = useState(0);
  const retryTriage = useCallback(() => setTriageAttempt((value) => value + 1), []);

  const listRef = useRef<HTMLDivElement>(null);
  // Redovi koje blokovi trenutno crtaju (prijavljuju se kroz `register`).
  const registry = useRef(new Map<string, StartupTaskSection[]>());
  const allSections = useCallback(() => [...registry.current.values()].flat(), []);
  const register = useCallback((blockId: string, sections: StartupTaskSection[]) => {
    if (sections.length === 0) registry.current.delete(blockId);
    else registry.current.set(blockId, sections);
  }, []);

  // Panel zadatka: ime i znak projekta, nazivi oblasti (tekući projekat).
  const workspaces = useMemo(
    () => [
      {
        _id: projekat._id,
        name: projekat.name,
        logoUrl: projekat.logoUrl,
        areas: projekat.areas.map((area) => ({ _id: area._id, label: area.label })),
      },
    ],
    [projekat],
  );
  const commands = useStartupTaskCommands({
    today,
    profileId: profil._id,
    workspaces,
    listRef,
    locate: (key) => locateStartupRow(COMMAND_CENTER_LIST, allSections(), key),
    getRow: (key) => findStartupRow(allSections(), key),
    // Flip radi `FlipGroup` u svakom bloku (snimak pre commit-a), pa komande ne snimaju ništa.
    flipCapture: () => {},
    onOpenInStartup: (_workspaceId, pageId) => idi({ kind: "page", pageId }),
    onOpenFull: (pageId) => idi({ kind: "page", pageId }),
  });

  const workspaceMini = useMemo<WorkspaceMini>(
    () => ({ _id: projekat._id, name: projekat.name, logoUrl: projekat.logoUrl }),
    [projekat._id, projekat.name, projekat.logoUrl],
  );
  const areaLabels = useMemo(
    () => new Map(projekat.areas.map((area) => [area._id as string, area.label] as const)),
    [projekat.areas],
  );
  const rows: CommandRowsValue = {
    now,
    profileId: profil._id,
    // Menadžer projekta (zaključan zadatak, `convex/prostor/lib/auth.ts`): vlasnik ili vlasnik platforme.
    isManager: uloga === "owner" || platformaVlasnik,
    workspace: workspaceMini,
    areaLabels,
    limiti,
    commands: {
      actions: commands.actions,
      plannedKeys: commands.plannedKeys,
      holds: commands.holds,
      pending: commands.pending,
      selectedKey: commands.selectedKey,
      activeKey: commands.activeKey,
      request: commands.request,
    },
    register,
  };

  const blok = (b: BlokPocetne): ReactNode => {
    switch (b) {
      case "zaTebe":
        return (
          <BlockBoundary key={b} id="cc-za-tebe" title="Za tebe" errorText={COMMAND_BLOCK_TEXT.forYouError}>
            <ForYouBlock />
          </BlockBoundary>
        );
      case "trijaza":
        return (
          <BlockBoundary
            key={`${b}-${triageAttempt}`}
            id="cc-trijaza"
            title="Trijaža"
            errorText={COMMAND_BLOCK_TEXT.triageError}
            onRetry={retryTriage}
          >
            <TriageBlock memberFilter={memberFilter} onMemberFilter={setMemberFilter} />
          </BlockBoundary>
        );
      case "cekaTe":
        // Enigmino „Šta me čeka" za ovaj projekat, bez preskakanja prvog reda (E8).
        return <StaMeCeka key={b} />;
      case "napredak":
        return <NapredakBlok key={b} />;
      case "idejeZaGlasanje":
        return (
          <BlockBoundary key={b} id="cc-ideje" title="Ideje za glasanje" errorText="Ideje nisu učitane.">
            <WaitingBlock limit={limiti.ideje} />
          </BlockBoundary>
        );
      case "tim":
        return (
          <BlockBoundary
            key={`${b}-${triageAttempt}`}
            id="cc-tim"
            title="Tim"
            errorText={COMMAND_BLOCK_TEXT.teamError}
            onRetry={retryTriage}
          >
            <TeamBlock now={now} activeKey={memberFilter} onSelect={setMemberFilter} />
          </BlockBoundary>
        );
      default:
        return null;
    }
  };

  return (
    <CommandRowsProvider value={rows}>
      <div
        ref={listRef}
        onFocus={commands.onListFocus}
        className="grid items-start gap-x-8 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="flex min-w-0 flex-col gap-6">{sastav.glavna.map(blok)}</div>
        <div className="flex min-w-0 flex-col gap-6">{sastav.strana.map(blok)}</div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {commands.announcement}
      </p>
      {commands.panel}
    </CommandRowsProvider>
  );
}

/** Napredak u panelu (E10): ista tiha kartica kao na Danas, veze kroz projekat. */
function NapredakBlok() {
  const stanje = useStanjeNapretka();
  return (
    <QuietBoundary>
      <NapredakKartica stanje={stanje} uProjektu />
    </QuietBoundary>
  );
}
