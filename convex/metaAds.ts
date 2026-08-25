"use node";

import { action, internalAction, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import { runSync, sanitizeSyncError } from "./lib/runSync";
import { CRON_LOCKS, withCronLock } from "./lib/cronLock";
import {
  allowsBackground,
  createUsageTracker,
  readGate,
  type UsageTracker,
} from "./lib/metaRateLimit";
import {
  getMetaGraphVersion,
  normalizeAdAccountId,
  buildAdAccountsUrl,
  buildAdAccountUrl,
  buildCampaignsUrl,
  buildAdSetsUrl,
  buildAdsUrl,
  buildInsightsUrl,
  buildCustomAudiencesUrl,
  buildCustomAudienceCreateUrl,
  buildCustomAudienceUsersUrl,
  buildAdAccountTosUrl,
  buildAdPixelsUrl,
  parseTosResponse,
  TOS_INSTRUCTIONS_SR,
  TOS_UNKNOWN_MESSAGE_SR,
  validateLookalikeSpec,
  PREVIEW_CACHE_MAX_AGE_MS,
  buildAdPreviewUrl,
  buildTargetingSearchUrl,
  buildDeliveryEstimateUrl,
  formatEstimateRange,
  parseRateLimitHeaders,
  classifyMetaError,
  computeBreakdownHash,
  isKnownPlacement,
  extractConversionResults,
  extractConversionValue,
  extractVideoActionCount,
  extractActionBreakdowns,
  parseHourlyString,
  extractMetaAdsError,
  runInsightsAsync,
  toNumOrUndefined,
  MetaApiError,
  ASYNC_RANGE_DAY_THRESHOLD,
  type InsightsQueryParams,
  type RawAdInsightRow,
  type RawGraphApiResponse,
  type RateLimitStatus,
} from "./lib/metaAdsApi";
import { prepareHashedAudiencePayload, sanitizePii } from "./lib/metaAudienceHash";
import { META_INSIGHTS_VERSION } from "./lib/metaAdsCatalog";
import {
  createQuotaCollector,
  readGate as readAdsQuotaGate,
  allowsBackground as adsQuotaAllowsBackground,
  type MetaAdsQuotaCollector,
} from "./lib/metaAdsQuota";
import {
  planBackfill,
  narrowWindow,
  windowDays,
  type DateWindow,
} from "./lib/metaAdsBackfill";

/**
 * ============================================================================
 * META ADS ACTIONS & SYNC (Node Runtime)
 * ============================================================================
 *
 * Implements:
 *   1. syncAdsStructure: Ad hierarchy (campaign -> adset -> ad + creative)
 *      - Marks campaigns with spend in last 48h as "hot", else "cold"
 *      - Cron interval: every 3h
 *   2. syncAdsInsights:
 *      - Hot campaigns (mode: "hot"): every 15 min, TODAY at ad level,
 *        hourly granularity where available, plus age/gender & placement breakdowns
 *      - Cold + all (mode: "cold_all"): every 6h, daily level with 7-day lookback
 *        (attribution restatement), plus breakdowns
 *   3. Rate limit budget & batching:
 *      - Respects X-Business-Use-Case-Usage headers & backs off
 *      - Fair request allocation across campaigns
 *      - Logs API call counts in syncRuns
 *   4. Cron fan-outs for structure & insights syncs
 *
 * Missing credentials result in a clean no-op with syncRuns error "Meta Ads nije povezan".
 * ============================================================================
 */

const INSIGHTS_BATCH_CHUNK = 100;

/**
 * Koliko dugo prolaz sme da spava U MESTU kad Meta najavi blokadu (MA1).
 *
 * `estimated_time_to_regain_access` ume da bude i trideset minuta, a Convex
 * akcija toliko ne živi. Kraće blokade se odspavaju odmah; duže se ne spavaju
 * nego se prolaz povlači, a `metaAdsQuota.blockedUntil` drži kapiju zatvorenom
 * dok vreme ne prođe — sledeći cron tik je ponovni pokušaj.
 */
const INLINE_SLEEP_CAP_MS = 2 * 60_000;

/** Backoff za error_code 4 (opterećenje po sekundi). Sekunde, ne minuti. */
const INSIGHTS_THROTTLE_BACKOFF_MS = [5_000, 15_000];

/**
 * Koliko dugo se čeka asinhroni izveštaj unutar jedne akcije.
 *
 * Meta poslu daje sat vremena (ASYNC_MAX_WAIT_MS); akcija nema toliko, pa se
 * ovde čeka kraće i, ako posao nije gotov, prolaz odustaje bez upisa. Sledeći
 * prolaz šalje nov posao — report_run_id iz ovog se ne pamti.
 */
const ASYNC_ACTION_BUDGET_MS = 4 * 60_000;

// ── Date Helpers ─────────────────────────────────────────────────────────────

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function toNum(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Prolaz se povlači jer je Meta najavila blokadu dužu od onoga što se spava. */
class MetaStandDownError extends Error {
  constructor(readonly minutes: number) {
    super(
      `Meta je ograničila pozive; nastavak za ~${Math.ceil(minutes)} min.`,
    );
    this.name = "MetaStandDownError";
  }
}

// ── HTTP Fetcher with Rate-Limit & Error Handling ────────────────────────────

interface FetchMetaResult<T> {
  data: T[];
  rateLimit: RateLimitStatus;
  apiCalls: number;
  /**
   * Meta je nudila jos jednu stranicu, a petlja je stala (plafon stranica,
   * backoff ili odbijen poziv). Redovi su tada NEPOTPUNI, pa pozivalac ne sme
   * da upise prozor kao pokriven.
   */
  truncated: boolean;
}

async function fetchMetaGraphPage<T>(
  url: string,
  tracker: UsageTracker,
  collector?: MetaAdsQuotaCollector,
): Promise<{ items: T[]; nextUrl?: string; rateLimit: RateLimitStatus }> {
  // Through the tracker, like every Meta call (P2). Ads is the heaviest caller
  // in the app — the hot pass runs every fifteen minutes and pages — and it was
  // the largest of the blind spots that made the gate report "ok" at 100 %.
  // `parseRateLimitHeaders` below reads the SAME headers for its own pagination
  // brake and, since MA1, for the Ads-specific quota row too.
  const res = await tracker.fetch(url);
  const rateLimit = parseRateLimitHeaders(res.headers);
  collector?.record(rateLimit);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Tipizovano, ne golo Error: 1487534 i code 4 stižu kroz isti status i
    // traže suprotne lekove (MA1).
    throw classifyMetaError(body, { httpStatus: res.status, rateLimit });
  }

  const json = (await res.json()) as RawGraphApiResponse<T>;
  if (json.error) {
    throw classifyMetaError(json, { rateLimit });
  }

  const items = json.data ?? [];
  const nextUrl = json.paging?.next;
  return { items, nextUrl, rateLimit };
}

/**
 * Fetch all paginated items up to a maximum page limit.
 */
async function fetchAllPages<T>(
  initialUrl: string,
  maxPages: number = 10,
  onCall: (() => void) | undefined,
  tracker: UsageTracker,
  collector?: MetaAdsQuotaCollector,
): Promise<FetchMetaResult<T>> {
  const data: T[] = [];
  let currentUrl: string | undefined = initialUrl;
  let pageCount = 0;
  let lastRateLimit: RateLimitStatus = {
    present: false,
    buc: [],
    blocked: false,
    shouldBackoff: false,
  };

  while (currentUrl && pageCount < maxPages) {
    // Meta has already refused once in this pass, so the next page cannot
    // land either — asking anyway only lengthens the block (P2).
    if (tracker.throttled) break;

    if (onCall) onCall();
    pageCount++;

    const pageResult: {
      items: T[];
      nextUrl?: string;
      rateLimit: RateLimitStatus;
    } = await fetchMetaGraphPage<T>(currentUrl, tracker, collector);

    lastRateLimit = pageResult.rateLimit;
    data.push(...pageResult.items);
    currentUrl = pageResult.nextUrl;

    if (pageResult.rateLimit.shouldBackoff) {
      console.warn(
        `[Meta Ads API] Rate limit threshold reached (${pageResult.rateLimit.maxUsagePercent ?? "?"}%). Backing off pagination.`,
      );
      break;
    }
  }

  return {
    data,
    rateLimit: lastRateLimit,
    apiCalls: pageCount,
    truncated: currentUrl !== undefined,
  };
}

// ── Jedan insights upit, sa razdvojenom obradom grešaka (MA1) ────────────────

interface InsightsFetch {
  rows: RawAdInsightRow[];
  /** Prozor koji je STVARNO dohvaćen; undefined kad upit nije bio po datumu. */
  covered?: DateWindow;
  viaAsync: boolean;
  /** Paginacija je odsečena — `covered` opisuje pitanje, ne odgovor. */
  truncated: boolean;
}

/**
 * Dohvati jedan insights upit i raspetljaj tri potpuno različita neuspeha.
 *
 * `error_subcode 1487534` ("previše podataka") NIJE gušenje: kvota je
 * netaknuta, samo je jedan upit bio prevelik. Lek je uži opseg — jednom — pa
 * asinhroni izveštaj. Backoff bi tu bio čista šteta: na development sloju
 * ponovljena greška oduzima od satne kvote (−0.001 × greške korisnika).
 *
 * `error_code 4` jeste gušenje, ali po SEKUNDI: kratak backoff u sekundama i
 * ponovni pokušaj istog upita.
 *
 * Gušenje po BUC-u je jedino koje ima trajanje, i to u MINUTIMA.
 */
async function fetchInsights(
  base: InsightsQueryParams,
  window: DateWindow | undefined,
  opts: {
    tracker: UsageTracker;
    collector: MetaAdsQuotaCollector;
    countCall: () => void;
    maxPages?: number;
    label: string;
  },
): Promise<InsightsFetch> {
  const { tracker, collector, countCall, label } = opts;
  const maxPages = opts.maxPages ?? 10;

  const buildParams = (w?: DateWindow): InsightsQueryParams => ({
    ...base,
    ...(w ? { timeRange: { since: w.since, until: w.until } } : {}),
  });

  const runAsync = async (w?: DateWindow): Promise<InsightsFetch> => {
    countCall();
    const result = await runInsightsAsync<RawAdInsightRow>(buildParams(w), {
      maxWaitMs: ASYNC_ACTION_BUDGET_MS,
      fetchImpl: (input, init) => tracker.fetch(input, init),
      // Asinhroni put je najskuplji u modulu; bez ovoga bi njegovih nekoliko
      // desetina poziva bilo nevidljivo za kapiju kvote (MA1).
      onRateLimit: (status) => collector.record(status),
      onPoll: (status, percent) => {
        console.log(
          `[Meta Ads Async] ${label}: ${status}${percent !== undefined ? ` (${percent}%)` : ""}`,
        );
      },
    });
    return {
      rows: result.rows,
      covered: w,
      viaAsync: true,
      truncated: result.truncated,
    };
  };

  // Opseg širi od 30 dana Meta ionako ne servira sinhrono — ide odmah asinhrono.
  if (window && windowDays(window) > ASYNC_RANGE_DAY_THRESHOLD) {
    return await runAsync(window);
  }

  let attemptWindow = window;
  let narrowedOnce = false;
  let throttleAttempt = 0;

  for (;;) {
    try {
      const res = await fetchAllPages<RawAdInsightRow>(
        buildInsightsUrl(buildParams(attemptWindow)),
        maxPages,
        countCall,
        tracker,
        collector,
      );
      return {
        rows: res.data,
        covered: attemptWindow,
        viaAsync: false,
        truncated: res.truncated,
      };
    } catch (err) {
      if (!(err instanceof MetaApiError)) throw err;

      // 1. Previše podataka — suzi opseg TAČNO jednom, pa asinhrono. Nikad
      //    backoff: pauza ne čini upit manjim.
      if (err.kind === "too_much_data") {
        if (!narrowedOnce && attemptWindow) {
          const narrower = narrowWindow(attemptWindow);
          if (narrower) {
            narrowedOnce = true;
            attemptWindow = narrower;
            console.warn(
              `[Meta Ads API] ${label}: 1487534 — sužavam opseg na ${narrower.since}..${narrower.until}.`,
            );
            continue;
          }
        }
        console.warn(
          `[Meta Ads API] ${label}: 1487534 i posle suženja — prelazim na asinhroni izveštaj.`,
        );
        return await runAsync(attemptWindow);
      }

      // 2. Opterećenje insights-a po sekundi — kratak backoff i ponovo.
      if (err.kind === "insights_throttle") {
        const wait = INSIGHTS_THROTTLE_BACKOFF_MS[throttleAttempt];
        if (wait === undefined) throw err;
        throttleAttempt++;
        console.warn(
          `[Meta Ads API] ${label}: error_code 4 — pauza ${wait / 1000} s.`,
        );
        await sleep(wait);
        continue;
      }

      // 3. BUC je potrošen. Trajanje je u MINUTIMA i Meta ga je izričito rekla.
      if (err.kind === "buc_throttle") {
        const minutes = err.retryAfterMin ?? 0;
        const ms = minutes * 60_000;
        if (ms > 0 && ms <= INLINE_SLEEP_CAP_MS) {
          console.warn(
            `[Meta Ads API] ${label}: BUC gušenje — spavam ${minutes} min.`,
          );
          await sleep(ms);
          continue;
        }
        // Duže od onoga što akcija sme da prespava: povuci se. Kapija drži
        // ostatak zahvaljujući `blockedUntil` iz istog očitavanja.
        throw new MetaStandDownError(minutes);
      }

      throw err;
    }
  }
}

// ── Transform Insight Row Helper ─────────────────────────────────────────────

/** Nepoznati placement-i o kojima je ovaj isolate već upozorio (vidi dole). */
const warnedUnknownPlacements = new Set<string>();

function transformInsightRow(
  raw: RawAdInsightRow,
  adId: Id<"ads">,
  isHourly: boolean = false,
): {
  adId: Id<"ads">;
  date: string;
  hour?: number;
  breakdownHash: string;
  breakdown?: {
    age?: string;
    gender?: string;
    placement?: string;
    platform?: string;
    device?: string;
  };
  spend: number;
  impressions: number;
  clicks: number;
  reach?: number;
  frequency?: number;
  ctr?: number;
  uniqueCtr?: number;
  cpc?: number;
  cpm?: number;
  cpp?: number;
  video3s?: number;
  thruplay?: number;
  videoP25?: number;
  videoP50?: number;
  videoP75?: number;
  videoP95?: number;
  videoP100?: number;
  outboundCtr?: number;
  results?: number;
  conversionValue?: number;
  attributionSetting?: string;
  qualityRanking?: string;
  engagementRanking?: string;
  conversionRanking?: string;
  insightsVersion?: number;
} {
  const date = raw.date_start ?? isoDay(Date.now());
  const hour = isHourly
    ? parseHourlyString(raw.hourly_stats_aggregated_by_audience_time_zone)
    : undefined;

  const platform = raw.publisher_platform;
  const placement = raw.platform_position;

  if (platform || placement) {
    if (!isKnownPlacement(platform, placement)) {
      // Jedno upozorenje po JEDINSTVENOJ kombinaciji, ne po redu: sync ume da
      // vrati hiljade redova sa istim nepoznatim placement-om i tada se
      // upozorenje utopi u sopstvenom ponavljanju.
      const key = `${platform ?? ""}|${placement ?? ""}`;
      if (!warnedUnknownPlacements.has(key)) {
        warnedUnknownPlacements.add(key);
        console.warn(
          `[Meta Ads Sync] Nepoznat placement sa Meta API-ja: publisher_platform="${platform ?? ""}", platform_position="${placement ?? ""}". Beleži se pod originalnim imenom.`,
        );
      }
    }
  }

  const breakdown =
    raw.age ||
    raw.gender ||
    platform ||
    placement ||
    raw.device_platform
      ? {
          age: raw.age,
          gender: raw.gender,
          platform,
          placement,
          device: raw.device_platform,
        }
      : undefined;

  const breakdownHash = computeBreakdownHash(breakdown);

  // Core metrics: spend, impressions, clicks are always returned by Meta and 0 is true zero
  const spend = toNumOrUndefined(raw.spend) ?? 0;
  const impressions = toNumOrUndefined(raw.impressions) ?? 0;
  const clicks = toNumOrUndefined(raw.clicks) ?? 0;

  // Optional metrics: omitted if not returned by Meta (never write 0 for unknown)
  const reach = toNumOrUndefined(raw.reach);
  const frequency = toNumOrUndefined(raw.frequency);
  const ctr = toNumOrUndefined(raw.ctr);
  const uniqueCtr = toNumOrUndefined(raw.unique_ctr);
  const cpc = toNumOrUndefined(raw.cpc);
  const cpm = toNumOrUndefined(raw.cpm);
  const cpp = toNumOrUndefined(raw.cpp);

  const video3s = extractVideoActionCount(raw.video_3_sec_watched_actions);
  const thruplay = extractVideoActionCount(raw.video_thruplay_watched_actions);
  const videoP25 = extractVideoActionCount(raw.video_p25_watched_actions);
  const videoP50 = extractVideoActionCount(raw.video_p50_watched_actions);
  const videoP75 = extractVideoActionCount(raw.video_p75_watched_actions);
  const videoP95 = extractVideoActionCount(raw.video_p95_watched_actions);
  const videoP100 = extractVideoActionCount(raw.video_p100_watched_actions);

  let outboundCtr: number | undefined;
  if (Array.isArray(raw.outbound_clicks_ctr) && raw.outbound_clicks_ctr.length > 0) {
    outboundCtr = toNumOrUndefined(raw.outbound_clicks_ctr[0]?.value);
  } else if (raw.outbound_clicks_ctr !== undefined) {
    outboundCtr = toNumOrUndefined(raw.outbound_clicks_ctr);
  }

  const results = extractConversionResults(raw.actions);
  const conversionValue = extractConversionValue(raw.action_values);

  return {
    adId,
    date,
    hour,
    breakdownHash,
    breakdown,
    spend,
    impressions,
    clicks,
    reach,
    frequency,
    ctr,
    uniqueCtr,
    cpc,
    cpm,
    cpp,
    video3s,
    thruplay,
    videoP25,
    videoP50,
    videoP75,
    videoP95,
    videoP100,
    outboundCtr,
    results,
    conversionValue,
    // Read-only: koja je postavka atribucije dala baš ove brojeve (MA1).
    // Kad ga Meta ne pošalje, ostaje undefined — ne izmišlja se vrednost.
    attributionSetting: raw.attribution_setting,
    qualityRanking: raw.quality_ranking,
    engagementRanking: raw.engagement_rate_ranking,
    conversionRanking: raw.conversion_rate_ranking,
    insightsVersion: META_INSIGHTS_VERSION,
  };
}

// ── Structure Sync Action ───────────────────────────────────────────────────

/**
 * syncAdsStructure (cron every 3h):
 * Pulls campaign -> adset -> ad hierarchy incl. status, budgets, creative details.
 * Evaluates spend in the last 48h and flags campaigns as syncPriority "hot" vs "cold".
 */
export const syncAdsStructure = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }): Promise<void> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (conn === null) {
      throw new Error("Meta Ads konekcija nije pronađena.");
    }
    if (conn.provider !== "meta_ads") {
      throw new Error("Konekcija nije Meta Ads provajder.");
    }
    const workspaceId: Id<"workspaces"> = conn.workspaceId;

    // Every Meta answer says how much of the shared allowance is spent, and
    // Ads is the pass that spends the most of it (P2). One tracker per run,
    // flushed once — a mutation per HTTP call would cost more than the calls.
    const tracker = createUsageTracker();

    // I kapija specifična za Oglase čita ista zaglavlja (MA1).
    const collector = createQuotaCollector();

    // The reading is worth just as much on the failing path — a call that
    // came back 429 is exactly the one the gate needs to hear about (P2).
    try {
      await runSync(
        ctx,
        { workspaceId, provider: "meta_ads", connectionId },
        async (): Promise<number> => {
          if (!conn.encryptedCredentials) {
            throw new Error("Meta Ads nije povezan");
          }

          let token: string;
          try {
            token = await decryptCredentials(conn.encryptedCredentials);
          } catch {
            throw new Error("Meta Ads nije povezan");
          }

          const trimmedToken = token.trim();
          if (!trimmedToken) {
            throw new Error("Meta Ads nije povezan");
          }

          const version = getMetaGraphVersion();
          let apiCalls = 0;
          const countCall = () => {
            apiCalls++;
          };

          // 1. Identify Ad Account(s)
          let primaryAccountId = (conn.externalId ?? "").trim();
          let accountName = "Meta Ad Account";
          let accountCurrency = "USD";

          if (primaryAccountId) {
            try {
              countCall();
              const actRes = await tracker.fetch(
                buildAdAccountUrl(primaryAccountId, trimmedToken, version),
              );
              if (actRes.ok) {
                const actData = (await actRes.json()) as {
                  id?: string;
                  account_id?: string;
                  name?: string;
                  currency?: string;
                };
                if (actData.name) accountName = actData.name;
                if (actData.currency) accountCurrency = actData.currency;
              }
            } catch {
              // Keep fallback account metadata
            }
          } else {
            // Discover accounts via /me/adaccounts
            countCall();
            const meRes = await tracker.fetch(
              buildAdAccountsUrl(trimmedToken, version),
            );
            if (!meRes.ok) {
              const errBody = await meRes.text().catch(() => "");
              throw new Error(`Meta Ad Accounts greška: ${extractMetaAdsError(errBody)}`);
            }
            const meData = (await meRes.json()) as {
              data?: Array<{
                id: string;
                account_id?: string;
                name?: string;
                currency?: string;
              }>;
            };

            const firstAct = meData.data?.[0];
            if (!firstAct || !firstAct.id) {
              throw new Error("Nije pronađen nijedan Meta Ad nalog za dati token.");
            }
            primaryAccountId = firstAct.id;
            accountName = firstAct.name ?? "Meta Ad Account";
            accountCurrency = firstAct.currency ?? "USD";
          }

          const normalizedActId = normalizeAdAccountId(primaryAccountId);

          // 2. Upsert Ad Account document
          const adAccountId: Id<"adAccounts"> = await ctx.runMutation(
            internal.metaAdsStore.upsertAdAccount,
            {
              workspaceId,
              provider: "meta_ads",
              externalId: normalizedActId,
              name: accountName,
              currency: accountCurrency,
            },
          );

          // 3. Fetch Campaigns
          const campaignsRes = await fetchAllPages<{
            id: string;
            name: string;
            objective?: string;
            status: string;
            effective_status?: string;
            daily_budget?: string;
            lifetime_budget?: string;
          }>(
            buildCampaignsUrl(normalizedActId, trimmedToken, 500, version),
            10,
            countCall,
            tracker,
            collector,
          );

          // 4. Fetch 48h spend to classify hot vs cold campaigns
          const spend48hMap = new Map<string, number>();
          try {
            const spend48hUrl = buildInsightsUrl({
              targetId: normalizedActId,
              level: "campaign",
              datePreset: "last_2d",
              limit: 500,
              accessToken: trimmedToken,
              version,
            });
            const spendRes = await fetchAllPages<{
              campaign_id?: string;
              spend?: string | number;
            }>(spend48hUrl, 5, countCall, tracker, collector);

            for (const item of spendRes.data) {
              if (item.campaign_id) {
                const prev = spend48hMap.get(item.campaign_id) ?? 0;
                spend48hMap.set(item.campaign_id, prev + toNum(item.spend));
              }
            }
          } catch (err) {
            console.warn(
              "[Meta Ads Sync] 48h spend lookup warning:",
              sanitizeSyncError(err),
            );
          }

          const campaigns = campaignsRes.data.map((c) => {
            const spend48h = spend48hMap.get(c.id) ?? 0;
            const isActive =
              c.status === "ACTIVE" || c.effective_status === "ACTIVE";
            const syncPriority: "hot" | "cold" =
              spend48h > 0 || (isActive && spend48h > 0) ? "hot" : "cold";

            return {
              externalId: c.id,
              name: c.name || "Bez naziva",
              objective: c.objective,
              status: c.status || "PAUSED",
              dailyBudget: c.daily_budget ? toNum(c.daily_budget) / 100 : undefined,
              lifetimeBudget: c.lifetime_budget
                ? toNum(c.lifetime_budget) / 100
                : undefined,
              syncPriority,
            };
          });

          // 5. Fetch AdSets
          const adSetsRes = await fetchAllPages<{
            id: string;
            campaign_id: string;
            name: string;
            status: string;
            effective_status?: string;
            daily_budget?: string;
            lifetime_budget?: string;
            targeting?: Record<string, unknown>;
          }>(
            buildAdSetsUrl(normalizedActId, trimmedToken, 500, version),
            10,
            countCall,
            tracker,
            collector,
          );

          const adSets = adSetsRes.data.map((s) => ({
            externalId: s.id,
            campaignExternalId: s.campaign_id,
            name: s.name || "Bez naziva",
            status: s.status || "PAUSED",
            targetingSummary: s.targeting ? JSON.stringify(s.targeting) : undefined,
            dailyBudget: s.daily_budget ? toNum(s.daily_budget) / 100 : undefined,
            lifetimeBudget: s.lifetime_budget
              ? toNum(s.lifetime_budget) / 100
              : undefined,
          }));

          // 6. Fetch Ads with Creatives
          const adsRes = await fetchAllPages<{
            id: string;
            adset_id: string;
            campaign_id?: string;
            name: string;
            status: string;
            effective_status?: string;
            creative?: {
              id?: string;
              name?: string;
              thumbnail_url?: string;
              image_url?: string;
            };
          }>(
            buildAdsUrl(normalizedActId, trimmedToken, 500, version),
            10,
            countCall,
            tracker,
            collector,
          );

          const ads = adsRes.data.map((a) => ({
            externalId: a.id,
            adSetExternalId: a.adset_id,
            name: a.name || "Bez naziva",
            status: a.status || "PAUSED",
            creativeId: a.creative?.id,
            hookLabel: undefined,
            thumbnailUrl: a.creative?.thumbnail_url || a.creative?.image_url,
            previewUrl: a.creative?.image_url,
          }));

          // 7. Atomically persist structure
          const written: number = await ctx.runMutation(
            internal.metaAdsStore.upsertStructure,
            {
              workspaceId,
              accountId: adAccountId,
              campaigns,
              adSets,
              ads,
            },
          );

          // 8. Fetch Custom Audiences & Check ToS (MA-Publike)
          try {
            // Check ToS first via unified gate
            countCall();
            await evaluateAudienceTos(
              ctx,
              {
                workspaceId,
                adAccountId,
                actId: normalizedActId,
                token: trimmedToken,
              },
              tracker,
            );

            // Fetch Audiences
            const audiencesRes = await fetchAllPages<{
              id: string;
              name: string;
              subtype: string;
              description?: string;
              approximate_count_lower_bound?: number | string;
              approximate_count_upper_bound?: number | string;
              operation_status?:
                | { code?: number; description?: string }
                | string;
              delivery_status?:
                | { code?: number; description?: string }
                | string;
              time_content_updated?: number | string;
              retention_days?: number | string;
              rule_aggregation?: string;
            }>(
              buildCustomAudiencesUrl(
                normalizedActId,
                trimmedToken,
                500,
                version,
              ),
              10,
              countCall,
              tracker,
              collector,
            );

            const audiences = audiencesRes.data.map((aud) => {
              const lower = toNumOrUndefined(aud.approximate_count_lower_bound);
              const upper = toNumOrUndefined(aud.approximate_count_upper_bound);
              const retDays = toNumOrUndefined(aud.retention_days);
              const rawTime = toNumOrUndefined(aud.time_content_updated);
              let timeUpdated: number | undefined;
              if (rawTime !== undefined && rawTime > 0) {
                timeUpdated = rawTime < 1e11 ? rawTime * 1000 : rawTime;
              }

              let opStatus: string | undefined;
              if (
                typeof aud.operation_status === "object" &&
                aud.operation_status !== null
              ) {
                opStatus =
                  aud.operation_status.description ||
                  String(aud.operation_status.code || "");
              } else if (typeof aud.operation_status === "string") {
                opStatus = aud.operation_status;
              }

              let delivStatus: string | undefined;
              if (
                typeof aud.delivery_status === "object" &&
                aud.delivery_status !== null
              ) {
                delivStatus =
                  aud.delivery_status.description ||
                  String(aud.delivery_status.code || "");
              } else if (typeof aud.delivery_status === "string") {
                delivStatus = aud.delivery_status;
              }

              return {
                audienceId: aud.id,
                name: aud.name || "Bez naziva",
                subtype: aud.subtype || "CUSTOM",
                description: aud.description || undefined,
                approximateCountLower:
                  lower !== undefined && lower >= 0 ? lower : undefined,
                approximateCountUpper:
                  upper !== undefined && upper >= 0 ? upper : undefined,
                operationStatus: opStatus || undefined,
                deliveryStatus: delivStatus || undefined,
                timeContentUpdated: timeUpdated,
                retentionDays:
                  retDays !== undefined && retDays > 0 ? retDays : undefined,
                ruleAggregation: aud.rule_aggregation || undefined,
              };
            });

            if (audiences.length > 0) {
              await ctx.runMutation(
                internal.metaAdsStore.upsertAudiencesBatch,
                {
                  workspaceId,
                  adAccountId,
                  audiences,
                  syncedAt: Date.now(),
                },
              );
            }
          } catch (audErr) {
            console.warn(
              "[Meta Ads Sync] Custom Audiences sync warning:",
              sanitizeSyncError(audErr),
            );
          }

          console.log(
            `[Meta Ads Sync] Structure sync finished. API calls: ${apiCalls}, campaigns: ${campaigns.length}, adSets: ${adSets.length}, ads: ${ads.length}`,
          );

          return written;
        },
      );
    } finally {
      await tracker.flush(ctx, workspaceId);
      await collector.flush(ctx, workspaceId);
    }
  },
});

