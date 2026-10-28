/**
 * Čuvar jednog izbora i jednog formata (ULTRA, plan T08 §7.4 i §8.4).
 *
 *   F1  u `components/` ili `app/` nema JSX elementa `<select`.
 *   F2  `<Select …>` ima `label`, i nije prazan string.
 *   F3  `toLocaleString(`, `toLocaleDateString(`, `toLocaleTimeString(` i
 *       `Intl.*` (osim `Intl.DisplayNames`, koji piše nazive država, ne format)
 *       ne postoje u `components/app/**`, `app/(app)/**` ni `app/dev-ux/**`.
 *       Formatari žive u `lib/format.ts`, `lib/belgrade-time.ts`,
 *       `lib/date-range.ts` i `convex/lib/*`.
 *   F4  rezultat `.toFixed(` ne ide u tekst: dete JSX-a, šablon u detetu JSX-a
 *       ili atribut `title`, `aria-label`, `placeholder`, `alt`. Atributi
 *       `style`, `d`, `points`, `x`, `y`, `width`, `height` i
 *       `strokeDasharray` su dozvoljeni. Proverava se neposredan tok (do
 *       JSX-a); vrednost koju neka funkcija vrati pa se prikaže drugde ovde
 *       se ne vidi.
 *   F5  JSX tekst ne počinje sa „%“ odmah posle izraza (`{x}%`): procenat se
 *       piše kroz `formatPercent` (tvrdi razmak).
 *
 * Čiste funkcije nad tekstom fajla (TypeScript AST); komentar nikad nije
 * nalaz. Test: `lib/format-cuvar.test.ts`; nad celim kodom:
 * `scripts/verify-ultra-format.ts`.
 */
import ts from "typescript";

export type NalazFormata = {
  putanja: string;
  linija: number;
  pravilo: "F1" | "F2" | "F3" | "F4" | "F5";
  poruka: string;
};

export type Izuzetak = {
  fajl: string;
  sadrzi: string | RegExp;
  razlog: string;
};

/** Mesta gde je ručni format svesno ostao (uvek sa razlogom). */
export const IZUZECI: readonly Izuzetak[] = [
  {
    fajl: "components/app/leadovi/import-review-table.tsx",
    sadrzi: "lat.toFixed(5)",
    razlog: "koordinate u `title` ćelije moraju da ostanu tačke sa pet decimala, a ne format broja",
  },
];

const ATRIBUTI_TEKSTA = new Set(["title", "aria-label", "placeholder", "alt"]);

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

/** F3 važi samo za kod ekrana. */
export function uOpsegu3(putanja: string): boolean {
  return (
    putanja.startsWith("components/app/") ||
    putanja.startsWith("app/(app)/") ||
    putanja.startsWith("app/dev-ux/")
  );
}

/** Da li izraz `c` na kraju stiže u tekst: dete JSX-a ili atribut teksta. */
function ideUTekst(c: ts.Node): boolean {
  let n: ts.Node = c;
  while (n.parent) {
    const p: ts.Node = n.parent;
    if (
      ts.isTemplateSpan(p) ||
      ts.isTemplateExpression(p) ||
      ts.isParenthesizedExpression(p) ||
      ts.isBinaryExpression(p) ||
      ts.isConditionalExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isNonNullExpression(p)
    ) {
      n = p;
      continue;
    }
    if (ts.isJsxExpression(p)) {
      const roditelj = p.parent;
      if (ts.isJsxElement(roditelj) || ts.isJsxFragment(roditelj)) return true;
      if (ts.isJsxAttribute(roditelj)) {
        return ATRIBUTI_TEKSTA.has(roditelj.name.getText());
      }
      return false;
    }
    return false;
  }
  return false;
}

function imeEtikete(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile): string {
  return el.tagName.getText(sf);
}

