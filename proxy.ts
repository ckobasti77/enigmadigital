import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// Next.js 16 renamed Middleware → Proxy. This file replaces `middleware.ts`
// (see node_modules/next/dist/docs/.../16-proxy.md). Runs on the Node runtime.

const isSignInPage = createRouteMatcher(["/login"]);

// OAuth callback endpoints must stay reachable WITHOUT a session: the
// provider (Instagram) redirects here with a one-time code, and the auth
// cookie may be absent on that cross-site navigation. The route itself only
// forwards the code to the app — it performs no privileged work.
const isPublicApiRoute = createRouteMatcher(["/api/auth/callback/instagram"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (isPublicApiRoute(request)) {
    return; // let the route handler run
  }

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
  // Run on everything except static files and _next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
