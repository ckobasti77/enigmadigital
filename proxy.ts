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
  // Run on everything except static files, _next internals, the Meta OAuth
  // callbacks, the /r/ short-link redirects, and the privacy policy. Short
  // links are clicked from Instagram DMs by people who are not signed in
  // — running auth on them would bounce every click to /login and lose the
  // destination.
  //
  // `privacy` is the same kind of exception, and it was missed (P3). The page
  // sits outside the `(app)` route group precisely so that an auditor can read
  // it without an account — its own file comment says so — but this matcher
  // caught it anyway and redirected every anonymous visit to /login. For a
  // YouTube API review that is not cosmetic: the reviewer opens the privacy
  // policy link, sees a sign-in screen, and that is one of the most common
  // reasons an application is turned down.
  //
  // Written as `privacy(?:$|/)` rather than a bare `privacy` so the exception
  // covers exactly /privacy and anything beneath it, and cannot quietly open a
  // future /privacy-settings route along with it.
  //
  // BOTH callbacks are FULLY excluded (not just early-returned in
  // the handler) because convexAuthNextjsMiddleware itself intercepts any
  // request carrying a `?code=` query param and tries to verify it as a
  // Convex Auth sign-in code — swallowing Meta's authorization code and
  // redirecting before our route handler can run. Each callback route performs
  // the whole exchange server-side via the one-time `state` nonce, so it needs
  // no auth context from the middleware.
  matcher: [
    "/((?!.*\\..*|_next|api/auth/callback/instagram|api/auth/callback/facebook|api/auth/callback/youtube|r/|privacy(?:$|/)).*)",
    "/",
    // Two lookaheads rather than one alternation: Next refuses a capturing
    // group inside a matcher, and `(instagram|facebook)` is one.
    "/(api|trpc)((?!/auth/callback/instagram)(?!/auth/callback/facebook)(?!/auth/callback/youtube).*)",
  ],
};
