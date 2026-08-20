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
 * PRISTIGLA JE STVAR, NE KOMPONENTA (V2/5). Ranije se odluka donosila po tome
 * da li se `Arrive` montirao posle scope-a, čime su dve različite stvari
 * izjednačene: promena sortiranja ili filtera ume da odmontira i ponovo montira
 * kartice koje čovek gleda već pola minuta, pa je ceo ekran odletao kroz
 * fade+8px kao da je sve tek stiglo. Scope zato pamti IDENTITETE redova koje je
 * već prikazao — red koji je jednom viđen ne animira se više nikad, bez obzira
 * na to koliko puta se montira.
 */
interface ArrivalScopeValue {
  /** Koji `resetKey` je ovu kutiju napravio — identitet pamćenja. */
  key: string | undefined;
  /** Da li je početni kadar prošao; pre toga ništa nije „pristiglo". */
  settled: { current: boolean };
  /** Identiteti redova koje je ovaj scope već nacrtao. */
  seen: Set<string>;
}

const ArrivalContext = createContext<ArrivalScopeValue | null>(null);

export function ArrivalScope({
  children,
  ready = true,
  resetKey,
}: {
  children: ReactNode;
  /**
   * Da li su podaci stigli. Dok je `false` (upit još traje, skelet je na
   * ekranu) scope se ne sleže, pa prva porcija redova pripada ekranu — nju
   * otkriva `Reveal` iznad — a ne dolasku.
   */
  ready?: boolean;
  /**
   * Kad se promeni, scope kreće ispočetka: nov filter ili nova pretraga vraća
   * sasvim drugu listu, i to je ponovo crtanje ekrana, a ne pedeset dolazaka.
   */
  resetKey?: string;
}) {
  // Nova kutija na svaku promenu ključa. Reset je time obična promena
  // identiteta konteksta, bez ijednog upisa u ref tokom rendera.
  const value = useMemo<ArrivalScopeValue>(
    () => ({
      key: resetKey,
      settled: { current: false },
      seen: new Set<string>(),
    }),
    [resetKey],
  );

  useEffect(() => {
    if (!ready) return;
    // Jedan kadar kasnije, ne odmah: deca se montiraju u istom prolazu kao i
    // sam scope, pa bi ih trenutno postavljanje sve proglasilo pristiglima.
    const frame = requestAnimationFrame(() => {
      value.settled.current = true;
    });
    return () => {
      cancelAnimationFrame(frame);
      // React u razvoju montira dvaput; bez ovoga bi drugi prolaz zatekao
      // scope kao „slegnut" i animirao ceo početni ekran.
      value.settled.current = false;
    };
  }, [ready, value]);

  return (
    <ArrivalContext.Provider value={value}>{children}</ArrivalContext.Provider>
  );
}

/**
 * Jedna stavka u takvoj listi. Van `ArrivalScope`-a ne radi ništa — renderuje
 * decu i ćuti — što je namerno: komponenta koja se koristi i na ekranu bez
 * uživo osvežavanja ne sme tamo da počne da poskakuje.
 *
 * `id` je identitet REDA (`commentId`, `mediaId`, `postId`), ne React ključ i
 * ne id dokumenta koji se menja pri ponovnom upisu.
 *
 * Pod `prefers-reduced-motion: reduce` ostaje samo kratak opacity prelaz, bez
 * pomeraja, kroz iste `MOTION_QUERIES` kao i ostatak sistema.
 */
export function Arrive({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const scope = useContext(ArrivalContext);
  const ref = useRef<HTMLDivElement>(null);

  // Ceo račun stoji u layout efektu, dakle pre iscrtavanja: prvi kadar već
  // nosi opacity 0, pa nema bleska pre nego što tvin krene.
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || scope === null) return;

      // Red koji je scope već video ostaje kakav jeste, pa se montirao ponovo
      // ili ne. Upisuje se i onda kada se ne animira — „viđen" znači prikazan,
      // ne animiran.
      if (scope.seen.has(id)) return;
      scope.seen.add(id);
      if (!scope.settled.current) return;

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
    { scope: ref, dependencies: [id, scope] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
