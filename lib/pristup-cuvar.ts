/**
 * Čuvar pristupa: logika (čista funkcija nad tekstom izvora).
 *
 * Svaka javna Convex funkcija (`query`, `mutation`, `action` iz
 * `_generated/server`) je otvorena prema celom internetu. Ovde se proverava da
 * svaka ili proverava ko je poziva, ili nosi komentar `// javno: <razlog>` u
 * liniji tačno iznad definicije. Skripta `scripts/verify-pristup.ts` samo čita
 * fajlove iz `convex/` i predaje ih ovoj funkciji.
 *
 * Ovo je blaža verzija: prihvata postojeće provere prijave (`requireMembership`,
 * `getAuthUserId`, `resolveUserWorkspace`…), direktno ili kroz pomoćnu funkciju
 * (iz istog fajla ili uvezenu), i kroz poziv druge Convex funkcije koja proveru
 * radi. Ne zna da li je provera DOVOLJNA (npr. da li se tuđi `workspaceId` iz
 * argumenta odbija) — to se gleda ručno, a strožu verziju donosi prelazak na
 * omotače.
 *
 * Parsira se TypeScript AST-om, ne regularnim izrazima, da komentar, string ili
 * ime u tekstu ne bi lažno prošli kao provera.
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
  /** Javne funkcije koje proveravaju pozivaoca. */
  proverene: JavnaFunkcija[];
  /** Javne funkcije označene `// javno: <razlog>`. */
  javne: Array<JavnaFunkcija & { obrazlozenje: string }>;
  /** Javne funkcije bez provere i bez oznake: čuvar zbog njih pada. */
  pale: Pad[];
};

/**
 * Imena koja znače „ova funkcija zna ko je poziva". Pomoćne funkcije koje ih
 * pozivaju (u istom fajlu ili uvezene iz drugog fajla u `convex/`) računaju se
 * same, kao i pozivi drugih Convex funkcija koje ih koriste.
 */
export const PROVERE_PRIJAVE: readonly string[] = [
  "getAuthUserId",
  "getUserIdentity",
  "requireMembership",
  "requireOwner",
  "requireMembershipIn",
  "requireWorkspaceAccess",
  "requireActionMembership",
  "resolveUserWorkspace",
];

const OZNAKA_JAVNO = /^\s*\/\/\s*javno:\s*(\S.*)$/;
const VRSTE: readonly VrstaFunkcije[] = ["query", "mutation", "action"];
const INTERNE = ["internalQuery", "internalMutation", "internalAction"];

type Uvoz = { modul: string; ime: string };

type AnaliziranFajl = {
  putanja: string;
  /** Modul kako ga vidi `api`/`internal` (npr. `lib.auth`, `rulesStore`). */
  modul: string;
  izvor: ts.SourceFile;
  linije: string[];
  /** Lokalno ime → uvoz iz drugog fajla u `convex/`. */
  uvozi: Map<string, Uvoz>;
  /** Lokalno ime → vrsta registracije iz `_generated/server`. */
  registracije: Map<string, VrstaFunkcije | "interna">;
  /** Pomoćne funkcije najvišeg nivoa: ime → telo. */
  pomocne: Map<string, ts.Node>;
  /** Javne funkcije sa svojim pozivom registracije. */
  javneFunkcije: Array<JavnaFunkcija & { poziv: ts.Node; iznad: string | undefined }>;
  /** Sve registrovane funkcije (javne i interne): ime → poziv. */
  sveRegistrovane: Map<string, ts.Node>;
};

