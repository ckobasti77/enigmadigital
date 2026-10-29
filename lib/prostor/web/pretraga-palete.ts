/**
 * Pretraga u ⌘K — ČISTO (vitest), SPAJANJE S24 (P20, paritet redovi 6 i 30).
 *
 * Devotion `workspace/search-dialog.tsx` uliven u Enigminu paletu. Pet grupa
 * radnog dela, istim redom: Stranice i Zadaci (`search.pages`, po `kind`),
 * Ideje i Beleške (`search.ideasAndThoughts`), Poruke (`chat.searchMessages`),
 * pa Firme iz Leadova po imenu (`leadFiltersStore.listLeadsFiltered`, `q`).
 *
 * Pretraga je po projektu (Devotion P21), nikad kroz sve projekte. U „Ja“
 * traže se samo lični razgovori (`workspaceId: null`). Upit kreće posle
 * 300 ms mirovanja i najmanje dva znaka, kao u Devotionu.
 */
import type { Id } from "../../../convex/_generated/dataModel";
import { ekranRute, jaHref } from "../rute";

export const PRETRAGA_MIN_ZNAKOVA = 2;
export const PRETRAGA_KASNJENJE_MS = 300;
/** Plafon upita na serveru (isto kao Devotion). */
export const PRETRAGA_LIMIT = 30;
/** Firme: samo prvih nekoliko po imenu; ceo spisak je u tabeli Leadova. */
export const PRETRAGA_FIRME = 5;
/** Koliko pogodaka grupe paleta pokazuje; ostatak se dobija užim upitom. */
export const POGODAKA_PO_GRUPI = 6;

/** Termin za upit, ili `null` dok nema dovoljno znakova. */
export function terminPretrage(upit: string): string | null {
  const t = upit.trim().slice(0, 200);
  return t.length >= PRETRAGA_MIN_ZNAKOVA ? t : null;
}

export type VrstaPogotka = "stranica" | "zadatak" | "ideja" | "beleska" | "poruka" | "firma";

export type Pogodak = {
  /** Jedinstven ključ u paleti. */
  id: string;
  vrsta: VrstaPogotka;
  naslov: string;
  opis: string;
  /**
   * Kuda vodi. Pogodak projekta je putanja BEZ prefiksa (paleta dodaje
   * prefiks tekućeg projekta); lični razgovor je pun put „Ja“.
   */
  href: string;
  uJa: boolean;
};

export type GrupaPogodaka = {
  vrsta: VrstaPogotka;
  naslov: string;
  pogoci: Pogodak[];
  /** Koliko je stiglo sa servera (pre plafona grupe). */
  ukupno: number;
};

type StranicaUlaz = {
  _id: Id<"pages">;
  kind: string;
  title: string;
  area: { label: string } | null;
};
type CvorUlaz = { _id: Id<"ideaNodes"> | Id<"thoughtNodes">; title: string | null; text: string };
type PorukaUlaz = {
  _id: Id<"chatMessages">;
  channelId: Id<"chatChannels">;
  channelName: string;
  body: string;
  author: { displayName: string } | null;
};
type FirmaUlaz = {
  assignment: { companyId: Id<"leadCompanies"> | string };
  company: { name: string; city?: string } | null;
};

export type UlazPretrage = {
  stranice?: ReadonlyArray<StranicaUlaz>;
  cvorovi?: { ideas: ReadonlyArray<CvorUlaz>; thoughts: ReadonlyArray<CvorUlaz> };
  poruke?: ReadonlyArray<PorukaUlaz>;
  firme?: ReadonlyArray<FirmaUlaz>;
};

const NASLOVI: Record<VrstaPogotka, string> = {
  stranica: "Stranice",
  zadatak: "Zadaci",
  ideja: "Ideje",
  beleska: "Beleške",
  poruka: "Poruke",
  firma: "Firme",
};

// Naslov ideje/misli je opcion — kad ga nema, tekst čvora nosi primarni red.
function naslovCvora(cvor: CvorUlaz): string {
  return cvor.title?.trim() || cvor.text.trim() || "Bez naslova";
}
function opisCvora(cvor: CvorUlaz): string {
  const naslov = cvor.title?.trim();
  const tekst = cvor.text.trim();
  return naslov && tekst ? tekst : "";
}

function stranica(page: StranicaUlaz): Pogodak {
  const zadatak = page.kind === "task";
  return {
    id: `${zadatak ? "zadatak" : "stranica"}:${page._id}`,
    vrsta: zadatak ? "zadatak" : "stranica",
    naslov: page.title.trim() || "Bez naslova",
    opis: page.area?.label ?? "",
    href: ekranRute({ kind: "page", pageId: page._id }),
    uJa: false,
  };
}

function poruka(m: PorukaUlaz, uJa: boolean): Pogodak {
  const kanal = m.channelName.trim() || "Razgovor";
  return {
    id: `poruka:${m._id}`,
    vrsta: "poruka",
    naslov: m.body.trim() || "Prilog",
    opis: m.author ? `${kanal} · ${m.author.displayName}` : kanal,
    href: uJa
      ? jaHref({ kind: "me-chat", channelId: m.channelId })
      : ekranRute({ kind: "chat", channelId: m.channelId }),
    uJa,
  };
}

/**
 * Rezultati upita → grupe palete, stalnim redom. Grupa bez pogodaka izostaje.
 * `opseg` „ja“ prima samo poruke (lični razgovori).
 */
export function grupisiPogotke(ulaz: UlazPretrage, opseg: "ja" | "projekat"): GrupaPogodaka[] {
  const uJa = opseg === "ja";
  const po: Record<VrstaPogotka, Pogodak[]> = {
    stranica: [],
    zadatak: [],
    ideja: [],
    beleska: [],
    poruka: [],
    firma: [],
  };
  if (!uJa) {
    for (const page of ulaz.stranice ?? []) {
      const p = stranica(page);
      po[p.vrsta].push(p);
    }
    for (const cvor of ulaz.cvorovi?.ideas ?? []) {
      po.ideja.push({
        id: `ideja:${cvor._id}`,
        vrsta: "ideja",
        naslov: naslovCvora(cvor),
        opis: opisCvora(cvor),
        href: ekranRute({ kind: "ideas", ideaId: cvor._id as Id<"ideaNodes"> }),
        uJa: false,
      });
    }
    for (const cvor of ulaz.cvorovi?.thoughts ?? []) {
      // Devotion vodi na Beleške; misao projekta živi na mapi beleški projekta.
      po.beleska.push({
        id: `beleska:${cvor._id}`,
        vrsta: "beleska",
        naslov: naslovCvora(cvor),
        opis: opisCvora(cvor),
        href: ekranRute({ kind: "thoughts" }),
        uJa: false,
      });
    }
    for (const red of ulaz.firme ?? []) {
      if (!red.company) continue;
      po.firma.push({
        id: `firma:${String(red.assignment.companyId)}`,
        vrsta: "firma",
        naslov: red.company.name,
        opis: red.company.city ?? "",
        href: `/leadovi/${encodeURIComponent(String(red.assignment.companyId))}`,
        uJa: false,
      });
    }
  }
  for (const m of ulaz.poruke ?? []) po.poruka.push(poruka(m, uJa));

  return (Object.keys(NASLOVI) as VrstaPogotka[])
    .filter((vrsta) => po[vrsta].length > 0)
    .map((vrsta) => ({
      vrsta,
      naslov: NASLOVI[vrsta],
      pogoci: po[vrsta].slice(0, POGODAKA_PO_GRUPI),
      ukupno: po[vrsta].length,
    }));
}
