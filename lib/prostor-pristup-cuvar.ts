/**
 * Čuvar pristupa radnog dela (SPAJANJE, plan S01 §3.7): logika nad tekstom
 * izvora iz `convex/prostor/`, bez testova i `*.pomoc.ts`.
 *
 * `verify:pristup` već traži da svaka javna funkcija ide kroz omotač. Ovaj
 * čuvar dodaje pravila radnog dela:
 * - P1: projektni omotač (`projekatQuery/Mutation/Action`) eksplicitno nosi
 *   `uloga: "urednik"` ili `"owner"` — bez toga upit podrazumeva
 *   `client_viewer`, a `client_viewer` nema pristup radnom delu (O5);
 * - P2: nema `// javno:` izuzetaka (P8);
 * - P3: nad `members` nema `.unique()` (duplikat reda ne sme da zaključa
 *   člana, C19);
 * - P4: nema čitanja `.role === "admin"` (P7: vlasnik platforme / isManager);
 * - P5: nema Devotion tabela `startups`, `startupMembers`, `appState` (P5, P6).
 *
 * Parsira se TypeScript AST-om, kao `lib/pristup-cuvar.ts`.
 */
import ts from "typescript";

import { FAJL_OMOTACA, type IzvorniFajl } from "./pristup-cuvar";

export type NalazProstora = {
  putanja: string;
  linija: number;
  pravilo: "P1" | "P2" | "P3" | "P4" | "P5";
  poruka: string;
};

const PROJEKTNI = new Set(["projekatQuery", "projekatMutation", "projekatAction"]);
const DOZVOLJENE_ULOGE = new Set(["urednik", "owner"]);
const DEVOTION_TABELE = new Set(["startups", "startupMembers", "appState"]);

/** Uvoz `../lib/projekat` iz `prostor/x.ts` (putanja relativna u odnosu na `convex/`). */
function jeUvozOmotaca(putanja: string, spec: string): boolean {
  if (!spec.startsWith(".")) return false;
  const delovi = putanja.split("/").slice(0, -1);
  for (const deo of spec.split("/")) {
    if (deo === "." || deo === "") continue;
    if (deo === "..") delovi.pop();
    else delovi.push(deo);
  }
  return `${delovi.join("/")}.ts` === FAJL_OMOTACA;
}

function lanacSadrziUpitNad(izraz: ts.Expression, tabela: string): boolean {
  let tek: ts.Expression = izraz;
  while (true) {
    if (ts.isCallExpression(tek)) {
      const callee = tek.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "query" &&
        tek.arguments.length === 1 &&
        ts.isStringLiteral(tek.arguments[0]) &&
        tek.arguments[0].text === tabela
      ) {
        return true;
      }
      tek = callee;
    } else if (ts.isPropertyAccessExpression(tek)) {
      tek = tek.expression;
    } else {
      return false;
    }
  }
}

export function proveriProstor(fajl: IzvorniFajl): NalazProstora[] {
  const putanja = fajl.putanja.replace(/\\/g, "/");
  const izvor = ts.createSourceFile(putanja, fajl.tekst, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const nalazi: NalazProstora[] = [];
  const red = (cvor: ts.Node) => izvor.getLineAndCharacterOfPosition(cvor.getStart(izvor)).line + 1;

  const omotaci = new Map<string, string>();
  for (const iskaz of izvor.statements) {
    if (!ts.isImportDeclaration(iskaz) || !ts.isStringLiteral(iskaz.moduleSpecifier)) continue;
    if (!jeUvozOmotaca(putanja, iskaz.moduleSpecifier.text)) continue;
    const imena = iskaz.importClause?.namedBindings;
    if (!imena || !ts.isNamedImports(imena)) continue;
    for (const el of imena.elements) omotaci.set(el.name.text, (el.propertyName ?? el.name).text);
  }

  fajl.tekst.split(/\r?\n/).forEach((l, i) => {
    if (/^\s*\/\/\s*javno:/.test(l)) {
      nalazi.push({ putanja, linija: i + 1, pravilo: "P2", poruka: "`// javno:` u radnom delu (P8)" });
    }
  });

  const obidji = (cvor: ts.Node): void => {
    if (ts.isCallExpression(cvor) && ts.isIdentifier(cvor.expression)) {
      const izvorno = omotaci.get(cvor.expression.text);
      if (izvorno !== undefined && PROJEKTNI.has(izvorno)) {
        const obj = cvor.arguments[0];
        const uloga =
          obj && ts.isObjectLiteralExpression(obj)
            ? obj.properties.find(
                (p): p is ts.PropertyAssignment =>
                  ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "uloga",
              )
            : undefined;
        const vrednost =
          uloga && ts.isStringLiteral(uloga.initializer) ? uloga.initializer.text : null;
        if (vrednost === null || !DOZVOLJENE_ULOGE.has(vrednost)) {
          nalazi.push({
            putanja,
            linija: red(cvor),
            pravilo: "P1",
            poruka: `${izvorno} bez \`uloga: "urednik"\` ili \`"owner"\` (client_viewer, O5)`,
          });
        }
      }
    }
    if (
      ts.isCallExpression(cvor) &&
      ts.isPropertyAccessExpression(cvor.expression) &&
      cvor.expression.name.text === "unique" &&
      lanacSadrziUpitNad(cvor.expression.expression, "members")
    ) {
      nalazi.push({ putanja, linija: red(cvor), pravilo: "P3", poruka: "`.unique()` nad `members` (koristi `.first()`)" });
    }
    if (
      ts.isBinaryExpression(cvor) &&
      [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(cvor.operatorToken.kind)
    ) {
      const strane = [cvor.left, cvor.right];
      const role = strane.some((s) => ts.isPropertyAccessExpression(s) && s.name.text === "role");
      const admin = strane.some((s) => ts.isStringLiteral(s) && s.text === "admin");
      if (role && admin) {
        nalazi.push({ putanja, linija: red(cvor), pravilo: "P4", poruka: "čitanje `role` \"admin\" (P7)" });
      }
    }
    if (ts.isStringLiteral(cvor) && DEVOTION_TABELE.has(cvor.text)) {
      nalazi.push({ putanja, linija: red(cvor), pravilo: "P5", poruka: `Devotion tabela "${cvor.text}"` });
    }
    ts.forEachChild(cvor, obidji);
  };
  obidji(izvor);
  return nalazi;
}
