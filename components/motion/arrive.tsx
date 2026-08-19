"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ARRIVE_Y,
  DUR_REDUCED,
  DUR_UI,
  EASE_UI,
  MOTION_QUERIES,
  WILL_CHANGE,
} from "@/lib/motion";
import { holdCssTransition, releaseCssTransition } from "./css-transition";

gsap.registerPlugin(useGSAP);

/**
 * Ulaz za podatak koji je STIGAO dok je ekran već otvoren.
 *
 * `Reveal` otkriva ekran: to je događaj koji se dešava jednom, pri dolasku na
 * stranicu, i sme da bude primetan. Ovo je nešto drugo — Convex je poslao novu
 * objavu ili nov komentar, i kartica treba da se pojavi tako da je čovek
 * primeti, a da mu ne izgleda kao da se stranica ponovo učitala. Otud kraći
 * pomeraj (8 px umesto 12) i nikakav stagger: stigla je jedna stvar, ne ceo
 * ekran.
 *
 * Razlika između to dvoje ne može da se odluči u samoj kartici — ona ne zna da
 * li je montirana zajedno sa ekranom ili minut kasnije. Zato `ArrivalScope`
 * obeleži trenutak kada je lista prvi put nacrtana, a svako dete koje se
 * montira POSLE toga zna da je pridošlica.
 */
const ArrivalContext = createContext<{ settled: { current: boolean } } | null>(
  null,
);

/**
 * Omotač oko liste koja se osvežava uživo. Sve što se montira u prvom kadru
 * pripada ekranu i ne animira se ovde (to je `Reveal`-ov posao); sve posle toga
 * je pristiglo.
 */
export function ArrivalScope({ children }: { children: ReactNode }) {
  const settled = useRef(false);
  // Stabilna kutija oko ref-a: kontekst mora da nosi istu vrednost kroz sve
  // rendere, inače bi se svako dete preplatilo novim kontekstom i ponovo
  // odlučivalo da li je pridošlica.
  const value = useMemo(() => ({ settled }), []);

  useEffect(() => {
    // Jedan kadar kasnije, ne odmah: deca se montiraju u istom prolazu kao i
    // sam scope, pa bi ih trenutno postavljanje sve proglasilo pristiglima.
    const id = requestAnimationFrame(() => {
      settled.current = true;
    });
    return () => {
      cancelAnimationFrame(id);
      // React u razvoju montira dvaput; bez ovoga bi drugi prolaz zatekao
      // scope kao „slegnut" i animirao ceo početni ekran.
      settled.current = false;
    };
  }, []);

  return (
    <ArrivalContext.Provider value={value}>
      {children}
    </ArrivalContext.Provider>
  );
}

/**
 * Jedna stavka u takvoj listi. Van `ArrivalScope`-a ne radi ništa — renderuje
 * decu i ćuti — što je namerno: komponenta koja se koristi i na ekranu bez
 * uživo osvežavanja ne sme tamo da počne da poskakuje.
 *
 * Pod `prefers-reduced-motion: reduce` ostaje samo kratak opacity prelaz, bez
 * pomeraja, kroz iste `MOTION_QUERIES` kao i ostatak sistema.
 */
export function Arrive({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const scope = useContext(ArrivalContext);
  const ref = useRef<HTMLDivElement>(null);
  // Odluka se donosi jednom, pri prvom renderu ove stavke, i posle se ne menja:
  // kasniji render iste kartice (nov broj lajkova) ne sme ponovo da animira.
  const playRef = useRef<boolean | null>(null);
  if (playRef.current === null) {
    playRef.current = scope?.settled.current === true;
  }

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !playRef.current) return;
      playRef.current = false;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const still = Boolean(ctx.conditions?.still);
        if (still) holdCssTransition(el);

        gsap.set(
          el,
          still
            ? { opacity: 0 }
            : { opacity: 0, y: ARRIVE_Y, willChange: WILL_CHANGE },
        );
        gsap.to(el, {
          opacity: 1,
          ...(still ? {} : { y: 0 }),
          duration: still ? DUR_REDUCED : DUR_UI,
          ease: still ? "none" : EASE_UI,
          overwrite: "auto",
          onComplete: () => {
            el.style.removeProperty("will-change");
            releaseCssTransition(el);
          },
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
