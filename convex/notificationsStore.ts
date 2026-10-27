import type { QueryCtx } from "./_generated/server";
import { v, ConvexError, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  projekatMutation,
  projekatQuery,
  type Projekat,
  type ProjekatMutationCtx,
} from "./lib/projekat";
import { citajUlazeStatusa } from "./lib/vezeProjekta";
import { integracijeUKvaru } from "./lib/statusVeze";
import { brojNerazresenih } from "./lib/importFlow";
import { korakKasni, rokKoraka } from "./lib/leadKorak";
import {
  ODLAGANJE_MS,
  bedzeviOd,
  jePoznatKljuc,
  mnozina,
  napraviZadatke,
  podeliPoStanju,
  pocetakLokalnogDana,
  type IntegracijaUKvaru,
  type KanalStavka,
  type SastanakStavka,
  type Snimak,
  type StanjeZadatka,
  type UvozSaNerazresenim,
  type UvozUPregledu,
} from "./lib/notifications";

/**
 * ============================================================================
 * „ŠTA ME ČEKA" — JEDAN IZVEDEN UPIT (A2, app-ux-plan.md §1.1, §2 N)
 * ============================================================================
 *
 * Izmereno 9.9.2026: tri uvoza stoje „U pregledu" od 28.8, 78 nerazrešenih
 * redova u šest primenjenih uvoza, 178 od 178 leadova nikad dodirnuto, 39
 * firmi bez telefona, 94 neocenjena sajta — i nijedno obaveštenje. Sve to je
 * već stajalo u bazi; nedostajalo je samo jedno mesto koje ume da pita.
 *
 * NIŠTA SE NE SKLADIŠTI KAO OBAVEŠTENJE. Zadatak se izvodi pri čitanju, pa
 * ne može da zastari, ne traži cron i ne ostavlja smeće kada posao nestane.
 * Jedina tabela je `notificationState` — čovekova odluka da nešto skloni.
 *
 * TROŠAK (§1 zahteva da piše): tri brojača nemaju indeks koji bi na njih
 * odgovorio i traže sken, pa su ograničena i prijavljuju odsecanje:
 *
 *   - `leadAssignments`  do 600 redova → zaostali, sastanci, nikad dodirnut
 *   - `leadCompanies`    do 600 redova → bez telefona, neocenjen sajt
 *   - `leadIdentities`   do 1500 redova, ali SAMO `kind: "phone"` (indeks
 *                        `by_workspace_kind_value` uzima i `kind` kao prefiks)
 *
 * Ostalo ide kroz indeks i staje u desetine redova: uvozi po statusu,
 * poslednja sinhronizacija po provajderu, komentari kroz isti prozor koji
 * čita ekran moderacije. Kada je bilo koje čitanje odsečeno, `broj` se
 * prijavljuje kao donja granica (`odsecen: true`) — nikad kao tačan broj.
 */

// ── granice čitanja ──────────────────────────────────────────────────────────

const CAP_UVOZ_U_PREGLEDU = 25;
/** Koliko najnovijih uvoza se uopšte gleda zbog nerazrešenih redova. */
const CAP_UVOZ_ISTORIJA = 15;
const CAP_NERAZRESENI_PO_UVOZU = 500;
const CAP_DODELA = 600;
const CAP_FIRMI = 600;
const CAP_TELEFONA = 1500;
/** Isti prozor koji čita ekran moderacije (`igCommentsStore.filterCounts`). */
const CAP_KOMENTARA = 250;
const CAP_RAZGOVORA = 100;

// ── izlazni oblik ────────────────────────────────────────────────────────────

const zadatakValidator = v.object({
  kljuc: v.string(),
  naslov: v.string(),
  broj: v.number(),
  hitnost: v.union(v.literal("visoka"), v.literal("srednja"), v.literal("niska")),
  veza: v.string(),
  radnja: v.string(),
  imenilac: v.union(v.string(), v.null()),
  bedz: v.string(),
  odsecen: v.boolean(),
});

const sklonjenValidator = v.object({
  ...zadatakValidator.fields,
  odlozenoDo: v.union(v.number(), v.null()),
});

// ── čitanje stanja ───────────────────────────────────────────────────────────

