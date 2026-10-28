/**
 * Čuvar izbora i formata (plan T08 §7.4 i §8.4): F1–F5 na primerima, pa nad
 * celim kodom — nema izvornog `<select>`, svaki `<Select>` ima ime, nema
 * rasutog formatiranja.
 */
import { describe, expect, test } from "vitest";

import { IZUZECI, proveriFormat, uOpsegu, type Izuzetak } from "./format-cuvar";
import { fajloviKoda, procitaj, rel } from "./izvorni-kod.pomoc";

const pravila = (n: { pravilo: string }[]) => n.map((x) => x.pravilo).sort();
const EKRAN = "components/app/x.tsx";

describe("čuvar formata — pravila na primerima", () => {
  test("F1: izvorni <select> pada, Select iz primitiva prolazi, komentar se ne broji", () => {
    const tekst = `export const A = () => (
  <>
    <select value="a"><option>a</option></select>
    <Select label="Period" value="a" onValueChange={f} options={[]} />
    {/* <select> u komentaru */}
  </>
);
// <select> i ovde`;
    expect(pravila(proveriFormat(EKRAN, tekst))).toEqual(["F1"]);
  });

  test("F2: Select bez imena i sa praznim imenom pada, sa imenom prolazi", () => {
    const tekst = `export const A = () => (
  <>
    <Select value="a" onValueChange={f} options={[]} />
    <Select label="" value="a" onValueChange={f} options={[]} />
    <Select label={""} value="a" onValueChange={f} options={[]} />
    <Select label="Period" value="a" onValueChange={f} options={[]} />
    <Select label={\`Objava \${n}\`} value="a" onValueChange={f} options={[]} />
  </>
);`;
    expect(pravila(proveriFormat(EKRAN, tekst))).toEqual(["F2", "F2", "F2"]);
  });

  test("F3: toLocale*String i Intl.* padaju u kodu ekrana; DisplayNames i lib prolaze", () => {
    const tekst = `const a = new Date().toLocaleDateString("sr");
const b = x.toLocaleString();
const c = new Intl.DateTimeFormat("sr");
const d = new Intl.NumberFormat("sr");
const e = new Intl.DisplayNames(["sr"], { type: "region" });
// new Date().toLocaleString() u komentaru`;
    expect(pravila(proveriFormat(EKRAN, tekst))).toEqual(["F3", "F3", "F3", "F3"]);
    expect(proveriFormat("lib/format.ts", tekst)).toHaveLength(0);
    expect(proveriFormat("convex/lib/formatJezgro.ts", tekst)).toHaveLength(0);
    expect(proveriFormat("app/dev-ux/x.tsx", tekst)).toHaveLength(4);
  });

  test("F4: .toFixed u detetu JSX-a, šablonu i atributu teksta pada; style, d i širina prolaze", () => {
    const tekst = `export const A = () => (
  <>
    <p>{x.toFixed(1)}</p>
    <p>{\`\${x.toFixed(1)} s\`}</p>
    <p title={\`\${x.toFixed(2)}\`}>a</p>
    <p aria-label={x.toFixed(1) + " s"}>a</p>
    <path d={\`M \${x.toFixed(1)} 0\`} />
    <div style={{ width: \`\${x.toFixed(1)}%\` }} />
    <rect x={x.toFixed(2)} width={w.toFixed(2)} />
  </>
);
const s = x.toFixed(1);`;
    expect(pravila(proveriFormat(EKRAN, tekst))).toEqual(["F4", "F4", "F4", "F4"]);
  });

  test("F5: {x}% pada, {x} % i formatPercent prolaze", () => {
    const tekst = `export const A = () => (
  <>
    <span>{x}%</span>
    <span>{x} %</span>
    <span>{formatPercent(x)}</span>
    <span>100% sigurno</span>
  </>
);`;
    expect(pravila(proveriFormat(EKRAN, tekst))).toEqual(["F5"]);
  });

  test("izuzetak važi u svom fajlu i samo uz traženi red", () => {
    const tekst = `const a = new Date().toLocaleDateString("sr");`;
    const izuzeci: Izuzetak[] = [
      { fajl: EKRAN, sadrzi: "toLocaleDateString", razlog: "primer" },
    ];
    expect(proveriFormat(EKRAN, tekst, izuzeci)).toHaveLength(0);
    expect(proveriFormat("components/app/y.tsx", tekst, izuzeci)).toHaveLength(1);
  });

  test("svaki upisan izuzetak ima razlog", () => {
    for (const i of IZUZECI) expect(i.razlog.trim().length).toBeGreaterThan(10);
  });
});

describe("čuvar formata — ceo kod", () => {
  const fajlovi = fajloviKoda(["components", "app"]).filter((f) => uOpsegu(rel(f)));

  test("nema nalaza F1–F5", () => {
    const nalazi = fajlovi.flatMap((f) => proveriFormat(rel(f), procitaj(f)));
    expect(
      nalazi.map((n) => `${n.putanja}:${n.linija} ${n.pravilo}`),
    ).toEqual([]);
  });
});
