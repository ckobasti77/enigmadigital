import gsap from "gsap";
import { DUR_COUNT, DUR_FRESH, DUR_REDUCED, DUR_UI, EASE_UI } from "@/lib/motion";
import { holdCssTransition, releaseCssTransition } from "./css-transition";

/**
 * Motor odbrojavanja — jedini izvor logike koju `CountUp` crta.
 *
 * ZAŠTO POSTOJI ODVOJENO: A8 je animirao pisanjem u `el.textContent`, čime je
 * zamenio React-ov tekstualni čvor svojim. React je posle držao referencu na
 * čvor koji više nije u dokumentu, pa nijedan kasniji podatak nije stizao do
 * ekrana — cela aplikacija je pokazivala „0". Zato je pravilo ovde tvrdo:
 * **broj do ekrana ide ISKLJUČIVO kroz `emit`** (u komponenti = React state),
 * nikad kroz `textContent`. Element (`el`) se dodiruje samo za neprozirnost.
 *
 * Motor je izvučen iz komponente da bi `scripts/count-up-check.ts` dokazivao
 * baš ovaj kod (ne parafrazu): nad modelom React-ovog tekstualnog čvora, sa
 * pravim GSAP-om, da posle promene vrednosti tekst odgovara novoj vrednosti —
 * i pri prvom prikazu i pri ažuriranju, u obe grane pokreta.
 */
export interface CountEffectOpts {
  /** Element nad kojim se radi SAMO neprozirnost. Broj nikad ne ide ovde. */
  el: HTMLElement | null;
  /** `prefers-reduced-motion: reduce` — cifre koje se vrte JESU pokret. */
  reduced: boolean;
  /** Prvi prikaz (odbroj od `from`) ili svež podatak (pređi od zatečene). */
  isUpdate: boolean;
  /** Odakle kreće odbrojavanje pri prvom prikazu. */
  from: number;
  /** Trenutno prikazana vrednost — polazna tačka prekidivog prelaza. */
  current: number;
  /** Ciljna vrednost. Terminalni `emit` je UVEK tačno ova vrednost. */
  value: number;
  /** Jedini kanal do ekrana (u komponenti: React `setState`). */
  emit: (v: number) => void;
}

export function runCountEffect(o: CountEffectOpts): gsap.core.Tween | null {
  const { el, reduced, isUpdate, from, current, value, emit } = o;

  if (reduced) {
    // Pokret ne može/ne sme da se izvede → prikaži TAČAN broj odmah.
    // Tačnost pobeđuje pokret, uvek. Ostaje samo kratak cross-fade.
    emit(value);
    if (el) {
      holdCssTransition(el);
      return gsap.fromTo(
        el,
        { opacity: isUpdate ? 0.4 : 0 },
        {
          opacity: 1,
          duration: isUpdate ? DUR_FRESH : DUR_REDUCED,
          ease: "none",
          overwrite: "auto",
          onComplete: () => releaseCssTransition(el),
        },
      );
    }
    return null;
  }

  // Prvi prikaz odbroji od `from`; svež podatak pređe od ZATEČENE prikazane
  // vrednosti (`current`) — prelaz je prekidiv, još svežiji podatak preuzima
  // odavde (`overwrite: "auto"`), pa se tvinovi nikad ne slažu jedan preko
  // drugog. Krajnja vrednost se upisuje eksplicitno u `onComplete`, tako da
  // brojka nikad ne ostane na među-kadru.
  const start = isUpdate ? current : from;
  const proxy = { v: start };
  emit(start);
  return gsap.to(proxy, {
    v: value,
    duration: isUpdate ? DUR_UI : DUR_COUNT,
    ease: EASE_UI,
    overwrite: "auto",
    onUpdate: () => emit(proxy.v),
    onComplete: () => emit(value),
  });
}
