/**
 * Čuvar rečnika: nema sirovih naziva na ekranu (ULTRA O15, plan T08 §9.6).
 *
 *   R1  SCREAMING_SNAKE (`TEXT_POST`, `FOURTEEN_MONTHS`).
 *   R2  ime env promenljive, i unutar `<code>`.
 *   R3  `OAuthException`, `(#190)` ili `code: 190`.
 *   R4  interna oznaka plana: „Dodatak A.2", „§", „UI Boost".
 *   R5  „⌘" van `components/app/use-precica.ts` (Windows piše „Ctrl K").
 *   R6  snake_case (`added_photos`), osim u `<code>`/`<kbd>`, URL-u i adresi.
 *   R7  reč API-ja velikim slovima kao cela reč (ACTIVE, PAUSED, TEXT…),
 *       osim u `<code>`/`<kbd>`.
 *   R8  žargon sa spiska („Ad set", „Lookalike", „Hook Rate"…).
 *   R9  (server, `convex/**`) poruka greške koju UI prikazuje sadrži ime env
 *       promenljive ili „OAuthException".
 *
 * ŠTA SE VIDI (TypeScript AST): JSX tekst; string i šablon kao dete JSX-a
 * (i kroz `?:`, `&&`, `||`, `??`); atributi teksta (`title`, `aria-label`,
 * `placeholder`, `label`, `opis`…); svojstva `label:`, `title:`, `message:`,
 * `naziv:`, `opis:`, `description:` u objektnim literalima; argumenti
 * `toast(…)`, `toast.*(…)`, `setGreska(…)`, `setError(…)`.
 *
 * ŠTA SE NE VIDI: `case`, poređenja, ključevi, tipovi, `className`, `key`,
 * `href`, `value`, `variant`… i komentari. Vrednost koja stiže kao podatak
 * (`{item.mediaType}`) se statički ne vidi; ekran je propušta kroz
 * `naziv()` iz `lib/recnik.ts`.
 *
 * Čiste funkcije nad tekstom fajla. Test: `lib/recnik-cuvar.test.ts`; nad
 * celim kodom: `scripts/verify-ultra-recnik.ts`.
 */
import ts from "typescript";

export type PraviloRecnika = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9";

export type NalazRecnika = {
  putanja: string;
  linija: number;
  pravilo: PraviloRecnika;
  isecak: string;
};

export type Izuzetak = {
  fajl: string;
  sadrzi: string | RegExp;
  razlog: string;
};

/** Mesta gde sirov naziv svesno ostaje (uvek sa razlogom). */
export const IZUZECI: readonly Izuzetak[] = [
  {
    fajl: "components/app/settings/ingest-tokens-panel.tsx",
    sadrzi: /ENIGMA_(LEAD|INGEST)_TOKEN/,
    razlog:
      "ime promenljive koju korisnik sam upisuje na svom računaru (skill /generate-leads); stoji u <code> kao uputstvo",
  },
  {
    fajl: "components/app/settings/connections-settings.tsx",
    sadrzi: "act_1234567890",
    razlog: "primer oblika ID-ja oglasnog naloga koji korisnik upisuje u polje; to je ID, ne reč",
  },
  {
    fajl: "convex/lib/googleAdsShared.ts",
    sadrzi: "GOOGLE_ADS_DEVELOPER_TOKEN",
    razlog:
      "greška sinhronizacije, ne poruka radnje: ide u detalje Podešavanja (sync-health), gde tehnički kod sme da stoji; scripts/verify-gads-assets.ts proverava baš to ime",
  },
];

/** Env imena koja server ne čita kroz `process.env`, a UI ih je pominjao. */
export const DODATNA_ENV_IMENA = ["CONVEX_SITE_URL", "ALLOWED_EMAILS"] as const;

const ATRIBUTI_TEKSTA = new Set([
  "title",
  "aria-label",
  "aria-description",
  "placeholder",
  "alt",
  "label",
  "description",
  "hint",
  "subtitle",
  "confirmLabel",
  "busyLabel",
  "naslov",
  "opis",
  "prazno",
  "eyebrow",
  "reason",
  "note",
]);

const SVOJSTVA_TEKSTA = new Set(["label", "title", "message", "naziv", "opis", "description"]);

const POZIVI_TEKSTA = new Set(["toast", "setGreska", "setError"]);

const REC_API = [
  "ACTIVE", "PAUSED", "ARCHIVED", "DELETED", "MANUAL", "RECENT", "KEYWORD", "TAG",
  "TEXT", "IMAGE", "VIDEO", "CAROUSEL", "REEL", "STORY", "POST", "DRAFT",
  "PUBLISHED", "EVENT", "USER", "ITEM", "LIVE",
];
const R7_IZRAZ = new RegExp(`(?<![\\w-])(${REC_API.join("|")})(?![\\w-])`);

