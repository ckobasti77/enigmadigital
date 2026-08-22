import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { appendUtm, appendEventId, isBotUserAgent } from "./lib/orLink";
import { decryptCredentials } from "./lib/crypto";
import {
  allowsBackground,
  createUsageTracker,
  readGate,
} from "./lib/metaRateLimit";
import { IG_MEDIA_HOURLY_CAP, ROUTE_WINDOW_MS } from "./publicRouteLimit";
import {
  signatureFailureReason,
  signatureSecrets,
  type WebhookRoute,
} from "./lib/webhookSecrets";
import {
  buildMediaFieldsUrl,
  isMissingObjectError,
  normalizeMediaChildren,
  pickChildDisplayUrl,
  pickDisplayUrl,
  type RawMediaFieldsResponse,
  type StoredMediaChild,
} from "./lib/instagramApi";

const http = httpRouter();

// Registers /.well-known/openid-configuration, /.well-known/jwks.json and the
// auth sign-in / callback routes on the Convex HTTP endpoint.
auth.addHttpRoutes(http);

// ── Webhook Signature Verification ──────────────────────────────────────────

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Verify `X-Hub-Signature-256` over the RAW body.
 *
 * ONE function for both webhooks (F5). It is the same Meta app behind the
 * Instagram and the Facebook route, so it is the same digest — but NOT
 * necessarily the same variable: the Facebook card tells the operator to set
 * `FACEBOOK_APP_SECRET`, and this function used to ignore that variable
 * entirely (P3). A deployment set up by following the on-screen instructions
 * therefore refused every Page event with a 401 while looking healthy in every
 * other respect. The candidate list per route now lives in
 * `lib/webhookSecrets.ts`, which is also what the Settings indicator reads, so
 * the two cannot drift apart again.
 *
 * A refusal is recorded rather than swallowed. A silent 401 loop is worse than
 * a crash: Meta retries, then unsubscribes, and nothing anywhere says why.
 */
async function verifySignature(
  ctx: ActionCtx,
  route: WebhookRoute,
  raw: string,
  header: string | null,
): Promise<boolean> {
  const ok = await signatureMatches(route, raw, header);

  // Best effort on both sides: a webhook must answer Meta quickly, and losing
  // a counter is never a reason to fail the request itself.
  if (ok) {
    await ctx
      .runMutation(internal.webhookHealth.recordSignatureOk, { route })
      .catch(() => {});
  } else {
    await ctx
      .runMutation(internal.webhookHealth.recordSignatureFailure, {
        route,
        reason: signatureFailureReason(route),
      })
      .catch(() => {});
  }
  return ok;
}

async function signatureMatches(
  route: WebhookRoute,
  raw: string,
  header: string | null,
): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) {
    return false;
  }
  const expectedHex = header.slice("sha256=".length).toLowerCase().trim();
  if (!expectedHex) {
    return false;
  }

  const candidateSecrets = signatureSecrets(route);
  if (candidateSecrets.length === 0) {
    return false;
  }

  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(raw);

  for (const secret of candidateSecrets) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signatureBuffer = await crypto.subtle.sign("HMAC", key, rawBytes);
      const computedHex = bufferToHex(signatureBuffer).toLowerCase();
      if (constantTimeEqual(computedHex, expectedHex)) {
        return true;
      }
    } catch {
      // Continue to next candidate secret
    }
  }

  return false;
}

/**
 * Pseudonymised client IP for click de-duplication analysis. Salted so the
 * stored digest cannot be reversed by hashing the IPv4 space; never stores the
 * raw address.
 */
async function hashClientIp(request: Request): Promise<string | undefined> {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim();
  if (!ip) {
    return undefined;
  }

  const salt = process.env.LINK_HASH_SALT ?? process.env.CONVEX_SITE_URL ?? "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${ip}`),
  );
  return bufferToHex(digest).slice(0, 32);
}

// ── Payload Types ────────────────────────────────────────────────────────────

interface InstagramWebhookFrom {
  id?: string;
  username?: string;
}

interface InstagramWebhookMedia {
  id?: string;
  media_product_type?: string;
}

interface InstagramWebhookCommentValue {
  id?: string;
  text?: string;
  from?: InstagramWebhookFrom;
  media?: InstagramWebhookMedia;
  /**
   * The comment being replied to. Instagram sends it ONLY on a reply — unlike
   * the Facebook payload, where `parent_id` is the post on a top-level comment
   * and has to be compared against `post_id` to mean anything.
   */
  parent_id?: string;
}

interface InstagramWebhookChange {
  field?: string;
  value?: InstagramWebhookCommentValue;
}

interface InstagramWebhookQuickReply {
  payload?: string;
}

interface InstagramWebhookAttachment {
  type?: string;
  payload?: { url?: string };
  title?: string;
}

interface InstagramWebhookShare {
  link?: string;
  id?: string;
}

interface InstagramWebhookStory {
  id?: string;
  url?: string;
}

interface InstagramWebhookReaction {
  mid?: string;
  action?: "react" | "unreact";
  reaction?: string;
  emoji?: string;
}

interface InstagramWebhookRead {
  mid?: string;
  watermark?: number;
}

