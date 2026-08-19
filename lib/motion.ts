/**
 * Motion sistem — jedini izvor trajanja, ease-ova i budžeta za pokret.
 *
 * Ovo je kontrolna tabla koju operater otvara deset puta dnevno, a ne sajt
 * koji se posećuje jednom. Zato su brojevi ovde tvrda ograničenja, ne
 * predlozi: „moćno” u ovom kontekstu znači precizno i brzo, ne dugo i veliko.
 *
 * CSS blizanci ovih vrednosti (`--ease-ui`, `--ease-momentum`,
 * `--duration-press`, `--press-scale`) žive u `app/globals.css`. Kada se menja
 * jedno, menja se i drugo.
 */

/**
 * Kritično prigušen, bez prebačaja. Za sve što se prosto pojavi: reveal,
 * meni, panel, dijalog. CSS blizanac: `--ease-ui`.
 */
export const EASE_UI = "power3.out";

/**
 * Blagi prebačaj. SAMO kada je gestu prethodio zamah — prevlačenje, bacanje,
 * odbacivanje kartice prstom. Prebačaj na meniju koji se samo pojavio deluje
 * pogrešno; prebačaj na kartici koju si odbacio deluje tačno. Ta razlika je
 * cela poenta. CSS blizanac: `--ease-momentum`.
 */
export const EASE_MOMENTUM = "back.out(1.4)";

/** Trajanje svega što ulazi bez zamaha. */
export const DUR_UI = 0.3;

/** Trajanje pokreta koji nastavlja zamah gesta. */
export const DUR_MOMENTUM = 0.34;

/** Reduced motion: kratak opacity cross-fade, bez transform-a. */
export const DUR_REDUCED = 0.15;

/** Odbrojavanje brojčane vrednosti pri prvom prikazu. */
export const DUR_COUNT = 0.5;

/** Pomeraj pri ulasku. Suptilno je moćnije od velikog — zato 12, ne 40. */
export const REVEAL_Y = 12;

/**
 * Ukupno trajanje reveal-a na ekranu, od prvog do poslednjeg elementa.
 * Ovo je plafon za `trajanje + stagger × (broj − 1)`.
 */
export const REVEAL_BUDGET = 0.4;

/** Najveći razmak između dva susedna elementa u stagger-u. */
export const STAGGER_MAX = 0.06;

/**
 * Koliko kašnjenja preostaje pojedinačnom `<Reveal>`-u kada se od budžeta
 * oduzme sopstveno trajanje. Sa 300 ms trajanja i 400 ms budžeta to je 100 ms
 * — ceo prostor za sekvencu na jednom ekranu.
 */
export const MAX_REVEAL_DELAY = 0.1;

/** Nagoveštaj kompozitoru; sklanja se čim animacija završi. */
export const WILL_CHANGE = "transform, opacity";

/**
 * Uslovi za `gsap.matchMedia()`. Reduced motion nije „bez animacije” nego
 * blaža animacija, pa svaka komponenta ima obe grane.
 */
export const MOTION_QUERIES = {
  motion: "(prefers-reduced-motion: no-preference)",
  still: "(prefers-reduced-motion: reduce)",
} as const;

/**
 * Razmak između dece u stagger-u, stisnut tako da poslednje dete završi
 * unutar budžeta. Sa više dece razmak se sam smanjuje — talas ostaje čitljiv
 * jer `power3.out` odradi većinu vidljivog pomeraja u prvoj trećini tvina.
 */
export function resolveStagger(count: number, duration = DUR_UI): number {
  if (count <= 1) return 0;
  const room = REVEAL_BUDGET - duration;
  if (room <= 0) return 0;
  return Math.min(STAGGER_MAX, room / (count - 1));
}

/** Nijedno pozivno mesto ne sme da probije budžet ekrana. */
export function clampRevealDelay(delay: number): number {
  if (!Number.isFinite(delay) || delay <= 0) return 0;
  return Math.min(delay, MAX_REVEAL_DELAY);
}