export const ZARGON = [
  "Ad set", "Ad Set", "Ad setov", "Lookalike", "Hook Rate", "Hold Rate", "Cooldown",
  "Max po niti", "Log izvršenja", "Ledolomci", "Ice Breakers", "Prozor ističe",
  "Thumbnail", "read-only", "Pinuj", "Pinovano", "Carousel", "Ghost objava",
  "Cross-share", "UTF-8 bajt", "Impresij", "Quality Score", "Search Impr",
  "Uporedi hooks", "Vodeći hook",
] as const;

const R1_IZRAZ = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/;
const R3_IZRAZ = /OAuthException|\(#\d{2,3}\)|\bcode:\s*\d{3}\b/;
const R4_IZRAZ = /Dodatak [A-Z]\.\d|§|UI Boost/;
const R6_IZRAZ = /\b[a-z]+_[a-z0-9_]+\b/;
const URL_ILI_ADRESA = /\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+|(?:^|\s)\/[\w\-./[\]?=&]+/g;

const UPOTREBA_PRECICE = "components/app/use-precica.ts";

type Tekst = { tekst: string; linija: number; kod: boolean };

function izvor(putanja: string, tekst: string): ts.SourceFile {
  return ts.createSourceFile(
    putanja,
    tekst,
    ts.ScriptTarget.Latest,
    true,
    putanja.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

const linijaOd = (sf: ts.SourceFile, c: ts.Node) =>
  sf.getLineAndCharacterOfPosition(c.getStart(sf)).line + 1;

/** Da li je čvor unutar `<code>` ili `<kbd>`. */
function uKodu(c: ts.Node): boolean {
  for (let n: ts.Node | undefined = c.parent; n; n = n.parent) {
    if (ts.isJsxElement(n)) {
      const ime = n.openingElement.tagName.getText();
      if (ime === "code" || ime === "kbd") return true;
    }
  }
  return false;
}

/** Stringovi koje izraz može da da kao tekst (kroz `?:`, `&&`, `||`, `??`, zagrade, šablon). */
function stringoviIzraza(e: ts.Expression | undefined, sf: ts.SourceFile, out: Tekst[], kod: boolean) {
  if (!e) return;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
    out.push({ tekst: e.text, linija: linijaOd(sf, e), kod });
  } else if (ts.isTemplateExpression(e)) {
    out.push({ tekst: e.head.text, linija: linijaOd(sf, e), kod });
    for (const s of e.templateSpans) {
      stringoviIzraza(s.expression, sf, out, kod);
      out.push({ tekst: s.literal.text, linija: linijaOd(sf, s.literal), kod });
    }
  } else if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) {
    stringoviIzraza(e.expression, sf, out, kod);
  } else if (ts.isConditionalExpression(e)) {
    stringoviIzraza(e.whenTrue, sf, out, kod);
    stringoviIzraza(e.whenFalse, sf, out, kod);
  } else if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      stringoviIzraza(e.right, sf, out, kod);
    } else if (
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken ||
      op === ts.SyntaxKind.PlusToken
    ) {
      stringoviIzraza(e.left, sf, out, kod);
      stringoviIzraza(e.right, sf, out, kod);
    }
  }
}

function imePoziva(e: ts.Expression): string | null {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) return e.expression.text;
  return null;
}

/** Sav tekst koji fajl prikazuje na ekranu (statički vidljiv). */
export function vidljivTekst(putanja: string, tekst: string): Tekst[] {
  const sf = izvor(putanja, tekst);
  const out: Tekst[] = [];
  const korak = (c: ts.Node) => {
    if (ts.isJsxText(c)) {
      if (c.text.trim()) out.push({ tekst: c.text, linija: linijaOd(sf, c), kod: uKodu(c) });
    } else if (ts.isJsxExpression(c) && c.parent && (ts.isJsxElement(c.parent) || ts.isJsxFragment(c.parent))) {
      stringoviIzraza(c.expression, sf, out, uKodu(c));
    } else if (ts.isJsxAttribute(c) && ATRIBUTI_TEKSTA.has(c.name.getText(sf))) {
      const v = c.initializer;
      if (v && ts.isStringLiteral(v)) out.push({ tekst: v.text, linija: linijaOd(sf, v), kod: false });
      else if (v && ts.isJsxExpression(v)) stringoviIzraza(v.expression, sf, out, false);
    } else if (
      ts.isPropertyAssignment(c) &&
      (ts.isIdentifier(c.name) || ts.isStringLiteral(c.name)) &&
      SVOJSTVA_TEKSTA.has(c.name.text) &&
      ts.isObjectLiteralExpression(c.parent)
    ) {
      stringoviIzraza(c.initializer, sf, out, false);
    } else if (ts.isCallExpression(c)) {
      const ime = imePoziva(c.expression);
      if (ime && POZIVI_TEKSTA.has(ime)) {
        for (const a of c.arguments) stringoviIzraza(a, sf, out, false);
      }
    }
    ts.forEachChild(c, korak);
  };
  korak(sf);
  return out;
}

