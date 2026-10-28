"use client";

import { ProjekatLink } from "@/components/app/projekat-link";
import { ArrowRight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackLine } from "@/components/app/feedback";
import { Chip } from "@/components/app/system/chip";
import { EmptyState } from "@/components/app/system/empty-state";
import { FocusCard } from "@/components/app/system/focus-card";
import { MissionCard } from "@/components/app/system/mission-card";
import { ProgressRing } from "@/components/app/system/progress";
import { LevelBadge, StreakFlame } from "@/components/app/system/reward-badges";
import { NAPREDAK_HREF, type ModuleKey } from "@/components/app/nav-items";
import {
  ikonaMisije,
  naslovMisije,
  radnjaMisije,
} from "@/components/app/napredak/napredak-ikone";
import { MisijaLink } from "@/components/app/napredak/misija-link";
import {
  stanjeNiza,
  useNapredak,
  useNapredakPao,
  useNapredakZastoj,
  useSada,
  type NapredakUkljucen,
} from "@/components/app/napredak/use-napredak";
import { QuietBoundary } from "@/components/app/quiet-boundary";
import { useStaMeCeka } from "@/components/app/use-sta-me-ceka";
import { useProjekat } from "@/components/app/projekat-provider";
import { belgradeInputsFor } from "@/lib/belgrade-time";
import { formatNumber, formatPercentValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StaMeCeka } from "./today-block";

/**
 * ============================================================================
 * VRH KOMANDNOG CENTRA — fokus „Danas" + „Šta me čeka" (UI Boost §8, B6)
 * ============================================================================
 *
 * Jedan fokus po ekranu: kartica „Danas". U njoj su pozdrav, zvanje i nivo,
 * niz i tri misije dana — prva nezavršena je šira i JEDINA nosi primarno
 * dugme. Desno su tri nedeljna prstena. Ispod, tiše i bez kutije, stoji „Šta
 * me čeka" iz istog izvora kao zvono.
 *
 * Fokus i lista žive u istoj komponenti zato što dele jednu odluku: kad
 * Napredak nije dostupan (isključen, upit pao, dan se ne otvara), fokus
 * preuzima NAJHITNIJI zadatak iz zvona, a lista ga tada ne ponavlja. Ekran
 * tako ima fokus i jedno primarno dugme i bez XP-a.
 *
 * Ništa se ne animira pri otvaranju. Kartica misije i prstenovi se pomere tek
 * kad se vrednost promeni dok je ekran otvoren (to rade same komponente).
 */

/** Boja prstena je boja modula iz kog posao dolazi (§6.6). */
const MODUL_PRSTENA: Record<string, ModuleKey> = {
  pozivi: "leadovi",
  sastanci: "tabla",
  objave: "instagram",
};

/** Pozdrav po beogradskom satu; dok se sat ne zna (server) — bez doba dana. */
function pozdrav(now: number): string {
  if (now <= 0) return "Danas";
  const sat = Number(belgradeInputsFor(now).time.slice(0, 2));
  if (sat >= 5 && sat < 11) return "Dobro jutro";
  if (sat >= 11 && sat < 18) return "Dobar dan";
  return "Dobro veče";
}

export function CommandTop() {
  const stanje = useNapredak();
  const pao = useNapredakPao();
  const zastoj = useNapredakZastoj();

  // Napredak još nije odgovorio: mesto fokusa drži skeleton iste veličine, a
  // lista ispod radi nezavisno.
  if (stanje === undefined && !pao) {
    return (
      <>
        <Skeleton className="h-80 w-full rounded-xl" />
        <StaMeCeka />
      </>
    );
  }

  const sabira = stanje?.ukljucen === true && !stanje.spremno && !zastoj;
  if (stanje?.ukljucen && stanje.spremno) {
    // Nema nezavršene misije (nijedna nije nastala, ili su sve gotove): fokus
    // tada vodi na prvi zadatak iz zvona, a lista ispod ga ne ponavlja.
    const bezMisije = !stanje.misije.some((m) => !m.zavrsena);
    return (
      <>
        <FokusNapredak stanje={stanje} saZadatkom={bezMisije} />
        <StaMeCeka preskociPrvi={bezMisije} />
      </>
    );
  }

  return (
    <>
      <QuietBoundary>
        <FokusZadatak sabira={sabira} />
      </QuietBoundary>
      <StaMeCeka preskociPrvi />
    </>
  );
}

