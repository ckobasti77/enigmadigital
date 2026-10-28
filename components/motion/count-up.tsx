"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MOTION_QUERIES } from "@/lib/motion";
import { runCountEffect } from "./count-up-engine";
import { cn } from "@/lib/utils";

/**
 * Brojčana vrednost koja pri svežem podatku iz Convex-a PREĐE od stare do nove
 * vrednosti (ne odbrojava ponovo od nule — inače KPI pločica treperi na svaki
 * backend update).
 *
 * Pri prvom prikazu broj STOJI, osim kad pozivalac zada `from`: odbrojavanje
 * pri otvaranju je rezervisano za fokus broj ekrana i za nagradu (UI Boost
 * §4.4 — najviše 1–2 animirana elementa po prikazu). Deset pločica koje se
 * vrte u isti mah je koreografija, ne podatak.
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
  from,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
  /**
   * Odakle kreće odbrojavanje pri prvom prikazu. Bez njega broj pri otvaranju
   * stoji; `0` zadaju samo fokus broj ekrana i nagrada.
   */
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
  // Tvin broja koji trenutno teče (u reduced grani ga nema).
  const countTween = useRef<gsap.core.Tween | null>(null);

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
        const reduced = !!ctx.conditions?.still;
        const tween = runCountEffect({
          el: ref.current,
          reduced,
          isUpdate,
          from: from ?? value,
          current: displayRef.current,
          value,
          emit,
          hidden: document.visibilityState !== "visible",
          previous: countTween.current,
        });
        countTween.current = reduced ? null : tween;
      });
    },
    { dependencies: [value], scope: ref },
  );

  // Tab ode u pozadinu usred odbrojavanja: kadrova više nema, pa se tvin
  // dogura do kraja i na ekranu ostane tačan broj, ne međuvrednost (F8).
  useEffect(() => {
    const settle = () => {
      if (document.visibilityState !== "visible") countTween.current?.progress(1);
    };
    document.addEventListener("visibilitychange", settle);
    return () => document.removeEventListener("visibilitychange", settle);
  }, []);

  // Aeonik nema tabelarne cifre (`tnum`), pa `tabular-nums` ne drži širinu:
  // nevidljiva konačna vrednost u istoj ćeliji rezerviše mesto, i ništa pored
  // broja se ne pomera dok broj raste.
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      <span className="inline-grid">
        <span aria-hidden className="invisible col-start-1 row-start-1">
          {format(value)}
        </span>
        <span className="col-start-1 row-start-1">{format(display)}</span>
      </span>
    </span>
  );
}
