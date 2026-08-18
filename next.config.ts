import type { NextConfig } from "next";

// Short links must be served from the app's own domain (digital.enigmait.rs) —
// a raw *.convex.site URL inside an Instagram DM reads as spam. This rewrite is
// that hop: /r/<slug> is proxied to the Convex HTTP action, which logs the
// click and 302s on to the destination with UTM tags attached.
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim().replace(
  /\/+$/,
  "",
);

const nextConfig: NextConfig = {
  async rewrites() {
    if (!convexSiteUrl) {
      return [];
    }
    return [
      {
        source: "/r/:slug",
        destination: `${convexSiteUrl}/r/:slug`,
      },
    ];
  },
};

export default nextConfig;
