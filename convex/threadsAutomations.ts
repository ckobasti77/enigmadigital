import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { decryptCredentials } from "./lib/crypto";
import {
  getThreadsMentions,
  getThreadsPublishingLimitDetailed,
  managePendingReply,
  manageThreadsReply,
  THREADS_MIN_MENTIONS_SINCE,
} from "./lib/threadsApi";
import { sanitizeThreadsError } from "./lib/threadsShared";
import { checkLinkAttachment, checkText, checkTopicTag } from "./lib/threadsPublish";

/**
 * ============================================================================
 * THREADS OPENREPLY AUTOMATION ENGINE (TH8)
 * ============================================================================
 *
 * Automatsko odgovaranje i moderacija za Threads:
 *   - Okidači: `reply_to_our_post` (webhook) i `mention` (polling)
 *   - Akcije: `public_reply`, `hide`, `ignore`, `approve_pending`
 *   - Sigurnosni mehanizmi:
 *       1. `mode: "draft"` je OBAVEZAN početni režim (simulacija bez slanja)
 *       2. Dnevni limit (`dailyLimit`), cooldown po autoru (`cooldownMinutesPerAuthor`),
 *          i maksimalan broj odgovora po niti (`maxRepliesPerThread`)
 *       3. Tabela `threadsProcessedReplies` sprečava dupliranje
 *       4. Pre-call 24h Quota Guard (1000 odgovora / 24h, §8) pre slanja javnog odgovora
 *       5. Javni odgovor se uvek šalje kroz red `threadsPublishJobs` sa `replyToId`
 * ============================================================================
 */

export const triggerValidator = v.union(
  v.literal("reply_to_our_post"),
  v.literal("mention"),
);

export const matchTypeValidator = v.union(
  v.literal("exact"),
  v.literal("contains"),
);

export const actionTypeValidator = v.union(
  v.literal("public_reply"),
  v.literal("hide"),
  v.literal("ignore"),
  v.literal("approve_pending"),
);

export const modeValidator = v.union(v.literal("draft"), v.literal("live"));

export function utcDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().split("T")[0];
}

/**
 * Proverava podudaranje teksta sa definisanim ključnim rečima.
 */
export function matchThreadsKeywords(params: {
  text: string;
  keywords: string[];
  matchType: "exact" | "contains";
  caseSensitive: boolean;
  matchAnyKeyword: boolean;
}): { matched: boolean; matchedKeyword?: string } {
  const { text, keywords, matchType, caseSensitive, matchAnyKeyword } = params;

  if (keywords.length === 0) {
    return { matched: true };
  }

  const targetText = caseSensitive ? text : text.toLowerCase();

  const results = keywords.map((rawKw) => {
    const kw = caseSensitive ? rawKw : rawKw.toLowerCase();
    if (!kw) return false;

    if (matchType === "exact") {
      return targetText.trim() === kw.trim();
    } else {
      return targetText.includes(kw.trim());
    }
  });

  if (matchAnyKeyword) {
    const idx = results.findIndex((r) => r === true);
    if (idx !== -1) {
      return { matched: true, matchedKeyword: keywords[idx] };
    }
    return { matched: false };
  } else {
    const allMatched = results.every((r) => r === true);
    return {
      matched: allMatched,
      matchedKeyword: allMatched ? keywords.join(", ") : undefined,
    };
  }
}

// ── Evaluacija okidača iz Webhook-a (reply_to_our_post) ──────────────────────

/**
 * Interna akcija za procenu pravila nad pristiglim Threads odgovorom.
 * Poziva se asinhrono iz `recordWebhookReply` preko ctx.scheduler.runAfter(0, ...).
 */