async function ucitajStanja(
  ctx: QueryCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
): Promise<StanjeZadatka[]> {
  const redovi = await ctx.db
    .query("notificationState")
    .withIndex("by_user_workspace_kljuc", (q) =>
      q.eq("userId", userId).eq("workspaceId", workspaceId),
    )
    .collect();

  const out: StanjeZadatka[] = [];
  for (const red of redovi) {
    // Red bez ključa ili iz drugog radnog prostora se PRESKAČE, ne tumači.
    // Sva polja su opciona (vidi šemu), pa je ovo jedino mesto koje sme da
    // odluči šta nepotpun red znači — a znači „ne postoji".
    if (red.kljuc === undefined) continue;
    if (red.workspaceId !== workspaceId) continue;
    out.push({
      kljuc: red.kljuc,
      ...(red.odlozenoDo !== undefined ? { odlozenoDo: red.odlozenoDo } : {}),
      ...(red.sakrivenoAt !== undefined ? { sakrivenoAt: red.sakrivenoAt } : {}),
      ...(red.brojPriSakrivanju !== undefined
        ? { brojPriSakrivanju: red.brojPriSakrivanju }
        : {}),
    });
  }
  return out;
}

// ── proizvođači: uvoz ────────────────────────────────────────────────────────

export async function citajUvoze(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<{
  uPregledu: UvozUPregledu[];
  saNerazresenim: UvozSaNerazresenim[];
  odseceni: boolean;
}> {
  const uPregleduSken = await ctx.db
    .query("leadImports")
    .withIndex("by_workspace_status", (q) =>
      q.eq("workspaceId", workspaceId).eq("status", "u_pregledu"),
    )
    .take(CAP_UVOZ_U_PREGLEDU + 1);

  const preliv = uPregleduSken.length > CAP_UVOZ_U_PREGLEDU;
  const uPregledu = (preliv
    ? uPregleduSken.slice(0, CAP_UVOZ_U_PREGLEDU)
    : uPregleduSken
  ).map((imp) => ({
    id: String(imp._id),
    fileName: imp.fileName,
    uploadedAt: imp.uploadedAt,
  }));

  // Nerazrešeni redovi se broje po uvozu (indeks `by_import_decision`), a ne
  // nad celom tabelom — indeksa po radnom prostoru i odluci nema. Gleda se
  // samo najnovijih `CAP_UVOZ_ISTORIJA` uvoza: nerazrešen red u uvozu od pre
  // godinu dana nije posao koji čeka nego arhiva.
  const skorasnji = await ctx.db
    .query("leadImports")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .take(CAP_UVOZ_ISTORIJA + 1);

  const istorijaOdsecena = skorasnji.length > CAP_UVOZ_ISTORIJA;
  const saNerazresenim: UvozSaNerazresenim[] = [];

  for (const imp of skorasnji.slice(0, CAP_UVOZ_ISTORIJA)) {
    // Nerazrešen red u uvozu koji nije primenjen nije zaseban posao — taj uvoz
    // se već prijavljuje kao „čeka pregled" i dvostruko prijavljivanje bi isti
    // posao brojalo dvaput.
    if (imp.status !== "primenjen") continue;
    const redovi = await ctx.db
      .query("leadImportRows")
      .withIndex("by_import_decision", (q) =>
        q.eq("importId", imp._id).eq("decision", "nerazreseno"),
      )
      .take(CAP_NERAZRESENI_PO_UVOZU + 1);
    if (redovi.length === 0) continue;
    const odsecen = redovi.length > CAP_NERAZRESENI_PO_UVOZU;
    // A5: sklonjen red ne čeka presudu — pri primeni se preskače pre nego što
    // mu se odluka uopšte pogleda (`applyRows`). Zvono i ekran Uvoza broje
    // istom funkcijom (`convex/lib/importFlow.ts`), da traka na stranici i
    // stavka u zvonu ne bi imale dva broja za isti posao.
    const broj = brojNerazresenih(
      odsecen ? redovi.slice(0, CAP_NERAZRESENI_PO_UVOZU) : redovi,
    );
    if (broj === 0) continue;
    saNerazresenim.push({
      id: String(imp._id),
      fileName: imp.fileName,
      broj,
      odsecen,
    });
  }

  return {
    uPregledu,
    saNerazresenim,
    odseceni: preliv || istorijaOdsecena,
  };
}

// ── proizvođači: sinhronizacija ──────────────────────────────────────────────

/**
 * Veze koje traže pažnju — i samo one, po jednom statusu veze (P3,
 * `lib/statusVeze.ts`): ista funkcija daje tačku u gornjoj traci, red stanja u
 * zaglavlju kanala i fokus Podešavanja, pa zvono ne može da kaže drugo.
 *
 * Ovo je i dalje odgovor na protivrečnost iz §1.3 (crveni čip bez imena i
 * vremena): neuspeo prolaz se prijavljuje samo ako posle njega nije stiglo
 * ništa svežije, a nepovezana veza i veza u prekidu nisu kvar. Uz pad i
 * istekao pristup sada se javljaju i token koji ističe za 7 dana, podaci
 * stariji od praga i server bez podešavanja — sve što boji tačku žuto.
 */
async function citajIntegracije(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  now: number,
): Promise<IntegracijaUKvaru[]> {
  return integracijeUKvaru(await citajUlazeStatusa(ctx, workspaceId), now);
}

// ── proizvođači: leadovi ─────────────────────────────────────────────────────

type LeadSnimak = Pick<
  Snimak,
  | "zaostaliKoraci"
  | "zaostaliOdsecen"
  | "sastanciDanas"
  | "sastanciProsliBezIshoda"
  | "nikadDodirnut"
  | "ukupnoDodela"
  | "dodeleOdsecene"
  | "bezTelefona"
  | "ukupnoFirmi"
  | "firmeOdsecene"
  | "bezProcene"
  | "procenaOdsecena"
  | "neocenjenSajt"
>;

/**
 * Prag „Zovi sada": procena da je telefon baš od te osobe. Isti broj koji
 * ekran Danas šalje filteru (`leads-today.tsx`: `tel: 40`).
 */
const ZOVI_SADA_PROCENA = 40;

export async function citajLeadove(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  now: number,
  pomerajMin: number,
): Promise<LeadSnimak & { zoviSada: number }> {
  const dodeleSken = await ctx.db
    .query("leadAssignments")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(CAP_DODELA + 1);

  const dodeleOdsecene = dodeleSken.length > CAP_DODELA;
  const dodele = dodeleOdsecene ? dodeleSken.slice(0, CAP_DODELA) : dodeleSken;

  const danOd = pocetakLokalnogDana(now, pomerajMin);
  const danDo = danOd + 24 * 60 * 60 * 1000;

  let zaostaliKoraci = 0;
  let nikadDodirnut = 0;
  let sastanciProsliBezIshoda = 0;
  const sastanciDanasSirovo: Array<{
    at: number;
    companyId: Id<"leadCompanies">;
  }> = [];

  for (const dodela of dodele) {
    // Isto pravilo kao jezičak Zaostali (`listOverdue`): zatvoren posao nema korak.
    if (korakKasni(dodela, now)) {
      zaostaliKoraci++;
    }
    // „Nikad dodirnut" je isto pravilo koje koristi filter `?dodir=nikad`
    // (`leadFiltersStore.dodirPogodak`), da broj u zvonu i spisak iza dugmeta
    // budu ista stvar.
    if (dodela.lastTouchAt === undefined) nikadDodirnut++;

    if (dodela.meetingAt !== undefined) {
      const ishodZabelezen =
        dodela.outcomeAt !== undefined && dodela.outcomeAt >= dodela.meetingAt;
      if (dodela.meetingAt >= danOd && dodela.meetingAt < danDo) {
        sastanciDanasSirovo.push({
          at: dodela.meetingAt,
          companyId: dodela.companyId,
        });
      } else if (dodela.meetingAt < danOd && !ishodZabelezen) {
        sastanciProsliBezIshoda++;
      }
    }
  }

  sastanciDanasSirovo.sort((a, b) => a.at - b.at);

  // Ime firme treba samo prvom sastanku — jedini naslov koji ga uopšte koristi
  // je „Sastanak danas u 14:30 — <firma>", i to kada je sastanak tačno jedan.
  const sastanciDanas: SastanakStavka[] = [];
  for (let i = 0; i < sastanciDanasSirovo.length; i++) {
    const stavka = sastanciDanasSirovo[i];
    if (i === 0) {
      const firma = await ctx.db.get(stavka.companyId);
      sastanciDanas.push({
        at: stavka.at,
        firma: firma && firma.workspaceId === workspaceId ? firma.name : null,
      });
    } else {
      sastanciDanas.push({ at: stavka.at, firma: null });
    }
  }

  // ── firme: bez telefona i neocenjen sajt ──────────────────────────────────
  const firmeSken = await ctx.db
    .query("leadCompanies")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(CAP_FIRMI + 1);

  const firmeOdsecene = firmeSken.length > CAP_FIRMI;
  const firme = firmeOdsecene ? firmeSken.slice(0, CAP_FIRMI) : firmeSken;

  // `by_workspace_kind_value` ima `kind` kao drugi deo ključa, pa se čitaju
  // SAMO telefoni. To je razlika između 1500 i 8000 pročitanih redova, i razlog
  // zbog kog ovaj brojač sme da stoji u ljusci aplikacije.
  const telefoniSken = await ctx.db
    .query("leadIdentities")
    .withIndex("by_workspace_kind_value", (q) =>
      q.eq("workspaceId", workspaceId).eq("kind", "phone"),
    )
    .take(CAP_TELEFONA + 1);

  const telefoniOdseceni = telefoniSken.length > CAP_TELEFONA;
  const saTelefonom = new Set<string>();
  // Firma sa procenom „čiji je broj": bar jedan telefon nosi `verovatnoca`.
  // To NIJE isto što i „ima broj" — skill upiše broj pre nego što izračuna
  // verovatnoću da baš toj osobi pripada.
  const saProcenom = new Set<string>();
  // B4: firme čiji bar jedan telefon ima procenu ≥ praga — polovina uslova za
  // „Zovi sada" (druga polovina je „nikad dodirnut", ispod).
  const saDobromProcenom = new Set<string>();
  for (const identitet of telefoniSken.slice(0, CAP_TELEFONA)) {
    if (identitet.value.trim().length > 0) {
      saTelefonom.add(String(identitet.companyId));
    }
    if (identitet.verovatnoca !== undefined) {
      saProcenom.add(String(identitet.companyId));
      if (identitet.verovatnoca >= ZOVI_SADA_PROCENA) {
        saDobromProcenom.add(String(identitet.companyId));
      }
    }
  }

  // Isto pravilo kao red „Zovi sada" na ekranu Danas pre Fit filtera
  // (`listLeadsFiltered` sa `ZOVI_SADA_FILTER`): firma sa dogovorenim
  // korakom čeka u „Vrati se na", ne u ovom redu.
  let zoviSada = 0;
  for (const dodela of dodele) {
    if (
      dodela.lastTouchAt === undefined &&
      rokKoraka(dodela) === undefined &&
      saDobromProcenom.has(String(dodela.companyId))
    ) {
      zoviSada++;
    }
  }

  const uTabeli = new Set<string>();
  for (const dodela of dodele) uTabeli.add(String(dodela.companyId));

  // Firme u tabeli (dodele) bez ijedne procene — isto pravilo kao filter
  // `bezProcene` (`leadFiltersStore.napraviTestove`: `!imaProcenuTelefona`),
  // da broj u zvonu i spisak iza dugmeta budu ista stvar.
  let bezProcene = 0;
  for (const companyKey of uTabeli) {
    if (!saProcenom.has(companyKey)) bezProcene++;
  }

  let bezTelefona = 0;
  let neocenjenSajt = 0;
  for (const firma of firme) {
    const kljuc = String(firma._id);
    if (!saTelefonom.has(kljuc)) bezTelefona++;
    // Isto pravilo kao chip „Neocenjen" u filteru kvaliteta sajta: firma IMA
    // sajt, a ocene nema. Firma bez sajta nije neocenjen sajt. Broji se samo
    // ono što je i u tabeli leadova, da broj u zvonu i broj iza dugmeta budu
    // isti — tabela je lista DODELA, ne lista firmi.
    const imaSajt = firma.imaSajt === "da" || firma.sajtStatus === "radi";
    if (
      imaSajt &&
      firma.poslednjaOcenaSajtaId === undefined &&
      uTabeli.has(kljuc)
    ) {
      neocenjenSajt++;
    }
  }

  return {
    zaostaliKoraci,
    zaostaliOdsecen: dodeleOdsecene,
    sastanciDanas,
    sastanciProsliBezIshoda,
    nikadDodirnut,
    ukupnoDodela: dodele.length,
    dodeleOdsecene,
    bezTelefona,
    ukupnoFirmi: firme.length,
    // Odsečeni telefoni prave LAŽNE rupe (firma čiji broj nije pročitan
    // izgleda kao firma bez broja), pa se i to broji kao odsecanje.
    firmeOdsecene: firmeOdsecene || telefoniOdseceni,
    bezProcene,
    // Odsečen sken telefona pravi lažne „bez procene" — firma čija procena
    // nije pročitana izgleda kao firma bez procene.
    procenaOdsecena: telefoniOdseceni || dodeleOdsecene,
    neocenjenSajt,
    // Ne ulazi u zadatke zvona — čita ga generator misija (`convex/napredak.ts`).
    zoviSada,
  };
}

// ── proizvođači: kanali ──────────────────────────────────────────────────────

/** Komentar tuđ, još na mreži, nije sakriven i ništa naše ne stoji ispod njega. */
function bezOdgovora(row: {
  isOurs: boolean;
  repliedByUs: boolean;
  hidden: boolean;
  deletedAt?: number;
  parentCommentId?: string;
}): boolean {
  return (
    row.parentCommentId === undefined &&
    !row.isOurs &&
    !row.repliedByUs &&
    !row.hidden &&
    row.deletedAt === undefined
  );
}

export async function citajKanale(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<KanalStavka[]> {
  const veze = await ctx.db
    .query("connections")
    .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  const povezan = new Set(
    veze.filter((v) => v.status !== "disconnecting").map((v) => v.provider),
  );

  const out: KanalStavka[] = [];

  if (povezan.has("meta_ig")) {
    const prozor = await ctx.db
      .query("igComments")
      .withIndex("by_workspace_timestamp", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(CAP_KOMENTARA);
    const broj = prozor.filter(bezOdgovora).length;
    out.push({
      kljuc: "ig_komentari",
      naslov: `${broj} ${mnozina(broj, "komentar", "komentara", "komentara")} bez odgovora na Instagramu`,
      broj,
      veza: "/instagram/komentari",
      radnja: "Odgovori",
      bedz: "/instagram",
      imenilac: `u poslednjih ${prozor.length} ${mnozina(prozor.length, "komentar", "komentara", "komentara")}`,
      odsecen: prozor.length >= CAP_KOMENTARA,
    });
  }

  if (povezan.has("meta_fb")) {
    const prozor = await ctx.db
      .query("fbComments")
      .withIndex("by_workspace_timestamp", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(CAP_KOMENTARA);
    const broj = prozor.filter(bezOdgovora).length;
    out.push({
      kljuc: "fb_komentari",
      naslov: `${broj} ${mnozina(broj, "komentar", "komentara", "komentara")} bez odgovora na Facebook stranici`,
      broj,
      veza: "/facebook/komentari",
      radnja: "Odgovori",
      bedz: "/facebook",
      imenilac: `u poslednjih ${prozor.length} ${mnozina(prozor.length, "komentar", "komentara", "komentara")}`,
      odsecen: prozor.length >= CAP_KOMENTARA,
    });
  }

  if (povezan.has("meta_ig") || povezan.has("meta_fb")) {
    const razgovori = await ctx.db
      .query("orConversations")
      .withIndex("by_workspace_updated", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(CAP_RAZGOVORA);
    const broj = razgovori.filter((r) => (r.unreadCount ?? 0) > 0).length;
    out.push({
      kljuc: "poruke",
      naslov: `${broj} ${mnozina(broj, "razgovor", "razgovora", "razgovora")} sa nepročitanom porukom`,
      broj,
      veza: "/instagram/inbox",
      radnja: "Otvori poruke",
      bedz: "/instagram",
      imenilac: `u poslednjih ${razgovori.length} ${mnozina(razgovori.length, "razgovora", "razgovora", "razgovora")}`,
      odsecen: razgovori.length >= CAP_RAZGOVORA,
    });
  }

  return out;
}

// ── upit ─────────────────────────────────────────────────────────────────────

const staMeCekaValidator = v.object({
  zadaci: v.array(zadatakValidator),
  sklonjeni: v.array(sklonjenValidator),
  bedzevi: v.record(v.string(), v.number()),
  ukupno: v.number(),
  /** Bar jedan brojač je odsečen — vidi komentar o trošku na vrhu fajla. */
  nepotpuno: v.boolean(),
  now: v.number(),
});

/** Najviše upita sa sajta koje zvono broji pre nego što kaže „101+“. */
const CAP_UPITA_SA_SAJTA = 100;

/**
 * C17: upiti sa forme na sajtu koji čekaju („nov“). Indeks po platformi i
 * statusu: novi komentari sa mreža se ne čitaju. Najstariji je prvi (indeks
 * se završava sa `_creationTime`).
 */
async function citajUpiteSaSajta(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<Snimak["upitiSaSajta"]> {
  const redovi = await ctx.db
    .query("leadInbound")
    .withIndex("by_workspace_platform_status", (q) =>
      q.eq("workspaceId", workspaceId).eq("platform", "website").eq("status", "nov"),
    )
    .take(CAP_UPITA_SA_SAJTA + 1);
  if (redovi.length === 0) return null;
  const odsecen = redovi.length > CAP_UPITA_SA_SAJTA;
  return {
    broj: odsecen ? CAP_UPITA_SA_SAJTA : redovi.length,
    najstarijiAt: redovi[0].createdAt,
    odsecen,
  };
}

/**
 * „Šta me čeka“ za jedan projekat i jednog korisnika. Deli ga upit zvona
 * (ispod) i broj u biraču projekta (`projekti.stanjeProjekata`), pa je
 * pravilo jedno. Pristup proverava pozivalac; ovde se samo čita.
 *
 * `sada` daje pozivalac, `pomerajMin` su minuti koje treba dodati na UTC da
 * bi se dobilo lokalno vreme (`-new Date().getTimezoneOffset()`).
 */
export async function izracunajStaMeCeka(
  ctx: QueryCtx,
  o: {
    workspaceId: Id<"workspaces">;
    userId: Id<"users">;
    sada: number;
    pomerajMin?: number;
  },
): Promise<Infer<typeof staMeCekaValidator>> {
  const now = o.sada;
  const pomerajMin = Number.isFinite(o.pomerajMin ?? 0)
    ? Math.trunc(o.pomerajMin ?? 0)
    : 0;

  const [uvozi, integracijeUKvaru, leadovi, kanali, upitiSaSajta] = await Promise.all([
    citajUvoze(ctx, o.workspaceId),
    citajIntegracije(ctx, o.workspaceId, now),
    citajLeadove(ctx, o.workspaceId, now, pomerajMin),
    citajKanale(ctx, o.workspaceId),
    citajUpiteSaSajta(ctx, o.workspaceId),
  ]);

  const snimak: Snimak = {
    now,
    pomerajMin,
    uvoziUPregledu: uvozi.uPregledu,
    uvoziSaNerazresenim: uvozi.saNerazresenim,
    uvoziOdseceni: uvozi.odseceni,
    integracijeUKvaru,
    ...leadovi,
    upitiSaSajta,
    kanali,
  };

  const svi = napraviZadatke(snimak);
  const stanja = await ucitajStanja(ctx, o.userId, o.workspaceId);
  const { zadaci, sklonjeni } = podeliPoStanju(svi, stanja, now);

  return {
    zadaci,
    sklonjeni,
    bedzevi: bedzeviOd(zadaci),
    ukupno: zadaci.length,
    nepotpuno: zadaci.some((z) => z.odsecen),
    now,
  };
}

/**
 * Sve površine („zvono", bedževi u navigaciji, blok „Danas") čitaju OVAJ upit i
 * nijedan drugi. Convex klijent deduplikuje isti upit sa istim argumentima u
 * jednu pretplatu, pa tri površine na ekranu koštaju koliko i jedna — pod
 * uslovom da im je `pomerajMin` isti, zato ga svi uzimaju iz istog hooka.
 */
export const staMeCeka = projekatQuery({
  args: {
    /**
     * Minuti koje treba dodati na UTC da bi se dobilo lokalno vreme
     * (`-new Date().getTimezoneOffset()`). Server je UTC, a „sastanak danas u
     * 14:30" je lokalna tvrdnja; bez ovoga bi termin u 00:30 bio jučerašnji.
     */
    pomerajMin: v.optional(v.number()),
  },
  returns: staMeCekaValidator,
  handler: async (ctx, args) =>
    await izracunajStaMeCeka(ctx, {
      workspaceId: args.workspaceId,
      userId: ctx.projekat.userId,
      sada: Date.now(),
      pomerajMin: args.pomerajMin,
    }),
});

// ── mutacije: odloži / sakrij / vrati ────────────────────────────────────────

/**
 * Red stanja traži se po (korisnik, projekat, ključ): isti korisnik u dva
 * projekta ima dva nezavisna reda za isti ključ.
 */
async function nadjiStanje(
  ctx: QueryCtx,
  projekat: Projekat,
  kljuc: string,
): Promise<Doc<"notificationState"> | null> {
  return await ctx.db
    .query("notificationState")
    .withIndex("by_user_workspace_kljuc", (q) =>
      q
        .eq("userId", projekat.userId)
        .eq("workspaceId", projekat.workspaceId)
        .eq("kljuc", kljuc),
    )
    .first();
}

const kljucArg = {
  kljuc: v.string(),
};

/**
 * Provera koja se ponavlja u sve tri mutacije: da ključ uopšte postoji u
 * sistemu. Ključ koji nijedan proizvođač ne pravi bi napravio red koji niko
 * nikad neće pročitati. Pripadnost projektu proverava omotač.
 */
function pripremi(ctx: ProjekatMutationCtx, kljuc: string): Projekat {
  if (!jePoznatKljuc(kljuc)) {
    throw new ConvexError({
      code: "bad_request",
      message: "Nepoznat zadatak.",
    });
  }
  return ctx.projekat;
}

/** „Odloži 1 dan" — stavka nestaje do sutra u isto vreme i onda se vrati sama. */
export const odloziZadatak = projekatMutation({
  uloga: "client_viewer",
  args: kljucArg,
  returns: v.object({ odlozenoDo: v.number() }),
  handler: async (ctx, args) => {
    const projekat = pripremi(ctx, args.kljuc);
    const odlozenoDo = Date.now() + ODLAGANJE_MS;
    const postojece = await nadjiStanje(ctx, projekat, args.kljuc);

    if (postojece) {
      // Odlaganje poništava sakrivanje: to su dva različita odgovora na istu
      // stavku i držati oba istovremeno znači ne znati koji važi.
      await ctx.db.patch(postojece._id, {
        odlozenoDo,
        sakrivenoAt: undefined,
        brojPriSakrivanju: undefined,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("notificationState", {
        workspaceId: args.workspaceId,
        userId: projekat.userId,
        kljuc: args.kljuc,
        odlozenoDo,
        updatedAt: Date.now(),
      });
    }
    return { odlozenoDo };
  },
});

/**
 * „Sakrij" — stavka nestaje dok posao ne naraste.
 *
 * `broj` je koliko je posla bilo u trenutku sakrivanja i zato je obavezan: bez
 * njega bi sakrivanje „39 firmi bez broja" ućutkalo i onu četrdesetu, zauvek.
 */
export const sakrijZadatak = projekatMutation({
  uloga: "client_viewer",
  args: { ...kljucArg, broj: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const projekat = pripremi(ctx, args.kljuc);
    const now = Date.now();
    const postojece = await nadjiStanje(ctx, projekat, args.kljuc);
    const brojPriSakrivanju = Math.max(0, Math.trunc(args.broj));

    if (postojece) {
      await ctx.db.patch(postojece._id, {
        sakrivenoAt: now,
        brojPriSakrivanju,
        odlozenoDo: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("notificationState", {
        workspaceId: args.workspaceId,
        userId: projekat.userId,
        kljuc: args.kljuc,
        sakrivenoAt: now,
        brojPriSakrivanju,
        updatedAt: now,
      });
    }
    return null;
  },
});

/** „Vrati" — bez ovoga je „Sakrij" ćorsokak, a plan zabranjuje ćorsokake. */
export const vratiZadatak = projekatMutation({
  uloga: "client_viewer",
  args: kljucArg,
  returns: v.null(),
  handler: async (ctx, args) => {
    const projekat = pripremi(ctx, args.kljuc);
    const postojece = await nadjiStanje(ctx, projekat, args.kljuc);
    if (postojece) await ctx.db.delete(postojece._id);
    return null;
  },
});
