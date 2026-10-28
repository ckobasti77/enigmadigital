/**
 * Čuvar tipografije (plan T08 §4.6, §6.4): pravila T1–T4 i M1–M3 na
 * primerima, pa nad celim kodom — nijedan tekst ispod 12 px, ni u osama
 * grafikona, i mono ne raste.
 */
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  MONO_U_SISTEMU,
  PLAFON_MONO,
  brojMono,
  brojiMono,
  proveriCss,
  proveriTipografiju,
} from "./tipografija-cuvar";
import { KOREN, fajloviKoda, procitaj, rel } from "./izvorni-kod.pomoc";

const pravila = (n: { pravilo: string }[]) => n.map((x) => x.pravilo).sort();

describe("čuvar tipografije — pravila na primerima", () => {
  test("T1: text-[11px] i text-[0.7rem] padaju; text-[0.8rem], text-[12px] i text-meta prolaze", () => {
    const tekst = `const a = "text-[11px] text-text-muted";
const b = cn("flex", ok && "md:text-[0.7rem]");
const c = "text-[0.8rem] text-[12px] text-meta";
// "text-[9px]" u komentaru se ne broji
/* className="text-[10px]" */`;
    expect(pravila(proveriTipografiju("components/app/x.tsx", tekst))).toEqual(["T1", "T1"]);
  });

  test("T2: fontSize ispod 12 pada (objekat, JSX, inline CSS); 12 prolazi", () => {
    const tekst = `const t = <XAxis tick={{ fill: "x", fontSize: 11 }} />;
const u = <YAxis tick={{ fontSize: 12 }} />;
const v = <text fontSize={10}>a</text>;
const w = <text fontSize="9">a</text>;
const s = { style: { fontSize: "10px" } };
const css = "font-size: 11px";`;
    expect(pravila(proveriTipografiju("components/app/g.tsx", tekst))).toEqual(["T2", "T2", "T2", "T2", "T2"]);
  });

  test("T3: <text> u izobličenom SVG-u pada, u običnom SVG-u prolazi", () => {
    const tekst = `export const A = () => (
  <>
    <svg viewBox="0 0 600 120" preserveAspectRatio="none"><g><text x={1}>10</text></g></svg>
    <svg viewBox="0 0 100 100"><text x={1} className="text-meta">10</text></svg>
  </>
);`;
    expect(pravila(proveriTipografiju("components/app/s.tsx", tekst))).toEqual(["T3"]);
  });

  test("T1/T2/T4 u CSS-u: korak skale ispod 0.75rem pada, komentar i pod-svojstva ne", () => {
    const css = `@theme {
  --text-sitno: 0.625rem;
  --text-meta: 0.75rem;
  --text-meta--letter-spacing: 0.01em;
  --text-primary: #f3f7ff;
  /* --text-staro: 0.6rem; */
}
.x { font-size: 10px; }
.y { font-size: 0.8125rem; }`;
    expect(pravila(proveriCss("app/globals.css", css))).toEqual(["T2", "T4"]);
  });

  test("M1/M2: mono uz fokus broj pada; mono u sistemu pada osim brojčane kolone", () => {
    const tekst = `const a = "font-mono text-metric font-bold";
const b = "font-mono text-ui text-text-muted";`;
    expect(pravila(proveriTipografiju("components/app/x.tsx", tekst))).toEqual(["M1"]);
    expect(pravila(proveriTipografiju("components/app/system/kpi-tile.tsx", tekst))).toEqual(["M1", "M2", "M2"]);
    expect(proveriTipografiju("components/app/system/data-table.tsx", `const n = "text-right font-mono tabular-nums";`)).toHaveLength(0);
    for (const i of MONO_U_SISTEMU) expect(i.razlog.length).toBeGreaterThan(10);
  });

  test("M3: brojanje mono u stringovima, ne u komentarima; tok prijave se ne broji", () => {
    const tekst = `const a = "font-mono"; const b = cn("x font-mono", c && "font-mono");
// font-mono u komentaru`;
    expect(brojMono("components/app/x.tsx", tekst)).toBe(3);
    expect(brojiMono("app/login/login-client.tsx")).toBe(false);
    expect(brojiMono("components/app/x.tsx")).toBe(true);
  });
});

describe("čuvar tipografije — ceo kod", () => {
  const fajlovi = fajloviKoda(["components", "app"]).filter((f) => !rel(f).startsWith("app/api/"));

  test("nijedan tekst ispod 12 px (klase, ose grafikona, SVG) i mono samo gde ima smisla", () => {
    const nalazi = fajlovi.flatMap((f) => proveriTipografiju(rel(f), procitaj(f)));
    nalazi.push(...proveriCss("app/globals.css", procitaj(join(KOREN, "app/globals.css"))));
    expect(nalazi.map((n) => `${n.putanja}:${n.linija} ${n.pravilo} ${n.poruka}`)).toEqual([]);
  });

  test("broj font-mono ne prelazi plafon", () => {
    const broj = fajlovi.reduce((s, f) => (brojiMono(rel(f)) ? s + brojMono(rel(f), procitaj(f)) : s), 0);
    expect(broj).toBeLessThanOrEqual(PLAFON_MONO);
  });
});
