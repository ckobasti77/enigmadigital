/**
 * (Primeri su razbijeni na delove gde bi Tailwind, koji skenira i `lib/`,
 * od njih napravio pravilo — npr. Radix varijantu ili pismo.)
 *
 * Čuvar dizajn sistema radnog dela (SPAJANJE S27): pravila PD1–PD8 na
 * primerima, pa na celom kodu — bez Radixa, zabranjenih paketa, sirovih boja,
 * boje modula, svetle teme, nadnaslova i kartice u kartici.
 */
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  proveriCssRadnogDela,
  proveriGlobalsTemu,
  proveriKod,
  proveriPakete,
  uRadnomDelu,
} from "./prostor-dizajn-cuvar";
import { KOREN, fajloviKoda, procitaj, rel } from "./izvorni-kod.pomoc";

const pravila = (n: { pravilo: string }[]) => n.map((x) => x.pravilo).sort();
const RADNI = "components/app/prostor/primer.tsx";
const ENIGMA = "components/app/leadovi/primer.tsx";

describe("čuvar dizajna radnog dela — pravila na primerima", () => {
  test("opseg: prostor, lib/prostor i ljuska „Ja“ su radni deo; Enigmini ekrani nisu", () => {
    expect(uRadnomDelu(RADNI)).toBe(true);
    expect(uRadnomDelu("lib/prostor/web/danas.ts")).toBe(true);
    expect(uRadnomDelu("components/app/meni-ja.tsx")).toBe(true);
    expect(uRadnomDelu(ENIGMA)).toBe(false);
    expect(uRadnomDelu("components/app/app-sidebar.tsx")).toBe(false);
  });

  test("PD1/PD2/PD5: Radix, zabranjeni paketi i zabranjeno pismo padaju svuda; komentar ne broji", () => {
    // Imena su sastavljena od delova, da grep po kodu ne nađe ovaj primer.
    const radix = "@radix" + "-ui";
    const animacija = "framer" + "-motion";
    const obavestenja = "son" + "ner";
    const pismo = "Gei" + "st";
    const stanje = "data-[st" + "ate=open]";
    const tekst = `import * as Dialog from "${radix}/react-dialog";
import { motion } from "${animacija}";
import { toast } from "${obavestenja}";
import { ThemeProvider } from "next-themes";
import { Sans } from "${pismo.toLowerCase()}/font/sans";
import { toast as t } from "@/lib/toast";
// import { x } from "${radix}/react-popover" — komentar
export function P() {
  return (
    <>
      <Trigger asChild><button /></Trigger>
      <div className="${stanje}:bg-muted" />
      <div style={{ fontFamily: "${pismo}" }} />
      {/* ${stanje} u komentaru se ne broji */}
    </>
  );
}`;
    expect(pravila(proveriKod(ENIGMA, tekst))).toEqual(["PD1", "PD1", "PD1", "PD2", "PD2", "PD2", "PD5", "PD5"]);
  });

  test("PD3: heks, rgb() i sirova paleta padaju u radnom delu, tokeni prolaze", () => {
    const tekst = `const a = "#58c4ff";
const b = "rgba(0, 0, 0, 0.4)";
const c = "bg-black text-white";
const d = "hover:bg-slate-800";
const e = "bg-surface-raised text-foreground border-line";
const f = "var(--chart-1)";
const g = "#opšte";
const h = "/zadaci#komentari";`;
    expect(pravila(proveriKod(RADNI, tekst))).toEqual(["PD3", "PD3", "PD3", "PD3"]);
    expect(proveriKod(ENIGMA, tekst)).toEqual([]);
  });

  test("PD4: boja modula ne ulazi u radni deo", () => {
    const tekst = `const a = "bg-mod-soft text-mod";\nconst b = "bg-radnja-soft";`;
    expect(pravila(proveriKod(RADNI, tekst))).toEqual(["PD4"]);
    expect(proveriKod(ENIGMA, tekst)).toEqual([]);
  });

  test("PD6/PD7: varijanta teme, sirov verzal i razmak slova padaju; heading-caps prolazi", () => {
    const tekst = `const a = "dark:text-warning";
const b = "text-meta uppercase tracking-wide";
const c = "tracking-[0.12em]";
const d = "heading-caps text-meta text-text-muted";
const e = "tracking-tight";`;
    expect(pravila(proveriKod(RADNI, tekst))).toEqual(["PD6", "PD7", "PD7", "PD7"]);
  });

  test("PD8: kartica u kartici pada, susedne kartice prolaze", () => {
    const tekst = `export function P() {
  return (
    <>
      <Card><CardContent><Card>Unutra</Card></CardContent></Card>
      <Card>Jedna</Card>
      <Card>Druga</Card>
    </>
  );
}`;
    expect(pravila(proveriKod(RADNI, tekst))).toEqual(["PD8"]);
  });

  test("CSS radnog dela: heks, rgb() i tema padaju; tokeni i komentari prolaze", () => {
    const css = `/* #fff u komentaru */
.a { color: var(--foreground); }
.b { background: #000; }
.c { box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2); }
@media (prefers-color-scheme: light) { .d { color: var(--foreground); } }`;
    expect(pravila(proveriCssRadnogDela("components/app/prostor/x.css", css))).toEqual(["PD3", "PD3", "PD6"]);
  });

  test("globals: `color-scheme: light` samo u `.on-light`; `html` mora biti tamno", () => {
    const dobro = `html {\n  color-scheme: dark;\n}\n.on-light {\n  --x: 1;\n  color-scheme: light;\n}`;
    expect(proveriGlobalsTemu("app/globals.css", dobro)).toEqual([]);
    const lose = `html {\n  color-scheme: light;\n}\n.dark .x { color: red; }\n@custom-variant dark (&:is(.dark *));`;
    expect(pravila(proveriGlobalsTemu("app/globals.css", lose))).toEqual(["PD6", "PD6", "PD6", "PD6"]);
  });

  test("package.json: Radix, biblioteka pokreta, paket za toast i next-themes padaju", () => {
    expect(
      pravila(
        proveriPakete({
          dependencies: { ["@radix" + "-ui/react-dialog"]: "1", ["son" + "ner"]: "1", "@base-ui/react": "1" },
          devDependencies: { ["framer" + "-motion"]: "1", "next-themes": "1" },
        }),
      ),
    ).toEqual(["PD1", "PD2", "PD2", "PD2"]);
  });
});

describe("čuvar dizajna radnog dela — ceo kod", () => {
  test("ceo front i radni deo prolaze PD1–PD8", () => {
    const fajlovi = fajloviKoda(["components", "app", "lib"]).filter((f) => {
      const r = rel(f);
      return !r.startsWith("app/api/") && !/-cuvar\.ts$/.test(r);
    });
    expect(fajlovi.filter((f) => uRadnomDelu(rel(f))).length).toBeGreaterThan(250);
    const nalazi = fajlovi.flatMap((f) => proveriKod(rel(f), procitaj(f)));
    nalazi.push(...proveriGlobalsTemu("app/globals.css", procitaj(join(KOREN, "app/globals.css"))));
    nalazi.push(...proveriPakete(JSON.parse(procitaj(join(KOREN, "package.json")))));
    expect(nalazi).toEqual([]);
  });
});
