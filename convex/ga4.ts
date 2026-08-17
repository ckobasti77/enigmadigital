"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { JWT } from "google-auth-library";
import { decryptCredentials } from "./lib/crypto";
import { runSync } from "./lib/runSync";

/**
 * GA4 sync (PLAN.md §4, M3). A "use node" action so it can JWT-sign with the
 * service-account private key and hit the GA4 Data API over HTTPS.
 *
 * We authenticate with `google-auth-library` (JWT) and call the Data API's REST
 * `runReport` endpoint via `fetch` rather than the gRPC `@google-analytics/data`
 * client — the REST path bundles cleanly into the Convex node runtime and needs
 * no proto/native deps. Two reports per run:
 *   a) daily totals            → ga4Daily
 *   b) source/medium/campaign  → ga4TrafficDaily
 *
 * Every run re-fetches the last 3 days (GA4 restates recent data) plus any days
 * missing from `ga4Daily`; a connection's first sync therefore backfills the
 * whole 90-day window. All work runs inside `runSync`, so a bad property ID or
 * key lands as a clean `syncRuns` error + connection status "error" instead of
 * an unhandled crash.
 */

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const BACKFILL_DAYS = 90;
const LOOKBACK_DAYS = 3; // GA4 keeps adjusting the most recent days
const PAGE_LIMIT = 100_000; // Data API max is 250k rows/page; this covers a run
const TRAFFIC_CHUNK = 100; // rows per upsert transaction

// ── date helpers (UTC; GA4's own "date" dimension is the canonical value) ─────

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Last `n` days as "YYYY-MM-DD", ascending, ending today (UTC). */
function lastNDates(n: number): string[] {
  const now = Date.now();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(isoDay(now - i * 86_400_000));
  return out;
}

/** GA4 returns the `date` dimension as "YYYYMMDD"; normalize to "YYYY-MM-DD". */
function normalizeDate(raw: string): string {
  return /^\d{8}$/.test(raw)
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    : raw;
}

function toNumber(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ── Data API plumbing ─────────────────────────────────────────────────────────

type GaRow = {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
};

type ReportRequest = {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions: { name: string }[];
  metrics: { name: string }[];
};

/** Pull the human-readable message out of a Data API error body (no secrets). */
function extractApiError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // fall through to the raw body
  }
  return body.slice(0, 300);
}

async function getAccessToken(sa: {
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

/** Run one `runReport`, paginating until every row is collected. */
async function runReport(
  propertyId: string,
  token: string,
  request: ReportRequest,
): Promise<GaRow[]> {
  const rows: GaRow[] = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(
      `${DATA_API}/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...request,
          limit: String(PAGE_LIMIT),
          offset: String(offset),
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GA4 Data API ${res.status}: ${extractApiError(body)}`);
    }

    const json = (await res.json()) as { rows?: GaRow[]; rowCount?: number };
    const batch = json.rows ?? [];
    rows.push(...batch);
    offset += batch.length;
    const total = Number(json.rowCount ?? rows.length);
    if (batch.length === 0 || offset >= total) break;
  }
  return rows;
}

// ── sync action ───────────────────────────────────────────────────────────────

