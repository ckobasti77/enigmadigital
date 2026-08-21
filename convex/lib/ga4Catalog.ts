/**
 * ============================================================================
 * GA4 METRICS & DIMENSIONS STATIC CATALOG & 3/4-STATE RESOLVER (A2)
 * ============================================================================
 *
 * Single source of truth for GA4 Data API (v1beta) metrics and dimensions.
 * Modeled after `convex/lib/igMetrics.ts`.
 *
 * 4-state metric model:
 *   - "value": A real number arrived from GA4 (including true 0).
 *   - "thresholded": GA4 data thresholding applied (too few distinct users/events).
 *   - "blocked": Account lacks permissions or linked integration (e.g. NO_COST_METRICS).
 *   - "unavailable": Metric not returned or unsupported in property metadata.
 * ============================================================================
 */

/**
 * Helper to get keyEvents from row, falling back to conversions for backwards compatibility.
 */
export function getKeyEvents(row: {
  keyEvents?: number;
  conversions?: number;
}): number {
  return row.keyEvents ?? row.conversions ?? 0;
}

/**
 * Derive reportKey from dimensionKeys for fallback reading of ga4MetricDaily rows.
 */
export function deriveReportKey(dimensionKeys?: string[]): string {
  if (!dimensionKeys || dimensionKeys.length === 0) return "acq_channel_first";
  if (dimensionKeys.includes("firstUserDefaultChannelGroup")) return "acq_channel_first";
  if (dimensionKeys.includes("sessionDefaultChannelGroup")) return "acq_channel_session";
  if (dimensionKeys.includes("firstUserSource")) return "acq_source_first";
  if (dimensionKeys.includes("sessionSource")) return "acq_source_session";
  if (dimensionKeys.includes("pagePath")) return "content_pages";
  if (dimensionKeys.includes("landingPage")) return "content_landing";
  if (dimensionKeys.includes("eventName")) return "events_by_name";
  if (dimensionKeys.includes("deviceCategory")) return "audience_device";
  if (dimensionKeys.includes("country")) return "audience_geo";
  if (dimensionKeys.includes("hour")) return "time_hour";
  if (dimensionKeys.includes("googleAdsKeyword")) return "ads_keyword";
  if (dimensionKeys.includes("googleAdsCampaignName")) return "ads_campaign";
  return "acq_channel_first";
}

/**
 * Derive dimKey from dimensionKeys and dimensionValues for fallback reading.
 */
export function deriveDimKey(
  dimensionKeys?: string[],
  dimensionValues?: string[],
): string {
  const dKeys = dimensionKeys ?? [];
  const dVals = dimensionValues ?? [];
  if (dKeys.length === 0 && dVals.length === 0) return "";
  return dKeys.join("|") + "\u0000" + dVals.join("|");
}

/**
 * Single helper to resolve reportKey from a ga4MetricDaily row with fallback derivation.
 */
export function getMetricReportKey(row: {
  reportKey?: string;
  dimensionKeys?: string[];
}): string {
  return row.reportKey ?? deriveReportKey(row.dimensionKeys);
}

/**
 * Single helper to resolve dimKey from a ga4MetricDaily row with fallback derivation.
 */
export function getMetricDimKey(row: {
  dimKey?: string;
  dimensionKeys?: string[];
  dimensionValues?: string[];
}): string {
  return row.dimKey ?? deriveDimKey(row.dimensionKeys, row.dimensionValues);
}

/**
 * Computes sessionKeyEventRate = keyEvents / sessions.
 * Rule: If numerator or denominator is not valid/positive, state is "unavailable", never 0.
 */
export function computeSessionKeyEventRate(
  keyEvents: number | undefined,
  sessions: number | undefined,
  keyEventsState: Ga4ValueState = "value",
  sessionsState: Ga4ValueState = "value",
): { state: Ga4ValueState; value?: number } {
  if (
    keyEventsState !== "value" ||
    sessionsState !== "value" ||
    keyEvents === undefined ||
    sessions === undefined ||
    sessions <= 0
  ) {
    return { state: "unavailable" };
  }
  return { state: "value", value: keyEvents / sessions };
}

/**
 * Computes userKeyEventRate = keyEvents / totalUsers.
 * Rule: If numerator or denominator is not valid/positive, state is "unavailable", never 0.
 */
