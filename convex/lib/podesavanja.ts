import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  BUDZET_PODRAZUMEVANO,
  pozitivnaGranica,
  type KljucTajne,
} from "./podesavanjaPravila";

/**
 * ============================================================================
 * PODEŠAVANJA PROJEKTA IZ BAZE, SA ENV-OM SAMO ZA OSNIVAČKI PROJEKAT
 * (PROJEKTI-PLAN §8, P4; plan C10 §4.2, E4–E7)
 * ============================================================================
 *
 * Jedino mesto koje čita env vrednosti projekta (piksel, CAPI token, praćeni
 * domeni, kratki linkovi, osvežavanje novosti, budžetske granice, ime
 * pošiljaoca). Pravilo za svako polje:
 *
 *   vrednost projekta → (samo osnivački projekat) env → „nije podešeno“
 *
 * Osnivački projekat je najstariji red u `workspaces` (danas Enigma IT). Drugi
 * projekat bez svoje vrednosti dobija „nije podešeno“, nikad tuđu vrednost.
 * Funkcije ne bacaju: pozivalac odlučuje šta „nije podešeno“ znači (link bez
 * praćenja, CAPI ostaje na čekanju, pravljenje kampanje isključeno…).
 *
 * Tekst tajne ovde ne postoji: upiti znaju samo da li je tajna postavljena,
 * a vrednost dešifruje akcija (`podesavanjaAkcija.ts`).
 * ============================================================================
 */

type Db = QueryCtx["db"];

export type Izvor = "projekat" | "env" | "nije_podeseno";
export type Procitano<T> = { vrednost: T | null; izvor: Izvor };

const izvorValidator = v.union(
  v.literal("projekat"),
  v.literal("env"),
  v.literal("nije_podeseno"),
);
const procitanoTekst = v.object({ vrednost: v.union(v.string(), v.null()), izvor: izvorValidator });
const procitanoBroj = v.object({ vrednost: v.union(v.number(), v.null()), izvor: izvorValidator });

export const podesavanjaProjektaValidator = v.object({
  jeOsnivacki: v.boolean(),
  sajtovi: v.object({
    vrednost: v.union(v.array(v.string()), v.null()),
    izvor: izvorValidator,
  }),
  pikselId: procitanoTekst,
  kratkiLinkoviBaza: procitanoTekst,
  novostiRevalidateUrl: procitanoTekst,
  pulsUrl: procitanoTekst,
  posiljalacIme: procitanoTekst,
  /** E7: kod testnog događaja važi samo za osnivački piksel. */
  capiTestKod: v.union(v.string(), v.null()),
  budzet: v.object({
    minimum: procitanoBroj,
    maksimum: procitanoBroj,
    valuta: procitanoTekst,
    metaMaksDnevno: procitanoBroj,
    googleMaksDnevno: procitanoBroj,
  }),
});
export type PodesavanjaProjekta = Infer<typeof podesavanjaProjektaValidator>;

/** Najstariji projekat (P4, E4). Jedan dokument, ne prolaz kroz sve. */
export async function osnivackiProjekatId(db: Db): Promise<Id<"workspaces"> | null> {
  const prvi = await db.query("workspaces").order("asc").first();
  return prvi?._id ?? null;
}

function tekstIzEnva(raw: string | undefined): string | null {
  const t = raw?.trim();
  return t ? t : null;
}