interface InstagramWebhookReferral {
  ref?: string;
  source?: string;
  type?: string;
  ad_id?: string;
}

interface InstagramWebhookOptin {
  ref?: string;
  user_token?: string;
}

interface InstagramWebhookMessageEdit {
  mid?: string;
  text?: string;
  num_edit?: number;
}

interface InstagramWebhookMessage {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  is_deleted?: boolean;
  is_unsupported?: boolean;
  // Present when the message is a tapped quick reply rather than typed text.
  quick_reply?: InstagramWebhookQuickReply;
  attachments?: InstagramWebhookAttachment[];
  shares?: InstagramWebhookShare;
  story?: InstagramWebhookStory;
  reply_to?: { mid?: string };
}

interface InstagramWebhookPostback {
  mid?: string;
  title?: string;
  payload?: string;
  referral?: InstagramWebhookReferral;
}

interface InstagramWebhookMessaging {
  sender?: InstagramWebhookFrom;
  recipient?: InstagramWebhookFrom;
  timestamp?: number;
  message?: InstagramWebhookMessage;
  postback?: InstagramWebhookPostback;
  reaction?: InstagramWebhookReaction;
  read?: InstagramWebhookRead;
  referral?: InstagramWebhookReferral;
  optin?: InstagramWebhookOptin;
  message_edit?: InstagramWebhookMessageEdit;
}

interface InstagramWebhookEntry {
  id?: string;
  time?: number;
  changes?: InstagramWebhookChange[];
  messaging?: InstagramWebhookMessaging[];
  standby?: InstagramWebhookMessaging[];
}

interface InstagramWebhookPayload {
  object?: string;
  entry?: InstagramWebhookEntry[];
}

// ── Facebook Page Payload Types (F5) ─────────────────────────────────────────
//
// A Page event does NOT look like an Instagram event. Comments ride in on
// `changes[]` with `field: "feed"` and an `item` that says which kind of feed
// change it is — a comment, a reaction, a new post — where Instagram has a
// dedicated `comments` field and nothing else in the array.

interface FacebookWebhookFeedValue {
  item?: string; // "comment" | "post" | "reaction" | "share" | …
  verb?: string; // "add" | "edited" | "remove" | "hide" | …
  comment_id?: string;
  post_id?: string;
  parent_id?: string;
  message?: string;
  from?: { id?: string; name?: string };
}

interface FacebookWebhookChange {
  field?: string;
  value?: FacebookWebhookFeedValue;
}

interface FacebookWebhookEntry {
  id?: string;
  time?: number;
  changes?: FacebookWebhookChange[];
  // Messaging is the one part that IS identical to Instagram, PSID for IGSID.
  messaging?: InstagramWebhookMessaging[];
  standby?: InstagramWebhookMessaging[];
}

interface FacebookWebhookPayload {
  object?: string;
  entry?: FacebookWebhookEntry[];
}

// ── Webhook Routes ───────────────────────────────────────────────────────────

/**
 * The `hub.challenge` handshake, shared by both webhooks.
 *
 * One verify token for both routes on purpose: it is one Meta app, the token
 * proves nothing about which product is calling, and a second env var would be
 * a second thing to get wrong at three in the morning.
 */
