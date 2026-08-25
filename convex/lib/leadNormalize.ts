/**
 * ============================================================================
 * LEAD NORMALIZATION UTILITIES (§2, §3, §5.2)
 * ============================================================================
 *
 * Čiste funkcije za normalizaciju i pripremu deduplikacionih ključeva.
 * Ne uvoze Convex niti zavisnosti sa stanjem.
 * ============================================================================
 */

/**
 * Normalizuje naziv firme za potrebe deduplikacije (§3, ključ #4).
 *
 * Pravila:
 * 1. Dijakritici se svode na osnovna slova (đ/Đ -> dj, č/ć -> c, š -> s, ž -> z)
 *    kako bi „Šljivić” i „Sljivic” davali identičan ključ.
 * 2. Prebacivanje u mala slova.
 * 3. Uklanjanje pravnih oblika privrednih subjekata (D.O.O., DOO, P.R., PR,
 *    S.Z.R., SZR, S.T.R., STR, A.D., AD, O.D., K.D., preduzetnik).
 * 4. Uklanjanje interpunkcije i svođenje višestrukih razmaka na jedan.
 *
 * Primeri iz stvarnih podataka (§5.2):
 * - "Pro Team Borča" -> "pro team borca"
 * - "PEKARA SUNCE DOO" -> "pekara sunce"
 * - "Auto Servis Šljivić S.Z.R." -> "auto servis sljivic"
 * - "Frizerski salon Žaklina PR" -> "frizerski salon zaklina"
 * - "Kozmetički studio 'Adaleta' d.o.o." -> "kozmeticki studio adaleta"
 */
export function normalizeCompanyName(name?: string | null): string {
  if (!name) return "";

  // 1. Preslikavanje ćiriličnih slova u latinicu pre skidanja dijakritika
  let normalized = name
    .replace(/ђ/g, "dj")
    .replace(/Ђ/g, "dj")
    .replace(/љ/g, "lj")
    .replace(/Љ/g, "lj")
    .replace(/њ/g, "nj")
    .replace(/Њ/g, "nj")
    .replace(/џ/g, "dz")
    .replace(/Џ/g, "dz")
    .replace(/ч/g, "c")
    .replace(/Ч/g, "c")
    .replace(/ћ/g, "c")
    .replace(/Ћ/g, "c")
    .replace(/ш/g, "s")
    .replace(/Ш/g, "s")
    .replace(/ж/g, "z")
    // Bilo je `/Ž/g` — latinično Ž usred ćiriličnog bloka. Ćirilično veliko Ж
    // tako nije bilo pokriveno nigde: preživelo bi mapiranje, pa bi ga kasnije
    // čišćenje ne-alfanumerika OBRISALO. Dokazano: "ЖИВОТ d.o.o." je davalo
    // "ivot" umesto "zivot" — firma tiho ispada iz dedupe ključa.
    .replace(/Ж/g, "z")
    .replace(/[а-яА-Я]/g, (ch) => {
      const cyrMap: Record<string, string> = {
        а: "a",
        б: "b",
        в: "v",
        г: "g",
        д: "d",
        е: "e",
        з: "z",
        и: "i",
        ј: "j",
        к: "k",
        л: "l",
        м: "m",
        н: "n",
        о: "o",
        п: "p",
        р: "r",
        с: "s",
        т: "t",
        у: "u",
        ф: "f",
        х: "h",
        ц: "c",
        А: "a",
        Б: "b",
        В: "v",
        Г: "g",
        Д: "d",
        Е: "e",
        З: "z",
        И: "i",
        Ј: "j",
        К: "k",
        Л: "l",
        М: "m",
        Н: "n",
        О: "o",
        П: "p",
        Р: "r",
        С: "s",
        Т: "t",
        У: "u",
        Ф: "f",
        Х: "h",
        Ц: "c",
      };
      return cyrMap[ch] ?? ch;
    });

  // 2. Zamena specifičnih latiničnih dijakritika
  normalized = normalized
    .replace(/đ/g, "dj")
    .replace(/Đ/g, "dj")
    .replace(/č/g, "c")
    .replace(/Č/g, "c")
    .replace(/ć/g, "c")
    .replace(/Ć/g, "c")
    .replace(/š/g, "s")
    .replace(/Š/g, "s")
    .replace(/ž/g, "z")
    .replace(/Ž/g, "z");

  // 3. Prebaci u mala slova
  normalized = normalized.toLowerCase();

  // 4. Uklanjanje pravnih oblika sa granicama reči
  normalized = normalized
    .replace(
      /\b(d\s*\.?\s*o\s*\.?\s*o\.?|p\s*\.?\s*r\.?|s\s*\.?\s*z\s*\.?\s*r\.?|s\s*\.?\s*t\s*\.?\s*r\.?|a\s*\.?\s*d\.?|o\s*\.?\s*d\.?|k\s*\.?\s*d\.?)\b/g,
      " ",
    )
    .replace(/\bpreduzetnik\b/g, " ");

  // 5. Uklanjanje znakova interpunkcije i simbola (ostaju slova, brojevi i razmaci)
  normalized = normalized.replace(/[^\w\s]/g, " ");

  // 6. Višestruki razmaci u jedan i trim
  return normalized.replace(/\s+/g, " ").trim();
}

