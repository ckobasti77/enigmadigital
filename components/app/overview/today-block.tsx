"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { QuietBoundary } from "@/components/app/quiet-boundary";
import { useStaMeCeka, type Zadatak } from "@/components/app/use-sta-me-ceka";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * „DANAS" — prve tri stavke, PRE ijedne KPI pločice (A2 §4, plan §2 N)
 * ============================================================================
 *
 * Kriterijum gotovosti §4/1: otvaranje aplikacije daje konkretan spisak šta me
 * čeka, sa brojevima i po jednim dugmetom — bez ijednog klika. Zato ovaj blok
 * stoji iznad pločica: pločice kažu kako je bilo, ovo kaže šta treba uraditi.
 *
 * Isti upit i ista logika kao zvono (`useStaMeCeka`); ovde se samo uzimaju
 * prve tri stavke po hitnosti. Kada nema ničega, blok se NE crta — prazna
 * kartica koja slavi prazninu je tačno ono što plan zabranjuje.
 */
export function TodayBlock() {
  return (
    <QuietBoundary>
      <Danas />
    </QuietBoundary>
  );
}

const IVICA: Record<Zadatak["hitnost"], string> = {
  visoka: "border-l-danger",
  srednja: "border-l-warning",
  niska: "border-l-line-strong",
};

function Danas() {
  const data = useStaMeCeka();

  // Dok se ne zna — jedna traka, ne tri: skeleton koji obeća tri reda a onda
  // ne prikaže nijedan je lažno obećanje posla.
  if (data === undefined) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  if (data.zadaci.length === 0) return null;

  const prve = data.zadaci.slice(0, 3);
  const ostatak = data.zadaci.length - prve.length;

  return (
    <section
      aria-label="Šta me čeka danas"
      className="rounded-xl border border-line bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="heading-caps text-meta font-medium text-text-muted">
          Danas
        </h2>
        {ostatak > 0 && (
          <span className="text-meta text-text-muted">
            još {ostatak} u zvonu
          </span>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {prve.map((zadatak) => (
          <li
            key={zadatak.kljuc}
            className={cn(
              "flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border-l-2 bg-surface-raised px-3 py-2",
              IVICA[zadatak.hitnost],
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-ui font-medium text-foreground">
                {zadatak.naslov}
              </p>
              {zadatak.imenilac && (
                <p className="truncate text-meta text-text-muted">
                  {zadatak.odsecen ? "najmanje toliko · " : ""}
                  {zadatak.imenilac}
                </p>
              )}
            </div>
            <Link
              href={zadatak.veza}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-accent-400/40 bg-accent-400/10 px-2.5 text-meta font-medium text-accent-400 transition-colors hover:border-accent-400/60"
            >
              {zadatak.radnja}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
