import { LEAD_SIGNAL_KINDS } from "./leadNormalize";

/**
 * ============================================================================
 * LEAD INBOUND DERIVATION UTILITIES (LM5, §2.5, §4, §8)
 * ============================================================================
 *
 * Čiste funkcije za analizu i obradu inbound događaja.
 * Ne uvoze Convex runtime niti zavisnosti sa stanjem baze.
 * ============================================================================
 */

/**
 * Prepoznaje i razlaže vrste signala iz teksta poruke, komentara ili napomene.
 * Vraća isključivo vrste signala koje postoje u `LEAD_SIGNAL_KINDS`.
 *
 * Pravila pokrivaju namere i stanja na srpskom jeziku (latinica, sa i bez dijakritika).
 */
export function deriveSignalsFromInboundText(text?: string | null): string[] {
  if (!text) return [];

  const signals = new Set<string>();
  const textClean = text.toLowerCase();

  // 1. pitao_cenu — jasan signal visokog intent-a (§4)
  // Detektuje upite za cenu, cenovnik, troškove ili tarife u komentarima i porukama
  if (
    /\b(?:koliko\s+(?:kosta|košta|je)|kolika\s+je\s+cena|koja\s+je\s+cena|koje\s+su\s+cene|moze\s+cena|može\s+cena|moze\s+info\s+o\s+ceni|može\s+info\s+o\s+ceni|info\s+cena|cena\s+u\s+(?:dm|inbox)|(?:dm|inbox)\s+cena|posaljite\s+cenovnik|pošaljite\s+cenovnik|moze\s+cenovnik|može\s+cenovnik|cenu\s+molim|cena\s+molim)\b/i.test(
      textClean,
    ) ||
    /^\s*cena[\s?!.]*$/i.test(textClean) ||
    /^\s*cenovnik[\s?!.]*$/i.test(textClean) ||
    /\bcena\s*\?/i.test(textClean) ||
    /\bcenovnik\s*\?/i.test(textClean) ||
    /\bkoliko\s+kosta\b/i.test(textClean) ||
    /\bkoliko\s+košta\b/i.test(textClean)
  ) {
    signals.add("pitao_cenu");
  }

  // 2. nema_sajt
  if (
    /nema\s+(?:web\s*)?sajt|bez\s+sajta|nema\s+stranicu|nema\s+sajt\/drustvene\s+mreze/i.test(
      textClean,
    )
  ) {
    signals.add("nema_sajt");
  }

  // 3. koristi_third_party_booking
  if (
    /koristi\s+(?:setmore|dikidi|sredime|fresha|treatwell|booking)/i.test(
      textClean,
    ) ||
    /\b(?:setmore|dikidi|fresha|treatwell)\b/i.test(textClean)
  ) {
    signals.add("koristi_third_party_booking");
  }

  // 4. samo_facebook
  if (
    /ima\s+samo\s+facebook|samo\s+facebook|samo\s+fb|aktivan\s+samo\s+na\s+fb/i.test(
      textClean,
    )
  ) {
    signals.add("samo_facebook");
  }

  // 5. samo_instagram
  if (
    /ima\s+samo\s+instagram|samo\s+instagram|samo\s+ig|aktivan\s+samo\s+na\s+ig/i.test(
      textClean,
    )
  ) {
    signals.add("samo_instagram");
  }

  // 6. visok_broj_recenzija
  if (
    /\d+\s*pozitivn(?:e|ih)?\s*recenzij(?:a|e)|visok\s*broj\s*recenzija|mnogo\s*recenzija|preko\s*100\s*recenzija|100\+\s*recenzija/i.test(
      textClean,
    )
  ) {
    signals.add("visok_broj_recenzija");
  }

  // 7. novootvorena_firma
  if (
    /novootvoreni|novootvoreno|novootvorena|nova\s+firma|novi\s+salon|skoro\s+otvoren|tek\s+otvoreno/i.test(
      textClean,
    )
  ) {
    signals.add("novootvorena_firma");
  }

  // Stroga validacija protiv LEAD_SIGNAL_KINDS
  const allowed = new Set<string>(LEAD_SIGNAL_KINDS);
  return Array.from(signals).filter((s) => allowed.has(s));
}

/**
 * Računa stabilan kriptografski heš (SHA-256) za korisnički hendl sa platforme (§0, §8).
 *
 * Pravila privatnosti i ZZPL:
 * - Sirov hendl se NIKADA ne skladišti u `leadInbound` tabeli niti u neobrađenim logovima.
 * - Hendl se normalizuje (mala slova, uklanjanje vodećeg '@' i razmaka) tako da
 *   `@korisnik` i `korisnik` daju identičan heš za deduplikaciju i grupisnje.
 * - Koristi standardni Web Crypto API (`crypto.subtle`) koji je dostupan u V8 okruženju.
 */
export async function hashHandle(
  handle?: string | null,
): Promise<string | undefined> {
  if (!handle) return undefined;

  const normalized = handle.trim().toLowerCase().replace(/^@+/, "");
  if (!normalized) return undefined;

  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Preslikava vrstu inbound događaja u odgovarajuću vrstu signala (`LeadSignalKind`).
 *
 * U shemi `leadSignals` i taksonomiji signala:
 * - "odgovor" (reply) na komentar ili objavu se preslikava u "komentar" jer predstavlja
 *   istu vrstu javnog angažovanja i nosi istu težinu za intent ocenjivanje.
 * - "dm" ostaje "dm"
 * - "mention" ostaje "mention"
 * - "komentar" ostaje "komentar"
 */
export function mapInboundKindToSignal(
  kind: "komentar" | "odgovor" | "dm" | "mention",
): "komentar" | "dm" | "mention" {
  if (kind === "odgovor") {
    // Odgovor je javni komentar i u `leadSignals` ima vrstu "komentar"
    return "komentar";
  }
  return kind;
}
