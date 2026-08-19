"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { MessageCircleReply, Link2, Sparkles, Globe, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatPercent } from "@/lib/format";

type AttributionReport = FunctionReturnType<typeof api.attribution.report>;
type Totals = AttributionReport["totals"];
type UnmatchedGa4 = AttributionReport["unmatchedGa4"];

export function InstagramBreakdown({
  totals,
  unmatchedGa4,
}: {
  totals: Totals;
  unmatchedGa4: UnmatchedGa4;
}) {
  const totalSessions = totals.totalInstagram.sessions;
  const totalConversions = totals.totalInstagram.conversions;

  const channels = [
    {
      id: "openreply",
      name: "OpenReply DM automatizacija",
      medium: "openreply-dm",
      icon: MessageCircleReply,
      sessions: totals.openreply.sessions,
      conversions: totals.openreply.conversions,
      conversionRate: totals.openreply.conversionRate,
      primary: true,
    },
    {
      id: "bio",
      name: "Instagram Bio link",
      medium: "bio",
      icon: Link2,
      sessions: totals.bio.sessions,
      conversions: totals.bio.conversions,
      conversionRate: totals.bio.conversionRate,
      primary: false,
    },
    {
      id: "story",
      name: "Instagram Story linkovi",
      medium: "story",
      icon: Sparkles,
      sessions: totals.story.sessions,
      conversions: totals.story.conversions,
      conversionRate: totals.story.conversionRate,
      primary: false,
    },
    {
      id: "other",
      name: "Ostali Instagram saobraćaj",
      medium: "—",
      icon: Globe,
      sessions: totals.otherInstagram.sessions,
      conversions: totals.otherInstagram.conversions,
      conversionRate: totals.otherInstagram.conversionRate,
      primary: false,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 py-0 shadow-card ring-line">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Instagram atribucija po kanalima (UTM Medium)
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              Poređenje performansi OpenReply automatizacije sa organskim Bio i
              Story linkovima.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-text-muted">
            <span>
              Ukupno sa IG: {formatNumber(totalSessions)} sesija ·{" "}
              {formatNumber(totalConversions)} konverzija
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-line-soft hover:bg-transparent">
                <TableHead className="pl-5 min-w-44">Kanal (Medium)</TableHead>
                <TableHead className="text-right">GA4 sesije</TableHead>
                <TableHead className="text-right">Udeo sesija</TableHead>
                <TableHead className="text-right">Konverzije</TableHead>
                <TableHead className="text-right">Stopa konverzije</TableHead>
                <TableHead className="pr-5 text-right">Udeo konverzija</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((ch) => {
                const sessionShare =
                  totalSessions > 0 ? ch.sessions / totalSessions : 0;
                const convShare =
                  totalConversions > 0 ? ch.conversions / totalConversions : 0;
                const Icon = ch.icon;

                return (
                  <TableRow
                    key={ch.id}
                    className="border-line-soft hover:bg-surface-raised/40"
                  >
                    <TableCell className="py-3.5 pl-5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                            ch.primary
                              ? "bg-accent-400/10 text-accent-400"
                              : "bg-surface-raised text-text-muted"
                          }`}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <div>
                          <p
                            className={`font-medium ${
                              ch.primary ? "text-foreground" : "text-text-primary"
                            }`}
                          >
                            {ch.name}
                          </p>
                          <p className="font-mono text-micro text-text-muted">
                            utm_medium={ch.medium}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-3.5 text-right font-mono tabular-nums text-foreground">
                      {ch.sessions > 0 ? formatNumber(ch.sessions) : "0"}
                    </TableCell>

                    <TableCell className="py-3.5 text-right font-mono tabular-nums text-text-muted">
                      {formatPercent(sessionShare)}
                    </TableCell>

                    <TableCell className="py-3.5 text-right font-mono tabular-nums">
                      <span
                        className={
                          ch.conversions > 0 && ch.primary
                            ? "font-semibold text-accent-400"
                            : "text-foreground"
                        }
                      >
                        {formatNumber(ch.conversions)}
                      </span>
                    </TableCell>

                    <TableCell className="py-3.5 text-right font-mono tabular-nums text-foreground">
                      {ch.sessions > 0 ? formatPercent(ch.conversionRate) : "—"}
                    </TableCell>

                    <TableCell className="py-3.5 pr-5 text-right font-mono tabular-nums text-text-muted">
                      <div className="flex items-center justify-end gap-2">
                        <span>{formatPercent(convShare)}</span>
                        <span
                          className="h-1.5 w-12 overflow-hidden rounded-full bg-line-soft"
                          aria-hidden
                        >
                          <span
                            className={`block h-full rounded-full ${
                              ch.primary ? "bg-accent-400" : "bg-text-muted"
                            }`}
                            style={{
                              width: `${Math.max(
                                convShare > 0 ? 4 : 0,
                                convShare * 100,
                              )}%`,
                            }}
                          />
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Totals Row */}
              <TableRow className="border-t border-line bg-surface-raised/20 font-medium hover:bg-surface-raised/30">
                <TableCell className="py-3.5 pl-5 font-semibold text-foreground">
                  Ukupno Instagram (svi medijumi)
                </TableCell>
                <TableCell className="py-3.5 text-right font-mono tabular-nums font-semibold text-foreground">
                  {formatNumber(totalSessions)}
                </TableCell>
                <TableCell className="py-3.5 text-right font-mono tabular-nums text-text-muted">
                  100%
                </TableCell>
                <TableCell className="py-3.5 text-right font-mono tabular-nums font-semibold text-accent-400">
                  {formatNumber(totalConversions)}
                </TableCell>
                <TableCell className="py-3.5 text-right font-mono tabular-nums font-semibold text-foreground">
                  {totalSessions > 0
                    ? formatPercent(totals.totalInstagram.conversionRate)
                    : "—"}
                </TableCell>
                <TableCell className="py-3.5 pr-5 text-right font-mono tabular-nums text-text-muted">
                  100%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Unmatched OpenReply GA4 traffic notification if any exists */}
      {unmatchedGa4.length > 0 && (
        <Card className="border-warning/30 bg-warning/5 p-4 shadow-card">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-4 shrink-0 text-warning mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-medium text-foreground">
                Pronađen je OpenReply GA4 saobraćaj bez odgovarajuće kampanje u bazi:
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {unmatchedGa4.map((u) => (
                  <li
                    key={u.sessionCampaign}
                    className="flex items-center gap-1.5 rounded bg-surface-raised px-2 py-1 font-mono text-micro text-text-primary"
                  >
                    <span className="text-warning">&quot;{u.sessionCampaign}&quot;</span>
                    <span className="text-text-muted">·</span>
                    <span>{formatNumber(u.sessions)} sesija</span>
                    <span className="text-text-muted">·</span>
                    <span>{formatNumber(u.conversions)} konverzija</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export function InstagramBreakdownSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="border-t border-line-soft">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line-soft px-5 py-4 last:border-0"
          >
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}