// ── Insights Sync Action ────────────────────────────────────────────────────

/**
 * Tri upita „vrućeg” prolaza: današnji dan po satu, pa dva razdvajanja.
 * Isti spisak kao pre MA1 — nijedna metrika ni razdvajanje nisu dodati.
 */
const HOT_SCOPES: Array<{
  key: string;
  breakdowns?: string[];
  hourly: boolean;
}> = [
  {
    key: "hourly",
    breakdowns: ["hourly_stats_aggregated_by_audience_time_zone"],
    hourly: true,
  },
  { key: "demo", breakdowns: ["age", "gender"], hourly: false },
  {
    key: "placement",
    breakdowns: ["publisher_platform", "platform_position"],
    hourly: false,
  },
];

/** Tri upita „hladnog” prolaza. Svaki napreduje kroz backfill nezavisno. */
const COLD_SCOPES: Array<{ key: string; breakdowns?: string[] }> = [
  { key: "daily", breakdowns: undefined },
  { key: "demo", breakdowns: ["age", "gender"] },
  {
    key: "placement",
    breakdowns: ["publisher_platform", "platform_position"],
  },
];

/**
 * syncAdsInsights:
 * Mode "hot": Every 15 min for active/hot campaigns (today at ad-level, hourly + breakdowns)
 * Mode "cold_all": Every 6h for all campaigns (daily level). Prozor je od MA1
 * 28 dana — koliko traje restatement atribucije — ali se osvaja po 7 dana po
 * prolazu, uz poslednja 3 dana koja se osvežavaju uvek. Vidi
 * `convex/lib/metaAdsBackfill.ts`.
 */
