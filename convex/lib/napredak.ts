/**
 * ============================================================================
 * NAPREDAK — PRAVILA (B4, ui-boost-plan.md §6)
 * ============================================================================
 *
 * Ovde nema baze i nema Convex-a. Ulaz su DOGAĐAJI koji već postoje u bazi
 * (dodir, ishod, objava, moderacija…), svedeni na jedan oblik; izlaz je XP,
 * nivo, misije, niz, prstenovi i dostignuća. Razlog za podelu je isti kao kod
 * `notifications.ts`: sve ovo se može dokazati bez baze — `npm run
 * verify:napredak` gađa baš ove funkcije.
 *
 * ČETIRI PRAVILA KOJA SE NE KRŠE:
 *
 * 1. **Nema događaja → nema XP-a.** Nijedan broj ovde nije izmišljen; sve je
 *    zbir nad događajima koje je čovek stvarno izveo.
 * 2. **Događaj bez autora daje 0 XP.** Stari redovi koji ne pamte ko ih je
 *    napravio se ne pripisuju nikome.
 * 3. **Ponavljanje ne donosi XP** — kape po firmi, po danu i po radnji.
 * 4. **Isti ulaz daje isti izlaz**, bez obzira na redosled događaja i bez
 *    obzira na to da li se dani računaju jedan po jedan ili svi odjednom.
 *    Zato postoji tačno jedna funkcija koja jedan dan dodaje na zbir
 *    (`primeniDan`), i koriste je i zaključavanje u bazi i prikaz uživo.
 *
 * VREME je beogradsko i računa se ARITMETIKOM (pravilo EU: letnje vreme od
 * poslednje nedelje marta do poslednje nedelje oktobra, promena u 01:00 UTC).
 * Namerno bez `Intl`: `convex/` ne uvozi iz korenskog `lib/`, a račun je isti
 * u Convex-u, u Node-u i u pregledaču. Skripta provere ga ukršta sa
 * `lib/belgrade-time.ts`.
 */

import { HITNOST_RANG, mnozina, type Hitnost } from "./notifications";

export const SAT = 3_600_000;
export const DAN = 24 * SAT;

// ── vreme ────────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Poslednja nedelja meseca (0–11) u 01:00 UTC — trenutak promene sata u EU. */
function poslednjaNedeljaUtc(godina: number, mesec: number): number {
  const poslednji = new Date(Date.UTC(godina, mesec + 1, 0));
  const dan = poslednji.getUTCDate() - poslednji.getUTCDay();
  return Date.UTC(godina, mesec, dan, 1, 0, 0);
}

/** Minuti koje treba dodati na UTC da se dobije beogradsko vreme (60 ili 120). */
export function pomerajMin(ms: number): number {
  const godina = new Date(ms).getUTCFullYear();
  const letnje =
    ms >= poslednjaNedeljaUtc(godina, 2) && ms < poslednjaNedeljaUtc(godina, 9);
  return letnje ? 120 : 60;
}

