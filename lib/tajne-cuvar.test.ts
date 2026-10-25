import { describe, expect, test } from "vitest";

import { envCitanja, fajloviKoda, imena, procitaj, rel } from "./izvorni-kod.pomoc";

/**
 * Čuvar tajni i podešavanja projekta (plan C10 §4.2–§4.3, §8.1):
 *  - tabelu `projekatTajne` (šifrati) dodiruju samo šema, mapa brisanja,
 *    funkcija čitanja i store podešavanja; tekst tajne postoji samo u akciji;
 *  - env vrednosti projekta (piksel, CAPI token, praćeni domeni, kratki
 *    linkovi, osvežavanje novosti, budžetske granice) čita samo
 *    `convex/lib/podesavanja.ts` (i `podesavanjaAkcija.ts`), pa drugi projekat
 *    ne može tiho da dobije Enigminu vrednost;
 *  - `OAUTH_CALLBACK_ORIGIN` i `HUB_HOSTS` imaju po jedno mesto čitanja.
 */

const KOD = fajloviKoda(["convex", "lib", "app", "components", "proxy.ts"]).map((put) => ({
  rel: rel(put),
  tekst: procitaj(put),
}));

const TAJNE_DOZVOLJENO = new Set([
  "convex/schema.ts",
  "convex/lib/purgeMap.ts",
  "convex/lib/podesavanja.ts",
  "convex/podesavanjaStore.ts",
]);

const ENV_PROJEKTA = [
  "META_CAPI_TOKEN",
  "META_PIXEL_ID",
  "META_CAPI_TEST_EVENT_CODE",
  "TRACKED_DOMAINS",
  "NOVOSTI_REVALIDATE_URL",
  "NOVOSTI_REVALIDATE_SECRET",
  "OR_SHORT_LINK_BASE_URL",
  "BUDGET_MIN",
  "BUDGET_MIN_EUR",
  "BUDGET_MAX",
  "BUDGET_MAX_EUR",
  "BUDGET_LIMIT_CURRENCY",
  "META_ADS_MAX_DAILY_BUDGET",
  "GOOGLE_ADS_MAX_DAILY_BUDGET",
  "HUB_HOSTS",
];
const ENV_DOZVOLJENO = new Set(["convex/lib/podesavanja.ts", "convex/lib/podesavanjaAkcija.ts"]);

/** Sva čitanja env-a u kodu, jednom (parsiranje AST-a je skupo). */
const CITANJA = KOD.flatMap((f) => envCitanja(f.rel, f.tekst).map((t) => ({ rel: f.rel, ime: t.tekst })));

function mestaEnva(ime: string): string[] {
  return CITANJA.filter((c) => c.ime === ime).map((c) => c.rel);
}

describe("tajne projekta", () => {
  test("skup fajlova nije prazan (putanje su tačne)", () => {
    const sve = KOD.map((f) => f.rel);
    for (const f of TAJNE_DOZVOLJENO) expect(sve).toContain(f);
    expect(sve).toContain("convex/metaCapi.ts");
    expect(sve).toContain("components/app/settings/sajt-panel.tsx");
  });

  test("`projekatTajne` se pominje samo u dozvoljenim fajlovima", () => {
    const pominju = new Set(
      KOD.filter((f) => imena(f.rel, f.tekst).some((t) => t.tekst === "projekatTajne")).map(
        (f) => f.rel,
      ),
    );
    expect([...pominju].filter((f) => !TAJNE_DOZVOLJENO.has(f))).toEqual([]);
    // Bez upisa i čitanja tajni ova provera ne bi ništa čuvala.
    expect(pominju.has("convex/podesavanjaStore.ts")).toBe(true);
    expect(pominju.has("convex/lib/podesavanja.ts")).toBe(true);
  });

  test("env vrednosti projekta čita samo funkcija podešavanja", () => {
    for (const ime of ENV_PROJEKTA) {
      const mesta = mestaEnva(ime).filter((f) => !ENV_DOZVOLJENO.has(f));
      expect(mesta, ime).toEqual([]);
    }
    expect(mestaEnva("META_PIXEL_ID")).toEqual(["convex/lib/podesavanja.ts"]);
    expect(mestaEnva("META_CAPI_TOKEN")).toEqual(["convex/lib/podesavanja.ts"]);
  });

  test("OAuth povratna adresa ima jedno mesto čitanja", () => {
    expect(mestaEnva("OAUTH_CALLBACK_ORIGIN")).toEqual(["convex/lib/oauthPovratak.ts"]);
    expect(mestaEnva("HUB_HOSTS")).toEqual(["convex/lib/podesavanja.ts"]);
  });

  test("provera same provere: čitanje env-a i ime tabele se vide, komentar ne", () => {
    expect(envCitanja("a.ts", `const x = process.env.META_PIXEL_ID;`).map((t) => t.tekst)).toEqual([
      "META_PIXEL_ID",
    ]);
    expect(envCitanja("a.ts", `const x = process.env["TRACKED_DOMAINS"];`)).toHaveLength(1);
    expect(envCitanja("a.ts", `// process.env.META_PIXEL_ID\nconst y = 1;`)).toEqual([]);
    expect(
      imena("a.ts", `ctx.db.query("projekatTajne")`).some((t) => t.tekst === "projekatTajne"),
    ).toBe(true);
    expect(
      imena("a.ts", `// projekatTajne\nconst z = 1;`).some((t) => t.tekst === "projekatTajne"),
    ).toBe(false);
  });
});