export const syncAdsInsights = internalAction({
  args: {
    connectionId: v.id("connections"),
    mode: v.union(v.literal("hot"), v.literal("cold_all")),
  },
  handler: async (ctx, { connectionId, mode }): Promise<void> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (conn === null) {
      throw new Error("Meta Ads konekcija nije pronađena.");
    }
    if (conn.provider !== "meta_ads") {
      throw new Error("Konekcija nije Meta Ads provajder.");
    }
    const workspaceId: Id<"workspaces"> = conn.workspaceId;

    // Every Meta answer says how much of the shared allowance is spent, and
    // Ads is the pass that spends the most of it (P2). One tracker per run,
    // flushed once — a mutation per HTTP call would cost more than the calls.
    const tracker = createUsageTracker();

    // Uz zajedničku kapiju ide i kapija specifična za Oglase (MA1): ista
    // zaglavlja, ali sa BUC tipovima, slojem pristupa i trajanjem blokade.
    const collector = createQuotaCollector();

    // The reading is worth just as much on the failing path — a call that
    // came back 429 is exactly the one the gate needs to hear about (P2).
    try {
      await runSync(
        ctx,
        { workspaceId, provider: "meta_ads", connectionId },
        async (): Promise<{ itemsWritten: number; note?: string }> => {
          if (!conn.encryptedCredentials) {
            throw new Error("Meta Ads nije povezan");
          }

          let token: string;
          try {
            token = await decryptCredentials(conn.encryptedCredentials);
          } catch {
            throw new Error("Meta Ads nije povezan");
          }

          const trimmedToken = token.trim();
          if (!trimmedToken) {
            throw new Error("Meta Ads nije povezan");
          }

          const version = getMetaGraphVersion();
          let apiCalls = 0;
          const countCall = () => {
            apiCalls++;
          };

          // Map external ad IDs to Convex ad IDs
          const adIdMap: Record<string, string> = await ctx.runQuery(
            internal.metaAdsStore.getAdIdMap,
            { workspaceId },
          );

          const adExternalIds = Object.keys(adIdMap);
          if (adExternalIds.length === 0) {
            // No ads in workspace yet -> nothing to pull insights for
            return { itemsWritten: 0 };
          }

          const accounts = await ctx.runQuery(internal.metaAdsStore.getAccounts, {
            workspaceId,
            provider: "meta_ads",
          });

          if (accounts.length === 0) {
            return { itemsWritten: 0 };
          }

          let totalWritten = 0;
          let standDownNote: string | undefined;

          for (const account of accounts) {
            // Once Meta has refused, none of the remaining reads can land (P2).
            if (tracker.throttled || standDownNote) break;

            const actId = normalizeAdAccountId(account.externalId);

            const baseParams = (
              breakdowns: string[] | undefined,
            ): InsightsQueryParams => ({
              targetId: actId,
              level: "ad",
              breakdowns,
              limit: 500,
              accessToken: trimmedToken,
              version,
            });

            /** Upiši redove u komadima; vrati koliko ih je upisano. */
            const writeRows = async (
              raws: RawAdInsightRow[],
              hourly: boolean,
            ): Promise<number> => {
              const rows = [];
              const actionBreakdownRows = [];

              for (const raw of raws) {
                if (!raw.ad_id || !adIdMap[raw.ad_id]) continue;
                const adId = adIdMap[raw.ad_id] as Id<"ads">;
                rows.push(transformInsightRow(raw, adId, hourly));

                // Ekstrakcija razlaganja po tipu akcije i po prozoru atribucije (MA2)
                const date = raw.date_start ?? isoDay(Date.now());
                const breakdown =
                  raw.age ||
                  raw.gender ||
                  raw.publisher_platform ||
                  raw.platform_position ||
                  raw.device_platform
                    ? {
                        age: raw.age,
                        gender: raw.gender,
                        platform: raw.publisher_platform,
                        placement: raw.platform_position,
                        device: raw.device_platform,
                      }
                    : undefined;
                const breakdownHash = computeBreakdownHash(breakdown);

                const extracted = extractActionBreakdowns(
                  raw.actions,
                  raw.action_values,
                  raw.cost_per_action_type,
                );
                for (const item of extracted) {
                  actionBreakdownRows.push({
                    adId,
                    date,
                    breakdownHash,
                    actionType: item.actionType,
                    window: item.window,
                    count: item.count,
                    value: item.value,
                    costPer: item.costPer,
                  });
                }
              }

              let written = 0;
              for (let i = 0; i < rows.length; i += INSIGHTS_BATCH_CHUNK) {
                written += await ctx.runMutation(
                  internal.metaAdsStore.upsertInsightsBatch,
                  {
                    workspaceId,
                    rows: rows.slice(i, i + INSIGHTS_BATCH_CHUNK),
                  },
                );
              }

              for (let i = 0; i < actionBreakdownRows.length; i += INSIGHTS_BATCH_CHUNK) {
                await ctx.runMutation(
                  internal.metaAdsStore.upsertActionBreakdownsBatch,
                  {
                    workspaceId,
                    rows: actionBreakdownRows.slice(i, i + INSIGHTS_BATCH_CHUNK),
                  },
                );
              }

              return written;
            };

            if (mode === "hot") {
              // Mode "hot": danas, na nivou oglasa. Prozor je jedan dan, pa
              // backfill ovde nema šta da radi.
              const hotCampaigns = await ctx.runQuery(
                internal.metaAdsStore.getCampaignsByPriority,
                { workspaceId, priority: "hot" },
              );

              if (hotCampaigns.length === 0) {
                continue;
              }

              for (const scope of HOT_SCOPES) {
                if (tracker.throttled || standDownNote) break;
                try {
                  const res = await fetchInsights(
                    {
                      ...baseParams(scope.breakdowns),
                      datePreset: "today",
                    },
                    undefined,
                    {
                      tracker,
                      collector,
                      countCall,
                      maxPages: 5,
                      label: `hot/${scope.key}`,
                    },
                  );
                  totalWritten += await writeRows(res.rows, scope.hourly);
                } catch (err) {
                  if (err instanceof MetaStandDownError) {
                    standDownNote = err.message;
                    break;
                  }
                  console.warn(
                    `[Meta Ads Sync] hot/${scope.key} warning:`,
                    sanitizeSyncError(err),
                  );
                }
              }
            } else {
              // Mode "cold_all": 28-dnevni prozor restatement-a, osvajan po 7
              // dana po prolazu (MA1). Svaki scope ima svoj red u
              // `metaAdsBackfill` jer napreduju nezavisno — onaj koji padne ne
              // sme da pomeri ostale.
              const today = isoDay(Date.now());

              for (const scope of COLD_SCOPES) {
                if (tracker.throttled || standDownNote) break;

                const backfillScope = `${account.externalId}:${scope.key}`;
                const state = await ctx.runQuery(
                  internal.metaAdsStore.getBackfill,
                  { workspaceId, scope: backfillScope },
                );
                const plan = planBackfill(
                  today,
                  state?.oldestSyncedDate ?? undefined,
                );

                // Poslednja 3 dana uvek; komad dubine samo dok 28 nije
                // pokriveno. Kad se prozori dodiruju, plan ih spoji u jedan.
                const windows: DateWindow[] = plan.chunk
                  ? [plan.refresh, plan.chunk]
                  : [plan.refresh];

                let deepestCovered: string | undefined;
                let failed = false;

                for (const window of windows) {
                  try {
                    const res = await fetchInsights(
                      {
                        ...baseParams(scope.breakdowns),
                        timeIncrement: 1,
                      },
                      window,
                      {
                        tracker,
                        collector,
                        countCall,
                        maxPages: 10,
                        label: `cold/${scope.key} ${window.since}..${window.until}`,
                      },
                    );
                    totalWritten += await writeRows(res.rows, false);

                    // Odsečena paginacija znači da su redovi za ovaj prozor
                    // nepotpuni. Upisani jesu (bolje delimično nego ništa), ali
                    // backfill se NE pomera — inače bi ovi dani bili zauvek
                    // zapamćeni kao pokriveni brojevima kojih nema.
                    if (res.truncated) {
                      failed = true;
                      console.warn(
                        `[Meta Ads Sync] cold/${scope.key} ${window.since}..${window.until}: paginacija odsečena, backfill se ne pomera.`,
                      );
                      continue;
                    }

                    // Ako je opseg usput sužen, pomera se samo do onoga što je
                    // stvarno stiglo — inače bi backfill preskočio dane koje
                    // nikada nije doneo.
                    const covered = res.covered?.since ?? window.since;
                    if (
                      deepestCovered === undefined ||
                      covered < deepestCovered
                    ) {
                      deepestCovered = covered;
                    }
                  } catch (err) {
                    failed = true;
                    if (err instanceof MetaStandDownError) {
                      standDownNote = err.message;
                      break;
                    }
                    console.warn(
                      `[Meta Ads Sync] cold/${scope.key} ${window.since}..${window.until} warning:`,
                      sanitizeSyncError(err),
                    );
                  }
                }

                if (!failed && deepestCovered !== undefined) {
                  await ctx.runMutation(
                    internal.metaAdsStore.advanceBackfill,
                    {
                      workspaceId,
                      scope: backfillScope,
                      oldestSyncedDate: deepestCovered,
                      // Plan je nameravao da zatvori 28 dana; „zatvoreno” je
                      // samo ako je najstariji dan koji je STVARNO stigao onaj
                      // koji je plan tražio (suženje opsega ga pomera unapred).
                      complete: plan.complete && deepestCovered === plan.nextOldest,
                      restarted: plan.restarted,
                    },
                  );
                }
              }
            }
          }

          console.log(
            `[Meta Ads Sync] ${mode} insights sync completed. API calls: ${apiCalls}, items written: ${totalWritten}`,
          );

          return { itemsWritten: totalWritten, note: standDownNote };
        },
      );
    } finally {
      await tracker.flush(ctx, workspaceId);
      await collector.flush(ctx, workspaceId);
    }
  },
});

