import { v } from "convex/values";
import { ulogaValidator } from "./uloge";

/**
 * Validatori podataka projekta (PROJEKTI-PLAN §4, plan C02 §1.1). Dele ih
 * šema i funkcije, pa oblik stoji na jednom mestu. Sva polja su opciona:
 * postojeći redovi `workspaces` ostaju validni bez migracije.
 */

/** Bez vrednosti = „interni“ (P3 čita tako). */
export const vrstaProjektaValidator = v.union(
  v.literal("interni"),
  v.literal("klijent"),
);
export type VrstaProjekta = "interni" | "klijent";

export const brendValidator = v.object({
  /** Najviše 24 znaka (proverava mutacija). */
  kratkoIme: v.optional(v.string()),
  /** „#rrggbb“, mala slova (proverava mutacija). */
  boja: v.optional(v.string()),
  logoStorageId: v.optional(v.id("_storage")),
  faviconStorageId: v.optional(v.id("_storage")),
});

/**
 * Budžetske granice koje danas stoje u env-u. Imena su predlog plana C02;
 * C10 sme da ih preimenuje pre nego što C11 upiše prvi podatak.
 */
export const budzetValidator = v.object({
  /** `META_ADS_MAX_DAILY_BUDGET` */
  metaMaksDnevno: v.optional(v.number()),
  /** `GOOGLE_ADS_MAX_DAILY_BUDGET` */
  googleMaksDnevno: v.optional(v.number()),
  /** `BUDGET_MIN(_EUR)` */
  minimum: v.optional(v.number()),
  /** `BUDGET_MAX(_EUR)` */
  maksimum: v.optional(v.number()),
  /** `BUDGET_LIMIT_CURRENCY` */
  valuta: v.optional(v.string()),
});

export const podesavanjaValidator = v.object({
  pikselId: v.optional(v.string()),
  budzet: v.optional(budzetValidator),
  novostiRevalidateUrl: v.optional(v.string()),
  kratkiLinkoviBaza: v.optional(v.string()),
  posiljalacIme: v.optional(v.string()),
  pulsUrl: v.optional(v.string()),
  vremenskaZona: v.optional(v.string()),
  valuta: v.optional(v.string()),
});

export const mozakValidator = v.object({
  ponuda: v.optional(v.string()),
  icpOpis: v.optional(v.string()),
  ton: v.optional(v.string()),
  zabrane: v.optional(v.string()),
  skripte: v.optional(v.string()),
});

export const kljucTajneValidator = v.union(
  v.literal("meta_capi_token"),
  v.literal("novosti_revalidate_secret"),
  v.literal("puls_token"),
);

// ── Odgovori API-ja projekata (convex/projekti.ts) ──────────────────────────

const tekstIliNull = v.union(v.string(), v.null());

/** Jedan red spiska `mojiProjekti`. */
export const stavkaProjektaValidator = v.object({
  workspaceId: v.id("workspaces"),
  slug: v.string(),
  ime: v.string(),
  kratkoIme: tekstIliNull,
  boja: tekstIliNull,
  logoUrl: tekstIliNull,
  uloga: ulogaValidator,
  vrsta: vrstaProjektaValidator,
  arhiviran: v.boolean(),
  redosled: v.union(v.number(), v.null()),
  moduli: v.union(v.array(v.string()), v.null()),
});

/** Odgovor `mojProjekat` kad je pozivalac član. */
export const projekatValidator = v.object({
  workspaceId: v.id("workspaces"),
  slug: v.string(),
  ime: v.string(),
  kratkoIme: tekstIliNull,
  boja: tekstIliNull,
  logoUrl: tekstIliNull,
  faviconUrl: tekstIliNull,
  vrsta: vrstaProjektaValidator,
  moduli: v.union(v.array(v.string()), v.null()),
  /** Praćeni domeni sajta (nisu tajna; „Objavljuješ na sajtu …“). */
  sajtovi: v.array(v.string()),
  uloga: ulogaValidator,
  korisnik: v.object({
    id: v.id("users"),
    email: tekstIliNull,
    ime: tekstIliNull,
  }),
  platformaVlasnik: v.boolean(),
});

/** Odgovor `ja`: prijavljen korisnik bez projekta (hub, meni korisnika). */
export const jaValidator = v.object({
  id: v.id("users"),
  email: tekstIliNull,
  ime: tekstIliNull,
  platformaVlasnik: v.boolean(),
});
