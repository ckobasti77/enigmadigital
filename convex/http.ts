import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { appendUtm, isBotUserAgent } from "./lib/orLink";
import { decryptCredentials } from "./lib/crypto";
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
 * Instagram and the Facebook route, so it is the same secret and the same
 * digest — and a second copy of a signature check is the kind of duplication
 * that gets fixed in one place and stays broken in the other.
 */
async function verifySignature(
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

  const candidateSecrets: string[] = [];
  const metaSecret = process.env.META_APP_SECRET?.trim();
  if (metaSecret) candidateSecrets.push(metaSecret);
  const igSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (igSecret) candidateSecrets.push(igSecret);

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
}

interface InstagramWebhookChange {
  field?: string;
  value?: InstagramWebhookCommentValue;
}

interface InstagramWebhookQuickReply {
  payload?: string;
}

interface InstagramWebhookMessage {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  is_deleted?: boolean;
  // Present when the message is a tapped quick reply rather than typed text.
  quick_reply?: InstagramWebhookQuickReply;
}

interface InstagramWebhookPostback {
  mid?: string;
  title?: string;
  payload?: string;
}

interface InstagramWebhookMessaging {
  sender?: InstagramWebhookFrom;
  recipient?: InstagramWebhookFrom;
  timestamp?: number;
  message?: InstagramWebhookMessage;
  postback?: InstagramWebhookPostback;
}

interface InstagramWebhookEntry {
  id?: string;
  time?: number;
  changes?: InstagramWebhookChange[];
  messaging?: InstagramWebhookMessaging[];
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
 * The `messaging[]` half of a webhook, which Instagram and Facebook send in
 * exactly the same shape — a PSID where an IGSID would be.
 *
 * Three different things arrive here and only one of them is a message to
 * keyword-match: a button-template tap comes as its own `postback` event with
 * no `message` at all, and a quick-reply tap comes as an ordinary message
 * carrying the payload we minted. Both are taps, and both go to the tap
 * ingest rather than to the matcher.
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
    // Nothing arriving from the account itself is ours to react to.
    if (!senderId || senderId === accountId) continue;

    // A button-template button comes back as its own event, with no
    // `message` on it at all — so it has to be handled before that check.
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

    const message = event?.message;
    if (!message || typeof message !== "object") continue;

    // is_echo marks a message the BUSINESS sent, echoed back to us.
    if (message.is_echo === true || message.is_deleted === true) continue;

    const mid = typeof message.mid === "string" ? message.mid : undefined;
    const text = typeof message.text === "string" ? message.text : "";
    if (!mid) continue;

    // A tapped quick reply arrives as an ordinary message carrying the
    // payload we minted. It is a tap, not something to keyword-match.
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
          // The chip's own label rides along as the message text.
          title: text.trim().length > 0 ? text : undefined,
        });
      } catch {
        // Catch per-row so one bad event cannot abort the rest
      }
      continue;
    }

    // SKIP when there is nothing to match a keyword against (attachment /
    // reaction only).
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

    if (!(await verifySignature(raw, signature))) {
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

        try {
          await ctx.runMutation(internal.orIngest.ingestComment, {
            platform: "instagram",
            accountId: igUserId,
            commentId,
            mediaId,
            commenterId: fromId,
            commenterUsername,
            text,
          });
        } catch {
          // Catch per-row so one bad row cannot abort the rest
        }
      }

      await handleMessagingEvents(ctx, {
        platform: "instagram",
        accountId: igUserId,
        events: Array.isArray(entry?.messaging) ? entry.messaging : [],
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

    if (!(await verifySignature(raw, signature))) {
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
      }

      await handleMessagingEvents(ctx, {
        platform: "facebook",
        accountId: pageId,
        events: Array.isArray(entry?.messaging) ? entry.messaging : [],
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
    const target = appendUtm(result.destinationUrl, result.campaignSlug);

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

const IG_MEDIA_URL_TTL_MS = 12 * 60 * 60 * 1000; // refetch links older than 12h
const IG_MEDIA_CACHE_HEADER = "public, max-age=3600"; // 1h in the browser

function igMediaRedirect(target: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": IG_MEDIA_CACHE_HEADER,
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

    const mediaId = segments[0] ? decodeURIComponent(segments[0]) : "";
    const childId = segments[1] ? decodeURIComponent(segments[1]) : undefined;
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
    if (storedUrl && isFresh) {
      return igMediaRedirect(storedUrl);
    }

    // Stale (or never stored) — ask Instagram for a fresh link. Without a live
    // connection there is nothing to ask with, so the stale link is the best
    // that is left.
    if (!media.encryptedCredentials) {
      return storedUrl
        ? igMediaRedirect(storedUrl)
        : igMediaError("Slika nije dostupna.", 404);
    }

    let token: string;
    try {
      token = await decryptCredentials(media.encryptedCredentials);
    } catch {
      return storedUrl
        ? igMediaRedirect(storedUrl)
        : igMediaError("Slika nije dostupna.", 502);
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

    let res: Response;
    try {
      res = await fetch(buildMediaFieldsUrl(mediaId, fields, token));
    } catch {
      return storedUrl
        ? igMediaRedirect(storedUrl)
        : igMediaError("Slika nije dostupna.", 502);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (isMissingObjectError(res.status, body)) {
        await ctx.runMutation(internal.instagramStore.markMediaDeleted, {
          id: media._id,
        });
        return igMediaError("Objava je obrisana.", 410);
      }
      // Rate limit, expired token, transient failure — the stale link may well
      // still load, so it beats showing nothing.
      return storedUrl
        ? igMediaRedirect(storedUrl)
        : igMediaError("Slika nije dostupna.", 502);
    }

    const json = (await res.json()) as RawMediaFieldsResponse;
    const children = normalizeMediaChildren(json.children);
    await ctx.runMutation(internal.instagramStore.saveMediaUrls, {
      id: media._id,
      mediaUrl: json.media_url,
      thumbnailUrl: json.thumbnail_url,
      children,
    });

    const freshUrl = resolve(json.media_url, json.thumbnail_url, children);
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
// The storage id is the only protection, and it is enough: it is unguessable,
// the file is there for minutes, and the whole point of the exercise is that
// the picture is about to be published anyway. `Cache-Control: private` keeps
// it out of shared caches for the short while it exists, and the file is
// deleted the moment the post goes out (convex/instagramPublishStore.ts).
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

    let blob: Blob | null;
    try {
      blob = await ctx.storage.get(storageId);
    } catch {
      // A malformed id lands here rather than as a 500.
      return new Response("Fajl nije pronađen.", { status: 404 });
    }
    if (blob === null) {
      return new Response("Fajl nije pronađen.", { status: 404 });
    }

    // Convex fills `blob.type` from the content type recorded at upload, so the
    // metadata read is only for the case where it did not — a file POSTed
    // without the header. Meta refuses a wrong type outright, so this is worth
    // one extra read rather than a guess from the bytes.
    const contentType =
      blob.type.length > 0
        ? blob.type
        : ((await ctx.runQuery(
            internal.instagramPublishStore.getUploadContentType,
            { storageId },
          )) ?? "application/octet-stream");

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