function handleWebhookHandshake(request: Request): Response {
  const searchParams = new URL(request.url).searchParams;
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.IG_WEBHOOK_VERIFY_TOKEN?.trim();

  if (
    mode === "subscribe" &&
    Boolean(expectedToken) &&
    verifyToken === expectedToken
  ) {
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

// Route 1 — GET: Meta Webhook Handshake / Challenge Verification
http.route({
  path: "/instagram/webhook",
  method: "GET",
  handler: httpAction(async (_ctx, request) => handleWebhookHandshake(request)),
});

/**
 * Ask for one post to be re-read, right now (F6, level 1).
 *
 * A comment is news about ONE object, and it is answered with a read of that
 * one object: three calls, debounced to at most one refresh per post per thirty
 * seconds. Never a whole-account sync — a lively morning would otherwise turn
 * every conversation into a rate limit.
 *
 * Failure is swallowed on purpose. The webhook's job is to answer Meta with a
 * 200; a scheduler that could not be reached is not a reason to make Meta retry
 * the whole delivery, and the two-minute poll picks the post up regardless.
 */
async function scheduleTargetedRefresh(
  ctx: ActionCtx,
  params: {
    provider: "meta_ig" | "meta_fb";
    accountId: string;
    mediaId: string;
  },
): Promise<void> {
  try {
    await ctx.scheduler.runAfter(0, internal.metaSync.refreshFromWebhook, params);
  } catch {
    // Level 2 will notice the post within two minutes either way.
  }
}

/**
 * The `messaging[]` half of a webhook, which Instagram and Facebook send in
 * exactly the same shape — a PSID where an IGSID would be.
 *
 * Handles inbound DMs, message echoes (sent from IG App), reactions, edits,
 * postbacks and quick-reply taps, routing them to the inbox store and automation engine.
 */
async function handleMessagingEvents(
  ctx: ActionCtx,
  params: {
    platform: "instagram" | "facebook";
    accountId: string;
    events: InstagramWebhookMessaging[];
  },
): Promise<void> {
  const { platform, accountId, events } = params;

  for (const event of events) {
    const senderId =
      typeof event.sender?.id === "string" ? event.sender.id : undefined;

    // 1. Reactions (message_reactions)
    const reaction = event?.reaction;
    if (reaction && typeof reaction === "object") {
      const mid = typeof reaction.mid === "string" ? reaction.mid : undefined;
      const action = reaction.action === "unreact" ? "unreact" : "react";
      const emoji =
        typeof reaction.reaction === "string"
          ? reaction.reaction
          : typeof reaction.emoji === "string"
            ? reaction.emoji
            : undefined;

      if (mid) {
        try {
          await ctx.runMutation(internal.instagramInboxStore.recordReaction, {
            platform,
            accountId,
            igsid: senderId || event.recipient?.id || "",
            mid,
            emoji,
            action,
            actorId: senderId || "",
            isOurs: senderId === accountId,
          });
        } catch {
          // Catch per-event
        }
      }
      continue;
    }

    // 2. Message Edits (message_edit)
    const messageEdit = event?.message_edit;
    if (messageEdit && typeof messageEdit === "object") {
      const mid =
        typeof messageEdit.mid === "string" ? messageEdit.mid : undefined;
      const text =
        typeof messageEdit.text === "string" ? messageEdit.text : undefined;

      if (mid && text !== undefined) {
        try {
          await ctx.runMutation(
            internal.instagramInboxStore.recordMessageEdit,
            {
              platform,
              accountId,
              mid,
              text,
              editedAt: event.timestamp || Date.now(),
            },
          );
        } catch {
          // Catch per-event
        }
      }
      continue;
    }

    // 3. Message Echoes (message_echoes — business sent from Instagram app or tool)
    const message = event?.message;
    if (message && message.is_echo === true) {
      const recipientId =
        typeof event.recipient?.id === "string"
          ? event.recipient.id
          : undefined;
      const mid = typeof message.mid === "string" ? message.mid : undefined;
      if (recipientId && mid) {
        try {
          const attachments = (message.attachments ?? []).flatMap((a) => {
            const url = a.payload?.url;
            const type = a.type ?? "image";
            if (!url && type !== "like_heart") return [];
            return [{ type, url, title: a.title }];
          });

          await ctx.runMutation(
            internal.instagramInboxStore.recordEchoMessage,
            {
              platform,
              accountId,
              igsid: recipientId,
              mid,
              text: message.text,
              attachments: attachments.length > 0 ? attachments : undefined,
              sentAt: event.timestamp || Date.now(),
            },
          );
        } catch {
          // Catch per-event
        }
      }
      continue;
    }

    // Nothing else arriving from the account itself is ours to react to.
    if (!senderId || senderId === accountId) continue;

    // 4. Postbacks (Button template taps)
    const postback = event?.postback;
    if (postback && typeof postback === "object") {
      const postbackMid =
        typeof postback.mid === "string" ? postback.mid : undefined;
      const postbackPayload =
        typeof postback.payload === "string" ? postback.payload : undefined;
      if (!postbackMid || !postbackPayload) continue;

      try {
        await ctx.runMutation(internal.orIngest.ingestButtonTap, {
          platform,
          accountId,
          mid: postbackMid,
          igsid: senderId,
          payload: postbackPayload,
          title:
            typeof postback.title === "string" ? postback.title : undefined,
        });
      } catch {
        // Catch per-row so one bad event cannot abort the rest
      }
      continue;
    }

    if (!message || typeof message !== "object" || message.is_deleted === true) {
      continue;
    }

    const mid = typeof message.mid === "string" ? message.mid : undefined;
    const text = typeof message.text === "string" ? message.text : "";
    if (!mid) continue;

    // 5. Inbound DM — Record to Inbox Store
    try {
      const attachments = (message.attachments ?? []).flatMap((a) => {
        const url = a.payload?.url;
        const type = a.type ?? "image";
        if (!url && type !== "like_heart") return [];
        return [{ type, url, title: a.title }];
      });

      await ctx.runMutation(
        internal.instagramInboxStore.recordInboundMessage,
        {
          platform,
          accountId,
          igsid: senderId,
          mid,
          text: text.length > 0 ? text : undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          shares: message.shares,
          story: message.story,
          isUnsupported: message.is_unsupported === true,
          sentAt: event.timestamp || Date.now(),
          replyToMid: message.reply_to?.mid,
        },
      );
    } catch {
      // Catch per-event
    }

    // 6. Quick Reply Tap check for automation engine
    const quickReplyPayload =
      typeof message.quick_reply?.payload === "string"
        ? message.quick_reply.payload
        : undefined;

    if (quickReplyPayload) {
      try {
        await ctx.runMutation(internal.orIngest.ingestButtonTap, {
          platform,
          accountId,
          mid,
          igsid: senderId,
          payload: quickReplyPayload,
          title: text.trim().length > 0 ? text : undefined,
        });
      } catch {
        // Catch per-row
      }
      continue;
    }

    // 7. Direct Message Keyword Match for automation engine
    if (text.trim().length === 0) continue;

    try {
      await ctx.runMutation(internal.orIngest.ingestDirectMessage, {
        platform,
        accountId,
        mid,
        igsid: senderId,
        text,
      });
    } catch {
      // Catch per-row so one bad event cannot abort the rest
    }
  }
}

// Route 2 — POST: Instagram Webhook Event Ingestion
//
// Two different arrays arrive on the same route: comments ride in on
// entry[].changes[], direct messages on entry[].messaging[].
http.route({
  path: "/instagram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!(await verifySignature(ctx, "instagram", raw, signature))) {
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: InstagramWebhookPayload;
    try {
      payload = JSON.parse(raw) as InstagramWebhookPayload;
    } catch {
      return new Response("ok", { status: 200 });
    }

    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const igUserId = typeof entry?.id === "string" ? entry.id : undefined;
      if (!igUserId) continue;

      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change?.field === "mentions") {
          const val = change?.value as
            | (InstagramWebhookCommentValue & {
                comment_id?: string;
                media_id?: string;
              })
            | undefined;
          if (!val || typeof val !== "object") continue;

          const commentId =
            typeof val.comment_id === "string" ? val.comment_id : undefined;
          const mediaId =
            typeof val.media_id === "string" ? val.media_id : undefined;
          const text = typeof val.text === "string" ? val.text : "";

          if (!mediaId && !commentId) continue;

          try {
            const recorded = await ctx.runMutation(
              internal.igMentionsStore.recordWebhookMention,
              {
                accountId: igUserId,
                commentId,
                mediaId: mediaId ?? "",
                text,
              },
            );

            if (recorded !== null) {
              await ctx.scheduler.runAfter(
                0,
                internal.igMentions.fetchMentionContext,
                {
                  mentionId: recorded.mentionId,
                  workspaceId: recorded.workspaceId,
                  igUserId: recorded.igUserId,
                  kind: recorded.kind,
                  commentId: recorded.commentId,
                  mediaId: recorded.mediaId,
                },
              );
            }
          } catch {
            // Catch per-row so one bad row cannot abort the rest
          }
          continue;
        }

        if (change?.field !== "comments") continue;

        const val = change?.value;
        if (!val || typeof val !== "object") continue;

        const commentId = typeof val.id === "string" ? val.id : undefined;
        const text = typeof val.text === "string" ? val.text : "";
        const fromId =
          typeof val.from?.id === "string" ? val.from.id : undefined;
        const commenterUsername =
          typeof val.from?.username === "string"
            ? val.from.username
            : undefined;
        const mediaId =
          typeof val.media?.id === "string" ? val.media.id : undefined;

        // SKIP the change when: no comment id, no from.id, or from.id === igUserId
        if (!commentId || !fromId || fromId === igUserId) {
          continue;
        }

        // Which thread this belongs to (V1). A reply carries `parent_id`; a
        // top-level comment simply has no such key. Without this the panel
        // showed every webhook-delivered reply as a new thread with a working
        // "Odgovori" button — and Instagram refuses a reply to a reply, so the
        // button could only ever fail.
        //
        // Absence is NOT read as proof of a top level: the row is marked
        // level-unknown and goes without a reply button until a sync says where
        // it sits. That sync is seconds away — the same webhook schedules a
        // re-read of this very post below.
        const parentId =
          typeof val.parent_id === "string" && val.parent_id.length > 0
            ? val.parent_id
            : undefined;
        const parentCommentId =
          parentId !== undefined && parentId !== commentId
            ? parentId
            : undefined;

        try {
          await ctx.runMutation(internal.orIngest.ingestComment, {
            platform: "instagram",
            accountId: igUserId,
            commentId,
            mediaId,
            parentCommentId,
            levelUnknown: parentCommentId === undefined,
            commenterId: fromId,
            commenterUsername,
            text,
          });
        } catch {
          // Catch per-row so one bad row cannot abort the rest
        }

        // Level 1 of the sync schedule (F6): go and re-read THIS post, and
        // nothing else. Scheduled rather than awaited because Meta retries — and
        // eventually unsubscribes — a webhook that answers slowly, and three
        // Graph reads are far too slow to do while it waits.
        if (mediaId) {
          await scheduleTargetedRefresh(ctx, {
            provider: "meta_ig",
            accountId: igUserId,
            mediaId,
          });
        }
      }

      const messagingEvents = [
        ...(Array.isArray(entry?.messaging) ? entry.messaging : []),
        ...(Array.isArray(entry?.standby) ? entry.standby : []),
      ];

      await handleMessagingEvents(ctx, {
        platform: "instagram",
        accountId: igUserId,
        events: messagingEvents,
      });
    }

    return new Response("ok", { status: 200 });
  }),
});

