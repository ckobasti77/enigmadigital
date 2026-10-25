import { describe, expect, test } from "vitest";

import {
  deoProjekta,
  dostupno,
  obnovaGoogleAds,
  obnovaYoutube,
  pacifickiDan,
  plafonGoogleAds,
  plafonYoutube,
  pocetakProzoraGoogleAds,
  porukaGoogleAds,
  porukaYoutube,
  rezervaDrugih,
  smeDaPotrosi,
  utcSat,
  vremeUBeogradu,
} from "../convex/lib/globalneKvote";
import { parseUsageHeaders, throttleScope } from "../convex/lib/metaRateLimit";
import { procitaj, KOREN } from "./izvorni-kod.pomoc";
import { join } from "node:path";

/**
 * Zajedničke kvote svih projekata (plan C10 §6.2, §8.1): formula rezerve,
 * pacifički dan YouTube kvote i vreme obnove, razdvajanje Meta zaglavlja na
 * aplikaciju i projekat.
 */

const Z = 8000;

describe("smeDaPotrosi — formula rezerve", () => {
  test("N = 1: ponašanje pre više projekata (R = Z)", () => {
    expect(deoProjekta(Z, 1)).toBe(Z);
    expect(smeDaPotrosi({ Z, ukupno: 7950, projekat: 7950, ostaliPotroseno: [], trosak: 50 })).toEqual({ ok: true });
    expect(smeDaPotrosi({ Z, ukupno: 7951, projekat: 7951, ostaliPotroseno: [], trosak: 50 })).toEqual({
      ok: false,
      razlog: "globalno",
    });
  });

  test("primer iz plana: N = 2, Enigma 5.000, ScanMe 1.000", () => {
    // Enigma staje (rezerva drugih), ScanMe i dalje troši.
    expect(smeDaPotrosi({ Z, ukupno: 6000, projekat: 5000, ostaliPotroseno: [1000], trosak: 50 })).toEqual({
      ok: false,
      razlog: "rezerva_drugih",
    });
    expect(smeDaPotrosi({ Z, ukupno: 6000, projekat: 1000, ostaliPotroseno: [5000], trosak: 50 })).toEqual({ ok: true });
    expect(dostupno({ Z, ukupno: 6000, projekat: 5000, ostaliPotroseno: [1000] })).toBe(0);
    // ScanMe-u je deo 4.000 (ostalo mu 3.000), ali globalno je slobodno 2.000.
    expect(dostupno({ Z, ukupno: 6000, projekat: 1000, ostaliPotroseno: [5000] })).toBe(2000);
  });

  test("projekat troši svoj deo slobodno, a preko njega samo dok ne dira tuđi deo", () => {
    // A 4.000 (ceo deo), B 0: B-ov neiskorišćen deo je 4.000, pa A ne sme dalje.
    expect(smeDaPotrosi({ Z, ukupno: 4000, projekat: 4000, ostaliPotroseno: [0], trosak: 50 }).ok).toBe(false);
    // B je potrošio 3.000: njegov neiskorišćen deo je 1.000, pa A sme do 7.000 ukupno.
    expect(smeDaPotrosi({ Z, ukupno: 7000, projekat: 4000, ostaliPotroseno: [3000], trosak: 0 }).ok).toBe(true);
    expect(dostupno({ Z, ukupno: 7000, projekat: 4000, ostaliPotroseno: [3000] })).toBe(0);
    expect(dostupno({ Z, ukupno: 6000, projekat: 3000, ostaliPotroseno: [3000] })).toBe(1000);
  });

  test("N = 3", () => {
    expect(deoProjekta(Z, 3)).toBe(2666);
    expect(rezervaDrugih(2666, [0, 1000])).toBe(2666 + 1666);
    // floor ostavlja 2 jedinice van delova (8.000 − 3 × 2.666); te se smeju pozajmiti.
    expect(smeDaPotrosi({ Z, ukupno: 2666, projekat: 2666, ostaliPotroseno: [0, 0], trosak: 2 })).toEqual({ ok: true });
    expect(smeDaPotrosi({ Z, ukupno: 2666, projekat: 2666, ostaliPotroseno: [0, 0], trosak: 3 })).toEqual({
      ok: false,
      razlog: "rezerva_drugih",
    });
    expect(smeDaPotrosi({ Z, ukupno: 2600, projekat: 2600, ostaliPotroseno: [0, 0], trosak: 66 })).toEqual({ ok: true });
  });

  test("tačno na granici i trošak 0", () => {
    expect(smeDaPotrosi({ Z, ukupno: 3950, projekat: 3950, ostaliPotroseno: [0], trosak: 50 })).toEqual({ ok: true });
    expect(smeDaPotrosi({ Z, ukupno: 3951, projekat: 3951, ostaliPotroseno: [0], trosak: 50 }).ok).toBe(false);
    expect(smeDaPotrosi({ Z, ukupno: 8000, projekat: 4000, ostaliPotroseno: [4000], trosak: 0 })).toEqual({ ok: true });
  });

  test("dostupno je najveći trošak koji formula pušta (mreža stanja)", () => {
    const Zm = 100;
    for (const N of [1, 2, 3, 4]) {
      for (let p = 0; p <= Zm; p += 7) {
        for (let q = 0; q <= Zm - p; q += 11) {
          const ostali = N === 1 ? [] : [q, ...Array.from({ length: N - 2 }, () => 0)];
          const ukupno = p + ostali.reduce((a, b) => a + b, 0);
          if (ukupno > Zm) continue;
          const ulaz = { Z: Zm, ukupno, projekat: p, ostaliPotroseno: ostali };
          const d = dostupno(ulaz);
          if (d > 0) expect(smeDaPotrosi({ ...ulaz, trosak: d }).ok).toBe(true);
          expect(smeDaPotrosi({ ...ulaz, trosak: d + 1 }).ok).toBe(false);
        }
      }
    }
  });
});

