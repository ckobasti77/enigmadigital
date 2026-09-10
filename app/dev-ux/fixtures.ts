import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { LeadScore } from "@/convex/lib/leadScoring";
import {
  bedzeviOd,
  napraviZadatke,
  type Snimak,
} from "@/convex/lib/notifications";
import { dateKeysBetween, presetRange } from "@/lib/date-range";

/**
 * Sintetički podaci za razvojni prikaz ekrana (A1 §6).
 *
 * Sve je izmišljeno i očigledno lažno („Test Salon 1", „+381 60 000 0000").
 * Brojevi namerno prate ono što je IZMERENO na produkciji 9.9.2026
 * (app-ux-plan.md §1): 178 leadova svi u fazi „Nov", 210 firmi u bazi,
 * prethodni period bez podataka (pa poređenje na pločicama ne postoji), jedna
 * integracija u grešci. Tako snimak „pre" pokazuje baš one probleme koje A1
 * rešava, a snimak „posle" da su rešeni — nad istim ulazom.
 *
 * Svaki fixture je tipiziran preko `FunctionReturnType` prave Convex funkcije:
 * ako se oblik odgovora promeni, `tsc` ovo obori pre nego što snimak slaže.
 */
type R<Q extends FunctionReference<"query">> = FunctionReturnType<Q>;

const WS = "ws_ux_test_000000000000000" as Id<"workspaces">;
const USER = "user_ux_test_00000000000000" as Id<"users">;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const range = presetRange("28d", new Date());

