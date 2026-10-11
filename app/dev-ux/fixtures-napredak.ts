import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import {
  PODRAZUMEVANO,
  danKljuc,
  dodajDane,
  izvedi,
  izvediProfil,
  lokalnoUEpohu,
  pocetakDana,
  ponedeljak,
  praznaOsnova,
  type Dogadjaj,
  type MisijaDef,
  type Osnova,
  type UlazIzvedi,
} from "@/convex/lib/napredak";
import { USER, lcg, now, type Fixture, type R } from "./fixtures-util";

/**
 * Sintetički Napredak za razvojni prikaz (B4 → snimci u B5).
 *
 * Ništa ovde nije upisano rukom kao REZULTAT: upisan je ulaz (zbir zaključenih
 * dana, događaji juče i danas, zamrznute misije), a `stanje` i `profil` ga
 * provlače kroz ista pravila koja rade na produkciji (`convex/lib/napredak.ts`)
 * — isto kao što `staMeCeka` prolazi kroz `napraviZadatke`. Ako se pravilo
 * promeni, snimak se promeni sa njim.
 *
 * Ulaz je podešen da da: nivo 7 (1.370 XP), niz 4, 2 od 3 misije završene.
 * `npm run verify:napredak` to proverava nad ovim istim fixture-om.
 */

const fn = getFunctionName;
const KORISNIK = String(USER);

const DANAS = danKljuc(now);
const JUCE = dodajDane(DANAS, -1);
const PREKJUCE = dodajDane(DANAS, -2);

/** Trenutak u toku dana koji nikad nije u budućnosti u odnosu na snimak. */
function uDanu(dan: string, sat: number, min: number): number {
  const planirano = lokalnoUEpohu(dan, sat) + min * 60_000;
  return Math.max(pocetakDana(dan), Math.min(now, planirano));
}

let redniBroj = 0;
function dogadjaj(
  vrsta: Dogadjaj["vrsta"],
  at: number,
  ostalo: Partial<Dogadjaj> = {},
): Dogadjaj {
  redniBroj++;
  return {
    id: `nap_test_${String(redniBroj).padStart(3, "0")}`,
    vrsta,
    at,
    upisanAt: at,
    autor: KORISNIK,
    ...ostalo,
  };
}

// Juče: 4 dodira, 3 ishoda, 1 sastanak = 135 XP; dan se računa (≥ 3 događaja).
const JUCE_DOGADJAJI: Dogadjaj[] = [
  dogadjaj("dodir", uDanu(JUCE, 10, 5), { firma: "firma_1", podvrsta: "poziv" }),
  dogadjaj("ishod", uDanu(JUCE, 10, 7), { firma: "firma_1", podvrsta: "zainteresovan" }),
  dogadjaj("dodir", uDanu(JUCE, 10, 30), { firma: "firma_2", podvrsta: "poziv" }),
  dogadjaj("ishod", uDanu(JUCE, 10, 32), { firma: "firma_2", podvrsta: "nije_zainteresovan" }),
  dogadjaj("dodir", uDanu(JUCE, 11, 10), { firma: "firma_3", podvrsta: "poziv" }),
  dogadjaj("ishod", uDanu(JUCE, 11, 12), { firma: "firma_3", podvrsta: "zainteresovan" }),
  dogadjaj("sastanak", uDanu(JUCE, 11, 20), { firma: "firma_3", meta: "termin_1" }),
  dogadjaj("dodir", uDanu(JUCE, 14, 0), { firma: "firma_4", podvrsta: "email" }),
];

// Danas: 3 poziva (misija „Pozovi 3" završena), 5 rešenih redova (misija
// „Reši 5" završena), 1 odgovor od 3 (misija u toku) = 80 + 110 XP.
const DANAS_DOGADJAJI: Dogadjaj[] = [
  dogadjaj("dodir", uDanu(DANAS, 9, 5), { firma: "firma_5", podvrsta: "poziv" }),
  dogadjaj("ishod", uDanu(DANAS, 9, 7), { firma: "firma_5", podvrsta: "zainteresovan" }),
  dogadjaj("dodir", uDanu(DANAS, 9, 25), { firma: "firma_6", podvrsta: "poziv" }),
  dogadjaj("ishod", uDanu(DANAS, 9, 27), { firma: "firma_6", podvrsta: "preskupo" }),
  dogadjaj("dodir", uDanu(DANAS, 9, 50), { firma: "firma_7", podvrsta: "poziv" }),
  dogadjaj("red", uDanu(DANAS, 10, 10)),
  dogadjaj("red", uDanu(DANAS, 10, 11)),
  dogadjaj("red", uDanu(DANAS, 10, 12)),
  dogadjaj("red", uDanu(DANAS, 10, 13)),
  dogadjaj("red", uDanu(DANAS, 10, 14)),
  dogadjaj("moderacija", uDanu(DANAS, 10, 40), { podvrsta: "reply", meta: "ig:komentar_1" }),
];

