"use client";

import { Eye, Users, Heart, MessageCircle, Bookmark, Share2, Repeat, Sparkles, MessageSquare, Globe } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { PostDetailHeader } from "./post-detail-header";
import { PostMetricCard } from "./post-metric-card";
import { PostProfileActions } from "./post-profile-actions";
import { PostReelsPerformance } from "./post-reels-performance";
import { PostStoryFunnel } from "./post-story-funnel";
import type { MetricState } from "@/convex/lib/igMetrics";

export interface PostDetailMediaData {
  _id: string;
  mediaId: string;
  mediaType: string;
  caption: string;
  permalink: string;
  publishedAt: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  views: number;
  reposts?: number;
  profileVisits?: number;
  follows?: number;
  replies?: number;
  totalInteractions?: number;
  reelsAvgWatchTimeMs?: number;
  reelsVideoViewTotalTimeMs?: number;
  reelsSkipRate?: number;
  crosspostedViews?: number;
  facebookViews?: number;
  deletedAt?: number;
  commentsEnabled?: boolean;
  children?: { id: string; mediaType: string }[];
  metricStates?: Record<string, { state: MetricState; reason?: string }>;
}

export interface PostDetailBreakdownData {
  _id: string;
  mediaId: string;
  metric: string;
  dimensionKey: string;
  dimensionValue: string;
  value?: number;
  state: MetricState;
  reason?: string;
}

export interface PostDetailViewProps {
  media: PostDetailMediaData;
  breakdowns: PostDetailBreakdownData[];
}

