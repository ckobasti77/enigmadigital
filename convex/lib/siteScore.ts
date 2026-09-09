import type { LeadSignalKind } from "./leadNormalize";

/**
 * ============================================================================
 * KVALITET SAJTA — čista funkcija, računa se PRI ČITANJU (GL10, plan §2.4)
 * ============================================================================
 *
 * `kvalitetSajta` 0–100 =
 *   0,25·perf(mobile) + 0,15·seo + 0,10·a11y + 0,10·bp + 0,40·(Claude prosek × 20)
 *
 * Komponenta koje NEMA se preskače i težine se renormalizuju nad onim što
 * postoji. Kad nema ni Lighthousea ni Claudea → `null` („nije ocenjeno"), nikad
 * nula (§0 pravilo 1). Ukupna ocena se ne skladišti (§0 pravilo 2) — svaki
 * ekran je računa odavde, pa promena težina menja sve ocene odjednom i bez
 * migracije.
 *
 * Bez Convex uvoza: isti fajl čita `scripts/site-score-check.ts` (Node) i JS
 * kopija u skillu (`tools/generate-leads/lib/ocena.mjs`) mora da daje iste
 * brojeve — `verify:gl-skill` to poredi.
 */

export type LighthouseKategorije = {
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
  lcpMs?: number;
  cls?: number;
  inpMs?: number;
  tbtMs?: number;
};

export type ClaudeOcena = { ocena: number; obrazlozenje: string };

export type ClaudeSud = {
  model: string;
  ocene: {
    prviUtisak: ClaudeOcena;
    jasnocaPonude: ClaudeOcena;
    putDoKontakta: ClaudeOcena;
    mobilnaUpotrebljivost: ClaudeOcena;
    azurnost: ClaudeOcena;
  };
  glavneMane: string[];
  prilikaZaEnigmu: string;
  preporucenaPonuda: string;
  klikovaDoKontakta?: number;
};

export type Tehnologija = {
  ime: string;
  kategorija: string;
  verzija?: string;
  pouzdanost: number;
};

/** Podskup ocene koji je potreban za računanje — ostatak dokumenta ne smeta. */
export type SiteAuditZaOcenu = {
  lighthouse?: {
    mobile?: LighthouseKategorije;
    desktop?: LighthouseKategorije;
  };
  claude?: ClaudeSud;
  tehnologije?: Tehnologija[];
  cms?: string;
  booking?: string;
  formaZaTermin?: boolean;
};

export type PojasKvaliteta = "los" | "srednji" | "dobar";

/** Pojasevi iz plana §2.4: loš < 40, srednji 40–69, dobar ≥ 70. */
export const POJAS_GRANICE = { srednji: 40, dobar: 70 } as const;

export const POJAS_NATPISI: Record<PojasKvaliteta, string> = {
  los: "loš",
  srednji: "srednji",
  dobar: "dobar",
};

const TEZINE = {
  performance: 0.25,
  seo: 0.15,
  accessibility: 0.1,
  bestPractices: 0.1,
  claude: 0.4,
} as const;

