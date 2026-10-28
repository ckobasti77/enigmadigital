"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { vremeUBeogradu } from "@/convex/lib/globalneKvote";
import { StatusPill, PROVIDER_LABELS } from "./status-pill";

type HealthEntry = FunctionReturnType<typeof api.sync.health>[number];

function syncPill(status: HealthEntry["status"], note?: string | null) {
  if (status === "ok" && note && note.startsWith("Delimično")) {
    return <StatusPill tone="warning">Delimično</StatusPill>;
  }
  switch (status) {
    case "ok":
      return <StatusPill tone="success">Uspešno</StatusPill>;
    case "error":
      return <StatusPill tone="danger">Greška</StatusPill>;
    case "running":
      return (
        <StatusPill tone="accent" pulse>
          U toku
        </StatusPill>
      );
    case "stale":
      return <StatusPill tone="warning">Zastalo</StatusPill>;
  }
}

/**
 * Kvota Meta Marketing API-ja (MA1).
 *
 * Prikazuje se samo kad je bar jedan poziv prošao — dok očitavanja nema,
 * ovde bi „0 %” bio broj koji niko nije izmerio.
 *
 * Sloj pristupa je tu jer menja red veličine svega ostalog: na
 * development pristupu satna kvota za insights je 600 + 400 × broj aktivnih
 * oglasa, pa 60 % kod tri aktivna oglasa i 60 % kod trista znače potpuno
 * različite stvari.
 */
/** Očitavanje starije od klizajućeg sata ne opisuje prozor koji još traje. */
const QUOTA_TTL_MS = 60 * 60 * 1000;

/**
 * Sat koji otkucava, umesto `Date.now()` u telu komponente.
 *
 * Mora da bude ovde, a ne u Convex upitu: upit se ponovo računa tek kad se red
 * promeni, pa bi „zastarelo” i „blokada je istekla” izvedeni na serveru ostali
 * zamrznuti na vrednosti iz trenutka upisa — a red se menja tek kad prolaz
 * prođe, što je upravo ono što blokada sprečava.
 *
 * `null` do prvog otkucaja, da render ostane čist (React purity).
 */
