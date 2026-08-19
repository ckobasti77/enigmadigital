import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
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

// ── Webhook Routes ───────────────────────────────────────────────────────────

// Route 1 — GET: Meta Webhook Handshake / Challenge Verification
http.route({
  path: "/instagram/webhook",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
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
  }),
});

// Route 2 — POST: Meta Webhook Event Ingestion
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
            igUserId,
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

      const messagingEvents = Array.isArray(entry?.messaging)
        ? entry.messaging
        : [];
      for (const event of messagingEvents) {
        const senderId =
          typeof event.sender?.id === "string" ? event.sender.id : undefined;
        // Nothing arriving from the account itself is ours to react to.
        if (!senderId || senderId === igUserId) continue;

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
              igUserId,
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
              igUserId,
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
            igUserId,
            mid,
            igsid: senderId,
            text,
          });
        } catch {
          // Catch per-row so one bad event cannot abort the rest
        }
      }
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

export default http;
