/**
 * Source URL for an Instagram post picture.
 *
 * Instagram's own CDN links are signed and expire, so nothing renders them
 * directly. This points at the public `/ig-media/<mediaId>` route on the Convex
 * HTTP endpoint (convex/http.ts), which redirects to a link that is still valid
 * and refetches one from Instagram when the stored link has aged out.
 *
 * The absolute site URL is used rather than a same-origin path: the route has
 * to stay reachable without the app's auth proxy in front of it.
 */
const CONVEX_SITE_URL = (
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  // Fallback for deployments that only set the client URL: the HTTP endpoint is
  // the same deployment on `.convex.site`.
  process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".convex.cloud", ".convex.site") ??
  ""
)
  .trim()
  .replace(/\/+$/, "");

export function igMediaSrc(mediaId: string): string | undefined {
  if (!CONVEX_SITE_URL || !mediaId) return undefined;
  return `${CONVEX_SITE_URL}/ig-media/${encodeURIComponent(mediaId)}`;
}
