"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { holdCssTransition, releaseCssTransition } from "./css-transition";

gsap.registerPlugin(useGSAP);

type Phase = "idle" | "running" | "done";

/**
 * Sadržaj koji se RAZMOTA ispod reda tabele — prošireni red, traka posle
 * poziva. Visina ide od 0 do prirodne uz opacity, jednom, pri montiranju.
 *
 * Ovo je svesni izuzetak od pravila „samo transform i opacity”: razmotavanje
 * mora da pomeri redove ispod sebe, a to transform ne ume — sa `scaleY` bi
 * susedni redovi skočili odjednom i tek onda bi se sadržaj „pojavio” u rupi.
 * Trajanje ostaje `DUR_UI`, visina se posle tvina vraća na `auto`, i
 * `will-change` se sklanja čim se završi.
 *
 * Pod `prefers-reduced-motion: reduce` ostaje samo kratak opacity cross-fade.
 */
export function Unfold({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
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
        gsap.set(el, { clearProps: "height,overflow,willChange" });
        releaseCssTransition(el);
      };

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
            onComplete: finish,
          });
          return;
        }

        gsap.set(el, {
          height: 0,
          opacity: 0,
          overflow: "hidden",
          willChange: "height, opacity",
        });
        gsap.to(el, {
          height: "auto",
          opacity: 1,
          duration: DUR_UI,
          ease: EASE_UI,
          overwrite: "auto",
          onComplete: finish,
        });
      });

      // StrictMode u razvoju montira dvaput; bez vraćanja na `idle` drugi
      // prolaz ne bi ni krenuo, a prvi je već poništen.
      return () => {
        if (phaseRef.current === "running") phaseRef.current = "idle";
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
