import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import { createUsageTracker, type UsageTracker } from "./lib/metaRateLimit";
import {
  buildCommentNodeUrl,
  buildCommentRepliesUrl,
  buildLikesUrl,
  getMetaGraphVersion,
  type RawFbWriteResponse,
} from "./lib/facebookApi";
import {
  FB_BULK_ACTION_MAX,
  FB_REPLY_TEXT_MAX,
  translateFacebookError,
} from "./lib/facebookContent";
import type { FbModerationContext } from "./fbCommentsStore";

/**
 * ============================================================================
 * FACEBOOK COMMENT MODERATION — ACTIONS (F5, V8 runtime)
 * ============================================================================
 *
 * The Instagram twin of this file is `convex/igComments.ts`, and it opens with
 * an apology: Instagram has no way to LIKE anything, at any permission level.
 * Facebook does — `POST /{object-id}/likes` — so this file has two operations
 * that one cannot have, and they are the reason the Facebook moderation row has
 * a heart on it and the Instagram one does not.
 *
 * Every action follows the same four steps, in this order and no other:
 *
 *   1. `openSession` — membership is checked BEFORE anything leaves this
 *      deployment. It also hands over the credentials, so an action that
 *      skipped the check would have no token to call Facebook with.
 *   2. the stored row is read, which is what proves the comment sits under one
 *      of OUR posts.
 *   3. the call goes out.
 *   4. a row is written to `fbModerationLogs` — including when it failed.
 * ============================================================================
 */

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid", message });
}

const NO_CONNECTION =
  "Facebook stranica nije povezana. Poveži je u Podešavanjima pa pokušaj ponovo.";

const NO_ANSWER =
  "Facebook nije odgovorio. Proveri vezu i pokušaj ponovo za koji trenutak.";

/** The comment is not in our database, so it is not on one of our posts. */
const NOT_OURS =
  "Ovaj komentar nije pronađen među komentarima na objavama ove stranice.";

type ModerationSession = {
  workspaceId: Id<"workspaces">;
  userId: Id<"users">;
  pageId: string;
  token: string;
  version: string;
  /**
   * Every write here is a Meta call, so every write is counted (P2). Moderation
   * was one of the larger blind spots: a bulk delete is fifty calls off one
   * click, and the gate could not see a single one of them.
   */
  tracker: UsageTracker;
};

/**
 * Step 1 of every action: who is asking, and with which token.
 *
 * A bulk action opens this ONCE for the whole selection — decrypting the
 * credentials fifty times to do the same fifty calls would be work for nothing.
 */
async function openSession(ctx: ActionCtx): Promise<ModerationSession> {
  const context: FbModerationContext = await ctx.runQuery(
    internal.fbCommentsStore.loadModerationContext,
    {},
  );
  if (context === null) invalid(NO_CONNECTION);

  let token: string;
  try {
    token = await decryptCredentials(context.encryptedCredentials);
  } catch {
    invalid("Facebook kredencijali se ne mogu pročitati. Ponovo poveži nalog.");
  }

  return {
    workspaceId: context.workspaceId,
    userId: context.userId,
    pageId: context.pageId,
    token,
    version: getMetaGraphVersion(),
    tracker: createUsageTracker(),
  };
}

type GraphResult =
  | { ok: true; body: RawFbWriteResponse }
  | { ok: false; message: string };

/**
 * One Graph API write, with the answer already translated into Serbian.
 *
 * The token rides in the body rather than in a header because DELETE has no
 * body at all — there it goes on the query string — and keeping both shapes in
 * one helper is what stops one of them from quietly losing its credentials.
 */
async function graphWrite(
  ctx: ActionCtx,
  session: ModerationSession,
  url: string,
  method: "POST" | "DELETE",
  fields: Record<string, string> = {},
): Promise<GraphResult> {
  const { token, tracker } = session;
  let res: Response;
  try {
    if (method === "DELETE") {
      const target = new URL(url);
      target.searchParams.set("access_token", token);
      res = await tracker.fetch(target.toString(), { method: "DELETE" });
    } else {
      const params = new URLSearchParams(fields);
      params.set("access_token", token);
      res = await tracker.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    }
  } catch {
    return { ok: false, message: NO_ANSWER };
  } finally {
    // Flushed per call rather than per action. These are single writes behind
    // a button with no natural end-of-pass to batch against — and a refusal
    // read here is what lets the bulk loop below stop on the next iteration
    // instead of firing the other forty-nine into the same wall.
    await tracker.flush(ctx, session.workspaceId);
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, message: translateFacebookError(raw) };
  }

  try {
    return { ok: true, body: JSON.parse(raw) as RawFbWriteResponse };
  } catch {
    // A 200 with an unparsable body still means the write went through.
    return { ok: true, body: {} };
  }
}