// Route 2b — GET: Facebook Page Webhook Handshake (F5)
//
// Its own path rather than a branch inside the Instagram route: Meta subscribes
// an OBJECT ("instagram" / "page") to a callback URL, and keeping one object
// per URL means a misconfigured subscription fails visibly in the dashboard
// instead of quietly delivering Page events to code expecting Instagram ones.
http.route({
  path: "/facebook/webhook",
  method: "GET",
  handler: httpAction(async (_ctx, request) => handleWebhookHandshake(request)),
});

// Route 2c — POST: Facebook Page Webhook Event Ingestion (F5)
http.route({
  path: "/facebook/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!(await verifySignature(ctx, "facebook", raw, signature))) {
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: FacebookWebhookPayload;
    try {
      payload = JSON.parse(raw) as FacebookWebhookPayload;
    } catch {
      return new Response("ok", { status: 200 });
    }

    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const pageId = typeof entry?.id === "string" ? entry.id : undefined;
      if (!pageId) continue;

      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change?.field !== "feed") continue;

        const val = change?.value;
        if (!val || typeof val !== "object") continue;

        // `feed` carries everything that happens on the Page — a new post, a
        // reaction, a share. Only a freshly added comment is ours.
        if (val.item !== "comment") continue;
        if (val.verb !== "add") continue;

        const commentId =
          typeof val.comment_id === "string" ? val.comment_id : undefined;
        const postId =
          typeof val.post_id === "string" ? val.post_id : undefined;
        const text = typeof val.message === "string" ? val.message : "";
        const fromId =
          typeof val.from?.id === "string" ? val.from.id : undefined;
        const fromName =
          typeof val.from?.name === "string" ? val.from.name : undefined;

        // A comment the Page itself wrote — including the public reply an
        // automation just posted — would otherwise trigger that same
        // automation again, and again.
        if (!commentId || !fromId || fromId === pageId) {
          continue;
        }

        // On a top-level comment `parent_id` is the POST; on a reply it is the
        // comment being replied to. That equality is the only way to tell the
        // two apart from the payload alone.
        const parentId =
          typeof val.parent_id === "string" ? val.parent_id : undefined;
        const parentCommentId =
          parentId !== undefined && parentId !== postId ? parentId : undefined;

        try {
          await ctx.runMutation(internal.orIngest.ingestComment, {
            platform: "facebook",
            accountId: pageId,
            commentId,
            mediaId: postId,
            parentCommentId,
            commenterId: fromId,
            commenterUsername: fromName,
            text,
          });
        } catch {
          // Catch per-row so one bad row cannot abort the rest
        }

        // Level 1 (F6), same as Instagram: this post, and nothing else.
        if (postId) {
          await scheduleTargetedRefresh(ctx, {
            provider: "meta_fb",
            accountId: pageId,
            mediaId: postId,
          });
        }
      }

      const messagingEvents = [
        ...(Array.isArray(entry?.messaging) ? entry.messaging : []),
        ...(Array.isArray(entry?.standby) ? entry.standby : []),
      ];

      await handleMessagingEvents(ctx, {
        platform: "facebook",
        accountId: pageId,
        events: messagingEvents,
      });
    }

    return new Response("ok", { status: 200 });
  }),
});

