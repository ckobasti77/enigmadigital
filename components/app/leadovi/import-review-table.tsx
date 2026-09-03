"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  ExternalLink,
  LoaderCircle,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { FeedbackNote } from "@/components/app/feedback";
import { IMPORT_STATUS_LABELS } from "./lead-labels";
import { cn } from "@/lib/utils";
import {
  ImportRowDialog,
  type StagingRowDoc,
} from "./import-row-dialog";

type ApplyResult = {
  appliedCount: number;
  newCompaniesCount: number;
  mergedCount: number;
  skippedCount: number;
  unresolvedSkippedCount: number;
  assignedCount: number;
};

type TemperaturaType = "nova_firma" | "cold" | "warm" | "hot";

const TEMP_CONFIG: Record<
  TemperaturaType,
  {
    label: string;
    rowBg: string;
    hoverBg: string;
    borderColor: string;
    // Tanak unutrašnji obrub reda malog alfa („svetlucavost"). undefined za
    // neutralnu „nova_firma" — ona ne dobija ni traku ni obrub.
    ringColor: string | undefined;
    badgeClass: string;
  }
> = {
  nova_firma: {
    label: "Nova firma",
    rowBg: "var(--surface)",
    hoverBg: "var(--surface-raised)",
    borderColor: "var(--line)",
    ringColor: undefined,
    badgeClass: "border-line-soft text-text-muted bg-surface",
  },
  cold: {
    label: "Cold",
    rowBg: "var(--temp-cold-row)",
    hoverBg: "var(--temp-cold-row-hover)",
    borderColor: "var(--temp-cold)",
    ringColor: "color-mix(in srgb, var(--temp-cold) 22%, transparent)",
    badgeClass: "border-[var(--temp-cold)]/40 text-[var(--temp-cold)] bg-[var(--temp-cold-bg)]",
  },
  warm: {
    label: "Warm",
    rowBg: "var(--temp-warm-row)",
    hoverBg: "var(--temp-warm-row-hover)",
    borderColor: "var(--temp-warm)",
    ringColor: "color-mix(in srgb, var(--temp-warm) 22%, transparent)",
    badgeClass: "border-[var(--temp-warm)]/40 text-[var(--temp-warm)] bg-[var(--temp-warm-bg)]",
  },
  hot: {
    label: "Hot",
    rowBg: "var(--temp-hot-row)",
    hoverBg: "var(--temp-hot-row-hover)",
    borderColor: "var(--temp-hot)",
    ringColor: "color-mix(in srgb, var(--temp-hot) 22%, transparent)",
    badgeClass: "border-[var(--temp-hot)]/40 text-[var(--temp-hot)] bg-[var(--temp-hot-bg)]",
  },
};

