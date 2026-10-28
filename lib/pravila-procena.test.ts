import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  blizinaPragu,
  formatVrednostPravila,
  meraIzmerena,
  medijana,
  uslovIspunjen,
  vrednostMere,
  zaokruziPrag,
  type ZbirCilja,
} from "../convex/lib/pravilaProcena";
import { NBSP } from "../convex/lib/formatJezgro";
import { formatRuleSentence, formatVrednostCilja } from "./rule-sentence";

/**
 * Jedna logika procene pravila (ULTRA1 T07): evaluator, proba i predlog praga
 * računaju isto. Uz to: ekran Pravila ništa ne upisuje sam (nema samoupisa
 * šablona) i iznos nikad ne dobija pretpostavljen evro.
 */

const cilj = (z: Partial<ZbirCilja>): ZbirCilja => ({
  spend: 0,
  impressions: 0,
  clicks: 0,
  results: 0,
  conversionValue: 0,
  ...z,
});

describe("vrednostMere", () => {
  test("cena po rezultatu: potrošnja / rezultati; bez rezultata cela potrošnja", () => {
    expect(vrednostMere("cpa", cilj({ spend: 643, results: 10 }))).toBeCloseTo(64.3);
    expect(vrednostMere("cpa", cilj({ spend: 80, results: 0 }))).toBe(80);
    expect(vrednostMere("cpa", cilj({}))).toBe(0);
  });

  test("potrošnja, stopa klikova, cena po kliku, povraćaj", () => {
    expect(vrednostMere("spend", cilj({ spend: 42.5 }))).toBe(42.5);
    expect(vrednostMere("ctr", cilj({ impressions: 2000, clicks: 50 }))).toBe(2.5);
    expect(vrednostMere("ctr", cilj({ clicks: 5 }))).toBe(0);
    expect(vrednostMere("cpc", cilj({ spend: 10, clicks: 40 }))).toBe(0.25);
    expect(vrednostMere("cpc", cilj({ spend: 10 }))).toBe(0);
    expect(vrednostMere("roas", cilj({ spend: 50, conversionValue: 150 }))).toBe(3);
    expect(vrednostMere("roas", cilj({ conversionValue: 150 }))).toBe(0);
  });
});

describe("uslovIspunjen i blizinaPragu", () => {
  test("četiri operatora, granica tačno na pragu", () => {
    expect(uslovIspunjen("gt", 50, 50)).toBe(false);
    expect(uslovIspunjen("gte", 50, 50)).toBe(true);
    expect(uslovIspunjen("lt", 50, 50)).toBe(false);
    expect(uslovIspunjen("lte", 50, 50)).toBe(true);
    expect(uslovIspunjen("gt", 64.3, 50)).toBe(true);
    expect(uslovIspunjen("lt", 10, 20)).toBe(true);
  });

  test("veće od: vrednost / prag; manje od: prag / vrednost; bez odnosa `null`", () => {
    expect(blizinaPragu("gt", 6.43, 15)).toBeCloseTo(0.4287, 3);
    expect(blizinaPragu("gte", 30, 15)).toBe(2);
    expect(blizinaPragu("lt", 40, 20)).toBe(0.5);
    expect(blizinaPragu("gt", 5, 0)).toBeNull();
    expect(blizinaPragu("lte", 0, 20)).toBeNull();
  });
});

describe("medijana i zaokruziPrag", () => {
  test("medijana: neparan, paran, nesortiran, prazan niz", () => {
    expect(medijana([10, 500, 64.3])).toBe(64.3);
    expect(medijana([343, 300, 100, 500])).toBe(321.5);
    expect(medijana([7])).toBe(7);
    expect(medijana([])).toBeNull();
  });

  test("naviše na dve značajne cifre", () => {
    expect(zaokruziPrag(1286)).toBe(1300);
    expect(zaokruziPrag(12.86)).toBe(13);
    expect(zaokruziPrag(6.43)).toBe(6.5);
    expect(zaokruziPrag(128.6)).toBe(130);
    expect(zaokruziPrag(643)).toBe(650);
    // Već okrugao broj ostaje isti (ostatak deljenja u pokretnom zarezu).
    expect(zaokruziPrag(1300)).toBe(1300);
    expect(zaokruziPrag(1.1)).toBe(1.1);
    expect(zaokruziPrag(0.7)).toBe(0.7);
    expect(zaokruziPrag(0.0123)).toBe(0.013);
    expect(zaokruziPrag(0)).toBeNull();
    expect(zaokruziPrag(-3)).toBeNull();
    expect(zaokruziPrag(Number.NaN)).toBeNull();
  });
});