export const evaluateReplyTrigger = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    replyId: v.string(),
  },
  handler: async (ctx, { workspaceId, replyId }) => {
    const reply: Doc<"threadsReplies"> | null = await ctx.runQuery(
      internal.threadsAutomations.getReplyForEvaluation,
      { workspaceId, replyId },
    );

    if (!reply) return;

    // Ne odgovaramo na sopstvene odgovore
    if (reply.isReplyOwnedByMe) return;

    const replyText = reply.text ?? "";
    // Bez izmišljenog `"unknown_author"`: kad autor nije poznat, polje ostaje prazno.
    const authorId = reply.ownerId || reply.username || undefined;
    const rootPostId = reply.rootPostId;

    const automations: Doc<"threadsAutomations">[] = await ctx.runQuery(
      internal.threadsAutomations.getActiveAutomations,
      { workspaceId, trigger: "reply_to_our_post" },
    );

    for (const auto of automations) {
      // 1. Provera vezanosti za objavu (matchAnyPost vs postId)
      if (!auto.matchAnyPost && auto.postId) {
        if (auto.postId !== rootPostId && auto.postId !== reply.repliedToId) {
          continue;
        }
      }

      // 2. Podudaranje ključnih reči
      const { matched, matchedKeyword } = matchThreadsKeywords({
        text: replyText,
        keywords: auto.keywords,
        matchType: auto.matchType,
        caseSensitive: auto.caseSensitive,
        matchAnyKeyword: auto.matchAnyKeyword,
      });

      if (!matched) {
        continue;
      }

      // 3. Atomski test limita (dailyLimit, cooldown, maxRepliesPerThread, processedCheck)
      const reservation: {
        allowed: boolean;
        reason?: string;
        date: string;
      } = await ctx.runMutation(
        internal.threadsAutomations.checkAndReserveExecution,
        {
          workspaceId,
          automationId: auto._id,
          authorId,
          rootPostId,
          replyId,
          trigger: "reply_to_our_post",
          actionType: auto.actionType,
          mode: auto.mode,
          dailyLimit: auto.dailyLimit,
          cooldownMinutesPerAuthor: auto.cooldownMinutesPerAuthor,
          maxRepliesPerThread: auto.maxRepliesPerThread,
        },
      );

      if (!reservation.allowed) {
        // Odbijeno zbog limita (razlikuje se od greške u logu)
        let status: "rejected_limit" | "rejected_cooldown" | "rejected_thread_limit" =
          "rejected_limit";
        if (reservation.reason === "cooldown_active") {
          status = "rejected_cooldown";
        } else if (reservation.reason === "thread_limit_reached") {
          status = "rejected_thread_limit";
        }

        await ctx.runMutation(internal.threadsAutomations.writeLog, {
          workspaceId,
          automationId: auto._id,
          trigger: "reply_to_our_post",
          sourceReplyId: replyId,
          rootPostId,
          authorId,
          matchedKeyword,
          mode: auto.mode,
          actionType: auto.actionType,
          status,
          reason: reservation.reason,
          date: reservation.date,
        });
        continue;
      }

      // 4. Draft režim: pravilo se ocenilo, limit je proveren, ali se ništa ne šalje
      if (auto.mode === "draft") {
        await ctx.runMutation(internal.threadsAutomations.writeLog, {
          workspaceId,
          automationId: auto._id,
          trigger: "reply_to_our_post",
          sourceReplyId: replyId,
          rootPostId,
          authorId,
          matchedKeyword,
          mode: "draft",
          actionType: auto.actionType,
          status: "draft_simulated",
          reason: "Simulirano u draft režimu (akcija nije poslata)",
          date: reservation.date,
        });
        continue;
      }

      // 5. Live režim: izvršavanje definisane akcije
      await executeLiveAction(ctx, {
        workspaceId,
        automation: auto,
        replyId,
        rootPostId,
        authorId,
        matchedKeyword,
        date: reservation.date,
      });
    }
  },
});

// ── Evaluacija okidača za spominjanja (mention) ──────────────────────────────

/**
 * Interna akcija za procenu pravila nad primljenim Threads spominjanjem (mention).
 */
export const evaluateMentionTrigger = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    mentionId: v.string(),
  },
  handler: async (ctx, { workspaceId, mentionId }) => {
    const mention: Doc<"threadsMentions"> | null = await ctx.runQuery(
      internal.threadsAutomations.getMentionForEvaluation,
      { workspaceId, mentionId },
    );

    if (!mention) return;

    const mentionText = mention.text ?? "";
    const authorId = mention.username || undefined;
    const mediaId = mention.mediaId;

    const automations: Doc<"threadsAutomations">[] = await ctx.runQuery(
      internal.threadsAutomations.getActiveAutomations,
      { workspaceId, trigger: "mention" },
    );

    for (const auto of automations) {
      if (!auto.matchAnyPost && auto.postId) {
        if (auto.postId !== mediaId) {
          continue;
        }
      }

      const { matched, matchedKeyword } = matchThreadsKeywords({
        text: mentionText,
        keywords: auto.keywords,
        matchType: auto.matchType,
        caseSensitive: auto.caseSensitive,
        matchAnyKeyword: auto.matchAnyKeyword,
      });

      if (!matched) continue;

      const reservation: {
        allowed: boolean;
        reason?: string;
        date: string;
      } = await ctx.runMutation(
        internal.threadsAutomations.checkAndReserveExecution,
        {
          workspaceId,
          automationId: auto._id,
          authorId,
          rootPostId: mediaId,
          replyId: mentionId,
          trigger: "mention",
          actionType: auto.actionType,
          mode: auto.mode,
          dailyLimit: auto.dailyLimit,
          cooldownMinutesPerAuthor: auto.cooldownMinutesPerAuthor,
          maxRepliesPerThread: auto.maxRepliesPerThread,
        },
      );

      if (!reservation.allowed) {
        let status: "rejected_limit" | "rejected_cooldown" | "rejected_thread_limit" =
          "rejected_limit";
        if (reservation.reason === "cooldown_active") {
          status = "rejected_cooldown";
        } else if (reservation.reason === "thread_limit_reached") {
          status = "rejected_thread_limit";
        }

        await ctx.runMutation(internal.threadsAutomations.writeLog, {
          workspaceId,
          automationId: auto._id,
          trigger: "mention",
          sourceReplyId: mentionId,
          rootPostId: mediaId,
          authorId,
          matchedKeyword,
          mode: auto.mode,
          actionType: auto.actionType,
          status,
          reason: reservation.reason,
          date: reservation.date,
        });
        continue;
      }

      if (auto.mode === "draft") {
        await ctx.runMutation(internal.threadsAutomations.writeLog, {
          workspaceId,
          automationId: auto._id,
          trigger: "mention",
          sourceReplyId: mentionId,
          rootPostId: mediaId,
          authorId,
          matchedKeyword,
          mode: "draft",
          actionType: auto.actionType,
          status: "draft_simulated",
          reason: "Simulirano u draft režimu (akcija nije poslata)",
          date: reservation.date,
        });
        continue;
      }

      await executeLiveAction(ctx, {
        workspaceId,
        automation: auto,
        replyId: mentionId,
        rootPostId: mediaId,
        authorId,
        matchedKeyword,
        date: reservation.date,
      });
    }
  },
});