export function ImportReviewTable({
  workspaceId,
  importId,
  onBack,
}: {
  workspaceId: Id<"workspaces">;
  importId: Id<"leadImports">;
  onBack?: () => void;
}) {
  const [selectedRow, setSelectedRow] = useState<StagingRowDoc | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [revertResult, setRevertResult] = useState<{
    revertedCompaniesCount: number;
    cleanedRowsCount: number;
    skippedCompaniesCount: number;
  } | null>(null);

  const importDoc = useQuery(api.leadImportStore.getImport, {
    workspaceId,
    importId,
  });

  const allRows = useQuery(api.leadImportStore.listImportRows, {
    workspaceId,
    importId,
  });

  const setRowDecisionMutation = useMutation(api.leadImportStore.setRowDecision);
  const setRowTemperaturaMutation = useMutation(api.leadImportStore.setRowTemperatura);
  const setCompanyTemperaturaMutation = useMutation(api.leadCrmStore.setCompanyTemperatura);
  const setRowObrisanMutation = useMutation(api.leadImportStore.setRowObrisan);
  const revertImportMutation = useMutation(api.leadImportStore.revertImport);
  const setImportHiddenColumnsMutation = useMutation(api.leadImportStore.setImportHiddenColumns);
  const applyImportMutation = useMutation(api.leadImportStore.applyImport);

  const isReadOnly = importDoc?.status !== "u_pregledu";
  const isPrimenjen = importDoc?.status === "primenjen";

  const handleTemperaturaChange = async (
    rowId: Id<"leadImportRows">,
    temperatura: TemperaturaType,
  ) => {
    try {
      setActionError(null);
      await setRowTemperaturaMutation({
        workspaceId,
        rowId,
        temperatura,
      });
      if (selectedRow && selectedRow._id === rowId) {
        setSelectedRow((prev) => (prev ? { ...prev, temperatura } : null));
      }
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setActionError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError(String(err));
      }
    }
  };

  // U primenjenom uvozu temperatura se piše u FIRMU (leadCompanies), ne u staging
  // red. Bez lokalnog stanja — Convex reaktivno osvežava `firmaTemperatura`.
  const handleCompanyTemperaturaChange = async (
    companyId: Id<"leadCompanies">,
    temperatura: TemperaturaType,
  ) => {
    try {
      setActionError(null);
      await setCompanyTemperaturaMutation({
        workspaceId,
        companyId,
        temperatura,
      });
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setActionError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError(String(err));
      }
    }
  };

  const handleRowDelete = async (rowId: Id<"leadImportRows">) => {
    try {
      setActionError(null);
      await setRowObrisanMutation({
        workspaceId,
        rowId,
        obrisan: true,
      });
      if (selectedRow && selectedRow._id === rowId) {
        setSelectedRow(null);
      }
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setActionError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError(String(err));
      }
    }
  };

  const handleHideColumn = async (colName: string) => {
    try {
      setActionError(null);
      const currentHidden = importDoc?.skriveneKolone ?? [];
      const updated = Array.from(new Set([...currentHidden, colName]));
      await setImportHiddenColumnsMutation({
        workspaceId,
        importId,
        skriveneKolone: updated,
      });
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setActionError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError(String(err));
      }
    }
  };

  const handleRestoreAll = async () => {
    if (!allRows) return;
    try {
      setActionError(null);
      const hiddenCols = importDoc?.skriveneKolone ?? [];
      if (hiddenCols.length > 0) {
        await setImportHiddenColumnsMutation({
          workspaceId,
          importId,
          skriveneKolone: [],
        });
      }
      const deletedRows = allRows.filter((r) => r.obrisan === true);
      if (deletedRows.length > 0) {
        await Promise.all(
          deletedRows.map((r) =>
            setRowObrisanMutation({
              workspaceId,
              rowId: r._id,
              obrisan: false,
            }),
          ),
        );
      }
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setActionError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError(String(err));
      }
    }
  };

  const handleDecisionChange = async (
    rowId: Id<"leadImportRows">,
    decision: StagingRowDoc["decision"],
  ) => {
    try {
      setActionError(null);
      await setRowDecisionMutation({
        workspaceId,
        rowId,
        decision,
      });
      if (selectedRow && selectedRow._id === rowId) {
        setSelectedRow((prev) => (prev ? { ...prev, decision } : null));
      }
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setActionError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError(String(err));
      }
    }
  };

  const handleApply = async () => {
    setIsApplying(true);
    setApplyError(null);
    try {
      const res = await applyImportMutation({
        workspaceId,
        importId,
      });
      setApplyResult(res);
      setApplyDialogOpen(false);
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setApplyError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setApplyError(err.message);
      } else {
        setApplyError(String(err));
      }
    } finally {
      setIsApplying(false);
    }
  };

  if (importDoc === undefined || allRows === undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (importDoc === null) {
    return (
      <FeedbackNote tone="danger" title="Uvoz nije pronađen">
        Izabrani uvoz više ne postoji ili nemate pristup ovom radnom prostoru.
        {onBack && (
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="size-4 mr-1.5" />
              Nazad na istoriju
            </Button>
          </div>
        )}
      </FeedbackNote>
    );
  }

  // Filtriranje redova: samo oni koji nisu meko obrisani
  const visibleRows = allRows.filter((r) => r.obrisan !== true);
  const deletedRows = allRows.filter((r) => r.obrisan === true);

  // Kolone su UNIJA svih redova, u redosledu prvog pojavljivanja.
  //
  // Ranije se uzimao prvi red koji ima `sirovo` i njegove kolone su bile CELA
  // tabela. Parser danas dopunjava svaki red do dužine zaglavlja, pa bi to
  // uglavnom radilo — ali „uglavnom radi jer se drugi fajl ponaša lepo" nije
  // garancija. Jedan kraći red na pogrešnom mestu i tabela tiho izgubi kolone.
  const kolonaRedosled: string[] = [];
  const vidjene = new Set<string>();
  for (const r of allRows) {
    for (const c of r.sirovo ?? []) {
      if (!vidjene.has(c.kolona)) {
        vidjene.add(c.kolona);
        kolonaRedosled.push(c.kolona);
      }
    }
  }
  const allColumns: string[] = kolonaRedosled;

  // Uvoz napravljen pre nego što je čuvanje sirovih kolona uvedeno nema šta da
  // prikaže. To NIJE isto što i prazan uvoz i ne sme tako da izgleda.
  const bezSirovihKolona = allRows.length > 0 && allColumns.length === 0;

  // Fajl često već ima svoju kolonu rednog broja. Kad je ima, interni redni
  // broj je druga kolona sa istim značenjem jedna do druge — čovek gleda dva
  // broja i pita se koji je pravi. Prikazuje se samo kad fajl svoj nema.
  const fajlImaRedniBroj = allColumns.some(
    (c) => ["#", "br", "br.", "redni broj", "rb", "no", "no."].includes(c.trim().toLowerCase()),
  );
  const hiddenColumns: string[] = importDoc.skriveneKolone ?? [];
  const hiddenSet = new Set(hiddenColumns);
  const visibleColumns = allColumns.filter((col) => !hiddenSet.has(col));

  // Statistika za traku stanja
  // Brojaci MORAJU da citaju isti izvor kao i sam red: pre primene staging
  // vrednost, posle primene zivu temperaturu firme. Inace traka stanja broji
  // zamrznutu odluku dok redovi ispod nje prikazuju trenutnu — dva broja za
  // istu stvar na istom ekranu.
  const tempReda = (r: (typeof visibleRows)[number]): TemperaturaType =>
    isPrimenjen && r.firmaId
      ? ((r.firmaTemperatura as TemperaturaType) || "nova_firma")
      : ((r.temperatura as TemperaturaType) || "nova_firma");

  const countHot = visibleRows.filter((r) => tempReda(r) === "hot").length;
  const countWarm = visibleRows.filter((r) => tempReda(r) === "warm").length;
  const countCold = visibleRows.filter((r) => tempReda(r) === "cold").length;
  const countNovaFirma = visibleRows.filter((r) => tempReda(r) === "nova_firma").length;
  const countNerazreseno = visibleRows.filter((r) => r.decision === "nerazreseno").length;
  const countMatched = visibleRows.filter((r) => !!r.matchedCompanyId).length;

  return (
    <div className="space-y-6">
      {/* Gornja traka sa nazivom i dugmetom za primenu */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBack}
              className="shrink-0"
            >
              <ArrowLeft className="size-4 mr-1" />
              Nazad
            </Button>
          )}
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {importDoc.fileName}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted mt-0.5">
              <span>Status: <span className="font-medium text-foreground">{IMPORT_STATUS_LABELS[importDoc.status] ?? importDoc.status}</span></span>
              <span>·</span>
              <span>Ukupno u fajlu: {allRows.length}</span>
              {importDoc.rowsSkipped > 0 && (
                <>
                  <span>·</span>
                  <span className="text-warning">Preskočeno pri parsiranju: {importDoc.rowsSkipped}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {importDoc.status === "u_pregledu" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => {
                setApplyError(null);
                setApplyDialogOpen(true);
              }}
              className="bg-accent-500 hover:bg-accent-600 text-text-inverse font-semibold"
            >
              <Play className="size-4 mr-1.5" />
              Primeni uvoz ({visibleRows.length})
            </Button>
          </div>
        )}
      </div>

      {actionError && (
        <FeedbackNote tone="danger" title="Greška pri radnji">
          {actionError}
        </FeedbackNote>
      )}

      {/* Upozorenja parsera */}
      {importDoc.warnings.length > 0 && (
        <FeedbackNote
          tone="warning"
          title={`Upozorenja parsera (${importDoc.warnings.length})`}
        >
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
            {importDoc.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="mt-2 text-micro text-text-muted">
            List: {importDoc.sheetsChosen.join(", ") || "nije zabeležen"} · zaglavlje u redu{" "}
            {importDoc.headerRowIndex + 1}
          </p>
        </FeedbackNote>
      )}

      {importDoc.error && (
        <FeedbackNote tone="danger" title="Uvoz je zabeležio grešku">
          {importDoc.error}
        </FeedbackNote>
      )}

      {/* Rezultat primene uvoza */}
      {applyResult && (
        <FeedbackNote tone="success" title="Uvoz je uspešno primenjen u bazu!">
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded border border-success/30 bg-success/5 p-2">
              <span className="font-semibold text-success">
                {applyResult.appliedCount}
              </span>{" "}
              — Ukupno primenjeno u bazu.
            </div>
            <div className="rounded border border-line-soft bg-surface-raised p-2">
              <span className="font-semibold text-foreground">
                {applyResult.newCompaniesCount}
              </span>{" "}
              — Kreirano novih firmi u sistemu.
            </div>
            <div className="rounded border border-line-soft bg-surface-raised p-2">
              <span className="font-semibold text-foreground">
                {applyResult.mergedCount}
              </span>{" "}
              — Dopunjeno postojećih firmi u sistemu.
            </div>
            <div className="rounded border border-line-soft bg-surface-raised p-2">
              <span className="font-semibold text-text-muted">
                {applyResult.skippedCount}
              </span>{" "}
              — Preskočeno (uključujući obrisane redove).
            </div>
            <div className="rounded border border-warning/30 bg-warning/5 p-2">
              <span className="font-semibold text-warning">
                {applyResult.unresolvedSkippedCount}
              </span>{" "}
              — Preskočeno jer su ostali u nerazrešenom stanju.
            </div>
          </div>
        </FeedbackNote>
      )}

      {/* Traka stanja iznad tabele (§6: brojevi, bez pasusa) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-text-secondary">
          <span className="font-semibold text-foreground">
            {visibleRows.length} {visibleRows.length === 1 ? "red" : "redova"}
          </span>
          {deletedRows.length > 0 && (
            <>
              <span>·</span>
              <span className="text-warning font-medium">
                {deletedRows.length} sklonjeno
              </span>
            </>
          )}
          {hiddenColumns.length > 0 && (
            <>
              <span>·</span>
              <span className="text-text-muted font-medium">
                {hiddenColumns.length} {hiddenColumns.length === 1 ? "kolona skrivena" : "kolone skrivene"}
              </span>
            </>
          )}
          {countHot > 0 && (
            <>
              <span>·</span>
              <span className="text-[var(--temp-hot)] font-medium">
                {countHot} vrelo
              </span>
            </>
          )}
          {countWarm > 0 && (
            <>
              <span>·</span>
              <span className="text-[var(--temp-warm)] font-medium">
                {countWarm} toplo
              </span>
            </>
          )}
          {countCold > 0 && (
            <>
              <span>·</span>
              <span className="text-[var(--temp-cold)] font-medium">
                {countCold} hladno
              </span>
            </>
          )}
          {countMatched > 0 && (
            <>
              <span>·</span>
              <span className="text-accent-400 font-medium">
                {countMatched} već u bazi
              </span>
            </>
          )}
          {countNerazreseno > 0 && (
            <>
              <span>·</span>
              <span className="text-warning font-medium">
                {countNerazreseno} nerazrešeno
              </span>
            </>
          )}
        </div>

        {(deletedRows.length > 0 || hiddenColumns.length > 0) && !isReadOnly && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRestoreAll}
              className="h-7 text-xs text-accent-400 hover:text-accent-300 hover:bg-accent-400/10"
            >
              <RotateCcw className="size-3 mr-1" />
              Vrati sve
            </Button>
          </div>
        )}
      </div>

      {/* Dinamička tabela sa horizontalnim scroll-om i lepljivim kolonama (§5, §6) */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        {visibleRows.length === 0 ? (
          <div className="py-16 text-center text-sm text-text-muted space-y-2">
            <div>
              {deletedRows.length > 0
                ? `Svi redovi su sklonjeni (${deletedRows.length} redova).`
                : "Fajl ne sadrži nijedan red."}
            </div>
            {deletedRows.length > 0 && !isReadOnly && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRestoreAll}
                className="mt-2 text-xs"
              >
                <RotateCcw className="size-3.5 mr-1" />
                Vrati sklonjene redove
              </Button>
            )}
          </div>
        ) : bezSirovihKolona ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="text-sm text-text-secondary">
              Ovaj uvoz nema zapamćene kolone iz fajla.
            </p>
            <p className="max-w-md text-xs leading-relaxed text-text-muted">
              Napravljen je pre nego što je čuvanje sirovih kolona uvedeno, pa
              nema šta da se prikaže. Redovi postoje i mogu se primeniti, ali se
              tabela iz fajla ne može rekonstruisati unazad. Za pun prikaz
              otpremi fajl ponovo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="border-collapse">
              <TableHeader>
                <TableRow className="border-b border-line bg-surface-raised hover:bg-surface-raised">
                  {/* Sticky: Redni broj — samo kad ga fajl sam nema */}
                  {!fajlImaRedniBroj && (
                  <TableHead className="sticky left-0 z-30 w-12 min-w-[48px] max-w-[48px] text-center font-mono text-micro text-text-muted bg-surface-raised border-b border-line shadow-[8px_0_12px_-6px_rgba(0,0,0,0.55),1px_0_0_0_var(--line)]">
                    #
                  </TableHead>
                  )}

                  {/* Dinamičke kolone iz fajla */}
                  {visibleColumns.map((colName, colIdx) => {
                    const isFirstCol = colIdx === 0;
                    return (
                      <TableHead
                        key={colName}
                        className={cn(
                          "group/col min-w-[160px] max-w-[260px] py-2.5 px-3 text-xs font-semibold text-text-secondary bg-surface-raised border-b border-line select-none",
                          isFirstCol &&
                            (fajlImaRedniBroj
                              ? "sticky left-0 z-30 shadow-[8px_0_12px_-6px_rgba(0,0,0,0.55),1px_0_0_0_var(--line)]"
                              : "sticky left-12 z-30 shadow-[8px_0_12px_-6px_rgba(0,0,0,0.55),1px_0_0_0_var(--line)]"),
                        )}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate" title={colName}>
                            {colName}
                          </span>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleHideColumn(colName)}
                              className="opacity-0 group-hover/col:opacity-100 p-0.5 rounded hover:bg-surface-overlay text-text-muted hover:text-danger transition-all shrink-0"
                              title={`Skloni kolonu "${colName}"`}
                              aria-label={`Skloni kolonu ${colName}`}
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </TableHead>
                    );
                  })}

                  {/* Sticky: Temperatura */}
                  <TableHead className={cn(
                    "sticky z-30 w-36 min-w-[140px] max-w-[140px] text-xs font-semibold text-text-secondary bg-surface-raised border-b border-line shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.55),-1px_0_0_0_var(--line)]",
                    isPrimenjen ? "right-[240px]" : "right-[100px]"
                  )}>
                    Temperatura
                  </TableHead>

                  {/* Sticky: Detalji / Akcije */}
                  <TableHead className={cn(
                    "sticky right-0 z-30 text-right text-xs font-semibold text-text-secondary bg-surface-raised border-b border-line",
                    isPrimenjen ? "w-[240px] min-w-[240px] max-w-[240px]" : "w-[100px] min-w-[100px] max-w-[100px]"
                  )}>
                    Akcije
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => {
                  // U primenjenom uvozu boju reda nosi ŽIVA temperatura firme,
                  // ne zamrznuta staging vrednost — inače bi red i kontrola iznad
                  // pokazivali različite vrednosti (isti princip kao §3b).
                  const stagingTemp = (row.temperatura as TemperaturaType) || "nova_firma";
                  const effectiveTemp: TemperaturaType =
                    isPrimenjen && row.firmaId
                      ? ((row.firmaTemperatura as TemperaturaType) || "nova_firma")
                      : stagingTemp;
                  const config = TEMP_CONFIG[effectiveTemp] || TEMP_CONFIG.nova_firma;
                  const isNeutral = effectiveTemp === "nova_firma";
                  const hadCompanyLink = !!(row.createdCompanyId || row.matchedCompanyId);

                  return (
                    <TableRow
                      key={row._id}
                      style={
                        {
                          "--row-bg": config.rowBg,
                          "--row-hover-bg": config.hoverBg,
                          "--row-ring": config.ringColor ?? "transparent",
                        } as React.CSSProperties
                      }
                      className="group/row transition-colors border-b border-line/60 bg-[var(--row-bg)] hover:bg-[var(--row-hover-bg)]"
                    >
                      {/* Sticky: Redni broj sa 3px levom ivicom temperature.
                          Kad fajl ima svoju kolonu rednog broja, ova se ne crta
                          i traka temperature prelazi na prvu ćeliju sa podacima. */}
                      {!fajlImaRedniBroj && (
                      <TableCell
                        className="sticky left-0 z-20 w-12 min-w-[48px] max-w-[48px] text-center font-mono text-micro text-text-muted py-2 px-2 bg-[var(--row-bg)] group-hover/row:bg-[var(--row-hover-bg)] transition-colors shadow-[8px_0_12px_-6px_rgba(0,0,0,0.55),1px_0_0_0_var(--line),inset_0_1px_0_0_var(--row-ring),inset_0_-1px_0_0_var(--row-ring)]"
                        style={
                          isNeutral
                            ? undefined
                            : { borderLeft: `3px solid ${config.borderColor}` }
                        }
                      >
                        {row.sourceRowIndex}
                      </TableCell>
                      )}

                      {/* Dinamičke ćelije iz row.sirovo */}
                      {visibleColumns.map((colName, colIdx) => {
                        const isFirstDataCol = colIdx === 0;
                        const rawCell = row.sirovo?.find((c) => c.kolona === colName);
                        const rawVal = rawCell?.vrednost ?? "";
                        const cleanVal = rawVal.replace(/\r?\n/g, " ").trim();

                        return (
                          <TableCell
                            key={colName}
                            className={cn(
                              "min-w-[160px] max-w-[260px] py-2 px-3 text-xs text-foreground",
                              isFirstDataCol &&
                                (fajlImaRedniBroj ? "sticky left-0" : "sticky left-12"),
                              isFirstDataCol &&
                                "z-20 shadow-[8px_0_12px_-6px_rgba(0,0,0,0.55),1px_0_0_0_var(--line),inset_0_1px_0_0_var(--row-ring),inset_0_-1px_0_0_var(--row-ring)] bg-[var(--row-bg)] group-hover/row:bg-[var(--row-hover-bg)] transition-colors",
                              !isFirstDataCol &&
                                "shadow-[inset_0_1px_0_0_var(--row-ring),inset_0_-1px_0_0_var(--row-ring)]",
                            )}
                            style={
                              isFirstDataCol && fajlImaRedniBroj && !isNeutral
                                ? { borderLeft: `3px solid ${config.borderColor}` }
                                : undefined
                            }
                          >
                            {cleanVal ? (
                              <span className="truncate block" title={rawVal}>
                                {cleanVal}
                              </span>
                            ) : (
                              <span className="text-text-muted/60 select-none">—</span>
                            )}

                            {/* Tihe oznake na prvoj koloni sa podacima */}
                            {isFirstDataCol && (
                              <div className="flex flex-col gap-0.5 mt-1">
                                {row.matchedCompanyId && (
                                  <div className="flex items-center gap-1 text-[11px] text-accent-300 font-medium">
                                    <Building2 className="size-3 shrink-0" />
                                    <span className="truncate">već postoji u bazi</span>
                                    <Link
                                      href={`/leadovi?companyId=${row.matchedCompanyId}`}
                                      target="_blank"
                                      className="inline-flex items-center text-accent-400 hover:underline shrink-0"
                                      title="Otvori firmu u bazi"
                                    >
                                      <ExternalLink className="size-2.5" />
                                    </Link>
                                  </div>
                                )}
                                {row.decision === "nerazreseno" && (
                                  <div className="flex items-center gap-1 text-[11px] text-warning/90 font-medium">
                                    <AlertTriangle className="size-3 shrink-0 text-warning" />
                                    <span>nerazrešeno</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                        );
                      })}

                      {/* Sticky: Temperatura — uvek na ekranu, pa nosi 3px levu
                          ivicu u boji temperature (vidljivu u svakom položaju
                          skrola). „nova_firma" ne dobija ivicu. */}
                      <TableCell
                        className={cn(
                          "sticky z-20 w-36 min-w-[140px] max-w-[140px] py-2 px-3 border-b border-line/60 shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.55),-1px_0_0_0_var(--line),inset_0_1px_0_0_var(--row-ring),inset_0_-1px_0_0_var(--row-ring)] bg-[var(--row-bg)] group-hover/row:bg-[var(--row-hover-bg)] transition-colors",
                          isPrimenjen ? "right-[240px]" : "right-[100px]"
                        )}
                        style={
                          isNeutral
                            ? undefined
                            : { borderLeft: `3px solid ${config.borderColor}` }
                        }
                      >
                        {!isReadOnly ? (
                          <select
                            value={row.temperatura || "nova_firma"}
                            onChange={(e) =>
                              handleTemperaturaChange(
                                row._id,
                                e.target.value as TemperaturaType,
                              )
                            }
                            className={cn(
                              "w-full rounded-md border px-2 py-1 text-xs font-medium outline-none transition-colors cursor-pointer",
                              row.temperatura === "hot" && "border-[var(--temp-hot)]/40 bg-[var(--temp-hot-bg)] text-foreground font-semibold",
                              row.temperatura === "warm" && "border-[var(--temp-warm)]/40 bg-[var(--temp-warm-bg)] text-foreground font-semibold",
                              row.temperatura === "cold" && "border-[var(--temp-cold)]/40 bg-[var(--temp-cold-bg)] text-foreground font-semibold",
                              (!row.temperatura || row.temperatura === "nova_firma") && "border-line-soft bg-surface-raised text-text-secondary",
                            )}
                          >
                            <option value="nova_firma">Nova firma</option>
                            <option value="cold">Cold</option>
                            <option value="warm">Warm</option>
                            <option value="hot">Hot</option>
                          </select>
                        ) : isPrimenjen && row.firmaId ? (
                          // Primenjen uvoz: menja se ŽIVA temperatura FIRME, ne
                          // staging red. Vrednost se čita iz firmaTemperatura,
                          // NIKAKO iz row.temperatura (stara odluka nije trenutna).
                          <select
                            value={row.firmaTemperatura || "nova_firma"}
                            onChange={(e) =>
                              handleCompanyTemperaturaChange(
                                row.firmaId!,
                                e.target.value as TemperaturaType,
                              )
                            }
                            className={cn(
                              "w-full rounded-md border px-2 py-1 text-xs font-medium outline-none transition-colors cursor-pointer",
                              row.firmaTemperatura === "hot" && "border-[var(--temp-hot)]/40 bg-[var(--temp-hot-bg)] text-foreground font-semibold",
                              row.firmaTemperatura === "warm" && "border-[var(--temp-warm)]/40 bg-[var(--temp-warm-bg)] text-foreground font-semibold",
                              row.firmaTemperatura === "cold" && "border-[var(--temp-cold)]/40 bg-[var(--temp-cold-bg)] text-foreground font-semibold",
                              (!row.firmaTemperatura || row.firmaTemperatura === "nova_firma") && "border-line-soft bg-surface-raised text-text-secondary",
                            )}
                          >
                            <option value="nova_firma">Nova firma</option>
                            <option value="cold">Cold</option>
                            <option value="warm">Warm</option>
                            <option value="hot">Hot</option>
                          </select>
                        ) : isPrimenjen ? (
                          // Red bez žive firme: ne crta se kontrola koja ne može
                          // da radi. Obrisano ≠ nepoznato — poseban tekst.
                          <div className="flex flex-col gap-1">
                            <span
                              className={cn(
                                "inline-flex w-fit rounded-md border px-2 py-0.5 text-xs font-medium",
                                config.badgeClass,
                              )}
                            >
                              {config.label}
                            </span>
                            <span className="text-micro text-text-muted">
                              {hadCompanyLink
                                ? "Firma je obrisana posle uvoza."
                                : "Red nije ušao u bazu."}
                            </span>
                          </div>
                        ) : (
                          // Poništen (i svako drugo read-only stanje) — samo značka.
                          <span
                            className={cn(
                              "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                              config.badgeClass,
                            )}
                          >
                            {config.label}
                          </span>
                        )}
                      </TableCell>

                      {/* Sticky: Detalji + Obriši red */}
                      <TableCell className={cn(
                        "sticky right-0 z-20 text-right py-2 px-3 border-b border-line/60 shadow-[inset_0_1px_0_0_var(--row-ring),inset_0_-1px_0_0_var(--row-ring)] bg-[var(--row-bg)] group-hover/row:bg-[var(--row-hover-bg)] transition-colors",
                        isPrimenjen ? "w-[240px] min-w-[240px] max-w-[240px]" : "w-[100px] min-w-[100px] max-w-[100px]"
                      )}>
                        <div className="flex items-center justify-end gap-1.5">
                          {isPrimenjen && row.createdCompanyId && (
                            <Link
                              href={`/leadovi/${row.createdCompanyId}`}
                              className="inline-flex items-center gap-1 rounded-md border border-accent-400/40 bg-accent-400/10 px-2 py-1 text-xs font-medium text-accent-400 hover:bg-accent-400/20 transition-colors shrink-0"
                              title="Otvori u leadovima"
                            >
                              <span>Otvori u leadovima</span>
                              <ExternalLink className="size-3" />
                            </Link>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedRow(row)}
                            className="h-7 px-2 text-xs font-medium border-line-soft hover:border-line-strong hover:bg-surface-raised"
                          >
                            Detalji
                          </Button>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleRowDelete(row._id)}
                              className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                              title="Skloni red iz uvoza"
                              aria-label="Skloni red"
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Modal detalja pojedinačnog reda (LT5) */}
      <ImportRowDialog
        row={selectedRow}
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
        onDecisionChange={(newDecision) => {
          if (selectedRow) {
            handleDecisionChange(selectedRow._id, newDecision);
          }
        }}
        onTemperaturaChange={(newTemp) => {
          if (selectedRow) {
            handleTemperaturaChange(selectedRow._id, newTemp);
          }
        }}
        onDeleteRow={() => {
          if (selectedRow) {
            handleRowDelete(selectedRow._id);
          }
        }}
        readOnly={isReadOnly}
        isApplied={isPrimenjen}
      />

      {/* Dijalog potvrde pre primene uvoza */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogPopup className="max-w-md">
          <DialogClose />
          <DialogHeader>
            <DialogTitle>Potvrda primene uvoza u bazu</DialogTitle>
            <DialogDescription>
              Pregledajte strukturu uvoza pre konačnog upisa u glavne tabele sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-lg border border-line bg-surface p-3.5 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Ukupno redova za uvoz:</span>
                <span className="font-semibold text-accent-400">{visibleRows.length} redova</span>
              </div>
              {deletedRows.length > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-muted">Sklonjeno (neće se uvesti):</span>
                  <span className="font-semibold text-warning">{deletedRows.length} redova</span>
                </div>
              )}
              {hiddenColumns.length > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-muted">Skrivene kolone:</span>
                  <span className="font-semibold text-text-muted">{hiddenColumns.length}</span>
                </div>
              )}
              <div className="pt-2 border-t border-line-soft space-y-1 text-xs">
                <div className="text-micro font-medium text-text-muted mb-1">Raspodela temperature:</div>
                <div className="flex justify-between text-micro">
                  <span className="text-[var(--temp-hot)] font-medium">Hot (Vrelo):</span>
                  <span className="font-semibold text-foreground">{countHot}</span>
                </div>
                <div className="flex justify-between text-micro">
                  <span className="text-[var(--temp-warm)] font-medium">Warm (Toplo):</span>
                  <span className="font-semibold text-foreground">{countWarm}</span>
                </div>
                <div className="flex justify-between text-micro">
                  <span className="text-[var(--temp-cold)] font-medium">Cold (Hladno):</span>
                  <span className="font-semibold text-foreground">{countCold}</span>
                </div>
                <div className="flex justify-between text-micro">
                  <span className="text-text-muted font-medium">Nova firma (bez oznake):</span>
                  <span className="font-semibold text-foreground">{countNovaFirma}</span>
                </div>
              </div>
            </div>

            {countNerazreseno > 0 && (
              <FeedbackNote tone="warning" title="Upozorenje: nerazrešeni redovi">
                U tabeli postoji {countNerazreseno} nerazrešenih redova. Svi redovi u stanju „nerazrešeno“ ostaće neupisani u bazu dok ih operater ručno ne razreši.
              </FeedbackNote>
            )}

            {applyError && (
              <FeedbackNote tone="danger" title="Greška pri primeni">
                {applyError}
              </FeedbackNote>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setApplyDialogOpen(false)}
              disabled={isApplying}
            >
              Otkaži
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={isApplying}
              className="bg-accent-500 hover:bg-accent-600 text-text-inverse font-semibold"
            >
              {isApplying ? (
                <>
                  <LoaderCircle className="animate-spin size-4 mr-1.5" />
                  Primenjujem uvoz...
                </>
              ) : (
                `Potvrdi i uvezi (${visibleRows.length})`
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
