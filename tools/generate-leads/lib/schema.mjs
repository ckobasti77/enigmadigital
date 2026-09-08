/**
 * ============================================================================
 * ŠEMA TELA ZA `/generate-leads/ingest` — RUČNO PRESLIKANA (bez zavisnosti)
 * ============================================================================
 *
 * Izvor istine je `convex/lib/generateLeadsIngest.ts` (zod). Ovo je njegova
 * kopija bez zod-a, da `run.mjs` ostane čist Node i da se telo odbije OVDE, na
 * Jovanovoj mašini, a ne kao „400" posle mrežnog puta.
 *
 * DVE KOPIJE ISTE ŠEME SE RAZILAZE. Zato `run.mjs self-test` pušta ISTE JSON
 * primere kroz obe (zod se učitava direktno iz `.ts` fajla — Node 22 skida
 * tipove sam) i pada ako se presude ili putanje polja ne poklope. Kad neko doda
 * polje u Convexu, test pada ovde, pre nego što se pojavi u tri ujutru.
 *
 * Poruke greške sadrže SAMO putanju polja i vrstu problema (§0 pravilo 6) —
 * nikad vrednost, jer vrednost je telefon, mejl ili nečije ime.
 */

export const MAX_INGEST_ROWS = 200;
export const MAX_PEOPLE_PER_ROW = 3;
export const MAX_PLATFORMS_PER_ROW = 10;

const VRSTE_PLATFORMI = ["instagram", "facebook", "tiktok", "website", "threads"];
const IMA_SAJT = ["da", "ne", "nepoznato"];
const STATUSI_SAJTA = ["radi", "ne_radi", "parkiran", "preusmerava_na_drustvene", "nepoznato"];
const FILTERI_SAJTA = ["ima", "nema", "svejedno"];
// GL9 §4: podskup polja koje „obogati --polja" tok dopunjuje.
const POLJA_OBOGATI = ["sajt", "osobe", "platforme", "koordinate"];

/** Sakupljač grešaka. Putanja + `code`, isti oblik koji ruta vraća u 400. */
class Greske {
  constructor() {
    this.lista = [];
  }
  dodaj(putanja, code) {
    this.lista.push(`${putanja.length > 0 ? putanja : "(koren tela)"}: ${code}`);
  }
  get putanje() {
    return [...new Set(this.lista)].sort();
  }
}

const jeObjekat = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** `z.string().trim().min(1)` — prazan i razmakom popunjen string su isto. */
function neprazan(vrednost, putanja, g, code = "too_small") {
  if (typeof vrednost !== "string") {
    g.dodaj(putanja, "invalid_type");
    return false;
  }
  if (vrednost.trim().length === 0) {
    g.dodaj(putanja, code);
    return false;
  }
  return true;
}

function broj(vrednost, putanja, g, { min, max, ceo = false } = {}) {
  if (typeof vrednost !== "number" || !Number.isFinite(vrednost)) {
    g.dodaj(putanja, "invalid_type");
    return false;
  }
  if (ceo && !Number.isInteger(vrednost)) {
    g.dodaj(putanja, "invalid_type");
    return false;
  }
  if (min !== undefined && vrednost < min) {
    g.dodaj(putanja, "too_small");
    return false;
  }
  if (max !== undefined && vrednost > max) {
    g.dodaj(putanja, "too_big");
    return false;
  }
  return true;
}

function enumeracija(vrednost, dozvoljene, putanja, g) {
  if (typeof vrednost !== "string" || !dozvoljene.includes(vrednost)) {
    g.dodaj(putanja, "invalid_value");
    return false;
  }
  return true;
}

function opcioniNeprazan(objekat, kljuc, putanja, g) {
  if (objekat[kljuc] === undefined) return;
  neprazan(objekat[kljuc], `${putanja}.${kljuc}`, g);
}

function nizStringova(vrednost, putanja, g) {
  if (!Array.isArray(vrednost)) {
    g.dodaj(putanja, "invalid_type");
    return;
  }
  vrednost.forEach((el, i) => neprazan(el, `${putanja}.${i}`, g));
}

function proveriOcenu(ocena, putanja, g) {
  if (!jeObjekat(ocena)) {
    g.dodaj(putanja, "invalid_type");
    return;
  }
  if (ocena.vrednost !== undefined) broj(ocena.vrednost, `${putanja}.vrednost`, g);
  if (ocena.skala !== undefined) broj(ocena.skala, `${putanja}.skala`, g);
  if (ocena.brojRecenzija !== undefined) {
    broj(ocena.brojRecenzija, `${putanja}.brojRecenzija`, g, { min: 0, ceo: true });
  }
  opcioniNeprazan(ocena, "izvor", putanja, g);
}

