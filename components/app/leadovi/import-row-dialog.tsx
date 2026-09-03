"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  MapPin,
  Phone,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { FeedbackNote } from "@/components/app/feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { leadSignalLabel } from "./lead-labels";

/**
 * Tip reda dolazi iz same Convex funkcije, ne iz ručno prepisane kopije sheme.
 */
export type StagingRowDoc = FunctionReturnType<
  typeof api.leadImportStore.listImportRows
>[number];

const DECISION_LABELS: Record<
  "nova_firma" | "spoji" | "preskoci" | "nerazreseno",
  { label: string; description: string; className: string }
> = {
  nova_firma: {
    label: "Nova firma",
    description: "Kreira se novi unos firme, kontakt osoba i signali u bazi.",
    className: "border-accent-400/40 text-accent-400 bg-accent-400/10",
  },
  spoji: {
    label: "Dopuna postojeće firme",
    description: "Dopunjuje postojeću firmu novim identitetima i signalima.",
    className: "border-success/40 text-success bg-success/10",
  },
  preskoci: {
    label: "Preskoči",
    description: "Red se neće unositi u bazu niti menjati postojeće podatke.",
    className: "border-line text-text-muted bg-surface",
  },
  nerazreseno: {
    label: "Nerazrešeno",
    description: "Zahteva ljudsku proveru pre uvoza.",
    className: "border-warning/40 text-warning bg-warning/10",
  },
};

const MATCHED_BY_LABELS: Record<
  "pib" | "companywall" | "domain" | "name_city" | "phone",
  string
> = {
  pib: "PIB",
  companywall: "CompanyWall URL",
  domain: "Domen / sajt",
  name_city: "Naziv i grad",
  phone: "Telefon",
};

const SUPPRESSION_MATCH_LABELS: Record<
  "pib" | "domain" | "phone" | "email" | "companyId",
  string
> = {
  pib: "PIB",
  domain: "domenu sajta",
  phone: "broju telefona",
  email: "e-mail adresi",
  companyId: "firmi koja je već na listi",
};

const FIELD_LABELS: Record<string, string> = {
  nazivFirme: "Naziv firme",
  ulica: "Ulica i broj",
  opstina: "Opština",
  grad: "Grad",
  telefon: "Telefon",
  email: "E-mail adresa",
  sajt: "Veb sajt",
  imeOsobe: "Kontakt osoba",
  uloga: "Uloga kontakt osobe",
  pib: "PIB",
  maticniBroj: "Matični broj",
  sifraDelatnosti: "Šifra delatnosti",
  ocena: "Ocena",
  companyWallUrl: "CompanyWall link",
  napomena: "Napomena za prodaju",
};

const TEMP_CONFIG: Record<
  StagingRowDoc["temperatura"],
  { label: string; chipClass: string; dotClass: string; borderClass: string }
> = {
  nova_firma: {
    label: "Nova firma",
    chipClass:
      "border-line-soft text-text-muted bg-surface hover:bg-surface-raised hover:text-text-secondary",
    dotClass: "bg-text-muted",
    borderClass: "border-l-line",
  },
  cold: {
    label: "Cold",
    chipClass:
      "border-[var(--temp-cold)]/40 text-[var(--temp-cold)] bg-[var(--temp-cold-bg)] hover:bg-[var(--temp-cold)]/20",
    dotClass: "bg-[var(--temp-cold)]",
    borderClass: "border-l-[var(--temp-cold)]",
  },
  warm: {
    label: "Warm",
    chipClass:
      "border-[var(--temp-warm)]/40 text-[var(--temp-warm)] bg-[var(--temp-warm-bg)] hover:bg-[var(--temp-warm)]/20",
    dotClass: "bg-[var(--temp-warm)]",
    borderClass: "border-l-[var(--temp-warm)]",
  },
  hot: {
    label: "Hot",
    chipClass:
      "border-[var(--temp-hot)]/40 text-[var(--temp-hot)] bg-[var(--temp-hot-bg)] hover:bg-[var(--temp-hot)]/20",
    dotClass: "bg-[var(--temp-hot)]",
    borderClass: "border-l-[var(--temp-hot)]",
  },
};

