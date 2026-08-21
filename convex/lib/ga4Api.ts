"use node";

import { JWT } from "google-auth-library";

/**
 * ============================================================================
 * GA4 DATA API TRANSPORT LAYER (REST / fetch)
 * ============================================================================
 *
 * Provides typed transport functions for Google Analytics Data API (v1beta).
 * Uses google-auth-library (JWT) with service-account credentials.
 *
 * Scope: https://www.googleapis.com/auth/analytics.readonly
 * Base URL: https://analyticsdata.googleapis.com/v1beta
 * ============================================================================
 */

export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
export const PAGE_LIMIT = 100_000; // Data API max is 250k rows; default 100k

export interface GaRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}

export interface CohortSpec {
  cohorts: {
    name: string;
    dimension: "firstSessionDate";
    dateRange: { startDate: string; endDate: string };
  }[];
  cohortsRange: {
    granularity: "DAILY" | "WEEKLY" | "MONTHLY";
    startOffset: number;
    endOffset: number;
  };
  cohortReportSettings?: {
    accumulate?: boolean;
  };
}

export interface ReportRequest {
  dateRanges?: { startDate: string; endDate: string }[];
  dimensions: { name: string }[];
  metrics: { name: string }[];
  cohortSpec?: CohortSpec;
  keepEmptyRows?: boolean;
  returnPropertyQuota?: boolean;
  limit?: string;
  offset?: string;
}

export interface RealtimeReportRequest {
  dimensions?: { name: string }[];
  metrics?: { name: string }[];
  minuteRanges?: {
    name?: string;
    startMinutesAgo?: number;
    endMinutesAgo?: number;
  }[];
  dimensionFilter?: unknown;
  metricFilter?: unknown;
  metricAggregations?: unknown;
  orderBys?: unknown;
  returnPropertyQuota?: boolean;
  limit?: string;
}

export interface Ga4SamplingMetadata {
  samplesReadCount?: string;
  samplingSpaceSize?: string;
}

export interface Ga4ResponseMetadata {
  timeZone?: string;
  currencyCode?: string;
  emptyReason?: string;
  subjectToThresholding?: boolean;
  dataLossFromOtherRow?: boolean;
  samplingMetadatas?: Ga4SamplingMetadata[];
  schemaRestrictionResponse?: unknown;
}

import type { QuotaBucket, Ga4PropertyQuota } from "./ga4Quota";
export type { QuotaBucket, Ga4PropertyQuota };

export interface CompatibilityItem {
  compatibility: "COMPATIBLE" | "INCOMPATIBLE";
  dimensionMetadata?: { apiName?: string; uiName?: string; description?: string };
  metricMetadata?: { apiName?: string; uiName?: string; description?: string };
}

export interface CompatibilityResponse {
  dimensionCompatibilities?: CompatibilityItem[];
  metricCompatibilities?: CompatibilityItem[];
}

export interface DimensionMetadata {
  apiName: string;
  uiName: string;
  description: string;
  deprecatedApiNames?: string[];
  customDefinition?: boolean;
  category?: string;
}

export interface MetricMetadata {
  apiName: string;
  uiName: string;
  description: string;
  deprecatedApiNames?: string[];
  customDefinition?: boolean;
  category?: string;
  type: string;
  expression?: string;
  blockedReasons?: string[];
}

export interface Ga4MetadataResponse {
  name: string;
  dimensions: DimensionMetadata[];
  metrics: MetricMetadata[];
}

/**
 * Helper to get keyEvents from row, falling back to conversions for backwards compatibility.
 */
export function getKeyEvents(row: {
  keyEvents?: number;
  conversions?: number;
}): number {
  return row.keyEvents ?? row.conversions ?? 0;
}

/** Pull human-readable message out of Data API error body without secrets. */
export function extractApiError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // fall through to the raw body
  }
  return body.slice(0, 300);
}

/** Obtain OAuth2 access token for Google Service Account. */
export async function getAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [GA4_SCOPE],
  });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("GA4 access token request returned no token.");
  return token;
}

/**
 * Parse ResponseMetaData object.
 * Non-existing fields remain undefined (NEVER false and NEVER 0).
 */
export function parseResponseMetadata(
  raw: unknown,
): Ga4ResponseMetadata | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;

  const timeZone = typeof obj.timeZone === "string" ? obj.timeZone : undefined;
  const currencyCode =
    typeof obj.currencyCode === "string" ? obj.currencyCode : undefined;
  const emptyReason =
    typeof obj.emptyReason === "string" ? obj.emptyReason : undefined;
  const subjectToThresholding =
    typeof obj.subjectToThresholding === "boolean"
      ? obj.subjectToThresholding
      : undefined;
  const dataLossFromOtherRow =
    typeof obj.dataLossFromOtherRow === "boolean"
      ? obj.dataLossFromOtherRow
      : undefined;

  let samplingMetadatas: Ga4SamplingMetadata[] | undefined = undefined;
  if (Array.isArray(obj.samplingMetadatas)) {
    samplingMetadatas = obj.samplingMetadatas.map((sm) => {
      const s = sm as Record<string, unknown>;
      return {
        samplesReadCount:
          typeof s?.samplesReadCount === "string" ||
          typeof s?.samplesReadCount === "number"
            ? String(s.samplesReadCount)
            : undefined,
        samplingSpaceSize:
          typeof s?.samplingSpaceSize === "string" ||
          typeof s?.samplingSpaceSize === "number"
            ? String(s.samplingSpaceSize)
            : undefined,
      };
    });
  }

  const schemaRestrictionResponse =
    obj.schemaRestrictionResponse !== undefined
      ? obj.schemaRestrictionResponse
      : undefined;

  return {
    timeZone,
    currencyCode,
    emptyReason,
    subjectToThresholding,
    dataLossFromOtherRow,
    samplingMetadatas,
    schemaRestrictionResponse,
  };
}

