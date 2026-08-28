/**
 * Ljudski natpisi za vrednosti iz baze koje operater vidi na ekranu.
 *
 * Ključevi iz `LEAD_SIGNAL_KINDS` su imena za kod, ne za čoveka: „nema_sajt"
 * i „koristi_third_party_booking" su se ranije ispisivali sirovi u tabeli
 * uvoza. Ovde stoji jedan rečnik da ne bi svaki ekran pravio svoj.
 */
import type { LeadSignalKind } from "@/convex/lib/leadNormalize";

export const LEAD_SIGNAL_LABELS: Record<LeadSignalKind, string> = {
  nema_sajt: "nema sajt",
  koristi_third_party_booking: "koristi tuđi sistem za zakazivanje",
  samo_facebook: "samo Facebook",
  samo_instagram: "samo Instagram",
  visok_broj_recenzija: "visok broj recenzija",
  novootvorena_firma: "novootvorena firma",
  landing_opened: "otvorio landing stranicu",
  r_link_clicked: "kliknuo na naš link",
  komentar: "komentar",
  dm: "direktna poruka",
  mention: "pominjanje",
  pitao_cenu: "pitao za cenu",
  ostalo: "ostalo",
};

/**
 * Signal koji nije u rečniku se ispisuje kakav jeste, uz oznaku da ga ne
 * poznajemo — tiho preimenovanje u „ostalo" bi sakrilo da je neko dodao novu
 * vrstu signala a UI nije ispraćen.
 */
export function leadSignalLabel(kind: string): string {
  return (LEAD_SIGNAL_LABELS as Record<string, string>)[kind] ?? `${kind} (nepoznat signal)`;
}

/** Statusi uvoza — isti natpisi u istoriji i u pregledu staging-a. */
export const IMPORT_STATUS_LABELS: Record<string, string> = {
  parsiran: "Parsiran",
  u_pregledu: "U pregledu",
  primenjen: "Primenjen",
  ponisten: "Poništen",
  neuspeo: "Neuspeo",
};

/** Faze prodajnog toka — CRM (§9.1) */
export const LEAD_STAGE_LABELS: Record<string, string> = {
  nov: "Nov",
  u_radu: "U radu",
  poslata_ponuda: "Poslata ponuda",
  sastanak: "Sastanak",
  dobijen: "Dobijen",
  izgubljen: "Izgubljen",
  odlozen: "Odložen",
};

export function leadStageLabel(stage: string): string {
  return LEAD_STAGE_LABELS[stage] ?? stage;
}

/** Vrste rupa u podacima (§9.2) */
export const LEAD_GAP_LABELS: Record<string, string> = {
  bez_telefona: "Bez telefona",
  bez_kontakt_osobe: "Bez kontakt osobe",
  bez_vlasnika: "Bez vlasnika",
  bez_sajta: "Bez sajta",
  bez_pib: "Bez PIB-a",
};

export function leadGapLabel(gapType: string): string {
  return LEAD_GAP_LABELS[gapType] ?? gapType;
}

/** Pravni osnov obrade podataka o ličnosti (ZZPL / GDPR, §8) */
export const LAWFUL_BASIS_LABELS: Record<string, string> = {
  legitimate_interest: "Legitimni interes (ZZPL čl. 12 st. 1 tač. 6)",
  consent: "Pristanak lica (ZZPL čl. 15)",
  contract: "Izvršenje ugovora (ZZPL čl. 12 st. 1 tač. 2)",
  legal_obligation: "Zakonska obaveza (ZZPL čl. 12 st. 1 tač. 3)",
  public_interest: "Javni interes (ZZPL čl. 12 st. 1 tač. 5)",
  vital_interest: "Životni interesi (ZZPL čl. 12 st. 1 tač. 4)",
};

export function lawfulBasisLabel(basis?: string): string {
  if (!basis || !basis.trim()) return "Nema pravnog osnova";
  return LAWFUL_BASIS_LABELS[basis] ?? basis;
}

/** Uloge osoba u privrednom subjektu */
export const PERSON_ROLE_LABELS: Record<string, string> = {
  vlasnik: "Vlasnik",
  direktor: "Direktor",
  menadzer: "Menadžer",
  nepoznato: "Nepoznata uloga",
};

export function personRoleLabel(role: string): string {
  return PERSON_ROLE_LABELS[role] ?? role;
}

/** Tipovi komunikacionih identiteta */
export const IDENTITY_KIND_LABELS: Record<string, string> = {
  phone: "Telefon",
  email: "E-mail",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Veb sajt",
  threads: "Threads",
};

export function identityKindLabel(kind: string): string {
  return IDENTITY_KIND_LABELS[kind] ?? kind;
}

/** Stepen pouzdanosti tvrdnje u poreklu */
export const CONFIDENCE_LABELS: Record<string, string> = {
  tacno: "Tačno (pročitano)",
  priblizno: "Približno (izvedeno)",
  nepoznato: "Nepoznata pouzdanost",
};

export function confidenceLabel(conf: string): string {
  return CONFIDENCE_LABELS[conf] ?? conf;
}