// Route 3 — GET: Tracked short-link redirect (/r/<slug>)
//
// Reached through the app's own domain: Next rewrites digital.enigmait.rs/r/:slug
// to this action (next.config.ts), and proxy.ts excludes /r/ from the auth
// middleware so an unauthenticated click is never bounced to /login.
http.route({
  pathPrefix: "/r/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const slug = new URL(request.url).pathname
      .slice("/r/".length)
      .split("/")[0]
      .trim()
      .toLowerCase();

    if (slug.length === 0) {
      return new Response("Link nije pronađen.", { status: 404 });
    }

    const userAgent = request.headers.get("user-agent");
    const countClick = !isBotUserAgent(userAgent);

    const result = await ctx.runMutation(internal.orLinks.registerClick, {
      slug,
      countClick,
      ipHash: countClick ? await hashClientIp(request) : undefined,
      userAgent: userAgent ?? undefined,
      referrer: request.headers.get("referer") ?? undefined,
    });

    if (result === null) {
      return new Response("Link nije pronađen.", { status: 404 });
    }

    // UTM tags ride into GA4 from here; ones already on the destination win.
    const target = appendEventId(
      appendUtm(result.destinationUrl, result.campaignSlug),
      result.eventId,
    );

    return new Response(null, {
      status: 302,
      headers: {
        Location: target,
        // Never let a CDN or browser serve this hop from cache — every click
        // has to reach the mutation to be counted.
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }),
});

// Route 4 — GET: Instagram picture proxy (/ig-media/<mediaId>[/<childId>])
//
// Instagram hands out SIGNED CDN links that expire, so a `media_url` saved at
// sync time renders as a broken image weeks later. Nothing displays the stored
// URL directly: <img> points here, and this route redirects to a link that is
// still valid — refetching one from Instagram when the stored one has aged out.
//
// A second path segment addresses ONE slide of a carousel. The slide's link is
// stored on the parent's `children`, and Instagram refreshes the whole edge in
// a single read — so a swiper that asks for five slides at once costs one
// upstream request, not five.
//
// The route is PUBLIC on purpose: it is read by <img> tags, which carry no auth
// header. That is safe — the path holds nothing but media IDs that are already
// public on Instagram, and the response says nothing about the workspace.
//
// It redirects and never streams the bytes: pushing image data through a Convex
// action would be slow and would burn resources for no gain.
//
// PUBLIC ALSO MEANS ANYONE (P2). A media id is readable off any permalink on
// the profile, so an unauthenticated caller decides how often this code runs.
// Exactly one situation may reach Instagram from here: a post WE ALREADY HOLD
// whose stored link has aged out. An id we do not have, or a carousel slide
// that is not in the stored `children`, is a 404 before a single Graph call —
// otherwise a loop over invented ids would spend the account's whole Meta
// allowance and take every sync down with it. And even the legitimate case is
// claimed for a minute at a time, so a hot image cannot be refreshed on repeat.

const IG_MEDIA_URL_TTL_MS = 12 * 60 * 60 * 1000; // refetch links older than 12h
const IG_MEDIA_CACHE_HEADER = "public, max-age=3600"; // 1h in the browser

/**
 * Cache header for a redirect to the STORED link on a path that could not
 * refresh it — no connection, the repeat guard said no, Instagram refused.
 *
 * The stored link is signed and past its TTL, so this is the branch where it is
 * MOST likely to be dead; an hour in the browser cache turns one bad moment
 * into an hour of broken pictures, and the refresh that would have fixed it
 * never gets asked for because nothing reaches the route (V2/6). A minute is
 * long enough to absorb a grid of thumbnails loading at once and short enough
 * that the next look is a fresh question.
 */
const IG_MEDIA_STALE_CACHE_HEADER = "public, max-age=60";

/**
 * How long one post is left alone after the proxy refreshed it (P2).
 *
 * Claimed in `metaTargetedSyncs` through the same `claimTargeted` mutation the
 * webhook refresh uses — the claim has to be a transaction, because a page
 * with twelve thumbnails on it makes twelve simultaneous requests and a
 * check-then-write would let all twelve through.
 *
 * The key is PREFIXED rather than the bare media id: sharing the webhook's row
 * would mean a thumbnail load silently suppressing the comment-driven refresh
 * of the same post for the next half minute.
 */
const IG_MEDIA_REFRESH_CLAIM_MS = 60 * 1000;

/** How often a 404 from the proxy may wake the daily deletion sweep. */
const DELETION_SWEEP_CLAIM_MS = 60 * 60 * 1000;

function igMediaRedirect(target: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": IG_MEDIA_CACHE_HEADER,
    },
  });
}