function nazivNaOznaci(el: ts.JsxOpeningLikeElement): {
  ima: boolean;
  prazan: boolean;
  spread: boolean;
} {
  let ima = false;
  let prazan = false;
  let spread = false;
  for (const a of el.attributes.properties) {
    if (ts.isJsxSpreadAttribute(a)) {
      spread = true;
      continue;
    }
    if (a.name.getText() !== "label") continue;
    ima = true;
    const v = a.initializer;
    if (v && ts.isStringLiteral(v)) prazan = v.text.trim() === "";
    if (
      v &&
      ts.isJsxExpression(v) &&
      v.expression &&
      (ts.isStringLiteral(v.expression) ||
        ts.isNoSubstitutionTemplateLiteral(v.expression))
    ) {
      prazan = v.expression.text.trim() === "";
    }
  }
  return { ima, prazan, spread };
}

function izuzet(
  putanja: string,
  tekstReda: string,
  izuzeci: readonly Izuzetak[],
): boolean {
  return izuzeci.some(
    (i) =>
      i.fajl === putanja &&
      (typeof i.sadrzi === "string"
        ? tekstReda.includes(i.sadrzi)
        : i.sadrzi.test(tekstReda)),
  );
}

/** F1–F5 nad jednim fajlom koda. */
export function proveriFormat(
  putanja: string,
  tekst: string,
  izuzeci: readonly Izuzetak[] = IZUZECI,
): NalazFormata[] {
  const sf = izvor(putanja, tekst);
  const redovi = tekst.split(/\r?\n/);
  const nalazi: NalazFormata[] = [];
  const dodaj = (c: ts.Node, pravilo: NalazFormata["pravilo"], poruka: string) => {
    const l = linija(sf, c);
    if (izuzet(putanja, redovi[l - 1] ?? "", izuzeci)) return;
    nalazi.push({ putanja, linija: l, pravilo, poruka });
  };
  const ekran = uOpsegu3(putanja);

  const korak = (c: ts.Node) => {
    if (ts.isJsxOpeningElement(c) || ts.isJsxSelfClosingElement(c)) {
      const ime = imeEtikete(c, sf);
      if (ime === "select") {
        dodaj(c, "F1", "izvorni <select>: koristi Select iz components/ui/select");
      }
      if (ime === "Select") {
        const n = nazivNaOznaci(c);
        if (n.prazan || (!n.ima && !n.spread)) {
          dodaj(c, "F2", "<Select> bez imena: dodaj `label`");
        }
      }
    }

    if (ekran) {
      if (
        ts.isCallExpression(c) &&
        ts.isPropertyAccessExpression(c.expression) &&
        /^toLocale(Date|Time)?String$/.test(c.expression.name.text)
      ) {
        dodaj(c, "F3", `${c.expression.name.text}(): formatiraj kroz lib/format.ts`);
      }
      if (
        ts.isPropertyAccessExpression(c) &&
        ts.isIdentifier(c.expression) &&
        c.expression.text === "Intl" &&
        c.name.text !== "DisplayNames"
      ) {
        dodaj(c, "F3", `Intl.${c.name.text}: formatiraj kroz lib/format.ts`);
      }
    }

    if (
      ts.isCallExpression(c) &&
      ts.isPropertyAccessExpression(c.expression) &&
      c.expression.name.text === "toFixed" &&
      ideUTekst(c)
    ) {
      dodaj(c, "F4", ".toFixed() u tekstu: koristi formatDecimal/formatRatio/formatPercent");
    }

    if (ts.isJsxElement(c) || ts.isJsxFragment(c)) {
      const deca = c.children;
      for (let i = 1; i < deca.length; i++) {
        const d = deca[i];
        if (
          ts.isJsxText(d) &&
          d.text.startsWith("%") &&
          ts.isJsxExpression(deca[i - 1])
        ) {
          dodaj(d, "F5", "{x}% u tekstu: koristi formatPercent (tvrdi razmak)");
        }
      }
    }

    ts.forEachChild(c, korak);
  };
  korak(sf);
  return nalazi;
}

/** Fajlovi koje čuvar pregleda: ceo `components/` i `app/` (bez API ruta). */
export function uOpsegu(putanja: string): boolean {
  return (
    (putanja.startsWith("components/") || putanja.startsWith("app/")) &&
    !putanja.startsWith("app/api/")
  );
}
