// Preneto iz Devotion packages/backend/convex/expoPushTokens.ts (main @ c05c40f), SPAJANJE S06.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";
import { requireProfile } from "./lib/auth";
import { listMyActiveWorkspaces } from "./lib/my_scope";
import { notificationTypeValidator } from "./lib/validators";
import { readSettings } from "./notificationSettings";
import { prijavljenMutation, prijavljenQuery } from "../lib/projekat";

/** Posle ovoliko odbijenih dostava token se briše kao mrtav (kao kod weba). */
const MAX_EXPO_FAILURES = 5;

/** Koliko uređaja jednog korisnika dobija dostavu / se ažurira odjednom. */
const MAX_EXPO_TOKENS = 20;

const MAX_TOKEN_LENGTH = 512;
const MAX_DEVICE_NAME_LENGTH = 128;
const MAX_APP_VERSION_LENGTH = 32;

const platformValidator = v.union(v.literal("ios"), v.literal("android"));

function cleanRequired(value: string, label: string, maxLength: number) {
  const cleaned = value.trim();
  if (cleaned.length === 0) throw new Error(`${label} je obavezno polje.`);
  if (cleaned.length > maxLength) throw new Error(`${label} je predugačko.`);
  return cleaned;
}

function validateChannelVersion(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Verzija kanala nije ispravna.");
  }
  return value;
}

/**
 * Upisuje Expo token ovog uređaja. Token je jedinstven po uređaju, pa ponovna
 * prijava osvežava postojeći red. Podešavanja obaveštenja NISU ovde — žive po
 * profilu u `notificationSettings`, pa nova prijava uređaja odmah nasleđuje
 * korisnikova pravila bez kopiranja.
 */
export const save = prijavljenMutation({
  args: {
    token: v.string(),
    platform: platformValidator,
    deviceName: v.union(v.string(), v.null()),
    appVersion: v.string(),
    channelVersion: v.number(),
  },
  returns: v.id("expoPushTokens"),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const token = cleanRequired(args.token, "Token", MAX_TOKEN_LENGTH);
    const appVersion = cleanRequired(
      args.appVersion,
      "Verzija aplikacije",
      MAX_APP_VERSION_LENGTH,
    );
    const channelVersion = validateChannelVersion(args.channelVersion);
    const deviceName =
      args.deviceName === null
        ? null
        : args.deviceName.trim().slice(0, MAX_DEVICE_NAME_LENGTH) || null;
    const now = Date.now();

    const existing = await ctx.db
      .query("expoPushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (existing !== null) {
      await ctx.db.patch("expoPushTokens", existing._id, {
        profileId: profile._id,
        platform: args.platform,
        deviceName,
        appVersion,
        channelVersion,
        lastSeenAt: now,
        failureCount: 0,
      });
      return existing._id;
    }

    return await ctx.db.insert("expoPushTokens", {
      profileId: profile._id,
      token,
      platform: args.platform,
      deviceName,
      appVersion,
      channelVersion,
      lastSeenAt: now,
      failureCount: 0,
      createdAt: now,
    });
  },
});

export const remove = prijavljenMutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const existing = await ctx.db
      .query("expoPushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .unique();
    if (existing !== null && existing.profileId === profile._id) {
      await ctx.db.delete("expoPushTokens", existing._id);
    }
    return null;
  },
});

/** Broj uređaja na kojima korisnik prima native push (za ekran podešavanja). */
export const myDeviceCount = prijavljenQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const rows = await ctx.db
      .query("expoPushTokens")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .take(MAX_EXPO_TOKENS);
    return rows.length;
  },
});

/**
 * Tokeni prijavljenog korisnika — samo za probno slanje (`pushTest.sendTest`).
 * Namerno zaobilazi utišane tipove i tihe sate: ovo je dijagnostika isporuke,
 * ne obaveštenje o događaju. Interni je jer nikome osim toj akciji ne treba.
 */
