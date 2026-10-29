// Preneto iz Devotion packages/backend/convex/pushSubscriptions.ts (main @ c05c40f), SPAJANJE S06.
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { requireProfile } from "./lib/auth";
import { notificationTypeValidator } from "./lib/validators";
import { readSettings } from "./notificationSettings";
import { prijavljenMutation, prijavljenQuery } from "../lib/projekat";

/** Posle ovoliko odbijenih dostava pretplata se briše kao mrtva. */
const MAX_PUSH_FAILURES = 5;

const MAX_ENDPOINT_LENGTH = 1_024;
const MAX_KEY_LENGTH = 256;
const MAX_USER_AGENT_LENGTH = 512;

function cleanField(value: string, label: string, maxLength: number) {
  const cleaned = value.trim();
  if (cleaned.length === 0) throw new Error(`${label} je obavezno polje.`);
  if (cleaned.length > maxLength) {
    throw new Error(`${label} je predugačko.`);
  }
  return cleaned;
}

/**
 * Upisuje pretplatu ovog uređaja. Endpoint je jedinstven po uređaju i browseru,
 * pa ponovna prijava na istom uređaju osvežava postojeći red umesto da pravi novi.
 */
export const save = prijavljenMutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  returns: v.id("pushSubscriptions"),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const endpoint = cleanField(args.endpoint, "Endpoint", MAX_ENDPOINT_LENGTH);
    const p256dh = cleanField(args.p256dh, "Ključ pretplate", MAX_KEY_LENGTH);
    const auth = cleanField(args.auth, "Tajna pretplate", MAX_KEY_LENGTH);
    const userAgent =
      args.userAgent === undefined
        ? undefined
        : args.userAgent.trim().slice(0, MAX_USER_AGENT_LENGTH);
    const now = Date.now();

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();

    if (existing !== null) {
      await ctx.db.patch("pushSubscriptions", existing._id, {
        profileId: profile._id,
        p256dh,
        auth,
        ...(userAgent === undefined || userAgent.length === 0
          ? {}
          : { userAgent }),
        failureCount: 0,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pushSubscriptions", {
      profileId: profile._id,
      endpoint,
      p256dh,
      auth,
      ...(userAgent === undefined || userAgent.length === 0
        ? {}
        : { userAgent }),
      failureCount: 0,
      lastSuccessAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = prijavljenMutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint.trim()))
      .unique();
    if (existing !== null && existing.profileId === profile._id) {
      await ctx.db.delete("pushSubscriptions", existing._id);
    }
    return null;
  },
});

/** Da li ovaj uređaj već ima upisanu pretplatu (UI prikazuje pravo stanje). */
export const isRegistered = prijavljenQuery({
  args: { endpoint: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint.trim()))
      .unique();
    return existing !== null && existing.profileId === profile._id;
  },
});

/** Broj uređaja na kojima korisnik prima push (za prikaz u panelu). */
export const myDeviceCount = prijavljenQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .take(20);
    return rows.length;
  },
});

/**
 * Podaci koje Node akcija treba da pošalje push. Uz pretplate vraća i tip
 * događaja i podešavanja PO PROFILU (`notificationSettings`) — akcija po njima
 * odlučuje o utišanom tipu i tihim satima, istim pravilima kao native push
 * (docs/mobile/03-NOTIFIKACIJE.md sekcija 7). Vremenski filter radi akcija, jer
 * upit ne sme da čita sat.
 */
export const pushPayloadForNotification = internalQuery({
  args: { notificationId: v.id("notifications") },
  returns: v.union(
    v.object({
      title: v.string(),
      body: v.union(v.string(), v.null()),
      type: notificationTypeValidator,
      // `null` = lično obaveštenje (poruka iz ličnog razgovora).
      workspaceId: v.union(v.id("workspaces"), v.null()),
      targetType: v.string(),
      targetId: v.union(v.string(), v.null()),
      notificationId: v.id("notifications"),
      mutedTypes: v.array(notificationTypeValidator),
      quietHoursStart: v.union(v.number(), v.null()),
      quietHoursEnd: v.union(v.number(), v.null()),
      subscriptions: v.array(
        v.object({
          _id: v.id("pushSubscriptions"),
          endpoint: v.string(),
          p256dh: v.string(),
          auth: v.string(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get("notifications", args.notificationId);
    if (notification === null) return null;

    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_profileId", (q) =>
        q.eq("profileId", notification.recipientProfileId),
      )
      .take(20);
    if (subscriptions.length === 0) return null;

    const settings = await readSettings(ctx, notification.recipientProfileId);

    return {
      title: notification.title,
      body: notification.body ?? null,
      type: notification.type,
      workspaceId: notification.workspaceId,
      targetType: notification.targetType,
      targetId: notification.targetId,
      notificationId: notification._id,
      mutedTypes: settings.mutedTypes,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      subscriptions: subscriptions.map((subscription) => ({
        _id: subscription._id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      })),
    };
  },
});

/**
 * Rezultat dostave. Mrtve pretplate (410/404) brišemo odmah — browser ih je
 * poništio i više nikad ne mogu da prime poruku.
 */
export const recordDeliveryResults = internalMutation({
  args: {
    results: v.array(
      v.object({
        subscriptionId: v.id("pushSubscriptions"),
        outcome: v.union(
          v.literal("sent"),
          v.literal("gone"),
          v.literal("failed"),
        ),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const result of args.results) {
      const subscription = await ctx.db.get(
        "pushSubscriptions",
        result.subscriptionId,
      );
      if (subscription === null) continue;

      if (result.outcome === "gone") {
        await ctx.db.delete("pushSubscriptions", subscription._id);
        continue;
      }
      if (result.outcome === "sent") {
        await ctx.db.patch("pushSubscriptions", subscription._id, {
          failureCount: 0,
          lastSuccessAt: now,
          updatedAt: now,
        });
        continue;
      }

      const failureCount = subscription.failureCount + 1;
      if (failureCount >= MAX_PUSH_FAILURES) {
        await ctx.db.delete("pushSubscriptions", subscription._id);
      } else {
        await ctx.db.patch("pushSubscriptions", subscription._id, {
          failureCount,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

export type PushSubscriptionId = Id<"pushSubscriptions">;
