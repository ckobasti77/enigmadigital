"use client";

import { useId } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  ShieldAlert,
  Sparkles,
  User,
  Phone,
  Building2,
  Globe,
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
import { api } from "@/convex/_generated/api";
import { leadSignalLabel } from "./lead-labels";

/**
 * Tip reda dolazi iz same Convex funkcije, ne iz ručno prepisane kopije sheme.
 *
 * Ručna kopija je već bila odlutala: `unverifiable` je ovde imao četiri
 * vrednosti, a shema ih ima pet (`companyId`), i razlika se nije videla jer
 * ju je `row as StagingRowDoc` u tabeli gutao. Prepisan tip ne prijavljuje
 * kad shema ode napred — izvedeni prijavljuje.
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
    label: "Spoji sa postojećom",
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
    description: "Zahteva ljudsku proveru. Ako ostane nerazrešeno, biće preskočeno pri primeni.",
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

/**
 * `suppression.matchedOn` NIJE isti skup vrednosti kao `matchedBy`. Ranije su
 * obe prolazile kroz MATCHED_BY_LABELS, pa su „email" i „companyId" ispadali
 * kao goli ključevi iz baze.
 */
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

export function formatRatingDisplay(ocena?: StagingRowDoc["parsed"]["ocena"]): string {
  if (!ocena) return "Nema ocene";
  const { vrednost, skala, brojRecenzija, izvor } = ocena;

  // Nula recenzija je podatak (nov biznis), ne odsustvo podatka.
  const recStr =
    brojRecenzija !== undefined ? `${brojRecenzija} rec.` : undefined;

  // Pravilo (§0, §5.1): ako skala nedostaje, vrednost se NE prikazuje sama —
  // broj bez skale nema značenje i 9.4 bi izgledalo bolje od 5.0.
  if (skala !== undefined && vrednost !== undefined) {
    const inside = [izvor, recStr].filter(Boolean).join(", ");
    return `${vrednost}/${skala}${inside ? ` (${inside})` : ""}`;
  }

  if (izvor || recStr) {
    const inside = [izvor, recStr].filter(Boolean).join(", ");
    // Ako je stigla vrednost bez skale, to se kaže — ne prećutkuje se kao
    // „nema ocene", jer podatak postoji, samo je neupotrebljiv.
    return vrednost !== undefined
      ? `Ocena bez poznate skale (${inside})`
      : `Izvor: ${inside}`;
  }

  return vrednost !== undefined ? "Ocena bez poznate skale" : "Nema ocene";
}

