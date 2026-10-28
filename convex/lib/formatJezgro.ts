/**
 * Jezgro formata koje dele server i front (P7): procenat sa tvrdim razmakom i
 * trajanje. Čisto, bez uvoza: Convex ne uvozi `@/lib`, pa jezgro živi ovde, a
 * `lib/format.ts` ga uvozi.
 */

/** Tvrdi razmak (U+00A0): broj i jedinica se ne razdvajaju na prelomu reda. */
export const NBSP = " ";

const LOCALE = "sr-Latn-RS";

const brojPoDecimalama = new Map<number, Intl.NumberFormat>();

function formatBroja(decimale: number, znak: boolean): Intl.NumberFormat {
  const kljuc = decimale * 2 + (znak ? 1 : 0);
  let fmt = brojPoDecimalama.get(kljuc);
  if (!fmt) {
    fmt = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: decimale,
      maximumFractionDigits: decimale,
      ...(znak ? { signDisplay: "exceptZero" as const } : {}),
    });
    brojPoDecimalama.set(kljuc, fmt);
  }
  return fmt;
}

/** Udeo 0..1 → „53,8 %“ (tvrdi razmak pre znaka). `znak`: „+12,0 %“. */
export function procenat(
  udeo: number,
  decimale = 1,
  znak = false,
): string {
  return `${formatBroja(decimale, znak).format(udeo * 100)}${NBSP}%`;
}

/** Procenat koji je već u rasponu 0..100 → „2,45 %“. */
export function procenatSirov(vrednost: number, decimale = 2): string {
  return `${formatBroja(decimale, false).format(vrednost)}${NBSP}%`;
}

/**
 * Trajanje u sekundama: ispod 60 s „42 s“; ispod sata „1 min 1 s“ (sekunde
 * samo kad su veće od nule); od sata „1 h 2 min“ (bez sekundi). Jedinice su
 * odvojene tvrdim razmakom od broja.
 */
export function trajanje(sekunde: number): string {
  const ukupno = Number.isFinite(sekunde) ? Math.max(0, Math.round(sekunde)) : 0;
  if (ukupno < 60) return `${ukupno}${NBSP}s`;

  if (ukupno < 3600) {
    const min = Math.floor(ukupno / 60);
    const s = ukupno % 60;
    return s > 0 ? `${min}${NBSP}min ${s}${NBSP}s` : `${min}${NBSP}min`;
  }

  const h = Math.floor(ukupno / 3600);
  const min = Math.floor((ukupno % 3600) / 60);
  return min > 0 ? `${h}${NBSP}h ${min}${NBSP}min` : `${h}${NBSP}h`;
}
