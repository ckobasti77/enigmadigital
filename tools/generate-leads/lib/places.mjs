/**
 * ============================================================================
 * GOOGLE PLACES — Text Search (New), SAMO za otkrivanje kandidata (plan §3)
 * ============================================================================
 *
 * PRAVNA GRANICA, NE TEHNIČKA (§3, §O3): `place_id` sme trajno da se čuva;
 * naziv, telefon, sajt, ocena i koordinate iz Placesa ne smeju da postanu naša
 * baza. Zato ovaj modul vraća kandidate koji žive u `out/<run-id>/kandidati.json`
 * do kraja runa i tu se brišu, a u aplikaciju ulazi samo ono što je Claude
 * potvrdio iz primarnog izvora (sajt, CompanyWall, 011info, javni profil).
 *
 * FieldMask je namerno uzak: traži se tačno četiri polja + `nextPageToken`. Šire
 * polje bi bilo i skuplje i podatak koji ne smemo da zadržimo.
 *
 * SKU (sajt-ocena-plan.md §4.5): sa `places.websiteUri` u FieldMask-u Text
 * Search se naplaćuje kao ENTERPRISE (1.000 besplatnih poziva mesečno); bez
 * njega je PRO (5.000). Postojanje sajta se ionako proverava iz tri druga
 * izvora (plan §3.4), pa `websiteUri` više NIJE u maski — `kandidati.json`
 * nema to polje, a skill ne sme da ga očekuje.
 *
 * Poziv koji padne (403, kvota, mreža) BACA grešku i zaustavlja run (§3.7).
 * Nastavak bez otkrivanja bi izgledao kao „grad nema firme", a to je laž.
 */

const KRAJNJA_TACKA = "https://places.googleapis.com/v1/places:searchText";

const POLJA = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.businessStatus",
  "nextPageToken",
].join(",");

/**
 * Ćirilica → latinica bez dijakritika, u jednom koraku (GL6 §3). Places bez
 * `languageCode` vraća čas „Београд" čas „Belgrade", pa poređenje grada sa
 * adresom mora da radi za oba pisma: „Београд" i „Beograd" moraju da daju isti
 * ključ. Digrafi (ђ, љ, њ, џ) idu prvi jer daju dva latinična slova; ostalo je
 * 1:1 na latinicu bez dijakritika.
 */
const CIRILICA = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "dj", е: "e", ж: "z", з: "z",
  и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o",
  п: "p", р: "r", с: "s", т: "t", ћ: "c", у: "u", ф: "f", х: "h", ц: "c",
  ч: "c", џ: "dz", ш: "s",
};
const LATINICA = { č: "c", ć: "c", ž: "z", š: "s", đ: "dj" };

/** Bez pisma, dijakritika i interpunkcije — poređenje grada sa adresom mora da
 *  radi i za „Kraljevo" i za „KRALjEVO" i za „Kruševac / Krusevac" i za
 *  „Београд / Belgrade". */
export function uprosti(tekst) {
  const s = String(tekst ?? "").toLowerCase();
  let latinicno = "";
  for (const ch of s) latinicno += CIRILICA[ch] ?? LATINICA[ch] ?? ch;
  return latinicno.replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Uprošćena lista prihvatljivih naziva grada (kanonski + alijasi), bez praznih.
 * Ista lista se koristi u otkrivanju i u self-testu — filter grada se ne piše
 * dvaput (GL6 §3).
 */
export function prihvatljiviGradovi(grad, gradAlijasi = []) {
  return [grad, ...gradAlijasi].map(uprosti).filter(Boolean);
}

/** Da li `formattedAddress` pripada nekom od prihvatljivih (uprošćenih) gradova. */
export function uGradu(formattedAddress, prihvatljiviUprosceni) {
  const adresa = uprosti(formattedAddress ?? "");
  if (!adresa) return false;
  return prihvatljiviUprosceni.some((g) => g && adresa.includes(g));
}

/** Greška Places poziva — nosi status, da poruka runa može da ga imenuje. */
export class PlacesGreska extends Error {
  constructor(poruka, status) {
    super(poruka);
    this.name = "PlacesGreska";
    this.status = status;
  }
}

/**
 * Jedna strana rezultata. Vraća `{ mesta, sledecaStrana }`.
 *
 * Telo NIKAD ne ide u poruku greške: Places vraća nazive i adrese firmi, a
 * poruka greške završi u terminalu i u izveštaju.
 */
export async function pretraziStranu({ apiKey, upit, pageToken, signal }) {
  const telo = {
    textQuery: upit,
    // `sr-Latn` + `RS`: bez ovoga Places vraća čas ćirilicu čas engleski, pa
    // filter grada nikad ne prođe (GL6 §3). Latinica je i ono što aplikacija
    // prikazuje, pa nema naknadne transliteracije naziva.
    languageCode: "sr-Latn",
    regionCode: "RS",
    pageSize: 20,
  };
  if (pageToken) telo.pageToken = pageToken;

  let odgovor;
  try {
    odgovor = await fetch(KRAJNJA_TACKA, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": POLJA,
      },
      body: JSON.stringify(telo),
    });
  } catch (err) {
    throw new PlacesGreska(`mreža: ${err?.cause?.code ?? err?.name ?? "nepoznata greška"}`, 0);
  }

  if (!odgovor.ok) {
    throw new PlacesGreska(`Places je vratio ${odgovor.status}`, odgovor.status);
  }

  let podaci;
  try {
    podaci = await odgovor.json();
  } catch {
    throw new PlacesGreska("Places je vratio odgovor koji nije JSON", odgovor.status);
  }

  return {
    mesta: Array.isArray(podaci.places) ? podaci.places : [],
    sledecaStrana: typeof podaci.nextPageToken === "string" ? podaci.nextPageToken : null,
  };
}

