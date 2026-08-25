import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { sanitizeThreadsError } from "@/convex/lib/threadsShared";

/**
 * Next.js Route Handler za Threads OAuth callback redirect.
 *
 * Celokupna razmena tokena se izvršava na serverskoj strani preko
 * `threads.completeOAuthFromCallback`. Jednokratni `state` nonce (kreiran od strane
 * `threadsAuthorizeUrl` za autentifikovanog člana) pronalazi workspace.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawCode = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const settingsUrl = new URL("/settings", request.nextUrl.origin);

  if (error) {
    const errorMsg =
      error === "access_denied"
        ? "Pristup Threads nalogu je odbijen u Meta dijalogu."
        : errorDescription || error;
    settingsUrl.searchParams.set(
      "threads_error",
      sanitizeThreadsError(errorMsg).slice(0, 300),
    );
    return NextResponse.redirect(settingsUrl);
  }

  // `NEXT_PUBLIC_*` promenljive Next.js ubacuje u bundle pri build-u i NISU
  // pouzdano dostupne u Route Handler-u u trenutku zahteva na Vercelu.
  // Empirijski provereno 25.08.2026: bila je `undefined`, ruta je tiho ulazila u
  // granu "nema koda" i nikada nije zvala Convex. Zato prvo serverska varijabla.
  const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;

  // Tri različita uzroka NE SMEJU da dele jednu poruku — upravo zbog toga je ovaj
  // kvar bio nevidljiv: nedostajao je `convexUrl`, a poruka je tvrdila da Meta nije
  // vratila kod. Svaki uzrok se imenuje, i svaki se loguje na serveru, jer se query
  // parametar gubi kad korisnika preusmeri na prijavu.
  if (!convexUrl) {
    console.error(
      "[Threads OAuth callback] Convex URL nije definisan u okruženju. " +
        "Postavi CONVEX_URL u Vercel env (Production).",
    );
    settingsUrl.searchParams.set(
      "threads_error",
      "Server nije podešen: nedostaje Convex URL. Javi administratoru.",
    );
    return NextResponse.redirect(settingsUrl);
  }

  if (!rawCode || !state) {
    console.error(
      "[Threads OAuth callback] Meta nije vratila code i/ili state parametar.",
    );
    settingsUrl.searchParams.set(
      "threads_error",
      "Meta nije vratila autorizacioni kod ili state parametar. Pokreni povezivanje ponovo.",
    );
    return NextResponse.redirect(settingsUrl);
  }

  // Obavezno pravilo (linija 126): sa code parametra odseci "#_" sa kraja ako postoji
  const code = rawCode.replace(/#_$/, "");

  try {
    const client = new ConvexHttpClient(convexUrl);
    const result = await client.action(api.threads.completeOAuthFromCallback, {
      state,
      code,
    });
    settingsUrl.searchParams.set("threads_connected", "1");
    if (result.username) {
      settingsUrl.searchParams.set("threads_account", result.username);
    }
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    let message = "Povezivanje Threads naloga nije uspelo.";
    if (err instanceof ConvexError) {
      const data = err.data as { message?: string } | undefined;
      if (data && typeof data.message === "string") {
        message = data.message;
      }
    } else {
      console.error("[Threads OAuth callback]", sanitizeThreadsError(err));
    }
    settingsUrl.searchParams.set(
      "threads_error",
      sanitizeThreadsError(message).slice(0, 300),
    );
    return NextResponse.redirect(settingsUrl);
  }
}
