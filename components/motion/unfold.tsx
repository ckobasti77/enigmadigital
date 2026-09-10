"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { holdCssTransition, releaseCssTransition } from "./css-transition";

gsap.registerPlugin(useGSAP);

/**
 * Sadržaj koji se RAZMOTA ispod reda tabele — prošireni red, traka posle
 * poziva. Visina ide od 0 do prirodne uz opacity.
 *
 * Ovo je svesni izuzetak od pravila „samo transform i opacity”: razmotavanje
 * mora da pomeri redove ispod sebe, a to transform ne ume — sa `scaleY` bi
 * susedni redovi skočili odjednom i tek onda bi se sadržaj „pojavio” u rupi.
 *
 * ── Prekidivost (A8 §1, specifikacija iz A1 §2) ─────────────────────────────
 *
 * Dva režima, i razlika je cela poenta:
 *
 *  - **bez `open`** (zatečeni oblik, `{uslov && <Unfold>…}`): animira se samo
 *    ulazak; zatvaranje je odmontiranje, dakle rez.
 *  - **sa `open`**: komponenta ostaje na mestu i sama animira izlazak. Svaki
 *    tvin ide `overwrite: "auto"` i kreće od TRENUTNE visine, ne od nule —
 *    klik na pola razmotavanja vraća sadržaj odatle dokle je stigao, umesto
 *    da skoči na kraj pa nestane.
 *
 * Deca se montiraju samo dok su vidljiva: prošireni red čita iz Convex-a, pa
 * 25 uvek montiranih redova ne bi bio pokret nego trošak.
 *
 * Pod `prefers-reduced-motion: reduce` visina se namešta bez animacije —
 * ostaje samo kratak opacity cross-fade.
 */
export function Unfold({
  children,
  className,
  open,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * Kada se prosledi, komponenta ostaje montirana i animira i izlazak. Kada se
   * izostavi, ponaša se kao pre: animira ulazak pri montiranju.
   */
  open?: boolean;
}) {
  const kontrolisan = open !== undefined;
  const otvoren = open ?? true;

  const ref = useRef<HTMLDivElement>(null);

  // „Deca smeju da vise u DOM-u i kad je zatvoreno” — pali se u renderu u kom
  // `open` padne na false, jer bez toga nema šta da se animira, i gasi se tek
  // kad izlazni tvin završi.
  // Obrazac „prilagodi stanje kad se prop promeni" iz React dokumentacije:
  // poređenje ide preko STANJA, ne preko ref-a — ref pročitan u renderu ne
  // garantuje ponovno iscrtavanje (i `react-hooks/refs` ga s pravom odbija).
  const [zadrzi, setZadrzi] = useState(false);
  const [bioOtvoren, setBioOtvoren] = useState(otvoren);
  if (kontrolisan && otvoren !== bioOtvoren) {
    setBioOtvoren(otvoren);
    if (!otvoren) setZadrzi(true);
  }

  const uEfektu = useRef(otvoren);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const bio = uEfektu.current;
      uEfektu.current = otvoren;

      const mm = gsap.matchMedia();

      // ── Izlazak ─────────────────────────────────────────────────────────
      if (kontrolisan && !otvoren) {
        if (!bio && !zadrzi) return; // već zatvoreno i mirno
        mm.add(MOTION_QUERIES, (ctx) => {
          const kraj = () => {
            setZadrzi(false);
            gsap.set(el, { clearProps: "height,overflow,opacity,willChange" });
            releaseCssTransition(el);
          };

          if (ctx.conditions?.still) {
            holdCssTransition(el);
            gsap.to(el, {
              opacity: 0,
              duration: DUR_REDUCED,
              ease: "none",
              overwrite: "auto",
              onComplete: kraj,
            });
            return;
          }

          gsap.set(el, { overflow: "hidden", willChange: "height, opacity" });
          gsap.to(el, {
            height: 0,
            opacity: 0,
            duration: DUR_UI,
            ease: EASE_UI,
            overwrite: "auto",
            onComplete: kraj,
          });
        });
        return;
      }

      // ── Ulazak ──────────────────────────────────────────────────────────
      // Otvoreno i mirno: ništa se nije promenilo, ne animira se ponovo.
      if (kontrolisan && bio && !zadrzi) return;

      mm.add(MOTION_QUERIES, (ctx) => {
        const kraj = () => {
          gsap.set(el, { clearProps: "height,overflow,willChange" });
          releaseCssTransition(el);
        };

        if (ctx.conditions?.still) {
          holdCssTransition(el);
          gsap.set(el, { opacity: 0 });
          gsap.to(el, {
            opacity: 1,
            duration: DUR_REDUCED,
            ease: "none",
            overwrite: "auto",
            onComplete: kraj,
          });
          return;
        }

        gsap.set(el, { overflow: "hidden", willChange: "height, opacity" });
        // Prekinut izlazak već ima visinu na kojoj je zatečen — nulira se samo
        // element koji miruje, inače bi prekid bio skok na nulu pa nazad.
        if (!gsap.isTweening(el)) gsap.set(el, { height: 0, opacity: 0 });
        gsap.to(el, {
          height: "auto",
          opacity: 1,
          duration: DUR_UI,
          ease: EASE_UI,
          overwrite: "auto",
          onComplete: kraj,
        });
      });
    },
    { dependencies: [otvoren, zadrzi], scope: ref },
  );

  const prikazi = !kontrolisan || otvoren || zadrzi;

  return (
    <div ref={ref} className={className} aria-hidden={kontrolisan && !otvoren}>
      {prikazi ? children : null}
    </div>
  );
}
