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
  /**
   * Tab nije vidljiv (`document.visibilityState !== "visible"`). Pregledač tada
   * ne daje kadrove, pa bi odbrojavanje stajalo na polaznoj vrednosti dok se
   * tab ne vrati — pozadinski tab je 15 s pokazivao „0" (F8).
   */
  hidden?: boolean;
  /**
   * Tvin broja iz prethodnog poziva. Gasi se pre novog: svaki poziv ima svoj
   * `proxy`, pa ga `overwrite` ne vidi, a duže prvo odbrojavanje bi završilo
   * POSLE kraćeg prelaza i vratilo staru brojku na ekran.
   */
  previous?: gsap.core.Tween | null;
}

/**
 * Korak na koji se zaokružuju međuvrednosti — preciznost cilja (40 → 1,
 * 0,37 → 0,01). Bez toga `format` koji sam ne zaokružuje ispiše
 * „Svakih 19.814826m" na putu do 30 (F7/F8). `null` = ne zaokružuj.
 */
export function precisionStep(value: number): number | null {
  const text = String(value);
  if (!Number.isFinite(value) || text.includes("e")) return null;
  const decimals = text.split(".")[1]?.length ?? 0;
  return decimals > 6 ? null : 10 ** -decimals;
}

export function runCountEffect(o: CountEffectOpts): gsap.core.Tween | null {
  const { el, reduced, isUpdate, from, current, value, emit } = o;

  o.previous?.kill();

  if (o.hidden) {
    // Niko ne gleda i kadrova nema → tačan broj odmah, bez tvina.
    emit(value);
    return null;
  }

  if (!isUpdate && from === value) {
    // Broj koji pri otvaranju stoji: nema ni tvina ni pretapanja. Ekran sme
    // da odbroji samo svoj fokus broj (najviše 1–2 animirana elementa po
    // prikazu); svi ostali su tu od prvog kadra i pomere se tek na svež podatak.
    emit(value);
    return null;
  }

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
  const step = precisionStep(value);
  const snap = step === null ? (v: number) => v : gsap.utils.snap(step);
  emit(start);
  return gsap.to(proxy, {
    v: value,
    duration: isUpdate ? DUR_UI : DUR_COUNT,
    ease: EASE_UI,
    overwrite: "auto",
    onUpdate: () => emit(snap(proxy.v)),
    onComplete: () => emit(value),
  });
}
