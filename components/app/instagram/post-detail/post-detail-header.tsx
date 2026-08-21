"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Film, Layers, Image as ImageIcon, MessageSquareOff, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatLongDate, formatClockTime } from "@/lib/format";
import { igMediaSrc } from "@/lib/ig-media";
import { CarouselSwiper, type CarouselSlide } from "../carousel-swiper";
import { PostImage } from "../post-media";

export interface PostDetailHeaderProps {
  mediaId: string;
  mediaType: string;
  caption: string;
  permalink: string;
  publishedAt: number;
  deletedAt?: number;
  commentsEnabled?: boolean;
  slides?: CarouselSlide[];
}

export function PostDetailHeader({
  mediaId,
  mediaType,
  caption,
  permalink,
  publishedAt,
  deletedAt,
  commentsEnabled,
  slides,
}: PostDetailHeaderProps) {
  const upperType = (mediaType || "").toUpperCase();
  const isCarousel =
    upperType.includes("CAROUSEL") ||
    upperType.includes("ALBUM") ||
    (slides && slides.length > 0);
  const isReels = upperType.includes("REEL") || upperType.includes("VIDEO");
  const isStory = upperType.includes("STORY");

  const typeLabel = isStory
    ? "Story"
    : isReels
      ? "Reels"
      : isCarousel
        ? `Karusel (${slides?.length || 0})`
        : "Feed objava";

  const TypeIcon = isStory
    ? ImageIcon
    : isReels
      ? Film
      : isCarousel
        ? Layers
        : ImageIcon;

  const dateLabel = formatLongDate(
    new Date(publishedAt).toISOString().slice(0, 10),
  );
  const timeLabel = formatClockTime(publishedAt);

  return (
    <div className="flex flex-col gap-4">
      {/* Navigation breadcrumb */}
      <div>
        <Link
          href="/instagram"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Nazad na sve objave
        </Link>
      </div>

      <Card className="overflow-hidden p-6 shadow-card ring-line">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          {/* Visual media preview container */}
          <div className="relative aspect-square w-full max-w-[320px] overflow-hidden rounded-xl bg-bg-950 border border-line mx-auto lg:mx-0">
            {isCarousel && slides && slides.length > 0 ? (
              <CarouselSwiper
                mediaId={mediaId}
                slides={slides}
                caption={caption}
                variant="top"
              />
            ) : (
              <div className="relative size-full">
                <PostImage
                  src={igMediaSrc(mediaId)}
                  alt={caption ? caption.slice(0, 100) : "Instagram objava"}
                  type={mediaType}
                  variant="top"
                />
              </div>
            )}
          </div>

          {/* Details & Caption column */}
          <div className="flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-4">
              {/* Badges and metadata */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Media Type Badge */}
                <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-raised px-2.5 py-1 text-xs font-medium text-text-primary">
                  <TypeIcon className="size-3.5 text-accent-400" aria-hidden="true" />
                  {typeLabel}
                </span>

                {/* Date & Time */}
                <span className="text-xs font-mono text-text-muted">
                  Objavljeno: {dateLabel} u {timeLabel}
                </span>

                {/* Deleted Indicator */}
                {deletedAt !== undefined && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                    <Trash2 className="size-3" aria-hidden="true" />
                    Obrisano na Instagramu
                  </span>
                )}

                {/* Commenting status */}
                {commentsEnabled === false && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-raised px-2 py-0.5 text-xs font-medium text-text-muted">
                    <MessageSquareOff className="size-3" aria-hidden="true" />
                    Komentari isključeni
                  </span>
                )}
              </div>

              {/* Caption Text */}
              <div className="flex flex-col gap-1.5">
                <h3 className="heading-caps text-micro font-medium text-text-muted">
                  Opis objave (Caption)
                </h3>
                <div className="max-h-60 overflow-y-auto rounded-lg bg-surface-raised/40 p-3.5 text-sm text-foreground leading-relaxed whitespace-pre-wrap select-text border border-line/60">
                  {caption ? caption : <span className="italic text-text-muted">Bez tekstualnog opisa.</span>}
                </div>
              </div>
            </div>

            {/* External link CTA */}
            {permalink && deletedAt === undefined && (
              <div className="flex items-center justify-start pt-2 border-t border-line/60">
                <a
                  href={permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-raised/80 hover:text-accent-400"
                >
                  <span>Otvori na Instagramu</span>
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