export function computeUserKeyEventRate(
  keyEvents: number | undefined,
  totalUsers: number | undefined,
  keyEventsState: Ga4ValueState = "value",
  usersState: Ga4ValueState = "value",
): { state: Ga4ValueState; value?: number } {
  if (
    keyEventsState !== "value" ||
    usersState !== "value" ||
    keyEvents === undefined ||
    totalUsers === undefined ||
    totalUsers <= 0
  ) {
    return { state: "unavailable" };
  }
  return { state: "value", value: keyEvents / totalUsers };
}

export type Ga4MetricType =
  | "TYPE_INTEGER"
  | "TYPE_FLOAT"
  | "TYPE_SECONDS"
  | "TYPE_MILLISECONDS"
  | "TYPE_MINUTES"
  | "TYPE_HOURS"
  | "TYPE_STANDARD"
  | "TYPE_CURRENCY"
  | "TYPE_FEET"
  | "TYPE_MILES"
  | "TYPE_METERS"
  | "TYPE_KILOMETERS";

export type Ga4Scope = "user" | "session" | "event" | "item";
export type Ga4MetricUnit = "count" | "percent" | "duration" | "currency" | "ratio";
export type Ga4ValueState = "value" | "thresholded" | "unavailable";
export type Ga4MetricAvailability = "available" | "blocked" | "unknown";

export interface Ga4MetricDef {
  readonly apiName: string;
  readonly label: string; // srpski, za ekran
  readonly type: Ga4MetricType;
  readonly unit: Ga4MetricUnit;
  readonly category: string;
  readonly description: string; // srpski, jedna rečenica, za tooltip
  readonly deprecated?: true;
}

export interface Ga4DimensionDef {
  readonly apiName: string;
  readonly label: string;
  readonly scope: Ga4Scope;
  readonly category: string;
  readonly description: string;
  /** Za dimenzije izvora: koje su još varijante istog pojma u drugim opsezima. */
  readonly scopeSiblings?: readonly string[];
}

/**
 * Staticki katalog svih podrzanih GA4 metrika.
 */
