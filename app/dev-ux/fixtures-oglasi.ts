import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { LeadScore } from "@/convex/lib/leadScoring";
import { deriveRate } from "@/convex/lib/rates";
import {
  claudeProsek,
  kvalitetSajta,
  pojasKvaliteta,
} from "@/convex/lib/siteScore";
import {
  formatMatchType,
  formatQualityComponent,
  formatQualityScore,
} from "@/convex/lib/googleAdsFormat";
import { dateKeysBetween } from "@/lib/date-range";
import {
  DAY,
  HOUR,
  USER,
  WS,
  lcg,
  now,
  range,
  type Fixture,
  type R,
} from "./fixtures-util";

/**
 * Sintetički podaci za ekrane Oglasi (/ads), profil firme (/leadovi/<id>) i
 * Podešavanja (/settings) razvojnog prikaza.
 *
 * Sve je izmišljeno i očigledno lažno (`Test …`, `example.com`, `+381 60 000
 * 0000`). Nijedan URL slike nije spolja: sličice i snimci izostaju (`undefined`
 * / `null`), a ekran crta svoje prazno stanje za sliku.
 *
 * Oba oglasna naloga (Meta i Google) vode se u RSD, pa i zbirna valuta na
 * kontrolnoj tabli postoji. Kampanja „Nova, još bez potrošnje" je namerno sa
 * nula potrošnje: ona je slučaj „0,00 bez valute" (F11) — valuta mora da stoji
 * i uz nulu.
 *
 * `FIXTURES_OGLASI` ne dira `connections.list` (već ima aktivne `meta_ads` i
 * `google_ads`), niti `analytics.ga4Configuration`, `facebookStore.setupInfo`
 * i druge upite koje pokrivaju drugi fajlovi.
 */

/**
 * Firma čiji profil fixture opisuje. MORA biti jednaka `_id`-ju firme #2 iz
 * `LEADOVI` u `fixtures.ts` (`napraviLead(2)` → `lc_ux_test_002`); ovde je
 * prepisana jer `fixtures.ts` uvozi ovaj fajl (ciklus). Firma #2 je izabrana
 * jer ima sajt (`imaSajt: "da"`), kontakt osobu i temperaturu „hot", pa profil
 * ima sadržaj na svih šest jezičaka.
 */
export const LEAD_PROFIL_ID = "lc_ux_test_002";

const NISA_KOZMETICKI = "nc_ux_test_kozmeticki_00000" as Id<"niches">;

// ═════════════════════════════════════════════════════════════════════════════
// OGLASI
// ═════════════════════════════════════════════════════════════════════════════

type AdSpec = {
  key: string;
  name: string;
  status: string;
  hookLabel?: string;
  primaryText?: string;
  headline?: string;
  weight: number;
  video: boolean;
};

type SetSpec = {
  key: string;
  name: string;
  status: string;
  targeting?: string;
  dailyBudget?: number;
  ads: AdSpec[];
};

type CampSpec = {
  key: string;
  name: string;
  account: "meta" | "google";
  objective: string;
  status: string;
  dailyBudget?: number;
  searchImpressionShare?: number;
  priority: "hot" | "cold";
  /** Potrošnja po aktivnom danu, u valuti naloga. 0 = nijedan red uvida. */
  spendPerDay: number;
  cpm: number;
  ctr: number;
  /** Rezultata po kliku. */
  cvr: number;
  valuePerResult?: number;
  frequency: number;
  /** Udeo perioda u kome je kampanja trošila (pauzirana staje ranije). */
  activeShare: number;
  sets: SetSpec[];
};

const SPECS: CampSpec[] = [
  {
    key: "m1",
    name: "Test kampanja — Prolećna akcija",
    account: "meta",
    objective: "OUTCOME_SALES",
    status: "ACTIVE",
    dailyBudget: 3500,
    priority: "hot",
    spendPerDay: 3100,
    cpm: 620,
    ctr: 0.021,
    cvr: 0.045,
    valuePerResult: 4200,
    frequency: 1.8,
    activeShare: 1,
    sets: [
      {
        key: "s1",
        name: "Test set — Žene 25–44, Beograd",
        status: "ACTIVE",
        targeting: "Žene 25–44, Beograd +25 km, interesovanje: nega kose",
        dailyBudget: 2000,
        ads: [
          { key: "a1", name: "Test oglas — Pre i posle", status: "ACTIVE", hookLabel: "Hook A", primaryText: "Test tekst: pogledaj promenu za 40 minuta.", headline: "Zakaži termin", weight: 5, video: true },
          { key: "a2", name: "Test oglas — Cena", status: "ACTIVE", hookLabel: "Hook B", primaryText: "Test tekst: šišanje i feniranje od 2.500 RSD.", headline: "Pogledaj cenovnik", weight: 3, video: true },
          { key: "a3", name: "Test oglas — Pitanje", status: "PAUSED", hookLabel: "Hook C", primaryText: "Test tekst: kad si poslednji put bila kod frizera?", headline: "Zakaži termin", weight: 2, video: true },
        ],
      },
      {
        key: "s2",
        name: "Test set — Lookalike 1%",
        status: "ACTIVE",
        targeting: "Lookalike 1% (kupci), Srbija",
        dailyBudget: 1500,
        ads: [
          { key: "a1", name: "Test oglas — Statična slika", status: "ACTIVE", primaryText: "Test tekst: nova sezona, nove boje.", headline: "Saznaj više", weight: 3, video: false },
        ],
      },
    ],
  },
  {
    key: "m2",
    name: "Test kampanja — Poruke na Instagramu",
    account: "meta",
    objective: "OUTCOME_ENGAGEMENT",
    status: "ACTIVE",
    dailyBudget: 1200,
    priority: "hot",
    spendPerDay: 1050,
    cpm: 380,
    ctr: 0.034,
    cvr: 0.09,
    frequency: 2.3,
    activeShare: 1,
    sets: [
      {
        key: "s1",
        name: "Test set — Poruke, 18–35",
        status: "ACTIVE",
        targeting: "Svi polovi 18–35, Srbija",
        dailyBudget: 1200,
        ads: [
          { key: "a1", name: "Test oglas — Pošalji poruku", status: "ACTIVE", primaryText: "Test tekst: pošalji nam poruku za slobodan termin.", headline: "Pošalji poruku", weight: 3, video: false },
          { key: "a2", name: "Test oglas — Reel iz salona", status: "ACTIVE", primaryText: "Test tekst: pogledaj kako radimo.", headline: "Pošalji poruku", weight: 2, video: true },
        ],
      },
    ],
  },
  {
    key: "m3",
    name: "Test kampanja — Jesenja ponuda (pauzirana)",
    account: "meta",
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",
    dailyBudget: 800,
    priority: "cold",
    spendPerDay: 760,
    cpm: 450,
    ctr: 0.016,
    cvr: 0.022,
    valuePerResult: 3600,
    frequency: 1.4,
    activeShare: 0.4,
    sets: [
      {
        key: "s1",
        name: "Test set — Retargeting posetioca",
        status: "PAUSED",
        targeting: "Posetioci sajta, 30 dana",
        dailyBudget: 800,
        ads: [
          { key: "a1", name: "Test oglas — Jesenji popust", status: "PAUSED", primaryText: "Test tekst: jesenji popust na farbanje.", headline: "Iskoristi popust", weight: 1, video: false },
        ],
      },
    ],
  },
  {
    key: "m4",
    name: "Test kampanja — Nova, još bez potrošnje",
    account: "meta",
    objective: "OUTCOME_LEADS",
    status: "ACTIVE",
    dailyBudget: 1000,
    priority: "cold",
    spendPerDay: 0,
    cpm: 0,
    ctr: 0,
    cvr: 0,
    frequency: 1,
    activeShare: 1,
    sets: [
      {
        key: "s1",
        name: "Test set — Nov, u fazi učenja",
        status: "ACTIVE",
        targeting: "Žene 30–55, Beograd",
        dailyBudget: 1000,
        ads: [
          { key: "a1", name: "Test oglas — Prijava za savet", status: "ACTIVE", primaryText: "Test tekst: besplatan savet o nezi kose.", headline: "Prijavi se", weight: 1, video: false },
        ],
      },
    ],
  },
  {
    key: "g1",
    name: "Test Google — Pretraga, brend",
    account: "google",
    objective: "SEARCH",
    status: "ACTIVE",
    dailyBudget: 1500,
    searchImpressionShare: 0.62,
    priority: "hot",
    spendPerDay: 1300,
    cpm: 2800,
    ctr: 0.062,
    cvr: 0.08,
    valuePerResult: 3800,
    frequency: 1,
    activeShare: 1,
    sets: [
      {
        key: "s1",
        name: "Test grupa — Brend",
        status: "ENABLED",
        dailyBudget: 900,
        ads: [
          { key: "a1", name: "Test tekstualni oglas — Brend", status: "ENABLED", headline: "Test Salon | Zakaži termin", primaryText: "Test opis: frizerski salon u Beogradu.", weight: 3, video: false },
        ],
      },
      {
        key: "s2",
        name: "Test grupa — Usluge",
        status: "ENABLED",
        dailyBudget: 600,
        ads: [
          { key: "a1", name: "Test tekstualni oglas — Usluge", status: "ENABLED", headline: "Šišanje i farbanje | Beograd", primaryText: "Test opis: cenovnik i slobodni termini.", weight: 2, video: false },
        ],
      },
    ],
  },
  {
    key: "g2",
    name: "Test Google — Performance Max (pauzirana)",
    account: "google",
    objective: "PERFORMANCE_MAX",
    status: "PAUSED",
    dailyBudget: 700,
    priority: "cold",
    spendPerDay: 620,
    cpm: 1900,
    ctr: 0.028,
    cvr: 0.035,
    valuePerResult: 3500,
    frequency: 1,
    activeShare: 0.5,
    sets: [
      {
        key: "s1",
        name: "Test grupa sredstava — Salon",
        status: "PAUSED",
        ads: [
          { key: "a1", name: "Test oglas — Performance Max", status: "PAUSED", headline: "Test Salon", weight: 1, video: false },
        ],
      },
    ],
  },
];