// ── Cron Fan-Outs ───────────────────────────────────────────────────────────

/**
 * Read the rate-limit gate before a Meta Ads pass, and stand down if it is not
 * clean (R1/3).
 *
 * Ads is the heaviest caller in the app and, before this, the ONLY scheduled
 * Meta pass that did not read the gate: it reported its own spend and then, on
 * the next 15-minute tick, walked straight back into the backoff it had just
 * armed — extending it. Now it asks first, like Instagram and Facebook do, and
 * records the skip so Settings can say why it went quiet.
 *
 * Returns `true` when the pass may run. `listByProvider` already drops
 * disconnecting connections, so a `null` connection here just means it vanished
 * between the list and the read.
 */
async function shouldRunAds(
  ctx: ActionCtx,
  connectionId: Id<"connections">,
  job: string,
): Promise<boolean> {
  const conn: Doc<"connections"> | null = await ctx.runQuery(
    internal.connections.getForSync,
    { connectionId },
  );
  if (conn === null) return false;

  const gate = await readGate(ctx, conn.workspaceId);
  if (!allowsBackground(gate)) {
    await ctx.runMutation(internal.metaSyncStore.recordJob, {
      workspaceId: conn.workspaceId,
      provider: "meta_ads",
      job,
      ok: false,
      skipReason:
        gate.state === "backoff"
          ? "Meta privremeno ograničava pozive; prolaz oglasa preskočen."
          : "Potrošnja Meta limita je previsoka; prolaz oglasa preskočen.",
    });
    return false;
  }

  // Druga kapija, iz Ads zaglavlja (MA1). Zajednička kapija gleda X-App-Usage
  // preko svih Meta proizvoda; ova gleda BUC po nalogu i opterećenje insights-a
  // po sekundi, a Meta guši po onome što prvo dođe do 100 — pa mora obe.
  const adsGate = await readAdsQuotaGate(ctx, conn.workspaceId);
  if (adsQuotaAllowsBackground(adsGate)) return true;

  await ctx.runMutation(internal.metaSyncStore.recordJob, {
    workspaceId: conn.workspaceId,
    provider: "meta_ads",
    job,
    ok: false,
    skipReason:
      adsGate.blockedUntil !== undefined
        ? "Meta je ograničila Marketing API; prolaz oglasa čeka isticanje blokade."
        : `Potrošnja kvote Meta oglasa je ${Math.round(adsGate.peakPct)} %; prolaz oglasa preskočen.`,
  });
  return false;
}

