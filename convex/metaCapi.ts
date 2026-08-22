import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { type Id } from "./_generated/dataModel";
import {
  CapiEventItem,
  CapiUserData,
  CAPI_MAX_BATCH_SIZE,
  CAPI_DISPATCH_LOCK_TTL_MS,
  buildCapiEventsUrl,
  buildCapiPayload,
  partitionCapiBatch,
  getCapiRetryDelayMs,
} from "./lib/metaCapi";
import { CRON_LOCKS, withCronLock } from "./lib/cronLock";
import { sanitizeApiResponse, extractMetaAdsError } from "./lib/metaAdsApi";
import { sanitizePii } from "./lib/metaAudienceHash";

export { CAPI_DISPATCH_LOCK_TTL_MS };

export interface CapiDispatchResult {
  success: boolean;
  sent: number;
  rejected: number;
  skipped?: boolean;
  reason?: string;
}

interface PendingCapiRow {
  _id: Id<"capiEvents">;
  eventName: string;
  eventTime: number;
  eventId: string;
  actionSource: "website" | "business_messaging";
  sourceKind: "link_redirect" | "openreply_conversion";
  hashedEmail?: string;
  hashedPhone?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string;
  fbp?: string;
  attempts?: number;
}

interface ValidatedItem extends CapiEventItem {
  docId: Id<"capiEvents">;
}

/**
 * Schedules exponential backoff retry when batch dispatch fails (D1).
 */
async function scheduleRetryOnFailure(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  validItems: ValidatedItem[],
  pendingRows: PendingCapiRow[],
) {
  if (validItems.length === 0) return;
  const maxNextAttempts = Math.max(
    ...validItems.map((v) => {
      const row = pendingRows.find((p) => p._id === v.docId);
      return (row?.attempts || 0) + 1;
    }),
  );
  const retryDelayMs = getCapiRetryDelayMs(maxNextAttempts);
  if (retryDelayMs !== null) {
    await ctx.scheduler.runAfter(
      retryDelayMs,
      internal.metaCapi.sendPendingCapiEventsAction,
      { workspaceId },
    );
  }
}

/**
 * Core worker for sending pending CAPI events in batches of up to CAPI_MAX_BATCH_SIZE (500).
 * Performs pre-flight local validation on every single event before sending.
 * Wrapped in withCronLock (E) to guarantee exactly one dispatcher runs at a time.
 */
