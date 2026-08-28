"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  History,
  LoaderCircle,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { FeedbackNote } from "@/components/app/feedback";
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
import { cn } from "@/lib/utils";
import { IMPORT_STATUS_LABELS } from "./lead-labels";

type RevertResult = {
  revertedCompaniesCount: number;
  skippedModifiedCount: number;
};

const STATUS_LABELS: Record<
  string,
  { label: string; className: string }
> = {
  parsiran: {
    label: IMPORT_STATUS_LABELS.parsiran,
    className: "border-line text-text-muted bg-surface",
  },
  u_pregledu: {
    label: IMPORT_STATUS_LABELS.u_pregledu,
    className: "border-warning/40 text-warning bg-warning/10",
  },
  primenjen: {
    label: IMPORT_STATUS_LABELS.primenjen,
    className: "border-success/40 text-success bg-success/10",
  },
  ponisten: {
    label: IMPORT_STATUS_LABELS.ponisten,
    className: "border-danger/40 text-danger bg-danger/10",
  },
  neuspeo: {
    label: IMPORT_STATUS_LABELS.neuspeo,
    className: "border-danger/40 text-danger bg-danger/10",
  },
};

export function ImportsHistory({
  workspaceId,
  onSelectImport,
}: {
  workspaceId: Id<"workspaces">;
  onSelectImport: (importId: Id<"leadImports">) => void;
}) {
  const [revertingImportId, setRevertingImportId] = useState<Id<"leadImports"> | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [revertResult, setRevertResult] = useState<RevertResult | null>(null);

  const imports = useQuery(api.leadImportStore.listImports, { workspaceId });
  const revertImportMutation = useMutation(api.leadImportStore.revertImport);

  const handleRevertConfirm = async () => {
    if (!revertingImportId) return;

    setIsReverting(true);
    setRevertError(null);

    try {
      const res = await revertImportMutation({
        workspaceId,
        importId: revertingImportId,
      });

      setRevertResult(res);
      setRevertingImportId(null);
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setRevertError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setRevertError(err.message);
      } else {
        setRevertError(String(err));
      }
    } finally {
      setIsReverting(false);
    }
  };

  if (imports === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (imports.length === 0) {
    return (
      <EmptyState icon={FileSpreadsheet}>
        Još uvek nema zabeleženih uvoza u ovom radnom prostoru.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      {/* Izveštaj o uspešnom poništavanju */}
      {revertResult && (
        <FeedbackNote
          tone="success"
          title="Uvoz je uspešno poništen"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevertResult(null)}
              className="text-xs h-7"
            >
              Zatvori
            </Button>
          }
        >
          <div className="mt-1 space-y-1 text-xs">
            <p>
              Obrisano novokreiranih firmi:{" "}
              <span className="font-semibold text-foreground">
                {revertResult.revertedCompaniesCount}
              </span>
            </p>
            {/* Nula preskočenih znači da nijedna firma nije preskočena. Ranije
                je i u tom slučaju pisalo „preskočene su firme…", što je tvrdilo
                nešto što se nije desilo. */}
            {revertResult.skippedModifiedCount > 0 ? (
              <p className="text-warning">
                Preskočeno izmenjenih firmi:{" "}
                <span className="font-semibold">{revertResult.skippedModifiedCount}</span>{" "}
                (firme koje je neko izmenio posle uvoza nisu obrisane radi bezbednosti podataka).
              </p>
            ) : (
              <p className="text-text-muted">
                Preskočenih firmi nema — nijednu firmu iz ovog uvoza niko nije menjao posle primene.
              </p>
            )}
          </div>
        </FeedbackNote>
      )}

      {revertError && (
        <FeedbackNote tone="danger" title="Greška pri poništavanju uvoza">
          {revertError}
        </FeedbackNote>
      )}

      {/* Tabela istorije uvoza */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-line bg-surface-raised/60 hover:bg-surface-raised/60">
              <TableHead>Naziv fajla</TableHead>
              <TableHead>Datum uvoza</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Parsirano</TableHead>
              <TableHead className="text-right">Preskočeno</TableHead>
              <TableHead className="text-right">Radnje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.map((imp) => {
              const statusCfg = STATUS_LABELS[imp.status] ?? {
                label: imp.status,
                className: "border-line text-text-muted bg-surface",
              };

              const formattedDate = new Date(imp.uploadedAt).toLocaleString("sr-Latn-RS", {
                dateStyle: "medium",
                timeStyle: "short",
              });

              return (
                <TableRow
                  key={imp._id}
                  className="border-line/60 hover:bg-surface-raised/40 transition-colors"
                >
                  {/* Naziv fajla */}
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {imp.fileName}
                    </div>
                    {imp.sheetsChosen && imp.sheetsChosen.length > 0 && (
                      <div className="text-micro text-text-muted mt-0.5">
                        List: {imp.sheetsChosen.join(", ")}
                      </div>
                    )}
                  </TableCell>

                  {/* Datum */}
                  <TableCell className="text-xs text-text-secondary">
                    {formattedDate}
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                        statusCfg.className,
                      )}
                    >
                      {statusCfg.label}
                    </span>
                  </TableCell>

                  {/* Broj parsiranih */}
                  <TableCell className="text-right font-mono text-xs text-foreground">
                    {imp.rowsParsed}
                  </TableCell>

                  {/* Broj preskočenih */}
                  <TableCell className="text-right font-mono text-xs">
                    <span className={cn(imp.rowsSkipped > 0 ? "text-warning" : "text-text-muted")}>
                      {imp.rowsSkipped}
                    </span>
                  </TableCell>

                  {/* Radnje */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {imp.status === "u_pregledu" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onSelectImport(imp._id)}
                          className="h-8 text-xs border-warning/40 text-warning hover:bg-warning/10"
                        >
                          Nastavi pregled
                          <ArrowRight className="size-3.5 ml-1" />
                        </Button>
                      )}

                      {imp.status === "primenjen" && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onSelectImport(imp._id)}
                            className="h-8 text-xs"
                          >
                            <Eye className="size-3.5 mr-1" />
                            Pregled
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRevertError(null);
                              setRevertingImportId(imp._id);
                            }}
                            className="h-8 text-xs border-danger/30 text-danger hover:bg-danger/10"
                          >
                            <RotateCcw className="size-3.5 mr-1" />
                            Poništi
                          </Button>
                        </>
                      )}

                      {imp.status !== "u_pregledu" && imp.status !== "primenjen" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onSelectImport(imp._id)}
                          className="h-8 text-xs"
                        >
                          <Eye className="size-3.5 mr-1" />
                          Pregled
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dijalog potvrde za poništavanje uvoza */}
      <Dialog
        open={revertingImportId !== null}
        onOpenChange={(open) => {
          if (!open && !isReverting) setRevertingImportId(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogClose />
          <DialogHeader>
            <DialogTitle>Poništavanje primenjenog uvoza</DialogTitle>
            <DialogDescription>
              Poništavanjem ovog uvoza obrisaće se sve firme koje je ovaj uvoz kreirao.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-text-secondary">
            <FeedbackNote tone="warning" title="Pravila poništavanja">
              <ul className="list-disc pl-4 space-y-1 mt-1 text-micro text-text-muted">
                <li>Brišu se samo firme koje je direktno kreirao ovaj uvoz.</li>
                <li>Firme koje su postojale pre uvoza neće biti obrisane.</li>
                <li>Firme koje je neko izmenio nakon uvoza biće preskočene radi zaštite podataka.</li>
              </ul>
            </FeedbackNote>

            {revertError && (
              <FeedbackNote tone="danger" title="Greška">
                {revertError}
              </FeedbackNote>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRevertingImportId(null)}
              disabled={isReverting}
            >
              Odustani
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleRevertConfirm}
              disabled={isReverting}
              className="bg-danger text-text-inverse font-semibold hover:bg-danger/90"
            >
              {isReverting ? (
                <>
                  <LoaderCircle className="animate-spin size-4 mr-1.5" />
                  Poništavam...
                </>
              ) : (
                "Potvrdi poništavanje"
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
