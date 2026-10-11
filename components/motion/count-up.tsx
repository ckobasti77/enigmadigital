"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MOTION_QUERIES } from "@/lib/motion";
import { runCountEffect } from "./count-up-engine";
import { cn } from "@/lib/utils";

/**
 * Brojčana vrednost koja se odbroji do cilja pri prvom prikazu, a pri svežem
 * podatku iz Convex-a PREĐE od stare do nove vrednosti (ne odbrojava ponovo od
 * nule — inače KPI pločica treperi na svaki backend update).
 *
 * KRITIČNO: React je jedini vlasnik tekstualnog čvora. Prikazana vrednost se
 * drži u `display` state-u i renderuje kroz JSX; animacija je pomera preko
 * `setDisplay`, nikad preko `el.textContent`. Zato se brojka NE MOŽE razići od
 * onoga što je React renderovao — greška iz A8 (svuda „0") tako ne može da se
 * ponovi. Vidi `count-up-engine.ts` i `scripts/count-up-check.ts`.
 *
 * Formatirana vrednost je uvek u markup-u (`display` počinje na `value`), pa su
 * SSR i prvi paint tačni i ništa se ne pomera kada JS stigne.
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
  const [display, setDisplay] = useState(value);
  // Ogledalo `display`-a čitljivo unutar GSAP callback-a bez zastarelog
  // closure-a — polazna tačka prekidivog prelaza je uvek zatečena brojka.
  const displayRef = useRef(value);
  // Poslednja vrednost koju je efekat video: razlikuje prvi prikaz (odbroj od
  // `from`) od ažuriranja (pređi od zatečene vrednosti).
  const lastValue = useRef(value);
  const mounted = useRef(false);

  const emit = (v: number) => {
    displayRef.current = v;
    setDisplay(v);
  };

  useGSAP(
    () => {
      const prethodna = lastValue.current;
      const isUpdate = mounted.current && prethodna !== value;
      lastValue.current = value;
      mounted.current = true;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        runCountEffect({
          el: ref.current,
          reduced: !!ctx.conditions?.still,
          isUpdate,
          from,
          current: displayRef.current,
          value,
          emit,
        });
      });
    },
    { dependencies: [value], scope: ref },
  );

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(display)}
    </span>
  );
}