type RAccount = Doc<"adAccounts">;
type RCamp = {
  id: Id<"adCampaigns">;
  ext: string;
  spec: CampSpec;
  account: RAccount;
  sets: RSet[];
};
type RSet = {
  id: Id<"adSets">;
  ext: string;
  spec: SetSpec;
  camp: RCamp;
  ads: RAd[];
};
type RAd = {
  id: Id<"ads">;
  ext: string;
  spec: AdSpec;
  set: RSet;
};

const SYNCED = now - 3 * HOUR;

const ACCOUNT_META: RAccount = {
  _id: "adacc_ux_meta_0000000000" as Id<"adAccounts">,
  _creationTime: now - 45 * DAY,
  workspaceId: WS,
  provider: "meta_ads",
  externalId: "act_000000000",
  name: "Test Salon — Meta nalog",
  currency: "RSD",
  syncedAt: SYNCED,
};

const ACCOUNT_GOOGLE: RAccount = {
  _id: "adacc_ux_google_00000000" as Id<"adAccounts">,
  _creationTime: now - 45 * DAY,
  workspaceId: WS,
  provider: "google_ads",
  externalId: "000-000-0000",
  name: "Test Salon — Google nalog",
  currency: "RSD",
  syncedAt: SYNCED,
};

const ACCOUNTS: RAccount[] = [ACCOUNT_META, ACCOUNT_GOOGLE];

const CAMPS: RCamp[] = SPECS.map((spec, ci) => {
  const camp: RCamp = {
    id: `adcamp_ux_${spec.key}` as Id<"adCampaigns">,
    ext: `${spec.account === "meta" ? "12000000000" : "20000000"}${String(ci + 1).padStart(4, "0")}`,
    spec,
    account: spec.account === "meta" ? ACCOUNT_META : ACCOUNT_GOOGLE,
    sets: [],
  };
  camp.sets = spec.sets.map((setSpec, si) => {
    const set: RSet = {
      id: `adset_ux_${spec.key}_${setSpec.key}` as Id<"adSets">,
      ext: `${camp.ext}${String(si + 1).padStart(2, "0")}`,
      spec: setSpec,
      camp,
      ads: [],
    };
    set.ads = setSpec.ads.map((adSpec, ai) => ({
      id: `ad_ux_${spec.key}_${setSpec.key}_${adSpec.key}_${ai}` as Id<"ads">,
      ext: `${set.ext}${String(ai + 1).padStart(2, "0")}`,
      spec: adSpec,
      set,
    }));
    return set;
  });
  return camp;
});

const ALL_SETS: RSet[] = CAMPS.flatMap((c) => c.sets);
const ALL_ADS: RAd[] = ALL_SETS.flatMap((s) => s.ads);

const r2 = (n: number) => Number(n.toFixed(2));
const r4 = (n: number) => Number(n.toFixed(4));

type Day = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  video3s: number;
  thruplay: number;
};

type Agg = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number | undefined;
  results: number | undefined;
  conversionValue: number | undefined;
  video3s: number | undefined;
  thruplay: number | undefined;
  videoP25: number | undefined;
  videoP50: number | undefined;
  videoP75: number | undefined;
  videoP95: number | undefined;
  videoP100: number | undefined;
  days: Day[];
};

function opt(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function sumAgg(list: Agg[], dates: string[]): Agg {
  const out: Agg = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: undefined,
    results: undefined,
    conversionValue: undefined,
    video3s: undefined,
    thruplay: undefined,
    videoP25: undefined,
    videoP50: undefined,
    videoP75: undefined,
    videoP95: undefined,
    videoP100: undefined,
    days: dates.map((date) => ({
      date,
      spend: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      video3s: 0,
      thruplay: 0,
    })),
  };
  for (const a of list) {
    out.spend += a.spend;
    out.impressions += a.impressions;
    out.clicks += a.clicks;
    out.reach = opt(out.reach, a.reach);
    out.results = opt(out.results, a.results);
    out.conversionValue = opt(out.conversionValue, a.conversionValue);
    out.video3s = opt(out.video3s, a.video3s);
    out.thruplay = opt(out.thruplay, a.thruplay);
    out.videoP25 = opt(out.videoP25, a.videoP25);
    out.videoP50 = opt(out.videoP50, a.videoP50);
    out.videoP75 = opt(out.videoP75, a.videoP75);
    out.videoP95 = opt(out.videoP95, a.videoP95);
    out.videoP100 = opt(out.videoP100, a.videoP100);
    a.days.forEach((d, i) => {
      const t = out.days[i];
      t.spend += d.spend;
      t.impressions += d.impressions;
      t.clicks += d.clicks;
      t.results += d.results;
      t.video3s += d.video3s;
      t.thruplay += d.thruplay;
    });
  }
  return out;
}

const aggCache = new Map<string, Agg>();

function adAgg(ad: RAd, dates: string[]): Agg {
  const key = `${ad.id}|${dates[0]}|${dates[dates.length - 1]}`;
  const cached = aggCache.get(key);
  if (cached) return cached;

  const camp = ad.set.camp.spec;
  const google = camp.account === "google";
  const totalWeight = ad.set.camp.sets
    .flatMap((s) => s.ads)
    .reduce((n, a) => n + a.spec.weight, 0);
  const share = ad.spec.weight / totalWeight;
  const zero = camp.spendPerDay === 0;
  const activeDays = Math.round(dates.length * camp.activeShare);
  const rnd = lcg(
    ad.id.split("").reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7),
  );

  let reach = 0;
  let video3s = 0;
  let thruplay = 0;
  let value = 0;
  const days: Day[] = dates.map((date, i) => {
    const noise = 0.75 + rnd() * 0.5;
    const spend = zero || i >= activeDays ? 0 : camp.spendPerDay * share * noise;
    const impressions = spend > 0 ? Math.round((spend / camp.cpm) * 1000 * (0.92 + rnd() * 0.16)) : 0;
    const clicks = Math.round(impressions * camp.ctr * (0.85 + rnd() * 0.3));
    const results = Math.round(clicks * camp.cvr * (0.7 + rnd() * 0.6));
    const v3 = ad.spec.video && !google ? Math.round(impressions * 0.31 * (0.9 + rnd() * 0.2)) : 0;
    const tp = Math.round(v3 * 0.42 * (0.9 + rnd() * 0.2));
    reach += google ? 0 : Math.round(impressions / camp.frequency);
    video3s += v3;
    thruplay += tp;
    value += results * (camp.valuePerResult ?? 0);
    return { date, spend: r2(spend), impressions, clicks, results, video3s: v3, thruplay: tp };
  });

  const total = days.reduce(
    (t, d) => ({
      spend: t.spend + d.spend,
      impressions: t.impressions + d.impressions,
      clicks: t.clicks + d.clicks,
      results: t.results + d.results,
    }),
    { spend: 0, impressions: 0, clicks: 0, results: 0 },
  );

  const hasVideo = ad.spec.video && !google && !zero;
  const agg: Agg = {
    spend: r2(total.spend),
    impressions: total.impressions,
    clicks: total.clicks,
    reach: zero || google ? undefined : reach,
    results: zero ? undefined : total.results,
    conversionValue: zero || camp.valuePerResult === undefined ? undefined : r2(value),
    video3s: hasVideo ? video3s : undefined,
    thruplay: hasVideo ? thruplay : undefined,
    videoP25: hasVideo ? Math.round(thruplay * 1.9) : undefined,
    videoP50: hasVideo ? Math.round(thruplay * 1.3) : undefined,
    videoP75: hasVideo ? Math.round(thruplay * 0.8) : undefined,
    videoP95: hasVideo ? Math.round(thruplay * 0.5) : undefined,
    videoP100: hasVideo ? Math.round(thruplay * 0.4) : undefined,
    days,
  };
  aggCache.set(key, agg);
  return agg;
}

const setAgg = (set: RSet, dates: string[]) => sumAgg(set.ads.map((a) => adAgg(a, dates)), dates);
const campAgg = (camp: RCamp, dates: string[]) => sumAgg(camp.sets.map((s) => setAgg(s, dates)), dates);

/** Izvedene mere istim redosledom i zaokruživanjem kao pravi upiti. */
function derived(a: Agg) {
  const ctr = a.impressions > 0 ? a.clicks / a.impressions : 0;
  const cpc = a.clicks > 0 ? a.spend / a.clicks : 0;
  const cpm = a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0;
  const frequency = a.reach !== undefined && a.reach > 0 ? a.impressions / a.reach : 1;
  const cpa = deriveRate(a.spend, a.results);
  const roas = deriveRate(a.conversionValue, a.spend);
  const hookRate = deriveRate(a.video3s, a.impressions);
  const holdRate = deriveRate(a.thruplay, a.video3s);
  return {
    ctr: r4(ctr),
    cpc: r2(cpc),
    cpm: r2(cpm),
    frequency: r2(frequency),
    costPerResult: cpa !== undefined ? r2(cpa) : undefined,
    roas: roas !== undefined ? r2(roas) : undefined,
    hookRate: hookRate !== undefined ? r4(hookRate) : undefined,
    holdRate: holdRate !== undefined ? r4(holdRate) : undefined,
    conversionValue: a.conversionValue !== undefined ? r2(a.conversionValue) : undefined,
    hasConversionValue: a.conversionValue !== undefined && a.conversionValue > 0,
  };
}

