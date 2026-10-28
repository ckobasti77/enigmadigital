"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DUR_BURST, MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * ============================================================================
 * PRASAK — ambijentalni sloj nagrade (UI Boost §5.8, §4.4)
 * ============================================================================
 *
 * Nagrada ima tri sloja pokreta: glavni (bedž ili kartica), prateći (XP traka
 * i broj) i ambijentalni — ovaj. Šaka čestica koja se razleti iz sredine
 * roditelja i nestane za najviše 900 ms.
 *
 * Pravila koja ga drže u ulozi ukrasa, a ne smetnje:
 *   - `pointer-events: none` — nikad ne stoji između čoveka i dugmeta;
 *   - pali se SAMO kad se `trigger` promeni, nikad pri montiranju: stranica
 *     koja se otvori sa već završenom misijom ne slavi ponovo;
 *   - pod `prefers-reduced-motion` ne radi ništa;
 *   - samo `transform` i `opacity`.
 *
 * Roditelj mora biti pozicioniran (`relative`); čestice kreću iz njegove
 * sredine i smeju da izađu preko ivice.
 */
// Samo boje nagrade: proslava nikad nije u boji modula (ULTRA P1).
const COLORS = ["bg-xp", "bg-xp-strong", "bg-tier-gold"] as const;

export function CelebrationBurst({
  trigger,
  count = 14,
  className,
}: {
  /** Promena vrednosti pali prasak (npr. brojač završenih misija). */
  trigger: number;
  count?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(trigger);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || last.current === trigger) return;
      last.current = trigger;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) return;
        const dots = Array.from(el.children) as HTMLElement[];
        dots.forEach((dot, i) => {
          // Ravnomerno po krugu, sa malim odstupanjem da ne izgleda kao sat.
          const angle =
            (i / dots.length) * Math.PI * 2 + gsap.utils.random(-0.25, 0.25);
          const distance = gsap.utils.random(28, 64);
          gsap.set(dot, { x: 0, y: 0, scale: 1, opacity: 1 });
          gsap.to(dot, {
            x: Math.cos(angle) * distance,
            // Blagi pad: čestica ima težinu, ne lebdi.
            y: Math.sin(angle) * distance + 14,
            scale: gsap.utils.random(0.3, 0.6),
            opacity: 0,
            duration: DUR_BURST * gsap.utils.random(0.6, 1),
            ease: "power2.out",
            overwrite: true,
          });
        });
      });
    },
    { dependencies: [trigger], scope: ref },
  );

  return (
    <span
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-1/2 left-1/2 size-0 overflow-visible",
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "absolute -top-0.5 -left-0.5 size-1 rounded-full opacity-0",
            COLORS[i % COLORS.length],
            i % 4 === 0 && "size-1.5",
          )}
        />
      ))}
    </span>
  );
}
