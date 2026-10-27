/**
 * ============================================================================
 * REČNIK MERA — jedan za celu aplikaciju
 * ============================================================================
 *
 * Svaka mera koju pločica ili tabela prikazuje ima ovde jedan zapis: srpski
 * naziv, kratak naziv za uske pločice, akronim (ide u oblačić, ne u natpis),
 * definiciju od jedne rečenice, format i SMER — da li je rast dobra vest.
 *
 * Smer je ovde, a ne kod poziva, jer je pogrešan smer bio rasut po ekranima:
 * potrošnja i cena po ključnom događaju na Analitika → Oglasi bile su zelene
 * kad rastu. Pločica sa `mera` čita smer odavde i ne pita pozivaoca.
 *
 *   - `vise`: rast je dobar (sesije, rezultati, doseg);
 *   - `manje`: pad je dobar (potrošnja, svaka cena, frekvencija);
 *   - `neutralno`: promena nije ni dobra ni loša (udeo, broj uživo).
 *
 * Potrošnja je `manje`, kao u katalogu Meta mera i kao što je bila na
 * Oglasima: više potrošenog novca za isti rezultat nije vest za zelenu boju.
 *
 * Ključ je pojam, ne platforma: „pratioci" važi za Instagram, Facebook i
 * Threads. Definicije prate opise iz kataloga (`convex/lib/metaAdsCatalog.ts`,
 * `googleAdsCatalog.ts`), srpski, jednom rečenicom.
 */

export type SmerMere = "vise" | "manje" | "neutralno";
export type FormatMere = "broj" | "novac" | "procenat" | "trajanje";
export type IzvorMere =
  | "ga4"
  | "meta_ig"
  | "meta_fb"
  | "meta_ads"
  | "google_ads"
  | "youtube"
  | "threads"
  | "openreply"
  | "leadovi";

export type Mera = {
  kljuc: string;
  naziv: string;
  kratko: string;
  akronim?: string;
  /** Jedna rečenica za oblačić „i". */
  definicija: string;
  format: FormatMere;
  smer: SmerMere;
  izvor: readonly IzvorMere[];
};

const OGLASI = ["meta_ads", "google_ads"] as const;
const DRUSTVENE = ["meta_ig", "meta_fb", "threads"] as const;

