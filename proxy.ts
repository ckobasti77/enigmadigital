import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { api } from "@/convex/_generated/api";
import { napraviRazresivac } from "@/lib/panel-domen";
import { KOLACIC_PROJEKAT, odluciRutu } from "@/lib/rutiranje";
import { resolveServerConvexUrl } from "@/lib/server-convex-url";

// Next.js 16 renamed Middleware → Proxy. This file replaces `middleware.ts`
// (see node_modules/next/dist/docs/.../16-proxy.md). Runs on the Node runtime.

const isSignInPage = createRouteMatcher(["/login"]);

// Domen → projekat panela (PROJEKTI-PLAN §6, P5). Lokalni host je hub bez
// upita; odgovor se pamti 60 s po hostu; greška ili istek upita = hub (prijava
// i članstvo i dalje važe, pa hub ništa ne otvara).
const razresiPanel = napraviRazresivac({
  dohvati: async (host) => {
    const url = resolveServerConvexUrl();
    if (!url.ok) throw new Error(url.logDetail);
    const r = await fetchQuery(api.projekti.razresiDomen, { host }, { url: url.url });
    return r?.slug ?? null;
  },
});

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  // Razvojni prikaz sa sintetičkim podacima (A1 §6, `scripts/ux-snapshots.mjs`):
  // van produkcije se `/<ruta>?ux=1` prepisuje na `/dev-ux/<ruta>`, pa
  // `usePathname()` i dalje vidi pravu putanju (naslov u gornjoj traci,
  // aktivna stavka navigacije). U produkciji ovaj blok ne postoji, a sama
  // ruta `app/dev-ux` tamo vraća 404 — dva zasebna osigurača.
  if (
    process.env.NODE_ENV !== "production" &&
    request.nextUrl.searchParams.get("ux") === "1" &&
    !request.nextUrl.pathname.startsWith("/dev-ux")
  ) {
    const url = request.nextUrl.clone();
    url.pathname =
      url.pathname === "/" ? "/dev-ux" : `/dev-ux${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  // Režim: panel domen zaključan na jedan projekat ili hub. Zaglavlja čita
  // server layout `[projekat]` (i prijava, za brend). Postavljaju se na svaki
  // zahtev i uvek prepisuju, pa vrednost koju pošalje klijent ne prolazi.
  const panelSlug = await razresiPanel(request.headers.get("host"));
  const zaglavlja = new Headers(request.headers);
  zaglavlja.set("x-panel-rezim", panelSlug ? "panel" : "hub");
  if (panelSlug) zaglavlja.set("x-panel-projekat", panelSlug);
  else zaglavlja.delete("x-panel-projekat");

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

  // Rutiranje projekata (samo prijavljeni ili /login): kanonske adrese panela,
  // stare adrese ekrana u hubu, rewrite panela na `/<slug>/…`. Odluka je čista
  // funkcija u `lib/rutiranje.ts`; ovde se samo primenjuje. Putanje ličnog
  // nivoa „Ja“ (`/`, `/moji-zadaci`, `/poruke`, …) u hubu prolaze, a u panelu
  // idu pod projekat domena kao i sve ostalo (SPAJANJE, plan S07 D3–D4).
  const odluka = odluciRutu({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    panelSlug,
    kolacicProjekat: request.cookies.get(KOLACIC_PROJEKAT)?.value,
  });
  if (odluka.tip === "redirect") {
    return nextjsMiddlewareRedirect(request, odluka.putanja);
  }
  if (odluka.tip === "rewrite") {
    return NextResponse.rewrite(new URL(odluka.putanja, request.url), {
      request: { headers: zaglavlja },
    });
  }
  return NextResponse.next({ request: { headers: zaglavlja } });
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
  // `pozivnica` is the same kind of exception: the registracija-preko-pozivnice
  // ekran (`/pozivnica/<token>`) is opened by someone who by definition does NOT
  // yet have a nalog. Without this exclusion the middleware would redirect every
  // anonymous invite click to /login — the whole flow would be dead on arrival,
  // exactly like `privacy` was. The token check happens client-side via the
  // public `getInvite` query, so no auth context is needed here.
  //
  // Threads (TH2) was added to both matcher entries on 25.08.2026 after exactly
  // the failure this comment predicts: the callback carried Meta's `?code=`,
  // the middleware claimed it as a Convex Auth sign-in code, and the browser
  // landed on /login — the route handler never ran and Convex never saw the
  // exchange. Any FUTURE provider callback must be added here too, in BOTH
  // entries, or it fails the same silent way. Google Business was missing and
  // was added to both entries in the multi-project run (path unchanged).
  //
  // ALL callbacks are FULLY excluded (not just early-returned in
  // the handler) because convexAuthNextjsMiddleware itself intercepts any
  // request carrying a `?code=` query param and tries to verify it as a
  // Convex Auth sign-in code — swallowing Meta's authorization code and
  // redirecting before our route handler can run. Each callback route performs
  // the whole exchange server-side via the one-time `state` nonce, so it needs
  // no auth context from the middleware.
  //
  // `api/meta/data-deletion` and `api/meta/deauthorize` are Meta's server-to-
  // server callbacks: nobody is signed in, so the auth redirect would answer
  // Meta with a bounce to /login. The routes only forward the body to a Convex
  // HTTP action, which checks Meta's `signed_request` signature itself.
  matcher: [
    "/((?!.*\\..*|_next|api/auth/callback/instagram|api/auth/callback/facebook|api/auth/callback/youtube|api/auth/callback/threads|api/auth/callback/google-business|api/meta/data-deletion|api/meta/deauthorize|r/|privacy(?:$|/)|cookies(?:$|/)|pozivnica(?:$|/)).*)",
    "/",
    // Two lookaheads rather than one alternation: Next refuses a capturing
    // group inside a matcher, and `(instagram|facebook)` is one.
    "/(api|trpc)((?!/auth/callback/instagram)(?!/auth/callback/facebook)(?!/auth/callback/youtube)(?!/auth/callback/threads)(?!/auth/callback/google-business)(?!/meta/data-deletion)(?!/meta/deauthorize).*)",
  ],
};
