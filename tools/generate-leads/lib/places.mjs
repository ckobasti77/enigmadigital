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
 * FieldMask je namerno uzak: traži se tačno pet polja + `nextPageToken`. Šire
 * polje bi bilo i skuplje i podatak koji ne smemo da zadržimo.
 *
 * Poziv koji padne (403, kvota, mreža) BACA grešku i zaustavlja run (§3.7).
 * Nastavak bez otkrivanja bi izgledao kao „grad nema firme", a to je laž.
 */

const KRAJNJA_TACKA = "https://places.googleapis.com/v1/places:searchText";

const POLJA = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

/** Bez dijakritika i interpunkcije — poređenje grada sa adresom mora da radi
 *  i za „Kraljevo" i za „KRALjEVO" i za „Kruševac / Krusevac". */
export function uprosti(tekst) {
  const zamene = { č: "c", ć: "c", ž: "z", š: "s", đ: "dj" };
  return String(tekst ?? "")
    .toLowerCase()
    .replace(/[čćžšđ]/g, (ch) => zamene[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
    languageCode: "sr",
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
 * @returns {Promise<{kandidati: object[], pozivi: number, iscrpljeno: boolean, vanGrada: number, zatvoreni: number}>}
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
  let iscrpljeno = true;

  const prihvatljivi = [grad, ...gradAlijasi].map(uprosti).filter(Boolean);

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

        // Trajno zatvorene firme nisu leadovi. Privremeno zatvorene ostaju.
        if (mesto.businessStatus === "CLOSED_PERMANENTLY") {
          zatvoreni += 1;
          continue;
        }

        const adresa = uprosti(mesto.formattedAddress ?? "");
        if (!prihvatljivi.some((g) => adresa.includes(g))) {
          vanGrada += 1;
          continue;
        }

        kandidati.push({
          placeId,
          displayName: mesto.displayName?.text ?? "",
          formattedAddress: mesto.formattedAddress ?? "",
          websiteUri: mesto.websiteUri ?? "",
          upit,
        });
      }

      log(`  upit „${upit}", strana ${strana + 1}: ukupno kandidata ${kandidati.length}`);

      if (kandidati.length >= ciljKandidata) {
        // Stali smo zato što je dosta, ne zato što je Places presušio — grad
        // NIJE iscrpljen i `iscrpljen: true` bi bila lažna tvrdnja (§O10).
        return { kandidati, pozivi, iscrpljeno: false, vanGrada, zatvoreni };
      }

      if (!sledecaStrana) break;
      pageToken = sledecaStrana;
      if (strana + 1 === maxStrana) iscrpljeno = false; // stali smo na kapu strana
    }
  }

  return { kandidati, pozivi, iscrpljeno, vanGrada, zatvoreni };
}
