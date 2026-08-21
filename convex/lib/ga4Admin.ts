"use node";

import { extractApiError } from "./ga4Api";

/**
 * ============================================================================
 * GA4 ADMIN API TRANSPORT LAYER (REST / fetch)
 * ============================================================================
 *
 * Provides typed transport functions for Google Analytics Admin API (v1beta).
 * Uses the same OAuth2 scope: https://www.googleapis.com/auth/analytics.readonly
 * Base URL: https://analyticsadmin.googleapis.com/v1beta
 *
 * All methods:
 *   - Are strictly read-only GET requests.
 *   - Return `{ ok: true, data: T } | { ok: false, reason: string }` so 403 or
 *     resource errors do not throw or crash the sync.
 *   - Handle pagination (`nextPageToken`) without silently dropping pages.
 * ============================================================================
 */

export const ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

export interface Ga4PropertyDetails {
  displayName?: string;
  timeZone?: string;
  currencyCode?: string;
  industryCategory?: string;
  serviceLevel?: string;
  createTime?: string;
  parent?: string;
}

export interface Ga4DataRetentionSettings {
  eventDataRetention?: string;
  resetUserDataOnNewActivity?: boolean;
}

export interface Ga4KeyEvent {
  eventName: string;
  countingMethod?: string;
  custom?: boolean;
  deletable?: boolean;
  createTime?: string;
}

export interface Ga4CustomDimension {
  parameterName: string;
  displayName: string;
  description?: string;
  scope?: string;
  disallowAdsPersonalization?: boolean;
}

export interface Ga4CustomMetric {
  parameterName: string;
  displayName: string;
  description?: string;
  measurementUnit?: string;
  scope?: string;
  restrictedMetricType?: string[];
}

export interface Ga4DataStream {
  displayName: string;
  type?: string;
  measurementId?: string;
  defaultUri?: string;
}

export interface Ga4GoogleAdsLink {
  customerId: string;
  canManageClients?: boolean;
  adsPersonalizationEnabled?: boolean;
  creatorEmailAddress?: string;
  createTime?: string;
}

/**
 * GET /v1beta/properties/{propertyId}
 */
