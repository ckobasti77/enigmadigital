/**
 * ============================================================================
 * SLANJE U APLIKACIJU — `POST /generate-leads/ingest` (plan §5)
 * ============================================================================
 *
 * Ovo NE upisuje leadove. Pravi `leadImports` red sa `status: "u_pregledu"` —
 * čovek pregleda i primenjuje (§O2). „Poslato" znači „stiglo u staging", ne
 * „u bazi je".
 *
 * TOKEN JE LOZINKA (§0 pravilo 12): nigde se ne ispisuje, ne loguje, ne stavlja
 * u URL i ne pojavljuje u poruci greške. Isto važi za telo — ono nosi telefone
 * i imena ljudi.
 */

/** Koliko se čeka na odgovor. Ingest je jedna Convex mutacija nad ≤ 200 redova. */
export const TIMEOUT_MS = 30000;

/**
 * Šalje telo. Vraća `{ ok, status, odgovor }` — NIKAD ne baca zbog statusa,
 * jer pozivalac mora da sačuva JSON lokalno pre nego što prijavi neuspeh
 * (§10.3 k. 7).
 */
export async function posalji({ url, token, telo }) {
  const kontrola = new AbortController();
  const tajmer = setTimeout(() => kontrola.abort(), TIMEOUT_MS);

  try {
    const odgovor = await fetch(url, {
      method: "POST",
      signal: kontrola.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(telo),
    });

    let telo_odgovora = null;
    try {
      telo_odgovora = await odgovor.json();
    } catch {
      telo_odgovora = null;
    }

    return { ok: odgovor.ok, status: odgovor.status, odgovor: telo_odgovora };
  } catch (err) {
    // Kod greške, ne poruka: poruka `fetch`-a ume da sadrži pun URL.
    return { ok: false, status: 0, greska: String(err?.cause?.code ?? err?.name ?? "greška mreže") };
  } finally {
    clearTimeout(tajmer);
  }
}

/**
 * Slanje jednog snimka ekrana na `POST /generate-leads/snimak` (GL10, plan
 * §4.3). Sirovo telo (`image/jpeg|png|webp`), ≤ 400 KB — granicu proverava
 * pozivalac, ruta je proverava opet. Vraća `{ ok, status, storageId }`; nikad
 * ne baca zbog statusa — ocena ide bez slike i `greske` to kaže.
 *
 * URL rute se izvodi iz `ENIGMA_INGEST_URL` zamenom `/ingest` → `/snimak`.
 */
export async function posaljiSnimak({ url, token, bajtovi, tip }) {
  const snimakUrl = String(url).replace(/\/generate-leads\/ingest\/?$/, "/generate-leads/snimak");
  const kontrola = new AbortController();
  const tajmer = setTimeout(() => kontrola.abort(), TIMEOUT_MS);
  try {
    const odgovor = await fetch(snimakUrl, {
      method: "POST",
      signal: kontrola.signal,
      headers: { "Content-Type": tip, Authorization: `Bearer ${token}` },
      body: bajtovi,
    });
    let telo = null;
    try {
      telo = await odgovor.json();
    } catch {
      telo = null;
    }
    return {
      ok: odgovor.ok && typeof telo?.storageId === "string",
      status: odgovor.status,
      storageId: typeof telo?.storageId === "string" ? telo.storageId : null,
      greska: odgovor.ok ? null : String(telo?.greska ?? `HTTP ${odgovor.status}`),
    };
  } catch (err) {
    return { ok: false, status: 0, storageId: null, greska: String(err?.cause?.code ?? err?.name ?? "greška mreže") };
  } finally {
    clearTimeout(tajmer);
  }
}

/**
 * Ljudska poruka za odgovor koji nije 200 — po statusu, bez tela.
 *
 * Ruta namerno ne kaže ZAŠTO je token loš (401 je isti za „nema", „nije Bearer",
 * „nepoznat" i „opozvan"), pa ni ova poruka ne sme da nagađa.
 */
export function objasniStatus(status) {
  switch (status) {
    case 0:
      return "Nije uspela ni veza sa aplikacijom. Proveri internet i ENIGMA_INGEST_URL.";
    case 401:
      return "Token nije prihvaćen. Napravi novi u Podešavanja → Pristup → Tokeni za uvoz i upiši ga u ENIGMA_INGEST_TOKEN.";
    case 400:
      return "Aplikacija je odbila oblik tela. Polja su navedena iznad — vrednosti se namerno ne prikazuju.";
    case 429:
      return "Prekoračen je plafon uvoza za ovaj sat (30 po radnom prostoru). Sačekaj do punog sata i pošalji ponovo iz sačuvanog JSON-a.";
    case 404:
      return (
        "Ruta nije nađena. ENIGMA_INGEST_URL mora da se završava sa " +
        "/generate-leads/ingest i da bude na .convex.site hostu. Ako je deployment " +
        "u EU regionu, host nosi region: <deployment>.eu-west-1.convex.site (bez " +
        "regiona vraća 404). Tačan host je HTTP Actions URL u Convex dashboardu " +
        "(Settings → URL & Deploy Key)."
      );
    default:
      return `Aplikacija je vratila ${status}. JSON je sačuvan lokalno, pa se slanje može ponoviti bez novog trošenja Places kvote.`;
  }
}
