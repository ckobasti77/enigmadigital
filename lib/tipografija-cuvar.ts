/**
 * Čuvar tipografije i mono pisma (ULTRA P2; plan T08 §4.6 i §6.4).
 *
 *   T1  klasa `text-[N(px|rem|em)]` ispod 12 px (rem i em × 16).
 *   T2  `fontSize: N`, `fontSize={N}`, `font-size: Npx` ili `font-size="N"`
 *       ispod 12 (i u `.css`).
 *   T3  `<text>` ili `<tspan>` u `<svg preserveAspectRatio="none">`: viewBox
 *       se po širini sabija, pa tekst na telefonu pada ispod 12 px i razvlači se.
 *   T4  `app/globals.css`: korak skale `--text-<ime>: Nrem` ispod 0.75rem.
 *   M1  `font-mono` u istoj listi klasa sa fokus/naslovnom veličinom.
 *   M2  `font-mono` u `components/app/system/**` (osim brojčane kolone tabele).
 *   M3  broj `font-mono` u kodu ne raste iznad plafona (proverava skripta).
 *
 * Čiste funkcije nad tekstom fajla (TypeScript AST), pa ih test proverava na
 * primerima, a `scripts/verify-ultra-tipografija.ts` nad celim kodom.
 * Komentar nikad nije nalaz.
 */
import ts from "typescript";

export type NalazTipografije = {
  putanja: string;
  linija: number;
  pravilo: "T1" | "T2" | "T3" | "T4" | "M1" | "M2" | "M3";
  poruka: string;
};

export type Izuzetak = { fajl: string; sadrzi: string; razlog: string };

/** Najmanja veličina teksta u px (DESIGN.md: skala 12 / 13 / 15 / 20 / 28 / 40). */
export const NAJMANJE_PX = 12;

/**
 * Plafon `font-mono` u `components/` i `app/` (bez pravnih strana, prijave i
 * fikstura). Upisan u T10 posle prelaska na P2: ostaju brojčane kolone
 * tabela, ID/kod/token/URL/telefon i `<code>`/`<kbd>`. Broj sme samo da pada.
 */
export const PLAFON_MONO = 254; // T13: stvaran broj posle T11–T12 (bilo 269)

/** Mono je dozvoljen u sistemu samo ovde (brojčana kolona `DataTable`). */
export const MONO_U_SISTEMU: readonly Izuzetak[] = [
  {
    fajl: "components/app/system/data-table.tsx",
    sadrzi: "font-mono",
    razlog: "brojčana kolona tabele (`numeric`) ostaje mono, da se cifre poravnaju",
  },
];

/** Putanje koje M3 ne broji: pravne strane i tok prijave se u ovom runu ne diraju. */
export const VAN_BROJA_MONO = [
  "app/cookies/",
  "app/privacy/",
  "app/deletion-status/",
  "app/login/",
  "app/pozivnica/",
] as const;

