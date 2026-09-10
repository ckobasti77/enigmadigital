"use client";

import { Fragment, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { trajanje } from "@/convex/lib/notifications";
import { jeZastaoUPregledu } from "@/convex/lib/importFlow";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { FeedbackNote } from "@/components/app/feedback";
import { useNow } from "@/components/app/use-now";
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
import { IMPORT_STATUS_LABELS, statusUvozaLabel } from "./lead-labels";

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
  onSelectImport: (
    importId: Id<"leadImports">,
    prikaz?: "nerazreseno",
  ) => void;
}) {
  const [revertingImportId, setRevertingImportId] = useState<Id<"leadImports"> | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [revertResult, setRevertResult] = useState<RevertResult | null>(null);
  // A5 §2 tačka 5: odustajanje od uvoza koji niko neće pregledati.
  const [abandoningImportId, setAbandoningImportId] = useState<Id<"leadImports"> | null>(null);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);
  // A5 §2 tačka 4: upozorenja parsera ostaju dostupna i posle primene.
  const [otvoreno, setOtvoreno] = useState<Set<string>>(() => new Set());

  const now = useNow();
  const imports = useQuery(api.leadImportStore.listImports, { workspaceId });
  const revertImportMutation = useMutation(api.leadImportStore.revertImport);
  const abandonImportMutation = useMutation(api.leadImportStore.abandonImport);

  const greskaTekst = (err: unknown): string => {
    if (err instanceof ConvexError) {
      const data = err.data as { code?: string; message?: string };
      return `[${data.code || "greška"}]: ${data.message || err.message}`;
    }
    if (err instanceof Error) return err.message;
    return String(err);
  };

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
      setRevertError(greskaTekst(err));
    } finally {
      setIsReverting(false);
    }
  };

  const handleAbandonConfirm = async () => {
    if (!abandoningImportId) return;

    setIsAbandoning(true);
    setAbandonError(null);

    try {
      await abandonImportMutation({
        workspaceId,
        importId: abandoningImportId,
      });
      setAbandoningImportId(null);
    } catch (err: unknown) {
      setAbandonError(greskaTekst(err));
    } finally {
      setIsAbandoning(false);
    }
  };

  const toggleOtvoren = (id: string) => {
    setOtvoreno((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

      {abandonError && (
        <FeedbackNote tone="danger" title="Greška pri odustajanju od uvoza">
          {abandonError}
        </FeedbackNote>
      )}

      {/* Tabela istorije uvoza.
          `overflow-x-auto` umesto `overflow-hidden`: na 390 px tabela je šira
          od ekrana, pa je kolona „Radnje" — a s njom i „Reši preostale (41)" —
          bila odsečena i nedostupna. Sada se do nje dolazi klizanjem unutar
          tabele; strana se i dalje ne kliza vodoravno. */}
      <div className="rounded-xl border border-line bg-surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-line bg-surface-raised/60 hover:bg-surface-raised/60">
              <TableHead>Naziv fajla</TableHead>
              <TableHead>Datum uvoza</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Parsirano</TableHead>
              <TableHead className="text-right">Preskočeno / Nerazrešeno</TableHead>
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

              const zastao = jeZastaoUPregledu(imp, now);
              const imaUpozorenja = imp.warnings.length > 0;
              const jeOtvoren = otvoreno.has(imp._id);

              return (
                <Fragment key={imp._id}>
                  <TableRow className="border-line/60 hover:bg-surface-raised/40 transition-colors">
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
                      {/* A5 §2 tačka 4: upozorenja parsera se do sada nisu videla
                          nigde osim u pregledu, pa su posle primene nestajala.
                          Sada stoje uz sam uvoz, dokle god uvoz postoji. */}
                      {imaUpozorenja && (
                        <button
                          type="button"
                          onClick={() => toggleOtvoren(imp._id)}
                          aria-expanded={jeOtvoren}
                          className="mt-1 inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-micro font-medium text-warning transition-colors hover:border-warning/60"
                        >
                          {jeOtvoren ? (
                            <ChevronDown className="size-3" />
                          ) : (
                            <ChevronRight className="size-3" />
                          )}
                          Upozorenja parsera ({imp.warnings.length})
                        </button>
                      )}
                    </TableCell>

                    {/* Datum */}
                    <TableCell className="text-xs text-text-secondary">
                      {formattedDate}
                      {/* Koliko uvoz već stoji — isti prag i isti tekst kao u
                          zvonu („stoji 13 dana"), da dva ekrana ne bi merila
                          isto vreme na dva načina. */}
                      {imp.status === "u_pregledu" && (
                        <div
                          className={cn(
                            "mt-0.5 text-micro",
                            zastao ? "text-warning" : "text-text-muted",
                          )}
                        >
                          stoji {trajanje(Math.max(0, now - imp.uploadedAt))}
                        </div>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                          statusCfg.className,
                        )}
                      >
                        {statusUvozaLabel(imp)}
                      </span>
                    </TableCell>

                    {/* Broj parsiranih */}
                    <TableCell className="text-right font-mono text-xs text-foreground">
                      {imp.rowsParsed}
                    </TableCell>

                    {/* Preskočeno (pri parsiranju) / Nerazrešeno (odluka) — GL9 §1.
                        Nerazrešeni redovi se pri primeni preskaču; broj ostaje da
                        podseti da 41 firma čeka „Primeni preostale". */}
                    <TableCell className="text-right font-mono text-xs">
                      <span className={cn(imp.rowsSkipped > 0 ? "text-warning" : "text-text-muted")}>
                        {imp.rowsSkipped}
                      </span>
                      <span className="text-text-muted"> / </span>
                      <span className={cn(imp.nerazresenoCount > 0 ? "text-warning" : "text-text-muted")}>
                        {imp.nerazresenoCount}
                      </span>
                    </TableCell>

                    {/* Radnje */}
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {imp.status === "u_pregledu" && (
                          <>
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
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAbandonError(null);
                                setAbandoningImportId(imp._id);
                              }}
                              className="h-8 text-xs border-line-soft text-text-muted hover:border-line-strong hover:text-foreground"
                            >
                              <XCircle className="size-3.5 mr-1" />
                              Odustani od uvoza
                            </Button>
                          </>
                        )}

                        {imp.status === "primenjen" && (
                          <>
                            {imp.nerazresenoCount > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onSelectImport(imp._id, "nerazreseno")}
                                className="h-8 text-xs border-warning/40 text-warning hover:bg-warning/10"
                              >
                                <AlertTriangle className="size-3.5 mr-1" />
                                Reši preostale ({imp.nerazresenoCount})
                              </Button>
                            )}
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

                  {imaUpozorenja && jeOtvoren && (
                    <TableRow className="border-line/60 bg-surface-raised/30 hover:bg-surface-raised/30">
                      <TableCell colSpan={6} className="py-3">
                        <ul className="list-disc space-y-1 pl-5 text-xs text-text-secondary">
                          {imp.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                        {/* List i red zaglavlja postoje samo za uvoz IZ FAJLA;
                            uvoz koji je poslao skill nema ni jedno ni drugo. */}
                        {imp.sheetsChosen.length > 0 && (
                          <p className="mt-2 text-micro text-text-muted">
                            List: {imp.sheetsChosen.join(", ")} · zaglavlje u redu{" "}
                            {imp.headerRowIndex + 1}
                          </p>
                        )}
                        {imp.error && (
                          <p className="mt-2 text-micro text-danger">
                            Zabeležena greška: {imp.error}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
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

      {/* Dijalog potvrde za odustajanje od uvoza (A5 §2 tačka 5) */}
      <Dialog
        open={abandoningImportId !== null}
        onOpenChange={(open) => {
          if (!open && !isAbandoning) setAbandoningImportId(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogClose />
          <DialogHeader>
            <DialogTitle>Odustajanje od uvoza</DialogTitle>
            <DialogDescription>
              Uvoz prestaje da čeka pregled i nestaje iz obaveštenja.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-text-secondary">
            <FeedbackNote tone="warning" title="Šta se dešava">
              <ul className="list-disc pl-4 space-y-1 mt-1 text-micro text-text-muted">
                <li>Ništa se ne briše — redovi ostaju i uvoz se i dalje otvara iz istorije.</li>
                <li>Ovaj uvoz nije primenjen, pa u bazi firmi nije ni napravio ništa.</li>
                <li>Ako ti ipak zatreba, ponovo otpremi isti fajl.</li>
              </ul>
            </FeedbackNote>

            {abandonError && (
              <FeedbackNote tone="danger" title="Greška">
                {abandonError}
              </FeedbackNote>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAbandoningImportId(null)}
              disabled={isAbandoning}
            >
              Ne, vrati me
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAbandonConfirm}
              disabled={isAbandoning}
              className="bg-danger text-text-inverse font-semibold hover:bg-danger/90"
            >
              {isAbandoning ? (
                <>
                  <LoaderCircle className="animate-spin size-4 mr-1.5" />
                  Odustajem...
                </>
              ) : (
                "Potvrdi odustajanje"
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