describe("plafoni (brojevi Google-a i ovog koda se ne menjaju)", () => {
  test("YouTube: odgovori 8.000, izmene 6.000, upload 100", () => {
    expect(plafonYoutube("odgovori")).toBe(8000);
    expect(plafonYoutube("izmene")).toBe(6000);
    expect(plafonYoutube("upload")).toBe(100);
  });

  test("Google Ads: 95 % limita developer tokena", () => {
    expect(plafonGoogleAds(2880)).toBe(2736);
    expect(plafonGoogleAds(15000)).toBe(14250);
    expect(plafonGoogleAds(100000)).toBe(95000);
  });

  test("procena operacija jednog Google Ads prolaza = broj searchStream poziva u kodu", () => {
    const kod = procitaj(join(KOREN, "convex", "googleAds.ts"));
    const konstanta = /export const GADS_OPERACIJA_PO_PROLAZU = (\d+);/.exec(kod);
    expect(konstanta).not.toBeNull();
    const pozivi = kod.match(/await queryGaql\(/g) ?? [];
    expect(pozivi.length).toBe(Number(konstanta?.[1]));
  });
});

describe("vreme: pacifički dan i obnova", () => {
  test("pacifički dan oko ponoći (letnje i zimsko vreme)", () => {
    expect(pacifickiDan(Date.UTC(2026, 9, 25, 6, 59, 59))).toBe("2026-10-24");
    expect(pacifickiDan(Date.UTC(2026, 9, 25, 7, 0, 0))).toBe("2026-10-25");
    expect(pacifickiDan(Date.UTC(2026, 11, 1, 7, 59, 59))).toBe("2026-11-30");
    expect(pacifickiDan(Date.UTC(2026, 11, 1, 8, 0, 0))).toBe("2026-12-01");
  });

  test("obnova je sledeća pacifička ponoć, i u danima prelaska vremena", () => {
    expect(obnovaYoutube(Date.UTC(2026, 9, 20, 12))).toBe(Date.UTC(2026, 9, 21, 7));
    // 1. 11. 2026: povratak na zimsko vreme (dan od 25 h).
    expect(obnovaYoutube(Date.UTC(2026, 10, 1, 12))).toBe(Date.UTC(2026, 10, 2, 8));
    // 8. 3. 2026: prelazak na letnje vreme (dan od 23 h).
    expect(obnovaYoutube(Date.UTC(2026, 2, 8, 12))).toBe(Date.UTC(2026, 2, 9, 7));
    // Tačno u ponoć: obnova je sledeća ponoć, ne ova.
    expect(obnovaYoutube(Date.UTC(2026, 9, 21, 7))).toBe(Date.UTC(2026, 9, 22, 7));
  });

  test("vreme obnove po Beogradu: 09:00, osim u nedeljama prelaska", () => {
    expect(vremeUBeogradu(Date.UTC(2026, 9, 21, 7))).toBe("09:00");
    // Evropa je već na zimskom (25. 10.), Amerika još nije (1. 11.).
    expect(vremeUBeogradu(Date.UTC(2026, 9, 27, 7))).toBe("08:00");
    expect(vremeUBeogradu(Date.UTC(2026, 11, 2, 8))).toBe("09:00");
  });

  test("Google Ads: UTC sat i klizeći prozor od 24 sata", () => {
    const t = Date.UTC(2026, 9, 25, 13, 30);
    expect(utcSat(t)).toBe("2026-10-25T13");
    expect(pocetakProzoraGoogleAds(t)).toBe("2026-10-24T14");
    expect(obnovaGoogleAds("2026-10-24T14", t)).toBe(Date.UTC(2026, 9, 25, 14));
    expect(obnovaGoogleAds(null, t)).toBe(t);
  });
});

describe("poruke korisniku", () => {
  const obnova = Date.UTC(2026, 9, 21, 7);

  test("YouTube: deo projekta i zajednička kvota imaju različite rečenice sa vremenom", () => {
    expect(porukaYoutube("odgovori", "rezerva_drugih", 4000, obnova)).toBe(
      "Deo dnevne YouTube kvote za ovaj projekat je potrošen (4.000 od 4.000). Odgovori se nastavljaju u 09:00.",
    );
    expect(porukaYoutube("odgovori", "globalno", 4000, obnova)).toBe(
      "Zajednička YouTube kvota svih projekata je potrošena. Odgovori se nastavljaju u 09:00.",
    );
    expect(porukaYoutube("izmene", "rezerva_drugih", 3000, obnova)).toBe(
      "Kvota za izmene je potrošena (deo ovog projekta: 3.000). Obnavlja se u 09:00.",
    );
    expect(porukaYoutube("upload", "rezerva_drugih", 50, obnova)).toBe(
      "Danas je poslato 50 od 50 videa za ovaj projekat. Ponovo sutra u 09:00.",
    );
  });

  test("Google Ads: odložena sinhronizacija kaže deo projekta i vreme", () => {
    expect(porukaGoogleAds("rezerva_drugih", 1368, Date.UTC(2026, 9, 21, 12))).toBe(
      "Google Ads sinhronizacija je odložena: deo kvote za ovaj projekat je potrošen (1.368 od 1.368 operacija za 24 h). Ponovo oko 14:00.",
    );
  });
});

describe("Meta: aplikacija i projekat su odvojeni", () => {
  test("X-App-Usage je aplikacija, X-Business-Use-Case-Usage je projekat", () => {
    const h = new Headers({
      "x-app-usage": JSON.stringify({ call_count: 40, total_cputime: 10, total_time: 12 }),
      "x-business-use-case-usage": JSON.stringify({
        "123": [{ call_count: 5, total_cputime: 70, total_time: 3 }],
      }),
    });
    expect(parseUsageHeaders(h)).toEqual({
      app: { callCount: 40, cpuTime: 10, totalTime: 12 },
      buc: { callCount: 5, cpuTime: 70, totalTime: 3 },
    });
    expect(parseUsageHeaders(new Headers())).toEqual({ app: null, buc: null });
  });

  test("kod 4 prigušuje celu aplikaciju; 17, 32, 613 i 429 samo projekat", () => {
    const telo = (code: number) => JSON.stringify({ error: { code } });
    expect(throttleScope(400, telo(4))).toBe("aplikacija");
    expect(throttleScope(400, telo(17))).toBe("projekat");
    expect(throttleScope(400, telo(32))).toBe("projekat");
    expect(throttleScope(400, telo(613))).toBe("projekat");
    expect(throttleScope(429, "")).toBe("projekat");
    expect(throttleScope(400, telo(100))).toBeNull();
  });
});
