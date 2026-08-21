"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  AlertCircle,
  Archive,
  Clock,
  ExternalLink,
  Flame,
  Info,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PostImage } from "@/components/app/instagram/post-media";
import { PostStoryFunnel } from "@/components/app/instagram/post-detail/post-story-funnel";
import { Reveal, RevealGroup } from "@/components/motion/reveal";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STORY_BELOW_THRESHOLD_REASON } from "@/convex/lib/igMediaMetrics";

/**
 * Format remaining duration until story expiration in Serbian.
 */
function formatRemainingTime(expiresAt: number, now: number): string {
  const diffMs = expiresAt - now;
  if (diffMs <= 0) return "Istekla";
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `ističe za ${hours}h ${minutes}min`;
  }
  return `ističe za ${minutes}min`;
}

/**
 * Self-updating countdown badge (every 30s) without re-triggering Reveal animations.
 */
function StoryCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const text = formatRemainingTime(expiresAt, now);
  const isUrgent = expiresAt - now < 60 * 60 * 1000;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs",
        isUrgent ? "font-semibold text-warning-400" : "text-text-muted",
      )}
      title="Odbrojavanje do isteka priče na Instagramu"
    >
      <Clock className="size-3 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}

export function InstagramStories() {
  const data = useQuery(api.instagramStore.getStoriesOverview, {});
  const pollManual = useAction(api.instagram.pollStoriesManual);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  const { liveStories, archivedStories, hasConnection } = data ?? {
    liveStories: [],
    archivedStories: [],
    hasConnection: true,
  };

  const activeStoryId =
    selectedStoryId ??
    liveStories[0]?.storyId ??
    archivedStories[0]?.storyId ??
    null;

  const selectedStory = useMemo(() => {
    if (!activeStoryId) return null;
    return (
      liveStories.find((s) => s.storyId === activeStoryId) ??
      archivedStories.find((s) => s.storyId === activeStoryId) ??
      null
    );
  }, [activeStoryId, liveStories, archivedStories]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await pollManual();
    } catch (e) {
      console.error("Greška pri ručnom osvežavanju priča:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (data === undefined) {
    return <InstagramStoriesSkeleton />;
  }

  if (!hasConnection) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center shadow-card ring-line">
        <AlertCircle className="size-8 text-warning-400" aria-hidden="true" />
        <h2 className="mt-4 text-base font-semibold text-foreground">
          Instagram nalog nije povezan
        </h2>
        <p className="mt-1 max-w-md text-sm text-text-muted leading-relaxed">
          Povežite Instagram nalog u Podešavanjima da biste pratili aktivne priče
          i analitiku gledalaca.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Top action bar: Sync button & info */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent-400" aria-hidden="true" />
          <span className="text-xs text-text-muted">
            Automatska anketa aktivnih priča svakih 30 minuta
          </span>
        </div>

        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
          className="gap-1.5"
        >
          <RefreshCw
            className={cn("size-3.5", isRefreshing && "animate-spin")}
            aria-hidden="true"
          />
          <span>{isRefreshing ? "Osvežavanje..." : "Osveži priče"}</span>
        </Button>
      </div>

      {/* 1. ŽIVE PRIČE (Live Stories) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-3">
          <div className="flex items-center gap-2">
            <Flame className="size-4 text-accent-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">
              Aktivne priče ({liveStories.length})
            </h2>
          </div>
          {liveStories.length > 0 && (
            <span className="text-xs text-text-muted">
              Izaberite priču za prikaz levka navigacije
            </span>
          )}
        </div>

        {liveStories.length === 0 ? (
          <div className="flex flex-col py-6">
            <p className="text-sm text-text-muted">
              Trenutno nema aktivnih priča.
            </p>
          </div>
        ) : (
          <RevealGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {liveStories.map((story) => {
              const isSelected = activeStoryId === story.storyId;
              const viewsState = story.stats?.metricStates?.views?.state;
              const reachState = story.stats?.metricStates?.reach?.state;
              const isBelowThreshold =
                viewsState === "suppressed" || reachState === "suppressed";
              const suppressedReason =
                story.stats?.metricStates?.views?.reason ??
                story.stats?.metricStates?.reach?.reason ??
                STORY_BELOW_THRESHOLD_REASON;

              return (
                <Card
                  key={story.storyId}
                  onClick={() => setSelectedStoryId(story.storyId)}
                  className={cn(
                    "group relative flex flex-col overflow-hidden p-0 transition-all cursor-pointer shadow-card ring-line hover:ring-line-strong",
                    isSelected && "ring-2 ring-accent-400 bg-surface-raised/40",
                  )}
                >
                  {/* Thumbnail / Media box (9:16 aspect ratio preview) */}
                  <div className="relative aspect-[9/16] w-full overflow-hidden bg-bg-950">
                    <PostImage
                      src={`/ig-media/${story.storyId}`}
                      alt="Instagram priča"
                      type={story.mediaType}
                      variant="grid"
                      zoomOnHover
                    />

                    {/* Top overlay: Countdown & badge */}
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3">
                      <span className="rounded-xs bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                        {story.mediaType === "VIDEO" ? "Video" : "Slika"}
                      </span>
                      <div className="rounded-xs bg-black/60 px-2 py-0.5 backdrop-blur-xs">
                        <StoryCountdown expiresAt={story.expiresAt} />
                      </div>
                    </div>

                    {/* Permalink icon if available */}
                    {story.permalink && (
                      <a
                        href={story.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white/80 opacity-0 transition-opacity hover:text-white group-hover:opacity-100 backdrop-blur-xs"
                        title="Otvori na Instagramu"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  {/* Metrics summary */}
                  <div className="flex flex-col gap-2.5 p-4">
                    {isBelowThreshold ? (
                      <div className="flex items-start gap-2 rounded-md bg-surface-raised/80 p-2.5 text-[11px] text-text-secondary leading-relaxed">
                        <Info className="size-3.5 shrink-0 text-accent-400 mt-0.5" aria-hidden="true" />
                        <span>{suppressedReason}</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 border-t border-line/40 pt-2 font-mono text-xs">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-wider text-text-muted font-sans">
                            Pregledi
                          </span>
                          <span className="text-base font-bold text-foreground">
                            {formatNumber(story.stats?.views ?? 0)}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-wider text-text-muted font-sans">
                            Doseg
                          </span>
                          <span className="text-base font-bold text-foreground">
                            {formatNumber(story.stats?.reach ?? 0)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-text-muted pt-1">
                      <span>Objavljeno: {formatDateTime(story.timestamp)}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </RevealGroup>
        )}
      </section>

      {/* 2. LEVAK NAVIGACIJE (Navigation Funnel) */}
      {selectedStory && (
        <Reveal>
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 border-b border-line/60 pb-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Levak navigacije za izabranu priču
                </h3>
                <span className="font-mono text-xs text-text-muted">
                  ID: {selectedStory.storyId}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Vizuelna segmentacija ponašanja gledalaca (napuštanje,
                preskakanje na sledeći nalog, prelazak na sledeći stori ili
                povratak).
              </p>
            </div>

            <PostStoryFunnel breakdowns={selectedStory.breakdowns} />

            {/* Educational note on Navigation Funnel distinctions */}
            <Card className="flex flex-col gap-2 border-line bg-surface/40 p-4 text-xs text-text-secondary shadow-card">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Info className="size-4 text-accent-400" aria-hidden="true" />
                <span>Razumevanje radnji gledalaca:</span>
              </div>
              <p className="leading-relaxed">
                <strong className="text-foreground">Napuštanje priče (Tap exit)</strong> označava da je korisnik potpuno zatvorio pregled priča i vratio se na glavni feed.{" "}
                <strong className="text-foreground">Prevlačenje na sledeći nalog (Swipe forward)</strong> označava da je korisnik preskočio vaš nalog i prešao na priče sledećeg kreatora.
                Ova dva događaja predstavljaju različite tipove odustajanja i pomažu u optimizaciji sadržaja.
              </p>
            </Card>
          </section>
        </Reveal>
      )}

      {/* 3. ARHIVA ISTEKLIH PRIČA (Archived Stories) */}
      {archivedStories.length > 0 && (
        <section className="flex flex-col gap-4 pt-4 border-t border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
            <div className="flex items-center gap-2">
              <Archive className="size-4 text-text-muted" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">
                Istorijska arhiva priča ({archivedStories.length})
              </h2>
            </div>
            <p className="text-xs text-text-muted italic">
              Istekle priče sa sačuvanim brojkama zabeleženim dok su bile aktivne.
            </p>
          </div>

          <RevealGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-85">
            {archivedStories.map((story) => {
              const isSelected = activeStoryId === story.storyId;
              const viewsState = story.stats?.metricStates?.views?.state;
              const reachState = story.stats?.metricStates?.reach?.state;
              const isBelowThreshold =
                viewsState === "suppressed" || reachState === "suppressed";

              return (
                <Card
                  key={story.storyId}
                  onClick={() => setSelectedStoryId(story.storyId)}
                  className={cn(
                    "group relative flex flex-col overflow-hidden p-0 transition-all cursor-pointer shadow-card ring-line hover:ring-line-strong bg-surface/60",
                    isSelected && "ring-2 ring-accent-400 bg-surface-raised/40",
                  )}
                >
                  <div className="relative aspect-[9/16] w-full overflow-hidden bg-bg-950 grayscale-[25%]">
                    <PostImage
                      src={`/ig-media/${story.storyId}`}
                      alt="Istekla Instagram priča"
                      type={story.mediaType}
                      variant="grid"
                      zoomOnHover
                    />

                    <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3">
                      <span className="rounded-xs bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-xs">
                        Arhivirana
                      </span>
                      <span className="font-mono text-[10px] text-text-muted">
                        {story.archivedAt ? "Istekla" : "Arhivirano"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 p-4">
                    {isBelowThreshold ? (
                      <p className="text-[11px] text-text-muted">
                        {STORY_BELOW_THRESHOLD_REASON}
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 border-t border-line/40 pt-2 font-mono text-xs">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-wider text-text-muted font-sans">
                            Pregledi
                          </span>
                          <span className="text-base font-bold text-foreground">
                            {formatNumber(story.stats?.views ?? 0)}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-wider text-text-muted font-sans">
                            Doseg
                          </span>
                          <span className="text-base font-bold text-foreground">
                            {formatNumber(story.stats?.reach ?? 0)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-text-muted pt-1">
                      <span>Objavljeno: {formatDateTime(story.timestamp)}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </RevealGroup>

          {/* Mandatory note as specified in prompt §4.3 */}
          <p className="text-xs text-text-muted leading-relaxed pt-2">
            Instagram ne isporučuje uvide za priče starije od 24 sata. Prikazane
            brojke su poslednje što je zabeleženo dok je priča bila aktivna.
          </p>
        </section>
      )}
    </div>
  );
}

export function InstagramStoriesSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface p-0"
          >
            <Skeleton className="aspect-[9/16] w-full" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
