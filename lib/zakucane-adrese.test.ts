import { describe, expect, test } from "vitest";

import { fajloviKoda, procitaj, rel, stringovi } from "./izvorni-kod.pomoc";

/**
 * Nijedna Enigma adresa nije zakucana u kodu koji se izvršava u `convex/`,
 * `lib/` i `proxy.ts` (plan C10 §4.1, §8.1). Adrese su podatak projekta
 * (domeni, sajtovi, podešavanja) ili env osnivačkog projekta. Komentari,
 * testovi i fiksture su izuzetak, pa se gledaju samo stringovi iz AST-a.
 */

const ZABRANJENO = [/digital\.enigmait\.rs/i, /www\.enigmait\.rs/i, /app\.enigma-it\.com/i];

function nalazi(putanja: string, tekst: string): string[] {
  return stringovi(putanja, tekst)
    .filter((s) => ZABRANJENO.some((r) => r.test(s.tekst)))
    .map((s) => `${putanja}:${s.linija} „${s.tekst}“`);
}

describe("zakucane adrese", () => {
  const fajlovi = fajloviKoda(["convex", "lib", "proxy.ts"]);

  test("skup fajlova nije prazan (putanje su tačne)", () => {
    const imena = fajlovi.map(rel);
    expect(imena).toContain("proxy.ts");
    expect(imena).toContain("convex/lib/podesavanja.ts");
    expect(imena).toContain("lib/rutiranje.ts");
    expect(imena.some((i) => i.includes("_generated"))).toBe(false);
    expect(imena.some((i) => i.endsWith(".test.ts"))).toBe(false);
  });

  test("u kodu nema digital.enigmait.rs, www.enigmait.rs ni app.enigma-it.com", () => {
    const pali = fajlovi.flatMap((put) => nalazi(rel(put), procitaj(put)));
    expect(pali).toEqual([]);
  });

  test("provera same provere: string pada, komentar ne", () => {
    expect(nalazi("a.ts", `// vidi https://digital.enigmait.rs\nconst x = 1;`)).toEqual([]);
    expect(nalazi("a.ts", `/** www.enigmait.rs */\nexport const y = 2;`)).toEqual([]);
    expect(nalazi("a.ts", `const u = "https://digital.enigmait.rs/api";`)).toHaveLength(1);
    expect(nalazi("a.ts", "const u = `https://www.enigmait.rs/${p}`;")).toHaveLength(1);
    expect(nalazi("a.ts", `fetch("https://app.enigma-it.com")`)).toHaveLength(1);
  });
});
