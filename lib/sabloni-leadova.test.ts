/**
 * Šabloni leadova (C14): podaci u kodu. „Web agencija“ mora da ostane tačno
 * Enigmin skup od pre C14, a „QR za lokale“ sme da doda najviše tri nova
 * signala. Bez `@/` (vitest nema alias), relativne putanje.
 */
import { describe, expect, test } from "vitest";

import {
  LEAD_SIGNAL_KINDS,
  isKnownLeadSignalKind,
  normalizeNicheSlug,
} from "../convex/lib/leadNormalize";
import { scoreLead, type LeadIcpRuleInput } from "../convex/lib/leadScoring";
import {
  CILJNA_NISA,
  pravilaTraziCiljnuNisu,
  signaliSaCiljnomNisom,
} from "../convex/lib/ciljnaNisa";
import {
  NISE_SABLONA,
  PRAVILA_QR_LOKALI,
  PRAVILA_SABLONA,
  PRAVILA_WEB_AGENCIJA,
  SABLONI_LEADOVA,
  brojPravilaPoOsi,
  sablonProjekta,
  type PraviloSablona,
} from "../convex/lib/sabloniLeadova";

/**
 * `DEFAULT_ICP_RULES` iz `convex/leadScoringStore.ts` pre C14 (commit
 * 59a4f56), prepisan ručno: ime, signal, osa, težina, redom.
 */
const ENIGMA_PRE_C14: ReadonlyArray<[string, string, "fit" | "intent", number]> = [
  ["Nema sajt", "nema_sajt", "fit", 30],
  ["Sajt ne radi ili je parkiran", "sajt_ne_radi", "fit", 28],
  ["Sajt bez HTTPS-a", "sajt_bez_https", "fit", 12],
  ["Sajt je spor na mobilnom", "sajt_spor", "fit", 18],
  ["Sajt ima loš SEO", "sajt_los_seo", "fit", 14],
  ["Sajt je slabo upotrebljiv", "sajt_slab_ux", "fit", 20],
  ["Sajt nema jasan put do kontakta", "sajt_bez_puta_do_kontakta", "fit", 16],
  ["Sajt na zastareloj tehnologiji", "sajt_zastarela_tehnologija", "fit", 22],
  ["Nema zakazivanja u niši koja ga traži", "sajt_bez_zakazivanja", "fit", 20],
  ["Koristi booking treće strane", "koristi_third_party_booking", "fit", 20],
  ["Samo Facebook", "samo_facebook", "fit", 15],
  ["Samo Instagram", "samo_instagram", "fit", 15],
  ["Visok broj recenzija", "visok_broj_recenzija", "fit", 20],
  ["Novootvorena firma", "novootvorena_firma", "fit", 10],
  ["Pitao za cenu", "pitao_cenu", "intent", 40],
  ["Kliknuo /r/ link", "r_link_clicked", "intent", 25],
  ["Otvorio landing stranicu", "landing_opened", "intent", 20],
  ["Poslao DM", "dm", "intent", 15],
  ["Ostavio komentar", "komentar", "intent", 10],
  ["Pominjanje (mention)", "mention", "intent", 10],
];

/** Vrste signala koje je sistem znao pre C14. */
const SIGNALI_PRE_C14 = new Set<string>(LEAD_SIGNAL_KINDS.filter((k) => k !== CILJNA_NISA));

const NOW = 1_756_000_000_000;
const DAN = 24 * 60 * 60 * 1000;

function kaoPravila(pravila: ReadonlyArray<PraviloSablona>): LeadIcpRuleInput[] {
  return pravila.map((p) => ({
    name: p.name,
    axis: p.axis,
    signalKind: p.signalKind,
    weight: p.weight,
    isActive: true,
  }));
}

const ENIGMA_PRAVILA: LeadIcpRuleInput[] = ENIGMA_PRE_C14.map(
  ([name, signalKind, axis, weight]) => ({ name, signalKind, axis, weight, isActive: true }),
);

