// SPAJANJE S08: pravila čuvara napuštanja (plan S07 §4.3), po Devotion
// `workspace-shell.tsx` i `page-autosave-model.ts` (main @ c05c40f).
import { describe, expect, test } from "vitest";

import {
  CEKANJE_PRE_PITANJA_MS,
  imaNesacuvano,
  jeNavigacijaUnutarAplikacije,
  najteziNacrt,
  odlukaNapustanja,
  pitanjeNapustanja,
  seSlaze,
  type KlikNaLink,
} from "./cuvar-napustanja";

const KLIK: KlikNaLink = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};
const SADA = "https://primer.test/enigma-it/stranica/abc?tab=mapa";

describe("odluka pri napuštanju", () => {
  test("sačuvano ili bez nacrta: ide se odmah", () => {
    expect(odlukaNapustanja(null)).toEqual({ tip: "idi" });
    expect(odlukaNapustanja({ stanje: "saved", vrsta: "stranica" })).toEqual({ tip: "idi" });
  });

  test("u toku: čeka se 2 s, pa pitanje", () => {
    for (const stanje of ["dirty", "saving"] as const) {
      expect(odlukaNapustanja({ stanje, vrsta: "stranica" })).toEqual({
        tip: "sacekaj",
        ms: CEKANJE_PRE_PITANJA_MS,
        pitanje: "Izmene još nisu sačuvane. Napusti stranicu?",
      });
    }
    expect(CEKANJE_PRE_PITANJA_MS).toBe(2_000);
  });

  test("greška, konflikt i neispravno: pita se odmah", () => {
    expect(odlukaNapustanja({ stanje: "error", vrsta: "stranica" }).tip).toBe("pitaj");
    expect(odlukaNapustanja({ stanje: "conflict", vrsta: "stranica" }).tip).toBe("pitaj");
    expect(odlukaNapustanja({ stanje: "invalid", vrsta: "stranica" })).toEqual({
      tip: "pitaj",
      pitanje: "Naslov je prazan, pa izmene ne mogu da se sačuvaju. Napusti stranicu?",
    });
  });

  test("oblast ima svoje pitanje", () => {
    expect(pitanjeNapustanja("dirty", "oblast")).toBe(
      "Opis oblasti još nije sačuvan. Napusti prikaz?",
    );
  });

  test("pomoćna pravila stanja", () => {
    expect(imaNesacuvano("saved")).toBe(false);
    for (const s of ["saving", "dirty", "error", "conflict", "invalid"] as const) {
      expect(imaNesacuvano(s)).toBe(true);
    }
    expect(seSlaze("dirty")).toBe(true);
    expect(seSlaze("saving")).toBe(true);
    expect(seSlaze("error")).toBe(false);
  });
});

describe("više nacrta odjednom", () => {
  test("odlučuje najteže nesačuvano stanje", () => {
    expect(najteziNacrt([])).toBeNull();
    expect(najteziNacrt([{ stanje: "saved", vrsta: "stranica" }])).toBeNull();
    expect(
      najteziNacrt([
        { stanje: "saving", vrsta: "oblast" },
        { stanje: "conflict", vrsta: "stranica" },
        { stanje: "dirty", vrsta: "stranica" },
      ]),
    ).toEqual({ stanje: "conflict", vrsta: "stranica" });
  });
});

describe("koji klik čuvar preuzima", () => {
  const link = (href: string, ostalo: Partial<{ target: string; download: boolean }> = {}) => ({
    href,
    target: "",
    download: false,
    ...ostalo,
  });

  test("običan klik na drugu stranu iste aplikacije", () => {
    expect(jeNavigacijaUnutarAplikacije(KLIK, link("/enigma-it/zadaci"), SADA)).toBe(true);
    expect(jeNavigacijaUnutarAplikacije(KLIK, link("/moji-zadaci"), SADA)).toBe(true);
    expect(
      jeNavigacijaUnutarAplikacije(KLIK, link("/enigma-it/stranica/abc"), SADA),
      "isti put, drugi upit je druga strana",
    ).toBe(true);
  });

  test("nova kartica, preuzimanje, drugi izvor i već obrađen klik prolaze sami", () => {
    expect(jeNavigacijaUnutarAplikacije({ ...KLIK, metaKey: true }, link("/x"), SADA)).toBe(false);
    expect(jeNavigacijaUnutarAplikacije({ ...KLIK, ctrlKey: true }, link("/x"), SADA)).toBe(false);
    expect(jeNavigacijaUnutarAplikacije({ ...KLIK, button: 1 }, link("/x"), SADA)).toBe(false);
    expect(jeNavigacijaUnutarAplikacije({ ...KLIK, defaultPrevented: true }, link("/x"), SADA)).toBe(
      false,
    );
    expect(jeNavigacijaUnutarAplikacije(KLIK, link("/x", { target: "_blank" }), SADA)).toBe(false);
    expect(jeNavigacijaUnutarAplikacije(KLIK, link("/x", { download: true }), SADA)).toBe(false);
    expect(jeNavigacijaUnutarAplikacije(KLIK, link("https://drugi.test/x"), SADA)).toBe(false);
  });

  test("sidro na istoj strani nije napuštanje", () => {
    expect(
      jeNavigacijaUnutarAplikacije(KLIK, link("/enigma-it/stranica/abc?tab=mapa#komentari"), SADA),
    ).toBe(false);
  });
});
