import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// Next.js 16 renamed Middleware → Proxy. This file replaces `middleware.ts`
// (see node_modules/next/dist/docs/.../16-proxy.md). Runs on the Node runtime.

const isSignInPage = createRouteMatcher(["/login"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authed = await convexAuth.isAuthenticated();

  // The two rules are disjoint (login vs everything-else), so no redirect loop.
  if (isSignInPage(request) && authed) {
    return nextjsMiddlewareRedirect(request, "/");
  }
  if (!isSignInPage(request) && !authed) {
    return nextjsMiddlewareRedirect(request, "/login");
  }
});

export const config = {
  // Run on everything except static files and _next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