// ── the operations, as plain helpers ─────────────────────────────────────────
//
// Each one is written once and used twice: by the single-comment action, and by
// the bulk action for every comment in the selection.

async function hideOne(
  ctx: ActionCtx,
  session: ModerationSession,
  commentId: string,
  hidden: boolean,
): Promise<void> {
  const { workspaceId, userId, version } = session;

  const comment = await ctx.runQuery(
    internal.fbCommentsStore.getForModeration,
    { workspaceId, commentId },
  );
  if (comment === null) invalid(NOT_OURS);
  if (comment.deletedAt !== undefined) {
    invalid("Komentar je obrisan — više se ne može sakriti ni prikazati.");
  }

  // `is_hidden`, not `hide`. Instagram spells the same idea the other way, and
  // Facebook answers a wrong field name with a cheerful 200 and no effect.
  const result = await graphWrite(
    ctx,
    session,
    buildCommentNodeUrl(commentId, version),
    "POST",
    { is_hidden: hidden ? "true" : "false" },
  );

  await ctx.runMutation(internal.fbCommentsStore.logModeration, {
    workspaceId,
    userId,
    action: hidden ? ("hide" as const) : ("unhide" as const),
    commentId,
    postId: comment.postId,
    text: comment.text,
    authorName: comment.authorName,
    status: result.ok ? ("done" as const) : ("failed" as const),
    ...(result.ok ? {} : { errorMessage: result.message }),
  });

  if (!result.ok) invalid(result.message);

  await ctx.runMutation(internal.fbCommentsStore.applyHidden, {
    workspaceId,
    commentId,
    hidden,
  });
}

async function deleteOne(
  ctx: ActionCtx,
  session: ModerationSession,
  commentId: string,
  acknowledgeAutomation: boolean,
): Promise<void> {
  const { workspaceId, userId, version } = session;

  const comment = await ctx.runQuery(
    internal.fbCommentsStore.getForModeration,
    { workspaceId, commentId },
  );
  if (comment === null) invalid(NOT_OURS);
  if (comment.deletedAt !== undefined) invalid("Komentar je već obrisan.");

  // Our own comment that an automation posted is part of a flow somebody built.
  // Deleting it by hand breaks that flow without touching the automation that
  // keeps posting it, so it takes a second, explicit yes — refused here on the
  // server rather than merely discouraged in the interface.
  if (comment.automationName !== null && !acknowledgeAutomation) {
    invalid(
      `Ovaj odgovor je poslala automatizacija „${comment.automationName}”. Potvrdi brisanje još jednom da bi bio obrisan.`,
    );
  }

  const result = await graphWrite(
    ctx,
    session,
    buildCommentNodeUrl(commentId, version),
    "DELETE",
  );

  await ctx.runMutation(internal.fbCommentsStore.logModeration, {
    workspaceId,
    userId,
    action: "delete" as const,
    commentId,
    postId: comment.postId,
    // The comment's own text, because after this there is nowhere left to read
    // it from.
    text: comment.text,
    authorName: comment.authorName,
    status: result.ok ? ("done" as const) : ("failed" as const),
    ...(result.ok ? {} : { errorMessage: result.message }),
  });

  if (!result.ok) invalid(result.message);

  await ctx.runMutation(internal.fbCommentsStore.applyDeleted, {
    workspaceId,
    commentId,
  });
}

// ── replying ─────────────────────────────────────────────────────────────────

/**
 * Post a public reply under a comment.
 *
 * The reply is written to `fbComments` the moment Facebook hands back its id,
 * so it appears indented under its parent immediately instead of six hours
 * later, and the parent stops counting as unanswered at the same instant.
 */
