/**
 * ============================================================================
 * VEROVATNOĆA DA JE TELEFON BAŠ OD TE OSOBE (plan §6)
 * ============================================================================
 *
 * Ovo je PRAVILO, ne procena jezičkog modela (plan §O5). Claude u skillu samo
 * zapisuje ŠTA JE VIDEO (`dokazi`), a broj i obrazloženje izlaze odavde —
 * deterministički, isti ulaz daje isti izlaz, i može da se proveri bez mreže.
 *
 * TRI PRAVILA KOJA OVAJ FAJL ČUVA:
 *
 * 1. Bez ijednog dokaza iz grupe A nema broja. Mobilni telefon nađen na sajtu
 *    firme, bez ijedne veze sa imenom osobe, nije „verovatno njen" — to je broj
 *    firme pored kog slučajno stoji nečije ime. Rezultat je
 *    `nijeMoguceProceniti: true`, nikad 50 („srednja procena" je izmišljotina
 *    koja se u aplikaciji ne razlikuje od merenja — §0 pravilo 4).
 * 2. Kap je 95, pod je 0. 100 bi značilo „znamo"; ne znamo dok nismo pozvali.
 *    0 nije „nepoznato" nego tvrdnja: proveravali smo i dokazi kažu da to
 *    skoro sigurno nije njen lični broj (npr. isti broj piše kao broj salona).
 * 3. Sirov broj se NIKAD ne pojavljuje u obrazloženju. Obrazloženje se čita u
 *    aplikaciji pored broja; ponavljanje broja u tekstu ga samo umnožava po
 *    logovima i izvozima (§0 pravilo 6).
 */

/** Kap iz §6 — nikad 100, jer nismo zvali. Ista granica stoji i u zod šemi. */
export const MAX_VEROVATNOCA = 95;

/**
 * Prazan skup dokaza. Svaki ključ je jedno pitanje na koje Claude odgovara
 * gledajući stranicu — nijedno se ne izvodi iz „opšteg znanja".
 */
export const PRAZNI_DOKAZI = {
  /** A +45: broj stoji u CompanyWall/APR zapisu preduzetnika čije je ime = osoba. */
  brojUAprZapisuOsobe: false,
  /** A +35: broj je na sajtu/profilu odmah uz ime osobe („Marija, vlasnica: 06x…"). */
  brojUzImeNaSajtu: false,
  /** A +25: broj je u biou profila koji nosi LIČNO ime osobe (ne ime salona). */
  brojUBiouLicnogProfila: false,
  /** A +15: broj je u biou profila salona, a osoba je jedina navedena osoba. */
  brojUBiouSalonaJedinaOsoba: false,
  /** B: `mobilni` (+15), `fiksni` (−20), `nepoznato` (0). */
  vrstaBroja: "nepoznato",
  /**
   * B −25: isti broj se pojavljuje kao broj salona (Places/011info/sajt).
   * NE oduzima za `pravniOblik: "pr"` — kod preduzetnika je broj firme ujedno
   * broj vlasnika, pa isti broj nije kontra-dokaz (GL9 §3, plan §6).
   */
  istiBrojKaoSalon: false,
  /** C: `pr` (+10), `doo_vise_osnivaca` (−10), ostalo 0. */
  pravniOblik: "nepoznato",
  /** C −15: broj nađen samo na agregatoru (imenik trećih strana, bez imena). */
  samoNaAgregatoru: false,
  /** C +5: broj potvrđen na dva nezavisna izvora sa istim imenom. */
  dvaNezavisnaIzvora: false,
};

/**
 * Dokazi grupe A, od najjačeg ka najslabijem. Redosled je bitan dvaput: za skor
 * (sabira se sve) i za obrazloženje (prva rečenica citira najjači).
 */
const GRUPA_A = [
  {
    kljuc: "brojUAprZapisuOsobe",
    poeni: 45,
    recenica: "Broj stoji u APR/CompanyWall zapisu preduzetnika na ime te osobe.",
  },
  {
    kljuc: "brojUzImeNaSajtu",
    poeni: 35,
    recenica: "Broj je objavljen neposredno uz ime i ulogu te osobe.",
  },
  {
    kljuc: "brojUBiouLicnogProfila",
    poeni: 25,
    recenica: "Broj je u biografiji profila koji nosi lično ime te osobe, ne ime firme.",
  },
  {
    kljuc: "brojUBiouSalonaJedinaOsoba",
    poeni: 15,
    recenica:
      "Broj je u biografiji profila firme, a ta osoba je jedina navedena osoba u firmi.",
  },
];

/** Kontra-dokazi, od najjačeg ka najslabijem — druga rečenica citira prvi koji važi. */
const KONTRA = [
  {
    // Za preduzetnika (PR) isti broj kao salon NIJE kontra-dokaz: firma i vlasnik
    // su ista pravna ličnost, pa je broj firme ujedno broj vlasnika (GL9 §3).
    vazi: (d) => d.istiBrojKaoSalon === true && d.pravniOblik !== "pr",
    poeni: -25,
    recenica: "Isti broj je prijavljen i kao broj firme, pa je verovatnije linija firme nego lični.",
  },
  {
    vazi: (d) => d.vrstaBroja === "fiksni",
    poeni: -20,
    recenica: "Broj je fiksni, a lični brojevi su gotovo uvek mobilni.",
  },
  {
    vazi: (d) => d.samoNaAgregatoru === true,
    poeni: -15,
    recenica: "Broj je nađen samo na agregatoru, bez imena osobe uz njega.",
  },
  {
    vazi: (d) => d.pravniOblik === "doo_vise_osnivaca",
    poeni: -10,
    recenica: "Firma je DOO sa više osnivača, pa vlasnik i firma nisu ista osoba.",
  },
];

