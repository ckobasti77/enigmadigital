/**
 * Puls: provera tela odgovora sajta projekta (`parsirajPuls`). Čista funkcija,
 * pa testovi ne diraju Convex ni mrežu. Svaki oblik koji sajt može da pošalje
 * ili postaje broj na kartici „Poslovanje“ ili jasan kod greške.
 */
import { describe, expect, test } from "vitest";

import {
  PULS_GRESKA_NAZIV,
  PULS_MAX_BAJTOVA,
  PULS_MAX_METRIKA,
  parsirajPuls,
  pulsGreskaValidator,
  type PulsGreska,
  type PulsRezultat,
} from "../convex/lib/puls";

const SADA = Date.parse("2026-10-25T12:00:00Z");
const MIN = 60_000;
const VREME = "2026-10-25T11:59:00Z";

const tekst = (telo: unknown) => JSON.stringify(telo);
const ispravno = (dopuna: Record<string, unknown> = {}) =>
  tekst({ vreme: VREME, metrike: { porudzbine: 12 }, ...dopuna });

/** Puls mora da bude odbijen sa tim kodom; vraća poruku za dalje provere. */
function odbijen(r: PulsRezultat, kod: PulsGreska): string {
  if (r.ok) throw new Error(`očekivana greška „${kod}“, a Puls je prošao`);
  expect(r.kod).toBe(kod);
  expect(r.poruka.length).toBeGreaterThan(0);
  return r.poruka;
}

describe("ispravan odgovor", () => {
  test("vreme, brojevi i oznake dolaze nazad onako kako su poslati", () => {
    const r = parsirajPuls(
      tekst({
        vreme: "2026-10-25T10:00:00Z",
        metrike: { porudzbine: 12, prihod: 1999.5 },
        oznake: { porudzbine: "Porudžbine", prihod: "Prihod (RSD)" },
      }),
      SADA,
    );
    expect(r).toEqual({
      ok: true,
      vreme: Date.parse("2026-10-25T10:00:00Z"),
      metrike: { porudzbine: 12, prihod: 1999.5 },
      oznake: { porudzbine: "Porudžbine", prihod: "Prihod (RSD)" },
    });
  });

  test("bez oznaka je `oznake` null, ne prazan objekat", () => {
    const r = parsirajPuls(ispravno(), SADA);
    expect(r).toMatchObject({ ok: true, oznake: null, metrike: { porudzbine: 12 } });
  });

  test("dodatni ključevi najvišeg nivoa se ignorišu", () => {
    const r = parsirajPuls(ispravno({ verzija: 3, sajt: "x", ostalo: { a: [1, 2] } }), SADA);
    expect(r).toEqual({ ok: true, vreme: Date.parse(VREME), metrike: { porudzbine: 12 }, oznake: null });
  });

  test("nula i negativan broj su ispravne metrike", () => {
    const r = parsirajPuls(ispravno({ metrike: { nula: 0, minus: -4.5 } }), SADA);
    expect(r).toMatchObject({ ok: true, metrike: { nula: 0, minus: -4.5 } });
  });

  test("samo datum bez sata je ISO 8601", () => {
    const r = parsirajPuls(ispravno({ vreme: "2026-10-25" }), SADA);
    expect(r).toMatchObject({ ok: true, vreme: Date.parse("2026-10-25") });
  });

  test("staro vreme prolazi: kartica sama kaže da je zastarelo", () => {
    expect(parsirajPuls(ispravno({ vreme: "2020-01-01T00:00:00Z" }), SADA).ok).toBe(true);
  });
});

describe("broj metrika", () => {
  const metrike = (n: number) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`m${i}`, i]));

  test("21 metrika je odbijeno, poruka kaže koliko ih je stiglo i koliko sme", () => {
    const poruka = odbijen(parsirajPuls(ispravno({ metrike: metrike(21) }), SADA), "los_format");
    expect(poruka).toContain("21");
    expect(poruka).toContain("20");
  });

  test("tačno 20 prolazi", () => {
    expect(PULS_MAX_METRIKA).toBe(20);
    const r = parsirajPuls(ispravno({ metrike: metrike(20) }), SADA);
    expect(r.ok && Object.keys(r.metrike)).toHaveLength(20);
  });

  test("nema metrika: prazan objekat, nedostaje polje, niz ili tekst", () => {
    for (const m of [{}, [], "porudzbine", 5, null]) {
      odbijen(parsirajPuls(ispravno({ metrike: m }), SADA), "los_format");
    }
    odbijen(parsirajPuls(tekst({ vreme: VREME }), SADA), "los_format");
  });
});

