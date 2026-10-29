// Preneto iz Devotion packages/backend/convex/presence.ts (main @ c05c40f), SPAJANJE S03.
import { v } from "convex/values";

import { requireClanProjekta } from "./lib/auth";
import { PAGE_PRESENCE_TTL_MS } from "./lib/pagePresence";
import { requireVisiblePage } from "./lib/pages";
import { canEditPage } from "./lib/permissions";
import { getProfileSummary } from "./lib/profile_summary";
import { projekatMutation, projekatQuery } from "../lib/projekat";

/**
 * Prisustvo na stranici (PROSTOR P23): „<Ime> uređuje". Isti obrazac kao
 * `chatPresence`: klijent šalje otkucaj na `PAGE_PRESENCE_REFRESH_MS`, upis
 * nosi `expiresAt`, a upit NE čita sat — klijent sam prikazuje samo
 * `isPresenceFresh(expiresAt, Date.now())`. Jedan red po (stranica, osoba).
 */

const PRESENCE_LIST_CAP = 50;

export const heartbeat = projekatMutation({
  uloga: "urednik",
  args: { pageId: v.id("pages"), editing: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    const now = Date.now();
    // „Uređuje" samo onaj ko sme da menja stranicu (zaključana: autor,
    // vlasnik startupa, admin); ostali su samo prisutni.
    const editing = args.editing && canEditPage(actor, page);
    const existing = await ctx.db
      .query("pagePresence")
      .withIndex("by_pageId_and_profileId", (q) =>
        q.eq("pageId", page._id).eq("profileId", actor.profile._id),
      )
      .unique();
    const value = {
      editing,
      expiresAt: now + PAGE_PRESENCE_TTL_MS,
      updatedAt: now,
    };
    if (existing === null) {
      await ctx.db.insert("pagePresence", {
        workspaceId: page.workspaceId,
        pageId: page._id,
        profileId: actor.profile._id,
        ...value,
      });
    } else {
      await ctx.db.patch("pagePresence", existing._id, value);
    }
    return null;
  },
});

export const leave = projekatMutation({
  uloga: "urednik",
  args: { pageId: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.get("pages", args.pageId);
    if (page === null) return null;
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    const existing = await ctx.db
      .query("pagePresence")
      .withIndex("by_pageId_and_profileId", (q) =>
        q.eq("pageId", page._id).eq("profileId", actor.profile._id),
      )
      .unique();
    if (existing !== null && existing.expiresAt !== 0) {
      await ctx.db.patch("pagePresence", existing._id, {
        editing: false,
        expiresAt: 0,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/** Drugi prisutni na stranici (bez pozivaoca), sa `expiresAt` za klijentski TTL. */
export const listForPage = projekatQuery({
  uloga: "urednik",
  args: { pageId: v.id("pages") },
  returns: v.array(
    v.object({
      profileId: v.id("profiles"),
      displayName: v.string(),
      avatarUrl: v.union(v.string(), v.null()),
      editing: v.boolean(),
      expiresAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    const rows = await ctx.db
      .query("pagePresence")
      .withIndex("by_pageId_and_profileId", (q) => q.eq("pageId", page._id))
      .take(PRESENCE_LIST_CAP);
    const result = [];
    for (const row of rows) {
      if (row.profileId === actor.profile._id || row.expiresAt === 0) continue;
      const summary = await getProfileSummary(ctx, row.profileId);
      if (summary === null) continue;
      result.push({
        profileId: row.profileId,
        displayName: summary.displayName,
        avatarUrl: summary.avatarUrl,
        editing: row.editing,
        expiresAt: row.expiresAt,
        updatedAt: row.updatedAt,
      });
    }
    return result;
  },
});
