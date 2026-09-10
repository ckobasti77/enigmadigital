"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { CheckCircle2, Clock, Disc } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSyncAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import { QuietBoundary } from "./quiet-boundary";

/**
 * Koliko su brojevi na ekranu sveži — i ništa više (A2 §5).
 *
 * Do A2 je ova pločica radila dva posla i drugi je radila loše: uzimala je
 * NAJGORI status među svim provajderima, pa je jedan davno pokvaren kanal
 * bojio crveno svaki ekran u aplikaciji, bez imena integracije i bez vremena.
 * Na `/settings` je to izgledalo ovako: crveno „Greška sinhronizacije" u
 * zaglavlju, a odmah ispod „Google Analytics 4 · Aktivno · sinhronizacija pre
 * 2 h" (§1.3). Dve tvrdnje na jednom ekranu koje se ne slažu.
 *
 * Kvar je sada stavka u zvonu, sa imenom integracije i sa vremenom
 * („GA4 ne sinhronizuje se 3 dana"), pa ovde ostaje samo starost podataka.
 * Ova traka više NIKAD nije crvena — kad nešto ne radi, to kaže zvono.
 */
type Tone = "ok" | "running" | "idle";

const TONE: Record<
  Tone,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  ok: { label: "Sveži podaci", className: "text-success", icon: CheckCircle2 },
  running: { label: "Sinhronizacija teče", className: "text-accent-400", icon: Disc },
  idle: { label: "Bez sinhronizacije", className: "text-text-muted", icon: Clock },
};

export function SyncStatus({ className }: { className?: string }) {
  return (
    <QuietBoundary>
      <SyncStatusPill className={className} />
    </QuietBoundary>
  );
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

  // Prolaz koji upravo teče je jedina vest koja pretiče starost podataka;
  // greška se ovde više ne gleda (ide u zvono). Bez ijednog prolaza — „idle",
  // što znači „još nije bilo sinhronizacije", a ne „nešto ne radi".
  const tone: Tone = entries.some((e) => e.status === "running")
    ? "running"
    : entries.length > 0 || freshAt != null
      ? "ok"
      : "idle";
  const { label, className: toneClass, icon: Icon } = TONE[tone];

  const age = freshAt == null ? null : formatSyncAge(freshAt);
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
