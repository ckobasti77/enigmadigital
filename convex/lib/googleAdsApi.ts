"use node";

import { JWT } from "google-auth-library";

/**
 * ============================================================================
 * GOOGLE ADS REST API TRANSPORT LAYER
 * ============================================================================
 *
 * Single source of truth for Google Ads API URL builders, customer ID
 * normalization, request header builders, and currency/micros converters.
 *
 * Authentication uses Google Service Account JWT token exchange.
 *
 * Versioning:
 *   Default API version is "v25", overridable via GOOGLE_ADS_API_VERSION.
 * ============================================================================
 */

export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const DEFAULT_GOOGLE_ADS_API_VERSION = "v25";
export const GOOGLE_ADS_BASE_URL = "https://googleads.googleapis.com";
export const MICROS_PER_UNIT = 1_000_000;

/**
 * Returns configured Google Ads API version from environment or default stable version (v25).
 */
export function getGoogleAdsApiVersion(): string {
  const envVersion = process.env.GOOGLE_ADS_API_VERSION?.trim();
  if (envVersion && /^v\d+$/.test(envVersion)) {
    return envVersion;
  }
  return DEFAULT_GOOGLE_ADS_API_VERSION;
}

/**
 * Retrieves GOOGLE_ADS_DEVELOPER_TOKEN from environment.
 * Throws a clear error naming the variable if not configured (A3).
 */
export function getGoogleAdsDeveloperToken(): string {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Nedostaje GOOGLE_ADS_DEVELOPER_TOKEN environment varijabla u Convex-u. Podesite GOOGLE_ADS_DEVELOPER_TOKEN u podešavanjima okruženja pre pokretanja sinhronizacije.",
    );
  }
  return token;
}

/**
 * Obtain OAuth2 access token for Google Ads via Service Account JWT exchange (A2).
 * Scope: https://www.googleapis.com/auth/adwords
 * Exchange: https://oauth2.googleapis.com/token
 */
export async function getGoogleAdsAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [GOOGLE_ADS_SCOPE],
  });
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error("Google Ads access token request returned no token.");
  }
  return token;
}

/**
 * Normalizes Google Ads customer ID by removing dashes and whitespace.
 * Validates that the resulting string is strictly 10 digits.
 *
 * Examples:
 *   "123-456-7890" -> "1234567890"
 *   "1234567890"   -> "1234567890"
 *
 * Throws Error if format is invalid.
 */
export function normalizeCustomerId(id: string): string {
  if (!id || typeof id !== "string") {
    throw new Error("Google Ads customer ID mora biti neprazan string.");
  }
  const clean = id.trim().replace(/[-\s]/g, "");
  if (!/^\d{10}$/.test(clean)) {
    throw new Error(
      `Neispravan Google Ads Customer ID format: "${id}". Očekuje se tačno 10 cifara (npr. 123-456-7890 ili 1234567890).`,
    );
  }
  return clean;
}

/**
 * Build Google Ads searchStream endpoint URL.
 * Format: https://googleads.googleapis.com/{version}/customers/{id}/googleAds:searchStream
 */
export function buildSearchStreamUrl(
  customerId: string,
  version: string = getGoogleAdsApiVersion(),
): string {
  const cleanId = normalizeCustomerId(customerId);
  return `${GOOGLE_ADS_BASE_URL}/${version}/customers/${cleanId}/googleAds:searchStream`;
}

export interface GoogleAdsHeadersParams {
  developerToken: string;
  accessToken: string;
  loginCustomerId?: string;
}

/**
 * Builds HTTP headers for Google Ads API requests.
 *
 * Security: Tokens are passed as headers and MUST NEVER be logged.
 */
export function buildGoogleAdsHeaders(
  params: GoogleAdsHeadersParams,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.accessToken}`,
    "developer-token": params.developerToken,
  };

  if (params.loginCustomerId && params.loginCustomerId.trim() !== "") {
    headers["login-customer-id"] = normalizeCustomerId(params.loginCustomerId);
  }

  return headers;
}

/**
 * Extracts human-readable message from Google Ads API error response without leaking secrets.
 */
export function extractGoogleAdsApiError(body: string, status?: number): string {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed) && parsed[0]?.error?.message) {
      return parsed[0].error.message;
    }
    if (parsed.error?.message) return parsed.error.message;
    if (parsed[0]?.error?.details) {
      return JSON.stringify(parsed[0].error.details);
    }
  } catch {
    // fall back to raw slice
  }
  return `Google Ads API greška (${status ?? "status nepoznat"}): ${body.slice(0, 300)}`;
}

export function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

/**
 * Recursively decamelizes keys in Google Ads API response objects
 * so that properties can be accessed by both snake_case and camelCase.
 */
export function decamelizeRowKeys(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map(decamelizeRowKeys);
  }
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input as Record<string, unknown>)) {
    const snakeKey = toSnakeCase(key);
    const value = (input as Record<string, unknown>)[key];
    const transformedValue = decamelizeRowKeys(value);
    output[snakeKey] = transformedValue;
    if (snakeKey !== key) {
      output[key] = transformedValue;
    }
  }
  return output;
}

export interface QueryGoogleAdsParams {
  customerId: string;
  query: string;
  accessToken: string;
  developerToken: string;
  loginCustomerId?: string;
  version?: string;
}

/**
 * Executes a GAQL query against Google Ads searchStream REST endpoint.
 */
export async function queryGoogleAdsSearchStream(
  params: QueryGoogleAdsParams,
): Promise<any[]> {
  const url = buildSearchStreamUrl(params.customerId, params.version);
  const headers = buildGoogleAdsHeaders({
    developerToken: params.developerToken,
    accessToken: params.accessToken,
    loginCustomerId: params.loginCustomerId,
  });

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: params.query }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(extractGoogleAdsApiError(errorText, res.status));
  }

  const chunks = (await res.json()) as Array<{ results?: any[] }>;
  const rows: any[] = [];
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      if (chunk.results && Array.isArray(chunk.results)) {
        for (const row of chunk.results) {
          rows.push(decamelizeRowKeys(row));
        }
      }
    }
  }
  return rows;
}

/**
 * Converts Google Ads micros (1/1,000,000 unit) to standard currency units.
 *
 * Rules:
 *   - undefined / null / empty string / NaN -> undefined (unknown stays unknown)
 *   - 0 -> 0 (true zero preserved)
 *   - "2500000" -> 2.5
 */
export function microsToUnits(
  micros: number | string | undefined | null,
): number | undefined {
  if (micros === undefined || micros === null) return undefined;
  if (typeof micros === "string") {
    const trimmed = micros.trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed / MICROS_PER_UNIT;
  }
  if (typeof micros === "number") {
    if (!Number.isFinite(micros)) return undefined;
    return micros / MICROS_PER_UNIT;
  }
  return undefined;
}

/**
 * Converts standard currency units to Google Ads micros.
 *
 * Rules:
 *   - undefined / null / NaN -> undefined
 *   - Google Ads API accepts strictly integer micros (1 unit = 1,000,000 micros).
 *   - Math.round() is used explicitly to eliminate IEEE-754 floating-point inaccuracies
 *     (e.g., 2.5 * 1_000_000 resulting in 2500000.0000000005) and ensure safe integer values.
 */
export function unitsToMicros(
  units: number | undefined | null,
): number | undefined {
  if (units === undefined || units === null) return undefined;
  if (!Number.isFinite(units)) return undefined;
  return Math.round(units * MICROS_PER_UNIT);
}
