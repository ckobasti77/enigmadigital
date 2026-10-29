// Preneto iz Devotion packages/shared/src/motion.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Rečnik pokreta — JEDINI izvor brojeva za oba klijenta (PLAN §6, P10).
 * Web ga prevodi u GSAP (`apps/web/lib/motion/`: CustomEase iz krive springa),
 * telefon u Reanimated (`apps/mobile/src/theme/motion.ts`: `withSpring` sa
 * istim stiffness/damping/mass).
 *
 * Spring je zadat po Apple modelu — `response` (sekunde, period neprigušenog
 * springa) i `dampingRatio` (ζ; 1 = bez prebačaja, < 1 = odskok). Konverzija:
 *   stiffness = (2π / response)² · mass
 *   damping   = 4π · dampingRatio · mass / response
 *
 * Smanjen pokret: nema pomeranja, skaliranja ni stagger-a — samo promena
 * neprozirnosti do `REDUCED_FADE_MS`.
 */

/** Trajanja tween prelaza (ms). */
export const DURATION = {
  /** Pritisak (scale 0.97). */
  press: 90,
  /** Mikro povratna informacija, ulaz stavke liste. */
  quick: 160,
  /** Standardni prelaz. */
  base: 240,
  /** Prelaz stranice ili opsega. */
  slow: 380,
} as const;

export type DurationName = keyof typeof DURATION;

/** Smanjen pokret: samo neprozirnost, najviše ovoliko (ms). */
export const REDUCED_FADE_MS = 120;

/** Kriva za tween put (ease-out), kao `cubic-bezier(...)` i Reanimated `Easing.bezier`. */
export const STANDARD_EASE_BEZIER = [0.22, 1, 0.36, 1] as const;

export type SpringPreset = {
  /** Sekunde. */
  response: number;
  /** ζ — 1 kritično prigušeno, < 1 sa prebačajem. */
  dampingRatio: number;
};

export const SPRING = {
  /** Odgovor UI-ja (indikator trake, dijalog). */
  snappy: { response: 0.32, dampingRatio: 0.86 },
  /** Sheet, drawer, panel. */
  smooth: { response: 0.42, dampingRatio: 1 },
  /** Prelaz stranice ili opsega. */
  gentle: { response: 0.5, dampingRatio: 1 },
  /** Samo trenuci uspeha (kvačica). */
  bouncy: { response: 0.45, dampingRatio: 0.7 },
} as const satisfies Record<string, SpringPreset>;

export type SpringName = keyof typeof SPRING;

export const SPRING_NAMES: ReadonlyArray<SpringName> = [
  "snappy",
  "smooth",
  "gentle",
  "bouncy",
];

/** Stagger ulaza liste: korak, najviše stavki koje kasne, gornja granica ukupno. */
export const STAGGER = { stepMs: 24, maxItems: 6, maxTotalMs: 320 } as const;

export const SCALE = {
  /** Pritisak dugmeta/reda. */
  press: 0.97,
  /** Ulaz stavke liste. */
  enterFrom: 0.98,
  /** Ulaz dijaloga (brzi unos). */
  dialogFrom: 0.96,
  /** Odskok ikonice izabranog taba. */
  tabBounceFrom: 0.9,
} as const;

/** Koliko stavka „doputuje" nagore pri ulasku (px). */
export const ENTER_OFFSET_PX = 8;

/**
 * Swipe reda na telefonu (plan K07, E5) — jedan skup brojeva za svaku listu.
 * Web nema swipe; brojevi su ovde da telefonski `components/motion/` ne uvodi
 * sopstvene konstante pokreta (pravilo „brojevi samo iz shared").
 */
export const SWIPE = {
  /** Vodoravni pomeraj posle kog gest preuzima red (pt). */
  activationPx: 14,
  /** Uspravni pomeraj posle kog gest odustaje u korist skrola (pt). */
  failOffsetYPx: 10,
  /** Prag potvrde radnje (pt). */
  commitPx: 96,
  /** Brzina „trzaja" koja potvrđuje i pre praga (pt/s)… */
  flickVelocity: 800,
  /** …ali tek posle bar ovoliko puta u istom smeru (pt). */
  flickMinPx: 48,
  /** Posle ovoliko red prati prst uz gumeni otpor (pt). */
  resistAfterPx: 120,
  /** Konstanta gumenog otpora (Apple: 0,55). */
  rubberband: 0.55,
  /** Ikonica radnje raste od ove veličine do 1 na pragu. */
  iconScaleFrom: 0.8,
  /** Dodir u prvih ovoliko pt od leve ivice pripada sistemskom „nazad". */
  edgeGuardPx: 24,
} as const;

/** Dugi pritisak na redu (ms). */
export const LONG_PRESS_MS = 300;

/** Prag za vreme smirivanja: preostalo odstupanje ≤ 0,1 % puta (plan K01, D9). */
export const SETTLE_EPSILON = 0.001;

// --- Spring matematika ------------------------------------------------------

export type SpringPhysics = { stiffness: number; damping: number; mass: number };

export function springPhysics(preset: SpringPreset, mass = 1): SpringPhysics {
  const omega = (2 * Math.PI) / preset.response;
  return {
    stiffness: omega * omega * mass,
    damping: (4 * Math.PI * preset.dampingRatio * mass) / preset.response,
    mass,
  };
}