// ── Izvršavanje akcija u Live režimu ─────────────────────────────────────────

async function executeLiveAction(
  ctx: any,
  params: {
    workspaceId: Id<"workspaces">;
    automation: Doc<"threadsAutomations">;
    replyId: string;
    rootPostId?: string;
    authorId: string;
    matchedKeyword?: string;
    date: string;
  },
) {
  const {
    workspaceId,
    automation,
    replyId,
    rootPostId,
    authorId,
    matchedKeyword,
    date,
  } = params;

  const connection = await ctx.runQuery(
    internal.threadsPublishStore.getConnectionForWorkspace,
    { workspaceId },
  );

  if (!connection || !connection.threadsUserId) {
    await ctx.runMutation(internal.threadsAutomations.writeLog, {
      workspaceId,
      automationId: automation._id,
      trigger: automation.trigger,
      sourceReplyId: replyId,
      rootPostId,
      authorId,
      matchedKeyword,
      mode: "live",
      actionType: automation.actionType,
      status: "failed",
      reason: "connection_missing",
      errorMessage: "Threads nalog nije povezan.",
      date,
    });
    return;
  }

  let token: string;
  try {
    token = await decryptCredentials(connection.encryptedCredentials);
  } catch (err) {
    await ctx.runMutation(internal.threadsAutomations.writeLog, {
      workspaceId,
      automationId: automation._id,
      trigger: automation.trigger,
      sourceReplyId: replyId,
      rootPostId,
      authorId,
      matchedKeyword,
      mode: "live",
      actionType: automation.actionType,
      status: "failed",
      reason: "token_decrypt_failed",
      errorMessage: sanitizeThreadsError(err),
      date,
    });
    return;
  }

  // ── 1. JAVNI ODGOVOR (public_reply) ───────────────────────────────────────
  if (automation.actionType === "public_reply") {
    // Provera kvote odgovora (1000/24h, §8): ako se kvota ne može pročitati ili je puna — stani!
    let quota;
    try {
      quota = await getThreadsPublishingLimitDetailed({
        accessToken: token,
        userId: connection.threadsUserId,
      });
    } catch (err) {
      await ctx.runMutation(internal.threadsAutomations.writeLog, {
        workspaceId,
        automationId: automation._id,
        trigger: automation.trigger,
        sourceReplyId: replyId,
        rootPostId,
        authorId,
        matchedKeyword,
        mode: "live",
        actionType: "public_reply",
        status: "failed",
        reason: "quota_check_failed",
        errorMessage: `Ne mogu da proverim Threads kvotu pre odgovora: ${sanitizeThreadsError(err)}`,
        date,
      });
      return;
    }

    const replyUsed = quota.reply?.used;
    const replyTotal = quota.reply?.total;

    // Uspešan poziv bez `used`/`total` NIJE pročitana kvota. Ovde se šalje
    // javni sadržaj u tuđe ime — nepoznato stanje nije dozvola da se nastavi.
    if (replyUsed === undefined || replyTotal === undefined) {
      await ctx.runMutation(internal.threadsAutomations.writeLog, {
        workspaceId,
        automationId: automation._id,
        trigger: automation.trigger,
        sourceReplyId: replyId,
        rootPostId,
        authorId,
        matchedKeyword,
        mode: "live",
        actionType: "public_reply",
        status: "failed",
        reason: "quota_unreadable",
        errorMessage:
          "Threads je odgovorio na proveru kvote odgovora, ali bez podataka o iskorišćenosti. Slanje je zaustavljeno.",
        date,
      });
      return;
    }

    if (replyUsed >= replyTotal) {
      await ctx.runMutation(internal.threadsAutomations.writeLog, {
        workspaceId,
        automationId: automation._id,
        trigger: automation.trigger,
        sourceReplyId: replyId,
        rootPostId,
        authorId,
        matchedKeyword,
        mode: "live",
        actionType: "public_reply",
        status: "rejected_limit",
        reason: "quota_exhausted",
        errorMessage: `Threads 24h kvota odgovora je popunjena (${replyUsed}/${replyTotal}).`,
        date,
      });
      return;
    }

    // Sastavljanje teksta sa linkom (§9: konverzija preko javnog odgovora sa praćenim linkom)
    let fullReplyText = automation.replyText?.trim() ?? "";
    if (automation.linkUrl) {
      const trimmedUrl = automation.linkUrl.trim();
      if (trimmedUrl) {
        fullReplyText = fullReplyText
          ? `${fullReplyText}\n\n${trimmedUrl}`
          : trimmedUrl;
      }
    }

    if (!fullReplyText) {
      await ctx.runMutation(internal.threadsAutomations.writeLog, {
        workspaceId,
        automationId: automation._id,
        trigger: automation.trigger,
        sourceReplyId: replyId,
        rootPostId,
        authorId,
        matchedKeyword,
        mode: "live",
        actionType: "public_reply",
        status: "failed",
        reason: "empty_reply_text",
        errorMessage: "Tekst javnog odgovora je prazan.",
        date,
      });
      return;
    }

    try {
      // Kreira posao u threadsPublishJobs koji prolazi kroz isti red i kvote (§4.4, §8)
      const jobId: Id<"threadsPublishJobs"> = await ctx.runMutation(
        internal.threadsPublishStore.createJobDirect,
        {
          workspaceId,
          mediaType: "TEXT",
          text: fullReplyText,
          replyToId: replyId,
          topicTag: automation.topicTag,
          autoPublishText: automation.autoPublishText ?? true,
        },
      );

      await ctx.runMutation(internal.threadsAutomations.writeLog, {
        workspaceId,
        automationId: automation._id,
        trigger: automation.trigger,
        sourceReplyId: replyId,
        rootPostId,
        authorId,
        matchedKeyword,
        mode: "live",
        actionType: "public_reply",
        status: "executed",
        jobId,
        date,
      });
    } catch (err) {
      await ctx.runMutation(internal.threadsAutomations.writeLog, {
        workspaceId,
        automationId: automation._id,
        trigger: automation.trigger,
        sourceReplyId: replyId,
        rootPostId,
        authorId,
        matchedKeyword,
        mode: "live",
        actionType: "public_reply",
        status: "failed",
        reason: "job_creation_failed",
        errorMessage: sanitizeThreadsError(err),
        date,
      });
    }
    return;
  }

  // ── 2. SAKRIVANJE (hide) ──────────────────────────────────────────────────
  if (automation.actionType === "hide") {
    try {
      const res = await manageThreadsReply({
        accessToken: token,
        replyId,
        hide: true,
      });

      if (res.success) {
        await ctx.runMutation(internal.threadsReplies.patchReplyHideStatus, {
          workspaceId,
          replyId,
          hideStatus: "HIDDEN",
        });

        await ctx.runMutation(internal.threadsAutomations.writeLog, {
          workspaceId,
          automationId: automation._id,
          trigger: automation.trigger,
          sourceReplyId: replyId,
          rootPostId,
          authorId,
          matchedKeyword,
          mode: "live",
          actionType: "hide",
          status: "executed",
          date,
        });
      } else {
        await ctx.runMutation(internal.threadsAutomations.writeLog, {
          workspaceId,
          automationId: automation._id,
          trigger: automation.trigger,
          sourceReplyId: replyId,
          rootPostId,
          authorId,
          matchedKeyword,
          mode: "live",
          actionType: "hide",
          status: "failed",
          reason: "api_returned_false",
          date,
        });
      }
    } catch (err) {
      await ctx.runMutation(internal.threadsAutomations.writeLog, {
        workspaceId,
        automationId: automation._id,
        trigger: automation.trigger,
        sourceReplyId: replyId,
        rootPostId,
        authorId,
        matchedKeyword,
        mode: "live",
        actionType: "hide",
        status: "failed",
        reason: "api_error",
        errorMessage: sanitizeThreadsError(err),
        date,
      });
    }
    return;
  }

  // ── 3. IGNORISANJE NA ČEKANJU (ignore) ────────────────────────────────────
  if (automation.actionType === "ignore") {
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
            workspaceId,
            replyId,
            approvalStatus: "ignored",
          },
        );

        await ctx.runMutation(internal.threadsAutomations.writeLog, {
          workspaceId,
          automationId: automation._id,
          trigger: automation.trigger,
          sourceReplyId: replyId,
          rootPostId,
          authorId,
          matchedKeyword,
          mode: "live",
          actionType: "ignore",
          status: "executed",
          date,
        });
      } else {
        await ctx.runMutation(internal.threadsAutomations.writeLog, {
          workspaceId,
          automationId: automation._id,
          trigger: automation.trigger,
          sourceReplyId: replyId,
          rootPostId,
          authorId,
          matchedKeyword,
          mode: "live",
          actionType: "ignore",
          status: "failed",
          reason: "api_returned_false",
          date,
        });
      }
    } catch (err) {
      await ctx.runMutation(internal.threadsAutomations.writeLog, {
        workspaceId,
        automationId: automation._id,
        trigger: automation.trigger,
        sourceReplyId: replyId,
        rootPostId,
        authorId,
        matchedKeyword,
        mode: "live",
        actionType: "ignore",
        status: "failed",
        reason: "api_error",
        errorMessage: sanitizeThreadsError(err),
        date,
      });
    }
    return;
  }

  // ── 4. ODOBRAVANJE NA ČEKANJU (approve_pending) ───────────────────────────
  if (automation.actionType === "approve_pending") {
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
            workspaceId,
            replyId,
            approvalStatus: "approved",
          },
        );

        await ctx.runMutation(internal.threadsAutomations.writeLog, {
          workspaceId,
          automationId: automation._id,
          trigger: automation.trigger,
          sourceReplyId: replyId,
          rootPostId,
          authorId,
          matchedKeyword,
          mode: "live",
          actionType: "approve_pending",
          status: "executed",
          date,
        });
      } else {
        await ctx.runMutation(internal.threadsAutomations.writeLog, {
          workspaceId,
          automationId: automation._id,
          trigger: automation.trigger,
          sourceReplyId: replyId,
          rootPostId,
          authorId,
          matchedKeyword,
          mode: "live",
          actionType: "approve_pending",
          status: "failed",
          reason: "api_returned_false",
          date,
        });
      }
    } catch (err) {
      await ctx.runMutation(internal.threadsAutomations.writeLog, {
        workspaceId,
        automationId: automation._id,
        trigger: automation.trigger,
        sourceReplyId: replyId,
        rootPostId,
        authorId,
        matchedKeyword,
        mode: "live",
        actionType: "approve_pending",
        status: "failed",
        reason: "api_error",
        errorMessage: sanitizeThreadsError(err),
        date,
      });
    }
    return;
  }
}