/**
 * Normalizuje domen sajta za potrebe deduplikacije (§3, ključ #3).
 *
 * Pravila:
 * 1. Uklanja šemu (http://, https://, ftp://).
 * 2. Uklanja prefiks `www.`.
 * 3. Uklanja putanju (/...), query parametre (?...) i hash (#...).
 * 4. Uklanja port i završne kose crte.
 * 5. Prebacuje u mala slova i trimuje.
 *
 * Primeri iz stvarnih podataka (§5.2):
 * - "https://www.pekarasunce.rs/" -> "pekarasunce.rs"
 * - "http://salon-lepote.com/kontakt/cenovnik" -> "salon-lepote.com"
 * - "www.sredime.rs/salon/pro-team-borca" -> "sredime.rs"
 * - "https://dikidi.net/12345" -> "dikidi.net"
 * - "http://WWW.MOJSALON.CO.RS/" -> "mojsalon.co.rs"
 */
export function normalizeDomain(url?: string | null): string {
  if (!url) return "";

  let cleaned = url.trim().toLowerCase();
  if (!cleaned) return "";

  // Ukloni šemu
  cleaned = cleaned.replace(/^[a-zA-Z]+:\/\//, "");

  // Ukloni www. sa početka
  cleaned = cleaned.replace(/^www\./, "");

  // Izdvoj samo host domen pre prvog separatora putanje, upita, heša ili porta
  cleaned = cleaned.split(/[/?#:]/)[0] ?? "";

  // Ukloni eventualne zaostale tačke na krajevima
  return cleaned.replace(/^\.+|\.+$/g, "").trim();
}

/**
 * Normalizuje srpski broj telefona na kanonski E.164 oblik (`+381...`) za dedupe (§3, ključ #5).
 *
 * VAŽNO PRAVILO (§0, §5.1 zamka 4):
 * Ako unos sadrži tekstualne napomene (npr. "Proveriti na 011info"), nevalidne karaktere
 * ili se ne može pouzdano normalizovati na srpski broj, funkcija VRAĆA `undefined`.
 * NIKADA se ne vraća sirovi string "za svaki slučaj", jer bi nevalidan podatak ušao
 * u indeks za deduplikaciju i napravio lažne duplikate ili narušio pretragu.
 *
 * Primeri iz stvarnih tabela (§5.2):
 * - "0605020620" -> "+381605020620"
 * - "062/770-730" -> "+38162770730"
 * - "011/397-9965" -> "+381113979965"
 * - "0113187036" -> "+381113187036"
 * - "+381 64 123 4567" -> "+381641234567"
 * - "00381 11 397 9965" -> "+381113979965"
 * - "Proveriti na 011info" -> undefined
 * - "N/A" -> undefined
 * - "-" -> undefined
 */
export function normalizePhoneRs(raw?: string | null): string | undefined {
  if (!raw) return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Ako string sadrži bilo koja slova (latinična ili ćirilična), to je opis/napomena a ne broj
  if (/[a-zA-Z\u0400-\u04FF]/.test(trimmed)) {
    return undefined;
  }

  // Ukloni uobičajene separatore: razmake, kose crte, crtice, zagrade, tačke
  let digitsOnly = trimmed.replace(/[\s/().\-]/g, "");

  // Dozvoli samo cifre i eventualni vodeći plus
  if (!/^\+?\d+$/.test(digitsOnly)) {
    return undefined;
  }

  // Normalizuj prefikse pozivnog broja Srbije:
  if (digitsOnly.startsWith("+381")) {
    digitsOnly = digitsOnly.slice(4);
  } else if (digitsOnly.startsWith("00381")) {
    digitsOnly = digitsOnly.slice(5);
  } else if (digitsOnly.startsWith("381") && digitsOnly.length >= 10) {
    digitsOnly = digitsOnly.slice(3);
  }

  // Ako posle koda države stoji lokalna nula (npr. +381 064...), ukloni je
  if (digitsOnly.startsWith("0")) {
    digitsOnly = digitsOnly.slice(1);
  }

  // Srpski brojevi (fiksni i mobilni) bez koda države i bez vodeće nule imaju 8 ili 9 cifara
  if (digitsOnly.length < 8 || digitsOnly.length > 9) {
    return undefined;
  }

  // Pozivni brojevi u RS mreži počinju sa 1, 2, 3 (fiksna geografska), 6 (mobilna) ili 8 (besplatni/posebni)
  if (!/^[12368]/.test(digitsOnly)) {
    return undefined;
  }

  return `+381${digitsOnly}`;
}

/**
 * Normalizuje CompanyWall URL na stabilan identifikator putanje (§3, ključ #2).
 *
 * CompanyWall URL je najčešći jedinstveni ključ u uvezenim tabelama kada PIB nije dostupan.
 * Funkcija čisti tracking parametre, protokol, www i završne kose crte, zadržavajući
 * stabilnu putanju firme (npr. `companywall.rs/firma/pro-team-borca/MM4XqYgP`).
 *
 * Primeri iz stvarnih tabela (§5.2):
 * - "https://www.companywall.rs/firma/pro-team-borca/MM4XqYgP?utm_source=google" -> "companywall.rs/firma/pro-team-borca/MM4XqYgP"
 * - "http://companywall.rs/firma/ana-krasnic-pr-frizerski-salon/" -> "companywall.rs/firma/ana-krasnic-pr-frizerski-salon"
 * - "https://www.companywall.rs/firma/salon-lepote-ceca/MM9988" -> "companywall.rs/firma/salon-lepote-ceca/MM9988"
 * - "Proveriti na CompanyWall" -> undefined
 * - "N/A" -> undefined
 */
export function normalizeCompanyWallUrl(url?: string | null): string | undefined {
  if (!url) return undefined;

  let cleaned = url.trim();
  if (!cleaned) return undefined;

  // Proveri da li uopšte sadrži domen companywall.rs
  if (!/companywall\.rs/i.test(cleaned)) {
    return undefined;
  }

  // Ukloni protokol
  cleaned = cleaned.replace(/^[a-zA-Z]+:\/\//, "");

  // Ukloni www.
  cleaned = cleaned.replace(/^www\./i, "");

  // Ukloni query parametre i hash
  cleaned = cleaned.split(/[?#]/)[0] ?? "";

  // Ukloni završne kose crte
  cleaned = cleaned.replace(/\/+$/, "");

  // Mora odgovarati putanji companywall.rs/firma/...
  if (!/^companywall\.rs\/firma\/.+/i.test(cleaned)) {
    return undefined;
  }

  // Normalizuj domen i segment 'firma' u mala slova, zadrži ostatak putanje
  const parts = cleaned.split("/");
  parts[0] = parts[0].toLowerCase();
  if (parts[1]) parts[1] = parts[1].toLowerCase();

  return parts.join("/");
}

/**
 * Sve dozvoljene vrste signala (§2.5). Ista lista koja u `convex/schema.ts`
 * stoji kao `v.union` na `leadSignals.kind`.
 *
 * Postoji zato što `leadIcpRules.signalKind` NIJE union nego `v.string()` —
 * pravilo sme da referiše bilo šta. Pravilo koje referiše nepostojeću vrstu
 * signala se nikada ne okine, i to bez ijedne poruke: operater vidi pravilo
 * na ekranu, veruje da radi, a ono ćuti. Svaka mutacija koja upisuje ili menja
 * ICP pravilo MORA proveriti `signalKind` protiv ove liste i odbiti nepoznatu
 * vrednost (LM6).
 */
export const LEAD_SIGNAL_KINDS = [
  "nema_sajt",
  "koristi_third_party_booking",
  "samo_facebook",
  "samo_instagram",
  "visok_broj_recenzija",
  "novootvorena_firma",
  "landing_opened",
  "r_link_clicked",
  "komentar",
  "dm",
  "mention",
  "pitao_cenu",
  "ostalo",
] as const;

export type LeadSignalKind = (typeof LEAD_SIGNAL_KINDS)[number];

export function isKnownLeadSignalKind(kind: string): kind is LeadSignalKind {
  return (LEAD_SIGNAL_KINDS as readonly string[]).includes(kind);
}
