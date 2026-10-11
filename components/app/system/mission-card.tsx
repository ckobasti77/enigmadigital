"use client";

import { useRef, useState, type ComponentType, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Card } from "@/components/ui/card";
import { DUR_MISSION, EASE_REWARD, MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { CelebrationBurst } from "./celebration-burst";
import { Chip } from "./chip";
import { ProgressBar } from "./progress";

gsap.registerPlugin(useGSAP);

/**
 * ============================================================================
 * KARTICA MISIJE (UI Boost §5.8, §6.4)
 * ============================================================================
 *
 * Jedna dnevna misija: šta treba uraditi, dokle se stiglo, koliko XP-a nosi i
 * jedno dugme koje vodi pravo u taj posao. Kartica je ovde opravdana —
 * elevacija nosi hijerarhiju („ovo je zadatak, ne podatak").
 *
 * `featured` je prva nezavršena misija: šira (roditeljska mreža joj daje 2fr),
 * sa krupnijim naslovom, i jedina koja po pravilu nosi `primary` dugme. Tri
 * iste kartice u redu ne kažu odakle se kreće.
 *
 * ZAVRŠETAK je nagrada, pa jedini ovde sme da prebaci: pločica sa ikonicom
 * poskoči (350 ms), kvačica se iscrta, i razleti se mali zlatni prasak. To se
 * dešava samo kad `done` pređe u `true` DOK JE KARTICA NA EKRANU. Misija koja
 * je završena već pri otvaranju strane stoji mirno u završenom stanju.
 */
type MissionIcon = ComponentType<{ className?: string }>;

export function MissionCard({
  title,
  icon: Icon,
  value,
  max,
  xp,
  done = false,
  featured = false,
  action,
  className,
}: {
  /** Šta treba uraditi („Pozovi 5 firmi iz Zovi sada"). */
  title: string;
  icon?: MissionIcon;
  /** Dokle se stiglo, izvedeno iz stvarnih događaja dana. */
  value: number;
  /** Cilj misije. */
  max: number;
  /** XP koji misija nosi. */
  xp: number;
  done?: boolean;
  featured?: boolean;
  /** Jedno dugme ka poslu. Na završenoj misiji se ne crta. */
  action?: ReactNode;
  className?: string;
}) {
  const tileRef = useRef<HTMLSpanElement>(null);
  const checkRef = useRef<SVGPathElement>(null);
  const wasDone = useRef(done);
  const [bursts, setBursts] = useState(0);

  useGSAP(
    () => {
      const justFinished = done && !wasDone.current;
      wasDone.current = done;
      const tile = tileRef.current;
      const check = checkRef.current;
      if (!justFinished || !tile) return;

      setBursts((n) => n + 1);
      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        // Reduced-motion: završeno stanje je već nacrtano, i to je sve.
        if (ctx.conditions?.still) return;
        gsap.set(tile, { scale: 0.7 });
        gsap.to(tile, {
          scale: 1,
          duration: DUR_MISSION,
          ease: EASE_REWARD,
          overwrite: "auto",
          onComplete: () => gsap.set(tile, { clearProps: "scale" }),
        });
        if (check) {
          gsap.set(check, { strokeDashoffset: 1 });
          gsap.to(check, {
            strokeDashoffset: 0,
            duration: DUR_MISSION,
            ease: "power2.out",
            overwrite: "auto",
          });
        }
      });
    },
    { dependencies: [done], scope: tileRef },
  );

  return (
    <Card
      size="sm"
      className={cn(
        "relative gap-0 overflow-visible py-0 shadow-card",
        done ? "ring-xp-line" : "ring-line",
        className,
      )}
    >
      <div className={cn("flex h-full flex-col gap-3", featured ? "p-5" : "p-4")}>
        <div className="flex items-start gap-3">
          <span
            ref={tileRef}
            className={cn(
              "relative flex shrink-0 items-center justify-center rounded-lg",
              featured ? "size-10" : "size-8",
              done ? "bg-xp-soft text-xp" : "bg-mod-soft text-mod",
            )}
          >
            {done ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={featured ? "size-5" : "size-4"}
                aria-hidden
              >
                <path
                  ref={checkRef}
                  d="M5 12.5l4.5 4.5L19 7.5"
                  pathLength={1}
                  strokeDasharray={1}
                />
              </svg>
            ) : (
              Icon && <Icon className={featured ? "size-5" : "size-4"} aria-hidden />
            )}
            <CelebrationBurst trigger={bursts} />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "font-medium text-foreground",
                featured ? "text-title font-bold" : "text-copy",
              )}
            >
              {title}
            </p>
            {done && (
              <p className="mt-0.5 text-meta font-medium text-xp">Završeno</p>
            )}
          </div>
          <Chip tone="xp" size="sm" className="font-mono tabular-nums">
            +{xp} XP
          </Chip>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-meta">
            <span className="text-text-muted">Urađeno</span>
            <span className="font-mono tabular-nums text-foreground">
              {done ? max : value}
              <span className="text-text-muted"> / {max}</span>
            </span>
          </div>
          <ProgressBar
            value={done ? max : value}
            max={max}
            tone={done ? "xp" : "module"}
            size={featured ? "md" : "sm"}
            label={title}
          />
        </div>

        {action && !done && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {action}
          </div>
        )}
      </div>
    </Card>
  );
}
