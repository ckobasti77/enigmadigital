/**
 * ============================================================================
 * KOLONE TABELE LEADOVA — jedan izvor za tabelu, kartice i merenje (A3, O2)
 * ============================================================================
 *
 * Izmereno 9.9.2026 (plan §1.2): šest od deset kolona nosilo je ISTU vrednost
 * u 100 % redova (Intent „bez signala", Faza „Nov", Vlasnik „Ti", Poslednji
 * dodir „Bez dodira", Sledeći korak „Nema koraka", Temperatura „Nova firma").
 * Ovde stoji ono što svaka nova kolona STVARNO prikazuje, kao čist string —
 * bez React-a — da bi `scripts/leads-table-entropy.ts` mogao da izmeri
 * raznolikost nad istim podacima koje tabela crta, a ne nad procenom.
 *
 * Pravilo iz plana §0: nepoznato ≠ nula. Kad podatak fali, vrednost je „—".
 */
import type { LeadScore } from "@/convex/lib/leadScoring";
import { pojasKvaliteta, POJAS_NATPISI } from "@/convex/lib/siteScore";
import { formatClockTime, formatDayRelative, localDayDiff } from "@/lib/format";
import { normalizeTemperatura, TEMPERATURE_LABEL } from "@/lib/temperature";
import { leadSignalLabel, leadStageLabel } from "./lead-labels";
import {
  isMeetingSoon,
  isMeetingUnresolved,
  isNextActionOverdue,
  type LeadRowItem,
} from "./lead-urgency";

/** Kolone tabele posle A3, redosledom kojim se crtaju. `vlasnik` je uslovna. */
export const LEAD_COLUMNS = [
  "firma",
  "fitIntent",
  "zasto",
  "sajt",
  "telefon",
  "stanje",
  "vlasnik",
  "sledeciKorak",
  "akcije",
] as const;
export type LeadColumnKey = (typeof LEAD_COLUMNS)[number];

/**
 * Kolone koje su UKLONJENE u A3 jer su imale istu vrednost u 100 % redova.
 * `scripts/leads-table-entropy.ts` pada ako se bilo koja vrati u `LEAD_COLUMNS`.
 * `vlasnik` je izuzetak sa pravilom: crta se SAMO kad radni prostor ima više
 * od jednog člana (vidi `LeadsTable`), pa ostaje u spisku kolona.
 */
export const REMOVED_COLUMNS = ["intent", "faza", "poslednjiDodir", "signaliBroj", "temperatura"] as const;

export const LEAD_COLUMN_LABEL: Record<LeadColumnKey, string> = {
  firma: "Firma",
  fitIntent: "Fit / Intent",
  zasto: "Zašto",
  sajt: "Sajt",
  telefon: "Telefon",
  stanje: "Stanje",
  vlasnik: "Vlasnik",
  sledeciKorak: "Sledeći korak",
  akcije: "Akcije",
};

/** Kolona čije se ponavljanje ne meri: naziv firme je identitet reda. */
export const ENTROPY_EXEMPT: readonly LeadColumnKey[] = ["firma"];

/** Gornja granica udela najčešće vrednosti (plan §4/2): preko ovoga kolona je „mrtva". */
export const MAX_SAME_SHARE = 0.9;

// ─────────────────────────────────────────────────────────────────────────────
// Fit / Intent
// ─────────────────────────────────────────────────────────────────────────────

