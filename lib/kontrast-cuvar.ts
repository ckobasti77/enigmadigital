/**
 * Čuvar kontrasta teksta (ULTRA, plan T08 §5.6).
 *
 *   K1  `node scripts/contrast-check.mjs --strogo` nema nijedan par ispod praga
 *       (čita se red „Pada: N od M").
 *   K2  nema providnosti na tekstu: klasa `(varijanta:)*text-<token>/<N>`,
 *       osim tokena koji se crtaju kao potez (linije, grafikoni) i para
 *       veličina/prored (`text-sm/6`).
 *   K3  nema gole `opacity-<1…99>` (bez prefiksa varijante) na tekstu. Ne broji
 *       se: onemogućeno (`cursor-not-allowed`, `pointer-events-none`),
 *       `animate-ping`, sloj `absolute inset-0` preko slike, lucide ikonica i
 *       izuzeci sa razlogom.
 *   K4  nema sirove Tailwind palete na tekstu (`text-white`, `text-slate-400`…).
 *
 * Čiste funkcije nad tekstom fajla (TypeScript AST); test ih proverava na
 * primerima, `scripts/verify-ultra-kontrast.ts` nad celim kodom. Komentar
 * nikad nije nalaz.
 */
import ts from "typescript";

export type NalazKontrasta = {
  putanja: string;
  linija: number;
  pravilo: "K1" | "K2" | "K3" | "K4";
  poruka: string;
};

export type Izuzetak = { fajl: string; sadrzi: string; razlog: string };

/** Tokeni koji se crtaju kao potez ili površina grafike, ne kao tekst (K2). */
export const TOKENI_POTEZA = new Set([
  "line",
  "line-soft",
  "line-strong",
  "line-control",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-grid",
]);

/** Koraci skale: `text-sm/6` je veličina sa proredom, ne providnost (K2). */
const VELICINE = new Set([
  "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl",
  "meta", "ui", "copy", "title", "metric", "hero", "display",
  "h1", "h2", "body", "small", "micro",
]);

/** `opacity-*` sa razlogom: grafike koje naglašavaju traku na hover (K3). */
export const IZUZECI_OPACITY: readonly Izuzetak[] = [
  {
    fajl: "components/app/instagram/population-pyramid-chart.tsx",
    sadrzi: "opacity-90 hover:opacity-100",
    razlog: "traka piramide (grafika, ne tekst) se naglašava na hover",
  },
  {
    fajl: "components/app/instagram/post-detail/post-profile-actions.tsx",
    sadrzi: "opacity-90 hover:opacity-100",
    razlog: "traka grafikona radnji na profilu se naglašava na hover",
  },
  {
    fajl: "components/app/instagram/post-detail/post-story-funnel.tsx",
    sadrzi: "opacity-",
    razlog: "trake levka priče: ostale se prigušuju dok je jedna pod kursorom",
  },
];