function datesFrom(args: Record<string, unknown>): string[] {
  const from = typeof args.from === "string" ? args.from : range.from;
  const to = typeof args.to === "string" ? args.to : range.to;
  return dateKeysBetween(from, to);
}

const campById = (id: unknown) => CAMPS.find((c) => c.id === id);
const setById = (id: unknown) => ALL_SETS.find((s) => s.id === id);
const adById = (id: unknown) => ALL_ADS.find((a) => a.id === id);

// ── getCampaignsReport ───────────────────────────────────────────────────────

function campaignsReport(args: Record<string, unknown>): R<typeof api.metaAdsStore.getCampaignsReport> {
  const dates = datesFrom(args);
  const rows = CAMPS.map((camp) => {
    const a = campAgg(camp, dates);
    const d = derived(a);
    return {
      _id: camp.id,
      externalId: camp.ext,
      name: camp.spec.name,
      provider: camp.account.provider,
      accountName: camp.account.name,
      currency: camp.account.currency,
      objective: camp.spec.objective,
      status: camp.spec.status,
      dailyBudget: camp.spec.dailyBudget,
      lifetimeBudget: undefined,
      searchImpressionShare: camp.spec.searchImpressionShare,
      syncPriority: camp.spec.priority,
      syncedAt: SYNCED,
      spend: r2(a.spend),
      impressions: a.impressions,
      reach: a.reach,
      clicks: a.clicks,
      results: a.results,
      conversionValue: d.conversionValue,
      costPerResult: d.costPerResult,
      roas: d.roas,
      hasConversionValue: d.hasConversionValue,
      ctr: d.ctr,
      cpc: d.cpc,
      cpm: d.cpm,
      frequency: d.frequency,
      video3s: a.video3s,
      thruplay: a.thruplay,
      dailySpend: a.days.map((day) => ({ date: day.date, spend: r2(day.spend) })),
      adSetsCount: camp.sets.length,
      adsCount: camp.sets.reduce((n, s) => n + s.ads.length, 0),
    };
  });
  const all = sumAgg(CAMPS.map((c) => campAgg(c, dates)), dates);
  const d = derived(all);
  return {
    campaigns: rows,
    totals: {
      totalSpend: r2(all.spend),
      totalImpressions: all.impressions,
      totalClicks: all.clicks,
      totalResults: all.results,
      totalConversionValue: d.conversionValue,
      overallCpa: d.costPerResult,
      overallRoas: d.roas,
      hasConversionValue: d.hasConversionValue,
      overallCtr: d.ctr,
      overallFrequency: d.frequency,
      campaignsCount: CAMPS.length,
      currency: "RSD",
    },
  };
}

// ── getCampaignHierarchy ─────────────────────────────────────────────────────

function campaignHierarchy(args: Record<string, unknown>): R<typeof api.metaAdsStore.getCampaignHierarchy> {
  const camp = campById(args.campaignId);
  if (!camp) return null;
  const dates = datesFrom(args);
  const ca = campAgg(camp, dates);
  const cd = derived(ca);
  return {
    campaign: {
      _id: camp.id,
      externalId: camp.ext,
      name: camp.spec.name,
      provider: camp.account.provider,
      accountName: camp.account.name,
      objective: camp.spec.objective,
      status: camp.spec.status,
      dailyBudget: camp.spec.dailyBudget,
      lifetimeBudget: undefined,
      searchImpressionShare: camp.spec.searchImpressionShare,
      syncPriority: camp.spec.priority,
      syncedAt: SYNCED,
      spend: r2(ca.spend),
      impressions: ca.impressions,
      reach: ca.reach,
      clicks: ca.clicks,
      results: ca.results,
      conversionValue: cd.conversionValue,
      costPerResult: cd.costPerResult,
      roas: cd.roas,
      hasConversionValue: cd.hasConversionValue,
      ctr: cd.ctr,
      frequency: cd.frequency,
      video3s: ca.video3s,
      thruplay: ca.thruplay,
      currency: camp.account.currency,
    },
    adSets: camp.sets.map((set) => {
      const sa = setAgg(set, dates);
      const sd = derived(sa);
      return {
        _id: set.id,
        externalId: set.ext,
        name: set.spec.name,
        status: set.spec.status,
        targetingSummary: set.spec.targeting,
        dailyBudget: set.spec.dailyBudget,
        lifetimeBudget: undefined,
        syncedAt: SYNCED,
        spend: r2(sa.spend),
        impressions: sa.impressions,
        reach: sa.reach,
        clicks: sa.clicks,
        results: sa.results,
        conversionValue: sd.conversionValue,
        costPerResult: sd.costPerResult,
        roas: sd.roas,
        hasConversionValue: sd.hasConversionValue,
        ctr: sd.ctr,
        frequency: sd.frequency,
        ads: set.ads.map((ad) => {
          const aa = adAgg(ad, dates);
          const ad_ = derived(aa);
          return {
            _id: ad.id,
            externalId: ad.ext,
            name: ad.spec.name,
            status: ad.spec.status,
            hookLabel: ad.spec.hookLabel,
            creativeId: `cr_${ad.ext}`,
            thumbnailUrl: undefined,
            previewUrl: undefined,
            syncedAt: SYNCED,
            spend: r2(aa.spend),
            impressions: aa.impressions,
            reach: aa.reach,
            clicks: aa.clicks,
            results: aa.results,
            conversionValue: ad_.conversionValue,
            costPerResult: ad_.costPerResult,
            roas: ad_.roas,
            hasConversionValue: ad_.hasConversionValue,
            ctr: ad_.ctr,
            cpc: ad_.cpc,
            cpm: ad_.cpm,
            frequency: ad_.frequency,
            video3s: aa.video3s,
            thruplay: aa.thruplay,
            hookRate: ad_.hookRate,
            holdRate: ad_.holdRate,
            qualityRanking: aa.spend > 0 ? "AVERAGE" : ad.spec.status,
            engagementRanking: aa.spend > 0 ? "ABOVE_AVERAGE_35" : undefined,
            conversionRanking: aa.spend > 0 ? "AVERAGE" : undefined,
            dailySpend: aa.days.map((day) => ({ date: day.date, spend: r2(day.spend) })),
          };
        }),
      };
    }),
  };
}

// ── getAdDrilldown ───────────────────────────────────────────────────────────

const STANDARD_AGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const AGE_SHARE = [0.12, 0.3, 0.27, 0.18, 0.09, 0.04];
const HOUR_SHARE = [
  0.01, 0.005, 0.005, 0.005, 0.01, 0.02, 0.035, 0.05, 0.06, 0.06, 0.055, 0.055,
  0.06, 0.055, 0.05, 0.05, 0.055, 0.06, 0.07, 0.08, 0.075, 0.055, 0.03, 0.015,
];
const PLACEMENTS: { platform: string; placement: string; share: number }[] = [
  { platform: "facebook", placement: "feed", share: 0.34 },
  { platform: "instagram", placement: "feed", share: 0.28 },
  { platform: "instagram", placement: "story", share: 0.2 },
  { platform: "instagram", placement: "reels", share: 0.18 },
];

