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

/**
 * A second argument addresses ONE slide of a carousel: `/ig-media/<mediaId>/
 * <childId>`. The route reads the slide's link off the parent's `children`, so
 * a whole carousel still costs Instagram a single refresh.
 */
export function igMediaSrc(
  mediaId: string,
  childId?: string,
): string | undefined {
  if (!CONVEX_SITE_URL) {
    warnMissingSiteUrl();
    return undefined;
  }
  if (!mediaId) return undefined;
  const base = `${CONVEX_SITE_URL}/ig-media/${encodeURIComponent(mediaId)}`;
  return childId ? `${base}/${encodeURIComponent(childId)}` : base;
}

/**
 * A build without either public URL renders every post as "Instagram has no
 * picture" — a real state of the data, and indistinguishable from this one
 * unless somebody says so out loud (V2/7). `NEXT_PUBLIC_*` is inlined at BUILD
 * time, so this is a deployment mistake nobody can fix by restarting anything.
 *
 * Once per session: a grid of thirty cards asking thirty times would bury the
 * one line that matters.
 */
let warned = false;

function warnMissingSiteUrl(): void {
  if (warned) return;
  warned = true;
  const message =
    "igMediaSrc: ni NEXT_PUBLIC_CONVEX_SITE_URL ni NEXT_PUBLIC_CONVEX_URL nisu " +
    "ugradjeni u build, pa se nijedna slika objave nece prikazati. " +
    "Postavi jednu od njih i ponovi build.";
  if (process.env.NODE_ENV === "development") {
    // Loud in development, where it is a five-minute fix; a warning in
    // production, where crashing the whole screen over thumbnails would be a
    // worse outcome than missing thumbnails.
    console.error(message);
  } else {
    console.warn(message);
  }
}
