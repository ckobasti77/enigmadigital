import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import { USER, WS, WS_KLIJENT, WS_SCANME, type Fixture, type R } from "./fixtures-util";

/**
 * Projekti u razvojnom prikazu (plan C02 §7.9): „Enigma IT“, „ScanMe“ i
 * klijentski „Klijent d.o.o.“. Korisnik je vlasnik sva tri i vlasnik
 * platforme. `mojProjekat` odgovara po slugu; nepoznat slug vraća `null`,
 * kao pravi upit. Boje su podatak projekta, ne CSS.
 */
type Stavka = R<typeof api.projekti.mojiProjekti>[number];

export const PROJEKTI_UX: Stavka[] = [
  {
    workspaceId: WS,
    slug: "enigma-it",
    ime: "Enigma IT",
    kratkoIme: "Enigma",
    boja: null,
    logoUrl: null,
    uloga: "owner",
    vrsta: "interni",
    arhiviran: false,
    redosled: 0,
    moduli: null,
  },
  {
    workspaceId: WS_SCANME,
    slug: "scanme",
    ime: "ScanMe",
    kratkoIme: null,
    boja: "#22c55e",
    logoUrl: null,
    uloga: "owner",
    vrsta: "interni",
    arhiviran: false,
    redosled: 1,
    moduli: null,
  },
  {
    workspaceId: WS_KLIJENT,
    slug: "klijent-doo",
    ime: "Klijent d.o.o.",
    kratkoIme: null,
    boja: "#a78bfa",
    logoUrl: null,
    uloga: "owner",
    vrsta: "klijent",
    arhiviran: false,
    redosled: 2,
    // Klijent nema kanale i oglase: prelazak sa njih vodi na kontrolnu tablu.
    moduli: ["leadovi", "novosti", "analitika"],
  },
];

/**
 * Stanje za birač projekta. Enigma ima jednu integraciju u grešci (isto kao
 * fikstura veza) i onoliko zadataka koliko pokazuje njeno zvono, ScanMe još
 * nema veza, a kod klijenta broj „šta me čeka“ nije stigao (birač tada piše
 * „—“). Broj Enigme daje `fixtures.ts`, iz iste fiksture zvona.
 */
export function stanjeProjekataUx(
  cekaEnigma: number,
): R<typeof api.projekti.stanjeProjekata> {
  return [
    { workspaceId: WS, zdravlje: "greska", ceka: cekaEnigma },
    { workspaceId: WS_SCANME, zdravlje: "bez_veza", ceka: 0 },
    { workspaceId: WS_KLIJENT, zdravlje: "ok", ceka: null },
  ];
}

const KORISNIK = { id: USER, email: "operater@example.com", ime: "Test Operater" };

function projekatZaSlug(slug: unknown): R<typeof api.projekti.mojProjekat> {
  const stavka = PROJEKTI_UX.find((p) => p.slug === slug);
  if (stavka === undefined) return null;
  return {
    workspaceId: stavka.workspaceId,
    slug: stavka.slug,
    ime: stavka.ime,
    kratkoIme: stavka.kratkoIme,
    boja: stavka.boja,
    logoUrl: stavka.logoUrl,
    faviconUrl: null,
    vrsta: stavka.vrsta,
    moduli: stavka.moduli,
    uloga: stavka.uloga,
    korisnik: KORISNIK,
    platformaVlasnik: true,
  };
}

export const FIXTURES_PROJEKTI: Record<string, Fixture> = {
  [getFunctionName(api.projekti.mojiProjekti)]: () => PROJEKTI_UX,
  [getFunctionName(api.projekti.mojProjekat)]: (args) => projekatZaSlug(args.slug),
  [getFunctionName(api.projekti.ja)]: () =>
    ({ ...KORISNIK, platformaVlasnik: true }) satisfies R<typeof api.projekti.ja>,
};

/**
 * Prazan nalog (`?prazno=1`) prazni nizove, ali projekti i dalje postoje:
 * prazno je stanje kanala, ne nalog bez projekta.
 */
export const PRAZNO_PROJEKTI: Record<string, Fixture> = {
  [getFunctionName(api.projekti.mojiProjekti)]: () => PROJEKTI_UX,
};
