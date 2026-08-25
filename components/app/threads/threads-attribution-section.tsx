"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, GitMerge, HelpCircle, Link2, MousePointerClick } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import { EmptyState } from "@/components/app/empty-state";

export type LinkAttributionSummary =
  FunctionReturnType<typeof api.threadsFunnels.getThreadsLinkAttributionSummary>;

export type UnmatchedUrlItem =
  FunctionReturnType<typeof api.threadsFunnels.listUnmatchedUrls>[number];

export function ThreadsAttributionSection({
  attributionSummary,
  unmatchedUrls,
}: {
  attributionSummary?: LinkAttributionSummary;
  unmatchedUrls?: UnmatchedUrlItem[];
}) {
  const matchedLinks = attributionSummary?.matchedLinks ?? [];
  const unmatchedSummary = attributionSummary?.unmatchedSummary;

  // Računanje agregata za period ISKLJUČIVO PRI PRIKAZU (§10.2).
  //
  // SPOJENI i NESPOJENI klikovi se drže ODVOJENO, i to nije kozmetika.
  // `siteClicks` po prirodi postoji samo za spojene linkove — nespojen URL je
  // upravo onaj koji nismo umeli da vežemo ni za jedan praćeni link. Ako se
  // nespojeni Threads klikovi uračunaju u imenilac, stopa deli brojilac koji
  // pokriva samo spojene linkove imeniocem koji pokriva i one koje ne pokriva —
  // i sistematski prijavljuje nižu stopu nego što jeste, kao utvrđen podatak.
  let matchedThreadsClicks: number | null = null;
  let totalSiteClicks: number | null = null;

  for (const link of matchedLinks) {
    if (link.threadsClicks !== undefined && link.threadsClicks !== null) {
      matchedThreadsClicks = (matchedThreadsClicks ?? 0) + link.threadsClicks;
    }
    if (link.siteClicks !== undefined && link.siteClicks !== null) {
      totalSiteClicks = (totalSiteClicks ?? 0) + link.siteClicks;
    }
  }

  const unmatchedThreadsClicks =
    unmatchedSummary?.unmatchedTotalThreadsClicks ?? null;

  // Za prikaz „koliko je Threads ukupno izbrojao" — spojeni + nespojeni.
  const totalThreadsClicks =
    matchedThreadsClicks === null && unmatchedThreadsClicks === null
      ? null
      : (matchedThreadsClicks ?? 0) + (unmatchedThreadsClicks ?? 0);

  // Stopa se računa ISKLJUČIVO nad spojenim linkovima — jedini skup za koji
  // postoje oba broja.
  const overallLandingRate =
    matchedThreadsClicks !== null &&
    totalSiteClicks !== null &&
    matchedThreadsClicks > 0
      ? totalSiteClicks / matchedThreadsClicks
      : null;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6 shadow-card ring-line">
        {/* Header & Objašnjenje (§10.2) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
              <GitMerge className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Atribucija linkova i levak poseta (§10.2)
              </h2>
              <p className="text-xs text-text-muted">
                Dva nezavisna brojača: klik u Threads aplikaciji naspram stvarnog dolaska na sajt
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-line-soft bg-surface-raised/40 p-3 text-xs leading-relaxed text-text-muted">
            <HelpCircle className="size-4 shrink-0 text-accent-400 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="text-foreground">Zašto se brojevi razlikuju?</strong>{" "}
              <code className="text-accent-400 font-mono">threadsClicks</code> je broj
              korisnika koji su dodirnuli link u Threads aplikaciji (prema Meta API-ju).{" "}
              <code className="text-accent-400 font-mono">siteClicks</code> je stvaran broj
              posetilaca koji su stigli na naš server kroz <code className="text-accent-400 font-mono">/r/</code> redirekt.
              Razlika nastaje usled odustajanja pre učitavanja, prekida veze ili blokiranja praćenja.
            </div>
          </div>
        </div>

        {/* Zbirne kartice */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-line-soft bg-surface-raised/30 p-4">
            <span className="text-micro font-medium uppercase tracking-wider text-text-muted">
              Threads klikovi (u aplikaciji)
            </span>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">
              {totalThreadsClicks !== null ? formatNumber(totalThreadsClicks) : "—"}
            </p>
            <p className="mt-1 text-micro text-text-muted">
              Izvor: Threads Insights API
            </p>
          </div>

          <div className="rounded-lg border border-line-soft bg-surface-raised/30 p-4">
            <span className="text-micro font-medium uppercase tracking-wider text-text-muted">
              Dolasci na sajt (verifikovano)
            </span>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">
              {totalSiteClicks !== null ? formatNumber(totalSiteClicks) : "—"}
            </p>
            <p className="mt-1 text-micro text-text-muted">
              Izvor: /r/ server praćeni linkovi
            </p>
          </div>

          <div className="rounded-lg border border-line-soft bg-surface-raised/30 p-4">
            <span className="text-micro font-medium uppercase tracking-wider text-text-muted">
              Stopa uspešnog dolaska
            </span>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-accent-400">
              {overallLandingRate !== null ? formatPercent(overallLandingRate) : "—"}
            </p>
            <p className="mt-1 text-micro text-text-muted">
              Dolasci / Threads klikovi — samo spojeni linkovi
              {unmatchedThreadsClicks !== null && unmatchedThreadsClicks > 0
                ? ` (${formatNumber(unmatchedThreadsClicks)} nespojenih klikova nije uračunato)`
                : ""}
            </p>
          </div>

          <div className="rounded-lg border border-line-soft bg-surface-raised/30 p-4">
            <span className="text-micro font-medium uppercase tracking-wider text-text-muted">
              Nespojeni URL-ovi (rupa)
            </span>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-warning">
              {unmatchedSummary
                ? formatNumber(unmatchedSummary.unmatchedCount)
                : "—"}
            </p>
            <p className="mt-1 text-micro text-text-muted">
              {unmatchedSummary
                ? "Linkovi van /r/ sistema praćenja"
                : "Nije sinhronizovano — rupa nije izmerena"}
            </p>
          </div>
        </div>

        {/* Tabela spojenih linkova */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Praćeni linkovi sa Threads naloga ({matchedLinks.length})
          </h3>

          {matchedLinks.length === 0 ? (
            <EmptyState icon={Link2}>
              Nema zabeleženih spojenih linkova za Threads nalog u ovom periodu.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-text-muted">
                  <tr>
                    <th className="py-2.5 font-medium">Praćeni link / Oznaka</th>
                    <th className="py-2.5 font-medium">Odredišni URL</th>
                    <th className="py-2.5 text-right font-medium">Threads klikovi</th>
                    <th className="py-2.5 text-right font-medium">Dolasci na sajt</th>
                    <th className="py-2.5 text-right font-medium">Razlika (odliv)</th>
                    <th className="py-2.5 text-right font-medium">Stopa dolaska</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {matchedLinks.map((item) => {
                    const thClicks = item.threadsClicks;
                    const stClicks = item.siteClicks;
                    const hasBoth = thClicks !== undefined && stClicks !== undefined;
                    const dropoff = hasBoth ? thClicks - stClicks : null;
                    const rate =
                      hasBoth && thClicks > 0 ? stClicks / thClicks : null;

                    return (
                      <tr key={item.trackedLinkId} className="hover:bg-surface-raised/50">
                        <td className="py-2.5 font-medium text-foreground">
                          <div className="flex flex-col">
                            <span className="font-mono text-accent-400">
                              /r/{item.slug}
                            </span>
                            {item.label && (
                              <span className="text-micro text-text-muted">
                                {item.label}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 max-w-xs truncate text-text-muted font-mono">
                          <a
                            href={item.destinationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-foreground inline-flex items-center gap-1"
                          >
                            <span className="truncate">{item.destinationUrl}</span>
                            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                          </a>
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-foreground">
                          {thClicks !== undefined ? formatNumber(thClicks) : "—"}
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-foreground">
                          {stClicks !== undefined ? formatNumber(stClicks) : "—"}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular-nums text-text-secondary">
                          {dropoff !== null ? (
                            dropoff > 0 ? `-${formatNumber(dropoff)}` : formatNumber(dropoff)
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-accent-400">
                          {rate !== null ? formatPercent(rate) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Tabela nespojenih URL-ova — Rupa u atribuciji (§10.2) */}
      {(unmatchedUrls && unmatchedUrls.length > 0) || (unmatchedSummary && unmatchedSummary.unmatchedCount > 0) ? (
        <Card className="p-6 shadow-card ring-line border-warning/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">
              Nespojeni URL-ovi — Vidljiva rupa u atribuciji (§10.2)
            </h3>
          </div>
          <p className="text-xs text-text-muted leading-relaxed mb-4">
            Sledeći URL-ovi su zabeležili klikove u Threads aplikaciji, ali nisu objavljeni kao
            praćeni <code className="text-accent-400 font-mono">/r/</code> linkovi. Za ove linkove
            ne možemo potvrditi stvarni dolazak na sajt.
          </p>

          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface border-b border-line text-text-muted">
                <tr>
                  <th className="py-2 font-medium">Objavljeni URL</th>
                  <th className="py-2 font-medium">Datum</th>
                  <th className="py-2 text-right font-medium">Threads klikovi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {(unmatchedUrls ?? []).map((u) => (
                  <tr key={u._id} className="hover:bg-surface-raised/50">
                    <td className="py-2 font-mono text-foreground max-w-md truncate">
                      {u.rawUrl}
                    </td>
                    <td className="py-2 font-mono text-text-muted">{u.date}</td>
                    <td className="py-2 text-right font-mono font-semibold tabular-nums text-foreground">
                      {u.threadsClicks !== undefined ? formatNumber(u.threadsClicks) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
