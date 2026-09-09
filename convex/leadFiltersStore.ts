import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { hydrateLeadRowExtras, LEAD_STAGE_VALIDATOR } from "./leadCrmStore";
import { scoreLead, type LeadSignalInput } from "./lib/leadScoring";
import { ucitajPoslednjeOcene, type SazetakOcene } from "./leadSiteAuditsStore";
import { PRAG_SPOR_SAJT } from "./lib/siteScore";

/**
 * ============================================================================
 * FILTERI NAD TABELOM LEADOVA (GL2) — plan §7.1, §O8
 * ============================================================================
 *
 * KLJUČNA PRAVILA:
 *
 * 1. SVAKI filter se primenjuje NA SERVERU. Filtriranje u browseru nad 200
 *    učitanih redova tvrdi da je „nema pogodaka" činjenica o bazi, a to je
 *    činjenica o tome koliko je redova stiglo.
 *
 * 2. Argumenti su union literali gde god skup vrednosti postoji u kodu
 *    (faza, temperatura, sajt, platforma, koordinate, dodir). Slobodan string
 *    ostaje samo tamo gde je vrednost PODATAK, a ne šifarnik: `nisa` je slug
 *    niše koju je napravio čovek ili skill, `grad` je grad iz baze, `q` je
 *    tekst pretrage.
 *
 * 3. Osnovni skup su DODELE (`leadAssignments`), ne firme. Tabela leadova je
 *    oduvek lista dodela; firma bez vlasnika u njoj ne postoji ni danas i
 *    filter je ne izmišlja. Firme bez vlasnika se vide na jezičku „Rupe u
 *    podacima" (`bez_vlasnika`).
 *
 * 4. Granica je 2000 dodela po radnom prostoru (plan §7.1). Preko toga se ne
 *    vraća pogrešan broj nego `prekoracen: true` — brojač koji je odsečen na
 *    granici je laž koja izgleda kao podatak.
 *
 * 5. Brojači fasete se računaju BEZ te fasete u preseku. Chip „Hot (12)" znači
 *    „ako ovde kliknem, dobiću 12", a ne „trenutno je izabrano 12".
 */

// Granica iz plana §7.1. Preko nje se brojači ne računaju.
export const FILTER_ASSIGNMENT_CAP = 2000;

/**
 * Identiteti se čitaju po radnom prostoru odjednom (jedan indeksni prolaz),
 * pa se grupišu po firmi. Alternativa — upit po firmi — je 2000 upita.
 * Granica postoji da čitanje ostane u okviru limita jednog Convex upita; kad
 * se dosegne, rezultat se označava kao odsečen umesto da tiho fali platforma.
 */
const IDENTITY_SCAN_CAP = 8000;

const DAN_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Validatori — eksplicitni union literali.
// ─────────────────────────────────────────────────────────────────────────────

const TEMPERATURA_VALIDATOR = v.union(
  v.literal("nova_firma"),
  v.literal("cold"),
  v.literal("warm"),
  v.literal("hot"),
);

/** Sedam vrednosti iz plana §7.1. Poslednje četiri su podskup od „ima". */
const SAJT_VALIDATOR = v.union(
  v.literal("ima"),
  v.literal("nema"),
  v.literal("nepoznato"),
  v.literal("ne_radi"),
  v.literal("parkiran"),
  v.literal("drustvene"),
  v.literal("bez_https"),
);

const PLATFORMA_VALIDATOR = v.union(
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("tiktok"),
  v.literal("threads"),
  v.literal("website"),
);

const KOORD_VALIDATOR = v.union(v.literal("da"), v.literal("ne"));

const DODIR_VALIDATOR = v.union(
  v.literal("7d"),
  v.literal("30d"),
  v.literal("nikad"),
);

export type SajtFilter =
  | "ima"
  | "nema"
  | "nepoznato"
  | "ne_radi"
  | "parkiran"
  | "drustvene"
  | "bez_https";

export type PlatformaFilter =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "threads"
  | "website";

export type DodirFilter = "7d" | "30d" | "nikad";

// ── GL10: filteri iz ocene sajta (sajt-ocena-plan.md §5.2) ──────────────────

/** Pojas kvaliteta + „neocenjen" (firma sa sajtom koji nikad nije ocenjivan). */
const KVALITET_VALIDATOR = v.union(
  v.literal("los"),
  v.literal("srednji"),
  v.literal("dobar"),
  v.literal("neocenjen"),
);
export type KvalitetFilter = "los" | "srednji" | "dobar" | "neocenjen";
export const KVALITET_FILTER_VALUES: readonly KvalitetFilter[] = [
  "los",
  "srednji",
  "dobar",
  "neocenjen",
];

const PONUDA_VALIDATOR = v.union(
  v.literal("nov_sajt"),
  v.literal("redizajn"),
  v.literal("webshop"),
  v.literal("zakazivanje"),
  v.literal("seo"),
  v.literal("brzina"),
  v.literal("nista"),
);
export type PonudaFilter =
  | "nov_sajt"
  | "redizajn"
  | "webshop"
  | "zakazivanje"
  | "seo"
  | "brzina"
  | "nista";