describe("šablon „Web agencija“", () => {
  test("pravila su tačno Enigmin skup od pre C14", () => {
    expect(
      PRAVILA_WEB_AGENCIJA.map((p) => [p.name, p.signalKind, p.axis, p.weight]),
    ).toEqual(ENIGMA_PRE_C14);
    for (const p of PRAVILA_WEB_AGENCIJA) expect(p.comment.length).toBeGreaterThan(20);
  });

  test("boduje iste primere isto kao pre C14", () => {
    const primeri = [
      [],
      [{ kind: "nema_sajt", observedAt: NOW - 400 * DAN }],
      [
        { kind: "nema_sajt", observedAt: NOW - 2 * DAN },
        { kind: "visok_broj_recenzija", observedAt: NOW - 2 * DAN },
        { kind: "pitao_cenu", observedAt: NOW - 1 * DAN },
      ],
      [
        { kind: "sajt_spor", observedAt: NOW - 5 * DAN },
        { kind: "sajt_bez_zakazivanja", observedAt: NOW - 5 * DAN },
        { kind: "komentar", observedAt: NOW - 20 * DAN },
        { kind: "komentar", observedAt: NOW - 100 * DAN },
        { kind: "dm", observedAt: NOW - 60 * DAN },
      ],
      // Ciljna niša u Enigmi nema pravilo: ostaje „nepokriven“ signal, kao
      // i svaki drugi signal bez pravila.
      [{ kind: "samo_instagram", observedAt: NOW - 3 * DAN }],
    ];
    for (const signali of primeri) {
      expect(scoreLead(signali, kaoPravila(PRAVILA_WEB_AGENCIJA), NOW)).toEqual(
        scoreLead(signali, ENIGMA_PRAVILA, NOW),
      );
    }
    const pun = scoreLead(primeri[2], kaoPravila(PRAVILA_WEB_AGENCIJA), NOW);
    expect(pun.fit).toMatchObject({ points: 50, maxPoints: 260, signalsCounted: 2 });
    expect(pun.intent).toMatchObject({ points: 40, maxPoints: 120, signalsCounted: 1 });
  });

  test("bez pravila za ciljnu nišu signal se ne izvodi (Enigma ostaje ista)", () => {
    expect(pravilaTraziCiljnuNisu(kaoPravila(PRAVILA_WEB_AGENCIJA))).toBe(false);
    expect(pravilaTraziCiljnuNisu(kaoPravila(PRAVILA_QR_LOKALI))).toBe(true);
  });

  test("projekat bez šablona je „Web agencija“", () => {
    expect(sablonProjekta({})).toBe("web_agencija");
    expect(sablonProjekta({ sablonLeadova: "prazno" })).toBe("prazno");
  });
});

describe("šablon „QR za lokale“", () => {
  test("koristi poznate signale i najviše tri nova", () => {
    const nove = new Set<string>();
    for (const p of PRAVILA_QR_LOKALI) {
      expect(isKnownLeadSignalKind(p.signalKind)).toBe(true);
      expect(p.weight).toBeGreaterThan(0);
      if (!SIGNALI_PRE_C14.has(p.signalKind)) nove.add(p.signalKind);
    }
    expect([...nove]).toEqual([CILJNA_NISA]);
    expect(nove.size).toBeLessThanOrEqual(3);
    // Jedan signal = jedno pravilo (bodovanje broji vrstu jednom po pravilu).
    expect(new Set(PRAVILA_QR_LOKALI.map((p) => p.signalKind)).size).toBe(
      PRAVILA_QR_LOKALI.length,
    );
  });

  test("niše pokrivaju lokale iz ponude, a slugovi prolaze normalizaciju", () => {
    const slugovi = NISE_SABLONA.qr_lokali.map((n) => n.slug);
    expect(slugovi).toEqual([
      "kafici",
      "restorani",
      "hoteli",
      "frizerski-saloni",
      "kozmeticki-saloni",
      "auto-saloni",
      "izlagaci-na-sajmovima",
    ]);
    for (const sablon of SABLONI_LEADOVA.map((s) => s.kljuc)) {
      for (const n of NISE_SABLONA[sablon]) expect(normalizeNicheSlug(n.slug)).toBe(n.slug);
    }
  });

  test("lokal iz ciljne niše dobija više bodova od firme iz neciljne", () => {
    const pravila = kaoPravila(PRAVILA_QR_LOKALI);
    const isti = [{ kind: "visok_broj_recenzija", observedAt: NOW - DAN }];
    const firma = { createdAt: NOW - 10 * DAN };
    const ciljni = scoreLead(signaliSaCiljnomNisom(isti, firma, true), pravila, NOW);
    const neciljni = scoreLead(signaliSaCiljnomNisom(isti, firma, false), pravila, NOW);
    expect(ciljni.fit.points).toBe(55);
    expect(neciljni.fit.points).toBe(25);
    expect(ciljni.fit.maxPoints).toBe(neciljni.fit.maxPoints);
  });

  test("upisan signal ciljne niše ne može da nadjača nišu", () => {
    const upisan = [{ kind: CILJNA_NISA, observedAt: NOW }];
    expect(signaliSaCiljnomNisom(upisan, { createdAt: NOW }, false)).toEqual([]);
  });
});

test("„Prazno“ nema ni pravila ni niša; brojevi po osi prate spisak", () => {
  expect(PRAVILA_SABLONA.prazno).toEqual([]);
  expect(NISE_SABLONA.prazno).toEqual([]);
  expect(brojPravilaPoOsi("web_agencija")).toEqual({ fit: 14, intent: 6 });
  expect(brojPravilaPoOsi("qr_lokali")).toEqual({ fit: 7, intent: 6 });
});
