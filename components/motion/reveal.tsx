"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  clampRevealDelay,
  DUR_REDUCED,
  DUR_UI,
  EASE_UI,
  MOTION_QUERIES,
  resolveStagger,
  REVEAL_Y,
  WILL_CHANGE,
} from "@/lib/motion";
import { holdCssTransition, releaseCssTransition } from "./css-transition";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Element ulazi kada mu vrh stigne na 92% visine prozora — sve što je već na
 * ekranu okida odmah, ostalo tek kad se doskroluje do njega.
 */
const START = "top 92%";

type Phase = "idle" | "running" | "done";

/*
 * `phaseRef` u obe komponente pamti da li je ulazna animacija već odigrala.
 * To je zaštita od najlakše greške u realtime aplikaciji: stigne nov podatak
 * iz Convex-a, komponenta se rerenderuje, i cela tabla ponovo poskoči.
 *
 * Cleanup vraća `running` na `idle` namerno — u dev-u React StrictMode montira
 * komponentu dvaput, i bez tog vraćanja bi ulaz u razvoju nestao. Kada
 * animacija jednom stigne do kraja, `done` je konačno.
 */

/**
 * Suptilan ulaz: fade + 12 px podizanje, jednom po ulasku na ekran.
 *
 * Kreće `gsap.set`-om na početno stanje pa `gsap.to`-om ka mirovanju sa
 * `overwrite: "auto"` — nikad `fromTo` — tako da animacija uvek ide od
 * trenutne vrednosti na ekranu i može da se prekine u letu. Ulaz ne dira
 * `pointer-events`, pa nikad ne blokira unos.
 *
 * Pod `prefers-reduced-motion: reduce` ostaje samo 150 ms opacity cross-fade.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = REVEAL_Y,
}: {
  children: React.ReactNode;
  className?: string;
  /** Mesto u sekvenci ekrana, u sekundama. Odsečeno na budžet od 100 ms. */
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("idle");

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || phaseRef.current === "done") return;
      phaseRef.current = "running";

      const finish = () => {
        phaseRef.current = "done";
        el.style.removeProperty("will-change");
        releaseCssTransition(el);
      };

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const still = Boolean(ctx.conditions?.still);
        if (still) holdCssTransition(el);
        gsap.set(el, still ? { opacity: 0 } : { opacity: 0, y, willChange: WILL_CHANGE });
        gsap.to(el, {
          opacity: 1,
          ...(still ? {} : { y: 0 }),
          duration: still ? DUR_REDUCED : DUR_UI,
          delay: clampRevealDelay(delay),
          ease: still ? "none" : EASE_UI,
          overwrite: "auto",
          onComplete: finish,
          scrollTrigger: { trigger: el, start: START, once: true },
        });
      });

      return () => {
        if (phaseRef.current !== "running") return;
        phaseRef.current = "idle";
        releaseCssTransition(el);
      };
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * Isti ulaz, ali raspoređen po direktnoj deci — razmak računa `resolveStagger`
 * tako da poslednje dete završi unutar 400 ms bez obzira na to koliko ih ima.
 *
 * Kada grupa ne sme da uvede sopstvenu kutiju u raspored (npr. deca su već
 * flex ili grid stavke roditelja), prosledi `className="contents"`: okidač
 * ScrollTrigger-a je prvo dete, ne omotač, pa `display: contents` ništa ne
 * kvari.
 */
export function RevealGroup({
  children,
  className,
  delay = 0,
  y = REVEAL_Y,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("idle");

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || phaseRef.current === "done") return;

      const targets = Array.from(el.children) as HTMLElement[];
      if (targets.length === 0) return;
      phaseRef.current = "running";

      const finish = () => {
        phaseRef.current = "done";
        for (const target of targets) {
          target.style.removeProperty("will-change");
          releaseCssTransition(target);
        }
      };

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const still = Boolean(ctx.conditions?.still);
        if (still) for (const target of targets) holdCssTransition(target);
        gsap.set(
          targets,
          still ? { opacity: 0 } : { opacity: 0, y, willChange: WILL_CHANGE },
        );
        gsap.to(targets, {
          opacity: 1,
          ...(still ? {} : { y: 0 }),
          duration: still ? DUR_REDUCED : DUR_UI,
          delay: clampRevealDelay(delay),
          ease: still ? "none" : EASE_UI,
          stagger: still ? 0 : resolveStagger(targets.length),
          overwrite: "auto",
          onComplete: finish,
          scrollTrigger: { trigger: targets[0], start: START, once: true },
        });
      });

      return () => {
        if (phaseRef.current !== "running") return;
        phaseRef.current = "idle";
        for (const target of targets) releaseCssTransition(target);
      };
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
