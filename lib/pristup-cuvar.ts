/**
 * Čuvar pristupa: logika (čista funkcija nad tekstom izvora).
 *
 * Svaka javna Convex funkcija (`query`, `mutation`, `action` iz
 * `_generated/server`) je otvorena prema celom internetu. Od C07 važi strogo
 * pravilo (PROJEKTI-PLAN §5): javna funkcija mora biti napravljena omotačem iz
 * `convex/lib/projekat.ts` (`projekat*`, `prijavljen*`, `platforma*`) ili nositi
 * komentar `// javno: <razlog>` u liniji tačno iznad definicije. Sirova
 * registracija pada čak i kad u telu zove neku proveru prijave: ime provere ne
 * dokazuje da se tuđi `workspaceId` odbija, a omotač to radi po konstrukciji.
 * (Blaža verzija iz C01, koja je priznavala provere po imenu, ukinuta je u C07.)
 *
 * Skripta `scripts/verify-pristup.ts` samo čita fajlove iz `convex/` i predaje
 * ih ovoj funkciji. Parsira se TypeScript AST-om, ne regularnim izrazima, da
 * komentar, string ili ime u tekstu ne bi lažno prošli kao registracija.
 */
import ts from "typescript";

export type VrstaFunkcije = "query" | "mutation" | "action";

export type IzvorniFajl = {
  /** Putanja relativna u odnosu na `convex/`, sa `/` (npr. `lib/auth.ts`). */
  putanja: string;
  tekst: string;
};

export type JavnaFunkcija = {
  putanja: string;
  ime: string;
  vrsta: VrstaFunkcije;
  /** Linija definicije (1-indeksirano). */
  linija: number;
};

export type Pad = JavnaFunkcija & { razlog: string };

export type RezultatCuvara = {
  /**
   * Javne funkcije napravljene omotačem iz `convex/lib/projekat.ts`
   * (`projekatQuery`, `prijavljenMutation`, …): proveravaju pozivaoca po
   * konstrukciji. `omotac` je izvorno ime omotača (i kad je uvoz preimenovan).
   */
  omotacem: Array<JavnaFunkcija & { omotac: string }>;
  /** Javne funkcije označene `// javno: <razlog>`. */
  javne: Array<JavnaFunkcija & { obrazlozenje: string }>;
  /** Sirove javne funkcije bez oznake: čuvar zbog njih pada. */
  pale: Pad[];
};

/**
 * Omotači pristupa iz `convex/lib/projekat.ts` (PROJEKTI-PLAN §5) i vrsta
 * funkcije koju prave. Funkcija napravljena omotačem je javna i proverava
 * pozivaoca po konstrukciji (prijava, članstvo u projektu ili vlasnik
 * platforme).
 */
export const OMOTACI: Readonly<Record<string, VrstaFunkcije>> = {
  projekatQuery: "query",
  projekatMutation: "mutation",
  projekatAction: "action",
  prijavljenQuery: "query",
  prijavljenMutation: "mutation",
  platformaQuery: "query",
  platformaMutation: "mutation",
};

/** Fajl u kome žive omotači, relativno u odnosu na `convex/`. */
export const FAJL_OMOTACA = "lib/projekat.ts";

/**
 * Convex ne deployuje fajl čije osnovno ime ima više od jedne tačke
 * (`x.test.ts`, `projekatProba.pomoc.ts`), pa njegove funkcije nisu javne.
 * Čuvar preskače isto što preskače i Convex.
 */
export function convexPreskace(imeFajla: string): boolean {
  const osnova = imeFajla.split("/").pop() ?? imeFajla;
  return osnova.split(".").length > 2;
}

const OZNAKA_JAVNO =/^\s*\/\/\s*javno:\s*(\S.*)$/;
const VRSTE: readonly VrstaFunkcije[] = ["query", "mutation", "action"];
const INTERNE = ["internalQuery", "internalMutation", "internalAction"];

type JavnaRegistracija = JavnaFunkcija & {
  iznad: string | undefined;
  omotac: string | null;
};