// ── Polling Mentions (GET /{user-id}/mentions, §6) ───────────────────────────

/**
 * Polling spominjanja za jedan Threads nalog.
 * Poziva se periodično iz cron posla ili ručno iz UI-ja.
 */
export const pollThreadsMentions = internalAction({
  args: {
    connectionId: v.id("connections"),
  },
  handler: async (ctx, { connectionId }) => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.threadsAutomations.getConnectionDoc,
      { connectionId },
    );

    if (!conn || !conn.externalId || conn.status !== "active") return;

    const workspaceId = conn.workspaceId;
    const userId = conn.externalId;

    let token: string;
    try {
      token = await decryptCredentials(conn.encryptedCredentials);
    } catch {
      return;
    }

    const lastMention: Doc<"threadsMentions"> | null = await ctx.runQuery(
      internal.threadsAutomations.getLatestMention,
      { workspaceId },
    );

    let since = THREADS_MIN_MENTIONS_SINCE;
    if (lastMention?.syncedAt) {
      // Poslednjih 7 dana ili od poslednjeg sync-a
      since = Math.max(
        Math.floor((lastMention.syncedAt - 7 * 86400000) / 1000),
        THREADS_MIN_MENTIONS_SINCE,
      );
    }

    try {
      const resp = await getThreadsMentions({
        accessToken: token,
        userId,
        since,
      });

      const mentions = resp.data ?? [];
      if (mentions.length === 0) return;

      const newMentionIds: string[] = await ctx.runMutation(
        internal.threadsAutomations.upsertMentions,
        {
          workspaceId,
          mentions: mentions.map((m) => ({
            mentionId: m.id,
            text: m.text,
            username: m.username,
            permalink: m.permalink,
            timestamp: m.timestamp,
            mediaType: m.media_type,
            source: "sync",
            syncedAt: Date.now(),
          })),
        },
      );

      // Pokreće evaluaciju samo za novoprispele mentione
      for (const mentionId of newMentionIds) {
        await ctx.scheduler.runAfter(
          0,
          internal.threadsAutomations.evaluateMentionTrigger,
          {
            workspaceId,
            mentionId,
          },
        );
      }
    } catch (err) {
      // Privatni nalozi se ne vraćaju (§6) — to nije greška
      console.warn(
        `[Threads mentions poll failed for ${userId}]`,
        sanitizeThreadsError(err),
      );
    }
  },
});

