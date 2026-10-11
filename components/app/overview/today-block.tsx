"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleDot, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuietBoundary } from "@/components/app/quiet-boundary";
import { resolveModule } from "@/components/app/nav-items";
import { useStaMeCeka, type Zadatak } from "@/components/app/use-sta-me-ceka";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * „ŠTA ME ČEKA" — prve tri stavke, PRE ijedne pločice kanala (A2 §4, B6)
 * ============================================================================
 *
 * Kriterijum gotovosti §4/1: otvaranje aplikacije daje konkretan spisak šta me
 * čeka, sa brojevima i po jednim dugmetom — bez ijednog klika. Zato ovaj blok
 * stoji iznad pločica: pločice kažu kako je bilo, ovo kaže šta treba uraditi.
 *
 * Isti upit i ista logika kao zvono (`useStaMeCeka`); ovde se samo uzimaju
 * prve tri stavke po hitnosti. Kada nema ničega, blok se NE crta — prazna
 * kartica koja slavi prazninu je tačno ono što plan zabranjuje.
 *
 * B6: blok je sekundaran u odnosu na fokus karticu iznad sebe, pa više nije
 * kutija — redove deli razdelnik. Boja nosi dve različite stvari, i ne mešaju
 * se: pločica levo je HITNOST (stanje), a dugme desno je u boji MODULA u koji
 * vodi (mesto), isto kao u zvonu i u ⌘K.
 */
export function StaMeCeka({
  preskociPrvi = false,
}: {
  /** Prvi zadatak već stoji u fokus kartici — ovde se ne ponavlja. */
  preskociPrvi?: boolean;
}) {
  return (
    <QuietBoundary>
      <Lista preskociPrvi={preskociPrvi} />
    </QuietBoundary>
  );
}

const HITNOST: Record<
  Zadatak["hitnost"],
  { natpis: string; plocica: string; tekst: string; ikona: typeof Clock }
> = {
  visoka: {
    natpis: "Hitno",
    plocica: "bg-danger-soft text-danger",
    tekst: "text-danger",
    ikona: AlertTriangle,
  },
  srednja: {
    natpis: "Ovih dana",
    plocica: "bg-warning-soft text-warning",
    tekst: "text-warning",
    ikona: Clock,
  },
  niska: {
    natpis: "Kad stigne red",
    plocica: "bg-surface-raised text-text-muted",
    tekst: "text-text-muted",
    ikona: CircleDot,
  },
};

const PRIKAZANO = 3;

function Lista({ preskociPrvi }: { preskociPrvi: boolean }) {
  const data = useStaMeCeka();

  // Dok se ne zna — jedna traka, ne tri: skeleton koji obeća tri reda a onda
  // ne prikaže nijedan je lažno obećanje posla.
  if (data === undefined) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  const od = preskociPrvi ? 1 : 0;
  const prve = data.zadaci.slice(od, od + PRIKAZANO);
  if (prve.length === 0) return null;
  const ostatak = data.zadaci.length - od - prve.length;

  return (
    <section aria-label="Šta me čeka" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-copy font-bold text-foreground">Šta me čeka</h2>
        {ostatak > 0 && (
          <span className="text-meta text-text-muted">
            još {ostatak} u zvonu
          </span>
        )}
      </div>

      <ul className="divide-y divide-line-soft border-y border-line-soft">
        {prve.map((zadatak) => {
          const h = HITNOST[zadatak.hitnost];
          const Ikona = h.ikona;
          return (
            <li
              key={zadatak.kljuc}
              data-module={resolveModule(zadatak.veza.split(/[?#]/)[0])}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  h.plocica,
                )}
              >
                <Ikona className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui font-medium text-foreground">
                  {zadatak.naslov}
                </p>
                <p className="truncate text-meta text-text-muted">
                  <span className={cn("font-medium", h.tekst)}>{h.natpis}</span>
                  {zadatak.imenilac && (
                    <>
                      {" · "}
                      {zadatak.odsecen ? "najmanje toliko · " : ""}
                      {zadatak.imenilac}
                    </>
                  )}
                </p>
              </div>
              <Button
                render={<Link href={zadatak.veza} />}
                nativeButton={false}
                variant="secondary"
                size="sm"
                className="touch-target"
              >
                {zadatak.radnja}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