/** Deterministični „slučajni" brojevi — isti snimak pre i posle. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const tekuciPeriod = (args: Record<string, unknown>) =>
  typeof args.to === "string" && args.to >= range.from;

// ── Ljuska ───────────────────────────────────────────────────────────────────

const currentContext: R<typeof api.workspaces.currentContext> = {
  user: { id: USER, email: "operater@example.com", name: "Test Operater" },
  workspace: { id: WS, name: "Enigma IT (probni)", slug: "enigma-probni" },
  role: "owner",
};

const connections: R<typeof api.connections.list> = [
  {
    _id: "conn_ga4_test" as Id<"connections">,
    _creationTime: now - 60 * DAY,
    provider: "ga4",
    status: "active",
    externalId: "000000000",
    externalIdAlt: null,
    accountHandle: null,
    lastSyncAt: now - 2 * HOUR,
    expiresAt: null,
    authMode: null,
  },
  {
    _id: "conn_ig_test" as Id<"connections">,
    _creationTime: now - 60 * DAY,
    provider: "meta_ig",
    status: "active",
    externalId: "00000000000000000",
    externalIdAlt: null,
    accountHandle: "test.salon",
    lastSyncAt: now - 3 * DAY,
    expiresAt: now + 40 * DAY,
    authMode: null,
  },
  {
    _id: "conn_or_test" as Id<"connections">,
    _creationTime: now - 60 * DAY,
    provider: "openreply",
    status: "active",
    externalId: null,
    externalIdAlt: null,
    accountHandle: null,
    lastSyncAt: now - 2 * HOUR,
    expiresAt: null,
    authMode: null,
  },
  {
    _id: "conn_leads_test" as Id<"connections">,
    _creationTime: now - 20 * DAY,
    provider: "leads",
    status: "active",
    externalId: null,
    externalIdAlt: null,
    accountHandle: null,
    lastSyncAt: null,
    expiresAt: null,
    authMode: null,
  },
];

const syncHealth: R<typeof api.sync.health> = [
  {
    provider: "ga4",
    status: "ok",
    startedAt: now - 2 * HOUR,
    finishedAt: now - 2 * HOUR + 40_000,
    error: null,
    note: null,
    itemsWritten: 28,
  },
  {
    provider: "meta_ig",
    status: "error",
    startedAt: now - 3 * DAY,
    finishedAt: now - 3 * DAY + 5_000,
    error: "Token je istekao (OAuthException 190).",
    note: null,
    itemsWritten: 0,
  },
  {
    provider: "openreply",
    status: "ok",
    startedAt: now - 2 * HOUR,
    finishedAt: now - 2 * HOUR + 12_000,
    error: null,
    note: null,
    itemsWritten: 31,
  },
];

const freshness: R<typeof api.sync.freshness> = now - 2 * HOUR;

const rateLimit: R<typeof api.metaSyncStore.rateLimit> = {
  state: "ok",
  limited: false,
  retryAt: null,
  peak: 31,
};

// ── Kontrolna tabla / Analitika ──────────────────────────────────────────────

function ga4Daily(): R<typeof api.analytics.daily> {
  const rnd = lcg(11);
  return dateKeysBetween(range.from, range.to).map((date) => {
    const sessions = 40 + Math.round(rnd() * 90);
    const engaged = Math.round(sessions * (0.45 + rnd() * 0.2));
    return {
      date,
      sessions,
      activeUsers: Math.round(sessions * 0.82),
      newUsers: Math.round(sessions * 0.55),
      keyEvents: Math.round(rnd() * 6),
      engagementRate: engaged / sessions,
      totalUsers: Math.round(sessions * 0.9),
      engagedSessions: engaged,
      screenPageViews: Math.round(sessions * 2.4),
      userEngagementDuration: sessions * 42,
      scrolledUsers: Math.round(sessions * 0.6),
      avgEngagementDurationPerSession: 42,
    };
  });
}

function igDaily(): R<typeof api.instagramStore.dailyHistory> {
  const rnd = lcg(23);
  let followers = 2480;
  return dateKeysBetween(range.from, range.to).map((date) => {
    followers += Math.round(rnd() * 6);
    return {
      date,
      followersCount: followers,
      reach: 300 + Math.round(rnd() * 600),
      profileViews: 10 + Math.round(rnd() * 30),
      totalInteractions: 20 + Math.round(rnd() * 80),
      accountsEngaged: 15 + Math.round(rnd() * 60),
    };
  });
}

function orDaily(): R<typeof api.openreplyStore.daily> {
  const rnd = lcg(37);
  return dateKeysBetween(range.from, range.to).map((date) => {
    const dmsSent = 5 + Math.round(rnd() * 25);
    return {
      date,
      dmsSent,
      dmsSentInstagram: dmsSent,
      dmsSentFacebook: 0,
      linkClicks: Math.round(dmsSent * (0.25 + rnd() * 0.3)),
    };
  });
}

const orCampaigns: R<typeof api.openreplyStore.campaigns> = [
  {
    _id: "orc_test_1" as Id<"orCampaignStats">,
    orCampaignId: "cmp-1",
    name: "Probna kampanja: CENOVNIK",
    keyword: "CENOVNIK",
    active: true,
    dmsSent: 214,
    dmsFailed: 3,
    linkClicks: 79,
    ctr: 79 / 214,
    syncedAt: now - 2 * HOUR,
  },
  {
    _id: "orc_test_2" as Id<"orCampaignStats">,
    orCampaignId: "cmp-2",
    name: "Probna kampanja: TERMIN",
    keyword: "TERMIN",
    active: true,
    dmsSent: 132,
    dmsFailed: 1,
    linkClicks: 40,
    ctr: 40 / 132,
    syncedAt: now - 2 * HOUR,
  },
  {
    _id: "orc_test_3" as Id<"orCampaignStats">,
    orCampaignId: "cmp-3",
    name: "Probna kampanja: LETO",
    keyword: "LETO",
    active: false,
    dmsSent: 58,
    dmsFailed: 0,
    linkClicks: 12,
    ctr: 12 / 58,
    syncedAt: now - 20 * DAY,
  },
];

const attributionReport: R<typeof api.attribution.report> = {
  campaigns: [
    {
      _id: "orc_test_1" as Id<"orCampaignStats">,
      orCampaignId: "cmp-1",
      name: "Probna kampanja: CENOVNIK",
      slug: "probna-kampanja-cenovnik",
      keyword: "CENOVNIK",
      active: true,
      dmsSent: 214,
      dmsFailed: 3,
      linkClicks: 79,
      ctr: 79 / 214,
      ga4Sessions: 61,
      ga4KeyEvents: 4,
      hasGa4Data: true,
      hasMismatch: false,
      clickToSessionRate: 61 / 79,
      sessionToConvRate: 4 / 61,
      overallConvRate: 4 / 214,
      syncedAt: now - 2 * HOUR,
    },
  ],
  totals: {
    openreply: {
      dmsSent: 404,
      linkClicks: 131,
      ctr: 131 / 404,
      sessions: 98,
      keyEvents: 6,
      conversionRate: 6 / 98,
      clickToSessionRate: 98 / 131,
    },
    bio: { sessions: 210, keyEvents: 9, conversionRate: 9 / 210 },
    story: { sessions: 44, keyEvents: 1, conversionRate: 1 / 44 },
    otherInstagram: { sessions: 31, keyEvents: 0, conversionRate: 0 },
    totalInstagram: { sessions: 383, keyEvents: 16, conversionRate: 16 / 383 },
    openreplyShareOfIgSessions: 98 / 383,
    openreplyShareOfIgKeyEvents: 6 / 16,
  },
  unmatchedGa4: [],
};

// ── Leadovi ──────────────────────────────────────────────────────────────────

type Temperatura = NonNullable<Doc<"leadCompanies">["temperatura"]>;

const GRADOVI = ["Beograd", "Beograd", "Beograd", "Novi Sad", "Beograd", "Niš"];
const OPSTINE = ["Vračar", "Zvezdara", "Novi Beograd", undefined, "Palilula", undefined];
const TEMPERATURE: (Temperatura | undefined)[] = [
  undefined,
  undefined,
  "hot",
  undefined,
  "warm",
  undefined,
  "cold",
  undefined,
];

// Niše (A3): „Frizerski salon" 113 · „Kozmetički salon" 44 · bez niše 21 —
// isti odnos (~2/3 : 1/4 : ostatak) i na 25 sintetičkih firmi.
const NISA_FRIZERSKI = "nc_ux_test_frizerski_000000" as Id<"niches">;
const NISA_KOZMETICKI = "nc_ux_test_kozmeticki_00000" as Id<"niches">;
function nisaZaFirmu(i: number): Id<"niches"> | undefined {
  if (i % 8 === 7) return undefined;
  return i % 4 === 2 ? NISA_KOZMETICKI : NISA_FRIZERSKI;
}

function napraviLead(i: number) {
  const rnd = lcg(100 + i);
  const companyId = `lc_ux_test_${String(i).padStart(3, "0")}` as Id<"leadCompanies">;
  const imaSajt = i % 3 !== 1;
  const company: Doc<"leadCompanies"> = {
    _id: companyId,
    _creationTime: now - (30 - i) * DAY,
    workspaceId: WS,
    createdAt: now - (30 - i) * DAY,
    updatedAt: now - 7 * DAY,
    name: `Test Salon ${i}`,
    nameNormalized: `test salon ${i}`,
    origin: i === 4 ? "inbound" : "import",
    city: GRADOVI[i % GRADOVI.length],
    municipality: OPSTINE[i % OPSTINE.length],
    nicheId: nisaZaFirmu(i),
    temperatura: TEMPERATURE[i % TEMPERATURE.length],
    ...(imaSajt
      ? {
          website: `https://test-salon-${i}.example`,
          domainNormalized: `test-salon-${i}.example`,
          imaSajt: "da" as const,
          sajtStatus: (i % 7 === 0 ? "ne_radi" : "radi") as "ne_radi" | "radi",
          sajtHttps: i % 5 !== 0,
          sajtProverenAt: now - 3 * DAY,
        }
      : { imaSajt: "ne" as const }),
    lat: 44.79 + rnd() * 0.08,
    lng: 20.42 + rnd() * 0.1,
    koordinateIzvor: "nominatim",
    koordinateAt: now - 10 * DAY,
  };
  const assignment: Doc<"leadAssignments"> = {
    _id: `la_ux_test_${String(i).padStart(3, "0")}` as Id<"leadAssignments">,
    _creationTime: now - 7 * DAY,
    workspaceId: WS,
    companyId,
    ownerUserId: USER,
    stage: "nov",
    createdAt: now - 7 * DAY,
    updatedAt: now - 7 * DAY,
  };
  const imaTelefon = i % 4 !== 3;
  const imaOsobu = i % 2 === 0;
  return {
    assignment,
    company,
    telefoni: imaTelefon
      ? [{ value: "+381 60 000 0000", ...(imaOsobu ? { personName: "Test Osoba" } : {}) }]
      : [],
    emailovi: i % 5 === 0 ? [{ value: `test${i}@example.com` }] : [],
    platforme: [
      { kind: "instagram", value: `https://instagram.com/test_salon_${i}` },
      ...(i % 3 === 0 ? [{ kind: "facebook", value: `https://facebook.com/testsalon${i}` }] : []),
    ],
    osobe: imaOsobu
      ? [
          {
            name: "Test Osoba",
            role: "vlasnik" as const,
            roleConfidence: "verovatno" as const,
            verovatnoca: i % 6 === 0 ? undefined : 40 + (i % 5) * 12,
            nijeMoguceProceniti: undefined,
          },
        ]
      : [],
    signali: imaSajt
      ? ["visok_broj_recenzija", ...(i % 4 === 0 ? ["koristi_third_party_booking"] : [])]
      : ["nema_sajt", "samo_instagram", "visok_broj_recenzija"],
    poslednjiDodir: undefined,
    sajtOcena: null,
    isOverdue: false,
  };
}

const LEADOVI = Array.from({ length: 25 }, (_, i) => napraviLead(i + 1));

const listLeadsFiltered: R<typeof api.leadFiltersStore.listLeadsFiltered> = {
  items: LEADOVI,
  ukupno: 178,
  strana: 1,
  ukupnoStrana: 8,
  poStrani: 25,
  prekoracen: false,
  identitetiOdseceni: false,
  pregledano: 178,
  now,
};

/**
 * „Zovi sada" (A3) traži `tel ≥ 40` + `dodir = nikad`: vraća se podskup istih
 * firmi (broj sa procenom ≥ 40 %), a `ukupno` je izmerenih 40 sa produkcije
 * (chip „telefon ≥ 40 %"). Ostali filteri nisu pokriveni — puna strana.
 */
