/**
 * ============================================================================
 * META CONVERSIONS API (CAPI) PURE LIBRARY (B2)
 * ============================================================================
 *
 * Single source of truth for Meta Conversions API event models, pre-flight
 * local validation, URL builders, and payload formatters.
 *
 * Rules:
 *   1. Zero raw PII: user_data identifiers are SHA-256 hashes (64 hex lowercase).
 *   2. Pre-flight validation: 1 invalid event in a batch fails the entire Meta
 *      batch. Each event is locally validated before sending. Invalid events
 *      are isolated and marked "rejected", and valid events proceed in the batch.
 *   3. Max batch size is 500 events per Meta Conversions API call.
 *   4. Date.now() is passed in or derived on caller.
 * ============================================================================
 */

import {
  META_GRAPH_BASE_URL,
  getMetaGraphVersion,
} from "./metaAdsApi";

export const CAPI_MAX_BATCH_SIZE = 500;
export const CAPI_MAX_EVENT_AGE_SECONDS = 7 * 86400; // 7 days in seconds
export const CAPI_MAX_FUTURE_DRIFT_SECONDS = 60; // 1 minute into future

/**
 * Lock TTL for CAPI dispatch is 60 SECONDS (1 minute) — NOT the default 15 minutes!
 * With a 15-minute lock, a scheduled retry after 30 seconds (D1 backoff schedule)
 * would fail to acquire the lock and be silently skipped.
 */
export const CAPI_DISPATCH_LOCK_TTL_MS = 60 * 1000;

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

export interface CapiUserData {
  em?: string[]; // Array of lowercase SHA-256 hashes
  ph?: string[]; // Array of lowercase SHA-256 hashes
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;
  fbp?: string;
}

export interface CapiEventItem {
  event_name: string;
  event_time: number; // Unix seconds
  event_id: string; // Deterministic deduplication ID
  action_source: "website" | "business_messaging";
  user_data: CapiUserData;
  custom_data?: Record<string, unknown>;
}

export interface CapiValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * The identifier fields a CAPI event can carry, in the shape they are stored on
 * `capiEvents`. `clientUserAgent` is accepted so callers can pass the whole set
 * verbatim, but it NEVER counts toward a match.
 */
export interface CapiIdentityFields {
  hashedEmail?: string;
  hashedPhone?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string;
  fbp?: string;
}

/**
 * Whether an event carries at least one identifier Meta will actually match on.
 *
 * `client_user_agent` is deliberately excluded: Meta does not treat it as a
 * matching parameter, so an event carrying ONLY a user agent is rejected as
 * unmatchable ("no customer information parameters … so broad that it is
 * unlikely to be effective for matching"). It is still sent alongside a real
 * identifier — it just can never be the sole reason to store or dispatch an event.
 *
 * This is the ONE definition of "matchable identity". Both the store gate
 * (`recordCapiEvent`) and the pre-flight gate (`validateCapiEvent`) call it, so
 * the two cannot drift apart.
 */
export function hasMatchableIdentity(id: CapiIdentityFields): boolean {
  return Boolean(
    id.hashedEmail?.trim() ||
      id.hashedPhone?.trim() ||
      id.clientIpAddress?.trim() ||
      id.fbc?.trim() ||
      id.fbp?.trim(),
  );
}

/**
 * Pre-flight local validation of a single CAPI event before dispatch.
 * Meta Conversions API rejects the whole batch if any single item is invalid.
 */
