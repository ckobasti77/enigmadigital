"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { formatNumber } from "@/lib/format";
import { DUR_COUNT, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/** Međuvrednosti se zaokružuju na ceo XP — „1.284,6 XP" ne postoji. */
const naCeo = gsap.utils.snap(1);

/**
 * Ukupan XP — fokus broj ekrana Napredak.
 *
 * Broj koji se menja često (svaka radnja ga pomeri) ne pravi nov tvin pri
 * svakoj promeni: `gsap.quickTo` drži JEDAN i samo mu menja cilj, pa je prelaz
 * prekidiv i ne gomila tvinove.
 *
 * Tačnost pre pokreta:
 *   - pri otvaranju broj STOJI — vrednost je u markupu, ništa se ne odbrojava;
 *   - React je jedini vlasnik teksta: tvin pomera pomoćni objekat, a do ekrana
 *     se stiže samo kroz `setState` (isto pravilo kao `CountUp`);
 *   - pod reduced-motion i u skrivenom tabu nova vrednost se upiše odmah;
 *   - poslednji kadar je uvek tačno ciljna vrednost.
 */
export function XpBroj({
  value,
  format = formatNumber,
  className,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [prikaz, setPrikaz] = useState(value);
  const proxy = useRef({ v: value });
  const quick = useRef<gsap.QuickToFunc | null>(null);
  const prvi = useRef(true);

  // Jedan tvin za ceo život komponente — pravi se samo kad pokret sme.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) return;
        quick.current = gsap.quickTo(proxy.current, "v", {
          duration: DUR_COUNT,
          ease: EASE_UI,
          onUpdate: () => setPrikaz(naCeo(proxy.current.v)),
        });
        return () => {
          quick.current = null;
        };
      });
    },
    { scope: ref },
  );

  useGSAP(
    () => {
      if (prvi.current) {
        prvi.current = false;
        return;
      }
      const moze =
        quick.current !== null && document.visibilityState === "visible";
      if (moze && quick.current) {
        // Polazna tačka se zadaje izričito: tvin inače kreće od SVOJE poslednje
        // vrednosti, a ne od one koja je možda upisana bez njega (skriven tab).
        quick.current(value, proxy.current.v);
        return;
      }
      gsap.killTweensOf(proxy.current);
      proxy.current.v = value;
      setPrikaz(value);
    },
    { dependencies: [value], scope: ref },
  );

  // Tab ode u pozadinu usred prelaza: kadrova više nema, pa se broj dogura do
  // cilja — na ekranu ne sme da ostane međuvrednost.
  useEffect(() => {
    const smiri = () => {
      if (document.visibilityState !== "visible") {
        quick.current?.tween.progress(1);
      }
    };
    document.addEventListener("visibilitychange", smiri);
    return () => document.removeEventListener("visibilitychange", smiri);
  }, []);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(prikaz)}
    </span>
  );
}