export function formatRatingDisplay(
  ocena?: StagingRowDoc["parsed"]["ocena"],
): string {
  if (!ocena) return "Nema ocene";
  const { vrednost, skala, brojRecenzija, izvor } = ocena;

  const recStr =
    brojRecenzija !== undefined ? `${brojRecenzija} rec.` : undefined;

  if (skala !== undefined && vrednost !== undefined) {
    const inside = [izvor, recStr].filter(Boolean).join(", ");
    return `${vrednost}/${skala}${inside ? ` (${inside})` : ""}`;
  }

  if (izvor || recStr) {
    const inside = [izvor, recStr].filter(Boolean).join(", ");
    return vrednost !== undefined
      ? `Ocena bez poznate skale (${inside})`
      : `Izvor: ${inside}`;
  }

  return vrednost !== undefined ? "Ocena bez poznate skale" : "Nema ocene";
}

function isUrl(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  return (
    /^https?:\/\//i.test(trimmed) ||
    /^(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(trimmed)
  );
}

function formatUrl(str: string): string {
  const trimmed = str.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isEmail(str: string): boolean {
  if (!str) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}

export function ImportRowDialog({
  row,
  open,
  onOpenChange,
  onDecisionChange,
  onTemperaturaChange,
  onDeleteRow,
  readOnly = false,
  isApplied = false,
}: {
  row: StagingRowDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecisionChange?: (decision: StagingRowDoc["decision"]) => void;
  onTemperaturaChange?: (temperatura: StagingRowDoc["temperatura"]) => void;
  onDeleteRow?: () => void;
  readOnly?: boolean;
  isApplied?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"podaci" | "sirovo" | "trag">(
    "podaci",
  );

  const setRowTemperaturaMutation = useMutation(
    api.leadImportStore.setRowTemperatura,
  );
  const setRowObrisanMutation = useMutation(api.leadImportStore.setRowObrisan);

  if (!row) return null;

  const {
    parsed,
    suppression,
    conflicts,
    matchedBy,
    matchedCompanyId,
    decision,
  } = row;
  const isGradDerived = parsed.derivedFields?.includes("grad");

  // Proračun broja upozorenja / stvari za proveru
  let issueCount = 0;
  if (suppression === undefined) {
    issueCount += 1;
  } else if (suppression.suppressed === true) {
    issueCount += 1;
  } else if (suppression.unverifiable && suppression.unverifiable.length > 0) {
    issueCount += 1;
  }

  if (conflicts && conflicts.length > 0) {
    issueCount += conflicts.length;
  }
  if (isGradDerived) {
    issueCount += 1;
  }
  if (parsed.telefonNapomena) {
    issueCount += 1;
  }

  const currentTemp = row.temperatura || "nova_firma";
  const tempStyle = TEMP_CONFIG[currentTemp] || TEMP_CONFIG.nova_firma;

  const handleTempCycle = () => {
    if (readOnly) return;
    const order: StagingRowDoc["temperatura"][] = [
      "nova_firma",
      "cold",
      "warm",
      "hot",
    ];
    const nextTemp = order[(order.indexOf(currentTemp) + 1) % order.length];
    if (onTemperaturaChange) {
      onTemperaturaChange(nextTemp);
    } else {
      setRowTemperaturaMutation({
        workspaceId: row.workspaceId,
        rowId: row._id,
        temperatura: nextTemp,
      }).catch(console.error);
    }
  };

  const handleDelete = () => {
    if (readOnly) return;
    if (onDeleteRow) {
      onDeleteRow();
    } else {
      setRowObrisanMutation({
        workspaceId: row.workspaceId,
        rowId: row._id,
        obrisan: true,
      }).catch(console.error);
    }
    onOpenChange(false);
  };

  // ── Grupisanje mapiranih polja za tab `Podaci` ──
  // Pravilo: polje bez vrednosti se NE crta; cela prazna grupa se NE crta.
  const kontaktFields: { label: string; value: React.ReactNode }[] = [];
  if (parsed.telefon) {
    kontaktFields.push({ label: "Telefon", value: parsed.telefon });
  }
  if (parsed.email) {
    kontaktFields.push({
      label: "E-mail adresa",
      value: (
        <a
          href={`mailto:${parsed.email}`}
          className="text-accent-400 hover:underline"
        >
          {parsed.email}
        </a>
      ),
    });
  }
  if (parsed.sajt) {
    const href = parsed.sajt.startsWith("http")
      ? parsed.sajt
      : `https://${parsed.sajt}`;
    kontaktFields.push({
      label: "Veb sajt",
      value: (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-accent-400 hover:underline"
        >
          {parsed.sajt}
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ),
    });
  }
  if (parsed.imeOsobe) {
    kontaktFields.push({
      label: "Kontakt osoba",
      value: `${parsed.imeOsobe}${parsed.uloga ? ` (${parsed.uloga})` : ""}`,
    });
  }
  if (parsed.companyWallUrl) {
    kontaktFields.push({
      label: "CompanyWall",
      value: (
        <a
          href={parsed.companyWallUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-accent-400 hover:underline"
        >
          Link
          <ExternalLink className="size-3 shrink-0" />
          {parsed.companyWallTacnost && (
            <span className="text-micro text-text-muted">
              ({parsed.companyWallTacnost === "tacno" ? "tačno" : "aproks."})
            </span>
          )}
        </a>
      ),
    });
  }

  const lokacijaFields: { label: string; value: React.ReactNode }[] = [];
  if (parsed.ulica) {
    lokacijaFields.push({ label: "Ulica i broj", value: parsed.ulica });
  }
  if (parsed.opstina) {
    lokacijaFields.push({ label: "Opština", value: parsed.opstina });
  }
  if (parsed.grad) {
    lokacijaFields.push({
      label: "Grad",
      value: (
        <span className="inline-flex items-center gap-1.5">
          {parsed.grad}
          {isGradDerived && (
            <span className="rounded bg-accent-400/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-400">
              izvedeno
            </span>
          )}
        </span>
      ),
    });
  }

  const registracijaFields: { label: string; value: React.ReactNode }[] = [];
  if (parsed.pib) {
    registracijaFields.push({ label: "PIB", value: parsed.pib });
  }
  if (parsed.maticniBroj) {
    registracijaFields.push({
      label: "Matični broj",
      value: parsed.maticniBroj,
    });
  }
  if (parsed.sifraDelatnosti) {
    registracijaFields.push({
      label: "Šifra delatnosti",
      value: parsed.sifraDelatnosti,
    });
  }

  const dodatnoFields: { label: string; value: React.ReactNode }[] = [];
  const ratingStr = formatRatingDisplay(parsed.ocena);
  if (ratingStr !== "Nema ocene") {
    dodatnoFields.push({ label: "Ocena i recenzije", value: ratingStr });
  }
  if (parsed.napomena) {
    dodatnoFields.push({
      label: "Napomena za prodaju",
      value: parsed.napomena,
    });
  }

  const fieldGroups = [
    { id: "kontakt", title: "Kontakt", icon: Phone, fields: kontaktFields },
    { id: "lokacija", title: "Lokacija", icon: MapPin, fields: lokacijaFields },
    {
      id: "registracija",
      title: "Registracija",
      icon: FileText,
      fields: registracijaFields,
    },
    {
      id: "dodatno",
      title: "Dodatni podaci",
      icon: Info,
      fields: dodatnoFields,
    },
  ].filter((g) => g.fields.length > 0);

  const displayTitle =
    parsed.nazivFirme ||
    row.sirovo.find((s) => s.vrednost && s.vrednost.trim() !== "")?.vrednost ||
    "Neimenovana firma";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        className={cn(
          "max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto border-l-[3px]",
          tempStyle.borderClass,
        )}
      >
        <DialogClose />

        {/* ═══ 1. ZAGLAVLJE ═══ */}
        <DialogHeader className="gap-2 pb-3 border-b border-line-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <DialogTitle className="text-xl font-bold text-text-primary truncate">
                  {displayTitle}
                </DialogTitle>

                {/* TEMPERATURA kao čip koji se menja klikom */}
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={handleTempCycle}
                  title={
                    readOnly
                      ? undefined
                      : "Klikni za promenu temperature (Nova firma → Cold → Warm → Hot)"
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors shrink-0",
                    tempStyle.chipClass,
                    readOnly
                      ? "cursor-default"
                      : "cursor-pointer hover:opacity-90 active:scale-95",
                  )}
                >
                  <span
                    className={cn("size-1.5 rounded-full", tempStyle.dotClass)}
                  />
                  {tempStyle.label}
                </button>
              </div>

              <DialogDescription className="text-xs text-text-muted">
                List: {row.sourceSheet} · Red: {row.sourceRowIndex}
              </DialogDescription>
            </div>

            {/* Desno: zelena tačka + „Bez upozorenja" AKO nema problema; u suprotnom broj */}
            <div className="shrink-0 pt-0.5">
              {issueCount === 0 ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                  <span className="size-2 rounded-full bg-success inline-block" />
                  <span>Bez upozorenja</span>
                </div>
              ) : (
                <div
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                    suppression?.suppressed === true
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : "border-warning/40 bg-warning/10 text-warning",
                  )}
                >
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>
                    {issueCount} {issueCount === 1 ? "stvar" : "stvari"} za
                    proveru
                  </span>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1 text-sm">
          {/* ═══ 2. UREDNO STANJE NE DOBIJA KARTICU ═══
              Kartice se crtaju SAMO kad nešto JESTE sporno */}
          {issueCount > 0 && (
            <div className="space-y-3">
              {/* Provera zabrane kontakta nije zabeležena */}
              {suppression === undefined && (
                <FeedbackNote
                  tone="warning"
                  title="Provera zabrane kontakta nije zabeležena za ovaj red"
                >
                  Za ovaj red ne postoji zapis o proveri liste zabrane kontakta.
                  To nije isto što i „čisto" — znači da se ne zna. Pre primene
                  proveri ručno ili ponovi uvoz reda.
                </FeedbackNote>
              )}

              {/* Pogodak na listi zabrane kontakta */}
              {suppression?.suppressed === true && (
                <FeedbackNote
                  tone="danger"
                  title={`Na listi zabrane kontakta (po: ${
                    suppression.matchedOn
                      ? SUPPRESSION_MATCH_LABELS[suppression.matchedOn]
                      : "nezabeleženom kriterijumu"
                  })`}
                >
                  Ovaj unos odgovara firmi ili kontaktu na listi zabrane
                  pozivanja. Podrazumevana preporuka je preskakanje uvoza.
                </FeedbackNote>
              )}

              {/* Zabrana kontakta nije mogla da se proveri */}
              {suppression?.unverifiable &&
                suppression.unverifiable.length > 0 && (
                  <FeedbackNote
                    tone="warning"
                    title="Zabrana kontakta nije mogla da se proveri"
                  >
                    Provera nije mogla pouzdano da se izvede za:{" "}
                    <span className="font-semibold text-warning">
                      {suppression.unverifiable
                        .map((u) => FIELD_LABELS[u] ?? u)
                        .join(", ")}
                    </span>
                    . Vrednost se ne normalizuje, pa se ne zna da li je na listi.
                    „Ne zna se" nije dozvola — red ostaje nerazrešen dok ga
                    operater ne proveri.
                  </FeedbackNote>
                )}

              {/* Sukobi vrednosti između fajla i baze */}
              {conflicts && conflicts.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3.5">
                  <div className="flex items-center gap-2 text-warning font-semibold text-xs mb-2">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>
                      Otkriveni sukobi vrednosti sa bazom ({conflicts.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {conflicts.map((c, i) => (
                      <div
                        key={i}
                        className="rounded border border-line-soft bg-surface-raised p-2.5 text-xs text-text-secondary"
                      >
                        <div className="font-semibold text-text-primary">
                          {FIELD_LABELS[c.field] ?? c.field}
                        </div>
                        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-micro">
                          <div>
                            <span className="text-text-muted">
                              Postojeće u bazi:
                            </span>{" "}
                            <span className="font-medium text-foreground">
                              {c.postojeca || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-muted">
                              Novo iz tabele:
                            </span>{" "}
                            <span className="font-medium text-warning">
                              {c.nova || "—"}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 text-micro text-text-muted">
                          Izvor sukoba: {c.izvor}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Izveden podatak o gradu */}
              {isGradDerived && (
                <div className="flex items-start gap-2 rounded-lg border border-accent-400/30 bg-accent-400/5 p-3 text-xs text-text-secondary">
                  <Sparkles className="size-4 text-accent-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-text-primary">
                      Izveden podatak o gradu:{" "}
                    </span>
                    Vrednost{" "}
                    <span className="font-semibold text-foreground">
                      „{parsed.grad}“
                    </span>{" "}
                    je izvedena iz opštine{" "}
                    <span className="font-semibold text-foreground">
                      „{parsed.opstina}“
                    </span>{" "}
                    i nije bila eksplicitno navedena u tabeli. U bazi se beleži
                    sa nivoom pouzdanosti „približno“.
                  </div>
                </div>
              )}

              {/* Tekst iz polja za telefon */}
              {parsed.telefonNapomena && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                  <div className="flex items-center gap-1.5 font-semibold mb-1">
                    <Phone className="size-3.5 shrink-0" />
                    <span>Tekst iz polja za telefon:</span>
                  </div>
                  <p className="text-foreground">
                    „{parsed.telefonNapomena}“
                  </p>
                  <p className="mt-1 text-micro text-text-muted">
                    Ovaj tekst je prepoznat kao rečenica umesto validnog broja
                    telefona i sačuvan je kao napomena.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ═══ 3. TRI JEZIČKA ═══ */}
          <div className="border-b border-line-soft flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("podaci")}
              className={cn(
                "px-3.5 py-2 text-xs font-semibold transition-colors border-b-2 -mb-[1px] cursor-pointer",
                activeTab === "podaci"
                  ? "border-accent-400 text-accent-400"
                  : "border-transparent text-text-muted hover:text-text-secondary",
              )}
            >
              Podaci
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sirovo")}
              className={cn(
                "px-3.5 py-2 text-xs font-semibold transition-colors border-b-2 -mb-[1px] cursor-pointer flex items-center gap-1.5",
                activeTab === "sirovo"
                  ? "border-accent-400 text-accent-400"
                  : "border-transparent text-text-muted hover:text-text-secondary",
              )}
            >
              <span>Iz fajla</span>
              <span className="rounded bg-surface px-1.5 py-0.2 text-micro text-text-muted border border-line-soft">
                {row.sirovo?.length ?? 0}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("trag")}
              className={cn(
                "px-3.5 py-2 text-xs font-semibold transition-colors border-b-2 -mb-[1px] cursor-pointer",
                activeTab === "trag"
                  ? "border-accent-400 text-accent-400"
                  : "border-transparent text-text-muted hover:text-text-secondary",
              )}
            >
              Trag
            </button>
          </div>

          {/* Sadržaj jezička: Podaci */}
          {activeTab === "podaci" && (
            <div className="space-y-3">
              {fieldGroups.length === 0 ? (
                <div className="rounded-lg border border-line-soft bg-surface py-8 text-center text-xs text-text-muted">
                  Nema mapiranih podataka za ovaj red. Sve sirove kolone možete
                  videti u jezičku „Iz fajla“.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {fieldGroups.map((group) => {
                    const GroupIcon = group.icon;
                    return (
                      <div
                        key={group.id}
                        className="rounded-lg border border-line bg-surface p-3.5"
                      >
                        <div className="flex items-center gap-1.5 mb-2.5 pb-1.5 border-b border-line-soft">
                          <GroupIcon className="size-3.5 text-accent-400" />
                          <span className="text-micro font-semibold uppercase tracking-wider text-text-muted">
                            {group.title}
                          </span>
                        </div>
                        <div className="space-y-2 text-xs">
                          {group.fields.map((field, idx) => (
                            <div key={idx}>
                              <span className="text-micro text-text-muted block">
                                {field.label}:
                              </span>
                              <div className="font-medium text-foreground">
                                {field.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sadržaj jezička: Iz fajla */}
          {activeTab === "sirovo" && (
            <div>
              {!row.sirovo || row.sirovo.length === 0 ? (
                <div className="rounded-lg border border-line bg-surface py-8 text-center text-xs text-text-muted">
                  Nema sačuvanih sirovih kolona iz uvoza.
                </div>
              ) : (
                <div className="rounded-lg border border-line bg-surface overflow-hidden">
                  <div className="max-h-[52vh] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 z-10 bg-surface-raised border-b border-line text-micro font-semibold uppercase tracking-wider text-text-muted">
                        <tr>
                          <th className="px-3.5 py-2.5 w-1/3 min-w-[140px] max-w-[220px]">
                            Kolona iz fajla
                          </th>
                          <th className="px-3.5 py-2.5">Vrednost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-soft">
                        {row.sirovo.map((col, idx) => {
                          const val = col.vrednost;
                          const isEmpty =
                            val === undefined ||
                            val === null ||
                            val.trim() === "";
                          return (
                            <tr
                              key={idx}
                              className="hover:bg-surface-raised/50 transition-colors"
                            >
                              <td className="px-3.5 py-2.5 font-medium text-text-secondary align-top break-words">
                                {col.kolona}
                              </td>
                              <td className="px-3.5 py-2.5 text-foreground align-top break-words">
                                {isEmpty ? (
                                  <span className="text-text-muted font-normal">
                                    —
                                  </span>
                                ) : isUrl(val) ? (
                                  <a
                                    href={formatUrl(val)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-accent-400 hover:underline break-all font-normal"
                                  >
                                    {val}
                                    <ExternalLink className="size-3 shrink-0 inline" />
                                  </a>
                                ) : isEmail(val) ? (
                                  <a
                                    href={`mailto:${val.trim()}`}
                                    className="text-accent-400 hover:underline break-all font-normal"
                                  >
                                    {val}
                                  </a>
                                ) : (
                                  <span className="whitespace-pre-wrap">
                                    {val}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sadržaj jezička: Trag */}
          {activeTab === "trag" && (
            <div className="space-y-3">
              {/* Poklapanje sa postojećom firmom */}
              {matchedCompanyId ? (
                <div className="rounded-lg border border-line bg-surface p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-text-primary mb-1">
                    <Building2 className="size-4 text-accent-400 shrink-0" />
                    <span>Već postoji u bazi</span>
                  </div>
                  <p className="text-xs text-text-secondary mb-2.5">
                    Pronađeno poklapanje po kriterijumu:{" "}
                    <span className="font-semibold text-foreground">
                      {matchedBy
                        ? MATCHED_BY_LABELS[matchedBy]
                        : "nepoznatom kriterijumu"}
                    </span>
                  </p>
                  <a
                    href={`/leadovi/${matchedCompanyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-accent-400/40 bg-accent-400/10 px-3 py-1.5 text-xs font-semibold text-accent-400 hover:bg-accent-400/20 transition-colors"
                  >
                    <span>Otvori profil firme u bazi</span>
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              ) : isApplied ? (
                row.createdCompanyId ? (
                  <div className="rounded-lg border border-line bg-surface p-3.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-text-primary mb-1">
                      <CheckCircle2 className="size-4 text-accent-400 shrink-0" />
                      <span>Napravljena je nova firma u bazi.</span>
                    </div>
                    <div className="mt-2.5">
                      <a
                        href={`/leadovi/${row.createdCompanyId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-accent-400/40 bg-accent-400/10 px-3 py-1.5 text-xs font-semibold text-accent-400 hover:bg-accent-400/20 transition-colors"
                      >
                        <span>Otvori profil firme</span>
                        <ExternalLink className="size-3.5" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-warning/40 bg-warning/5 p-3.5 text-xs text-warning">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="size-4 text-warning shrink-0" />
                      <span>Firma za ovaj red nije zabeležena.</span>
                    </div>
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-line-soft bg-surface p-3.5 text-xs text-text-muted">
                  <div className="flex items-center gap-2 font-medium text-text-secondary">
                    <CheckCircle2 className="size-4 text-accent-400 shrink-0" />
                    <span>Nema poklapanja u bazi</span>
                  </div>
                  <p className="mt-1 text-micro text-text-muted">
                    Ovaj red se tretira kao nova firma u sistemu.
                  </p>
                </div>
              )}

              {/* Status odluke */}
              <div className="rounded-lg border border-line bg-surface p-3.5">
                <div className="text-xs font-semibold text-text-primary mb-1.5">
                  Odluka sistema za ovaj red:
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span
                    className={cn(
                      "inline-flex w-fit rounded-md border px-2.5 py-0.5 text-xs font-medium",
                      DECISION_LABELS[decision]?.className ||
                        "border-line text-text-muted",
                    )}
                  >
                    {DECISION_LABELS[decision]?.label || decision}
                  </span>
                  <span className="text-xs text-text-muted">
                    {isApplied && decision === "nova_firma"
                      ? "Napravljen je novi unos firme."
                      : DECISION_LABELS[decision]?.description}
                  </span>
                </div>
              </div>

              {/* Izvori podataka */}
              <div className="rounded-lg border border-line bg-surface p-3.5">
                <div className="text-xs font-semibold text-text-primary mb-2">
                  Izvori podataka:
                </div>
                {parsed.izvori && parsed.izvori.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.izvori.map((izvor, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-md border border-line-soft bg-surface-raised px-2.5 py-1 text-xs font-medium text-text-secondary"
                      >
                        {izvor}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-text-muted">
                    Nema navedenih izvora
                  </span>
                )}
              </div>

              {/* Signali leada */}
              {parsed.derivedSignals && parsed.derivedSignals.length > 0 && (
                <div className="rounded-lg border border-line bg-surface p-3.5">
                  <div className="text-xs font-semibold text-text-primary mb-2">
                    Prepoznati signali:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.derivedSignals.map((sig) => (
                      <span
                        key={sig}
                        className="inline-flex items-center gap-1 rounded-md border border-line-soft bg-surface-raised px-2 py-0.5 text-micro font-medium text-text-secondary"
                      >
                        <Sparkles className="size-3 text-accent-400" />
                        {leadSignalLabel(sig)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Pouzdanost i izvedeni podaci */}
              {(isGradDerived ||
                parsed.companyWallUrl ||
                parsed.telefonNapomena) && (
                <div className="rounded-lg border border-line bg-surface p-3.5 text-xs">
                  <div className="font-semibold text-text-primary mb-2">
                    Pouzdanost i izvedeni podaci:
                  </div>
                  <div className="space-y-2 text-text-secondary">
                    {isGradDerived && (
                      <div className="flex items-center justify-between py-1 border-b border-line-soft">
                        <span className="text-text-muted">
                          Grad ({parsed.grad})
                        </span>
                        <span className="font-medium text-foreground">
                          Izvedeno iz opštine ({parsed.opstina}) · Približno
                        </span>
                      </div>
                    )}
                    {parsed.companyWallUrl && (
                      <div className="flex items-center justify-between py-1 border-b border-line-soft">
                        <span className="text-text-muted">CompanyWall URL</span>
                        <span className="font-medium text-foreground">
                          {parsed.companyWallTacnost === "tacno"
                            ? "Tačno (pročitano)"
                            : "Približno (automatski predlog)"}
                        </span>
                      </div>
                    )}
                    {parsed.telefonNapomena && (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-text-muted">
                          Napomena iz telefona
                        </span>
                        <span className="font-medium text-foreground">
                          Izvučeno iz polja za telefon
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ 4. PODNOŽJE ═══ */}
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-line-soft">
          <div>
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-text-muted hover:text-danger hover:bg-danger/10 text-xs font-medium cursor-pointer"
              >
                <Trash2 className="size-3.5 mr-1.5" />
                Obriši red
              </Button>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="border-line-soft hover:bg-surface-raised text-foreground font-semibold px-4 cursor-pointer"
          >
            Zatvori
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
