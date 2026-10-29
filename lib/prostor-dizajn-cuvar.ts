/**
 * Čuvar dizajn sistema radnog dela (SPAJANJE S27, P2, P3, P11, P12).
 *
 *   PD1  bez Radixa: nema uvoza `@radix-ui/*`, Radix atributa stanja
 *        (`data-[state=…]`, `data-state=`) u klasama ni `asChild` na JSX-u.
 *   PD2  bez zabranjenih paketa: `@radix-ui/*`, `framer-motion`, `motion`,
 *        `sonner`, `next-themes`, `geist` (uvoz u kodu i zavisnost u
 *        `package.json`).
 *   PD3  radni deo bez sirovih boja: heks, `rgb()`/`hsl()`/`oklch()` i sirova
 *        Tailwind paleta (`bg-slate-800`, `text-white`, `bg-black`…) u kodu i
 *        u CSS-u radnog dela. Boja ide samo kroz tokene iz `app/globals.css`.
 *   PD4  radni deo bez boje modula (boja mesta je u ljusci: bočna traka,
 *        meni „Ja“, ikonica zaglavlja i aurora).
 *   PD5  bez pisma Geist (u kodu, rasporedu i `app/globals.css`).
 *   PD6  samo tamna tema: radni deo nema `dark:`/`light:` varijanti ni
 *        `prefers-color-scheme`; `app/globals.css` nema `.dark`/`.light`
 *        teme, `@custom-variant dark` ni `prefers-color-scheme`, `html` je
 *        `color-scheme: dark`, a `color-scheme: light` postoji samo u svetloj
 *        POVRŠINI `.on-light` (pregled objave i DM-a), ne kao tema.
 *   PD7  bez nadnaslova: u radnom delu verzal ide samo kroz `heading-caps`
 *        (natpis grupe); sirov `uppercase` i razmak slova (`tracking-wide*`,
 *        `tracking-[0.06em…]`) ne postoje.
 *   PD8  bez kartice u kartici: `<Card>` unutar `<Card>` u istom fajlu.
 *
 * Čiste funkcije nad tekstom (TypeScript AST za kod, tekst bez komentara za
 * CSS), pa ih test proverava na primerima, a `scripts/verify-prostor-dizajn.ts`
 * nad celim kodom. Komentar nikad nije nalaz.
 */
import ts from "typescript";

import { brojBojeModula } from "./dugmad-cuvar";

export type PraviloDizajna = "PD1" | "PD2" | "PD3" | "PD4" | "PD5" | "PD6" | "PD7" | "PD8";

export type NalazDizajna = {
  putanja: string;
  linija: number;
  pravilo: PraviloDizajna;
  poruka: string;
};

/**
 * Radni deo: komponente i čista logika prenete iz Devotiona i nova ljuska
 * „Ja“ koju je run dodao. Enigmini ekrani imaju svoje čuvare (`verify:ultra-*`).
 */
export const RADNI_DEO_FASCIKLE = ["components/app/prostor/", "lib/prostor/"] as const;
export const RADNI_DEO_FAJLOVI = [
  "components/app/meni-ja.tsx",
  "components/app/traka-projekata.tsx",
  "components/app/zvono-ja.tsx",
  "components/app/ja-link.tsx",
  "components/app/opseg-ljuske.tsx",
  "components/app/toaster.tsx",
] as const;

export const uRadnomDelu = (putanja: string): boolean =>
  RADNI_DEO_FASCIKLE.some((p) => putanja.startsWith(p)) ||
  (RADNI_DEO_FAJLOVI as readonly string[]).includes(putanja);

/** Paketi koji ne ulaze u spojenu aplikaciju (P10, P11, P12, P2). */
const ZABRANJENI_PAKETI = /^(?:@radix-ui\/|framer-motion$|motion$|motion\/|sonner$|next-themes$|geist$|geist\/)/;