export const myTokensForTest = internalQuery({
  // SPAJANJE (S01 D12): `pushTest.sendTest` je interna akcija bez sesije, pa
  // profil stiže kao argument.
  args: { profileId: v.id("profiles") },
  returns: v.array(
    v.object({
      _id: v.id("expoPushTokens"),
      token: v.string(),
      platform: platformValidator,
      channelVersion: v.number(),
      deviceName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get("profiles", args.profileId);
    if (profile === null || profile.archivedAt !== null) return [];
    const rows = await ctx.db
      .query("expoPushTokens")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .take(MAX_EXPO_TOKENS);
    return rows.map((row) => ({
      _id: row._id,
      token: row.token,
      platform: row.platform,
      channelVersion: row.channelVersion,
      deviceName: row.deviceName ?? null,
    }));
  },
});

/**
 * Badge broj za ikonu: nepročitane notifikacije + nepročitane chat poruke,
 * sabrano kroz aktivne startupe korisnika i lični opseg (sekcija 8). Ograničeno čitanje —
 * precizan denormalizovani brojač je naknadno finije rešenje.
 */
const BADGE_STARTUP_CAP = 50;
const BADGE_PER_STARTUP_CAP = 100;
const BADGE_MAX = 999;

async function computeBadge(
  ctx: QueryCtx | MutationCtx,
  profileId: Id<"profiles">,
): Promise<number> {
  // Isti opseg kao bedževi u aplikaciji (D3: `inbox.unreadCounts`,
  // `chat.unreadSummary`): napušten ili arhiviran projekat i projekat u kome
  // sam `client_viewer` se ne broje. SPAJANJE: moji projekti kroz adapter (P28).
  const workspaces = await listMyActiveWorkspaces(ctx, profileId, BADGE_STARTUP_CAP);
  const activeStartupIds = new Set<Id<"workspaces">>(workspaces.keys());
  let notifUnread = 0;
  for (const workspaceId of activeStartupIds) {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_workspace_and_readAt", (q) =>
        q
          .eq("recipientProfileId", profileId)
          .eq("workspaceId", workspaceId)
          .eq("readAt", null),
      )
      .take(BADGE_PER_STARTUP_CAP);
    notifUnread += unread.length;
  }

  // Lična obaveštenja (poruke iz ličnih razgovora) nemaju startup.
  const personalUnread = await ctx.db
    .query("notifications")
    .withIndex("by_recipient_and_workspace_and_readAt", (q) =>
      q
        .eq("recipientProfileId", profileId)
        .eq("workspaceId", null)
        .eq("readAt", null),
    )
    .take(BADGE_PER_STARTUP_CAP);
  notifUnread += personalUnread.length;

  const reads = await ctx.db
    .query("chatReads")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .take(BADGE_STARTUP_CAP * 4);
  const chatUnread = reads.reduce(
    (sum, read) =>
      read.workspaceId === null || activeStartupIds.has(read.workspaceId)
        ? sum + read.unreadCount
        : sum,
    0,
  );

  return Math.min(notifUnread + chatUnread, BADGE_MAX);
}

/**
 * Podaci koje `expoPush.deliver` treba za slanje. Vraća notifikaciju, tokene
 * primaoca i njegova podešavanja PO PROFILU (`notificationSettings`) — utišani
 * tipovi i tihi sati važe za sve uređaje jednako. Vremenski filter (tihi sati)
 * radi akcija, jer upit ne sme da čita sat.
 */
export const expoPayloadForNotification = internalQuery({
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
      badge: v.number(),
      mutedTypes: v.array(notificationTypeValidator),
      quietHoursStart: v.union(v.number(), v.null()),
      quietHoursEnd: v.union(v.number(), v.null()),
      tokens: v.array(
        v.object({
          _id: v.id("expoPushTokens"),
          token: v.string(),
          platform: platformValidator,
          channelVersion: v.number(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get("notifications", args.notificationId);
    if (notification === null) return null;

    const tokens = await ctx.db
      .query("expoPushTokens")
      .withIndex("by_profileId", (q) =>
        q.eq("profileId", notification.recipientProfileId),
      )
      .take(MAX_EXPO_TOKENS);
    if (tokens.length === 0) return null;

    const settings = await readSettings(ctx, notification.recipientProfileId);
    const badge = await computeBadge(ctx, notification.recipientProfileId);

    return {
      title: notification.title,
      body: notification.body ?? null,
      type: notification.type,
      workspaceId: notification.workspaceId,
      targetType: notification.targetType,
      targetId: notification.targetId,
      notificationId: notification._id,
      badge,
      mutedTypes: settings.mutedTypes,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      tokens: tokens.map((token) => ({
        _id: token._id,
        token: token.token,
        platform: token.platform,
        channelVersion: token.channelVersion,
      })),
    };
  },
});

/**
 * Rezultat dostave. Mrtav token (`DeviceNotRegistered`) briše se odmah;
 * prolazni neuspesi se gomilaju do praga. Rate-limit se NE prijavljuje ovde —
 * to je prolazno stanje, ne kvar tokena (obrada u `expoPush.ts`).
 */
export const recordDeliveryResults = internalMutation({
  args: {
    results: v.array(
      v.object({
        tokenId: v.id("expoPushTokens"),
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
      const token: Doc<"expoPushTokens"> | null = await ctx.db.get(
        "expoPushTokens",
        result.tokenId,
      );
      if (token === null) continue;

      if (result.outcome === "gone") {
        await ctx.db.delete("expoPushTokens", token._id);
        continue;
      }
      if (result.outcome === "sent") {
        await ctx.db.patch("expoPushTokens", token._id, {
          failureCount: 0,
          lastSeenAt: now,
        });
        continue;
      }

      const failureCount = token.failureCount + 1;
      if (failureCount >= MAX_EXPO_FAILURES) {
        await ctx.db.delete("expoPushTokens", token._id);
      } else {
        await ctx.db.patch("expoPushTokens", token._id, { failureCount });
      }
    }
    return null;
  },
});

export type ExpoPushTokenId = Id<"expoPushTokens">;
