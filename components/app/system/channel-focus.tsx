"use client";

import { NazivMere } from "@/components/app/system/naziv-mere";
import type { KljucMere } from "@/lib/mere";
import type { ReactNode } from "react";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { Activity, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Provider } from "@/convex/lib/providers";
import { CountUp } from "@/components/motion/count-up";
import { FocusCard } from "@/components/app/system/focus-card";
import { DeltaPill } from "@/components/app/system/kpi-tile";
import { SegmentedMeter } from "@/components/app/system/progress";
import { PodaciOd } from "@/components/app/system/stanje-veze";
import type {
  EngagementTier,
  Readiness,
} from "@/lib/channel-readiness";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * FOKUS KANALA — glavni broj + Spremnost kanala (UI Boost §8, §6.8)
 * ============================================================================
 *
 * Jedna fokus kartica za Instagram, Facebook, YouTube, Threads i Oglase:
 * levo najvažniji broj kanala (boja teksta, Aeonik), desno merač koji kaže šta kanalu
 * još fali i nudi JEDAN sledeći korak. Primarno dugme ekrana je u zaglavlju
 * strane, pa je korak ovde prateća radnja (`secondary`).
 *
 * Zdravlje veze nije deo merača (P3): kaže ga red stanja u zaglavlju, a ispod
 * broja stoji „podaci od …" kad je sinhronizacija starija od 24 h.
 */
export function ChannelFocus({
  label,
  mera,
  value,
  format,
  delta,
  formatDelta,
  compareLabel,
  higherIsBetter = true,
  note,
  reason,
  footnote,
  readiness,
  next,
  aside,
  className,
}: {
  /** Šta broj meri („Pratioci", „Potrošnja"). */
  label: string;
  /** Ključ iz rečnika mera: natpis postaje okidač oblačića sa akronimom i definicijom. */
  mera?: KljucMere;
  /** `undefined` = podatka nema; tada stoji crtica i `reason`. */
  value: number | undefined;
  format: (v: number) => string;
  /** Promena prema prethodnom periodu; `null`/`undefined` = nema poređenja. */
  delta?: number | null;
  formatDelta?: (v: number) => string;
  compareLabel?: string;
  /** `false` za potrošnju i CPA, gde je pad dobra vest. */
  higherIsBetter?: boolean;
  /** Jedna linija kad poređenja nema. */
  note?: string;
  /** Zašto broja nema. */
  reason?: string;
  /** Red ispod broja: imenilac ili napomena koja važi i uz poređenje. */
  footnote?: ReactNode;
  readiness?: Readiness;
  /** Radnja za prvi neispunjen uslov spremnosti. */
  next?: ReactNode;
  /** Desna strana kad ekran nema merač spremnosti. */
  aside?: ReactNode;
  className?: string;
}) {
  const hasDelta =
    delta !== null &&
    delta !== undefined &&
    Number.isFinite(delta) &&
    formatDelta !== undefined;

  const nextSegment = readiness?.segments.find((s) => s.key === readiness.next);

  return (
    <FocusCard
      eyebrow={mera ? <NazivMere mera={mera} tekst={label} /> : label}
      className={className}
      aside={
        readiness ? (
          <div className="flex w-full flex-col gap-3 md:w-96">
            <SegmentedMeter label="Spremnost kanala" segments={readiness.segments} />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 text-ui text-text-muted">
                {nextSegment ? nextSegment.hint : "Svi uslovi su ispunjeni."}
              </p>
              {next}
            </div>
          </div>
        ) : (
          aside
        )
      }
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        {value === undefined ? (
          <span className="block text-hero font-bold leading-none text-text-muted tabular-nums">
            —
          </span>
        ) : (
          <CountUp
            value={value}
            from={0}
            format={format}
            className="block text-hero font-bold leading-none text-foreground"
          />
        )}
        {value === undefined ? (
          reason && <p className="pb-1 text-ui text-text-muted">{reason}</p>
        ) : hasDelta ? (
          <div className="flex items-center gap-1.5 pb-1 text-ui">
            <DeltaPill
              value={delta}
              format={formatDelta}
              higherIsBetter={higherIsBetter}
            />
            {compareLabel && (
              <span className="text-text-muted">{compareLabel}</span>
            )}
          </div>
        ) : (
          note && <p className="pb-1 text-ui text-text-muted">{note}</p>
        )}
      </div>
      {footnote && <p className="text-ui text-text-muted">{footnote}</p>}
      {/* Jedan status veze (P3): broj iznad je star kad sinhronizacija kasni. */}
      <PodaciOd />
    </FocusCard>
  );
}

