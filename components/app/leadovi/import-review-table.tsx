"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Info,
  LoaderCircle,
  Phone,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
  formatRatingDisplay,
  type StagingRowDoc,
} from "./import-row-dialog";

type DecisionType = "nova_firma" | "spoji" | "preskoci" | "nerazreseno";

type ApplyResult = {
  appliedCount: number;
  newCompaniesCount: number;
  mergedCount: number;
  skippedCount: number;
  unresolvedSkippedCount: number;
};

const MATCHED_BY_TEXT: Record<string, string> = {
  pib: "PIB",
  companywall: "CompanyWall URL",
  domain: "Domen / sajt",
  name_city: "Naziv i grad",
  phone: "Telefon",
};

/** Zaseban skup vrednosti od `matchedBy` — ne sme da deli isti rečnik. */
const SUPPRESSION_MATCH_TEXT: Record<string, string> = {
  pib: "PIB",
  domain: "domen",
  phone: "telefon",
  email: "e-mail",
  companyId: "firma već na listi",
};

/** Kratki nazivi polja za oznaku „nije moglo da se proveri". */
const SUPPRESSION_FIELD_TEXT: Record<string, string> = {
  pib: "PIB",
  domain: "domen",
  phone: "telefon",
  email: "e-mail",
  companyId: "firma",
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
  const [decisionFilter, setDecisionFilter] = useState<DecisionType | undefined>(undefined);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const importDoc = useQuery(api.leadImportStore.getImport, {
    workspaceId,
    importId,
  });

  // Query za ukupan zbir po odlukama
  const allRows = useQuery(api.leadImportStore.listImportRows, {
    workspaceId,
    importId,
  });

  // Query sa server-side filterom po odluci
  const filteredRows = useQuery(api.leadImportStore.listImportRows, {
    workspaceId,
    importId,
    decision: decisionFilter,
  });

  const setRowDecisionMutation = useMutation(api.leadImportStore.setRowDecision);
  const applyImportMutation = useMutation(api.leadImportStore.applyImport);

  const handleDecisionChange = async (rowId: Id<"leadImportRows">, decision: DecisionType) => {
    try {
      setActionError(null);
      await setRowDecisionMutation({
        workspaceId,
        rowId,
        decision,
      });
      // Ako je otvoren dijalog za taj red, ažuriramo i lokalno stanje dijaloga
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
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

  const isReadOnly = importDoc.status !== "u_pregledu";

  // Brojači odluka iz allRows
  const countNovaFirma = allRows.filter((r) => r.decision === "nova_firma").length;
  const countSpoji = allRows.filter((r) => r.decision === "spoji").length;
  const countPreskoci = allRows.filter((r) => r.decision === "preskoci").length;
  const countNerazreseno = allRows.filter((r) => r.decision === "nerazreseno").length;
  const totalRowsCount = allRows.length;

  return (
    <div className="space-y-6">
      {/* Gornja traka */}
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
              <span>Ukupno redova: {totalRowsCount}</span>
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
              Primeni uvoz
            </Button>
          </div>
        )}
      </div>

      {actionError && (
        <FeedbackNote tone="danger" title="Greška pri promeni odluke">
          {actionError}
        </FeedbackNote>
      )}

      {/* Izveštaj parsera se ne gubi kad red uđe u staging: upozorenja su
          sačuvana na uvozu i moraju da se vide i kad se uvoz otvori iz
          istorije, mesecima kasnije. */}
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
              — Preskočeno po odluci operatera.
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

      {/* Traka sa statistikom i filterima */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setDecisionFilter(undefined)}
          className={cn(
            "flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
            decisionFilter === undefined
              ? "border-accent-400/50 bg-surface-raised ring-1 ring-accent-400/30"
              : "border-line bg-surface hover:border-line-strong",
          )}
        >
          <span className="text-micro font-medium text-text-muted">Svi redovi</span>
          <span className="text-lg font-bold text-foreground">{totalRowsCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setDecisionFilter("nova_firma")}
          className={cn(
            "flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
            decisionFilter === "nova_firma"
              ? "border-accent-400 bg-accent-400/10 ring-1 ring-accent-400"
              : "border-line bg-surface hover:border-line-strong",
          )}
        >
          <span className="text-micro font-medium text-accent-400">Nova firma</span>
          <span className="text-lg font-bold text-foreground">{countNovaFirma}</span>
        </button>

        <button
          type="button"
          onClick={() => setDecisionFilter("spoji")}
          className={cn(
            "flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
            decisionFilter === "spoji"
              ? "border-success bg-success/10 ring-1 ring-success"
              : "border-line bg-surface hover:border-line-strong",
          )}
        >
          <span className="text-micro font-medium text-success">Spoji</span>
          <span className="text-lg font-bold text-foreground">{countSpoji}</span>
        </button>

        <button
          type="button"
          onClick={() => setDecisionFilter("preskoci")}
          className={cn(
            "flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
            decisionFilter === "preskoci"
              ? "border-line-strong bg-surface-raised ring-1 ring-line-strong"
              : "border-line bg-surface hover:border-line-strong",
          )}
        >
          <span className="text-micro font-medium text-text-muted">Preskoči</span>
          <span className="text-lg font-bold text-foreground">{countPreskoci}</span>
        </button>

        <button
          type="button"
          onClick={() => setDecisionFilter("nerazreseno")}
          className={cn(
            "flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
            decisionFilter === "nerazreseno"
              ? "border-warning bg-warning/10 ring-1 ring-warning"
              : "border-line bg-surface hover:border-line-strong",
          )}
        >
          <div className="flex items-center gap-1">
            <span className="text-micro font-medium text-warning">Nerazrešeno</span>
            {countNerazreseno > 0 && <AlertTriangle className="size-3 text-warning" />}
          </div>
          <span className="text-lg font-bold text-warning">{countNerazreseno}</span>
        </button>
      </div>

      {/* Tabela sa redovima staging uvoza */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        {filteredRows === undefined ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center text-sm text-text-muted">
            Nema redova koji odgovaraju izabranom filteru.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-line bg-surface-raised/60 hover:bg-surface-raised/60">
                <TableHead className="w-12 text-center text-text-muted">#</TableHead>
                <TableHead>Firma i lokacija</TableHead>
                <TableHead>Telefon i sajt</TableHead>
                <TableHead>Ocena</TableHead>
                <TableHead>Spajanje / Zabrana</TableHead>
                <TableHead className="w-44">Odluka</TableHead>
                <TableHead className="w-20 text-right">Detalji</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row, index) => {
                const { parsed, suppression, conflicts, matchedBy, matchedCompanyId, decision } = row;
                const isGradDerived = parsed.derivedFields?.includes("grad");

                return (
                  <TableRow
                    key={row._id}
                    className="border-line/60 hover:bg-surface-raised/40 transition-colors"
                  >
                    {/* Redni broj */}
                    <TableCell className="text-center font-mono text-micro text-text-muted">
                      {row.sourceRowIndex}
                    </TableCell>

                    {/* Firma i lokacija */}
                    <TableCell className="max-w-[260px]">
                      <div className="font-medium text-foreground truncate">
                        {parsed.nazivFirme || "—"}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-text-muted truncate mt-0.5">
                        <span>{parsed.ulica || parsed.opstina || parsed.grad || "—"}</span>
                        {parsed.grad && (
                          <span className="text-text-secondary">
                            ({parsed.grad}
                            {isGradDerived && (
                              <span className="ml-1 inline-block rounded bg-accent-400/20 px-1 py-0.2 text-[9px] text-accent-400 font-medium">
                                izvedeno
                              </span>
                            )}
                            )
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Telefon i sajt */}
                    <TableCell className="max-w-[220px]">
                      <div className="text-xs font-medium text-foreground">
                        {parsed.telefon || "—"}
                      </div>
                      {parsed.telefonNapomena && (
                        <div className="flex items-center gap-1 text-[11px] text-warning truncate mt-0.5">
                          <Phone className="size-3 shrink-0" />
                          <span className="truncate" title={parsed.telefonNapomena}>
                            {parsed.telefonNapomena}
                          </span>
                        </div>
                      )}
                      {parsed.sajt && (
                        <div className="text-micro text-text-muted truncate mt-0.5">
                          <a
                            href={parsed.sajt.startsWith("http") ? parsed.sajt : `https://${parsed.sajt}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-accent-400 hover:underline"
                          >
                            {parsed.sajt}
                            <ExternalLink className="size-2.5" />
                          </a>
                        </div>
                      )}
                    </TableCell>

                    {/* Ocena */}
                    <TableCell className="text-xs text-text-secondary">
                      {formatRatingDisplay(parsed.ocena)}
                    </TableCell>

                    {/* Spajanje / Zabrana kontakta */}
                    <TableCell className="max-w-[240px]">
                      <div className="space-y-1">
                        {matchedCompanyId && (
                          <div className="flex items-center gap-1 text-micro text-text-secondary">
                            <Building2 className="size-3 text-accent-400 shrink-0" />
                            <span>
                              Spojeno po:{" "}
                              <span className="font-semibold text-foreground">
                                {matchedBy ? MATCHED_BY_TEXT[matchedBy] ?? matchedBy : "podudaranju"}
                              </span>
                            </span>
                          </div>
                        )}

                        {conflicts && conflicts.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                            <AlertTriangle className="size-3 shrink-0" />
                            {conflicts.length === 1 ? "1 sukob" : `${conflicts.length} sukoba`}
                          </span>
                        )}

                        {/* ZABRANA KONTAKTA — DVA RAZLIČITA STANJA */}
                        {suppression === undefined && (
                          <div className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                            <AlertCircle className="size-3 shrink-0" />
                            <span>Provera zabrane nije zabeležena</span>
                          </div>
                        )}

                        {suppression?.suppressed === true && (
                          <div className="inline-flex items-center gap-1 rounded border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger">
                            <ShieldAlert className="size-3 shrink-0" />
                            <span>
                              Zabrana kontakta ({suppression.matchedOn ? SUPPRESSION_MATCH_TEXT[suppression.matchedOn] ?? suppression.matchedOn : "nezabeležen kriterijum"})
                            </span>
                          </div>
                        )}

                        {suppression?.unverifiable && suppression.unverifiable.length > 0 && (
                          <div className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                            <AlertCircle className="size-3 shrink-0" />
                            <span>
                              Nije moglo da se proveri:{" "}
                              {suppression.unverifiable
                                .map((u) => SUPPRESSION_FIELD_TEXT[u] ?? u)
                                .join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Birač odluke */}
                    <TableCell>
                      {isReadOnly ? (
                        <span
                          className={cn(
                            "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                            decision === "nova_firma" && "border-accent-400/40 text-accent-400 bg-accent-400/10",
                            decision === "spoji" && "border-success/40 text-success bg-success/10",
                            decision === "preskoci" && "border-line text-text-muted bg-surface",
                            decision === "nerazreseno" && "border-warning/40 text-warning bg-warning/10",
                          )}
                        >
                          {decision === "nova_firma" && "Nova firma"}
                          {decision === "spoji" && "Spoji"}
                          {decision === "preskoci" && "Preskoči"}
                          {decision === "nerazreseno" && "Nerazrešeno"}
                        </span>
                      ) : (
                        <select
                          value={decision}
                          onChange={(e) =>
                            handleDecisionChange(
                              row._id,
                              e.target.value as DecisionType,
                            )
                          }
                          className={cn(
                            "w-full rounded-lg border px-2 py-1 text-xs font-medium outline-none transition-colors",
                            decision === "nova_firma" && "border-accent-400/40 bg-accent-400/10 text-accent-400",
                            decision === "spoji" && "border-success/40 bg-success/10 text-success",
                            decision === "preskoci" && "border-line-soft bg-surface-raised text-text-muted",
                            decision === "nerazreseno" && "border-warning/40 bg-warning/10 text-warning font-semibold",
                          )}
                        >
                          <option value="nova_firma">Nova firma</option>
                          <option value="spoji">Spoji</option>
                          <option value="preskoci">Preskoči</option>
                          <option value="nerazreseno">Nerazrešeno</option>
                        </select>
                      )}
                    </TableCell>

                    {/* Dugme za detalje */}
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedRow(row)}
                        className="h-7 px-2 text-xs"
                      >
                        Detalji
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dijalog detalja jednog reda */}
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
        readOnly={isReadOnly}
      />

      {/* Dijalog potvrde pre primene uvoza (§FAZA D) */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogPopup className="max-w-md">
          <DialogClose />
          <DialogHeader>
            <DialogTitle>Potvrda primene uvoza u bazu</DialogTitle>
            <DialogDescription>
              Pregledajte strukturu odluka pre konačne primene u glavne tabele sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-lg border border-line bg-surface p-3.5 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Kao nove firme:</span>
                <span className="font-semibold text-accent-400">{countNovaFirma} redova</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Spajanje sa postojećim:</span>
                <span className="font-semibold text-success">{countSpoji} redova</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-muted">Preskače se po odluci:</span>
                <span className="font-semibold text-text-muted">{countPreskoci} redova</span>
              </div>
              <div className="pt-2 border-t border-line-soft flex justify-between items-center text-xs">
                <span className="font-medium text-warning">
                  Nerazrešeni redovi (BIĆE PRESKOČENI):
                </span>
                <span className="font-bold text-warning">{countNerazreseno} redova</span>
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
                "Potvrdi i primeni"
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
