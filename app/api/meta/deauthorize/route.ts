import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import {
  extractSignedRequest,
  verifySignedRequest,
} from "../_lib/verifySignedRequest";

/**
 * Meta Deauthorization Callback za Threads.
 *
 * Kada korisnik ukloni aplikaciju iz svojih podešavanja naloga, Meta šalje
 * POST zahtev sa `signed_request` parametrom.
 *
 * 1. Verifikuje HMAC-SHA256 potpis pomoću `THREADS_APP_SECRET`.
 *    Ako potpis nije ispravan — vraća 401 i prekida rad.
 * 2. Pronalazi konekciju sa `provider: "threads"` i `externalId === user_id`
 *    i označava je kao `expired` (ne briše red, prateći pravila iz schema.ts).
 * 3. Vraća HTTP 200 status.
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
    console.error("[Meta deauthorize] NEXT_PUBLIC_CONVEX_URL nije konfigurisan.");
    return NextResponse.json(
      { error: "Greška na serveru." },
      { status: 500 },
    );
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    await client.mutation(api.threadsStore.markExpiredByExternalId, {
      externalId: userId,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(
      "[Meta deauthorize] Greška prilikom ažuriranja statusa konekcije:",
      error instanceof Error ? error.message : "nepoznata greška",
    );
    return NextResponse.json(
      { error: "Došlo je do greške prilikom obrade zahteva." },
      { status: 500 },
    );
  }
}