function listLeadsFilteredZa(args: Record<string, unknown>): R<typeof api.leadFiltersStore.listLeadsFiltered> {
  const tel = typeof args.tel === "number" ? args.tel : null;
  if (tel === null) return listLeadsFiltered;
  const items = LEADOVI.filter(
    (l) => l.telefoni.length > 0 && (l.osobe[0]?.verovatnoca ?? -1) >= tel,
  );
  return { ...listLeadsFiltered, items, ukupno: tel >= 40 ? 40 : 55, ukupnoStrana: 1 };
}

/** Firme bez broja (A3, „Dopuni pa zovi") — one iz `LEADOVI` bez telefona. */
const listCompaniesWithGap: R<typeof api.leadGapsStore.listCompaniesWithGap> = {
  gapType: "bez_telefona",
  companies: LEADOVI.filter((l) => l.telefoni.length === 0).map((l) => l.company),
  count: LEADOVI.filter((l) => l.telefoni.length === 0).length,
  nepotpuno: false,
  pregledanoFirmi: 210,
  moguceLazneRupe: false,
};

/** Jedan član — kolona „Vlasnik" se ne crta (A3, O2). */
const listMembers: R<typeof api.membersStore.listMembers> = [
  {
    userId: USER,
    email: "operater@example.com",
    role: "owner",
    joinedAt: now - 60 * DAY,
    hasPassword: true,
    emailVerified: true,
    inAllowlist: true,
    leadCount: 178,
    isSelf: true,
  },
];

