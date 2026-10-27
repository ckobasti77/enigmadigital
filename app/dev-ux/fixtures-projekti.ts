import { getFunctionName, type FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { proveriSlugProjekta } from "@/convex/lib/projekatSlug";
import { PRAVILA_WEB_AGENCIJA } from "@/convex/lib/sabloniLeadova";
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
 * nema veza i ima jedan zadatak (uvoz na pregledu, isto kao njegovo zvono od
 * C16), a kod klijenta broj „šta me čeka“ nije stigao (birač tada piše „—“).
 * Broj Enigme daje `fixtures.ts`, iz iste fiksture zvona.
 */
export function stanjeProjekataUx(
  cekaEnigma: number,
): R<typeof api.projekti.stanjeProjekata> {
  return [
    { workspaceId: WS, zdravlje: "greska", ceka: cekaEnigma },
    { workspaceId: WS_SCANME, zdravlje: "bez_veza", ceka: 1 },
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

type Procitaj = R<typeof api.podesavanjaStore.procitaj>;

const NIJE = { vrednost: null, izvor: "nije_podeseno" as const };
const NEMA_TAJNE = { postavljeno: false, izvor: "nema" as const, updatedAt: null };

/**
 * Jezičak „Sajt i oglasi“: Enigma je osnivački projekat i nasleđuje deo
 * vrednosti iz env-a (piksel, adresa osvežavanja, tajne), ScanMe nema ništa,
 * a klijent ima svoje vrednosti i jedan upisan token.
 */
function sajtIOglasi(slug: string): Pick<Procitaj, "jeOsnivacki" | "podesavanja" | "tajne"> {
  if (slug === "enigma-it") {
    return {
      jeOsnivacki: true,
      podesavanja: {
        sajtovi: { vrednost: SAJTOVI_UX["enigma-it"], izvor: "projekat" },
        pikselId: { vrednost: "1234567890123", izvor: "env" },
        kratkiLinkoviBaza: { vrednost: "https://digital.enigmait.rs", izvor: "env" },
        novostiRevalidateUrl: { vrednost: "https://www.enigmait.rs/api/revalidate", izvor: "env" },
        pulsUrl: NIJE,
        posiljalacIme: { vrednost: "Enigma IT", izvor: "env" },
        budzet: {
          minimum: NIJE,
          maksimum: NIJE,
          valuta: NIJE,
          metaMaksDnevno: { vrednost: 50, izvor: "env" },
          googleMaksDnevno: NIJE,
        },
      },
      tajne: {
        meta_capi_token: { postavljeno: true, izvor: "env", updatedAt: null },
        novosti_revalidate_secret: { postavljeno: true, izvor: "env", updatedAt: null },
        puls_token: NEMA_TAJNE,
      },
    };
  }
  if (slug === "klijent-doo") {
    return {
      jeOsnivacki: false,
      podesavanja: {
        sajtovi: NIJE,
        pikselId: { vrednost: "9876543210987", izvor: "projekat" },
        kratkiLinkoviBaza: NIJE,
        novostiRevalidateUrl: NIJE,
        pulsUrl: NIJE,
        posiljalacIme: { vrednost: "Klijent tim", izvor: "projekat" },
        budzet: {
          minimum: { vrednost: 10, izvor: "projekat" },
          maksimum: { vrednost: 300, izvor: "projekat" },
          valuta: { vrednost: "EUR", izvor: "projekat" },
          metaMaksDnevno: { vrednost: 100, izvor: "projekat" },
          googleMaksDnevno: NIJE,
        },
      },
      tajne: {
        meta_capi_token: { postavljeno: true, izvor: "projekat", updatedAt: Date.UTC(2026, 9, 24) },
        novosti_revalidate_secret: NEMA_TAJNE,
        puls_token: NEMA_TAJNE,
      },
    };
  }
  return {
    jeOsnivacki: false,
    podesavanja: {
      sajtovi: { vrednost: SAJTOVI_UX[slug] ?? null, izvor: SAJTOVI_UX[slug] ? "projekat" : "nije_podeseno" },
      pikselId: NIJE,
      kratkiLinkoviBaza: NIJE,
      novostiRevalidateUrl: NIJE,
      pulsUrl: NIJE,
      posiljalacIme: NIJE,
      budzet: {
        minimum: NIJE,
        maksimum: NIJE,
        valuta: NIJE,
        metaMaksDnevno: NIJE,
        googleMaksDnevno: NIJE,
      },
    },
    tajne: { meta_capi_token: NEMA_TAJNE, novosti_revalidate_secret: NEMA_TAJNE, puls_token: NEMA_TAJNE },
  };
}

/** Razrešene granice budžeta (isti oblik kao `budzetProjekta`). */
function granice(slug: string): R<typeof api.podesavanjaStore.budzetProjekta> {
  const b = sajtIOglasi(slug).podesavanja.budzet;
  return {
    minimum: b.minimum.vrednost ?? 5,
    maksimum: b.maksimum.vrednost ?? 5000,
    valuta: b.valuta.vrednost ?? "EUR",
    metaMaksDnevno: b.metaMaksDnevno.vrednost,
    googleMaksDnevno: b.googleMaksDnevno.vrednost,
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

/** Enigmina pravila ocenjivanja = šablon „Web agencija“ (C14). */
const PRAVILA_ENIGMA_UX: R<typeof api.leadScoringStore.listIcpRules> =
  PRAVILA_WEB_AGENCIJA.map((p, i) => ({
    _id: `ux_pravilo_${String(i).padStart(18, "0")}` as Id<"leadIcpRules">,
    _creationTime: 0,
    workspaceId: WS,
    name: p.name,
    axis: p.axis,
    signalKind: p.signalKind,
    weight: p.weight,
    rationale: p.comment,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
  }));

const PRAZAN_MOZAK: R<typeof api.podesavanjaStore.mozak> = {
  ponuda: null,
  icpOpis: null,
  ton: null,
  zabrane: null,
  skripte: null,
};

export const FIXTURES_PROJEKTI: Record<string, Fixture> = {
  // Šabloni leadova (C14): Enigma ima pravila „Web agencija“, ScanMe i
  // klijent kreću prazni, pa jezičak „Ocenjivanje“ nudi izbor šablona.
  [getFunctionName(api.leadScoringStore.sablonLeadova)]: (args) =>
    (args.workspaceId === WS || args.workspaceId === undefined
      ? { sablon: "web_agencija", imaPravila: true }
      : { sablon: "prazno", imaPravila: false }) satisfies R<typeof api.leadScoringStore.sablonLeadova>,
  [getFunctionName(api.leadScoringStore.listIcpRules)]: (args) =>
    (args.workspaceId === WS || args.workspaceId === undefined
      ? PRAVILA_ENIGMA_UX.filter((p) => args.axis === undefined || p.axis === args.axis)
      : []) satisfies R<typeof api.leadScoringStore.listIcpRules>,
  [getFunctionName(api.leadScoringStore.missingDefaultIcpRules)]: () =>
    [] satisfies R<typeof api.leadScoringStore.missingDefaultIcpRules>,
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
      ...sajtIOglasi(stavka.slug),
    } satisfies R<typeof api.podesavanjaStore.procitaj>;
  },
  [getFunctionName(api.podesavanjaStore.budzetProjekta)]: (args) => {
    const stavka = PROJEKTI_UX.find((p) => p.workspaceId === args.workspaceId) ?? PROJEKTI_UX[0];
    return granice(stavka.slug);
  },
  [getFunctionName(api.oauthPovratak.stanje)]: () =>
    ({ podeseno: true }) satisfies R<typeof api.oauthPovratak.stanje>,
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
  // Ekran pozivnice (`/pozivnica?ux=1&stanje=…`): stanje nosi token, jer lažni
  // klijent razrešava po imenu funkcije i argumentima.
  [getFunctionName(api.invitesStore.getInvite)]: (args) => {
    const scanme = { ime: "ScanMe", boja: "#22c55e", logoUrl: null };
    switch (args.token) {
      case "ux-nov":
        return { status: "vazi", email: "novi.clan@example.com", projekat: scanme, postojiNalog: false };
      case "ux-postojeci":
        return { status: "vazi", email: KORISNIK.email, projekat: scanme, postojiNalog: true };
      case "ux-prijavljen":
        return { status: "vazi", email: KORISNIK.email, projekat: scanme, postojiNalog: true };
      case "ux-druga":
        return { status: "vazi", email: "druga.adresa@example.com", projekat: scanme, postojiNalog: true };
      default:
        return { status: "ne_postoji" };
    }
  },
  [getFunctionName(api.invitesStore.prihvatiPozivnicu)]: () =>
    ({ slug: "scanme" }) satisfies FunctionReturnType<typeof api.invitesStore.prihvatiPozivnicu>,
  [getFunctionName(api.invitesStore.createInvite)]: (args) =>
    ({
      token: "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE",
      email: String(args.email ?? ""),
      expiresAt: Date.UTC(2026, 10, 1, 12),
      panelOrigin: null,
    }) satisfies FunctionReturnType<typeof api.invitesStore.createInvite>,
};

/**
 * Prazan nalog (`?prazno=1`) prazni nizove, ali projekti i dalje postoje:
 * prazno je stanje kanala, ne nalog bez projekta.
 */
export const PRAZNO_PROJEKTI: Record<string, Fixture> = {
  [getFunctionName(api.projekti.mojiProjekti)]: () => PROJEKTI_UX,
};
