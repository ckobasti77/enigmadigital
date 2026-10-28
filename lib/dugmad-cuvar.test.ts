/**
 * Čuvar dugmadi i boje radnje (plan T08 §2.5): pravila D1–D7 na primerima,
 * pa na celom kodu — nijedno dugme bez uloge, nijedno `default`, nijedno
 * ručno obojeno primarno, boja modula ne ulazi u shadcn sloj.
 */
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  IZUZECI_SPREAD,
  PLAFON_BOJE_MODULA,
  bojaModulaDozvoljena,
  brojBojeModula,
  proveriDugmad,
  proveriGlobals,
  proveriPrimitiv,
} from "./dugmad-cuvar";
import { KOREN, fajloviKoda, procitaj, rel } from "./izvorni-kod.pomoc";

const pravila = (n: { pravilo: string }[]) => n.map((x) => x.pravilo).sort();

describe("čuvar dugmadi — pravila na primerima", () => {
  test("D2/D3: dugme bez uloge i `default` (i u uslovu) padaju; uloge prolaze", () => {
    const tekst = `export function P({ a }: { a: boolean }) {
  return (
    <>
      <Button onClick={f}>Bez uloge</Button>
      <Button variant="default">Staro</Button>
      <Button variant={a ? "default" : "outline"}>Uslov</Button>
      <DialogClose render={<Button size="sm" />}>Render</DialogClose>
      <Button variant="primary">Dobro</Button>
      <Button variant={a ? "secondary" : "outline"}>Dobro</Button>
      {/* <Button variant="default"> u komentaru se ne broji */}
    </>
  );
}`;
    expect(pravila(proveriDugmad("components/app/primer.tsx", tekst))).toEqual(["D2", "D2", "D3", "D3"]);
  });

  test("D2: spread prolazi samo sa izuzetkom koji ima razlog", () => {
    const tekst = `const x = <Button {...shared}>Pozovi</Button>;`;
    expect(proveriDugmad("components/app/drugi.tsx", tekst)).toHaveLength(1);
    expect(proveriDugmad("components/app/leadovi/lead-row-actions.tsx", tekst)).toHaveLength(0);
    for (const i of IZUZECI_SPREAD) expect(i.razlog.length).toBeGreaterThan(10);
  });

  test("D4: buttonVariants bez uloge ili sa `default` pada", () => {
    const tekst = `const a = buttonVariants({ size: "sm" });
const b = buttonVariants({ variant: "default" });
const c = buttonVariants({ variant: "outline", size: "sm" });`;
    expect(pravila(proveriDugmad("components/app/link.tsx", tekst))).toEqual(["D4", "D4"]);
  });

  test("D5: ručno obojeno primarno pada, osim aktivne pločice modula", () => {
    const tekst = `const a = "bg-primary text-primary-foreground hover:bg-primary/80";
const b = "bg-mod-strong text-text-inverse";
const c = "bg-success text-text-inverse";`;
    expect(pravila(proveriDugmad("components/app/x.tsx", tekst))).toEqual(["D5", "D5"]);
    expect(proveriDugmad("components/app/module-tile.tsx", `const b = "bg-mod-strong text-text-inverse";`)).toHaveLength(0);
  });

  test("D1: primitiv sa `default` ili podrazumevanom ulogom pada", () => {
    const los = `const buttonVariants = cva("x", {
  variants: { variant: { default: "a", primary: "b" }, size: { sm: "c" } },
  defaultVariants: { variant: "default", size: "sm" },
});`;
    const r = proveriPrimitiv("components/ui/button.tsx", los);
    expect(r.map((x) => x.pravilo)).toEqual(["D1", "D1"]);
    const dobar = `const buttonVariants = cva("x", {
  variants: { variant: { primary: "", secondary: "", outline: "", ghost: "", destructive: "", link: "" } },
  defaultVariants: { size: "default" },
});`;
    expect(proveriPrimitiv("components/ui/button.tsx", dobar)).toHaveLength(0);
  });

  test("D7: boja modula u shadcn sloju pada", () => {
    const los = `:root {
  --radnja: var(--accent-400);
  --primary: var(--radnja);
}
[data-module] {
  --mod-soft: x;
  --primary: var(--mod-strong);
  --ring: var(--mod);
}`;
    expect(proveriGlobals(los).map((x) => x.poruka)).toEqual([
      "[data-module] prepisuje --primary",
      "[data-module] prepisuje --ring",
    ]);
    const bezRadnje = `:root {\n  --primary: var(--accent-400);\n}\n[data-module] {\n  --mod-soft: x;\n}`;
    expect(proveriGlobals(bezRadnje)).toHaveLength(2);
  });

  test("D7: svaki blok modula i projekta se čita, ne samo prvi (T13)", () => {
    const koren = `:root {\n  --radnja: var(--accent-400);\n  --primary: var(--radnja);\n}\n`;
    const kasnije = `${koren}[data-module] {\n  --mod-soft: x;\n}
/* [data-module] { --primary: u komentaru se ne broji } */
[data-module="oglasi"] { --mod: var(--mod-oglasi); --primary: var(--mod-strong); }
@media (pointer: coarse) {
  [data-module] { --ring: var(--mod); }
}
[data-projekat] {\n  --focus-ring-strong: var(--projekat);\n}`;
    const nalazi = proveriGlobals(kasnije);
    expect(nalazi.map((x) => x.poruka)).toEqual([
      '[data-module="oglasi"] prepisuje --primary',
      "[data-module] prepisuje --ring",
      "[data-projekat] prepisuje --focus-ring-strong",
    ]);
    // Broj reda pokazuje na selektor, ne na komentar iznad.
    expect(nalazi[0].linija).toBe(9);
    expect(proveriGlobals(`${koren}[data-module="tabla"] { --mod: x; }`)).toHaveLength(0);
  });

  test("D6: boja modula se broji u stringovima, ne u komentarima", () => {
    const tekst = `// text-mod u komentaru
const a = "border-mod-line bg-mod-soft text-mod hover:text-mod";
const b = \`color-mix(in oklch, var(--mod) 10%, transparent)\`;
const c = "text-model data-module";`;
    expect(brojBojeModula("components/app/x.tsx", tekst)).toBe(5);
  });
});

describe("čuvar dugmadi — ceo kod", () => {
  const fajlovi = fajloviKoda(["components", "app"]).filter((f) => {
    const r = rel(f);
    return !r.startsWith("app/api/") && r !== "components/ui/button.tsx";
  });

  test("nijedno dugme bez uloge, sa `default` ili ručno obojeno", () => {
    const nalazi = fajlovi.flatMap((f) => proveriDugmad(rel(f), procitaj(f)));
    expect(nalazi).toEqual([]);
  });

  test("primitiv ima tačno šest uloga, a globals ne meša modul u radnju", () => {
    expect(proveriPrimitiv("components/ui/button.tsx", procitaj(join(KOREN, "components/ui/button.tsx")))).toEqual([]);
    expect(proveriGlobals(procitaj(join(KOREN, "app/globals.css")))).toEqual([]);
  });

  test("boja modula van tri mesta ne prelazi plafon", () => {
    const n = fajlovi
      .filter((f) => !bojaModulaDozvoljena(rel(f)))
      .reduce((s, f) => s + brojBojeModula(rel(f), procitaj(f)), 0);
    expect(n).toBeLessThanOrEqual(PLAFON_BOJE_MODULA);
  });
});
