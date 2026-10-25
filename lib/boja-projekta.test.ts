import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  KONTRAST_GRANICE,
  KONTRAST_TEKSTA,
  SVETLI_TEKST,
  TAMNI_TEKST,
  inicijaliProjekta,
  izvediBojuProjekta,
  kontrast,
  stilProjekta,
} from "./boja-projekta";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

function token(ime: string): string | undefined {
  return new RegExp(`--${ime}:\\s*([^;]+);`).exec(css)?.[1].trim().toLowerCase();
}

/** Oba uslova iz plana: tekst ≥ 4,5:1 na boji, boja ≥ 3:1 prema strani. */
function prolazi(par: { boja: string; tekst: string }) {
  expect(kontrast(par.boja, par.tekst)).toBeGreaterThanOrEqual(KONTRAST_TEKSTA);
  expect(kontrast(par.boja, TAMNI_TEKST)).toBeGreaterThanOrEqual(KONTRAST_GRANICE);
}

describe("izvediBojuProjekta", () => {
  test("heks vrednosti teksta su isti tokeni kao u globals.css", () => {
    expect(token("bg-950")).toBe(TAMNI_TEKST);
    expect(token("text-primary")).toBe(SVETLI_TEKST);
    expect(token("background")).toBe("var(--bg-950)");
    expect(token("foreground")).toBe("var(--text-primary)");
  });

  test("neispravna ili prazna vrednost → null (važi podrazumevani token)", () => {
    for (const los of [null, undefined, "", "22c55e", "#22c55", "#22c55eff", "#ggg000", "red", " "]) {
      expect(izvediBojuProjekta(los)).toBeNull();
    }
  });

  test("svetla boja ostaje ista i dobija tamni tekst", () => {
    expect(izvediBojuProjekta("#22c55e")).toEqual({ boja: "#22c55e", tekst: TAMNI_TEKST });
    expect(izvediBojuProjekta("#38BDF8")).toEqual({ boja: "#38bdf8", tekst: TAMNI_TEKST });
    expect(izvediBojuProjekta("#ffffff")).toEqual({ boja: "#ffffff", tekst: TAMNI_TEKST });
  });

  test("srednje tamna boja koja prolazi granicu dobija svetli tekst", () => {
    const par = izvediBojuProjekta("#7c3aed");
    expect(par).toEqual({ boja: "#7c3aed", tekst: SVETLI_TEKST });
  });

  test("pretamna boja se posvetli dok ne prođe granicu prema strani", () => {
    for (const tamna of ["#000000", "#0b1221", "#1e1b4b", "#14532d"]) {
      expect(kontrast(tamna, TAMNI_TEKST)).toBeLessThan(KONTRAST_GRANICE);
      const par = izvediBojuProjekta(tamna);
      expect(par).not.toBeNull();
      expect(par?.boja).not.toBe(tamna);
      prolazi(par!);
    }
  });

  test("boja kod koje nijedan tekst ne dostiže 4,5:1 se pomeri", () => {
    // Oko luminanse 0,18 ni tamni ni svetli tekst ne prolaze.
    const sredina = "#e11d48";
    expect(kontrast(sredina, TAMNI_TEKST)).toBeLessThan(KONTRAST_TEKSTA);
    expect(kontrast(sredina, SVETLI_TEKST)).toBeLessThan(KONTRAST_TEKSTA);
    const par = izvediBojuProjekta(sredina);
    expect(par?.boja).not.toBe(sredina);
    prolazi(par!);
  });

  test("svaka boja iz mreže dobija par koji prolazi oba uslova", () => {
    const koraci = [0, 0x33, 0x66, 0x99, 0xcc, 0xff];
    for (const r of koraci) for (const g of koraci) for (const b of koraci) {
      const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
      const par = izvediBojuProjekta(hex);
      expect(par, hex).not.toBeNull();
      prolazi(par!);
    }
  });

  test("stil: tekst je token, bez boje važi podrazumevani projekat", () => {
    expect(stilProjekta("#22c55e")).toEqual({
      "--projekat": "#22c55e",
      "--projekat-tekst": "var(--background)",
    });
    expect(stilProjekta("#7c3aed")).toEqual({
      "--projekat": "#7c3aed",
      "--projekat-tekst": "var(--foreground)",
    });
    expect(stilProjekta(null)).toEqual({
      "--projekat": "var(--projekat-osnovna)",
      "--projekat-tekst": "var(--background)",
    });
    expect(token("projekat-osnovna")).toBe("var(--mod-tabla-strong)");
  });
});

describe("inicijaliProjekta", () => {
  test("dve reči, jedna reč sa velikim slovom u sredini, jedna reč", () => {
    expect(inicijaliProjekta("Enigma IT")).toBe("EI");
    expect(inicijaliProjekta("Klijent d.o.o.")).toBe("KD");
    expect(inicijaliProjekta("ScanMe")).toBe("SM");
    expect(inicijaliProjekta("enigma")).toBe("EN");
    expect(inicijaliProjekta("Šabac")).toBe("ŠA");
    expect(inicijaliProjekta("  ")).toBe("?");
  });
});
