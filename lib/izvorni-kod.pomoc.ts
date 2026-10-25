/**
 * Pomoć čuvarima izvornog koda (`lib/*-cuvar.test.ts`, `lib/zakucane-adrese.test.ts`):
 * fajlovi koda koji se izvršava i njihovi tokeni iz TypeScript AST-a, pa
 * komentari ne broje (komentar sme da pominje adresu ili ime env-a).
 * Dve tačke u imenu: nije test, a ni kod aplikacije.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const KOREN = fileURLToPath(new URL("../", import.meta.url));

/** Testovi, fiksture i generisani kod nisu kod koji se izvršava u produkciji. */
function preskoci(ime: string): boolean {
  return (
    /\.(test|spec)\.tsx?$/.test(ime) ||
    ime.endsWith(".d.ts") ||
    /\.pomoc\.tsx?$/.test(ime) ||
    /fixture/i.test(ime)
  );
}

/** Svi `.ts`/`.tsx` fajlovi koda pod datim putanjama (fasciklama ili fajlovima). */
export function fajloviKoda(putanje: readonly string[]): string[] {
  const out: string[] = [];
  const obidji = (put: string) => {
    const ime = put.split(/[\\/]/).pop() ?? "";
    if (statSync(put).isDirectory()) {
      if (ime === "_generated" || ime === "node_modules") return;
      for (const ulaz of readdirSync(put)) obidji(join(put, ulaz));
      return;
    }
    if (/\.tsx?$/.test(ime) && !preskoci(ime)) out.push(put);
  };
  for (const p of putanje) obidji(join(KOREN, p));
  return out;
}

export const rel = (put: string): string => relative(KOREN, put).split(sep).join("/");

export type Token = { tekst: string; linija: number };

function izvor(putanja: string, tekst: string): ts.SourceFile {
  return ts.createSourceFile(
    putanja,
    tekst,
    ts.ScriptTarget.Latest,
    true,
    putanja.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function obidjiCvorove(sf: ts.SourceFile, posetilac: (c: ts.Node) => void): void {
  const korak = (c: ts.Node) => {
    posetilac(c);
    ts.forEachChild(c, korak);
  };
  korak(sf);
}

const linijaOd = (sf: ts.SourceFile, c: ts.Node) =>
  sf.getLineAndCharacterOfPosition(c.getStart(sf)).line + 1;

/** Tekst svih string literala (i delova šablona) u kodu, bez komentara. */
export function stringovi(putanja: string, tekst: string): Token[] {
  const sf = izvor(putanja, tekst);
  const out: Token[] = [];
  obidjiCvorove(sf, (c) => {
    if (
      ts.isStringLiteral(c) ||
      ts.isNoSubstitutionTemplateLiteral(c) ||
      ts.isTemplateHead(c) ||
      ts.isTemplateMiddle(c) ||
      ts.isTemplateTail(c) ||
      ts.isRegularExpressionLiteral(c) ||
      ts.isJsxText(c)
    ) {
      out.push({ tekst: c.text, linija: linijaOd(sf, c) });
    }
  });
  return out;
}

/** Imena (identifikatori i string literali) u kodu, bez komentara. */
export function imena(putanja: string, tekst: string): Token[] {
  const sf = izvor(putanja, tekst);
  const out: Token[] = [];
  obidjiCvorove(sf, (c) => {
    if (ts.isIdentifier(c) || ts.isStringLiteral(c) || ts.isNoSubstitutionTemplateLiteral(c)) {
      out.push({ tekst: c.text, linija: linijaOd(sf, c) });
    }
  });
  return out;
}

/** Imena env promenljivih koje kod čita kao `process.env.X` ili `process.env["X"]`. */
export function envCitanja(putanja: string, tekst: string): Token[] {
  const sf = izvor(putanja, tekst);
  const out: Token[] = [];
  const jeProcessEnv = (e: ts.Expression) =>
    ts.isPropertyAccessExpression(e) &&
    e.name.text === "env" &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === "process";
  obidjiCvorove(sf, (c) => {
    if (ts.isPropertyAccessExpression(c) && jeProcessEnv(c.expression)) {
      out.push({ tekst: c.name.text, linija: linijaOd(sf, c) });
    } else if (
      ts.isElementAccessExpression(c) &&
      jeProcessEnv(c.expression) &&
      ts.isStringLiteralLike(c.argumentExpression)
    ) {
      out.push({ tekst: c.argumentExpression.text, linija: linijaOd(sf, c) });
    }
  });
  return out;
}

export const procitaj = (put: string): string => readFileSync(put, "utf8");