function proveriPlatformu(p, putanja, g) {
  if (!jeObjekat(p)) {
    g.dodaj(putanja, "invalid_type");
    return;
  }
  enumeracija(p.vrsta, VRSTE_PLATFORMI, `${putanja}.vrsta`, g);
  neprazan(p.url, `${putanja}.url`, g);
  // `sourceUrl` je OBAVEZAN: identitet bez izvora ne sme ni da nastane (ZZPL §8).
  neprazan(p.sourceUrl, `${putanja}.sourceUrl`, g);
}

function proveriOsobu(o, putanja, g) {
  if (!jeObjekat(o)) {
    g.dodaj(putanja, "invalid_type");
    return;
  }
  neprazan(o.ime, `${putanja}.ime`, g);
  neprazan(o.uloga, `${putanja}.uloga`, g);
  neprazan(o.ulogaIzvor, `${putanja}.ulogaIzvor`, g);
  opcioniNeprazan(o, "telefon", putanja, g);
  opcioniNeprazan(o, "telefonSourceUrl", putanja, g);
  opcioniNeprazan(o, "obrazlozenje", putanja, g);

  if (o.verovatnoca !== undefined) {
    broj(o.verovatnoca, `${putanja}.verovatnoca`, g, { min: 0, max: 95 });
  }
  if (o.nijeMoguceProceniti !== undefined && typeof o.nijeMoguceProceniti !== "boolean") {
    g.dodaj(`${putanja}.nijeMoguceProceniti`, "invalid_type");
  }
  if (o.rang !== 1 && o.rang !== 2 && o.rang !== 3) {
    g.dodaj(`${putanja}.rang`, "invalid_union");
  }

  // Dva `refine`-a iz zod šeme, istim putanjama i istim `code`-om.
  if (o.verovatnoca !== undefined && o.nijeMoguceProceniti === true) {
    g.dodaj(`${putanja}.verovatnoca`, "custom");
  }
  if (o.telefon !== undefined && o.telefonSourceUrl === undefined) {
    g.dodaj(`${putanja}.telefonSourceUrl`, "custom");
  }
}

function proveriRed(red, putanja, g) {
  if (!jeObjekat(red)) {
    g.dodaj(putanja, "invalid_type");
    return;
  }

  for (const kljuc of [
    "nazivFirme",
    "ulica",
    "opstina",
    "grad",
    "telefon",
    "telefonNapomena",
    "email",
    "sajt",
    "imeOsobe",
    "uloga",
    "companyWallUrl",
    "pib",
    "maticniBroj",
    "sifraDelatnosti",
    "napomena",
    "placeId",
    "nisa",
    "imaSajtNapomena",
    "sajtNapomena",
    "izvestajSkilla",
    // GL8: ID postojeće firme iz izvoza aplikacije (režim „obogati").
    "postojecaFirmaId",
  ]) {
    opcioniNeprazan(red, kljuc, putanja, g);
  }

  if (red.ocena !== undefined) proveriOcenu(red.ocena, `${putanja}.ocena`, g);
  if (red.companyWallTacnost !== undefined) {
    enumeracija(red.companyWallTacnost, ["tacno", "priblizno"], `${putanja}.companyWallTacnost`, g);
  }
  if (red.imaSajt !== undefined) enumeracija(red.imaSajt, IMA_SAJT, `${putanja}.imaSajt`, g);
  if (red.sajtStatus !== undefined) {
    enumeracija(red.sajtStatus, STATUSI_SAJTA, `${putanja}.sajtStatus`, g);
  }
  if (red.sajtHttps !== undefined && typeof red.sajtHttps !== "boolean") {
    g.dodaj(`${putanja}.sajtHttps`, "invalid_type");
  }
  if (red.sajtProverenAt !== undefined) broj(red.sajtProverenAt, `${putanja}.sajtProverenAt`, g);

  // `izvori` i `derivedSignals` imaju `default([])` — odsustvo je dozvoljeno.
  if (red.izvori !== undefined) nizStringova(red.izvori, `${putanja}.izvori`, g);
  if (red.derivedSignals !== undefined) {
    nizStringova(red.derivedSignals, `${putanja}.derivedSignals`, g);
  }
  if (red.derivedFields !== undefined) nizStringova(red.derivedFields, `${putanja}.derivedFields`, g);

  if (red.koordinate !== undefined) {
    const k = red.koordinate;
    if (!jeObjekat(k)) {
      g.dodaj(`${putanja}.koordinate`, "invalid_type");
    } else {
      broj(k.lat, `${putanja}.koordinate.lat`, g, { min: -90, max: 90 });
      broj(k.lng, `${putanja}.koordinate.lng`, g, { min: -180, max: 180 });
      if (k.izvor !== "nominatim") g.dodaj(`${putanja}.koordinate.izvor`, "invalid_value");
    }
  }

  if (red.platforme !== undefined) {
    if (!Array.isArray(red.platforme)) {
      g.dodaj(`${putanja}.platforme`, "invalid_type");
    } else {
      red.platforme.forEach((p, i) => proveriPlatformu(p, `${putanja}.platforme.${i}`, g));
      if (red.platforme.length > MAX_PLATFORMS_PER_ROW) {
        g.dodaj(`${putanja}.platforme`, "too_big");
      }
    }
  }

  if (red.osobe !== undefined) {
    if (!Array.isArray(red.osobe)) {
      g.dodaj(`${putanja}.osobe`, "invalid_type");
    } else {
      red.osobe.forEach((o, i) => proveriOsobu(o, `${putanja}.osobe.${i}`, g));
      if (red.osobe.length > MAX_PEOPLE_PER_ROW) {
        g.dodaj(`${putanja}.osobe`, "too_big");
      }
    }
  }
}