export const sendPendingCapiEventsAction = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, { workspaceId }): Promise<CapiDispatchResult> => {
    let result: CapiDispatchResult = {
      success: true,
      sent: 0,
      rejected: 0,
    };

    const executed = await withCronLock(
      ctx,
      CRON_LOCKS.capiDispatch,
      async () => {
        // B4: Check environment variables
        const pixelId = process.env.META_PIXEL_ID?.trim();
        const capiToken = process.env.META_CAPI_TOKEN?.trim();
        const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE?.trim();

        if (!pixelId || !capiToken) {
          console.info(
            "[Meta CAPI] CAPI nije podešen (nedostaje META_PIXEL_ID ili META_CAPI_TOKEN). Događaji ostaju u statusu 'pending'.",
          );
          result = {
            success: false,
            sent: 0,
            rejected: 0,
            reason: "missing_credentials",
          };
          return;
        }

        // 1. Fetch pending events up to CAPI_MAX_BATCH_SIZE (B-F3d)
        const pending = (await ctx.runQuery(
          internal.metaCapiStore.getPendingCapiEvents,
          {
            workspaceId,
            limit: CAPI_MAX_BATCH_SIZE,
          },
        )) as PendingCapiRow[];

        if (pending.length === 0) {
          result = { success: true, sent: 0, rejected: 0 };
          return;
        }

        // 2. Map rows to CapiEventItem format (B-F1e: populate all user_data fields)
        const candidateItems: ValidatedItem[] = pending.map((p) => {
          const userData: CapiUserData = {};
          if (p.hashedEmail) {
            userData.em = [p.hashedEmail];
          }
          if (p.hashedPhone) {
            userData.ph = [p.hashedPhone];
          }
          if (p.clientIpAddress) {
            userData.client_ip_address = p.clientIpAddress;
          }
          if (p.clientUserAgent) {
            userData.client_user_agent = p.clientUserAgent;
          }
          if (p.fbc) {
            userData.fbc = p.fbc;
          }
          if (p.fbp) {
            userData.fbp = p.fbp;
          }

          return {
            docId: p._id,
            event_name: p.eventName,
            event_time: p.eventTime,
            event_id: p.eventId,
            action_source: p.actionSource,
            user_data: userData,
          };
        });

        // 3. Pre-flight local validation (B2)
        const nowSec = Math.floor(Date.now() / 1000);
        const { valid, rejected } = partitionCapiBatch(candidateItems, nowSec);

        // Save rejections immediately
        if (rejected.length > 0) {
          await ctx.runMutation(internal.metaCapiStore.markCapiEventsRejected, {
            rejections: rejected.map((r) => ({
              id: r.event.docId,
              reason: r.reason,
            })),
          });
        }

        // D2: If all 500 failed local validation, schedule next pass to drain remaining backlog
        if (valid.length === 0) {
          if (pending.length === CAPI_MAX_BATCH_SIZE) {
            await ctx.scheduler.runAfter(
              1000,
              internal.metaCapi.sendPendingCapiEventsAction,
              { workspaceId },
            );
          }
          result = { success: true, sent: 0, rejected: rejected.length };
          return;
        }

        // 4. Send valid batch to Meta Graph API
        const url = buildCapiEventsUrl(pixelId);
        const payload = buildCapiPayload(
          valid.map((v) => ({
            event_name: v.event_name,
            event_time: v.event_time,
            event_id: v.event_id,
            action_source: v.action_source,
            user_data: v.user_data,
          })),
          testEventCode,
        );

        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${capiToken}`,
            },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const rawErrText = await res.text().catch(() => "");
            const sanitizedErr = sanitizePii(
              extractMetaAdsError(rawErrText) || sanitizeApiResponse(rawErrText),
            );
            console.warn("[Meta CAPI] Slanje batch-a nije uspelo:", sanitizedErr);

            // B-F3(b): Increment attempts; reject if attempts >= 5
            await ctx.runMutation(internal.metaCapiStore.recordCapiBatchFailure, {
              eventDocIds: valid.map((v) => v.docId),
              errorReason: sanitizedErr,
            });

            // D1: Schedule exponential backoff retry
            await scheduleRetryOnFailure(ctx, workspaceId, valid, pending);

            result = {
              success: false,
              sent: 0,
              rejected: rejected.length,
              reason: sanitizedErr,
            };
            return;
          }

          const rawResText = await res.text().catch(() => "{}");
          const sanitizedResponse = sanitizeApiResponse(rawResText);

          // 5. Mark valid events as sent
          await ctx.runMutation(internal.metaCapiStore.markCapiEventsSent, {
            eventDocIds: valid.map((v) => v.docId),
            sentAt: Date.now(),
            metaResponse: sanitizedResponse,
          });

          // D2 / B-F3(c): If full batch was retrieved, schedule another pass to drain the queue
          if (pending.length === CAPI_MAX_BATCH_SIZE) {
            await ctx.scheduler.runAfter(
              1000,
              internal.metaCapi.sendPendingCapiEventsAction,
              {
                workspaceId,
              },
            );
          }

          result = {
            success: true,
            sent: valid.length,
            rejected: rejected.length,
          };
        } catch (err: unknown) {
          const sanitizedErr = sanitizePii(
            err instanceof Error ? err.message : String(err),
          );
          console.warn("[Meta CAPI] Mrežna greška pri slanju batch-a:", sanitizedErr);

          // B-F3(b): Increment attempts; reject if attempts >= 5
          await ctx.runMutation(internal.metaCapiStore.recordCapiBatchFailure, {
            eventDocIds: valid.map((v) => v.docId),
            errorReason: sanitizedErr,
          });

          // D1: Schedule exponential backoff retry
          await scheduleRetryOnFailure(ctx, workspaceId, valid, pending);

          result = {
            success: false,
            sent: 0,
            rejected: rejected.length,
            reason: sanitizedErr,
          };
        }
      },
      CAPI_DISPATCH_LOCK_TTL_MS,
    );

    if (!executed) {
      return {
        success: true,
        sent: 0,
        rejected: 0,
        skipped: true,
      };
    }

    return result;
  },
});

/**
 * Public trigger to dispatch pending CAPI events manually on demand.
 */
export const triggerCapiDispatchAction = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<CapiDispatchResult> => {
    const wsId =
      args.workspaceId ??
      ((await ctx.runQuery(api.workspaces.currentContext))?.workspace?.id as
        | Id<"workspaces">
        | undefined);
    if (!wsId) {
      throw new Error("Radni prostor nije izabran ili niste prijavljeni.");
    }

    return await ctx.runAction(internal.metaCapi.sendPendingCapiEventsAction, {
      workspaceId: wsId,
    });
  },
});
