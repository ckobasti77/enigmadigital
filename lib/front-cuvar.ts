/**
 * Čuvar fronta: nijedan direktan poziv Convex funkcije projekta mimo
 * `useProjekat*` hookova (PROJEKTI-PLAN §5, plan C02 §5.4 i §9).
 *
 * Funkcija projekta prima `workspaceId`, a jedini koji sme da ga pošalje je
 * `ProjekatProvider` (kroz `useProjekatQuery/Mutation/Action`). Direktan
 * `useQuery(api.x.y, …)`, `useMutation(api.x.y)`, `useAction(api.x.y)` ili
 * `client.query/mutation/action(api.x.y, …)` (serverske rute) dozvoljen je samo
 * za funkcije bez projekta, sa spiska koji prosleđuje skripta
 * `scripts/verify-pristup.ts` (svaka stavka ima razlog).
 *
 * Parsira se TypeScript AST-om: poziv preko više redova, `as` i zagrade se
 * prepoznaju, a ime u komentaru ili stringu nije poziv.
 */
import ts from "typescript";

import type { IzvorniFajl, RezultatCuvara } from "./pristup-cuvar";

/**
 * Hookovi koji primaju referencu funkcije kao prvi argument: `convex/react` i
 * tolerantne kuke nivoa „Ja“ radnog dela (`components/app/prostor/podaci/ja.ts`,
 * SPAJANJE S08, D15), koje bi inače direktan poziv sakrile od čuvara.
 */
export const HOOKOVI: readonly string[] = [
  "useQuery",
  "useMutation",
  "useAction",
  "usePaginatedQuery",
  "useQueryTolerant",
  "useQueryResult",
  "useQueryState",
];

/**
 * `useQueries({ k: { query: api.x.y, args } })` (Convex): referenca je u
 * objektu, pa se traži svojstvo `query` bilo gde u prvom argumentu (S08, D15).
 */
export const HOOK_VISE_UPITA = "useQueries";

/** Metode klijenta (`ConvexHttpClient`) koje primaju referencu funkcije. */
export const METODE_KLIJENTA: readonly string[] = ["query", "mutation", "action"];

/**
 * Kuka projekta za imperativni upit (`components/app/prostor/podaci/projekat.ts`,
 * SPAJANJE S08, plan S07 §3.1): `useProjekatKlijent().query(api.x.y, …)` sama
 * ubacuje `workspaceId`, isto kao `useProjekatQuery`. Zato `.query` nad njenim
 * rezultatom (`const k = useProjekatKlijent(); k.query(…)` ili lanac
 * `useProjekatKlijent().query(…)`) nije direktan poziv. Svaki drugi klijent
 * (`useConvex()`, `ConvexHttpClient`) i dalje jeste (SPAJANJE S14).
 */
export const KUKA_KLIJENTA_PROJEKTA = "useProjekatKlijent";

export type DirektanPoziv = {
  /** Putanja relativna u odnosu na koren repoa, sa `/`. */
  putanja: string;
  /** Linija poziva (1-indeksirano). */
  linija: number;
  /** `useQuery`, `useMutation`, … ili `.query`, `.action` (klijent). */
  nacin: string;
  /** Funkcija kako je vidi `api`: `modul.ime` (npr. `invitesStore.getInvite`). */
  funkcija: string;
};

export type RezultatFrontCuvara = {
  dozvoljeni: Array<DirektanPoziv & { razlog: string }>;
  pali: Array<DirektanPoziv & { razlog: string }>;
};

