// Preneto iz Devotion packages/backend/convex/lib/page_files.ts (main @ c05c40f), SPAJANJE S03.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

export const MAX_PAGE_FILES = 25;
export const MAX_PAGE_FILE_BYTES = 50 * 1024 * 1024;
/** Video sme više od ostalih — telefonski snimci lako pređu 50 MB. */
export const MAX_PAGE_MEDIA_BYTES = 200 * 1024 * 1024;
export const MAX_PAGE_FILE_NAME_LENGTH = 200;
/**
 * Prilog mlađi od ovoga se ne briše pri čišćenju beleške — autosave je mogao
 * da sačuva telo snimljeno pre nego što je fajl ubačen u tekst.
 */
export const PRUNE_GRACE_MS = 10 * 60 * 1000;

export type PageFileCategory =
  | "image"
  | "video"
  | "pdf"
  | "audio"
  | "sheet"
  | "document";

const SHEET_CONTENT_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

const DOCUMENT_CONTENT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "application/rtf",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
]);

/** Rezerva kad pregledač uopšte ne pošalje `Content-Type`. */
const EXTENSION_CATEGORIES: Record<string, PageFileCategory> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  avif: "image",
  heic: "image",
  heif: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio",
  csv: "sheet",
  xls: "sheet",
  xlsx: "sheet",
  ods: "sheet",
  txt: "document",
  md: "document",
  rtf: "document",
  json: "document",
  doc: "document",
  docx: "document",
  odt: "document",
  ppt: "document",
  pptx: "document",
  zip: "document",
};

/**
 * Kategorija se izvodi iz `contentType`; on ima prednost kad je prepoznat.
 * Ekstenzija odlučuje kad tip nije stigao ili ga ne prepoznajemo (iOS Files i
 * neki pregledači šalju prazan tip, `text/rtf`, `text/x-csv` i slično), a mapa
 * sadrži isključivo bezopasne ekstenzije. Nepoznat tip sa nepoznatom
 * ekstenzijom se i dalje odbija umesto da se tiho svrsta u „dokument”.
 */
export function pageFileCategoryFor(
  contentType: string | undefined,
  fileName = "",
): PageFileCategory | null {
  const normalized = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (normalized !== "" && normalized !== "application/octet-stream") {
    if (normalized === "application/pdf") return "pdf";
    if (normalized.startsWith("image/")) return "image";
    if (normalized.startsWith("video/")) return "video";
    if (normalized.startsWith("audio/")) return "audio";
    if (SHEET_CONTENT_TYPES.has(normalized)) return "sheet";
    if (DOCUMENT_CONTENT_TYPES.has(normalized)) return "document";
  }
  const extension = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  return EXTENSION_CATEGORIES[extension] ?? null;
}

/** Granica veličine po kategoriji: mediji sa telefona dobijaju širu granicu. */
export function maxPageFileBytesFor(category: PageFileCategory): number {
  return category === "video" ? MAX_PAGE_MEDIA_BYTES : MAX_PAGE_FILE_BYTES;
}

/** Redosled prikaza priloga na kartici; slika prva jer ona nosi pregled. */
const PREVIEW_PRIORITY: PageFileCategory[] = [
  "image",
  "pdf",
  "video",
  "sheet",
  "document",
  "audio",
];

export function cleanPageFileName(value: string) {
  const cleaned = value.trim().replace(/[\r\n\t]/g, " ").slice(
    0,
    MAX_PAGE_FILE_NAME_LENGTH,
  );
  if (cleaned.length === 0) throw new Error("Ime fajla je obavezno.");
  return cleaned;
}

export async function listActivePageFiles(ctx: ReadCtx, pageId: Id<"pages">) {
  const rows = await ctx.db
    .query("pageFiles")
    .withIndex("by_pageId_and_archivedAt_and_position", (q) =>
      q.eq("pageId", pageId).eq("archivedAt", null),
    )
    .order("asc")
    .take(MAX_PAGE_FILES + 1);
  if (rows.length > MAX_PAGE_FILES) {
    throw new Error(
      `Oblačić može imati najviše ${MAX_PAGE_FILES} fajlova.`,
    );
  }
  return rows;
}

/**
 * Prepisuje sažetke na stranicu. Kanvas čita samo njih, pa kartica ne mora da
 * povuče ceo spisak priloga da bi znala šta prikazuje.
 */
export async function syncPageFileSummary(
  ctx: MutationCtx,
  page: Doc<"pages">,
  actorProfileId: Id<"profiles">,
  now: number,
) {
  const rows = await listActivePageFiles(ctx, page._id);
  // Sažetke na dokumentu ima samo „fajl” oblačić; beleška priloge prikazuje u
  // telu, pa se njen dokument ne dira (attach ne sme da pomera ni `updatedAt`).
  if (page.kind !== "file") return rows;
  const previewRow =
    PREVIEW_PRIORITY.flatMap((category) =>
      rows.filter((row) => row.category === category),
    )[0] ?? null;
  await ctx.db.patch("pages", page._id, {
    fileCount: rows.length,
    filePreviewStorageId:
      previewRow?.category === "image" ? previewRow.storageId : undefined,
    filePrimaryCategory: previewRow?.category,
    updatedByProfileId: actorProfileId,
    updatedAt: now,
  });
  return rows;
}
