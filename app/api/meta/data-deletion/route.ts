import { NextRequest, NextResponse } from "next/server";
import { prosledi } from "../_lib/prosledi";

/**
 * Meta User Data Deletion Callback za Threads.
 *
 * Kada korisnik zatraži brisanje svojih podataka sa aplikacije, Meta šalje
 * POST zahtev sa `signed_request` parametrom. Ova ruta samo prosleđuje telo
 * Convex HTTP akciji `/threads/data-deletion` (convex/http.ts), koja proverava
 * HMAC-SHA256 potpis tajnom `THREADS_APP_SECRET` (Convex env), pokreće
 * brisanje (`beginPurgeRun`) i vraća `confirmation_code`. Ruta zatim vraća JSON
 * tačno u formatu koji Meta propisuje:
 *    {
 *      "url": "<URL stranice za proveru statusa>",
 *      "confirmation_code": "<jedinstveni kod zahteva>"
 *    }
 */
export async function POST(request: NextRequest) {
  const rezultat = await prosledi(request, "/threads/data-deletion", "Meta data-deletion");
  if (!rezultat.ok) return rezultat.odgovor;

  const telo = rezultat.telo as { confirmation_code?: unknown } | null;
  const confirmationCode = telo?.confirmation_code;
  if (rezultat.status !== 200 || typeof confirmationCode !== "string") {
    return NextResponse.json(telo ?? { error: "Greška na serveru." }, {
      status: rezultat.status === 200 ? 500 : rezultat.status,
    });
  }

  // Bez zakucane rezervne adrese: Meta zove tačno domen aplikacije, pa je
  // njegov origin ispravna adresa strane statusa.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  return NextResponse.json(
    {
      url: `${baseUrl}/deletion-status?code=${encodeURIComponent(confirmationCode)}`,
      confirmation_code: confirmationCode,
    },
    { status: 200 },
  );
}