describe("ključ metrike", () => {
  test.each([
    ["velika slova", "Porudzbine"],
    ["41 znak", "a".repeat(41)],
    ["počinje sa _", "_skriveno"],
    ["razmak", "dve reci"],
    ["crtica", "dve-reci"],
    ["prazan ključ", ""],
    ["slovo sa kvačicom", "prihođ"],
    ["tačka", "a.b"],
    ["__proto__", "__proto__"],
  ])("%s je odbijen", (_opis, kljuc) => {
    // JSON.parse pravi pravo svojstvo i za „__proto__“, pa ga proveravamo kao ostale.
    const telo = `{"vreme":"${VREME}","metrike":{${JSON.stringify(kljuc)}:1}}`;
    odbijen(parsirajPuls(telo, SADA), "los_format");
  });

  test.each([
    ["40 znakova", "a".repeat(40)],
    ["počinje cifrom", "0dan"],
    ["donja crta u sredini", "a_b_9"],
    ["jedan znak", "x"],
  ])("%s prolazi", (_opis, kljuc) => {
    const telo = `{"vreme":"${VREME}","metrike":{${JSON.stringify(kljuc)}:1}}`;
    expect(parsirajPuls(telo, SADA)).toMatchObject({ ok: true, metrike: { [kljuc]: 1 } });
  });

  test("poruka o lošem ključu ne citira ključ", () => {
    const poruka = odbijen(
      parsirajPuls(ispravno({ metrike: { TuđeIme_ZA_PROVERU: 1 } }), SADA),
      "los_format",
    );
    expect(poruka).not.toContain("TuđeIme_ZA_PROVERU");
  });
});

describe("vrednost metrike", () => {
  test.each([
    ["tekst „5“", "5"],
    ["1e13 (preko granice)", 1e13],
    ["-1e13", -1e13],
    ["null", null],
    ["true", true],
    ["objekat", { a: 1 }],
    ["niz", [1]],
  ])("%s nije konačan broj", (_opis, vrednost) => {
    odbijen(parsirajPuls(ispravno({ metrike: { a: vrednost } }), SADA), "los_format");
  });

  test("1e999 se u JSON-u pročita kao Infinity i odbija se", () => {
    const telo = `{"vreme":"${VREME}","metrike":{"a":1e999}}`;
    odbijen(parsirajPuls(telo, SADA), "los_format");
    odbijen(parsirajPuls(`{"vreme":"${VREME}","metrike":{"a":-1e999}}`, SADA), "los_format");
  });

  test("granica je 1e12 u obe strane", () => {
    expect(parsirajPuls(ispravno({ metrike: { a: 1e12 } }), SADA).ok).toBe(true);
    expect(parsirajPuls(ispravno({ metrike: { a: -1e12 } }), SADA).ok).toBe(true);
    odbijen(parsirajPuls(ispravno({ metrike: { a: 1e12 + 1 } }), SADA), "los_format");
    odbijen(parsirajPuls(ispravno({ metrike: { a: -1e12 - 1 } }), SADA), "los_format");
  });

  test("poruka ne citira vrednost koju je sajt poslao", () => {
    const poruka = odbijen(
      parsirajPuls(ispravno({ metrike: { a: "TAJNA-VREDNOST-123" } }), SADA),
      "los_format",
    );
    expect(poruka).not.toContain("TAJNA-VREDNOST-123");
  });
});

describe("oznake", () => {
  test("oznaka za ključ kojeg nema u metrikama je odbijena", () => {
    odbijen(
      parsirajPuls(ispravno({ oznake: { porudzbine: "Porudžbine", prihod: "Prihod" } }), SADA),
      "los_format",
    );
  });

  test("oznaka samo za deo metrika je u redu", () => {
    const r = parsirajPuls(
      ispravno({ metrike: { a: 1, b: 2 }, oznake: { b: "Be" } }),
      SADA,
    );
    expect(r).toMatchObject({ ok: true, oznake: { b: "Be" } });
  });

  test("prazan objekat oznaka je ispravan", () => {
    expect(parsirajPuls(ispravno({ oznake: {} }), SADA)).toMatchObject({ ok: true, oznake: {} });
  });

  test.each([
    ["prazan tekst", ""],
    ["61 znak", "x".repeat(61)],
    ["kontrolni znak", "Naziv\u0007"],
    ["novi red", "Dva\nreda"],
    ["C1 kontrolni znak", "Naziv\u0085"],
    ["broj", 5],
    ["null", null],
    ["niz", ["Naziv"]],
  ])("oznaka: %s je odbijena", (_opis, naziv) => {
    odbijen(
      parsirajPuls(ispravno({ metrike: { a: 1 }, oznake: { a: naziv } }), SADA),
      "los_format",
    );
  });

  test("oznaka od 60 znakova i sa kvačicama prolazi", () => {
    const naziv = "š".repeat(60);
    expect(
      parsirajPuls(ispravno({ metrike: { a: 1 }, oznake: { a: naziv } }), SADA),
    ).toMatchObject({ ok: true, oznake: { a: naziv } });
  });

  test("oznake koje nisu objekat su odbijene", () => {
    for (const o of [[], "Naziv", 5]) {
      odbijen(parsirajPuls(ispravno({ oznake: o }), SADA), "los_format");
    }
  });
});

