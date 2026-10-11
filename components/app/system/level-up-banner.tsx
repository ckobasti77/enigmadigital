"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { X } from "lucide-react";
import { holdCssTransition, releaseCssTransition } from "@/components/motion/css-transition";
import {
  DUR_REDUCED,
  DUR_REWARD,
  DUR_TOAST_OUT,
  EASE_REWARD,
  EASE_UI,
  MOTION_QUERIES,
} from "@/lib/motion";
import { CelebrationBurst } from "./celebration-burst";
import { LevelBadge, type Tier } from "./reward-badges";

gsap.registerPlugin(useGSAP);

/**
 * ============================================================================
 * NOV NIVO — traka sa vrha (UI Boost §6.9, §4.4)
 * ============================================================================
 *
 * Najređa nagrada u aplikaciji, pa jedina dobija sekvencu. NIJE modal: stoji
 * ispod gornje trake, ne hvata fokus i ne zatamnjuje stranu — posao ispod nje
 * ostaje dostupan. Zatvara se sama posle četiri sekunde, klikom ili na Esc.
 *
 * Tri sloja pokreta, ukupno ispod 1,2 s (`DUR_LEVEL_UP`):
 *   glavni         bedž nivoa — uđe sa prebačajem (jedino mesto gde sme)
 *   prateći        naziv nivoa i zvanje — doklize za bedžom
 *   ambijentalni   prasak čestica iz bedža
 *
 * Samo `transform` i `opacity`. Pod reduced-motion traka se pretopi i stoji;
 * nema pomeraja, prebačaja ni čestica.
 */

/** Koliko traka stoji pre nego što se sama skloni. */
const STAJE_MS = 4000;

export function LevelUpBanner({
  level,
  rank,
  tier,
  onDismiss,
}: {
  level: number;
  /** Zvanje („Agent"). */
  rank: string;
  tier: Tier;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);
  const leaveRef = useRef<() => void>(() => {});
  const dismiss = useRef(onDismiss);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  useGSAP(
    (_context, contextSafe) => {
      const el = ref.current;
      const badge = badgeRef.current;
      const text = textRef.current;
      if (!el) return;

      const leave = () => {
        if (leaving.current) return;
        leaving.current = true;
        if (window.matchMedia(MOTION_QUERIES.still).matches) {
          dismiss.current();
          return;
        }
        gsap.to(el, {
          opacity: 0,
          y: -12,
          duration: DUR_TOAST_OUT,
          ease: "power2.in",
          overwrite: true,
          onComplete: () => dismiss.current(),
        });
      };
      leaveRef.current = contextSafe ? contextSafe(leave) : leave;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) {
          holdCssTransition(el);
          gsap.set(el, { opacity: 0 });
          gsap.to(el, {
            opacity: 1,
            duration: DUR_REDUCED,
            ease: "none",
            overwrite: "auto",
            onComplete: () => releaseCssTransition(el),
          });
          return;
        }

        // Bedž završava na 0,72 s, prasak (do 0,9 s) kreće na 0,3 s — poslednja
        // čestica nestane na 1,2 s.
        const tl = gsap.timeline({
          defaults: { ease: EASE_UI, overwrite: "auto" },
        });
        tl.addLabel("ulaz", 0).fromTo(
          el,
          { opacity: 0, y: -20 },
          { opacity: 1, y: 0, duration: 0.3 },
          "ulaz",
        );
        if (badge) {
          tl.fromTo(
            badge,
            { scale: 0.5, rotation: -14 },
            { scale: 1, rotation: 0, duration: DUR_REWARD, ease: EASE_REWARD },
            "ulaz+=0.12",
          );
        }
        if (text) {
          tl.fromTo(
            text,
            { opacity: 0, x: -8 },
            { opacity: 1, x: 0, duration: 0.25 },
            "ulaz+=0.22",
          );
        }
        tl.call(() => setBurst((n) => n + 1), [], "ulaz+=0.3");
      });
    },
    { scope: ref },
  );

  const leave = () => leaveRef.current();

  const arm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(leave, STAJE_MS);
  };
  const hold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    arm();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") leaveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      hold();
      window.removeEventListener("keydown", onKey);
    };
    // Odbrojavanje kreće jednom, pri montiranju; `arm` čita aktuelne vrednosti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--chrome-height)+0.75rem)] z-50 flex justify-center px-4">
      <div
        ref={ref}
        role="status"
        onPointerEnter={hold}
        onPointerLeave={arm}
        onFocus={hold}
        onBlur={arm}
        className="pointer-events-auto flex max-w-full items-center gap-4 rounded-xl border border-xp-line bg-surface-raised py-3 pr-2 pl-4 shadow-reward"
      >
        <span ref={badgeRef} className="relative flex shrink-0">
          <LevelBadge level={level} tier={tier} rank={rank} size="lg" />
          <CelebrationBurst trigger={burst} count={18} />
        </span>
        <div ref={textRef} className="min-w-0">
          <p className="text-title font-bold text-foreground">Nivo {level}</p>
          <p className="truncate text-ui font-medium text-xp">{rank}</p>
        </div>
        <button
          type="button"
          onClick={leave}
          aria-label="Zatvori obaveštenje o novom nivou"
          className="touch-target flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