function adDrilldown(args: Record<string, unknown>): R<typeof api.metaAdsStore.getAdDrilldown> {
  const ad = adById(args.adId);
  if (!ad) return null;
  const dates = datesFrom(args);
  const a = adAgg(ad, dates);
  const d = derived(a);
  const camp = ad.set.camp;
  const google = camp.spec.account === "google";
  const hot = camp.spec.priority === "hot" && a.spend > 0;

  const cell = (share: number) => {
    const spend = a.spend * share;
    const impressions = Math.round(a.impressions * share);
    const clicks = Math.round(a.clicks * share);
    const results = Math.round((a.results ?? 0) * share);
    return {
      spend: r2(spend),
      impressions,
      clicks,
      results,
      ctr: impressions > 0 ? clicks / impressions : 0,
    };
  };

  const ageGenderMatrix = STANDARD_AGES.map((age, i) => {
    const f = cell(AGE_SHARE[i] * 0.62);
    const m = cell(AGE_SHARE[i] * 0.33);
    const u = cell(AGE_SHARE[i] * 0.05);
    const impressions = f.impressions + m.impressions + u.impressions;
    const clicks = f.clicks + m.clicks + u.clicks;
    return {
      age,
      female: f,
      male: m,
      unknown: u,
      total: {
        spend: r2(f.spend + m.spend + u.spend),
        impressions,
        clicks,
        results: f.results + m.results + u.results,
        ctr: impressions > 0 ? clicks / impressions : 0,
      },
    };
  });

  const placementList = google || a.spend === 0
    ? []
    : PLACEMENTS.map((p) => {
        const c = cell(p.share);
        const cpa = deriveRate(c.spend, c.results);
        return {
          placement: p.placement,
          platform: p.platform,
          spend: c.spend,
          impressions: c.impressions,
          clicks: c.clicks,
          results: c.results,
          ctr: r4(c.ctr),
          cpc: c.clicks > 0 ? r2(c.spend / c.clicks) : 0,
          cpa: cpa !== undefined ? r2(cpa) : undefined,
        };
      });

  return {
    ad: {
      _id: ad.id,
      externalId: ad.ext,
      name: ad.spec.name,
      status: ad.spec.status,
      hookLabel: ad.spec.hookLabel,
      creativeId: `cr_${ad.ext}`,
      thumbnailUrl: undefined,
      previewUrl: undefined,
      syncedAt: SYNCED,
    },
    adSet: {
      _id: ad.set.id,
      name: ad.set.spec.name,
      status: ad.set.spec.status,
      targetingSummary: ad.set.spec.targeting,
      dailyBudget: ad.set.spec.dailyBudget,
    },
    campaign: {
      _id: camp.id,
      name: camp.spec.name,
      objective: camp.spec.objective,
      status: camp.spec.status,
      syncPriority: camp.spec.priority,
      syncedAt: SYNCED,
    },
    coreMetrics: {
      spend: r2(a.spend),
      impressions: a.impressions,
      reach: a.reach,
      frequency: d.frequency,
      clicks: a.clicks,
      ctr: d.ctr,
      uniqueCtr: a.spend > 0 ? r4(d.ctr * 0.82) : undefined,
      cpc: d.cpc,
      cpm: d.cpm,
      cpp: a.reach !== undefined && a.reach > 0 ? r2((a.spend / a.reach) * 1000) : undefined,
      results: a.results,
      costPerResult: d.costPerResult,
      conversionValue: d.conversionValue,
      roas: d.roas,
      hasConversionValue: d.hasConversionValue,
      outboundCtr: a.spend > 0 && !google ? r4(d.ctr * 0.7) : undefined,
    },
    videoFunnel: {
      impressions: a.impressions,
      video3s: a.video3s,
      thruplay: a.thruplay,
      hookRate: d.hookRate,
      holdRate: d.holdRate,
      videoP25: a.videoP25,
      videoP50: a.videoP50,
      videoP75: a.videoP75,
      videoP95: a.videoP95,
      videoP100: a.videoP100,
    },
    rankings: {
      qualityRanking: a.spend > 0 ? "AVERAGE" : undefined,
      engagementRanking: a.spend > 0 ? "ABOVE_AVERAGE_35" : undefined,
      conversionRanking: a.spend > 0 ? "AVERAGE" : undefined,
    },
    dailySeries: a.days.map((day) => ({
      date: day.date,
      spend: r2(day.spend),
      impressions: day.impressions,
      clicks: day.clicks,
      results: day.results,
      video3s: day.video3s,
      thruplay: day.thruplay,
    })),
    hourlySeries: HOUR_SHARE.map((share, hour) => {
      const f = hot ? share : 0;
      return {
        hour,
        spend: r2(a.spend * f),
        impressions: Math.round(a.impressions * f),
        clicks: Math.round(a.clicks * f),
        results: Math.round((a.results ?? 0) * f),
      };
    }),
    hasHourlyData: hot,
    ageGenderMatrix,
    placementList,
    provider: camp.account.provider,
    currency: camp.account.currency,
    accountId: camp.account._id,
    searchImpressionShare: camp.spec.searchImpressionShare,
  };
}

// ── getHookBattle / listPinnedBattles ────────────────────────────────────────

const BATTLE_SET = ALL_SETS.find((s) => s.id === "adset_ux_m1_s1")!;

function hookBattle(args: Record<string, unknown>): R<typeof api.metaAdsStore.getHookBattle> {
  const set = setById(args.adSetId);
  if (!set) return null;
  const dates = datesFrom(args);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const camp = set.camp;
  return {
    adSet: {
      _id: set.id,
      externalId: set.ext,
      name: set.spec.name,
      status: set.spec.status,
      targetingSummary: set.spec.targeting,
      dailyBudget: set.spec.dailyBudget,
    },
    campaign: {
      _id: camp.id,
      externalId: camp.ext,
      name: camp.spec.name,
      objective: camp.spec.objective,
      status: camp.spec.status,
      accountId: camp.account._id,
    },
    currency: camp.account.currency,
    from,
    to,
    isPinned: set.id === BATTLE_SET.id,
    pinnedId: set.id === BATTLE_SET.id ? ("pinbat_ux_0000000000" as Id<"pinnedBattles">) : undefined,
    versions: set.ads.map((ad) => {
      const a = adAgg(ad, dates);
      const d = derived(a);
      const pct = (n: number | undefined, base: number | undefined) =>
        base !== undefined && base > 0 && n !== undefined ? r4(n / base) : 0;
      return {
        _id: ad.id,
        externalId: ad.ext,
        name: ad.spec.name,
        displayName: ad.spec.hookLabel ?? ad.spec.name,
        hookLabel: ad.spec.hookLabel,
        primaryText: ad.spec.primaryText,
        headline: ad.spec.headline,
        status: ad.spec.status,
        creativeId: `cr_${ad.ext}`,
        thumbnailUrl: undefined,
        previewUrl: undefined,
        spend: r2(a.spend),
        impressions: a.impressions,
        reach: a.reach,
        clicks: a.clicks,
        results: a.results,
        conversionValue: d.conversionValue,
        costPerResult: d.costPerResult,
        roas: d.roas,
        hasConversionValue: d.hasConversionValue,
        ctr: d.ctr,
        cpc: d.cpc,
        cpm: d.cpm,
        frequency: d.frequency,
        video3s: a.video3s,
        thruplay: a.thruplay,
        hookRate: d.hookRate,
        holdRate: d.holdRate,
        videoRetention: {
          video3s: a.video3s,
          thruplay: a.thruplay,
          videoP25: a.videoP25,
          videoP50: a.videoP50,
          videoP75: a.videoP75,
          videoP95: a.videoP95,
          videoP100: a.videoP100,
          p25Pct: pct(a.videoP25, a.video3s),
          p50Pct: pct(a.videoP50, a.video3s),
          p75Pct: pct(a.videoP75, a.video3s),
          p100Pct: pct(a.videoP100, a.video3s),
        },
        dailySeries: a.days.map((day) => {
          const hr = deriveRate(day.video3s, day.impressions);
          return {
            date: day.date,
            spend: r2(day.spend),
            hookRate: hr !== undefined ? r4(hr) : undefined,
          };
        }),
      };
    }),
  };
}

const listPinnedBattles: R<typeof api.metaAdsStore.listPinnedBattles> = [
  {
    _id: "pinbat_ux_0000000000" as Id<"pinnedBattles">,
    adSetId: BATTLE_SET.id,
    from: range.from,
    to: range.to,
    name: "Test bitka — tri hook-a",
    pinnedAt: now - 2 * DAY,
    adSetName: BATTLE_SET.spec.name,
    campaignName: BATTLE_SET.camp.spec.name,
    campaignId: BATTLE_SET.camp.id,
    adsCount: BATTLE_SET.ads.length,
  },
];

// ── Nalozi, kontekst, objave, kreativi ───────────────────────────────────────

const listAccounts: R<typeof api.metaAdsStore.listAccounts> = ACCOUNTS;

function accountCurrency(args: Record<string, unknown>): R<typeof api.metaAdsStore.getAccountCurrency> {
  const key = args.accountId;
  if (!key) return null;
  const acc = ACCOUNTS.find((a) => a._id === key || a.externalId === key);
  return acc?.currency ?? null;
}

const creationContext: R<typeof api.metaAdsStore.getCreationContext> = {
  fbPageId: "000000000000001",
  fbPageName: "Test Salon stranica",
  igActorId: "00000000000000000",
  igHandle: "test.salon",
};

const pagePosts: R<typeof api.metaAdsStore.listPagePostsForCreative> = [
  {
    objectStoryId: "000000000000001_100000000000001",
    message: "Test objava: nova sezona u salonu, slobodni termini ove nedelje.",
    pictureUrl: null,
    permalink: "https://example.com/test-salon/posts/1",
    statusType: "added_photos",
    publishedAt: now - 2 * DAY,
  },
  {
    objectStoryId: "000000000000001_100000000000002",
    message: "Test objava: pogledajte našu promenu stila pre i posle.",
    pictureUrl: null,
    permalink: "https://example.com/test-salon/posts/2",
    statusType: "added_video",
    publishedAt: now - 6 * DAY,
  },
  {
    objectStoryId: "000000000000001_100000000000003",
    message: "Test objava: radno vreme za praznike.",
    pictureUrl: null,
    permalink: "https://example.com/test-salon/posts/3",
    statusType: "mobile_status_update",
    publishedAt: now - 11 * DAY,
  },
];

function adCreative(args: Record<string, unknown>): R<typeof api.metaAdsStore.getAdCreative> {
  const ad = adById(args.adId);
  if (!ad) return null;
  return {
    _id: `adcr_ux_${ad.ext}` as Id<"adCreatives">,
    _creationTime: now - 20 * DAY,
    workspaceId: WS,
    adId: ad.id,
    creativeId: `cr_${ad.ext}`,
    name: ad.spec.name,
    bodyText: ad.spec.primaryText,
    titleText: ad.spec.headline,
    callToActionType: "BOOK_TRAVEL",
    linkUrl: "https://test-salon.example/zakazivanje",
    syncedAt: SYNCED,
  };
}

// ── Publike ──────────────────────────────────────────────────────────────────