export const MERE = {
  potrosnja: {
    kljuc: "potrosnja",
    naziv: "Potrošnja",
    kratko: "Potrošnja",
    definicija: "Ukupan iznos potrošen na oglase u izabranom periodu.",
    format: "novac",
    smer: "manje",
    izvor: [...OGLASI, "ga4"],
  },
  rezultati: {
    kljuc: "rezultati",
    naziv: "Rezultati",
    kratko: "Rezultati",
    definicija: "Broj prioritetnih konverzija koje je kampanja ostvarila (kupovine, leadovi, prijave).",
    format: "broj",
    smer: "vise",
    izvor: OGLASI,
  },
  cena_po_rezultatu: {
    kljuc: "cena_po_rezultatu",
    naziv: "Cena po rezultatu",
    kratko: "Cena po rez.",
    akronim: "CPA",
    definicija: "Prosečan trošak po ostvarenom rezultatu: potrošnja podeljena brojem rezultata.",
    format: "novac",
    smer: "manje",
    izvor: OGLASI,
  },
  povracaj: {
    kljuc: "povracaj",
    naziv: "Povraćaj na oglase",
    kratko: "Povraćaj",
    akronim: "ROAS",
    definicija: "Vrednost konverzija podeljena potrošnjom: koliko se vratilo po uloženoj jedinici novca.",
    format: "broj",
    smer: "vise",
    izvor: OGLASI,
  },
  stopa_klikova: {
    kljuc: "stopa_klikova",
    naziv: "Stopa klikova",
    kratko: "Stopa klikova",
    akronim: "CTR",
    definicija: "Udeo prikaza oglasa koji su završili klikom.",
    format: "procenat",
    smer: "vise",
    izvor: OGLASI,
  },
  cena_po_kliku: {
    kljuc: "cena_po_kliku",
    naziv: "Cena po kliku",
    kratko: "Cena po kliku",
    akronim: "CPC",
    definicija: "Prosečan trošak jednog klika na oglas.",
    format: "novac",
    smer: "manje",
    izvor: OGLASI,
  },
  cena_1000_prikaza: {
    kljuc: "cena_1000_prikaza",
    naziv: "Cena 1.000 prikaza",
    kratko: "Cena 1.000 prik.",
    akronim: "CPM",
    definicija: "Prosečan trošak za 1.000 prikaza oglasa.",
    format: "novac",
    smer: "manje",
    izvor: OGLASI,
  },
  prikazi: {
    kljuc: "prikazi",
    naziv: "Prikazi",
    kratko: "Prikazi",
    definicija: "Koliko puta je oglas ili objava prikazana na ekranu.",
    format: "broj",
    smer: "vise",
    izvor: [...OGLASI, "meta_fb"],
  },
  doseg: {
    kljuc: "doseg",
    naziv: "Doseg",
    kratko: "Doseg",
    definicija: "Broj različitih ljudi koji su videli sadržaj bar jednom.",
    format: "broj",
    smer: "vise",
    izvor: ["meta_ads", ...DRUSTVENE],
  },
  frekvencija: {
    kljuc: "frekvencija",
    naziv: "Frekvencija",
    kratko: "Frekvencija",
    definicija: "Prosečan broj prikaza po osobi koja je videla oglas; nije procenat.",
    format: "broj",
    smer: "manje",
    izvor: ["meta_ads"],
  },
  klikovi: {
    kljuc: "klikovi",
    naziv: "Klikovi",
    kratko: "Klikovi",
    definicija: "Ukupan broj klikova na oglas.",
    format: "broj",
    smer: "vise",
    izvor: [...OGLASI, "ga4"],
  },
  konverzije: {
    kljuc: "konverzije",
    naziv: "Konverzije",
    kratko: "Konverzije",
    definicija: "Broj primarnih konverzija podešenih u nalogu za oglase.",
    format: "broj",
    smer: "vise",
    izvor: ["google_ads"],
  },
  udeo_u_pretrazi: {
    kljuc: "udeo_u_pretrazi",
    naziv: "Udeo prikazivanja u pretrazi",
    kratko: "Udeo u pretrazi",
    akronim: "IS",
    definicija: "Udeo prikaza koje je kampanja dobila od svih koje je mogla da dobije na pretrazi.",
    format: "procenat",
    smer: "vise",
    izvor: ["google_ads"],
  },
  zadrzavanje_3s: {
    kljuc: "zadrzavanje_3s",
    naziv: "Zadržavanje prve 3 s",
    kratko: "Prve 3 s",
    akronim: "Hook rate",
    definicija: "Udeo prikaza u kojima je gledalac ostao na videu bar 3 sekunde.",
    format: "procenat",
    smer: "vise",
    izvor: ["meta_ads"],
  },
  gledanje_do_kraja: {
    kljuc: "gledanje_do_kraja",
    naziv: "Gledanje do kraja",
    kratko: "Do kraja",
    akronim: "Hold rate",
    definicija: "Udeo pregleda od 3 sekunde koji su stigli do kraja videa ili 15 sekundi.",
    format: "procenat",
    smer: "vise",
    izvor: ["meta_ads"],
  },
  ocena_kvaliteta: {
    kljuc: "ocena_kvaliteta",
    naziv: "Ocena kvaliteta",
    kratko: "Kvalitet",
    akronim: "Quality Score",
    definicija: "Ocena ključne reči, oglasa i odredišne stranice na skali od 1 do 10.",
    format: "broj",
    smer: "vise",
    izvor: ["google_ads"],
  },
  sesije: {
    kljuc: "sesije",
    naziv: "Sesije",
    kratko: "Sesije",
    definicija: "Broj poseta sajtu; jedna osoba može imati više sesija.",
    format: "broj",
    smer: "vise",
    izvor: ["ga4"],
  },
  korisnici: {
    kljuc: "korisnici",
    naziv: "Korisnici",
    kratko: "Korisnici",
    definicija: "Broj različitih posetilaca sajta u periodu.",
    format: "broj",
    smer: "vise",
    izvor: ["ga4"],
  },
  novi_korisnici: {
    kljuc: "novi_korisnici",
    naziv: "Novi korisnici",
    kratko: "Novi",
    definicija: "Posetioci koji su prvi put došli na sajt u periodu.",
    format: "broj",
    smer: "vise",
    izvor: ["ga4"],
  },
  angazovane_sesije: {
    kljuc: "angazovane_sesije",
    naziv: "Angažovane sesije",
    kratko: "Angažovane",
    definicija: "Sesije duže od 10 sekundi, sa ključnim događajem ili sa bar dva pregleda stranice.",
    format: "broj",
    smer: "vise",
    izvor: ["ga4"],
  },
  stopa_angazovanja: {
    kljuc: "stopa_angazovanja",
    naziv: "Stopa angažovanja",
    kratko: "Angažovanje",
    definicija: "Udeo angažovanih sesija u svim sesijama.",
    format: "procenat",
    smer: "vise",
    izvor: ["ga4"],
  },
  pregledi_stranica: {
    kljuc: "pregledi_stranica",
    naziv: "Pregledi stranica",
    kratko: "Pregledi",
    definicija: "Koliko puta su stranice sajta otvorene.",
    format: "broj",
    smer: "vise",
    izvor: ["ga4"],
  },
  vreme_angazovanja: {
    kljuc: "vreme_angazovanja",
    naziv: "Vreme angažovanja po sesiji",
    kratko: "Vreme po sesiji",
    definicija: "Prosečno vreme koje je stranica bila u prvom planu, po sesiji.",
    format: "trajanje",
    smer: "vise",
    izvor: ["ga4"],
  },
  kljucni_dogadjaji: {
    kljuc: "kljucni_dogadjaji",
    naziv: "Ključni događaji",
    kratko: "Klj. događaji",
    definicija: "Radnje na sajtu označene kao važne (poziv, poruka, forma).",
    format: "broj",
    smer: "vise",
    izvor: ["ga4"],
  },
  dogadjaji_po_sesiji: {
    kljuc: "dogadjaji_po_sesiji",
    naziv: "Ključni događaji po sesiji",
    kratko: "Po sesiji",
    definicija: "Prosečan broj ključnih događaja u jednoj sesiji.",
    format: "broj",
    smer: "vise",
    izvor: ["ga4"],
  },
  dogadjaji_po_korisniku: {
    kljuc: "dogadjaji_po_korisniku",
    naziv: "Ključni događaji po korisniku",
    kratko: "Po korisniku",
    definicija: "Prosečan broj ključnih događaja po posetiocu.",
    format: "broj",
    smer: "vise",
    izvor: ["ga4"],
  },
  cena_po_kljucnom_dogadjaju: {
    kljuc: "cena_po_kljucnom_dogadjaju",
    naziv: "Cena po ključnom događaju",
    kratko: "Cena po događaju",
    definicija: "Potrošnja na oglase podeljena brojem ključnih događaja koje su doneli.",
    format: "novac",
    smer: "manje",
    izvor: ["ga4"],
  },
  sesije_po_kliku: {
    kljuc: "sesije_po_kliku",
    naziv: "Sesije po kliku",
    kratko: "Sesije po kliku",
    definicija: "Koliko je sesija na sajtu nastalo po jednom kliku na oglas.",
    format: "broj",
    smer: "vise",
    izvor: ["ga4"],
  },
  prosecno_zadrzavanje: {
    kljuc: "prosecno_zadrzavanje",
    naziv: "Prosečno zadržavanje",
    kratko: "Zadržavanje",
    definicija: "Prosečno vreme koje posetilac provede na stranici.",
    format: "trajanje",
    smer: "vise",
    izvor: ["ga4"],
  },
  retencija_1_nedelja: {
    kljuc: "retencija_1_nedelja",
    naziv: "Vratilo se posle 1 nedelje",
    kratko: "Posle 1 ned.",
    definicija: "Udeo novih posetilaca koji su se vratili u drugoj nedelji.",
    format: "procenat",
    smer: "vise",
    izvor: ["ga4"],
  },
  retencija_4_nedelje: {
    kljuc: "retencija_4_nedelje",
    naziv: "Vratilo se posle 4 nedelje",
    kratko: "Posle 4 ned.",
    definicija: "Udeo novih posetilaca koji su se vratili u petoj nedelji.",
    format: "procenat",
    smer: "vise",
    izvor: ["ga4"],
  },
  stopa_konverzije: {
    kljuc: "stopa_konverzije",
    naziv: "Stopa konverzije",
    kratko: "Konverzija",
    definicija: "Udeo sesija ili korisnika koji su izveli ključni događaj.",
    format: "procenat",
    smer: "vise",
    izvor: ["ga4"],
  },
  udeo_sesija: {
    kljuc: "udeo_sesija",
    naziv: "Udeo sesija",
    kratko: "Udeo",
    definicija: "Deo svih sesija koji pripada ovom izvoru ili stranici.",
    format: "procenat",
    smer: "neutralno",
    izvor: ["ga4"],
  },
  korisnici_uzivo: {
    kljuc: "korisnici_uzivo",
    naziv: "Na sajtu sada",
    kratko: "Uživo",
    definicija: "Broj posetilaca aktivnih na sajtu u poslednjih 30 minuta.",
    format: "broj",
    smer: "neutralno",
    izvor: ["ga4"],
  },
  pratioci: {
    kljuc: "pratioci",
    naziv: "Pratioci",
    kratko: "Pratioci",
    definicija: "Broj naloga koji prate profil, stanje na poslednji dan perioda.",
    format: "broj",
    smer: "vise",
    izvor: DRUSTVENE,
  },
  pratioci_neto: {
    kljuc: "pratioci_neto",
    naziv: "Pratioci (neto)",
    kratko: "Neto pratioci",
    definicija: "Novi pratioci umanjeni za one koji su prestali da prate, u periodu.",
    format: "broj",
    smer: "vise",
    izvor: ["youtube", "threads"],
  },
  pregledi_profila: {
    kljuc: "pregledi_profila",
    naziv: "Pregledi profila",
    kratko: "Pregledi profila",
    definicija: "Koliko puta je profil otvoren u periodu.",
    format: "broj",
    smer: "vise",
    izvor: ["meta_ig"],
  },
  interakcije: {
    kljuc: "interakcije",
    naziv: "Interakcije",
    kratko: "Interakcije",
    definicija: "Zbir sviđanja, komentara, deljenja i čuvanja na objavama.",
    format: "broj",
    smer: "vise",
    izvor: ["meta_ig"],
  },
  angazovani_nalozi: {
    kljuc: "angazovani_nalozi",
    naziv: "Angažovani nalozi",
    kratko: "Angažovani",
    definicija: "Broj različitih naloga koji su bar jednom reagovali na sadržaj.",
    format: "broj",
    smer: "vise",
    izvor: ["meta_ig"],
  },
  angazovanja: {
    kljuc: "angazovanja",
    naziv: "Angažovanja",
    kratko: "Angažovanja",
    definicija: "Zbir reakcija, komentara, deljenja i klikova na objave stranice.",
    format: "broj",
    smer: "vise",
    izvor: ["meta_fb"],
  },
  angazovanja_po_prikazu: {
    kljuc: "angazovanja_po_prikazu",
    naziv: "Angažovanja po prikazu",
    kratko: "Po prikazu",
    definicija: "Angažovanja podeljena prikazima: koliko često prikaz izazove reakciju.",
    format: "procenat",
    smer: "vise",
    izvor: ["meta_fb"],
  },
  pregledi: {
    kljuc: "pregledi",
    naziv: "Pregledi",
    kratko: "Pregledi",
    definicija: "Koliko puta su video zapisi gledani u periodu.",
    format: "broj",
    smer: "vise",
    izvor: ["youtube", "threads"],
  },
  vreme_gledanja: {
    kljuc: "vreme_gledanja",
    naziv: "Vreme gledanja",
    kratko: "Vreme gledanja",
    definicija: "Ukupno vreme koje su gledaoci proveli gledajući video zapise.",
    format: "trajanje",
    smer: "vise",
    izvor: ["youtube"],
  },
  prosecno_odgledano: {
    kljuc: "prosecno_odgledano",
    naziv: "Prosečno odgledano",
    kratko: "Odgledano",
    definicija: "Prosečan deo videa koji gledalac odgleda.",
    format: "procenat",
    smer: "vise",
    izvor: ["youtube"],
  },
  odgovori: {
    kljuc: "odgovori",
    naziv: "Odgovori",
    kratko: "Odgovori",
    definicija: "Broj odgovora na objave.",
    format: "broj",
    smer: "vise",
    izvor: ["threads"],
  },
  citati: {
    kljuc: "citati",
    naziv: "Citati",
    kratko: "Citati",
    definicija: "Broj objava drugih naloga koje citiraju objavu.",
    format: "broj",
    smer: "vise",
    izvor: ["threads"],
  },
  repostovi: {
    kljuc: "repostovi",
    naziv: "Repostovi",
    kratko: "Repostovi",
    definicija: "Broj ponovnih objava na tuđim profilima.",
    format: "broj",
    smer: "vise",
    izvor: ["threads"],
  },
  klikovi_na_linkove: {
    kljuc: "klikovi_na_linkove",
    naziv: "Klikovi na linkove",
    kratko: "Klikovi",
    definicija: "Broj klikova na linkove iz objava ili poruka.",
    format: "broj",
    smer: "vise",
    izvor: ["threads", "openreply"],
  },
  poslate_poruke: {
    kljuc: "poslate_poruke",
    naziv: "Poslate poruke",
    kratko: "Poruke",
    akronim: "DM",
    definicija: "Broj direktnih poruka koje je automatizacija poslala.",
    format: "broj",
    smer: "vise",
    izvor: ["openreply"],
  },
  neuspele_poruke: {
    kljuc: "neuspele_poruke",
    naziv: "Neuspele poruke",
    kratko: "Neuspele",
    definicija: "Broj poruka koje automatizacija nije uspela da pošalje.",
    format: "broj",
    smer: "manje",
    izvor: ["openreply"],
  },
  klikova_po_poruci: {
    kljuc: "klikova_po_poruci",
    naziv: "Klikova po poruci",
    kratko: "Klik po poruci",
    definicija: "Klikovi na linkove iz poruka podeljeni brojem poslatih poruka.",
    format: "procenat",
    smer: "vise",
    izvor: ["openreply"],
  },
  aktivne_automatizacije: {
    kljuc: "aktivne_automatizacije",
    naziv: "Aktivne automatizacije",
    kratko: "Aktivne",
    definicija: "Broj automatizacija koje su sada uključene.",
    format: "broj",
    smer: "neutralno",
    izvor: ["openreply"],
  },
  leadovi_bez_poziva: {
    kljuc: "leadovi_bez_poziva",
    naziv: "Leadovi bez poziva",
    kratko: "Bez poziva",
    definicija: "Firme kojima još niko nije zabeležio poziv.",
    format: "broj",
    smer: "manje",
    izvor: ["leadovi"],
  },
  pozivi: {
    kljuc: "pozivi",
    naziv: "Pozivi",
    kratko: "Pozivi",
    definicija: "Broj zabeleženih poziva firmama u periodu.",
    format: "broj",
    smer: "vise",
    izvor: ["leadovi"],
  },
  sastanci: {
    kljuc: "sastanci",
    naziv: "Sastanci",
    kratko: "Sastanci",
    definicija: "Broj dogovorenih sastanaka sa firmama u periodu.",
    format: "broj",
    smer: "vise",
    izvor: ["leadovi"],
  },
  upiti: {
    kljuc: "upiti",
    naziv: "Upiti",
    kratko: "Upiti",
    definicija: "Javljanja zainteresovanih: poziv, forma ili poruka.",
    format: "broj",
    smer: "vise",
    izvor: ["ga4", "leadovi"],
  },
} as const satisfies Record<string, Mera>;

export type KljucMere = keyof typeof MERE;

export function mera(k: KljucMere): Mera {
  return MERE[k];
}

/** Za postojeći boolean `higherIsBetter`: `true` samo kad je rast dobar. */
export function veceJeBolje(k: KljucMere): boolean {
  return MERE[k].smer === "vise";
}

/**
 * Da li je promena dobra vest. `null` kad mera nema smer (`neutralno`) ili
 * kad promene praktično nema — tada pilula nije ni zelena ni crvena.
 */
export function dobraPromena(k: KljucMere, promena: number): boolean | null {
  return dobraPromenaPoSmeru(MERE[k].smer, promena);
}

export function dobraPromenaPoSmeru(
  smer: SmerMere,
  promena: number,
): boolean | null {
  if (smer === "neutralno") return null;
  if (!Number.isFinite(promena) || Math.abs(promena) < 1e-9) return null;
  return promena > 0 === (smer === "vise");
}