function nisaZapis(
  id: Id<"niches">,
  slug: string,
  naziv: string,
  firmi: number,
): R<typeof api.nichesStore.listNiches>[number] {
  return {
    _id: id,
    _creationTime: now - 40 * DAY,
    workspaceId: WS,
    slug,
    naziv,
    createdAt: now - 40 * DAY,
    updatedAt: now - 40 * DAY,
    createdByEmail: null,
    opisAutorEmail: null,
    platforme: [],
    brojaci: { firmi, saSajtom: Math.round(firmi * 0.55), bezSajta: 2, sajtNepoznato: firmi - Math.round(firmi * 0.55) - 2, hot: 0, warm: 0 },
    sajt: { ocenjeno: 0, prosecanKvalitet: null, cmsRaspodela: [], bezZakazivanja: null },
  };
}

const listNiches: R<typeof api.nichesStore.listNiches> = [
  nisaZapis(NISA_FRIZERSKI, "frizerski-salon", "Frizerski salon", 113),
  nisaZapis(NISA_KOZMETICKI, "kozmeticki-salon", "Kozmetički salon", 44),
];

/** Fit/Intent po firmi. Vrednosti pokrivaju sve pojaseve (§1.3: 27 % žut, 64 % siv). */
function scoreZa(i: number): LeadScore {
  const fitPct = [27, 64, 80, 45, 12, 0, 71, 33][i % 8];
  const intentPct = [0, 0, 20, 0, 0, 0, 55, 0][i % 8];
  const osa = (pct: number, kind: string, rule: string) => ({
    points: pct,
    maxPoints: 100,
    contributions:
      pct > 0
        ? [
            {
              signalKind: kind,
              ruleName: rule,
              weight: 3,
              recencyFactor: 1,
              points: pct,
              observedAt: now - 5 * DAY,
            },
          ]
        : [],
    signalsCounted: pct > 0 ? 1 : 0,
  });
  return {
    fit: osa(fitPct, "nema_sajt", "Nema sajt"),
    intent: osa(intentPct, "pitao_cenu", "Pitao za cenu"),
    unmatchedSignalKinds: [],
    invalidRules: [],
  };
}

