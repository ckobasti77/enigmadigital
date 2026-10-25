import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { projekatMutation } from "./lib/projekat";
import {
  ROK_PRIJAVE_MS,
  fajlBrenda,
  fajlObjave,
  prijavaUploada,
  svrhaKorisnikaValidator,
  svrhaUploadaValidator,
  uploadProjekta,
} from "./lib/projekatUploadi";

/**
 * Prijava otpremljenog fajla u projekat (plan C02 §10.3, C19). Pravila su u
 * `lib/projekatUploadi.ts`; ovde su samo funkcije koje ih primenjuju.
 */

function nijePronadjen(): never {
  throw new ConvexError({
    code: "not_found",
    message: "Fajl nije pronađen. Otpremi ga ponovo.",
  });
}

/**
 * Zove se odmah posle otpremanja (urednik). Isti fajl prijavljen dva puta je
 * jedna prijava; fajl koji je prijavio drugi projekat, ili ovaj za drugu
 * namenu, ne preuzima se. Odbijen fajl se ne briše: možda nije naš.
 */
export const registrujUpload = projekatMutation({
  args: { storageId: v.id("_storage"), svrha: svrhaKorisnikaValidator },
  returns: v.null(),
  handler: async (ctx, { storageId, svrha }) => {
    const { workspaceId, userId } = ctx.projekat;
    const meta = await ctx.db.system.get("_storage", storageId);
    if (meta === null) nijePronadjen();

    const postojeca = await prijavaUploada(ctx, storageId);
    if (postojeca !== null) {
      if (postojeca.workspaceId === workspaceId && postojeca.svrha === svrha) return null;
      nijePronadjen();
    }

    const sada = Date.now();
    if (meta._creationTime < sada - ROK_PRIJAVE_MS) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Otpremanje je isteklo. Izaberi fajl ponovo.",
      });
    }
    if ((await fajlBrenda(ctx, storageId)) || (await fajlObjave(ctx, storageId))) {
      nijePronadjen();
    }

    await ctx.db.insert("projekatUploadi", {
      workspaceId,
      storageId,
      userId,
      svrha,
      createdAt: sada,
    });
    return null;
  },
});

/**
 * Snimak sajta koji je skill otpremio kroz `POST /generate-leads/snimak`:
 * projekat i korisnik dolaze iz ingest tokena, a red nastaje u istom zahtevu u
 * kome je fajl upisan (nema roka ni trke).
 */
export const zapisiSnimakSkilla = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    storageId: v.id("_storage"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, storageId, userId }) => {
    if ((await prijavaUploada(ctx, storageId)) !== null) return null;
    await ctx.db.insert("projekatUploadi", {
      workspaceId,
      storageId,
      userId,
      svrha: "lead_snimak",
      createdAt: Date.now(),
    });
    return null;
  },
});

/** Za akcije (titl, sličica): da li je fajl prijavljen u ovom projektu za ovu namenu. */
export const uploadZaAkciju = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    storageId: v.id("_storage"),
    svrha: svrhaUploadaValidator,
  },
  returns: v.boolean(),
  handler: async (ctx, { workspaceId, storageId, svrha }) =>
    await uploadProjekta(ctx, workspaceId, storageId, [svrha]),
});

/**
 * Fajl je odradio posao (titl ili sličica su poslati, ili slanje nije
 * uspelo): briše se iz storage-a zajedno sa prijavom, i to samo ako je
 * prijava ovog projekta.
 */
export const potrosiUpload = internalMutation({
  args: { workspaceId: v.id("workspaces"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { workspaceId, storageId }) => {
    const red = await prijavaUploada(ctx, storageId);
    if (red === null || red.workspaceId !== workspaceId) return null;
    await ctx.db.delete(red._id);
    if ((await ctx.db.system.get("_storage", storageId)) !== null) {
      await ctx.storage.delete(storageId);
    }
    return null;
  },
});