function useTickingNow(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Prvi otkucaj ide kroz makro-zadatak, ne sinhrono iz efekta, da render
    // koji ga je zakazao ne povuče odmah još jedan.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

function MetaAdsQuota() {
  const quota = useProjekatQuery(api.metaAdsStore.quotaStatus);
  const now = useTickingNow(30_000);
  if (quota === undefined || quota === null) return null;

  const stale = now !== null && now - quota.fetchedAt > QUOTA_TTL_MS;
  // Do prvog otkucaja se veruje upisanom stanju; posle njega odlučuje vreme.
  const blocked =
    quota.blockedUntil !== undefined &&
    quota.state === "stop" &&
    (now === null || quota.blockedUntil > now);

  const pct = Math.round(quota.peakPct);
  const isDev = quota.tier === "development_access";
  const tierLabel =
    quota.tier === "development_access"
      ? "Development pristup"
      : quota.tier === "standard_access"
        ? "Standardni pristup"
        : undefined;

  const barTone =
    quota.state === "stop"
      ? "bg-danger"
      : quota.state === "warn"
        ? "bg-warning"
        : "bg-mod-strong";

  return (
    <div className="mt-5 border-t border-line-soft pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="heading-caps text-micro font-medium text-text-muted">
          Kvota Meta oglasa
        </span>
        <span className="text-sm tabular-nums text-foreground">
          {pct} %
        </span>
      </div>

      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-raised"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Iskorišćenost kvote Meta oglasa"
      >
        <div
          className={`h-full rounded-full ${barTone} motion-safe:transition-[width] motion-safe:duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-text-muted">
        {tierLabel && <span>{tierLabel}</span>}
        {tierLabel && <span aria-hidden="true">·</span>}
        <span>
          očitano {formatRelativeTime(quota.fetchedAt, now ?? undefined)}
        </span>
        {stale && (
          <>
            <span aria-hidden="true">·</span>
            <span>očitavanje starije od sat vremena</span>
          </>
        )}
      </div>

      {/* Upisani `state` je „stop” od trenutka upisa; da li blokada JOŠ traje
          zna se samo poređenjem sa trenutnim vremenom. */}
      {blocked && (
        <p className="mt-2 text-xs text-danger">
          Meta trenutno ograničava pozive. Sinhronizacija se nastavlja kad
          blokada istekne.
        </p>
      )}

      {isDev && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Na development pristupu kvota je 600 + 400 × broj aktivnih oglasa na
          sat i puni se tek posle App Review-a.
        </p>
      )}
    </div>
  );
}

const MINUT_MS = 60_000;

/**
 * Operacije Google Ads developer tokena za klizećih 24 h. Token dele svi
 * projekti, pa red kaže i deo ovog projekta i zbir svih, a kad je deo potrošen,
 * zašto sinhronizacija čeka i kad se nastavlja. Ćuti bez Google Ads veze.
 */
function GoogleAdsKvota() {
  const now = useTickingNow(MINUT_MS);
  // Zaokruženo na minut: upit ne čita sat, a nova pretplata svakog trenutka
  // bila bi bez razloga.
  const minut = now === null ? null : Math.floor(now / MINUT_MS) * MINUT_MS;
  const kvota = useProjekatQuery(
    api.googleAdsStore.kvotaGoogleAds,
    minut === null ? "skip" : { now: minut },
  );
  if (kvota === undefined || kvota === null) return null;

  const deljeno = kvota.projekata > 1;
  const granica = kvota.projekat + kvota.dostupno;
  const pct = granica > 0 ? Math.round((kvota.projekat / granica) * 100) : 100;
  const potroseno = kvota.dostupno === 0;
  const barTone = potroseno ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-mod-strong";

  return (
    <div className="mt-5 border-t border-line-soft pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="heading-caps text-micro font-medium text-text-muted">
          Kvota Google oglasa
        </span>
        <span className="text-sm tabular-nums text-foreground">
          {formatNumber(kvota.projekat)} od {formatNumber(deljeno ? kvota.deoProjekta : kvota.zajednickiLimit)}
        </span>
      </div>

      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-raised"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Iskorišćenost kvote Google oglasa"
      >
        <div
          className={`h-full rounded-full ${barTone} motion-safe:transition-[width] motion-safe:duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>

      <p className="mt-2 text-micro text-text-muted">
        operacija za 24 h
        {deljeno ? (
          <>
            {" (deo ovog projekta) · svi projekti: "}
            <span className="tabular-nums">
              {formatNumber(kvota.ukupno)} od {formatNumber(kvota.zajednickiLimit)}
            </span>
          </>
        ) : null}
      </p>

      {potroseno && (
        <p className="mt-2 text-xs text-danger">
          {kvota.ukupno >= kvota.zajednickiLimit
            ? "Google Ads sinhronizacija je odložena: zajednička kvota svih projekata je potrošena."
            : "Google Ads sinhronizacija je odložena: deo kvote za ovaj projekat je potrošen."}{" "}
          Ponovo oko {vremeUBeogradu(kvota.obnovaU)}.
        </p>
      )}
    </div>
  );
}

/** Last sync run per provider — status, when it ran, and error text if it failed. */
export function SyncHealth({ entries }: { entries: HealthEntry[] | undefined }) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-text-muted" />
        <h2 className="heading-caps text-micro font-medium text-text-muted">
          Stanje sinhronizacije
        </h2>
      </div>

      <div className="mt-5">
        {entries === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Još nema pokrenutih sinhronizacija. Klikni „Sinhronizuj” na nekoj
            integraciji.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {entries.map((entry) => (
              <li
                key={entry.provider}
                className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {syncPill(entry.status, entry.note)}
                    <span className="text-sm text-foreground">
                      {PROVIDER_LABELS[entry.provider]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    {entry.status === "ok" && (
                      <span className="tabular-nums">
                        {entry.itemsWritten} zapisa
                      </span>
                    )}
                    <span>{formatRelativeTime(entry.startedAt)}</span>
                  </div>
                </div>
                {entry.note && (
                  <p className="text-xs leading-relaxed text-text-muted">
                    {entry.note}
                  </p>
                )}
                {entry.error && (
                  <p className="text-xs leading-relaxed text-danger">
                    {entry.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <MetaAdsQuota />
      <GoogleAdsKvota />
    </section>
  );
}
