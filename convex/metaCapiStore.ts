import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { requireMembership } from "./lib/auth";
import { CAPI_MAX_BATCH_SIZE, hasMatchableIdentity } from "./lib/metaCapi";

/**
 * ============================================================================
 * META CONVERSIONS API (CAPI) DATABASE STORE (B1, B-F1, B-F3)
 * ============================================================================
 */

/**
 * Records a new CAPI event into capiEvents with deterministic eventId deduplication.
 * If no identifiers are provided, returns null without inserting (B-F1d).
 */
export const recordCapiEvent = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    eventName: v.string(),
    eventTime: v.number(), // Unix timestamp in seconds
    eventId: v.string(),
    actionSource: v.union(
      v.literal("website"),
      v.literal("business_messaging"),
    ),
    sourceKind: v.union(
      v.literal("link_redirect"),
      v.literal("openreply_conversion"),
    ),
    hashedEmail: v.optional(v.string()),
    hashedPhone: v.optional(v.string()),
    clientIpAddress: v.optional(v.string()),
    clientUserAgent: v.optional(v.string()),
    fbc: v.optional(v.string()),
    fbp: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.id("capiEvents")),
  handler: async (ctx, args) => {
    // B-F1(d): Bez ijednog identifikatora koji Meta uparuje, događaj se NE upisuje.
    // Samo user-agent NIJE dovoljan — Meta ga ne priznaje kao parametar za
    // uparivanje, pa bi takav događaj pet puta pokušao i pao. Bolje da ga nema.
    // clientUserAgent se i dalje upisuje (dole) i šalje uz pravi identifikator;
    // samo prestaje da bude jedini razlog za upis.
    if (!hasMatchableIdentity(args)) {
      return null;
    }

    // Check for existing eventId to prevent duplicates
    const existing = await ctx.db
      .query("capiEvents")
      .withIndex("by_event_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("eventId", args.eventId),
      )
      .first();

    if (existing !== null) {
      return existing._id;
    }

    const fields = {
      workspaceId: args.workspaceId,
      eventName: args.eventName.trim(),
      eventTime: args.eventTime,
      eventId: args.eventId.trim(),
      actionSource: args.actionSource,
      sourceKind: args.sourceKind,
      hashedEmail: args.hashedEmail?.trim().toLowerCase(),
      hashedPhone: args.hashedPhone?.trim().toLowerCase(),
      clientIpAddress: args.clientIpAddress?.trim(),
      clientUserAgent: args.clientUserAgent?.trim(),
      fbc: args.fbc?.trim(),
      fbp: args.fbp?.trim(),
      status: "pending" as const,
      attempts: 0,
      syncedAt: Date.now(),
    };

    return await ctx.db.insert("capiEvents", fields);
  },
});

/**
 * Fetches pending CAPI events for a workspace up to CAPI_MAX_BATCH_SIZE (B-F3d).
 */
export const getPendingCapiEvents = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { workspaceId, limit = CAPI_MAX_BATCH_SIZE }) => {
    return await ctx.db
      .query("capiEvents")
      .withIndex("by_status", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "pending"),
      )
      .take(limit);
  },
});

/**
 * Marks a batch of CAPI events as successfully sent.
 */
export const markCapiEventsSent = internalMutation({
  args: {
    eventDocIds: v.array(v.id("capiEvents")),
    metaResponse: v.optional(v.string()),
    sentAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { eventDocIds, metaResponse, sentAt }) => {
    const now = Date.now();
    for (const docId of eventDocIds) {
      const existing = await ctx.db.get(docId);
      if (existing !== null) {
        await ctx.db.patch(docId, {
          status: "sent",
          sentAt,
          metaResponse,
          // Sirova IP se briše u istom potezu kojim se slanje zatvara. To je
          // jedina nehaširana adresa u bazi (svestan izuzetak za Meta CAPI), i
          // živi tačno onoliko koliko traje slanje — ni sekund duže. NE
          // „popravljati" zadržavanjem: poslata je, više nije potrebna.
          clientIpAddress: undefined,
          syncedAt: now,
        });
      }
    }
    return null;
  },
});

/**
 * Records batch dispatch failure, increments attempt counters, and marks events
 * with attempts >= 5 as rejected (B-F3b).
 */