export const GA4_METRIC_CATALOG: Record<string, Ga4MetricDef> = {
  // ── Korisnici i sesije ────────────────────────────────────────────────────
  totalUsers: {
    apiName: "totalUsers",
    label: "Ukupno korisnika",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "User",
    description: "Ukupan broj jedinstvenih korisnika koji su posetili sajt ili aplikaciju.",
  },
  activeUsers: {
    apiName: "activeUsers",
    label: "Aktivni korisnici",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "User",
    description: "Broj različitih korisnika koji su imali angažovanu sesiju ili zabeležili događaj.",
  },
  newUsers: {
    apiName: "newUsers",
    label: "Novi korisnici",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "User",
    description: "Broj korisnika koji su prvi put stupili u interakciju sa sajtom ili aplikacijom.",
  },
  sessions: {
    apiName: "sessions",
    label: "Sesije",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "Session",
    description: "Ukupan broj sesija pokrenutih na sajtu ili aplikaciji.",
  },
  engagedSessions: {
    apiName: "engagedSessions",
    label: "Angažovane sesije",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "Session",
    description: "Broj sesija koje su trajale duže od 10 sekundi, imale ključni događaj ili 2+ prikaza stranica.",
  },
  sessionsPerUser: {
    apiName: "sessionsPerUser",
    label: "Sesije po korisniku",
    type: "TYPE_FLOAT",
    unit: "ratio",
    category: "Session",
    description: "Prosečan broj sesija po pojedinačnom korisniku.",
  },
  averageSessionDuration: {
    apiName: "averageSessionDuration",
    label: "Prosečno trajanje sesije",
    type: "TYPE_SECONDS",
    unit: "duration",
    category: "Session",
    description: "Prosečno vreme trajanja korisničke sesije.",
  },
  bounceRate: {
    apiName: "bounceRate",
    label: "Stopa napuštanja",
    type: "TYPE_FLOAT",
    unit: "percent",
    category: "Session",
    description: "Procenat sesija koje nisu bile angažovane (suprotno od stope angažovanja).",
  },
  engagementRate: {
    apiName: "engagementRate",
    label: "Stopa angažovanja",
    type: "TYPE_FLOAT",
    unit: "percent",
    category: "Session",
    description: "Procenat sesija koje su bile angažovane u odnosu na ukupan broj sesija.",
  },
  userEngagementDuration: {
    apiName: "userEngagementDuration",
    label: "Trajanje angažovanja korisnika",
    type: "TYPE_SECONDS",
    unit: "duration",
    category: "User",
    description: "Ukupno vreme tokom kojeg je sajt ili aplikacija bila u fokusu korisnika.",
  },
  screenPageViewsPerSession: {
    apiName: "screenPageViewsPerSession",
    label: "Prikazi stranica po sesiji",
    type: "TYPE_FLOAT",
    unit: "ratio",
    category: "Page / screen",
    description: "Prosečan broj prikaza stranica ili ekrana po sesiji.",
  },

  // ── Događaji ──────────────────────────────────────────────────────────────
  eventCount: {
    apiName: "eventCount",
    label: "Broj događaja",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "Event",
    description: "Ukupan broj zabeleženih događaja.",
  },
  eventCountPerUser: {
    apiName: "eventCountPerUser",
    label: "Događaji po korisniku",
    type: "TYPE_FLOAT",
    unit: "ratio",
    category: "Event",
    description: "Prosečan broj događaja po korisniku.",
  },
  eventValue: {
    apiName: "eventValue",
    label: "Vrednost događaja",
    type: "TYPE_FLOAT",
    unit: "count",
    category: "Event",
    description: "Zbir vrednosti parametra value prosleđenog uz događaje.",
  },
  eventsPerSession: {
    apiName: "eventsPerSession",
    label: "Događaji po sesiji",
    type: "TYPE_FLOAT",
    unit: "ratio",
    category: "Event",
    description: "Prosečan broj događaja po sesiji.",
  },
  keyEvents: {
    apiName: "keyEvents",
    label: "Ključni događaji",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "Event",
    description: "Broj događaja označenih kao ključni (nekadašnje konverzije).",
  },
  sessionKeyEventRate: {
    apiName: "sessionKeyEventRate",
    label: "Stopa ključnih događaja po sesiji",
    type: "TYPE_FLOAT",
    unit: "percent",
    category: "Session",
    description: "Procenat sesija u kojima je zabeležen bar jedan ključni događaj.",
  },
  userKeyEventRate: {
    apiName: "userKeyEventRate",
    label: "Stopa ključnih događaja po korisniku",
    type: "TYPE_FLOAT",
    unit: "percent",
    category: "User",
    description: "Procenat korisnika koji su zabeležili bar jedan ključni događaj.",
  },

  // ── Sadržaj ───────────────────────────────────────────────────────────────
  screenPageViews: {
    apiName: "screenPageViews",
    label: "Prikazi stranica",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "Page / screen",
    description: "Ukupan broj prikaza veb stranica ili ekrana aplikacije.",
  },
  scrolledUsers: {
    apiName: "scrolledUsers",
    label: "Korisnici sa skrolovanjem",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "User",
    description: "Broj jedinstvenih korisnika koji su skrolovali bar 90% dužine stranice.",
  },

  // ── Oglasi ────────────────────────────────────────────────────────────────
  advertiserAdCost: {
    apiName: "advertiserAdCost",
    label: "Trošak oglasa",
    type: "TYPE_CURRENCY",
    unit: "currency",
    category: "Advertising",
    description: "Ukupan iznos novca potrošen na plaćene oglase.",
  },
  advertiserAdClicks: {
    apiName: "advertiserAdClicks",
    label: "Klikovi na oglase",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "Advertising",
    description: "Ukupan broj klikova na plaćene oglase.",
  },
  advertiserAdImpressions: {
    apiName: "advertiserAdImpressions",
    label: "Prikazi oglasa",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "Advertising",
    description: "Ukupan broj prikaza plaćenih oglasa (impresije).",
  },
  advertiserAdCostPerClick: {
    apiName: "advertiserAdCostPerClick",
    label: "Cena po kliku (CPC)",
    type: "TYPE_CURRENCY",
    unit: "currency",
    category: "Advertising",
    description: "Prosečna cena po pojedinačnom kliku na oglas.",
  },
  returnOnAdSpend: {
    apiName: "returnOnAdSpend",
    label: "Povrat investicije u oglase (ROAS)",
    type: "TYPE_FLOAT",
    unit: "ratio",
    category: "Advertising",
    description: "Odnos prihoda i troškova oglašavanja.",
  },

  // ── Ukinuto (nikada ne slati) ─────────────────────────────────────────────
  conversions: {
    apiName: "conversions",
    label: "Konverzije (ukinuto)",
    type: "TYPE_INTEGER",
    unit: "count",
    category: "Event",
    description: "Zastarela metrika — zamenjena sa keyEvents.",
    deprecated: true,
  },
  conversionRate: {
    apiName: "conversionRate",
    label: "Stopa konverzije (ukinuto)",
    type: "TYPE_FLOAT",
    unit: "percent",
    category: "Session",
    description: "Zastarela metrika — zamenjena sa sessionKeyEventRate.",
    deprecated: true,
  },
};

