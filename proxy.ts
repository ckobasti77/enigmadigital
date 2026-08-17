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
    // Preserve an in-flight Instagram OAuth code across the login redirect so
    // the login page can park it (localStorage) and Settings can finish the
    // exchange after sign-in.
    const url = new URL(request.url);
    const igCode = url.searchParams.get("ig_code");
    const target = igCode
      ? `/login?ig_code=${encodeURIComponent(igCode)}`
      : "/login";
    return nextjsMiddlewareRedirect(request, target);
  }
});

export const config = {
  // Run on everything except static files, _next internals, and the Instagram
  // OAuth callback. The callback is FULLY excluded (not just early-returned in
  // the handler) because convexAuthNextjsMiddleware itself intercepts any
  // request carrying a `?code=` query param and tries to verify it as a
  // Convex Auth sign-in code — swallowing Instagram's authorization code and
  // redirecting before our route handler can run. The callback route performs
  // the whole exchange server-side via the one-time `state` nonce, so it needs
  // no auth context from the middleware.
  matcher: [
    "/((?!.*\\..*|_next|api/auth/callback/instagram).*)",
    "/",
    "/(api|trpc)((?!/auth/callback/instagram).*)",
  ],
};