/** Isto što i `springPhysics`, oblik koji Reanimated `withSpring` prima. */
export function reanimatedSpring(preset: SpringPreset): SpringPhysics {
  return springPhysics(preset, 1);
}

/**
 * Položaj springa u trenutku `t` (s) za korak 0 → 1 iz mirovanja.
 * Prigušeni (ζ<1), kritični (ζ=1) i nadkritični (ζ>1) slučaj.
 */
export function springPosition(preset: SpringPreset, t: number): number {
  if (t <= 0) return 0;
  const omega = (2 * Math.PI) / preset.response;
  const zeta = preset.dampingRatio;
  if (zeta < 1) {
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * omega * t);
    return (
      1 -
      envelope *
        (Math.cos(omegaD * t) + ((zeta * omega) / omegaD) * Math.sin(omegaD * t))
    );
  }
  if (zeta === 1) {
    return 1 - Math.exp(-omega * t) * (1 + omega * t);
  }
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -omega * (zeta - root);
  const r2 = -omega * (zeta + root);
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

/**
 * Vreme (s) posle koga spring ostaje unutar `epsilon` od cilja. Za ζ<1 iz
 * obvojnice e^(−ζω₀t)/√(1−ζ²) (zatvoren oblik, gornja granica); za ζ≥1
 * odstupanje opada monotono, pa se traži bisekcijom.
 */
export function settleTime(
  preset: SpringPreset,
  epsilon = SETTLE_EPSILON,
): number {
  const omega = (2 * Math.PI) / preset.response;
  const zeta = preset.dampingRatio;
  if (zeta < 1) {
    return Math.log(1 / (epsilon * Math.sqrt(1 - zeta * zeta))) / (zeta * omega);
  }
  let low = 0;
  let high = 1;
  while (1 - springPosition(preset, high) > epsilon) high *= 2;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (low + high) / 2;
    if (1 - springPosition(preset, middle) > epsilon) low = middle;
    else high = middle;
  }
  return high;
}

/** Trajanje GSAP tween-a koji crta ovaj spring (ms). */
export function springDurationMs(preset: SpringPreset): number {
  return Math.round(settleTime(preset) * 1000);
}

/**
 * Tačke krive [t, x], t normalizovan na vreme smirivanja (0…1). Prva tačka je
 * (0,0), poslednja tačno (1,1); x može preći 1 kod springa sa odskokom.
 */
export function sampleSpring(
  preset: SpringPreset,
  samples = 64,
): Array<[number, number]> {
  const count = Math.max(2, Math.floor(samples));
  const duration = settleTime(preset);
  const points: Array<[number, number]> = [];
  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    points.push([t, index === count ? 1 : springPosition(preset, t * duration)]);
  }
  points[0] = [0, 0];
  return points;
}

function formatCoordinate(value: number) {
  const rounded = Math.round(value * 10_000) / 10_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** SVG putanja za GSAP `CustomEase.create(ime, putanja)`: "M0,0 L… L1,1". */
export function springEasePath(preset: SpringPreset, samples = 64): string {
  const [first, ...rest] = sampleSpring(preset, samples);
  const head = `M${formatCoordinate(first[0])},${formatCoordinate(first[1])}`;
  return [
    head,
    ...rest.map(([t, x]) => `L${formatCoordinate(t)},${formatCoordinate(x)}`),
  ].join(" ");
}

// --- Stagger ----------------------------------------------------------------

/** Zakašnjenje `index`-te stavke: 24 ms korak, posle 6. stavke se više ne kasni. */
export function staggerDelayMs(index: number): number {
  const capped = Math.min(Math.max(Math.floor(index), 0), STAGGER.maxItems - 1);
  return capped * STAGGER.stepMs;
}

/** Ukupno trajanje ulaza `count` stavki (ulaz stavke = `DURATION.quick`). */
export function staggerTotalMs(count: number): number {
  if (count <= 0) return 0;
  return staggerDelayMs(count - 1) + DURATION.quick;
}

// --- Brojevi koji se „kotrljaju" --------------------------------------------

/** „7", „42", „99+" — broj za bedž. */
export function formatCount(value: number, cap = 99): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return safe > cap ? `${cap}+` : String(safe);
}

export type DigitRoll = {
  /** Stabilan ključ po poziciji sa desna („d1" = jedinice). */
  key: string;
  from: string | null;
  to: string | null;
  /** 1 = broj raste (cifra ulazi odozdo), -1 = opada, 0 = ista cifra. */
  direction: 1 | -1 | 0;
};

/** Plan kotrljanja cifara između dva broja, poravnato zdesna. */
export function rollDigits(previous: number, next: number, cap = 99): DigitRoll[] {
  const from = formatCount(previous, cap);
  const to = formatCount(next, cap);
  const width = Math.max(from.length, to.length);
  const overall: 1 | -1 | 0 =
    next > previous ? 1 : next < previous ? -1 : 0;
  const rolls: DigitRoll[] = [];
  for (let index = 0; index < width; index += 1) {
    const fromChar = from[from.length - width + index] ?? null;
    const toChar = to[to.length - width + index] ?? null;
    rolls.push({
      key: `d${width - index}`,
      from: fromChar,
      to: toChar,
      direction: fromChar === toChar ? 0 : overall,
    });
  }
  return rolls;
}
