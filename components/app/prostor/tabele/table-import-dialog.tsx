"use client";

// Preneto iz Devotion apps/web/components/workspace/tables/table-import-dialog.tsx (main @ c05c40f), SPAJANJE S11.
import { useRef, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogPopup,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
// Granice su iste kao na serveru (`lib/prostor/ogranicenja`).
import {
  MAX_TABLE_COLUMNS as MAX_COLUMNS,
  MAX_TABLE_IMPORT_BATCH as IMPORT_BATCH,
  MAX_TABLE_ROWS as MAX_ROWS,
} from "@/lib/prostor/ogranicenja";
import { normalizeTableMatrix } from "@/lib/prostor/web/csv";
import { readTableFile } from "@/lib/prostor/web/table-file";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { formatNumber } from "@/lib/format";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { PregledMatrice, redova } from "@/components/app/prostor/tabele/pregled-matrice";

/**
 * Uvoz u stranicu-tabelu iz .xlsx/.xls/.csv. Čitač Excel-a se učitava tek pri
 * izboru fajla (`lib/prostor/web/table-file`), pa ne ulazi u komad stranice.
 * Upis ide u serijama (`MAX_TABLE_IMPORT_BATCH`), a granice se proveravaju pre
 * prvog upisa.
 */
export function TableImportDialog({
  pageId,
  existingRowCount,
  open,
  onOpenChange,
}: {
  pageId: Id<"pages">;
  /** Aktivni redovi u tabeli — za proveru „dopuni" prekoračenja pre upisa. */
  existingRowCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const importRows = useProjekatMutation(api.prostor.pageTables.importRows);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [matrix, setMatrix] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function reset() {
    setMatrix(null);
    setFileName("");
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function readFile(file: File) {
    setBusy(true);
    try {
      const rows = await readTableFile(file);
      // Kolone se mere na SIROVOJ širini (pre nego što `normalizeTableMatrix` iseče
      // na 64) — inače bi se višak preko granice tiho izgubio, bez poruke.
      const sourceColumns = rows.reduce((widest, row) => {
        let lastFilled = 0;
        for (let index = 0; index < row.length; index += 1) {
          if ((row[index] ?? "").trim() !== "") lastFilled = index + 1;
        }
        return Math.max(widest, lastFilled);
      }, 0);
      if (sourceColumns > MAX_COLUMNS) {
        toast.error(`Fajl ima ${formatNumber(sourceColumns)} kolona; granica je ${formatNumber(MAX_COLUMNS)}.`);
        reset();
        return;
      }
      const normalized = normalizeTableMatrix(rows, MAX_COLUMNS);
      if (normalized.length === 0) {
        toast.error("U fajlu nema podataka za uvoz.");
        reset();
        return;
      }
      // Zaglavlje se skida tek u `runImport`, pa se ovde dopušta jedan red više;
      // tačan zbir (uz „dopuni") proverava provera pre upisa niže.
      if (normalized.length > MAX_ROWS + 1) {
        toast.error(`Fajl ima ${formatNumber(normalized.length)} redova; granica je ${formatNumber(MAX_ROWS)}.`);
        reset();
        return;
      }
      setMatrix(normalized);
      setFileName(file.name);
    } catch (error) {
      toast.error(error instanceof Error ? `Fajl nije pročitan: ${error.message}` : "Fajl nije pročitan.");
      reset();
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (matrix === null) return;
    const header = firstRowIsHeader ? matrix[0] : null;
    const dataRows = firstRowIsHeader ? matrix.slice(1) : matrix;
    const columns =
      header ?? Array.from({ length: matrix[0].length }, (_, index) => `Kolona ${index + 1}`);

    // „Dopuni" dodaje na postojeće — zbir se proverava PRE upisa (server bi inače
    // odbio tek na sredini serija). „Zameni" briše postojeće, pa važi samo fajl.
    const projectedRows = replace ? dataRows.length : existingRowCount + dataRows.length;
    if (projectedRows > MAX_ROWS) {
      toast.error(`Uvoz bi napravio ${formatNumber(projectedRows)} redova; granica je ${formatNumber(MAX_ROWS)}.`);
      return;
    }

    setBusy(true);
    setProgress({ done: 0, total: dataRows.length });
    try {
      // Serije od 200 redova — jedna Convex mutacija ima transakcione granice.
      let batchIndex = 0;
      if (dataRows.length === 0) {
        await importRows({
          pageId,
          columns,
          rows: [],
          mode: replace ? "replace" : "append",
        });
      }
      for (let start = 0; start < dataRows.length; start += IMPORT_BATCH) {
        const batch = dataRows.slice(start, start + IMPORT_BATCH);
        await importRows({
          pageId,
          // Zaglavlja i „zameni" važe samo za prvu seriju; ostale dopunjuju.
          ...(batchIndex === 0 ? { columns } : {}),
          rows: batch,
          mode: batchIndex === 0 && replace ? "replace" : "append",
        });
        batchIndex += 1;
        setProgress({
          done: Math.min(start + batch.length, dataRows.length),
          total: dataRows.length,
        });
      }
      toast.success(`Uvezeno: ${redova(dataRows.length)}.`);
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(accessErrorMessage(error, "Uvoz nije uspeo."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-h-[min(48rem,92vh)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Uvoz iz Excel-a ili CSV-a</DialogTitle>
          <DialogDescription>
            Podržani su .xlsx, .xls i .csv. Iz Excel radne sveske uvozi se prvi list. Najviše{" "}
            {formatNumber(MAX_COLUMNS)} kolona i {formatNumber(MAX_ROWS)} redova.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
        />

        {matrix === null ? (
          <div className="rounded-xl border border-dashed border-line-soft bg-card px-4 py-10 text-center">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {busy ? "Čitam fajl…" : "Izaberi fajl"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-ui text-text-secondary">
              <span className="font-semibold text-foreground">{fileName}</span> — {redova(matrix.length)} ×{" "}
              {formatNumber(matrix[0].length)} kolona
            </p>

            <div className="flex flex-wrap gap-4">
              <Label className="flex items-center gap-2 text-ui font-medium">
                <Checkbox
                  checked={firstRowIsHeader}
                  onCheckedChange={(value) => setFirstRowIsHeader(value === true)}
                />
                Prvi red su zaglavlja
              </Label>
              <Label className="flex items-center gap-2 text-ui font-medium">
                <Checkbox checked={replace} onCheckedChange={(value) => setReplace(value === true)} />
                Zameni postojeći sadržaj
              </Label>
            </div>

            <PregledMatrice matrix={matrix} firstRowIsHeader={firstRowIsHeader} />

            {progress ? (
              <p className="text-meta tabular-nums text-text-secondary" role="status" aria-live="polite">
                Uvoz u toku: {formatNumber(progress.done)}/{formatNumber(progress.total)}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          {matrix === null ? null : (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={reset}>
                Izaberi drugi fajl
              </Button>
              <Button variant="primary" type="button" disabled={busy} onClick={() => void runImport()}>
                {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                Uvezi
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
