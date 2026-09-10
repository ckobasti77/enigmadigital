/**
 * ============================================================================
 * „ŠTA ME ČEKA" — PROIZVOĐAČI ZADATAKA (A2, app-ux-plan.md §2 N)
 * ============================================================================
 *
 * Ovde nema baze. Ulaz je SNIMAK živog stanja (brojevi koje je
 * `notificationsStore.staMeCeka` pročitao), izlaz je spisak zadataka. Razlog za
 * podelu je što se ovaj deo može dokazati bez Convex-a — `npm run
 * verify:obavestenja` gađa baš ove funkcije.
 *
 * TRI PRAVILA KOJA SE NE KRŠE:
 *
 * 1. **Zadatak sa brojem 0 se ne pravi.** Ne postoji „0 zaostalih koraka" kao
 *    stavka; prazan spisak znači „nema posla" i tako i piše. Pravilo je
 *    sprovedeno na jednom mestu (`dodaj`), pa nijedan proizvođač ne mora da ga
 *    pamti.
 * 2. **Nepoznato nije nula** (§0 pravilo 3). Brojač koji je odsečen vraća
 *    `odsecen: true` i broj se čita kao donja granica, nikad kao tačan.
 * 3. **Svaki broj ima imenilac** (§4 kriterijum 5): „39 firmi bez broja" nosi
 *    „od 210 firmi u bazi". Bez imenioca broj nije podatak nego utisak.
 *
 * Ništa se ne skladišti kao obaveštenje — izvedeno ne može da zastari. Jedino
 * što se pamti je čovekova odluka da nešto skloni (`notificationState`), i ona
 * se primenjuje na kraju, u `podeliPoStanju`.
 */

export type Hitnost = "visoka" | "srednja" | "niska";

/** Redosled u panelu i u bloku „Danas": visoka pre srednje pre niske. */
export const HITNOST_RANG: Record<Hitnost, number> = {
  visoka: 0,
  srednja: 1,
  niska: 2,
};

export type Zadatak = {
  /**
   * Stabilan ključ po kom se pamti „odloži" / „sakrij". Kada zadatak postoji u
   * više primeraka (jedna integracija u grešci ≠ druga), ključ nosi i taj
   * deo: `sinhronizacija.greska:ga4`.
   */
  kljuc: string;
  naslov: string;
  broj: number;
  hitnost: Hitnost;
  /** Adresa u aplikaciji na koju vodi jedina radnja stavke. */
  veza: string;
  /** Natpis te radnje („Otvori pregled", „Sinhronizuj", „Zovi"). */
  radnja: string;
  /** Imenilac uz broj („od 210 firmi u bazi"). */
  imenilac: string | null;
  /** Stavka bočne navigacije koja zbog ovog zadatka nosi bedž. */
  bedz: string;
  /** Brojanje je odsečeno — `broj` je donja granica, ne tačan broj. */
  odsecen: boolean;
};

/** Stanje koje je čovek upisao za jedan ključ (red u `notificationState`). */
export type StanjeZadatka = {
  kljuc: string;
  odlozenoDo?: number;
  sakrivenoAt?: number;
  /**
   * Koliki je broj bio u trenutku sakrivanja. Sakriveno ostaje sakriveno dok
   * posao ne NARASTE: sakrivanje „39 firmi bez broja" ne sme da ućutka i onu
   * četrdesetu. Bez ove vrednosti sakrivanje važi bez roka.
   */
  brojPriSakrivanju?: number;
};

const SAT = 60 * 60 * 1000;
const DAN = 24 * SAT;

/** Koliko dugo posao sme da stoji pre nego što hitnost poraste (§2 N). */
export const PRAG_HITNO_MS = DAN;

/** Koliko traje „Odloži 1 dan". */
export const ODLAGANJE_MS = DAN;

/** Kratka imena integracija — ona koja staju u rečenicu „… ne sinhronizuje se". */
export const INTEGRACIJA_NAZIV: Record<string, string> = {
  ga4: "GA4",
  meta_ig: "Instagram",
  meta_fb: "Facebook stranica",
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  youtube: "YouTube",
  openreply: "OpenReply",
  threads: "Threads",
  leads: "Lead mašina",
  google_business: "Google Business",
};

