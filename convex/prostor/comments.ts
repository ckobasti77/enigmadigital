// Preneto iz Devotion packages/backend/convex/comments.ts (main @ c05c40f), SPAJANJE S03.
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

import { requireClanProjekta } from "./lib/auth";
import {
  addComment,
  commentOrigin,
  countVisibleComments,
  isCommentVisible,
  removeComment,
  resolveCommentTarget,
  restoreComment,
  updateComment,
} from "./lib/comments";
import { contributionTargetKey } from "./lib/collaboration";
import { commentPermissions } from "./lib/permissions";
import {
  getProfileSummary,
  profileSummaryValidator,
} from "./lib/profile_summary";
import {
  COMMENT_COUNT_TARGETS_MAX,
  COMMENT_PAGE_MAX,
} from "./lib/validators";
import { projekatMutation, projekatQuery } from "../lib/projekat";

/**
 * Komentari na stranici, zadatku (i njegovim koracima), opisu oblasti i ideji
 * (PROSTOR P5, plan K01 §7). Svaki aktivan član čita i komentariše; izmena je
 * samo autorova, a uklanja autor, vlasnik startupa ili admin (arhiviranje, „Poništi"
 * 8 s). Pravila i obaveštenja žive u `lib/comments.ts` i dele ih stare funkcije
 * `collaboration.*Contribution`.
 */

const commentTargetKindValidator = v.union(
  v.literal("page"),
  v.literal("idea"),
  v.literal("area"),
  v.literal("task_checkpoint"),
);
const commentTargetValidator = v.union(
  v.object({ kind: v.literal("page"), id: v.id("pages") }),
  v.object({ kind: v.literal("idea"), id: v.id("ideaNodes") }),
  v.object({ kind: v.literal("area"), id: v.id("areas") }),
  v.object({
    kind: v.literal("task_checkpoint"),
    id: v.id("taskCheckpoints"),
  }),
);

const commentValidator = v.object({
  _id: v.id("contentContributions"),
  targetKind: commentTargetKindValidator,
  targetId: v.string(),
  /** Sirov sadržaj; prikaz isključivo kroz shared `parseCommentSegments` (D18). */
  content: v.string(),
  mentions: v.array(profileSummaryValidator),
  /** `null` za zajednički tekst iz vremena pre potpisivanja. */
  author: v.union(profileSummaryValidator, v.null()),
  origin: v.union(
    v.literal("comment"),
    v.literal("legacy_entry"),
    v.literal("legacy_shared"),
  ),
  moderationStatus: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
  edited: v.boolean(),
  permissions: v.object({ canEdit: v.boolean(), canRemove: v.boolean() }),
});

export const list = projekatQuery({
  uloga: "urednik",
  args: {
    target: commentTargetValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(commentValidator),
  handler: async (ctx, args) => {
    const { numItems } = args.paginationOpts;
    if (!Number.isInteger(numItems) || numItems < 1 || numItems > COMMENT_PAGE_MAX) {
      throw new Error(
        `Po stranici možete učitati najviše ${COMMENT_PAGE_MAX} komentara.`,
      );
    }
    const resolved = await resolveCommentTarget(ctx, args.target);
    const actor = await requireClanProjekta(ctx, resolved.workspaceId);
    const result = await ctx.db
      .query("contentContributions")
      .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
        q
          .eq(
            "targetKey",
            contributionTargetKey(args.target.kind, resolved.targetId),
          )
          .eq("archivedAt", null),
      )
      .order("asc")
      .paginate(args.paginationOpts);

    // Isti član se pojavljuje kao autor i pomenuti više puta — čitaj ga jednom.
    const summaries = new Map<
      Id<"profiles">,
      Awaited<ReturnType<typeof getProfileSummary>>
    >();
    async function summaryOf(profileId: Id<"profiles">) {
      if (!summaries.has(profileId)) {
        summaries.set(profileId, await getProfileSummary(ctx, profileId));
      }
      return summaries.get(profileId) ?? null;
    }

    const page = [];
    for (const row of result.page) {
      if (
        row.workspaceId !== resolved.workspaceId ||
        !isCommentVisible(row, actor.profile._id, resolved.ownerProfileId)
      ) {
        continue;
      }
      const mentions = [];
      for (const profileId of row.mentionProfileIds ?? []) {
        const summary = await summaryOf(profileId);
        if (summary !== null) mentions.push(summary);
      }
      page.push({
        _id: row._id,
        targetKind: args.target.kind,
        targetId: resolved.targetId,
        content: row.content,
        mentions,
        author:
          row.authorProfileId === undefined
            ? null
            : await summaryOf(row.authorProfileId),
        origin: commentOrigin(row),
        moderationStatus: row.moderationStatus ?? ("approved" as const),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        edited: row.editedAt !== undefined,
        permissions: commentPermissions(actor, row),
      });
    }
    return { ...result, page };
  },
});

export const add = projekatMutation({
  uloga: "urednik",
  args: {
    target: commentTargetValidator,
    content: v.string(),
    mentionProfileIds: v.optional(v.array(v.id("profiles"))),
  },
  returns: v.id("contentContributions"),
  handler: async (ctx, args) => {
    return await addComment(ctx, {
      target: args.target,
      content: args.content,
      mentionProfileIds: args.mentionProfileIds,
    });
  },
});

export const update = projekatMutation({
  uloga: "urednik",
  args: {
    commentId: v.id("contentContributions"),
    content: v.string(),
    mentionProfileIds: v.optional(v.array(v.id("profiles"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateComment(ctx, {
      commentId: args.commentId,
      content: args.content,
      mentionProfileIds: args.mentionProfileIds,
    });
    return null;
  },
});

export const remove = projekatMutation({
  uloga: "urednik",
  args: { commentId: v.id("contentContributions") },
  returns: v.object({
    commentId: v.id("contentContributions"),
    undoUntil: v.number(),
  }),
  handler: async (ctx, args) => {
    return await removeComment(ctx, args.commentId);
  },
});

export const restore = projekatMutation({
  uloga: "urednik",
  args: { commentId: v.id("contentContributions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await restoreComment(ctx, args.commentId);
    return null;
  },
});

/** Brojevi komentara za liste i kartice (do 20, preko toga `capped`). */
export const countFor = projekatQuery({
  uloga: "urednik",
  args: {
    targets: v.array(commentTargetValidator),
  },
  returns: v.array(
    v.object({
      targetKind: commentTargetKindValidator,
      targetId: v.string(),
      count: v.number(),
      capped: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.targets.length > COMMENT_COUNT_TARGETS_MAX) {
      throw new Error(
        `Najviše ${COMMENT_COUNT_TARGETS_MAX} stavki odjednom.`,
      );
    }
    await requireClanProjekta(ctx, args.workspaceId);
    return await Promise.all(
      args.targets.map(async (target) => ({
        targetKind: target.kind,
        targetId: target.id as string,
        ...(await countVisibleComments(ctx, {
          workspaceId: args.workspaceId,
          kind: target.kind,
          targetId: target.id,
        })),
      })),
    );
  },
});
