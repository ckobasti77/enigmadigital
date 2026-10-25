import { describe, expect, test } from "vitest";

import { jeTokenPozivnice, putanjaPozivnice } from "./pozivnica-token";
import { fajloviKoda, imena, procitaj, rel } from "./izvorni-kod.pomoc";

/**
 * Pozivnice po projektu (plan C10 §7): token parkiran za vreme prijave vodi
 * samo na `/pozivnica/<token>`, i nijedan kod više ne zavisi od sluga
 * `enigma-it` (`WORKSPACE_SLUG` je obrisan).
 */

const PRAVI = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE"; // 43 znaka

describe("token pozivnice posle prijave", () => {
  test("prihvata samo oblik pravog tokena", () => {
    expect(PRAVI).toHaveLength(43);
    expect(jeTokenPozivnice(PRAVI)).toBe(true);
    expect(putanjaPozivnice(PRAVI)).toBe(`/pozivnica/${PRAVI}`);
  });

  test("ništa drugo ne postaje adresa (nema open redirect-a)", () => {
    for (const lose of [
      null,
      undefined,
      "",
      PRAVI.slice(1),
      `${PRAVI}A`,
      "//zli.example/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "https://zli.example",
      "../../settings?tab=pristup&aaaaaaaaaaaaaaaaaa",
      `${PRAVI.slice(0, 42)}/`,
      `${PRAVI.slice(0, 42)}=`,
      42,
    ]) {
      expect(jeTokenPozivnice(lose)).toBe(false);
      expect(putanjaPozivnice(lose)).toBeNull();
    }
  });
});

describe("pozivnice ne zavise od sluga enigma-it", () => {
  test("WORKSPACE_SLUG i WORKSPACE_NAME ne postoje u kodu", () => {
    const nalazi: string[] = [];
    for (const put of fajloviKoda(["convex", "lib", "app", "components", "proxy.ts"])) {
      for (const t of imena(put, procitaj(put))) {
        if (t.tekst === "WORKSPACE_SLUG" || t.tekst === "WORKSPACE_NAME") {
          nalazi.push(`${rel(put)}:${t.linija}`);
        }
      }
    }
    expect(nalazi).toEqual([]);
  });

  test("auth.ts i invitesStore.ts ne traže projekat po slugu", () => {
    for (const fajl of ["convex/auth.ts", "convex/invitesStore.ts"]) {
      const [put] = fajloviKoda([fajl]);
      const stringoviSluga = imena(put, procitaj(put)).filter((t) => t.tekst === "enigma-it");
      expect(stringoviSluga, fajl).toEqual([]);
      expect(procitaj(put), fajl).not.toMatch(/withIndex\("by_slug"/);
    }
  });
});