/**
 * Ključevi koje sistem uopšte ume da napravi. Mutacije („odloži", „sakrij")
 * odbijaju sve ostalo: red upisan za ključ koji nijedan proizvođač ne pravi je
 * red koji niko nikad neće pročitati, a stajao bi u bazi zauvek.
 *
 * Ključ sa dvotačkom je porodica (`sinhronizacija.greska:ga4`) — proverava se
 * deo pre dvotačke.
 */
export const POZNATI_KLJUCEVI: readonly string[] = [
  "uvoz.u_pregledu",
  "uvoz.nerazreseni",
  "sinhronizacija.greska",
  "leadovi.zaostali",
  "leadovi.sastanci",
  "leadovi.nikad_dodirnut",
  "leadovi.bez_telefona",
  "leadovi.neocenjen_sajt",
  "kanali.bez_odgovora",
];

export function jePoznatKljuc(kljuc: string): boolean {
  const koren = kljuc.split(":")[0];
  return POZNATI_KLJUCEVI.includes(koren);
}

// ── ulaz: snimak živog stanja ────────────────────────────────────────────────

export type UvozUPregledu = {
  id: string;
  fileName: string;
  uploadedAt: number;
};

export type UvozSaNerazresenim = {
  id: string;
  fileName: string;
  broj: number;
  odsecen: boolean;
};

/**
 * Integracija koja ne radi. `posledniUspehAt` je poslednji put kada je nešto
 * STVARNO stiglo — `null` znači „nikad", što nije isto što i „davno" i ne sme
 * da se prikaže kao broj dana.
 */
export type IntegracijaUKvaru = {
  provider: string;
  razlog: "greska" | "istekao_token" | "zastao";
  posledniUspehAt: number | null;
  /** Kada je kvar primećen (kraj neuspele sinhronizacije ili njen početak). */
  primecenAt: number;
};

export type SastanakStavka = {
  at: number;
  firma: string | null;
};

export type KanalStavka = {
  /** Deo ključa posle `kanali.bez_odgovora:` — `ig_komentari`, `poruke`, … */
  kljuc: string;
  naslov: string;
  broj: number;
  veza: string;
  radnja: string;
  bedz: string;
  imenilac: string | null;
  odsecen: boolean;
};

export type Snimak = {
  now: number;
  /**
   * Minuti koje treba DODATI na UTC da bi se dobilo lokalno vreme operatera
   * (Beograd leti: +120). Server je UTC, a „danas" i „u 14:30" su lokalni
   * pojmovi — bez ovoga bi sastanak u 00:30 bio jučerašnji.
   */
  pomerajMin: number;

  uvoziUPregledu: UvozUPregledu[];
  uvoziSaNerazresenim: UvozSaNerazresenim[];
  uvoziOdseceni: boolean;

  integracijeUKvaru: IntegracijaUKvaru[];

  zaostaliKoraci: number;
  zaostaliOdsecen: boolean;

  sastanciDanas: SastanakStavka[];
  sastanciProsliBezIshoda: number;

  nikadDodirnut: number;
  ukupnoDodela: number;
  dodeleOdsecene: boolean;

  bezTelefona: number;
  ukupnoFirmi: number;
  firmeOdsecene: boolean;

  /** Firma iz tabele koja IMA sajt, a sajt nikad nije ocenjen. */
  neocenjenSajt: number;

  kanali: KanalStavka[];
};

// ── pomoćno ──────────────────────────────────────────────────────────────────

/**
 * Srpska množina bez uvoza iz `lib/format` — `convex/` ne sme da zavisi od
 * prezentacionog sloja, a pravilo je isto (11–14 idu u množinu uprkos cifri).
 */
export function mnozina(
  broj: number,
  jedan: string,
  malo: string,
  mnogo: string,
): string {
  const abs = Math.abs(Math.trunc(broj));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod10 === 1 && mod100 !== 11) return jedan;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return malo;
  return mnogo;
}

/** „3 dana" / „5 sati" / „20 minuta" — koliko nešto već stoji. */
export function trajanje(ms: number): string {
  const minuti = Math.max(1, Math.floor(ms / 60000));
  if (minuti < 60) return `${minuti} ${mnozina(minuti, "minut", "minuta", "minuta")}`;
  const sati = Math.floor(minuti / 60);
  if (sati < 24) return `${sati} ${mnozina(sati, "sat", "sata", "sati")}`;
  const dani = Math.floor(sati / 24);
  return `${dani} ${mnozina(dani, "dan", "dana", "dana")}`;
}