/**
 * Cron fan-out (every 3h): sync structure for every Meta Ads connection.
 */
export const syncAllAdsStructure = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    // One run at a time (P2). Convex fires a cron on its own clock and does not
    // ask whether the previous firing has finished; a pass that outgrows its
    // cadence would otherwise run as two copies over the same allowance.
    await withCronLock(ctx, CRON_LOCKS.adsStructure, async () => {
      const connectionIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_ads" },
      );

      for (const connectionId of connectionIds) {
        try {
          // Gate first (R1/3): standing down beats extending an active backoff.
          if (!(await shouldRunAds(ctx, connectionId, "structure"))) continue;
          await ctx.runAction(internal.metaAds.syncAdsStructure, { connectionId });
        } catch {
          // Error is logged on syncRuns; continue with next connection
        }
      }
    });
  },
});

/**
 * Cron fan-out (every 15 min): sync hot campaigns insights.
 */
export const syncHotAdsInsights = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    // One run at a time (P2). Convex fires a cron on its own clock and does not
    // ask whether the previous firing has finished; a pass that outgrows its
    // cadence would otherwise run as two copies over the same allowance.
    await withCronLock(ctx, CRON_LOCKS.adsHot, async () => {
      const connectionIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_ads" },
      );

      for (const connectionId of connectionIds) {
        try {
          if (!(await shouldRunAds(ctx, connectionId, "hot"))) continue;
          await ctx.runAction(internal.metaAds.syncAdsInsights, {
            connectionId,
            mode: "hot",
          });
        } catch {
          // Error is logged on syncRuns; continue with next connection
        }
      }
    });
  },
});