// ── fokus sa Napretkom ───────────────────────────────────────────────────────

function FokusNapredak({
  stanje,
  saZadatkom,
}: {
  stanje: NapredakUkljucen;
  /** Nijedna misija ne čeka — primarno dugme nosi prvi zadatak iz zvona. */
  saZadatkom: boolean;
}) {
  const sada = useSada();
  const { korisnik, slug } = useProjekat();
  const { nivo, niz, xp, misije, bonus } = stanje;
  const ime = korisnik?.ime?.trim() || null;

  // Prva nezavršena je sledeći korak: ide prva, šira je i nosi primarno dugme.
  const sledeca = misije.find((m) => !m.zavrsena)?.kljuc;
  const poredjane = [...misije].sort(
    (a, b) => Number(b.kljuc === sledeca) - Number(a.kljuc === sledeca),
  );
  const zavrsenih = misije.filter((m) => m.zavrsena).length;

  return (
    <FocusCard>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
          <LevelBadge
            level={nivo.broj}
            tier={nivo.rang}
            rank={nivo.zvanje}
            size="lg"
          />
          <div className="min-w-40 flex-1">
            <h2 className="text-title font-bold text-foreground">
              {pozdrav(sada)}
            </h2>
            <p className="truncate text-ui text-text-muted">
              {ime && <span className="text-text-secondary">{ime} · </span>}
              {nivo.zvanje} · nivo {nivo.broj}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StreakFlame days={niz.dani} state={stanjeNiza(niz, sada)} />
            {xp.danas > 0 && (
              <Chip tone="xp" size="sm" className="tabular-nums">
                +{formatNumber(xp.danas)} XP danas
              </Chip>
            )}
          </div>
        </div>

        {/* Na telefonu prstenovi idu ISPOD misija: prvo šta da uradim. Okvir
            je drugačiji od misija (nedelja, ne dan), pa ga piše naslov. */}
        <div className="order-last flex flex-col gap-2 lg:order-none">
          <p id="prstenovi-okvir" className="text-meta text-text-muted">
            Ova nedelja
          </p>
          <ul
            aria-labelledby="prstenovi-okvir"
            className="flex items-start justify-between gap-4 sm:justify-start sm:gap-6"
          >
            {stanje.prstenovi.map((prsten) => (
              <li
                key={prsten.kljuc}
                data-module={MODUL_PRSTENA[prsten.kljuc]}
                className="flex flex-col items-center gap-2 sm:flex-row sm:gap-2.5"
              >
                <ProgressRing
                  value={prsten.vrednost}
                  max={prsten.cilj}
                  size={56}
                  stroke={6}
                  label={`${prsten.naziv} ove nedelje`}
                >
                  <span className="text-copy font-bold text-foreground">
                    {prsten.vrednost}
                  </span>
                </ProgressRing>
                <span className="text-center text-meta leading-tight sm:text-left">
                  <span className="block font-medium text-foreground">
                    {prsten.naziv}
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-text-muted">
                    od {prsten.cilj} · {formatPercentValue(prsten.procenat)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-w-0 flex-col gap-2.5 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-ui text-text-muted">
              <span className="font-medium text-foreground">Danas</span>
              {" · misije"}
              {misije.length > 0 && (
                <>
                  {" "}
                  <span className="tabular-nums text-foreground">
                    {zavrsenih} / {misije.length}
                  </span>
                  {bonus.osvojen ? (
                    <span className="font-medium text-xp">
                      {" "}
                      · dnevni bonus +{bonus.xp} XP osvojen
                    </span>
                  ) : bonus.moguc ? (
                    <>
                      {" "}
                      · još {bonus.preostaloMisija} do bonusa{" "}
                      <span className="tabular-nums text-xp">
                        +{bonus.xp} XP
                      </span>
                    </>
                  ) : null}
                </>
              )}
            </p>
            <ProjekatLink
              href={NAPREDAK_HREF}
              className="inline-flex cursor-pointer items-center gap-1 text-meta font-medium text-radnja underline-offset-2 hover:underline"
            >
              Napredak
              <ArrowRight className="size-3.5" aria-hidden />
            </ProjekatLink>
          </div>

          {misije.length === 0 ? (
            <EmptyState variant="line" icon={Target} title="Danas nema misija.">
              Misija nastaje samo kad posao postoji: firme za poziv, zaostali
              koraci, nerešeni redovi uvoza ili komentari bez odgovora.
            </EmptyState>
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 gap-3",
                poredjane.length === 3 &&
                  "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]",
                poredjane.length === 2 &&
                  "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
              )}
            >
              {poredjane.map((misija) => {
                const glavna = misija.kljuc === sledeca;
                return (
                  <MissionCard
                    key={misija.kljuc}
                    title={naslovMisije(misija, slug)}
                    icon={ikonaMisije(misija.kljuc)}
                    value={misija.napredak}
                    max={misija.cilj}
                    xp={misija.xp}
                    done={misija.zavrsena}
                    featured={glavna}
                    // Unutar fokus kartice misija je udubljenje, ne druga
                    // kartica sa senkom — bez „kutije u kutiji". Tamnija
                    // podloga ostavlja šinu trake napretka vidljivom.
                    className="bg-background/50 shadow-none"
                    action={
                      <Button
                        render={<MisijaLink misija={misija} />}
                        nativeButton={false}
                        variant={glavna ? "primary" : "secondary"}
                        size={glavna ? "default" : "sm"}
                      >
                        {radnjaMisije(misija.kljuc)}
                        <ArrowRight data-icon="inline-end" aria-hidden />
                      </Button>
                    }
                  />
                );
              })}
            </div>
          )}

          {saZadatkom && (
            <QuietBoundary>
              <SledeciZadatak />
            </QuietBoundary>
          )}
        </div>
      </div>
    </FocusCard>
  );
}

/**
 * Kad nijedna misija ne čeka, sledeći korak je prvi zadatak iz „Šta me čeka".
 * Bez ovoga bi ekran sa završenim misijama ostao bez ijednog primarnog
 * dugmeta, iako posao postoji tri reda niže.
 */
function SledeciZadatak() {
  const data = useStaMeCeka();
  const prvi = data?.zadaci[0];
  if (!prvi) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-1">
      <div className="min-w-0">
        <p className="text-meta text-text-muted">Sledeće što čeka</p>
        <p className="truncate text-copy font-medium text-foreground">
          {prvi.naslov}
          {prvi.imenilac && (
            <span className="font-normal text-text-muted">
              {" · "}
              {prvi.odsecen ? "najmanje toliko · " : ""}
              {prvi.imenilac}
            </span>
          )}
        </p>
      </div>
      <Button
        render={<ProjekatLink href={prvi.veza} />}
        nativeButton={false}
        variant="primary"
        className="touch-target"
      >
        {prvi.radnja}
        <ArrowRight data-icon="inline-end" aria-hidden />
      </Button>
    </div>
  );
}

// ── fokus bez Napretka: najhitniji zadatak iz zvona ──────────────────────────

/**
 * Napredak je isključen, upit je pao ili se dan još sabira. Fokus tada nosi
 * prvi zadatak iz „Šta me čeka" — bez XP-a, bez niza, bez prstenova — pa
 * ekran i dalje kaže šta sledeće da klikneš.
 */
function FokusZadatak({ sabira }: { sabira: boolean }) {
  const sada = useSada();
  const data = useStaMeCeka();

  if (data === undefined) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  const prvi = data.zadaci[0];
  return (
    <FocusCard
      title={pozdrav(sada)}
      action={
        prvi && (
          <Button
            render={<ProjekatLink href={prvi.veza} />}
            nativeButton={false}
            variant="primary"
          >
            {prvi.radnja}
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Button>
        )
      }
    >
      {prvi ? (
        <div className="min-w-0">
          <p className="text-copy font-medium text-foreground">{prvi.naslov}</p>
          {prvi.imenilac && (
            <p className="text-ui text-text-muted">
              {prvi.odsecen ? "najmanje toliko · " : ""}
              {prvi.imenilac}
            </p>
          )}
        </div>
      ) : (
        <p className="text-ui text-text-muted">
          Ništa ne čeka: nema zaostalih koraka, sastanaka bez ishoda ni uvoza u
          pregledu. Brojevi kanala su ispod.
        </p>
      )}
      {sabira && (
        <FeedbackLine tone="progress">
          Sabiram dosadašnje radnje — misije, nivo i XP stižu za koji trenutak.
        </FeedbackLine>
      )}
    </FocusCard>
  );
}
