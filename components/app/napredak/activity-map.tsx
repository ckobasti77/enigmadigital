"use client";

import { useState } from "react";
import { danUNedelji } from "@/convex/lib/napredak";
import { formatLongDate, formatNumber, pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * MAPA AKTIVNOSTI — 12 nedelja (UI Boost §8, red `/napredak`)
 * ============================================================================
 *
 * Jedan kvadrat = jedan beogradski dan; kolona = nedelja (ponedeljak gore).
 * Skala je JEDNOBOJNA i sekvencijalna, u zlatnoj (nagrada): razlika je u
 * jačini, ne u nijansi, pa se čita i bez raspoznavanja boja. Boja ipak nije
 * jedini nosilac — broj stoji u oblačiću svakog dana i u redu ispod mape, a
 * legenda kaže šta je „najjače".
 *
 * Pet koraka: bez XP-a, pa četvrtine najjačeg dana u prikazanom periodu.
 */
const KORACI = [
  "bg-surface-raised",
  "bg-[color-mix(in_oklab,var(--xp)_24%,var(--surface-raised))]",
  "bg-[color-mix(in_oklab,var(--xp)_46%,var(--surface-raised))]",
  "bg-[color-mix(in_oklab,var(--xp)_72%,var(--surface-raised))]",
  "bg-xp",
] as const;

const DANI_LEVO = ["Pon", "", "Sre", "", "Pet", "", ""] as const;

function korak(xp: number, maks: number): number {
  if (xp <= 0 || maks <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((xp / maks) * 4)));
}

export function ActivityMap({
  dani,
  maks,
  danas,
  className,
}: {
  /** Dani redom, najstariji prvi — i oni bez XP-a. */
  dani: ReadonlyArray<{ dan: string; xp: number }>;
  /** Najviše XP-a u jednom danu u ovom periodu. */
  maks: number;
  /** Dan sidra — podrazumevano se pokazuje njegov broj. */
  danas: string | null;
  className?: string;
}) {
  const [izabran, setIzabran] = useState<string | null>(null);

  if (dani.length === 0) return null;

  // Prva kolona kreće od ponedeljka: prazna polja pre prvog dana.
  const pomak = (danUNedelji(dani[0].dan) + 6) % 7;
  const aktivnih = dani.filter((d) => d.xp > 0).length;
  const ukupno = dani.reduce((zbir, d) => zbir + d.xp, 0);
  const prikazan =
    dani.find((d) => d.dan === (izabran ?? danas)) ?? dani[dani.length - 1];

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex gap-2">
        <div
          aria-hidden
          className="grid shrink-0 grid-rows-7 gap-[3px] text-micro leading-none text-text-muted"
        >
          {DANI_LEVO.map((naziv, i) => (
            <span key={i} className="flex h-3.5 items-center">
              {naziv}
            </span>
          ))}
        </div>
        <div
          role="img"
          aria-label={`Mapa aktivnosti: ${aktivnih} ${pluralSr(aktivnih, "aktivan dan", "aktivna dana", "aktivnih dana")} od ${dani.length}, ukupno ${formatNumber(ukupno)} XP, najviše ${formatNumber(maks)} XP u jednom danu.`}
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          onPointerLeave={() => setIzabran(null)}
        >
          {Array.from({ length: pomak }, (_, i) => (
            <span key={`pre-${i}`} className="size-3.5" />
          ))}
          {dani.map((d) => (
            <span
              key={d.dan}
              title={`${formatLongDate(d.dan)} — ${formatNumber(d.xp)} XP`}
              onPointerEnter={() => setIzabran(d.dan)}
              onClick={() => setIzabran(d.dan)}
              className={cn(
                "size-3.5 rounded-[3px]",
                KORACI[korak(d.xp, maks)],
                d.dan === prikazan.dan && "ring-1 ring-foreground",
              )}
            />
          ))}
        </div>
      </div>

      <p className="text-ui text-foreground" aria-live="polite">
        <span className="font-bold tabular-nums">
          {formatNumber(prikazan.xp)} XP
        </span>
        <span className="text-text-muted"> · {formatLongDate(prikazan.dan)}</span>
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-meta text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          Manje
          <span aria-hidden className="inline-flex gap-[3px]">
            {KORACI.map((boja) => (
              <span key={boja} className={cn("size-3 rounded-[3px]", boja)} />
            ))}
          </span>
          Više
        </span>
        <span>
          Najjači dan:{" "}
          <span className="tabular-nums text-foreground">
            {maks > 0 ? `${formatNumber(maks)} XP` : "—"}
          </span>
        </span>
        <span>
          Aktivnih dana:{" "}
          <span className="tabular-nums text-foreground">
            {aktivnih}
          </span>{" "}
          od {dani.length}
        </span>
      </div>
    </div>
  );
}