const VELIKE = /(?:^|\s)(?:[\w-]*(?:\[[^\]\s]*\])?:)*text-(?:hero|metric|title|display|2xl|3xl|xl|lg)(?=\s|$)/;
const MONO = /(?:^|\s)(?:[\w-]*(?:\[[^\]\s]*\])?:)*font-mono(?=\s|$)/g;
const ARBITRARNA = /(?:^|[\s"'`])(?:[\w-]*(?:\[[^\]\s]*\])?:)*text-\[(\d*\.?\d+)(px|rem|em)\]/g;

function izvor(putanja: string, tekst: string): ts.SourceFile {
  return ts.createSourceFile(
    putanja,
    tekst,
    ts.ScriptTarget.Latest,
    true,
    putanja.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function obidji(sf: ts.SourceFile, posetilac: (c: ts.Node) => void): void {
  const korak = (c: ts.Node) => {
    posetilac(c);
    ts.forEachChild(c, korak);
  };
  korak(sf);
}

const linija = (sf: ts.SourceFile, c: ts.Node) =>
  sf.getLineAndCharacterOfPosition(c.getStart(sf)).line + 1;

const uPx = (n: number, jedinica: string) => (jedinica === "px" ? n : n * 16);

/** Veličina iz `10px`, `0.6rem`, `11` (bez jedinice = px). */
function velicinaPx(vrednost: string): number | null {
  const m = /^\s*(\d*\.?\d+)\s*(px|rem|em)?\s*$/.exec(vrednost);
  if (!m) return null;
  return uPx(Number(m[1]), m[2] ?? "px");
}

/** T1 nad jednim nizom klasa ili CSS tekstom. */
function arbitrarneVelicine(tekst: string): string[] {
  const out: string[] = [];
  for (const m of tekst.matchAll(ARBITRARNA)) {
    if (uPx(Number(m[1]), m[2]) < NAJMANJE_PX) out.push(`text-[${m[1]}${m[2]}]`);
  }
  return out;
}

/** T2 u CSS deklaracijama (`font-size: 10px`). */
function cssVelicine(tekst: string): string[] {
  const out: string[] = [];
  for (const m of tekst.matchAll(/font-size\s*:\s*(\d*\.?\d+)(px|rem|em)\b/g)) {
    if (uPx(Number(m[1]), m[2]) < NAJMANJE_PX) out.push(m[0]);
  }
  return out;
}

const bezKomentaraCss = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (k) => k.replace(/[^\n]/g, " "));

/** T1–T3, M1 i M2 nad jednim fajlom koda (`.ts`/`.tsx`). */
export function proveriTipografiju(putanja: string, tekst: string): NalazTipografije[] {
  const sf = izvor(putanja, tekst);
  const nalazi: NalazTipografije[] = [];
  const dodaj = (c: ts.Node, pravilo: NalazTipografije["pravilo"], poruka: string) =>
    nalazi.push({ putanja, linija: linija(sf, c), pravilo, poruka });

  const uSistemu = putanja.startsWith("components/app/system/");
  // Tok prijave i pravne strane se ne menjaju (pravila runa); polje koda za
  // prijavu je ionako kod (P2 b).
  const monoVanPravila = !brojiMono(putanja);
  const monoDozvoljen = MONO_U_SISTEMU.some((i) => i.fajl === putanja);

  obidji(sf, (c) => {
    // Stringovi: liste klasa (className, cn, cva, mape klasa) i inline CSS.
    if (
      ts.isStringLiteral(c) ||
      ts.isNoSubstitutionTemplateLiteral(c) ||
      ts.isTemplateHead(c) ||
      ts.isTemplateMiddle(c) ||
      ts.isTemplateTail(c)
    ) {
      const s = c.text;
      for (const k of arbitrarneVelicine(s)) dodaj(c, "T1", `${k} je ispod ${NAJMANJE_PX} px`);
      for (const k of cssVelicine(s)) dodaj(c, "T2", `${k} je ispod ${NAJMANJE_PX} px`);
      if (!monoVanPravila && MONO.test(s)) {
        MONO.lastIndex = 0;
        if (VELIKE.test(s)) dodaj(c, "M1", `font-mono uz fokus/naslovnu veličinu: "${s.trim().slice(0, 80)}"`);
        if (uSistemu && !monoDozvoljen) dodaj(c, "M2", "font-mono u sistemskoj komponenti");
      }
      MONO.lastIndex = 0;
      return;
    }

    // `fontSize: 11` / `fontSize: "11px"` u objektu (Recharts `tick`, `style`).
    if (ts.isPropertyAssignment(c) && (ts.isIdentifier(c.name) || ts.isStringLiteral(c.name))) {
      const ime = c.name.text;
      if (ime === "fontSize" || ime === "font-size") {
        const v = c.initializer;
        const px =
          ts.isNumericLiteral(v) ? Number(v.text) : ts.isStringLiteralLike(v) ? velicinaPx(v.text) : null;
        if (px !== null && px < NAJMANJE_PX) dodaj(c, "T2", `${ime}: ${v.getText(sf)} je ispod ${NAJMANJE_PX} px`);
      }
      return;
    }

    // `fontSize={11}` / `fontSize="11"` / `font-size="11"` na JSX elementu (SVG).
    if (ts.isJsxAttribute(c)) {
      const ime = c.name.getText(sf);
      if ((ime === "fontSize" || ime === "font-size") && c.initializer) {
        const init = c.initializer;
        let px: number | null = null;
        if (ts.isStringLiteral(init)) px = velicinaPx(init.text);
        else if (ts.isJsxExpression(init) && init.expression) {
          const e = init.expression;
          px = ts.isNumericLiteral(e) ? Number(e.text) : ts.isStringLiteralLike(e) ? velicinaPx(e.text) : null;
        }
        if (px !== null && px < NAJMANJE_PX) dodaj(c, "T2", `${ime} je ${px} px, ispod ${NAJMANJE_PX}`);
      }
      return;
    }

    // T3: tekst u izobličenom SVG-u.
    if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) {
      const otvarac = ts.isJsxElement(c) ? c.openingElement : c;
      const tag = otvarac.tagName.getText(sf);
      if (tag === "text" || tag === "tspan") {
        let p: ts.Node | undefined = c.parent;
        while (p) {
          if (ts.isJsxElement(p) && p.openingElement.tagName.getText(sf) === "svg") {
            const par = p.openingElement.attributes.properties.find(
              (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "preserveAspectRatio",
            );
            if (par && ts.isJsxAttribute(par) && par.initializer && /"none"|'none'/.test(par.initializer.getText(sf))) {
              dodaj(c, "T3", `<${tag}> u <svg preserveAspectRatio="none"> se na telefonu sabija ispod 12 px`);
            }
            break;
          }
          p = p.parent;
        }
      }
    }
  });
  return nalazi;
}

/** T1, T2 i T4 nad `app/globals.css` (i drugim CSS fajlovima, bez T4). */
export function proveriCss(putanja: string, css: string): NalazTipografije[] {
  const nalazi: NalazTipografije[] = [];
  const redovi = bezKomentaraCss(css.replace(/\r\n/g, "\n")).split("\n");
  redovi.forEach((red, i) => {
    for (const k of arbitrarneVelicine(red)) {
      nalazi.push({ putanja, linija: i + 1, pravilo: "T1", poruka: `${k} je ispod ${NAJMANJE_PX} px` });
    }
    for (const k of cssVelicine(red)) {
      nalazi.push({ putanja, linija: i + 1, pravilo: "T2", poruka: `${k} je ispod ${NAJMANJE_PX} px` });
    }
    const m = /^\s*--text-([a-z0-9]+(?:-[a-z0-9]+)*)\s*:\s*(\d*\.?\d+)rem\s*;/.exec(red);
    if (m && !m[1].includes("--") && Number(m[2]) < 0.75) {
      nalazi.push({
        putanja,
        linija: i + 1,
        pravilo: "T4",
        poruka: `--text-${m[1]}: ${m[2]}rem je ispod 0.75rem (12 px)`,
      });
    }
  });
  return nalazi;
}

/** Broj `font-mono` u stringovima koda (komentari se ne broje). */
export function brojMono(putanja: string, tekst: string): number {
  const sf = izvor(putanja, tekst);
  let n = 0;
  obidji(sf, (c) => {
    if (
      ts.isStringLiteral(c) ||
      ts.isNoSubstitutionTemplateLiteral(c) ||
      ts.isTemplateHead(c) ||
      ts.isTemplateMiddle(c) ||
      ts.isTemplateTail(c)
    ) {
      n += c.text.match(MONO)?.length ?? 0;
      MONO.lastIndex = 0;
    }
  });
  return n;
}

/** Da li M3 broji ovaj fajl. */
export const brojiMono = (putanja: string): boolean =>
  !VAN_BROJA_MONO.some((p) => putanja.startsWith(p));
