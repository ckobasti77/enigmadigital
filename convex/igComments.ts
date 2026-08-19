import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import {
  buildCommentNodeUrl,
  buildCommentRepliesUrl,
  buildMediaNodeUrl,
  getMetaGraphVersion,
  type RawModerationResponse,
} from "./lib/instagramApi";
import {
  BULK_ACTION_MAX,
  REPLY_TEXT_MAX,
  translateModerationError,
} from "./lib/igComments";
import type { ModerationContext } from "./igCommentsStore";

/**
 * ============================================================================
 * INSTAGRAM COMMENT MODERATION — ACTIONS (F4, V8 runtime)
 * ============================================================================
 *
 * Five things Instagram lets us do to a comment, and all five are here: reply
 * publicly, hide, show, delete, and switch commenting off for a whole post.
 * There is no sixth. In particular there is no way to LIKE a comment or a post
 * from any Instagram API at any permission level, so no amount of scope
 * fiddling adds one — `likeCount` is a number to read and nothing more.
 *
 * Every action follows the same four steps, in this order and no other:
 *
 *   1. `openContext` — membership is checked BEFORE anything leaves this
 *      deployment. It also hands over the credentials, so an action that
 *      skipped the check would have no token to call Instagram with.
 *   2. the stored row is read, which is what proves the comment sits under one
 *      of OUR posts. Somebody else's comment on somebody else's post is not
 *      ours to touch, and never has a row here.
 *   3. the call goes out.
 *   4. a row is written to `igModerationLogs` — including when it failed.
 *
 * ============================================================================
 */

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid", message });
}

const NO_CONNECTION =
  "Instagram nalog nije povezan. Poveži ga u Podešavanjima pa pokušaj ponovo.";

const NO_ANSWER =
  "Instagram nije odgovorio. Proveri vezu i pokušaj ponovo za koji trenutak.";

/** The comment is not in our database, so it is not on one of our posts. */
const NOT_OURS =
  "Ovaj komentar nije pronađen među komentarima na objavama ovog naloga.";

type ModerationSession = {
  workspaceId: Id<"workspaces">;
  userId: Id<"users">;
  token: string;
  version: string;
};

/**
 * Step 1 of every action: who is asking, and with which token.
 *
 * A bulk action opens this ONCE for the whole selection — decrypting the
 * credentials fifty times to do the same fifty calls would be work for nothing.
 */
async function openSession(ctx: ActionCtx): Promise<ModerationSession> {
  const context: ModerationContext = await ctx.runQuery(
    internal.igCommentsStore.loadModerationContext,
    {},
  );
  if (context === null) invalid(NO_CONNECTION);

  let token: string;
  try {
    token = await decryptCredentials(context.encryptedCredentials);
  } catch {
    invalid("Instagram kredencijali se ne mogu pročitati. Ponovo poveži nalog.");
  }

  return {
    workspaceId: context.workspaceId,
    userId: context.userId,
    token,
    version: getMetaGraphVersion(),
  };
}

type GraphResult =
  | { ok: true; body: RawModerationResponse }
  | { ok: false; message: string };

/**
 * One Graph API write, with the answer already translated into Serbian.
 *
 * The token rides in the body rather than in a header because DELETE has no
 * body at all — there it goes on the query string — and keeping both shapes in
 * one helper is what stops one of them from quietly losing its credentials.
 */
async function graphWrite(
  url: string,
  method: "POST" | "DELETE",
  token: string,
  fields: Record<string, string> = {},
): Promise<GraphResult> {
  let res: Response;
  try {
    if (method === "DELETE") {
      const target = new URL(url);
      target.searchParams.set("access_token", token);
      res = await fetch(target.toString(), { method: "DELETE" });
    } else {
      const params = new URLSearchParams(fields);
      params.set("access_token", token);
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    }
  } catch {
    return { ok: false, message: NO_ANSWER };
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, message: translateModerationError(raw) };
  }

  try {
    return { ok: true, body: JSON.parse(raw) as RawModerationResponse };
  } catch {
    // A 200 with an unparsable body still means the write went through.
    return { ok: true, body: {} };
  }
}

// ── the operations, as plain helpers ─────────────────────────────────────────
//
// Each one is written once and used twice: by the single-comment action, and by
// the bulk action for every comment in the selection. They are helpers rather
// than actions calling actions on purpose — same runtime, so there is nothing
// to cross and no reason to pay for a second dispatch.

