/**
 * ============================================================================
 * GOOGLE ADS SHARED UTILITIES & FORMATTERS (V8 & Node Runtime Safe)
 * ============================================================================
 *
 * PRAVILO KOJE MORA DA PREŽIVI:
 * Nijedan fajl BEZ "use node" ne sme da uvozi modul KOJI IMA "use node".
 *
 * Ovaj fajl NEMA "use node" i sadrži isključivo funkcije, konstante i tipove
 * koji su 100% bezbedni za pokretanje u Convex V8 runtime-u (mutations, queries)
 * kao i u Node.js runtime-u (actions).
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

/**
 * Build Google Ads mutate endpoint URL.
 * Format: https://googleads.googleapis.com/{version}/customers/{id}/googleAds:mutate
 */
export function buildMutateUrl(
  customerId: string,
  version: string = getGoogleAdsApiVersion(),
): string {
  const cleanId = normalizeCustomerId(customerId);
  return `${GOOGLE_ADS_BASE_URL}/${version}/customers/${cleanId}/googleAds:mutate`;
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
 * Izvlači čitljivu poruku iz Google Ads API greške, bez curenja tajni.
 *
 * Google Ads REST greška ima dva sloja:
 *   1. `error.message` — generički gRPC opis ("Request contains an invalid argument.")
 *   2. `error.details[].errors[]` — GoogleAdsFailure sa STVARNIM razlogom
 *      (npr. "Error in query: unrecognized field metrics.conversions_value_micros.")
 *      i sa `errorCode` (npr. { queryError: "UNRECOGNIZED_FIELD" }).
 *
 * Sloj 1 sam po sebi ne kaže ništa upotrebljivo. Zato uvek prvo tražimo sloj 2 i
 * vraćamo ga; na sloj 1 padamo tek ako detalja nema. Nikada ne vraćamo generičku
 * poruku dok postoji konkretna — nepoznat uzrok nije dozvoljen ishod.
 */
function extractGoogleAdsFailureMessages(errorObj: unknown): string[] {
  const messages: string[] = [];
  const details = (errorObj as { details?: unknown[] } | undefined)?.details;
  if (!Array.isArray(details)) return messages;

  for (const detail of details) {
    const errors = (detail as { errors?: unknown[] } | undefined)?.errors;
    if (!Array.isArray(errors)) continue;

    for (const err of errors) {
      const e = err as {
        message?: unknown;
        errorCode?: Record<string, unknown>;
        location?: { fieldPathElements?: Array<{ fieldName?: unknown }> };
      };

      const parts: string[] = [];

      if (e.errorCode && typeof e.errorCode === "object") {
        const codeKeys = Object.keys(e.errorCode);
        if (codeKeys.length > 0) {
          const key = codeKeys[0];
          parts.push(`${key}=${String(e.errorCode[key])}`);
        }
      }

      if (typeof e.message === "string" && e.message.trim() !== "") {
        parts.push(e.message.trim());
      }

      const fieldPath = e.location?.fieldPathElements;
      if (Array.isArray(fieldPath) && fieldPath.length > 0) {
        const path = fieldPath
          .map((el) => (typeof el?.fieldName === "string" ? el.fieldName : ""))
          .filter((s) => s !== "")
          .join(".");
        if (path !== "") parts.push(`[polje: ${path}]`);
      }

      if (parts.length > 0) messages.push(parts.join(" "));
    }
  }

  return messages;
}

export function extractGoogleAdsApiError(body: string, status?: number): string {
  try {
    const parsed = JSON.parse(body);
    const errorObj = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;

    if (errorObj) {
      const detailed = extractGoogleAdsFailureMessages(errorObj);
      if (detailed.length > 0) {
        return detailed.join(" | ");
      }
      // Detalja nema — generička poruka sama po sebi ne objašnjava ništa,
      // pa uz nju obavezno ide i sirovo telo odgovora (skraćeno).
      const generic =
        typeof errorObj.message === "string" && errorObj.message.trim() !== ""
          ? errorObj.message.trim()
          : "Google Ads API je odbio zahtev bez poruke.";
      return `${generic} :: SIROVO=${body.slice(0, 900)}`;
    }
  } catch {
    // fall back to raw slice
  }
  return `Google Ads API greška (${status ?? "status nepoznat"}): ${body.slice(0, 900)}`;
}

/**
 * Iz Google Ads DATE/DATETIME vrednosti vraća samo datumski deo "YYYY-MM-DD".
 *
 * `campaign.start_date_time` / `campaign.end_date_time` stižu u obliku
 * "yyyy-MM-dd HH:mm:ss" (u vremenskoj zoni naloga). Nama treba čist datum.
 * Nepoznato ostaje nepoznato — nikada ne vraćamo današnji datum kao zamenu.
 */
export function gadsDatePart(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const match = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : undefined;
}

/**
 * Pretvara Google Ads brojčanu vrednost (broj ili string) u broj.
 *
 * Za polja koja NISU u mikrojedinicama (npr. `metrics.conversions_value`).
 * undefined / null / prazno / NaN -> undefined. Nula ostaje nula.
 */
export function gadsNumberOrUndefined(
  value: number | string | undefined | null,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
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

export type GoogleAdsResourceOutcome =
  | { resource: string; ok: true; rows: number }
  | { resource: string; ok: false; reason: string };

export interface GoogleAdsSyncSummary {
  status: "Uspešno" | "Delimično" | "Greška";
  totalResources: number;
  successfulResources: number;
  failedResources: number;
  succeededQueries: number;
  failedQueries: number;
  failedResourceNames: string[];
  outcomes: GoogleAdsResourceOutcome[];
  itemsWritten: number;
  currencyKnown: boolean;
  note?: string;
}

/**
 * Sanitizes any sensitive tokens, secrets, or keys from Google Ads error messages.
 */
export function defaultSanitizeGoogleAdsError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/ya29\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=[REDACTED]")
    .replace(/private_key=[^&\s]+/gi, "private_key=[REDACTED]")
    .replace(/SECRET[A-Za-z0-9_]*/gi, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wraps a single GAQL query execution, capturing rows on success or sanitized error reason on failure.
 *
 * Rules (A2, A4):
 *   - A query returning 0 rows is valid: { resource, ok: true, rows: 0 }.
 *   - A failed query NEVER looks like an empty result: { resource, ok: false, reason: "<sanitized>" }.
 *   - Never rethrows so other queries continue, but failure is recorded.
 */
export async function executeGaqlResource<T>(
  resource: string,
  outcomes: GoogleAdsResourceOutcome[],
  fn: () => Promise<T[]>,
  sanitizeFn: (err: unknown) => string = defaultSanitizeGoogleAdsError,
): Promise<T[]> {
  try {
    const rows = await fn();
    const count = Array.isArray(rows) ? rows.length : 0;
    outcomes.push({ resource, ok: true, rows: count });
    return rows;
  } catch (err) {
    const reason = sanitizeFn(err);
    outcomes.push({ resource, ok: false, reason });
    return [];
  }
}

/**
 * Evaluates the overall sync outcome across all queries and currency checks (A3).
 *
 * Rules:
 *   - All queries succeeded & currency known -> "Uspešno"
 *   - Some queries failed or currency unknown -> "Delimično" + details of failed resources
 *   - Authentication or quota gate failed -> "Greška"
 */
export function summarizeGoogleAdsSync(params: {
  outcomes: GoogleAdsResourceOutcome[];
  itemsWritten: number;
  currencyKnown: boolean;
  authOrQuotaFailed?: boolean;
  fatalError?: string;
}): GoogleAdsSyncSummary {
  const { outcomes, itemsWritten, currencyKnown, authOrQuotaFailed, fatalError } = params;
  const totalResources = outcomes.length;
  const failedOutcomes = outcomes.filter(
    (o): o is { resource: string; ok: false; reason: string } => !o.ok,
  );
  const failedResources = failedOutcomes.length;
  const successfulResources = totalResources - failedResources;
  const failedResourceNames = failedOutcomes.map((o) => o.resource);

  let status: "Uspešno" | "Delimično" | "Greška";
  const noteParts: string[] = [];

  if (authOrQuotaFailed || fatalError) {
    status = "Greška";
    if (fatalError) noteParts.push(fatalError);
  } else if (failedResources > 0 || !currencyKnown) {
    status = "Delimično";
    if (failedResources > 0) {
      noteParts.push(
        `Delimično: ${failedResources}/${totalResources} neuspelih upita (${failedResourceNames.join(", ")})`,
      );
    }
    if (!currencyKnown) {
      noteParts.push("nalog nema poznatu valutu (upis naloga preskočen)");
    }
  } else {
    status = "Uspešno";
  }

  const note = noteParts.length > 0 ? noteParts.join(" | ") : undefined;

  return {
    status,
    totalResources,
    successfulResources,
    failedResources,
    succeededQueries: successfulResources,
    failedQueries: failedResources,
    failedResourceNames,
    outcomes,
    itemsWritten,
    currencyKnown,
    note,
  };
}