/**
 * Staticki katalog svih podrzanih GA4 dimenzija.
 */
export const GA4_DIMENSION_CATALOG: Record<string, Ga4DimensionDef> = {
  // ── Vreme ─────────────────────────────────────────────────────────────────
  date: {
    apiName: "date",
    label: "Datum",
    scope: "event",
    category: "Time",
    description: "Datum događaja u formatu YYYYMMDD.",
  },
  hour: {
    apiName: "hour",
    label: "Sat",
    scope: "event",
    category: "Time",
    description: "Sat u danu (00-23) kada se događaj desio.",
  },
  dayOfWeek: {
    apiName: "dayOfWeek",
    label: "Dan u nedelji",
    scope: "event",
    category: "Time",
    description: "Dan u nedelji kao broj (0 za nedelju do 6 za subotu).",
  },
  week: {
    apiName: "week",
    label: "Nedelja u godini",
    scope: "event",
    category: "Time",
    description: "Broj nedelje u godini (01-53).",
  },
  month: {
    apiName: "month",
    label: "Mesec",
    scope: "event",
    category: "Time",
    description: "Mesec u godini kao dvocifreni broj (01-12).",
  },
  nthDay: {
    apiName: "nthDay",
    label: "N-ti dan",
    scope: "event",
    category: "Time",
    description: "Redni broj dana od početka izabranog perioda.",
  },
  dateHour: {
    apiName: "dateHour",
    label: "Datum i sat",
    scope: "event",
    category: "Time",
    description: "Kombinovani datum i sat u formatu YYYYMMDDHH.",
  },

  // ── Izvor (sva tri opsega) ────────────────────────────────────────────────
  firstUserSource: {
    apiName: "firstUserSource",
    label: "Prvi izvor korisnika",
    scope: "user",
    category: "Traffic source",
    description: "Izvor preko kojeg je korisnik prvi put dospeo na sajt.",
    scopeSiblings: ["sessionSource", "source"],
  },
  firstUserMedium: {
    apiName: "firstUserMedium",
    label: "Prvi medij korisnika",
    scope: "user",
    category: "Traffic source",
    description: "Medij preko kojeg je korisnik prvi put dospeo na sajt.",
    scopeSiblings: ["sessionMedium", "medium"],
  },
  firstUserCampaignName: {
    apiName: "firstUserCampaignName",
    label: "Prva kampanja korisnika",
    scope: "user",
    category: "Traffic source",
    description: "Naziv kampanje preko koje je korisnik prvi put dospeo na sajt.",
    scopeSiblings: ["sessionCampaignName", "campaignName"],
  },
  firstUserDefaultChannelGroup: {
    apiName: "firstUserDefaultChannelGroup",
    label: "Prva primarna grupa kanala korisnika",
    scope: "user",
    category: "Traffic source",
    description: "Primarna grupa kanala prvog dolaska korisnika.",
    scopeSiblings: ["sessionDefaultChannelGroup"],
  },
  sessionSource: {
    apiName: "sessionSource",
    label: "Izvor sesije",
    scope: "session",
    category: "Traffic source",
    description: "Izvor koji je inicirao trenutnu sesiju.",
    scopeSiblings: ["firstUserSource", "source"],
  },
  sessionMedium: {
    apiName: "sessionMedium",
    label: "Medij sesije",
    scope: "session",
    category: "Traffic source",
    description: "Medij koji je inicirao trenutnu sesiju.",
    scopeSiblings: ["firstUserMedium", "medium"],
  },
  sessionCampaignName: {
    apiName: "sessionCampaignName",
    label: "Kampanja sesije",
    scope: "session",
    category: "Traffic source",
    description: "Naziv marketinške kampanje vezane za ovu sesiju.",
    scopeSiblings: ["firstUserCampaignName", "campaignName"],
  },
  sessionDefaultChannelGroup: {
    apiName: "sessionDefaultChannelGroup",
    label: "Grupa kanala sesije",
    scope: "session",
    category: "Traffic source",
    description: "Podrazumevana grupa kanala za trenutnu sesiju.",
    scopeSiblings: ["firstUserDefaultChannelGroup"],
  },
  source: {
    apiName: "source",
    label: "Izvor događaja",
    scope: "event",
    category: "Traffic source",
    description: "Izvor vezan za konkretan zabeležen događaj.",
    scopeSiblings: ["firstUserSource", "sessionSource"],
  },
  medium: {
    apiName: "medium",
    label: "Medij događaja",
    scope: "event",
    category: "Traffic source",
    description: "Medij vezan za konkretan zabeležen događaj.",
    scopeSiblings: ["firstUserMedium", "sessionMedium"],
  },
  campaignName: {
    apiName: "campaignName",
    label: "Kampanja događaja",
    scope: "event",
    category: "Traffic source",
    description: "Kampanja vezana za konkretan zabeležen događaj.",
    scopeSiblings: ["firstUserCampaignName", "sessionCampaignName"],
  },

  // ── Sadržaj ───────────────────────────────────────────────────────────────
  pagePath: {
    apiName: "pagePath",
    label: "Putanja stranice",
    scope: "event",
    category: "Page / screen",
    description: "Putanja URL-a posećene stranice bez domena i query parametara.",
  },
  pageTitle: {
    apiName: "pageTitle",
    label: "Naslov stranice",
    scope: "event",
    category: "Page / screen",
    description: "HTML naslov (<title>) posećene veb stranice.",
  },
  landingPage: {
    apiName: "landingPage",
    label: "Ulazna stranica",
    scope: "session",
    category: "Page / screen",
    description: "Putanja prve stranice posećene u sesiji.",
  },
  unifiedPagePathScreen: {
    apiName: "unifiedPagePathScreen",
    label: "Putanja stranice / ekran",
    scope: "event",
    category: "Page / screen",
    description: "Objedinjena putanja veb stranice ili naziv ekrana aplikacije.",
  },

  // ── Uređaj ────────────────────────────────────────────────────────────────
  deviceCategory: {
    apiName: "deviceCategory",
    label: "Kategorija uređaja",
    scope: "user",
    category: "Device",
    description: "Tip uređaja (desktop, mobile, tablet).",
  },
  browser: {
    apiName: "browser",
    label: "Internet pregledač",
    scope: "user",
    category: "Device",
    description: "Pregledač koji korisnik koristi (Chrome, Safari, Firefox...).",
  },
  operatingSystem: {
    apiName: "operatingSystem",
    label: "Operativni sistem",
    scope: "user",
    category: "Device",
    description: "Operativni sistem uređaja (Windows, iOS, Android...).",
  },
  screenResolution: {
    apiName: "screenResolution",
    label: "Rezolucija ekrana",
    scope: "user",
    category: "Device",
    description: "Rezolucija ekrana uređaja u pikselima (npr. 1920x1080).",
  },
  platform: {
    apiName: "platform",
    label: "Platforma",
    scope: "event",
    category: "Platform",
    description: "Platforma na kojoj je zabeležen događaj (web, iOS, Android).",
  },

  // ── Geografija ────────────────────────────────────────────────────────────
  country: {
    apiName: "country",
    label: "Država",
    scope: "user",
    category: "Geography",
    description: "Država iz koje potiče poseta korisnika.",
  },
  city: {
    apiName: "city",
    label: "Grad",
    scope: "user",
    category: "Geography",
    description: "Grad iz kojeg potiče poseta korisnika.",
  },
  region: {
    apiName: "region",
    label: "Region",
    scope: "user",
    category: "Geography",
    description: "Geografski region ili pokrajina posete.",
  },
  language: {
    apiName: "language",
    label: "Jezik",
    scope: "user",
    category: "Geography",
    description: "Jezičko podešavanje korisničkog pregledača.",
  },

  // ── Događaji ──────────────────────────────────────────────────────────────
  eventName: {
    apiName: "eventName",
    label: "Naziv događaja",
    scope: "event",
    category: "Event",
    description: "Ime zabeleženog događaja (npr. page_view, click, purchase).",
  },
  linkUrl: {
    apiName: "linkUrl",
    label: "URL linka",
    scope: "event",
    category: "Event",
    description: "Odredišni URL kliknutog linka.",
  },
  fileName: {
    apiName: "fileName",
    label: "Naziv fajla",
    scope: "event",
    category: "Event",
    description: "Naziv preuzetog fajla kod file_download događaja.",
  },
  videoTitle: {
    apiName: "videoTitle",
    label: "Naslov videa",
    scope: "event",
    category: "Event",
    description: "Naslov reprodukovanog video sadržaja.",
  },
  outbound: {
    apiName: "outbound",
    label: "Odlazni link",
    scope: "event",
    category: "Event",
    description: "Označava da li link vodi van domena sajta (true/false).",
  },

  // ── Google Ads ────────────────────────────────────────────────────────────
  googleAdsCampaignName: {
    apiName: "googleAdsCampaignName",
    label: "Google Ads kampanja",
    scope: "session",
    category: "Google Ads",
    description: "Naziv kampanje u Google Ads-u.",
  },
  googleAdsAdGroupName: {
    apiName: "googleAdsAdGroupName",
    label: "Google Ads oglasna grupa",
    scope: "session",
    category: "Google Ads",
    description: "Naziv oglasne grupe u Google Ads-u.",
  },
  googleAdsKeyword: {
    apiName: "googleAdsKeyword",
    label: "Google Ads ključna reč",
    scope: "session",
    category: "Google Ads",
    description: "Tekst ključne reči koja je pokrenula oglas.",
  },
  sessionGoogleAdsCreativeId: {
    apiName: "sessionGoogleAdsCreativeId",
    label: "Google Ads ID kreative",
    scope: "session",
    category: "Google Ads",
    description: "Identifikator oglasa (kreative) u Google Ads-u.",
  },
};