/** `api.a.b.c` (kroz `as`, `!`, zagrade) → `["a", "b", "c"]`, inače `null`. */
function lanacApi(izraz: ts.Expression): string[] | null {
  let tek: ts.Expression = izraz;
  while (
    ts.isAsExpression(tek) ||
    ts.isParenthesizedExpression(tek) ||
    ts.isNonNullExpression(tek) ||
    ts.isSatisfiesExpression(tek) ||
    ts.isTypeAssertionExpression(tek)
  ) {
    tek = tek.expression;
  }
  const lanac: string[] = [];
  while (ts.isPropertyAccessExpression(tek)) {
    lanac.unshift(tek.name.text);
    tek = tek.expression;
  }
  if (!ts.isIdentifier(tek) || tek.text !== "api" || lanac.length < 2) return null;
  return lanac;
}

/** `useProjekatKlijent()` (kroz zagrade i `as`). */
function jePozivKlijentaProjekta(izraz: ts.Expression): boolean {
  let tek: ts.Expression = izraz;
  while (ts.isAsExpression(tek) || ts.isParenthesizedExpression(tek) || ts.isNonNullExpression(tek)) {
    tek = tek.expression;
  }
  return (
    ts.isCallExpression(tek) &&
    ts.isIdentifier(tek.expression) &&
    tek.expression.text === KUKA_KLIJENTA_PROJEKTA
  );
}

/** Imena promenljivih u fajlu dodeljenih iz `useProjekatKlijent()`. */
function klijentiProjekta(izvor: ts.SourceFile): Set<string> {
  const imena = new Set<string>();
  const obidji = (cvor: ts.Node): void => {
    if (
      ts.isVariableDeclaration(cvor) &&
      ts.isIdentifier(cvor.name) &&
      cvor.initializer !== undefined &&
      jePozivKlijentaProjekta(cvor.initializer)
    ) {
      imena.add(cvor.name.text);
    }
    ts.forEachChild(cvor, obidji);
  };
  obidji(izvor);
  return imena;
}

/** Ime pozvane funkcije (`useQuery`) ili metode (`.query`), inače `null`. */
function nacinPoziva(poziv: ts.CallExpression, klijenti: ReadonlySet<string>): string | null {
  const callee = poziv.expression;
  if (ts.isIdentifier(callee) && HOOKOVI.includes(callee.text)) return callee.text;
  if (
    ts.isPropertyAccessExpression(callee) &&
    METODE_KLIJENTA.includes(callee.name.text)
  ) {
    const primalac = callee.expression;
    if (ts.isIdentifier(primalac) && klijenti.has(primalac.text)) return null;
    if (jePozivKlijentaProjekta(primalac)) return null;
    return `.${callee.name.text}`;
  }
  return null;
}

