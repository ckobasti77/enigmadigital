"use client";

import { ArrowUpRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PULS_GRESKA_NAZIV } from "@/convex/lib/puls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/app/system/chip";
import { FeedbackNote } from "@/components/app/feedback";
import { ProjekatLink } from "@/components/app/projekat-link";
import { SamoZa } from "@/components/app/samo-za";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { useSada } from "@/components/app/napredak/use-napredak";
import {
  formatClockTime,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  formatSignedNumber,
  localDayDiff,
  pluralSr,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * POSLOVANJE — brojke sa sopstvenog sajta projekta (Puls)
 * ============================================================================
 *
 * Sajt projekta (npr. scanme.rs) na 15 minuta vraća do 20 brojki poslovanja;
 * ovde ih je najviše 8, sa promenom za 24 h. Sekcija sa razdelnikom, ne nova
 * istaknuta kartica: fokus kontrolne table ostaje gore.
 *
 * Kad Puls ne odgovara, poslednje dobre brojke ostaju, prigušene, uz traku
 * koja kaže od kada i zašto. Nepoznato je „—“, nikad izmišljena nula.
 * ============================================================================
 */

const MAX_METRIKA = 8;

function kadJe(at: number, sada: number): string {
  return localDayDiff(sada, at) === 0 ? formatClockTime(at) : formatDateTime(at);
}

export function PoslovanjeKartica() {
  const sada = useSada();
  const puls = useProjekatQuery(api.puls.poslednji, sada === 0 ? "skip" : { sada });

  return (
    <section
      aria-labelledby="poslovanje-naslov"
      className="flex flex-col gap-3 border-t border-line-soft pt-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {/* Okvir u naslovu: snimak sa sajta, ne izabran period. Prozor svake
            brojke (7 d, ovaj mesec) daje sajt u njenom nazivu. */}
        <h2 id="poslovanje-naslov" className="text-copy font-semibold text-foreground">
          Poslovanje
          <span className="font-normal text-text-muted"> · stanje sada</span>
        </h2>
        {puls?.poslednji && (
          <span className="flex items-center gap-2 text-meta text-text-muted">
            sa sajta projekta · ažurirano{" "}
            {formatRelativeTime(puls.poslednji.vreme ?? puls.poslednji.at, sada)}
            {puls.poslednji.zastareo && (
              <Chip size="sm" tone="warning">
                stariji od 24 h
              </Chip>
            )}
          </span>
        )}
      </div>

      {puls === undefined ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-5 w-16" />
            </div>
          ))}
        </div>
      ) : !puls.podeseno.adresa || !puls.podeseno.token ? (
        <NijePodeseno adresa={puls.podeseno.adresa} />
      ) : (
        <>
          {puls.greska !== null ? (
            <FeedbackNote
              tone="warning"
              title={`Puls ne odgovara od ${kadJe(puls.greska.od, sada)} (${puls.greska.uzastopno} ${pluralSr(puls.greska.uzastopno, "pokušaj", "pokušaja", "pokušaja")}): ${PULS_GRESKA_NAZIV[puls.greska.kod]}.`}
            >
              {puls.poslednji
                ? "Ispod su poslednje brojke koje su stigle."
                : "Brojke se pojavljuju posle prvog ispravnog odgovora."}
            </FeedbackNote>
          ) : puls.zastao && puls.poslednji ? (
            <FeedbackNote
              tone="warning"
              title={`Puls nije poslao nove brojke od ${kadJe(puls.poslednji.at, sada)}.`}
            />
          ) : null}

          {puls.poslednji ? (
            <dl
              className={cn(
                "grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4",
              )}
            >
              {puls.poslednji.metrike.slice(0, MAX_METRIKA).map((m) => (
                <div key={m.kljuc} className="min-w-0">
                  <dt className="truncate text-meta text-text-muted" title={m.naziv}>
                    {m.naziv}
                  </dt>
                  <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-copy font-bold tabular-nums text-foreground">
                      {formatNumber(m.vrednost)}
                    </span>
                    <span className="text-meta tabular-nums text-text-muted">
                      {m.promena24h === null ? "— za 24 h" : `${formatSignedNumber(m.promena24h)} za 24 h`}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : puls.greska === null ? (
            <p className="text-ui text-text-muted">Prvi snimak stiže u narednih 15 minuta.</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function NijePodeseno({ adresa }: { adresa: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-ui text-text-muted">
        {adresa
          ? "Token za Puls nije postavljen."
          : "Poveži Puls da ovde vidiš brojke poslovanja sa sajta projekta."}
      </p>
      <SamoZa
        uloga="owner"
        inace={<p className="text-meta text-text-muted">Puls podešava vlasnik projekta.</p>}
      >
        <Button
          render={<ProjekatLink href="/settings?tab=sajt" />}
          nativeButton={false}
          variant="outline"
          size="sm"
          className="touch-target"
        >
          Podesi Puls
          <ArrowUpRight data-icon="inline-end" aria-hidden />
        </Button>
      </SamoZa>
    </div>
  );
}
