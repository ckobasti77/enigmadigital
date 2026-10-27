import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dateKeysBetween } from "@/lib/date-range";
import { DAY, HOUR, lcg, now, range, tekuciPeriod, WS } from "./fixtures-util";
import type { Fixture, R } from "./fixtures-util";

/**
 * Sintetički GA4 izveštaji za /analytics i /atribucija (dev-ux prikaz).
 * Sve je izmišljeno: "Test Salon", example.com, nikakvi stvarni podaci.
 * `analytics.daily`, `attribution.report` i `connections.list` su u fixtures.ts.
 */

type Meta = NonNullable<R<typeof api.analytics.reportMeta>>;

const TZ = "Europe/Belgrade";

function meta(reportKey: string, extra: Partial<Meta> = {}): Meta {
  return {
    _id: `ga4rm_ux_${reportKey}`.padEnd(28, "0") as Id<"ga4ReportMeta">,
    _creationTime: now - 3 * DAY,
    workspaceId: WS,
    reportKey,
    fetchedAt: now - 2 * HOUR,
    timeZone: TZ,
    currencyCode: "EUR",
    ...extra,
  };
}

/** Period iz argumenata (ili tekući 28d), kao ključevi datuma. */
function keys(args: Record<string, unknown>): string[] {
  const from = typeof args.from === "string" ? args.from : range.from;
  const to = typeof args.to === "string" ? args.to : range.to;
  return dateKeysBetween(from, to);
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const rate = (a: number, b: number) => (b > 0 ? a / b : 0);

// ── Saobraćaj (izvor / medijum / kampanja) ───────────────────────────────────

const TRAFFIC_ROWS: R<typeof api.analytics.traffic>["rows"] = [
  { source: "google", medium: "organic", campaign: "(organic)", sessions: 812, keyEvents: 41 },
  { source: "(direct)", medium: "(none)", campaign: "(direct)", sessions: 536, keyEvents: 18 },
  { source: "instagram", medium: "social", campaign: "bio-link", sessions: 318, keyEvents: 22 },
  { source: "google", medium: "cpc", campaign: "leto-2026-pretraga", sessions: 207, keyEvents: 19 },
  { source: "l.instagram.com", medium: "referral", campaign: "(not set)", sessions: 164, keyEvents: 9 },
  { source: "m.facebook.com", medium: "referral", campaign: "(not set)", sessions: 121, keyEvents: 6 },
  { source: "threads.net", medium: "referral", campaign: "(not set)", sessions: 74, keyEvents: 3 },
  { source: "newsletter", medium: "email", campaign: "jesen-akcija", sessions: 61, keyEvents: 7 },
  { source: "example-partner.com", medium: "referral", campaign: "(not set)", sessions: 52, keyEvents: 4 },
  { source: "youtube.com", medium: "referral", campaign: "(not set)", sessions: 45, keyEvents: 2 },
  { source: "bing", medium: "organic", campaign: "(organic)", sessions: 38, keyEvents: 1 },
  { source: "duckduckgo", medium: "organic", campaign: "(organic)", sessions: 22, keyEvents: 0 },
];

const traffic: R<typeof api.analytics.traffic> = {
  rows: TRAFFIC_ROWS,
  tupleCount: 24,
  totalSessions: sum(TRAFFIC_ROWS.map((r) => r.sessions)) + 96,
  totalKeyEvents: sum(TRAFFIC_ROWS.map((r) => r.keyEvents)) + 8,
};

// ── Akvizicija ───────────────────────────────────────────────────────────────

type ChannelRows = R<typeof api.analytics.acquisitionByChannel>["rows"];

const CHANNEL_ROWS: ChannelRows = (
  [
    ["Organic Search", 690, 640, 28, 1010, 640, 41],
    ["Direct", 410, 350, 12, 620, 330, 18],
    ["Organic Social", 330, 300, 21, 590, 360, 34],
    ["Paid Search", 160, 150, 15, 215, 130, 19],
    ["Referral", 120, 95, 8, 160, 95, 9],
    ["Email", 40, 12, 6, 61, 46, 7],
  ] as const
).map(([channel, fu, fnu, fke, s, es, ske]) => ({
  channel,
  firstUsers: fu,
  firstNewUsers: fnu,
  firstKeyEvents: fke,
  sessions: s,
  engagedSessions: es,
  engagementRate: es / s,
  sessionKeyEvents: ske,
  state: "value" as const,
}));

const acquisitionByChannel: R<typeof api.analytics.acquisitionByChannel> = (() => {
  const t = (f: (r: ChannelRows[number]) => number | undefined) =>
    sum(CHANNEL_ROWS.map((r) => f(r) ?? 0));
  const sessions = t((r) => r.sessions);
  const engaged = t((r) => r.engagedSessions);
  return {
    rows: [
      ...CHANNEL_ROWS,
      // Tanak red koji je Google sakrio zbog praga — nema brojeva.
      {
        channel: "Organic Video",
        firstUsers: undefined,
        firstNewUsers: undefined,
        firstKeyEvents: undefined,
        sessions: undefined,
        engagedSessions: undefined,
        engagementRate: undefined,
        sessionKeyEvents: undefined,
        state: "thresholded" as const,
      },
    ],
    totals: {
      firstUsers: t((r) => r.firstUsers),
      firstNewUsers: t((r) => r.firstNewUsers),
      firstKeyEvents: t((r) => r.firstKeyEvents),
      sessions,
      engagedSessions: engaged,
      engagementRate: rate(engaged, sessions),
      sessionKeyEvents: t((r) => r.sessionKeyEvents),
    },
    thresholdedDays: 2,
    reportMetaFirst: meta("acq_channel_first", { subjectToThresholding: true }),
    reportMetaSession: meta("acq_channel_session", { subjectToThresholding: true }),
  };
})();

// [izvor, medijum, noviKorisnici, ukupniKorisnici, sesije, angažovane, ključniDogađaji]
const SOURCE_BASE = [
  ["google", "organic", 540, 690, 812, 520, 41],
  ["(direct)", "(none)", 360, 440, 536, 290, 18],
  ["instagram", "social", 240, 300, 318, 205, 22],
  ["google", "cpc", 150, 170, 207, 124, 19],
  ["l.instagram.com", "referral", 120, 138, 164, 88, 9],
  ["m.facebook.com", "referral", 92, 106, 121, 70, 6],
  ["threads.net", "referral", 58, 66, 74, 49, 3],
  ["newsletter", "email", 12, 38, 61, 46, 7],
  ["example-partner.com", "referral", 40, 46, 52, 31, 4],
  ["youtube.com", "referral", 33, 38, 45, 24, 2],
  ["bing", "organic", 30, 33, 38, 22, 1],
  ["duckduckgo", "organic", 17, 19, 22, 11, 0],
] as const;

function acquisitionBySource(
  args: Record<string, unknown>,
): R<typeof api.analytics.acquisitionBySource> {
  const scope = args.scope === "first" ? "first" : "session";
  const rows = SOURCE_BASE.map(([source, medium, nu, tu, s, es, ke]) =>
    scope === "first"
      ? {
          source,
          medium,
          primaryValue: nu,
          secondaryValue: tu,
          keyEvents: ke,
          engagementRate: undefined,
        }
      : {
          source,
          medium,
          primaryValue: s,
          secondaryValue: es,
          keyEvents: ke,
          engagementRate: es / s,
        },
  );
  const reportKey = scope === "first" ? "acq_source_first" : "acq_source_session";
  return {
    scope,
    rows,
    pairCount: 19,
    totalPrimary: sum(rows.map((r) => r.primaryValue)) + (scope === "first" ? 61 : 96),
    totalSecondary: sum(rows.map((r) => r.secondaryValue)) + (scope === "first" ? 70 : 58),
    totalKeyEvents: sum(rows.map((r) => r.keyEvents)) + 8,
    thresholdedDays: 1,
    reportMeta: meta(reportKey, { dataLossFromOtherRow: true }),
  };
}

// ── Sadržaj ──────────────────────────────────────────────────────────────────

// [putanja, prikazi, korisnici, prosečno zadržavanje (s), ključni događaji]
const PAGE_BASE = [
  ["/", 2140, 1310, 48, 36],
  ["/usluge", 1180, 760, 71, 28],
  ["/cenovnik", 960, 640, 83, 31],
  ["/zakazivanje", 640, 470, 94, 44],
  ["/kontakt", 515, 390, 39, 22],
  ["/galerija", 470, 320, 66, 3],
  ["/o-nama", 330, 250, 58, 2],
  ["/blog/nega-lica-kod-kuce", 290, 241, 132, 5],
  ["/blog/trendovi-frizura-2026", 252, 204, 118, 4],
  ["/akcije", 214, 168, 52, 11],
  ["/blog/priprema-za-svadbu", 171, 139, 147, 6],
  ["/politika-privatnosti", 64, 55, 24, 0],
] as const;

const contentPages: R<typeof api.analytics.contentPages> = (() => {
  const rows = PAGE_BASE.map(([pagePath, v, u, d, ke]) => ({
    pagePath,
    screenPageViews: v,
    totalUsers: u,
    avgEngagementDuration: d,
    keyEvents: ke,
  }));
  const views = sum(rows.map((r) => r.screenPageViews)) + 310;
  return {
    rows,
    totals: {
      screenPageViews: views,
      totalUsers: 2840,
      avgEngagementDuration: 61,
      keyEvents: sum(rows.map((r) => r.keyEvents)) + 9,
    },
    pageCount: 31,
    thresholdedDays: 0,
    reportMeta: meta("content_pages"),
  };
})();

// [stranica, sesije, angažovane, ključni događaji]
const LANDING_BASE = [
  ["/", 1190, 702, 38],
  ["/usluge", 410, 262, 21],
  ["/cenovnik", 332, 215, 26],
  ["/akcije", 188, 99, 14],
  ["/blog/nega-lica-kod-kuce", 164, 128, 6],
  ["/zakazivanje", 121, 98, 24],
  ["/blog/trendovi-frizura-2026", 97, 69, 3],
  ["/galerija", 58, 25, 1],
  ["/kontakt", 41, 29, 5],
] as const;

const landingPages: R<typeof api.analytics.landingPages> = (() => {
  const rows = LANDING_BASE.map(([landingPage, s, es, ke]) => ({
    landingPage,
    sessions: s,
    engagedSessions: es,
    engagementRate: es / s,
    bounceRate: 1 - es / s,
    keyEvents: ke,
  }));
  const sessions = sum(rows.map((r) => r.sessions)) + 54;
  const engaged = sum(rows.map((r) => r.engagedSessions)) + 29;
  return {
    rows,
    totals: {
      sessions,
      engagedSessions: engaged,
      engagementRate: rate(engaged, sessions),
      bounceRate: 1 - rate(engaged, sessions),
      keyEvents: sum(rows.map((r) => r.keyEvents)) + 6,
    },
    pageCount: 17,
    thresholdedDays: 0,
    reportMeta: meta("landing_pages"),
  };
})();

// [događaj, broj, korisnici, vrednost, ključni?]
const EVENT_BASE = [
  ["page_view", 6410, 2840, 0, false],
  ["session_start", 2546, 2310, 0, false],
  ["user_engagement", 2290, 1620, 0, false],
  ["first_visit", 1730, 1730, 0, false],
  ["scroll", 1215, 940, 0, false],
  ["click", 884, 612, 0, false],
  ["form_start", 238, 190, 0, false],
  ["phone_click", 117, 96, 0, true],
  ["form_submit", 74, 69, 0, true],
  ["generate_lead", 58, 54, 5800, true],
  ["file_download", 33, 29, 0, false],
] as const;

const eventsByName: R<typeof api.analytics.eventsByName> = (() => {
  const rows = EVENT_BASE.map(([eventName, c, u, val, key]) => ({
    eventName,
    eventCount: c,
    totalUsers: u,
    eventValue: val,
    eventsPerUser: c / u,
    isKeyEvent: key,
  }));
  const count = sum(rows.map((r) => r.eventCount)) + 120;
  return {
    rows,
    totals: {
      eventCount: count,
      totalUsers: 2840,
      eventValue: sum(rows.map((r) => r.eventValue)),
      eventsPerUser: count / 2840,
    },
    eventTypesCount: 14,
    thresholdedDays: 0,
    reportMeta: meta("events"),
  };
})();

// ── Publika ──────────────────────────────────────────────────────────────────

function audienceDevice(
  args: Record<string, unknown>,
): R<typeof api.analytics.audienceDevice> {
  const rnd = lcg(61);
  const dates = keys(args);
  const series = dates.map((date, i) => {
    // Dva prazna dana (GA4 nije stigao da obradi / nije bilo poseta).
    if (i === 3 || i === 11) return { date, desktop: 0, mobile: 0, tablet: 0 };
    return {
      date,
      desktop: 14 + Math.round(rnd() * 18),
      mobile: 52 + Math.round(rnd() * 40),
      tablet: 2 + Math.round(rnd() * 5),
    };
  });
  const per = (k: "desktop" | "mobile" | "tablet", engaged: number, ke: number) => {
    const sessions = sum(series.map((p) => p[k]));
    return {
      deviceCategory: k,
      sessions,
      engagedSessions: Math.round(sessions * engaged),
      totalUsers: Math.round(sessions * 0.86),
      keyEvents: Math.round(sessions * ke),
      engagementRate: engaged,
    };
  };
  const rows = [per("mobile", 0.55, 0.05), per("desktop", 0.68, 0.07), per("tablet", 0.6, 0.04)];
  const sessions = sum(rows.map((r) => r.sessions));
  const engaged = sum(rows.map((r) => r.engagedSessions));
  return {
    series,
    rows,
    totals: {
      sessions,
      engagedSessions: engaged,
      totalUsers: sum(rows.map((r) => r.totalUsers)),
      keyEvents: sum(rows.map((r) => r.keyEvents)),
      engagementRate: rate(engaged, sessions),
    },
    thresholdedDays: 0,
    reportMeta: meta("audience_device"),
  };
}

const COUNTRY_BASE = [
  ["Serbia", 1980, 2210, 118],
  ["Bosnia & Herzegovina", 214, 241, 9],
  ["Montenegro", 132, 149, 6],
  ["Croatia", 118, 131, 4],
  ["Germany", 96, 108, 3],
  ["Austria", 74, 82, 3],
  ["Switzerland", 41, 46, 2],
  ["United States", 33, 38, 0],
] as const;

const CITY_BASE = [
  ["Belgrade", 1170, 1340, 74],
  ["Novi Sad", 286, 319, 17],
  ["Niš", 164, 183, 9],
  ["Kragujevac", 102, 114, 5],
  ["Subotica", 71, 79, 3],
  ["Čačak", 58, 64, 4],
  ["Pančevo", 52, 58, 2],
  ["Zemun", 47, 53, 3],
  ["Kraljevo", 39, 43, 1],
  ["Šabac", 31, 34, 1],
] as const;

function audienceGeo(
  args: Record<string, unknown>,
): R<typeof api.analytics.audienceGeo> {
  const level = args.level === "city" ? "city" : "country";
  const base = level === "city" ? CITY_BASE : COUNTRY_BASE;
  const rows = base.map(([name, users, sessions, ke]) => ({
    name,
    totalUsers: users,
    sessions,
    keyEvents: ke,
  }));
  const rest = level === "city" ? { u: 540, s: 610, k: 21 } : { u: 160, s: 178, k: 5 };
  return {
    level,
    rows,
    totals: {
      totalUsers: sum(rows.map((r) => r.totalUsers)) + rest.u,
      sessions: sum(rows.map((r) => r.sessions)) + rest.s,
      keyEvents: sum(rows.map((r) => r.keyEvents)) + rest.k,
    },
    itemCount: level === "city" ? 96 : 23,
    thresholdedDays: 0,
    reportMeta: meta(level === "city" ? "audience_city" : "audience_country"),
  };
}

type TimeData = R<typeof api.analytics.timeOfDay>;

/** Satna kriva (00-23h): jutarnji i večernji vrh, tiha noć. */
const HOUR_CURVE = [
  1, 0.5, 0.3, 0.2, 0.3, 0.8, 2, 4, 7, 10, 12, 12, 11, 10, 9, 9, 8, 9, 10, 12, 13, 11, 7, 3,
];
/** 0 = nedelja ... 6 = subota. */
const DAY_FACTOR = [0.75, 1.05, 1.1, 1, 1.05, 0.95, 0.8];

const timeOfDay: TimeData = (() => {
  const rnd = lcg(83);
  const matrix = DAY_FACTOR.map((f, day) =>
    HOUR_CURVE.map((c, hour) => {
      // Dve ćelije bez podatka (različito od "stigla nula").
      if ((day === 0 && hour === 4) || (day === 2 && hour === 3)) {
        return { sessions: 0, totalUsers: 0, hasData: false };
      }
      const sessions = Math.max(0, Math.round(c * f * (0.7 + rnd() * 0.6)));
      return { sessions, totalUsers: Math.round(sessions * 0.86), hasData: true };
    }),
  );
  const cells = matrix.flat();
  return {
    matrix,
    totals: {
      totalSessions: sum(cells.map((c) => c.sessions)),
      totalUsers: sum(cells.map((c) => c.totalUsers)),
      maxCellSessions: Math.max(...cells.map((c) => c.sessions)),
    },
    thresholdedDays: 0,
    timeZone: TZ,
    reportMeta: meta("time_of_day"),
  };
})();

// ── Uživo ────────────────────────────────────────────────────────────────────

function realtimeSnapshot(): R<typeof api.analytics.realtimeSnapshot> {
  const rnd = lcg(97);
  return {
    fetchedAt: now - 20_000,
    activeUsers: 14,
    byMinute: Array.from({ length: 30 }, (_, i) => ({
      minutesAgo: i,
      activeUsers: Math.max(0, 3 + Math.round(rnd() * 7) - (i > 24 ? 3 : 0)),
    })),
    byScreen: [
      { key: "Test Salon | Početna", value: 41 },
      { key: "Test Salon | Cenovnik", value: 27 },
      { key: "Test Salon | Usluge", value: 22 },
      { key: "Test Salon | Zakazivanje", value: 14 },
      { key: "Test Salon | Kontakt", value: 8 },
      { key: "Test Salon | Blog: Nega lica kod kuće", value: 5 },
    ],
    byCountry: [
      { key: "Serbia", value: 11 },
      { key: "Bosnia & Herzegovina", value: 2 },
      { key: "Germany", value: 1 },
    ],
    byDevice: [
      { key: "mobile", value: 10 },
      { key: "desktop", value: 3 },
      { key: "tablet", value: 1 },
    ],
    byEvent: [
      { key: "page_view", value: 118 },
      { key: "user_engagement", value: 64 },
      { key: "scroll", value: 33 },
      { key: "click", value: 21 },
      { key: "form_start", value: 4 },
    ],
    state: "value",
    error: undefined,
    ageSeconds: 20,
  };
}

// ── Retencija kohorti ────────────────────────────────────────────────────────

function dateKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

const cohortRetention: R<typeof api.analytics.cohortRetention> = (() => {
  // 8 nedeljnih kohorti, najstarija prva; svaka ima nth 0..(starost u nedeljama).
  const rnd = lcg(131);
  const WEEKS = 8;
  const cohorts = Array.from({ length: WEEKS }, (_, i) => {
    const age = WEEKS - 1 - i; // najnovija kohorta ima samo nth 0
    const startMs = now - (age + 1) * 7 * DAY;
    const cohortStartDate = dateKey(startMs);
    const totalUsers = 150 + Math.round(rnd() * 120);
    const points = Array.from({ length: Math.min(age, 11) + 1 }, (_, nth) => {
      // Najnovija kohorta koja ima nth 1 još je "thresholded" (premalo korisnika).
      if (nth === 1 && age === 1) {
        return { nth, state: "thresholded" as const };
      }
      const r = nth === 0 ? 1 : Math.max(0.03, 0.34 * Math.pow(0.78, nth - 1) * (0.85 + rnd() * 0.3));
      return {
        nth,
        activeUsers: Math.round(totalUsers * r),
        retention: Math.round(totalUsers * r) / totalUsers,
        state: "value" as const,
      };
    });
    return {
      cohortName: `w_${cohortStartDate}`,
      cohortStartDate,
      totalUsers,
      points,
    };
  });
  return { granularity: "WEEKLY", cohorts, thresholdedCount: 1 };
})();

// ── Google Ads u GA4 ─────────────────────────────────────────────────────────

/**
 * Jedini nalog u dinarima: Google Ads nalog koji GA4 vidi radi u RSD, pa ekran
 * Analitika → Oglasi nosi upozorenje da nalog radi u drugoj valuti (O16) i
 * iznosi ostaju u dinarima bez znaka €. Svi ostali izveštaji i nalozi u
 * razvojnom prikazu su u evrima. Zato su iznosi ispod pravi dinarski.
 */
const ADS_VALUTA = "RSD";

// [kampanja, ključna reč?, trošak (RSD), klikovi, prikazi, sesije, angažovane, ključni događaji]
const ADS_CAMPAIGNS = [
  ["Leto 2026 - Pretraga", undefined, 18400, 410, 11800, 380, 240, 19],
  ["Brend - Test Salon", undefined, 6200, 260, 2900, 251, 180, 11],
  ["Remarketing - Sajt", undefined, 9100, 190, 15200, 171, 96, 8],
  ["Akcija Jesen - Display", undefined, 4300, 150, 38000, 92, 41, 2],
] as const;

const ADS_KEYWORDS = [
  ["Leto 2026 - Pretraga", "frizerski salon beograd", 7900, 168, 4100, 156, 101, 8],
  ["Brend - Test Salon", "test salon", 3800, 171, 1500, 166, 121, 7],
  ["Leto 2026 - Pretraga", "šišanje zakazivanje", 5200, 119, 3600, 108, 70, 6],
  ["Leto 2026 - Pretraga", "feniranje cena", 3100, 74, 2400, 66, 38, 3],
  ["Brend - Test Salon", "test salon cenovnik", 1900, 61, 900, 58, 40, 3],
  ["Remarketing - Sajt", "farbanje kose beograd", 2700, 49, 1700, 44, 22, 2],
] as const;

function adsPerformance(
  args: Record<string, unknown>,
): R<typeof api.analytics.adsPerformance> {
  const level = args.level === "keyword" ? "keyword" : "campaign";
  // Prethodni period je blago slabiji, da delte na pločicama nisu ravne nuli.
  const f = tekuciPeriod(args) ? 1 : 0.82;
  const base = level === "keyword" ? ADS_KEYWORDS : ADS_CAMPAIGNS;
  const rows = base.map(([campaign, keyword, cost, clicks, imp, s, es, ke]) => ({
    campaign,
    keyword,
    cost: Math.round(cost * f),
    clicks: Math.round(clicks * f),
    impressions: Math.round(imp * f),
    sessions: Math.round(s * f),
    engagedSessions: Math.round(es * f),
    keyEvents: Math.round(ke * f),
    costPerClick: cost / clicks,
    costPerKeyEvent: cost / ke,
    sessionsPerClick: s / clicks,
  }));
  const tot = {
    cost: sum(rows.map((r) => r.cost)),
    clicks: sum(rows.map((r) => r.clicks)),
    impressions: sum(rows.map((r) => r.impressions)),
    sessions: sum(rows.map((r) => r.sessions)),
    engagedSessions: sum(rows.map((r) => r.engagedSessions)),
    keyEvents: sum(rows.map((r) => r.keyEvents)),
  };

  const rnd = lcg(149);
  const dates = keys(args);
  const w = dates.map((_, i) => (i === 5 || i === 17 ? 0 : 0.55 + rnd() * 0.9));
  const wSum = sum(w);
  const dailySeries = dates.map((date, i) => {
    const share = w[i] / wSum;
    return {
      date,
      cost: Math.round(tot.cost * share),
      clicks: Math.round(tot.clicks * share),
      impressions: Math.round(tot.impressions * share),
      sessions: Math.round(tot.sessions * share),
      engagedSessions: Math.round(tot.engagedSessions * share),
      keyEvents: Math.round(tot.keyEvents * share),
      state: "value" as const,
    };
  });

  return {
    level,
    rows,
    totals: {
      ...tot,
      costPerClick: rate(tot.cost, tot.clicks),
      costPerKeyEvent: rate(tot.cost, tot.keyEvents),
      sessionsPerClick: rate(tot.sessions, tot.clicks),
    },
    dailySeries,
    itemCount: level === "keyword" ? 41 : rows.length,
    thresholdedDays: 0,
    currencyCode: ADS_VALUTA,
    availability: "available",
    adsLinkStatus: "available",
    reportMeta: meta(level === "campaign" ? "ads_campaign" : "ads_keyword", {
      currencyCode: ADS_VALUTA,
    }),
  };
}

// ── Konfiguracija propertija i metapodaci ────────────────────────────────────

const ga4Configuration: R<typeof api.analytics.ga4Configuration> = {
  _id: "ga4c_ux_test_0000000000000" as Id<"ga4Config">,
  _creationTime: now - 30 * DAY,
  workspaceId: WS,
  propertyId: "000000000",
  fetchedAt: now - 2 * HOUR,
  displayName: "Test Salon (probni property)",
  timeZone: TZ,
  // Property je povezan sa dinarskim Google Ads nalogom (`ADS_VALUTA`), a GA4
  // trošak oglasa izveštava u valuti propertija.
  currencyCode: ADS_VALUTA,
  industryCategory: "BEAUTY_AND_FITNESS",
  serviceLevel: "GOOGLE_ANALYTICS_STANDARD",
  // ISO vreme, tačno kako ga vraća GA4 Admin API. Do B1 je ovde stajao samo
  // datum, jer je panel na ISO nisku pucao sa RangeError; sada fixture čuva
  // pravi oblik, pa snimak Podešavanja hvata povratak te greške.
  createTime: "2025-03-01T09:00:00Z",
  eventDataRetention: "FOURTEEN_MONTHS",
  resetUserDataOnNewActivity: true,
  keyEvents: [
    {
      eventName: "generate_lead",
      countingMethod: "ONCE_PER_EVENT",
      custom: true,
      createTime: "2025-03-04T11:20:00.123456Z",
    },
    { eventName: "form_submit", countingMethod: "ONCE_PER_EVENT", custom: true },
    { eventName: "phone_click", countingMethod: "ONCE_PER_SESSION", custom: true },
  ],
  customDimensions: [],
  customMetrics: [],
  dataStreams: [
    {
      displayName: "Test Salon web",
      type: "WEB_DATA_STREAM",
      measurementId: "G-TEST000000",
      defaultUri: "https://example.com",
    },
  ],
  googleAdsLinks: [
    {
      customerId: "000-000-0000",
      adsPersonalizationEnabled: true,
      createTime: "2025-04-10T08:00:00Z",
    },
  ],
  ageSeconds: 2 * 3600,
  ageHours: 2,
};

function reportMeta(
  args: Record<string, unknown>,
): R<typeof api.analytics.reportMeta> {
  const key = typeof args.reportKey === "string" ? args.reportKey : "daily";
  return meta(key, key.startsWith("ads_") ? { currencyCode: ADS_VALUTA } : {});
}

export const FIXTURES_ANALITIKA: Record<string, Fixture> = {
  [getFunctionName(api.analytics.traffic)]: () => traffic,
  [getFunctionName(api.analytics.reportMeta)]: reportMeta,
  [getFunctionName(api.analytics.ga4Configuration)]: () => ga4Configuration,
  [getFunctionName(api.analytics.acquisitionByChannel)]: () => acquisitionByChannel,
  [getFunctionName(api.analytics.acquisitionBySource)]: acquisitionBySource,
  [getFunctionName(api.analytics.contentPages)]: () => contentPages,
  [getFunctionName(api.analytics.landingPages)]: () => landingPages,
  [getFunctionName(api.analytics.eventsByName)]: () => eventsByName,
  [getFunctionName(api.analytics.audienceDevice)]: audienceDevice,
  [getFunctionName(api.analytics.audienceGeo)]: audienceGeo,
  [getFunctionName(api.analytics.timeOfDay)]: () => timeOfDay,
  [getFunctionName(api.analytics.realtimeSnapshot)]: realtimeSnapshot,
  [getFunctionName(api.analytics.cohortRetention)]: () => cohortRetention,
  [getFunctionName(api.analytics.adsPerformance)]: adsPerformance,
};

// ── Prazan nalog ─────────────────────────────────────────────────────────────

const PRAZNO_META = (key: string) =>
  meta(key, {
    emptyReason: "GA4 nije vratio nijedan red za izabrani period.",
  });

const zeroSources = (
  scope: "first" | "session",
): R<typeof api.analytics.acquisitionBySource> => ({
  scope,
  rows: [],
  pairCount: 0,
  totalPrimary: 0,
  totalSecondary: 0,
  totalKeyEvents: 0,
  thresholdedDays: 0,
  reportMeta: PRAZNO_META(scope === "first" ? "acq_source_first" : "acq_source_session"),
});

export const PRAZNO_ANALITIKA: Record<string, Fixture> = {
  [getFunctionName(api.analytics.traffic)]: (): R<typeof api.analytics.traffic> => ({
    rows: [],
    tupleCount: 0,
    totalSessions: 0,
    totalKeyEvents: 0,
  }),
  [getFunctionName(api.analytics.reportMeta)]: (
    args,
  ): R<typeof api.analytics.reportMeta> =>
    PRAZNO_META(typeof args.reportKey === "string" ? args.reportKey : "daily"),
  [getFunctionName(api.analytics.ga4Configuration)]: (): R<
    typeof api.analytics.ga4Configuration
  > => null,
  [getFunctionName(api.analytics.acquisitionByChannel)]: (): R<
    typeof api.analytics.acquisitionByChannel
  > => ({
    rows: [],
    totals: {
      firstUsers: 0,
      firstNewUsers: 0,
      firstKeyEvents: 0,
      sessions: 0,
      engagedSessions: 0,
      engagementRate: 0,
      sessionKeyEvents: 0,
    },
    thresholdedDays: 0,
    reportMetaFirst: PRAZNO_META("acq_channel_first"),
    reportMetaSession: PRAZNO_META("acq_channel_session"),
  }),
  [getFunctionName(api.analytics.acquisitionBySource)]: (args) =>
    zeroSources(args.scope === "first" ? "first" : "session"),
  [getFunctionName(api.analytics.contentPages)]: (): R<
    typeof api.analytics.contentPages
  > => ({
    rows: [],
    totals: { screenPageViews: 0, totalUsers: 0, avgEngagementDuration: 0, keyEvents: 0 },
    pageCount: 0,
    thresholdedDays: 0,
    reportMeta: PRAZNO_META("content_pages"),
  }),
  [getFunctionName(api.analytics.landingPages)]: (): R<
    typeof api.analytics.landingPages
  > => ({
    rows: [],
    totals: { sessions: 0, engagedSessions: 0, engagementRate: 0, bounceRate: 0, keyEvents: 0 },
    pageCount: 0,
    thresholdedDays: 0,
    reportMeta: PRAZNO_META("landing_pages"),
  }),
  [getFunctionName(api.analytics.eventsByName)]: (): R<
    typeof api.analytics.eventsByName
  > => ({
    rows: [],
    totals: { eventCount: 0, totalUsers: 0, eventValue: 0, eventsPerUser: 0 },
    eventTypesCount: 0,
    thresholdedDays: 0,
    reportMeta: PRAZNO_META("events"),
  }),
  [getFunctionName(api.analytics.audienceDevice)]: (): R<
    typeof api.analytics.audienceDevice
  > => ({
    series: [],
    rows: [],
    totals: { sessions: 0, engagedSessions: 0, totalUsers: 0, keyEvents: 0, engagementRate: 0 },
    thresholdedDays: 0,
    reportMeta: PRAZNO_META("audience_device"),
  }),
  [getFunctionName(api.analytics.audienceGeo)]: (args): R<typeof api.analytics.audienceGeo> => ({
    level: args.level === "city" ? "city" : "country",
    rows: [],
    totals: { totalUsers: 0, sessions: 0, keyEvents: 0 },
    itemCount: 0,
    thresholdedDays: 0,
    reportMeta: PRAZNO_META(args.level === "city" ? "audience_city" : "audience_country"),
  }),
  [getFunctionName(api.analytics.timeOfDay)]: (): TimeData => ({
    matrix: Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ sessions: 0, totalUsers: 0, hasData: false })),
    ),
    totals: { totalSessions: 0, totalUsers: 0, maxCellSessions: 0 },
    thresholdedDays: 0,
    timeZone: TZ,
    reportMeta: PRAZNO_META("time_of_day"),
  }),
  [getFunctionName(api.analytics.realtimeSnapshot)]: (): R<
    typeof api.analytics.realtimeSnapshot
  > => null,
  [getFunctionName(api.analytics.cohortRetention)]: (): R<
    typeof api.analytics.cohortRetention
  > => ({ granularity: "WEEKLY", cohorts: [], thresholdedCount: 0 }),
  [getFunctionName(api.analytics.adsPerformance)]: (
    args,
  ): R<typeof api.analytics.adsPerformance> => ({
    level: args.level === "keyword" ? "keyword" : "campaign",
    rows: [],
    totals: {
      cost: 0,
      clicks: 0,
      impressions: undefined,
      sessions: 0,
      engagedSessions: undefined,
      keyEvents: 0,
      costPerClick: undefined,
      costPerKeyEvent: undefined,
      sessionsPerClick: undefined,
    },
    dailySeries: [],
    itemCount: 0,
    thresholdedDays: 0,
    currencyCode: undefined,
    availability: "blocked",
    adsLinkStatus: "unlinked",
    reportMeta: null,
  }),
};