/** A JSON field is only a URL if it is a non-empty string. */
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Same redirect, for a link we could not refresh and do not vouch for. */
function igMediaStaleRedirect(target: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": IG_MEDIA_STALE_CACHE_HEADER,
    },
  });
}

function igMediaError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

http.route({
  pathPrefix: "/ig-media/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const segments = new URL(request.url).pathname
      .slice("/ig-media/".length)
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    // `decodeURIComponent` throws a `URIError` on a malformed escape, and
    // anyone may type one: `GET /ig-media/%zz` used to be a 500 (V2/6). A path
    // that cannot be decoded names no post, which is a 404.
    let mediaId: string;
    let childId: string | undefined;
    try {
      mediaId = segments[0] ? decodeURIComponent(segments[0]) : "";
      childId = segments[1] ? decodeURIComponent(segments[1]) : undefined;
    } catch {
      return igMediaError("Objava nije pronađena.", 404);
    }
    if (mediaId.length === 0) {
      return igMediaError("Objava nije pronađena.", 404);
    }

    const media = await ctx.runQuery(internal.instagramStore.getMediaForProxy, {
      mediaId,
    });
    if (media === null) {
      return igMediaError("Objava nije pronađena.", 404);
    }
    if (media.deletedAt !== undefined) {
      return igMediaError("Objava je obrisana.", 410);
    }

    // A slide id that is not in the stored `children` is a slide we do not
    // have, and asking Instagram about it would answer the same thing at the
    // cost of a Graph call — a call an anonymous caller could ask for in a
    // loop, forever, because the answer is never written down. 404 here, and
    // nothing below this line runs (P2).
    if (
      childId !== undefined &&
      !(media.children ?? []).some((child) => child.id === childId)
    ) {
      return igMediaError("Slika nije pronađena.", 404);
    }

    // One slide, or the whole post — the rest of the route is identical.
    const resolve = (
      mediaUrl?: string,
      thumbnailUrl?: string,
      children?: StoredMediaChild[],
    ): string | undefined =>
      childId === undefined
        ? pickDisplayUrl(media.mediaType, mediaUrl, thumbnailUrl, children)
        : pickChildDisplayUrl(children, childId);

    const storedUrl = resolve(
      media.mediaUrl,
      media.thumbnailUrl,
      media.children,
    );
    const isFresh = Date.now() - media.urlSyncedAt < IG_MEDIA_URL_TTL_MS;
    if (isFresh) {
      // Within the TTL the stored answer is the answer, including when the
      // stored answer is "there is no picture". Refetching on a fresh record
      // would be asking the same question twice a second for as long as
      // somebody kept requesting it. This is the one branch that serves a
      // stored link we DO vouch for, so it keeps the full cache header.
      return storedUrl
        ? igMediaRedirect(storedUrl)
        : igMediaError("Slika nije dostupna.", 404);
    }

    // Stale — ask Instagram for a fresh link. Without a live connection there
    // is nothing to ask with, so the stale link is the best that is left.
    if (!media.encryptedCredentials) {
      return storedUrl
        ? igMediaStaleRedirect(storedUrl)
        : igMediaError("Slika nije dostupna.", 404);
    }

    const staleAnswer = (): Response =>
      storedUrl
        ? igMediaStaleRedirect(storedUrl)
        : igMediaError("Slika nije dostupna.", 404);

    // A refresh that reached Instagram and failed arms the growing backoff
    // (R1/2a), then serves what we have. This is the branch the attack lives in:
    // every failure has to buy silence.
    const failedRefresh = async (status: number): Promise<Response> => {
      await ctx.runMutation(internal.instagramStore.recordMediaUrlFailure, {
        id: media._id,
      });
      return storedUrl
        ? igMediaStaleRedirect(storedUrl)
        : igMediaError("Slika nije dostupna.", status);
    };

    // Recently failed — do not hammer Instagram (R1/2a). While Meta refuses, a
    // failed refresh must buy MORE silence than a success would, not the bare
    // 60 s the per-media claim gives it.
    const nowMs = Date.now();
    if (
      media.mediaUrlAttemptedAt !== undefined &&
      media.mediaUrlBackoffMs !== undefined &&
      nowMs - media.mediaUrlAttemptedAt < media.mediaUrlBackoffMs
    ) {
      return staleAnswer();
    }

    // The gate, read BEFORE the call (R1/2b). This route used to report its own
    // spend but never honour the gate, so when the schedulers stood down the
    // proxy's traffic kept the allowance pinned at 100 % and blocked recovery.
    // Not "ok" now means: serve what we have, spend nothing.
    const gate = await readGate(ctx, media.workspaceId);
    if (!allowsBackground(gate)) {
      return staleAnswer();
    }

    // The blunt repeat guard. Twelve thumbnails in one grid are one refresh,
    // not twelve — and a caller hammering one expired id gets the stale link
    // (or a 404) rather than a Graph call per request.
    const claimed: boolean = await ctx.runMutation(
      internal.metaSyncStore.claimTargeted,
      {
        workspaceId: media.workspaceId,
        provider: "meta_ig",
        mediaId: `proxy:${mediaId}`,
        minIntervalMs: IG_MEDIA_REFRESH_CLAIM_MS,
      },
    );
    if (!claimed) {
      return staleAnswer();
    }

    // The per-route hourly ceiling (R1/2c). The per-media claim above throttles
    // ONE post; this bounds the workspace's whole outbound-call rate from this
    // route, so no set of ids can turn it into a Graph-call amplifier. Checked
    // after the claim so a debounced hot image does not spend a slot.
    const withinCap: boolean = await ctx.runMutation(
      internal.publicRouteLimit.claimRouteCall,
      {
        workspaceId: media.workspaceId,
        route: "ig-media",
        limit: IG_MEDIA_HOURLY_CAP,
        windowMs: ROUTE_WINDOW_MS,
      },
    );
    if (!withinCap) {
      return staleAnswer();
    }

    let token: string;
    try {
      token = await decryptCredentials(media.encryptedCredentials);
    } catch {
      return failedRefresh(502);
    }

    const upperType = media.mediaType.toUpperCase();
    const isCarousel =
      upperType.includes("CAROUSEL") || upperType.includes("ALBUM");
    // A slide request always needs the edge back, whatever the parent's type
    // says — that edge is the only place its link lives.
    const fields =
      isCarousel || childId !== undefined
        ? "media_url,thumbnail_url,children{id,media_type,media_url,thumbnail_url}"
        : "media_url,thumbnail_url";

    // Through the tracker like every other Meta call (P2): this route is one of
    // the app's busiest callers, and a gate that cannot see it is a gate that
    // reports "ok" while the allowance is gone.
    const tracker = createUsageTracker();
    let res: Response;
    try {
      res = await tracker.fetch(buildMediaFieldsUrl(mediaId, fields, token));
    } catch {
      return failedRefresh(502);
    } finally {
      await tracker.flush(ctx, media.workspaceId);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (isMissingObjectError(res.status, body)) {
        // NOT a deletion verdict, and this route may not write one (P2).
        //
        // Meta answers code 100 / subcode 33 for a permission problem and for a
        // token caught mid-rotation just as readily as for a post that is
        // genuinely gone. This route is public: one such answer used to be
        // enough for anyone to have a live post struck through in the grid and
        // 410'd to every visitor until the next full sync six hours later.
        //
        // So it asks the pass that OWNS that verdict to go and look. The daily
        // sweep re-probes each suspect on its own before writing anything, and
        // it stands down on the rate-limit gate — and the claim keeps a stream
        // of 404s from waking it more than once an hour.
        const sweep: boolean = await ctx.runMutation(
          internal.metaSyncStore.claimTargeted,
          {
            workspaceId: media.workspaceId,
            provider: "meta_ig",
            mediaId: "proxy:deletion-sweep",
            minIntervalMs: DELETION_SWEEP_CLAIM_MS,
          },
        );
        if (sweep) {
          try {
            await ctx.scheduler.runAfter(0, internal.metaSync.igDeletionCheck, {});
          } catch {
            // The sweep runs daily regardless; this only makes it sooner.
          }
        }
        // Arm the backoff too (R1/2a): a loop over a since-deleted id that has
        // not yet been 410'd is exactly the traffic the ceiling is for.
        return failedRefresh(404);
      }
      // Rate limit, expired token, transient failure — the stale link may well
      // still load, so it beats showing nothing.
      return failedRefresh(502);
    }

    // The last unguarded `await` on this route (V2/6). A 200 whose body is not
    // JSON — an edge error page, a rate-limit interstitial — used to throw out
    // of the handler as a 500 instead of taking the fallback every other branch
    // already takes.
    let json: RawMediaFieldsResponse;
    try {
      json = (await res.json()) as RawMediaFieldsResponse;
    } catch {
      return failedRefresh(502);
    }

    // And the parsed body is still whatever Instagram felt like sending: a
    // field that is not a string must never reach a `v.string()` validator,
    // which would fail the mutation and take the request down with it.
    const mediaUrl = asString(json.media_url);
    const thumbnailUrl = asString(json.thumbnail_url);
    const children = normalizeMediaChildren(json.children);
    await ctx.runMutation(internal.instagramStore.saveMediaUrls, {
      id: media._id,
      mediaUrl,
      thumbnailUrl,
      children,
    });

    const freshUrl = resolve(mediaUrl, thumbnailUrl, children);
    if (!freshUrl) {
      return igMediaError("Slika nije dostupna.", 404);
    }
    return igMediaRedirect(freshUrl);
  }),
});