export async function fetchProperty(
  propertyId: string,
  token: string,
): Promise<AdminResult<Ga4PropertyDetails>> {
  try {
    const url = `${ADMIN_API}/properties/${propertyId}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: `Status ${res.status}: ${extractApiError(body)}` };
    }

    const json = (await res.json()) as Record<string, unknown>;
    return {
      ok: true,
      data: {
        displayName: typeof json.displayName === "string" ? json.displayName : undefined,
        timeZone: typeof json.timeZone === "string" ? json.timeZone : undefined,
        currencyCode: typeof json.currencyCode === "string" ? json.currencyCode : undefined,
        industryCategory: typeof json.industryCategory === "string" ? json.industryCategory : undefined,
        serviceLevel: typeof json.serviceLevel === "string" ? json.serviceLevel : undefined,
        createTime: typeof json.createTime === "string" ? json.createTime : undefined,
        parent: typeof json.parent === "string" ? json.parent : undefined,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * GET /v1beta/properties/{propertyId}/dataRetentionSettings
 */
export async function fetchDataRetention(
  propertyId: string,
  token: string,
): Promise<AdminResult<Ga4DataRetentionSettings>> {
  try {
    const url = `${ADMIN_API}/properties/${propertyId}/dataRetentionSettings`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: `Status ${res.status}: ${extractApiError(body)}` };
    }

    const json = (await res.json()) as Record<string, unknown>;
    return {
      ok: true,
      data: {
        eventDataRetention:
          typeof json.eventDataRetention === "string"
            ? json.eventDataRetention
            : undefined,
        resetUserDataOnNewActivity:
          typeof json.resetUserDataOnNewActivity === "boolean"
            ? json.resetUserDataOnNewActivity
            : undefined,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * GET /v1beta/properties/{propertyId}/keyEvents (paginated)
 */
export async function fetchKeyEvents(
  propertyId: string,
  token: string,
): Promise<AdminResult<Ga4KeyEvent[]>> {
  try {
    const items: Ga4KeyEvent[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const url = new URL(`${ADMIN_API}/properties/${propertyId}/keyEvents`);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, reason: `Status ${res.status}: ${extractApiError(body)}` };
      }

      const json = (await res.json()) as {
        keyEvents?: Array<{
          eventName?: string;
          countingMethod?: string;
          custom?: boolean;
          deletable?: boolean;
          createTime?: string;
        }>;
        nextPageToken?: string;
      };

      for (const ke of json.keyEvents ?? []) {
        if (ke.eventName) {
          items.push({
            eventName: ke.eventName,
            countingMethod: ke.countingMethod,
            custom: ke.custom,
            deletable: ke.deletable,
            createTime: ke.createTime,
          });
        }
      }

      pageToken = json.nextPageToken;
    } while (pageToken);

    return { ok: true, data: items };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * GET /v1beta/properties/{propertyId}/customDimensions (paginated)
 */
export async function fetchCustomDimensions(
  propertyId: string,
  token: string,
): Promise<AdminResult<Ga4CustomDimension[]>> {
  try {
    const items: Ga4CustomDimension[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const url = new URL(`${ADMIN_API}/properties/${propertyId}/customDimensions`);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, reason: `Status ${res.status}: ${extractApiError(body)}` };
      }

      const json = (await res.json()) as {
        customDimensions?: Array<{
          parameterName?: string;
          displayName?: string;
          description?: string;
          scope?: string;
          disallowAdsPersonalization?: boolean;
        }>;
        nextPageToken?: string;
      };

      for (const cd of json.customDimensions ?? []) {
        if (cd.parameterName && cd.displayName) {
          items.push({
            parameterName: cd.parameterName,
            displayName: cd.displayName,
            description: cd.description,
            scope: cd.scope,
            disallowAdsPersonalization: cd.disallowAdsPersonalization,
          });
        }
      }

      pageToken = json.nextPageToken;
    } while (pageToken);

    return { ok: true, data: items };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * GET /v1beta/properties/{propertyId}/customMetrics (paginated)
 */
export async function fetchCustomMetrics(
  propertyId: string,
  token: string,
): Promise<AdminResult<Ga4CustomMetric[]>> {
  try {
    const items: Ga4CustomMetric[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const url = new URL(`${ADMIN_API}/properties/${propertyId}/customMetrics`);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, reason: `Status ${res.status}: ${extractApiError(body)}` };
      }

      const json = (await res.json()) as {
        customMetrics?: Array<{
          parameterName?: string;
          displayName?: string;
          description?: string;
          measurementUnit?: string;
          scope?: string;
          restrictedMetricType?: string[];
        }>;
        nextPageToken?: string;
      };

      for (const cm of json.customMetrics ?? []) {
        if (cm.parameterName && cm.displayName) {
          items.push({
            parameterName: cm.parameterName,
            displayName: cm.displayName,
            description: cm.description,
            measurementUnit: cm.measurementUnit,
            scope: cm.scope,
            restrictedMetricType: cm.restrictedMetricType,
          });
        }
      }

      pageToken = json.nextPageToken;
    } while (pageToken);

    return { ok: true, data: items };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * GET /v1beta/properties/{propertyId}/dataStreams (paginated)
 */
export async function fetchDataStreams(
  propertyId: string,
  token: string,
): Promise<AdminResult<Ga4DataStream[]>> {
  try {
    const items: Ga4DataStream[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const url = new URL(`${ADMIN_API}/properties/${propertyId}/dataStreams`);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, reason: `Status ${res.status}: ${extractApiError(body)}` };
      }

      const json = (await res.json()) as {
        dataStreams?: Array<{
          displayName?: string;
          type?: string;
          webStreamData?: {
            measurementId?: string;
            defaultUri?: string;
          };
        }>;
        nextPageToken?: string;
      };

      for (const ds of json.dataStreams ?? []) {
        items.push({
          displayName: ds.displayName ?? "Tok podataka",
          type: ds.type,
          measurementId: ds.webStreamData?.measurementId,
          defaultUri: ds.webStreamData?.defaultUri,
        });
      }

      pageToken = json.nextPageToken;
    } while (pageToken);

    return { ok: true, data: items };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * GET /v1beta/properties/{propertyId}/googleAdsLinks (paginated)
 */
export async function fetchGoogleAdsLinks(
  propertyId: string,
  token: string,
): Promise<AdminResult<Ga4GoogleAdsLink[]>> {
  try {
    const items: Ga4GoogleAdsLink[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const url = new URL(`${ADMIN_API}/properties/${propertyId}/googleAdsLinks`);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, reason: `Status ${res.status}: ${extractApiError(body)}` };
      }

      const json = (await res.json()) as {
        googleAdsLinks?: Array<{
          customerId?: string;
          canManageClients?: boolean;
          adsPersonalizationEnabled?: boolean;
          creatorEmailAddress?: string;
          createTime?: string;
        }>;
        nextPageToken?: string;
      };

      for (const gal of json.googleAdsLinks ?? []) {
        if (gal.customerId) {
          items.push({
            customerId: gal.customerId,
            canManageClients: gal.canManageClients,
            adsPersonalizationEnabled: gal.adsPersonalizationEnabled,
            creatorEmailAddress: gal.creatorEmailAddress,
            createTime: gal.createTime,
          });
        }
      }

      pageToken = json.nextPageToken;
    } while (pageToken);

    return { ok: true, data: items };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