const PROVIDNOST_TEKSTA =
  /(?:^|[\s"'`])(?:[\w-]*(?:\[[^\]\s]*\])?:)*text-([a-z][a-z0-9-]*)\/(\d+|\[[^\]\s]+\])(?=[\s"'`]|$)/g;
const GOLA_OPACITY = /(?:^|\s)opacity-([1-9]\d?)(?=\s|$)/;
const SIROVA_PALETA =
  /(?:^|[\s"'`])(?:[\w-]*(?:\[[^\]\s]*\])?:)*text-(white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?:\/\d+)?(?=[\s"'`]|$)/;
const DOZVOLJENA_OPACITY = /(?:^|\s)(?:cursor-not-allowed|pointer-events-none|animate-ping)(?=\s|$)|absolute inset-0/;

function izvor(putanja: string, tekst: string): ts.SourceFile {
  return ts.createSourceFile(
    putanja,
    tekst,
    ts.ScriptTarget.Latest,
    true,
    putanja.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

const linija = (sf: ts.SourceFile, c: ts.Node) =>
  sf.getLineAndCharacterOfPosition(c.getStart(sf)).line + 1;

/** Imena uvezena iz `lucide-react` (ikonice). */
function lucideImena(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const s of sf.statements) {
    if (
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === "lucide-react" &&
      s.importClause?.namedBindings &&
      ts.isNamedImports(s.importClause.namedBindings)
    ) {
      for (const e of s.importClause.namedBindings.elements) out.add(e.name.text);
    }
  }
  return out;
}

/** Ime JSX elementa čiji `className` sadrži dati čvor (ili null). */
function elementKlase(sf: ts.SourceFile, c: ts.Node): string | null {
  let p: ts.Node | undefined = c.parent;
  while (p) {
    if (ts.isJsxAttribute(p)) {
      if (p.name.getText(sf) !== "className") return null;
      const el = p.parent.parent; // JsxAttributes → otvarač
      if (ts.isJsxOpeningElement(el) || ts.isJsxSelfClosingElement(el)) return el.tagName.getText(sf);
      return null;
    }
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isSourceFile(p)) return null;
    p = p.parent;
  }
  return null;
}

/** K2–K4 nad jednim fajlom koda. */
export function proveriKontrast(
  putanja: string,
  tekst: string,
  izuzeci: readonly Izuzetak[] = IZUZECI_OPACITY,
): NalazKontrasta[] {
  const sf = izvor(putanja, tekst);
  const ikonice = lucideImena(sf);
  const nalazi: NalazKontrasta[] = [];
  const korak = (c: ts.Node) => {
    if (
      ts.isStringLiteral(c) ||
      ts.isNoSubstitutionTemplateLiteral(c) ||
      ts.isTemplateHead(c) ||
      ts.isTemplateMiddle(c) ||
      ts.isTemplateTail(c)
    ) {
      const s = c.text;
      const red = linija(sf, c);
      for (const m of s.matchAll(PROVIDNOST_TEKSTA)) {
        if (TOKENI_POTEZA.has(m[1]) || VELICINE.has(m[1])) continue;
        nalazi.push({ putanja, linija: red, pravilo: "K2", poruka: `text-${m[1]}/${m[2]}: providnost na tekstu` });
      }
      const op = GOLA_OPACITY.exec(s);
      if (op && !DOZVOLJENA_OPACITY.test(s)) {
        const el = elementKlase(sf, c);
        const ikonica = el !== null && ikonice.has(el);
        const izuzet = izuzeci.some((i) => i.fajl === putanja && s.includes(i.sadrzi));
        if (!ikonica && !izuzet) {
          nalazi.push({ putanja, linija: red, pravilo: "K3", poruka: `opacity-${op[1]} na tekstu` });
        }
      }
      const pal = SIROVA_PALETA.exec(s);
      if (pal) nalazi.push({ putanja, linija: red, pravilo: "K4", poruka: `text-${pal[1]}: sirova paleta na tekstu` });
    }
    ts.forEachChild(c, korak);
  };
  korak(sf);
  return nalazi;
}

/** K1: čita zbir iz izlaza `contrast-check` („Pada: N od M"). */
/** Izuzeci K3 bez obrazloženja (kraćeg od 10 znakova); provera ih obara. */
export function izuzeciBezRazloga(
  izuzeci: readonly Izuzetak[] = IZUZECI_OPACITY,
): Izuzetak[] {
  return izuzeci.filter((i) => i.razlog.trim().length < 10);
}

export function procitajKontrast(izlaz: string): { pada: number; ukupno: number } | null {
  const m = /Pada: (\d+) od (\d+)/.exec(izlaz);
  return m ? { pada: Number(m[1]), ukupno: Number(m[2]) } : null;
}

/** Pravne strane se u ovom runu ne menjaju (pravila runa). */
export const VAN_OPSEGA = ["app/api/", "app/privacy/", "app/cookies/", "app/deletion-status/"] as const;
export const uOpsegu = (putanja: string): boolean => !VAN_OPSEGA.some((p) => putanja.startsWith(p));
