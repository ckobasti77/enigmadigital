"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertCircle, CheckCircle2, Clock, Disc } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/format";
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

function SyncStatusPill({ className }: { className?: string }) {
  const entries = useQuery(api.sync.health);

  if (entries === undefined) {
    return <Skeleton className={cn("h-6 w-36", className)} />;
  }

  const tone: Tone =
    PRIORITY.find((t) => entries.some((e) => e.status === t)) ?? "idle";
  const { label, className: toneClass, icon: Icon } = TONE[tone];

  // Za „kada" se uzima poslednje pokretanje bilo koje integracije: to je
  // trenutak od kog brojevi na ekranu važe.
  const latest = entries.reduce<number | null>(
    (best, e) => (best === null || e.startedAt > best ? e.startedAt : best),
    null,
  );

  return (
    <Link
      href="/settings"
      title={`${label}${latest === null ? "" : ` · ${formatRelativeTime(latest)}`}`}
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
      <span className={cn("font-medium", toneClass)}>{label}</span>
      {latest !== null && (
        <span className="hidden font-mono tabular-nums text-text-muted 2xl:inline">
          {formatRelativeTime(latest)}
        </span>
      )}
    </Link>
  );
}
