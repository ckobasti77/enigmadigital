"use client";

// Sirovi fajl se nikada ne šalje na server. Na server ide samo parsiran rezultat kroz createImport.

import { useState, useRef, useCallback } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  LoaderCircle,
  Sparkles,
  Upload,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  parseLeadWorkbook,
  type LeadWorkbookParseResult,
} from "@/convex/lib/leadImportParse";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import { cn } from "@/lib/utils";

/**
 * Razlog izbora lista dolazi iz parsera (`selectionReason`), ne iz pretpostavke
 * UI-ja. Ranije je ovde uvek pisalo „najviše redova, bez preklapanja" — i onda
 * kad su SVI listovi bili preklapanja, pa je poruka bila neistinita.
 */
const SELECTION_REASON_TEXT: Record<
  LeadWorkbookParseResult["selectionReason"],
  string
> = {
  trazen: "ručno izabran",
  jedini: "jedini list u fajlu",
  najveci_bez_preklapanja: "najviše redova, bez preklapanja",
  najveci_iako_sve_preklapa:
    "najviše redova — PAŽNJA: svi listovi se međusobno preklapaju",
};

export function ImportFilePicker({
  workspaceId,
  onImportCreated,
}: {
  workspaceId: Id<"workspaces">;
  onImportCreated: (importId: Id<"leadImports">) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [parseResult, setParseResult] = useState<LeadWorkbookParseResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [autoSelectedSheet, setAutoSelectedSheet] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [skippedExpanded, setSkippedExpanded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createImportMutation = useMutation(api.leadImportStore.createImport);

  const parseBuffer = useCallback((buffer: ArrayBuffer, fileName: string, sheetOverride?: string) => {
    try {
      setParseError(null);
      setCreateError(null);

      // Koristimo Uint8Array bafer za bezbedno parsiranje u browseru
      const uint8 = new Uint8Array(buffer);
      const result = parseLeadWorkbook(uint8, {
        fileName,
        sheetName: sheetOverride,
      });

      setParseResult(result);

      // Koji je list parsiran KAŽE parser (`result.selectedSheet`). UI to ne
      // izvodi ponovo: `sourceSheet` koji šaljemo u createImport je poreklo
      // podatka, a poreklo se ne pogađa.
      setSelectedSheet(result.selectedSheet);
      if (!sheetOverride) {
        setAutoSelectedSheet(result.selectedSheet);
      }
    } catch (err: unknown) {
      setParseResult(null);
      // Pravilo (§0, Faza A.3): Prikazati TAČNU poruku iz izuzetka, nikad opštu
      if (err instanceof Error) {
        setParseError(err.message);
      } else {
        setParseError(String(err));
      }
    }
  }, []);

  const handleFileChange = (selectedFile: File) => {
    setFile(selectedFile);
    setParseResult(null);
    setParseError(null);
    setCreateError(null);
    setSelectedSheet(null);
    setAutoSelectedSheet(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer) {
        setFileBuffer(buffer);
        parseBuffer(buffer, selectedFile.name);
      }
    };
    reader.onerror = () => {
      setParseError("Greška pri čitanju fajla sa diska.");
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleSheetChange = (newSheet: string) => {
    if (!file || !fileBuffer) return;
    parseBuffer(fileBuffer, file.name, newSheet);
  };

  const handleSendToStaging = async () => {
    if (!file || !parseResult || !selectedSheet) return;

    if (parseResult.rows.length > 500) {
      setCreateError(
        `Fajl ima ${parseResult.rows.length} redova, što prelazi maksimalno dozvoljenih 500 redova za jedan uvoz. Podelite fajl na manje delove pre uvoza.`,
      );
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const res = await createImportMutation({
        workspaceId,
        fileName: file.name,
        sheetsChosen: [selectedSheet],
        headerRowIndex: parseResult.headerRowIndex,
        rows: parseResult.rows,
        skipped: parseResult.skipped,
        warnings: parseResult.warnings,
        sourceSheet: selectedSheet,
      });

      onImportCreated(res.importId);
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setCreateError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError(String(err));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const isTooLarge = parseResult ? parseResult.rows.length > 500 : false;

  return (
    <div className="space-y-6">
      {/* Kartica za izbor fajla */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileChange(e.dataTransfer.files[0]);
          }
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          isDragging
            ? "border-accent-400 bg-accent-400/10"
            : "border-line bg-surface hover:border-line-strong",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileChange(e.target.files[0]);
            }
          }}
        />

        <div className="flex size-12 items-center justify-center rounded-full border border-line-soft bg-surface-raised text-accent-400 mb-3">
          <Upload className="size-6" />
        </div>

        <h3 className="text-sm font-semibold text-foreground">
          {file ? file.name : "Izaberi ili prevuci Excel ili CSV fajl"}
        </h3>
        <p className="mt-1 text-xs text-text-muted max-w-md">
          Podržani formati su .xlsx, .xls i .csv tabele.
        </p>

        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? "Izaberi drugi fajl" : "Pretraži računar"}
          </Button>
        </div>

        {/* Obavezna napomena o privatnosti */}
        <p className="mt-4 text-micro text-text-muted">
          Sirovi fajl se obrađuje isključivo u tvom pregledaču i nikada se ne šalje na server.
        </p>
      </div>

      {/* Prikaz greške pri parsiranju */}
      {parseError && (
        <FeedbackNote tone="danger" title="Greška pri parsiranju tabele">
          {parseError}
        </FeedbackNote>
      )}

      {/* FAZA B: Izveštaj parsera PRE slanja na server */}
      {parseResult && (
        <div className="space-y-4 rounded-xl border border-line bg-surface p-5 text-sm">
          <div className="flex items-center justify-between border-b border-line-soft pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Izveštaj analize tabele
              </h3>
              <p className="text-xs text-text-muted">
                Pregled prepoznate strukture, listova i kolona pre učitavanja u staging.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-accent-400">
                {parseResult.rows.length} spremnih redova
              </span>
            </div>
          </div>

          {/* 1. Listovi (Sheets) i izbor lista */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                Pronađeni listovi ({parseResult.sheets.length}):
              </span>
              {autoSelectedSheet && (
                <span className="text-micro text-text-muted">
                  Automatski izabran:{" "}
                  <span className="font-semibold text-foreground">{autoSelectedSheet}</span>{" "}
                  ({SELECTION_REASON_TEXT[parseResult.selectionReason]})
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {parseResult.sheets.map((s) => {
                const isSelected = s.name === selectedSheet;
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => handleSheetChange(s.name)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-colors",
                      isSelected
                        ? "border-accent-400 bg-accent-400/10 ring-1 ring-accent-400"
                        : "border-line-soft bg-surface-raised hover:border-line",
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-medium text-foreground truncate">
                        {s.name}
                      </span>
                      <span className="text-micro text-text-muted ml-2 shrink-0">
                        {s.rowCount} redova
                      </span>
                    </div>
                    {s.looksLikeDuplicateOf && (
                      <span className="mt-1 text-micro text-warning">
                        preklapa se sa listom {s.looksLikeDuplicateOf}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Zaglavlje i Kolone */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-line-soft pt-3 text-xs">
            <div>
              <span className="text-text-muted">Red sa zaglavljem:</span>
              <p className="font-medium text-foreground mt-0.5">
                Red {parseResult.headerRowIndex + 1} (indeks: {parseResult.headerRowIndex})
              </p>
            </div>
            <div>
              <span className="text-text-muted">Prepoznate kolone ({parseResult.columns.length}):</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {parseResult.columns.map((col) => (
                  <span
                    key={col}
                    className="inline-block rounded bg-surface-raised border border-line-soft px-1.5 py-0.5 text-micro font-mono text-text-secondary"
                  >
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Preskočeni redovi (Skipped) */}
          <div className="border-t border-line-soft pt-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-secondary">
                Preskočeni redovi pri analizi:{" "}
                <span className={cn("font-semibold", parseResult.skipped.length > 0 ? "text-warning" : "text-foreground")}>
                  {parseResult.skipped.length}
                </span>
              </span>
              {parseResult.skipped.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSkippedExpanded(!skippedExpanded)}
                  className="inline-flex items-center gap-1 text-accent-400 hover:underline"
                >
                  <span>{skippedExpanded ? "Sakrij detalje" : "Prikaži detalje"}</span>
                  {skippedExpanded ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </button>
              )}
            </div>

            {skippedExpanded && parseResult.skipped.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-line-soft bg-surface-raised p-2 space-y-1">
                {parseResult.skipped.map((sk, idx) => (
                  <div key={idx} className="flex items-center justify-between text-micro text-text-muted">
                    <span className="font-mono text-text-secondary">Red {sk.rowIndex}:</span>
                    <span>{sk.razlog}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Upozorenja (Warnings) */}
          {parseResult.warnings.length > 0 && (
            <div className="border-t border-line-soft pt-3">
              <span className="text-xs font-medium text-warning">
                Upozorenja ({parseResult.warnings.length}):
              </span>
              <ul className="mt-1 space-y-1 text-xs text-text-secondary">
                {parseResult.warnings.map((w, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 5. Zaštita od velikog fajla (> 500 redova) */}
          {isTooLarge && (
            <FeedbackNote tone="warning" title="Fajl je prevelik za pojedinačni uvoz">
              Fajl sadrži {parseResult.rows.length} redova, a limit za jedan uvoz je 500 redova. Podelite tabelu na manje segmente (npr. do 500 redova) pre slanja u staging.
            </FeedbackNote>
          )}

          {createError && (
            <FeedbackNote tone="danger" title="Greška pri kreiranju uvoza">
              {createError}
            </FeedbackNote>
          )}

          {/* Dugme za slanje u staging */}
          <div className="flex justify-end border-t border-line-soft pt-4">
            <Button
              type="button"
              onClick={handleSendToStaging}
              disabled={isCreating || isTooLarge}
              className="bg-accent-500 hover:bg-accent-600 text-text-inverse font-semibold"
            >
              {isCreating ? (
                <>
                  <LoaderCircle className="animate-spin size-4 mr-1.5" />
                  Šaljem na pregled...
                </>
              ) : (
                "Pošalji na pregled"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
