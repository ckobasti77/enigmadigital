import { NextRequest, NextResponse } from "next/server";
import { prosledi } from "../_lib/prosledi";

/**
 * Meta Deauthorization Callback za Threads.
 *
 * Kada korisnik ukloni aplikaciju iz svojih podešavanja naloga, Meta šalje
 * POST zahtev sa `signed_request` parametrom. Ova ruta samo prosleđuje telo
 * Convex HTTP akciji `/threads/deauthorize` (convex/http.ts), koja:
 *
 * 1. Verifikuje HMAC-SHA256 potpis pomoću `THREADS_APP_SECRET` (Convex env).
 *    Ako potpis nije ispravan — 401.
 * 2. Pronalazi konekciju sa `provider: "threads"` i `externalId === user_id`
 *    i označava je kao `expired` (ne briše red, prateći pravila iz schema.ts).
 * 3. Vraća HTTP 200 status.
 */
export async function POST(request: NextRequest) {
  const rezultat = await prosledi(request, "/threads/deauthorize", "Meta deauthorize");
  if (!rezultat.ok) return rezultat.odgovor;
  return NextResponse.json(rezultat.telo ?? {}, { status: rezultat.status });
}