export const recordCapiBatchFailure = internalMutation({
  args: {
    eventDocIds: v.array(v.id("capiEvents")),
    errorReason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { eventDocIds, errorReason }) => {
    const now = Date.now();
    for (const docId of eventDocIds) {
      const doc = await ctx.db.get(docId);
      if (doc && doc.status === "pending") {
        const nextAttempts = (doc.attempts || 0) + 1;
        if (nextAttempts >= 5) {
          await ctx.db.patch(docId, {
            attempts: nextAttempts,
            lastAttemptAt: now,
            status: "rejected",
            rejectReason: `Pet neuspelih pokušaja slanja: ${errorReason}`,
            // Razlog se pamti od PRVOG pokušaja, ne tek na petom — inače se bag
            // dijagnostikuje ručno kroz logove.
            metaResponse: errorReason,
            // Konačno odbijeno: slanja više neće biti, sirova IP se briše (isti
            // razlog kao u markCapiEventsSent — živi tačno koliko traje slanje).
            clientIpAddress: undefined,
            syncedAt: now,
          });
        } else {
          await ctx.db.patch(docId, {
            attempts: nextAttempts,
            lastAttemptAt: now,
            // Sanitizovani razlog pri SVAKOM neuspehu (ne samo na petom).
            metaResponse: errorReason,
            // IP se ovde NE briše: događaj ostaje „pending" i biće ponovo poslat,
            // pa mu adresa i dalje treba dok slanje traje.
            syncedAt: now,
          });
        }
      }
    }
    return null;
  },
});

/**
 * Marks a batch of CAPI events as rejected due to local pre-flight validation.
 */
export const markCapiEventsRejected = internalMutation({
  args: {
    rejections: v.array(
      v.object({
        id: v.id("capiEvents"),
        reason: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { rejections }) => {
    const now = Date.now();
    for (const item of rejections) {
      const existing = await ctx.db.get(item.id);
      if (existing !== null) {
        await ctx.db.patch(item.id, {
          status: "rejected",
          rejectReason: item.reason,
          // Odbijeno pre slanja (lokalna validacija) — događaj se nikad neće
          // poslati, pa sirova IP više nije potrebna i briše se odmah.
          clientIpAddress: undefined,
          syncedAt: now,
        });
      }
    }
    return null;
  },
});

/**
 * Public query returning 7-day CAPI event stats, retries, and recent rejections.
 * Rule 1: Real 0 is 0.
 * Rule 3: Date.now() is NOT called inside Convex query.
 */
export const getCapiStats = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    nowSec: v.optional(v.number()), // passed from client
  },
  returns: v.object({
    configured: v.boolean(),
    missingEnvVars: v.array(v.string()),
    sentCount: v.number(),
    pendingCount: v.number(),
    retryingCount: v.number(),
    rejectedCount: v.number(),
    recentRejected: v.array(
      v.object({
        _id: v.id("capiEvents"),
        eventName: v.string(),
        eventTime: v.number(),
        actionSource: v.string(),
        sourceKind: v.string(),
        rejectReason: v.optional(v.string()),
        attempts: v.optional(v.number()),
        syncedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const targetWs = args.workspaceId ?? workspaceId;

    // Check environment variables without throwing
    const missing: string[] = [];
    if (!process.env.META_PIXEL_ID?.trim()) {
      missing.push("META_PIXEL_ID");
    }
    if (!process.env.META_CAPI_TOKEN?.trim()) {
      missing.push("META_CAPI_TOKEN");
    }
    const configured = missing.length === 0;

    // 7 days window (in seconds)
    const cutoffSec = args.nowSec ? args.nowSec - 7 * 86400 : 0;

    // Read events for workspace
    const recentEvents = await ctx.db
      .query("capiEvents")
      .withIndex("by_workspace_time", (q) =>
        cutoffSec > 0
          ? q.eq("workspaceId", targetWs).gte("eventTime", cutoffSec)
          : q.eq("workspaceId", targetWs),
      )
      .collect();

    let sentCount = 0;
    let pendingCount = 0;
    let retryingCount = 0;
    let rejectedCount = 0;

    for (const ev of recentEvents) {
      if (ev.status === "sent") {
        sentCount++;
      } else if (ev.status === "pending") {
        pendingCount++;
        if ((ev.attempts || 0) >= 1 && (ev.attempts || 0) < 5) {
          retryingCount++;
        }
      } else if (ev.status === "rejected") {
        rejectedCount++;
      }
    }

    // Last 20 rejected events
    const rejectedDocs = await ctx.db
      .query("capiEvents")
      .withIndex("by_status", (q) =>
        q.eq("workspaceId", targetWs).eq("status", "rejected"),
      )
      .order("desc")
      .take(20);

    const recentRejected = rejectedDocs.map((r) => ({
      _id: r._id,
      eventName: r.eventName,
      eventTime: r.eventTime,
      actionSource: r.actionSource,
      sourceKind: r.sourceKind,
      rejectReason: r.rejectReason,
      attempts: r.attempts,
      syncedAt: r.syncedAt,
    }));

    return {
      configured,
      missingEnvVars: missing,
      sentCount,
      pendingCount,
      retryingCount,
      rejectedCount,
      recentRejected,
    };
  },
});
