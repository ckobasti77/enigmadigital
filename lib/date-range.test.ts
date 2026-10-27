import { describe, expect, test } from "vitest";

import {
  kljucPerioda,
  periodIzTeksta,
  periodIzUpita,
  periodUUpit,
  procitajPeriod,
  razresiPeriod,
  zapamtiPeriod,
  type Skladiste,
} from "./date-range";

/** Skladište u memoriji, kao `localStorage`. */
function memorija(): Skladiste & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>();
  return {
    mapa,
    getItem: (k) => mapa.get(k) ?? null,
    setItem: (k, v) => void mapa.set(k, String(v)),
  };
}

/** Skladište koje baca na svaki poziv (privatni prozor, zabranjen pristup). */
const pokvareno: Skladiste = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("ključ perioda", () => {
  test("po projektu, a hub ima svoj", () => {
    expect(kljucPerioda("ws_1")).toBe("enigma:period:ws_1");
    expect(kljucPerioda(null)).toBe("enigma:period:hub");
    expect(kljucPerioda("ws_1")).not.toBe(kljucPerioda("ws_2"));
  });
});

describe("pamćenje i čitanje", () => {
  test("preset se pamti i čita", () => {
    const s = memorija();
    expect(zapamtiPeriod("k", { range: "7d" }, s)).toBe(true);
    expect(procitajPeriod("k", s)).toEqual({ range: "7d" });
  });

  test("prilagođen raspon se pamti i čita", () => {
    const s = memorija();
    zapamtiPeriod("k", { from: "2026-10-01", to: "2026-10-15" }, s);
    expect(procitajPeriod("k", s)).toEqual({ from: "2026-10-01", to: "2026-10-15" });
  });

  test("28 d se pamti (izbor podrazumevanog je i dalje izbor)", () => {
    const s = memorija();
    zapamtiPeriod("k", { range: "7d" }, s);
    zapamtiPeriod("k", { range: "28d" }, s);
    expect(procitajPeriod("k", s)).toEqual({ range: "28d" });
  });

  test("projekti ne dele period", () => {
    const s = memorija();
    zapamtiPeriod(kljucPerioda("a"), { range: "7d" }, s);
    expect(procitajPeriod(kljucPerioda("b"), s)).toBeNull();
  });

  test("bez zapisa je null", () => {
    expect(procitajPeriod("k", memorija())).toBeNull();
  });

  test("ne pamti suvišna polja", () => {
    const s = memorija();
    zapamtiPeriod("k", { range: "90d", x: 1 } as never, s);
    expect(JSON.parse(s.mapa.get("k")!)).toEqual({ range: "90d" });
  });
});

describe("neispravan zapis", () => {
  test.each([
    ["nije JSON", "{range:7d"],
    ["prazan tekst", ""],
    ["null", "null"],
    ["broj", "7"],
    ["nepoznat preset", JSON.stringify({ range: "14d" })],
    ["obrnut raspon", JSON.stringify({ from: "2026-10-15", to: "2026-10-01" })],
    ["neispravan datum", JSON.stringify({ from: "2026-13-01", to: "2026-13-05" })],
    ["samo from", JSON.stringify({ from: "2026-10-01" })],
    ["pogrešan tip", JSON.stringify({ range: 7 })],
  ])("%s → null", (_opis, sirovo) => {
    expect(periodIzTeksta(sirovo)).toBeNull();
    const s = memorija();
    s.setItem("k", sirovo);
    expect(procitajPeriod("k", s)).toBeNull();
  });
});

describe("localStorage koji baca grešku", () => {
  test("čitanje vraća null, bez izuzetka", () => {
    expect(() => procitajPeriod("k", pokvareno)).not.toThrow();
    expect(procitajPeriod("k", pokvareno)).toBeNull();
  });

  test("pamćenje vraća false, bez izuzetka", () => {
    expect(() => zapamtiPeriod("k", { range: "7d" }, pokvareno)).not.toThrow();
    expect(zapamtiPeriod("k", { range: "7d" }, pokvareno)).toBe(false);
  });

  test("bez skladišta (server) nema čitanja ni pisanja", () => {
    expect(procitajPeriod("k", null)).toBeNull();
    expect(zapamtiPeriod("k", { range: "7d" }, null)).toBe(false);
  });

  test("bez prozora (node) podrazumevano skladište ne postoji", () => {
    expect(procitajPeriod("k")).toBeNull();
    expect(zapamtiPeriod("k", { range: "7d" })).toBe(false);
  });
});

describe("adresa i razrešavanje", () => {
  test("periodIzUpita čita samo ispravan izbor", () => {
    expect(periodIzUpita(new URLSearchParams("range=90d"))).toEqual({ range: "90d" });
    expect(periodIzUpita(new URLSearchParams("from=2026-10-01&to=2026-10-02"))).toEqual({
      from: "2026-10-01",
      to: "2026-10-02",
    });
    expect(periodIzUpita(new URLSearchParams("range=1y"))).toBeNull();
    expect(periodIzUpita(new URLSearchParams("tab=x"))).toBeNull();
  });

  test("periodUUpit ne piše podrazumevanih 28 d", () => {
    expect(periodUUpit({ range: "7d" })).toBe("range=7d");
    expect(periodUUpit({ range: "28d" })).toBe("");
    expect(periodUUpit({ from: "2026-10-01", to: "2026-10-15" })).toBe("from=2026-10-01&to=2026-10-15");
  });

  test("razresiPeriod: zapamćen izbor ili 28 d", () => {
    const danas = new Date(2026, 9, 28);
    expect(razresiPeriod(null, danas)).toMatchObject({ preset: "28d", days: 28, to: "2026-10-28" });
    expect(razresiPeriod({ range: "7d" }, danas)).toMatchObject({
      preset: "7d",
      from: "2026-10-22",
      to: "2026-10-28",
      days: 7,
    });
    expect(razresiPeriod({ from: "2026-10-01", to: "2026-10-15" }, danas)).toMatchObject({
      preset: "custom",
      days: 15,
    });
  });
});