const scoreCompanies: R<typeof api.leadScoringStore.scoreCompanies> = Object.fromEntries(
  LEADOVI.map((l, i) => [l.company._id, scoreZa(i + 1)]),
);

const countLeadsByFacet: R<typeof api.leadFiltersStore.countLeadsByFacet> = {
  prekoracen: false,
  identitetiOdseceni: false,
  pregledano: 178,
  ukupno: 178,
  faza: { nov: 178 },
  zaostali: 0,
  temp: { nova_firma: 178, cold: 0, warm: 0, hot: 0 },
  nisa: [
    { slug: "frizerski-salon", naziv: "Frizerski salon", broj: 113 },
    { slug: "kozmeticki-salon", naziv: "Kozmetički salon", broj: 44 },
  ],
  bezNise: 21,
  grad: [
    { naziv: "Beograd", broj: 127 },
    { naziv: "Novi Beograd", broj: 1 },
  ],
  bezGrada: 50,
  sajt: { ima: 94, nema: 3, nepoznato: 0, ne_radi: 1, parkiran: 0, drustvene: 0, bez_https: 4 },
  sajtNeprovereno: 81,
  platforma: { instagram: 83, facebook: 47, tiktok: 13, threads: 0, website: 96 },
  koord: { da: 127, ne: 51 },
  tel: { "70": 10, "40": 40, "0": 55 },
  dodir: { "7d": 0, "30d": 0, nikad: 178 },
  kvalitet: { los: 0, srednji: 0, dobar: 0, neocenjen: 94 },
  cms: [],
  cmsDrugo: 0,
  cmsBez: 0,
  sajtSpor: 0,
  ponuda: { nov_sajt: 0, redizajn: 0, webshop: 0, zakazivanje: 0, seo: 0, brzina: 0, nista: 0 },
};

const listPresets: R<typeof api.leadFiltersStore.listPresets> = [];

const listMeetings: R<typeof api.leadCrmStore.listMeetings> = {
  items: [],
  count: 0,
  mozdaImaJos: false,
  now,
};

const listOverdue: R<typeof api.leadCrmStore.listOverdue> = {
  items: [],
  count: 0,
  mozdaImaJos: false,
  pregledano: 0,
  now,
};

const listGaps: R<typeof api.leadGapsStore.listGaps> = {
  bezTelefona: 39,
  bezKontaktOsobe: 155,
  bezVlasnika: 32,
  bezSajta: 3,
  bezPib: 96,
  ukupnoFirmi: 210,
  nepotpuno: false,
  prebrojano: 210,
  moguceLazneRupe: false,
};

// ── „Šta me čeka" (A2) ───────────────────────────────────────────────────────
//
// Fixture se NE piše rukom: snimak stanja prolazi kroz PRAVE proizvođače
// (`convex/lib/notifications.ts`), pa razvojni prikaz ne može da pokaže spisak
// koji produkcija ne bi napravila. Brojevi su izmereni 9.9.2026 (§1.1), a
// Instagram u grešci je isti onaj iz `syncHealth` iznad.
const staMeCekaSnimak: Snimak = {
  now,
  pomerajMin: -new Date().getTimezoneOffset(),
  uvoziUPregledu: [
    { id: "imp_ux_1", fileName: "test-tabela-1.xlsx", uploadedAt: now - 13 * DAY },
    { id: "imp_ux_2", fileName: "test-tabela-2.xlsx", uploadedAt: now - 8 * DAY },
    { id: "imp_ux_3", fileName: "test-tabela-3.xlsx", uploadedAt: now - 7 * DAY },
  ],
  uvoziSaNerazresenim: [
    { id: "imp_ux_4", fileName: "test-tabela-4.xlsx", broj: 41, odsecen: false },
    { id: "imp_ux_5", fileName: "test-tabela-5.xlsx", broj: 21, odsecen: false },
    { id: "imp_ux_6", fileName: "test-tabela-6.xlsx", broj: 9, odsecen: false },
    { id: "imp_ux_7", fileName: "test-tabela-7.xlsx", broj: 3, odsecen: false },
    { id: "imp_ux_8", fileName: "test-tabela-8.xlsx", broj: 3, odsecen: false },
    { id: "imp_ux_9", fileName: "test-tabela-9.xlsx", broj: 1, odsecen: false },
  ],
  uvoziOdseceni: false,
  integracijeUKvaru: [
    {
      provider: "meta_ig",
      razlog: "greska",
      posledniUspehAt: now - 3 * DAY,
      primecenAt: now - 3 * DAY,
    },
  ],
  zaostaliKoraci: 0,
  zaostaliOdsecen: false,
  sastanciDanas: [],
  sastanciProsliBezIshoda: 0,
  nikadDodirnut: 178,
  ukupnoDodela: 178,
  dodeleOdsecene: false,
  bezTelefona: 39,
  ukupnoFirmi: 210,
  firmeOdsecene: false,
  neocenjenSajt: 94,
  kanali: [],
};

