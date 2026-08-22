/**
 * ============================================================================
 * META MARKETING GRAPH API MODULE
 * ============================================================================
 *
 * Single source of truth for all Meta Marketing API (v25.0) endpoint paths,
 * parameters, metric definitions, rate-limit headers parsing, and response helpers.
 *
 * Used by System User token connection (provider "meta_ads").
 *
 * Versioning:
 *   Default Graph API version is "v25.0", overridable via META_GRAPH_API_VERSION.
 * ============================================================================
 */

export const DEFAULT_GRAPH_VERSION = "v25.0";
export const META_GRAPH_BASE_URL = "https://graph.facebook.com";

export function getMetaGraphVersion(): string {
  const envVersion = process.env.META_GRAPH_API_VERSION?.trim();
  if (envVersion && /^v\d+\.\d+$/.test(envVersion)) {
    return envVersion;
  }
  return DEFAULT_GRAPH_VERSION;
}

// ── Fields Definitions ──────────────────────────────────────────────────────

export const AD_ACCOUNT_FIELDS = [
  "id",
  "account_id",
  "name",
  "currency",
  "account_status",
] as const;

export const CAMPAIGN_FIELDS = [
  "id",
  "name",
  "objective",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "updated_time",
  "created_time",
] as const;

export const ADSET_FIELDS = [
  "id",
  "campaign_id",
  "name",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "targeting",
  "updated_time",
] as const;

export const AD_FIELDS = [
  "id",
  "adset_id",
  "campaign_id",
  "name",
  "status",
  "effective_status",
  "creative{id,name,thumbnail_url,image_url}",
  "updated_time",
] as const;

export const INSIGHTS_FIELDS = [
  "account_id",
  "campaign_id",
  "adset_id",
  "ad_id",
  "ad_name",
  "date_start",
  "date_stop",
  // Read-only: tells us WHICH attribution setting produced these numbers.
  // Meaningful only because we send use_unified_attribution_setting=true — it
  // echoes back the ad set's own setting that was actually applied (MA1).
  "attribution_setting",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "ctr",
  "unique_ctr",
  "cpc",
  "cpm",
  "cpp",
  "actions",
  "action_values",
  "cost_per_action_type",
  "cost_per_unique_action_type",
  "video_3_sec_watched_actions",
  "video_thruplay_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p95_watched_actions",
  "video_p100_watched_actions",
  "outbound_clicks_ctr",
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
] as const;

// ── URL Builders ─────────────────────────────────────────────────────────────

/** Normalize ad account ID to ensure "act_" prefix when calling endpoints */
export function normalizeAdAccountId(id: string): string {
  const clean = id.trim();
  if (clean.startsWith("act_")) return clean;
  return `act_${clean}`;
}

/** Build URL to list accessible ad accounts for the token */
export function buildAdAccountsUrl(
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/me/adaccounts`);
  url.searchParams.set("fields", AD_ACCOUNT_FIELDS.join(","));
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to fetch details of a specific ad account */
export function buildAdAccountUrl(
  accountId: string,
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const actId = normalizeAdAccountId(accountId);
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${actId}`);
  url.searchParams.set("fields", AD_ACCOUNT_FIELDS.join(","));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to fetch campaigns under an ad account */
export function buildCampaignsUrl(
  accountId: string,
  accessToken: string,
  limit: number = 500,
  version: string = getMetaGraphVersion(),
): string {
  const actId = normalizeAdAccountId(accountId);
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${actId}/campaigns`);
  url.searchParams.set("fields", CAMPAIGN_FIELDS.join(","));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to fetch ad sets under an ad account */
export function buildAdSetsUrl(
  accountId: string,
  accessToken: string,
  limit: number = 500,
  version: string = getMetaGraphVersion(),
): string {
  const actId = normalizeAdAccountId(accountId);
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${actId}/adsets`);
  url.searchParams.set("fields", ADSET_FIELDS.join(","));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to fetch ads under an ad account */