export function PostDetailView({ media, breakdowns }: PostDetailViewProps) {
  const upperType = (media.mediaType || "").toUpperCase();
  const isReels = upperType.includes("REEL") || upperType.includes("VIDEO");
  const isStory = upperType.includes("STORY");
  const isFeed = !isReels && !isStory;

  const states = media.metricStates ?? {};

  const getState = (metricKey: string): MetricState => {
    return states[metricKey]?.state ?? "value";
  };

  const getReason = (metricKey: string): string | undefined => {
    return states[metricKey]?.reason;
  };

  return (
    <div className="flex flex-col gap-10 pb-16">
      {/* 1. Zaglavlje objave */}
      <Reveal>
        <PostDetailHeader
          mediaId={media.mediaId}
          mediaType={media.mediaType}
          caption={media.caption}
          permalink={media.permalink}
          publishedAt={media.publishedAt}
          deletedAt={media.deletedAt}
          commentsEnabled={media.commentsEnabled}
          slides={media.children}
        />
      </Reveal>

      {/* 2. Grupa: Šta je objava donela (FEED i STORY — izostavljeno za REELS) */}
      {(isFeed || isStory) && (
        <Reveal>
          <PostProfileActions
            profileVisits={media.profileVisits}
            profileVisitsState={getState("profile_visits")}
            profileVisitsReason={getReason("profile_visits")}
            follows={media.follows}
            followsState={getState("follows")}
            followsReason={getReason("follows")}
            breakdowns={breakdowns}
          />
        </Reveal>
      )}

      {/* 3. Grupa: Domet */}
      <Reveal>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="heading-caps text-micro font-semibold text-text-muted">
              Vidljivost i publika
            </span>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Domet i pregledi
            </h2>
            <p className="text-xs text-text-muted">
              Broj jedinstvenih naloga i ukupna izloženost ovog sadržaja (samo organski podaci).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PostMetricCard
              label="Ukupno pregleda"
              value={media.views}
              state={getState("views")}
              reason={getReason("views")}
              icon={Eye}
              description="Ukupan broj reprodukcija ili otvaranja ovog sadržaja."
            />

            <PostMetricCard
              label="Doseg (Reach)"
              value={media.reach}
              state={getState("reach")}
              reason={getReason("reach")}
              isEstimate
              isOrganicOnly
              icon={Users}
              description="Procenjen broj jedinstvenih naloga koji su videli objavu."
            />

            <PostMetricCard
              label="Facebook pregledi"
              value={media.facebookViews}
              state={getState("facebook_views")}
              reason={getReason("facebook_views")}
              icon={Globe}
              description="Broj pregleda ostvarenih kada je sadržaj prikazan na Facebook-u."
            />

            {isReels && (
              <PostMetricCard
                label="Crosspost pregledi"
                value={media.crosspostedViews}
                state={getState("crossposted_views")}
                reason={getReason("crossposted_views")}
                icon={Share2}
                description="Pregledi sa deljenja na povezanim profilima i platformama."
              />
            )}
          </div>
        </div>
      </Reveal>

      {/* 4. Grupa: Interakcije */}
      <Reveal>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="heading-caps text-micro font-semibold text-text-muted">
              Angažovanje publike
            </span>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Interakcije sa sadržajem
            </h2>
            <p className="text-xs text-text-muted">
              Aktivno reagovanje publike kroz lajkove, deljenja, komentare i čuvanja.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* Likes (Feed & Reels only) */}
            {!isStory && (
              <PostMetricCard
                label="Lajkovi"
                value={media.likes}
                state={getState("likes")}
                reason={getReason("likes")}
                icon={Heart}
              />
            )}

            {/* Comments (Feed & Reels only) */}
            {!isStory && (
              <PostMetricCard
                label="Komentari"
                value={media.comments}
                state={getState("comments")}
                reason={getReason("comments")}
                icon={MessageCircle}
              />
            )}

            {/* Saved (Feed & Reels only) */}
            {!isStory && (
              <PostMetricCard
                label="Sačuvano"
                value={media.saves}
                state={getState("saved")}
                reason={getReason("saved")}
                icon={Bookmark}
              />
            )}

            {/* Shares (Feed, Reels & Story) */}
            <PostMetricCard
              label="Deljenja"
              value={media.shares}
              state={getState("shares")}
              reason={getReason("shares")}
              icon={Share2}
            />

            {/* Reposts (Feed, Reels & Story) */}
            <PostMetricCard
              label="Ponovne objave"
              value={media.reposts}
              state={getState("reposts")}
              reason={getReason("reposts")}
              icon={Repeat}
            />

            {/* Replies (Story only) */}
            {isStory && (
              <PostMetricCard
                label="Odgovori na priču"
                value={media.replies}
                state={getState("replies")}
                reason={getReason("replies")}
                icon={MessageSquare}
              />
            )}

            {/* Total interactions (Feed, Reels & Story) */}
            <PostMetricCard
              label="Ukupno interakcija"
              value={media.totalInteractions}
              state={getState("total_interactions")}
              reason={getReason("total_interactions")}
              icon={Sparkles}
              highlight
            />
          </div>
        </div>
      </Reveal>

      {/* 5. Grupa: Samo Reels */}
      {isReels && (
        <Reveal>
          <PostReelsPerformance
            avgWatchTimeMs={media.reelsAvgWatchTimeMs}
            avgWatchTimeState={getState("ig_reels_avg_watch_time")}
            avgWatchTimeReason={getReason("ig_reels_avg_watch_time")}
            totalViewTimeMs={media.reelsVideoViewTotalTimeMs}
            totalViewTimeState={getState("ig_reels_video_view_total_time")}
            totalViewTimeReason={getReason("ig_reels_video_view_total_time")}
            skipRate={media.reelsSkipRate}
            skipRateState={getState("reels_skip_rate")}
            skipRateReason={getReason("reels_skip_rate")}
            crosspostedViews={media.crosspostedViews}
            crosspostedViewsState={getState("crossposted_views")}
            crosspostedViewsReason={getReason("crossposted_views")}
          />
        </Reveal>
      )}

      {/* 6. Grupa: Samo Story — Levak navigacije */}
      {isStory && (
        <Reveal>
          <PostStoryFunnel breakdowns={breakdowns} />
        </Reveal>
      )}
    </div>
  );
}
