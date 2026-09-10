import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

/**
 * Motion sistem — jedini izvor trajanja, ease-ova i budžeta za pokret.
 *
 * Ovo je kontrolna tabla koju operater otvara deset puta dnevno, a ne sajt
 * koji se posećuje jednom. Zato su brojevi ovde tvrda ograničenja, ne
 * predlozi: „moćno” u ovom kontekstu znači precizno i brzo, ne dugo i veliko.
 *
 * CSS blizanci ovih vrednosti (`--ease-ui`, `--ease-momentum`,
 * `--duration-base`, `--duration-press`, `--press-scale`, `--motion-distance`)
 * žive u `app/globals.css`. Kada se menja jedno, menja se i drugo.
 *
 * Specifikacija pokreta (A1 §2, plan O6), koju A8 sprovodi:
 *   - 150–200 ms, kriva `cubic-bezier(.2,.8,.2,1)` — ništa duže osim zamaha;
 *   - prošireni red, fioka filtera i panel zvona su prekidivi (`overwrite:
 *     "auto"`, tvin ide od trenutne vrednosti);
 *   - brojači prelaze (`CountUp`), ne skaču;
 *   - svaka radnja da odziv u ≤ 100 ms (`--duration-press`, optimističko
 *     stanje dugmeta);
 *   - `prefers-reduced-motion: reduce` gasi sve osim neprozirnosti
 *     (`MOTION_QUERIES.still` grana u svakoj komponenti + CSS tokeni).
 */

gsap.registerPlugin(CustomEase);

/**
 * Kritično prigušen, bez prebačaja. Za sve što se prosto pojavi: reveal,
 * meni, panel, dijalog, razmotavanje reda. TAČAN blizanac CSS krive
 * `--ease-ui: cubic-bezier(0.2, 0.8, 0.2, 1)` — registrovan kao CustomEase
 * „ui”, pa ista kriva važi i u GSAP-u i u CSS prelazima.
 */
export const EASE_UI = CustomEase.create("ui", "0.2,0.8,0.2,1");

/**
 * Blagi prebačaj. SAMO kada je gestu prethodio zamah — prevlačenje, bacanje,
 * odbacivanje kartice prstom. Prebačaj na meniju koji se samo pojavio deluje
 * pogrešno; prebačaj na kartici koju si odbacio deluje tačno. Ta razlika je
 * cela poenta. CSS blizanac: `--ease-momentum`.
 */
export const EASE_MOMENTUM = "back.out(1.4)";

/**
 * Trajanje svega što ulazi bez zamaha. 200 ms: dovoljno da se ulazak oseti,
 * dovoljno kratko da ne stoji između operatera i podataka koje otvara deset
 * puta dnevno. CSS blizanac: `--duration-base`.
 */
export const DUR_UI = 0.2;

/** Trajanje pokreta koji nastavlja zamah gesta. */
export const DUR_MOMENTUM = 0.34;

/** Reduced motion: kratak opacity cross-fade, bez transform-a. */
export const DUR_REDUCED = 0.15;

/** Odbrojavanje brojčane vrednosti pri prvom prikazu. */
export const DUR_COUNT = 0.5;

/**
 * Sveži podatak koji stigne iz Convex-a NIJE ulazak ekrana — brojka koja se
 * menja treba da se primeti, ne da ponovo odigra reveal. Zato kratak fade od
 * 120 ms, bez pomeraja: dovoljno da oko uhvati promenu, prekratko da odvuče
 * pažnju sa onoga što operater trenutno radi.
 */
export const DUR_FRESH = 0.12;

/** Pomeraj pri ulasku. Suptilno je moćnije od velikog — zato 10, ne 40. */
export const REVEAL_Y = 10;

/**
 * Pomeraj za nešto što je STIGLO, a ne za nešto što se otkriva. Kraći od
 * `REVEAL_Y` namerno: ulazak ekrana je događaj koji čovek gleda, a pristigla
 * kartica je vest koju treba primetiti bez prekidanja onoga što radi.
 */
export const ARRIVE_Y = 6;

/**
 * Ukupno trajanje reveal-a na ekranu, od prvog do poslednjeg elementa.
 * Ovo je plafon za `trajanje + stagger × (broj − 1)`.
 */
export const REVEAL_BUDGET = 0.3;

/** Najveći razmak između dva susedna elementa u stagger-u. */
export const STAGGER_MAX = 0.035;

/**
 * Koliko kašnjenja preostaje pojedinačnom `<Reveal>`-u kada se od budžeta
 * oduzme sopstveno trajanje. Sa 200 ms trajanja i 300 ms budžeta to je
 * 100 ms — ceo prostor za sekvencu na jednom ekranu.
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
 * jer kriva odradi većinu vidljivog pomeraja u prvoj trećini tvina.
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