function normalizujPutanju(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function modulIzPutanje(putanja: string): string {
  return putanja.replace(/\.(ts|tsx|js|mjs)$/, "").replace(/\//g, ".");
}

/** `./lib/auth` iz `rules.ts` → `lib/auth.ts` (ako taj fajl postoji). */
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

function analiziraj(fajl: IzvorniFajl, poznate: Set<string>): AnaliziranFajl {
  const putanja = normalizujPutanju(fajl.putanja);
  const izvor = ts.createSourceFile(
    putanja,
    fajl.tekst,
    ts.ScriptTarget.Latest,
    true,
    putanja.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const a: AnaliziranFajl = {
    putanja,
    modul: modulIzPutanje(putanja),
    izvor,
    linije: fajl.tekst.split(/\r?\n/),
    uvozi: new Map(),
    registracije: new Map(),
    pomocne: new Map(),
    javneFunkcije: [],
    sveRegistrovane: new Map(),
  };

  for (const iskaz of izvor.statements) {
    if (ts.isImportDeclaration(iskaz) && ts.isStringLiteral(iskaz.moduleSpecifier)) {
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
            a.registracije.set(lokalno, uvezeno as VrstaFunkcije);
          } else if (INTERNE.includes(uvezeno)) {
            a.registracije.set(lokalno, "interna");
          }
        } else if (cilj !== undefined) {
          a.uvozi.set(lokalno, { modul: cilj, ime: uvezeno });
        }
      }
    }
  }

  const zabeleziRegistraciju = (
    ime: string,
    poziv: ts.CallExpression,
    iskaz: ts.Statement,
    javno: boolean,
  ) => {
    if (!ts.isIdentifier(poziv.expression)) return;
    const vrsta = a.registracije.get(poziv.expression.text);
    if (vrsta === undefined) return;
    a.sveRegistrovane.set(ime, poziv);
    if (vrsta === "interna" || !javno) return;
    const pocetak = izvor.getLineAndCharacterOfPosition(iskaz.getStart(izvor)).line;
    a.javneFunkcije.push({
      putanja,
      ime,
      vrsta,
      linija: pocetak + 1,
      poziv,
      iznad: pocetak > 0 ? a.linije[pocetak - 1] : undefined,
    });
  };

  for (const iskaz of izvor.statements) {
    if (ts.isFunctionDeclaration(iskaz) && iskaz.name && iskaz.body) {
      a.pomocne.set(iskaz.name.text, iskaz.body);
      continue;
    }
    if (ts.isVariableStatement(iskaz)) {
      const izvezeno = imaIzvozniModifikator(iskaz);
      for (const dekl of iskaz.declarationList.declarations) {
        if (!ts.isIdentifier(dekl.name) || !dekl.initializer) continue;
        const ime = dekl.name.text;
        const init = dekl.initializer;
        if (ts.isCallExpression(init)) {
          zabeleziRegistraciju(ime, init, iskaz, izvezeno);
        } else if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          a.pomocne.set(ime, init.body);
        }
      }
      continue;
    }
    if (ts.isExportAssignment(iskaz) && ts.isCallExpression(iskaz.expression)) {
      zabeleziRegistraciju("default", iskaz.expression, iskaz, true);
    }
  }

  return a;
}

/**
 * Da li čvor (telo funkcije ili poziv registracije) proverava pozivaoca:
 * pominje ime iz `PROVERE_PRIJAVE` ili pomoćnu funkciju koja to radi. Sa
 * `pratiReference`, i referencu `api.x.y` / `internal.x.y` na Convex funkciju
 * čije telo SAMO proverava (jedan nivo, bez daljeg praćenja: zakazivanje
 * interne funkcije nije provera pozivaoca).
 */
