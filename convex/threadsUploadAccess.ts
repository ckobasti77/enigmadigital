import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { DocumentByName, SystemDataModel } from "convex/server";

/** The `_storage` system table's row — size and content type, as stored. */
type StorageMetadata = DocumentByName<SystemDataModel, "_storage">;

/**
 * ============================================================================
 * AUTORIZACIJA ZA JAVNU RUTU /threads-upload/<storageId>
 * ============================================================================
 *
 * Meta fetcher mora samostalno da preuzme sliku ili video sa javnog URL-a pre
 * nego što kreira i objavi post. Zato je `/threads-upload/<storageId>` ruta
 * javna.
 *
 * Da ova ruta ne bi postala otvoreni čitač celog Convex storage-a, ovde se
 * proverava postojanje reda u `threadsPublishFiles`. Fajl se može servirati
 * isključivo ako postoji aktivan posao objavljivanja koji na njega pokazuje i
 * čiji fajlovi još nisu obrisani.
 * ============================================================================
 */

const TERMINAL_STATUSES = new Set(["published", "canceled"]);

/**
 * Proverava da li dati storageId pripada aktivnom Threads publish poslu.
 */
export const authorizeUpload = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(
    v.null(),
    v.object({ contentType: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, { storageId }) => {
    const fileRow = await ctx.db
      .query("threadsPublishFiles")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    if (fileRow === null) return null;

    const job = await ctx.db.get(fileRow.jobId);
    if (job === null || job.filesDeletedAt !== undefined) return null;
    if (TERMINAL_STATUSES.has(job.status)) return null;

    const meta: StorageMetadata | null = await ctx.db.system.get(
      "_storage",
      storageId,
    );
    return { contentType: meta?.contentType ?? null };
  },
});
