import { v, type Infer } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * ============================================================================
 * ČIJI JE OTPREMLJEN FAJL (plan C02 §10.3, C19)
 * ============================================================================
 *
 * ID fajla iz Convex storage-a nije dokaz vlasništva: ko ga zna (a adresa
 * objavljene slike ga može otkriti) mogao je da ga podmetne kao naslovnu sliku
 * svog posta ili da ga pošalje kao titl ili sličicu, posle čega ga akcija
 * YouTube-a briše. Zato fajl dobija red u `projekatUploadi` odmah posle
 * otpremanja, i to samo:
 *  - u roku od 10 minuta od otpremanja (stari fajl, npr. slika već objavljenog
 *    posta, ne može da se „prijavi“ naknadno);
 *  - ako ga niko nije prijavio pre (prvi prijavljuje projekat koji ga je
 *    otpremio, odmah po slanju);
 *  - ako nije logo ili ikonica nekog projekta ni fajl Instagram/Threads objave.
 *
 * Posao koji prima `storageId` (slika posta, titl, sličica) prihvata samo fajl
 * prijavljen u istom projektu i za odgovarajuću namenu.
 * ============================================================================
 */

/** Namene koje prijavljuje korisnik (`registrujUpload`, odmah posle otpremanja). */
export const svrhaKorisnikaValidator = v.union(
  v.literal("novosti_naslovna"),
  v.literal("novosti_og"),
  v.literal("yt_titl"),
  v.literal("yt_slicica"),
);

/**
 * Sve namene. `lead_snimak` (snimak sajta firme iz skilla) upisuje samo
 * `POST /generate-leads/snimak`, sa projektom iz ingest tokena.
 */
export const svrhaUploadaValidator = v.union(
  svrhaKorisnikaValidator,
  v.literal("lead_snimak"),
);

export type SvrhaUploada = Infer<typeof svrhaUploadaValidator>;

/** Slike posta (naslovna i OG): fajl ostaje dok ga post koristi. */
export const SVRHE_NOVOSTI: readonly SvrhaUploada[] = ["novosti_naslovna", "novosti_og"];

/** Fajl se prijavljuje odmah posle otpremanja; isti rok kao slika brenda (C11). */
export const ROK_PRIJAVE_MS = 10 * 60 * 1000;

type Db = { db: QueryCtx["db"] };

/** Prijava fajla, ako postoji (najviše jedna: drugu `registrujUpload` odbija). */
export async function prijavaUploada(
  ctx: Db,
  storageId: Id<"_storage">,
): Promise<Doc<"projekatUploadi"> | null> {
  return await ctx.db
    .query("projekatUploadi")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
}

/** Da li je fajl prijavljen baš u ovom projektu, za jednu od datih namena. */
export async function uploadProjekta(
  ctx: Db,
  workspaceId: Id<"workspaces">,
  storageId: Id<"_storage">,
  svrhe: readonly SvrhaUploada[],
): Promise<boolean> {
  const red = await prijavaUploada(ctx, storageId);
  return red !== null && red.workspaceId === workspaceId && svrhe.includes(red.svrha);
}

/** Logo ili ikonica bilo kog projekta. */
export async function fajlBrenda(ctx: Db, storageId: Id<"_storage">): Promise<boolean> {
  const kaoLogo = await ctx.db
    .query("workspaces")
    .withIndex("by_logo", (q) => q.eq("brend.logoStorageId", storageId))
    .first();
  if (kaoLogo !== null) return true;
  const kaoIkonica = await ctx.db
    .query("workspaces")
    .withIndex("by_favicon", (q) => q.eq("brend.faviconStorageId", storageId))
    .first();
  return kaoIkonica !== null;
}

/**
 * Fajl Instagram ili Threads objave DRUGOG projekta (račun o uploadu ili fajl
 * posla). Isti projekat sme da prijavi isti fajl i za drugu mrežu.
 */
export async function fajlObjaveDrugogProjekta(
  ctx: Db,
  storageId: Id<"_storage">,
  workspaceId: Id<"workspaces">,
): Promise<boolean> {
  const redovi = [
    await ctx.db
      .query("igPublishUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first(),
    await ctx.db
      .query("igPublishFiles")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first(),
    await ctx.db
      .query("threadsPublishUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first(),
    await ctx.db
      .query("threadsPublishFiles")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first(),
  ];
  return redovi.some((red) => red !== null && red.workspaceId !== workspaceId);
}

/** Fajl Instagram ili Threads objave (račun o uploadu ili fajl posla). */
export async function fajlObjave(ctx: Db, storageId: Id<"_storage">): Promise<boolean> {
  const ig = await ctx.db
    .query("igPublishUploads")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (ig !== null) return true;
  const igPosao = await ctx.db
    .query("igPublishFiles")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (igPosao !== null) return true;
  const th = await ctx.db
    .query("threadsPublishUploads")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (th !== null) return true;
  const thPosao = await ctx.db
    .query("threadsPublishFiles")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  return thPosao !== null;
}
