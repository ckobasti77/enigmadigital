import type { PreporucenaPonuda } from "@/convex/lib/siteAudit";

/**
 * Natpisi za ocenu sajta (GL10) — jedan rečnik za profil, filtere i niše.
 * `Record<PreporucenaPonuda, string>` obavezuje da svaka vrednost enuma ima
 * natpis; nova vrednost bez natpisa obara `tsc`.
 */
export const PONUDA_NATPISI: Record<PreporucenaPonuda, string> = {
  nov_sajt: "nov sajt",
  redizajn: "redizajn",
  webshop: "webshop",
  zakazivanje: "zakazivanje",
  seo: "SEO",
  brzina: "brzina",
  nista: "ništa",
};

export function ponudaNatpis(p: string): string {
  return (PONUDA_NATPISI as Record<string, string>)[p] ?? p;
}

/** Pet Claudeovih ocena (plan §3), u redosledu rubrike. */
export const CLAUDE_OCENE: ReadonlyArray<{
  kljuc: "prviUtisak" | "jasnocaPonude" | "putDoKontakta" | "mobilnaUpotrebljivost" | "azurnost";
  natpis: string;
}> = [
  { kljuc: "prviUtisak", natpis: "Prvi utisak" },
  { kljuc: "jasnocaPonude", natpis: "Jasnoća ponude" },
  { kljuc: "putDoKontakta", natpis: "Put do kontakta" },
  { kljuc: "mobilnaUpotrebljivost", natpis: "Mobilna upotrebljivost" },
  { kljuc: "azurnost", natpis: "Ažurnost" },
];

/** Lighthouse kategorije (0–100), redom kao u PSI izveštaju. */
export const LIGHTHOUSE_KATEGORIJE: ReadonlyArray<{
  kljuc: "performance" | "accessibility" | "bestPractices" | "seo";
  natpis: string;
}> = [
  { kljuc: "performance", natpis: "Performance" },
  { kljuc: "accessibility", natpis: "Pristupačnost" },
  { kljuc: "bestPractices", natpis: "Dobre prakse" },
  { kljuc: "seo", natpis: "SEO" },
];
