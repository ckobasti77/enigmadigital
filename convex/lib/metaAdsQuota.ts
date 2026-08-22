import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MetaAdsTier, RateLimitStatus } from "./metaAdsApi";

/**
 * ============================================================================
 * KAPIJA KVOTE ZA META MARKETING API (MA1)
 * ============================================================================
 *
 * Rađena po uzoru na `convex/lib/ga4Quota.ts`, sa jednom razlikom koja je
 * suštinska: GA4 kaže koliko je potrošeno i koliko je ostalo, pa se procenat
 * računa. Meta odmah šalje PROCENTE, i to iz dva zaglavlja koja mere različite
 * prozore (BUC = klizajući sat, Insights-Throttle = sekunda). Kapija uzima
 * najveći od pet brojeva jer Meta guši čim BILO KOJI od njih dođe do 100 —
 * prosek bi zataškao baš onaj koji je pred zidom.
 *
 * Dve brane, kao kod GA4:
 *   - meka (80 %): pozadinski cron prolazi staju.
 *   - tvrda (95 %): i ručno „Sinhronizuj” se odbija.
 *
 * TTL je jedan sat, jer BUC procenti opisuju klizajući SAT: očitavanje starije
 * od toga nije opreznija procena nego izjava o prozoru koji je već prošao. Bez
 * TTL-a bi jedno očitavanje od 96 % zaključalo aplikaciju zauvek.
 *
 * `blockedUntil` je odvojeno od procenata: kad Meta pošalje
 * `estimated_time_to_regain_access`, ona ne procenjuje opterećenje nego
 * saopštava blokadu i njeno trajanje. Dok to vreme ne prođe, kapija je "stop"
 * bez obzira na to koliko procenti izgledaju pitomo.
 * ============================================================================
 */

/** Preko ovog procenta pozadinski prolazi staju. */
export const QUOTA_WARN_PCT = 80;

/** Preko ovog procenta staje sve, i ručno pokretanje. */
export const QUOTA_STOP_PCT = 95;

/** Koliko dugo jedno očitavanje uopšte nešto znači (klizajući sat). */
export const QUOTA_TTL_MS = 60 * 60 * 1000;

/**
 * Formula development sloja, za tekst u Sync Health widgetu.
 * ads_insights: 600 + 400 × broj aktivnih oglasa − 0.001 × greške korisnika.
 */
export const DEV_TIER_BASE_CALLS = 600;
export const DEV_TIER_CALLS_PER_ACTIVE_AD = 400;

export type MetaAdsGateState = "ok" | "warn" | "stop";

export interface MetaAdsQuotaReading {
  callCount?: number;
  totalCpuTime?: number;
  totalTime?: number;
  appIdUtilPct?: number;
  accIdUtilPct?: number;
}

export interface MetaAdsRateGate {
  state: MetaAdsGateState;
  peakPct: number;
  stale: boolean;
  fetchedAt?: number;
  /** Kada Meta kaže da blokada prestaje (ms epoch). */
  blockedUntil?: number;
  tier?: MetaAdsTier;
}

/**
 * Najveći od pet procenata koji su STVARNO stigli.
 *
 * Polje koje nije stiglo se preskače, ne broji kao 0 — nula bi se čitala kao
 * „ima još mesta”, a to je tvrdnja koju očitavanje nije dalo.
 */