function parseBucket(raw: unknown): QuotaBucket | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const consumed =
    typeof obj.consumed === "number"
      ? obj.consumed
      : typeof obj.consumed === "string"
        ? Number(obj.consumed)
        : undefined;
  const remaining =
    typeof obj.remaining === "number"
      ? obj.remaining
      : typeof obj.remaining === "string"
        ? Number(obj.remaining)
        : undefined;

  if (consumed === undefined || remaining === undefined) return undefined;
  if (!Number.isFinite(consumed) || !Number.isFinite(remaining)) return undefined;

  return { consumed, remaining };
}

/**
 * Parse PropertyQuota object across all 6 GA4 quota buckets.
 */
export function parsePropertyQuota(raw: unknown): Ga4PropertyQuota | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;

  const tokensPerDay = parseBucket(obj.tokensPerDay);
  const tokensPerHour = parseBucket(obj.tokensPerHour);
  const tokensPerProjectPerHour = parseBucket(obj.tokensPerProjectPerHour);
  const concurrentRequests = parseBucket(obj.concurrentRequests);
  const serverErrorsPerProjectPerHour = parseBucket(
    obj.serverErrorsPerProjectPerHour,
  );
  const potentiallyThresholdedRequestsPerHour = parseBucket(
    obj.potentiallyThresholdedRequestsPerHour,
  );

  return {
    tokensPerDay,
    tokensPerHour,
    tokensPerProjectPerHour,
    concurrentRequests,
    serverErrorsPerProjectPerHour,
    potentiallyThresholdedRequestsPerHour,
  };
}

/**
 * Check compatibility of dimensions and metrics.
 * This call does NOT consume property tokens and does not count towards report quota.
 */
export async function checkCompatibility(
  propertyId: string,
  token: string,
  request: {
    dimensions?: { name: string }[];
    metrics?: { name: string }[];
    dimensionFilter?: unknown;
    metricFilter?: unknown;
    compatibilityFilter?: string;
  },
): Promise<CompatibilityResponse> {
  const res = await fetch(
    `${DATA_API}/properties/${propertyId}:checkCompatibility`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GA4 checkCompatibility ${res.status}: ${extractApiError(body)}`,
    );
  }

  const json = (await res.json()) as CompatibilityResponse;
  return json;
}

/**
 * Validate that report request obeys GA4 dateRanges/cohort rules.
 * F1: Exactly one dateRange per request (when cohortSpec is absent).
 * Section 4: If cohortSpec is present, dateRanges MUST be omitted.
 */
export function validateReportRequest(req: ReportRequest): void {
  if (req.cohortSpec) {
    if (req.dateRanges && req.dateRanges.length > 0) {
      throw new Error(
        "Zahtev sa cohortSpec ne sme sadržati dateRanges (oba polja su poslata).",
      );
    }
  } else {
    if (!req.dateRanges || req.dateRanges.length === 0) {
      throw new Error("Zahtev ka GA4 Data API mora imati definisan dateRange.");
    }
    if (req.dateRanges.length > 1) {
      throw new Error(
        `Zahtev ka GA4 Data API sme imati tačno jedan dateRange (prosleđeno: ${req.dateRanges.length}).`,
      );
    }
  }
}

/**
 * Run a single report, paginating until all rows are returned.
 */
export async function runReport(
  propertyId: string,
  token: string,
  request: ReportRequest,
): Promise<{
  rows: GaRow[];
  rowCount: number;
  metadata?: Ga4ResponseMetadata;
  propertyQuota?: Ga4PropertyQuota;
}> {
  validateReportRequest(request);
  const rows: GaRow[] = [];
  let offset = 0;
  let lastMetadata: Ga4ResponseMetadata | undefined;
  let lastPropertyQuota: Ga4PropertyQuota | undefined;
  let totalRowCount = 0;

  for (;;) {
    const res = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...request,
        keepEmptyRows: request.keepEmptyRows ?? true,
        returnPropertyQuota: request.returnPropertyQuota ?? true,
        limit: request.limit ?? String(PAGE_LIMIT),
        offset: String(offset),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GA4 Data API ${res.status}: ${extractApiError(body)}`);
    }

    const json = (await res.json()) as {
      rows?: GaRow[];
      rowCount?: number;
      metadata?: unknown;
      propertyQuota?: unknown;
    };

    if (json.metadata) {
      lastMetadata = parseResponseMetadata(json.metadata);
    }
    if (json.propertyQuota) {
      lastPropertyQuota = parsePropertyQuota(json.propertyQuota);
    }

    const batch = json.rows ?? [];
    rows.push(...batch);
    offset += batch.length;
    totalRowCount = Number(json.rowCount ?? rows.length);
    if (batch.length === 0 || offset >= totalRowCount) break;
  }

  return {
    rows,
    rowCount: totalRowCount,
    metadata: lastMetadata,
    propertyQuota: lastPropertyQuota,
  };
}

