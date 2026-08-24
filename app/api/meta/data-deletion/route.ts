import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import {
  extractSignedRequest,
  verifySignedRequest,
} from "../_lib/verifySignedRequest";

/**
 * Meta User Data Deletion Callback za Threads.
 *
 * Kada korisnik zatraži brisanje svojih podataka sa aplikacije, Meta šalje
 * POST zahtev sa `signed_request` parametrom.
 *
 * 1. Verifikuje HMAC-SHA256 potpis pomoću `THREADS_APP_SECRET`.
 *    Ako potpis nije ispravan — vraća 401 i prekida rad.
 * 2. Pokreće tok brisanja podataka preko `threadsStore.triggerDataDeletionByExternalId`
 *    (koji koristi postojeći `beginPurgeRun` mehanizam).
 * 3. Vraća JSON tačno u formatu koji Meta propisuje:
 *    {
 *      "url": "<URL stranice za proveru statusa>",
 *      "confirmation_code": "<jedinstveni kod zahteva>"
 *    }
 */
export async function POST(request: NextRequest) {
  const signedRequest = await extractSignedRequest(request);

  if (!signedRequest) {
    return NextResponse.json(
      { error: "Nedostaje signed_request parametar." },
      { status: 401 },
    );
  }

  const payload = verifySignedRequest(signedRequest);

  if (!payload || !payload.user_id) {
    return NextResponse.json(
      { error: "Neispravan potpis ili nevalidan payload." },
      { status: 401 },
    );
  }

  const userId = String(payload.user_id);
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    console.error("[Meta data-deletion] NEXT_PUBLIC_CONVEX_URL nije konfigurisan.");
    return NextResponse.json(
      { error: "Greška na serveru." },
      { status: 500 },
    );
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const result = await client.mutation(
      api.threadsStore.triggerDataDeletionByExternalId,
      { externalId: userId },
    );

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin ||
      "https://digital.enigmait.rs";

    const statusUrl = `${baseUrl}/deletion-status?code=${encodeURIComponent(result.confirmationCode)}`;

    return NextResponse.json(
      {
        url: statusUrl,
        confirmation_code: result.confirmationCode,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      "[Meta data-deletion] Greška prilikom pokretanja brisanja:",
      error instanceof Error ? error.message : "nepoznata greška",
    );
    return NextResponse.json(
      { error: "Došlo je do greške prilikom obrade zahteva za brisanje." },
      { status: 500 },
    );
  }
}
