/**
 * Čuvar dugmadi i boje radnje (ULTRA P1, O5; plan T08 §2.5).
 *
 *   D1  `components/ui/button.tsx` ima tačno šest uloga i nijednu podrazumevanu.
 *   D2  svaki JSX `<Button>` nosi `variant` (spread samo uz izuzetak sa razlogom).
 *   D3  nigde `variant="default"`, ni u uslovu (`a ? "default" : …`).
 *   D4  svaki poziv `buttonVariants(…)` nosi `variant` koji nije `"default"`.
 *   D5  nema ručno obojenog „primarnog" dugmeta: puna podloga radnje ili
 *       modula uz tamni tekst u listi klasa, van `ui/button.tsx`.
 *   D6  boja modula ne raste: broj upotreba `*-mod*` / `var(--mod…)` u kodu
 *       aplikacije ostaje ispod plafona (dug za ekrane, faze U10–U16).
 *   D7  `app/globals.css`: `[data-module]` ne prepisuje `--primary`, `--ring`
 *       ni `--focus-ring-strong`, a `:root` drži `--radnja` i
 *       `--primary: var(--radnja)`.
 *
 * Čiste funkcije nad tekstom fajla (TypeScript AST), pa ih test proverava na
 * primerima, a `scripts/verify-ultra-dugmad.ts` nad celim kodom. Komentar
 * nikad nije nalaz.
 */
import ts from "typescript";

export type NalazDugmadi = {
  putanja: string;
  linija: number;
  pravilo: "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7";
  poruka: string;
};

export type Izuzetak = { fajl: string; sadrzi: string; razlog: string };

/** Uloge dugmeta — tačno ove, ništa više (DESIGN.md „Buttons"). */
export const ULOGE = ["primary", "secondary", "outline", "ghost", "destructive", "link"] as const;

/**
 * Spread props na `<Button>` koji već nose ulogu. Svaka stavka ima razlog.
 */
export const IZUZECI_SPREAD: readonly Izuzetak[] = [
  {
    fajl: "components/app/leadovi/lead-row-actions.tsx",
    sadrzi: "{...shared}",
    razlog: "`shared` nosi `variant` po izgledu reda (full → primary, icon → ghost, card → secondary)",
  },
];

/** Fajlovi u kojima boja modula sme da stoji (tri mesta + demonstracija u vodiču). */
export const DOZVOLJENA_BOJA_MODULA: readonly Izuzetak[] = [
  { fajl: "components/app/module-tile.tsx", sadrzi: "", razlog: "aktivna stavka bočne trake" },
  { fajl: "components/app/app-sidebar.tsx", sadrzi: "", razlog: "crtica aktivne stavke bočne trake" },
  { fajl: "components/app/mobile-nav.tsx", sadrzi: "", razlog: "crtica aktivne ćelije donje trake" },
  { fajl: "components/app/system/page-header.tsx", sadrzi: "", razlog: "ikonica zaglavlja" },
  { fajl: "app/dev-ux/sistem/vodic.tsx", sadrzi: "", razlog: "vodič pokazuje boje modula (mesto)" },
];

/** Puna podloga koja izgleda kao primarno dugme (D5) — dozvoljena mesta. */
export const IZUZECI_PUNE_PODLOGE: readonly Izuzetak[] = [
  {
    fajl: "components/app/module-tile.tsx",
    sadrzi: "bg-mod-strong text-text-inverse",
    razlog: "aktivna stavka bočne trake je jedno od tri mesta boje modula",
  },
];

/**
 * Plafon boje modula (D6). Postavljen u T09 posle izmena: dug koji ostaje
 * (izabrana stanja, ikonice i trake na ekranima) čiste faze U10–U16. Broj sme
 * samo da pada; kad padne, spusti plafon.
 */
export const PLAFON_BOJE_MODULA = 646; // SPAJANJE S27: radnja u „Čeka te“ bez boje modula (bilo 654)

const BOJA_MODULA =
  /(?:^|[^\w-])(?:[a-z-]+:)*(?:text|bg|border|ring|fill|stroke|shadow|outline|from|to|via|decoration|accent)-mod(?:-strong|-soft|-line|-glow)?(?![\w-])|var\(--mod(?:-strong|-soft|-line|-glow)?\)/g;

const PUNA_PODLOGA = /(?:^|\s)(?:bg-primary|bg-mod-strong|bg-radnja)(?=\s|$)/;
const TAMAN_TEKST = /(?:^|\s)(?:text-primary-foreground|text-text-inverse|text-radnja-tekst)(?=\s|$)/;

