/**
 * Hub „Svi projekti“ (C16, plan C15 §1.4–§2.3) — čiste funkcije prikaza.
 *
 *   - zbirno „šta me čeka“: zadaci više projekata u jednom spisku, sa
 *     oznakom projekta;
 *   - tekst za „—“ (zašto broj nije poznat) i za liniju zdravlja veze.
 *
 * Bez React-a i bez Convex-a, da se proveravaju u `node` testu.
 */

export type Hitnost = "visoka" | "srednja" | "niska";

const RANG: Record<Hitnost, number> = { visoka: 0, srednja: 1, niska: 2 };

export type ZadatakZbira = {
  kljuc: string;
  naslov: string;
  broj: number;
  hitnost: Hitnost;
  veza: string;
  radnja: string;
  imenilac: string | null;
};

export type ProjekatZbira = { workspaceId: string; slug: string; ime: string };

/** Šta je red jednog projekta javio za „šta me čeka“. */
export type CekaProjekta =
  | { stanje: "ucitava" }
  | { stanje: "greska" }
  | { stanje: "ok"; ukupno: number; zadaci: readonly ZadatakZbira[] };

export type StavkaZbira = { projekat: ProjekatZbira; zadatak: ZadatakZbira };

export type Zbir = {
  /** Svi zadaci, poređani: hitnost, pa veći broj, pa ime projekta. */
  stavke: StavkaZbira[];
  /** Zbir `ukupno` (vrste posla, isto što broji zvono). */
  ukupno: number;
  /** Koliko projekata ima bar jedan zadatak. */
  projekata: number;
  /** Projekti čiji broj nije poznat (upit je pao). */
  bezPodataka: ProjekatZbira[];
  /** Bar jedan projekat se još učitava. */
  ucitava: boolean;
};

export function zbirCekanja(
  projekti: readonly ProjekatZbira[],
  ceka: ReadonlyMap<string, CekaProjekta>,
): Zbir {
  const stavke: StavkaZbira[] = [];
  const bezPodataka: ProjekatZbira[] = [];
  let ukupno = 0;
  let projekata = 0;
  let ucitava = false;
  for (const projekat of projekti) {
    const c = ceka.get(projekat.workspaceId);
    if (c === undefined || c.stanje === "ucitava") {
      ucitava = true;
      continue;
    }
    if (c.stanje === "greska") {
      bezPodataka.push(projekat);
      continue;
    }
    ukupno += c.ukupno;
    if (c.zadaci.length > 0) projekata += 1;
    for (const zadatak of c.zadaci) stavke.push({ projekat, zadatak });
  }
  stavke.sort((a, b) => {
    const h = RANG[a.zadatak.hitnost] - RANG[b.zadatak.hitnost];
    if (h !== 0) return h;
    if (a.zadatak.broj !== b.zadatak.broj) return b.zadatak.broj - a.zadatak.broj;
    if (a.projekat.ime !== b.projekat.ime) return a.projekat.ime < b.projekat.ime ? -1 : 1;
    return a.zadatak.kljuc < b.zadatak.kljuc ? -1 : 1;
  });
  return { stavke, ukupno, projekata, bezPodataka, ucitava };
}

/** Adresa zadatka u projektu, iz huba: `/<slug><veza>`. */
export function vezaUProjektu(slug: string, veza: string): string {
  if (!veza.startsWith("/")) return `/${slug}`;
  return veza === "/" ? `/${slug}` : `/${slug}${veza}`;
}

// ── tekst ────────────────────────────────────────────────────────────────────

export type RazlogBrojke =
  | "nije_povezano"
  | "nema_podataka"
  | "previse_podataka"
  | "vise_valuta"
  | "modul_iskljucen";

/** Zašto broj nije poznat — ide uz „—“ (oblačić i čitač ekrana). */
export const RAZLOG_BROJKE: Record<RazlogBrojke, string> = {
  nije_povezano: "Kanal nije povezan",
  nema_podataka: "Još nema podataka za ovaj period",
  previse_podataka: "Previše podataka za brz zbir",
  vise_valuta: "Nalozi oglasa imaju različite valute",
  modul_iskljucen: "Modul je isključen u ovom projektu",
};

export const NAZIV_VEZE: Record<string, string> = {
  ga4: "GA4",
  meta_ig: "Instagram",
  meta_fb: "Facebook stranica",
  meta_ads: "Meta oglasi",
  google_ads: "Google oglasi",
  youtube: "YouTube",
  openreply: "OpenReply",
  threads: "Threads",
  leads: "Lead mašina",
  google_business: "Google Business",
};

export type RazlogVeze =
  | "token_istekao"
  | "token_istice"
  | "greska_veze"
  | "pao_prolaz"
  | "zastao"
  | "stari_podaci";

function mnozina(n: number, jedan: string, dva: string, pet: string): string {
  const m100 = Math.abs(n) % 100;
  const m10 = Math.abs(n) % 10;
  if (m10 === 1 && m100 !== 11) return jedan;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return dva;
  return pet;
}

/** Jedna rečenica o vezi: „Instagram token ističe za 9 dana“. `null` = sve u redu. */
export function tekstVeze(veza: {
  provider: string;
  razlog: RazlogVeze | null;
  za?: number;
}): string | null {
  const ime = NAZIV_VEZE[veza.provider] ?? veza.provider;
  switch (veza.razlog) {
    case null:
      return null;
    case "token_istekao":
      return `${ime}: pristup je istekao, poveži ponovo`;
    case "token_istice": {
      const d = veza.za ?? 0;
      return d <= 0
        ? `${ime}: pristup ističe danas`
        : `${ime}: pristup ističe za ${d} ${mnozina(d, "dan", "dana", "dana")}`;
    }
    case "greska_veze":
      return `${ime}: veza je u grešci`;
    case "pao_prolaz":
      return `${ime}: poslednja sinhronizacija nije uspela`;
    case "zastao":
      return `${ime}: sinhronizacija je zastala`;
    case "stari_podaci": {
      const h = veza.za ?? 0;
      if (h >= 48) {
        const d = Math.floor(h / 24);
        return `${ime}: bez novih podataka ${d} ${mnozina(d, "dan", "dana", "dana")}`;
      }
      return `${ime}: bez novih podataka ${h} h`;
    }
  }
}
