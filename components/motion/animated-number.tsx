"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * Metric numeral that tweens between values (0.6s, expo.out) whenever `value`
 * changes — e.g. when the date range switches or a sync lands. Under
 * `prefers-reduced-motion: reduce` it snaps. Always renders the formatted
 * final value in markup, so SSR/first paint is correct and nothing shifts.
 */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const from = shown.current;
      shown.current = value;
      if (from === value) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          still: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          if (ctx.conditions?.still) {
            el.textContent = format(value);
            return;
          }
          const proxy = { v: from };
          gsap.to(proxy, {
            v: value,
            duration: 0.6,
            ease: "expo.out",
            onUpdate: () => {
              el.textContent = format(proxy.v);
            },
            onComplete: () => {
              el.textContent = format(value);
            },
          });
        },
      );
    },
    { dependencies: [value], scope: ref },
  );

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(value)}
    </span>
  );
}
