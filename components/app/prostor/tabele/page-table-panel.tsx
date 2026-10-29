"use client";

// Preneto iz Devotion apps/web/components/workspace/tables/page-table-panel.tsx (main @ c05c40f), SPAJANJE S11.
import { useRef, useState } from "react";
import { MoreHorizontal, Plus, Upload } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { SectionHeading } from "@/components/app/prostor/zajednicko/radni-ui";
import { TableImportDialog } from "@/components/app/prostor/tabele/table-import-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
// Granice su iste kao na serveru (`lib/prostor/ogranicenja`).
import {
  MAX_TABLE_CELL_LENGTH,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_LABEL_LENGTH,
  MAX_TABLE_ROWS,
} from "@/lib/prostor/ogranicenja";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useProjekatMutation, useProjekatQuery } from "@/components/app/projekat-provider";
import { useProjekatPaginatedQuery } from "@/components/app/prostor/podaci/projekat";

type CellAddress = {
  pageId: Id<"pages">;
  rowId: Id<"pageTableRows">;
  columnId: string;
};

function sameCell(a: CellAddress | null, b: CellAddress) {
  return (
    a !== null &&
    a.pageId === b.pageId &&
    a.rowId === b.rowId &&
    a.columnId === b.columnId
  );
}

/** Brojevi se čitaju lakše desno poravnati, i kad je ćelija samo tekst. */
function looksNumeric(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  return /^-?[\d.,\s]+(%|€|\$|din\.?|RSD)?$/i.test(trimmed);
}

/** Ivica sa „+" (nova kolona desno, nov red dole): mirna, bez boje radnje. */
const IVICA_DODAVANJA =
  "grid shrink-0 place-items-center rounded-lg border border-dashed border-line-soft text-text-muted transition-colors hover:border-line-strong hover:bg-surface-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:hover:border-line-soft disabled:hover:bg-transparent disabled:hover:text-text-muted";

type Brisanje =
  | { vrsta: "kolona"; columnId: string; label: string }
  | { vrsta: "red"; rowId: Id<"pageTableRows">; broj: number };

/**
 * Stranica-tabela (PROSTOR P19, K07 §5.6): kolone (preimenuj, pomeri,
 * obriši), redovi (dodaj ispod, obriši), ćelije koje se menjaju u mestu i
 * uvoz iz Excel-a ili CSV-a. Brisanje kolone i reda traži potvrdu.
 */