const listAudiences: R<typeof api.metaAdsStore.listAudiences> = (() => {
  const audiences: Doc<"adAudiences">[] = [
    {
      _id: "adaud_ux_0000000000001" as Id<"adAudiences">,
      _creationTime: now - 30 * DAY,
      workspaceId: WS,
      adAccountId: ACCOUNT_META._id,
      audienceId: "230000000000001",
      name: "Test publika — Posetioci sajta 30 dana",
      subtype: "WEBSITE",
      description: "Posetioci test sajta u poslednjih 30 dana.",
      approximateCountLower: 1000,
      approximateCountUpper: 1500,
      operationStatus: "Normal",
      deliveryStatus: "Ready",
      timeContentUpdated: now - 1 * DAY,
      retentionDays: 30,
      syncedAt: SYNCED,
    },
    {
      _id: "adaud_ux_0000000000002" as Id<"adAudiences">,
      _creationTime: now - 25 * DAY,
      workspaceId: WS,
      adAccountId: ACCOUNT_META._id,
      audienceId: "230000000000002",
      name: "Test publika — Angažovani na Instagramu",
      subtype: "ENGAGEMENT",
      approximateCountLower: 2000,
      approximateCountUpper: 3000,
      operationStatus: "Normal",
      deliveryStatus: "Ready",
      timeContentUpdated: now - 3 * DAY,
      retentionDays: 90,
      syncedAt: SYNCED,
    },
    {
      _id: "adaud_ux_0000000000003" as Id<"adAudiences">,
      _creationTime: now - 20 * DAY,
      workspaceId: WS,
      adAccountId: ACCOUNT_META._id,
      audienceId: "230000000000003",
      name: "Test publika — Lookalike 1% (kupci)",
      subtype: "LOOKALIKE",
      approximateCountLower: 40000,
      approximateCountUpper: 60000,
      operationStatus: "Normal",
      deliveryStatus: "Too small",
      timeContentUpdated: now - 5 * DAY,
      syncedAt: SYNCED,
    },
  ];
  return { audiences, count: audiences.length, syncedAt: SYNCED };
})();

const audienceTos: R<typeof api.metaAdsStore.getAudienceTos> = {
  status: "accepted",
  checkedAt: now - 1 * DAY,
  lastError: undefined,
  adAccountId: ACCOUNT_META._id,
  accountName: ACCOUNT_META.name,
  externalId: ACCOUNT_META.externalId,
};

// ── Kvota, CAPI ──────────────────────────────────────────────────────────────

const quotaStatus: R<typeof api.metaAdsStore.quotaStatus> = {
  state: "ok",
  peakPct: 34,
  fetchedAt: now - 20 * 60_000,
  tier: "standard_access",
  blockedUntil: undefined,
  callCount: 34,
  totalCpuTime: 12,
  totalTime: 9,
  appIdUtilPct: 6,
  accIdUtilPct: 4,
};

const capiStats: R<typeof api.metaCapiStore.getCapiStats> = {
  configured: true,
  nedostaje: [],
  sentCount: 118,
  pendingCount: 3,
  retryingCount: 1,
  rejectedCount: 2,
  recentRejected: [
    {
      _id: "capi_ux_0000000000001" as Id<"capiEvents">,
      eventName: "Lead",
      eventTime: Math.floor(now / 1000) - 2 * 86400,
      actionSource: "website",
      sourceKind: "link_redirect",
      rejectReason: "Nedostaje identitet za uparivanje (test).",
      attempts: 1,
      syncedAt: now - 2 * DAY,
    },
    {
      _id: "capi_ux_0000000000002" as Id<"capiEvents">,
      eventName: "Purchase",
      eventTime: Math.floor(now / 1000) - 4 * 86400,
      actionSource: "business_messaging",
      sourceKind: "openreply_conversion",
      rejectReason: "Događaj je stariji od 7 dana (test).",
      attempts: 3,
      syncedAt: now - 4 * DAY,
    },
  ],
};

// ── Radnje nad oglasima (dijalozi + istorija) ────────────────────────────────

function targetContext(args: Record<string, unknown>): R<typeof api.adActionsStore.getTargetContext> {
  const type = args.targetType;
  const id = args.targetId;
  const base = { targetType: (type === "adset" || type === "ad" ? type : "campaign") as "campaign" | "adset" | "ad", targetId: String(id) };
  if (type === "campaign") {
    const c = CAMPS.find((x) => x.ext === id);
    if (c) {
      return { ...base, name: c.spec.name, status: c.spec.status, dailyBudget: c.spec.dailyBudget, currency: c.account.currency, spendToday: r2(c.spec.spendPerDay * 0.6), accountName: c.account.name, provider: c.account.provider };
    }
  } else if (type === "adset") {
    const s = ALL_SETS.find((x) => x.ext === id);
    if (s) {
      return { ...base, name: s.spec.name, status: s.spec.status, dailyBudget: s.spec.dailyBudget, currency: s.camp.account.currency, spendToday: r2(s.camp.spec.spendPerDay * 0.3), accountName: s.camp.account.name, provider: s.camp.account.provider };
    }
  } else {
    const a = ALL_ADS.find((x) => x.ext === id);
    if (a) {
      return { ...base, name: a.spec.name, status: a.spec.status, dailyBudget: a.set.spec.dailyBudget, currency: a.set.camp.account.currency, spendToday: r2(a.set.camp.spec.spendPerDay * 0.15), accountName: a.set.camp.account.name, provider: a.set.camp.account.provider };
    }
  }
  return { ...base, name: String(id), status: "UNKNOWN", dailyBudget: undefined, currency: "", spendToday: 0, accountName: null, provider: null };
}

function adCreativeDetails(args: Record<string, unknown>): R<typeof api.adActionsStore.getAdCreativeDetails> {
  const ad = ALL_ADS.find((a) => a.ext === args.adExternalId);
  if (!ad) return null;
  return {
    _id: ad.id,
    externalId: ad.ext,
    name: ad.spec.name,
    status: ad.spec.status,
    hookLabel: ad.spec.hookLabel ?? null,
    primaryText: ad.spec.primaryText ?? null,
    headline: ad.spec.headline ?? null,
    thumbnailUrl: null,
    previewUrl: null,
    creativeId: `cr_${ad.ext}`,
    adSetId: ad.set.id,
    adSetName: ad.set.spec.name,
    campaignName: ad.set.camp.spec.name,
    existingAdCount: ad.set.ads.length,
  };
}

const METE: Record<string, string> = {
  campaign: CAMPS[0].ext,
  adset: ALL_SETS[0].ext,
  ad: ALL_ADS[0].ext,
};

const listActions: R<typeof api.adActionsStore.listActions> = [
  {
    _id: "adact_ux_0000000000001" as Id<"adActions">,
    _creationTime: now - 3 * HOUR,
    targetType: "campaign",
    targetId: METE.campaign,
    targetName: CAMPS[0].spec.name,
    action: "budget_change",
    status: "success",
    params: '{"dailyBudget":3500,"previousDailyBudget":3000}',
    executedAt: now - 3 * HOUR,
    apiResponse: '{"success":true}',
    error: null,
    user: { id: USER, name: "Test Operater", email: "operater@example.com" },
  },
  {
    _id: "adact_ux_0000000000002" as Id<"adActions">,
    _creationTime: now - 1 * DAY,
    targetType: "ad",
    targetId: ALL_ADS[2].ext,
    targetName: ALL_ADS[2].spec.name,
    action: "pause",
    status: "success",
    params: null,
    executedAt: now - 1 * DAY,
    apiResponse: '{"success":true}',
    error: null,
    user: { id: USER, name: "Test Operater", email: "operater@example.com" },
  },
  {
    _id: "adact_ux_0000000000003" as Id<"adActions">,
    _creationTime: now - 2 * DAY,
    targetType: "adset",
    targetId: METE.adset,
    targetName: ALL_SETS[0].spec.name,
    action: "duplicate",
    status: "error",
    params: '{"copies":1}',
    executedAt: now - 2 * DAY,
    apiResponse: null,
    error: "Meta je odbila zahtev: nalog je dostigao ograničenje (test).",
    user: { id: USER, name: "Test Operater", email: "operater@example.com" },
  },
  {
    _id: "adact_ux_0000000000004" as Id<"adActions">,
    _creationTime: now - 4 * DAY,
    targetType: "campaign",
    targetId: CAMPS[2].ext,
    targetName: CAMPS[2].spec.name,
    action: "pause",
    status: "success",
    params: null,
    executedAt: now - 4 * DAY,
    apiResponse: '{"success":true}',
    error: null,
    user: null,
  },
  {
    _id: "adact_ux_0000000000005" as Id<"adActions">,
    _creationTime: now - 5 * DAY,
    targetType: "campaign",
    targetId: CAMPS[3].ext,
    targetName: CAMPS[3].spec.name,
    action: "create_campaign",
    status: "blocked",
    params: '{"dryRun":true}',
    executedAt: now - 5 * DAY,
    apiResponse: null,
    error: "Blokirano: dnevni budžet prelazi ograničenje (test).",
    user: { id: USER, name: "Test Operater", email: "operater@example.com" },
  },
];

const actionStats: R<typeof api.adActionsStore.getActionStats> = {
  total: listActions.length,
  success: listActions.filter((a) => a.status === "success").length,
  error: listActions.filter((a) => a.status === "error").length,
  pending: 0,
};

// ── Google: kvalitet ključnih reči ───────────────────────────────────────────