/** Isti otisak kao učitana kartica — podaci ništa ne pomeraju. */
export function ChannelFocusSkeleton() {
  return (
    <div className="h-36 animate-pulse rounded-xl border border-line bg-card" />
  );
}

/**
 * Stanje veze i sinhronizacije jednog provajdera, iz dva upita koja ljuska već
 * drži otvorena (Convex deduplikuje pretplatu). `undefined` dok ne stignu.
 */
export function useChannelSync(provider: Provider):
  | { connected: boolean; lastSyncAt: number | null; syncFailed: boolean }
  | undefined {
  const connections = useProjekatQuery(api.connections.list);
  const health = useProjekatQuery(api.sync.health);
  if (connections === undefined || health === undefined) return undefined;

  const connection = connections.find((c) => c.provider === provider);
  const run = health.find((h) => h.provider === provider);

  // Kraj poslednjeg USPEŠNOG prolaza: veza ga pamti i posle prolaza koji padne.
  const fromRun = run?.status === "ok" ? run.finishedAt : null;
  const fromConnection = connection?.lastSyncAt ?? null;
  const lastSyncAt =
    fromRun !== null && fromConnection !== null
      ? Math.max(fromRun, fromConnection)
      : (fromRun ?? fromConnection);

  return {
    connected: connection !== undefined,
    lastSyncAt,
    syncFailed: run?.status === "error" || run?.status === "stale",
  };
}

const TIER_CLASS: Record<EngagementTier, string> = {
  high: "border-success-line bg-success-soft text-success",
  mid: "border-line bg-surface-raised text-foreground",
  low: "border-line-soft bg-surface-raised text-text-muted",
};

const TIER_LABEL: Record<EngagementTier, string> = {
  high: "iznad medijane prikazanih objava",
  mid: "oko medijane prikazanih objava",
  low: "ispod medijane prikazanih objava",
};

const TIER_ICON = { high: TrendingUp, mid: Minus, low: TrendingDown } as const;

/**
 * Bedž angažmana na kartici objave: interakcije po prikazu, obojen prema
 * medijani skupa koji je na ekranu. Boja je STANJE (zeleno = iznad), a strelica
 * i tekst za čitač nose isto, pa boja nije jedini nosilac.
 */
export function EngagementBadge({
  rate,
  tier,
  median,
  className,
}: {
  /** Interakcije / prikazi; `null` = ne zna se, bedža nema. */
  rate: number | null;
  tier: EngagementTier | null;
  median?: number | null;
  className?: string;
}) {
  if (rate === null) return null;
  const Icon = tier ? TIER_ICON[tier] : Activity;
  const explain = tier
    ? `Angažman ${formatPercent(rate)} — ${TIER_LABEL[tier]}${
        median ? ` (${formatPercent(median)})` : ""
      }`
    : `Angažman ${formatPercent(rate)}`;
  return (
    <span
      title={explain}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-meta font-medium leading-none tabular-nums",
        tier ? TIER_CLASS[tier] : TIER_CLASS.mid,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span aria-hidden>{formatPercent(rate)}</span>
      <span className="sr-only">{explain}</span>
    </span>
  );
}
