// Preneto iz Devotion packages/backend/convex/lib/page_tables.ts (main @ c05c40f), SPAJANJE S03.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  MAX_TABLE_CELL_LENGTH,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_LABEL_LENGTH,
  MAX_TABLE_ROWS,
} from "./validators";

type ReadCtx = QueryCtx | MutationCtx;

export type TableColumn = { id: string; label: string; width?: number };

export function newTableKey(prefix: string, index: number, now: number) {
  return `${prefix}-${now.toString(36)}-${index.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function cleanColumnLabel(value: string, fallback: string) {
  const cleaned = value.trim().replace(/\s+/g, " ").slice(
    0,
    MAX_TABLE_LABEL_LENGTH,
  );
  return cleaned.length === 0 ? fallback : cleaned;
}

export function cleanCellValue(value: string) {
  if (value.length > MAX_TABLE_CELL_LENGTH) {
    throw new Error(
      `Ćelija može imati najviše ${MAX_TABLE_CELL_LENGTH} znakova.`,
    );
  }
  return value;
}

export async function getTableColumns(ctx: ReadCtx, pageId: Id<"pages">) {
  return await ctx.db
    .query("pageTableColumns")
    .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
    .unique();
}

/**
 * Tabela uvek ima bar jednu kolonu. Prazan `pageTableColumns` red se pravi
 * lenjo, pri prvoj izmeni — tako stara tabela iz migracije ne pada na čitanju.
 */
export async function requireTableColumns(
  ctx: MutationCtx,
  page: Doc<"pages">,
  actorProfileId: Id<"profiles">,
  now: number,
) {
  const existing = await getTableColumns(ctx, page._id);
  if (existing !== null) return existing;
  const columnId = newTableKey("col", 0, now);
  const id = await ctx.db.insert("pageTableColumns", {
    workspaceId: page.workspaceId,
    areaId: page.areaId,
    pageId: page._id,
    columns: [{ id: columnId, label: "Kolona 1" }],
    revision: 0,
    updatedByProfileId: actorProfileId,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get("pageTableColumns", id);
  if (created === null) throw new Error("Tabela nije kreirana.");
  return created;
}

export async function writeTableColumns(
  ctx: MutationCtx,
  row: Doc<"pageTableColumns">,
  columns: TableColumn[],
  actorProfileId: Id<"profiles">,
  now: number,
) {
  if (columns.length === 0) {
    throw new Error("Tabela mora imati bar jednu kolonu.");
  }
  if (columns.length > MAX_TABLE_COLUMNS) {
    throw new Error(`Tabela može imati najviše ${MAX_TABLE_COLUMNS} kolona.`);
  }
  await ctx.db.patch("pageTableColumns", row._id, {
    columns,
    revision: row.revision + 1,
    updatedByProfileId: actorProfileId,
    updatedAt: now,
  });
}

export async function countActiveTableRows(ctx: ReadCtx, pageId: Id<"pages">) {
  const rows = await ctx.db
    .query("pageTableRows")
    .withIndex("by_pageId_and_archivedAt_and_position", (q) =>
      q.eq("pageId", pageId).eq("archivedAt", null),
    )
    .take(MAX_TABLE_ROWS + 1);
  if (rows.length > MAX_TABLE_ROWS) {
    throw new Error(`Tabela može imati najviše ${MAX_TABLE_ROWS} redova.`);
  }
  return rows.length;
}

/** Sažetak R×C na stranici; kanvas kartica čita samo njega. */
export async function syncTableSummary(
  ctx: MutationCtx,
  page: Doc<"pages">,
  actorProfileId: Id<"profiles">,
  now: number,
) {
  const columnsRow = await getTableColumns(ctx, page._id);
  const rowCount = await countActiveTableRows(ctx, page._id);
  await ctx.db.patch("pages", page._id, {
    tableRowCount: rowCount,
    tableColumnCount: columnsRow?.columns.length ?? 0,
    updatedByProfileId: actorProfileId,
    updatedAt: now,
  });
}