export const syncGa4 = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.runQuery(internal.connections.getForSync, {
      connectionId,
    });
    if (conn === null) throw new Error("GA4 connection not found.");
    if (conn.provider !== "ga4") {
      throw new Error("Connection is not a GA4 connection.");
    }
    const workspaceId = conn.workspaceId;

    // Everything below records to `syncRuns`: decrypt, JWT, fetch and upsert all
    // happen inside so any failure becomes a clean error row, never a crash.
    await runSync(
      ctx,
      { workspaceId, provider: "ga4", connectionId },
      async () => {
        const propertyId = (conn.externalId ?? "").trim();
        if (!/^\d+$/.test(propertyId)) {
          throw new Error("GA4 property ID is missing or invalid.");
        }

        const secret = await decryptCredentials(conn.encryptedCredentials);
        let sa: { client_email: string; private_key: string };
        try {
          const parsed = JSON.parse(secret) as {
            client_email?: string;
            private_key?: string;
          };
          if (!parsed.client_email || !parsed.private_key) {
            throw new Error("missing fields");
          }
          sa = {
            client_email: parsed.client_email,
            private_key: parsed.private_key,
          };
        } catch {
          throw new Error("GA4 service account JSON is invalid.");
        }

        const token = await getAccessToken(sa);

        // Target window: last 3 days (always re-fetch) + any missing days,
        // fetched as one contiguous range ending "today" (property timezone).
        const candidates = lastNDates(BACKFILL_DAYS);
        const existing = new Set(
          await ctx.runQuery(internal.ga4Store.dailyDates, {
            workspaceId,
            since: candidates[0],
          }),
        );
        const lookbackCutoff = candidates[candidates.length - LOOKBACK_DAYS];
        const needed = candidates.filter(
          (d) => d >= lookbackCutoff || !existing.has(d),
        );
        const startDate = needed.length > 0 ? needed[0] : lookbackCutoff;
        const dateRanges = [{ startDate, endDate: "today" }];

        // a) daily totals
        const dailyRaw = await runReport(propertyId, token, {
          dateRanges,
          dimensions: [{ name: "date" }],
          metrics: [
            { name: "sessions" },
            { name: "activeUsers" },
            { name: "newUsers" },
            { name: "conversions" },
            { name: "engagementRate" },
          ],
        });
        const daily = dailyRaw.map((r) => {
          const d = r.dimensionValues ?? [];
          const m = r.metricValues ?? [];
          return {
            date: normalizeDate(d[0]?.value ?? ""),
            sessions: toNumber(m[0]?.value),
            activeUsers: toNumber(m[1]?.value),
            newUsers: toNumber(m[2]?.value),
            conversions: toNumber(m[3]?.value),
            engagementRate: toNumber(m[4]?.value),
          };
        });
        const dailyWritten =
          daily.length > 0
            ? await ctx.runMutation(internal.ga4Store.upsertDaily, {
                workspaceId,
                rows: daily,
              })
            : 0;

        // b) source / medium / campaign breakdown
        const trafficRaw = await runReport(propertyId, token, {
          dateRanges,
          dimensions: [
            { name: "date" },
            { name: "sessionSource" },
            { name: "sessionMedium" },
            { name: "sessionCampaignName" },
          ],
          metrics: [{ name: "sessions" }, { name: "conversions" }],
        });
        const traffic = trafficRaw.map((r) => {
          const d = r.dimensionValues ?? [];
          const m = r.metricValues ?? [];
          return {
            date: normalizeDate(d[0]?.value ?? ""),
            sessionSource: d[1]?.value ?? "(not set)",
            sessionMedium: d[2]?.value ?? "(not set)",
            sessionCampaign: d[3]?.value ?? "(not set)",
            sessions: toNumber(m[0]?.value),
            conversions: toNumber(m[1]?.value),
          };
        });
        let trafficWritten = 0;
        for (let i = 0; i < traffic.length; i += TRAFFIC_CHUNK) {
          trafficWritten += await ctx.runMutation(
            internal.ga4Store.upsertTraffic,
            { workspaceId, rows: traffic.slice(i, i + TRAFFIC_CHUNK) },
          );
        }

        return dailyWritten + trafficWritten;
      },
    );
  },
});

/**
 * Cron fan-out (every 6h): sync every GA4 connection. Per-connection errors are
 * already recorded on `syncRuns` by `runSync`, so we swallow here to keep one
 * bad connection from blocking the rest.
 */
export const syncAllGa4 = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectionIds = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "ga4" },
    );
    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.ga4.syncGa4, { connectionId });
      } catch {
        // recorded on syncRuns; continue with the next connection
      }
    }
  },
});