export const replyToComment = action({
  args: { commentId: v.string(), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const message = args.message.trim();
    if (message.length === 0) invalid("Odgovor ne može biti prazan.");
    if (message.length > FB_REPLY_TEXT_MAX) {
      invalid(`Odgovor može imati najviše ${FB_REPLY_TEXT_MAX} znakova.`);
    }

    const session = await openSession(ctx);
    const { workspaceId, userId, version } = session;

    const comment = await ctx.runQuery(
      internal.fbCommentsStore.getForModeration,
      { workspaceId, commentId: args.commentId },
    );
    if (comment === null) invalid(NOT_OURS);
    if (comment.deletedAt !== undefined) {
      invalid("Komentar je obrisan — na njega se više ne može odgovoriti.");
    }

    const result = await graphWrite(
      ctx,
      session,
      buildCommentRepliesUrl(args.commentId, version),
      "POST",
      { message },
    );

    await ctx.runMutation(internal.fbCommentsStore.logModeration, {
      workspaceId,
      userId,
      action: "reply" as const,
      commentId: args.commentId,
      postId: comment.postId,
      text: message,
      authorName: comment.authorName,
      status: result.ok ? ("done" as const) : ("failed" as const),
      ...(result.ok ? {} : { errorMessage: result.message }),
    });

    if (!result.ok) invalid(result.message);

    // Facebook answers with the new comment's id. Without one there is nothing
    // to key a local row on, so the reply simply waits for the next sync.
    if (typeof result.body.id === "string" && result.body.id.length > 0) {
      await ctx.runMutation(internal.fbCommentsStore.insertOurReply, {
        workspaceId,
        postId: comment.postId,
        commentId: result.body.id,
        parentCommentId: args.commentId,
        text: message,
        // The Page's display name is not in the answer; the sync fills it in.
        // Until then the row is labelled from `isOurs`, not from the name.
        authorName: "",
      });
    }

    return null;
  },
});

// ── hiding, showing, deleting ────────────────────────────────────────────────

/**
 * Hide or show a comment. Reversible, which is why it asks for no confirmation
 * — the screen flips the state straight away and puts it back if this fails.
 */
export const setCommentHidden = action({
  args: { commentId: v.string(), hidden: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const session = await openSession(ctx);
    await hideOne(ctx, session, args.commentId, args.hidden);
    return null;
  },
});

/** Delete a comment. There is no undo, on Facebook or here. */
export const deleteComment = action({
  args: {
    commentId: v.string(),
    acknowledgeAutomation: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const session = await openSession(ctx);
    await deleteOne(
      ctx,
      session,
      args.commentId,
      args.acknowledgeAutomation === true,
    );
    return null;
  },
});

// ── liking ───────────────────────────────────────────────────────────────────

/**
 * Like or unlike a comment AS THE PAGE.
 *
 * The one moderation action with no Instagram counterpart. It is also the only
 * one that is purely additive — nothing is hidden, nothing is destroyed — which
 * is why it needs no confirmation and no acknowledgement, even on a comment an
 * automation wrote.
 *
 * "Already liked" comes back as an error, and it is translated into a sentence
 * rather than surfaced as a failure: the state the operator wanted is the state
 * that exists, which is not a problem.
 */
export const setCommentLiked = action({
  args: { commentId: v.string(), liked: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const session = await openSession(ctx);
    const { workspaceId, userId, version } = session;

    const comment = await ctx.runQuery(
      internal.fbCommentsStore.getForModeration,
      { workspaceId, commentId: args.commentId },
    );
    if (comment === null) invalid(NOT_OURS);
    if (comment.deletedAt !== undefined) {
      invalid("Komentar je obrisan — više se ne može lajkovati.");
    }

    const result = await graphWrite(
      ctx,
      session,
      buildLikesUrl(args.commentId, version),
      args.liked ? "POST" : "DELETE",
    );

    await ctx.runMutation(internal.fbCommentsStore.logModeration, {
      workspaceId,
      userId,
      action: args.liked ? ("like" as const) : ("unlike" as const),
      commentId: args.commentId,
      postId: comment.postId,
      text: comment.text,
      authorName: comment.authorName,
      status: result.ok ? ("done" as const) : ("failed" as const),
      ...(result.ok ? {} : { errorMessage: result.message }),
    });

    if (!result.ok) invalid(result.message);

    await ctx.runMutation(internal.fbCommentsStore.applyLiked, {
      workspaceId,
      commentId: args.commentId,
      liked: args.liked,
    });
    return null;
  },
});

