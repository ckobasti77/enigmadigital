/**
 * ============================================================================
 * NIŠE — mapiranje slobodnog teksta na slug, Places upite i opis (plan §10.2)
 * ============================================================================
 *
 * Ovo je ručno održavana lista. Namerno NIJE generator: „frizeri" i „hair
 * salon" su različiti upiti ka Placesu, a koji od njih vraća firme u Srbiji zna
 * se samo iz iskustva, ne iz pravila. Nova niša se dodaje ovde, ne izmišlja u
 * toku runa (`nadjiNisu` vraća `null` i skill tada PITA za upite — plan §10.2).
 *
 * `slug` mora da preživi `normalizeNicheSlug` iz `convex/lib/leadNormalize.ts`
 * nepromenjen, jer po tom slugu `applyImport` radi upsert niše. Zato se slug
 * ovde piše bez dijakritika i bez razmaka, a `normalizujSlug` (ista funkcija,
 * preslikana) je i provera te tvrdnje u `self-test`-u.
 *
 * `opis` je tekst koji je napisao Claude (`niches.opisAutor: "claude"`).
 * VAŽNO: ingest šema (`convex/lib/generateLeadsIngest.ts`) nema polje za opis
 * niše — red nosi samo `nisa` (slug). Zato `send` opis SAČUVA u
 * `out/<run-id>/nisa-opis.txt` i ispiše putanju; u aplikaciju ga čovek nalepi
 * ručno (i time postaje `opisAutor: "covek"`). Vidi README, odeljak „Opis niše".
 *
 * `sifreDelatnosti` su iz Klasifikacije delatnosti (2010) i služe kao POMOĆ pri
 * pretrazi CompanyWall/APR-a, ne kao tvrdnja o konkretnoj firmi. Šifra firme
 * koja ulazi u bazu (`sifraDelatnosti` na redu) prepisuje se iz CompanyWall
 * zapisa te firme, nikad odavde.
 */

/**
 * Slug niše — preslikano iz `convex/lib/leadNormalize.ts:normalizeNicheSlug`.
 *
 * Dve kopije iste funkcije se razilaze; zato `self-test` proverava da svaki
 * slug iz ovog fajla prolazi kroz nju nepromenjen. Ako se izvorna funkcija
 * promeni, test pada ovde, a ne tek pri prvom uvozu.
 */
