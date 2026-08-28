import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { resolveServerConvexUrl } from "@/lib/server-convex-url";

/**
 * Next.js Route Handler za Google Business Profile OAuth redirect.
 *
 * Celokupna razmena koda za tokene se obavlja SERVER-SIDE kroz
 * `gbp.completeOAuthFromCallback`. Jednokratni `state` nonce (kreiran od strane
 * `gbpAuthorizeUrl` za prijavljenog člana) identifikuje radni prostor,
 * tako da ovo radi i kada sesija u pregledaču nije dostupna na povratnom koraku.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const settingsUrl = new URL("/settings", request.nextUrl.origin);

  // 1. Google je eksplicitno prijavio grešku ili odbijanje korisnika
  if (error) {
    const errorMsg =
      error === "access_denied"
        ? "Pristup Google Business Profile nalogu je odbijen u Google dijalogu."
        : errorDescription || error;
    settingsUrl.searchParams.set("gb_error", errorMsg);
    return NextResponse.redirect(settingsUrl);
  }

  // 2. Razrešavanje i validacija Convex URL-a: `lib/server-convex-url.ts`.
  // Pogrešno podešen server, odbijen pristup i izostao Google kod su
  // TRI različita kvara i ne smeju da dele jednu poruku.
  const resolved = resolveServerConvexUrl();
  if (!resolved.ok) {
    console.error("[Google Business OAuth callback]", resolved.logDetail);
    settingsUrl.searchParams.set("gb_error", resolved.reason);
    return NextResponse.redirect(settingsUrl);
  }
  const convexUrl = resolved.url;

  // 3. Google nije vratio kod ili state parametar
  if (!code || !state) {
    console.error(
      "[Google Business OAuth callback] Google nije vratio code i/ili state parametar.",
    );
    settingsUrl.searchParams.set(
      "gb_error",
      "Google nije vratio autorizacioni kod ili state parametar. Pokreni povezivanje ponovo.",
    );
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    await client.action(api.gbp.completeOAuthFromCallback, {
      state,
      code,
    });
    settingsUrl.searchParams.set("gb_connected", "1");
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    // Samo poruka koju je akcija NAMERNO poslala kroz ConvexError završava u
    // adresnoj traci. Svaka druga greška ostaje u serverskom logu.
    let message = "Povezivanje Google Business Profile naloga nije uspelo.";
    if (err instanceof ConvexError) {
      const data = err.data as { message?: string } | undefined;
      if (data && typeof data.message === "string") message = data.message;
    } else {
      console.error("[Google Business OAuth callback]", err);
    }
    settingsUrl.searchParams.set("gb_error", message.slice(0, 300));
    return NextResponse.redirect(settingsUrl);
  }
}