export interface PropertyMetricMetadata {
  apiName: string;
  uiName: string;
  description: string;
  type: string;
  expression?: string;
  customDefinition?: boolean;
  category?: string;
  blockedReasons?: string[];
}

export interface ResolvedMetric {
  apiName: string;
  label: string;
  description: string;
  type: Ga4MetricType;
  unit: Ga4MetricUnit;
  category: string;
  availability: Ga4MetricAvailability;
  customDefinition?: boolean;
  blockedReasons?: string[];
  deprecated?: boolean;
}

/**
 * Spaja statički katalog sa metapodacima otkrivenim preko getMetadata za konkretnu propertiju.
 *
 * Pravila:
 *   - Statički katalog daje srpsku labelu, opis i unit.
 *   - getMetadata daje `type`, `customDefinition` i `blockedReasons`.
 *   - Ako metrika nosi `blockedReasons` (npr. NO_COST_METRICS), dobija availability "blocked".
 *   - Ako metrika postoji u statičkom katalogu a getMetadata je uopšte ne vrati, dobija availability "unknown".
 *   - Inače availability je "available".
 */
export function resolveMetric(
  apiName: string,
  propertyMetrics?: readonly PropertyMetricMetadata[] | null,
): ResolvedMetric {
  const staticDef = GA4_METRIC_CATALOG[apiName];
  const dynamicMeta = propertyMetrics?.find((m) => m.apiName === apiName);

  if (!staticDef && !dynamicMeta) {
    return {
      apiName,
      label: apiName,
      description: "Nepoznata metrika.",
      type: "TYPE_STANDARD",
      unit: "count",
      category: "Custom",
      availability: "unknown",
    };
  }

  if (dynamicMeta) {
    const isBlocked =
      Array.isArray(dynamicMeta.blockedReasons) &&
      dynamicMeta.blockedReasons.length > 0;

    return {
      apiName,
      label: staticDef?.label ?? dynamicMeta.uiName ?? apiName,
      description: staticDef?.description ?? dynamicMeta.description ?? "",
      type:
        (dynamicMeta.type as Ga4MetricType) ||
        staticDef?.type ||
        "TYPE_STANDARD",
      unit: staticDef?.unit ?? "count",
      category: staticDef?.category ?? dynamicMeta.category ?? "Custom",
      availability: isBlocked ? "blocked" : "available",
      customDefinition: dynamicMeta.customDefinition,
      blockedReasons: dynamicMeta.blockedReasons,
      deprecated: staticDef?.deprecated,
    };
  }

  // Metrika postoji u statickom katalogu, ali getMetadata je ne vraca uopste
  return {
    apiName,
    label: staticDef.label,
    description: staticDef.description,
    type: staticDef.type,
    unit: staticDef.unit,
    category: staticDef.category,
    availability: "unknown",
    deprecated: staticDef.deprecated,
  };
}