/**
 * Periodični cron posao: proverava spominjanja za sve aktivne Threads konekcije.
 */
export const pollAllThreadsMentions = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectionIds = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "threads" },
    );

    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(
          internal.threadsAutomations.pollThreadsMentions,
          { connectionId },
        );
      } catch (err) {
        console.error(
          `[Threads mentions cron step failed for connection ${connectionId}]`,
          sanitizeThreadsError(err),
        );
      }
    }
  },
});

// ── Interne queries & mutacije motora ─────────────────────────────────────────

export const getConnectionDoc = internalQuery({
  args: { connectionId: v.id("connections") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { connectionId }) => {
    return await ctx.db.get(connectionId);
  },
});

export const getLatestMention = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { workspaceId }) => {
    return await ctx.db
      .query("threadsMentions")
      .withIndex("by_workspace_mention", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .first();
  },
});

export const upsertMentions = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    mentions: v.array(
      v.object({
        mentionId: v.string(),
        text: v.optional(v.string()),
        username: v.optional(v.string()),
        permalink: v.optional(v.string()),
        timestamp: v.optional(v.union(v.string(), v.number())),
        mediaType: v.optional(v.string()),
        source: v.optional(v.string()),
        syncedAt: v.number(),
      }),
    ),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { workspaceId, mentions }) => {
    const newIds: string[] = [];

    for (const m of mentions) {
      const existing = await ctx.db
        .query("threadsMentions")
        .withIndex("by_workspace_mention", (q) =>
          q.eq("workspaceId", workspaceId).eq("mentionId", m.mentionId),
        )
        .first();

      if (existing === null) {
        await ctx.db.insert("threadsMentions", {
          workspaceId,
          ...m,
        });
        newIds.push(m.mentionId);
      } else {
        await ctx.db.patch(existing._id, {
          ...(m.text !== undefined ? { text: m.text } : {}),
          ...(m.username !== undefined ? { username: m.username } : {}),
          ...(m.permalink !== undefined ? { permalink: m.permalink } : {}),
          ...(m.timestamp !== undefined ? { timestamp: m.timestamp } : {}),
          syncedAt: m.syncedAt,
        });
      }
    }

    return newIds;
  },
});