export const PONUDA_FILTER_VALUES: readonly PonudaFilter[] = [
  "nov_sajt",
  "redizajn",
  "webshop",
  "zakazivanje",
  "seo",
  "brzina",
  "nista",
];

/**
 * CMS je PODATAK (ime iz otisaka), ne šifarnik — zato `v.string()`. Dve
 * rezervisane vrednosti: `drugo` (CMS van prvih 8 po broju) i `bez_cms`
 * (ocenjen sajt bez prepoznatog CMS-a). Ime CMS-a nikad nije ni jedno ni
 * drugo, pa se ne mogu sudariti.
 */
export const CMS_DRUGO = "drugo";
export const CMS_BEZ = "bez_cms";
export const CMS_TOP = 8;

export const SAJT_FILTER_VALUES: readonly SajtFilter[] = [
  "ima",
  "nema",
  "nepoznato",
  "ne_radi",
  "parkiran",
  "drustvene",
  "bez_https",
];

export const PLATFORMA_FILTER_VALUES: readonly PlatformaFilter[] = [
  "instagram",
  "facebook",
  "tiktok",
  "threads",
  "website",
];

/** Pragovi verovatnoće telefona za koje traka prikazuje brojače (plan §6). */
export const TEL_PRAGOVI = [70, 40, 0] as const;

const FILTER_ARGS = {
  faza: v.optional(v.array(LEAD_STAGE_VALIDATOR)),
  zaostali: v.optional(v.boolean()),
  temp: v.optional(v.array(TEMPERATURA_VALIDATOR)),
  // Slug niše — podatak, ne šifarnik (vidi pravilo 2 gore).
  nisa: v.optional(v.array(v.string())),
  grad: v.optional(v.array(v.string())),
  sajt: v.optional(v.array(SAJT_VALIDATOR)),
  platforma: v.optional(v.array(PLATFORMA_VALIDATOR)),
  koord: v.optional(KOORD_VALIDATOR),
  // Minimalna verovatnoća telefona (0–100). 0 znači „ima bilo kakvu procenu".
  tel: v.optional(v.number()),
  dodir: v.optional(v.array(DODIR_VALIDATOR)),
  q: v.optional(v.string()),
  // GL10 (plan §5.2): iz poslednje ocene sajta.
  kvalitet: v.optional(v.array(KVALITET_VALIDATOR)),
  cms: v.optional(v.array(v.string())),
  sajtSpor: v.optional(v.boolean()),
  ponuda: v.optional(v.array(PONUDA_VALIDATOR)),
};

type FilterArgs = {
  faza?: string[];
  zaostali?: boolean;
  temp?: string[];
  nisa?: string[];
  grad?: string[];
  sajt?: SajtFilter[];
  platforma?: PlatformaFilter[];
  koord?: "da" | "ne";
  tel?: number;
  dodir?: DodirFilter[];
  q?: string;
  kvalitet?: KvalitetFilter[];
  cms?: string[];
  sajtSpor?: boolean;
  ponuda?: PonudaFilter[];
};

type Grupa =
  | "faza"
  | "zaostali"
  | "temp"
  | "nisa"
  | "grad"
  | "sajt"
  | "platforma"
  | "koord"
  | "tel"
  | "dodir"
  | "q"
  | "kvalitet"
  | "cms"
  | "sajtSpor"
  | "ponuda";

// ─────────────────────────────────────────────────────────────────────────────
// Pomoćne funkcije
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tekst za poređenje u pretrazi: mala slova bez dijakritike. `đ` i `Đ` se ne
 * rastavljaju kroz NFD, pa se menjaju izričito — bez toga „Đorđević" ne bi
 * našao „dordevic".
 */
