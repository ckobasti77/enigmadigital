import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { LEAD_SAJT_POLJA, leadSajtSchema } from "../convex/lib/leadSajt";

/**
 * Uputstvo za ScanMe (`docs/projekti/SCANME-INTEGRACIJA.md`) i šema tela forme
 * (`convex/lib/leadSajt.ts`) ne smeju da se raziđu: svako polje šeme, putanja
 * i oba zaglavlja moraju biti u dokumentu. Dokument ne sme da nosi ništa što
 * liči na token ni adresu pravog Convex deploymenta.
 */

const DOKUMENT = readFileSync(
  fileURLToPath(new URL("../docs/projekti/SCANME-INTEGRACIJA.md", import.meta.url)),
  "utf8",
);

/** Ključevi objekta zod šeme (i ugnežđenih objekata), iz same šeme. */
function poljaSeme(): { koren: string[]; ugnezdena: Record<string, string[]> } {
  // `refine` ne menja oblik; `shape` je na unutrašnjoj šemi objekta.
  const objekat = (leadSajtSchema as unknown as { shape?: Record<string, unknown> }).shape
    ?? (leadSajtSchema as unknown as { _zod: { def: { in?: { shape: Record<string, unknown> } } } })
      ._zod.def.in?.shape;
  expect(objekat, "šema tela mora biti objekat").toBeDefined();
  const koren = Object.keys(objekat!);
  const ugnezdena: Record<string, string[]> = {};
  for (const [kljuc, sema] of Object.entries(objekat!)) {
    let s = sema as { _zod?: { def?: { innerType?: unknown; shape?: unknown } }; shape?: Record<string, unknown> };
    // optional(...) → unutrašnja šema
    while (s._zod?.def?.innerType) s = s._zod.def.innerType as typeof s;
    if (s.shape && typeof s.shape === "object") ugnezdena[kljuc] = Object.keys(s.shape);
  }
  return { koren, ugnezdena };
}

describe("uputstvo za ScanMe", () => {
  test("putanja i oba zaglavlja su u dokumentu", () => {
    expect(DOKUMENT).toContain("POST https://<deployment>.convex.site/projekti/lead");
    expect(DOKUMENT).toContain("Authorization: Bearer <token za formu>");
    expect(DOKUMENT).toContain("Content-Type: application/json");
    expect(DOKUMENT).toContain("GET https://scanme.rs/api/puls");
  });

  test("svako polje šeme tela je u dokumentu (i spisak polja je ista šema)", () => {
    const { koren, ugnezdena } = poljaSeme();
    expect([...koren].sort()).toEqual([...LEAD_SAJT_POLJA].sort());
    for (const polje of koren) {
      expect(DOKUMENT, `polje „${polje}“`).toContain(`\`${polje}\``);
    }
    expect(Object.keys(ugnezdena).sort()).toEqual(["klijent", "saglasnost", "utm"]);
    for (const [roditelj, deca] of Object.entries(ugnezdena)) {
      for (const dete of deca) {
        expect(DOKUMENT, `polje „${roditelj}.${dete}“`).toContain(`\`${dete}\``);
      }
    }
  });

  test("odgovori koje ruta vraća su opisani", () => {
    for (const status of ["200", "401", "403", "413", "415", "422", "429"]) {
      expect(DOKUMENT).toContain(`| ${status} |`);
    }
    expect(DOKUMENT).toContain("Retry-After");
    expect(DOKUMENT).toContain("Treba email ili telefon.");
  });

  test("env promenljive koje Jovan postavlja su navedene", () => {
    for (const ime of ["ENIGMA_LEAD_URL", "ENIGMA_LEAD_TOKEN", "PULS_TOKEN", "PULS_INTERNI_KLJUC"]) {
      expect(DOKUMENT).toContain(`\`${ime}\``);
    }
  });

  test("nema vrednosti koja liči na token ni adrese pravog deploymenta", () => {
    expect(DOKUMENT).not.toMatch(/[A-Za-z0-9_-]{32,}/);
    // Svaka `.convex.site` adresa je mesto za upis (`<deployment>`).
    const sve = DOKUMENT.match(/\.convex\.(site|cloud)/g) ?? [];
    const mesta = DOKUMENT.match(/<deployment>\.convex\.(site|cloud)/g) ?? [];
    expect(sve.length).toBeGreaterThan(0);
    expect(mesta.length).toBe(sve.length);
    expect(DOKUMENT).not.toMatch(/https:\/\/[a-z0-9-]+\.convex\.(site|cloud)/);
  });

  test("provera same provere: token i prava adresa bi pali", () => {
    const tokenLik = "AbCdEfGhIjKlMnOpQrStUvWxYz012345_-";
    expect(tokenLik).toMatch(/[A-Za-z0-9_-]{32,}/);
    expect("https://happy-otter-123.convex.site/projekti/lead").toMatch(
      /https:\/\/[a-z0-9-]+\.convex\.(site|cloud)/,
    );
  });
});