function pominjeProveru(
  cvor: ts.Node,
  fajl: AnaliziranFajl,
  proverava: (kljuc: string) => boolean,
  pratiReference: boolean,
): boolean {
  let nadjeno = false;
  const obidji = (n: ts.Node): void => {
    if (nadjeno) return;
    if (ts.isIdentifier(n)) {
      const ime = n.text;
      if (PROVERE_PRIJAVE.includes(ime)) {
        nadjeno = true;
        return;
      }
      // Samo „slobodna" upotreba imena (ne `obj.ime`) gleda pomoćne funkcije.
      const roditelj = n.parent;
      const kaoSvojstvo =
        roditelj !== undefined &&
        ts.isPropertyAccessExpression(roditelj) &&
        roditelj.name === n;
      if (!kaoSvojstvo) {
        if (fajl.pomocne.has(ime) && proverava(`${fajl.putanja}#${ime}`)) {
          nadjeno = true;
          return;
        }
        const uvoz = fajl.uvozi.get(ime);
        if (uvoz !== undefined && proverava(`${uvoz.modul}#${uvoz.ime}`)) {
          nadjeno = true;
          return;
        }
      }
    }
    if (pratiReference && ts.isPropertyAccessExpression(n)) {
      // api.modul.podmodul.funkcija / internal.modul.funkcija
      const lanac: string[] = [];
      let tek: ts.Expression = n;
      while (ts.isPropertyAccessExpression(tek)) {
        lanac.unshift(tek.name.text);
        tek = tek.expression;
      }
      if (
        ts.isIdentifier(tek) &&
        (tek.text === "api" || tek.text === "internal") &&
        lanac.length >= 2
      ) {
        const ime = lanac[lanac.length - 1];
        const modul = lanac.slice(0, -1).join(".");
        if (proverava(`@${modul}#${ime}`)) {
          nadjeno = true;
          return;
        }
      }
    }
    ts.forEachChild(n, obidji);
  };
  obidji(cvor);
  return nadjeno;
}

export function proveriPristup(fajlovi: readonly IzvorniFajl[]): RezultatCuvara {
  const poznate = new Set(fajlovi.map((f) => normalizujPutanju(f.putanja)));
  const analizirani = fajlovi.map((f) => analiziraj(f, poznate));
  const poModulu = new Map(analizirani.map((a) => [a.modul, a]));

  // Tela koja mogu da „nose" proveru: pomoćne funkcije i registracije.
  const tela = new Map<string, { cvor: ts.Node; fajl: AnaliziranFajl }>();
  for (const a of analizirani) {
    for (const [ime, cvor] of a.pomocne) tela.set(`${a.putanja}#${ime}`, { cvor, fajl: a });
    for (const [ime, cvor] of a.sveRegistrovane) tela.set(`${a.putanja}#${ime}`, { cvor, fajl: a });
  }

  const proveravajuca = new Set<string>();
  const doFiksiranja = (
    kandidati: Array<[string, { cvor: ts.Node; fajl: AnaliziranFajl }]>,
    pratiReference: boolean,
  ) => {
    let promena = true;
    while (promena) {
      promena = false;
      for (const [kljuc, { cvor, fajl }] of kandidati) {
        if (proveravajuca.has(kljuc)) continue;
        if (pominjeProveru(cvor, fajl, proverava, pratiReference)) {
          proveravajuca.add(kljuc);
          promena = true;
        }
      }
    }
  };

  // Faza 1: tela koja SAMA proveravaju (direktno ili kroz pomoćne funkcije).
  // Reference na druge Convex funkcije se ovde ne prate.
  let direktne = new Set<string>();
  const proverava = (kljuc: string): boolean => {
    if (kljuc.startsWith("@")) {
      const [modul, ime] = kljuc.slice(1).split("#");
      const a = poModulu.get(modul);
      return a !== undefined && direktne.has(`${a.putanja}#${ime}`);
    }
    return proveravajuca.has(kljuc);
  };
  doFiksiranja([...tela], false);
  direktne = new Set(proveravajuca);

  // Faza 2: pomoćna funkcija koja zove Convex funkciju iz faze 1 (npr.
  // `ctx.runQuery(internal.x.kontekst)` gde `kontekst` zove `requireMembership`)
  // i sama postaje provera. Jedan skok, ne lanac.
  doFiksiranja(
    [...tela].filter(([, { cvor, fajl }]) =>
      [...fajl.pomocne.values()].includes(cvor),
    ),
    true,
  );

  const rezultat: RezultatCuvara = { proverene: [], javne: [], pale: [] };
  for (const a of analizirani) {
    for (const f of a.javneFunkcije) {
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
      if (pominjeProveru(f.poziv, a, proverava, true)) {
        rezultat.proverene.push(opis);
        continue;
      }
      rezultat.pale.push({
        ...opis,
        razlog: "nema provere prijave ni oznake `// javno: <razlog>` u liniji iznad",
      });
    }
  }
  return rezultat;
}
