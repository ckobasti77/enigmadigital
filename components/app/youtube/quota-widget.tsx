"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useQuery } from "convex/react";
import { Gauge } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/motion/count-up";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * Today's YouTube Data API budget, in one line.
 *
 * The number that matters to whoever reads this screen is not "units" — it is
 * how many more people the engine can still answer today, so that is what the
 * line says out loud. `softLimit` is deliberately not YouTube's 10 000: the
 * rest of the day's allowance is reserved for the analytics sync, because a
 * dashboard of stale numbers is a worse outcome than a comment answered
 * tomorrow (convex/lib/ytQuota.ts).
 */

/** Where the bar stops being reassuring. */
const WARNING_AT = 0.7;
const DANGER_AT = 0.9;

type Tone = "normal" | "warning" | "danger";

const BAR_TONES: Record<Tone, string> = {
  normal: "bg-accent-400",
  warning: "bg-warning",
  danger: "bg-danger",
};

const FRAME_TONES: Record<Tone, string> = {
  normal: "border-line-soft bg-card",
  warning: "border-warning/30 bg-warning/5",
  danger: "border-danger/30 bg-danger/5",
};

const ICON_TONES: Record<Tone, string> = {
  normal: "text-accent-400",
  warning: "text-warning",
  danger: "text-danger",
};

export function QuotaWidget() {
  const quota = useQuery(api.ytAutomationsApi.quotaStatus);

  if (quota === undefined) {
    return <Skeleton className="h-[74px] w-full rounded-xl" />;
  }

  const { unitsUsed, softLimit, repliesLeft } = quota;
  const ratio = softLimit > 0 ? Math.min(1, unitsUsed / softLimit) : 1;
  const tone: Tone =
    ratio >= DANGER_AT ? "danger" : ratio >= WARNING_AT ? "warning" : "normal";
  // Not "units remaining === 0": with fewer than 50 units left there is no
  // longer room for a single reply, which is the same thing to the reader.
  const exhausted = repliesLeft === 0;

  return (
    <div
      className={cn("rounded-xl border px-4 py-3", FRAME_TONES[tone])}
      role="status"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Gauge className={cn("size-4 shrink-0", ICON_TONES[tone])} aria-hidden />
          <span>
            Potrošeno{" "}
            <CountUp
              value={unitsUsed}
              format={formatNumber}
              className="font-mono font-medium text-foreground"
            />{" "}
            od{" "}
            <span className="font-mono tabular-nums">
              {formatNumber(softLimit)}
            </span>{" "}
            jedinica danas
          </span>
        </p>

        {exhausted ? (
          <p className="text-xs font-medium text-danger">
            Dnevna kvota je potrošena. Odgovori se nastavljaju sutra u 09:00 po
            našem vremenu.
          </p>
        ) : (
          <p className="text-xs text-text-muted">
            još oko{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatNumber(repliesLeft)}
            </span>{" "}
            {pluralReplies(repliesLeft)}
          </p>
        )}
      </div>

      <QuotaBar ratio={ratio} tone={tone} />
    </div>
  );
}

/** Serbian counts the noun, not just the numeral. */
function pluralReplies(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "automatskih odgovora";
  if (last === 1) return "automatski odgovor";
  if (last >= 2 && last <= 4) return "automatska odgovora";
  return "automatskih odgovora";
}

/**
 * The bar grows to its share of the budget. GSAP rather than a CSS transition
 * so the reduced-motion branch is explicit: there it is simply drawn at width.
 */
function QuotaBar({ ratio, tone }: { ratio: number; tone: Tone }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = `${(ratio * 100).toFixed(1)}%`;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          ref.current,
          { width: 0 },
          { width, duration: 0.7, ease: "expo.out" },
        );
      });
    },
    { dependencies: [width], scope: ref },
  );

  return (
    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
      <div
        ref={ref}
        style={{ width }}
        className={cn("h-full rounded-full", BAR_TONES[tone])}
      />
    </div>
  );
}