function konacanBroj(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Prosek pet Claudeovih ocena (1–5), ili `null` kad suda nema / nije pun. */
export function claudeProsek(claude?: ClaudeSud | null): number | null {
  if (!claude || !claude.ocene) return null;
  const vrednosti = [
    claude.ocene.prviUtisak?.ocena,
    claude.ocene.jasnocaPonude?.ocena,
    claude.ocene.putDoKontakta?.ocena,
    claude.ocene.mobilnaUpotrebljivost?.ocena,
    claude.ocene.azurnost?.ocena,
  ];
  if (!vrednosti.every(konacanBroj)) return null;
  const zbir = (vrednosti as number[]).reduce((a, b) => a + b, 0);
  return zbir / vrednosti.length;
}

/**
 * Lighthouse kategorije za ocenu: MOBILNI je merodavan (plan §2.4 piše
 * `perf(mobile)`); desktop se uzima samo za kategoriju koje mobilni izveštaj
 * nema — PSI ume da vrati desktop a da mobilni padne na timeout.
 */
function kategorija(
  lighthouse: SiteAuditZaOcenu["lighthouse"],
  ime: keyof Pick<
    LighthouseKategorije,
    "performance" | "accessibility" | "bestPractices" | "seo"
  >,
): number | null {
  const m = lighthouse?.mobile?.[ime];
  if (konacanBroj(m)) return m;
  const d = lighthouse?.desktop?.[ime];
  if (konacanBroj(d)) return d;
  return null;
}

/**
 * Ukupna ocena 0–100 ili `null`. Zaokružuje se na ceo broj — decimala bi
 * tvrdila preciznost koju sud od pet ocena nema.
 */
export function kvalitetSajta(audit: SiteAuditZaOcenu | null | undefined): number | null {
  if (!audit) return null;

  const komponente: Array<{ vrednost: number; tezina: number }> = [];

  const perf = kategorija(audit.lighthouse, "performance");
  if (perf !== null) komponente.push({ vrednost: perf, tezina: TEZINE.performance });
  const seo = kategorija(audit.lighthouse, "seo");
  if (seo !== null) komponente.push({ vrednost: seo, tezina: TEZINE.seo });
  const a11y = kategorija(audit.lighthouse, "accessibility");
  if (a11y !== null) komponente.push({ vrednost: a11y, tezina: TEZINE.accessibility });
  const bp = kategorija(audit.lighthouse, "bestPractices");
  if (bp !== null) komponente.push({ vrednost: bp, tezina: TEZINE.bestPractices });

  const prosek = claudeProsek(audit.claude);
  if (prosek !== null) komponente.push({ vrednost: prosek * 20, tezina: TEZINE.claude });

  if (komponente.length === 0) return null;

  const ukupnaTezina = komponente.reduce((a, k) => a + k.tezina, 0);
  const zbir = komponente.reduce((a, k) => a + k.vrednost * k.tezina, 0);
  const rezultat = Math.round(zbir / ukupnaTezina);
  return Math.max(0, Math.min(100, rezultat));
}

export function pojasKvaliteta(kvalitet: number): PojasKvaliteta {
  if (kvalitet < POJAS_GRANICE.srednji) return "los";
  if (kvalitet < POJAS_GRANICE.dobar) return "srednji";
  return "dobar";
}

// ─────────────────────────────────────────────────────────────────────────────
// Izvođenje imena iz liste tehnologija (plan §2.1: dozvoljeno, ime nije metrika)
// ─────────────────────────────────────────────────────────────────────────────

/** Kategorije iz `enthec/webappanalyzer` `categories.json`, po imenu. */
export const KATEGORIJA_CMS = "CMS";
export const KATEGORIJA_ECOMMERCE = "Ecommerce";
export const KATEGORIJA_BOOKING = "Appointment scheduling";
/** Pseudo-kategorija koju upisuje skill za nalaze bez otiska (vidi dole). */
export const KATEGORIJA_ZASTARELO = "Zastarelo";

/**
 * Pogodak ispod ovoga (samo DOM heuristika ili `implies`, oba 50) ne sme da
 * IMENUJE CMS/webshop/zakazivanje — lažan „Magento" na WordPress sajtu bi
 * otišao u filter i profil kao činjenica. Ista granica u JS kopiji skilla.
 */
export const PRAG_POUZDANOSTI_IMENA = 60;

function prvaUKategoriji(
  tehnologije: Tehnologija[] | undefined,
  kategorija: string,
): string | undefined {
  if (!tehnologije) return undefined;
  const pogodak = [...tehnologije]
    .filter((t) => t.kategorija === kategorija && t.pouzdanost >= PRAG_POUZDANOSTI_IMENA)
    .sort((a, b) => b.pouzdanost - a.pouzdanost)[0];
  return pogodak?.ime;
}

export function izvediCms(tehnologije?: Tehnologija[]): string | undefined {
  return prvaUKategoriji(tehnologije, KATEGORIJA_CMS);
}

export function izvediECommerce(tehnologije?: Tehnologija[]): string | undefined {
  return prvaUKategoriji(tehnologije, KATEGORIJA_ECOMMERCE);
}

export function izvediBooking(tehnologije?: Tehnologija[]): string | undefined {
  return prvaUKategoriji(tehnologije, KATEGORIJA_BOOKING);
}

// ─────────────────────────────────────────────────────────────────────────────
// Zastarela tehnologija (plan §2.3) — lista u kodu, sa obrazloženjem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Šta se računa kao zastarelo i ZAŠTO. Lista je namerno kratka: signal podiže
 * Fit ocenu i vodi ka pozivu, pa lažan „zastarelo" košta poverenje.
 *
 * - Joomla ≤ 3: grana 3.x je bez bezbednosnih zakrpa od avgusta 2023.
 * - Drupal ≤ 7: kraj života januara 2025; migracija na 10/11 je praktično
 *   nov sajt.
 * - Adobe Flash: pregledači ga ne izvršavaju od 2021 — sadržaj se ne vidi.
 * - „Bez viewport meta" (pseudo-tehnologija koju upisuje skill): stranica
 *   nema responsive raspored, pa se na telefonu učitava umanjena desktop
 *   verzija — to je i „WordPress bez responsive teme" iz plana, merena po
 *   posledici, jer se tema iz otiska ne vidi.
 * - „Tabelarni raspored" (pseudo-tehnologija): više ugnežđenih `<table>`
 *   bez CSS okvira — HTML iz ranih 2000-ih.
 */
export const ZASTARELE_TEHNOLOGIJE: ReadonlyArray<{
  ime: string;
  /** Najveća glavna verzija koja se još računa kao zastarela; bez nje — uvek. */
  doGlavneVerzije?: number;
  obrazlozenje: string;
}> = [
  { ime: "Joomla", doGlavneVerzije: 3, obrazlozenje: "Joomla 3.x nema bezbednosne zakrpe od 2023." },
  { ime: "Drupal", doGlavneVerzije: 7, obrazlozenje: "Drupal 7 je bez podrške od januara 2025." },
  { ime: "Adobe Flash", obrazlozenje: "Flash se ne izvršava ni u jednom pregledaču od 2021." },
  { ime: "Bez viewport meta", obrazlozenje: "Stranica nema responsive raspored — na telefonu je umanjen desktop." },
  { ime: "Tabelarni raspored", obrazlozenje: "Raspored stranice je u ugnežđenim tabelama, bez CSS okvira." },
];

function glavnaVerzija(verzija?: string): number | null {
  if (!verzija) return null;
  const m = /^(\d+)/.exec(verzija.trim());
  return m ? Number(m[1]) : null;
}

/** Prva zastarela tehnologija iz liste, sa obrazloženjem — ili `null`. */
export function zastarelaTehnologija(
  tehnologije?: Tehnologija[],
): { ime: string; obrazlozenje: string } | null {
  if (!tehnologije) return null;
  for (const t of tehnologije) {
    const pravilo = ZASTARELE_TEHNOLOGIJE.find((z) => z.ime === t.ime);
    if (!pravilo) continue;
    if (pravilo.doGlavneVerzije === undefined) {
      return { ime: t.ime, obrazlozenje: pravilo.obrazlozenje };
    }
    const glavna = glavnaVerzija(t.verzija);
    // Verzija koja se ne vidi NIJE zastarela verzija (§0 pravilo 4): Joomla
    // bez verzije u otisku može biti i 5.x.
    if (glavna !== null && glavna <= pravilo.doGlavneVerzije) {
      return { ime: `${t.ime} ${t.verzija}`, obrazlozenje: pravilo.obrazlozenje };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signali iz ocene (plan §2.3) — jedno mesto, koristi ga `applyImport`
// ─────────────────────────────────────────────────────────────────────────────

export const PRAG_SPOR_SAJT = 50;
export const PRAG_LOS_SEO = 60;
export const PRAG_SLAB_UX = 2.5;
export const PRAG_PUT_DO_KONTAKTA = 2;
export const PRAG_KLIKOVA_DO_KONTAKTA = 3;

export type SignalIzOcene = { kind: LeadSignalKind; value: string };

/**
 * Koji signali slede iz jedne ocene. `trebaZakazivanje` dolazi sa niše firme
 * (`niches.trebaZakazivanje`); `undefined` = niša to ne kaže → signal
 * `sajt_bez_zakazivanja` se NE upisuje (nepoznato ≠ poznato).
 *
 * Svaki signal nosi `value` — rečenicu sa brojem koji ga je okinuo, da se u
 * istoriji firme vidi ZAŠTO, ne samo ŠTA.
 */
export function signaliIzOcene(
  audit: SiteAuditZaOcenu,
  opcije: { trebaZakazivanje?: boolean } = {},
): SignalIzOcene[] {
  const out: SignalIzOcene[] = [];

  const perf = audit.lighthouse?.mobile?.performance;
  if (konacanBroj(perf) && perf < PRAG_SPOR_SAJT) {
    out.push({ kind: "sajt_spor", value: `Lighthouse mobilni performance ${perf} (< ${PRAG_SPOR_SAJT})` });
  }

  const seo = kategorija(audit.lighthouse, "seo");
  if (seo !== null && seo < PRAG_LOS_SEO) {
    out.push({ kind: "sajt_los_seo", value: `Lighthouse SEO ${seo} (< ${PRAG_LOS_SEO})` });
  }

  const prosek = claudeProsek(audit.claude);
  if (prosek !== null && prosek <= PRAG_SLAB_UX) {
    out.push({
      kind: "sajt_slab_ux",
      value: `prosek Claudeovih ocena ${prosek.toFixed(1)} od 5 (≤ ${PRAG_SLAB_UX})`,
    });
  }

  const put = audit.claude?.ocene?.putDoKontakta?.ocena;
  const klikova = audit.claude?.klikovaDoKontakta;
  if (
    (konacanBroj(put) && put <= PRAG_PUT_DO_KONTAKTA) ||
    (konacanBroj(klikova) && klikova >= PRAG_KLIKOVA_DO_KONTAKTA)
  ) {
    const delovi: string[] = [];
    if (konacanBroj(put)) delovi.push(`put do kontakta ${put}/5`);
    if (konacanBroj(klikova)) delovi.push(`${klikova} klika do kontakta`);
    out.push({ kind: "sajt_bez_puta_do_kontakta", value: delovi.join(", ") });
  }

  const zastarela = zastarelaTehnologija(audit.tehnologije);
  if (zastarela) {
    out.push({
      kind: "sajt_zastarela_tehnologija",
      value: `${zastarela.ime}: ${zastarela.obrazlozenje}`,
    });
  }

  if (opcije.trebaZakazivanje === true) {
    const booking = audit.booking ?? izvediBooking(audit.tehnologije);
    if (!booking && audit.formaZaTermin !== true) {
      out.push({
        kind: "sajt_bez_zakazivanja",
        value: "niša traži zakazivanje, a sajt nema ni alat ni formu za termin",
      });
    }
  }

  return out;
}
