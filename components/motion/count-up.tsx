"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  DUR_COUNT,
  DUR_REDUCED,
  EASE_UI,
  MOTION_QUERIES,
} from "@/lib/motion";
import { holdCssTransition, releaseCssTransition } from "./css-transition";
import { cn } from "@/lib/utils";

/**
 * Brojčana vrednost koja se odbroji do cilja — ali SAMO pri prvom prikazu.
 *
 * Kada kasnije stigne nov podatak iz Convex-a, vrednost se menja bez
 * odbrojavanja: inače KPI pločica treperi svaki put kad backend pošalje
 * ažuriranje, a to je tabla koju operater gleda ceo dan.
 *
 * Formatirana konačna vrednost je uvek u markup-u, pa su SSR i prvi paint
 * tačni i ništa se ne pomera kada JS stigne.
 */
export function CountUp({
  value,
  format,
  className,
  from = 0,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
  /** Odakle kreće odbrojavanje pri prvom prikazu. */
  from?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Poslednja vrednost koju je efekat video. Razlikuje prvi prikaz od
  // ažuriranja — cleanup ne može da zna zašto je efekat ponovo pokrenut.
  const lastValue = useRef(value);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const isUpdate = lastValue.current !== value;
      lastValue.current = value;

      if (isUpdate) {
        el.textContent = format(value);
        return;
      }

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) {
          el.textContent = format(value);
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

        const proxy = { v: from };
        el.textContent = format(from);
        gsap.to(proxy, {
          v: value,
          duration: DUR_COUNT,
          ease: EASE_UI,
          overwrite: "auto",
          onUpdate: () => {
            el.textContent = format(proxy.v);
          },
          onComplete: () => {
            el.textContent = format(value);
          },
        });
      });
    },
    { dependencies: [value], scope: ref },
  );

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(value)}
    </span>
  );
}