function izuzet(putanja: string, isecak: string, izuzeci: readonly Izuzetak[]): boolean {
  return izuzeci.some(
    (i) =>
      i.fajl === putanja &&
      (typeof i.sadrzi === "string" ? isecak.includes(i.sadrzi) : i.sadrzi.test(isecak)),
  );
}

function envIzraz(envImena: ReadonlySet<string>): RegExp | null {
  if (envImena.size === 0) return null;
  const imena = [...envImena].sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${imena.join("|")})\\b`);
}

/** Pravila R1–R8 nad jednim tekstom. */
export function praviloTeksta(
  t: Tekst,
  putanja: string,
  env: RegExp | null,
): { pravilo: PraviloRecnika; isecak: string }[] {
  const out: { pravilo: PraviloRecnika; isecak: string }[] = [];
  const s = t.tekst;
  const bezAdresa = s.replace(URL_ILI_ADRESA, " ");
  const m2 = env?.exec(s);
  if (m2) out.push({ pravilo: "R2", isecak: m2[0] });
  const m1 = R1_IZRAZ.exec(bezAdresa);
  if (m1 && !(m2 && m1[0] === m2[0])) out.push({ pravilo: "R1", isecak: m1[0] });
  const m3 = R3_IZRAZ.exec(s);
  if (m3) out.push({ pravilo: "R3", isecak: m3[0] });
  const m4 = R4_IZRAZ.exec(s);
  if (m4) out.push({ pravilo: "R4", isecak: m4[0] });
  if (s.includes("⌘") && putanja !== UPOTREBA_PRECICE) out.push({ pravilo: "R5", isecak: "⌘" });
  if (!t.kod) {
    const m6 = R6_IZRAZ.exec(bezAdresa);
    if (m6) out.push({ pravilo: "R6", isecak: m6[0] });
    const m7 = R7_IZRAZ.exec(bezAdresa);
    if (m7) out.push({ pravilo: "R7", isecak: m7[0] });
  }
  for (const z of ZARGON) {
    if (s.includes(z)) {
      out.push({ pravilo: "R8", isecak: z });
      break;
    }
  }
  return out;
}

/** R1–R8 nad jednim fajlom ekrana. */
export function proveriRecnik(
  putanja: string,
  tekst: string,
  envImena: ReadonlySet<string>,
  izuzeci: readonly Izuzetak[] = IZUZECI,
): NalazRecnika[] {
  const env = envIzraz(envImena);
  const nalazi: NalazRecnika[] = [];
  for (const t of vidljivTekst(putanja, tekst)) {
    for (const n of praviloTeksta(t, putanja, env)) {
      if (izuzet(putanja, n.isecak, izuzeci)) continue;
      nalazi.push({ putanja, linija: t.linija, ...n });
    }
  }
  return nalazi;
}

/** R9: poruke grešaka na serveru (one stižu u UI kroz `{error}`). */
export function proveriServer(
  putanja: string,
  tekst: string,
  envImena: ReadonlySet<string>,
  izuzeci: readonly Izuzetak[] = IZUZECI,
): NalazRecnika[] {
  const env = envIzraz(envImena);
  const sf = izvor(putanja, tekst);
  const nalazi: NalazRecnika[] = [];
  const proveri = (e: ts.Expression | undefined) => {
    const tekstovi: Tekst[] = [];
    stringoviIzraza(e, sf, tekstovi, false);
    for (const t of tekstovi) {
      const m = env?.exec(t.tekst) ?? /OAuthException/.exec(t.tekst);
      if (m && !izuzet(putanja, m[0], izuzeci)) {
        nalazi.push({ putanja, linija: t.linija, pravilo: "R9", isecak: m[0] });
      }
    }
  };
  const korak = (c: ts.Node) => {
    if (ts.isNewExpression(c) && ts.isIdentifier(c.expression)) {
      const ime = c.expression.text;
      const a = c.arguments?.[0];
      if (ime === "ConvexError" && a) {
        if (ts.isObjectLiteralExpression(a)) {
          for (const p of a.properties) {
            if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "message") {
              proveri(p.initializer);
            }
          }
        } else proveri(a);
      } else if (ime === "Error" && a && ts.isThrowStatement(c.parent)) {
        proveri(a);
      }
    }
    ts.forEachChild(c, korak);
  };
  korak(sf);
  return nalazi;
}

/** Izuzetak bez razloga nije izuzetak nego rupa u proveri. */
export function izuzeciBezRazloga(izuzeci: readonly Izuzetak[]): Izuzetak[] {
  return izuzeci.filter((i) => i.razlog.trim().length < 10);
}

/** Fajlovi ekrana: `components/` i `app/`, bez API ruta, fikstura i pravnih strana. */
export function uOpsegu(putanja: string): boolean {
  if (!(putanja.startsWith("components/") || putanja.startsWith("app/"))) return false;
  if (putanja.startsWith("app/api/")) return false;
  if (/^app\/(privacy|cookies|deletion-status)\//.test(putanja)) return false;
  if (/^app\/dev-ux\/fixtures/.test(putanja)) return false;
  return true;
}
