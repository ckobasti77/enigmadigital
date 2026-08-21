"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Ga4ValueState } from "@/convex/lib/ga4Catalog";
import { formatPercent } from "@/lib/format";
import { MetricValue } from "./metric-state";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * RankTable — jedna rang-tabela sa trakom udela, za ceo GA4 modul
 * ============================================================================
 *
 * Zamenjuje sedam skoro istih tabela (izvori, kanali, stranice, ulazne
 * stranice, događaji, geografija, oglasi) koje su nastale iz sedam promptova u
 * dva vizuelna dijalekta: dve kartice, tri stila zaglavlja koje se sortira, i
 * ČETIRI različita tretmana trake udela (`bg-foreground/50`, `--chart-1`,
 * `--chart-2`, `bg-primary/70`).
 *
 * Ovde: jedna kartica (`ring-line`), jedno sortabilno zaglavlje, jedna
 * NEUTRALNA traka udela u zasebnoj „Udeo" koloni (udeo je magnituda, ne
 * identitet — nikad boja serije, nikad rezervisani cijan), jedan „Ostalo" i
 * jedan „Ukupno" red, jedno prazno stanje, i sopstveni `overflow-x-auto`
 * kontejner (tako i „Izvori saobraćaja" konačno klizi unutar kartice).
 *
 * Brojevi idu kroz `MetricValue` (koje mesto poziva hrani `formatMetric`-om iz
 * kataloga), pa se nepoznato („—" + razlog) razlikuje od nule.
 */

export type RankAlign = "left" | "right";

export type RankColumn<Row> = {
  key: string;
  header: string;
  align?: RankAlign;
  sortable?: boolean;
  headerClassName?: string;
  cellClassName?: string;
  /** Vrednost za sortiranje i (ako nema `cell`) za prikaz kroz `MetricValue`. */
  value?: (row: Row) => number | string | null | undefined;
  /** Formatiranje broja — po dogovoru `formatMetric(v, katalog.metrika)`. */
  format?: (v: number) => string;
  /** 3-stanje po ćeliji; podrazumevano „value". */
  state?: (row: Row) => Ga4ValueState;
  /** Prilagođena ćelija (naziv sa kompozicijom, bedž…) — preteže nad value/format. */
  cell?: (row: Row) => ReactNode;
  /** Druga, prigušena linija ispod vrednosti (npr. „odskok 42%"). */
  sub?: (row: Row) => ReactNode;
};

export type RankShare<Row> = {
  /** Brojilac udela za red (imenilac je `total`). */
  value: (row: Row) => number | null | undefined;
  total: number;
};

type SortState = { key: string; dir: "asc" | "desc" };

export function RankTable<Row>({
  title,
  subtitle,
  headerRight,
  note,
  footNote,
  columns,
  rows,
  rowKey,
  rank = false,
  share,
  remainder = null,
  totalsRow = null,
  totalsLabel,
  defaultSort,
  emptyMessage = "Nema podataka u izabranom periodu.",
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Desni slot u zaglavlju: `SegmentedToggle` i sl. */
  headerRight?: ReactNode;
  /** Traka ispod zaglavlja (npr. objašnjenje ključnih događaja). */
  note?: ReactNode;
  /** Obavezna fusnota ispod tabele (privatnost, valuta, klikovi vs sesije). */
  footNote?: ReactNode;
  columns: readonly RankColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string;
  /** Vodeća „#" kolona (rang). */
  rank?: boolean;
  /** Traka udela u zasebnoj „Udeo" koloni. */
  share?: RankShare<Row>;
  /** Već izračunat „Ostalo" red (prigušen, kurziv). */
  remainder?: Row | null;
  /** Već izračunat „Ukupno" red (podebljan, gornja ivica). */
  totalsRow?: Row | null;
  /** Natpis prve ćelije u „Ukupno" redu (npr. „Ukupno (svi izvori)"). */
  totalsLabel?: ReactNode;
  defaultSort?: SortState;
  emptyMessage?: ReactNode;
  className?: string;
}) {
  const firstNumeric = columns.find((c) => c.align === "right")?.key;
  const initialSort: SortState =
    defaultSort ??
    (firstNumeric ? { key: firstNumeric, dir: "desc" } : { key: columns[0].key, dir: "desc" });
  const [sort, setSort] = useState<SortState>(initialSort);

  const colByKey = useMemo(
    () => new Map(columns.map((c) => [c.key, c])),
    [columns],
  );

  const sortedRows = useMemo(() => {
    const col = colByKey.get(sort.key);
    if (!col?.value) return [...rows];
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.value!(a);
      const bv = col.value!(b);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av ?? "").localeCompare(String(bv ?? ""), "sr-Latn") * dir;
    });
  }, [rows, sort, colByKey]);

  const toggle = (key: string) => {
    const col = colByKey.get(key);
    if (!col || col.sortable === false) return;
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: col.align === "right" ? "desc" : "asc" },
    );
  };

  return (
    <Card className={cn("gap-0 py-0 shadow-card ring-line", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
          )}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>

      {note && (
        <div className="border-y border-line-soft bg-surface-raised/20 px-5 py-2.5 text-xs text-text-muted">
          {note}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-10 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-line-soft hover:bg-transparent">
                {rank && (
                  <TableHead className="w-10 pl-5 text-center text-xs font-medium text-text-muted">
                    #
                  </TableHead>
                )}
                {columns.map((col, i) => (
                  <SortableHead
                    key={col.key}
                    label={col.header}
                    align={col.align ?? "left"}
                    sortable={col.sortable !== false && Boolean(col.value)}
                    active={sort.key === col.key}
                    dir={sort.dir}
                    onClick={() => toggle(col.key)}
                    className={cn(
                      i === 0 && !rank && "pl-5",
                      i === columns.length - 1 && !share && "pr-5",
                      col.headerClassName,
                    )}
                  />
                ))}
                {share && (
                  <TableHead className="hidden pr-5 text-right text-xs font-medium text-text-muted md:table-cell">
                    Udeo
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row, idx) => (
                <TableRow
                  key={rowKey(row, idx)}
                  className="border-line-soft hover:bg-surface-raised/40"
                >
                  {rank && (
                    <TableCell className="pl-5 text-center font-mono text-xs tabular-nums text-text-muted">
                      {idx + 1}
                    </TableCell>
                  )}
                  {columns.map((col, i) => (
                    <DataCell
                      key={col.key}
                      col={col}
                      row={row}
                      firstNoRank={i === 0 && !rank}
                      last={i === columns.length - 1 && !share}
                    />
                  ))}
                  {share && <ShareCell value={pct(share.value(row), share.total)} />}
                </TableRow>
              ))}

              {remainder && (
                <TableRow className="border-line-soft bg-surface-raised/10 italic hover:bg-surface-raised/30">
                  {rank && (
                    <TableCell className="pl-5 text-center text-xs text-text-muted">
                      —
                    </TableCell>
                  )}
                  {columns.map((col, i) => (
                    <DataCell
                      key={col.key}
                      col={col}
                      row={remainder}
                      firstNoRank={i === 0 && !rank}
                      last={i === columns.length - 1 && !share}
                      muted
                    />
                  ))}
                  {share && (
                    <ShareCell value={pct(share.value(remainder), share.total)} muted />
                  )}
                </TableRow>
              )}

              {totalsRow && (
                <TableRow className="border-t border-line bg-surface-raised/20 font-semibold hover:bg-surface-raised/30">
                  {rank && <TableCell className="pl-5 text-center text-xs">—</TableCell>}
                  {columns.map((col, i) => {
                    const firstNoRank = i === 0 && !rank;
                    if (i === 0) {
                      return (
                        <TableCell
                          key={col.key}
                          className={cn("py-3 text-foreground", firstNoRank && "pl-5")}
                        >
                          {totalsLabel ?? "Ukupno"}
                        </TableCell>
                      );
                    }
                    return (
                      <DataCell
                        key={col.key}
                        col={col}
                        row={totalsRow}
                        firstNoRank={false}
                        last={i === columns.length - 1 && !share}
                      />
                    );
                  })}
                  {share && (
                    <TableCell className="hidden py-3 pr-5 text-right font-mono text-xs tabular-nums text-text-muted md:table-cell">
                      100%
                    </TableCell>
                  )}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {footNote && (
        <div className="border-t border-line-soft px-5 py-3 text-xs leading-relaxed text-text-muted">
          {footNote}
        </div>
      )}
    </Card>
  );
}

function DataCell<Row>({
  col,
  row,
  firstNoRank,
  last,
  muted,
}: {
  col: RankColumn<Row>;
  row: Row;
  firstNoRank: boolean;
  last: boolean;
  muted?: boolean;
}) {
  const align = col.align ?? "left";
  const main = col.cell ? (
    col.cell(row)
  ) : col.value && col.format ? (
    (() => {
      const v = col.value(row);
      if (typeof v === "string") return <span>{v}</span>;
      return (
        <MetricValue
          value={v as number | null | undefined}
          state={col.state?.(row)}
          format={col.format}
          className={muted ? "text-text-muted" : undefined}
        />
      );
    })()
  ) : (
    <span>{String(col.value?.(row) ?? "")}</span>
  );

  return (
    <TableCell
      className={cn(
        "py-3",
        align === "right" && "text-right",
        firstNoRank && "pl-5",
        last && "pr-5",
        muted && "text-text-muted",
        col.cellClassName,
      )}
    >
      {main}
      {col.sub && (
        <div className="text-[10px] leading-tight text-text-muted">
          {col.sub(row)}
        </div>
      )}
    </TableCell>
  );
}

/** Jedina traka udela u modulu: neutralna, magnituda a ne identitet. */
function ShareCell({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <TableCell className="hidden py-3 pr-5 text-right md:table-cell">
      <div className="flex items-center justify-end gap-2">
        <span className="w-12 text-right font-mono text-xs tabular-nums text-text-muted">
          {formatPercent(value)}
        </span>
        <span
          className="h-1.5 w-16 overflow-hidden rounded-full bg-line-soft"
          aria-hidden
        >
          <span
            className={cn(
              "block h-full rounded-full",
              muted ? "bg-text-muted/45" : "bg-foreground/45",
            )}
            style={{ width: `${Math.max(value > 0 ? 4 : 0, value * 100)}%` }}
          />
        </span>
      </div>
    </TableCell>
  );
}

function SortableHead({
  label,
  align,
  sortable,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  align: RankAlign;
  sortable: boolean;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  if (!sortable) {
    return (
      <TableHead
        className={cn(
          "h-9 text-xs font-medium text-text-muted",
          align === "right" && "text-right",
          className,
        )}
      >
        {label}
      </TableHead>
    );
  }
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("h-9 text-xs font-medium", align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          align === "right" ? "flex-row-reverse" : "justify-start",
          active ? "text-foreground" : "text-text-muted hover:text-foreground",
        )}
      >
        <Icon className="size-3 shrink-0" aria-hidden />
        {label}
      </button>
    </TableHead>
  );
}

function pct(value: number | null | undefined, total: number): number {
  if (value == null || !Number.isFinite(value) || total <= 0) return 0;
  return value / total;
}

export function RankTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="border-t border-line-soft">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line-soft px-5 py-3 last:border-0"
          >
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="hidden h-1.5 w-16 md:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}