/** Procenat ose, ili `null` kad se ne može izmeriti (bez pravila / bez signala). */
export function axisPct(axis: LeadScore["fit"] | undefined): number | null {
  if (!axis || axis.maxPoints === 0 || axis.signalsCounted === 0) return null;
  return Math.round((axis.points / axis.maxPoints) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Zašto — stvarni signali, najviše tri + „+N"
// ─────────────────────────────────────────────────────────────────────────────

export const ZASTO_MAX = 3;

/**
 * Prodajni signali imaju prednost pred tehničkim: „nema sajt" govori više od
 * „sajt bez HTTPS-a". Redosled je stalan da bi isti skup signala uvek dao iste
 * čipove — i u tabeli i u kartici „Danas".
 */
const SIGNAL_PRIORITET: readonly string[] = [
  "nema_sajt",
  "sajt_ne_radi",
  "koristi_third_party_booking",
  "pitao_cenu",
  "r_link_clicked",
  "landing_opened",
  "dm",
  "komentar",
  "mention",
  "novootvorena_firma",
  "visok_broj_recenzija",
  "samo_instagram",
  "samo_facebook",
  "sajt_bez_zakazivanja",
  "sajt_spor",
  "sajt_los_seo",
  "sajt_slab_ux",
  "sajt_bez_puta_do_kontakta",
  "sajt_zastarela_tehnologija",
  "sajt_bez_https",
  "ostalo",
];

export function zastoSignals(item: LeadRowItem): { shown: string[]; rest: number } {
  const unique = [...new Set(item.signali)];
  unique.sort((a, b) => {
    const ia = SIGNAL_PRIORITET.indexOf(a);
    const ib = SIGNAL_PRIORITET.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  return { shown: unique.slice(0, ZASTO_MAX), rest: Math.max(0, unique.length - ZASTO_MAX) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sajt
// ─────────────────────────────────────────────────────────────────────────────

export type SiteSummary =
  | { kind: "nema" }
  | { kind: "neprovereno" }
  | { kind: "status"; href: string | null };

/**
 * Tri stanja, tri prikaza: „nema sajt" je prodajni signal; „neprovereno" je
 * „nismo gledali" i crta se kao „—"; sve ostalo je bedž stanja (+ link).
 */
export function siteSummary(item: LeadRowItem): SiteSummary {
  const c = item.company;
  if (!c) return { kind: "neprovereno" };
  if (c.imaSajt === "ne") return { kind: "nema" };
  const href = c.website
    ? c.website.startsWith("http")
      ? c.website
      : `https://${c.website}`
    : null;
  if (c.sajtStatus === undefined && c.imaSajt === undefined && c.sajtHttps === undefined) {
    return href ? { kind: "status", href } : { kind: "neprovereno" };
  }
  return { kind: "status", href };
}

function siteText(item: LeadRowItem): string {
  const s = siteSummary(item);
  if (s.kind === "nema") return "nema sajt";
  if (s.kind === "neprovereno") return "—";
  const c = item.company!;
  const delovi: string[] = [];
  if (c.sajtStatus) delovi.push(c.sajtStatus);
  else delovi.push("ima");
  const kvalitet = item.sajtOcena?.kvalitet;
  if (typeof kvalitet === "number") delovi.push(POJAS_NATPISI[pojasKvaliteta(kvalitet)]);
  if (c.sajtHttps === false) delovi.push("bez https");
  return delovi.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Telefon — procena da broj pripada baš toj osobi (plan §6)
// ─────────────────────────────────────────────────────────────────────────────

export type PhoneSummary =
  | { kind: "nema" }
  | { kind: "bez_procene" }
  | { kind: "nije_moguce" }
  | { kind: "procena"; verovatnoca: number };

export function phoneSummary(item: LeadRowItem): PhoneSummary {
  if (item.telefoni.length === 0) return { kind: "nema" };
  // Osobe stižu rangirane sa servera (uloga, pa verovatnoća) — prva sa
  // procenom je ona kojoj se zove.
  const saProcenom = item.osobe.find((o) => o.verovatnoca !== undefined);
  if (saProcenom && saProcenom.verovatnoca !== undefined) {
    return { kind: "procena", verovatnoca: saProcenom.verovatnoca };
  }
  if (item.osobe.some((o) => o.nijeMoguceProceniti)) return { kind: "nije_moguce" };
  return { kind: "bez_procene" };
}

function phoneText(item: LeadRowItem): string {
  const p = phoneSummary(item);
  switch (p.kind) {
    case "nema":
      return "—";
    case "bez_procene":
      return "bez procene";
    case "nije_moguce":
      return "nije moguće proceniti";
    case "procena":
      return `${p.verovatnoca} %`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stanje — faza + temperatura u jednom čipu
// ─────────────────────────────────────────────────────────────────────────────

export function stateText(item: LeadRowItem): string {
  const temp = normalizeTemperatura(item.company?.temperatura);
  return `${leadStageLabel(item.assignment.stage)} · ${TEMPERATURE_LABEL[temp]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Primarna radnja — Pozovi → Zabeleži ishod → Zakaži (plan O2)
// ─────────────────────────────────────────────────────────────────────────────

export type PrimaryActionKind = "call" | "outcome" | "schedule" | "fill" | "open";

export type PrimaryAction = {
  kind: PrimaryActionKind;
  label: string;
  /** Broj koji se zove kad je `kind === "call"`. */
  phone?: string;
};

/**
 * Jedno dugme po redu, izvedeno iz stanja dodele — nikad iz slobodnog teksta:
 *
 *   zatvoren lead                    → Otvori (profil)
 *   sastanak prošao bez ishoda       → Zabeleži ishod
 *   nikad dodirnut, ima broj         → Pozovi
 *   nikad dodirnut, nema broj        → Dopuni (rupa „bez telefona")
 *   dodirnut, ishod nije zabeležen   → Zabeleži ishod
 *   ishod zabeležen, nema sastanka   → Zakaži
 *   sastanak / korak u budućnosti    → Otvori
 */
export function primaryAction(item: LeadRowItem, now: number): PrimaryAction {
  const a = item.assignment;
  const phone = item.telefoni[0]?.value;

  if (a.stage === "dobijen" || a.stage === "izgubljen") {
    return { kind: "open", label: "Otvori" };
  }
  if (isMeetingUnresolved(a, now)) {
    return { kind: "outcome", label: "Zabeleži ishod" };
  }
  if (a.lastTouchAt === undefined) {
    if (phone) return { kind: "call", label: "Pozovi", phone };
    return { kind: "fill", label: "Dopuni" };
  }
  const ishodPosleDodira = a.outcomeAt !== undefined && a.outcomeAt >= a.lastTouchAt;
  if (!ishodPosleDodira) {
    return { kind: "outcome", label: "Zabeleži ishod" };
  }
  const buduciSastanak = a.meetingAt !== undefined && a.meetingAt >= now;
  const buduciKorak = a.nextActionAt !== undefined && a.nextActionAt >= now;
  if (!buduciSastanak && !buduciKorak) {
    return { kind: "schedule", label: "Zakaži" };
  }
  return { kind: "open", label: "Otvori" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sledeći korak — planiran (datum) ili izveden (predlog)
// ─────────────────────────────────────────────────────────────────────────────

export type NextStep = {
  text: string;
  /** `true` = čovek je upisao rok/sastanak; `false` = predlog izveden iz stanja. */
  planned: boolean;
  tone: "danger" | "warning" | "neutral" | "muted";
  note?: string;
};

/**
 * Izmereno: „Nema koraka" u 100 % redova. Prazna ćelija koja svuda piše isto
 * ne pomaže nikome — zato, kad plan ne postoji, ćelija nosi PREDLOG izveden iz
 * istog stanja iz kog se bira primarno dugme (prigušeno, da se vidi da nije
 * upisan rok). Kad plan postoji, nosi datum i napomenu.
 */
export function nextStep(item: LeadRowItem, now: number): NextStep {
  const a = item.assignment;

  if (a.stage === "dobijen") return { text: "Dobijen", planned: true, tone: "muted" };
  if (a.stage === "izgubljen") return { text: "Izgubljen", planned: true, tone: "muted" };

  if (a.nextActionAt !== undefined) {
    const kad = `${formatDayRelative(a.nextActionAt, now)} ${formatClockTime(a.nextActionAt)}`;
    if (isNextActionOverdue(a, now)) {
      const dana = localDayDiff(now, a.nextActionAt);
      return {
        text: dana <= 0 ? `Kasni od ${formatClockTime(a.nextActionAt)}` : `Kasni ${dana} d`,
        planned: true,
        tone: "danger",
        note: a.nextActionNote,
      };
    }
    return { text: kad, planned: true, tone: "neutral", note: a.nextActionNote };
  }

  if (isMeetingUnresolved(a, now)) {
    return { text: "Ishod sastanka", planned: true, tone: "danger", note: a.meetingNote };
  }
  if (a.meetingAt !== undefined && a.meetingAt >= now) {
    return {
      text: `Sastanak ${formatDayRelative(a.meetingAt, now)} ${formatClockTime(a.meetingAt)}`,
      planned: true,
      tone: isMeetingSoon(a, now) ? "warning" : "neutral",
      note: a.meetingNote,
    };
  }

  const p = primaryAction(item, now);
  switch (p.kind) {
    case "call":
      return { text: a.lastTouchAt === undefined ? "Prvi poziv" : "Pozvati ponovo", planned: false, tone: "muted" };
    case "fill":
      return { text: "Nađi broj", planned: false, tone: "muted" };
    case "outcome":
      return { text: "Upisati ishod", planned: false, tone: "muted" };
    case "schedule":
      return { text: "Zakazati", planned: false, tone: "muted" };
    default:
      return { text: "—", planned: false, tone: "muted" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vrednosti svih kolona kao string — ono što `verify:leads-ui` meri
// ─────────────────────────────────────────────────────────────────────────────

export function columnValues(
  item: LeadRowItem,
  score: LeadScore | undefined,
  now: number,
  selfUserId?: string,
): Record<LeadColumnKey, string> {
  const fit = axisPct(score?.fit);
  const intent = axisPct(score?.intent);
  const z = zastoSignals(item);
  const korak = nextStep(item, now);
  const isMine = selfUserId !== undefined && String(item.assignment.ownerUserId) === selfUserId;
  return {
    firma: item.company?.name ?? "—",
    fitIntent: `${fit ?? "—"} / ${intent ?? "—"}`,
    zasto:
      z.shown.length === 0
        ? "—"
        : z.shown.map(leadSignalLabel).join(", ") + (z.rest > 0 ? ` +${z.rest}` : ""),
    sajt: siteText(item),
    telefon: phoneText(item),
    stanje: stateText(item),
    vlasnik: isMine ? "Ti" : "Član tima",
    sledeciKorak: korak.text,
    akcije: primaryAction(item, now).label,
  };
}

/**
 * Vrednosti STARIH kolona (pre A3) nad istim redom — da skript može da pokaže
 * zašto su uklonjene, brojem, ne pričom.
 */
export function legacyColumnValues(
  item: LeadRowItem,
  score: LeadScore | undefined,
  now: number,
): Record<(typeof REMOVED_COLUMNS)[number], string> {
  const a = item.assignment;
  const intent = axisPct(score?.intent);
  const signala =
    score !== undefined ? score.fit.signalsCounted + score.intent.signalsCounted : undefined;
  return {
    intent: intent === null ? "bez signala" : `${intent}%`,
    faza: leadStageLabel(a.stage),
    poslednjiDodir:
      a.lastTouchAt === undefined
        ? "Bez dodira"
        : `${formatDayRelative(a.lastTouchAt, now)}`,
    signaliBroj: signala === undefined ? "nije ocenjeno" : `${signala} signala`,
    temperatura: TEMPERATURE_LABEL[normalizeTemperatura(item.company?.temperatura)],
  };
}