export function nadjiDirektnePozive(fajl: IzvorniFajl): DirektanPoziv[] {
  const putanja = fajl.putanja.replace(/\\/g, "/");
  const izvor = ts.createSourceFile(
    putanja,
    fajl.tekst,
    ts.ScriptTarget.Latest,
    true,
    putanja.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const nadjeni: DirektanPoziv[] = [];
  const klijenti = klijentiProjekta(izvor);
  const linija = (cvor: ts.Node) =>
    izvor.getLineAndCharacterOfPosition(cvor.getStart(izvor)).line + 1;
  const obidji = (cvor: ts.Node): void => {
    if (
      ts.isCallExpression(cvor) &&
      cvor.arguments.length > 0 &&
      ts.isIdentifier(cvor.expression) &&
      cvor.expression.text === HOOK_VISE_UPITA
    ) {
      const uObjektu = (deo: ts.Node): void => {
        if (
          ts.isPropertyAssignment(deo) &&
          (ts.isIdentifier(deo.name) || ts.isStringLiteral(deo.name)) &&
          deo.name.text === "query"
        ) {
          const lanac = lanacApi(deo.initializer);
          if (lanac !== null) {
            nadjeni.push({ putanja, linija: linija(deo), nacin: HOOK_VISE_UPITA, funkcija: lanac.join(".") });
          }
        }
        ts.forEachChild(deo, uObjektu);
      };
      uObjektu(cvor.arguments[0]);
    }
    if (ts.isCallExpression(cvor) && cvor.arguments.length > 0) {
      const nacin = nacinPoziva(cvor, klijenti);
      const lanac = nacin === null ? null : lanacApi(cvor.arguments[0]);
      if (nacin !== null && lanac !== null) {
        nadjeni.push({
          putanja,
          linija: izvor.getLineAndCharacterOfPosition(cvor.getStart(izvor)).line + 1,
          nacin,
          funkcija: lanac.join("."),
        });
      }
    }
    ts.forEachChild(cvor, obidji);
  };
  obidji(izvor);
  return nadjeni;
}

/**
 * Svaki direktan poziv mora biti nad funkcijom sa spiska `dozvoljeni`
 * (`modul.ime` → razlog). Sve ostalo pada: funkcija projekta ide kroz
 * `useProjekatQuery/Mutation/Action`.
 */
export function proveriFront(
  fajlovi: readonly IzvorniFajl[],
  dozvoljeni: Readonly<Record<string, string>>,
): RezultatFrontCuvara {
  const rezultat: RezultatFrontCuvara = { dozvoljeni: [], pali: [] };
  for (const fajl of fajlovi) {
    for (const poziv of nadjiDirektnePozive(fajl)) {
      const razlog = Object.hasOwn(dozvoljeni, poziv.funkcija)
        ? dozvoljeni[poziv.funkcija]
        : undefined;
      if (razlog !== undefined) {
        rezultat.dozvoljeni.push({ ...poziv, razlog });
      } else {
        rezultat.pali.push({
          ...poziv,
          razlog:
            "direktan poziv funkcije koja nije na spisku funkcija bez projekta; " +
            "koristi useProjekatQuery/useProjekatMutation/useProjekatAction",
        });
      }
    }
  }
  return rezultat;
}

/** Omotači koji prave funkciju bez projekta (bez `workspaceId`). */
export const OMOTACI_BEZ_PROJEKTA: readonly string[] = [
  "prijavljenQuery",
  "prijavljenMutation",
  "platformaQuery",
  "platformaMutation",
];

/**
 * Stavka spiska dozvoljenih mora biti javna funkcija BEZ projekta: napravljena
 * omotačem `prijavljen*`/`platforma*` ili označena `// javno: <razlog>`.
 * Funkcija projekta ili nepostojeća funkcija na spisku je greška (spisak bi
 * tiho otvorio vrata direktnom pozivu sa ručnim `workspaceId`).
 */
export function proveriSpisak(
  dozvoljeni: Readonly<Record<string, string>>,
  backend: Pick<RezultatCuvara, "omotacem" | "javne">,
): Array<{ funkcija: string; razlog: string }> {
  const bezProjekta = new Set<string>();
  const saProjektom = new Set<string>();
  const kljuc = (putanja: string, ime: string) =>
    `${putanja.replace(/\.(ts|tsx)$/, "").replace(/\//g, ".")}.${ime}`;
  for (const f of backend.javne) bezProjekta.add(kljuc(f.putanja, f.ime));
  for (const f of backend.omotacem) {
    (OMOTACI_BEZ_PROJEKTA.includes(f.omotac) ? bezProjekta : saProjektom).add(
      kljuc(f.putanja, f.ime),
    );
  }
  const greske: Array<{ funkcija: string; razlog: string }> = [];
  for (const [funkcija, razlog] of Object.entries(dozvoljeni)) {
    if (razlog.trim().length === 0) {
      greske.push({ funkcija, razlog: "stavka spiska nema razlog" });
    } else if (saProjektom.has(funkcija)) {
      greske.push({
        funkcija,
        razlog: "funkcija projekta (projekat*) ne sme na spisak; koristi useProjekat* hook",
      });
    } else if (!bezProjekta.has(funkcija)) {
      greske.push({
        funkcija,
        razlog: "nije javna funkcija bez projekta (prijavljen*, platforma* ili `// javno:`)",
      });
    }
  }
  return greske;
}
