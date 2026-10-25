import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { resolveServerConvexUrl } from "@/lib/server-convex-url";
import { ciljPosleRazmene, ciljPovratka } from "../_lib/povratak";

/**
 * Next.js Route Handler for Instagram OAuth Redirect Callback.
 *
 * PRIMARY PATH (code + state): completes the token exchange SERVER-SIDE via
 * `instagram.completeOAuthFromCallback`. The one-time `state` nonce (created
 * by `getOAuthUrl` for an authenticated member) resolves the workspace, so
 * this works even when the browser session is missing on the return leg —
 * no login round-trip can lose the code anymore. The browser then goes back
 * to the panel the flow started from (`ciljPovratka`), not to this host.
 *
 * CODE WITHOUT STATE: not exchanged anywhere (C19) — Settings shows an error
 * and the user starts again. Exchanging a stateless code from the address bar
 * was an OAuth CSRF: a crafted link could connect someone else's account.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorReason = searchParams.get("error_reason");
  const errorDescription = searchParams.get("error_description");

  // Razrešavanje i validacija Convex URL-a: `lib/server-convex-url.ts`.
  // Neispravna vrednost se ovde NE sme pretvoriti u tihi pad na legacy granu:
  // legacy grana je za slučaj "nema state-a", a ne za pokvarenu konfiguraciju.
  const resolvedConvex = resolveServerConvexUrl();
  const settingsUrl = await ciljPovratka(
    request,
    state,
    resolvedConvex.ok ? resolvedConvex.url : null,
  );

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

  if (!resolvedConvex.ok) {
    console.error("[Instagram OAuth callback]", resolvedConvex.logDetail);
    settingsUrl.searchParams.set("ig_error", resolvedConvex.reason);
    return NextResponse.redirect(settingsUrl);
  }
  const convexUrl = resolvedConvex.url;

  if (code && state) {
    try {
      const client = new ConvexHttpClient(convexUrl);
      const result = await client.action(
        api.instagram.completeOAuthFromCallback,
        { state, code },
      );
      const cilj = ciljPosleRazmene(result.povratak, settingsUrl);
      cilj.searchParams.set("ig_connected", "1");
      if (result.username) {
        cilj.searchParams.set("ig_username", result.username);
      }
      return NextResponse.redirect(cilj);
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

  // Kod bez stanja se ne prosleđuje dalje (C19): pravi tok uvek nosi `state`,
  // a Settings više ne razmenjuje kod iz adrese — podmetnut link sa tuđim
  // kodom bi inače povezao tuđ nalog u projekat onoga ko ga otvori.
  if (code) {
    settingsUrl.searchParams.set(
      "ig_error",
      "Instagram nije vratio potvrdu toka. Pokreni povezivanje ponovo.",
    );
  }

  return NextResponse.redirect(settingsUrl);
}