/**
 * Validira celo telo zahteva.
 *
 * @returns {{ok: true} | {ok: false, polja: string[]}}
 */
export function validirajTelo(telo) {
  const g = new Greske();

  if (!jeObjekat(telo)) {
    g.dodaj("", "invalid_type");
    return { ok: false, polja: g.putanje };
  }

  if (telo.verzija !== 1) g.dodaj("verzija", "invalid_value");

  if (!jeObjekat(telo.upit)) {
    g.dodaj("upit", "invalid_type");
  } else {
    neprazan(telo.upit.grad, "upit.grad", g);
    neprazan(telo.upit.nisa, "upit.nisa", g);
    broj(telo.upit.brojTrazen, "upit.brojTrazen", g, { min: 1, max: 50, ceo: true });
    enumeracija(telo.upit.filterSajt, FILTERI_SAJTA, "upit.filterSajt", g);
    // `nisaOpis` je opcion; `z.string().trim().min(1).max(1200)` (GL6 §4).
    if (telo.upit.nisaOpis !== undefined) {
      if (neprazan(telo.upit.nisaOpis, "upit.nisaOpis", g)) {
        if (telo.upit.nisaOpis.trim().length > 1200) g.dodaj("upit.nisaOpis", "too_big");
      }
    }
    // GL8: režim skilla i naziv izvora, oba opciona.
    if (telo.upit.rezim !== undefined) {
      enumeracija(telo.upit.rezim, ["otkrivanje", "obogati"], "upit.rezim", g);
    }
    opcioniNeprazan(telo.upit, "izvorFajl", "upit", g);
    // GL9 §4: podskup polja („obogati --polja"). `z.array(enum).min(1).optional()`.
    if (telo.upit.polja !== undefined) {
      if (!Array.isArray(telo.upit.polja)) {
        g.dodaj("upit.polja", "invalid_type");
      } else {
        telo.upit.polja.forEach((el, i) => enumeracija(el, POLJA_OBOGATI, `upit.polja.${i}`, g));
        if (telo.upit.polja.length < 1) g.dodaj("upit.polja", "too_small");
      }
    }
  }

  if (!jeObjekat(telo.izvor)) {
    g.dodaj("izvor", "invalid_type");
  } else {
    if (telo.izvor.skill !== "generate-leads") g.dodaj("izvor.skill", "invalid_value");
    neprazan(telo.izvor.verzijaSkilla, "izvor.verzijaSkilla", g);
    broj(telo.izvor.pokrenutAt, "izvor.pokrenutAt", g);
  }

  if (!Array.isArray(telo.redovi)) {
    g.dodaj("redovi", "invalid_type");
  } else {
    telo.redovi.forEach((red, i) => proveriRed(red, `redovi.${i}`, g));
    // `min(1)`: skill koji je pao i skill koji je našao nula firmi su dva ishoda
    // sa dve poruke (§0 pravilo 3) — prazan uvoz nema šta da se pregleda.
    if (telo.redovi.length < 1) g.dodaj("redovi", "too_small");
    if (telo.redovi.length > MAX_INGEST_ROWS) g.dodaj("redovi", "too_big");
  }

  if (!jeObjekat(telo.izvestaj)) {
    g.dodaj("izvestaj", "invalid_type");
  } else {
    broj(telo.izvestaj.nadjeno, "izvestaj.nadjeno", g, { min: 0, ceo: true });
    broj(telo.izvestaj.trazeno, "izvestaj.trazeno", g, { min: 0, ceo: true });
    if (typeof telo.izvestaj.iscrpljen !== "boolean") g.dodaj("izvestaj.iscrpljen", "invalid_type");
    broj(telo.izvestaj.placesPozivi, "izvestaj.placesPozivi", g, { min: 0, ceo: true });
    if (telo.izvestaj.nedostupniIzvori !== undefined) {
      nizStringova(telo.izvestaj.nedostupniIzvori, "izvestaj.nedostupniIzvori", g);
    }
    opcioniNeprazan(telo.izvestaj, "napomena", "izvestaj", g);
  }

  return g.putanje.length === 0 ? { ok: true } : { ok: false, polja: g.putanje };
}