export function PageTablePanel({
  pageId,
  className,
}: {
  pageId: Id<"pages">;
  className?: string;
}) {
  const meta = useProjekatQuery(api.prostor.pageTables.getMeta, { pageId });
  const {
    results: rows,
    status,
    loadMore,
  } = useProjekatPaginatedQuery(
    api.prostor.pageTables.listRows,
    { pageId },
    { initialNumItems: 100 },
  );
  const addColumn = useProjekatMutation(api.prostor.pageTables.addColumn);
  const renameColumn = useProjekatMutation(api.prostor.pageTables.renameColumn);
  const removeColumn = useProjekatMutation(api.prostor.pageTables.removeColumn);
  const moveColumn = useProjekatMutation(api.prostor.pageTables.moveColumn);
  const addRow = useProjekatMutation(api.prostor.pageTables.addRow);
  const removeRow = useProjekatMutation(api.prostor.pageTables.removeRow);
  const setCells = useProjekatMutation(api.prostor.pageTables.setCells);

  const [editing, setEditing] = useState<CellAddress | null>(null);
  const [draft, setDraft] = useState("");
  const [renamingColumnId, setRenamingColumnId] = useState<string | null>(null);
  const [columnDraft, setColumnDraft] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [brisanje, setBrisanje] = useState<Brisanje | null>(null);
  const [brisem, setBrisem] = useState(false);
  const busyRef = useRef(false);

  if (meta === undefined) {
    return (
      <div role="status" aria-label="Učitavanje tabele" className={cn("space-y-2", className)}>
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const columns = meta.columns;
  const canEditCells = meta.canEditCells;
  // Klijentske provere granica (server ostaje autoritet). `rowCount` dolazi iz getMeta.
  const atColumnLimit = columns.length >= MAX_TABLE_COLUMNS;
  const atRowLimit = meta.rowCount >= MAX_TABLE_ROWS;

  async function commitCell(address: CellAddress, value: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await setCells({ rowId: address.rowId, values: { [address.columnId]: value } });
    } catch (error) {
      toast.error(accessErrorMessage(error, "Ćelija nije sačuvana."));
    } finally {
      busyRef.current = false;
    }
  }

  async function potvrdiBrisanje() {
    if (brisanje === null) return;
    setBrisem(true);
    try {
      if (brisanje.vrsta === "kolona") await removeColumn({ pageId, columnId: brisanje.columnId });
      else await removeRow({ rowId: brisanje.rowId });
      setBrisanje(null);
    } catch (error) {
      toast.error(
        accessErrorMessage(error, brisanje.vrsta === "kolona" ? "Kolona nije obrisana." : "Red nije obrisan."),
      );
    } finally {
      setBrisem(false);
    }
  }

  function startEdit(address: CellAddress, value: string) {
    if (!canEditCells) return;
    setEditing(address);
    setDraft(value);
  }

  return (
    <section className={cn("space-y-3", className)} aria-labelledby={`tabela-${pageId}`}>
      <SectionHeading
        id={`tabela-${pageId}`}
        title="Tabela"
        // Ukupan broj (denormalizovani rowCount), ne samo učitane strane.
        count={`${formatNumber(Math.max(meta.rowCount, rows.length))} × ${formatNumber(columns.length)}`}
        action={
          meta.canEditStructure ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload aria-hidden="true" /> Uvezi Excel / CSV
            </Button>
          ) : null
        }
      />

      {/* Mreža + dve ivice sa „+": desno nova kolona, dole nov red. */}
      <div className="flex gap-2">
        <div className="scrollbar-thin min-w-0 flex-1 overflow-x-auto rounded-xl border border-line-soft bg-card">
          <table className="w-full border-collapse text-left text-ui">
            <thead className="bg-surface-raised">
              <tr>
                <th
                  scope="col"
                  className="w-10 border-b border-r border-line-soft px-2 py-2 text-meta font-semibold text-text-muted"
                >
                  <span aria-hidden="true">#</span>
                  <span className="sr-only">Red</span>
                </th>
                {columns.map((column, columnIndex) => (
                  <th
                    key={column.id}
                    scope="col"
                    className="min-w-40 border-b border-r border-line-soft px-1 py-1 last:border-r-0"
                  >
                    <div className="flex items-center gap-1">
                      {renamingColumnId === column.id ? (
                        <Input
                          autoFocus
                          aria-label={`Naziv kolone ${column.label}`}
                          value={columnDraft}
                          maxLength={MAX_TABLE_LABEL_LENGTH}
                          className="h-8 min-w-0 flex-1"
                          onChange={(event) => setColumnDraft(event.target.value)}
                          onBlur={() => setRenamingColumnId(null)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setRenamingColumnId(null);
                            if (event.key === "Enter") {
                              void renameColumn({
                                pageId,
                                columnId: column.id,
                                label: columnDraft,
                              })
                                .then(() => setRenamingColumnId(null))
                                .catch((error: unknown) =>
                                  toast.error(accessErrorMessage(error, "Naziv kolone nije sačuvan.")),
                                );
                            }
                          }}
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate px-2 py-1 text-meta font-semibold text-text-secondary">
                          {column.label}
                        </span>
                      )}
                      {meta.canEditStructure ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0 text-text-secondary"
                                aria-label={`Radnje za kolonu ${column.label}`}
                              />
                            }
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => {
                                setRenamingColumnId(column.id);
                                setColumnDraft(column.label);
                              }}
                            >
                              Preimenuj kolonu
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={columnIndex === 0}
                              onClick={() =>
                                void moveColumn({
                                  pageId,
                                  columnId: column.id,
                                  toIndex: columnIndex - 1,
                                })
                              }
                            >
                              Pomeri levo
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={columnIndex === columns.length - 1}
                              onClick={() =>
                                void moveColumn({
                                  pageId,
                                  columnId: column.id,
                                  toIndex: columnIndex + 1,
                                })
                              }
                            >
                              Pomeri desno
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={columns.length <= 1}
                              onClick={() =>
                                setBrisanje({ vrsta: "kolona", columnId: column.id, label: column.label })
                              }
                            >
                              Obriši kolonu
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {status === "LoadingFirstPage" ? (
                <tr role="status" aria-label="Učitavanje redova">
                  <td colSpan={columns.length + 1} className="space-y-1 px-3 py-2">
                    <Skeleton className="h-8 rounded-md" />
                    <Skeleton className="h-8 rounded-md" />
                    <Skeleton className="h-8 rounded-md" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-6 text-center text-ui text-text-secondary">
                    Tabela je prazna. Dodaj red dugmetom ispod ili uvezi fajl.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIndex) => (
                  <tr key={row._id} className="border-t border-line-soft">
                    <th
                      scope="row"
                      className="w-10 border-r border-line-soft px-1 py-0.5 text-center align-middle text-meta font-medium tabular-nums text-text-muted"
                    >
                      {meta.canEditStructure ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                className="w-full rounded px-1 py-1.5 outline-none transition-colors hover:bg-surface-control-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-surface-control-hover"
                                aria-label={`Radnje za red ${rowIndex + 1}`}
                              />
                            }
                          >
                            {rowIndex + 1}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-44">
                            <DropdownMenuItem
                              disabled={atRowLimit}
                              title={
                                atRowLimit
                                  ? `Tabela može imati najviše ${formatNumber(MAX_TABLE_ROWS)} redova.`
                                  : undefined
                              }
                              onClick={() =>
                                void addRow({
                                  pageId,
                                  afterPosition: row.position,
                                })
                              }
                            >
                              Dodaj red ispod
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setBrisanje({ vrsta: "red", rowId: row._id, broj: rowIndex + 1 })}
                            >
                              Obriši red
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        rowIndex + 1
                      )}
                    </th>
                    {columns.map((column) => {
                      const address = {
                        pageId,
                        rowId: row._id,
                        columnId: column.id,
                      };
                      const value = row.cells[column.id] ?? "";
                      const isEditing = sameCell(editing, address);
                      return (
                        <td key={column.id} className="min-w-40 border-r border-line-soft p-0 last:border-r-0">
                          {isEditing ? (
                            <input
                              autoFocus
                              value={draft}
                              maxLength={MAX_TABLE_CELL_LENGTH}
                              aria-label={`${column.label}, red ${rowIndex + 1}`}
                              className="h-9 pointer-coarse:h-11 w-full bg-surface-control px-2 text-ui text-foreground outline-none ring-2 ring-inset ring-ring"
                              onChange={(event) => setDraft(event.target.value)}
                              onBlur={() => {
                                void commitCell(address, draft);
                                setEditing(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  setEditing(null);
                                  return;
                                }
                                if (event.key === "Enter" || event.key === "Tab") {
                                  event.preventDefault();
                                  void commitCell(address, draft);
                                  setEditing(null);
                                }
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              disabled={!canEditCells}
                              className={cn(
                                "h-9 pointer-coarse:h-11 w-full truncate px-2 text-left text-ui text-foreground transition-colors hover:bg-surface-control-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent",
                                looksNumeric(value) && "text-right tabular-nums",
                              )}
                              aria-label={`${column.label}, red ${rowIndex + 1}: ${value || "prazno"}`}
                              onClick={() => startEdit(address, value)}
                            >
                              {value}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta.canEditStructure ? (
          <button
            type="button"
            disabled={atColumnLimit}
            className={cn(IVICA_DODAVANJA, "w-10 pointer-coarse:w-11")}
            aria-label={
              atColumnLimit ? `Dostignuta granica od ${formatNumber(MAX_TABLE_COLUMNS)} kolona` : "Dodaj kolonu"
            }
            title={
              atColumnLimit
                ? `Tabela može imati najviše ${formatNumber(MAX_TABLE_COLUMNS)} kolona.`
                : "Dodaj kolonu"
            }
            onClick={() =>
              void addColumn({ pageId }).catch((error: unknown) =>
                toast.error(accessErrorMessage(error, "Kolona nije dodata.")),
              )
            }
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {meta.canEditStructure ? (
        <button
          type="button"
          disabled={atRowLimit}
          className={cn(IVICA_DODAVANJA, "h-9 w-full")}
          aria-label={atRowLimit ? `Dostignuta granica od ${formatNumber(MAX_TABLE_ROWS)} redova` : "Dodaj red"}
          title={
            atRowLimit ? `Tabela može imati najviše ${formatNumber(MAX_TABLE_ROWS)} redova.` : "Dodaj red"
          }
          onClick={() =>
            void addRow({ pageId }).catch((error: unknown) =>
              toast.error(accessErrorMessage(error, "Red nije dodat.")),
            )
          }
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      ) : null}

      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(100)}
          >
            {status === "LoadingMore" ? "Učitavam…" : "Učitaj još redova"}
          </Button>
        </div>
      ) : null}

      <TableImportDialog
        pageId={pageId}
        existingRowCount={meta.rowCount}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
      <ConfirmDialog
        open={brisanje !== null}
        onOpenChange={(open) => {
          if (!open) setBrisanje(null);
        }}
        title={
          brisanje?.vrsta === "kolona"
            ? `Obrisati kolonu „${brisanje.label}“?`
            : `Obrisati red ${brisanje?.broj ?? ""}?`
        }
        description={
          brisanje?.vrsta === "kolona"
            ? "Kolona nestaje iz tabele za ceo tim."
            : "Red nestaje iz tabele za ceo tim."
        }
        confirmLabel={brisanje?.vrsta === "kolona" ? "Obriši kolonu" : "Obriši red"}
        busyLabel="Brišem…"
        busy={brisem}
        onConfirm={() => void potvrdiBrisanje()}
      />
    </section>
  );
}
