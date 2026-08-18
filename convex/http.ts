import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { appendUtm, isBotUserAgent } from "./lib/orLink";

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

interface InstagramWebhookEntry {
  id?: string;
  time?: number;
  changes?: InstagramWebhookChange[];
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

// Route 2 — POST: Meta Comments Webhook Event Ingestion
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

export default http;