export const getReplyForEvaluation = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    replyId: v.string(),
  },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { workspaceId, replyId }) => {
    return await ctx.db
      .query("threadsReplies")
      .withIndex("by_workspace_reply", (q) =>
        q.eq("workspaceId", workspaceId).eq("replyId", replyId),
      )
      .first();
  },
});

export const getMentionForEvaluation = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    mentionId: v.string(),
  },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { workspaceId, mentionId }) => {
    return await ctx.db
      .query("threadsMentions")
      .withIndex("by_workspace_mention", (q) =>
        q.eq("workspaceId", workspaceId).eq("mentionId", mentionId),
      )
      .first();
  },
});

export const getActiveAutomations = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    trigger: triggerValidator,
  },
  returns: v.array(v.any()),
  handler: async (ctx, { workspaceId, trigger }) => {
    const list = await ctx.db
      .query("threadsAutomations")
      .withIndex("by_workspace_trigger", (q) =>
        q.eq("workspaceId", workspaceId).eq("trigger", trigger),
      )
      .collect();

    return list.filter((a) => a.isActive);
  },
});

/**
 * Atomski proverava ograničenja i evidentira izvršenje u `threadsProcessedReplies`.
 */
export const checkAndReserveExecution = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    automationId: v.id("threadsAutomations"),
    authorId: v.optional(v.string()),
    rootPostId: v.optional(v.string()),
    replyId: v.string(),
    trigger: triggerValidator,
    actionType: v.string(),
    mode: modeValidator,
    dailyLimit: v.number(),
    cooldownMinutesPerAuthor: v.number(),
    maxRepliesPerThread: v.number(),
  },
  returns: v.object({
    allowed: v.boolean(),
    reason: v.optional(v.string()),
    date: v.string(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const date = utcDateKey(now);
    const {
      workspaceId,
      automationId,
      authorId,
      rootPostId,
      replyId,
      trigger,
      actionType,
      mode,
      dailyLimit,
      cooldownMinutesPerAuthor,
      maxRepliesPerThread,
    } = args;

    // 1. Da li je ovaj replyId već obrađen za ovu automatizaciju?
    const alreadyProcessed = await ctx.db
      .query("threadsProcessedReplies")
      .withIndex("by_workspace_reply", (q) =>
        q.eq("workspaceId", workspaceId).eq("replyId", replyId),
      )
      .filter((q) => q.eq(q.field("automationId"), automationId))
      .first();

    // Rezervacija iz DRAFT prolaza ne sme da zaključa kasniji LIVE prolaz.
    // Draft postoji da bi se videlo šta bi automatizacija uradila; ako draft
    // potroši rezervaciju, prelazak na `live` ne bi uradio ništa nad već
    // ocenjenim odgovorima, a operater bi mislio da je pustio automatizaciju.
    // Draft nad draftom se i dalje ne ponavlja, i live nad live nikada.
    if (alreadyProcessed !== null) {
      const draftBeingPromoted =
        alreadyProcessed.mode === "draft" && mode === "live";

      if (!draftBeingPromoted) {
        return { allowed: false, reason: "already_processed", date };
      }

      // Ista rezervacija se PODIŽE na live umesto da se upiše druga —
      // inače bi dva reda tvrdila da je isti odgovor obrađen dvaput.
      await ctx.db.patch(alreadyProcessed._id, {
        mode: "live",
        actionType,
        processedAt: now,
      });
      return { allowed: true, date };
    }

    // 2. Cooldown po autoru
    // Bez poznatog autora nema cooldown-a po autoru — a to je propust koji se
    // MORA videti, ne prećutati: `already_processed` po `replyId` i dalje
    // sprečava dvostruku akciju na istom odgovoru, ali dva odgovora istog
    // neidentifikovanog čoveka prolaze kao dva različita.
    if (cooldownMinutesPerAuthor > 0 && authorId === undefined) {
      console.warn("[Threads automatizacija] cooldown po autoru preskočen", {
        automationId,
        replyId,
        razlog: "Threads nije vratio identitet autora za ovaj događaj.",
      });
    }

    if (cooldownMinutesPerAuthor > 0 && authorId !== undefined) {
      const cooldownCutoff = now - cooldownMinutesPerAuthor * 60 * 1000;
      const recentAuthorAction = await ctx.db
        .query("threadsProcessedReplies")
        .withIndex("by_workspace_author_time", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("authorId", authorId)
            .gt("processedAt", cooldownCutoff),
        )
        .filter((q) => q.eq(q.field("automationId"), automationId))
        .first();

      if (recentAuthorAction !== null) {
        return { allowed: false, reason: "cooldown_active", date };
      }
    }

    // 3. Dnevni limit akcija za ovu automatizaciju
    if (dailyLimit > 0) {
      const todayLogs = await ctx.db
        .query("threadsAutomationLogs")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", workspaceId).eq("date", date),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("automationId"), automationId),
            q.or(
              q.eq(q.field("status"), "executed"),
              q.eq(q.field("status"), "draft_simulated"),
            ),
          ),
        )
        .collect();

      if (todayLogs.length >= dailyLimit) {
        return { allowed: false, reason: "daily_limit_reached", date };
      }
    }

    // 4. Maksimalan broj odgovora unutar iste niti/objave
    if (maxRepliesPerThread > 0 && rootPostId) {
      const threadReplies = await ctx.db
        .query("threadsProcessedReplies")
        .withIndex("by_workspace_root_post", (q) =>
          q.eq("workspaceId", workspaceId).eq("rootPostId", rootPostId),
        )
        .filter((q) => q.eq(q.field("automationId"), automationId))
        .collect();

      if (threadReplies.length >= maxRepliesPerThread) {
        return { allowed: false, reason: "thread_limit_reached", date };
      }
    }

    // Upis u threadsProcessedReplies
    await ctx.db.insert("threadsProcessedReplies", {
      workspaceId,
      automationId,
      replyId,
      authorId,
      rootPostId,
      trigger,
      actionType,
      mode,
      processedAt: now,
    });

    return { allowed: true, date };
  },
});

