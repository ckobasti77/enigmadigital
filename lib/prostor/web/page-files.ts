// Preneto iz Devotion apps/web/lib/page-files.ts (main @ c05c40f), SPAJANJE S11.
import type { Id } from "../../../convex/_generated/dataModel";
import { normalizeImageForUpload } from "./media-convert";
import { formatFileSize, type PageFileCategory } from "./vrste-stranica";
import { MAX_PAGE_FILE_BYTES, MAX_PAGE_FILES, MAX_PAGE_MEDIA_BYTES } from "../ogranicenja";

/** Isti brojevi kao `MAX_PAGE_FILE_BYTES`/`MAX_PAGE_MEDIA_BYTES`/`MAX_PAGE_FILES` na serveru (`lib/prostor/ogranicenja`). */
export const MAX_FILE_BYTES = MAX_PAGE_FILE_BYTES;
export const MAX_MEDIA_BYTES = MAX_PAGE_MEDIA_BYTES;
export const MAX_FILES = MAX_PAGE_FILES;

/** Ista lista kao `pageFileCategoryFor` na serveru; server je i dalje autoritet. */
const SUPPORTED_EXTENSIONS = new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "heic", "heif",
  "mp4", "webm", "mov", "mp3", "wav", "m4a", "ogg",
  "csv", "xls", "xlsx", "ods",
  "txt", "md", "rtf", "json", "doc", "docx", "odt", "ppt", "pptx", "zip",
]);
const SUPPORTED_MIME_PREFIXES = ["image/", "video/", "audio/"];

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov"]);

/**
 * iOS Files ume da pošalje prazan `type` — bez ovoga bi blob u skladištu ostao
 * `application/octet-stream` i pregled bi zavisio samo od ekstenzije.
 */
const EXTENSION_MIME: Record<string, string> = {
  heic: "image/heic",
  heif: "image/heif",
  mov: "video/quicktime",
  m4a: "audio/mp4",
  md: "text/markdown",
  csv: "text/csv",
};

function fileExtension(file: File) {
  return file.name.split(".").pop()?.trim().toLowerCase() ?? "";
}

function normalizedType(file: File) {
  return file.type.split(";")[0].trim().toLowerCase();
}

export function inferredContentType(file: File): string {
  const type = normalizedType(file);
  if (type !== "" && type !== "application/octet-stream") return type;
  return EXTENSION_MIME[fileExtension(file)] ?? "application/octet-stream";
}

export function isSupportedFile(file: File) {
  const type = normalizedType(file);
  if (
    type !== "" &&
    type !== "application/octet-stream" &&
    (type === "application/pdf" ||
      SUPPORTED_MIME_PREFIXES.some((prefix) => type.startsWith(prefix)))
  ) {
    return true;
  }
  return SUPPORTED_EXTENSIONS.has(fileExtension(file));
}

export function maxBytesForFile(file: File): number {
  const isVideo =
    normalizedType(file).startsWith("video/") ||
    VIDEO_EXTENSIONS.has(fileExtension(file));
  return isVideo ? MAX_MEDIA_BYTES : MAX_FILE_BYTES;
}

/** Šta uspešan `pageFiles.attach` vraća — dovoljno da se prilog odmah prikaže. */
export type AttachedPageFile = {
  fileId: Id<"pageFiles">;
  name: string;
  size: number;
  category: PageFileCategory;
};

type AttachResult =
  | ({ ok: true } & AttachedPageFile)
  | {
      ok: false;
      reason: "expired" | "unsupported" | "too_large" | "limit";
      message: string;
    };

type GenerateUploadUrl = (args: {
  pageId: Id<"pages">;
}) => Promise<{ uploadUrl: string; token: string; expiresAt: number }>;

type AttachPageFile = (args: {
  pageId: Id<"pages">;
  storageId: Id<"_storage">;
  token: string;
  name: string;
}) => Promise<AttachResult>;

/**
 * Tri koraka slanja: dozvola → POST bloba → attach. Provere pre slanja postoje
 * da fajl koji server ne prima ne stigne ni do skladišta; attach odbijanje
 * posle POST-a server vraća kao `{ok: false}` i sam briše blob. Poruke o
 * grešci su fragmenti („veći je od…”) — pozivalac ih prefiksuje imenom fajla.
 */
export async function uploadPageFile({
  pageId,
  file: pickedFile,
  generateUploadUrl,
  attach,
}: {
  pageId: Id<"pages">;
  file: File;
  generateUploadUrl: GenerateUploadUrl;
  attach: AttachPageFile;
}): Promise<AttachedPageFile> {
  const file = await normalizeImageForUpload(pickedFile);
  const maxBytes = maxBytesForFile(file);
  if (file.size > maxBytes) {
    throw new Error(
      `veći je od ${Math.round(maxBytes / (1024 * 1024))} MB (ima ${formatFileSize(file.size)})`,
    );
  }
  if (!isSupportedFile(file)) {
    throw new Error("ovaj tip fajla nije podržan");
  }
  const upload = await generateUploadUrl({ pageId });
  let response: Response;
  try {
    response = await fetch(upload.uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": inferredContentType(file),
      },
      body: file,
    });
  } catch {
    throw new Error(
      "slanje je prekinuto — proveri internet vezu i pokušaj ponovo",
    );
  }
  if (!response.ok) throw new Error("slanje nije uspelo — pokušaj ponovo");
  const { storageId } = (await response.json()) as {
    storageId: Id<"_storage">;
  };
  const result = await attach({
    pageId,
    storageId,
    token: upload.token,
    name: file.name,
  });
  if (!result.ok) throw new Error(result.message);
  return {
    fileId: result.fileId,
    name: result.name,
    size: result.size,
    category: result.category,
  };
}