/** Beogradski datum trenutka, kao „2026-10-11". */
export function danKljuc(ms: number): string {
  const d = new Date(ms + pomerajMin(ms) * 60_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const DAN_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcDan(dan: string): number {
  const m = DAN_RE.exec(dan);
  if (!m) throw new Error(`Neispravan dan: ${dan}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function kljucIzUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Da li je tekst ispravan datum u obliku koji ovaj fajl koristi. */
export function jeDanKljuc(tekst: string): boolean {
  if (!DAN_RE.test(tekst)) return false;
  return kljucIzUtc(utcDan(tekst)) === tekst;
}

/**
 * Beogradski „dan u `sat`:00" kao trenutak. Dva prolaza, jer pomeraj zavisi od
 * trenutka, a trenutak od pomeraja — isto kao `belgradeToEpoch`.
 */
export function lokalnoUEpohu(dan: string, sat = 0): number {
  const naivno = utcDan(dan) + sat * SAT;
  const prvi = naivno - pomerajMin(naivno) * 60_000;
  return naivno - pomerajMin(prvi) * 60_000;
}

export function pocetakDana(dan: string): number {
  return lokalnoUEpohu(dan, 0);
}

export function dodajDane(dan: string, n: number): string {
  return kljucIzUtc(utcDan(dan) + n * DAN);
}

/** Koliko je kalendarskih dana `a` posle `b` (negativno ako je pre). */
export function razlikaDana(a: string, b: string): number {
  return Math.round((utcDan(a) - utcDan(b)) / DAN);
}

/** 0 = nedelja … 6 = subota. */
export function danUNedelji(dan: string): number {
  return new Date(utcDan(dan)).getUTCDay();
}

export function ponedeljak(dan: string): string {
  return dodajDane(dan, -((danUNedelji(dan) + 6) % 7));
}

export function jeVikend(dan: string): boolean {
  const d = danUNedelji(dan);
  return d === 0 || d === 6;
}

/** Posle ovog sata dan koji još nije uračunat stavlja niz „u opasnost" (§6.5). */
export const SAT_OPASNOSTI = 17;

// ── događaj ──────────────────────────────────────────────────────────────────

export type VrstaDogadjaja =
  | "dodir"
  | "ishod"
  | "sledeci_korak"
  | "sastanak"
  | "sastanak_otkazan"
  | "ponuda"
  | "dobijen"
  | "uvoz"
  | "red"
  | "objava"
  | "clanak"
  | "moderacija"
  | "oglas"
  | "pravilo"
  | "dopuna";

/**
 * Jedan događaj iz bilo koje tabele, sveden na ono što pravila gledaju.
 *
 * `at` je kada se stvar DESILA, `upisanAt` kada je UPISANA. Razlikuju se samo
 * tamo gde čovek sme da unese vreme unazad (dodir, ishod); svuda drugde su
 * isti trenutak.
 */
export type Dogadjaj = {
  /** Stabilan ključ (Convex `_id`) — po njemu se pali tost i sprečava duplikat. */
  id: string;
  vrsta: VrstaDogadjaja;
  at: number;
  upisanAt: number;
  /** `null` = red ne pamti autora → 0 XP. */
  autor: string | null;
  /** Firma na koju se odnosi; po njoj idu kape „po firmi". */
  firma?: string;
  /** Kanal dodira, šifra ishoda, radnja moderacije, „zaostao" za sledeći korak. */
  podvrsta?: string;
  /** Predmet radnje kad nije firma: komentar (moderacija), termin (sastanak). */
  meta?: string;
  /** „1 po firmi": isti prelaz za tu firmu je već zabeležen ranije. */
  ranije?: boolean;
};

type Kapa = "firma_dan" | "firma_ikad" | "dan" | "nema";

export type PraviloXp = {
  xp: number;
  naslov: string;
  kapa: Kapa;
  /** Najviše ovoliko puta dnevno (samo uz `kapa: "dan"`). */
  dnevno?: number;
};

/** Jedino mesto na kom piše koliko šta vredi (§6.2). */
export const PRAVILA_XP: Record<VrstaDogadjaja, PraviloXp> = {
  dodir: { xp: 10, naslov: "Dodir", kapa: "firma_dan" },
  ishod: { xp: 15, naslov: "Ishod zabeležen", kapa: "firma_dan" },
  sledeci_korak: { xp: 5, naslov: "Sledeći korak postavljen", kapa: "firma_dan" },
  // Plan kaže „bez kape", ali pomeranje termina upisuje nov „dogovoren"
  // događaj — bez kape bi svako pomeranje vredelo 50 XP.
  sastanak: { xp: 50, naslov: "Sastanak dogovoren", kapa: "firma_dan" },
  sastanak_otkazan: { xp: 0, naslov: "Sastanak otkazan", kapa: "nema" },
  ponuda: { xp: 40, naslov: "Ponuda poslata", kapa: "firma_ikad" },
  dobijen: { xp: 250, naslov: "Posao dobijen", kapa: "firma_ikad" },
  uvoz: { xp: 20, naslov: "Uvoz primenjen", kapa: "nema" },
  red: { xp: 3, naslov: "Red uvoza rešen", kapa: "dan", dnevno: 100 },
  objava: { xp: 30, naslov: "Objava objavljena", kapa: "nema" },
  // „1 po članku" čuva izvor: članak nosi vreme PRVE objave, koje se ne menja.
  clanak: { xp: 60, naslov: "Članak objavljen", kapa: "nema" },
  moderacija: { xp: 5, naslov: "Moderacija", kapa: "dan", dnevno: 20 },
  oglas: { xp: 10, naslov: "Radnja na oglasima", kapa: "dan", dnevno: 10 },
  pravilo: { xp: 20, naslov: "Pravilo napravljeno", kapa: "nema" },
  // Dopuna nema svoj XP red u §6.2 — broji se za misiju i za „Detektiva".
  dopuna: { xp: 0, naslov: "Telefon dopunjen", kapa: "nema" },
};

/** Koliko dana posle događaja upis još donosi XP (jutarnji upis jučerašnjeg). */
export const KASNJENJE_DANA = 1;

/** Upisano više od `KASNJENJE_DANA` posle samog događaja. */
export function jeZakasneo(e: Dogadjaj): boolean {
  if (e.upisanAt <= e.at) return false;
  return razlikaDana(danKljuc(e.upisanAt), danKljuc(e.at)) > KASNJENJE_DANA;
}

/**
 * Poziv je dodir kanalom „poziv" ILI ishod „nije se javio". Traka poziva za
 * „Nije se javio" upisuje samo ishod, bez dodira — a to jeste bio poziv.
 */
export function jePoziv(e: Dogadjaj): boolean {
  return (
    (e.vrsta === "dodir" && e.podvrsta === "poziv") ||
    (e.vrsta === "ishod" && e.podvrsta === "nije_se_javio")
  );
}

// ── obračun dana ─────────────────────────────────────────────────────────────

export const BROJEVI_KLJUCEVI = [
  "dogadjaji",
  "dodiri",
  "pozivi",
  "ishodi",
  "sledeci",
  "zaostali",
  "sastanci",
  "ponude",
  "dobijeni",
  "uvozi",
  "redovi",
  "objave",
  "moderacije",
  "odgovori",
  "oglasi",
  "pravila",
  "dopune",
] as const;

export type KljucBroja = (typeof BROJEVI_KLJUCEVI)[number];
export type Brojevi = Record<KljucBroja, number>;

export function prazniBrojevi(): Brojevi {
  const out = {} as Brojevi;
  for (const k of BROJEVI_KLJUCEVI) out[k] = 0;
  return out;
}

export type RazlogNule =
  | "bez_autora"
  | "tudj"
  | "zakasnelo"
  | "beleska"
  | "kapa"
  | "otkazano"
  | "vec_ranije";

export type Stavka = {
  id: string;
  vrsta: VrstaDogadjaja;
  at: number;
  xp: number;
  naslov: string;
  /** Zašto je XP nula, kad jeste. */
  razlog?: RazlogNule;
};

export type ObracunDana = {
  dan: string;
  stavke: Stavka[];
  /** XP samo iz događaja — misije i bonus dodaje `primeniDan`. */
  xp: number;
  brojevi: Brojevi;
  /** Vremena jedinica po brojaču, rastuće: iz njih se čita KADA je cilj pao. */
  vremena: Record<KljucBroja, number[]>;
  /** Firme sa dodirom tog dana kojima ishod nije zabeležen istog dana. */
  dodirBezIshoda: number;
};

function poRedu(a: Dogadjaj, b: Dogadjaj): number {
  if (a.at !== b.at) return a.at - b.at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * XP i brojači jednog beogradskog dana za jednog korisnika.
 *
 * Redosled ulaza nije bitan: događaji se prvo poređaju po vremenu (pa po
 * ključu), i kapa uvek pripada prvom.
 */
export function obracunajDan(
  svi: readonly Dogadjaj[],
  korisnik: string,
  dan: string,
): ObracunDana {
  const dana = svi.filter((e) => danKljuc(e.at) === dan).sort(poRedu);

  const stavke: Stavka[] = [];
  const brojevi = prazniBrojevi();
  const vremena = {} as Record<KljucBroja, number[]>;
  for (const k of BROJEVI_KLJUCEVI) vremena[k] = [];
  const dodaj = (k: KljucBroja, at: number): void => {
    brojevi[k]++;
    vremena[k].push(at);
  };

  const otkazi = dana.filter(
    (e) => e.vrsta === "sastanak_otkazan" && e.autor === korisnik,
  );
  const vidjeno = new Set<string>();
  const poVrsti = new Map<VrstaDogadjaja, number>();
  const firmePoziv = new Set<string>();
  const firmeDodir = new Set<string>();
  const firmeIshod = new Set<string>();
  const firmeDopuna = new Set<string>();
  let xp = 0;

  for (const e of dana) {
    const pravilo = PRAVILA_XP[e.vrsta];
    const nula = (razlog?: RazlogNule): void => {
      stavke.push({
        id: e.id,
        vrsta: e.vrsta,
        at: e.at,
        xp: 0,
        naslov: pravilo.naslov,
        ...(razlog ? { razlog } : {}),
      });
    };

    if (e.autor === null) {
      nula("bez_autora");
      continue;
    }
    if (e.autor !== korisnik) {
      nula("tudj");
      continue;
    }
    if (jeZakasneo(e)) {
      nula("zakasnelo");
      continue;
    }
    if (e.vrsta === "sastanak_otkazan") {
      nula();
      continue;
    }

    const firma = e.firma ?? e.id;

    // Poziv se broji po firmi, nezavisno od toga koja je kapa pojela XP:
    // „Javio se" pa „Nije se javio" za istu firmu je i dalje jedan poziv.
    if (jePoziv(e) && !firmePoziv.has(firma)) {
      firmePoziv.add(firma);
      dodaj("pozivi", e.at);
    }

    if (e.vrsta === "dopuna") {
      if (!firmeDopuna.has(firma)) {
        firmeDopuna.add(firma);
        dodaj("dopune", e.at);
      }
      nula();
      continue;
    }

    // Beleška se u bazi vodi kao dodir (kanal „beleska"), ali nije kontakt.
    if (e.vrsta === "dodir" && e.podvrsta === "beleska") {
      nula("beleska");
      continue;
    }

    if (
      e.vrsta === "sastanak" &&
      otkazi.some(
        (o) =>
          o.firma === e.firma &&
          o.at >= e.at &&
          (o.meta === undefined || e.meta === undefined || o.meta === e.meta),
      )
    ) {
      nula("otkazano");
      continue;
    }

    if (pravilo.kapa === "firma_ikad" && e.ranije === true) {
      nula("vec_ranije");
      continue;
    }

    if (pravilo.kapa === "firma_dan" || pravilo.kapa === "firma_ikad") {
      const kljuc = `${e.vrsta}|${firma}`;
      if (vidjeno.has(kljuc)) {
        nula("kapa");
        continue;
      }
      vidjeno.add(kljuc);
    }

    // Sakrij → prikaži → sakrij nad istim komentarom je jedna moderacija.
    if (e.vrsta === "moderacija" && e.meta !== undefined) {
      const kljuc = `moderacija|${e.meta}`;
      if (vidjeno.has(kljuc)) {
        nula("kapa");
        continue;
      }
      vidjeno.add(kljuc);
    }

    if (pravilo.dnevno !== undefined) {
      const dosad = poVrsti.get(e.vrsta) ?? 0;
      if (dosad >= pravilo.dnevno) {
        nula("kapa");
        continue;
      }
      poVrsti.set(e.vrsta, dosad + 1);
    }

    stavke.push({
      id: e.id,
      vrsta: e.vrsta,
      at: e.at,
      xp: pravilo.xp,
      naslov: pravilo.naslov,
    });
    xp += pravilo.xp;
    dodaj("dogadjaji", e.at);

    switch (e.vrsta) {
      case "dodir":
        dodaj("dodiri", e.at);
        firmeDodir.add(firma);
        break;
      case "ishod":
        dodaj("ishodi", e.at);
        firmeIshod.add(firma);
        break;
      case "sledeci_korak":
        dodaj("sledeci", e.at);
        if (e.podvrsta === "zaostao") dodaj("zaostali", e.at);
        break;
      case "sastanak":
        dodaj("sastanci", e.at);
        break;
      case "ponuda":
        dodaj("ponude", e.at);
        break;
      case "dobijen":
        dodaj("dobijeni", e.at);
        break;
      case "uvoz":
        dodaj("uvozi", e.at);
        break;
      case "red":
        dodaj("redovi", e.at);
        break;
      case "objava":
      case "clanak":
        dodaj("objave", e.at);
        break;
      case "moderacija":
        dodaj("moderacije", e.at);
        if (e.podvrsta === "reply") dodaj("odgovori", e.at);
        break;
      case "oglas":
        dodaj("oglasi", e.at);
        break;
      case "pravilo":
        dodaj("pravila", e.at);
        break;
    }
  }

  let dodirBezIshoda = 0;
  for (const firma of firmeDodir) if (!firmeIshod.has(firma)) dodirBezIshoda++;

  return { dan, stavke, xp, brojevi, vremena, dodirBezIshoda };
}

// ── nivoi (§6.3) ─────────────────────────────────────────────────────────────

/** Koliko XP treba za prelaz sa nivoa `n` na `n + 1`. */
export function xpZaPrelaz(n: number): number {
  return 100 + 40 * (n - 1);
}

/** Ukupan XP na kom nivo `n` POČINJE (nivo 1 = 0, nivo 10 = 2.340). */
export function pragNivoa(n: number): number {
  if (n <= 1) return 0;
  return 100 * (n - 1) + 20 * (n - 1) * (n - 2);
}

export type Rang = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export function zvanjeZaNivo(n: number): string {
  if (n >= 30) return "Enigma";
  if (n >= 25) return "General";
  if (n >= 20) return "Komandant";
  if (n >= 15) return "Strateg";
  if (n >= 11) return "Specijalac";
  if (n >= 8) return "Agent";
  if (n >= 5) return "Operativac";
  if (n >= 3) return "Kadet";
  return "Regrut";
}

/**
 * Boja bedža. Vrednosti su namerno iste koje prima `LevelBadge` (`Tier` u
 * `components/app/system/reward-badges.tsx`) — bez tabele preslikavanja.
 */
export function rangZaNivo(n: number): Rang {
  if (n >= 30) return "diamond";
  if (n >= 20) return "platinum";
  if (n >= 11) return "gold";
  if (n >= 5) return "silver";
  return "bronze";
}

export type Nivo = {
  broj: number;
  zvanje: string;
  rang: Rang;
  /** Ukupan XP na kom ovaj nivo počinje, odnosno na kom počinje sledeći. */
  xpOd: number;
  xpDo: number;
  uNivou: number;
  zaSledeci: number;
  procenat: number;
};

export function nivoZaXp(ukupno: number): Nivo {
  const xp = Math.max(0, Math.floor(ukupno));
  let broj = 1;
  while (pragNivoa(broj + 1) <= xp) broj++;
  const xpOd = pragNivoa(broj);
  const xpDo = pragNivoa(broj + 1);
  return {
    broj,
    zvanje: zvanjeZaNivo(broj),
    rang: rangZaNivo(broj),
    xpOd,
    xpDo,
    uNivou: xp - xpOd,
    zaSledeci: xpDo - xp,
    procenat: Math.floor(((xp - xpOd) / (xpDo - xpOd)) * 100),
  };
}

// ── misije (§6.4) ────────────────────────────────────────────────────────────

export const KLJUCEVI_MISIJA = [
  "pozovi",
  "ishodi",
  "uvoz_redovi",
  "uvoz_pregled",
  "zaostali",
  "dopuni",
  "komentari",
  "objavi",
  "sastanak",
] as const;

export type KljucMisije = (typeof KLJUCEVI_MISIJA)[number];

export type Oblast = "pozivi" | "tok" | "uvoz" | "baza" | "kanali";

/** Ono što se zamrzava u `napredakDan` — ključ, cilj, XP i kuda vodi. */
export type MisijaDef = {
  kljuc: string;
  cilj: number;
  xp: number;
  oblast: string;
  veza: string;
};

type OpisMisije = {
  xp: number;
  oblast: Oblast;
  hitnost: Hitnost;
  veza: string;
  /** Brojač dana iz kog se čita napredak. */
  brojac: KljucBroja;
};

const MISIJE: Record<KljucMisije, OpisMisije> = {
  pozovi: { xp: 60, oblast: "pozivi", hitnost: "visoka", veza: "/leadovi", brojac: "pozivi" },
  ishodi: { xp: 40, oblast: "pozivi", hitnost: "srednja", veza: "/leadovi", brojac: "ishodi" },
  uvoz_redovi: { xp: 50, oblast: "uvoz", hitnost: "srednja", veza: "/leadovi/uvoz", brojac: "redovi" },
  uvoz_pregled: { xp: 50, oblast: "uvoz", hitnost: "srednja", veza: "/leadovi/uvoz", brojac: "uvozi" },
  zaostali: { xp: 50, oblast: "tok", hitnost: "visoka", veza: "/leadovi?tab=overdue", brojac: "zaostali" },
  dopuni: { xp: 40, oblast: "baza", hitnost: "niska", veza: "/leadovi?tab=gaps", brojac: "dopune" },
  komentari: { xp: 30, oblast: "kanali", hitnost: "srednja", veza: "/instagram/komentari", brojac: "odgovori" },
  objavi: { xp: 60, oblast: "kanali", hitnost: "niska", veza: "/instagram/objavi", brojac: "objave" },
  sastanak: { xp: 80, oblast: "tok", hitnost: "srednja", veza: "/leadovi?tab=meetings", brojac: "sastanci" },
};

export function jeKljucMisije(kljuc: string): kljuc is KljucMisije {
  return (KLJUCEVI_MISIJA as readonly string[]).includes(kljuc);
}

/** Podrazumevana veza misije — za proveru da ruta postoji na disku. */
export function vezaMisije(kljuc: KljucMisije): string {
  return MISIJE[kljuc].veza;
}

/** Koliko posla jedne vrste čeka, i kako ga zvono rangira i kuda vodi. */
export type Posao = { broj: number; hitnost?: Hitnost; veza?: string };

/**
 * Živo stanje iz kog se biraju misije — isti brojevi koje čita „Šta me čeka".
 * Misija se pravi samo kad je broj veći od nule.
 */
export type UlazMisija = {
  /** Firme u „Zovi sada": nikad dodirnute, sa procenom telefona ≥ 40 %. */
  zoviSada: number;
  /** Korisnik još nije zabeležio nijedan poziv — prvi cilj je jedan poziv. */
  bezPozivaDoSad: boolean;
  ukupnoDodela: number;
  zaostali: Posao;
  nereseniRedovi: Posao;
  uvoziUPregledu: Posao;
  bezTelefona: Posao;
  komentari: Posao;
  /** Povezan je bar jedan kanal sa kog se može objaviti. */
  mozeObjava: boolean;
  /** Dana od poslednje objave; `null` = nikad. */
  danaOdObjave: number | null;
  sastanciNedelje: number;
  ciljSastanci: number;
};

export const MISIJA_DNEVNO = 3;
export const BONUS_XP = 100;

/** FNV-1a — stabilan heš, da izbor između jednako hitnih zavisi samo od datuma. */
function hes(tekst: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Bira do tri misije za dan.
 *
 * Redosled: hitnost (kao u zvonu), pa najviše jedna misija po oblasti, a
 * jednako hitne razdvaja heš datuma — isti dan i isto stanje uvek daju iste
 * misije, a sutra dolazi druga iz iste grupe.
 */
export function generisiMisije(ulaz: UlazMisija, dan: string): MisijaDef[] {
  type Kandidat = { kljuc: KljucMisije; cilj: number; hitnost: Hitnost; veza: string };
  const kandidati: Kandidat[] = [];
  const dodaj = (kljuc: KljucMisije, cilj: number, posao?: Posao): void => {
    if (!Number.isFinite(cilj) || cilj <= 0) return;
    kandidati.push({
      kljuc,
      cilj: Math.trunc(cilj),
      hitnost: posao?.hitnost ?? MISIJE[kljuc].hitnost,
      veza: posao?.veza ?? MISIJE[kljuc].veza,
    });
  };

  if (ulaz.zoviSada > 0) {
    // Prvi poziv ikad: cilj je jedan, da prva radnja odmah zatvori misiju.
    dodaj("pozovi", ulaz.bezPozivaDoSad ? 1 : Math.min(5, ulaz.zoviSada));
  }
  if (ulaz.ukupnoDodela > 0) dodaj("ishodi", 3);
  dodaj("uvoz_redovi", Math.min(10, ulaz.nereseniRedovi.broj), ulaz.nereseniRedovi);
  if (ulaz.uvoziUPregledu.broj > 0) dodaj("uvoz_pregled", 1, ulaz.uvoziUPregledu);
  dodaj("zaostali", Math.min(3, ulaz.zaostali.broj), ulaz.zaostali);
  dodaj("dopuni", Math.min(3, ulaz.bezTelefona.broj), ulaz.bezTelefona);
  dodaj("komentari", Math.min(3, ulaz.komentari.broj), ulaz.komentari);
  if (
    ulaz.mozeObjava &&
    (ulaz.danaOdObjave === null || ulaz.danaOdObjave >= 7)
  ) {
    dodaj("objavi", 1);
  }
  if (ulaz.ukupnoDodela > 0 && ulaz.sastanciNedelje < ulaz.ciljSastanci) {
    dodaj("sastanak", 1);
  }

  kandidati.sort((a, b) => {
    const h = HITNOST_RANG[a.hitnost] - HITNOST_RANG[b.hitnost];
    if (h !== 0) return h;
    const ha = hes(`${dan}|${a.kljuc}`);
    const hb = hes(`${dan}|${b.kljuc}`);
    if (ha !== hb) return ha - hb;
    return a.kljuc < b.kljuc ? -1 : 1;
  });

  const izabrane: MisijaDef[] = [];
  const oblasti = new Set<Oblast>();
  for (const k of kandidati) {
    if (izabrane.length >= MISIJA_DNEVNO) break;
    const opis = MISIJE[k.kljuc];
    if (oblasti.has(opis.oblast)) continue;
    oblasti.add(opis.oblast);
    izabrane.push({
      kljuc: k.kljuc,
      cilj: k.cilj,
      xp: opis.xp,
      oblast: opis.oblast,
      veza: k.veza,
    });
  }
  return izabrane;
}

export function naslovMisije(def: { kljuc: string; cilj: number }): string {
  const n = def.cilj;
  switch (def.kljuc) {
    case "pozovi":
      return n === 1
        ? "Pozovi prvu firmu iz Zovi sada"
        : `Pozovi ${n} ${mnozina(n, "firmu", "firme", "firmi")} iz Zovi sada`;
    case "ishodi":
      return `Zabeleži ishod za ${n} ${mnozina(n, "poziv", "poziva", "poziva")}`;
    case "uvoz_redovi":
      return `Reši ${n} ${mnozina(n, "nerazrešen red", "nerazrešena reda", "nerazrešenih redova")}`;
    case "uvoz_pregled":
      return "Završi pregled zaglavljenog uvoza";
    case "zaostali":
      return `Očisti ${n} ${mnozina(n, "zaostao korak", "zaostala koraka", "zaostalih koraka")}`;
    case "dopuni":
      return `Dopuni telefon za ${n} ${mnozina(n, "firmu", "firme", "firmi")}`;
    case "komentari":
      return `Odgovori na ${n} ${mnozina(n, "komentar", "komentara", "komentara")}`;
    case "objavi":
      return "Objavi nešto ove nedelje";
    case "sastanak":
      return "Zakaži sastanak";
    default:
      return "Misija";
  }
}

export type MisijaStanje = MisijaDef & {
  naslov: string;
  napredak: number;
  preostalo: number;
  zavrsena: boolean;
  /** Vreme događaja koji je zatvorio misiju; `null` dok nije završena. */
  zavrsenaAt: number | null;
};

export type BonusStanje = {
  /** Bonus postoji samo kad dan ima sve tri misije. */
  moguc: boolean;
  osvojen: boolean;
  at: number | null;
};

/**
 * Napredak zamrznutih misija iz događaja tog dana.
 *
 * Misija NE nestaje kad se završi: ostaje u spisku sa `zavrsena: true`, jer je
 * spisak zamrznut u bazi, a iz događaja se računa samo dokle je stigla.
 */
export function oceniMisije(
  defs: readonly MisijaDef[],
  obracun: ObracunDana,
): { misije: MisijaStanje[]; bonus: BonusStanje; xp: number } {
  let xp = 0;
  const misije: MisijaStanje[] = defs.map((def) => {
    const brojac = jeKljucMisije(def.kljuc) ? MISIJE[def.kljuc].brojac : null;
    const izbrojano = brojac ? obracun.brojevi[brojac] : 0;
    const napredak = Math.min(def.cilj, izbrojano);
    const zavrsena = def.cilj > 0 && izbrojano >= def.cilj;
    const zavrsenaAt =
      zavrsena && brojac
        ? (obracun.vremena[brojac][def.cilj - 1] ?? null)
        : null;
    if (zavrsena) xp += def.xp;
    return {
      ...def,
      naslov: naslovMisije(def),
      napredak,
      preostalo: def.cilj - napredak,
      zavrsena,
      zavrsenaAt,
    };
  });

  const moguc = misije.length >= MISIJA_DNEVNO;
  const osvojen = moguc && misije.every((m) => m.zavrsena);
  let at: number | null = null;
  if (osvojen) {
    at = 0;
    for (const m of misije) at = Math.max(at, m.zavrsenaAt ?? 0);
    xp += BONUS_XP;
  }
  return { misije, bonus: { moguc, osvojen, at }, xp };
}

// ── podešavanja ──────────────────────────────────────────────────────────────

export type Podesavanja = {
  ukljucen: boolean;
  vikendNePrekida: boolean;
  ciljPozivi: number;
  ciljSastanci: number;
  ciljObjave: number;
};

export const PODRAZUMEVANO: Podesavanja = {
  ukljucen: true,
  vikendNePrekida: true,
  ciljPozivi: 25,
  ciljSastanci: 3,
  ciljObjave: 2,
};

/** Granice ciljeva — iste za mutaciju i za proveru. */
export const GRANICE_CILJA = {
  ciljPozivi: { min: 1, max: 500 },
  ciljSastanci: { min: 1, max: 50 },
  ciljObjave: { min: 1, max: 50 },
} as const;

// ── zbir (osnova) ────────────────────────────────────────────────────────────

export const BROJACI_KLJUCEVI = [
  "dodiri",
  "pozivi",
  "sastanci",
  "ponude",
  "dobijeni",
  "objave",
  "moderacije",
  "dopune",
  "uvozi",
  "redovi",
  "pravila",
  "danaSaXp",
] as const;

export type KljucBrojaca = (typeof BROJACI_KLJUCEVI)[number];
export type Brojaci = Record<KljucBrojaca, number>;

/**
 * Sve što se pamti o zaključenim danima. Istorija događaja se posle
 * zaključenja više nikad ne čita — čita se ovaj zbir.
 */
export type Osnova = {
  /** Poslednji dan koji je ušao u zbir; `null` = još nijedan. */
  do: string | null;
  xp: number;
  niz: number;
  nizDo: string | null;
  najduziNiz: number;
  brojaci: Brojaci;
  /** Tekuća nedelja (od ponedeljka `pon`) — iz nje se čitaju prstenovi. */
  nedelja: { pon: string | null; pozivi: number; sastanci: number; objave: number };
  serije: { uvekIshod: number; bezZaostataka: number };
  rekordi: {
    xpDan: number;
    xpDanKad: string | null;
    poziviDan: number;
    poziviDanKad: string | null;
    sastanciNedelja: number;
  };
  /** Dostignuće → vreme događaja koji ga je otključao. */
  otkljucano: Record<string, number>;
};

export function praznaOsnova(): Osnova {
  const brojaci = {} as Brojaci;
  for (const k of BROJACI_KLJUCEVI) brojaci[k] = 0;
  return {
    do: null,
    xp: 0,
    niz: 0,
    nizDo: null,
    najduziNiz: 0,
    brojaci,
    nedelja: { pon: null, pozivi: 0, sastanci: 0, objave: 0 },
    serije: { uvekIshod: 0, bezZaostataka: 0 },
    rekordi: {
      xpDan: 0,
      xpDanKad: null,
      poziviDan: 0,
      poziviDanKad: null,
      sastanciNedelja: 0,
    },
    otkljucano: {},
  };
}

function kopijaOsnove(o: Osnova): Osnova {
  return {
    ...o,
    brojaci: { ...o.brojaci },
    nedelja: { ...o.nedelja },
    serije: { ...o.serije },
    rekordi: { ...o.rekordi },
    otkljucano: { ...o.otkljucano },
  };
}

// ── dostignuća (§6.7) ────────────────────────────────────────────────────────

export type Retkost = "common" | "rare" | "epic" | "legendary";

type Mera =
  | { tip: "brojac"; brojac: KljucBrojaca; cilj: number }
  | { tip: "dan"; brojac: KljucBroja; cilj: number }
  | { tip: "nedelja_sastanci"; cilj: number }
  | { tip: "serija"; serija: "uvekIshod" | "bezZaostataka"; cilj: number }
  | { tip: "niz"; cilj: number }
  | { tip: "nivo"; cilj: number }
  | { tip: "stanje" };

export type Dostignuce = {
  kljuc: string;
  naziv: string;
  /** Šta treba uraditi — piše na zaključanom bedžu. */
  uslov: string;
  /** Iste vrednosti koje prima `AchievementBadge` (`Rarity`). */
  retkost: Retkost;
  mera: Mera;
};

export const DOSTIGNUCA: readonly Dostignuce[] = [
  { kljuc: "prvi_kontakt", naziv: "Prvi kontakt", uslov: "Zabeleži prvi dodir", retkost: "common", mera: { tip: "brojac", brojac: "dodiri", cilj: 1 } },
  { kljuc: "na_liniji", naziv: "Na liniji", uslov: "10 dodira u jednom danu", retkost: "rare", mera: { tip: "dan", brojac: "dodiri", cilj: 10 } },
  { kljuc: "maratonac_100", naziv: "Maratonac", uslov: "100 dodira", retkost: "rare", mera: { tip: "brojac", brojac: "dodiri", cilj: 100 } },
  { kljuc: "maratonac_500", naziv: "Maratonac II", uslov: "500 dodira", retkost: "epic", mera: { tip: "brojac", brojac: "dodiri", cilj: 500 } },
  { kljuc: "maratonac_1000", naziv: "Maratonac III", uslov: "1.000 dodira", retkost: "legendary", mera: { tip: "brojac", brojac: "dodiri", cilj: 1000 } },
  { kljuc: "zakazano", naziv: "Zakazano!", uslov: "Dogovori prvi sastanak", retkost: "common", mera: { tip: "brojac", brojac: "sastanci", cilj: 1 } },
  { kljuc: "pun_kalendar", naziv: "Pun kalendar", uslov: "5 sastanaka u jednoj nedelji", retkost: "epic", mera: { tip: "nedelja_sastanci", cilj: 5 } },
  { kljuc: "ponuda_poslata", naziv: "Ponuda poslata", uslov: "Pošalji prvu ponudu", retkost: "rare", mera: { tip: "brojac", brojac: "ponude", cilj: 1 } },
  { kljuc: "zatvarac", naziv: "Zatvarač", uslov: "Dobij prvi posao", retkost: "legendary", mera: { tip: "brojac", brojac: "dobijeni", cilj: 1 } },
  { kljuc: "uvek_ishod", naziv: "Uvek ishod", uslov: "7 dana zaredom svaki dodir ima ishod", retkost: "epic", mera: { tip: "serija", serija: "uvekIshod", cilj: 7 } },
  { kljuc: "bez_zaostataka", naziv: "Bez zaostataka", uslov: "7 dana bez zaostalih koraka", retkost: "rare", mera: { tip: "serija", serija: "bezZaostataka", cilj: 7 } },
  { kljuc: "cist_uvoz", naziv: "Čist uvoz", uslov: "Nijedan nerešen red ni u jednom uvozu", retkost: "rare", mera: { tip: "stanje" } },
  { kljuc: "detektiv", naziv: "Detektiv", uslov: "Dopuni telefon za 25 firmi", retkost: "rare", mera: { tip: "brojac", brojac: "dopune", cilj: 25 } },
  { kljuc: "glas_brenda", naziv: "Glas brenda", uslov: "10 objava", retkost: "rare", mera: { tip: "brojac", brojac: "objave", cilj: 10 } },
  { kljuc: "moderator", naziv: "Moderator", uslov: "50 moderacija", retkost: "rare", mera: { tip: "brojac", brojac: "moderacije", cilj: 50 } },
  { kljuc: "niz_7", naziv: "Niz 7", uslov: "7 dana u nizu", retkost: "rare", mera: { tip: "niz", cilj: 7 } },
  { kljuc: "niz_30", naziv: "Niz 30", uslov: "30 dana u nizu", retkost: "epic", mera: { tip: "niz", cilj: 30 } },
  { kljuc: "niz_100", naziv: "Niz 100", uslov: "100 dana u nizu", retkost: "legendary", mera: { tip: "niz", cilj: 100 } },
  { kljuc: "nivo_10", naziv: "Nivo 10", uslov: "Stigni do nivoa 10", retkost: "rare", mera: { tip: "nivo", cilj: 10 } },
  { kljuc: "nivo_20", naziv: "Nivo 20", uslov: "Stigni do nivoa 20", retkost: "epic", mera: { tip: "nivo", cilj: 20 } },
  { kljuc: "nivo_30", naziv: "Nivo 30", uslov: "Stigni do nivoa 30", retkost: "legendary", mera: { tip: "nivo", cilj: 30 } },
  { kljuc: "savrsena_nedelja", naziv: "Savršena nedelja", uslov: "Sva tri nedeljna prstena puna", retkost: "epic", mera: { tip: "stanje" } },
  { kljuc: "cuvar_budzeta", naziv: "Čuvar budžeta", uslov: "Uključi svoje prvo pravilo", retkost: "common", mera: { tip: "stanje" } },
];

export function jeKljucDostignuca(kljuc: string): boolean {
  return DOSTIGNUCA.some((d) => d.kljuc === kljuc);
}

// ── jedan dan na zbir ────────────────────────────────────────────────────────

/** Šta je izmereno u trenutku zamrzavanja dana (stanje, ne događaj). */
export type NaOtvaranju = {
  zaostali: number;
  nereseniRedovi: number;
  /** Postoji bar jedan primenjen uvoz — bez njega „čist uvoz" nije podvig. */
  imaPrimenjenUvoz: boolean;
  /** Neko brojanje je odsečeno → nepoznato, ne nula. */
  odseceno: boolean;
  at: number;
};

export type XpStavka = {
  id: string;
  vrsta: VrstaDogadjaja | "misija" | "bonus";
  naslov: string;
  xp: number;
  at: number;
};

export type UlazDana = {
  dan: string;
  obracun: ObracunDana;
  misije: readonly MisijaDef[];
  naOtvaranju: NaOtvaranju | null;
  podesavanja: Podesavanja;
  /**
   * Dan je prošao. Samo prošao dan sme da PREKINE niz i da presudi seriju
   * „uvek ishod" — današnji još može da se popravi.
   */
  finalan: boolean;
  /** Kada je napravljeno korisnikovo pravilo koje je sada uključeno. */
  aktivnoPraviloAt: number | null;
};

export type RezultatDana = {
  dan: string;
  /** Događaji + završene misije + bonus. */
  xp: number;
  uracunat: boolean;
  brojevi: Brojevi;
  misije: MisijaStanje[];
  bonus: BonusStanje;
  /** Sve što je tog dana donelo XP, po vremenu. */
  tok: XpStavka[];
};

/** Dan se računa u niz: bar jedna misija ili bar tri događaja sa XP-om (§6.5). */
export const DOGADJAJA_ZA_DAN = 3;

const PRAGOVI_BROJACA = DOSTIGNUCA.flatMap((d) =>
  d.mera.tip === "brojac"
    ? [{ kljuc: d.kljuc, brojac: d.mera.brojac, cilj: d.mera.cilj }]
    : [],
);

/** Brojač dana koji hrani kumulativni brojač istog imena. */
const DNEVNI_ZA_BROJAC: Partial<Record<KljucBrojaca, KljucBroja>> = {
  dodiri: "dodiri",
  pozivi: "pozivi",
  sastanci: "sastanci",
  ponude: "ponude",
  dobijeni: "dobijeni",
  objave: "objave",
  moderacije: "moderacije",
  dopune: "dopune",
  uvozi: "uvozi",
  redovi: "redovi",
  pravila: "pravila",
};

/**
 * Dodaje jedan dan na zbir. JEDINA funkcija koja to radi — zove je i
 * zaključavanje u bazi i prikaz uživo, pa „dan po dan" i „sve odjednom" ne
 * mogu da daju različit rezultat.
 */
export function primeniDan(
  pre: Osnova,
  ulaz: UlazDana,
): { osnova: Osnova; dan: RezultatDana } {
  const o = kopijaOsnove(pre);
  const { dan, obracun, podesavanja } = ulaz;
  const ocena = oceniMisije(ulaz.misije, obracun);

  // ── tok XP-a tog dana ──────────────────────────────────────────────────────
  const tok: XpStavka[] = [];
  for (const s of obracun.stavke) {
    if (s.xp > 0) {
      tok.push({ id: s.id, vrsta: s.vrsta, naslov: s.naslov, xp: s.xp, at: s.at });
    }
  }
  for (const m of ocena.misije) {
    if (m.zavrsena) {
      tok.push({
        id: `misija:${dan}:${m.kljuc}`,
        vrsta: "misija",
        naslov: "Misija završena",
        xp: m.xp,
        at: m.zavrsenaAt ?? pocetakDana(dan),
      });
    }
  }
  if (ocena.bonus.osvojen) {
    tok.push({
      id: `bonus:${dan}`,
      vrsta: "bonus",
      naslov: "Dnevni bonus",
      xp: BONUS_XP,
      at: ocena.bonus.at ?? pocetakDana(dan),
    });
  }
  // Misija i bonus dolaze POSLE događaja koji ih je zatvorio, i kad nose isto vreme.
  const rangVrste = (v: XpStavka["vrsta"]): number =>
    v === "bonus" ? 2 : v === "misija" ? 1 : 0;
  tok.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    const r = rangVrste(a.vrsta) - rangVrste(b.vrsta);
    if (r !== 0) return r;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const xpDana = obracun.xp + ocena.xp;
  const poslednjiAt = tok.length > 0 ? tok[tok.length - 1].at : pocetakDana(dan);

  const otkljucaj = (kljuc: string, at: number): void => {
    if (o.otkljucano[kljuc] === undefined) o.otkljucano[kljuc] = at;
  };

  // ── niz ────────────────────────────────────────────────────────────────────
  const zavrsenih = ocena.misije.filter((m) => m.zavrsena);
  const uracunat =
    zavrsenih.length > 0 || obracun.brojevi.dogadjaji >= DOGADJAJA_ZA_DAN;
  let uracunatAt = poslednjiAt;
  if (uracunat) {
    const kandidati: number[] = [];
    for (const m of zavrsenih) if (m.zavrsenaAt !== null) kandidati.push(m.zavrsenaAt);
    const treci = obracun.vremena.dogadjaji[DOGADJAJA_ZA_DAN - 1];
    if (treci !== undefined) kandidati.push(treci);
    if (kandidati.length > 0) uracunatAt = Math.min(...kandidati);
  }

  const nizPre = o.niz;
  if (uracunat) {
    o.niz += 1;
    o.nizDo = dan;
    o.najduziNiz = Math.max(o.najduziNiz, o.niz);
  } else if (
    ulaz.finalan &&
    !(podesavanja.vikendNePrekida && jeVikend(dan))
  ) {
    o.niz = 0;
  }
  for (const d of DOSTIGNUCA) {
    if (d.mera.tip === "niz" && nizPre < d.mera.cilj && o.niz >= d.mera.cilj) {
      otkljucaj(d.kljuc, uracunatAt);
    }
  }

  // ── kumulativni brojači ────────────────────────────────────────────────────
  for (const p of PRAGOVI_BROJACA) {
    const dnevni = DNEVNI_ZA_BROJAC[p.brojac];
    if (!dnevni) continue;
    const bilo = o.brojaci[p.brojac];
    const danas = obracun.brojevi[dnevni];
    if (bilo < p.cilj && bilo + danas >= p.cilj) {
      otkljucaj(p.kljuc, obracun.vremena[dnevni][p.cilj - bilo - 1] ?? poslednjiAt);
    }
  }
  for (const k of BROJACI_KLJUCEVI) {
    const dnevni = DNEVNI_ZA_BROJAC[k];
    if (dnevni) o.brojaci[k] += obracun.brojevi[dnevni];
  }
  if (xpDana > 0) o.brojaci.danaSaXp += 1;

  // ── dnevna dostignuća ──────────────────────────────────────────────────────
  for (const d of DOSTIGNUCA) {
    if (d.mera.tip !== "dan") continue;
    if (obracun.brojevi[d.mera.brojac] >= d.mera.cilj) {
      otkljucaj(
        d.kljuc,
        obracun.vremena[d.mera.brojac][d.mera.cilj - 1] ?? poslednjiAt,
      );
    }
  }

  // ── nedelja (prstenovi, „pun kalendar", „savršena nedelja") ────────────────
  const pon = ponedeljak(dan);
  if (o.nedelja.pon !== pon) {
    o.nedelja = { pon, pozivi: 0, sastanci: 0, objave: 0 };
  }
  const sastanakaPre = o.nedelja.sastanci;
  o.nedelja.pozivi += obracun.brojevi.pozivi;
  o.nedelja.sastanci += obracun.brojevi.sastanci;
  o.nedelja.objave += obracun.brojevi.objave;
  for (const d of DOSTIGNUCA) {
    if (d.mera.tip !== "nedelja_sastanci") continue;
    if (sastanakaPre < d.mera.cilj && o.nedelja.sastanci >= d.mera.cilj) {
      otkljucaj(
        d.kljuc,
        obracun.vremena.sastanci[d.mera.cilj - sastanakaPre - 1] ?? poslednjiAt,
      );
    }
  }
  if (
    o.nedelja.pozivi >= podesavanja.ciljPozivi &&
    o.nedelja.sastanci >= podesavanja.ciljSastanci &&
    o.nedelja.objave >= podesavanja.ciljObjave
  ) {
    otkljucaj("savrsena_nedelja", poslednjiAt);
  }
  o.rekordi.sastanciNedelja = Math.max(
    o.rekordi.sastanciNedelja,
    o.nedelja.sastanci,
  );

  // ── serije ─────────────────────────────────────────────────────────────────
  // „Uvek ishod" se presuđuje tek kad dan prođe: danas zabeležen dodir još
  // može da dobije ishod, pa bi prikaz uživo otključavao i zaključavao isto.
  if (ulaz.finalan && obracun.brojevi.dodiri > 0) {
    o.serije.uvekIshod =
      obracun.dodirBezIshoda === 0 ? o.serije.uvekIshod + 1 : 0;
    if (o.serije.uvekIshod >= 7) otkljucaj("uvek_ishod", poslednjiAt);
  }
  const otv = ulaz.naOtvaranju;
  if (otv !== null && !otv.odseceno) {
    o.serije.bezZaostataka = otv.zaostali === 0 ? o.serije.bezZaostataka + 1 : 0;
    if (o.serije.bezZaostataka >= 7) otkljucaj("bez_zaostataka", otv.at);
    if (otv.imaPrimenjenUvoz && otv.nereseniRedovi === 0) {
      otkljucaj("cist_uvoz", otv.at);
    }
  }
  if (ulaz.aktivnoPraviloAt !== null) {
    otkljucaj("cuvar_budzeta", ulaz.aktivnoPraviloAt);
  }

  // ── XP i nivoi ─────────────────────────────────────────────────────────────
  let tekuci = o.xp;
  for (const s of tok) {
    const pre = tekuci;
    tekuci += s.xp;
    for (const d of DOSTIGNUCA) {
      if (d.mera.tip !== "nivo") continue;
      const prag = pragNivoa(d.mera.cilj);
      if (pre < prag && tekuci >= prag) otkljucaj(d.kljuc, s.at);
    }
  }
  o.xp += xpDana;

  // ── rekordi ────────────────────────────────────────────────────────────────
  if (xpDana > o.rekordi.xpDan) {
    o.rekordi.xpDan = xpDana;
    o.rekordi.xpDanKad = dan;
  }
  if (obracun.brojevi.pozivi > o.rekordi.poziviDan) {
    o.rekordi.poziviDan = obracun.brojevi.pozivi;
    o.rekordi.poziviDanKad = dan;
  }

  o.do = dan;

  return {
    osnova: o,
    dan: {
      dan,
      xp: xpDana,
      uracunat,
      brojevi: obracun.brojevi,
      misije: ocena.misije,
      bonus: ocena.bonus,
      tok,
    },
  };
}

// ── prikaz ───────────────────────────────────────────────────────────────────

export type KljucPrstena = "pozivi" | "sastanci" | "objave";

export type Prsten = {
  kljuc: KljucPrstena;
  naziv: string;
  vrednost: number;
  cilj: number;
  procenat: number;
  pun: boolean;
};

/** Tri nedeljna prstena (§6.6). Uz svaki idu i broj i procenat. */
export function prstenovi(
  nedelja: { pozivi: number; sastanci: number; objave: number },
  ciljevi: Podesavanja,
): Prsten[] {
  const jedan = (
    kljuc: KljucPrstena,
    naziv: string,
    vrednost: number,
    cilj: number,
  ): Prsten => ({
    kljuc,
    naziv,
    vrednost,
    cilj,
    procenat: cilj > 0 ? Math.min(100, Math.floor((vrednost / cilj) * 100)) : 0,
    pun: cilj > 0 && vrednost >= cilj,
  });
  return [
    jedan("pozivi", "Pozivi", nedelja.pozivi, ciljevi.ciljPozivi),
    jedan("sastanci", "Sastanci", nedelja.sastanci, ciljevi.ciljSastanci),
    jedan("objave", "Objave", nedelja.objave, ciljevi.ciljObjave),
  ];
}

export type NizStanje = {
  dani: number;
  najduzi: number;
  danasUracunat: boolean;
  /**
   * Trenutak (17:00 po Beogradu) posle kog je niz „u opasnosti"; `null` kad
   * nema šta da se izgubi. Sat čita KLIJENT — upit ne sme da zavisi od sata.
   */
  opasnostOd: number | null;
  vikendNePrekida: boolean;
};

/** Poziva ga klijent sa svojim satom. */
export function nizUOpasnosti(
  niz: Pick<NizStanje, "opasnostOd">,
  now: number,
): boolean {
  return niz.opasnostOd !== null && now >= niz.opasnostOd;
}

export type VrstaProslave = "misija" | "bonus" | "nivo" | "dostignuce";

export type Proslava = {
  /** `misija:<dan>:<ključ>`, `bonus:<dan>`, `nivo:<n>`, `dostignuce:<ključ>`. */
  kljuc: string;
  vrsta: VrstaProslave;
  naslov: string;
  xp: number | null;
  retkost: Retkost | null;
  at: number;
};

/** Šta je korisnik već video (redovi `napredakPotvrde`). */
export type Potvrde = {
  /** Ključevi potvrđeni za dan sidra: `misija:<ključ>`, `bonus`. */
  dnevne: readonly string[];
  /** Trajni ključevi: `dostignuce:<ključ>`. */
  trajne: readonly string[];
  /** Najviši nivo čija je proslava viđena (1 = nijedna). */
  nivo: number;
};

/** Opseg potvrda koje ne zastarevaju (nivo, dostignuća); ostale nose datum. */
export const OPSEG_TRAJNO = "trajno";

/** Gde se potvrda jedne proslave čuva; `null` za ključ koji sistem ne pravi. */
export function parsirajProslavu(
  kljuc: string,
): { opseg: string; kljuc: string; vrednost?: number } | null {
  const delovi = kljuc.split(":");
  if (delovi[0] === "misija" && delovi.length === 3) {
    if (!jeDanKljuc(delovi[1]) || !jeKljucMisije(delovi[2])) return null;
    return { opseg: delovi[1], kljuc: `misija:${delovi[2]}` };
  }
  if (delovi[0] === "bonus" && delovi.length === 2) {
    if (!jeDanKljuc(delovi[1])) return null;
    return { opseg: delovi[1], kljuc: "bonus" };
  }
  if (delovi[0] === "nivo" && delovi.length === 2) {
    const n = Number(delovi[1]);
    if (!Number.isInteger(n) || n < 2 || n > 999) return null;
    return { opseg: OPSEG_TRAJNO, kljuc: "nivo", vrednost: n };
  }
  if (delovi[0] === "dostignuce" && delovi.length === 2) {
    if (!jeKljucDostignuca(delovi[1])) return null;
    return { opseg: OPSEG_TRAJNO, kljuc: `dostignuce:${delovi[1]}` };
  }
  return null;
}

export type Stanje =
  | { ukljucen: false; podesavanja: Podesavanja }
  | {
      ukljucen: true;
      /** `false`: dan nije zamrznut ili zaključavanje kasni — XP je donja granica. */
      spremno: boolean;
      /** Neko čitanje je udarilo u granicu — broj je donja granica. */
      odseceno: boolean;
      /** Beogradski datum sidra; `null` pre prvog zamrzavanja. */
      dan: string | null;
      prviDan: boolean;
      xp: { ukupno: number; danas: number };
      nivo: Nivo;
      niz: NizStanje;
      misije: Array<{
        kljuc: string;
        naslov: string;
        oblast: string;
        cilj: number;
        napredak: number;
        preostalo: number;
        xp: number;
        zavrsena: boolean;
        veza: string;
      }>;
      bonus: { xp: number; moguc: boolean; osvojen: boolean; preostaloMisija: number };
      prstenovi: Prsten[];
      poslednji: XpStavka[];
      proslave: Proslava[];
      /** Najbliže zaključano dostignuće — „još 3 do…". */
      sledece: { kljuc: string; naziv: string; vrednost: number; cilj: number } | null;
      podesavanja: Podesavanja;
    };

export function stanjeIskljuceno(podesavanja: Podesavanja): Stanje {
  return { ukljucen: false, podesavanja };
}

export type UlazIzvedi = {
  korisnik: string;
  /** Dan poslednjeg zamrzavanja; `null` = još nijednom. */
  sidro: string | null;
  prviDan: boolean;
  odseceno: boolean;
  /** Zbir zaključenih dana. */
  osnova: Osnova;
  /** Događaji od dana pre sidra nadalje (otvoren prozor). */
  dogadjaji: readonly Dogadjaj[];
  misijePoDanu: Readonly<Record<string, readonly MisijaDef[]>>;
  naOtvaranjuPoDanu: Readonly<Record<string, NaOtvaranju>>;
  aktivnoPraviloAt: number | null;
  podesavanja: Podesavanja;
  potvrde: Potvrde;
};

/** Koliko dana posle sidra se još gleda (tab otvoren preko ponoći, vikend). */
const MAKS_DANA_POSLE_SIDRA = 7;
export const POSLEDNJIH = 12;

type Otvoreno = {
  osnova: Osnova;
  dani: RezultatDana[];
  danas: RezultatDana | null;
  spremno: boolean;
};

/**
 * Prolazi otvorene dane (dan pre sidra, sidro i sve posle njega za šta ima
 * događaja) i dodaje ih na zbir — u memoriji, ništa se ne pamti.
 */
function otvori(ulaz: UlazIzvedi): Otvoreno {
  const { sidro } = ulaz;
  if (sidro === null) {
    return { osnova: ulaz.osnova, dani: [], danas: null, spremno: false };
  }

  let prvi = dodajDane(sidro, -1);
  if (ulaz.osnova.do !== null && ulaz.osnova.do >= prvi) {
    prvi = dodajDane(ulaz.osnova.do, 1);
  }
  const najdalje = dodajDane(sidro, MAKS_DANA_POSLE_SIDRA);
  let poslednji = sidro;
  for (const e of ulaz.dogadjaji) {
    if (e.autor !== ulaz.korisnik) continue;
    const d = danKljuc(e.at);
    if (d > poslednji && d <= najdalje) poslednji = d;
  }

  let osnova = ulaz.osnova;
  const dani: RezultatDana[] = [];
  let danas: RezultatDana | null = null;
  for (let dan = prvi; dan <= poslednji; dan = dodajDane(dan, 1)) {
    const rez = primeniDan(osnova, {
      dan,
      obracun: obracunajDan(ulaz.dogadjaji, ulaz.korisnik, dan),
      misije: ulaz.misijePoDanu[dan] ?? [],
      naOtvaranju: ulaz.naOtvaranjuPoDanu[dan] ?? null,
      podesavanja: ulaz.podesavanja,
      finalan: dan < sidro,
      aktivnoPraviloAt: ulaz.aktivnoPraviloAt,
    });
    osnova = rez.osnova;
    dani.push(rez.dan);
    if (dan === sidro) danas = rez.dan;
  }

  return {
    osnova,
    dani,
    danas,
    spremno: ulaz.osnova.do !== null && ulaz.osnova.do >= dodajDane(sidro, -2),
  };
}

function vrednostMere(
  mera: Mera,
  osnova: Osnova,
  nivo: number,
  danas: RezultatDana | null,
): { vrednost: number; cilj: number } | null {
  switch (mera.tip) {
    case "brojac":
      return { vrednost: osnova.brojaci[mera.brojac], cilj: mera.cilj };
    case "dan":
      return { vrednost: danas?.brojevi[mera.brojac] ?? 0, cilj: mera.cilj };
    case "nedelja_sastanci":
      return { vrednost: osnova.nedelja.sastanci, cilj: mera.cilj };
    case "serija":
      return { vrednost: osnova.serije[mera.serija], cilj: mera.cilj };
    case "niz":
      return { vrednost: osnova.niz, cilj: mera.cilj };
    case "nivo":
      return { vrednost: nivo, cilj: mera.cilj };
    case "stanje":
      return null;
  }
}

/** XP, nivo, niz, misije, prstenovi i proslave — iz zbira i otvorenih dana. */
export function izvedi(ulaz: UlazIzvedi): Stanje {
  const { podesavanja } = ulaz;
  if (!podesavanja.ukljucen) return stanjeIskljuceno(podesavanja);

  const otv = otvori(ulaz);
  const o = otv.osnova;
  const nivo = nivoZaXp(o.xp);
  const sidro = ulaz.sidro;
  const danas = otv.danas;

  const danasUracunat = danas?.uracunat ?? false;
  const cuvaVikend =
    sidro !== null && podesavanja.vikendNePrekida && jeVikend(sidro);
  const opasnostOd =
    sidro !== null && !danasUracunat && o.niz > 0 && !cuvaVikend
      ? lokalnoUEpohu(sidro, SAT_OPASNOSTI)
      : null;

  const misije = (danas?.misije ?? []).map((m) => ({
    kljuc: m.kljuc,
    naslov: m.naslov,
    oblast: m.oblast,
    cilj: m.cilj,
    napredak: m.napredak,
    preostalo: m.preostalo,
    xp: m.xp,
    zavrsena: m.zavrsena,
    veza: m.veza,
  }));

  const nedelja =
    sidro !== null && o.nedelja.pon === ponedeljak(sidro)
      ? o.nedelja
      : { pozivi: 0, sastanci: 0, objave: 0 };

  // Dani su poređani rastuće, a tok svakog dana po vremenu (misija i bonus
  // posle događaja koji ih je zatvorio) — obrnuto od toga je „najnovije prvo".
  const poslednji: XpStavka[] = [];
  for (const d of otv.dani) poslednji.push(...d.tok);
  poslednji.reverse();

  // ── proslave: zarađeno, a još neviđeno ─────────────────────────────────────
  const proslave: Proslava[] = [];
  if (otv.spremno && danas !== null && sidro !== null) {
    for (const m of danas.misije) {
      if (!m.zavrsena || ulaz.potvrde.dnevne.includes(`misija:${m.kljuc}`)) continue;
      proslave.push({
        kljuc: `misija:${sidro}:${m.kljuc}`,
        vrsta: "misija",
        naslov: m.naslov,
        xp: m.xp,
        retkost: null,
        at: m.zavrsenaAt ?? pocetakDana(sidro),
      });
    }
    if (danas.bonus.osvojen && !ulaz.potvrde.dnevne.includes("bonus")) {
      proslave.push({
        kljuc: `bonus:${sidro}`,
        vrsta: "bonus",
        naslov: "Dnevni bonus",
        xp: BONUS_XP,
        retkost: null,
        at: danas.bonus.at ?? pocetakDana(sidro),
      });
    }
  }
  if (otv.spremno) {
    if (nivo.broj > Math.max(1, ulaz.potvrde.nivo)) {
      proslave.push({
        kljuc: `nivo:${nivo.broj}`,
        vrsta: "nivo",
        naslov: `Nivo ${nivo.broj} · ${nivo.zvanje}`,
        xp: null,
        retkost: null,
        at: poslednji[0]?.at ?? 0,
      });
    }
    for (const d of DOSTIGNUCA) {
      const at = o.otkljucano[d.kljuc];
      if (at === undefined) continue;
      if (ulaz.potvrde.trajne.includes(`dostignuce:${d.kljuc}`)) continue;
      proslave.push({
        kljuc: `dostignuce:${d.kljuc}`,
        vrsta: "dostignuce",
        naslov: d.naziv,
        xp: null,
        retkost: d.retkost,
        at,
      });
    }
  }
  proslave.sort((a, b) => a.at - b.at);

  // ── najbliže zaključano dostignuće ─────────────────────────────────────────
  let sledece: { kljuc: string; naziv: string; vrednost: number; cilj: number } | null = null;
  let najboljiUdeo = -1;
  for (const d of DOSTIGNUCA) {
    if (o.otkljucano[d.kljuc] !== undefined) continue;
    const m = vrednostMere(d.mera, o, nivo.broj, danas);
    if (m === null || m.cilj <= 0) continue;
    const udeo = Math.min(1, m.vrednost / m.cilj);
    if (udeo > najboljiUdeo) {
      najboljiUdeo = udeo;
      sledece = { kljuc: d.kljuc, naziv: d.naziv, vrednost: m.vrednost, cilj: m.cilj };
    }
  }

  const zavrsenih = misije.filter((m) => m.zavrsena).length;

  return {
    ukljucen: true,
    spremno: otv.spremno,
    odseceno: ulaz.odseceno,
    dan: sidro,
    prviDan: ulaz.prviDan,
    xp: { ukupno: o.xp, danas: danas?.xp ?? 0 },
    nivo,
    niz: {
      dani: o.niz,
      najduzi: o.najduziNiz,
      danasUracunat,
      opasnostOd,
      vikendNePrekida: podesavanja.vikendNePrekida,
    },
    misije,
    bonus: {
      xp: BONUS_XP,
      moguc: danas?.bonus.moguc ?? false,
      osvojen: danas?.bonus.osvojen ?? false,
      preostaloMisija: misije.length - zavrsenih,
    },
    prstenovi: prstenovi(nedelja, podesavanja),
    poslednji: poslednji.slice(0, POSLEDNJIH),
    proslave,
    sledece,
    podesavanja,
  };
}

// ── profil ───────────────────────────────────────────────────────────────────

export const MAPA_DANA = 84;

export type Profil =
  | { ukljucen: false }
  | {
      ukljucen: true;
      spremno: boolean;
      dostignuca: Array<{
        kljuc: string;
        naziv: string;
        uslov: string;
        retkost: Retkost;
        otkljucanoAt: number | null;
        napredak: { vrednost: number; cilj: number } | null;
      }>;
      otkljucano: number;
      ukupno: number;
      rekordi: Array<{ kljuc: string; naziv: string; vrednost: number; dan: string | null }>;
      /** 84 dana, gusto (i dani sa nulom), zaključno sa danom sidra. */
      mapa: { od: string | null; do: string | null; maks: number; dani: Array<{ dan: string; xp: number }> };
      zbir: {
        dodiri: number;
        pozivi: number;
        sastanci: number;
        objave: number;
        moderacije: number;
        dopune: number;
        danaSaXp: number;
      };
    };

export type UlazProfil = UlazIzvedi & {
  /** XP zaključenih dana (redovi `napredakDan`), za mapu aktivnosti. */
  zakljuceniDani: ReadonlyArray<{ dan: string; xp: number }>;
};

/** Dostignuća, lični rekordi i mapa aktivnosti za 12 nedelja. */
export function izvediProfil(ulaz: UlazProfil): Profil {
  if (!ulaz.podesavanja.ukljucen) return { ukljucen: false };

  const otv = otvori(ulaz);
  const o = otv.osnova;
  const nivo = nivoZaXp(o.xp);

  const dostignuca = DOSTIGNUCA.map((d) => {
    const at = o.otkljucano[d.kljuc];
    return {
      kljuc: d.kljuc,
      naziv: d.naziv,
      uslov: d.uslov,
      retkost: d.retkost,
      otkljucanoAt: at === undefined ? null : at,
      napredak:
        at === undefined ? vrednostMere(d.mera, o, nivo.broj, otv.danas) : null,
    };
  });

  const xpPoDanu = new Map<string, number>();
  for (const z of ulaz.zakljuceniDani) xpPoDanu.set(z.dan, z.xp);
  // Otvoreni dani imaju prednost: oni su izvedeni iz događaja upravo sada.
  for (const d of otv.dani) xpPoDanu.set(d.dan, d.xp);

  const dani: Array<{ dan: string; xp: number }> = [];
  let maks = 0;
  if (ulaz.sidro !== null) {
    for (let i = MAPA_DANA - 1; i >= 0; i--) {
      const dan = dodajDane(ulaz.sidro, -i);
      const xp = xpPoDanu.get(dan) ?? 0;
      maks = Math.max(maks, xp);
      dani.push({ dan, xp });
    }
  }

  return {
    ukljucen: true,
    spremno: otv.spremno,
    dostignuca,
    otkljucano: dostignuca.filter((d) => d.otkljucanoAt !== null).length,
    ukupno: dostignuca.length,
    rekordi: [
      { kljuc: "xp_dan", naziv: "Najviše XP u danu", vrednost: o.rekordi.xpDan, dan: o.rekordi.xpDanKad },
      { kljuc: "pozivi_dan", naziv: "Najviše poziva u danu", vrednost: o.rekordi.poziviDan, dan: o.rekordi.poziviDanKad },
      { kljuc: "niz", naziv: "Najduži niz", vrednost: o.najduziNiz, dan: null },
      { kljuc: "sastanci_nedelja", naziv: "Najviše sastanaka u nedelji", vrednost: o.rekordi.sastanciNedelja, dan: null },
    ],
    mapa: {
      od: dani.length > 0 ? dani[0].dan : null,
      do: ulaz.sidro,
      maks,
      dani,
    },
    zbir: {
      dodiri: o.brojaci.dodiri,
      pozivi: o.brojaci.pozivi,
      sastanci: o.brojaci.sastanci,
      objave: o.brojaci.objave,
      moderacije: o.brojaci.moderacije,
      dopune: o.brojaci.dopune,
      danaSaXp: o.brojaci.danaSaXp,
    },
  };
}
