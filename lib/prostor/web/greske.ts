// Preneto iz Devotion apps/web/lib/errors.ts (main @ c05c40f), SPAJANJE S08.
type AccessErrorData = {
  code?: string;
  message?: string;
};

/**
 * Poruke po kodu greške, za slučaj kad ConvexError nosi `code`, a ne nosi
 * `message`. Kodovi su oni koje backend zaista baca:
 * - omotači pristupa i adapter radnog dela (`convex/lib/projekat.ts`,
 *   `convex/prostor/lib/auth.ts`): `unauthorized`, `forbidden`, `not_found`,
 *   `nema_profila`, `invalid`;
 * - Devotion kodovi koje backend zadržava (`permissionError` u
 *   `convex/prostor/lib/permissions.ts`): `ZAKLJUCANO`, `NEMA_DOZVOLU`,
 *   `KONFLIKT_IZMENA`, `STARI_TOK`.
 * Poruka koju server pošalje uz kod ima prednost, jer je tačnija od ove opšte.
 */
export const PORUKE_GRESAKA_PO_KODU: Readonly<Record<string, string>> = {
  unauthorized: "Prijava je istekla. Prijavi se ponovo.",
  forbidden: "Nemaš pristup ovom projektu.",
  not_found: "Stavka nije pronađena u ovom projektu.",
  nema_profila: "Profil još nije spreman. Osveži stranicu.",
  invalid: "Uneti podaci nisu ispravni.",
  ZAKLJUCANO: "Stranica je zaključana. Menja je autor ili vlasnik projekta.",
  NEMA_DOZVOLU: "Nemaš dozvolu za ovu radnju.",
  KONFLIKT_IZMENA: "Neko iz tima je u međuvremenu izmenio ovu stranicu.",
  STARI_TOK: "Ova radnja više ne postoji. Osveži stranicu i pokušaj ponovo.",
};

function porukaZaKod(code: string | undefined): string | undefined {
  if (code === undefined || !Object.hasOwn(PORUKE_GRESAKA_PO_KODU, code)) return undefined;
  return PORUKE_GRESAKA_PO_KODU[code];
}

/**
 * Stare poruke servera počinju oznakom koda („KONFLIKT_IZMENA: …"), da ih
 * prepoznaju stari klijenti. Korisniku oznaka ne govori ništa, pa se skida.
 */
const OZNAKA_KODA = /^(?:[A-Z]{2,}(?:_[A-Z]+)+|ZAKLJUCANO):\s*/;

function bezOznakeKoda(text: string): string {
  return text.replace(OZNAKA_KODA, "").trim();
}

/**
 * Izvlači čitljivu poruku iz greške Convex funkcije. Backend baca
 * `ConvexError` sa `data: { code, message }` (omotači u `convex/lib/projekat.ts`,
 * `permissionError` u `convex/prostor/lib/permissions.ts`); prvo se uzima
 * `data.message`, zatim poruka po kodu (`PORUKE_GRESAKA_PO_KODU`); ako ni toga
 * nema, pada na tekst „Uncaught ConvexError: …" / „[CONVEX …]" omotača, a ako
 * ni on ne govori ništa, na `fallback`. Sirov `error.message` se ne prikazuje.
 */
export function accessErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const data = (error as Error & { data?: unknown }).data;
  if (data !== null && typeof data === "object") {
    const { code, message } = data as AccessErrorData;
    if (typeof message === "string") {
      const fromServer = bezOznakeKoda(message);
      if (fromServer) return fromServer;
    }
    const byCode = porukaZaKod(typeof code === "string" ? code : undefined);
    if (byCode !== undefined) return byCode;
  }

  const uncaught = error.message.match(/Uncaught (?:ConvexError: )?(.+?)(?:\n|$)/);
  const text = (uncaught?.[1] ?? error.message)
    .replace(/^\[CONVEX[^\]]*\]\s*/, "")
    // Razvoj: „Uncaught Error: <poruka>" — skida se samo prefiks, poruka servera
    // ostaje (produkcija tekst obične greške ionako krije iza „Server Error").
    .replace(/^Error:\s*/, "")
    .trim();
  // Tehnički tekst servera (Server Error, Request ID) korisniku ne govori ništa: srpski rezervni tekst.
  if (!text || /Server Error|Request ID|Called by client/i.test(text)) return fallback;
  return porukaZaKod(text) ?? (bezOznakeKoda(text) || fallback);
}

/** Vraća `code` iz ConvexError data, ako postoji (npr. "forbidden" ili "KONFLIKT_IZMENA"). */
export function accessErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const data = (error as Error & { data?: unknown }).data;
  if (data !== null && typeof data === "object" && "code" in data) {
    const code = (data as AccessErrorData).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
