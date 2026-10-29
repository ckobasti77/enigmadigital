import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  fajlBrenda,
  fajlObjave,
  prijavaUploada,
} from "../../lib/projekatUploadi";

/**
 * ============================================================================
 * ČIJI JE BLOB (SPAJANJE S05, isto pravilo kao Enigmin C19)
 * ============================================================================
 *
 * Radni deo otprema kroz svoje tabele dozvola (`pageFileUploads` za priloge,
 * `avatarUploads` za avatar); Enigmin `projekatUploadi` se ne menja. Dozvola
 * dokazuje da je pozivalac SMEO da otpremi, ali ne i da je `storageId` iz
 * argumenta baš fajl koji je otpremio: ID može da se sazna iz adrese fajla.
 * Odbijen prilog briše blob, a avatar briše prethodni blob, pa bi podmetnut
 * tuđ ID (logo projekta, slika objave, tuđ prilog) mogao da obriše tuđ fajl.
 *
 * Zato se blob prihvata samo ako je nastao POSLE dozvole i ako ga ne drži
 * niko drugi. Tuđ blob se ne dira: pozivalac dobija grešku, a ne brisanje.
 * ============================================================================
 */

type Db = { db: QueryCtx["db"] };

/**
 * Da li blob pripada nekom drugom ili je stariji od dozvole. `osim` je red koji
 * sme da ga drži (profil koji menja svoj avatar).
 */
export async function tudjiBlob(
  ctx: Db,
  meta: { _id: Id<"_storage">; _creationTime: number },
  dozvolaOd: number,
  osim: { profileId?: Id<"profiles"> } = {},
): Promise<boolean> {
  const storageId = meta._id;
  // Fajl otpremljen pre dozvole nije otpremljen pod njom.
  if (meta._creationTime < dozvolaOd) return true;

  const prilog = await ctx.db
    .query("pageFiles")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (prilog !== null) return true;

  const avatar = await ctx.db
    .query("profiles")
    .withIndex("by_avatarStorageId", (q) => q.eq("avatarStorageId", storageId))
    .first();
  if (avatar !== null && avatar._id !== osim.profileId) return true;

  const prilogPoruke = await ctx.db
    .query("chatMessages")
    .withIndex("by_attachmentStorageId", (q) =>
      q.eq("attachmentStorageId", storageId),
    )
    .first();
  if (prilogPoruke !== null) return true;

  // Enigmini fajlovi: prijavljen upload, logo/ikonica projekta, fajl objave.
  if ((await prijavaUploada(ctx, storageId)) !== null) return true;
  if (await fajlBrenda(ctx, storageId)) return true;
  return await fajlObjave(ctx, storageId);
}
