import { z } from "zod";

/**
 * ============================================================================
 * FORMA NA SAJTU PROJEKTA → `POST /projekti/lead` (C17, PROJEKTI-PLAN §11,
 * plan C15 §6)
 * ============================================================================
 *
 * JEDINA definicija tela koje šalje forma (npr. scanme.rs). Uputstvo
 * `docs/projekti/SCANME-INTEGRACIJA.md` navodi ista polja, a test
 * `lib/scanme-uputstvo.test.ts` proverava da svako polje odavde postoji u
 * dokumentu.
 *
 * Polja iz PLAN-a (`ime, email, telefon, firma, poruka, stranica, utm,
 * eventId`) plus dva opciona (F21): `klijent` (podaci posetioca kad ScanMe
 * zove sa servera) i `saglasnost` (F17: CAPI samo uz `marketing: true`).
 * Nepoznata polja se odbijaju (`strict`), da greška u formi ne prođe tiho.
 *
 * NIŠTA IZ TELA SE NE LOGUJE. Greška validacije vraća samo putanje polja.
 * ============================================================================
 */

/** Najveće telo zahteva (bajtova). */
export const LEAD_SAJT_MAX_BAJTOVA = 16_384;

export const PORUKA_EMAIL_ILI_TELEFON = "Treba email ili telefon.";

const tekst = (min: number, max: number) => z.string().trim().min(min).max(max);

const httpsAdresa = z
  .string()
  .trim()
  .max(500)
  .refine((s) => {
    try {
      return new URL(s).protocol === "https:";
    } catch {
      return false;
    }
  }, "Adresa mora početi sa https://.");

const utmPolje = z.string().trim().max(100).optional();

export const leadSajtSchema = z
  .object({
    ime: tekst(1, 120).optional(),
    email: z
      .preprocess(
        (x) => (typeof x === "string" ? x.trim().toLowerCase() : x),
        z.email().max(254),
      )
      .optional(),
    telefon: tekst(1, 40).optional(),
    firma: tekst(1, 160).optional(),
    poruka: tekst(0, 2000).optional(),
    stranica: httpsAdresa.optional(),
    utm: z
      .object({
        source: utmPolje,
        medium: utmPolje,
        campaign: utmPolje,
        term: utmPolje,
        content: utmPolje,
      })
      .strict()
      .optional(),
    eventId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .optional(),
    klijent: z
      .object({
        ip: z.union([z.ipv4(), z.ipv6()]).optional(),
        userAgent: z.string().trim().max(400).optional(),
        fbp: z.string().trim().max(120).optional(),
        fbc: z.string().trim().max(200).optional(),
      })
      .strict()
      .optional(),
    saglasnost: z.object({ marketing: z.boolean() }).strict().optional(),
  })
  .strict()
  .refine((t) => t.email !== undefined || t.telefon !== undefined, {
    message: PORUKA_EMAIL_ILI_TELEFON,
    path: ["email"],
  });

export type LeadSajtTelo = z.infer<typeof leadSajtSchema>;

/** Imena polja tela, za uputstvo i test uputstva. */
export const LEAD_SAJT_POLJA = [
  "ime",
  "email",
  "telefon",
  "firma",
  "poruka",
  "stranica",
  "utm",
  "eventId",
  "klijent",
  "saglasnost",
] as const;

/** Host bez `www.`, mala slova, bez porta (isti oblik kao `workspaces.sajtovi`). */
function cistHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Ispravan `https://` origin (bez putanje), ili `null`. Za preflight
 * (`OPTIONS`), koji nema token pa ne zna projekat (F16).
 */
export function ispravanHttpsOrigin(origin: string | null): string | null {
  if (origin === null) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.origin !== origin) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Origin je dozvoljen kad je ispravan `https://` origin, a njegov host (bez
 * `www.` i porta) je na spisku sajtova projekta. Vraća origin za
 * `Access-Control-Allow-Origin`, ili `null`.
 */
export function dozvoljenOrigin(
  origin: string | null,
  sajtovi: readonly string[],
): string | null {
  const ispravan = ispravanHttpsOrigin(origin);
  if (ispravan === null) return null;
  const host = cistHost(new URL(ispravan).hostname);
  return sajtovi.includes(host) ? ispravan : null;
}

/** Stranica se čuva samo kad je na sajtu projekta; inače `null` (lead se ne odbija). */
export function stranicaNaSajtu(
  stranica: string | undefined,
  sajtovi: readonly string[],
): string | null {
  if (stranica === undefined) return null;
  try {
    const url = new URL(stranica);
    if (url.protocol !== "https:") return null;
    return sajtovi.includes(cistHost(url.hostname)) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Besplatni i ISP domeni mejla: domen takvog mejla nije domen firme, pa se ne
 * proverava na listi zabrane po domenu (inače bi „gmail.com“ na listi
 * zabranio svakog).
 */
const BESPLATNI_DOMENI = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "eunet.rs",
  "sbb.rs",
  "open.telekom.rs",
  "ptt.rs",
  "mts.rs",
  "beotel.rs",
  "beotel.net",
  "verat.net",
  "orion.rs",
  "neobee.net",
]);

/** Domen mejla za proveru zabrane, ili `undefined` za besplatne domene. */
export function domenFirmeIzMejla(email: string | undefined): string | undefined {
  if (email === undefined) return undefined;
  const at = email.lastIndexOf("@");
  if (at < 0) return undefined;
  const domen = email.slice(at + 1).trim().toLowerCase();
  if (domen.length === 0 || BESPLATNI_DOMENI.has(domen)) return undefined;
  return domen;
}
