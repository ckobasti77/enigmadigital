// Preneto iz Devotion packages/backend/convex/pageFiles.ts (main @ c05c40f), SPAJANJE S05.
import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

import { recordActivity } from "./lib/activity";
import { requireClanProjekta } from "./lib/auth";
import {
  cleanPageFileName,
  listActivePageFiles,
  MAX_PAGE_FILES,
  maxPageFileBytesFor,
  pageFileCategoryFor,
  PRUNE_GRACE_MS,
  syncPageFileSummary,
} from "./lib/page_files";
import { tudjiBlob } from "./lib/otpremanje";
import { requireVisiblePage } from "./lib/pages";
import { assertCanEditPage, canEditPage } from "./lib/permissions";
import { trashFile, unprunePageFiles } from "./lib/trash";
import { pageFileCategoryValidator } from "./lib/validators";
import { projekatMutation, projekatQuery } from "../lib/projekat";

// 30 min: veliki video na sporoj mobilnoj vezi ume da traje duže od 10 min,
// a istekla dozvola je ranije trajno ostavljala blob bez reference.
const UPLOAD_TOKEN_TTL_MS = 30 * 60 * 1000;

const pageFileValidator = v.object({
  _id: v.id("pageFiles"),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  category: pageFileCategoryValidator,
  position: v.number(),
  url: v.union(v.string(), v.null()),
  uploadedByProfileId: v.id("profiles"),
  createdAt: v.number(),
  canManage: v.boolean(),
});