describe("valuta (O16)", () => {
  test("iznos nosi valutu naloga; bez nje nema znaka, nikad pretpostavljen evro", () => {
    expect(formatVrednostPravila("cpa", 1820, "EUR")).toMatch(/1\.820,00\s€/);
    expect(formatVrednostPravila("spend", 1820, "RSD")).toContain("RSD");
    expect(formatVrednostPravila("spend", 1820, "RSD")).not.toContain("€");
    expect(formatVrednostPravila("cpc", 0.25, null)).toBe("0,25");
    expect(formatVrednostPravila("cpc", 0.25, undefined)).not.toContain("€");
    // Tvrdi razmak pre „%" (P7), isti kao `lib/format.ts`.
    expect(formatVrednostPravila("ctr", 2.5, "EUR")).toBe(`2,50${NBSP}%`);
    expect(formatVrednostPravila("roas", 3, "EUR")).toBe("3,00×");
  });

  test("rečenica pravila: srpski naziv mere, valuta naloga ili bez znaka", () => {
    const pravilo = {
      scope: "campaign" as const,
      condition: { metric: "cpa" as const, operator: "gt" as const, value: 15, windowDays: 3, minImpressions: 1000 },
      action: "pause_and_notify" as const,
      cooldownHours: 24,
    };
    const saValutom = formatRuleSentence(pravilo, "EUR");
    expect(saValutom).toMatch(/^Ako cena po rezultatu > 15,00\s€ tokom 3 dana uz najmanje 1\.000 prikaza → pauziraj i javi mi · pauza za istu kampanju 24 h$/);
    const bezValute = formatRuleSentence(pravilo);
    expect(bezValute).toContain("> 15,00 tokom");
    expect(bezValute).not.toContain("€");
    expect(formatRuleSentence(pravilo, "EUR", "prag")).toContain("> prag tokom");
  });

  test("neizmerena mera kaže zašto, a ne izgleda kao izmerena (T13)", () => {
    const bezRezultata: ZbirCilja = { spend: 40, impressions: 2000, clicks: 0, results: 0, conversionValue: 0 };
    expect(meraIzmerena("cpa", bezRezultata)).toBe(false);
    expect(meraIzmerena("cpc", bezRezultata)).toBe(false);
    expect(meraIzmerena("ctr", bezRezultata)).toBe(true);
    expect(meraIzmerena("spend", bezRezultata)).toBe(true);
    expect(meraIzmerena("roas", bezRezultata)).toBe(true);
    expect(meraIzmerena("roas", { ...bezRezultata, spend: 0 })).toBe(false);
    expect(meraIzmerena("ctr", { ...bezRezultata, impressions: 0 })).toBe(false);

    expect(formatVrednostCilja("cpa", 40, false, "EUR")).toMatch(/^bez rezultata, potrošeno 40,00\s€$/);
    expect(formatVrednostCilja("cpc", 0, false, "EUR")).toMatch(/^bez klikova \(računa se kao 0,00\s€\)$/);
    expect(formatVrednostCilja("cpa", 12.5, true, "EUR")).toMatch(/^12,50\s€$/);
  });
});

describe("bez samoupisa na ekranu Pravila", () => {
  const dir = join(process.cwd(), "components", "app", "rules");
  const fajlovi = readdirSync(dir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

  test("nijedan fajl ne zove nekadašnji samoupis šablona", () => {
    for (const f of fajlovi) {
      expect(readFileSync(join(dir, f), "utf8"), f).not.toContain("ensureTemplateRules");
    }
  });

  test("dodavanje iz šablona postoji samo u dijalogu šablona, uz prag", () => {
    const koriste = fajlovi.filter((f) =>
      readFileSync(join(dir, f), "utf8").includes("dodajIzSablona"),
    );
    expect(koriste).toEqual(["rule-sablon-dialog.tsx"]);
    const dijalog = readFileSync(join(dir, "rule-sablon-dialog.tsx"), "utf8");
    expect(dijalog).toMatch(/await dodaj\(\{ sablon, prag \}\)/);
  });

  test("tabla pravila ne upisuje ništa pri učitavanju (nema efekta sa mutacijom)", () => {
    const tabla = readFileSync(join(dir, "rules-dashboard.tsx"), "utf8");
    expect(tabla).not.toMatch(/useEffect/);
    expect(tabla).not.toMatch(/useProjekatMutation/);
  });
});
