// SPAJANJE S20 (plan S18 §5.2): sastav početne projekta i granice blokova.
import { describe, expect, test } from "vitest";

import {
  BLOKOVI_RADNOG_DELA,
  limitiPocetne,
  podnaslovPocetne,
  redBlokova,
  sastavPocetne,
  sledecaGranicaZone,
} from "./pocetna-model";

describe("sastavPocetne", () => {
  test("uloga nije poznata: samo skelet, bez radnog dela", () => {
    for (const rezim of ["hub", "panel"] as const) {
      const s = sastavPocetne({ uloga: null, rezim });
      expect(s.skelet).toBe(true);
      expect(s.smeRadniDeo).toBe(false);
      expect(redBlokova(s)).toEqual([]);
      expect(s.primarnaRadnja).toBeNull();
    }
  });

  test("posmatrač u hubu: Enigmin fokus, Šta me čeka i Brojke", () => {
    const s = sastavPocetne({ uloga: "client_viewer", rezim: "hub" });
    expect(s.smeRadniDeo).toBe(false);
    expect(redBlokova(s)).toEqual(["fokusZadatak", "staMeCeka", "brojke"]);
    expect(s.primarnaRadnja).toBeNull();
  });

  test("posmatrač u panelu: CommandTop sa napretkom (i svojim Šta me čeka), pa Brojke", () => {
    const s = sastavPocetne({ uloga: "client_viewer", rezim: "panel" });
    expect(redBlokova(s)).toEqual(["commandTop", "brojke"]);
  });

  test("posmatrač nikad ne dobija blok radnog dela", () => {
    for (const rezim of ["hub", "panel"] as const) {
      const s = sastavPocetne({ uloga: "client_viewer", rezim });
      expect(redBlokova(s).filter((b) => BLOKOVI_RADNOG_DELA.has(b))).toEqual([]);
    }
  });

  test("urednik i owner u hubu: tačno P18 + Ideje za glasanje + Tim, bez Napretka", () => {
    for (const uloga of ["owner", "urednik"] as const) {
      const s = sastavPocetne({ uloga, rezim: "hub" });
      expect(s.smeRadniDeo).toBe(true);
      expect(s.primarnaRadnja).toBe("noviZadatak");
      expect(s.glavna).toEqual(["zaTebe", "trijaza"]);
      expect(s.strana).toEqual(["cekaTe", "idejeZaGlasanje", "tim"]);
      expect(s.dole).toEqual(["brojke", "pulsTima", "nedavneIzmene"]);
      expect(redBlokova(s)).not.toContain("napredak");
    }
  });

  test("urednik u panelu: Napredak odmah posle Čeka te (E10)", () => {
    const s = sastavPocetne({ uloga: "urednik", rezim: "panel" });
    expect(s.strana).toEqual(["cekaTe", "napredak", "idejeZaGlasanje", "tim"]);
  });

  test("telefon: red blokova urednika prati P18", () => {
    expect(redBlokova(sastavPocetne({ uloga: "urednik", rezim: "hub" }))).toEqual([
      "zaTebe",
      "trijaza",
      "cekaTe",
      "idejeZaGlasanje",
      "tim",
      "brojke",
      "pulsTima",
      "nedavneIzmene",
    ]);
  });
});

describe("limitiPocetne", () => {
  test("široko: Za tebe 6, zona 8, Ideje 5, Nedavne 8", () => {
    expect(limitiPocetne(true)).toEqual({ zaTebe: 6, zona: 8, zonaKorak: 25, zonaMaks: 100, ideje: 5, nedavne: 8 });
  });

  test("usko: Za tebe 5, zona 5, Ideje 3, Nedavne 5", () => {
    expect(limitiPocetne(false)).toEqual({ zaTebe: 5, zona: 5, zonaKorak: 25, zonaMaks: 100, ideje: 3, nedavne: 5 });
  });

  test("„Prikaži još“ dodaje po 25 i staje na 100", () => {
    const l = limitiPocetne(true);
    expect(sledecaGranicaZone(8, l)).toBe(33);
    expect(sledecaGranicaZone(83, l)).toBe(100);
    expect(sledecaGranicaZone(100, l)).toBe(100);
  });
});

describe("podnaslovPocetne", () => {
  test("svi brojevi, sa množinom „otvoren / otvorena / otvorenih“", () => {
    expect(podnaslovPocetne({ zaTebe: 7, otvorenihUTimu: 24, cekaTe: 3 })).toBe(
      "7 za tebe · 24 otvorena u timu · 3 čeka te",
    );
    expect(podnaslovPocetne({ zaTebe: 1, otvorenihUTimu: 21, cekaTe: 1 })).toBe(
      "1 za tebe · 21 otvoren u timu · 1 čeka te",
    );
    expect(podnaslovPocetne({ zaTebe: 2, otvorenihUTimu: 12, cekaTe: 0 })).toBe("2 za tebe · 12 otvorenih u timu");
  });

  test("dok se ne zna ništa: bez podnaslova; nule se ne pišu", () => {
    expect(podnaslovPocetne({ zaTebe: undefined, otvorenihUTimu: undefined, cekaTe: undefined })).toBeNull();
    expect(podnaslovPocetne({ zaTebe: 0, otvorenihUTimu: 0, cekaTe: 0 })).toBe("Ništa za tebe danas.");
  });

  test("blok koji je pao ili se učitava se izostavlja", () => {
    expect(podnaslovPocetne({ zaTebe: 4, otvorenihUTimu: undefined, cekaTe: undefined })).toBe("4 za tebe");
  });

  test("telefon: bez broja tima", () => {
    expect(podnaslovPocetne({ zaTebe: 7, otvorenihUTimu: 24, cekaTe: 3 }, true)).toBe("7 za tebe · 3 čeka te");
  });

  test("ostaje u jednom redu (≤ 90 znakova)", () => {
    const tekst = podnaslovPocetne({ zaTebe: 999, otvorenihUTimu: 9999, cekaTe: 999 }) ?? "";
    expect(tekst.length).toBeLessThanOrEqual(90);
  });
});