function keywordQuality(args: Record<string, unknown>): R<typeof api.googleAdsStore.getKeywordQualityReport> {
  const camp = campById(args.campaignId);
  if (!camp || camp.spec.account !== "google" || camp.spec.spendPerDay === 0) {
    return {
      keywords: [],
      totals: {
        totalKeywords: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalCost: 0,
        totalConversions: 0,
        averageQualityScore: null,
        overallCtr: 0,
      },
    };
  }
  const dates = datesFrom(args);
  const a = campAgg(camp, dates);
  const rows: { text: string; match: string; qs: number; share: number; creative: string; landing: string; ctr: string }[] = [
    { text: "test salon beograd", match: "EXACT", qs: 9, share: 0.34, creative: "ABOVE_AVERAGE", landing: "ABOVE_AVERAGE", ctr: "ABOVE_AVERAGE" },
    { text: "frizerski salon beograd", match: "PHRASE", qs: 7, share: 0.26, creative: "AVERAGE", landing: "AVERAGE", ctr: "AVERAGE" },
    { text: "šišanje cena", match: "BROAD", qs: 5, share: 0.2, creative: "AVERAGE", landing: "BELOW_AVERAGE", ctr: "AVERAGE" },
    { text: "farbanje kose novi beograd", match: "PHRASE", qs: 4, share: 0.12, creative: "BELOW_AVERAGE", landing: "AVERAGE", ctr: "BELOW_AVERAGE" },
    { text: "zakazivanje frizera online", match: "BROAD", qs: 8, share: 0.08, creative: "ABOVE_AVERAGE", landing: "ABOVE_AVERAGE", ctr: "AVERAGE" },
  ];
  const keywords = rows.map((k, i) => {
    const impressions = Math.round(a.impressions * k.share);
    const clicks = Math.round(a.clicks * k.share);
    const cost = r2(a.spend * k.share);
    return {
      keywordId: `kw_ux_${i + 1}`,
      keywordText: k.text,
      matchType: k.match,
      matchTypeDetails: formatMatchType(k.match),
      qualityScore: k.qs as number | undefined,
      qualityScoreDisplay: formatQualityScore(k.qs),
      creativeQualityScore: k.creative as string | undefined,
      creativeQualityDetails: formatQualityComponent(k.creative),
      postClickQualityScore: k.landing as string | undefined,
      postClickQualityDetails: formatQualityComponent(k.landing),
      searchPredictedCtr: k.ctr as string | undefined,
      searchPredictedCtrDetails: formatQualityComponent(k.ctr),
      status: "ENABLED" as string | undefined,
      impressions,
      clicks,
      cost,
      conversions: Math.round((a.results ?? 0) * k.share),
      ctr: impressions > 0 ? r4(clicks / impressions) : 0,
      cpc: clicks > 0 ? r2(cost / clicks) : 0,
    };
  });
  const totalImpressions = keywords.reduce((n, k) => n + k.impressions, 0);
  const totalClicks = keywords.reduce((n, k) => n + k.clicks, 0);
  return {
    keywords,
    totals: {
      totalKeywords: keywords.length,
      totalImpressions,
      totalClicks,
      totalCost: r2(keywords.reduce((n, k) => n + k.cost, 0)),
      totalConversions: keywords.reduce((n, k) => n + k.conversions, 0),
      averageQualityScore: r2(rows.reduce((n, k) => n + k.qs, 0) / rows.length) as number | null,
      overallCtr: totalImpressions > 0 ? r4(totalClicks / totalImpressions) : 0,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PROFIL FIRME
// ═════════════════════════════════════════════════════════════════════════════

const PROFIL_ID = LEAD_PROFIL_ID as Id<"leadCompanies">;
const PROFIL_CREATED = now - 28 * DAY;

/** Isto kao `napraviLead(2)` u fixtures.ts (lcg(102): prvo širina, pa dužina). */
const profilRnd = lcg(102);
const PROFIL_LAT = 44.79 + profilRnd() * 0.08;
const PROFIL_LNG = 20.42 + profilRnd() * 0.1;

const profilFirma: Doc<"leadCompanies"> = {
  _id: PROFIL_ID,
  _creationTime: PROFIL_CREATED,
  workspaceId: WS,
  createdAt: PROFIL_CREATED,
  updatedAt: now - 2 * DAY,
  name: "Test Salon 2",
  nameNormalized: "test salon 2",
  pib: "000000002",
  maticniBroj: "00000002",
  sifraDelatnosti: "9602",
  website: "https://test-salon-2.example",
  domainNormalized: "test-salon-2.example",
  street: "Ulica Probna 2",
  municipality: "Novi Beograd",
  city: "Beograd",
  companyWallUrl: "https://example.com/companywall/test-salon-2",
  firstSeenSource: "google_maps",
  origin: "import",
  temperatura: "hot",
  lat: PROFIL_LAT,
  lng: PROFIL_LNG,
  koordinateIzvor: "nominatim",
  koordinateAt: now - 10 * DAY,
  nicheId: NISA_KOZMETICKI,
  imaSajt: "da",
  sajtStatus: "radi",
  sajtHttps: true,
  sajtProverenAt: now - 3 * DAY,
  poslednjaOcenaSajtaAt: now - 2 * DAY,
  poslednjaOcenaSajtaId: "lsa_ux_test_000000001" as Id<"leadSiteAudits">,
};

const OSOBA_ID = "lp_ux_test_000000001" as Id<"leadPeople">;

const profilOsobe: Doc<"leadPeople">[] = [
  {
    _id: OSOBA_ID,
    _creationTime: PROFIL_CREATED,
    workspaceId: WS,
    companyId: PROFIL_ID,
    name: "Test Osoba",
    role: "vlasnik",
    roleConfidence: "verovatno",
    createdAt: PROFIL_CREATED,
  },
];

function identitet(
  n: number,
  over: Pick<Doc<"leadIdentities">, "kind" | "value"> & Partial<Doc<"leadIdentities">>,
): Doc<"leadIdentities"> {
  return {
    _id: `li_ux_test_${String(n).padStart(9, "0")}` as Id<"leadIdentities">,
    _creationTime: PROFIL_CREATED,
    workspaceId: WS,
    companyId: PROFIL_ID,
    lawfulBasis: "legitimni_interes",
    sourceUrl: "https://example.com/izvor",
    createdAt: PROFIL_CREATED,
    ...over,
  };
}

const profilIdentiteti: Doc<"leadIdentities">[] = [
  identitet(1, {
    kind: "phone",
    value: "+381 60 000 0000",
    valueNormalized: "+381600000000",
    personId: OSOBA_ID,
    verovatnoca: 62,
    verovatnocaObrazlozenje:
      "Broj stoji uz ime osobe na javnom profilu firme. Nijedan drugi izvor ga ne potvrđuje.",
    verovatnocaIzvor: "skill",
    verovatnocaAt: now - 20 * DAY,
  }),
  identitet(2, { kind: "phone", value: "+381 11 000 0000", valueNormalized: "+381110000000" }),
  identitet(3, { kind: "email", value: "test2@example.com", valueNormalized: "test2@example.com" }),
  identitet(4, { kind: "instagram", value: "https://instagram.com/test_salon_2" }),
  identitet(5, { kind: "website", value: "https://test-salon-2.example" }),
];

const profilSignali: Doc<"leadSignals">[] = [
  { kind: "landing_opened", value: "lland_ux_test_000000001", source: "landing_tracker", observedAt: now - 3 * HOUR },
  { kind: "pitao_cenu", source: "instagram", observedAt: now - 1 * DAY },
  { kind: "landing_opened", value: "lland_ux_test_000000001", source: "landing_tracker", observedAt: now - 1 * DAY - 2 * HOUR },
  { kind: "sajt_spor", value: "Lighthouse mobilni 38", source: "site_audit", observedAt: now - 2 * DAY },
  { kind: "koristi_third_party_booking", value: "Setmore", source: "sajt", observedAt: now - 9 * DAY },
  { kind: "visok_broj_recenzija", value: "133", source: "google_maps", observedAt: now - 20 * DAY },
].map((s, i) => ({
  _id: `ls_ux_test_${String(i + 1).padStart(9, "0")}` as Id<"leadSignals">,
  _creationTime: s.observedAt,
  workspaceId: WS,
  companyId: PROFIL_ID,
  ...s,
})) as Doc<"leadSignals">[];

const potvrda = (source: string, confidence: "tacno" | "priblizno" | "nepoznato", humanConfirmed: boolean, observedAt: number) => ({
  source,
  sourceUrl: "https://example.com/izvor",
  confidence,
  humanConfirmed,
  observedAt,
});

const profilPoreklo = [
  { fieldName: "name", value: "Test Salon 2", ...potvrda("google_maps", "tacno", true, now - 27 * DAY) },
  { fieldName: "pib", value: "000000002", ...potvrda("companywall", "tacno", false, now - 25 * DAY) },
  { fieldName: "street", value: "Ulica Probna 2", ...potvrda("google_maps", "priblizno", false, now - 27 * DAY) },
  { fieldName: "website", value: "https://test-salon-2.example", ...potvrda("google_maps", "tacno", false, now - 27 * DAY) },
  { fieldName: "izvestajSkilla", value: "Test izveštaj: salon ima sajt koji radi, ali bez zakazivanja i sa sporim učitavanjem na telefonu.", ...potvrda("generate-leads", "priblizno", false, now - 2 * DAY) },
];

const getLeadDetail: R<typeof api.leadDetailStore.getLeadDetail> = {
  company: profilFirma,
  people: profilOsobe,
  identities: profilIdentiteti,
  provenanceByField: {
    name: potvrda("google_maps", "tacno", true, now - 27 * DAY),
    "leadCompanies:name": potvrda("google_maps", "tacno", true, now - 27 * DAY),
    pib: potvrda("companywall", "tacno", false, now - 25 * DAY),
    "leadCompanies:pib": potvrda("companywall", "tacno", false, now - 25 * DAY),
    street: potvrda("google_maps", "priblizno", false, now - 27 * DAY),
    "leadCompanies:street": potvrda("google_maps", "priblizno", false, now - 27 * DAY),
    website: potvrda("google_maps", "tacno", false, now - 27 * DAY),
    "leadCompanies:website": potvrda("google_maps", "tacno", false, now - 27 * DAY),
    [`person_${OSOBA_ID}`]: potvrda("companywall", "priblizno", false, now - 25 * DAY),
    [`person_${OSOBA_ID}_role`]: potvrda("apr", "priblizno", false, now - 25 * DAY),
  },
  companyProvenance: profilPoreklo,
  signals: profilSignali,
  signalsTruncated: false,
};

const SLEDECI_KORAK = now + 1 * DAY;

function dogadjaj(
  n: number,
  occurredAt: number,
  over: Pick<Doc<"leadStageEvents">, "kind"> & Partial<Doc<"leadStageEvents">>,
): Doc<"leadStageEvents"> {
  return {
    _id: `lse_ux_test_${String(n).padStart(9, "0")}` as Id<"leadStageEvents">,
    _creationTime: occurredAt,
    workspaceId: WS,
    companyId: PROFIL_ID,
    actorUserId: USER,
    occurredAt,
    ...over,
  };
}

const profilDogadjaji: Doc<"leadStageEvents">[] = [
  dogadjaj(6, now - 2 * DAY + 5 * 60_000, { kind: "sledeci_korak", toValue: String(SLEDECI_KORAK), note: "Zvati posle 10h" }),
  dogadjaj(5, now - 2 * DAY, { kind: "ishod", toValue: "zainteresovan", note: "Traži cenu za redizajn sajta." }),
  dogadjaj(4, now - 2 * DAY - 10 * 60_000, { kind: "dodir", toValue: "poziv", note: "Javila se vlasnica, razgovor oko 4 minuta.", timeConfirmed: true }),
  dogadjaj(3, now - 4 * DAY, { kind: "ishod", toValue: "nije_se_javio" }),
  dogadjaj(2, now - 6 * DAY, { kind: "faza", fromValue: "nov", toValue: "u_radu" }),
  dogadjaj(1, now - 7 * DAY, { kind: "dodela", toValue: String(USER) }),
];

const getLeadCrm: R<typeof api.leadCrmStore.getLeadCrm> = {
  company: profilFirma,
  assignment: {
    _id: "la_ux_test_000000002" as Id<"leadAssignments">,
    _creationTime: now - 7 * DAY,
    workspaceId: WS,
    companyId: PROFIL_ID,
    ownerUserId: USER,
    stage: "u_radu",
    lastTouchAt: now - 2 * DAY,
    nextActionAt: SLEDECI_KORAK,
    nextActionNote: "Zvati posle 10h",
    outcome: "zainteresovan",
    outcomeAt: now - 2 * DAY,
    createdAt: now - 7 * DAY,
    updatedAt: now - 2 * DAY,
  },
  events: profilDogadjaji,
  eventsTruncated: false,
  istorijaOdsecena: false,
  procitanoDogadjaja: profilDogadjaji.length,
  isOverdue: false,
  now,
};

const scoreCompany: R<typeof api.leadScoringStore.scoreCompany> = (() => {
  const osa = (pct: number, kind: string, rule: string, days: number, factor: number) => ({
    points: pct,
    maxPoints: 100,
    contributions: pct > 0
      ? [{ signalKind: kind, ruleName: rule, weight: 3, recencyFactor: factor, points: pct, observedAt: now - days * DAY }]
      : [],
    signalsCounted: pct > 0 ? 1 : 0,
  });
  const score: LeadScore = {
    fit: osa(64, "koristi_third_party_booking", "Koristi tuđi alat za zakazivanje", 9, 1),
    intent: osa(38, "pitao_cenu", "Pitao za cenu", 1, 0.9),
    unmatchedSignalKinds: [],
    invalidRules: [],
  };
  return score;
})();

const landingStatus: R<typeof api.leadLandingStore.landingStatus> = {
  hasLanding: true,
  landings: [
    {
      landingId: "lland_ux_test_000000001" as Id<"leadLandings">,
      label: "Test landing — probna stranica",
      status: "poslata",
      sentAt: now - 2 * DAY,
      sentVia: "instagram",
      slug: "test-salon-2",
      destinationUrl: "https://example.com/l/test-salon-2",
      trackedLinkMissing: false,
      openCount: 2,
      lastOpenedAt: now - 3 * HOUR,
      firstOpenedAt: now - 1 * DAY - 2 * HOUR,
      botHitsIgnored: 3,
      overCapIgnored: 0,
    },
  ],
};

const listSiteAudits: R<typeof api.leadSiteAuditsStore.listSiteAudits> = (() => {
  const ocena = (n: number, obrazlozenje: string) => ({ ocena: n, obrazlozenje });
  const audit: Doc<"leadSiteAudits"> = {
    _id: "lsa_ux_test_000000001" as Id<"leadSiteAudits">,
    _creationTime: now - 2 * DAY,
    workspaceId: WS,
    companyId: PROFIL_ID,
    izvor: "skill",
    url: "https://test-salon-2.example/",
    auditedAt: now - 2 * DAY,
    verzijaSkilla: "test-1.0",
    lighthouse: {
      mobile: { performance: 38, accessibility: 81, bestPractices: 92, seo: 74, lcpMs: 5400, cls: 0.21, inpMs: 380, tbtMs: 910 },
      desktop: { performance: 71, accessibility: 83, bestPractices: 92, seo: 78, lcpMs: 2100, cls: 0.08, inpMs: 140, tbtMs: 220 },
    },
    tehnologije: [
      { ime: "WordPress", kategorija: "CMS", verzija: "5.9", pouzdanost: 100 },
      { ime: "jQuery", kategorija: "JavaScript libraries", verzija: "1.12", pouzdanost: 90 },
      { ime: "PHP", kategorija: "Programming languages", pouzdanost: 80 },
    ],
    cms: "WordPress",
    formaZaTermin: false,
    claude: {
      model: "test-model",
      ocene: {
        prviUtisak: ocena(3, "Test: izgled je uredan, ali zastareo."),
        jasnocaPonude: ocena(3, "Test: usluge su navedene bez cena."),
        putDoKontakta: ocena(2, "Test: broj telefona je tek u podnožju."),
        mobilnaUpotrebljivost: ocena(2, "Test: dugmad su sitna na telefonu."),
        azurnost: ocena(2, "Test: poslednja objava je od pre dve godine."),
      },
      glavneMane: [
        "Test: nema online zakazivanja termina.",
        "Test: stranica se sporo učitava na telefonu.",
      ],
      prilikaZaEnigmu: "Test: novi sajt sa zakazivanjem i brzim učitavanjem.",
      preporucenaPonuda: "redizajn",
      klikovaDoKontakta: 3,
      ocenjenoAt: now - 2 * DAY,
    },
  };
  const kvalitet = kvalitetSajta(audit);
  return {
    audits: [
      {
        ...audit,
        kvalitet,
        pojas: kvalitet === null ? null : pojasKvaliteta(kvalitet),
        claudeProsek: claudeProsek(audit.claude),
        snimciUrl: { desktop: null, mobilni: null },
      },
    ],
    poslednjaId: audit._id,
  };
})();

/** Podaci profila važe samo za firmu iz `LEAD_PROFIL_ID`; za ostale `null`/greška se ne izmišlja. */
function zaProfil<T>(value: T): Fixture {
  return (args) => (String(args.companyId) === LEAD_PROFIL_ID ? value : undefined);
}

// ═════════════════════════════════════════════════════════════════════════════
// PODEŠAVANJA
// ═════════════════════════════════════════════════════════════════════════════

const jobStatus: R<typeof api.metaSyncStore.jobStatus> = [
  ...(["event", "head", "account", "hot", "full", "deletion"] as const).map((job, i) => ({
    provider: "meta_ig" as const,
    job,
    lastRunAt: now - 3 * DAY + i * 60_000,
    lastOkAt: job === "event" ? now - 4 * DAY : now - 3 * DAY - i * HOUR,
    lastSkipReason: job === "hot" ? "Preskočeno: token je istekao (test)." : null,
  })),
  ...(["event", "head", "account", "hot", "full"] as const).map((job, i) => ({
    provider: "meta_fb" as const,
    job,
    lastRunAt: now - (i + 1) * 20 * 60_000,
    lastOkAt: now - (i + 1) * 20 * 60_000,
    lastSkipReason: null,
  })),
];

const listModerationLogs: R<typeof api.moderationLog.listModerationLogs> = [
  { id: "igml_ux_1", platform: "instagram", action: "reply", commentId: "17000000000000001", objectId: "18000000000000001", text: "Test odgovor: hvala, pišite nam u poruke.", author: "test_korisnik_1", userEmail: "operater@example.com", status: "done", errorMessage: null, createdAt: now - 2 * HOUR },
  { id: "fbml_ux_1", platform: "facebook", action: "hide", commentId: "100000000000001_1", objectId: "100000000000001", text: "Test komentar koji je sakriven.", author: "Test Korisnik", userEmail: "operater@example.com", status: "done", errorMessage: null, createdAt: now - 5 * HOUR },
  { id: "igml_ux_2", platform: "instagram", action: "delete", commentId: "17000000000000002", objectId: "18000000000000002", text: "Test komentar koji je obrisan.", author: "test_korisnik_2", userEmail: "operater@example.com", status: "done", errorMessage: null, createdAt: now - 1 * DAY },
  { id: "fbml_ux_2", platform: "facebook", action: "reply", commentId: "100000000000001_2", objectId: "100000000000001", text: "Test odgovor na komentar.", author: "Test Korisnik", userEmail: "operater@example.com", status: "failed", errorMessage: "Meta je odbila zahtev (test).", createdAt: now - 2 * DAY },
  { id: "igml_ux_3", platform: "instagram", action: "comments_off", commentId: null, objectId: "18000000000000003", text: null, author: null, userEmail: "operater@example.com", status: "done", errorMessage: null, createdAt: now - 4 * DAY },
  { id: "igml_ux_4", platform: "instagram", action: "like", commentId: "17000000000000003", objectId: "18000000000000003", text: "Test komentar koji je lajkovan.", author: "test_korisnik_3", userEmail: null, status: "done", errorMessage: null, createdAt: now - 6 * DAY },
];

const orEngineStatus: R<typeof api.orEngine.status> = {
  enabled: true,
  webhookUrl: "https://test-deployment.convex.site/instagram/webhook",
  verifyTokenSet: true,
  appSecretSet: true,
  igConnected: true,
  igProfessionalIdSet: true,
};

const routeUsageStatus: R<typeof api.publicRouteLimit.routeUsageStatus> = [];

const purgeStatus: R<typeof api.purge.status> = [];

const webhookHealthStatus: R<typeof api.webhookHealth.status> = (["instagram", "facebook", "threads"] as const).map((route) => ({
  route,
  failures: 0,
  lastFailureAt: null,
  lastOkAt: now - 20 * 60_000,
  reason: null,
  secretConfigured: true,
}));

const listIngestTokens: R<typeof api.ingestTokensStore.listIngestTokens> = [
  { _id: "ingt_ux_0000000000001" as Id<"ingestTokens">, naziv: "Test mašina — laptop", createdAt: now - 20 * DAY, lastUsedAt: now - 2 * DAY, revokedAt: null, createdByEmail: "operater@example.com", namena: "uvoz" },
  { _id: "ingt_ux_0000000000003" as Id<"ingestTokens">, naziv: "Sajt — kontakt forma", createdAt: now - 5 * DAY, lastUsedAt: now - 3 * HOUR, revokedAt: null, createdByEmail: "operater@example.com", namena: "sajt" },
  { _id: "ingt_ux_0000000000002" as Id<"ingestTokens">, naziv: "Test mašina — stari računar", createdAt: now - 60 * DAY, lastUsedAt: null, revokedAt: now - 40 * DAY, createdByEmail: "operater@example.com", namena: "uvoz" },
];

const listInvites: R<typeof api.invitesStore.listInvites> = [
  { _id: "inv_ux_0000000000001" as Id<"invites">, email: "novi.clan@example.com", status: "vazi", createdAt: now - 1 * DAY, expiresAt: now + 6 * DAY, createdByEmail: "operater@example.com", uloga: "urednik" },
  { _id: "inv_ux_0000000000002" as Id<"invites">, email: "stara.pozivnica@example.com", status: "istekla", createdAt: now - 20 * DAY, expiresAt: now - 13 * DAY, createdByEmail: "operater@example.com", uloga: "client_viewer" },
  { _id: "inv_ux_0000000000003" as Id<"invites">, email: "iskoriscena@example.com", status: "iskoriscena", createdAt: now - 40 * DAY, expiresAt: now - 33 * DAY, createdByEmail: "operater@example.com", uloga: "urednik" },
];

// ═════════════════════════════════════════════════════════════════════════════
// Razrešavanje po imenu funkcije
// ═════════════════════════════════════════════════════════════════════════════

export const FIXTURES_OGLASI: Record<string, Fixture> = {
  // Oglasi
  [getFunctionName(api.metaAdsStore.getCampaignsReport)]: (args) => campaignsReport(args),
  [getFunctionName(api.metaAdsStore.getCampaignHierarchy)]: (args) => campaignHierarchy(args),
  [getFunctionName(api.metaAdsStore.getAdDrilldown)]: (args) => adDrilldown(args),
  [getFunctionName(api.metaAdsStore.getHookBattle)]: (args) => hookBattle(args),
  [getFunctionName(api.metaAdsStore.listPinnedBattles)]: () => listPinnedBattles,
  [getFunctionName(api.metaAdsStore.listAccounts)]: () => listAccounts,
  [getFunctionName(api.metaAdsStore.getAccountCurrency)]: (args) => accountCurrency(args),
  [getFunctionName(api.metaAdsStore.getCreationContext)]: () => creationContext,
  [getFunctionName(api.metaAdsStore.listPagePostsForCreative)]: () => pagePosts,
  [getFunctionName(api.metaAdsStore.getAdCreative)]: (args) => adCreative(args),
  [getFunctionName(api.metaAdsStore.listAudiences)]: () => listAudiences,
  [getFunctionName(api.metaAdsStore.getAudienceTos)]: () => audienceTos,
  [getFunctionName(api.metaAdsStore.quotaStatus)]: () => quotaStatus,
  // Developer token dele dva projekta (Explorer: plafon 2.736, deo 1.368).
  [getFunctionName(api.googleAdsStore.kvotaGoogleAds)]: (): R<typeof api.googleAdsStore.kvotaGoogleAds> => ({
    projekat: 420,
    deoProjekta: 1368,
    ukupno: 910,
    zajednickiLimit: 2736,
    dostupno: 948,
    projekata: 2,
    obnovaU: now + 5 * 60 * 60 * 1000,
  }),
  [getFunctionName(api.metaCapiStore.getCapiStats)]: () => capiStats,
  [getFunctionName(api.adActionsStore.getTargetContext)]: (args) => targetContext(args),
  [getFunctionName(api.adActionsStore.getAdCreativeDetails)]: (args) => adCreativeDetails(args),
  [getFunctionName(api.adActionsStore.listActions)]: () => listActions,
  [getFunctionName(api.adActionsStore.getActionStats)]: () => actionStats,
  [getFunctionName(api.googleAdsStore.getKeywordQualityReport)]: (args) => keywordQuality(args),

  // Profil firme (samo za LEAD_PROFIL_ID)
  [getFunctionName(api.leadDetailStore.getLeadDetail)]: zaProfil(getLeadDetail),
  [getFunctionName(api.leadCrmStore.getLeadCrm)]: zaProfil(getLeadCrm),
  [getFunctionName(api.leadScoringStore.scoreCompany)]: zaProfil(scoreCompany),
  [getFunctionName(api.leadLandingStore.landingStatus)]: zaProfil(landingStatus),
  [getFunctionName(api.leadSiteAuditsStore.listSiteAudits)]: zaProfil(listSiteAudits),

  // Podešavanja
  [getFunctionName(api.metaSyncStore.jobStatus)]: () => jobStatus,
  [getFunctionName(api.moderationLog.listModerationLogs)]: () => listModerationLogs,
  [getFunctionName(api.orEngine.status)]: () => orEngineStatus,
  [getFunctionName(api.publicRouteLimit.routeUsageStatus)]: () => routeUsageStatus,
  [getFunctionName(api.purge.status)]: () => purgeStatus,
  [getFunctionName(api.webhookHealth.status)]: () => webhookHealthStatus,
  [getFunctionName(api.ingestTokensStore.listIngestTokens)]: () => listIngestTokens,
  [getFunctionName(api.invitesStore.listInvites)]: () => listInvites,
};

// ── Prazan nalog ─────────────────────────────────────────────────────────────

const prazanReport: R<typeof api.metaAdsStore.getCampaignsReport> = {
  campaigns: [],
  totals: {
    totalSpend: 0,
    totalImpressions: 0,
    totalClicks: 0,
    totalResults: undefined,
    totalConversionValue: undefined,
    overallCpa: undefined,
    overallRoas: undefined,
    hasConversionValue: false,
    overallCtr: 0,
    overallFrequency: 1,
    campaignsCount: 0,
    currency: undefined,
  },
};

/** Preklapanja za režim „prazan nalog": bez naloga, kampanja, publika i radnji. */
export const PRAZNO_OGLASI: Record<string, Fixture> = {
  [getFunctionName(api.metaAdsStore.getCampaignsReport)]: () => prazanReport,
  [getFunctionName(api.metaAdsStore.listPinnedBattles)]: () => [],
  [getFunctionName(api.metaAdsStore.listAccounts)]: () => [],
  [getFunctionName(api.metaAdsStore.getAccountCurrency)]: () => null,
  [getFunctionName(api.metaAdsStore.getCreationContext)]: () => ({
    fbPageId: null,
    fbPageName: null,
    igActorId: null,
    igHandle: null,
  }),
  [getFunctionName(api.metaAdsStore.listPagePostsForCreative)]: () => [],
  [getFunctionName(api.metaAdsStore.getAdCreative)]: () => null,
  [getFunctionName(api.metaAdsStore.listAudiences)]: () => ({
    audiences: [],
    count: 0,
    syncedAt: undefined,
  }),
  [getFunctionName(api.metaAdsStore.getAudienceTos)]: () => ({ status: "unknown" as const }),
  [getFunctionName(api.metaAdsStore.quotaStatus)]: () => null,
  [getFunctionName(api.googleAdsStore.kvotaGoogleAds)]: () => null,
  [getFunctionName(api.metaCapiStore.getCapiStats)]: () => ({
    configured: false,
    nedostaje: ["piksel", "capi_token"],
    sentCount: 0,
    pendingCount: 0,
    retryingCount: 0,
    rejectedCount: 0,
    recentRejected: [],
  }),
  [getFunctionName(api.adActionsStore.getTargetContext)]: () => null,
  [getFunctionName(api.adActionsStore.getAdCreativeDetails)]: () => null,
  [getFunctionName(api.adActionsStore.listActions)]: () => [],
  [getFunctionName(api.adActionsStore.getActionStats)]: () => ({ total: 0, success: 0, error: 0, pending: 0 }),
  [getFunctionName(api.googleAdsStore.getKeywordQualityReport)]: () => ({
    keywords: [],
    totals: {
      totalKeywords: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalCost: 0,
      totalConversions: 0,
      averageQualityScore: null,
      overallCtr: 0,
    },
  }),
  [getFunctionName(api.metaSyncStore.jobStatus)]: () => [],
  [getFunctionName(api.moderationLog.listModerationLogs)]: () => [],
  [getFunctionName(api.ingestTokensStore.listIngestTokens)]: () => [],
  [getFunctionName(api.invitesStore.listInvites)]: () => [],
};
