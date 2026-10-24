/**
 * Prosleđivanje Meta poziva (deautorizacija, zahtev za brisanje) Convex HTTP
 * akciji.
 *
 * Next ruta NE proverava potpis i ne zove Convex funkcije: sirovo telo i
 * `content-type` idu na `<Convex site URL><putanja>`, gde akcija u
 * `convex/http.ts` proverava `signed_request` tajnom iz Convex env-a i tek onda
 * menja vezu. Tako za ovo ne postoji javna mutacija koju bi neko zvao bez
 * potpisa.
 */

function convexSiteUrl(): string | null {
  const iz =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
    // Isti deployment na `.convex.site` kad je podešen samo Convex URL
    // (isti obrazac kao `lib/ig-media.ts`).
    (process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL)?.replace(
      ".convex.cloud",
      ".convex.site",
    );
  const url = iz?.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  return url && /^https?:\/\//.test(url) ? url : null;
}

export type ProsledjenOdgovor =
  | { ok: true; status: number; telo: unknown }
  | { ok: false; odgovor: Response };

export async function prosledi(
  request: Request,
  putanja: string,
  oznaka: string,
): Promise<ProsledjenOdgovor> {
  const sajt = convexSiteUrl();
  if (sajt === null) {
    console.error(`[${oznaka}] NEXT_PUBLIC_CONVEX_SITE_URL nije konfigurisan.`);
    return {
      ok: false,
      odgovor: Response.json({ error: "Greška na serveru." }, { status: 500 }),
    };
  }

  try {
    const odgovor = await fetch(`${sajt}${putanja}`, {
      method: "POST",
      headers: {
        "Content-Type":
          request.headers.get("content-type") ?? "application/x-www-form-urlencoded",
      },
      body: await request.text(),
      cache: "no-store",
    });
    const telo: unknown = await odgovor.json().catch(() => null);
    return { ok: true, status: odgovor.status, telo };
  } catch (error) {
    console.error(
      `[${oznaka}] Convex HTTP akcija nije dostupna:`,
      error instanceof Error ? error.message : "nepoznata greška",
    );
    return {
      ok: false,
      odgovor: Response.json(
        { error: "Došlo je do greške prilikom obrade zahteva." },
        { status: 500 },
      ),
    };
  }
}