function izvor(putanja: string, tekst: string): ts.SourceFile {
  return ts.createSourceFile(
    putanja,
    tekst,
    ts.ScriptTarget.Latest,
    true,
    putanja.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function obidji(sf: ts.SourceFile, posetilac: (c: ts.Node) => void): void {
  const korak = (c: ts.Node) => {
    posetilac(c);
    ts.forEachChild(c, korak);
  };
  korak(sf);
}

const linija = (sf: ts.SourceFile, c: ts.Node) =>
  sf.getLineAndCharacterOfPosition(c.getStart(sf)).line + 1;

/** Da li izraz sadrži string literal `"default"` (bilo gde u uslovu). */
function imaDefault(e: ts.Node): boolean {
  let ima = false;
  const korak = (c: ts.Node) => {
    if ((ts.isStringLiteral(c) || ts.isNoSubstitutionTemplateLiteral(c)) && c.text === "default") {
      ima = true;
    }
    ts.forEachChild(c, korak);
  };
  korak(e);
  return ima;
}

const pogadja = (izuzeci: readonly Izuzetak[], putanja: string, deo: string) =>
  izuzeci.some((i) => i.fajl === putanja && deo.includes(i.sadrzi));

/** D2–D5 nad jednim fajlom koda. */
export function proveriDugmad(
  putanja: string,
  tekst: string,
  izuzeciSpread: readonly Izuzetak[] = IZUZECI_SPREAD,
  izuzeciPodloge: readonly Izuzetak[] = IZUZECI_PUNE_PODLOGE,
): NalazDugmadi[] {
  const sf = izvor(putanja, tekst);
  const nalazi: NalazDugmadi[] = [];
  const dodaj = (c: ts.Node, pravilo: NalazDugmadi["pravilo"], poruka: string) =>
    nalazi.push({ putanja, linija: linija(sf, c), pravilo, poruka });

  obidji(sf, (c) => {
    // D2 i D3: JSX <Button …>
    if ((ts.isJsxOpeningElement(c) || ts.isJsxSelfClosingElement(c)) && c.tagName.getText(sf) === "Button") {
      let variant: ts.JsxAttribute | undefined;
      const spreadovi: ts.JsxSpreadAttribute[] = [];
      for (const atr of c.attributes.properties) {
        if (ts.isJsxAttribute(atr) && atr.name.getText(sf) === "variant") variant = atr;
        if (ts.isJsxSpreadAttribute(atr)) spreadovi.push(atr);
      }
      if (!variant) {
        const izuzet = spreadovi.some((s) => pogadja(izuzeciSpread, putanja, s.getText(sf)));
        if (!izuzet) dodaj(c, "D2", "<Button> bez uloge (`variant`)");
      } else if (variant.initializer) {
        const init = variant.initializer;
        if (ts.isStringLiteral(init) && init.text === "default") {
          dodaj(c, "D3", 'variant="default" — uloga `default` ne postoji');
        } else if (ts.isJsxExpression(init) && init.expression && imaDefault(init.expression)) {
          dodaj(c, "D3", "uslov u `variant` vraća \"default\"");
        }
      }
    }
    // D4: buttonVariants({ … })
    if (ts.isCallExpression(c) && c.expression.getText(sf) === "buttonVariants") {
      const arg = c.arguments[0];
      const svojstvo =
        arg && ts.isObjectLiteralExpression(arg)
          ? arg.properties.find(
              (p): p is ts.PropertyAssignment =>
                ts.isPropertyAssignment(p) && p.name.getText(sf) === "variant",
            )
          : undefined;
      if (!svojstvo) dodaj(c, "D4", "buttonVariants(…) bez `variant`");
      else if (imaDefault(svojstvo.initializer)) dodaj(c, "D4", 'buttonVariants(…) sa "default"');
    }
    // D5: ručno obojeno „primarno"
    if (ts.isStringLiteral(c) || ts.isNoSubstitutionTemplateLiteral(c)) {
      const t = c.text;
      if (PUNA_PODLOGA.test(t) && TAMAN_TEKST.test(t) && !pogadja(izuzeciPodloge, putanja, t)) {
        dodaj(c, "D5", `ručno obojeno primarno: „${t.slice(0, 80)}"`);
      }
    }
  });
  return nalazi;
}

/** D1 nad `components/ui/button.tsx`. */
export function proveriPrimitiv(putanja: string, tekst: string): NalazDugmadi[] {
  const sf = izvor(putanja, tekst);
  const nalazi: NalazDugmadi[] = [];
  let nadjen = false;
  obidji(sf, (c) => {
    if (!ts.isCallExpression(c) || c.expression.getText(sf) !== "cva") return;
    const opcije = c.arguments[1];
    if (!opcije || !ts.isObjectLiteralExpression(opcije)) return;
    nadjen = true;
    const svojstvo = (o: ts.ObjectLiteralExpression, ime: string) =>
      o.properties.find(
        (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf).replace(/"/g, "") === ime,
      );
    const varijante = svojstvo(opcije, "variants");
    const uloga =
      varijante && ts.isObjectLiteralExpression(varijante.initializer)
        ? svojstvo(varijante.initializer, "variant")
        : undefined;
    if (!uloga || !ts.isObjectLiteralExpression(uloga.initializer)) {
      nalazi.push({ putanja, linija: linija(sf, c), pravilo: "D1", poruka: "nema mape `variant`" });
    } else {
      const kljucevi = uloga.initializer.properties.map((p) => (p.name ? p.name.getText(sf).replace(/"/g, "") : ""));
      const visak = kljucevi.filter((k) => !(ULOGE as readonly string[]).includes(k));
      const fali = ULOGE.filter((k) => !kljucevi.includes(k));
      if (visak.length || fali.length) {
        nalazi.push({
          putanja,
          linija: linija(sf, uloga),
          pravilo: "D1",
          poruka: `uloge se ne poklapaju (višak: ${visak.join(", ") || "—"}; fali: ${fali.join(", ") || "—"})`,
        });
      }
    }
    const podrazumevano = svojstvo(opcije, "defaultVariants");
    if (
      podrazumevano &&
      ts.isObjectLiteralExpression(podrazumevano.initializer) &&
      svojstvo(podrazumevano.initializer, "variant")
    ) {
      nalazi.push({ putanja, linija: linija(sf, podrazumevano), pravilo: "D1", poruka: "`defaultVariants` nosi `variant`" });
    }
  });
  if (!nadjen) nalazi.push({ putanja, linija: 1, pravilo: "D1", poruka: "nije nađen `cva(…)` dugmeta" });
  return nalazi;
}

/** Deklaracije jednog CSS bloka (prvi blok sa tačno tim selektorom). */
export function blokCss(css: string, selektor: string): string | null {
  const start = css.indexOf(`${selektor} {`);
  if (start === -1) return null;
  const kraj = css.indexOf("}", start);
  return css.slice(start, kraj);
}

/**
 * Najdublji CSS blokovi čiji selektor odgovara `selektor` (npr. svaki
 * `[data-module="ads"]`, i unutar `@media`). Komentari se ne čitaju, a redovi
 * ostaju na mestu, pa je broj reda tačan.
 */
function blokoviSa(
  css: string,
  selektor: RegExp,
): { selektor: string; telo: string; red: number }[] {
  const bez = css.replace(/\/\*[\s\S]*?\*\//g, (k) => k.replace(/[^\n]/g, " "));
  const out: { selektor: string; telo: string; red: number }[] = [];
  for (const m of bez.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (!selektor.test(m[1])) continue;
    const pocetak = (m.index ?? 0) + (m[1].length - m[1].trimStart().length);
    out.push({ selektor: m[1].trim(), telo: m[2], red: bez.slice(0, pocetak).split("\n").length });
  }
  return out;
}

/** D7 nad `app/globals.css`. */
export function proveriGlobals(css: string, putanja = "app/globals.css"): NalazDugmadi[] {
  const nalazi: NalazDugmadi[] = [];
  // Svaki blok modula ili projekta (ne samo prvi `[data-module] {`): boja
  // mesta i identiteta nikad ne ulazi u shadcn sloj radnje.
  for (const blok of blokoviSa(css, /\[data-(?:module|projekat)\b/)) {
    for (const ime of ["--primary", "--ring", "--focus-ring-strong"]) {
      if (new RegExp(`${ime}\\s*:`).test(blok.telo)) {
        nalazi.push({ putanja, linija: blok.red, pravilo: "D7", poruka: `${blok.selektor} prepisuje ${ime}` });
      }
    }
  }
  const koren = blokCss(css, ":root") ?? "";
  if (!/--radnja\s*:/.test(koren)) {
    nalazi.push({ putanja, linija: 1, pravilo: "D7", poruka: ":root nema --radnja" });
  }
  if (!/--primary\s*:\s*var\(--radnja\)\s*;/.test(koren)) {
    nalazi.push({ putanja, linija: 1, pravilo: "D7", poruka: ":root: --primary nije var(--radnja)" });
  }
  return nalazi;
}

/** D6: koliko puta string literali fajla pominju boju modula (komentari ne broje). */
export function brojBojeModula(putanja: string, tekst: string): number {
  const sf = izvor(putanja, tekst);
  let n = 0;
  obidji(sf, (c) => {
    if (
      ts.isStringLiteral(c) ||
      ts.isNoSubstitutionTemplateLiteral(c) ||
      ts.isTemplateHead(c) ||
      ts.isTemplateMiddle(c) ||
      ts.isTemplateTail(c)
    ) {
      n += (c.text.match(BOJA_MODULA) ?? []).length;
    }
  });
  return n;
}

export const bojaModulaDozvoljena = (putanja: string) =>
  DOZVOLJENA_BOJA_MODULA.some((i) => i.fajl === putanja);