/**
 * Cron fan-out (every 6h): sync 7-day daily insights for all campaigns.
 */
export const syncAllAdsInsights = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    // One run at a time (P2). Convex fires a cron on its own clock and does not
    // ask whether the previous firing has finished; a pass that outgrows its
    // cadence would otherwise run as two copies over the same allowance.
    await withCronLock(ctx, CRON_LOCKS.adsAll, async () => {
      const connectionIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_ads" },
      );

      for (const connectionId of connectionIds) {
        try {
          if (!(await shouldRunAds(ctx, connectionId, "all"))) continue;
          await ctx.runAction(internal.metaAds.syncAdsInsights, {
            connectionId,
            mode: "cold_all",
          });
        } catch {
          // Error is logged on syncRuns; continue with next connection
        }
      }
    });
  },
});

// ── Custom & Lookalike Audience Actions ─────────────────────────────────────

async function getMetaAdsAuth(
  ctx: ActionCtx,
  workspaceId?: Id<"workspaces">,
): Promise<{
  workspaceId: Id<"workspaces">;
  connectionId: Id<"connections">;
  token: string;
  actId: string;
  adAccountId: Id<"adAccounts">;
}> {
  const wsId =
    workspaceId ??
    ((await ctx.runQuery(api.workspaces.currentContext))?.workspace?.id as
      | Id<"workspaces">
      | undefined);
  if (!wsId) {
    throw new Error("Radni prostor nije izabran ili niste prijavljeni.");
  }

  const conn = await ctx.runQuery(internal.connections.getMetaAdsForWorkspace, {
    workspaceId: wsId,
  });
  if (!conn || !conn.encryptedCredentials) {
    throw new Error(
      "Meta Ads nalog nije povezan za ovaj radni prostor. Povežite ga u Podešavanjima.",
    );
  }

  const token = await decryptCredentials(conn.encryptedCredentials);
  if (!token.trim()) {
    throw new Error("Kredencijali za Meta Ads nisu validni.");
  }

  const account = await ctx.runQuery(internal.metaAdsStore.getAccounts, {
    workspaceId: wsId,
  });
  const firstAct = account?.[0];
  if (!firstAct) {
    throw new Error("Meta Ad nalog nije pronađen u bazi.");
  }

  return {
    workspaceId: wsId,
    connectionId: conn._id,
    token: token.trim(),
    actId: normalizeAdAccountId(firstAct.externalId),
    adAccountId: firstAct._id,
  };
}

const AUDIENCE_TOS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Unified gate for Custom Audience Terms of Service (ToS) (A1 & A2).
 *
 * Rules:
 *   1. Check local cache (unless forceRefresh). "accepted" and "not_accepted" cached for 1h.
 *   2. "unknown" is NEVER cached.
 *   3. If fetch fails -> status: "unknown" with checkedAt: 0 (never cached).
 *   4. If status is "not_accepted" and assertAccepted: throw Error(TOS_INSTRUCTIONS_SR(auth.actId)).
 *   5. If status is "unknown" and assertAccepted: throw Error(TOS_UNKNOWN_MESSAGE_SR(reason)).
 */
export async function evaluateAudienceTos(
  ctx: ActionCtx,
  auth: {
    workspaceId: Id<"workspaces">;
    adAccountId: Id<"adAccounts">;
    actId: string;
    token: string;
  },
  tracker: UsageTracker,
  options: {
    forceRefresh?: boolean;
    assertAccepted?: boolean;
  } = {},
): Promise<"accepted" | "not_accepted" | "unknown"> {
  const version = getMetaGraphVersion();

  // 1. Check local cache (unless forceRefresh)
  if (!options.forceRefresh) {
    const cached = await ctx.runQuery(
      internal.metaAdsStore.getAudienceTosInternal,
      { adAccountId: auth.adAccountId },
    );
    if (cached) {
      if (
        cached.status === "accepted" &&
        Date.now() - cached.checkedAt < AUDIENCE_TOS_CACHE_TTL_MS
      ) {
        return "accepted";
      }
      if (
        cached.status === "not_accepted" &&
        Date.now() - cached.checkedAt < AUDIENCE_TOS_CACHE_TTL_MS
      ) {
        if (options.assertAccepted) {
          throw new Error(TOS_INSTRUCTIONS_SR(auth.actId));
        }
        return "not_accepted";
      }
    }
  }

  // 2. Fetch from Meta Graph API
  const tosUrl = buildAdAccountTosUrl(auth.actId, auth.token, version);
  try {
    const res = await tracker.fetch(tosUrl);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const sanitizedErr = sanitizePii(extractMetaAdsError(errText));
      console.warn("[Meta Ads ToS] Provera ToS-a nije uspela:", sanitizedErr);

      // Record unknown with checkedAt: 0 so it is NEVER cached
      await ctx.runMutation(internal.metaAdsStore.recordAudienceTos, {
        workspaceId: auth.workspaceId,
        adAccountId: auth.adAccountId,
        status: "unknown",
        lastError: sanitizedErr,
        checkedAt: 0,
      });

      if (options.assertAccepted) {
        throw new Error(TOS_UNKNOWN_MESSAGE_SR(sanitizedErr));
      }
      return "unknown";
    }

    const json = await res.json();
    const status = parseTosResponse(json);

    await ctx.runMutation(internal.metaAdsStore.recordAudienceTos, {
      workspaceId: auth.workspaceId,
      adAccountId: auth.adAccountId,
      status,
      lastError: undefined,
      checkedAt: Date.now(),
    });

    if (status === "not_accepted" && options.assertAccepted) {
      throw new Error(TOS_INSTRUCTIONS_SR(auth.actId));
    }

    return status;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message.includes("Custom Audience Uslove korišćenja") ||
        err.message.includes("Ne mogu da proverim da li su uslovi"))
    ) {
      throw err;
    }
    const sanitizedMsg = sanitizePii(
      err instanceof Error ? err.message : String(err),
    );
    await ctx.runMutation(internal.metaAdsStore.recordAudienceTos, {
      workspaceId: auth.workspaceId,
      adAccountId: auth.adAccountId,
      status: "unknown",
      lastError: sanitizedMsg,
      checkedAt: 0,
    });

    if (options.assertAccepted) {
      throw new Error(TOS_UNKNOWN_MESSAGE_SR(sanitizedMsg));
    }
    return "unknown";
  }
}

/**
 * On-demand action to check and refresh Custom Audience Terms of Service (ToS) status.
 */
export const checkAudienceTosAction = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    adAccountId: v.optional(v.id("adAccounts")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    status: "accepted" | "not_accepted" | "unknown";
    checkedAt?: number;
    error?: string;
  }> => {
    const auth = await getMetaAdsAuth(ctx, args.workspaceId);
    const tracker = createUsageTracker();

    try {
      const status = await evaluateAudienceTos(ctx, auth, tracker, {
        forceRefresh: true,
      });
      return {
        status,
        checkedAt: status !== "unknown" ? Date.now() : undefined,
      };
    } catch (err: unknown) {
      return {
        status: "unknown",
        error: sanitizePii(
          err instanceof Error ? err.message : String(err),
        ),
      };
    } finally {
      await tracker.flush(ctx, auth.workspaceId);
    }
  },
});

/**
 * On-demand action to sync all Custom and Lookalike audiences from Meta Marketing API.
 */
