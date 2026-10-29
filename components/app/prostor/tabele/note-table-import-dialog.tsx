"use client";

// Preneto iz Devotion apps/web/components/workspace/tables/note-table-import-dialog.tsx (main @ c05c40f), SPAJANJE S11.
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
import { formatNumber } from "@/lib/format";
import { NOTE_TABLE_MAX_COLS, NOTE_TABLE_MAX_ROWS } from "@/lib/prostor/ogranicenja";
import { normalizeTableMatrix } from "@/lib/prostor/web/csv";
import { estimateTableHtmlLength, readTableFile } from "@/lib/prostor/web/table-file";
import { PregledMatrice, redova } from "@/components/app/prostor/tabele/pregled-matrice";

/**
 * Tabela u belešci živi u HTML telu koje server seče na 80.000 znakova
 * (`page_creation`), pa su granice mnogo uže nego kod stranice-tabele.
 * Velika tabela ide u svoju stranicu (vrsta „Tabela").
 */
const BODY_LIMIT_SAFETY = 78_000;
const PREVELIKA = "Tabela je prevelika za ovu belešku. Za veću tabelu napravi stranicu vrste Tabela.";

export function NoteTableImportDialog({
  open,
  onOpenChange,
  onImport,
  getBodyLength,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ubacuje matricu u uređivač; poziva se tek posle svih provera. */
  onImport: (matrix: string[][], firstRowIsHeader: boolean) => void;
  /** Trenutna dužina HTML tela — za procenu da li uvoz staje u granicu. */
  getBodyLength: () => number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [matrix, setMatrix] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [busy, setBusy] = useState(false);

  function reset() {
    setMatrix(null);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function fitsBody(candidate: string[][]) {
    return getBodyLength() + estimateTableHtmlLength(candidate) <= BODY_LIMIT_SAFETY;
  }

  async function readFile(file: File) {
    setBusy(true);
    try {
      const rows = await readTableFile(file);
      // Širina se normalizuje na granicu + 1 da bi se prekoračenje primetilo,
      // umesto da se višak kolona tiho odseče.
      const normalized = normalizeTableMatrix(rows, NOTE_TABLE_MAX_COLS + 1);
      if (normalized.length === 0) {
        toast.error("U fajlu nema podataka za uvoz.");
        reset();
        return;
      }
      if (normalized.length > NOTE_TABLE_MAX_ROWS || normalized[0].length > NOTE_TABLE_MAX_COLS) {
        toast.error(
          `Tabela u belešci može imati najviše ${formatNumber(NOTE_TABLE_MAX_ROWS)} redova i ${formatNumber(NOTE_TABLE_MAX_COLS)} kolona. Za veću tabelu napravi stranicu vrste Tabela.`,
        );
        reset();
        return;
      }
      if (!fitsBody(normalized)) {
        toast.error(PREVELIKA);
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

  function runImport() {
    if (matrix === null) return;
    // Telo je moglo da poraste dok je dijalog bio otvoren — provera se ponavlja.
    if (!fitsBody(matrix)) {
      toast.error(PREVELIKA);
      return;
    }
    onImport(matrix, firstRowIsHeader);
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-h-[min(48rem,92vh)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Uvoz tabele u belešku</DialogTitle>
          <DialogDescription>
            Podržani su .xlsx, .xls i .csv; iz Excel radne sveske uvozi se prvi list. Tabela postaje deo
            teksta i može da se uređuje. Najviše {formatNumber(NOTE_TABLE_MAX_ROWS)} redova i{" "}
            {formatNumber(NOTE_TABLE_MAX_COLS)} kolona.
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

            <Label className="flex items-center gap-2 text-ui font-medium">
              <Checkbox
                checked={firstRowIsHeader}
                onCheckedChange={(value) => setFirstRowIsHeader(value === true)}
              />
              Prvi red su zaglavlja
            </Label>

            <PregledMatrice matrix={matrix} firstRowIsHeader={firstRowIsHeader} />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          {matrix === null ? null : (
            <>
              <Button type="button" variant="outline" onClick={reset}>
                Izaberi drugi fajl
              </Button>
              <Button variant="primary" type="button" disabled={busy} onClick={runImport}>
                Ubaci tabelu
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
