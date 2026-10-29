// Preneto iz Devotion packages/backend/convex/activity.ts (main @ c05c40f), SPAJANJE S03.
import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import type { Doc } from "../_generated/dataModel";
import { type QueryCtx } from "../_generated/server";
import { requireClanProjekta } from "./lib/auth";
import { boundedLimit } from "./lib/validators";
import { prostorTabele } from "./schema";
import { projekatQuery } from "../lib/projekat";

/**
 * Tipovi radnji i ciljeva se izvode iz `activities` tabele u `schema.ts`, da
 * nova radnja (PROSTOR P24) ne obori `returns` validator zaboravljenom kopijom.
 */
const activityActionValidator = prostorTabele.activities.validator.fields.action;
const activityTargetTypeValidator =
  prostorTabele.activities.validator.fields.targetType;

const activityItemValidator = v.object({
  _id: v.id("activities"),
  _creationTime: v.number(),
  workspaceId: v.id("workspaces"),
  actorProfileId: v.id("profiles"),
  action: activityActionValidator,
  targetType: activityTargetTypeValidator,
  targetId: v.string(),
  title: v.string(),
  detail: v.optional(v.string()),
  createdAt: v.number(),
  actor: v.union(
    v.object({
      _id: v.id("profiles"),
      displayName: v.string(),
      avatarUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
});

/** Uz svaki red zakačen sažetak aktera (ime + avatar), keširan po id-ju. */
async function withActors(ctx: QueryCtx, rows: Array<Doc<"activities">>) {
  const actorIds = [...new Set(rows.map((row) => row.actorProfileId))];
  const actors = new Map(
    await Promise.all(
      actorIds.map(async (actorId) => {
        const actor = await ctx.db.get("profiles", actorId);
        return [
          actorId,
          actor === null
            ? null
            : {
                _id: actor._id,
                displayName: actor.displayName,
                avatarUrl:
                  actor.avatarStorageId === undefined
                    ? null
                    : await ctx.storage.getUrl(actor.avatarStorageId),
              },
        ] as const;
      }),
    ),
  );
  return rows.map((row) => ({
    ...row,
    actor: actors.get(row.actorProfileId) ?? null,
  }));
}

export const listForStartup = projekatQuery({
  uloga: "urednik",
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const limit = boundedLimit(args.limit, 30, 50);
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_workspaceId_and_createdAt", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(limit);
    const actorIds = [...new Set(activities.map((activity) => activity.actorProfileId))];
    const actors = new Map(
      await Promise.all(
        actorIds.map(async (actorId) => {
          const actor = await ctx.db.get("profiles", actorId);
          return [
            actorId,
            actor === null
              ? null
              : {
                  ...actor,
                  avatarUrl:
                    actor.avatarStorageId === undefined
                      ? null
                      : await ctx.storage.getUrl(actor.avatarStorageId),
                },
          ] as const;
        }),
      ),
    );
    return activities.map((activity) => ({
      ...activity,
      actor: actors.get(activity.actorProfileId) ?? null,
    }));
  },
});

/**
 * Hronološka aktivnost startupa, paginirano (najnovije prvo). Za mobilnu listu
 * grupisanu po danu sa „učitaj još"; klijent-neutralno, pa je i web sme koristiti
 * (trenutno web čita `listForStartup`).
 */
export const listPaginated = projekatQuery({
  uloga: "urednik",
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(activityItemValidator),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const page = await ctx.db
      .query("activities")
      .withIndex("by_workspaceId_and_createdAt", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...page, page: await withActors(ctx, page.page) };
  },
});