export function quotaPeak(reading: MetaAdsQuotaReading): number {
  const values = [
    reading.callCount,
    reading.totalCpuTime,
    reading.totalTime,
    reading.appIdUtilPct,
    reading.accIdUtilPct,
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  if (values.length === 0) return 0;
  return Math.max(...values);
}

/** Stanje kapije iz vršnog procenta. */
export function determineGateState(peakPct: number): MetaAdsGateState {
  if (peakPct >= QUOTA_STOP_PCT) return "stop";
  if (peakPct >= QUOTA_WARN_PCT) return "warn";
  return "ok";
}

/** Pozadinski prolazi (cron) idu samo kroz čistu kapiju. */
export function allowsBackground(gate: MetaAdsRateGate): boolean {
  return gate.state === "ok";
}

/** Ručno pokretanje prolazi i na „warn”; staje tek na „stop”. */
export function allowsManual(gate: MetaAdsRateGate): boolean {
  return gate.state !== "stop";
}

/** Očitavanje iz zaglavlja jednog odgovora u oblik koji ide u bazu. */
export function readingFromHeaders(
  status: RateLimitStatus,
): MetaAdsQuotaReading {
  return {
    callCount: status.callCount,
    totalCpuTime: status.totalCpuTime,
    totalTime: status.totalTime,
    appIdUtilPct: status.appIdUtilPct,
    accIdUtilPct: status.accIdUtilPct,
  };
}

/** Pročitaj upisanu kapiju za workspace. Jedno indeksirano čitanje. */
export async function readGate(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
): Promise<MetaAdsRateGate> {
  return await ctx.runQuery(internal.metaAdsStore.getQuotaGate, {
    workspaceId,
    now: Date.now(),
  });
}

// ── Sakupljač očitavanja unutar jednog prolaza ──────────────────────────────

export interface MetaAdsQuotaCollector {
  /** Zabeleži zaglavlja jednog odgovora. */
  record(status: RateLimitStatus): void;
  readonly peakPct: number;
  readonly tier?: MetaAdsTier;
  /** MINUTI koje je Meta tražila da čekamo, ako je uopšte tražila. */
  readonly regainMinutes?: number;
  /** Jedan upis na kraju prolaza, ne jedan po pozivu. */
  flush(ctx: ActionCtx, workspaceId: Id<"workspaces">): Promise<void>;
}

/**
 * Skuplja očitavanja u memoriji i piše JEDNOM.
 *
 * Mutacija po HTTP pozivu bi koštala više od poziva koje čuva — isti razlog
 * zbog kog `metaRateLimit.createUsageTracker` radi tako.
 */
export function createQuotaCollector(): MetaAdsQuotaCollector {
  let reading: MetaAdsQuotaReading | null = null;
  let tier: MetaAdsTier | undefined;
  let regainMinutes: number | undefined;

  const higher = (a?: number, b?: number) => {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return Math.max(a, b);
  };

  return {
    record(status) {
      if (!status.present) return;
      const next = readingFromHeaders(status);
      reading =
        reading === null
          ? next
          : {
              callCount: higher(reading.callCount, next.callCount),
              totalCpuTime: higher(reading.totalCpuTime, next.totalCpuTime),
              totalTime: higher(reading.totalTime, next.totalTime),
              appIdUtilPct: higher(reading.appIdUtilPct, next.appIdUtilPct),
              accIdUtilPct: higher(reading.accIdUtilPct, next.accIdUtilPct),
            };
      if (status.tier && !tier) tier = status.tier;
      regainMinutes = higher(
        regainMinutes,
        status.estimatedTimeToRegainAccessMin,
      );
    },
    get peakPct() {
      return reading === null ? 0 : quotaPeak(reading);
    },
    get tier() {
      return tier;
    },
    get regainMinutes() {
      return regainMinutes;
    },
    async flush(ctx, workspaceId) {
      if (reading === null && regainMinutes === undefined) return;
      await ctx.runMutation(internal.metaAdsStore.recordQuota, {
        workspaceId,
        reading: reading ?? {},
        tier,
        regainMinutes,
        fetchedAt: Date.now(),
      });
    },
  };
}

/** Pokreni `body` sa sakupljačem i upiši očitavanje šta god da se desi. */
export async function withQuotaCollector<T>(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  body: (collector: MetaAdsQuotaCollector) => Promise<T>,
): Promise<T> {
  const collector = createQuotaCollector();
  try {
    return await body(collector);
  } finally {
    await collector.flush(ctx, workspaceId);
  }
}