export function normalizujSlug(raw) {
  if (!raw) return "";
  const zamene = { č: "c", ć: "c", ž: "z", š: "s", đ: "dj" };
  return String(raw)
    .toLowerCase()
    .replace(/[čćžšđ]/g, (ch) => zamene[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export const NISE = [
  {
    slug: "frizerski-saloni",
    naziv: "Frizerski saloni",
    sinonimi: ["frizeri", "frizer", "frizerski salon", "berberin", "berbernica", "berberi"],
    upiti: {
      sr: ["frizerski salon", "frizer", "berbernica"],
      en: ["hair salon", "barber shop"],
    },
    sifreDelatnosti: ["9602"],
    opis:
      "Frizerski saloni u Srbiji gotovo bez izuzetka zakazuju preko telefona i Instagram poruka, a sajt im je ili star pet godina ili ga nema. " +
      "Vlasnik je najčešće preduzetnik (PR) koji i sam radi u salonu, pa je broj sa sajta ili iz APR zapisa vrlo često baš njegov lični mobilni. " +
      "Prodajna priča je zakazivanje bez dopisivanja: jednostavan sajt sa cenovnikom, radnim vremenom i formom za termin, plus Google profil koji vodi na njega. " +
      "Sezonski vrhovi (maturske, praznici, venčanja) su prirodan povod za oglase i za zajedničku ponudu sajta i kampanje.",
  },
  {
    slug: "kozmeticki-saloni",
    naziv: "Kozmetički saloni",
    sinonimi: [
      "kozmeticki salon",
      "kozmetika",
      "kozmeticar",
      "salon lepote",
      "beauty salon",
      "estetski salon",
      "nokti",
      "manikir",
    ],
    upiti: {
      sr: ["kozmetički salon", "salon lepote", "manikir i pedikir"],
      en: ["beauty salon", "nail salon"],
    },
    sifreDelatnosti: ["9602", "9604"],
    opis:
      "Kozmetički saloni žive na Instagramu — cela ponuda im je u objavama i storijima, a cenovnik postoji samo kao slika ili u DM-u. " +
      "To ih čini idealnim za sajt koji radi kao katalog tretmana sa cenama i online zakazivanjem, jer im trenutno svaki termin prolazi kroz ručno dopisivanje. " +
      "Vlasnice su uglavnom preduzetnice sa jednim do tri zaposlena, odlučuju same i brzo, bez nabavne procedure. " +
      "Uz sajt se prirodno prodaju i lokalni oglasi po opštini, pošto klijentkinje biraju salon u krugu od par kilometara.",
  },
  {
    slug: "turisticke-agencije",
    naziv: "Turističke agencije",
    sinonimi: [
      "turisticka agencija",
      "turizam",
      "putovanja",
      "travel agency",
      "agencija za putovanja",
    ],
    upiti: {
      sr: ["turistička agencija", "agencija za putovanja"],
      en: ["travel agency", "tour operator"],
    },
    sifreDelatnosti: ["7911", "7912", "7990"],
    opis:
      "Turističke agencije su jedna od retkih lokalnih niša koja stvarno ima šta da proda preko interneta — aranžman se bira, upoređuje i rezerviše bez dolaska u agenciju. " +
      "Većina malih agencija u Srbiji i dalje objavljuje ponude kao PDF ili sliku na Fejsbuku, pa im sajt sa pretragom po destinaciji i datumu odmah menja način rada. " +
      "Sezonalnost je oštra (zima–skijanje, proleće–Grčka, leto–more), što znači ponovljive kampanje i jasan povod za razgovor u pravom trenutku. " +
      "Osnivač je obično naveden u APR-u sa svojim brojem, pa je kontakt do odlučioca kratak.",
  },
  {
    slug: "stomatoloske-ordinacije",
    naziv: "Stomatološke ordinacije",
    sinonimi: [
      "stomatolog",
      "stomatolozi",
      "zubar",
      "zubari",
      "stomatoloska ordinacija",
      "dentist",
      "ordinacija",
    ],
    upiti: {
      sr: ["stomatološka ordinacija", "zubar", "stomatolog"],
      en: ["dental clinic", "dentist"],
    },
    sifreDelatnosti: ["8623"],
    opis:
      "Privatne stomatološke ordinacije imaju najveću vrednost po pacijentu u celoj listi lokalnih niša, pa im se ulaganje u sajt i oglase vraća iz jednog implanta. " +
      "Skoro sve imaju nekakav sajt, ali je često napravljen jednom davno, bez HTTPS-a, bez cenovnika i bez zakazivanja — što je bolji povod za razgovor nego da sajta nema. " +
      "Odluku donosi doktor koji je ujedno i vlasnik ordinacije, obično kao PR ili DOO sa jednim osnivačem. " +
      "Oprez sa oglasima: zdravstvene usluge imaju stroža pravila za reklamiranje, pa se poruka gradi oko poverenja i uslova, ne oko obećanja rezultata.",
  },
  {
    slug: "teretane",
    naziv: "Teretane i fitnes centri",
    sinonimi: [
      "teretana",
      "fitnes",
      "fitness",
      "gym",
      "fitnes centar",
      "teretane i fitnes",
      "crossfit",
    ],
    upiti: {
      sr: ["teretana", "fitnes centar"],
      en: ["gym", "fitness center"],
    },
    sifreDelatnosti: ["9313", "9311"],
    opis:
      "Teretane prodaju članarine, dakle pretplatu — a pretplata bez sajta znači da svaki upit o ceni i terminima grupnih treninga ide preko telefona ili Instagrama. " +
      "Sajt sa rasporedom treninga, cenovnikom paketa i online upisom im direktno skida posao sa recepcije i produžava trajanje članstva. " +
      "Januar i septembar su dva prirodna vrha upisa, pa kampanja ima jasan kalendar i merljiv rezultat. " +
      "Vlasnici su često treneri koji su otvorili svoj objekat, komuniciraju neformalno i odlučuju bez sastanaka.",
  },
  {
    slug: "restorani",
    naziv: "Restorani i kafići",
    sinonimi: [
      "restoran",
      "kafic",
      "kafići",
      "kafana",
      "ugostiteljstvo",
      "restaurant",
      "picerija",
      "pizzeria",
    ],
    upiti: {
      sr: ["restoran", "kafić", "picerija"],
      en: ["restaurant", "cafe"],
    },
    sifreDelatnosti: ["5610", "5630"],
    opis:
      "Restoranima je Google profil postao važniji od sajta, ali im upravo zato fali jedno mesto sa aktuelnim menijem, cenama i rezervacijom — meni na Fejsbuku iz 2021. odbija goste. " +
      "Dostava je druga žila: ko je na Wolt/Glovo platformama plaća visoku proviziju i ima motiv za sopstveni sistem porudžbina. " +
      "Konkurencija je gusta, pa lokalni oglasi i sezonske ponude (bašta, praznici, svečane sale) imaju odmah vidljiv efekat. " +
      "Vlasnik je često teško dostupan preko centrale, pa ime iz APR zapisa vredi i kad broj nije njegov lični.",
  },
  {
    slug: "auto-servisi",
    naziv: "Auto-servisi",
    sinonimi: [
      "auto servis",
      "autoservis",
      "servis automobila",
      "vulkanizer",
      "auto mehanicar",
      "car service",
      "auto delovi",
    ],
    upiti: {
      sr: ["auto servis", "auto mehaničar", "vulkanizer"],
      en: ["car repair shop", "auto service"],
    },
    sifreDelatnosti: ["4520"],
    opis:
      "Auto-servisi su niša u kojoj odsustvo sajta nije izuzetak nego pravilo — kontakt je broj telefona na tabli iznad kapije i preporuka komšije. " +
      "Baš zato im prosta stranica sa uslugama, markama koje rade, radnim vremenom i mapom donosi pozive koji danas odlaze prvom servisu koji se pojavi na Google mapi. " +
      "Sezonske vrhove (zamena guma u aprilu i oktobru, tehnički pregled) prati očigledan povod za kampanju. " +
      "Vlasnik je gotovo uvek preduzetnik i javlja se na svoj mobilni, što je najkraći mogući put do odluke.",
  },
  {
    slug: "cvecare",
    naziv: "Cvećare",
    sinonimi: ["cvecara", "cveće", "cvecarnica", "flower shop", "cvetni aranzmani"],
    upiti: {
      sr: ["cvećara", "cvetni aranžmani"],
      en: ["flower shop", "florist"],
    },
    sifreDelatnosti: ["4776"],
    opis:
      "Cvećare su najbliže webshopu od svih lokalnih niša: proizvod je vizuelan, isporuka je lokalna, a povod za kupovinu je datum u kalendaru. " +
      "Većina radi porudžbine preko Instagram poruka i telefona, bez korpe i bez plaćanja karticom, pa im webshop menja i način naplate, ne samo izlog. " +
      "8. mart, Dan zaljubljenih, slave i sezona venčanja daju četiri jasna termina za oglase u toku godine. " +
      "Poslovi su mali po vrednosti ali brojni, pa se sajt i kampanja isplate kroz obim, a ne kroz jednu porudžbinu.",
  },
  {
    slug: "pekare",
    naziv: "Pekare",
    sinonimi: ["pekara", "bakery", "poslasticarnica", "kolaci"],
    upiti: {
      sr: ["pekara", "poslastičarnica"],
      en: ["bakery", "pastry shop"],
    },
    sifreDelatnosti: ["1071", "4724"],
    opis:
      "Pekare žive od prolaznika i retko im treba sajt zbog same prodaje — ali skoro svaka prima porudžbine za torte, poslužavnike i ketering, i to radi telefonom. " +
      "Tu je vrednost sajta: katalog torti sa cenama i formom za porudžbinu sa datumom preuzimanja, umesto dvadeset poziva dnevno. " +
      "Lanci sa više objekata dodatno imaju problem sa adresama i radnim vremenom, koji rešava jedna stranica sa svim lokacijama. " +
      "Odluku donosi vlasnik, često uz knjigovođu, i najviše ga interesuje da porudžbine prestanu da se gube na papiriću.",
  },
  {
    slug: "butici",
    naziv: "Butici i prodavnice odeće",
    sinonimi: [
      "butik",
      "prodavnica odece",
      "odeca",
      "moda",
      "boutique",
      "clothing store",
      "shop odece",
    ],
    upiti: {
      sr: ["butik", "prodavnica odeće"],
      en: ["clothing boutique", "fashion store"],
    },
    sifreDelatnosti: ["4771"],
    opis:
      "Butici su u Srbiji već prodavci na internetu — samo bez prodavnice: kompletan promet ide kroz Instagram objave, komentare sa pitanjem o ceni i poruke. " +
      "Webshop im rešava tri stvari odjednom: cene bez pitanja, stanje po veličinama i naplata pouzećem bez ručnog vođenja u svesci. " +
      "Zbog stalnog priliva novih artikala imaju prirodan razlog za redovne oglase i za ponovno oglašavanje ka posetiocima. " +
      "Vlasnica je obično i osoba koja vodi profil, pa je Instagram bio često najbrži i najtačniji izvor kontakta.",
  },
];

/**
 * Nalazi nišu po slobodnom tekstu („frizeri", „Frizerski Saloni", „hair salon").
 *
 * Vraća `null` kad ne prepozna — pozivalac tada MORA da pita čoveka za upite
 * (plan §10.2). Pogađanje upita ka Placesu bi trošilo tuđu kvotu na pretragu
 * koju niko nije tražio.
 */
export function nadjiNisu(unos) {
  const trazeno = normalizujSlug(unos);
  if (!trazeno) return null;

  // Sam upit ka Placesu je i legitiman unos: ko kuca „hair salon" misli na istu
  // nišu kao onaj ko kuca „frizeri".
  const kljucevi = (nisa) => [
    nisa.slug,
    normalizujSlug(nisa.naziv),
    ...nisa.sinonimi.map(normalizujSlug),
    ...upitiNise(nisa).map(normalizujSlug),
  ];

  for (const nisa of NISE) {
    if (kljucevi(nisa).includes(trazeno)) return nisa;
  }

  // Delimično poklapanje na kraju: „frizerski" -> „frizerski-saloni". Traži se
  // da unos bude prefiks ključa, ne bilo gde unutar njega — „servis" ne sme da
  // povuče „auto-servisi" na osnovu sredine reči.
  for (const nisa of NISE) {
    if (kljucevi(nisa).some((k) => k.startsWith(`${trazeno}-`))) return nisa;
  }

  return null;
}

/** Svi Places upiti niše, srpski pa engleski (redosled je i redosled pretrage). */
export function upitiNise(nisa) {
  return [...nisa.upiti.sr, ...nisa.upiti.en];
}
