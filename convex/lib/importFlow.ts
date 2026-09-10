/**
 * ============================================================================
 * TOK UVOZA — jedno mesto koje broji redove (A5, app-ux-plan.md §1.5, §2 U)
 * ============================================================================
 *
 * Ovde nema baze. Ulaz su redovi uvoza (samo ona polja koja odlučuju o
 * njihovoj sudbini), izlaz su brojevi i koraci toka. Razlog za podelu je isti
 * kao kod `notifications.ts`: ovaj deo se dokazuje bez Convex-a
 * (`npm run verify:uvoz`), a isti kod broji na TRI mesta koja su do sada
 * brojala svako za sebe:
 *
 *   1. zvono („78 redova nije rešeno u 6 uvoza" — `notificationsStore`),
 *   2. istorija uvoza (kolona „Preskočeno / Nerazrešeno" — `listImports`),
 *   3. sam pregled uvoza (traka stanja i filter „samo nerazrešeni").
 *
 * Do A5 su se razlikovali: zvono i istorija su brojali i redove koje je čovek
 * SKLONIO iz uvoza (`obrisan: true`), a pregled nije. Sklonjen red se pri
 * primeni preskače pre nego što se uopšte pogleda njegova odluka
 * (`applyRows`), pa nerazrešen sklonjen red NIJE posao koji čeka — on je
 * odluka koja je već doneta. Zato je pravilo ovde, u jednoj funkciji.
 *
 * PRAVILA:
 *
 * 1. **Sklonjen red ne čeka ništa.** `obrisan: true` ispada iz svakog brojača
 *    posla i ulazi samo u „preskočeno".
 * 2. **Nepoznato nije nula.** Red bez `primenjenAt` na primenjenom uvozu nije
 *    „primenjen pa obrisan" nego „nikad nije ušao u bazu" — dva različita
 *    stanja koja tok prikazuje različito.
 * 3. **Zbir se poklapa.** `uFajlu = noveFirme + spojeno + preskoceno +
 *    nerazreseno + cekaPrimenu`; ako se ne poklapa, brojač laže (dokazuje se
 *    u `verify:uvoz`).
 */

import { PRAG_HITNO_MS, mnozina } from "./notifications";

/** Odluka o sudbini jednog reda; `nerazreseno` je odsustvo odluke. */
export type OdlukaReda = "nova_firma" | "spoji" | "preskoci" | "nerazreseno";

/**
 * Minimum koji odlučuje o sudbini reda. Namerno strukturno (a ne
 * `Doc<"leadImportRows">`), da isti kod radi i u `convex/`, i u interfejsu, i
 * u skripti provere — bez uvoza generisanih tipova.
 */
export type RedUvoza = {
  decision: string;
  /** Čovek je sklonio red iz uvoza (meko brisanje). */
  obrisan?: boolean;
  /** Kad je red STVARNO ušao u bazu; odsustvo = nikad nije ušao (GL9 §1). */
  primenjenAt?: number;
};

export function jeSklonjen(r: { obrisan?: boolean }): boolean {
  return r.obrisan === true;
}

/** Red koji čeka ljudsku presudu — i jedini koji se prijavljuje kao posao. */
export function jeNerazresen(r: RedUvoza): boolean {
  return !jeSklonjen(r) && r.decision === "nerazreseno";
}

/** Red sa donetom odlukom koja ga vodi u bazu. */
export function jeResen(r: RedUvoza): boolean {
  return (
    !jeSklonjen(r) && (r.decision === "nova_firma" || r.decision === "spoji")
  );
}

/** Red koji u bazu neće — sklonjen ili izričito preskočen. */
export function jePreskocen(r: RedUvoza): boolean {
  return jeSklonjen(r) || r.decision === "preskoci";
}

/** Rešen red koji još nije ušao u bazu („Primeni preostale", GL9 §1). */
export function cekaPrimenu(r: RedUvoza): boolean {
  return jeResen(r) && r.primenjenAt === undefined;
}

/** Jedini brojač nerazrešenih u aplikaciji. */
export function brojNerazresenih(redovi: readonly RedUvoza[]): number {
  let n = 0;
  for (const r of redovi) if (jeNerazresen(r)) n++;
  return n;
}

export type StanjeUvoza = {
  /** Svi redovi koje uvoz nosi, uključujući sklonjene. */
  uFajlu: number;
  sklonjeno: number;
  /** Redovi koji traže odluku (sve osim sklonjenih) — imenilac za „Rešeno N/M". */
  zaOdluku: number;
  /** Redovi sa donetom odlukom (bilo kojom, i „preskoči") — brojilac. */
  odluceno: number;
  nerazreseno: number;
  /** Sklonjeni + izričito preskočeni koji NISU u bazi: redovi koji tamo ne idu. */
  preskoceno: number;
  /** Rešeni redovi koji još nisu ušli u bazu. */
  cekaPrimenu: number;
  /** Redovi koji su stvarno ušli u bazu (imaju `primenjenAt`). */
  primenjeno: number;
  noveFirme: number;
  spojeno: number;
};

