/**
 * Čuvar kontrasta (plan T08 §5.6): K1–K4 na primerima, pa nad celim kodom —
 * nema providnosti, gole `opacity-*` ni sirove palete na tekstu.
 */
import { describe, expect, test } from "vitest";

import { IZUZECI_OPACITY, procitajKontrast, proveriKontrast, uOpsegu } from "./kontrast-cuvar";
import { fajloviKoda, procitaj, rel } from "./izvorni-kod.pomoc";

const pravila = (n: { pravilo: string }[]) => n.map((x) => x.pravilo).sort();

describe("čuvar kontrasta — pravila na primerima", () => {
  test("K2: text-text-muted/60 i hover:text-foreground/90 padaju; text-line/40 i text-sm/6 prolaze", () => {
    const tekst = `const a = "text-text-muted/60";
const b = cn("x hover:text-foreground/90");
const c = "text-line/40 text-chart-2/50";
const d = "text-sm/6 bg-text-muted/20";
// "text-danger/80" u komentaru se ne broji`;
    expect(pravila(proveriKontrast("components/app/x.tsx", tekst))).toEqual(["K2", "K2"]);
  });

  test("K3: opacity-60 na <span> pada; varijanta, onemogućeno i lucide ikonica prolaze", () => {
    const tekst = `import { Info } from "lucide-react";
export const A = () => (
  <>
    <span className="opacity-60">3</span>
    <button className="disabled:opacity-50">x</button>
    <span className="cursor-not-allowed opacity-50">x</span>
    <Info className="size-3 opacity-60" />
    <span className="animate-ping opacity-75" />
    <div className="absolute inset-0 opacity-50" />
  </>
);`;
    expect(pravila(proveriKontrast("components/app/y.tsx", tekst))).toEqual(["K3"]);
  });

  test("K3: izuzetak važi samo u svom fajlu i mora da ima razlog", () => {
    const tekst = `const t = "opacity-90 hover:opacity-100";`;
    expect(proveriKontrast("components/app/drugi.tsx", tekst)).toHaveLength(1);
    expect(proveriKontrast("components/app/instagram/population-pyramid-chart.tsx", tekst)).toHaveLength(0);
    for (const i of IZUZECI_OPACITY) expect(i.razlog.length).toBeGreaterThan(10);
  });

  test("izuzetak bez razloga obara proveru razloga", () => {
    const bezRazloga = [...IZUZECI_OPACITY, { fajl: "components/app/z.tsx", sadrzi: "opacity-", razlog: "" }];
    expect(bezRazloga.every((i) => i.razlog.trim().length > 10)).toBe(false);
  });

  test("K4: sirova paleta na tekstu pada", () => {
    const tekst = `const a = "text-white"; const b = "hover:text-slate-400"; const c = "text-foreground";`;
    expect(pravila(proveriKontrast("components/app/p.tsx", tekst))).toEqual(["K4", "K4"]);
  });

  test("K1: čita se izlaz contrast-check", () => {
    expect(procitajKontrast("Prag: 4.5:1 … Pada: 0 od 262 (uz 22 informativnih redova).")).toEqual({ pada: 0, ukupno: 262 });
    expect(procitajKontrast("Pada: 3 od 10")).toEqual({ pada: 3, ukupno: 10 });
    expect(procitajKontrast("nešto drugo")).toBeNull();
  });
});

describe("čuvar kontrasta — ceo kod", () => {
  test("nema providnosti, gole opacity ni sirove palete na tekstu", () => {
    const fajlovi = fajloviKoda(["components", "app"]).filter((f) => uOpsegu(rel(f)));
    const nalazi = fajlovi.flatMap((f) => proveriKontrast(rel(f), procitaj(f)));
    expect(nalazi.map((n) => `${n.putanja}:${n.linija} ${n.pravilo} ${n.poruka}`)).toEqual([]);
  });
});
