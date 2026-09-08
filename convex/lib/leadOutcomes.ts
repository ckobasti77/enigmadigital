import { v } from "convex/values";

/**
 * ============================================================================
 * ISHODI KOMUNIKACIJE — zatvorena lista (§9)
 * ============================================================================
 *
 * Izdvojeno iz `leadCrmStore.ts` (GL6 §5): komponenta
 * `lead-quick-dialogs.tsx` uvozi `LEAD_OUTCOME_CODES` kao VREDNOST, a uvoz iz
 * `@/convex/leadCrmStore` povlači ceo modul (koji uvozi `./_generated/server`)
 * u browser bundle — 14× „Convex functions should not be imported in the
 * browser" u konzoli. Ovaj fajl uvozi samo `convex/values` (bezbedan i na
 * klijentu), pa ga i komponenta i `leadCrmStore` uvoze odavde.
 *
 * Ishod je RAZLOG/REZULTAT razgovora i namerno je odvojen od faze (`stage`):
 * „dobijen"/„izgubljen" su faze, ne ishodi. Slobodan tekst je ranije značio da
 * „nije zainteresovan" i „ne zanima ga" budu dva različita ishoda i da
 * statistika ne postoji — zato zatvorena lista + odvojena slobodna napomena
 * (`note` arg u `recordOutcome`).
 *
 * `LEAD_OUTCOME_CODES` je jedini izvor istine za skup. `LEAD_OUTCOME_VALIDATOR`
 * i tip `LeadOutcome` se izvode odavde: validator zaključava argument
 * `recordOutcome.outcome` (granica mutacije prima samo kod iz ovog skupa), forma
 * u `lead-actions-panel.tsx` bira kod iz njega, a prikaz koristi
 * `leadOutcomeLabel` (`components/app/leadovi/lead-labels.ts`).
 *
 * `isLeadOutcome` razlikuje kod iz zatvorene liste od starih, slobodno-
 * tekstualnih zapisa u bazi — te stare vrednosti se prikazuju KAKVE JESU
 * (`leadOutcomeLabel` pada na sirovu vrednost), nikad kao „nepoznato".
 */
export const LEAD_OUTCOME_CODES = [
  "nije_se_javio",
  "zainteresovan",
  "nije_zainteresovan",
  "preskupo",
  "nema_potrebe",
  "konkurencija",
  "postojeci_klijent",
  "trazeno_da_se_ne_zove",
  "ostalo",
] as const;

export type LeadOutcome = (typeof LEAD_OUTCOME_CODES)[number];

export const LEAD_OUTCOME_VALIDATOR = v.union(
  v.literal("nije_se_javio"),
  v.literal("zainteresovan"),
  v.literal("nije_zainteresovan"),
  v.literal("preskupo"),
  v.literal("nema_potrebe"),
  v.literal("konkurencija"),
  v.literal("postojeci_klijent"),
  v.literal("trazeno_da_se_ne_zove"),
  v.literal("ostalo"),
);

export function isLeadOutcome(value: string): value is LeadOutcome {
  return (LEAD_OUTCOME_CODES as readonly string[]).includes(value);
}