export function ImportRowDialog({
  row,
  open,
  onOpenChange,
  onDecisionChange,
  readOnly = false,
}: {
  row: StagingRowDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecisionChange?: (decision: StagingRowDoc["decision"]) => void;
  readOnly?: boolean;
}) {
  const selectId = useId();

  if (!row) return null;

  const { parsed, suppression, conflicts, matchedBy, matchedCompanyId, decision } = row;
  const isGradDerived = parsed.derivedFields?.includes("grad");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogClose />
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="text-micro font-semibold uppercase tracking-wider text-text-muted">
              List: {row.sourceSheet} · Red: {row.sourceRowIndex}
            </span>
          </div>
          <DialogTitle className="text-lg font-semibold text-foreground">
            {parsed.nazivFirme || "Neimenovana firma"}
          </DialogTitle>
          <DialogDescription>
            Detaljni pregled pročitanih podataka, prepoznatih veza, sukoba i statusa zabrane kontakta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2 text-sm">
          {/* Birač odluke */}
          <div className="rounded-lg border border-line bg-surface p-3.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label htmlFor={selectId} className="text-xs font-semibold text-text-primary">
                  Odluka operatera za ovaj red:
                </label>
                <p className="text-xs text-text-muted">
                  {DECISION_LABELS[decision].description}
                </p>
              </div>
              <div className="shrink-0">
                {readOnly ? (
                  <span
                    className={cn(
                      "inline-flex rounded-md border px-2.5 py-1 text-xs font-medium",
                      DECISION_LABELS[decision].className,
                    )}
                  >
                    {DECISION_LABELS[decision].label}
                  </span>
                ) : (
                  <select
                    id={selectId}
                    value={decision}
                    onChange={(e) =>
                      onDecisionChange?.(
                        e.target.value as StagingRowDoc["decision"],
                      )
                    }
                    className="rounded-md border border-line-soft bg-surface-raised px-3 py-1.5 text-xs font-medium text-foreground outline-none transition-colors focus:border-accent-400"
                  >
                    <option value="nova_firma">Nova firma</option>
                    <option value="spoji">Spoji sa postojećom</option>
                    <option value="preskoci">Preskoči</option>
                    <option value="nerazreseno">Nerazrešeno</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Zabrana kontakta — TRI stanja: zabranjen / neproverljiv / čist.
              Četvrto stanje je „provera nije ni zabeležena" i ono se NE sme
              prikazati kao čisto. */}
          {suppression === undefined && (
            <FeedbackNote
              tone="warning"
              title="Provera zabrane kontakta nije zabeležena za ovaj red"
            >
              Za ovaj red ne postoji zapis o proveri liste zabrane kontakta. To
              nije isto što i „čisto" — znači da se ne zna. Pre primene proveri
              ručno ili ponovi uvoz reda.
            </FeedbackNote>
          )}

          {suppression?.suppressed === true && (
            <FeedbackNote
              tone="danger"
              title={`Na listi zabrane kontakta (po: ${
                suppression.matchedOn
                  ? SUPPRESSION_MATCH_LABELS[suppression.matchedOn]
                  : "nezabeleženom kriterijumu"
              })`}
            >
              Ovaj unos odgovara firmi ili kontaktu na listi zabrane pozivanja. Podrazumevana preporuka je preskakanje uvoza.
            </FeedbackNote>
          )}

          {suppression?.unverifiable && suppression.unverifiable.length > 0 && (
            <FeedbackNote
              tone="warning"
              title="Zabrana kontakta nije mogla da se proveri"
            >
              Provera nije mogla pouzdano da se izvede za:{" "}
              <span className="font-semibold text-warning">
                {suppression.unverifiable.map((u) => FIELD_LABELS[u] ?? u).join(", ")}
              </span>
              . Vrednost se ne normalizuje, pa se ne zna da li je na listi.
              „Ne zna se" nije dozvola — red ostaje nerazrešen dok ga operater ne proveri.
            </FeedbackNote>
          )}

          {suppression !== undefined &&
            suppression.suppressed === false &&
            (!suppression.unverifiable || suppression.unverifiable.length === 0) && (
              <FeedbackNote
                tone="success"
                title="Provera zabrane kontakta: čisto"
              >
                Nijedan podatak se ne nalazi na listi zabrane kontakta.
              </FeedbackNote>
            )}

          {/* Sukobi vrednosti */}
          {conflicts && conflicts.length > 0 ? (
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
                        <span className="text-text-muted">Postojeće u bazi:</span>{" "}
                        <span className="font-medium text-foreground">{c.postojeca || "—"}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Novo iz tabele:</span>{" "}
                        <span className="font-medium text-warning">{c.nova || "—"}</span>
                      </div>
                    </div>
                    <div className="mt-1 text-micro text-text-muted">
                      Izvor sukoba: {c.izvor}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            matchedCompanyId && (
              <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface p-3 text-xs text-text-muted">
                <CheckCircle2 className="size-4 text-success shrink-0" />
                <span>
                  Nema sukoba vrednosti. Podaci iz tabele se poklapaju sa postojećom firmom u bazi.
                </span>
              </div>
            )
          )}

          {/* Spajanje sa postojećom firmom */}
          {matchedCompanyId && (
            <div className="rounded-lg border border-line bg-surface p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-text-primary mb-1">
                <Building2 className="size-4 text-accent-400 shrink-0" />
                <span>
                  Prepoznato spajanje sa firmom u bazi
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                Pronađeno podudaranje po kriterijumu:{" "}
                <span className="font-semibold text-foreground">
                  {matchedBy ? MATCHED_BY_LABELS[matchedBy] : "nepoznatom kriterijumu"}
                </span>
              </p>
            </div>
          )}

          {/* Izvedeni podaci */}
          {isGradDerived && (
            <div className="flex items-start gap-2 rounded-lg border border-accent-400/30 bg-accent-400/5 p-3 text-xs text-text-secondary">
              <Sparkles className="size-4 text-accent-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-text-primary">Izveden podatak o gradu: </span>
                Vrednost <span className="font-semibold text-foreground">„{parsed.grad}“</span> je izvedena iz opštine <span className="font-semibold text-foreground">„{parsed.opstina}“</span> i nije bila eksplicitno navedena u tabeli. U bazi se beleži sa nivoom pouzdanosti „približno“.
              </div>
            </div>
          )}

          {/* Telefonska napomena (§5.1 zamka 4) */}
          {parsed.telefonNapomena && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                <Phone className="size-3.5 shrink-0" />
                <span>Tekst iz polja za telefon:</span>
              </div>
              <p className="text-foreground">„{parsed.telefonNapomena}“</p>
              <p className="mt-1 text-micro text-text-muted">
                Ovaj tekst je prepoznat kao rečenica umesto validnog broja telefona i sačuvan je kao napomena.
              </p>
            </div>
          )}

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

          {/* Svi pročitani podaci */}
          <div className="space-y-3 rounded-lg border border-line bg-surface p-3.5">
            <div className="text-xs font-semibold text-text-primary">
              Pročitani podaci iz tabele:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              <div>
                <span className="text-text-muted">Ulica i lokacija:</span>
                <p className="font-medium text-foreground">
                  {parsed.ulica || "—"}
                  {parsed.opstina ? `, ${parsed.opstina}` : ""}
                  {parsed.grad ? (
                    <>
                      , {parsed.grad}
                      {isGradDerived && (
                        <span className="ml-1.5 inline-block rounded bg-accent-400/20 px-1 py-0.2 text-[10px] text-accent-400 font-medium">
                          izvedeno
                        </span>
                      )}
                    </>
                  ) : ""}
                </p>
              </div>

              <div>
                <span className="text-text-muted">Telefon:</span>
                <p className="font-medium text-foreground">
                  {parsed.telefon || "—"}
                </p>
              </div>

              <div>
                <span className="text-text-muted">E-mail:</span>
                <p className="font-medium text-foreground">
                  {parsed.email || "—"}
                </p>
              </div>

              <div>
                <span className="text-text-muted">Veb sajt:</span>
                <p className="font-medium text-foreground">
                  {parsed.sajt ? (
                    <a
                      href={parsed.sajt.startsWith("http") ? parsed.sajt : `https://${parsed.sajt}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent-400 hover:underline"
                    >
                      {parsed.sajt}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    "—"
                  )}
                </p>
              </div>

              <div>
                <span className="text-text-muted">Kontakt osoba:</span>
                <p className="font-medium text-foreground">
                  {parsed.imeOsobe ? (
                    <>
                      {parsed.imeOsobe}
                      {parsed.uloga ? ` (${parsed.uloga})` : ""}
                    </>
                  ) : (
                    "—"
                  )}
                </p>
              </div>

              <div>
                <span className="text-text-muted">Ocena i recenzije:</span>
                <p className="font-medium text-foreground">
                  {formatRatingDisplay(parsed.ocena)}
                </p>
              </div>

              <div>
                <span className="text-text-muted">PIB / Matični broj:</span>
                <p className="font-medium text-foreground">
                  {parsed.pib || "—"} {parsed.maticniBroj ? `/ ${parsed.maticniBroj}` : ""}
                </p>
              </div>

              <div>
                <span className="text-text-muted">Šifra delatnosti:</span>
                <p className="font-medium text-foreground">
                  {parsed.sifraDelatnosti || "—"}
                </p>
              </div>

              <div>
                <span className="text-text-muted">CompanyWall:</span>
                <p className="font-medium text-foreground">
                  {parsed.companyWallUrl ? (
                    <a
                      href={parsed.companyWallUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent-400 hover:underline"
                    >
                      Link
                      <ExternalLink className="size-3" />
                      <span className="text-micro text-text-muted">
                        ({parsed.companyWallTacnost === "tacno" ? "tačno" : "aproks."})
                      </span>
                    </a>
                  ) : (
                    "—"
                  )}
                </p>
              </div>

              <div>
                <span className="text-text-muted">Izvori podataka:</span>
                <p className="font-medium text-foreground">
                  {parsed.izvori && parsed.izvori.length > 0
                    ? parsed.izvori.join(", ")
                    : "—"}
                </p>
              </div>
            </div>

            {parsed.napomena && (
              <div className="pt-2 border-t border-line-soft">
                <span className="text-text-muted">Napomena za prodaju:</span>
                <p className="mt-0.5 text-foreground leading-relaxed">
                  {parsed.napomena}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Zatvori
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
