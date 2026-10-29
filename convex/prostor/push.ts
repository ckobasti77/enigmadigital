// Preneto iz Devotion packages/backend/convex/push.ts (main @ c05c40f), SPAJANJE S06.
"use node";

import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import {
  belgradeMinutesOfDay,
  isWithinQuietHours,
  type NotificationType,
} from "./lib/notifications";
import { typeBreaksQuietHours } from "./lib/notificationChannels";

type DeliveryOutcome = "sent" | "gone" | "failed";

type DeliveryResult = {
  subscriptionId: Id<"pushSubscriptions">;
  outcome: DeliveryOutcome;
};

/**
 * Tipovi su ispisani rukom, a ne izvedeni iz `ctx.runQuery`: dostava se zakazuje
 * iz `lib/notifications.ts`, pa bi izvođenje kroz `internal` napravilo kružnu
 * referencu koju TypeScript ne ume da razreši.
 */
type PushPayload = {
  title: string;
  body: string | null;
  type: NotificationType;
  /** `null` = lično obaveštenje; JSON nosi `null`, a `sw.js` vodi na `me-chat`. */
  workspaceId: Id<"workspaces"> | null;
  targetType: string;
  targetId: string | null;
  notificationId: Id<"notifications">;
  // Podešavanja PO PROFILU — isti izvor kao native push (sekcija 7).
  mutedTypes: Array<NotificationType>;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  subscriptions: Array<{
    _id: Id<"pushSubscriptions">;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
} | null;

type DeliverResult = {
  sent: number;
  removed: number;
  skipped: string | null;
};

/**
 * Push dostava. Živi u Node runtime-u jer VAPID potpis i `aes128gcm` šifrovanje
 * payload-a traže Node kriptografiju; zato ovaj fajl ne sme da izvozi upite ni
 * mutacije (one su u `pushSubscriptions.ts`).
 *
 * Ključevi se postavljaju sa `npx convex env set`:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: adresa)
 * Bez njih dostava se tiho preskače — obaveštenja u aplikaciji rade i dalje.
 * SPAJANJE (P16): sve tri su obavezne; Devotion je bez `VAPID_SUBJECT` slao sa
 * izmišljenom adresom, a ovde se tada ne šalje ništa.
 */
export const deliver = internalAction({
  args: { notificationId: v.id("notifications") },
  returns: v.object({
    sent: v.number(),
    removed: v.number(),
    skipped: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<DeliverResult> => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (!publicKey || !privateKey || !subject) {
      return { sent: 0, removed: 0, skipped: "VAPID ključevi nisu postavljeni" };
    }

    const payload: PushPayload = await ctx.runQuery(
      internal.prostor.pushSubscriptions.pushPayloadForNotification,
      { notificationId: args.notificationId },
    );
    if (payload === null) {
      return { sent: 0, removed: 0, skipped: "nema pretplaćenih uređaja" };
    }

    // Ista pravila potiskivanja kao native (`expoPush.ts`): podešavanja su po
    // profilu, pa se odlučuje jednom za celu notifikaciju (sekcija 7).
    if (payload.mutedTypes.includes(payload.type)) {
      return { sent: 0, removed: 0, skipped: "utišan tip" };
    }
    // Tihi sati na serveru; `mention` i `deadline` ih probijaju — namerno, da
    // te ono što traži odgovor ili ističe probudi i noću (`typeBreaksQuietHours`).
    if (
      !typeBreaksQuietHours(payload.type) &&
      isWithinQuietHours(
        payload.quietHoursStart,
        payload.quietHoursEnd,
        belgradeMinutesOfDay(Date.now()),
      )
    ) {
      return { sent: 0, removed: 0, skipped: "tihi sati" };
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const message = JSON.stringify({
      title: payload.title,
      body: payload.body,
      workspaceId: payload.workspaceId,
      targetType: payload.targetType,
      targetId: payload.targetId,
      notificationId: payload.notificationId,
    });

    const results: Array<DeliveryResult> = await Promise.all(
      payload.subscriptions.map(async (subscription): Promise<DeliveryResult> => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            message,
            { TTL: 24 * 60 * 60, urgency: "high" },
          );
          return { subscriptionId: subscription._id, outcome: "sent" as const };
        } catch (error) {
          // 404/410 znači da je browser poništio pretplatu — više nije živa.
          const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof (error as { statusCode: unknown }).statusCode === "number"
              ? (error as { statusCode: number }).statusCode
              : null;
          const gone = statusCode === 404 || statusCode === 410;
          if (!gone) {
            console.error("Push dostava neuspešna", statusCode, error);
          }
          return {
            subscriptionId: subscription._id,
            outcome: gone ? ("gone" as const) : ("failed" as const),
          };
        }
      }),
    );

    await ctx.runMutation(internal.prostor.pushSubscriptions.recordDeliveryResults, {
      results,
    });

    return {
      sent: results.filter((result) => result.outcome === "sent").length,
      removed: results.filter((result) => result.outcome === "gone").length,
      skipped: null,
    };
  },
});
