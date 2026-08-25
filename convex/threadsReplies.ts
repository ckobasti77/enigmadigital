import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireMembership } from "./lib/auth";
import { decryptCredentials } from "./lib/crypto";
import {
  deleteThreadsPost,
  getThreadsPublishingLimitDetailed,
  managePendingReply,
  manageThreadsReply,
} from "./lib/threadsApi";
import { sanitizeThreadsError } from "./lib/threadsShared";
import {
  checkLinkAttachment,
  checkPollAttachment,
  checkText,
  checkTopicTag,
} from "./lib/threadsPublish";


/**
 * ============================================================================
 * THREADS REPLIES & MODERATION LAYER (§4.4, §5.2, §8, Dodatak A.2)
 * ============================================================================
 *
 * Upravljanje odgovorima i moderacijom na Threads platformi:
 *   - Sakrivanje / otkrivanje odgovora (manageThreadsReply)
 *   - Odobravanje / ignorisanje odgovora na čekanju (managePendingReply)
 *   - Odgovaranje na objavu (kreira posao u `threadsPublishJobs` sa `replyToId`)
 *   - Brisanje odgovora uz proveru 24h kvote brisanja (100 / 24h)
 * ============================================================================
 */

const pollAttachmentValidator = v.object({
  option_a: v.string(),
  option_b: v.string(),
  option_c: v.optional(v.string()),
  option_d: v.optional(v.string()),
});

// ── Javne akcije za moderaciju i upravljanje odgovorima ───────────────────────

/**
 * Sakriva odgovor na Threads objavi (§5.2).
 */
export const hideReply = action({
  args: { replyId: v.string() },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { replyId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }

    const member = await ctx.runQuery(
      internal.threadsPublishStore.membershipForAction,
      { userId },
    );
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const connection = await ctx.runQuery(
      internal.threadsPublishStore.getConnectionForWorkspace,
      { workspaceId: member.workspaceId },
    );
    if (connection === null || !connection.threadsUserId) {
      throw new ConvexError({
        code: "invalid",
        message: "Threads nalog nije povezan.",
      });
    }

    const token = await decryptCredentials(connection.encryptedCredentials);

    try {
      const res = await manageThreadsReply({
        accessToken: token,
        replyId,
        hide: true,
      });

      if (res.success) {
        await ctx.runMutation(internal.threadsReplies.patchReplyHideStatus, {
          workspaceId: member.workspaceId,
          replyId,
          hideStatus: "HIDDEN",
        });
      }

      return { success: res.success };
    } catch (err) {
      return {
        success: false,
        error: sanitizeThreadsError(err),
      };
    }
  },
});

/**
 * Otkriva prethodno sakriven odgovor na Threads objavi (§5.2).
 */
export const unhideReply = action({
  args: { replyId: v.string() },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { replyId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }

    const member = await ctx.runQuery(
      internal.threadsPublishStore.membershipForAction,
      { userId },
    );
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const connection = await ctx.runQuery(
      internal.threadsPublishStore.getConnectionForWorkspace,
      { workspaceId: member.workspaceId },
    );
    if (connection === null || !connection.threadsUserId) {
      throw new ConvexError({
        code: "invalid",
        message: "Threads nalog nije povezan.",
      });
    }

    const token = await decryptCredentials(connection.encryptedCredentials);

    try {
      const res = await manageThreadsReply({
        accessToken: token,
        replyId,
        hide: false,
      });

      if (res.success) {
        await ctx.runMutation(internal.threadsReplies.patchReplyHideStatus, {
          workspaceId: member.workspaceId,
          replyId,
          hideStatus: "UNHUSHED",
        });
      }

      return { success: res.success };
    } catch (err) {
      return {
        success: false,
        error: sanitizeThreadsError(err),
      };
    }
  },
});

/**
 * Odobrava odgovor koji čeka odobrenje (Dodatak A.2).
 */
