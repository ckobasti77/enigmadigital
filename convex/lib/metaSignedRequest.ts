/**
 * Meta `signed_request` (deautorizacija i zahtev za brisanje podataka).
 *
 * Meta šalje POST sa poljem `signed_request` oblika
 * `<base64url potpis>.<base64url JSON>`, gde je potpis HMAC-SHA256 nad drugim
 * delom, ključem tajne aplikacije. Ovde je i izvlačenje polja iz tela i
 * provera potpisa: obe funkcije su čiste (Web Crypto, bez Node-a), pa ih koristi
 * Convex HTTP akcija u `http.ts`, a testovi ih zovu direktno.
 *
 * Tajna, `signed_request` i korisnički podaci se nikad ne loguju.
 */

export type MetaSignedRequestPayload = {
  user_id?: string | number;
  algorithm?: string;
  issued_at?: number;
  [kljuc: string]: unknown;
};

function iseci(vrednost: unknown): string | null {
  if (typeof vrednost !== "string") return null;
  const t = vrednost.trim();
  return t.length > 0 ? t : null;
}

/**
 * `signed_request` iz sirovog tela zahteva. Meta šalje
 * `application/x-www-form-urlencoded`; JSON i `multipart/form-data` su tu da
 * se ponašanje ne bi razlikovalo od ranije Next rute koja ih je primala.
 */
export function izvuciSignedRequest(
  contentType: string | null,
  telo: string,
): string | null {
  const tip = (contentType ?? "").toLowerCase();

  if (tip.includes("application/json")) {
    try {
      const json = JSON.parse(telo) as { signed_request?: unknown } | null;
      const iz = iseci(json?.signed_request);
      if (iz !== null) return iz;
    } catch {
      // Probaj dalje kao form telo.
    }
  }

  if (tip.includes("multipart/form-data")) {
    const deo = /name="signed_request"\r?\n(?:[^\r\n]*\r?\n)*?\r?\n([^\r\n]*)/.exec(telo);
    const iz = iseci(deo?.[1]);
    if (iz !== null) return iz;
  }

  try {
    return iseci(new URLSearchParams(telo).get("signed_request"));
  } catch {
    return null;
  }
}

function base64UrlUBajtove(ulaz: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(ulaz)) return null;
  const b64 = ulaz.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const dopuna = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    const bin = atob(b64 + dopuna);
    const bajtovi = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bajtovi[i] = bin.charCodeAt(i);
    return bajtovi;
  } catch {
    return null;
  }
}

function jednakoKonstantnoVreme(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let razlika = 0;
  for (let i = 0; i < a.length; i++) razlika |= a[i] ^ b[i];
  return razlika === 0;
}

/**
 * Proverava potpis i vraća sadržaj, ili `null` kad potpis ne važi, tajna nije
 * podešena, format nije ispravan ili algoritam nije HMAC-SHA256.
 */
export async function proveriSignedRequest(
  signedRequest: string,
  tajna: string | undefined,
): Promise<MetaSignedRequestPayload | null> {
  const kljuc = tajna?.trim();
  if (!kljuc) return null;

  const delovi = signedRequest.split(".");
  if (delovi.length !== 2) return null;
  const [kodiranPotpis, kodiranSadrzaj] = delovi;
  if (!kodiranPotpis || !kodiranSadrzaj) return null;

  const potpis = base64UrlUBajtove(kodiranPotpis);
  const sadrzajBajtovi = base64UrlUBajtove(kodiranSadrzaj);
  if (potpis === null || sadrzajBajtovi === null) return null;

  const enkoder = new TextEncoder();
  const hmacKljuc = await crypto.subtle.importKey(
    "raw",
    enkoder.encode(kljuc),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const ocekivan = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKljuc, enkoder.encode(kodiranSadrzaj)),
  );
  if (!jednakoKonstantnoVreme(potpis, ocekivan)) return null;

  let sadrzaj: unknown;
  try {
    sadrzaj = JSON.parse(new TextDecoder().decode(sadrzajBajtovi));
  } catch {
    return null;
  }
  if (typeof sadrzaj !== "object" || sadrzaj === null || Array.isArray(sadrzaj)) {
    return null;
  }
  const p = sadrzaj as MetaSignedRequestPayload;
  if (typeof p.algorithm === "string" && p.algorithm.toUpperCase() !== "HMAC-SHA256") {
    return null;
  }
  return p;
}

/** Meta korisnički ID iz proverenog sadržaja, ili `null` kad ga nema. */
export function metaKorisnikId(payload: MetaSignedRequestPayload): string | null {
  const id = payload.user_id;
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return iseci(id);
}