/** „Ime <adresa@domen>“ ili samo „adresa@domen“. */
export function razloziPosiljaoca(
  emailFrom: string | undefined,
): { ime: string | null; adresa: string | null } {
  const t = emailFrom?.trim() ?? "";
  if (t.length === 0) return { ime: null, adresa: null };
  const m = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(t);
  if (m) {
    const ime = m[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return { ime: ime.length > 0 ? ime : null, adresa: m[2] };
  }
  return /^[^<>\s]+@[^<>\s]+$/.test(t) ? { ime: null, adresa: t } : { ime: null, adresa: null };
}

/** Host bez `www.`, mala slova (isti oblik kao `workspaces.sajtovi`). */
function cistDomen(d: string): string {
  return d.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Env vrednosti osnivačkog projekta. Jedino mesto u kodu koje ih čita (test
 * `lib/tajne-cuvar.test.ts` to čuva).
 */
function izEnva() {
  const domeni = tekstIzEnva(process.env.TRACKED_DOMAINS);
  const kratki =
    tekstIzEnva(process.env.OR_SHORT_LINK_BASE_URL) ??
    tekstIzEnva(process.env.NEXT_PUBLIC_APP_URL) ??
    tekstIzEnva(process.env.APP_URL) ??
    tekstIzEnva(process.env.SITE_URL);
  return {
    sajtovi: domeni === null ? null : domeni.split(",").map(cistDomen).filter(Boolean),
    pikselId: tekstIzEnva(process.env.META_PIXEL_ID),
    capiTestKod: tekstIzEnva(process.env.META_CAPI_TEST_EVENT_CODE),
    kratkiLinkoviBaza: kratki === null ? null : kratki.replace(/\/+$/, ""),
    novostiRevalidateUrl: tekstIzEnva(process.env.NOVOSTI_REVALIDATE_URL),
    posiljalacIme: razloziPosiljaoca(process.env.EMAIL_FROM).ime,
    budzet: {
      minimum: pozitivnaGranica(process.env.BUDGET_MIN ?? process.env.BUDGET_MIN_EUR),
      maksimum: pozitivnaGranica(process.env.BUDGET_MAX ?? process.env.BUDGET_MAX_EUR),
      valuta: tekstIzEnva(process.env.BUDGET_LIMIT_CURRENCY)?.toUpperCase() ?? null,
      metaMaksDnevno: pozitivnaGranica(process.env.META_ADS_MAX_DAILY_BUDGET),
      googleMaksDnevno: pozitivnaGranica(process.env.GOOGLE_ADS_MAX_DAILY_BUDGET),
    },
  };
}

/** Tajne koje osnivački projekat nasleđuje iz env-a (`puls_token` nema env). */
const ENV_TAJNE: Record<KljucTajne, string | null> = {
  meta_capi_token: "META_CAPI_TOKEN",
  novosti_revalidate_secret: "NOVOSTI_REVALIDATE_SECRET",
  puls_token: null,
};

/**
 * Tekst tajne iz env-a. Zove ga SAMO akcija (`podesavanjaAkcija.procitajTajnu`),
 * i to tek kad je interni upit potvrdio da je projekat osnivački.
 */
export function tajnaIzEnva(kljuc: KljucTajne): string | null {
  const ime = ENV_TAJNE[kljuc];
  if (ime === null) return null;
  switch (ime) {
    case "META_CAPI_TOKEN":
      return tekstIzEnva(process.env.META_CAPI_TOKEN);
    case "NOVOSTI_REVALIDATE_SECRET":
      return tekstIzEnva(process.env.NOVOSTI_REVALIDATE_SECRET);
    default:
      return null;
  }
}

function procitaj<T>(
  izProjekta: T | null | undefined,
  jeOsnivacki: boolean,
  izEnvaVrednost: T | null,
): Procitano<T> {
  if (izProjekta !== undefined && izProjekta !== null) {
    return { vrednost: izProjekta, izvor: "projekat" };
  }
  if (jeOsnivacki && izEnvaVrednost !== null) return { vrednost: izEnvaVrednost, izvor: "env" };
  return { vrednost: null, izvor: "nije_podeseno" };
}

async function jeOsnivackiProjekat(db: Db, workspaceId: Id<"workspaces">): Promise<boolean> {
  return (await osnivackiProjekatId(db)) === workspaceId;
}

/** Pravilo P4 za svako polje. Ne baca; nepostojeći projekat = sve „nije podešeno“. */
export async function podesavanjaProjekta(
  ctx: { db: Db },
  workspaceId: Id<"workspaces">,
): Promise<PodesavanjaProjekta> {
  const ws: Doc<"workspaces"> | null = await ctx.db.get(workspaceId);
  const jeOsnivacki = ws !== null && (await jeOsnivackiProjekat(ctx.db, workspaceId));
  const env = jeOsnivacki ? izEnva() : null;
  const p = ws?.podesavanja ?? {};
  const b = p.budzet ?? {};
  const sajtovi = ws?.sajtovi && ws.sajtovi.length > 0 ? ws.sajtovi : null;
  return {
    jeOsnivacki,
    sajtovi: procitaj(sajtovi, jeOsnivacki, env?.sajtovi ?? null),
    pikselId: procitaj(p.pikselId, jeOsnivacki, env?.pikselId ?? null),
    kratkiLinkoviBaza: procitaj(p.kratkiLinkoviBaza, jeOsnivacki, env?.kratkiLinkoviBaza ?? null),
    novostiRevalidateUrl: procitaj(
      p.novostiRevalidateUrl,
      jeOsnivacki,
      env?.novostiRevalidateUrl ?? null,
    ),
    pulsUrl: procitaj(p.pulsUrl, false, null),
    posiljalacIme: procitaj(p.posiljalacIme, jeOsnivacki, env?.posiljalacIme ?? null),
    capiTestKod: env?.capiTestKod ?? null,
    budzet: {
      minimum: procitaj(b.minimum, jeOsnivacki, env?.budzet.minimum ?? null),
      maksimum: procitaj(b.maksimum, jeOsnivacki, env?.budzet.maksimum ?? null),
      valuta: procitaj(b.valuta, jeOsnivacki, env?.budzet.valuta ?? null),
      metaMaksDnevno: procitaj(b.metaMaksDnevno, jeOsnivacki, env?.budzet.metaMaksDnevno ?? null),
      googleMaksDnevno: procitaj(
        b.googleMaksDnevno,
        jeOsnivacki,
        env?.budzet.googleMaksDnevno ?? null,
      ),
    },
  };
}

export const granicaBudzetaValidator = v.object({
  minimum: v.number(),
  maksimum: v.number(),
  valuta: v.string(),
  /** `null` = gornja granica nove kampanje nije podešena → pravljenje isključeno. */
  metaMaksDnevno: v.union(v.number(), v.null()),
  googleMaksDnevno: v.union(v.number(), v.null()),
});
export type GraniceBudzeta = Infer<typeof granicaBudzetaValidator>;

/**
 * Granice koje zaista važe (E5): bez vrednosti 5 / 5.000 / EUR; maksimum
 * manji od minimuma vraća se na 5.000 (isto pravilo kao ranije za env).
 */
export function graniceBudzeta(b: PodesavanjaProjekta["budzet"]): GraniceBudzeta {
  const minimum = b.minimum.vrednost ?? BUDZET_PODRAZUMEVANO.minimum;
  const maks = b.maksimum.vrednost ?? BUDZET_PODRAZUMEVANO.maksimum;
  return {
    minimum,
    maksimum: maks >= minimum ? maks : BUDZET_PODRAZUMEVANO.maksimum,
    valuta: b.valuta.vrednost ?? BUDZET_PODRAZUMEVANO.valuta,
    metaMaksDnevno: b.metaMaksDnevno.vrednost,
    googleMaksDnevno: b.googleMaksDnevno.vrednost,
  };
}

export type StanjeTajne = {
  postavljeno: boolean;
  izvor: "projekat" | "env" | "nema";
  updatedAt: number | null;
};

export const stanjeTajneValidator = v.object({
  postavljeno: v.boolean(),
  izvor: v.union(v.literal("projekat"), v.literal("env"), v.literal("nema")),
  updatedAt: v.union(v.number(), v.null()),
});

/** Red tajne projekta (šifrat). Ne izlazi iz backend-a. */
export async function redTajne(
  db: Db,
  workspaceId: Id<"workspaces">,
  kljuc: KljucTajne,
): Promise<Doc<"projekatTajne"> | null> {
  return await db
    .query("projekatTajne")
    .withIndex("by_workspace_kljuc", (q) => q.eq("workspaceId", workspaceId).eq("kljuc", kljuc))
    .first();
}

/** Da li tajna postoji (nikad tekst ni šifrat). */
export async function stanjeTajne(
  ctx: { db: Db },
  workspaceId: Id<"workspaces">,
  kljuc: KljucTajne,
): Promise<StanjeTajne> {
  const red = await redTajne(ctx.db, workspaceId, kljuc);
  if (red !== null) return { postavljeno: true, izvor: "projekat", updatedAt: red.updatedAt };
  if (
    ENV_TAJNE[kljuc] !== null &&
    (await jeOsnivackiProjekat(ctx.db, workspaceId)) &&
    tajnaIzEnva(kljuc) !== null
  ) {
    return { postavljeno: true, izvor: "env", updatedAt: null };
  }
  return { postavljeno: false, izvor: "nema", updatedAt: null };
}

/** Baza kratkih `/r/` linkova projekta bez završne kose crte, ili `null`. */
export async function bazaKratkihLinkova(
  ctx: { db: Db },
  workspaceId: Id<"workspaces">,
): Promise<string | null> {
  const baza = (await podesavanjaProjekta(ctx, workspaceId)).kratkiLinkoviBaza.vrednost;
  return baza === null ? null : baza.replace(/\/+$/, "");
}

/** `HUB_HOSTS` (E9): hostovi huba odvojeni zarezom, prvi je kanonski. */
export function hubHostovi(): string[] {
  return (process.env.HUB_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, ""))
    .filter((h) => h.length > 0);
}

/** Primarni panel domen projekta: najstariji red u `projekatDomeni`. */
export async function primarniDomen(
  db: Db,
  workspaceId: Id<"workspaces">,
): Promise<string | null> {
  const red = await db
    .query("projekatDomeni")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .first();
  return red?.host ?? null;
}

/**
 * Adresa panela za linkove koje pravi backend (plan C10 §4.4), bez završne
 * kose crte; pozivalac dodaje putanju ekrana:
 *  1. primarni domen projekta → `https://<host>` (panel, bez sluga);
 *  2. prvi host iz `HUB_HOSTS` → `https://<host>/<slug>`;
 *  3. samo osnivački projekat: env lanac kao kod kratkih linkova;
 *  4. inače `null` (link se izostavlja).
 */
export async function adresaPanela(
  db: Db,
  workspaceId: Id<"workspaces">,
): Promise<string | null> {
  const ws = await db.get(workspaceId);
  if (ws === null) return null;
  const domen = await primarniDomen(db, workspaceId);
  if (domen !== null) return `https://${domen}`;
  const hub = hubHostovi()[0];
  if (hub !== undefined) return `https://${hub}/${ws.slug}`;
  if (await jeOsnivackiProjekat(db, workspaceId)) return izEnva().kratkiLinkoviBaza;
  return null;
}