export const approvePendingReply = action({
  args: { replyId: v.string() },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { replyId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }

    const member = await ctx.runQuery(
      internal.threadsPublishStore.membershipForAction,
      { userId },
    );
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const connection = await ctx.runQuery(
      internal.threadsPublishStore.getConnectionForWorkspace,
      { workspaceId: member.workspaceId },
    );
    if (connection === null || !connection.threadsUserId) {
      throw new ConvexError({
        code: "invalid",
        message: "Threads nalog nije povezan.",
      });
    }

    const token = await decryptCredentials(connection.encryptedCredentials);

    try {
      const res = await managePendingReply({
        accessToken: token,
        replyId,
        approve: true,
      });

      if (res.success) {
        await ctx.runMutation(
          internal.threadsReplies.patchReplyApprovalStatus,
          {
            workspaceId: member.workspaceId,
            replyId,
            approvalStatus: "approved",
          },
        );
      }

      return { success: res.success };
    } catch (err) {
      return {
        success: false,
        error: sanitizeThreadsError(err),
      };
    }
  },
});

/**
 * Ignoriše odgovor koji čeka odobrenje (Dodatak A.2).
 */
export const ignorePendingReply = action({
  args: { replyId: v.string() },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { replyId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }

    const member = await ctx.runQuery(
      internal.threadsPublishStore.membershipForAction,
      { userId },
    );
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const connection = await ctx.runQuery(
      internal.threadsPublishStore.getConnectionForWorkspace,
      { workspaceId: member.workspaceId },
    );
    if (connection === null || !connection.threadsUserId) {
      throw new ConvexError({
        code: "invalid",
        message: "Threads nalog nije povezan.",
      });
    }

    const token = await decryptCredentials(connection.encryptedCredentials);

    try {
      const res = await managePendingReply({
        accessToken: token,
        replyId,
        approve: false,
      });

      if (res.success) {
        await ctx.runMutation(
          internal.threadsReplies.patchReplyApprovalStatus,
          {
            workspaceId: member.workspaceId,
            replyId,
            approvalStatus: "ignored",
          },
        );
      }

      return { success: res.success };
    } catch (err) {
      return {
        success: false,
        error: sanitizeThreadsError(err),
      };
    }
  },
});

/**
 * Šalje odgovor na postojeću objavu (§4.4).
 * Kreira posao u `threadsPublishJobs` sa `replyToId`, koji prolazi kroz isti red
 * i rate-limit zaštitu kao svaka druga objava (§4.4, §8).
 */