/**
 * Otkrivanje kandidata za jedan grad i jednu nišu.
 *
 * @param {object} args
 * @param {string[]} args.upiti          upiti niše (sr pa en)
 * @param {string} args.grad             kanonski naziv grada (ulazi u upit)
 * @param {string[]} args.gradAlijasi    dodatni nazivi prihvatljivi u adresi
 * @param {number} args.ciljKandidata    koliko kandidata je dovoljno
 * @param {number} args.maxStrana        gornja granica strana PO UPITU (kvota)
 * @param {(poruka: string) => void} [args.log]
 * @returns {Promise<{kandidati: object[], pozivi: number, iscrpljeno: boolean, vanGrada: number, zatvoreni: number, pregledano: number, primeriVanGrada: string[]}>}
 */
export async function otkrijKandidate({
  apiKey,
  upiti,
  grad,
  gradAlijasi = [],
  ciljKandidata,
  maxStrana = 3,
  log = () => {},
}) {
  const viđeni = new Set();
  const kandidati = [];
  let pozivi = 0;
  let vanGrada = 0;
  let zatvoreni = 0;
  // Koliko je JEDINSTVENIH mesta uopšte pregledano (posle dedupa) — imenilac za
  // upozorenje „grad je odbacio većinu" (GL6 §3).
  let pregledano = 0;
  // Prva tri odbačena oblika adrese (BEZ imena firme) — da čovek vidi ZAŠTO je
  // filter grada odbacio kandidata: skoro uvek je grad drugačije napisan.
  const primeriVanGrada = [];
  let iscrpljeno = true;

  const prihvatljivi = prihvatljiviGradovi(grad, gradAlijasi);

  for (const upit of upiti) {
    let pageToken = null;

    for (let strana = 0; strana < maxStrana; strana += 1) {
      let strana_rezultat;
      try {
        strana_rezultat = await pretraziStranu({ apiKey, upit: `${upit} ${grad}`, pageToken });
      } catch (err) {
        // Broj već potrošenih poziva putuje sa greškom: run staje, ali kvota je
        // potrošena i to mora da se vidi (§3, poslednji pasus).
        err.pozivi = pozivi;
        throw err;
      }
      const { mesta, sledecaStrana } = strana_rezultat;
      pozivi += 1;

      for (const mesto of mesta) {
        const placeId = mesto.id;
        if (!placeId || viđeni.has(placeId)) continue;
        viđeni.add(placeId);
        pregledano += 1;

        // Trajno zatvorene firme nisu leadovi. Privremeno zatvorene ostaju.
        if (mesto.businessStatus === "CLOSED_PERMANENTLY") {
          zatvoreni += 1;
          continue;
        }

        if (!uGradu(mesto.formattedAddress, prihvatljivi)) {
          vanGrada += 1;
          if (primeriVanGrada.length < 3 && mesto.formattedAddress) {
            primeriVanGrada.push(mesto.formattedAddress);
          }
          continue;
        }

        kandidati.push({
          placeId,
          displayName: mesto.displayName?.text ?? "",
          formattedAddress: mesto.formattedAddress ?? "",
          upit,
        });
      }

      log(`  upit „${upit}", strana ${strana + 1}: ukupno kandidata ${kandidati.length}`);

      if (kandidati.length >= ciljKandidata) {
        // Stali smo zato što je dosta, ne zato što je Places presušio — grad
        // NIJE iscrpljen i `iscrpljen: true` bi bila lažna tvrdnja (§O10).
        return {
          kandidati,
          pozivi,
          iscrpljeno: false,
          vanGrada,
          zatvoreni,
          pregledano,
          primeriVanGrada,
        };
      }

      if (!sledecaStrana) break;
      pageToken = sledecaStrana;
      if (strana + 1 === maxStrana) iscrpljeno = false; // stali smo na kapu strana
    }
  }

  return { kandidati, pozivi, iscrpljeno, vanGrada, zatvoreni, pregledano, primeriVanGrada };
}