export const writeLog = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    automationId: v.optional(v.id("threadsAutomations")),
    trigger: triggerValidator,
    sourceReplyId: v.string(),
    rootPostId: v.optional(v.string()),
    authorId: v.optional(v.string()),
    matchedKeyword: v.optional(v.string()),
    mode: modeValidator,
    actionType: v.string(),
    status: v.union(
      v.literal("executed"),
      v.literal("draft_simulated"),
      v.literal("rejected_limit"),
      v.literal("rejected_cooldown"),
      v.literal("rejected_thread_limit"),
      v.literal("failed"),
      v.literal("skipped_no_match"),
    ),
    reason: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    jobId: v.optional(v.id("threadsPublishJobs")),
    date: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("threadsAutomationLogs", {
      ...args,
      createdAt: Date.now(),
    });
    return null;
  },
});

// ── Javne CRUD operacije za UI ───────────────────────────────────────────────

/**
 * Kreira novo OpenReply pravilo za Threads.
 *
 * VAŽNO (§9):
 * `mode: "draft"` je OBAVEZNA i JEDINA dozvoljena početna vrednost pri kreiranju.
 */
export const createAutomation = mutation({
  args: {
    name: v.string(),
    trigger: triggerValidator,
    keywords: v.array(v.string()),
    matchType: matchTypeValidator,
    caseSensitive: v.boolean(),
    matchAnyKeyword: v.boolean(),
    matchAnyPost: v.boolean(),
    postId: v.optional(v.string()),
    actionType: actionTypeValidator,
    replyText: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    topicTag: v.optional(v.string()),
    autoPublishText: v.optional(v.boolean()),
    dailyLimit: v.number(),
    cooldownMinutesPerAuthor: v.number(),
    maxRepliesPerThread: v.number(),
  },
  returns: v.id("threadsAutomations"),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const now = Date.now();

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new ConvexError({
        code: "invalid",
        message: "Naziv pravila je obavezan.",
      });
    }

    if (args.dailyLimit <= 0) {
      throw new ConvexError({
        code: "invalid",
        message: "Dnevni limit mora biti veći od 0.",
      });
    }

    if (args.cooldownMinutesPerAuthor < 0) {
      throw new ConvexError({
        code: "invalid",
        message: "Cooldown ne može biti negativan.",
      });
    }

    if (args.maxRepliesPerThread <= 0) {
      throw new ConvexError({
        code: "invalid",
        message: "Maksimalan broj odgovora po niti mora biti veći od 0.",
      });
    }

    if (args.actionType === "public_reply") {
      const text = args.replyText?.trim();
      const link = args.linkUrl?.trim();
      if (!text && !link) {
        throw new ConvexError({
          code: "invalid",
          message: "Javni odgovor mora imati tekst ili link.",
        });
      }
      if (text) {
        const textProb = checkText({ mediaType: "TEXT", text });
        if (textProb) throw new ConvexError({ code: "invalid", message: textProb });
      }
      if (link) {
        const linkProb = checkLinkAttachment({
          mediaType: "TEXT",
          linkAttachment: link,
        });
        if (linkProb) throw new ConvexError({ code: "invalid", message: linkProb });
      }
      if (args.topicTag) {
        const tagProb = checkTopicTag(args.topicTag.trim());
        if (tagProb) throw new ConvexError({ code: "invalid", message: tagProb });
      }
    }

    // Čišćenje ključnih reči
    const cleanedKeywords = args.keywords
      .map((k) => (args.caseSensitive ? k.trim() : k.trim().toLowerCase()))
      .filter((k) => k.length > 0);

    return await ctx.db.insert("threadsAutomations", {
      workspaceId,
      name: trimmedName,
      trigger: args.trigger,
      keywords: cleanedKeywords,
      matchType: args.matchType,
      caseSensitive: args.caseSensitive,
      matchAnyKeyword: args.matchAnyKeyword,
      matchAnyPost: args.matchAnyPost,
      postId: args.postId?.trim() || undefined,
      actionType: args.actionType,
      replyText: args.replyText?.trim() || undefined,
      linkUrl: args.linkUrl?.trim() || undefined,
      topicTag: args.topicTag?.trim() || undefined,
      autoPublishText: args.autoPublishText ?? true,
      // OBAVEZNO: uvek počinje kao draft
      mode: "draft",
      dailyLimit: args.dailyLimit,
      cooldownMinutesPerAuthor: args.cooldownMinutesPerAuthor,
      maxRepliesPerThread: args.maxRepliesPerThread,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Ažurira postojeće OpenReply pravilo (uključujući promenu draft -> live).
 */
export const updateAutomation = mutation({
  args: {
    id: v.id("threadsAutomations"),
    name: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
    matchType: v.optional(matchTypeValidator),
    caseSensitive: v.optional(v.boolean()),
    matchAnyKeyword: v.optional(v.boolean()),
    matchAnyPost: v.optional(v.boolean()),
    postId: v.optional(v.string()),
    actionType: v.optional(actionTypeValidator),
    replyText: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    topicTag: v.optional(v.string()),
    autoPublishText: v.optional(v.boolean()),
    mode: v.optional(modeValidator),
    dailyLimit: v.optional(v.number()),
    cooldownMinutesPerAuthor: v.optional(v.number()),
    maxRepliesPerThread: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(args.id);

    if (!existing || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo automatizacije nije pronađeno.",
      });
    }

    const patch: Partial<Doc<"threadsAutomations">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      if (!trimmed) {
        throw new ConvexError({
          code: "invalid",
          message: "Naziv pravila je obavezan.",
        });
      }
      patch.name = trimmed;
    }

    if (args.keywords !== undefined) {
      const caseSens = args.caseSensitive ?? existing.caseSensitive;
      patch.keywords = args.keywords
        .map((k) => (caseSens ? k.trim() : k.trim().toLowerCase()))
        .filter((k) => k.length > 0);
    }

    if (args.matchType !== undefined) patch.matchType = args.matchType;
    if (args.caseSensitive !== undefined) patch.caseSensitive = args.caseSensitive;
    if (args.matchAnyKeyword !== undefined)
      patch.matchAnyKeyword = args.matchAnyKeyword;
    if (args.matchAnyPost !== undefined) patch.matchAnyPost = args.matchAnyPost;
    if (args.postId !== undefined) patch.postId = args.postId.trim() || undefined;
    if (args.actionType !== undefined) patch.actionType = args.actionType;
    if (args.replyText !== undefined) patch.replyText = args.replyText.trim() || undefined;
    if (args.linkUrl !== undefined) patch.linkUrl = args.linkUrl.trim() || undefined;
    if (args.topicTag !== undefined) patch.topicTag = args.topicTag.trim() || undefined;
    if (args.autoPublishText !== undefined)
      patch.autoPublishText = args.autoPublishText;
    if (args.mode !== undefined) patch.mode = args.mode;
    if (args.dailyLimit !== undefined) {
      if (args.dailyLimit <= 0) {
        throw new ConvexError({
          code: "invalid",
          message: "Dnevni limit mora biti veći od 0.",
        });
      }
      patch.dailyLimit = args.dailyLimit;
    }
    if (args.cooldownMinutesPerAuthor !== undefined) {
      if (args.cooldownMinutesPerAuthor < 0) {
        throw new ConvexError({
          code: "invalid",
          message: "Cooldown ne može biti negativan.",
        });
      }
      patch.cooldownMinutesPerAuthor = args.cooldownMinutesPerAuthor;
    }
    if (args.maxRepliesPerThread !== undefined) {
      if (args.maxRepliesPerThread <= 0) {
        throw new ConvexError({
          code: "invalid",
          message: "Maksimalan broj odgovora po niti mora biti veći od 0.",
        });
      }
      patch.maxRepliesPerThread = args.maxRepliesPerThread;
    }
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

/**
 * Briše pravilo automatizacije.
 */
export const deleteAutomation = mutation({
  args: { id: v.id("threadsAutomations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(id);

    if (!existing || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo automatizacije nije pronađeno.",
      });
    }

    await ctx.db.delete(id);
    return null;
  },
});

/**
 * Uključuje ili isključuje pravilo automatizacije.
 */
export const toggleAutomation = mutation({
  args: {
    id: v.id("threadsAutomations"),
    isActive: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { id, isActive }) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(id);

    if (!existing || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo automatizacije nije pronađeno.",
      });
    }

    await ctx.db.patch(id, { isActive, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Lista svih pravila za aktivni workspace.
 */
export const listAutomations = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    return await ctx.db
      .query("threadsAutomations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .collect();
  },
});

/**
 * Vraća jedno pravilo po ID-ju.
 */
export const getAutomation = query({
  args: { id: v.id("threadsAutomations") },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { id }) => {
    const { workspaceId } = await requireMembership(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.workspaceId !== workspaceId) return null;
    return doc;
  },
});

/**
 * Lista logova automatizacije za aktivni workspace.
 */
export const listAutomationLogs = query({
  args: {
    automationId: v.optional(v.id("threadsAutomations")),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, { automationId, limit = 50 }) => {
    const { workspaceId } = await requireMembership(ctx);

    if (automationId) {
      return await ctx.db
        .query("threadsAutomationLogs")
        .withIndex("by_workspace_automation", (q) =>
          q.eq("workspaceId", workspaceId).eq("automationId", automationId),
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("threadsAutomationLogs")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(limit);
  },
});
