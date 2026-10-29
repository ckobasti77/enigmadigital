// Preneto iz Devotion apps/web/lib/media-convert.ts (main @ c05c40f), SPAJANJE S11.
/**
 * HEIC/HEIF → JPEG pre slanja. Safari (jedini pregledač koji te fajlove i daje
 * kroz picker) ume da ih dekodira, pa se konverzija radi na uređaju koji šalje;
 * ostali pregledači i svaki neuspeh vraćaju original netaknut — Convex ga
 * skladišti bez problema, samo pregled van Safarija trpi (za to postoji
 * fallback kartica u prikazu).
 */

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

function isHeicFile(file: File): boolean {
  const type = file.type.split(";")[0].trim().toLowerCase();
  if (HEIC_TYPES.has(type)) return true;
  const extension = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  return extension === "heic" || extension === "heif";
}

export async function normalizeImageForUpload(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  if (typeof createImageBitmap === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (context === null) return file;
      context.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (blob === null || blob.size === 0) return file;
      return new File([blob], file.name.replace(/\.hei[cf]$/i, "") + ".jpg", {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