/** Dokazi koji dižu skor, a nisu iz grupe A — ne mogu sami da naprave procenu. */
const PLUSEVI = [
  { vazi: (d) => d.vrstaBroja === "mobilni", poeni: 15 },
  { vazi: (d) => d.pravniOblik === "pr", poeni: 10 },
  { vazi: (d) => d.dvaNezavisnaIzvora === true, poeni: 5 },
];

/**
 * Traka koju aplikacija crta (plan §6): crvena < 40, žuta 40–69, zelena ≥ 70.
 * Ovde postoji samo da bi `self-test` mogao da tvrdi „visoko"/„nisko" istim
 * rečnikom kojim to tvrdi ekran.
 */
export function traka(verovatnoca) {
  if (verovatnoca === null || verovatnoca === undefined) return "bez procene";
  if (verovatnoca >= 70) return "visoko";
  if (verovatnoca >= 40) return "srednje";
  return "nisko";
}

/**
 * Skor za jednu osobu.
 *
 * @param {object} osoba - `{ telefon?, dokazi? }` iz `firme.json`.
 * @returns {{verovatnoca?: number, nijeMoguceProceniti?: boolean, obrazlozenje?: string}}
 *   Osoba bez telefona vraća PRAZAN objekat: nema šta da se procenjuje, pa ni
 *   „nije moguće proceniti" (to znači „pokušali smo i odustali", a nismo ni
 *   imali šta da procenjujemo — §0 pravilo 4).
 */
export function oceniTelefonOsobe(osoba) {
  const telefon = typeof osoba?.telefon === "string" ? osoba.telefon.trim() : "";
  if (!telefon) return {};

  const dokazi = { ...PRAZNI_DOKAZI, ...(osoba.dokazi ?? {}) };

  const aDokazi = GRUPA_A.filter((d) => dokazi[d.kljuc] === true);
  if (aDokazi.length === 0) {
    // §6: „Ime uz broj bez ijednog A-dokaza -> nije moguće proceniti." Ovo je
    // stroža polovina pravila i namerno gazi sabiranje: broj koji nije ni na
    // koji način vezan za ime nije procenjiv ni kad je mobilni i ni kad je
    // firma PR.
    return {
      nijeMoguceProceniti: true,
      obrazlozenje:
        "Nijedan izvor ne vezuje ovaj broj za ime te osobe. Bez takve veze procena bi bila nagađanje, pa je nema.",
    };
  }

  let skor = 0;
  for (const d of aDokazi) skor += d.poeni;
  for (const p of PLUSEVI) if (p.vazi(dokazi)) skor += p.poeni;
  for (const k of KONTRA) if (k.vazi(dokazi)) skor += k.poeni;

  const verovatnoca = Math.max(0, Math.min(MAX_VEROVATNOCA, skor));
  const kontra = KONTRA.find((k) => k.vazi(dokazi));

  // Druga rečenica: najjači kontra-dokaz koji važi; za PR sa istim brojem kao
  // salon to nije kontra-dokaz, nego objašnjenje zašto broj firme JESTE lični
  // (GL9 §3); inače „Nema kontra-dokaza.".
  let drugaRecenica;
  if (kontra) {
    drugaRecenica = kontra.recenica;
  } else if (dokazi.istiBrojKaoSalon === true && dokazi.pravniOblik === "pr") {
    drugaRecenica = "Firma je preduzetnička radnja, pa je broj firme ujedno broj vlasnika.";
  } else {
    drugaRecenica = "Nema kontra-dokaza.";
  }

  return {
    verovatnoca,
    obrazlozenje: `${aDokazi[0].recenica} ${drugaRecenica}`,
  };
}

/** Rang uloge za sortiranje: vlasnik/osnivač > direktor > menadžer > ostalo. */
function rangUloge(uloga) {
  const u = String(uloga ?? "").toLowerCase();
  if (/vlasni|osniva|preduzetnik|owner|founder/.test(u)) return 0;
  if (/direktor|ceo|managing/.test(u)) return 1;
  if (/menad|manager|salonski|šef|sef/.test(u)) return 2;
  return 3;
}

/**
 * Oceni sve osobe jedne firme, poređaj ih i zadrži najviše tri (plan §6, §4.4).
 *
 * Redosled: uloga (vlasnik > direktor > menadžer), pa veća verovatnoća, pa
 * osoba sa telefonom pre osobe bez njega. Osoba bez telefona OSTAJE ako je
 * vlasnik — ime je vredno i za poziv preko centrale.
 */
export function oceniOsobe(osobe) {
  const ocenjene = (osobe ?? []).map((osoba) => ({ ...osoba, ...oceniTelefonOsobe(osoba) }));

  ocenjene.sort((a, b) => {
    const uloga = rangUloge(a.uloga) - rangUloge(b.uloga);
    if (uloga !== 0) return uloga;

    const va = typeof a.verovatnoca === "number" ? a.verovatnoca : -1;
    const vb = typeof b.verovatnoca === "number" ? b.verovatnoca : -1;
    if (va !== vb) return vb - va;

    const ta = a.telefon ? 0 : 1;
    const tb = b.telefon ? 0 : 1;
    return ta - tb;
  });

  return ocenjene.slice(0, 3).map((osoba, i) => ({ ...osoba, rang: i + 1 }));
}