function zaPretragu(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function sajtPogodak(
  company: Doc<"leadCompanies"> | null,
  vrednost: SajtFilter,
): boolean {
  if (!company) return false;
  switch (vrednost) {
    case "ima":
      return company.imaSajt === "da";
    case "nema":
      return company.imaSajt === "ne";
    case "nepoznato":
      return company.imaSajt === "nepoznato";
    case "ne_radi":
      return company.sajtStatus === "ne_radi";
    case "parkiran":
      return company.sajtStatus === "parkiran";
    case "drustvene":
      return company.sajtStatus === "preusmerava_na_drustvene";
    case "bez_https":
      return company.sajtHttps === false;
  }
}

/**
 * Firma koju NIKAD nismo proveravali. Ne ulazi ni u jedan chip: „nema sajt" i
 * „nismo gledali" nisu isto (§0 pravilo 4). Njen broj se ispisuje kao tekst.
 */
function sajtNeproveren(company: Doc<"leadCompanies"> | null): boolean {
  if (!company) return false;
  return (
    company.imaSajt === undefined &&
    company.sajtStatus === undefined &&
    company.sajtHttps === undefined
  );
}

/**
 * `7d` / `30d` znače „bez dodira toliko dana", ne „dodirnut u poslednjih
 * toliko dana". Tabela već crveni kolonu „Poslednji dodir" po istom pravilu
 * (30+ dana), pa filter meri istu stvar. Kad dodira nikad nije bilo, broji se
 * od dodele — lead koji 40 dana stoji netaknut jeste 40 dana bez dodira.
 */
function dodirPogodak(
  assignment: Doc<"leadAssignments">,
  vrednost: DodirFilter,
  now: number,
): boolean {
  if (vrednost === "nikad") return assignment.lastTouchAt === undefined;
  const od =
    assignment.lastTouchAt ?? assignment.createdAt ?? assignment._creationTime;
  const dana = Math.floor((now - od) / DAN_MS);
  return vrednost === "7d" ? dana >= 7 : dana >= 30;
}

type RedZaFilter = {
  assignment: Doc<"leadAssignments">;
  company: Doc<"leadCompanies"> | null;
  /** Slug niše firme, ili `null` kad firma nije ni u jednoj niši. */
  nisaSlug: string | null;
  platforme: Set<string>;
  /** Najveća procena verovatnoće telefona, ili `null` kad je nema. */
  najvecaVerovatnoca: number | null;
  imaProcenuTelefona: boolean;
  imeZaPretragu: string;
  /**
   * Poslednja ocena sajta (GL10) — `null` kad sajt nikad nije ocenjivan ILI
   * kad ocene nisu učitane (`trebajuOcene: false`); filteri po oceni ih uvek
   * učitavaju, pa razlika ne curi u rezultat.
   */
  ocena: SazetakOcene | null;
};

/** Ključ CMS-a za filter i brojač: ime, ili `bez_cms` za ocenjen sajt bez CMS-a. */
function cmsKljuc(ocena: SazetakOcene | null): string | null {
  if (!ocena) return null;
  return ocena.cms ?? CMS_BEZ;
}

async function ucitajOsnovu(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  trebajuIdentiteti: boolean,
  trebajuOcene = false,
): Promise<{
  redovi: RedZaFilter[];
  prekoracen: boolean;
  identitetiOdseceni: boolean;
  nise: Doc<"niches">[];
  pregledano: number;
}> {
  const scanned = await ctx.db
    .query("leadAssignments")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(FILTER_ASSIGNMENT_CAP + 1);

  const prekoracen = scanned.length > FILTER_ASSIGNMENT_CAP;
  const assignments = prekoracen
    ? scanned.slice(0, FILTER_ASSIGNMENT_CAP)
    : scanned;

  const nise = await ctx.db
    .query("niches")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  const slugPoNisi = new Map<string, string>();
  for (const nisa of nise) slugPoNisi.set(String(nisa._id), nisa.slug);

  // Identiteti se čitaju samo kad ih neko pita — lista bez filtera po
  // platformi i telefonu nema razloga da čita 8000 redova.
  let identitetiOdseceni = false;
  const platformePoFirmi = new Map<string, Set<string>>();
  const verovatnocaPoFirmi = new Map<string, number>();
  const procenaPoFirmi = new Set<string>();

  if (trebajuIdentiteti) {
    const identityDocs = await ctx.db
      .query("leadIdentities")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(IDENTITY_SCAN_CAP + 1);
    identitetiOdseceni = identityDocs.length > IDENTITY_SCAN_CAP;

    for (const identity of identityDocs.slice(0, IDENTITY_SCAN_CAP)) {
      const key = String(identity.companyId);
      let set = platformePoFirmi.get(key);
      if (!set) {
        set = new Set<string>();
        platformePoFirmi.set(key, set);
      }
      set.add(identity.kind);

      if (identity.kind === "phone" && identity.verovatnoca !== undefined) {
        procenaPoFirmi.add(key);
        const trenutna = verovatnocaPoFirmi.get(key);
        if (trenutna === undefined || identity.verovatnoca > trenutna) {
          verovatnocaPoFirmi.set(key, identity.verovatnoca);
        }
      }
    }
  }

  const companies = await Promise.all(
    assignments.map((assignment) => ctx.db.get(assignment.companyId)),
  );

  // Ocene sajta (GL10) se čitaju preko pokazivača, samo kad ih neko traži —
  // jedan `get` po firmi koja JE ocenjivana, nula za ostale.
  const ocene = trebajuOcene
    ? await ucitajPoslednjeOcene(ctx, companies)
    : new Map<string, SazetakOcene>();

  const redovi = assignments.map((assignment, i) => {
    const company = companies[i];
    const key = String(assignment.companyId);
    return {
      assignment,
      company,
      nisaSlug: company?.nicheId
        ? (slugPoNisi.get(String(company.nicheId)) ?? null)
        : null,
      platforme: platformePoFirmi.get(key) ?? new Set<string>(),
      najvecaVerovatnoca: verovatnocaPoFirmi.get(key) ?? null,
      imaProcenuTelefona: procenaPoFirmi.has(key),
      imeZaPretragu: company ? zaPretragu(company.name) : "",
      ocena: ocene.get(key) ?? null,
    } satisfies RedZaFilter;
  });

  return {
    redovi,
    prekoracen,
    identitetiOdseceni,
    nise,
    pregledano: assignments.length,
  };
}

/**
 * Jedan test po grupi filtera. Test grupe koja NIJE zadata uvek prolazi — tako
 * `prolaziSve(red, "temp")` znači „sve osim temperature", što je tačno ono što
 * treba brojaču fasete.
 */
function napraviTestove(
  args: FilterArgs,
  now: number,
  cmsTop: Set<string> = new Set(),
): Record<Grupa, (red: RedZaFilter) => boolean> {
  const qNorm = args.q ? zaPretragu(args.q) : "";
  const gradovi = args.grad?.map((g) => zaPretragu(g));

  return {
    faza: (red) =>
      !args.faza || args.faza.length === 0
        ? true
        : args.faza.includes(red.assignment.stage),
    zaostali: (red) =>
      !args.zaostali
        ? true
        : red.assignment.nextActionAt !== undefined &&
          red.assignment.nextActionAt < now,
    temp: (red) =>
      !args.temp || args.temp.length === 0
        ? true
        : args.temp.includes(red.company?.temperatura ?? "nova_firma"),
    nisa: (red) =>
      !args.nisa || args.nisa.length === 0
        ? true
        : red.nisaSlug !== null && args.nisa.includes(red.nisaSlug),
    grad: (red) =>
      !gradovi || gradovi.length === 0
        ? true
        : gradovi.includes(zaPretragu(red.company?.city ?? "")),
    sajt: (red) =>
      !args.sajt || args.sajt.length === 0
        ? true
        : args.sajt.some((vrednost) => sajtPogodak(red.company, vrednost)),
    platforma: (red) =>
      !args.platforma || args.platforma.length === 0
        ? true
        : args.platforma.some((p) => red.platforme.has(p)),
    koord: (red) => {
      if (!args.koord) return true;
      const ima =
        red.company?.lat !== undefined && red.company?.lng !== undefined;
      return args.koord === "da" ? ima : !ima;
    },
    tel: (red) => {
      if (args.tel === undefined) return true;
      // Prag 0 znači „ima bilo kakvu procenu"; bez ove grane bi firma bez
      // ijedne procene prošla, jer `null >= 0` u brojevima ne postoji.
      if (!red.imaProcenuTelefona) return false;
      return (red.najvecaVerovatnoca ?? -1) >= args.tel;
    },
    dodir: (red) =>
      !args.dodir || args.dodir.length === 0
        ? true
        : args.dodir.some((d) => dodirPogodak(red.assignment, d, now)),
    q: (red) => (qNorm === "" ? true : red.imeZaPretragu.includes(qNorm)),
    // ── GL10: iz poslednje ocene sajta ──
    // `neocenjen` = firma IMA sajt (imaSajt "da" ili sajtStatus "radi"), a
    // ocena ne postoji. Firma bez sajta nije „neocenjen sajt".
    kvalitet: (red) => {
      if (!args.kvalitet || args.kvalitet.length === 0) return true;
      const pojas = red.ocena?.pojas ?? null;
      return args.kvalitet.some((k) => {
        if (k === "neocenjen") {
          const imaSajt =
            red.company?.imaSajt === "da" || red.company?.sajtStatus === "radi";
          return imaSajt && red.ocena === null;
        }
        return pojas === k;
      });
    },
    cms: (red) => {
      if (!args.cms || args.cms.length === 0) return true;
      const kljuc = cmsKljuc(red.ocena);
      if (kljuc === null) return false;
      if (args.cms.includes(kljuc)) return true;
      // `drugo` = ocenjen sajt sa CMS-om koji NIJE među top 8 radnog prostora
      // (`cmsTop`, računato nad svim učitanim firmama, ne nad presekom — da
      // „drugo" znači isto bez obzira na ostale filtere).
      if (args.cms.includes(CMS_DRUGO) && kljuc !== CMS_BEZ) {
        return !cmsTop.has(kljuc);
      }
      return false;
    },
    sajtSpor: (red) =>
      !args.sajtSpor
        ? true
        : red.ocena?.perfMobile !== null &&
          red.ocena?.perfMobile !== undefined &&
          red.ocena.perfMobile < PRAG_SPOR_SAJT,
    ponuda: (red) =>
      !args.ponuda || args.ponuda.length === 0
        ? true
        : red.ocena?.preporucenaPonuda !== null &&
          red.ocena?.preporucenaPonuda !== undefined &&
          (args.ponuda as string[]).includes(red.ocena.preporucenaPonuda),
  };
}

/**
 * Top 8 CMS-a radnog prostora po broju ocenjenih sajtova — nad SVIM učitanim
 * firmama, ne nad presekom. Isti spisak vidi traka filtera (čipovi) i koristi
 * test `drugo`, pa čip „drugo (N)" i rezultat klika znače istu stvar.
 */
function cmsTopSpisak(redovi: RedZaFilter[]): string[] {
  const brojaci = new Map<string, number>();
  for (const red of redovi) {
    const kljuc = cmsKljuc(red.ocena);
    if (kljuc === null || kljuc === CMS_BEZ) continue;
    brojaci.set(kljuc, (brojaci.get(kljuc) ?? 0) + 1);
  }
  return [...brojaci.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sr-RS"))
    .slice(0, CMS_TOP)
    .map(([ime]) => ime);
}

const SVE_GRUPE: readonly Grupa[] = [
  "faza",
  "zaostali",
  "temp",
  "nisa",
  "grad",
  "sajt",
  "platforma",
  "koord",
  "tel",
  "dodir",
  "q",
  "kvalitet",
  "cms",
  "sajtSpor",
  "ponuda",
];

function prolaziSve(
  testovi: Record<Grupa, (red: RedZaFilter) => boolean>,
  red: RedZaFilter,
  izuzmi?: Grupa,
): boolean {
  for (const grupa of SVE_GRUPE) {
    if (grupa === izuzmi) continue;
    if (!testovi[grupa](red)) return false;
  }
  return true;
}

function trazeIdentitete(args: FilterArgs): boolean {
  return (
    (args.platforma !== undefined && args.platforma.length > 0) ||
    args.tel !== undefined
  );
}

/** Da li bilo koji filter zavisi od ocene sajta (GL10) — tek tada se čita. */
function trazeOcene(args: FilterArgs): boolean {
  return (
    (args.kvalitet !== undefined && args.kvalitet.length > 0) ||
    (args.cms !== undefined && args.cms.length > 0) ||
    args.sajtSpor === true ||
    (args.ponuda !== undefined && args.ponuda.length > 0)
  );
}

async function proveriPristup(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<void> {
  const membership = await requireMembership(ctx);
  if (membership.workspaceId !== workspaceId) {
    throw new ConvexError({
      code: "forbidden",
      message: "Nemate pristup ovom radnom prostoru.",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// listLeadsFiltered — jedna strana filtrirane liste.
// ─────────────────────────────────────────────────────────────────────────────
export const listLeadsFiltered = query({
  args: {
    workspaceId: v.id("workspaces"),
    ...FILTER_ARGS,
    strana: v.optional(v.number()),
    poStrani: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await proveriPristup(ctx, args.workspaceId);

    const poStrani = Math.min(Math.max(args.poStrani ?? 25, 1), 100);
    const now = Date.now();

    const { redovi, prekoracen, identitetiOdseceni, pregledano } =
      await ucitajOsnovu(ctx, args.workspaceId, trazeIdentitete(args), trazeOcene(args));

    const testovi = napraviTestove(args, now, new Set(cmsTopSpisak(redovi)));
    const pogodjeni = redovi.filter((red) => prolaziSve(testovi, red));

    const ukupno = pogodjeni.length;
    const ukupnoStrana = Math.max(1, Math.ceil(ukupno / poStrani));
    const strana = Math.min(Math.max(args.strana ?? 1, 1), ukupnoStrana);
    const isecak = pogodjeni.slice((strana - 1) * poStrani, strana * poStrani);

    // Kontakti, osobe, signali i poslednji dodir se dovlače SAMO za redove na
    // ovoj strani — isto pravilo kao `listByStage`.
    const items = await Promise.all(
      isecak.map(async (red) => {
        const extras = await hydrateLeadRowExtras(
          ctx,
          args.workspaceId,
          red.assignment.companyId,
        );
        return {
          assignment: red.assignment,
          company: red.company,
          ...extras,
          isOverdue:
            red.assignment.nextActionAt !== undefined &&
            red.assignment.nextActionAt < now,
        };
      }),
    );

    return {
      items,
      ukupno,
      strana,
      ukupnoStrana,
      poStrani,
      // `true` = ima dodela iza granice od 2000; lista i brojevi važe samo za
      // pregledani deo i to se ispisuje, ne prećutkuje.
      prekoracen,
      identitetiOdseceni,
      pregledano,
      now,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// countLeadsByFacet — brojevi za sve chipove odjednom.
// ─────────────────────────────────────────────────────────────────────────────
export const countLeadsByFacet = query({
  args: {
    workspaceId: v.id("workspaces"),
    ...FILTER_ARGS,
  },
  handler: async (ctx, args) => {
    await proveriPristup(ctx, args.workspaceId);

    const now = Date.now();
    const { redovi, prekoracen, identitetiOdseceni, nise, pregledano } =
      await ucitajOsnovu(ctx, args.workspaceId, true, true);

    if (prekoracen) {
      // Brojač odsečen na granici izgleda isto kao tačan brojač. Zato se ne
      // vraća nijedan broj — vraća se činjenica da ih ne umemo prebrojati.
      return {
        prekoracen: true as const,
        granica: FILTER_ASSIGNMENT_CAP,
        pregledano,
      };
    }

    const cmsTopLista = cmsTopSpisak(redovi);
    const testovi = napraviTestove(args, now, new Set(cmsTopLista));
    const uGrupi = (grupa: Grupa) =>
      redovi.filter((red) => prolaziSve(testovi, red, grupa));

    const nazivPoSlugu = new Map<string, string>();
    for (const nisa of nise) nazivPoSlugu.set(nisa.slug, nisa.naziv);

    // ── faza ──
    const fazaSkup = uGrupi("faza");
    const faza: Record<string, number> = {};
    for (const red of fazaSkup) {
      faza[red.assignment.stage] = (faza[red.assignment.stage] ?? 0) + 1;
    }

    // ── zaostali ──
    const zaostaliSkup = uGrupi("zaostali");
    const zaostali = zaostaliSkup.filter(
      (red) =>
        red.assignment.nextActionAt !== undefined &&
        red.assignment.nextActionAt < now,
    ).length;

    // ── temperatura ──
    const tempSkup = uGrupi("temp");
    const temp: Record<string, number> = {
      nova_firma: 0,
      cold: 0,
      warm: 0,
      hot: 0,
    };
    for (const red of tempSkup) {
      const t = red.company?.temperatura ?? "nova_firma";
      temp[t] = (temp[t] ?? 0) + 1;
    }

    // ── niša ──
    const nisaSkup = uGrupi("nisa");
    const nisaBrojaci = new Map<string, number>();
    let bezNise = 0;
    for (const red of nisaSkup) {
      if (red.nisaSlug === null) bezNise++;
      else nisaBrojaci.set(red.nisaSlug, (nisaBrojaci.get(red.nisaSlug) ?? 0) + 1);
    }
    const nisa = [...nisaBrojaci.entries()]
      .map(([slug, broj]) => ({
        slug,
        naziv: nazivPoSlugu.get(slug) ?? slug,
        broj,
      }))
      .sort((a, b) => b.broj - a.broj || a.naziv.localeCompare(b.naziv, "sr-RS"));

    // ── grad ──
    const gradSkup = uGrupi("grad");
    const gradBrojaci = new Map<string, number>();
    let bezGrada = 0;
    for (const red of gradSkup) {
      const grad = red.company?.city?.trim();
      if (!grad) bezGrada++;
      else gradBrojaci.set(grad, (gradBrojaci.get(grad) ?? 0) + 1);
    }
    const grad = [...gradBrojaci.entries()]
      .map(([naziv, broj]) => ({ naziv, broj }))
      .sort((a, b) => b.broj - a.broj || a.naziv.localeCompare(b.naziv, "sr-RS"));

    // ── sajt ──
    const sajtSkup = uGrupi("sajt");
    const sajt: Record<SajtFilter, number> = {
      ima: 0,
      nema: 0,
      nepoznato: 0,
      ne_radi: 0,
      parkiran: 0,
      drustvene: 0,
      bez_https: 0,
    };
    let sajtNeprovereno = 0;
    for (const red of sajtSkup) {
      for (const vrednost of SAJT_FILTER_VALUES) {
        if (sajtPogodak(red.company, vrednost)) sajt[vrednost]++;
      }
      if (sajtNeproveren(red.company)) sajtNeprovereno++;
    }

    // ── platforma ──
    const platformaSkup = uGrupi("platforma");
    const platforma: Record<PlatformaFilter, number> = {
      instagram: 0,
      facebook: 0,
      tiktok: 0,
      threads: 0,
      website: 0,
    };
    for (const red of platformaSkup) {
      for (const p of PLATFORMA_FILTER_VALUES) {
        if (red.platforme.has(p)) platforma[p]++;
      }
    }

    // ── koordinate ──
    const koordSkup = uGrupi("koord");
    let koordDa = 0;
    for (const red of koordSkup) {
      if (red.company?.lat !== undefined && red.company?.lng !== undefined) {
        koordDa++;
      }
    }

    // ── verovatnoća telefona ──
    const telSkup = uGrupi("tel");
    const tel: Record<string, number> = { "70": 0, "40": 0, "0": 0 };
    for (const red of telSkup) {
      if (!red.imaProcenuTelefona) continue;
      const najveca = red.najvecaVerovatnoca ?? -1;
      for (const prag of TEL_PRAGOVI) {
        if (najveca >= prag) tel[String(prag)]++;
      }
    }

    // ── poslednji dodir ──
    const dodirSkup = uGrupi("dodir");
    const dodir: Record<DodirFilter, number> = { "7d": 0, "30d": 0, nikad: 0 };
    for (const red of dodirSkup) {
      for (const d of ["7d", "30d", "nikad"] as const) {
        if (dodirPogodak(red.assignment, d, now)) dodir[d]++;
      }
    }

    // ── GL10: kvalitet sajta ──
    const kvalitetSkup = uGrupi("kvalitet");
    const kvalitet: Record<KvalitetFilter, number> = {
      los: 0,
      srednji: 0,
      dobar: 0,
      neocenjen: 0,
    };
    for (const red of kvalitetSkup) {
      if (red.ocena?.pojas) kvalitet[red.ocena.pojas]++;
      else if (
        red.ocena === null &&
        (red.company?.imaSajt === "da" || red.company?.sajtStatus === "radi")
      ) {
        kvalitet.neocenjen++;
      }
    }

    // ── GL10: CMS — top 8 radnog prostora + „drugo" + „bez CMS-a" ──
    const cmsSkup = uGrupi("cms");
    const cmsBrojaci = new Map<string, number>();
    let cmsBez = 0;
    let cmsDrugo = 0;
    const cmsTopSkup = new Set(cmsTopLista);
    for (const red of cmsSkup) {
      const kljuc = cmsKljuc(red.ocena);
      if (kljuc === null) continue;
      if (kljuc === CMS_BEZ) cmsBez++;
      else if (cmsTopSkup.has(kljuc)) cmsBrojaci.set(kljuc, (cmsBrojaci.get(kljuc) ?? 0) + 1);
      else cmsDrugo++;
    }
    const cms = cmsTopLista.map((ime) => ({ ime, broj: cmsBrojaci.get(ime) ?? 0 }));

    // ── GL10: spor sajt ──
    const sporSkup = uGrupi("sajtSpor");
    const sajtSpor = sporSkup.filter(
      (red) =>
        red.ocena?.perfMobile !== null &&
        red.ocena?.perfMobile !== undefined &&
        red.ocena.perfMobile < PRAG_SPOR_SAJT,
    ).length;

    // ── GL10: preporučena ponuda ──
    const ponudaSkup = uGrupi("ponuda");
    const ponuda: Record<PonudaFilter, number> = {
      nov_sajt: 0,
      redizajn: 0,
      webshop: 0,
      zakazivanje: 0,
      seo: 0,
      brzina: 0,
      nista: 0,
    };
    for (const red of ponudaSkup) {
      const p = red.ocena?.preporucenaPonuda;
      if (p && p in ponuda) ponuda[p as PonudaFilter]++;
    }

    const ukupno = redovi.filter((red) => prolaziSve(testovi, red)).length;

    return {
      prekoracen: false as const,
      identitetiOdseceni,
      pregledano,
      ukupno,
      faza,
      zaostali,
      temp,
      nisa,
      bezNise,
      grad,
      bezGrada,
      sajt,
      sajtNeprovereno,
      platforma,
      koord: { da: koordDa, ne: koordSkup.length - koordDa },
      tel,
      dodir,
      kvalitet,
      cms,
      cmsDrugo,
      cmsBez,
      sajtSpor,
      ponuda,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAPA (GL3) — plan §8
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signali se za mapu čitaju jednim indeksnim prolazom po radnom prostoru i
 * grupišu po firmi — isti obrazac kao identiteti u `ucitajOsnovu`. Upit po
 * firmi bi za 2000 tačaka bio 2000 upita. Kad se granica dosegne, rezultat
 * nosi `signaliOdseceni: true`, pa mapa kaže da su neke visine nepotpune
 * umesto da tiho nacrta niži heksagon.
 */
const SIGNAL_SCAN_CAP = 8000;

/**
 * Firme za mapu: samo one sa koordinatama, kroz ISTE filtere kao tabela
 * (`ucitajOsnovu` + `napraviTestove` — deljeni helperi, ne kopija).
 *
 * Fit skor se računa PRI ČITANJU kroz `scoreLead` (§0 pravilo 2), sa pravilima
 * učitanim jednom po pozivu. `fit` je procenat 0–100 ili `null` kad se ne može
 * izmeriti — i tada `fitRazlog` kaže zašto: „bez pravila" (nema aktivnog Fit
 * pravila) ili „bez signala" (nijedan signal nije pogodio pravilo). Nula ovde
 * ne postoji ni u jednom od ta dva slučaja (§0 pravilo 1).
 *
 * `bezKoordinata` je broj firmi u ISTOM preseku koje nemaju `lat`/`lng` —
 * mapa ih ne crta, ali ih ne prećutkuje.
 */
export const listLeadsForMap = query({
  args: {
    workspaceId: v.id("workspaces"),
    ...FILTER_ARGS,
  },
  handler: async (ctx, args) => {
    await proveriPristup(ctx, args.workspaceId);

    const now = Date.now();
    // Ocene se čitaju uvek: hover kartica na mapi nosi „Sajt: loš 31" (plan
    // §5.4), a to je jedan `get` po ocenjenoj firmi.
    const { redovi, prekoracen, identitetiOdseceni, nise, pregledano } =
      await ucitajOsnovu(ctx, args.workspaceId, trazeIdentitete(args), true);

    const testovi = napraviTestove(args, now, new Set(cmsTopSpisak(redovi)));
    const pogodjeni = redovi.filter((red) => prolaziSve(testovi, red));

    const saKoordinatama = pogodjeni.filter(
      (red) =>
        red.company !== null &&
        red.company.lat !== undefined &&
        red.company.lng !== undefined,
    );
    const bezKoordinata = pogodjeni.length - saKoordinatama.length;
    // Koliko firmi u CELOM (pregledanom) radnom prostoru ima koordinate —
    // razlika između „skill još nije puštan" (nula) i „ove firme iz preseka
    // ih nemaju" (veće od nule), koju prazno stanje mape mora da ispiše.
    let saKoordinatamaUkupno = 0;
    for (const red of redovi) {
      if (red.company?.lat !== undefined && red.company?.lng !== undefined) {
        saKoordinatamaUkupno++;
      }
    }

    // Pravila jednom po pozivu, ne po firmi.
    const rules = await ctx.db
      .query("leadIcpRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    let signaliOdseceni = false;
    const signaliPoFirmi = new Map<string, LeadSignalInput[]>();
    if (saKoordinatama.length > 0) {
      const signalDocs = await ctx.db
        .query("leadSignals")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(SIGNAL_SCAN_CAP + 1);
      signaliOdseceni = signalDocs.length > SIGNAL_SCAN_CAP;
      for (const signal of signalDocs.slice(0, SIGNAL_SCAN_CAP)) {
        const key = String(signal.companyId);
        let lista = signaliPoFirmi.get(key);
        if (!lista) {
          lista = [];
          signaliPoFirmi.set(key, lista);
        }
        lista.push({ kind: signal.kind, observedAt: signal.observedAt });
      }
    }

    const nazivPoNisi = new Map<string, string>();
    for (const nisa of nise) nazivPoNisi.set(String(nisa._id), nisa.naziv);

    const tacke = saKoordinatama.map((red) => {
      // Filtrirano gore; TypeScript to ne vidi kroz `filter`.
      const company = red.company as Doc<"leadCompanies">;
      const score = scoreLead(
        signaliPoFirmi.get(String(company._id)) ?? [],
        rules,
        now,
      );
      const fitRazlog =
        score.fit.maxPoints === 0
          ? ("bez_pravila" as const)
          : score.fit.signalsCounted === 0
            ? ("bez_signala" as const)
            : null;

      return {
        companyId: company._id,
        naziv: company.name,
        grad: company.city ?? null,
        lat: company.lat as number,
        lng: company.lng as number,
        // `null` = čovek još nije odlučio (polje ne postoji); ekran to crta
        // kao „Nova firma", isto kao tabela.
        temperatura: company.temperatura ?? null,
        fit:
          fitRazlog === null
            ? Math.round((score.fit.points / score.fit.maxPoints) * 100)
            : null,
        fitRazlog,
        fitBodovi: score.fit.points,
        fitMax: score.fit.maxPoints,
        faza: red.assignment.stage,
        nisa: company.nicheId
          ? (nazivPoNisi.get(String(company.nicheId)) ?? null)
          : null,
        nisaSlug: red.nisaSlug,
        imaSajt: company.imaSajt ?? null,
        // Ukupna ocena sajta (GL10, plan §5.4) — `null` bez ocene.
        sajtKvalitet: red.ocena?.kvalitet ?? null,
        poslednjiDodirAt: red.assignment.lastTouchAt ?? null,
        // Sastanak ide uz tačku jer je već učitan sa dodelom; GL4 (§9) crta
        // beacon za sastanke u narednih 7 dana i ne treba mu novi upit.
        sastanakAt: red.assignment.meetingAt ?? null,
      };
    });

    return {
      tacke,
      bezKoordinata,
      saKoordinatamaUkupno,
      ukupno: pogodjeni.length,
      prekoracen,
      identitetiOdseceni,
      signaliOdseceni,
      pregledano,
      now,
    };
  },
});

/**
 * Jedan red tabele po firmi — za bočni panel mape, koji ponovo koristi
 * `lead-row-actions` i prošireni red, pa mu treba TAČNO oblik reda tabele
 * (`hydrateLeadRowExtras`, kao u `listLeadsFiltered`). Vraća `null` kad firma
 * nema dodelu: takva firma nije u tabeli, pa nije ni na mapi.
 */
export const getLeadRow = query({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
  },
  handler: async (ctx, args) => {
    await proveriPristup(ctx, args.workspaceId);

    const company = await ctx.db.get(args.companyId);
    if (!company || company.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Firma nije pronađena u ovom radnom prostoru.",
      });
    }

    const assignment = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .first();
    if (!assignment) return null;

    const now = Date.now();
    const extras = await hydrateLeadRowExtras(
      ctx,
      args.workspaceId,
      args.companyId,
    );

    return {
      item: {
        assignment,
        company,
        ...extras,
        isOverdue:
          assignment.nextActionAt !== undefined && assignment.nextActionAt < now,
      },
      now,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Preseti — imenovani URL-ovi filtera (plan §O8). Deli ih ceo radni prostor.
// ─────────────────────────────────────────────────────────────────────────────
export const listPresets = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await proveriPristup(ctx, args.workspaceId);

    const presets = await ctx.db
      .query("leadFilterPresets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    presets.sort((a, b) => a.naziv.localeCompare(b.naziv, "sr-RS"));

    return presets.map((p) => ({
      _id: p._id,
      naziv: p.naziv,
      query: p.query,
      createdAt: p.createdAt,
    }));
  },
});

export const savePreset = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    naziv: v.string(),
    // Sirov `search` deo URL-a bez vodećeg „?". Preset je link, ne kopija
    // stanja (plan §O8): kad se filteri prošire, stari preset i dalje znači
    // ono što je tada značio.
    query: v.string(),
  },
  returns: v.id("leadFilterPresets"),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const naziv = args.naziv.trim();
    if (!naziv) {
      throw new ConvexError({
        code: "invalid",
        message: "Preset mora imati ime.",
      });
    }

    const query = args.query.replace(/^\?/, "").trim();
    if (!query) {
      throw new ConvexError({
        code: "invalid",
        message: "Nema nijednog aktivnog filtera — preset bi bio prazan link.",
      });
    }

    const postojeci = await ctx.db
      .query("leadFilterPresets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // Tiho prepisivanje tuđeg preseta istog imena bi izgledalo kao da je
    // sačuvan nov — zato greška, a ne `patch`.
    if (postojeci.some((p) => p.naziv === naziv)) {
      throw new ConvexError({
        code: "conflict",
        message: `Preset „${naziv}" već postoji. Izaberi drugo ime ili prvo obriši stari.`,
      });
    }

    return await ctx.db.insert("leadFilterPresets", {
      workspaceId: args.workspaceId,
      naziv,
      query,
      createdBy: membership.userId,
      createdAt: Date.now(),
    });
  },
});

export const deletePreset = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    presetId: v.id("leadFilterPresets"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const preset = await ctx.db.get(args.presetId);
    if (preset === null) return null; // već obrisan — idempotentno
    if (preset.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    await ctx.db.delete(args.presetId);
    return null;
  },
});