/** „14:30" u LOKALNOM vremenu operatera, izračunato iz pomeraja. */
export function lokalniSat(at: number, pomerajMin: number): string {
  const d = new Date(at + pomerajMin * 60000);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Početak lokalnog dana u kome se nalazi `at`, izražen u UTC milisekundama. */
export function pocetakLokalnogDana(at: number, pomerajMin: number): number {
  const pomeraj = pomerajMin * 60000;
  const lokalno = at + pomeraj;
  const dan = Math.floor(lokalno / DAN) * DAN;
  return dan - pomeraj;
}

// ── proizvođači ──────────────────────────────────────────────────────────────

/**
 * Sastavlja spisak zadataka iz snimka. Redosled izlaza je konačan: hitnost,
 * pa veći posao, pa ključ (da dva jednaka zadatka uvek stoje istim redom).
 */
export function napraviZadatke(s: Snimak): Zadatak[] {
  const zadaci: Zadatak[] = [];

  /** Jedino mesto koje sme da doda zadatak — i jedino koje pamti pravilo o nuli. */
  const dodaj = (z: Zadatak): void => {
    if (!Number.isFinite(z.broj) || z.broj <= 0) return;
    zadaci.push(z);
  };

  // 1) Uvoz čeka pregled ─────────────────────────────────────────────────────
  if (s.uvoziUPregledu.length > 0) {
    const najstariji = s.uvoziUPregledu.reduce((a, b) =>
      a.uploadedAt <= b.uploadedAt ? a : b,
    );
    const stoji = s.now - najstariji.uploadedAt;
    dodaj({
      kljuc: "uvoz.u_pregledu",
      naslov: `Uvoz čeka pregled (${s.uvoziUPregledu.length})`,
      broj: s.uvoziUPregledu.length,
      hitnost: stoji >= PRAG_HITNO_MS ? "visoka" : "srednja",
      veza: `/leadovi/uvoz?import=${najstariji.id}`,
      radnja: "Otvori pregled",
      imenilac:
        s.uvoziUPregledu.length === 1
          ? `stoji ${trajanje(stoji)}`
          : `najstariji stoji ${trajanje(stoji)}`,
      bedz: "/leadovi",
      odsecen: s.uvoziOdseceni,
    });
  }

  // 2) Primenjen uvoz sa nerazrešenim redovima ───────────────────────────────
  if (s.uvoziSaNerazresenim.length > 0) {
    const ukupno = s.uvoziSaNerazresenim.reduce((zbir, u) => zbir + u.broj, 0);
    const najveci = s.uvoziSaNerazresenim.reduce((a, b) =>
      a.broj >= b.broj ? a : b,
    );
    const brojUvoza = s.uvoziSaNerazresenim.length;
    dodaj({
      kljuc: "uvoz.nerazreseni",
      naslov: `${ukupno} ${mnozina(ukupno, "red nije rešen", "reda nije rešeno", "redova nije rešeno")} u ${brojUvoza} ${mnozina(brojUvoza, "uvozu", "uvoza", "uvoza")}`,
      broj: ukupno,
      hitnost: "srednja",
      // A5: veza vodi u uvoz sa UKLJUČENIM prikazom nerazrešenih redova —
      // dugme „Reši preostale" inače otvori tabelu od sto redova u kojoj tih 41
      // treba prvo naći.
      veza: `/leadovi/uvoz?import=${najveci.id}&prikaz=nerazreseno`,
      radnja: "Reši preostale",
      imenilac: `najviše ih ima u „${najveci.fileName}" (${najveci.broj})`,
      bedz: "/leadovi",
      odsecen:
        s.uvoziOdseceni || s.uvoziSaNerazresenim.some((u) => u.odsecen),
    });
  }

  // 3) Integracija koja se ne sinhronizuje ───────────────────────────────────
  //
  // Jedna stavka po integraciji, sa imenom i vremenom (§5). Zajednički crveni
  // čip je ugašen upravo zato što je tvrdio „greška" na ekranu na kom je pisalo
  // „GA4 · Aktivno · pre 2 h": ovde uvek piše KOJA integracija i OTKAD.
  for (const integracija of s.integracijeUKvaru) {
    const naziv =
      INTEGRACIJA_NAZIV[integracija.provider] ?? integracija.provider;
    const kvarStar = s.now - integracija.primecenAt;
    const naslov =
      integracija.razlog === "istekao_token"
        ? `${naziv}: pristup je istekao`
        : integracija.posledniUspehAt === null
          ? `${naziv} nije nijednom sinhronizovan`
          : `${naziv} ne sinhronizuje se ${trajanje(s.now - integracija.posledniUspehAt)}`;
    dodaj({
      kljuc: `sinhronizacija.greska:${integracija.provider}`,
      naslov,
      broj: 1,
      hitnost: kvarStar >= PRAG_HITNO_MS ? "visoka" : "srednja",
      veza: "/settings",
      radnja:
        integracija.razlog === "istekao_token" ? "Obnovi pristup" : "Sinhronizuj",
      imenilac: `kvar traje ${trajanje(kvarStar)}`,
      bedz: "/settings",
      odsecen: false,
    });
  }

  // 4) Zaostali koraci ───────────────────────────────────────────────────────
  dodaj({
    kljuc: "leadovi.zaostali",
    naslov: `${s.zaostaliKoraci} ${mnozina(s.zaostaliKoraci, "zaostao korak", "zaostala koraka", "zaostalih koraka")}`,
    broj: s.zaostaliKoraci,
    hitnost: "visoka",
    veza: "/leadovi?tab=overdue",
    radnja: "Zovi",
    imenilac: "rok je prošao",
    bedz: "/leadovi",
    odsecen: s.zaostaliOdsecen,
  });

  // 5) Sastanci ──────────────────────────────────────────────────────────────
  //
  // Današnji sastanci i prošli bez zabeleženog ishoda su isti posao („javi se
  // ovoj firmi"), pa nose jedan ključ. Naslov se menja prema tome šta je
  // stvarno unutra — jedan sastanak dobija svoje vreme i ime firme.
  {
    const danas = s.sastanciDanas.length;
    const ukupno = danas + s.sastanciProsliBezIshoda;
    let naslov: string;
    if (danas === 1 && s.sastanciProsliBezIshoda === 0) {
      const jedini = s.sastanciDanas[0];
      const kad = lokalniSat(jedini.at, s.pomerajMin);
      naslov = jedini.firma
        ? `Sastanak danas u ${kad} — ${jedini.firma}`
        : `Sastanak danas u ${kad}`;
    } else if (danas > 0) {
      naslov = `${danas} ${mnozina(danas, "sastanak", "sastanka", "sastanaka")} danas`;
    } else {
      naslov = `${ukupno} ${mnozina(ukupno, "sastanak", "sastanka", "sastanaka")} bez zabeleženog ishoda`;
    }
    dodaj({
      kljuc: "leadovi.sastanci",
      naslov,
      broj: ukupno,
      hitnost: "visoka",
      veza: "/leadovi?tab=meetings",
      radnja: "Otvori sastanke",
      imenilac:
        s.sastanciProsliBezIshoda > 0 && danas > 0
          ? `uz ${s.sastanciProsliBezIshoda} ${mnozina(s.sastanciProsliBezIshoda, "prošao", "prošla", "prošlih")} bez ishoda`
          : null,
      bedz: "/leadovi",
      odsecen: false,
    });
  }

  // 6) Nikad dodirnut lead ───────────────────────────────────────────────────
  dodaj({
    kljuc: "leadovi.nikad_dodirnut",
    naslov: `${s.nikadDodirnut} ${mnozina(s.nikadDodirnut, "firma nikad nije zvana", "firme nikad nisu zvane", "firmi nikad nije zvano")}`,
    broj: s.nikadDodirnut,
    hitnost: "srednja",
    veza: "/leadovi?dodir=nikad",
    radnja: "Otvori spisak",
    imenilac: `od ${s.ukupnoDodela} ${mnozina(s.ukupnoDodela, "leada", "leada", "leadova")} u tabeli`,
    bedz: "/leadovi",
    odsecen: s.dodeleOdsecene,
  });

  // 7) Firme bez telefona ────────────────────────────────────────────────────
  dodaj({
    kljuc: "leadovi.bez_telefona",
    naslov: `${s.bezTelefona} ${mnozina(s.bezTelefona, "firma bez broja", "firme bez broja", "firmi bez broja")}`,
    broj: s.bezTelefona,
    hitnost: "niska",
    veza: "/leadovi?tab=gaps",
    radnja: "Otvori rupe",
    imenilac: `od ${s.ukupnoFirmi} ${mnozina(s.ukupnoFirmi, "firme", "firme", "firmi")} u bazi`,
    bedz: "/leadovi",
    odsecen: s.firmeOdsecene,
  });

  // 8) Neocenjen sajt ────────────────────────────────────────────────────────
  dodaj({
    kljuc: "leadovi.neocenjen_sajt",
    naslov: `${s.neocenjenSajt} ${mnozina(s.neocenjenSajt, "sajt nije ocenjen", "sajta nije ocenjeno", "sajtova nije ocenjeno")}`,
    broj: s.neocenjenSajt,
    hitnost: "niska",
    veza: "/leadovi?kvalitet=neocenjen",
    radnja: "Otvori spisak",
    imenilac: `od ${s.ukupnoDodela} ${mnozina(s.ukupnoDodela, "leada", "leada", "leadova")} u tabeli`,
    bedz: "/leadovi",
    odsecen: s.dodeleOdsecene,
  });

  // 9) Kanali bez odgovora ───────────────────────────────────────────────────
  for (const kanal of s.kanali) {
    dodaj({
      kljuc: `kanali.bez_odgovora:${kanal.kljuc}`,
      naslov: kanal.naslov,
      broj: kanal.broj,
      hitnost: "srednja",
      veza: kanal.veza,
      radnja: kanal.radnja,
      imenilac: kanal.imenilac,
      bedz: kanal.bedz,
      odsecen: kanal.odsecen,
    });
  }

  return sortiraj(zadaci);
}

export function sortiraj(zadaci: Zadatak[]): Zadatak[] {
  return [...zadaci].sort((a, b) => {
    const h = HITNOST_RANG[a.hitnost] - HITNOST_RANG[b.hitnost];
    if (h !== 0) return h;
    if (a.broj !== b.broj) return b.broj - a.broj;
    return a.kljuc.localeCompare(b.kljuc);
  });
}

// ── odlaganje i sakrivanje ───────────────────────────────────────────────────

export type Razvrstano = {
  /** Zadaci koje treba pokazati — u zvonu, u bedžu i u bloku „Danas". */
  zadaci: Zadatak[];
  /** Sklonjeni, da panel može da ponudi „Vrati" — bez ovoga je „Sakrij" ćorsokak. */
  sklonjeni: Array<Zadatak & { odlozenoDo: number | null }>;
};

/**
 * Primenjuje čovekove odluke na izvedeni spisak.
 *
 * Odloženo nestaje do datuma. Sakriveno nestaje dok posao ne naraste preko
 * broja zabeleženog pri sakrivanju — inače bi jedno „Sakrij" trajno ućutkalo i
 * sav budući posao iste vrste.
 */
export function podeliPoStanju(
  zadaci: Zadatak[],
  stanja: StanjeZadatka[],
  now: number,
): Razvrstano {
  const poKljucu = new Map<string, StanjeZadatka>();
  for (const stanje of stanja) poKljucu.set(stanje.kljuc, stanje);

  const vidljivi: Zadatak[] = [];
  const sklonjeni: Array<Zadatak & { odlozenoDo: number | null }> = [];

  for (const zadatak of zadaci) {
    const stanje = poKljucu.get(zadatak.kljuc);
    const odlozeno =
      stanje?.odlozenoDo !== undefined && stanje.odlozenoDo > now;
    const sakriveno =
      stanje?.sakrivenoAt !== undefined &&
      zadatak.broj <= (stanje.brojPriSakrivanju ?? Number.MAX_SAFE_INTEGER);

    if (odlozeno || sakriveno) {
      sklonjeni.push({
        ...zadatak,
        odlozenoDo: odlozeno ? (stanje?.odlozenoDo ?? null) : null,
      });
    } else {
      vidljivi.push(zadatak);
    }
  }

  return { zadaci: vidljivi, sklonjeni };
}

/**
 * Bedževi u bočnoj navigaciji: koliko VRSTA posla čeka na kojoj stavci.
 *
 * Namerno broj zadataka, a ne zbir stavki. Zbir bi na Leadovima dao „311" —
 * broj koji ne pomaže nikome i uvek izgleda isto; „4" znači „četiri različite
 * stvari te čekaju", a koliko je čega piše u zvonu. Ključ bez posla se ne
 * upisuje, pa „nema bedža" ostaje jedini način da se kaže nula.
 */
export function bedzeviOd(zadaci: Zadatak[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const zadatak of zadaci) {
    out[zadatak.bedz] = (out[zadatak.bedz] ?? 0) + 1;
  }
  return out;
}
