"use client";

import { useRef, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { frameWithin, framesDiffer, type Frame } from "@/lib/prostor/web/indikator-trake";

gsap.registerPlugin(useGSAP);

/** Visina crte indikatora (px), centrirane uz izabranu pločicu. */
const VISINA_CRTE = 20;

/**
 * Poslednji položaj indikatora, van komponente: prelazak između „Ja“ i
 * projekta (i između projekata) montira ljusku iznova, a crta i dalje treba
 * da doklizi sa starog mesta, ne da se pojavi na novom.
 */
let poslednjiOkvir: Frame | null = null;

/**
 * Indikator izabrane pločice trake (port Devotion `use-rail-indicator`,
 * SPAJANJE P14). Crta klizi do nove pločice (`DUR_UI`, `EASE_UI`, samo
 * `transform`); pod smanjenim pokretom staje na mesto odmah. Pločice nose
 * `data-traka-kljuc`, a indikator je apsolutno postavljen u kontejneru koji
 * klizi, pa se okvir računa u koordinatama sadržaja.
 */
export function useIndikatorTrake(
  kontejner: RefObject<HTMLElement | null>,
  aktivniKljuc: string | null,
  brojStavki: number,
) {
  const indikator = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const k = kontejner.current;
      const crta = indikator.current;
      if (!k || !crta) return;
      const stavka =
        aktivniKljuc === null
          ? null
          : k.querySelector<HTMLElement>(`[data-traka-kljuc="${CSS.escape(aktivniKljuc)}"]`);
      if (!stavka) {
        gsap.set(crta, { autoAlpha: 0 });
        return;
      }
      const okvir = frameWithin(k.getBoundingClientRect(), stavka.getBoundingClientRect(), {
        left: k.scrollLeft,
        top: k.scrollTop,
      });
      const y = (o: Frame) => o.y + o.height / 2 - VISINA_CRTE / 2;
      const prethodni = poslednjiOkvir;
      poslednjiOkvir = okvir;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still || prethodni === null || !framesDiffer(prethodni, okvir)) {
          gsap.set(crta, { y: y(okvir), autoAlpha: 1 });
          return;
        }
        gsap.fromTo(
          crta,
          { y: y(prethodni), autoAlpha: 1 },
          { y: y(okvir), duration: DUR_UI, ease: EASE_UI, overwrite: "auto" },
        );
      });
      return () => mm.revert();
    },
    { dependencies: [aktivniKljuc, brojStavki], scope: kontejner },
  );

  return indikator;
}
