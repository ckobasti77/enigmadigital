import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { resolveServerConvexUrl } from "@/lib/server-convex-url";

/**
 * Next.js Route Handler for the Facebook Login for Business redirect (F5).
 *
 * The whole token exchange happens SERVER-SIDE via
 * `facebook.completeOAuthFromCallback`. The one-time `state` nonce (created by
 * `getOAuthUrl` for an authenticated member) resolves the workspace, so this
 * works even when the browser session is missing on the return leg — no login
 * round trip can lose the code.
 *
 * Unlike the Instagram callback there is no legacy path: this flow has always
 * carried a `state`, so a code without one is an error rather than something to
 * forward to Settings.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorReason = searchParams.get("error_reason");
  const errorDescription = searchParams.get("error_description");

  const settingsUrl = new URL("/settings", request.nextUrl.origin);

  if (error) {
    settingsUrl.searchParams.set("fb_error", errorDescription || error);
    if (errorReason) {
      settingsUrl.searchParams.set("fb_error_reason", errorReason);
    }
    return NextResponse.redirect(settingsUrl);
  }

  // Razrešavanje i validacija Convex URL-a: `lib/server-convex-url.ts`.
  // Ova ruta je do 25.08.2026 čitala SAMO `NEXT_PUBLIC_CONVEX_URL`, koju Next
  // ubacuje pri build-u i koja u Route Handler-u na Vercelu ume da bude
  // `undefined` — tada bi ruta tvrdila da Facebook nije vratio kod, iako jeste.
  const resolved = resolveServerConvexUrl();
  if (!resolved.ok) {
    console.error("[Facebook OAuth callback]", resolved.logDetail);
    settingsUrl.searchParams.set("fb_error", resolved.reason);
    return NextResponse.redirect(settingsUrl);
  }
  const convexUrl = resolved.url;

  if (!code || !state) {
    console.error(
      "[Facebook OAuth callback] Facebook nije vratio code i/ili state parametar.",
    );
    settingsUrl.searchParams.set(
      "fb_error",
      "Facebook nije vratio kod za autorizaciju. Pokreni povezivanje ponovo.",
    );
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const result = await client.action(api.facebook.completeOAuthFromCallback, {
      state,
      code,
    });
    settingsUrl.searchParams.set("fb_connected", "1");
    if (result.pageName) {
      settingsUrl.searchParams.set("fb_page", result.pageName);
    }
    // More than one Page means the picker is not decoration — Settings opens
    // it straight away instead of leaving the operator to find it.
    if (result.pageCount > 1) {
      settingsUrl.searchParams.set("fb_pick", "1");
    }
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    let message = "Povezivanje Facebook stranice nije uspelo.";
    if (err instanceof ConvexError) {
      const data = err.data as { message?: string } | undefined;
      if (data && typeof data.message === "string") message = data.message;
    } else if (err instanceof Error && err.message) {
      message = err.message;
    }
    settingsUrl.searchParams.set("fb_error", message.slice(0, 300));
    return NextResponse.redirect(settingsUrl);
  }
}