export function validateCapiEvent(
  event: CapiEventItem,
  nowSec: number = Math.floor(Date.now() / 1000),
): CapiValidationResult {
  // 1. event_name exists and is not empty
  if (!event.event_name || !event.event_name.trim()) {
    return {
      valid: false,
      reason: "Naziv događaja (event_name) je obavezan i ne sme biti prazan.",
    };
  }

  // 2. event_time is a positive integer in seconds
  if (
    typeof event.event_time !== "number" ||
    !Number.isFinite(event.event_time) ||
    event.event_time <= 0
  ) {
    return {
      valid: false,
      reason: "Vreme događaja (event_time) mora biti validan unix timestamp u sekundama.",
    };
  }

  const oldestAllowedSec = nowSec - CAPI_MAX_EVENT_AGE_SECONDS;
  const newestAllowedSec = nowSec + CAPI_MAX_FUTURE_DRIFT_SECONDS;

  if (event.event_time < oldestAllowedSec) {
    return {
      valid: false,
      reason: "Događaj je stariji od 7 dana (ograničenje Meta Conversions API-ja).",
    };
  }

  if (event.event_time > newestAllowedSec) {
    return {
      valid: false,
      reason: "Vreme događaja je u budućnosti više od 1 minuta.",
    };
  }

  // 3. event_id must exist for pixel deduplication
  if (!event.event_id || !event.event_id.trim()) {
    return {
      valid: false,
      reason: "Identifikator događaja (event_id) je obavezan za deduplikaciju.",
    };
  }

  // 4. user_data has at least one identifier
  const ud = event.user_data;
  if (!ud || typeof ud !== "object") {
    return {
      valid: false,
      reason: "Nedostaje user_data objekat sa korisničkim identifikatorima.",
    };
  }

  // Ista definicija „identiteta za uparivanje" kao u recordCapiEvent —
  // user-agent NIJE dovoljan (Meta ga ne priznaje kao parametar za uparivanje).
  const matchable = hasMatchableIdentity({
    hashedEmail: Array.isArray(ud.em) ? ud.em.find(Boolean) : undefined,
    hashedPhone: Array.isArray(ud.ph) ? ud.ph.find(Boolean) : undefined,
    clientIpAddress: ud.client_ip_address,
    clientUserAgent: ud.client_user_agent,
    fbc: ud.fbc,
    fbp: ud.fbp,
  });

  if (!matchable) {
    return {
      valid: false,
      reason:
        "user_data mora sadržati bar jedan identifikator koji Meta koristi za uparivanje (heširani email, heširani telefon, IP adresa, fbc ili fbp). Samo user-agent nije dovoljan.",
    };
  }

  // 5. Each hash must be exactly 64 lowercase hex characters
  if (Array.isArray(ud.em)) {
    for (const hash of ud.em) {
      if (hash && !SHA256_HEX_REGEX.test(hash)) {
        return {
          valid: false,
          reason: `Heš emaila nije validan 64-karakterni SHA-256 heš malim slovima: ${hash.slice(0, 10)}...`,
        };
      }
    }
  }

  if (Array.isArray(ud.ph)) {
    for (const hash of ud.ph) {
      if (hash && !SHA256_HEX_REGEX.test(hash)) {
        return {
          valid: false,
          reason: `Heš telefona nije validan 64-karakterni SHA-256 heš malim slovima: ${hash.slice(0, 10)}...`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Builds the Meta Conversions API endpoint URL for a given pixel ID.
 */
export function buildCapiEventsUrl(
  pixelId: string,
  version: string = getMetaGraphVersion(),
): string {
  const cleanPixelId = pixelId.trim().replace(/^act_/, "");
  return `${META_GRAPH_BASE_URL}/${version}/${cleanPixelId}/events`;
}

/**
 * Splits a list of CAPI events into valid and rejected sets based on pre-flight checks.
 */
export function partitionCapiBatch<T extends CapiEventItem>(
  events: T[],
  nowSec: number = Math.floor(Date.now() / 1000),
): {
  valid: T[];
  rejected: { event: T; reason: string }[];
} {
  const valid: T[] = [];
  const rejected: { event: T; reason: string }[] = [];

  for (const item of events) {
    const result = validateCapiEvent(item, nowSec);
    if (result.valid) {
      valid.push(item);
    } else {
      rejected.push({
        event: item,
        reason: result.reason || "Nepoznata greška validacije.",
      });
    }
  }

  return { valid, rejected };
}

/**
 * Constructs the request payload for Meta Graph API POST /events.
 */
export function buildCapiPayload(
  events: CapiEventItem[],
  testEventCode?: string,
): {
  data: CapiEventItem[];
  test_event_code?: string;
} {
  const payload: {
    data: CapiEventItem[];
    test_event_code?: string;
  } = {
    data: events,
  };

  if (testEventCode && testEventCode.trim()) {
    payload.test_event_code = testEventCode.trim();
  }

  return payload;
}

/**
 * Exponential backoff intervals in milliseconds based on attempt count (D1).
 * attempt 1 -> 30 seconds (30_000 ms)
 * attempt 2 -> 5 minutes (300_000 ms)
 * attempt 3 -> 30 minutes (1_800_000 ms)
 * attempt 4 -> 2 hours (7_200_000 ms)
 * attempt 5+ -> null (quarantined/rejected, do not schedule)
 */
export const CAPI_RETRY_DELAYS_MS: Record<number, number> = {
  1: 30 * 1000,
  2: 5 * 60 * 1000,
  3: 30 * 60 * 1000,
  4: 2 * 60 * 60 * 1000,
};

/**
 * Returns the retry delay in milliseconds for the given attempt count,
 * or null if attempts reached the maximum limit (>= 5).
 */
export function getCapiRetryDelayMs(attempts: number): number | null {
  return CAPI_RETRY_DELAYS_MS[attempts] ?? null;
}