const staMeCekaZadaci = napraviZadatke(staMeCekaSnimak);

const staMeCeka: R<typeof api.notificationsStore.staMeCeka> = {
  zadaci: staMeCekaZadaci,
  sklonjeni: [],
  bedzevi: bedzeviOd(staMeCekaZadaci),
  ukupno: staMeCekaZadaci.length,
  nepotpuno: staMeCekaZadaci.some((z) => z.odsecen),
  now,
};

// ── Razrešavanje po imenu funkcije ───────────────────────────────────────────

type Fixture = (args: Record<string, unknown>) => unknown;

const FIXTURES: Record<string, Fixture> = {
  [getFunctionName(api.workspaces.currentContext)]: () => currentContext,
  [getFunctionName(api.connections.list)]: () => connections,
  [getFunctionName(api.sync.health)]: () => syncHealth,
  [getFunctionName(api.sync.freshness)]: () => freshness,
  [getFunctionName(api.metaSyncStore.rateLimit)]: () => rateLimit,
  // Prethodni period je namerno prazan: to je izmereno stanje produkcije
  // (7/7 i 5/5 pločica bez poređenja), pa snimak „pre" pokazuje baš to.
  [getFunctionName(api.analytics.daily)]: (args) => (tekuciPeriod(args) ? ga4Daily() : []),
  [getFunctionName(api.instagramStore.dailyHistory)]: (args) => (tekuciPeriod(args) ? igDaily() : []),
  [getFunctionName(api.instagramStore.metricSeries)]: () => [],
  [getFunctionName(api.instagramStore.mediaList)]: () => [],
  [getFunctionName(api.openreplyStore.daily)]: (args) => (tekuciPeriod(args) ? orDaily() : []),
  [getFunctionName(api.openreplyStore.campaigns)]: () => orCampaigns,
  [getFunctionName(api.attribution.report)]: () => attributionReport,
  [getFunctionName(api.leadFiltersStore.listLeadsFiltered)]: (args) => listLeadsFilteredZa(args),
  [getFunctionName(api.leadGapsStore.listCompaniesWithGap)]: () => listCompaniesWithGap,
  [getFunctionName(api.membersStore.listMembers)]: () => listMembers,
  [getFunctionName(api.nichesStore.listNiches)]: () => listNiches,
  [getFunctionName(api.leadFiltersStore.countLeadsByFacet)]: () => countLeadsByFacet,
  [getFunctionName(api.leadFiltersStore.listPresets)]: () => listPresets,
  [getFunctionName(api.leadScoringStore.scoreCompanies)]: () => scoreCompanies,
  [getFunctionName(api.leadCrmStore.listMeetings)]: () => listMeetings,
  [getFunctionName(api.leadCrmStore.listOverdue)]: () => listOverdue,
  [getFunctionName(api.leadGapsStore.listGaps)]: () => listGaps,
  [getFunctionName(api.notificationsStore.staMeCeka)]: () => staMeCeka,
};

/** `undefined` za sve što nije pokriveno — ekran tada crta skeleton, ne laž. */
export function resolveFixture(name: string, args: Record<string, unknown>): unknown {
  const fx = FIXTURES[name];
  return fx ? fx(args) : undefined;
}