/** The same, on a whole post. Same endpoint — `/likes` takes any object id. */
export const setPostLiked = action({
  args: { postId: v.string(), liked: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const session = await openSession(ctx);
    const { workspaceId, userId, version } = session;

    const owned: boolean = await ctx.runQuery(
      internal.fbCommentsStore.ownsPost,
      { workspaceId, postId: args.postId },
    );
    if (!owned) invalid("Objava ne pripada ovoj stranici.");

    const result = await graphWrite(
      ctx,
      session,
      buildLikesUrl(args.postId, version),
      args.liked ? "POST" : "DELETE",
    );

    await ctx.runMutation(internal.fbCommentsStore.logModeration, {
      workspaceId,
      userId,
      action: args.liked ? ("like" as const) : ("unlike" as const),
      postId: args.postId,
      status: result.ok ? ("done" as const) : ("failed" as const),
      ...(result.ok ? {} : { errorMessage: result.message }),
    });

    if (!result.ok) invalid(result.message);

    await ctx.runMutation(internal.facebookStore.applyPostLiked, {
      workspaceId,
      postId: args.postId,
      liked: args.liked,
    });
    return null;
  },
});

// ── in bulk ──────────────────────────────────────────────────────────────────

const bulkResultValidator = v.object({
  succeeded: v.number(),
  failed: v.number(),
  /** The first thing that went wrong, verbatim — enough to act on. */
  firstError: v.union(v.string(), v.null()),
});

type BulkResult = {
  succeeded: number;
  failed: number;
  firstError: string | null;
};

/**
 * Run one operation over a selection.
 *
 * Each comment is its own Facebook call — there is no batch endpoint at this
 * level — so one failure must not stop the rest. What comes back is a tally
 * plus the first error, which is what the screen needs to say "5 od 7 obrisano"
 * and then say why the other two are still there.
 */
async function runBulk(
  session: ModerationSession,
  commentIds: string[],
  each: (commentId: string) => Promise<void>,
): Promise<BulkResult> {
  let succeeded = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (const commentId of commentIds) {
    // Meta has refused. The remaining forty-nine cannot land either, and each
    // attempt extends the block — so the rest are reported as failed without
    // being sent (P2).
    if (session.tracker.throttled) {
      failed++;
      firstError ??=
        "Facebook privremeno ograničava pozive. Pokušaj ponovo za koji minut.";
      continue;
    }

    try {
      await each(commentId);
      succeeded++;
    } catch (err) {
      failed++;
      if (firstError === null) {
        firstError =
          err instanceof ConvexError
            ? ((err.data as { message?: string })?.message ??
              "Radnja nije uspela.")
            : "Radnja nije uspela.";
      }
    }
  }

  return { succeeded, failed, firstError };
}

function normalizeSelection(commentIds: string[]): string[] {
  const unique = Array.from(
    new Set(commentIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
  if (unique.length === 0) invalid("Nije izabran nijedan komentar.");
  if (unique.length > FB_BULK_ACTION_MAX) {
    invalid(
      `Grupna radnja može obuhvatiti najviše ${FB_BULK_ACTION_MAX} komentara odjednom.`,
    );
  }
  return unique;
}

export const bulkSetHidden = action({
  args: { commentIds: v.array(v.string()), hidden: v.boolean() },
  returns: bulkResultValidator,
  handler: async (ctx, args): Promise<BulkResult> => {
    const ids = normalizeSelection(args.commentIds);
    const session = await openSession(ctx);
    return await runBulk(session, ids, (commentId) =>
      hideOne(ctx, session, commentId, args.hidden),
    );
  },
});

export const bulkDelete = action({
  args: {
    commentIds: v.array(v.string()),
    acknowledgeAutomation: v.optional(v.boolean()),
  },
  returns: bulkResultValidator,
  handler: async (ctx, args): Promise<BulkResult> => {
    const ids = normalizeSelection(args.commentIds);
    const session = await openSession(ctx);
    return await runBulk(session, ids, (commentId) =>
      deleteOne(ctx, session, commentId, args.acknowledgeAutomation === true),
    );
  },
});
