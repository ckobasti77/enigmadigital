import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";

/**
 * Next.js Route Handler for Instagram OAuth Redirect Callback.
 *
 * PRIMARY PATH (code + state): completes the token exchange SERVER-SIDE via
 * `instagram.completeOAuthFromCallback`. The one-time `state` nonce (created
 * by `getOAuthUrl` for an authenticated member) resolves the workspace, so
 * this works even when the browser session is missing on the return leg —
 * no login round-trip can lose the code anymore.
 *
 * LEGACY PATH (code without state): forwards the code to Settings where the
 * authenticated Convex client exchanges it.
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
    settingsUrl.searchParams.set("ig_error", error);
    if (errorReason) {
      settingsUrl.searchParams.set("ig_error_reason", errorReason);
    }
    if (errorDescription) {
      settingsUrl.searchParams.set("ig_error_description", errorDescription);
    }
    return NextResponse.redirect(settingsUrl);
  }

  // `NEXT_PUBLIC_*` promenljive Next.js ubacuje u bundle pri build-u i NISU
  // pouzdano dostupne u Route Handler-u u trenutku zahteva na Vercelu.
  // Empirijski provereno 25.08.2026: bila je `undefined`, ruta je tiho ulazila u
  // granu "nema koda" i nikada nije zvala Convex. Zato prvo serverska varijabla.
  const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;

  if (code && state && convexUrl) {
    try {
      const client = new ConvexHttpClient(convexUrl);
      const result = await client.action(
        api.instagram.completeOAuthFromCallback,
        { state, code },
      );
      settingsUrl.searchParams.set("ig_connected", "1");
      if (result.username) {
        settingsUrl.searchParams.set("ig_username", result.username);
      }
      return NextResponse.redirect(settingsUrl);
    } catch (err) {
      let message = "Povezivanje Instagram naloga nije uspelo.";
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string } | undefined;
        if (data && typeof data.message === "string") message = data.message;
      } else if (err instanceof Error && err.message) {
        message = err.message;
      }
      settingsUrl.searchParams.set("ig_error", message.slice(0, 300));
      return NextResponse.redirect(settingsUrl);
    }
  }

  // Legacy fallback: no state (or Convex URL missing) — let Settings finish it.
  if (code) {
    settingsUrl.searchParams.set("ig_code", code);
  }

  return NextResponse.redirect(settingsUrl);
}