describe("vreme", () => {
  test("10 minuta u budućnosti je odbijeno, 4 minuta prolazi", () => {
    const poruka = odbijen(
      parsirajPuls(ispravno({ vreme: new Date(SADA + 10 * MIN).toISOString() }), SADA),
      "los_format",
    );
    expect(poruka).toContain("5 minuta");
    expect(
      parsirajPuls(ispravno({ vreme: new Date(SADA + 4 * MIN).toISOString() }), SADA).ok,
    ).toBe(true);
  });

  test("granica je tačno 5 minuta unapred", () => {
    expect(
      parsirajPuls(ispravno({ vreme: new Date(SADA + 5 * MIN).toISOString() }), SADA).ok,
    ).toBe(true);
    odbijen(
      parsirajPuls(ispravno({ vreme: new Date(SADA + 5 * MIN + 1).toISOString() }), SADA),
      "los_format",
    );
  });

  test("nije ISO: „Oct 25 2026“, ponoć bez godine, epoha u ms, prazno", () => {
    for (const vreme of ["Oct 25 2026", "25.10.2026.", "10/25/2026", 1761390000000, "", "   ", null]) {
      odbijen(parsirajPuls(ispravno({ vreme }), SADA), "los_format");
    }
  });

  test("ISO oblik, ali nemoguć datum, je odbijen", () => {
    odbijen(parsirajPuls(ispravno({ vreme: "2026-13-45T99:99:99Z" }), SADA), "los_format");
  });

  test("vreme nedostaje", () => {
    odbijen(parsirajPuls(tekst({ metrike: { a: 1 } }), SADA), "los_format");
  });
});

describe("telo nije JSON objekat", () => {
  test.each([
    ["niz", "[]"],
    ["tekst", '"x"'],
    ["null", "null"],
    ["broj", "5"],
    ["true", "true"],
  ])("%s", (_opis, telo) => {
    odbijen(parsirajPuls(telo, SADA), "nije_json");
  });

  test.each([
    ["pokvaren JSON", "{nope"],
    ["prazno telo", ""],
    ["HTML stranica", "<html><body>Greška 502</body></html>"],
    ["JSON posle teksta", "OK {}"],
    ["jednostruki navodnici", "{'vreme': 'x'}"],
  ])("%s", (_opis, telo) => {
    odbijen(parsirajPuls(telo, SADA), "nije_json");
  });

  test("poruka ne citira telo odgovora", () => {
    const poruka = odbijen(parsirajPuls("TAJNA-U-TELU nije json", SADA), "nije_json");
    expect(poruka).not.toContain("TAJNA-U-TELU");
  });
});

describe("veličina odgovora", () => {
  test("preko 64 KB je „prevelik“ i pre nego što se JSON čita", () => {
    expect(PULS_MAX_BAJTOVA).toBe(64 * 1024);
    // Ni nevažeći JSON ne menja kod: veličina se proverava prva.
    odbijen(parsirajPuls("x".repeat(PULS_MAX_BAJTOVA + 1), SADA), "prevelik");
    odbijen(parsirajPuls(ispravno({ dopuna: "x".repeat(70_000) }), SADA), "prevelik");
  });

  test("tačno 64 KB prolazi, bajt više ne", () => {
    const osnova = ispravno({ dopuna: "" }).length;
    const tacno = ispravno({ dopuna: "x".repeat(PULS_MAX_BAJTOVA - osnova) });
    expect(new TextEncoder().encode(tacno).length).toBe(PULS_MAX_BAJTOVA);
    expect(parsirajPuls(tacno, SADA).ok).toBe(true);
    odbijen(parsirajPuls(`${tacno} `, SADA), "prevelik");
  });

  test("veličina se meri u UTF-8 bajtovima, ne u znacima", () => {
    // 33.000 znakova × 2 bajta = 66.000 bajtova > 65.536.
    const dvoBajtni = ispravno({ dopuna: "č".repeat(33_000) });
    expect(dvoBajtni.length).toBeLessThan(PULS_MAX_BAJTOVA);
    odbijen(parsirajPuls(dvoBajtni, SADA), "prevelik");
  });
});

describe("nazivi grešaka za karticu", () => {
  test("svaki kod greške ima kratak naziv, i nijedan višak", () => {
    const kodovi = pulsGreskaValidator.members.map((m) => m.value).sort();
    expect(Object.keys(PULS_GRESKA_NAZIV).sort()).toEqual(kodovi);
    for (const naziv of Object.values(PULS_GRESKA_NAZIV)) {
      expect(naziv.length).toBeGreaterThan(0);
    }
  });
});
