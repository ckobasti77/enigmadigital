"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Download,
  FileSpreadsheet,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Info,
  Filter,
  Columns3,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import { buildLeadCsv } from "@/convex/lib/leadExport";
import { LEAD_STAGE_LABELS, leadStageLabel } from "./lead-labels";
import type { LeadStage } from "@/convex/leadCrmStore";
import { cn } from "@/lib/utils";

type LeadExportDialogProps = {
  workspaceId: Id<"workspaces">;
  initialStage?: string;
  trigger?: React.ReactNode;
};

const ALL_STAGES: readonly LeadStage[] = [
  "nov",
  "u_radu",
  "poslata_ponuda",
  "sastanak",
  "dobijen",
  "izgubljen",
  "odlozen",
];

export function LeadExportDialog({
  workspaceId,
  initialStage,
  trigger,
}: LeadExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | undefined>(
    initialStage,
  );
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const exportData = useQuery(
    api.leadExportStore.exportLeads,
    isOpen
      ? {
          workspaceId,
          stage: selectedStage || undefined,
          onlyWithPhone: onlyWithPhone ? true : undefined,
        }
      : "skip",
  );

  const handleDownload = () => {
    if (!exportData || exportData.rows.length === 0) return;

    try {
      setIsExporting(true);
      setDownloadSuccess(false);

      // Generiši kanonski CSV sa UTF-8 BOM prefiksom i striktnim formatiranjem (§6)
      const csvContent = buildLeadCsv(exportData.rows, {
        includeBom: true,
        lineBreak: "\r\n",
      });

      // Klijentsko kreiranje fajla preko Blob-a — bez slanja podataka van pregledača (§0, §8)
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      const datum = new Date().toISOString().slice(0, 10);
      const stageSuffix = selectedStage ? `-${selectedStage}` : "";
      link.href = url;
      link.setAttribute(
        "download",
        `leadovi-kanonski-export${stageSuffix}-${datum}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadSuccess(true);
    } catch {
      // Greška pri generisanju CSV-a
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setDownloadSuccess(false);
        }
      }}
    >
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs cursor-pointer"
            >
              <Download className="size-3.5" />
              <span>Izvezi CSV</span>
            </Button>
          )
        }
      />

      <DialogPopup className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg border border-accent-400/40 bg-accent-400/10 text-accent-400">
              <FileSpreadsheet className="size-4" />
            </div>
            <div>
              <DialogTitle>Izvoz leadova u kanonski CSV</DialogTitle>
              <DialogDescription>
                Generisanje tabele u standardnom formatu za scraping i prodaju
                (§6) uz proveru pravnog osnova (§8).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Opcije filtera pre izvoza */}
          <div className="rounded-xl border border-line bg-surface p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Filter className="size-3.5 text-accent-400" />
              <span>Filteri opsega za izvoz</span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Filter po fazi */}
              <div className="flex flex-col gap-1.5">
                <label className="text-micro font-medium text-text-muted">
                  Faza u prodajnom toku:
                </label>
                <select
                  value={selectedStage ?? ""}
                  onChange={(e) =>
                    setSelectedStage(
                      e.target.value ? e.target.value : undefined,
                    )
                  }
                  className="h-8 rounded-lg border border-line bg-surface-raised px-2 text-xs text-foreground outline-none focus:border-accent-400"
                >
                  <option value="">Sve faze (kompletan radni prostor)</option>
                  {ALL_STAGES.map((stg) => (
                    <option key={stg} value={stg}>
                      {leadStageLabel(stg)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter: samo sa telefonom */}
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyWithPhone}
                    onChange={(e) => setOnlyWithPhone(e.target.checked)}
                    className="size-4 rounded border-line text-accent-400 focus:ring-accent-400"
                  />
                  <span>Samo leadovi sa brojem telefona</span>
                </label>
              </div>
            </div>
          </div>

          {/* Stanje učitavanja i pregled podataka */}
          {exportData === undefined ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface p-8 text-xs text-text-muted">
              <Loader2 className="size-4 animate-spin text-accent-400" />
              <span>Priprema podataka za izvoz i provera pravnog osnova...</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Pregled broja redova i pravnog statusa */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col rounded-xl border border-line bg-surface p-3">
                  <span className="text-micro font-medium text-text-muted">
                    Spremno za izvoz
                  </span>
                  <span className="mt-1 text-2xl font-bold text-foreground">
                    {exportData.ukupno}{" "}
                    <span className="text-xs font-normal text-text-muted">
                      {exportData.ukupno === 1 ? "firma" : "firmi"}
                    </span>
                  </span>
                </div>

                <div className="flex flex-col rounded-xl border border-line bg-surface p-3">
                  <span className="text-micro font-medium text-text-muted">
                    Izostavljeno bez pravnog osnova
                  </span>
                  <span
                    className={cn(
                      "mt-1 text-2xl font-bold",
                      exportData.izostavljenoBezOsnova > 0
                        ? "text-warning"
                        : "text-success",
                    )}
                  >
                    {exportData.izostavljenoBezOsnova}{" "}
                    <span className="text-xs font-normal text-text-muted">
                      redova
                    </span>
                  </span>
                </div>
              </div>

              {/* Obavezna napomena o pravnom osnovu (§8) */}
              {exportData.izostavljenoBezOsnova > 0 ? (
                <FeedbackNote
                  tone="warning"
                  title="Izostavljeni kontakti bez pravnog osnova (§8 ZZPL / GDPR)"
                >
                  {exportData.izostavljenoBezOsnova}{" "}
                  {exportData.izostavljenoBezOsnova === 1
                    ? "lead je izostavljen"
                    : "leadova je izostavljeno"}{" "}
                  jer kontakt podaci (telefon ili email) nemaju zabeležen pravni
                  osnov ili URL izvora. Izvoz je trenutak kada podaci napuštaju
                  sistem i prenos bez osnova nije dozvoljen.
                </FeedbackNote>
              ) : (
                <FeedbackNote
                  tone="success"
                  title="Pravni osnov verifikovan"
                >
                  Svi uključeni kontakt podaci imaju evidentiran pravni osnov i
                  izvor u bazi prema ZZPL pravilima.
                </FeedbackNote>
              )}

              {/* Pregled strukture kolona */}
              <div className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center justify-between border-b border-line-soft pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Columns3 className="size-3.5 text-accent-400" />
                    <span>Kanonske kolone (§6.1, tačno 19 kolona)</span>
                  </div>
                  <span className="text-micro font-mono text-text-muted">
                    UTF-8 sa BOM
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1">
                  {exportData.kolone.map((col: string) => (
                    <span
                      key={col}
                      className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-micro text-text-muted border border-line-soft"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {downloadSuccess && (
                <FeedbackNote
                  tone="success"
                  title="Preuzimanje je uspešno pokrenuto"
                >
                  Fajl je kreiran u Vašem pregledaču i spreman za otvaranje u
                  Excel-u ili uvoz u druge alate.
                </FeedbackNote>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-line pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(false)}
          >
            Zatvori
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={
              !exportData || exportData.rows.length === 0 || isExporting
            }
            onClick={handleDownload}
            className="gap-2 font-semibold"
          >
            {isExporting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Priprema CSV-a...</span>
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                <span>
                  Preuzmi CSV ({exportData?.rows.length ?? 0} leadova)
                </span>
              </>
            )}
          </Button>
        </DialogFooter>

        <DialogClose />
      </DialogPopup>
    </Dialog>
  );
}
