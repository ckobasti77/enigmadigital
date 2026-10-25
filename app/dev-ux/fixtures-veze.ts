import { getFunctionName, type FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { HOUR, WS, WS_KLIJENT, WS_SCANME, now, type Fixture, type R } from "./fixtures-util";

/**
 * Veze među projektima u razvojnom prikazu: Puls (kartica „Poslovanje“),
 * unakrsni leadovi u profilu firme i upiti sa forme na sajtu. Sve izmišljeno.
 *
 * - Puls: Enigma IT radi, ScanMe ne odgovara (poslednje brojke prigušene),
 *   Klijent d.o.o. nije podešen.
 * - Unakrsno: svaka firma Enigme odgovara projektu ScanMe (ciljna niša), pa
 *   se vide i oznaka i dugme „Kopiraj u ScanMe“.
 * - Upiti sa sajta: tri upita u Enigmi, jedan bez imena i firme.
 */

const PULS_ENIGMA: R<typeof api.puls.poslednji> = {
  podeseno: { adresa: true, token: true },
  poslednji: {
    at: now - 6 * 60_000,
    vreme: now - 7 * 60_000,
    zastareo: false,
    metrike: [
      { kljuc: "aktivni_klijenti", naziv: "Aktivni klijenti", vrednost: 42, promena24h: 1 },
      { kljuc: "upiti_7d", naziv: "Upiti (7 d)", vrednost: 18, promena24h: 3 },
      { kljuc: "ponude_otvorene", naziv: "Otvorene ponude", vrednost: 7, promena24h: 0 },
      { kljuc: "prihod_mesec", naziv: "Prihod ovog meseca (€)", vrednost: 12480, promena24h: 650 },
      { kljuc: "sajtovi_u_izradi", naziv: "Sajtovi u izradi", vrednost: 5, promena24h: -1 },
      { kljuc: "odrzavanje", naziv: "Ugovori o održavanju", vrednost: 23, promena24h: null },
    ],
  },
  greska: null,
  zastao: false,
};

const PULS_SCANME: R<typeof api.puls.poslednji> = {
  podeseno: { adresa: true, token: true },
  poslednji: {
    at: now - 52 * 60_000,
    vreme: now - 53 * 60_000,
    zastareo: false,
    metrike: [
      { kljuc: "aktivni_lokali", naziv: "Aktivni lokali", vrednost: 318, promena24h: 4 },
      { kljuc: "novi_lokali_7d", naziv: "Novi lokali (7 d)", vrednost: 26, promena24h: 2 },
      { kljuc: "skeniranja_24h", naziv: "Skeniranja (24 h)", vrednost: 9412, promena24h: -310 },
      { kljuc: "probni_nalozi", naziv: "Probni nalozi", vrednost: 14, promena24h: null },
    ],
  },
  greska: {
    kod: "istek",
    poruka: "Puls nije odgovorio za 10 sekundi.",
    od: now - 37 * 60_000,
    uzastopno: 3,
  },
  zastao: false,
};

const PULS_NIJE_PODESEN: R<typeof api.puls.poslednji> = {
  podeseno: { adresa: false, token: false },
  poslednji: null,
  greska: null,
  zastao: false,
};

const UNAKRSNO_ENIGMA: R<typeof api.leadUnakrsnoStore.uDrugimProjektima> = [
  {
    workspaceId: WS_SCANME,
    slug: "scanme",
    ime: "ScanMe",
    stanje: "odgovara",
    companyId: null,
    poklapanje: ["nisa"],
    nisa: "Restorani",
    mozeKopirati: true,
  },
];

function upit(
  n: number,
  kontakt: Doc<"leadInbound">["kontakt"],
  text: string | undefined,
  pre: number,
): Doc<"leadInbound"> {
  return {
    _id: `inb_ux_web_00000000000${n}` as Id<"leadInbound">,
    _creationTime: now - pre,
    workspaceId: WS,
    platform: "website",
    kind: "forma",
    externalId: `ux_web_${n}`,
    text,
    occurredAt: now - pre,
    sourceUrl: "https://enigmait.rs/kontakt",
    status: "nov",
    derivedSignals: [],
    createdAt: now - pre,
    kontakt,
    eventId: `ux_web_event_${n}`,
  };
}

const UPITI_SA_SAJTA: Doc<"leadInbound">[] = [
  upit(
    1,
    { ime: "Marija Petrović", firma: "Pekara Klas", email: "marija@primer.rs", telefon: "064 111 2233" },
    "Treba nam sajt sa porudžbinama za dve radnje. Koliko košta i koliko traje izrada?",
    27 * HOUR,
  ),
  upit(
    2,
    { ime: "Nikola Jovanović", email: "nikola@primer.rs" },
    "Zanima me održavanje postojećeg sajta.",
    3 * HOUR,
  ),
  upit(3, { telefon: "+381 63 555 0101" }, undefined, 40 * 60_000),
];

export const FIXTURES_VEZE: Record<string, Fixture> = {
  [getFunctionName(api.puls.poslednji)]: (args) =>
    args.workspaceId === WS_SCANME
      ? PULS_SCANME
      : args.workspaceId === WS_KLIJENT
        ? PULS_NIJE_PODESEN
        : PULS_ENIGMA,
  [getFunctionName(api.leadUnakrsnoStore.uDrugimProjektima)]: (args) =>
    args.workspaceId === WS || args.workspaceId === undefined ? UNAKRSNO_ENIGMA : [],
  [getFunctionName(api.leadUnakrsnoStore.kopirajUProjekat)]: () =>
    ({
      companyId: "co_ux_kopija_0000000000000" as Id<"leadCompanies">,
      slug: "scanme",
    }) satisfies FunctionReturnType<typeof api.leadUnakrsnoStore.kopirajUProjekat>,
  [getFunctionName(api.leadInboundStore.listInbound)]: (args) =>
    args.platform === "website" && args.status === "nov" ? UPITI_SA_SAJTA : [],
};

/** Najstariji upit sa sajta, za zvono razvojnog prikaza (isti broj kao „Danas“). */
export const UPITI_SA_SAJTA_ZVONO = {
  broj: UPITI_SA_SAJTA.length,
  najstarijiAt: Math.min(...UPITI_SA_SAJTA.map((u) => u.createdAt)),
  odsecen: false,
};
