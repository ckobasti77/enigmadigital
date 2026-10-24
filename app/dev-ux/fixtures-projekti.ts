import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import { USER, WS, WS_SCANME, type Fixture, type R } from "./fixtures-util";

/**
 * Projekti u razvojnom prikazu (plan C02 §7.9): „Enigma IT“ i „ScanMe“.
 * Korisnik je vlasnik oba i vlasnik platforme. `mojProjekat` odgovara po
 * slugu; nepoznat slug vraća `null`, kao pravi upit.
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
];

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
