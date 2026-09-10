/**
 * Jačina ocene (Fit / Intent) — skala „više = jače" (A1 §2, plan O5).
 *
 * Izmereno 9.9.2026: `FIT 27 %` je bio istaknut žutom (klasa upozorenja), a
 * `FIT 64 %` siv — jer je srednji pojas gađao token `info` koji ne postoji, pa
 * je klasa tiho ispadala. Boja je time označavala „nizak", a čitala se kao
 * „važan". Ovde je jedan niz od neutralnog ka akcentu: slab je prigušen,
 * srednji je običan tekst, jak je cijan. Nikad obrnuto, nikad žuto.
 *
 * Boje su tokeni `--strength-low/mid/high` u `app/globals.css`.
 */

export type Strength = "low" | "mid" | "high";

/** Pragovi u procentima; isti za obe ose. */
export const STRENGTH_HIGH_PCT = 70;
export const STRENGTH_MID_PCT = 35;

export function strengthOf(pct: number): Strength {
  if (pct >= STRENGTH_HIGH_PCT) return "high";
  if (pct >= STRENGTH_MID_PCT) return "mid";
  return "low";
}

export const STRENGTH_TEXT_CLASS: Record<Strength, string> = {
  low: "text-strength-low",
  mid: "text-strength-mid",
  high: "text-strength-high",
};

/** Ispuna merača (traka ispod broja). */
export const STRENGTH_BAR_CLASS: Record<Strength, string> = {
  low: "bg-strength-low",
  mid: "bg-strength-mid",
  high: "bg-strength-high",
};

/** Čip sa procentom: samo jak pojas dobija podlogu i ivicu u akcentu. */
export const STRENGTH_CHIP_CLASS: Record<Strength, string> = {
  low: "border-line bg-surface-raised/60 text-strength-low",
  mid: "border-line-strong bg-surface-raised text-strength-mid",
  high: "border-strength-high/40 bg-strength-high/10 text-strength-high",
};