export const syncAudiencesAction = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    adAccountId: v.optional(v.id("adAccounts")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; count: number; written: number }> => {
    const auth = await getMetaAdsAuth(ctx, args.workspaceId);
    const version = getMetaGraphVersion();
    const tracker = createUsageTracker();
    const collector = createQuotaCollector();

    try {
      // 1. Check ToS first via unified gate
      await evaluateAudienceTos(ctx, auth, tracker);

      // 2. Fetch custom audiences
      const audUrl = buildCustomAudiencesUrl(
        auth.actId,
        auth.token,
        500,
        version,
      );
      const res = await fetchAllPages<{
        id: string;
        name: string;
        subtype: string;
        description?: string;
        approximate_count_lower_bound?: number | string;
        approximate_count_upper_bound?: number | string;
        operation_status?: { code?: number; description?: string } | string;
        delivery_status?: { code?: number; description?: string } | string;
        time_content_updated?: number | string;
        retention_days?: number | string;
        rule_aggregation?: string;
      }>(audUrl, 10, undefined, tracker, collector);

      const audiences = res.data.map((aud) => {
        const lower = toNumOrUndefined(aud.approximate_count_lower_bound);
        const upper = toNumOrUndefined(aud.approximate_count_upper_bound);
        const retDays = toNumOrUndefined(aud.retention_days);
        const rawTime = toNumOrUndefined(aud.time_content_updated);
        let timeUpdated: number | undefined;
        if (rawTime !== undefined && rawTime > 0) {
          timeUpdated = rawTime < 1e11 ? rawTime * 1000 : rawTime;
        }

        let opStatus: string | undefined;
        if (
          typeof aud.operation_status === "object" &&
          aud.operation_status !== null
        ) {
          opStatus =
            aud.operation_status.description ||
            String(aud.operation_status.code || "");
        } else if (typeof aud.operation_status === "string") {
          opStatus = aud.operation_status;
        }

        let delivStatus: string | undefined;
        if (
          typeof aud.delivery_status === "object" &&
          aud.delivery_status !== null
        ) {
          delivStatus =
            aud.delivery_status.description ||
            String(aud.delivery_status.code || "");
        } else if (typeof aud.delivery_status === "string") {
          delivStatus = aud.delivery_status;
        }

        return {
          audienceId: aud.id,
          name: aud.name || "Bez naziva",
          subtype: aud.subtype || "CUSTOM",
          description: aud.description || undefined,
          approximateCountLower:
            lower !== undefined && lower >= 0 ? lower : undefined,
          approximateCountUpper:
            upper !== undefined && upper >= 0 ? upper : undefined,
          operationStatus: opStatus || undefined,
          deliveryStatus: delivStatus || undefined,
          timeContentUpdated: timeUpdated,
          retentionDays:
            retDays !== undefined && retDays > 0 ? retDays : undefined,
          ruleAggregation: aud.rule_aggregation || undefined,
        };
      });

      const written: number = await ctx.runMutation(
        internal.metaAdsStore.upsertAudiencesBatch,
        {
          workspaceId: auth.workspaceId,
          adAccountId: auth.adAccountId,
          audiences,
          syncedAt: Date.now(),
        },
      );

      return {
        success: true,
        count: audiences.length,
        written,
      };
    } finally {
      await tracker.flush(ctx, auth.workspaceId);
      await collector.flush(ctx, auth.workspaceId);
    }
  },
});

/**
 * Creates a Custom Audience from a customer list with SHA-256 hashed identifiers.
 * Enforces ToS Gate before any write.
 */
export const createCustomAudienceAction = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    description: v.optional(v.string()),
    customerFileSource: v.optional(v.string()), // "USER_PROVIDED_ONLY"
    users: v.optional(
      v.array(
        v.object({
          email: v.optional(v.string()),
          phone: v.optional(v.string()),
          firstName: v.optional(v.string()),
          lastName: v.optional(v.string()),
          city: v.optional(v.string()),
          country: v.optional(v.string()),
          zip: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ audienceId: string; name: string }> => {
    const auth = await getMetaAdsAuth(ctx, args.workspaceId);
    const version = getMetaGraphVersion();
    const tracker = createUsageTracker();

    try {
      // 1. ToS Gate verification (throws if not accepted or unknown)
      await evaluateAudienceTos(ctx, auth, tracker, { assertAccepted: true });

      // 2. Create the custom audience document on Meta
      const createUrl = buildCustomAudienceCreateUrl(
        auth.actId,
        auth.token,
        version,
      );
      const createBody = new URLSearchParams();
      createBody.set("name", args.name.trim());
      createBody.set("subtype", "CUSTOM");
      if (args.description) {
        createBody.set("description", args.description.trim());
      }
      createBody.set(
        "customer_file_source",
        args.customerFileSource || "USER_PROVIDED_ONLY",
      );

      const createRes = await tracker.fetch(createUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: createBody.toString(),
      });

      if (!createRes.ok) {
        const errText = await createRes.text().catch(() => "");
        throw new Error(
          `Meta Marketing API greška pri kreiranju publike: ${extractMetaAdsError(errText)}`,
        );
      }

      const createJson = (await createRes.json()) as { id?: string };
      const audienceId = createJson.id;
      if (!audienceId) {
        throw new Error("Meta nije vratila ID za kreiranu publiku.");
      }

      // 3. Upload hashed users payload if provided
      if (args.users && args.users.length > 0) {
        const hashedPayload = await prepareHashedAudiencePayload(args.users);
        if (hashedPayload.data.length > 0) {
          const uploadUrl = buildCustomAudienceUsersUrl(
            audienceId,
            auth.token,
            version,
          );
          const uploadBody = new URLSearchParams();
          uploadBody.set(
            "payload",
            JSON.stringify({
              schema: hashedPayload.schema,
              data: hashedPayload.data,
            }),
          );

          const uploadRes = await tracker.fetch(uploadUrl, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: uploadBody.toString(),
          });

          if (!uploadRes.ok) {
            const errText = await uploadRes.text().catch(() => "");
            console.warn(
              "[Meta Custom Audience] Upload korisnika greška:",
              extractMetaAdsError(errText),
            );
          }
        }
      }

      // 4. Save into local DB
      await ctx.runMutation(internal.metaAdsStore.upsertAudiencesBatch, {
        workspaceId: auth.workspaceId,
        adAccountId: auth.adAccountId,
        audiences: [
          {
            audienceId,
            name: args.name.trim(),
            subtype: "CUSTOM",
            description: args.description?.trim(),
            deliveryStatus: "POPULATING",
            operationStatus: "NORMAL",
            timeContentUpdated: Date.now(),
          },
        ],
        syncedAt: Date.now(),
      });

      return {
        audienceId,
        name: args.name.trim(),
      };
    } finally {
      await tracker.flush(ctx, auth.workspaceId);
    }
  },
});

/**
 * Creates a Lookalike Audience.
 * Validates seed audience size and spec before any network call.
 * Enforces ToS Gate.
 */
export const createLookalikeAudienceAction = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    seedAudienceId: v.string(),
    spec: v.object({
      country: v.optional(v.string()),
      type: v.optional(v.string()),
      ratio: v.optional(v.number()),
    }),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ audienceId: string; name: string }> => {
    const auth = await getMetaAdsAuth(ctx, args.workspaceId);
    const version = getMetaGraphVersion();
    const tracker = createUsageTracker();

    // 1. Fetch seed audience from database
    const seedAudience = await ctx.runQuery(
      internal.metaAdsStore.getAudienceById,
      {
        audienceId: args.seedAudienceId,
        adAccountId: auth.adAccountId,
      },
    );

    // 2. Strict validation of Lookalike spec and seed audience size PRE-CALL
    validateLookalikeSpec(args.spec, {
      approximateCountLower: seedAudience?.approximateCountLower,
      name: seedAudience?.name,
    });

    try {
      // 3. ToS Gate verification (throws if not accepted or unknown)
      await evaluateAudienceTos(ctx, auth, tracker, { assertAccepted: true });

      // 4. Create Lookalike Audience on Meta
      const createUrl = buildCustomAudienceCreateUrl(
        auth.actId,
        auth.token,
        version,
      );
      const createBody = new URLSearchParams();
      createBody.set("name", args.name.trim());
      createBody.set("subtype", "LOOKALIKE");
      createBody.set("origin_audience_id", args.seedAudienceId);

      const lookalikeSpec: Record<string, unknown> = {};
      if (args.spec.country) {
        lookalikeSpec.country = args.spec.country.toUpperCase().trim();
      }
      if (args.spec.type) {
        lookalikeSpec.type = args.spec.type;
      }
      if (args.spec.ratio !== undefined) {
        lookalikeSpec.ratio = args.spec.ratio;
      }
      createBody.set("lookalike_spec", JSON.stringify(lookalikeSpec));

      const createRes = await tracker.fetch(createUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: createBody.toString(),
      });

      if (!createRes.ok) {
        const errText = await createRes.text().catch(() => "");
        throw new Error(
          `Meta Marketing API greška pri kreiranju Lookalike publike: ${extractMetaAdsError(errText)}`,
        );
      }

      const createJson = (await createRes.json()) as { id?: string };
      const audienceId = createJson.id;
      if (!audienceId) {
        throw new Error("Meta nije vratila ID za kreiranu Lookalike publiku.");
      }

      // 5. Save into local DB
      await ctx.runMutation(internal.metaAdsStore.upsertAudiencesBatch, {
        workspaceId: auth.workspaceId,
        adAccountId: auth.adAccountId,
        audiences: [
          {
            audienceId,
            name: args.name.trim(),
            subtype: "LOOKALIKE",
            deliveryStatus: "POPULATING",
            operationStatus: "NORMAL",
            timeContentUpdated: Date.now(),
          },
        ],
        syncedAt: Date.now(),
      });

      return {
        audienceId,
        name: args.name.trim(),
      };
    } finally {
      await tracker.flush(ctx, auth.workspaceId);
    }
  },
});

export interface AdPreviewResult {
  success: boolean;
  previewHtml?: string;
  previewFetchedAt?: number;
  isStale?: boolean;
  ageSeconds?: number;
  warning?: string;
  error?: string;
}

/**
 * Fetches or returns cached preview iframe HTML for an ad (C2).
 * Cache TTL is strictly 12 hours (never 24h).
 * Stale preview is returned if refresh fails, with relative age warning.
 */
