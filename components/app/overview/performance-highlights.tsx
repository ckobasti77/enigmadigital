"use client";

import Link from "next/link";
import {
  Flame,
  ArrowUpRight,
  MessageCircleReply,
  Camera,
  ExternalLink,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Eye,
  Target,
  Sparkles,
  Unplug,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPercent, formatShortDate } from "@/lib/format";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

type AttributionReport = FunctionReturnType<typeof api.attribution.report>;
type MediaItem = FunctionReturnType<typeof api.instagramStore.mediaList>[number];

export function PerformanceHighlights({
  report,
  mediaList,
  hasOpenReply,
  hasInstagram,
  hasGa4,
}: {
  report: AttributionReport | undefined;
  mediaList: MediaItem[] | undefined;
  hasOpenReply: boolean;
  hasInstagram: boolean;
  hasGa4: boolean;
}) {
  // 1. Find top campaign by attributed conversions, then by link clicks/DMs
  const sortedCampaigns = [...(report?.campaigns ?? [])].sort((a, b) => {
    if (b.ga4Conversions !== a.ga4Conversions) {
      return b.ga4Conversions - a.ga4Conversions;
    }
    if (b.ga4Sessions !== a.ga4Sessions) {
      return b.ga4Sessions - a.ga4Sessions;
    }
    return b.linkClicks - a.linkClicks;
  });
  const topCampaign = sortedCampaigns.length > 0 ? sortedCampaigns[0] : null;

  // 2. Find top IG post by reach
  const sortedMedia = [...(mediaList ?? [])].sort((a, b) => b.reach - a.reach);
  const topPost = sortedMedia.length > 0 ? sortedMedia[0] : null;

  return (
    <section className="rounded-xl border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg border border-line-soft bg-surface-raised/50 text-accent-400">
            <Flame className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Šta radi</h2>
            <p className="text-xs text-text-muted">
              Najbolji kanali i sadržaj sa najviše rezultata u izabranom periodu
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left Column: Top Attributed Campaign */}
        <div className="flex flex-col justify-between rounded-lg border border-line-soft bg-surface-raised/30 p-5">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-line-soft pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md border border-line-soft bg-surface-raised text-accent-400">
                  <Target className="size-3.5" />
                </div>
                <span className="heading-caps text-xs font-medium text-text-muted">
                  Top kampanja po konverzijama
                </span>
              </div>
              <Link
                href="/atribucija"
                className="group flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent-400"
              >
                <span>Levak</span>
                <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>

            {!hasOpenReply || !hasGa4 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Unplug className="size-6 text-text-muted" />
                <p className="mt-2 text-xs text-text-muted">
                  {!hasOpenReply && !hasGa4
                    ? "OpenReply i GA4 nisu povezani"
                    : !hasOpenReply
                      ? "OpenReply nije povezan"
                      : "GA4 nije povezan"}
                </p>
                <Link
                  href="/settings"
                  className="mt-3 text-xs text-accent-400 underline-offset-4 hover:underline"
                >
                  Poveži integracije u Podešavanjima →
                </Link>
              </div>
            ) : !topCampaign ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Sparkles className="size-6 text-text-muted" />
                <p className="mt-2 text-xs text-text-muted">
                  Nema zabeleženih kampanja u izabranom periodu
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {topCampaign.name}
                      </h3>
                      {topCampaign.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                          <span className="size-1 rounded-full bg-success" />
                          Aktivna
                        </span>
                      ) : (
                        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-text-muted">
                          Neaktivna
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs text-text-muted">
                      Ključna reč: <span className="text-foreground">#{topCampaign.keyword}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="heading-caps text-[10px] font-medium text-text-muted">
                      Konverzije
                    </p>
                    <p className="font-mono text-2xl font-bold tabular-nums text-accent-400">
                      {formatNumber(topCampaign.ga4Conversions)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-lg border border-line-soft bg-surface-raised/40 p-3 text-xs">
                  <div>
                    <span className="text-[11px] text-text-muted">Poslato DM</span>
                    <p className="mt-0.5 font-mono font-medium tabular-nums text-foreground">
                      {formatNumber(topCampaign.dmsSent)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-text-muted">Klikovi (CTR)</span>
                    <p className="mt-0.5 font-mono font-medium tabular-nums text-foreground">
                      {formatNumber(topCampaign.linkClicks)}{" "}
                      <span className="text-text-muted text-[10px]">
                        ({formatPercent(topCampaign.ctr)})
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-text-muted">GA4 sesije</span>
                    <p className="mt-0.5 font-mono font-medium tabular-nums text-foreground">
                      {formatNumber(topCampaign.ga4Sessions)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-line-soft/60 pt-3 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <MessageCircleReply className="size-3 text-accent-400" />
              <span>Automatizacija: OpenReply + GA4 UTM</span>
            </span>
            <Link
              href="/atribucija"
              className="text-text-secondary hover:text-accent-400 transition-colors"
            >
              Kompletan levak →
            </Link>
          </div>
        </div>

        {/* Right Column: Top Instagram Post by Reach */}
        <div className="flex flex-col justify-between rounded-lg border border-line-soft bg-surface-raised/30 p-5">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-line-soft pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md border border-line-soft bg-surface-raised text-accent-400">
                  <Camera className="size-3.5" />
                </div>
                <span className="heading-caps text-xs font-medium text-text-muted">
                  Top Instagram objava po dosegu
                </span>
              </div>
              <Link
                href="/instagram"
                className="group flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent-400"
              >
                <span>Instagram</span>
                <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>

            {!hasInstagram ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Unplug className="size-6 text-text-muted" />
                <p className="mt-2 text-xs text-text-muted">
                  Instagram nalog nije povezan
                </p>
                <Link
                  href="/settings"
                  className="mt-3 text-xs text-accent-400 underline-offset-4 hover:underline"
                >
                  Poveži Instagram u Podešavanjima →
                </Link>
              </div>
            ) : !topPost ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Sparkles className="size-6 text-text-muted" />
                <p className="mt-2 text-xs text-text-muted">
                  Nema sinhronizovanih objava
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-line-soft bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-text-secondary uppercase">
                        {topPost.mediaType.replace("_", " ")}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {formatShortDate(
                          new Date(topPost.publishedAt).toISOString().slice(0, 10),
                        )}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground">
                      {topPost.caption || "(Bez teksta objave)"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="heading-caps text-[10px] font-medium text-text-muted">
                      Doseg (Reach)
                    </p>
                    <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
                      {formatNumber(topPost.reach)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 rounded-lg border border-line-soft bg-surface-raised/40 p-3 text-xs">
                  <div className="flex items-center gap-1.5 text-text-muted">
                    <Heart className="size-3.5 text-danger/80" />
                    <span className="font-mono tabular-nums text-foreground">
                      {formatNumber(topPost.likes)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-text-muted">
                    <MessageCircle className="size-3.5 text-text-muted" />
                    <span className="font-mono tabular-nums text-foreground">
                      {formatNumber(topPost.comments)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-text-muted">
                    <Share2 className="size-3.5 text-accent-400" />
                    <span className="font-mono tabular-nums text-foreground">
                      {formatNumber(topPost.shares)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-text-muted">
                    <Bookmark className="size-3.5 text-warning/80" />
                    <span className="font-mono tabular-nums text-foreground">
                      {formatNumber(topPost.saves)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-line-soft/60 pt-3 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <Eye className="size-3 text-accent-400" />
              <span>Organski uvid sa Instagrama</span>
            </span>
            {topPost?.permalink ? (
              <a
                href={topPost.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-text-secondary hover:text-accent-400 transition-colors"
              >
                <span>Pogledaj na Instagramu</span>
                <ExternalLink className="size-3" />
              </a>
            ) : (
              <Link
                href="/instagram"
                className="text-text-secondary hover:text-accent-400 transition-colors"
              >
                Sve objave →
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function PerformanceHighlightsSkeleton() {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-7 rounded-lg" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="h-56 rounded-lg border border-line-soft bg-surface-raised/30 p-5 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="h-56 rounded-lg border border-line-soft bg-surface-raised/30 p-5 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </section>
  );
}
