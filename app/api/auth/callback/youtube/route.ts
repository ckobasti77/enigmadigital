import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { resolveServerConvexUrl } from "@/lib/server-convex-url";

/**
 * Next.js Route Handler for Google / YouTube OAuth redirect.
 *
 * The whole token exchange happens SERVER-SIDE via
 * `youtube.completeOAuthFromCallback`. The one-time `state` nonce (created by
 * `youtubeAuthorizeUrl` for an authenticated member) resolves the workspace,
 * so this works even when the browser session is missing on the return leg —
 * no login round trip can lose the code.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const settingsUrl = new URL("/settings", request.nextUrl.origin);

  if (error) {
    const errorMsg =
      error === "access_denied"
        ? "Pristup YouTube kanalu je odbijen u Google dijalogu."
        : errorDescription || error;
    settingsUrl.searchParams.set("yt_error", errorMsg);
    return NextResponse.redirect(settingsUrl);
  }

  // Razrešavanje i validacija Convex URL-a: `lib/server-convex-url.ts`.
  // Pogrešno podešen server i izostao Google kod su DVA različita uzroka i ne
  // smeju da dele jednu poruku — ista konflacija je na Threads ruti sakrila
  // kvar skoro sat vremena (25.08.2026).
  const resolved = resolveServerConvexUrl();
  if (!resolved.ok) {
    console.error("[YouTube OAuth callback]", resolved.logDetail);
    settingsUrl.searchParams.set("yt_error", resolved.reason);
    return NextResponse.redirect(settingsUrl);
  }
  const convexUrl = resolved.url;

  if (!code || !state) {
    console.error(
      "[YouTube OAuth callback] Google nije vratio code i/ili state parametar.",
    );
    settingsUrl.searchParams.set(
      "yt_error",
      "Google nije vratio autorizacioni kod ili state parametar. Pokreni povezivanje ponovo.",
    );
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const result = await client.action(api.youtube.completeOAuthFromCallback, {
      state,
      code,
    });
    settingsUrl.searchParams.set("yt_connected", "1");
    if (result.channelTitle) {
      settingsUrl.searchParams.set("yt_channel", result.channelTitle);
    }
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    // Samo poruka koju je akcija NAMERNO poslala kroz ConvexError zavrsava u
    // adresnoj traci. Svaka druga greska (mrezna, interna Convex sa stack
    // tragom, telo odgovora providera) ostaje u serverskom logu — korisniku ide
    // opsti tekst.
    let message = "Povezivanje YouTube kanala nije uspelo.";
    if (err instanceof ConvexError) {
      const data = err.data as { message?: string } | undefined;
      if (data && typeof data.message === "string") message = data.message;
    } else {
      console.error("[YouTube OAuth callback]", err);
    }
    settingsUrl.searchParams.set("yt_error", message.slice(0, 300));
    return NextResponse.redirect(settingsUrl);
  }
}
