import { fold } from "./pretraga";

/**
 * Predlog adrese projekta iz imena (čarobnjak „Novi projekat“): mala slova,
 * bez dijakritike („Đ“ → „dj“), sve ostalo postaje crtica, najviše 40
 * znakova. Predlog još prolazi pravila P8 (`proveriSlugProjekta`) i proveru
 * zauzetosti; ovde se samo pravi razuman početak.
 */
export function predloziSlug(ime: string): string {
  return fold(ime.replace(/đ/g, "dj").replace(/Đ/g, "Dj"))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
