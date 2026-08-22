/**
 * Pure helpers for OpenReply tracked short links.
 * No Convex imports.
 */

/**
 * Public origin the short links live on — the app's own domain
 * (https://digital.enigmait.rs). Deliberately NOT CONVEX_SITE_URL: a raw
 * *.convex.site link inside an Instagram DM reads as spam. Next rewrites
 * /r/:slug through to the Convex HTTP action (see next.config.ts).
 *
 * Returns null when nothing is configured, which makes callers fall back to
 * sending the raw destination link untracked rather than a broken one.
 */
export function shortLinkOrigin(): string | null {
  const raw =
    process.env.OR_SHORT_LINK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL;
  const trimmed = raw?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : null;
}

const SLUG_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const SLUG_LENGTH = 7;
// Largest multiple of 36 that fits in a byte — bytes at or above it are
// rejected so every character is uniformly distributed (no modulo bias).
const SLUG_BYTE_CEILING = 252;

/** 7-char lowercase base36 slug from crypto.getRandomValues. */
export function generateSlug(): string {
  let slug = "";
  while (slug.length < SLUG_LENGTH) {
    const bytes = new Uint8Array(SLUG_LENGTH);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= SLUG_BYTE_CEILING) continue;
      slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
      if (slug.length === SLUG_LENGTH) break;
    }
  }
  return slug;
}

/**
 * Append UTM tags without clobbering ones already present on the URL.
 * utm_source=instagram, utm_medium=dm, utm_campaign=<campaignSlug>.
 * Existing values for those keys WIN (never overwrite).
 * Returns the input unchanged if it is not a parseable URL.
 */
export function appendUtm(destinationUrl: string, campaignSlug: string): string {
  let url: URL;
  try {
    url = new URL(destinationUrl);
  } catch {
    return destinationUrl;
  }

  const tags: Record<string, string> = {
    utm_source: "instagram",
    utm_medium: "dm",
    utm_campaign: campaignSlug,
  };

  for (const [key, value] of Object.entries(tags)) {
    if (value.length === 0) continue;
    if (url.searchParams.has(key)) continue;
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * Append the CAPI event_id to the destination URL as `eid`, so the Pixel on the
 * landing page can read it and send the SAME event_id in its browser event —
 * letting Meta deduplicate the server (CAPI) and browser (Pixel) hit into one.
 *
 * `eventId` undefined → return the URL UNCHANGED (no CAPI event was recorded, so
 * there is nothing to dedup against; an empty `eid` would hand the Pixel a false
 * key). A non-parseable URL is returned unchanged too, same as appendUtm.
 */
export function appendEventId(url: string, eventId: string | undefined): string {
  if (eventId === undefined) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  parsed.searchParams.set("eid", eventId);
  return parsed.toString();
}

const BOT_MARKERS = [
  "bot",
  "crawler",
  "spider",
  "slurp",
  "facebookexternalhit",
  "preview",
  "headless",
  "curl",
  "wget",
  "python-requests",
];

/** True for obvious crawlers/preview bots that must not count as clicks. */
export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const folded = userAgent.toLowerCase();
  return BOT_MARKERS.some((marker) => folded.includes(marker));
}

/**
 * Formats fbclid into Meta fbc cookie string: "fb.1.<timestampMs>.<fbclid>"
 */
export function formatFbc(
  fbclid: string,
  timestampMs: number = Date.now(),
): string {
  const clean = fbclid.trim();
  if (!clean) return "";
  return `fb.1.${timestampMs}.${clean}`;
}

/**
 * Extracts fbclid parameter from a URL or Referer header string.
 */
export function extractFbclidFromUrl(urlStr?: string): string | undefined {
  if (!urlStr) return undefined;
  try {
    const url = new URL(urlStr);
    const fbclid = url.searchParams.get("fbclid");
    return fbclid ? fbclid.trim() : undefined;
  } catch {
    const match = urlStr.match(/[?&]fbclid=([^&#]+)/);
    return match ? decodeURIComponent(match[1]).trim() : undefined;
  }
}