// Route 5 — GET: Instagram upload source (/ig-upload/<storageId>)
//
// Instagram never takes bytes from us. A container is created by handing it a
// PUBLIC address (`image_url` / `video_url`) which Instagram then fetches for
// itself — so between "operator picked a file" and "post is live" that file has
// to be reachable from the open internet. This route is that address.
//
// The storage id is unguessable, the file is there for minutes, and the whole
// point of the exercise is that the picture is about to be published anyway.
// `Cache-Control: private` keeps it out of shared caches for the short while it
// exists, and the file is deleted the moment the post goes out
// (convex/instagramPublishStore.ts).
//
// What the id is NOT is authorisation (P2). The route used to hand back
// whatever `ctx.storage.get` returned, which made it a public reader of the
// whole storage bucket — harmless only for as long as nothing but publish
// uploads ever lived there, and silently catastrophic the first time something
// else did. So the id now has to name a file that a LIVE publish job is
// pointing at (convex/igUploadAccess.ts); anything else is a 404.
//
// Unlike /ig-media/ this one SERVES the bytes rather than redirecting: there is
// nowhere to redirect to, the file lives here.

const IG_UPLOAD_CACHE_HEADER = "private, max-age=600";

/**
 * `Range` is handled because Meta's video fetcher asks for one.
 *
 * A single `Content-Length` response works for a picture and fails for a
 * gigabyte of video: the fetcher opens with a small ranged request, and a
 * server that answers 200-with-everything to `Range:` is treated as broken.
 * Only the single-range form is parsed — that is the only form anyone sends.
 */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  // "bytes=-500" means the LAST 500 bytes, not "up to byte 500".
  const start = rawStart === "" ? Math.max(0, size - Number(rawEnd)) : Number(rawStart);
  const end = rawStart === "" ? size - 1 : rawEnd === "" ? size - 1 : Number(rawEnd);

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

