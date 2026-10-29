/**
 * Ograničenja tabela i priloga za web (SPAJANJE S11).
 *
 * Brojevi se ne prepisuju: izvor je server (`convex/prostor/lib/*`), pa web
 * i backend ne mogu da se raziđu. Server ostaje autoritet; web ih koristi da
 * kaže granicu pre slanja (uvoz tabele, otpremanje priloga).
 */
export {
  MAX_TABLE_CELL_LENGTH,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_IMPORT_BATCH,
  MAX_TABLE_LABEL_LENGTH,
  MAX_TABLE_ROWS,
} from "../../convex/prostor/lib/validators";
export {
  MAX_PAGE_FILE_BYTES,
  MAX_PAGE_FILES,
  MAX_PAGE_MEDIA_BYTES,
} from "../../convex/prostor/lib/page_files";

/** Tabela umetnuta u telo beleške (ne stranica-tabela): drži se čitljivom. */
export const NOTE_TABLE_MAX_ROWS = 100;
export const NOTE_TABLE_MAX_COLS = 20;