export function stanjeUvoza(redovi: readonly RedUvoza[]): StanjeUvoza {
  let sklonjeno = 0;
  let nerazreseno = 0;
  let preskoceno = 0;
  let ceka = 0;
  let primenjeno = 0;
  let noveFirme = 0;
  let spojeno = 0;

  for (const r of redovi) {
    // Sklonjenih ima i među primenjenima (red sklonjen POSLE primene), pa se
    // broje zasebno od podele ispod.
    if (jeSklonjen(r)) sklonjeno++;

    // Podela je isključiva: svaki red pada u tačno jednu kantu, pa zbir kanti
    // mora da bude broj redova. Redosled pitanja prati `applyRows`: prvo šta
    // je već u bazi, pa šta u nju ne ide, pa šta čeka presudu.
    if (r.primenjenAt !== undefined) {
      primenjeno++;
      if (r.decision === "nova_firma") noveFirme++;
      else if (r.decision === "spoji") spojeno++;
    } else if (jePreskocen(r)) {
      preskoceno++;
    } else if (r.decision === "nerazreseno") {
      nerazreseno++;
    } else {
      ceka++;
    }
  }

  const uFajlu = redovi.length;
  const zaOdluku = uFajlu - sklonjeno;
  return {
    uFajlu,
    sklonjeno,
    zaOdluku,
    odluceno: zaOdluku - nerazreseno,
    nerazreseno,
    preskoceno,
    cekaPrimenu: ceka,
    primenjeno,
    noveFirme,
    spojeno,
  };
}

// ── koraci toka ──────────────────────────────────────────────────────────────

export type StanjeKoraka =
  /** Korak je iza nas. */
  | "gotov"
  /** Ovo je sledeći potez. */
  | "tekuci"
  /** Još nije na redu. */
  | "ceka"
  /** Posao je stao na ovom koraku (nerazrešeno posle primene, poništen uvoz). */
  | "stao";

export type KljucKoraka = "ucitano" | "reseno" | "primeni" | "nastalo";

export type Korak = {
  kljuc: KljucKoraka;
  naslov: string;
  /** Jedna linija ispod naslova: brojevi, nikad pridevi. */
  detalj: string;
  stanje: StanjeKoraka;
};

/**
 * Četiri koraka iz plana §2 U: **Učitano → Rešeno N/M → Primeni → Šta je
 * nastalo**. U svakom trenutku se vidi koliko je rešeno i šta ostaje.
 */
export function koraciUvoza(
  imp: { status: string; rowsSkipped?: number },
  s: StanjeUvoza,
): Korak[] {
  const primenjen = imp.status === "primenjen";
  const otkazan = imp.status === "ponisten" || imp.status === "neuspeo";
  const preskoceniPriParsiranju = imp.rowsSkipped ?? 0;

  // 1) Učitano — uvek gotovo: uvoz postoji, redovi su u staging-u.
  const ucitano: Korak = {
    kljuc: "ucitano",
    naslov: "Učitano",
    detalj:
      `${s.uFajlu} ${mnozina(s.uFajlu, "red", "reda", "redova")}` +
      (s.sklonjeno > 0 ? ` · ${s.sklonjeno} sklonjeno` : "") +
      (preskoceniPriParsiranju > 0
        ? ` · ${preskoceniPriParsiranju} preskočeno pri parsiranju`
        : ""),
    stanje: "gotov",
  };

  // 2) Rešeno N/M — brojilac su redovi sa odlukom, imenilac oni koji je traže.
  const svePreseceno = s.nerazreseno === 0;
  const reseno: Korak = {
    kljuc: "reseno",
    naslov: `Rešeno ${s.odluceno}/${s.zaOdluku}`,
    detalj: svePreseceno
      ? "Nijedan red ne čeka presudu."
      : `${s.nerazreseno} ${mnozina(s.nerazreseno, "red nije rešen", "reda nije rešeno", "redova nije rešeno")}`,
    stanje: svePreseceno
      ? "gotov"
      : otkazan
        ? "stao"
        : primenjen
          ? // Uvoz je primenjen, a redovi i dalje čekaju presudu: posao stoji
            // i to je tačno onih 78 redova iz §1.5 koje niko ne vidi.
            "stao"
          : "tekuci",
  };

  // 3) Primeni — spreman kad nema nerazrešenih, a posle primene se vraća kao
  //    tekući čim se neki red reši („Primeni preostale").
  const primeni: Korak = {
    kljuc: "primeni",
    naslov: primenjen && s.cekaPrimenu > 0 ? "Primeni preostale" : "Primeni",
    detalj:
      s.cekaPrimenu > 0
        ? `${s.cekaPrimenu} ${mnozina(s.cekaPrimenu, "red čeka", "reda čeka", "redova čeka")} upis u bazu`
        : primenjen
          ? "Sve rešeno je upisano u bazu."
          : "Nijedan red još nije spreman za upis.",
    stanje: otkazan
      ? "stao"
      : primenjen
        ? s.cekaPrimenu > 0
          ? "tekuci"
          : "gotov"
        : svePreseceno
          ? "tekuci"
          : "ceka",
  };

  // 4) Šta je nastalo — postoji tek kad je nešto stvarno ušlo u bazu.
  const nastalo: Korak = {
    kljuc: "nastalo",
    naslov: "Šta je nastalo",
    detalj:
      s.primenjeno > 0
        ? `${s.noveFirme} ${mnozina(s.noveFirme, "nova firma", "nove firme", "novih firmi")} · ${s.spojeno} ${mnozina(s.spojeno, "spojena", "spojene", "spojenih")}`
        : "Ništa još nije ušlo u bazu.",
    stanje:
      s.primenjeno > 0 ? "gotov" : otkazan ? "stao" : "ceka",
  };

  return [ucitano, reseno, primeni, nastalo];
}

// ── zaglavljen uvoz ──────────────────────────────────────────────────────────

/**
 * Uvoz „U pregledu" koji stoji duže od praga (§2 U tačka 5). Prag je ISTI onaj
 * po kom zvono podiže hitnost (`PRAG_HITNO_MS` = 24 h) — dva praga za istu
 * stvar bi značila da traka na stranici i zvono govore različito.
 */
export function jeZastaoUPregledu(
  imp: { status: string; uploadedAt: number },
  now: number,
): boolean {
  return imp.status === "u_pregledu" && now - imp.uploadedAt >= PRAG_HITNO_MS;
}

export { PRAG_HITNO_MS };