export const replyToPost = mutation({
  args: {
    replyToId: v.string(),
    text: v.string(),
    topicTag: v.optional(v.string()),
    linkAttachment: v.optional(v.string()),
    pollAttachment: v.optional(pollAttachmentValidator),
    autoPublishText: v.optional(v.boolean()),
  },
  returns: v.id("threadsPublishJobs"),
  handler: async (
    ctx,
    {
      replyToId,
      text,
      topicTag,
      linkAttachment,
      pollAttachment,
      autoPublishText,
    },
  ) => {
    const { workspaceId, userId } = await requireMembership(ctx);
    const now = Date.now();

    const trimmedText = text.trim();
    if (!trimmedText && !pollAttachment) {
      throw new ConvexError({
        code: "invalid",
        message: "Odgovor mora imati tekst ili anketu.",
      });
    }

    const textProblem = checkText({ mediaType: "TEXT", text: trimmedText });
    if (textProblem !== null) {
      throw new ConvexError({ code: "invalid", message: textProblem });
    }

    if (topicTag) {
      const tagProblem = checkTopicTag(topicTag);
      if (tagProblem !== null) {
        throw new ConvexError({ code: "invalid", message: tagProblem });
      }
    }

    if (linkAttachment) {
      const linkProblem = checkLinkAttachment({
        mediaType: "TEXT",
        linkAttachment,
      });
      if (linkProblem !== null) {
        throw new ConvexError({ code: "invalid", message: linkProblem });
      }
    }

    if (pollAttachment) {
      const pollProblem = checkPollAttachment({
        mediaType: "TEXT",
        pollAttachment,
      });
      if (pollProblem !== null) {
        throw new ConvexError({ code: "invalid", message: pollProblem });
      }
    }

    const trimmedTopicTag = topicTag?.trim();
    const trimmedLinkAttachment = linkAttachment?.trim();
    const trimmedReplyToId = replyToId.trim();

    const jobId = await ctx.db.insert("threadsPublishJobs", {
      workspaceId,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      mediaType: "TEXT",
      text: trimmedText,
      storageIds: [],
      mediaUrls: [],
      contentTypes: [],
      replyToId: trimmedReplyToId,
      ...(trimmedTopicTag && trimmedTopicTag.length > 0
        ? { topicTag: trimmedTopicTag }
        : {}),
      ...(trimmedLinkAttachment && trimmedLinkAttachment.length > 0
        ? { linkAttachment: trimmedLinkAttachment }
        : {}),
      ...(pollAttachment ? { pollAttachment } : {}),
      ...(autoPublishText !== undefined ? { autoPublishText } : {}),
      scheduledFor: now,
      status: "queued",
      attempts: 0,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.threadsPublish.runPublishJob,
      { jobId },
    );

    return jobId;
  },
});


/**
 * Briše odgovor sa Threads-a uz obaveznu prethodnu proveru 24h kvote brisanja (§4.4, §8).
 */
export const deleteReply = action({
  args: { replyId: v.string() },
  returns: v.object({
    success: v.boolean(),
    deletedId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { replyId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }

    const member = await ctx.runQuery(
      internal.threadsPublishStore.membershipForAction,
      { userId },
    );
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const connection = await ctx.runQuery(
      internal.threadsPublishStore.getConnectionForWorkspace,
      { workspaceId: member.workspaceId },
    );
    if (connection === null || !connection.threadsUserId) {
      throw new ConvexError({
        code: "invalid",
        message: "Threads nalog nije povezan.",
      });
    }

    const token = await decryptCredentials(connection.encryptedCredentials);

    // Provera kvote za brisanje PRE poziva API-ja (§8: 100 brisanja / 24h)
    let quota;
    try {
      quota = await getThreadsPublishingLimitDetailed({
        accessToken: token,
        userId: connection.threadsUserId,
      });
    } catch (err) {
      throw new ConvexError({
        code: "invalid",
        message: `Ne mogu da proverim Threads kvotu brisanja pre akcije. Brisanje je zaustavljeno radi zaštite naloga: ${sanitizeThreadsError(err)}`,
      });
    }

    const deleteUsed = quota.delete?.used;
    const deleteTotal = quota.delete?.total;

    // `delete_*` grupa se traži zasebnim upitom jer ume da vrati HTTP 500, pa
    // uspešan poziv bez ovih polja NIJE pročitana kvota. Brisanje je
    // nepovratno — nastaviti ovde bi značilo trajno obrisati tuđi odgovor ne
    // znajući da li smemo. Nepoznato stanje nije dozvola da se nastavi.
    if (deleteUsed === undefined || deleteTotal === undefined) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Threads je odgovorio na proveru kvote brisanja, ali bez podataka o iskorišćenosti. Brisanje je zaustavljeno dok se kvota ne pročita.",
      });
    }

    if (deleteUsed >= deleteTotal) {
      throw new ConvexError({
        code: "invalid",
        message: `Dnevna kvota za brisanje na Threads-u je popunjena (${deleteUsed}/${deleteTotal}). Pokušaj ponovo u sledećem prozoru.`,
      });
    }

    try {
      const res = await deleteThreadsPost({
        accessToken: token,
        mediaId: replyId,
      });

      if (res.success) {
        await ctx.runMutation(internal.threadsReplies.deleteReplyRow, {
          workspaceId: member.workspaceId,
          replyId,
        });
      }

      return {
        success: res.success,
        deletedId: res.deleted_id,
      };
    } catch (err) {
      return {
        success: false,
        error: sanitizeThreadsError(err),
      };
    }
  },
});

// ── Interne mutacije za ažuriranje baze ──────────────────────────────────────

