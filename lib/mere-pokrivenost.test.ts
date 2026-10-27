/**
 * Čuvar rečnika mera: svaka `KpiTile` i `ChannelFocus` u kodu čita smer iz
 * `lib/mere.ts` — preko `mera="…"` ili `higherIsBetter={veceJeBolje("…")}` —
 * i ključ postoji u rečniku. Tako rast troška ne može ponovo da postane zelen
 * zato što je neko zaboravio `higherIsBetter={false}`.
 */
import ts from "typescript";
import { describe, expect, test } from "vitest";

import { fajloviKoda, procitaj, rel } from "./izvorni-kod.pomoc";
import { MERE } from "./mere";

const PLOCICE = new Set(["KpiTile", "ChannelFocus"]);

type Nalaz = { putanja: string; linija: number; komponenta: string; problem: string };

function proveri(putanja: string, tekst: string): { ukupno: number; pali: Nalaz[] } {
  const izvor = ts.createSourceFile(putanja, tekst, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const pali: Nalaz[] = [];
  let ukupno = 0;

  const kljucPostoji = (k: string) => Object.prototype.hasOwnProperty.call(MERE, k);

  const obidji = (cvor: ts.Node) => {
    if (ts.isJsxSelfClosingElement(cvor) || ts.isJsxOpeningElement(cvor)) {
      const ime = cvor.tagName.getText(izvor);
      if (PLOCICE.has(ime)) {
        ukupno++;
        const linija = izvor.getLineAndCharacterOfPosition(cvor.getStart(izvor)).line + 1;
        let smer: string | null = null;
        let problem: string | null = null;
        for (const atr of cvor.attributes.properties) {
          if (!ts.isJsxAttribute(atr)) continue;
          const naziv = atr.name.getText(izvor);
          const init = atr.initializer;
          if (naziv === "mera") {
            if (init && ts.isStringLiteral(init)) {
              smer = init.text;
              if (!kljucPostoji(init.text)) problem = `mera "${init.text}" nije u rečniku`;
            } else {
              problem = "mera nije doslovan ključ";
            }
          }
          if (naziv === "higherIsBetter" && smer === null) {
            const izraz = init && ts.isJsxExpression(init) ? init.expression : undefined;
            if (
              izraz &&
              ts.isCallExpression(izraz) &&
              izraz.expression.getText(izvor) === "veceJeBolje" &&
              izraz.arguments.length === 1 &&
              ts.isStringLiteral(izraz.arguments[0])
            ) {
              const k = (izraz.arguments[0] as ts.StringLiteral).text;
              smer = k;
              if (!kljucPostoji(k)) problem = `veceJeBolje("${k}") nije u rečniku`;
            } else {
              problem = "higherIsBetter ne čita rečnik (veceJeBolje)";
            }
          }
        }
        if (smer === null && problem === null) problem = "nema smera iz rečnika";
        if (problem) pali.push({ putanja, linija, komponenta: ime, problem });
      }
    }
    ts.forEachChild(cvor, obidji);
  };
  obidji(izvor);
  return { ukupno, pali };
}

describe("čuvar rečnika mera", () => {
  test("pločica bez smera i smer van rečnika padaju; mera i veceJeBolje prolaze", () => {
    const r = proveri(
      "components/app/primer.tsx",
      `export function P() {
  return (
    <>
      <KpiTile label="Potrošnja" value={1} format={f} higherIsBetter={false} />
      <KpiTile label="Sesije" value={1} format={f} />
      <KpiTile label="X" mera="nepostojeca" value={1} format={f} />
      <KpiTile label="Rezultati" mera="rezultati" value={1} format={f} />
      <ChannelFocus label="Pratioci" value={1} format={f} higherIsBetter={veceJeBolje("pratioci")} />
    </>
  );
}`,
    );
    expect(r.ukupno).toBe(5);
    expect(r.pali.map((n) => [n.linija, n.problem])).toEqual([
      [4, "higherIsBetter ne čita rečnik (veceJeBolje)"],
      [5, "nema smera iz rečnika"],
      [6, 'mera "nepostojeca" nije u rečniku'],
    ]);
  });

  test("svaka KpiTile i ChannelFocus u aplikaciji čita smer iz lib/mere.ts", () => {
    let ukupno = 0;
    const pali: Nalaz[] = [];
    for (const put of fajloviKoda(["components", "app"])) {
      const r = proveri(rel(put), procitaj(put));
      ukupno += r.ukupno;
      pali.push(...r.pali);
    }
    // Pločica ima mnogo; nula bi značila da čuvar ništa ne vidi.
    expect(ukupno).toBeGreaterThan(40);
    expect(pali).toEqual([]);
  });
});