async function hashUploadToken(token: string) {
  const bytes = new TextEncoder().encode(`notion-clone-page-file:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function generateUploadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Fajlovi žive na „fajl” oblačićima i kao inline prilozi u telu beleške;
 * ostale vrste stranica ih nemaju.
 */
async function requireAttachmentPage(
  ctx: QueryCtx | MutationCtx,
  pageId: Id<"pages">,
) {
  const page = await requireVisiblePage(ctx, pageId);
  if (page.kind !== "file" && page.kind !== "note") {
    throw new Error("Ova stranica ne podržava fajlove.");
  }
  const actor = await requireClanProjekta(ctx, page.workspaceId);
  return { page, profile: actor.profile, actor };
}

export const list = projekatQuery({
  uloga: "urednik",
  args: { pageId: v.id("pages") },
  returns: v.array(pageFileValidator),
  handler: async (ctx, args) => {
    const { page, actor } = await requireAttachmentPage(ctx, args.pageId);
    const rows = await listActivePageFiles(ctx, page._id);
    const canManage = canEditPage(actor, page);
    return await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        name: row.name,
        contentType: row.contentType,
        size: row.size,
        category: row.category,
        position: row.position,
        url: await ctx.storage.getUrl(row.storageId),
        uploadedByProfileId: row.uploadedByProfileId,
        createdAt: row.createdAt,
        canManage,
      })),
    );
  },
});

export const generateUploadUrl = projekatMutation({
  uloga: "urednik",
  args: { pageId: v.id("pages") },
  returns: v.object({
    uploadUrl: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { page, profile, actor } = await requireAttachmentPage(ctx, args.pageId);
    assertCanEditPage(actor, page);
    const rows = await listActivePageFiles(ctx, page._id);
    if (rows.length >= MAX_PAGE_FILES) {
      throw new Error(
        `Oblačić već ima najviše ${MAX_PAGE_FILES} fajlova.`,
      );
    }
    const now = Date.now();
    // Stare dozvole ovog člana se čiste da tabela ne raste bez granice.
    const previous = await ctx.db
      .query("pageFileUploads")
      .withIndex("by_profileId_and_createdAt", (q) =>
        q.eq("profileId", profile._id),
      )
      .order("desc")
      .take(20);
    for (const upload of previous) {
      if (upload.expiresAt <= now) await ctx.db.delete(upload._id);
    }
    const token = generateUploadToken();
    const expiresAt = now + UPLOAD_TOKEN_TTL_MS;
    await ctx.db.insert("pageFileUploads", {
      pageId: page._id,
      profileId: profile._id,
      tokenHash: await hashUploadToken(token),
      expiresAt,
      createdAt: now,
    });
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
      token,
      expiresAt,
    };
  },
});

export const attach = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
    storageId: v.id("_storage"),
    token: v.string(),
    name: v.string(),
  },
  // Neuspeh posle uspešnog POST-a se VRAĆA umesto da se baci: bačena mutacija
  // se cela poništava, pa bi `storage.delete` odbačenog bloba bio poništen sa
  // njom i blob bi trajno ostao bez reference. Povratna vrednost dozvoljava da
  // brisanje bloba i odbijanje priloga prođu u istoj transakciji.
  returns: v.union(
    v.object({
      ok: v.literal(true),
      fileId: v.id("pageFiles"),
      name: v.string(),
      size: v.number(),
      category: pageFileCategoryValidator,
    }),
    v.object({
      ok: v.literal(false),
      reason: v.union(
        v.literal("expired"),
        v.literal("unsupported"),
        v.literal("too_large"),
        v.literal("limit"),
      ),
      message: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const { page, profile, actor } = await requireAttachmentPage(ctx, args.pageId);
    assertCanEditPage(actor, page);

    const tokenHash = await hashUploadToken(args.token);
    const upload = await ctx.db
      .query("pageFileUploads")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    const now = Date.now();
    // Bez dozvole ili sa tuđom dozvolom se baca: pozivalac nije dokazao da je
    // blob njegov, pa se blob ne sme ni dirati.
    if (
      upload === null ||
      upload.profileId !== profile._id ||
      upload.pageId !== page._id
    ) {
      throw new Error("Dozvola za slanje fajla nije ispravna ili je istekla.");
    }

    // Da tuđi ili već zakačen blob nikada ne bude obrisan, provera vlasništva
    // ide pre svake grane koja briše.
    const existingOwner = await ctx.db
      .query("pageFiles")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (existingOwner !== null) {
      throw new Error("Ovaj fajl je već zakačen za neki oblačić.");
    }
    // Metapodaci se čitaju sa servera; klijentu se ne veruje ni za tip ni za
    // veličinu, jer o njima zavise i prikaz i granica potrošnje.
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) throw new Error("Fajl nije pronađen.");
    // SPAJANJE S05: blob mora biti otpremljen pod ovom dozvolom i ničiji drugi
    // (logo, slika objave, avatar, prilog poruke), jer odbijanje ispod ga briše.
    if (await tudjiBlob(ctx, metadata, upload._creationTime)) {
      throw new Error("Fajl nije pronađen. Pošalji ga ponovo.");
    }

    const rejectStoredBlob = async (
      reason: "expired" | "unsupported" | "too_large" | "limit",
      message: string,
    ) => {
      await ctx.storage.delete(args.storageId);
      await ctx.db.delete(upload._id);
      return { ok: false as const, reason, message };
    };

    if (upload.expiresAt <= now) {
      return await rejectStoredBlob(
        "expired",
        "Dozvola za slanje je istekla — pošalji fajl ponovo.",
      );
    }

    const name = cleanPageFileName(args.name);
    const category = pageFileCategoryFor(metadata.contentType, name);
    if (category === null) {
      return await rejectStoredBlob(
        "unsupported",
        `Ovaj tip fajla nije podržan${
          metadata.contentType ? `: ${metadata.contentType}` : ""
        }.`,
      );
    }
    const maxBytes = maxPageFileBytesFor(category);
    if (metadata.size > maxBytes) {
      return await rejectStoredBlob(
        "too_large",
        `Fajl može imati najviše ${Math.round(maxBytes / (1024 * 1024))} MB.`,
      );
    }

    const rows = await listActivePageFiles(ctx, page._id);
    if (rows.length >= MAX_PAGE_FILES) {
      return await rejectStoredBlob(
        "limit",
        `Oblačić može imati najviše ${MAX_PAGE_FILES} fajlova.`,
      );
    }

    const fileId = await ctx.db.insert("pageFiles", {
      workspaceId: page.workspaceId,
      areaId: page.areaId,
      pageId: page._id,
      storageId: args.storageId,
      name,
      contentType: metadata.contentType ?? "application/octet-stream",
      size: metadata.size,
      category,
      position: rows.length,
      uploadedByProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.delete(upload._id);
    await syncPageFileSummary(ctx, page, profile._id, now);
    await recordActivity(ctx, {
      workspaceId: page.workspaceId,
      actorProfileId: profile._id,
      action: "page_updated",
      targetType: "page",
      targetId: page._id,
      title: `Fajl je dodat u „${page.title}”`,
      detail: name,
    });
    return { ok: true as const, fileId, name, size: metadata.size, category };
  },
});

export const rename = projekatMutation({
  uloga: "urednik",
  args: { fileId: v.id("pageFiles"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get("pageFiles", args.fileId);
    if (file === null || file.archivedAt !== null) {
      throw new Error("Fajl nije pronađen.");
    }
    const { page, actor } = await requireAttachmentPage(ctx, file.pageId);
    assertCanEditPage(actor, page);
    const name = cleanPageFileName(args.name);
    if (name === file.name) return null;
    await ctx.db.patch("pageFiles", file._id, { name, updatedAt: Date.now() });
    return null;
  },
});

export const remove = projekatMutation({
  uloga: "urednik",
  args: { fileId: v.id("pageFiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get("pageFiles", args.fileId);
    if (file === null || file.archivedAt !== null) {
      throw new Error("Fajl nije pronađen.");
    }
    const { page, actor } = await requireAttachmentPage(ctx, file.pageId);
    // PROSTOR P19 (D8): uklanjanje je meko — prilog ide u Korpu, blob ostaje u
    // storage-u, pa ga svaki član može vratiti. Pravo je R2 nad stranicom.
    await trashFile(ctx, { actor, file, page, now: Date.now() });
    return null;
  },
});

export const reorder = projekatMutation({
  uloga: "urednik",
  args: { pageId: v.id("pages"), fileIds: v.array(v.id("pageFiles")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, profile, actor } = await requireAttachmentPage(ctx, args.pageId);
    assertCanEditPage(actor, page);
    const rows = await listActivePageFiles(ctx, page._id);
    const byId = new Map(rows.map((row) => [row._id, row]));
    if (
      args.fileIds.length !== rows.length ||
      args.fileIds.some((fileId) => !byId.has(fileId))
    ) {
      throw new Error("Spisak fajlova nije potpun.");
    }
    const now = Date.now();
    for (const [position, fileId] of args.fileIds.entries()) {
      const row = byId.get(fileId)!;
      if (row.position === position) continue;
      await ctx.db.patch("pageFiles", fileId, { position, updatedAt: now });
    }
    await syncPageFileSummary(ctx, page, profile._id, now);
    return null;
  },
});

/**
 * Sklanja priloge beleške koji više nisu referencirani u njenom telu. Klijent ga
 * zove posle uspešnog čuvanja sa id-jevima iz sačuvanog HTML-a. Id-jevi stižu
 * kao stringovi jer nalepljen sadržaj može da nosi tuđe ili neispravne
 * vrednosti — takve samo preskačemo, ne rušimo čišćenje.
 *
 * PROSTOR D8: sklanjanje je meko (arhiviran red bez `trashState`, blob ostaje),
 * a prilog čiji se id vrati u telo (poništeno brisanje slike) se vraća.
 */
export const prune = projekatMutation({
  uloga: "urednik",
  args: { pageId: v.id("pages"), keepFileIds: v.array(v.string()) },
  returns: v.object({ removed: v.number() }),
  handler: async (ctx, args) => {
    const { page, profile, actor } = await requireAttachmentPage(
      ctx,
      args.pageId,
    );
    if (page.kind !== "note") {
      throw new Error("Čišćenje priloga radi samo za beleške.");
    }
    assertCanEditPage(actor, page);
    const keep = new Set<Id<"pageFiles">>();
    for (const raw of args.keepFileIds) {
      const fileId = ctx.db.normalizeId("pageFiles", raw);
      if (fileId !== null) keep.add(fileId);
    }
    const rows = await listActivePageFiles(ctx, page._id);
    const now = Date.now();
    let removed = 0;
    for (const row of rows) {
      if (keep.has(row._id)) continue;
      if (now - row.createdAt < PRUNE_GRACE_MS) continue;
      await ctx.db.patch("pageFiles", row._id, {
        archivedAt: now,
        archivedByProfileId: profile._id,
        updatedAt: now,
      });
      removed += 1;
    }
    const restored = await unprunePageFiles(ctx, {
      page,
      isReferenced: (fileId) => keep.has(fileId),
      now,
    });
    if (removed > 0 || restored > 0) {
      const remaining = await listActivePageFiles(ctx, page._id);
      for (const [position, row] of remaining.entries()) {
        if (row.position === position) continue;
        await ctx.db.patch("pageFiles", row._id, { position, updatedAt: now });
      }
    }
    return { removed };
  },
});
