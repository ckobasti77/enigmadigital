import { v } from "convex/values";

/**
 * Validatori oblika koje Napredak pamti i vraća (B4, ui-boost-plan.md §6.10).
 *
 * Odvojeni od `napredak.ts` zato što pravila moraju da ostanu bez ijednog
 * Convex uvoza (dokazuju se u Node-u), a šema i funkcije dele iste oblike.
 * Svaki validator ovde ima svoj tip u `napredak.ts` — ako se raziđu, `tsc`
 * pada na mestu gde se jedan dodeljuje drugom.
 */

const broj = v.number();
const danIliNull = v.union(v.string(), v.null());

/** Zamrznuta misija dana — `MisijaDef`. */
export const misijaDefValidator = v.object({
  kljuc: v.string(),
  cilj: broj,
  xp: broj,
  oblast: v.string(),
  veza: v.string(),
  // P12 (C16): projekat iz čijeg posla je misija (ID kao tekst).
  projekat: v.optional(v.string()),
});

/** Brojači jednog dana — `Brojevi`. */
export const brojeviValidator = v.object({
  dogadjaji: broj,
  dodiri: broj,
  pozivi: broj,
  ishodi: broj,
  sledeci: broj,
  zaostali: broj,
  sastanci: broj,
  ponude: broj,
  dobijeni: broj,
  uvozi: broj,
  redovi: broj,
  objave: broj,
  moderacije: broj,
  odgovori: broj,
  oglasi: broj,
  pravila: broj,
  dopune: broj,
});

/** Stanje izmereno pri zamrzavanju dana — `NaOtvaranju`. */
export const naOtvaranjuValidator = v.object({
  zaostali: broj,
  nereseniRedovi: broj,
  imaPrimenjenUvoz: v.boolean(),
  odseceno: v.boolean(),
  at: broj,
});

/** Zbir zaključenih dana — `Osnova`. */
export const osnovaValidator = v.object({
  do: danIliNull,
  xp: broj,
  niz: broj,
  nizDo: danIliNull,
  najduziNiz: broj,
  brojaci: v.object({
    dodiri: broj,
    pozivi: broj,
    sastanci: broj,
    ponude: broj,
    dobijeni: broj,
    objave: broj,
    moderacije: broj,
    dopune: broj,
    uvozi: broj,
    redovi: broj,
    pravila: broj,
    danaSaXp: broj,
  }),
  nedelja: v.object({
    pon: danIliNull,
    pozivi: broj,
    sastanci: broj,
    objave: broj,
  }),
  serije: v.object({ uvekIshod: broj, bezZaostataka: broj }),
  rekordi: v.object({
    xpDan: broj,
    xpDanKad: danIliNull,
    poziviDan: broj,
    poziviDanKad: danIliNull,
    sastanciNedelja: broj,
  }),
  // Najviše onoliko ključeva koliko ima dostignuća (23) — nije neograničen niz.
  otkljucano: v.record(v.string(), broj),
});

/** Podešavanja Napretka kako ih vide upiti — `Podesavanja`. */
export const podesavanjaValidator = v.object({
  ukljucen: v.boolean(),
  vikendNePrekida: v.boolean(),
  ciljPozivi: broj,
  ciljSastanci: broj,
  ciljObjave: broj,
});