/**
 * Run up to 5 reports in a single batchRunReports call.
 */
export async function batchRunReports(
  propertyId: string,
  token: string,
  requests: ReportRequest[],
): Promise<{
  reports: {
    rows: GaRow[];
    rowCount: number;
    metadata?: Ga4ResponseMetadata;
  }[];
  propertyQuota?: Ga4PropertyQuota;
}> {
  if (requests.length > 5) {
    throw new Error(
      `batchRunReports prima najviše 5 izveštaja (prosleđeno: ${requests.length})`,
    );
  }

  for (const req of requests) {
    validateReportRequest(req);
  }

  const payload = {
    requests: requests.map((req) => ({
      ...req,
      keepEmptyRows: req.keepEmptyRows ?? true,
      returnPropertyQuota: req.returnPropertyQuota ?? true,
      limit: req.limit ?? String(PAGE_LIMIT),
    })),
  };

  const res = await fetch(
    `${DATA_API}/properties/${propertyId}:batchRunReports`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GA4 Data API batchRunReports ${res.status}: ${extractApiError(body)}`,
    );
  }

  const json = (await res.json()) as {
    reports?: Array<{
      rows?: GaRow[];
      rowCount?: number;
      metadata?: unknown;
      propertyQuota?: unknown;
    }>;
    propertyQuota?: unknown;
  };

  let propertyQuota = parsePropertyQuota(json.propertyQuota);
  const reports = (json.reports ?? []).map((r) => {
    if (!propertyQuota && r.propertyQuota) {
      propertyQuota = parsePropertyQuota(r.propertyQuota);
    }
    return {
      rows: r.rows ?? [],
      rowCount: Number(r.rowCount ?? (r.rows?.length ?? 0)),
      metadata: parseResponseMetadata(r.metadata),
    };
  });

  return {
    reports,
    propertyQuota,
  };
}

/**
 * Run a realtime report for the last 30 minutes (Section 3).
 * POST /v1beta/properties/{propertyId}:runRealtimeReport
 */
export async function runRealtimeReport(
  propertyId: string,
  token: string,
  request: RealtimeReportRequest,
): Promise<{
  rows: GaRow[];
  rowCount: number;
  propertyQuota?: Ga4PropertyQuota;
}> {
  const res = await fetch(
    `${DATA_API}/properties/${propertyId}:runRealtimeReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...request,
        returnPropertyQuota: request.returnPropertyQuota ?? true,
        limit: request.limit ?? String(PAGE_LIMIT),
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GA4 Data API runRealtimeReport ${res.status}: ${extractApiError(body)}`,
    );
  }

  const json = (await res.json()) as {
    rows?: GaRow[];
    rowCount?: number;
    propertyQuota?: unknown;
  };

  return {
    rows: json.rows ?? [],
    rowCount: Number(json.rowCount ?? (json.rows?.length ?? 0)),
    propertyQuota: parsePropertyQuota(json.propertyQuota),
  };
}

/**
 * Fetch property metadata (dimensions and metrics).
 * GET /v1beta/properties/{propertyId}/metadata
 */
export async function fetchMetadata(
  propertyId: string,
  token: string,
): Promise<Ga4MetadataResponse> {
  const res = await fetch(`${DATA_API}/properties/${propertyId}/metadata`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GA4 fetchMetadata ${res.status}: ${extractApiError(body)}`,
    );
  }

  const json = (await res.json()) as {
    name?: string;
    dimensions?: DimensionMetadata[];
    metrics?: MetricMetadata[];
  };

  return {
    name: json.name ?? `properties/${propertyId}/metadata`,
    dimensions: (json.dimensions ?? []).map((d) => ({
      apiName: d.apiName ?? "",
      uiName: d.uiName ?? "",
      description: d.description ?? "",
      deprecatedApiNames: d.deprecatedApiNames,
      customDefinition: d.customDefinition,
      category: d.category,
    })),
    metrics: (json.metrics ?? []).map((m) => ({
      apiName: m.apiName ?? "",
      uiName: m.uiName ?? "",
      description: m.description ?? "",
      deprecatedApiNames: m.deprecatedApiNames,
      customDefinition: m.customDefinition,
      category: m.category,
      type: m.type ?? "TYPE_STANDARD",
      expression: m.expression,
      blockedReasons: m.blockedReasons,
    })),
  };
}