function normalizujPutanju(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** `./lib/projekat` iz `rules.ts` → `lib/projekat.ts` (ako taj fajl postoji). */
function razresiUvoz(
  odPutanje: string,
  specifikator: string,
  poznate: Set<string>,
): string | undefined {
  if (!specifikator.startsWith(".")) return undefined;
  const delovi = odPutanje.split("/").slice(0, -1);
  for (const deo of specifikator.split("/")) {
    if (deo === "." || deo === "") continue;
    if (deo === "..") delovi.pop();
    else delovi.push(deo);
  }
  const osnova = delovi.join("/");
  for (const kandidat of [osnova, `${osnova}.ts`, `${osnova}.tsx`, `${osnova}/index.ts`]) {
    if (poznate.has(kandidat)) return kandidat;
  }
  return undefined;
}

function imaIzvozniModifikator(cvor: ts.Node): boolean {
  const modifikatori = ts.canHaveModifiers(cvor) ? ts.getModifiers(cvor) : undefined;
  return (modifikatori ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** Javne registracije u jednom fajlu (izvezene, ne interne). */
function javneRegistracije(fajl: IzvorniFajl, poznate: Set<string>): JavnaRegistracija[] {
  const putanja = normalizujPutanju(fajl.putanja);
  const izvor = ts.createSourceFile(
    putanja,
    fajl.tekst,
    ts.ScriptTarget.Latest,
    true,
    putanja.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const linije = fajl.tekst.split(/\r?\n/);
  /** Lokalno ime → vrsta registracije iz `_generated/server`. */
  const registracije = new Map<string, VrstaFunkcije | "interna">();
  /** Lokalno ime → omotač iz `lib/projekat.ts` (izvorno ime). */
  const omotaci = new Map<string, string>();

  for (const iskaz of izvor.statements) {
    if (!ts.isImportDeclaration(iskaz) || !ts.isStringLiteral(iskaz.moduleSpecifier)) continue;
    const spec = iskaz.moduleSpecifier.text;
    const imena = iskaz.importClause?.namedBindings;
    if (!imena || !ts.isNamedImports(imena)) continue;
    const izServera = /(^|\/)_generated\/server$/.test(spec);
    const cilj = izServera ? undefined : razresiUvoz(putanja, spec, poznate);
    for (const el of imena.elements) {
      const uvezeno = (el.propertyName ?? el.name).text;
      const lokalno = el.name.text;
      if (izServera) {
        if ((VRSTE as readonly string[]).includes(uvezeno)) {
          registracije.set(lokalno, uvezeno as VrstaFunkcije);
        } else if (INTERNE.includes(uvezeno)) {
          registracije.set(lokalno, "interna");
        }
      } else if (cilj === FAJL_OMOTACA && Object.hasOwn(OMOTACI, uvezeno)) {
        omotaci.set(lokalno, uvezeno);
      }
    }
  }

  const nadjene: JavnaRegistracija[] = [];
  const zabelezi = (ime: string, poziv: ts.CallExpression, iskaz: ts.Statement) => {
    if (!ts.isIdentifier(poziv.expression)) return;
    const omotac = omotaci.get(poziv.expression.text);
    const vrsta =
      omotac !== undefined ? OMOTACI[omotac] : registracije.get(poziv.expression.text);
    if (vrsta === undefined || vrsta === "interna") return;
    const pocetak = izvor.getLineAndCharacterOfPosition(iskaz.getStart(izvor)).line;
    nadjene.push({
      putanja,
      ime,
      vrsta,
      linija: pocetak + 1,
      iznad: pocetak > 0 ? linije[pocetak - 1] : undefined,
      omotac: omotac ?? null,
    });
  };

  for (const iskaz of izvor.statements) {
    if (ts.isVariableStatement(iskaz)) {
      if (!imaIzvozniModifikator(iskaz)) continue;
      for (const dekl of iskaz.declarationList.declarations) {
        if (ts.isIdentifier(dekl.name) && dekl.initializer && ts.isCallExpression(dekl.initializer)) {
          zabelezi(dekl.name.text, dekl.initializer, iskaz);
        }
      }
    } else if (ts.isExportAssignment(iskaz) && ts.isCallExpression(iskaz.expression)) {
      zabelezi("default", iskaz.expression, iskaz);
    }
  }
  return nadjene;
}

export function proveriPristup(fajlovi: readonly IzvorniFajl[]): RezultatCuvara {
  const poznate = new Set(fajlovi.map((f) => normalizujPutanju(f.putanja)));
  const rezultat: RezultatCuvara = { omotacem: [], javne: [], pale: [] };
  for (const fajl of fajlovi) {
    for (const f of javneRegistracije(fajl, poznate)) {
      const opis: JavnaFunkcija = {
        putanja: f.putanja,
        ime: f.ime,
        vrsta: f.vrsta,
        linija: f.linija,
      };
      const oznaka = f.iznad === undefined ? null : OZNAKA_JAVNO.exec(f.iznad);
      if (oznaka !== null) {
        rezultat.javne.push({ ...opis, obrazlozenje: oznaka[1].trim() });
        continue;
      }
      if (f.iznad !== undefined && /^\s*\/\/\s*javno:?\s*$/.test(f.iznad)) {
        rezultat.pale.push({ ...opis, razlog: "oznaka `// javno:` bez razloga" });
        continue;
      }
      if (f.omotac !== null) {
        rezultat.omotacem.push({ ...opis, omotac: f.omotac });
        continue;
      }
      rezultat.pale.push({
        ...opis,
        razlog:
          "sirova registracija bez omotača iz lib/projekat.ts " +
          "(projekat*, prijavljen*, platforma*) i bez `// javno: <razlog>` u liniji iznad",
      });
    }
  }
  return rezultat;
}
