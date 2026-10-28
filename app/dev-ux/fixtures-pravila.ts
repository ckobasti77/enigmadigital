import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Fixture, R } from "./fixtures-util";

/**
 * Pravila u razvojnom prikazu (ULTRA1 T07): proba pre uključivanja, vrednost
 * prema pragu na kartici i predlog praga za šablon. Kampanje i iznosi prate
 * `fixtures-oglasi.ts` (Meta nalog u EUR); sve je izmišljeno.
 *
 *   - cena po rezultatu (uključeno pravilo): dve kampanje preko praga;
 *   - cena po kliku (isključeno pravilo koje pauzira): dve pogođene, od kojih
 *     je jedna već pauzirana, i jedna ispod najmanje prikaza — proba;
 *   - potrošnja naloga (pravilo koje samo javlja): niko preko, najbliži 94 %.
 */

type Proba = R<typeof api.rulesStore.probaPravila>;

const PROLECNA = { naziv: "Test kampanja — Prolećna akcija", targetId: "120000000000001" };
const PORUKE = { naziv: "Test kampanja — Poruke na Instagramu", targetId: "120000000000002" };
const JESENJA = { naziv: "Test kampanja — Jesenja ponuda (pauzirana)", targetId: "120000000000003" };

function probaZa(args: Record<string, unknown>): Proba {
  const uslov = args.condition as { metric?: string; value?: number; windowDays?: number } | undefined;
  const prag = uslov?.value ?? 0;
  const prozorDana = Math.max(1, uslov?.windowDays ?? 3);
  const osnova = { valuta: "EUR", pisanjeUkljuceno: false, prozorDana, ciljeva: 4 };

  if (uslov?.metric === "cpa") {
    return {
      ...osnova,
      pogodjeni: [
        { ...JESENJA, targetType: "campaign", status: "PAUSED", vrednost: 10.8, izmereno: true, prag, uPauzi: false, cekaJosSati: null },
        { ...PROLECNA, targetType: "campaign", status: "ACTIVE", vrednost: 5.64, izmereno: true, prag, uPauzi: false, cekaJosSati: null },
        // Bez ijednog rezultata: evaluator poredi celu potrošnju sa pragom, a
        // ekran to piše kao „bez rezultata, potrošeno …" (T13).
        ...(31.2 > prag
          ? [{ ...PORUKE, targetType: "campaign" as const, status: "ACTIVE", vrednost: 31.2, izmereno: false, prag, uPauzi: false, cekaJosSati: null }]
          : []),
      ],
      najblizi: { naziv: JESENJA.naziv, vrednost: 10.8, izmereno: true, procenatPraga: prag > 0 ? Math.round((10.8 / prag) * 100) : null, preko: 10.8 > prag },
      ispodMinPrikaza: 1,
    };
  }
  if (uslov?.metric === "cpc") {
    return {
      ...osnova,
      pogodjeni: (
        [
          { ...PROLECNA, targetType: "campaign", status: "ACTIVE", vrednost: 0.25, izmereno: true, prag, uPauzi: false, cekaJosSati: null },
          { ...JESENJA, targetType: "campaign", status: "PAUSED", vrednost: 0.24, izmereno: true, prag, uPauzi: false, cekaJosSati: null },
        ] satisfies Proba["pogodjeni"]
      ).filter((p) => p.vrednost > prag),
      najblizi: { naziv: PROLECNA.naziv, vrednost: 0.25, izmereno: true, procenatPraga: prag > 0 ? Math.round((0.25 / prag) * 100) : null, preko: 0.25 > prag },
      ispodMinPrikaza: 1,
    };
  }
  if (uslov?.metric === "spend") {
    return {
      ...osnova,
      ciljeva: 1,
      pogodjeni: [],
      najblizi: { naziv: "Test Salon — Meta nalog", vrednost: 42.5, izmereno: true, procenatPraga: prag > 0 ? Math.round((42.5 / prag) * 100) : null, preko: false },
      ispodMinPrikaza: 0,
    };
  }
  // Ostale mere: kampanja sa porukama je najbliža, niko nije preko.
  return {
    ...osnova,
    pogodjeni: [],
    najblizi: { naziv: PORUKE.naziv, vrednost: 1.06, izmereno: true, procenatPraga: null, preko: false },
    ispodMinPrikaza: 0,
  };
}

function predlogZa(args: Record<string, unknown>): R<typeof api.rulesStore.predlogPraga> {
  if (args.sablon === "skok_potrosnje") {
    return { prag: 53, valuta: "EUR", osnova: { kampanja: 3, medijana: 26.5 }, razlog: null };
  }
  return { prag: 13, valuta: "EUR", osnova: { kampanja: 3, medijana: 6.43 }, razlog: null };
}

export const FIXTURES_PRAVILA: Record<string, Fixture> = {
  [getFunctionName(api.rulesStore.probaPravila)]: (args) => probaZa(args),
  [getFunctionName(api.rulesStore.predlogPraga)]: (args) => predlogZa(args),
};

/** Prazan nalog: nema Meta naloga, pa ni predloga ni ciljeva za probu. */
export const PRAZNO_PRAVILA: Record<string, Fixture> = {
  [getFunctionName(api.rulesStore.probaPravila)]: (args) =>
    ({
      valuta: null,
      pisanjeUkljuceno: false,
      pogodjeni: [],
      najblizi: null,
      ispodMinPrikaza: 0,
      ciljeva: 0,
      prozorDana: Math.max(1, (args.condition as { windowDays?: number } | undefined)?.windowDays ?? 3),
    }) satisfies Proba,
  [getFunctionName(api.rulesStore.predlogPraga)]: () =>
    ({ prag: null, valuta: null, osnova: null, razlog: "nema_podataka" }) satisfies R<
      typeof api.rulesStore.predlogPraga
    >,
};