const MISIJE_DANAS: MisijaDef[] = [
  { kljuc: "pozovi", cilj: 3, xp: 60, oblast: "pozivi", veza: "/leadovi" },
  { kljuc: "uvoz_redovi", cilj: 5, xp: 50, oblast: "uvoz", veza: "/leadovi/uvoz" },
  { kljuc: "komentari", cilj: 3, xp: 30, oblast: "kanali", veza: "/instagram/komentari" },
];

/** Zbir zaključenih dana: 1.045 XP i niz od 2 dana zaključno sa prekjuče. */
const OSNOVA: Osnova = {
  ...praznaOsnova(),
  do: PREKJUCE,
  xp: 1045,
  niz: 2,
  nizDo: PREKJUCE,
  najduziNiz: 9,
  brojaci: {
    dodiri: 62,
    pozivi: 58,
    sastanci: 4,
    ponude: 2,
    dobijeni: 0,
    objave: 6,
    moderacije: 21,
    dopune: 9,
    uvozi: 4,
    redovi: 37,
    pravila: 1,
    danaSaXp: 18,
  },
  nedelja: { pon: ponedeljak(PREKJUCE), pozivi: 9, sastanci: 1, objave: 1 },
  serije: { uvekIshod: 3, bezZaostataka: 0 },
  rekordi: {
    xpDan: 210,
    xpDanKad: dodajDane(DANAS, -9),
    poziviDan: 11,
    poziviDanKad: dodajDane(DANAS, -9),
    sastanciNedelja: 2,
  },
  otkljucano: {
    prvi_kontakt: pocetakDana(dodajDane(DANAS, -41)),
    zakazano: pocetakDana(dodajDane(DANAS, -30)),
    ponuda_poslata: pocetakDana(dodajDane(DANAS, -19)),
    cuvar_budzeta: pocetakDana(dodajDane(DANAS, -12)),
  },
};

/** Ulaz iz kog nastaju `stanje` i `profil`. */
export const NAPREDAK_ULAZ: UlazIzvedi = {
  korisnik: KORISNIK,
  sidro: DANAS,
  prviDan: false,
  odseceno: false,
  osnova: OSNOVA,
  dogadjaji: [...JUCE_DOGADJAJI, ...DANAS_DOGADJAJI],
  misijePoDanu: { [DANAS]: MISIJE_DANAS },
  naOtvaranjuPoDanu: {},
  aktivnoPraviloAt: null,
  podesavanja: PODRAZUMEVANO,
  // Sve već viđeno: razvojni prikaz ne sme da krene proslavom pri svakom snimku.
  potvrde: {
    dnevne: ["misija:pozovi", "misija:uvoz_redovi"],
    trajne: [
      "dostignuce:prvi_kontakt",
      "dostignuce:zakazano",
      "dostignuce:ponuda_poslata",
      "dostignuce:cuvar_budzeta",
    ],
    nivo: 7,
  },
};

/** XP zaključenih dana za mapu aktivnosti — deterministično, radni dani gušći. */
function zakljuceniDani(): Array<{ dan: string; xp: number }> {
  const rand = lcg(4);
  const out: Array<{ dan: string; xp: number }> = [];
  for (let i = 83; i >= 2; i--) {
    const dan = dodajDane(DANAS, -i);
    const d = new Date(`${dan}T00:00:00Z`).getUTCDay();
    const vikend = d === 0 || d === 6;
    const r = rand();
    // Rekordni dan iz zbira (210 XP, pre devet dana) mora da bude i na mapi.
    if (i === 9) {
      out.push({ dan, xp: OSNOVA.rekordi.xpDan });
      continue;
    }
    if (vikend ? r < 0.85 : r < 0.3) continue;
    out.push({ dan, xp: 15 + Math.floor(rand() * 170) });
  }
  return out;
}

const stanje: R<typeof api.napredak.stanje> = izvedi(NAPREDAK_ULAZ);
const profil: R<typeof api.napredak.profil> = izvediProfil({
  ...NAPREDAK_ULAZ,
  zakljuceniDani: zakljuceniDani(),
});

/** Prazan nalog: dan je zamrznut, a još se ništa nije desilo. */
const PRAZAN_ULAZ: UlazIzvedi = {
  korisnik: KORISNIK,
  sidro: DANAS,
  prviDan: true,
  odseceno: false,
  osnova: { ...praznaOsnova(), do: PREKJUCE },
  dogadjaji: [],
  misijePoDanu: {},
  naOtvaranjuPoDanu: {},
  aktivnoPraviloAt: null,
  podesavanja: PODRAZUMEVANO,
  potvrde: { dnevne: [], trajne: [], nivo: 1 },
};

const praznoStanje: R<typeof api.napredak.stanje> = izvedi(PRAZAN_ULAZ);
const prazanProfil: R<typeof api.napredak.profil> = izvediProfil({
  ...PRAZAN_ULAZ,
  zakljuceniDani: [],
});

export const FIXTURES_NAPREDAK: Record<string, Fixture> = {
  [fn(api.napredak.stanje)]: () => stanje,
  [fn(api.napredak.profil)]: () => profil,
};

export const PRAZNO_NAPREDAK: Record<string, Fixture> = {
  [fn(api.napredak.stanje)]: () => praznoStanje,
  [fn(api.napredak.profil)]: () => prazanProfil,
};
