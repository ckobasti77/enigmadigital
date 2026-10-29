"use client";

// Preneto iz Devotion apps/web/components/me/task-panel/use-title-flight.ts (main @ c05c40f), SPAJANJE S12.
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { DUR_UI, EASE_UI, MOTION_QUERIES, WILL_CHANGE } from "@/lib/motion";

gsap.registerPlugin(useGSAP);

/** „Leteća kopija" samo na `md` i šire (plan K07 §4.1, trenutak 3). */
const FLIGHT_QUERY = "(min-width: 768px)";
/**
 * Ako se naslov panela pojavi kasnije (hladan upit), let bi kretao usred
 * ulaza panela ili posle njega — tada ga preskačemo.
 */
const FLIGHT_MAX_DELAY_MS = 300;
/** Fioka (`ui/drawer.tsx`) nosi ovaj `data-slot` na panelu koji klizne s desna. */
const DRAWER_SELECTOR = '[data-slot="drawer"]';

/**
 * Trenutak 3: naslov reda „preleti" u zaglavlje panela. Klon u sloju iznad
 * panela kreće od pravougaonika naslova u redu i ide do KONAČNOG mesta
 * naslova u panelu (računa se iz konačne pozicije fioke, ne iz trenutne,
 * jer panel još ulazi s desna). Pravi naslov je nevidljiv dok klon ne stigne.
 * Klon je `aria-hidden` i ne prima fokus ni klikove.
 *
 * Pokret: samo `transform` i `opacity`, `DUR_UI` i `EASE_UI` (isto kao ulaz
 * fioke, pa klon i panel stižu zajedno). Smanjen pokret, uski ekran i
 * sakriven tab: bez kopije. Prekidivo: novo otvaranje, zatvaranje panela,
 * dodir ili taster u toku leta dovršavaju ga odmah i vraćaju pravi naslov.
 */
export function useTitleFlight({
  origin,
  target,
  flightKey,
  startedAt,
}: {
  /** Naslov u redu (`[data-row-title]`) u trenutku otvaranja. */
  origin: HTMLElement | null;
  /** Naslov u zaglavlju panela (`[data-panel-title]`). */
  target: HTMLElement | null;
  /** Nov ključ = novo otvaranje (jedan let po otvaranju). */
  flightKey: string | null;
  /** `performance.now()` u trenutku otvaranja. */
  startedAt: number | null;
}) {
  const flown = useRef<string | null>(null);
  useGSAP(
    () => {
      if (!origin || !target || flightKey === null || startedAt === null) return;
      if (flown.current === flightKey) return;
      flown.current = flightKey;
      if (performance.now() - startedAt > FLIGHT_MAX_DELAY_MS) return;
      // Skriven tab ne dobija pokret: korisnik ga ne vidi, a tween bi stao.
      if (document.visibilityState !== "visible") return;
      if (!origin.isConnected || !window.matchMedia(FLIGHT_QUERY).matches) return;
      const panel = target.closest<HTMLElement>(DRAWER_SELECTOR);
      if (!panel) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        // Smanjen pokret: bez leta uopšte, naslov se samo pojavi u panelu.
        if (ctx.conditions?.still) return;

        const from = origin.getBoundingClientRect();
        const current = target.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        // Panel je desna fioka: konačna leva ivica je širina prozora − širina panela.
        const finalPanelLeft = document.documentElement.clientWidth - panel.offsetWidth;
        const shift = panelRect.left - finalPanelLeft;
        const to = { left: current.left - shift, top: current.top, width: current.width };
        if (from.width === 0 || to.width === 0) return;

        const style = getComputedStyle(target);
        const fromSize = parseFloat(getComputedStyle(origin).fontSize) || 14;
        const toSize = parseFloat(style.fontSize) || 20;
        const clone = document.createElement("div");
        clone.setAttribute("aria-hidden", "true");
        clone.textContent = origin.textContent?.trim() || target.textContent?.trim() || "";
        Object.assign(clone.style, {
          position: "fixed",
          left: `${to.left}px`,
          top: `${to.top + (parseFloat(style.paddingTop) || 0)}px`,
          width: `${to.width}px`,
          paddingLeft: style.paddingLeft,
          font: style.font,
          letterSpacing: style.letterSpacing,
          color: style.color,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transformOrigin: "0 0",
          pointerEvents: "none",
          willChange: WILL_CHANGE,
          zIndex: "60",
        } satisfies Partial<CSSStyleDeclaration>);
        document.body.appendChild(clone);

        // Pravi naslov je nevidljiv dok klon ne stigne; GSAP postavlja i čisti samo neprozirnost.
        gsap.set(target, { opacity: 0 });
        let finished = false;
        let tween: gsap.core.Tween | null = null;
        // Prekid: dodir, taster ili skrivanje taba dovršava let odmah.
        const interrupt = () => {
          tween?.progress(1);
          finish();
        };
        const finish = () => {
          if (finished) return;
          finished = true;
          window.removeEventListener("pointerdown", interrupt, true);
          window.removeEventListener("keydown", interrupt, true);
          document.removeEventListener("visibilitychange", interrupt);
          gsap.set(target, { clearProps: "opacity" });
          clone.remove();
        };
        tween = gsap.fromTo(
          clone,
          { x: from.left - to.left, y: from.top - to.top, scale: fromSize / toSize },
          {
            x: 0,
            y: 0,
            scale: 1,
            duration: DUR_UI,
            ease: EASE_UI,
            overwrite: "auto",
            onComplete: finish,
          },
        );
        window.addEventListener("pointerdown", interrupt, true);
        window.addEventListener("keydown", interrupt, true);
        document.addEventListener("visibilitychange", interrupt);

        return () => {
          // Čišćenje pre prvog kadra (razvojni Strict Mode ponovo montira odmah) ne troši let.
          if (tween && tween.progress() === 0) flown.current = null;
          tween?.kill();
          finish();
        };
      });
    },
    // Jedan let po otvaranju: `flightKey` se menja samo pri novom otvaranju.
    // `revertOnUpdate`: nov cilj ili ključ prekida let u toku (kopija se skida).
    { dependencies: [flightKey, target], revertOnUpdate: true },
  );
}