http.route({
  pathPrefix: "/ig-upload/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const raw = new URL(request.url).pathname
      .slice("/ig-upload/".length)
      .split("/")[0]
      .trim();
    if (raw.length === 0) {
      return new Response("Fajl nije pronađen.", { status: 404 });
    }

    const storageId = decodeURIComponent(raw) as Id<"_storage">;

    // The authorisation, and it comes BEFORE the bytes are touched. One 404
    // covers "no such file", "not owned by any job", "files already swept" and
    // "that post is out" — telling an anonymous caller which of those it was
    // would be telling it which storage ids exist.
    let authorized: { contentType: string | null } | null;
    try {
      authorized = await ctx.runQuery(internal.igUploadAccess.authorizeUpload, {
        storageId,
      });
    } catch {
      // A malformed id fails the validator; that is a 404, not a 500.
      return new Response("Fajl nije pronađen.", { status: 404 });
    }
    if (authorized === null) {
      return new Response("Fajl nije pronađen.", { status: 404 });
    }

    const blob: Blob | null = await ctx.storage.get(storageId);
    if (blob === null) {
      return new Response("Fajl nije pronađen.", { status: 404 });
    }

    // Convex fills `blob.type` from the content type recorded at upload, so the
    // metadata read is only for the case where it did not — a file POSTed
    // without the header. Meta refuses a wrong type outright, so it is worth
    // carrying the stored value rather than guessing from the bytes; the
    // authorisation read already fetched it.
    const contentType =
      blob.type.length > 0
        ? blob.type
        : (authorized.contentType ?? "application/octet-stream");

    const size = blob.size;
    const range = parseRange(request.headers.get("range"), size);

    if (range === null) {
      return new Response(blob, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(size),
          "Accept-Ranges": "bytes",
          "Cache-Control": IG_UPLOAD_CACHE_HEADER,
        },
      });
    }

    const slice = blob.slice(range.start, range.end + 1);
    return new Response(slice, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": IG_UPLOAD_CACHE_HEADER,
      },
    });
  }),
});

export default http;
