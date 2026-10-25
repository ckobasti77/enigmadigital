import { getFunctionName, type FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { proveriSlugProjekta } from "@/convex/lib/projekatSlug";
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

/** Praćeni sajtovi po projektu (podatak, kao boja). */
const SAJTOVI_UX: Record<string, string[]> = {
  "enigma-it": ["enigmait.rs", "digital.enigmait.rs"],
  scanme: ["scanme.rs"],
};

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
    sajtovi: SAJTOVI_UX[stavka.slug] ?? [],
    uloga: stavka.uloga,
    korisnik: KORISNIK,
    platformaVlasnik: true,
  };
}

/** Mozak Enigme za jezičak „Mozak“ (ostali projekti ga nemaju). */
const MOZAK_ENIGMA: R<typeof api.podesavanjaStore.mozak> = {
  ponuda: "Sajt za malu firmu za 10 dana, sa SEO osnovom i Google profilom. Od 690 €.",
  icpOpis: "Frizeri, saloni lepote, stomatolozi i majstori u Beogradu i Novom Sadu, bez sajta ili sa zastarelim sajtom.",
  ton: "Kratko, konkretno, na „ti“. Bez stručnih izraza.",
  zabrane: null,
  skripte: null,
};

const PRAZAN_MOZAK: R<typeof api.podesavanjaStore.mozak> = {
  ponuda: null,
  icpOpis: null,
  ton: null,
  zabrane: null,
  skripte: null,
};

export const FIXTURES_PROJEKTI: Record<string, Fixture> = {
  [getFunctionName(api.podesavanjaStore.procitaj)]: (args) => {
    const stavka = PROJEKTI_UX.find((p) => p.workspaceId === args.workspaceId) ?? PROJEKTI_UX[0];
    const enigma = stavka.slug === "enigma-it";
    return {
      sajtovi: SAJTOVI_UX[stavka.slug] ?? [],
      moduli: stavka.moduli,
      mozak: enigma ? MOZAK_ENIGMA : PRAZAN_MOZAK,
      domeni: enigma
        ? [
            {
              domenId: "ux_domen_000000000000000000" as Id<"projekatDomeni">,
              host: "digital.enigmait.rs",
              primarni: true,
              createdAt: 0,
            },
          ]
        : [],
    } satisfies R<typeof api.podesavanjaStore.procitaj>;
  },
  [getFunctionName(api.podesavanjaStore.mozak)]: (args) =>
    args.workspaceId === WS || args.workspaceId === undefined ? MOZAK_ENIGMA : PRAZAN_MOZAK,
  // Čarobnjak: zauzete su adrese postojećih projekata, ostalo prati pravila P8.
  [getFunctionName(api.projekti.proveriSlug)]: (args) => {
    const slug = String(args.slug ?? "");
    const p = proveriSlugProjekta(slug);
    if (!p.ok) return { ok: false, poruka: p.razlog };
    if (PROJEKTI_UX.some((x) => x.slug === slug)) {
      return { ok: false, poruka: "Ova adresa projekta je zauzeta." };
    }
    return { ok: true };
  },
  // Lažni klijent nema bazu: „napravljen“ projekat je ScanMe (prazan nalog),
  // pa se koraci posle prvog vide nad pravim oblikom podataka.
  [getFunctionName(api.projekti.kreirajProjekat)]: () =>
    ({ workspaceId: WS_SCANME, slug: "scanme" }) satisfies FunctionReturnType<
      typeof api.projekti.kreirajProjekat
    >,
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