export const getAdPreviewAction = action({
  args: {
    adId: v.id("ads"),
    adFormat: v.optional(v.string()), // default "DESKTOP_FEED_STANDARD"
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<AdPreviewResult> => {
    const auth = await getMetaAdsAuth(ctx, args.workspaceId);
    const ad: Doc<"ads"> | null = await ctx.runQuery(
      api.metaAdsStore.getAdById,
      { adId: args.adId },
    );
    if (!ad) {
      throw new Error("Oglas nije pronađen.");
    }

    const format = args.adFormat?.trim() || "DESKTOP_FEED_STANDARD";
    const existingCreative: Doc<"adCreatives"> | null = await ctx.runQuery(
      internal.metaAdsStore.getAdCreativeByAdId,
      { adId: args.adId },
    );

    const now = Date.now();
    const fetchedAt = existingCreative?.previewFetchedAt ?? 0;
    const ageMs = now - fetchedAt;

    // Cache hit: valid for up to 12 hours (C2)
    if (existingCreative?.previewHtml && ageMs < PREVIEW_CACHE_MAX_AGE_MS) {
      return {
        success: true,
        previewHtml: existingCreative.previewHtml,
        previewFetchedAt: fetchedAt,
        isStale: false,
        ageSeconds: Math.floor(ageMs / 1000),
      };
    }

    // Refresh from Meta Graph API
    const tracker = createUsageTracker();
    const collector = createQuotaCollector();

    try {
      const url = buildAdPreviewUrl(ad.externalId, auth.token, format);
      const res = await tracker.fetch(url);
      const rateLimit = parseRateLimitHeaders(res.headers);
      collector.record(rateLimit);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw classifyMetaError(body, { httpStatus: res.status, rateLimit });
      }

      const json = (await res.json()) as { data?: { body?: string }[] };
      const previewHtml = json.data?.[0]?.body;

      if (!previewHtml) {
        throw new Error("Meta nije vratila HTML sadržaj pregleda.");
      }

      // Save fresh preview to DB
      await ctx.runMutation(internal.metaAdsStore.saveAdPreviewHtml, {
        adId: args.adId,
        creativeId: ad.creativeId || ad.externalId,
        previewHtml,
        previewFetchedAt: now,
      });

      return {
        success: true,
        previewHtml,
        previewFetchedAt: now,
        isStale: false,
        ageSeconds: 0,
      };
    } catch (err: unknown) {
      // Fallback: If stale preview exists, return it with warning (C2)
      if (existingCreative?.previewHtml) {
        return {
          success: true,
          previewHtml: existingCreative.previewHtml,
          previewFetchedAt: fetchedAt,
          isStale: true,
          ageSeconds: Math.floor(ageMs / 1000),
          warning: "Osvežavanje nije uspelo. Prikazan je poslednji sačuvani pregled.",
        };
      }

      const errorMsg = sanitizePii(
        extractMetaAdsError(err) ||
          (err instanceof Error ? err.message : String(err)),
      );
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      await tracker.flush(ctx, auth.workspaceId);
      await collector.flush(ctx, auth.workspaceId);
    }
  },
});

export interface TargetingSearchResult {
  success: boolean;
  results: Array<{
    id: string;
    name: string;
    range: {
      lower?: number;
      upper?: number;
      formatted: string;
    };
    path?: string[];
    topic?: string;
    description?: string;
  }>;
  error?: string;
}

/**
 * Read-only targeting search (C5).
 * Strictly queries Meta targeting search endpoint; never mutates anything on Meta.
 */
export const searchTargetingAction = action({
  args: {
    query: v.string(),
    type: v.optional(v.string()), // default "adinterest"
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<TargetingSearchResult> => {
    const auth = await getMetaAdsAuth(ctx, args.workspaceId);
    const searchType = args.type?.trim() || "adinterest";
    const q = args.query.trim();

    if (!q) {
      return { success: true, results: [] };
    }

    const tracker = createUsageTracker();
    const collector = createQuotaCollector();

    try {
      const url = `${buildTargetingSearchUrl(auth.actId, q, searchType)}&access_token=${auth.token}`;
      const res = await tracker.fetch(url);
      const rateLimit = parseRateLimitHeaders(res.headers);
      collector.record(rateLimit);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw classifyMetaError(body, { httpStatus: res.status, rateLimit });
      }

      const json = (await res.json()) as {
        data?: Array<{
          id: string;
          name: string;
          audience_size_lower_bound?: number;
          audience_size_upper_bound?: number;
          path?: string[];
          topic?: string;
          description?: string;
        }>;
      };

      const results = (json.data || []).map((item) => ({
        id: item.id,
        name: item.name,
        range: formatEstimateRange(
          item.audience_size_lower_bound,
          item.audience_size_upper_bound,
        ),
        path: item.path,
        topic: item.topic,
        description: item.description,
      }));

      return {
        success: true,
        results,
      };
    } catch (err: unknown) {
      const errorMsg = sanitizePii(
        extractMetaAdsError(err) ||
          (err instanceof Error ? err.message : String(err)),
      );
      return {
        success: false,
        error: errorMsg,
        results: [],
      };
    } finally {
      await tracker.flush(ctx, auth.workspaceId);
      await collector.flush(ctx, auth.workspaceId);
    }
  },
});

export interface AdPixelsResult {
  success: boolean;
  pixels: Array<{ id: string; name: string }>;
  error?: string;
}

/**
 * Read-only lista piksela naloga (MA8) — za izbor promoted_object kod
 * konverzionih ciljeva u čarobnjaku kreiranja. Ništa ne menja.
 */
export const listAdPixelsAction = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    accountExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<AdPixelsResult> => {
    const auth = await getMetaAdsAuth(ctx, args.workspaceId);
    const actId = args.accountExternalId
      ? normalizeAdAccountId(args.accountExternalId)
      : auth.actId;
    const tracker = createUsageTracker();
    try {
      const res = await tracker.fetch(buildAdPixelsUrl(actId, auth.token));
      const json = (await res.json().catch(() => ({}))) as {
        data?: Array<{ id?: string; name?: string }>;
        error?: unknown;
      };
      if (!res.ok || json.error) {
        return {
          success: false,
          pixels: [],
          error: sanitizePii(extractMetaAdsError(json.error ?? json)),
        };
      }
      const pixels = (json.data ?? [])
        .filter((p) => p.id)
        .map((p) => ({ id: String(p.id), name: p.name || String(p.id) }));
      return { success: true, pixels };
    } catch (err: unknown) {
      return {
        success: false,
        pixels: [],
        error: sanitizePii(
          extractMetaAdsError(err) ||
            (err instanceof Error ? err.message : String(err)),
        ),
      };
    } finally {
      await tracker.flush(ctx, auth.workspaceId);
    }
  },
});

export interface DeliveryEstimateResult {
  success: boolean;
  monthlyEstimate: { lower?: number; upper?: number; formatted: string };
  dailyEstimate: { lower?: number; upper?: number; formatted: string };
  error?: string;
}

/**
 * Read-only reach / delivery estimate query (C4 & C5).
 * Formats results strictly as ranges, never single numbers; returns "—" if unknown.
 */
export const getDeliveryEstimateAction = action({
  args: {
    targetingSpec: v.optional(v.any()),
    optimizationGoal: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<DeliveryEstimateResult> => {
    const auth = await getMetaAdsAuth(ctx, args.workspaceId);
    const tracker = createUsageTracker();
    const collector = createQuotaCollector();

    try {
      const params: Record<string, string | number | boolean> = {
        access_token: auth.token,
      };
      if (args.targetingSpec) {
        params.targeting_spec =
          typeof args.targetingSpec === "string"
            ? args.targetingSpec
            : JSON.stringify(args.targetingSpec);
      }
      if (args.optimizationGoal) {
        params.optimization_goal = args.optimizationGoal;
      }

      const url = buildDeliveryEstimateUrl(auth.actId, params);
      const res = await tracker.fetch(url);
      const rateLimit = parseRateLimitHeaders(res.headers);
      collector.record(rateLimit);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw classifyMetaError(body, { httpStatus: res.status, rateLimit });
      }

      const json = (await res.json()) as {
        data?: Array<{
          estimate_mau_lower_bound?: number;
          estimate_mau_upper_bound?: number;
          estimate_dau_lower_bound?: number;
          estimate_dau_upper_bound?: number;
        }>;
      };

      const first = json.data?.[0];
      const monthlyEstimate = formatEstimateRange(
        first?.estimate_mau_lower_bound,
        first?.estimate_mau_upper_bound,
      );
      const dailyEstimate = formatEstimateRange(
        first?.estimate_dau_lower_bound,
        first?.estimate_dau_upper_bound,
      );

      return {
        success: true,
        monthlyEstimate,
        dailyEstimate,
      };
    } catch (err: unknown) {
      const errorMsg = sanitizePii(
        extractMetaAdsError(err) ||
          (err instanceof Error ? err.message : String(err)),
      );
      return {
        success: false,
        error: errorMsg,
        monthlyEstimate: { formatted: "—" },
        dailyEstimate: { formatted: "—" },
      };
    } finally {
      await tracker.flush(ctx, auth.workspaceId);
      await collector.flush(ctx, auth.workspaceId);
    }
  },
});