async function hideOne(
  ctx: ActionCtx,
  session: ModerationSession,
  commentId: string,
  hidden: boolean,
): Promise<void> {
  const { workspaceId, userId, token, version } = session;

  const comment = await ctx.runQuery(
    internal.igCommentsStore.getForModeration,
    { workspaceId, commentId },
  );
  if (comment === null) invalid(NOT_OURS);
  if (comment.deletedAt !== undefined) {
    invalid("Komentar je obrisan — više se ne može sakriti ni prikazati.");
  }

  const result = await graphWrite(
    buildCommentNodeUrl(commentId, version),
    "POST",
    token,
    { hide: hidden ? "true" : "false" },
  );

  await ctx.runMutation(internal.igCommentsStore.logModeration, {
    workspaceId,
    userId,
    action: hidden ? ("hide" as const) : ("unhide" as const),
    commentId,
    mediaId: comment.mediaId,
    text: comment.text,
    username: comment.username,
    status: result.ok ? ("done" as const) : ("failed" as const),
    ...(result.ok ? {} : { errorMessage: result.message }),
  });

  if (!result.ok) invalid(result.message);

  await ctx.runMutation(internal.igCommentsStore.applyHidden, {
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
  const { workspaceId, userId, token, version } = session;

  const comment = await ctx.runQuery(
    internal.igCommentsStore.getForModeration,
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
    buildCommentNodeUrl(commentId, version),
    "DELETE",
    token,
  );

  await ctx.runMutation(internal.igCommentsStore.logModeration, {
    workspaceId,
    userId,
    action: "delete" as const,
    commentId,
    mediaId: comment.mediaId,
    // The comment's own text, because after this there is nowhere left to read
    // it from.
    text: comment.text,
    username: comment.username,
    status: result.ok ? ("done" as const) : ("failed" as const),
    ...(result.ok ? {} : { errorMessage: result.message }),
  });

  if (!result.ok) invalid(result.message);

  await ctx.runMutation(internal.igCommentsStore.applyDeleted, {
    workspaceId,
    commentId,
  });
}

// ── replying ─────────────────────────────────────────────────────────────────

/**
 * Post a public reply under a comment.
 *
 * The reply is written to `igComments` the moment Instagram hands back its id,
 * so it appears indented under its parent immediately instead of six hours
 * later, and the parent stops counting as unanswered at the same instant.
 */
export const replyToComment = action({
  args: { commentId: v.string(), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const message = args.message.trim();
    if (message.length === 0) invalid("Odgovor ne može biti prazan.");
    if (message.length > REPLY_TEXT_MAX) {
      invalid(`Odgovor može imati najviše ${REPLY_TEXT_MAX} znakova.`);
    }

    const session = await openSession(ctx);
    const { workspaceId, userId, token, version } = session;

    const comment = await ctx.runQuery(
      internal.igCommentsStore.getForModeration,
      { workspaceId, commentId: args.commentId },
    );
    if (comment === null) invalid(NOT_OURS);
    if (comment.deletedAt !== undefined) {
      invalid("Komentar je obrisan — na njega se više ne može odgovoriti.");
    }

    const result = await graphWrite(
      buildCommentRepliesUrl(args.commentId, version),
      "POST",
      token,
      { message },
    );

    await ctx.runMutation(internal.igCommentsStore.logModeration, {
      workspaceId,
      userId,
      action: "reply" as const,
      commentId: args.commentId,
      mediaId: comment.mediaId,
      text: message,
      username: comment.username,
      status: result.ok ? ("done" as const) : ("failed" as const),
      ...(result.ok ? {} : { errorMessage: result.message }),
    });

    if (!result.ok) invalid(result.message);

    // Instagram answers with the new comment's id. Without one there is nothing
    // to key a local row on, so the reply simply waits for the next sync.
    if (typeof result.body.id === "string" && result.body.id.length > 0) {
      await ctx.runMutation(internal.igCommentsStore.insertOurReply, {
        workspaceId,
        mediaId: comment.mediaId,
        commentId: result.body.id,
        parentCommentId: args.commentId,
        text: message,
        // The handle is not in the answer. The sync fills it in; until then the
        // screen labels the row "our reply" from `isOurs` alone.
        username: "",
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

/** Delete a comment. There is no undo, on Instagram or here. */
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
 * Each comment is its own Instagram call — there is no batch endpoint — so one
 * failure must not stop the rest. What comes back is a tally plus the first
 * error, which is what the screen needs to say "5 od 7 obrisano" and then say
 * why the other two are still there.
 */
async function runBulk(
  commentIds: string[],
  each: (commentId: string) => Promise<void>,
): Promise<BulkResult> {
  let succeeded = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (const commentId of commentIds) {
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
  if (unique.length > BULK_ACTION_MAX) {
    invalid(
      `Grupna radnja može obuhvatiti najviše ${BULK_ACTION_MAX} komentara odjednom.`,
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
    return await runBulk(ids, (commentId) =>
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
    return await runBulk(ids, (commentId) =>
      deleteOne(ctx, session, commentId, args.acknowledgeAutomation === true),
    );
  },
});

// ── comments on a whole post ─────────────────────────────────────────────────

/**
 * Switch commenting on a post on or off.
 *
 * The field WRITTEN is `comment_enabled`; the field READ back off the media is
 * `is_comment_enabled`. Instagram named them differently — see
 * `buildMediaNodeUrl` in lib/instagramApi.ts.
 */
export const setCommentsEnabled = action({
  args: { mediaId: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { workspaceId, userId, token, version } = await openSession(ctx);

    const owned: boolean = await ctx.runQuery(
      internal.igCommentsStore.ownsMedia,
      { workspaceId, mediaId: args.mediaId },
    );
    if (!owned) invalid("Objava ne pripada ovom nalogu.");

    const result = await graphWrite(
      buildMediaNodeUrl(args.mediaId, version),
      "POST",
      token,
      { comment_enabled: args.enabled ? "true" : "false" },
    );

    await ctx.runMutation(internal.igCommentsStore.logModeration, {
      workspaceId,
      userId,
      action: args.enabled
        ? ("comments_on" as const)
        : ("comments_off" as const),
      mediaId: args.mediaId,
      status: result.ok ? ("done" as const) : ("failed" as const),
      ...(result.ok ? {} : { errorMessage: result.message }),
    });

    if (!result.ok) invalid(result.message);

    await ctx.runMutation(internal.igCommentsStore.applyCommentsEnabled, {
      workspaceId,
      mediaId: args.mediaId,
      enabled: args.enabled,
    });
    return null;
  },
});