export function buildAdsUrl(
  accountId: string,
  accessToken: string,
  limit: number = 500,
  version: string = getMetaGraphVersion(),
): string {
  const actId = normalizeAdAccountId(accountId);
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${actId}/ads`);
  url.searchParams.set("fields", AD_FIELDS.join(","));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to fetch ad creative details */
export function buildCreativeUrl(
  creativeId: string,
  accessToken: string,
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${creativeId}`);
  url.searchParams.set(
    "fields",
    "id,name,thumbnail_url,image_url,object_story_spec",
  );
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/** Build URL to generate iframe ad preview */
export function buildAdPreviewUrl(
  adId: string,
  accessToken: string,
  adFormat: string = "DESKTOP_FEED_STANDARD",
  version: string = getMetaGraphVersion(),
): string {
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${adId}/previews`);
  url.searchParams.set("ad_format", adFormat);
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

/**
 * The four windows we ask for on every insights call (MA1).
 *
 * `action_attribution_windows` defaults to "default" and, without it, Meta
 * reports 7d_click alone — a number that does not match anything an operator
 * sees in Ads Manager. Asking for the four standard windows makes the answer
 * comparable; `use_unified_attribution_setting` below then makes it IDENTICAL
 * to Ads Manager, because the documentation says so in as many words.
 */
export const ACTION_ATTRIBUTION_WINDOWS = [
  "1d_click",
  "7d_click",
  "1d_view",
  "7d_view",
] as const;

/**
 * `action_report_time` — when an action is counted.
 *
 * Since 10.06.2025. Meta's own default is "mixed" (on-Meta actions by
 * impression time, off-Meta by conversion time). We do NOT send it unless a
 * caller explicitly asks: pinning it would silently diverge from whatever
 * Ads Manager does next, which is the exact problem this task exists to fix.
 */
export type ActionReportTime = "impression" | "conversion" | "mixed" | "lifetime";

export interface InsightsQueryParams {
  targetId: string; // accountId (act_...) or campaignId or adId
  level?: "account" | "campaign" | "adset" | "ad";
  datePreset?: string; // e.g. "today", "last_2d", "last_7d"
  timeRange?: { since: string; until: string }; // "YYYY-MM-DD"
  timeIncrement?: number | "all_days"; // 1 for daily
  breakdowns?: string[]; // e.g. ["age", "gender"] or ["publisher_platform", "platform_position"] or ["hourly_stats_aggregated_by_audience_time_zone"]
  filtering?: Array<{ field: string; operator: string; value: unknown }>;
  limit?: number;
  /** Only when a caller has a reason; otherwise Meta's "mixed" default stands. */
  actionReportTime?: ActionReportTime;
  accessToken: string;
  version?: string;
}

/** Build URL to fetch ad insights */
export function buildInsightsUrl(params: InsightsQueryParams): string {
  const targetId = params.targetId.startsWith("act_") || /^\d+$/.test(params.targetId)
    ? params.targetId
    : normalizeAdAccountId(params.targetId);
  const version = params.version ?? getMetaGraphVersion();
  const url = new URL(`${META_GRAPH_BASE_URL}/${version}/${targetId}/insights`);

  url.searchParams.set("fields", INSIGHTS_FIELDS.join(","));
  if (params.level) url.searchParams.set("level", params.level);
  if (params.datePreset) url.searchParams.set("date_preset", params.datePreset);
  if (params.timeRange) {
    url.searchParams.set("time_range", JSON.stringify(params.timeRange));
  }
  if (params.timeIncrement !== undefined) {
    url.searchParams.set("time_increment", String(params.timeIncrement));
  }
  if (params.breakdowns && params.breakdowns.length > 0) {
    url.searchParams.set("breakdowns", params.breakdowns.join(","));
  }
  if (params.filtering && params.filtering.length > 0) {
    url.searchParams.set("filtering", JSON.stringify(params.filtering));
  }
  url.searchParams.set("limit", String(params.limit ?? 500));

  // ── Attribution (MA1) ────────────────────────────────────────────────────
  // Both are MANDATORY on every insights request, hot pass included. They are
  // set after the caller-supplied parameters on purpose: no call site can
  // accidentally override them.
  url.searchParams.set("use_unified_attribution_setting", "true");
  url.searchParams.set(
    "action_attribution_windows",
    JSON.stringify(ACTION_ATTRIBUTION_WINDOWS),
  );
  // Left unset unless asked for — see ActionReportTime.
  if (params.actionReportTime) {
    url.searchParams.set("action_report_time", params.actionReportTime);
  }

  url.searchParams.set("access_token", params.accessToken);

  return url.toString();
}

// ── Rate Limit Inspection ───────────────────────────────────────────────────

/**
 * ============================================================================
 * TRI MEHANIZMA, I ZAŠTO SE PARSIRAJU ODVOJENO (MA1)
 * ============================================================================
 *
 * Meta ograničava Marketing API kroz tri nezavisna mehanizma. Mere različite
 * stvari nad različitim prozorima, a samo dva se uopšte vide u zaglavljima:
 *
 *  1. X-Business-Use-Case-Usage — ključ je id naloga, a vrednost NIZ (jedan
 *     unos po slučaju upotrebe: "ads_insights", "ads_management", …). Njegova
 *     tri broja su PROCENTI (0-100) klizajućeg SATA, i Meta guši čim BILO KOJI
 *     dođe do 100. To je i jedino zaglavlje koje kaže koliko blokada traje:
 *     `estimated_time_to_regain_access`, u MINUTIMA — ne u sekundama. Čitanje
 *     u sekundama (kako je ovde ranije stajalo) pretvara blokadu od 30 minuta
 *     u pauzu od pola minuta, pa prolaz uleti pravo nazad u nju.
 *
 *  2. X-FB-Ads-Insights-Throttle — opterećenje PO SEKUNDI, ne po satu. Drugi
 *     prozor, druga greška (error_code 4) i NEMA procene oporavka, zbog čega
 *     ne može da se stopi s objektom iznad.
 *
 *  3. Bodovanje po nalogu (čitanje 1, pisanje 3, prozor 300 s). Ne pojavljuje
 *     se ni u jednom zaglavlju, pa ovde ništa ne može da ga vidi.
 *
 * Na development sloju satna kvota za insights je
 *   600 + 400 × broj aktivnih oglasa − 0.001 × greške korisnika
 * pa petlja neuspelih poziva ne troši kvotu — ona je SMANJUJE. To je razlog
 * zašto se 1487534 nikada ne ponavlja naslepo.
 * ============================================================================
 */

/** Sloj pristupa koji Meta prijavi; sve drugo se prosleđuje doslovno. */
export type MetaAdsTier = "development_access" | "standard_access" | string;

/** Jedan unos iz X-Business-Use-Case-Usage, procenti nad klizajućim satom. */
export interface MetaBucEntry {
  /** "ads_insights" | "ads_management" | … */
  type?: string;
  callCount?: number;
  totalCpuTime?: number;
  totalTime?: number;
  /** MINUTI. Meta ovo polje dokumentuje u minutima, ne u sekundama. */
  estimatedTimeToRegainAccessMin?: number;
  tier?: MetaAdsTier;
}

/** X-FB-Ads-Insights-Throttle — opterećenje po sekundi, bez procene oporavka. */
export interface MetaInsightsThrottle {
  appIdUtilPct?: number;
  accIdUtilPct?: number;
  tier?: MetaAdsTier;
}

export interface RateLimitStatus {
  /** Netačno kada nijedno zaglavlje nije stiglo (CDN stranica, greška mreže). */
  present: boolean;
  /** Svi viđeni BUC unosi, nespojeni — tipovi ne znače istu stvar. */
  buc: MetaBucEntry[];
  throttle?: MetaInsightsThrottle;

  // Vrhovi po onome što je stvarno stiglo. `undefined`, nikad 0, kada broj
  // nije stigao — 0 bi se čitalo kao „ima još mesta”.
  callCount?: number;
  totalCpuTime?: number;
  totalTime?: number;
  appIdUtilPct?: number;
  accIdUtilPct?: number;
  /** max() pet procenata iznad; undefined kada nijedan nije stigao. */
  maxUsagePercent?: number;
  /** MINUTI do prestanka blokade. Dolazi isključivo iz BUC zaglavlja. */
  estimatedTimeToRegainAccessMin?: number;
  tier?: MetaAdsTier;

  /** Meta je rekla da blokira (stigla je procena oporavka). */
  blocked: boolean;
  /** Potrošeno je dovoljno da paginacija treba da stane. */
  shouldBackoff: boolean;
}

/** Samo procenti; negativna ili nekonačna vrednost nije očitavanje. */
function toPct(value: unknown): number | undefined {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return Math.min(100, num);
}

function toMinutes(value: unknown): number | undefined {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return num;
}

/** max() koji „nije stiglo” tretira kao odsustvo, a ne kao nulu. */
function maxDefined(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

/** Preko ovog procenta paginacija unutar jednog prolaza staje. */
export const RATE_BACKOFF_PCT = 80;

/**
 * Parsira OBA zaglavlja u jedno tipizovano očitavanje.
 *
 * X-App-Usage se namerno NE čita ovde: on opisuje aplikaciju preko svih
 * proizvoda, već je uračunat u zajedničku kapiju kroz
 * `metaRateLimit.parseUsageHeaders`, a mešanjem bi nastao broj za Oglase kome
 * ne odgovara nijedan limit Oglasa.
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitStatus {
  const status: RateLimitStatus = {
    present: false,
    buc: [],
    blocked: false,
    shouldBackoff: false,
  };

  // 1. X-Business-Use-Case-Usage: { "<id naloga>": [ {...}, {...} ] }
  const bucHeader = headers.get("x-business-use-case-usage");
  if (bucHeader) {
    try {
      const parsed = JSON.parse(bucHeader) as Record<string, unknown>;
      for (const entries of Object.values(parsed)) {
        if (!Array.isArray(entries)) continue;
        for (const raw of entries) {
          if (typeof raw !== "object" || raw === null) continue;
          const obj = raw as Record<string, unknown>;
          const entry: MetaBucEntry = {
            type: typeof obj.type === "string" ? obj.type : undefined,
            callCount: toPct(obj.call_count),
            totalCpuTime: toPct(obj.total_cputime),
            totalTime: toPct(obj.total_time),
            estimatedTimeToRegainAccessMin: toMinutes(
              obj.estimated_time_to_regain_access,
            ),
            tier:
              typeof obj.ads_api_access_tier === "string"
                ? obj.ads_api_access_tier
                : undefined,
          };
          status.present = true;
          status.buc.push(entry);
          status.callCount = maxDefined(status.callCount, entry.callCount);
          status.totalCpuTime = maxDefined(
            status.totalCpuTime,
            entry.totalCpuTime,
          );
          status.totalTime = maxDefined(status.totalTime, entry.totalTime);
          status.estimatedTimeToRegainAccessMin = maxDefined(
            status.estimatedTimeToRegainAccessMin,
            entry.estimatedTimeToRegainAccessMin,
          );
          if (entry.tier && !status.tier) status.tier = entry.tier;
        }
      }
    } catch {
      // Pokvareno zaglavlje ne vredi rušenja sinhronizacije.
    }
  }

  // 2. X-FB-Ads-Insights-Throttle: {"app_id_util_pct":…, "acc_id_util_pct":…}
  const throttleHeader = headers.get("x-fb-ads-insights-throttle");
  if (throttleHeader) {
    try {
      const obj = JSON.parse(throttleHeader) as Record<string, unknown>;
      const throttle: MetaInsightsThrottle = {
        appIdUtilPct: toPct(obj.app_id_util_pct),
        accIdUtilPct: toPct(obj.acc_id_util_pct),
        tier:
          typeof obj.ads_api_access_tier === "string"
            ? obj.ads_api_access_tier
            : undefined,
      };
      status.present = true;
      status.throttle = throttle;
      status.appIdUtilPct = throttle.appIdUtilPct;
      status.accIdUtilPct = throttle.accIdUtilPct;
      if (throttle.tier && !status.tier) status.tier = throttle.tier;
    } catch {
      // Isto.
    }
  }

  status.maxUsagePercent = [
    status.callCount,
    status.totalCpuTime,
    status.totalTime,
    status.appIdUtilPct,
    status.accIdUtilPct,
  ].reduce<number | undefined>((acc, v) => maxDefined(acc, v), undefined);

  status.blocked = (status.estimatedTimeToRegainAccessMin ?? 0) > 0;
  status.shouldBackoff =
    status.blocked || (status.maxUsagePercent ?? 0) >= RATE_BACKOFF_PCT;

  return status;
}

// ── Error Classification ────────────────────────────────────────────────────

/**
 * `error_subcode` za „smanji količinu podataka koju tražiš”.
 *
 * Ovo NIJE gušenje. Kvota je netaknuta; jedan upit je bio prevelik. Backoff tu
 * ne menja ništa, a na development sloju ponovljena greška doslovno oduzima od
 * satne kvote (−0.001 × greške korisnika). Leče je samo uži opseg, manje
 * razdvajanja ili asinhroni izveštaj.
 */
export const ERR_TOO_MUCH_DATA = 1487534;

/** `error.code` 4 — opterećenje insights-a PO SEKUNDI. To jeste backoff. */
export const ERR_INSIGHTS_THROTTLE = 4;

export type MetaErrorKind =
  /** 1487534 — suzi pitanje, nikada ne spavaj. */
  | "too_much_data"
  /** code 4 — opterećenje po sekundi; spavaj sekunde i probaj ponovo. */
  | "insights_throttle"
  /** BUC potrošen; spavaj `estimated_time_to_regain_access` MINUTA. */
  | "buc_throttle"
  | "other";

/** Neuspeh Graph API-ja kao izuzetak, sa netaknutim kodovima. */
export class MetaApiError extends Error {
  readonly kind: MetaErrorKind;
  readonly code?: number;
  readonly subcode?: number;
  readonly httpStatus?: number;
  /** MINUTI, kada je odgovor to rekao. */
  readonly retryAfterMin?: number;

  constructor(
    message: string,
    init: {
      kind: MetaErrorKind;
      code?: number;
      subcode?: number;
      httpStatus?: number;
      retryAfterMin?: number;
    },
  ) {
    super(message);
    this.name = "MetaApiError";
    this.kind = init.kind;
    this.code = init.code;
    this.subcode = init.subcode;
    this.httpStatus = init.httpStatus;
    this.retryAfterMin = init.retryAfterMin;
  }
}

interface RawErrorEnvelope {
  error?: {
    message?: string;
    error_user_msg?: string;
    code?: number;
    error_subcode?: number;
  };
}

function readErrorEnvelope(body: unknown): RawErrorEnvelope["error"] {
  if (typeof body === "string") {
    try {
      return (JSON.parse(body) as RawErrorEnvelope).error;
    } catch {
      return undefined;
    }
  }
  if (typeof body === "object" && body !== null) {
    return (body as RawErrorEnvelope).error;
  }
  return undefined;
}

/**
 * Pretvara neuspeli Graph odgovor u tipizovanu grešku.
 *
 * Razdvajanje je važnije od poruke: 1487534 i code 4 stižu kroz isti HTTP
 * status i izgledaju gotovo isto, a tretiranje prvog kao gušenja je način na
 * koji sinhronizacija završi spavajući trideset minuta nad upitom koji bi
 * popravila prepolovljenim opsegom datuma.
 */
export function classifyMetaError(
  body: unknown,
  opts: { httpStatus?: number; rateLimit?: RateLimitStatus } = {},
): MetaApiError {
  const err = readErrorEnvelope(body);
  const message = extractMetaAdsError(body);
  const code = err?.code;
  const subcode = err?.error_subcode;

  if (subcode === ERR_TOO_MUCH_DATA) {
    return new MetaApiError(message, {
      kind: "too_much_data",
      code,
      subcode,
      httpStatus: opts.httpStatus,
    });
  }

  // Procena oporavka u zaglavlju je Metina izjava o blokadi i njenom trajanju.
  const regainMin = opts.rateLimit?.estimatedTimeToRegainAccessMin;
  if (regainMin !== undefined && regainMin > 0) {
    return new MetaApiError(message, {
      kind: "buc_throttle",
      code,
      subcode,
      httpStatus: opts.httpStatus,
      retryAfterMin: regainMin,
    });
  }

  if (code === ERR_INSIGHTS_THROTTLE) {
    return new MetaApiError(message, {
      kind: "insights_throttle",
      code,
      subcode,
      httpStatus: opts.httpStatus,
    });
  }

  return new MetaApiError(message, {
    kind: "other",
    code,
    subcode,
    httpStatus: opts.httpStatus,
  });
}

// ── Async Insights Reports ──────────────────────────────────────────────────

/**
 * Doslovni `async_status` stringovi. „Job Completed” je JEDINI koji znači da su
 * redovi tu.
 */
export const ASYNC_STATUS_COMPLETED = "Job Completed";
export const ASYNC_STATUS_FAILED = "Job Failed";
export const ASYNC_STATUS_SKIPPED = "Job Skipped";

/** Meta poslu daje do sat vremena; ovo je dokumentovani plafon. */
export const ASYNC_MAX_WAIT_MS = 60 * 60 * 1000;

/** Opseg širi od ovoga ide asinhrono od početka. */
export const ASYNC_RANGE_DAY_THRESHOLD = 30;

const ASYNC_POLL_START_MS = 2_000;
const ASYNC_POLL_MAX_MS = 60_000;

/** Plafon stranica pri čitanju redova gotovog izveštaja. */
const ASYNC_MAX_PAGES = 50;

export interface AsyncInsightsResult<T> {
  rows: T[];
  /** Stalo se na plafonu stranica — prozor NIJE potpuno pokriven. */
  truncated: boolean;
}

export interface AsyncInsightsOptions {
  /** Plafon anketiranja po zidnom satu. Podrazumevano Metin sat. */
  maxWaitMs?: number;
  /** Ubrizgava se da bi i ovaj put išao kroz zajednički tracker (P2). */
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  /** Poziva se posle svake ankete, da pozivalac može da beleži napredak. */
  onPoll?: (status: string, percent?: number) => void;
  /**
   * Zaglavlja kvote SVAKOG odgovora asinhronog puta (MA1).
   *
   * Bez ovoga bi predaja posla, ankete i čitanje redova bili nevidljivi za
   * `metaAdsQuota` — a to je najskuplji put u celom modulu, pa bi kapija
   * prijavljivala „ok” baš kad je potrošnja najveća.
   */
  onRateLimit?: (status: RateLimitStatus) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function asyncJobUrl(
  reportRunId: string,
  accessToken: string,
  version: string,
  suffix: string,
): URL {
  const url = new URL(
    `${META_GRAPH_BASE_URL}/${version}/${reportRunId}${suffix}`,
  );
  url.searchParams.set("access_token", accessToken);
  return url;
}

/**
 * Pokreće insights upit kao ASINHRONI izveštaj (MA1).
 *
 * Tri poziva, tim redom i nikako drugačije:
 *   POST /<act_id>/insights            → { report_run_id }
 *   GET  /<report_run_id>?fields=async_status,async_percent_completion
 *   GET  /<report_run_id>/insights     → redovi
 *
 * Koristi se kada sinhroni poziv odgovori 1487534 i posle suženja opsega, i za
 * svaki opseg širi od 30 dana. Parametri su isti oni koje pravi
 * `buildInsightsUrl` — atribucija uključena — jer izveštaj koji odgovara na
 * drugo pitanje od sinhronog puta je gori od nikakvog izveštaja.
 */
export async function runInsightsAsync<T = RawAdInsightRow>(
  params: InsightsQueryParams,
  opts: AsyncInsightsOptions = {},
): Promise<AsyncInsightsResult<T>> {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const version = params.version ?? getMetaGraphVersion();
  const maxWaitMs = opts.maxWaitMs ?? ASYNC_MAX_WAIT_MS;

  // Svaki odgovor nosi zaglavlja kvote — i onaj koji je pao. Čita se ovde, na
  // jednom mestu, da nijedan od tri koraka ne ostane nevidljiv za kapiju.
  const readHeaders = (headers: Headers): RateLimitStatus => {
    const status = parseRateLimitHeaders(headers);
    opts.onRateLimit?.(status);
    return status;
  };

  // 1. Predaja posla. Isti URL koji bi napravio i sinhroni put, poslat kao POST
  //    telo da dužina liste parametara ne udari u ograničenje dužine URL-a.
  const submitUrl = new URL(buildInsightsUrl({ ...params, version }));
  const body = new URLSearchParams();
  submitUrl.searchParams.forEach((value, key) => body.set(key, value));

  const submitRes = await doFetch(submitUrl.origin + submitUrl.pathname, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const submitRate = readHeaders(submitRes.headers);
  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => "");
    throw classifyMetaError(text, {
      httpStatus: submitRes.status,
      rateLimit: submitRate,
    });
  }
  const submitJson = (await submitRes.json()) as { report_run_id?: string };
  const reportRunId = submitJson.report_run_id;
  if (!reportRunId) {
    throw new MetaApiError(
      "Meta nije vratila report_run_id za asinhroni izveštaj.",
      { kind: "other" },
    );
  }

  // 2. Anketiranje. Razmak raste da posao od dvadeset minuta ne košta dvadeset
  //    minuta poziva — svaka anketa se plaća iz iste kvote koju izveštaj štiti.
  const startedAt = Date.now();
  let waitMs = ASYNC_POLL_START_MS;
  let lastStatus = "";

  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(waitMs);
    waitMs = Math.min(ASYNC_POLL_MAX_MS, Math.round(waitMs * 1.6));

    const statusUrl = asyncJobUrl(reportRunId, params.accessToken, version, "");
    statusUrl.searchParams.set(
      "fields",
      "async_status,async_percent_completion",
    );
    const statusRes = await doFetch(statusUrl.toString());
    const statusRate = readHeaders(statusRes.headers);
    if (!statusRes.ok) {
      const text = await statusRes.text().catch(() => "");
      throw classifyMetaError(text, {
        httpStatus: statusRes.status,
        rateLimit: statusRate,
      });
    }
    const statusJson = (await statusRes.json()) as {
      async_status?: string;
      async_percent_completion?: number;
    };
    lastStatus = statusJson.async_status ?? "";
    opts.onPoll?.(lastStatus, statusJson.async_percent_completion);

    // async_percent_completion dođe do 100 dok je status još „Job Running” — u
    // tom trenutku redova NEMA. Status je jedini signal završetka, pa je jedini
    // koji se ovde čita.
    if (lastStatus === ASYNC_STATUS_COMPLETED) break;
    if (
      lastStatus === ASYNC_STATUS_FAILED ||
      lastStatus === ASYNC_STATUS_SKIPPED
    ) {
      throw new MetaApiError(`Asinhroni izveštaj nije uspeo (${lastStatus}).`, {
        kind: "other",
      });
    }
  }

  if (lastStatus !== ASYNC_STATUS_COMPLETED) {
    throw new MetaApiError(
      `Asinhroni izveštaj nije završen na vreme (poslednji status: ${lastStatus || "nepoznat"}).`,
      { kind: "other" },
    );
  }

  // 3. Čitanje redova, uz paginaciju.
  const rows: T[] = [];
  let nextUrl: string | undefined = asyncJobUrl(
    reportRunId,
    params.accessToken,
    version,
    "/insights",
  ).toString();
  let pages = 0;

  while (nextUrl && pages < ASYNC_MAX_PAGES) {
    pages++;
    const res: Response = await doFetch(nextUrl);
    const pageRate = readHeaders(res.headers);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw classifyMetaError(text, {
        httpStatus: res.status,
        rateLimit: pageRate,
      });
    }
    const json = (await res.json()) as RawGraphApiResponse<T>;
    if (json.error) throw classifyMetaError(json, { rateLimit: pageRate });
    rows.push(...(json.data ?? []));
    nextUrl = json.paging?.next;
  }

  // Stalo se na plafonu stranica, a Meta je nudila još: pozivalac mora da zna
  // da ovaj prozor NIJE potpun pre nego što ga upiše kao pokriven.
  return { rows, truncated: nextUrl !== undefined };
}

// ── Breakdown Hasher ────────────────────────────────────────────────────────

export interface BreakdownDimensions {
  age?: string;
  gender?: string;
  placement?: string;
  platform?: string;
  device?: string;
}

/**
 * Compute deterministic hash/key for breakdown dimensions.
 * Returns "none" when no breakdown dimensions are provided.
 */
export function computeBreakdownHash(
  breakdown?: BreakdownDimensions,
): string {
  if (!breakdown) return "none";

  const parts: string[] = [];
  if (breakdown.age) parts.push(`age=${breakdown.age}`);
  if (breakdown.gender) parts.push(`gen=${breakdown.gender}`);
  if (breakdown.platform) parts.push(`plt=${breakdown.platform}`);
  if (breakdown.placement) parts.push(`plc=${breakdown.placement}`);
  if (breakdown.device) parts.push(`dev=${breakdown.device}`);

  if (parts.length === 0) return "none";
  return parts.sort().join("|");
}

// ── Types for Raw Graph API Responses ───────────────────────────────────────

export interface RawActionValue {
  action_type: string;
  value: string | number;
}

export interface RawAdInsightRow {
  account_id?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  /** Read-only echo, e.g. "7d_click,1d_view". Never sent, only received. */
  attribution_setting?: string;
  hourly_stats_aggregated_by_audience_time_zone?: string; // e.g. "00:00:00 - 00:59:59"
  age?: string;
  gender?: string;
  publisher_platform?: string;
  platform_position?: string;
  device_platform?: string;
  spend?: string | number;
  impressions?: string | number;
  reach?: string | number;
  frequency?: string | number;
  clicks?: string | number;
  ctr?: string | number;
  unique_ctr?: string | number;
  cpc?: string | number;
  cpm?: string | number;
  cpp?: string | number;
  actions?: RawActionValue[];
  action_values?: RawActionValue[];
  cost_per_action_type?: RawActionValue[];
  video_3_sec_watched_actions?: RawActionValue[];
  video_thruplay_watched_actions?: RawActionValue[];
  video_p25_watched_actions?: RawActionValue[];
  video_p50_watched_actions?: RawActionValue[];
  video_p75_watched_actions?: RawActionValue[];
  video_p95_watched_actions?: RawActionValue[];
  video_p100_watched_actions?: RawActionValue[];
  outbound_clicks_ctr?: RawActionValue[] | string | number;
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
}

export interface RawGraphApiResponse<T> {
  data?: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// ── Metric Extractors ───────────────────────────────────────────────────────

function toNum(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Extract action sum for prioritized conversion types */
export function extractConversionResults(actions?: RawActionValue[]): number {
  if (!Array.isArray(actions) || actions.length === 0) return 0;

  // Priority conversion action types
  const conversionKeys = [
    "purchase",
    "lead",
    "contact",
    "complete_registration",
    "submit_application",
    "offsite_conversion.fb_pixel_purchase",
    "offsite_conversion.fb_pixel_lead",
    "omni_purchase",
    "omni_complete_registration",
    "landing_page_view",
    "link_click",
  ];

  for (const key of conversionKeys) {
    const found = actions.find((a) => a.action_type === key);
    if (found) return toNum(found.value);
  }

  // Fallback: sum all offsite conversions if available
  let total = 0;
  for (const a of actions) {
    if (a.action_type?.startsWith("offsite_conversion")) {
      total += toNum(a.value);
    }
  }
  return total;
}

/** Extract total purchase / lead value from action_values */
export function extractConversionValue(actionValues?: RawActionValue[]): number {
  if (!Array.isArray(actionValues) || actionValues.length === 0) return 0;

  const valueKeys = [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "lead",
    "offsite_conversion.fb_pixel_lead",
  ];

  for (const key of valueKeys) {
    const found = actionValues.find((a) => a.action_type === key);
    if (found) return toNum(found.value);
  }

  let sum = 0;
  for (const v of actionValues) {
    sum += toNum(v.value);
  }
  return sum;
}

/** Extract video views action count from video actions array */
export function extractVideoActionCount(actions?: RawActionValue[]): number {
  if (!Array.isArray(actions) || actions.length === 0) return 0;
  const found = actions.find(
    (a) =>
      a.action_type === "video_view" ||
      a.action_type?.includes("video") ||
      true,
  );
  return found ? toNum(found.value) : toNum(actions[0]?.value);
}

/** Parse hour integer (0..23) from Meta hourly breakdown string */
export function parseHourlyString(raw?: string): number | undefined {
  if (!raw) return undefined;
  // Format is typically "00:00:00 - 00:59:59"
  const match = /^(\d{2}):/.exec(raw);
  if (match) {
    const h = parseInt(match[1], 10);
    if (h >= 0 && h <= 23) return h;
  }
  return undefined;
}

/**
 * Extract human-readable error from Meta Graph API response without leaking credentials.
 */
export function extractMetaAdsError(body: unknown): string {
  let message = "";
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: string; error_user_msg?: string };
      };
      message =
        parsed.error?.error_user_msg ||
        parsed.error?.message ||
        body.slice(0, 300);
    } catch {
      message = body.slice(0, 300);
    }
  } else if (typeof body === "object" && body !== null) {
    const errObj = body as {
      error?: { message?: string; error_user_msg?: string };
      message?: string;
    };
    message =
      errObj.error?.error_user_msg ||
      errObj.error?.message ||
      errObj.message ||
      "Meta Marketing API request failed.";
  }

  if (!message) message = "Meta Marketing API request failed.";

  return message
    .replace(
      /(access_token|client_secret|appsecret_proof|secret|password)(\s*[=:]\s*)[^\s&]+/gi,
      "$1$2<redacted>",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>");
}

/**
 * Sanitize raw API responses (such as JSON from Graph API or exceptions)
 * before persisting to adActions.apiResponse or returning to the client.
 */
export function sanitizeApiResponse(val: unknown): string {
  if (val === undefined || val === null) return "";
  const str = typeof val === "string" ? val : JSON.stringify(val);
  return str
    .replace(
      /(access_token|refresh_token|client_secret|appsecret_proof|secret|password)(\s*[=:]\s*)[^\s&",]+/gi,
      "$1$2<redacted>",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>");
}