export const patchReplyHideStatus = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    replyId: v.string(),
    hideStatus: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, replyId, hideStatus }) => {
    const existing = await ctx.db
      .query("threadsReplies")
      .withIndex("by_workspace_reply", (q) =>
        q.eq("workspaceId", workspaceId).eq("replyId", replyId),
      )
      .first();

    if (existing !== null) {
      await ctx.db.patch(existing._id, { hideStatus });
    }
    return null;
  },
});

export const patchReplyApprovalStatus = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    replyId: v.string(),
    approvalStatus: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, replyId, approvalStatus }) => {
    const existing = await ctx.db
      .query("threadsReplies")
      .withIndex("by_workspace_reply", (q) =>
        q.eq("workspaceId", workspaceId).eq("replyId", replyId),
      )
      .first();

    if (existing !== null) {
      await ctx.db.patch(existing._id, { approvalStatus });
    }
    return null;
  },
});

export const deleteReplyRow = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    replyId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, replyId }) => {
    const existing = await ctx.db
      .query("threadsReplies")
      .withIndex("by_workspace_reply", (q) =>
        q.eq("workspaceId", workspaceId).eq("replyId", replyId),
      )
      .first();

    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

// ── Javni upiti za UI ───────────────────────────────────────────────────────

/**
 * Vraća listu odgovora za određenu objavu.
 */
export const listRepliesForPost = query({
  args: {
    postId: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("threadsReplies"),
      replyId: v.string(),
      text: v.optional(v.string()),
      username: v.optional(v.string()),
      permalink: v.optional(v.string()),
      timestamp: v.optional(v.union(v.string(), v.number())),
      mediaType: v.optional(v.string()),
      mediaUrl: v.optional(v.string()),
      shortcode: v.optional(v.string()),
      ownerId: v.optional(v.string()),
      rootPostId: v.optional(v.string()),
      repliedToId: v.optional(v.string()),
      isReply: v.optional(v.boolean()),
      isReplyOwnedByMe: v.optional(v.boolean()),
      hasReplies: v.optional(v.boolean()),
      replyAudience: v.optional(v.string()),
      approvalStatus: v.optional(v.string()),
      hideStatus: v.optional(v.string()),
      source: v.string(),
    }),
  ),
  handler: async (ctx, { postId }) => {
    const { workspaceId } = await requireMembership(ctx);

    const rows = await ctx.db
      .query("threadsReplies")
      .withIndex("by_workspace_root_post", (q) =>
        q.eq("workspaceId", workspaceId).eq("rootPostId", postId),
      )
      .collect();

    return rows.map((r) => ({
      _id: r._id,
      replyId: r.replyId,
      ...(r.text !== undefined ? { text: r.text } : {}),
      ...(r.username !== undefined ? { username: r.username } : {}),
      ...(r.permalink !== undefined ? { permalink: r.permalink } : {}),
      ...(r.timestamp !== undefined ? { timestamp: r.timestamp } : {}),
      ...(r.mediaType !== undefined ? { mediaType: r.mediaType } : {}),
      ...(r.mediaUrl !== undefined ? { mediaUrl: r.mediaUrl } : {}),
      ...(r.shortcode !== undefined ? { shortcode: r.shortcode } : {}),
      ...(r.ownerId !== undefined ? { ownerId: r.ownerId } : {}),
      ...(r.rootPostId !== undefined ? { rootPostId: r.rootPostId } : {}),
      ...(r.repliedToId !== undefined ? { repliedToId: r.repliedToId } : {}),
      ...(r.isReply !== undefined ? { isReply: r.isReply } : {}),
      ...(r.isReplyOwnedByMe !== undefined
        ? { isReplyOwnedByMe: r.isReplyOwnedByMe }
        : {}),
      ...(r.hasReplies !== undefined ? { hasReplies: r.hasReplies } : {}),
      ...(r.replyAudience !== undefined
        ? { replyAudience: r.replyAudience }
        : {}),
      ...(r.approvalStatus !== undefined
        ? { approvalStatus: r.approvalStatus }
        : {}),
      ...(r.hideStatus !== undefined ? { hideStatus: r.hideStatus } : {}),
      source: r.source,
    }));
  },
});