const RADIX_STANJE = /data-\[state[=\]]|data-state=/;
const HEKS = /(?:^|[\s"'`(:,=])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])/;
const BOJA_FUNKCIJA = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/;
const SIROVA_PALETA =
  /(?:^|[\s"'`:])(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|decoration|divide|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?(?![\w-])|(?:^|[\s"'`:])(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|divide)-(?:white|black)(?:\/\d+)?(?![\w-])/;
const TEMA_VARIJANTA = /(?:^|[\s"'`])(?:[a-z-]+:)*(?:dark|light):[a-z[]/;
const SIROV_VERZAL = /(?:^|[\s"'`])(?:[a-z-]+:)*uppercase(?![\w-])/;
const RAZMAK_SLOVA = /(?:^|[\s"'`])(?:[a-z-]+:)*tracking-(?:wide|wider|widest|\[0?\.(?:0[6-9]|[1-9]\d?)\d*em\])(?![\w-])/;

function izvor(putanja: string, tekst: string): ts.SourceFile {
  return ts.createSourceFile(
    putanja,
    tekst,
    ts.ScriptTarget.Latest,
    true,
    putanja.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

const linijaOd = (sf: ts.SourceFile, c: ts.Node) => sf.getLineAndCharacterOfPosition(c.getStart(sf)).line + 1;

function obidji(sf: ts.SourceFile, posetilac: (c: ts.Node) => void): void {
  const korak = (c: ts.Node) => {
    posetilac(c);
    ts.forEachChild(c, korak);
  };
  korak(sf);
}

const jeString = (c: ts.Node): c is ts.StringLiteralLike | ts.TemplateLiteralLikeNode =>
  ts.isStringLiteral(c) ||
  ts.isNoSubstitutionTemplateLiteral(c) ||
  ts.isTemplateHead(c) ||
  ts.isTemplateMiddle(c) ||
  ts.isTemplateTail(c);

const imeEtikete = (c: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf: ts.SourceFile) => c.tagName.getText(sf);

/** PD1–PD8 nad jednim fajlom koda (`.ts`/`.tsx`). */
export function proveriKod(putanja: string, tekst: string): NalazDizajna[] {
  const sf = izvor(putanja, tekst);
  const nalazi: NalazDizajna[] = [];
  const dodaj = (c: ts.Node, pravilo: PraviloDizajna, poruka: string) =>
    nalazi.push({ putanja, linija: linijaOd(sf, c), pravilo, poruka });
  const radni = uRadnomDelu(putanja);

  obidji(sf, (c) => {
    // Uvozi i dinamički uvozi.
    if ((ts.isImportDeclaration(c) || ts.isExportDeclaration(c)) && c.moduleSpecifier && ts.isStringLiteral(c.moduleSpecifier)) {
      const paket = c.moduleSpecifier.text;
      if (paket.startsWith("@radix-ui/")) dodaj(c, "PD1", `uvoz ${paket}`);
      else if (ZABRANJENI_PAKETI.test(paket)) dodaj(c, /geist/.test(paket) ? "PD5" : "PD2", `uvoz ${paket}`);
    }
    if (ts.isCallExpression(c) && c.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = c.arguments[0];
      if (arg && ts.isStringLiteral(arg) && ZABRANJENI_PAKETI.test(arg.text)) dodaj(c, "PD2", `uvoz ${arg.text}`);
    }
    // `asChild` je Radix API (Base UI: `render`).
    if (ts.isJsxAttribute(c) && c.name.getText(sf) === "asChild") dodaj(c, "PD1", "`asChild` (Base UI koristi `render`)");
    // Kartica u kartici.
    if ((ts.isJsxOpeningElement(c) || ts.isJsxSelfClosingElement(c)) && imeEtikete(c, sf) === "Card") {
      for (let p: ts.Node | undefined = c.parent?.parent; p; p = p.parent) {
        if (ts.isJsxElement(p) && imeEtikete(p.openingElement, sf) === "Card") {
          dodaj(c, "PD8", "`<Card>` unutar `<Card>`");
          break;
        }
      }
    }
    if (!jeString(c)) return;
    // Ime paketa u uvozu je već provereno gore.
    const roditelj = c.parent;
    if (
      ts.isImportDeclaration(roditelj) ||
      ts.isExportDeclaration(roditelj) ||
      (ts.isCallExpression(roditelj) && roditelj.expression.kind === ts.SyntaxKind.ImportKeyword)
    ) {
      return;
    }
    const s = c.text;
    if (RADIX_STANJE.test(s)) dodaj(c, "PD1", "Radix atribut stanja (Base UI: `data-open`, `data-active`, `aria-*`)");
    if (/geist/i.test(s)) dodaj(c, "PD5", "pismo Geist");
    if (!radni) return;
    if (HEKS.test(s)) dodaj(c, "PD3", `heks boja: "${s.trim().slice(0, 60)}"`);
    if (BOJA_FUNKCIJA.test(s)) dodaj(c, "PD3", `boja mimo tokena: "${s.trim().slice(0, 60)}"`);
    if (SIROVA_PALETA.test(s)) dodaj(c, "PD3", `sirova Tailwind paleta: "${s.trim().slice(0, 60)}"`);
    if (TEMA_VARIJANTA.test(s) || /prefers-color-scheme/.test(s)) dodaj(c, "PD6", `varijanta teme: "${s.trim().slice(0, 60)}"`);
    if (SIROV_VERZAL.test(s)) dodaj(c, "PD7", `sirov \`uppercase\` (natpis grupe je \`heading-caps\`): "${s.trim().slice(0, 60)}"`);
    if (RAZMAK_SLOVA.test(s)) dodaj(c, "PD7", `razmak slova nadnaslova: "${s.trim().slice(0, 60)}"`);
  });

  if (radni) {
    const mod = brojBojeModula(putanja, tekst);
    if (mod > 0) nalazi.push({ putanja, linija: 1, pravilo: "PD4", poruka: `boja modula u radnom delu: ${mod}` });
  }
  return nalazi;
}

/** CSS bez komentara, sa očuvanim brojem linija. */
const bezKomentara = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (k) => k.replace(/[^\n]/g, " "));

/** PD3, PD5 i PD6 nad CSS fajlom radnog dela. */
export function proveriCssRadnogDela(putanja: string, css: string): NalazDizajna[] {
  const nalazi: NalazDizajna[] = [];
  bezKomentara(css)
    .split("\n")
    .forEach((red, i) => {
      const dodaj = (pravilo: PraviloDizajna, poruka: string) => nalazi.push({ putanja, linija: i + 1, pravilo, poruka });
      if (HEKS.test(red)) dodaj("PD3", `heks boja: ${red.trim()}`);
      if (BOJA_FUNKCIJA.test(red)) dodaj("PD3", `boja mimo tokena: ${red.trim()}`);
      if (/geist/i.test(red)) dodaj("PD5", `pismo Geist: ${red.trim()}`);
      if (/prefers-color-scheme|color-scheme:\s*light|(?:^|[\s,])\.(?:dark|light)\b/.test(red)) dodaj("PD6", `tema: ${red.trim()}`);
    });
  return nalazi;
}

/** PD5 i PD6 nad `app/globals.css`. */
export function proveriGlobalsTemu(putanja: string, css: string): NalazDizajna[] {
  const nalazi: NalazDizajna[] = [];
  const cist = bezKomentara(css);
  const redovi = cist.split("\n");
  // Dubina zagrada i ime bloka `.on-light`, da se `color-scheme: light` dozvoli samo tamo.
  let dubina = 0;
  let onLightDubina = -1;
  let htmlTamno = false;
  let uHtml = -1;
  redovi.forEach((red, i) => {
    const dodaj = (pravilo: PraviloDizajna, poruka: string) => nalazi.push({ putanja, linija: i + 1, pravilo, poruka });
    if (/geist/i.test(red)) dodaj("PD5", `pismo Geist: ${red.trim()}`);
    if (/prefers-color-scheme/.test(red)) dodaj("PD6", `prefers-color-scheme: ${red.trim()}`);
    if (/@custom-variant\s+(?:dark|light)/.test(red)) dodaj("PD6", `varijanta teme: ${red.trim()}`);
    if (/(?:^|[\s,>+~])\.(?:dark|light)(?![\w-])/.test(red)) dodaj("PD6", `klasa teme: ${red.trim()}`);
    const otvara = (red.match(/\{/g) ?? []).length;
    const zatvara = (red.match(/\}/g) ?? []).length;
    if (/(?:^|[\s,])\.on-light\s*\{/.test(red)) onLightDubina = dubina + 1;
    if (/(?:^|\s)html\s*\{/.test(red)) uHtml = dubina + 1;
    if (/color-scheme:\s*light/.test(red) && !(onLightDubina > 0 && dubina >= onLightDubina)) {
      dodaj("PD6", "`color-scheme: light` van svetle površine `.on-light`");
    }
    if (uHtml > 0 && dubina >= uHtml && /color-scheme:\s*dark/.test(red)) htmlTamno = true;
    dubina += otvara - zatvara;
    if (onLightDubina > 0 && dubina < onLightDubina) onLightDubina = -1;
    if (uHtml > 0 && dubina < uHtml) uHtml = -1;
  });
  if (!htmlTamno) nalazi.push({ putanja, linija: 1, pravilo: "PD6", poruka: "`html` nema `color-scheme: dark`" });
  return nalazi;
}

/** PD1, PD2 i PD5 nad `package.json`: zavisnosti koje ne ulaze u aplikaciju. */
export function proveriPakete(paket: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): NalazDizajna[] {
  const nalazi: NalazDizajna[] = [];
  for (const ime of [...Object.keys(paket.dependencies ?? {}), ...Object.keys(paket.devDependencies ?? {})]) {
    if (ime.startsWith("@radix-ui/")) nalazi.push({ putanja: "package.json", linija: 1, pravilo: "PD1", poruka: `zavisnost ${ime}` });
    else if (ZABRANJENI_PAKETI.test(ime)) {
      nalazi.push({ putanja: "package.json", linija: 1, pravilo: /geist/.test(ime) ? "PD5" : "PD2", poruka: `zavisnost ${ime}` });
    }
  }
  return nalazi;
}
