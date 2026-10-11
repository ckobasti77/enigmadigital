"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Disc } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatSyncAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import { QuietBoundary } from "./quiet-boundary";

/**
 * Koliko su brojevi na ekranu sveži — i ništa više (A2 §5).
 *
 * Do A2 je ova pločica radila dva posla i drugi je radila loše: uzimala je
 * NAJGORI status među svim provajderima, pa je jedan davno pokvaren kanal
 * bojio crveno svaki ekran u aplikaciji, bez imena integracije i bez vremena.
 * Kvar je sada stavka u zvonu, sa imenom integracije i sa vremenom, pa ovde
 * ostaje samo starost podataka. Ovaj znak NIKAD nije crven — kad nešto ne
 * radi, to kaže zvono.
 *
 * Oblik (UI Boost §7.2): tačka u boji stanja umesto dugačkog čipa. Rečenica je
 * u oblačiću i u nazivu za čitač ekrana, a ista stoji i u meniju korisnika
 * (`SyncStatusLine`), jer oblačić na telefonu ne postoji. Tri stanja se
 * razlikuju i oblikom, ne samo bojom: puna tačka, disk koji se vrti, prazan
 * prsten.
 */
type Tone = "ok" | "running" | "idle";

const LABEL: Record<Tone, string> = {
  ok: "Sveži podaci",
  running: "Sinhronizacija teče",
  idle: "Bez sinhronizacije",
};

const TEXT: Record<Tone, string> = {
  ok: "text-success",
  running: "text-info",
  idle: "text-text-muted",
};

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

/** `undefined` dok odgovor ne stigne. */
function useSyncState(): { tone: Tone; headline: string } | undefined {
  const entries = useQuery(api.sync.health);
  // Kada su podaci na ekranu poslednji put postali svežiji. Namerno NIJE
  // „poslednja sinhronizacija": većina osvežavanja su sada mali ciljani
  // prolazi koji ne otvaraju red u istoriji, i traka bi tvrdila da je ekran
  // star šest sati dok se kartica ispod nje promenila pre četrdeset sekundi.
  const freshAt = useQuery(api.sync.freshness);

  useTicker(AGE_TICK_MS);

  if (entries === undefined) return undefined;

  // Prolaz koji upravo teče je jedina vest koja pretiče starost podataka;
  // greška se ovde ne gleda (ide u zvono). Bez ijednog prolaza — „idle", što
  // znači „još nije bilo sinhronizacije", a ne „nešto ne radi".
  const tone: Tone = entries.some((e) => e.status === "running")
    ? "running"
    : entries.length > 0 || freshAt != null
      ? "ok"
      : "idle";

  const age = freshAt == null ? null : formatSyncAge(freshAt);
  const headline =
    tone === "ok" && age !== null
      ? `Sinhronizovano ${age}`
      : age === null
        ? LABEL[tone]
        : `${LABEL[tone]} · ${age}`;

  return { tone, headline };
}

function Glyph({ tone }: { tone: Tone }) {
  if (tone === "running") {
    return (
      <Disc
        aria-hidden
        className={cn("size-3.5 shrink-0 motion-safe:animate-spin", TEXT[tone])}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        tone === "ok" ? "bg-success" : "border border-text-muted",
      )}
    />
  );
}

/** Tačka u gornjoj traci. Klik vodi na Podešavanja, kao i do sada. */
export function SyncStatus({ className }: { className?: string }) {
  return (
    <QuietBoundary>
      <SyncDot className={className} />
    </QuietBoundary>
  );
}

function SyncDot({ className }: { className?: string }) {
  const state = useSyncState();

  if (state === undefined) {
    return <Skeleton className={cn("size-8 rounded-lg", className)} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href="/settings"
            aria-label={`${state.headline}. Otvori podešavanja.`}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-raised",
              className,
            )}
          />
        }
      >
        <Glyph tone={state.tone} />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <p className="font-medium">{state.headline}</p>
        <p className="text-text-muted">Kvar integracije javlja zvono.</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Ista rečenica kao tekst — za meni korisnika, gde oblačić nije potreban. */
export function SyncStatusLine({ className }: { className?: string }) {
  return (
    <QuietBoundary>
      <SyncLine className={className} />
    </QuietBoundary>
  );
}

function SyncLine({ className }: { className?: string }) {
  const state = useSyncState();
  if (state === undefined) return null;

  return (
    <p className={cn("flex items-center gap-2 text-meta", className)}>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <Glyph tone={state.tone} />
      </span>
      <span className={cn("truncate", TEXT[state.tone])}>{state.headline}</span>
    </p>
  );
}
