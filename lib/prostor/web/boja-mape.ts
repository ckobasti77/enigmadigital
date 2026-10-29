// Boja beleške i ideje na mapama (SPAJANJE S14).
import type { CategorySlot } from "../../signal-colors";

/** Boje koje korisnik bira za belešku ili ideju (isti skup u obe tabele). */
export type BojaMape = "neutral" | "violet" | "blue" | "green" | "amber" | "rose";

export const BOJE_MAPE: readonly BojaMape[] = [
  "neutral",
  "violet",
  "blue",
  "green",
  "amber",
  "rose",
];

/**
 * Boja je KATEGORIJA (CLAUDE.md, uloga 4), pa ide iz validirane palete
 * `--chart-1..6` kroz `data-cat` (`app/globals.css`), kao čipovi signala.
 * `amber` ide na narandžastu (slot 2), jer je slot 4 rezervisan (preblizu
 * zlatnoj, koja je samo nagrada). `null` = neutralna, bez boje kategorije.
 */
export const BOJA_MAPE_SLOT: Record<BojaMape, CategorySlot | null> = {
  neutral: null,
  violet: 6,
  blue: 1,
  green: 3,
  amber: 2,
  rose: 5,
};

/** Nazivi su Devotionovi; „Ćilibar“ je „Narandžasta“, jer se tako i vidi. */
export const BOJA_MAPE_NAZIV: Record<BojaMape, string> = {
  neutral: "Neutralna",
  violet: "Ljubičasta",
  blue: "Plava",
  green: "Zelena",
  amber: "Narandžasta",
  rose: "Roze",
};
