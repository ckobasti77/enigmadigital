"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertCircle, CheckCircle2, Clock, Disc } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSyncAge } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Stanje sinhronizacije u gornjoj traci: jedno očitavanje za sve integracije,
 * jer operatera ovde zanima samo „da li su brojevi na ekranu sveži".
 *
 * Najgore stanje pobeđuje. Jedna integracija u grešci je vest; da su ostale
 * tri uspele nije. Detalje po integraciji nosi Podešavanja, i pločica vodi
 * tamo — to je izlaz sa svakog ekrana kada nešto ne štima.
 */
type Tone = "ok" | "running" | "error" | "stale" | "idle";

const TONE: Record<
  Tone,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  ok: { label: "Sveži podaci", className: "text-success", icon: CheckCircle2 },
  running: { label: "Sinhronizacija teče", className: "text-accent-400", icon: Disc },
  error: { label: "Greška sinhronizacije", className: "text-danger", icon: AlertCircle },
  stale: { label: "Zastala sinhronizacija", className: "text-warning", icon: Clock },
  idle: { label: "Bez sinhronizacije", className: "text-text-muted", icon: Clock },
};

/** Redosled ozbiljnosti: prvo što se nađe, to se prikazuje. */
const PRIORITY: Tone[] = ["error", "stale", "running", "ok"];

export function SyncStatus({ className }: { className?: string }) {
  return (
    <QuietBoundary>
      <SyncStatusPill className={className} />
    </QuietBoundary>
  );
}

/**
 * Pločica sedi u ljusci, dakle na svakom ekranu. Upit iza nje traži članstvo u
 * radnom prostoru i ume da pukne (nalog bez članstva, istekla sesija) — bez
 * ove granice bi jedno očitavanje statusa oborilo celu aplikaciju. Kada padne,
 * ne prikazuje se ništa: stanje sinhronizacije je prateća informacija, a
 * Podešavanja i dalje stoje u navigaciji.
 */
class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Pomera prikazano „pre 40 s" bez ijednog mrežnog poziva.
 *
 * Podatak stiže sam, Convex-om, čim se baza promeni — jedino što zastareva je
 * REČENICA o tome koliko je star. Deset sekundi je najduži interval na kom
 * sekunde ne počnu vidno da lažu, a i dalje je jedan `setState` u minuti i po.
 */
function useTicker(intervalMs: number): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

const AGE_TICK_MS = 10_000;

function SyncStatusPill({ className }: { className?: string }) {
  const entries = useQuery(api.sync.health);
  // Kada su podaci na ekranu poslednji put postali svežiji. Namerno NIJE
  // „poslednja sinhronizacija": većina osvežavanja su sada mali ciljani
  // prolazi koji ne otvaraju red u istoriji, i traka bi tvrdila da je ekran
  // star šest sati dok se kartica ispod nje promenila pre četrdeset sekundi.
  const freshAt = useQuery(api.sync.freshness);

  useTicker(AGE_TICK_MS);

  if (entries === undefined) {
    return <Skeleton className={cn("h-6 w-36", className)} />;
  }

  const tone: Tone =
    PRIORITY.find((t) => entries.some((e) => e.status === t)) ?? "idle";
  const { label, className: toneClass, icon: Icon } = TONE[tone];

  const age = freshAt == null ? null : formatSyncAge(freshAt);
  // Kada sve radi, vest je koliko su podaci sveži. Kada nešto ne radi, vest je
  // to — pa naslov ustupa mesto stanju.
  const headline = tone === "ok" && age !== null ? `Sinhronizovano ${age}` : label;

  return (
    <Link
      href="/settings"
      title={`${label}${age === null ? "" : ` · ${age}`}`}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border border-line-soft px-2.5 py-1 text-xs transition-colors hover:border-line-strong",
        className,
      )}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          toneClass,
          tone === "running" && "motion-safe:animate-spin",
        )}
        aria-hidden
      />
      <span className={cn("font-medium", toneClass)}>{headline}</span>
      {tone !== "ok" && age !== null && (
        <span className="hidden font-mono tabular-nums text-text-muted 2xl:inline">
          {age}
        </span>
      )}
    </Link>
  );
}
