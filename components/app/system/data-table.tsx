"use client";

import { createContext, useContext, type ComponentProps } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * TABELA — shadcn `Table` sa pravilima sistema (A1 §3)
 * ============================================================================
 *
 * Zaglavlje u `text-meta` prigušeno, ćelije u `text-ui`, brojevi desno i
 * tabularni (`numeric`), dve gustine (`comfortable` 40 px, `compact` 32 px)
 * kroz kontekst — ne kroz klasu koju svaka ćelija ponavlja. Red dobija
 * `hover` podlogu iz shadcn osnove; levu ivicu hitnosti (4 px) daje pozivalac
 * klasom iz `lead-urgency.ts`, tabela je ne poznaje.
 *
 * Ovo NIJE nova implementacija tabele: ispod je isti `components/ui/table`,
 * pa sve što tamo radi (sticky kolone, `colSpan`, `aria-sort`) radi i ovde.
 */
type Density = "comfortable" | "compact";

const DensityContext = createContext<Density>("comfortable");

const CELL_PAD: Record<Density, string> = {
  comfortable: "px-3 py-2.5",
  compact: "px-2 py-1",
};

export function DataTable({
  density = "comfortable",
  className,
  ...props
}: ComponentProps<typeof Table> & { density?: Density }) {
  return (
    <DensityContext.Provider value={density}>
      <Table
        className={cn(density === "compact" ? "text-meta" : "text-ui", className)}
        {...props}
      />
    </DensityContext.Provider>
  );
}

export const DataTableHeader = TableHeader;
export const DataTableBody = TableBody;

export function DataTableRow({ className, ...props }: ComponentProps<typeof TableRow>) {
  return <TableRow className={cn("border-line", className)} {...props} />;
}

/** Red zaglavlja: blago podignuta podloga, bez hover promene. */
export function DataTableHeadRow({ className, ...props }: ComponentProps<typeof TableRow>) {
  return (
    <TableRow
      className={cn("border-line bg-surface-raised/40 hover:bg-surface-raised/40", className)}
      {...props}
    />
  );
}

export function DataTableHead({
  numeric = false,
  className,
  ...props
}: ComponentProps<typeof TableHead> & { numeric?: boolean }) {
  const density = useContext(DensityContext);
  return (
    <TableHead
      className={cn(
        "h-auto text-meta font-medium text-text-muted",
        CELL_PAD[density],
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function DataTableCell({
  numeric = false,
  className,
  ...props
}: ComponentProps<typeof TableCell> & { numeric?: boolean }) {
  const density = useContext(DensityContext);
  return (
    <TableCell
      className={cn(
        CELL_PAD[density],
        numeric && "text-right font-mono tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/** Jedan red preko svih kolona — mesto za `EmptyState` ili poruku. */
export function DataTableEmpty({
  colSpan,
  className,
  ...props
}: ComponentProps<typeof TableCell> & { colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className={cn("whitespace-normal p-0", className)}
        {...props}
      />
    </TableRow>
  );
}
