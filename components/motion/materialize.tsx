"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { holdCssTransition, releaseCssTransition } from "./css-transition";

gsap.registerPlugin(useGSAP);

/**
 * Translucentna površina koja stiže kao materijal, a ne kao običan fade:
 * poluprečnik zamućenja i skala rastu zajedno, pa se čini da se staklo
 * kondenzuje iznad sadržaja umesto da se prosto pojavi.
 *
 * Ovo je jedina namerna dozvola u sistemu da se animira `backdrop-filter`.
 * Svuda drugde važi pravilo „samo transform i opacity”, jer sve ostalo traži
 * ponovni raspored ili preslikavanje. Ovde je izuzetak opravdan time što je
 * zamućenje samo po sebi materijal koji se opisuje, traje 300 ms i `will-change`
 * se sklanja čim se završi.
 *
 * Ciljno zamućenje se ne prosleđuje rukom — čita se iz izračunatog stila, pa
 * `.material-thin`, `.material` i `.material-thick` iz D1 same određuju cilj.
 * Kada je uključeno `prefers-reduced-transparency`, materijali su neprozirni,
 * izračunata vrednost je `none`, i zamućenje se preskače bez posebne grane.
 */
export function Materialize({
  children,
  className,
  /**
   * Odakle površina stiže. Prostorna doslednost: popover, dropdown i sheet
   * imaju ishodište na elementu koji ih je otvorio, ne na svom centru.
   */
  origin = "center",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  origin?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || played.current) return;
      played.current = true;

      const target = readBackdrop(el);

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) {
          holdCssTransition(el);
          gsap.set(el, { opacity: 0 });
          gsap.to(el, {
            opacity: 1,
            duration: DUR_REDUCED,
            delay,
            ease: "none",
            overwrite: "auto",
            onComplete: () => releaseCssTransition(el),
          });
          return;
        }

        gsap.set(el, {
          opacity: 0,
          scale: 0.985,
          transformOrigin: origin,
          willChange: target
            ? "transform, opacity, backdrop-filter"
            : "transform, opacity",
        });
        gsap.to(el, {
          opacity: 1,
          scale: 1,
          duration: DUR_UI,
          delay,
          ease: EASE_UI,
          overwrite: "auto",
          onComplete: () => {
            gsap.set(el, { clearProps: "transform,scale,willChange" });
          },
        });

        if (!target) return;

        // Zamućenje ide na svoj tvin da bi moglo da se prekine nezavisno od
        // transformacije; oba nose isto trajanje i isti ease, pa se čitaju kao
        // jedan pokret.
        const material = { blur: 0, saturate: 1 };
        writeBackdrop(el, material);
        gsap.to(material, {
          blur: target.blur,
          saturate: target.saturate,
          duration: DUR_UI,
          delay,
          ease: EASE_UI,
          overwrite: "auto",
          onUpdate: () => writeBackdrop(el, material),
          onComplete: () => clearBackdrop(el),
        });
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

type Backdrop = { blur: number; saturate: number };

/** Čita cilj iz klase materijala; `null` znači da površina nije translucentna. */
function readBackdrop(el: HTMLElement): Backdrop | null {
  const style = getComputedStyle(el);
  const raw =
    style.getPropertyValue("backdrop-filter") ||
    style.getPropertyValue("-webkit-backdrop-filter");
  if (!raw || raw === "none") return null;

  const blur = /blur\(([\d.]+)px\)/.exec(raw);
  if (!blur) return null;

  // Chrome vraća `saturate(1.6)`, Safari `saturate(160%)`.
  const saturate = /saturate\(([\d.]+)(%?)\)/.exec(raw);
  const factor = saturate
    ? saturate[2] === "%"
      ? Number(saturate[1]) / 100
      : Number(saturate[1])
    : 1;

  return { blur: Number(blur[1]), saturate: factor };
}

function writeBackdrop(el: HTMLElement, { blur, saturate }: Backdrop) {
  const value = `blur(${blur.toFixed(2)}px) saturate(${saturate.toFixed(3)})`;
  el.style.setProperty("backdrop-filter", value);
  el.style.setProperty("-webkit-backdrop-filter", value);
}

/** Vraća površinu na vrednost iz klase, da media upiti opet mogu da je menjaju. */
function clearBackdrop(el: HTMLElement) {
  el.style.removeProperty("backdrop-filter");
  el.style.removeProperty("-webkit-backdrop-filter");
}
