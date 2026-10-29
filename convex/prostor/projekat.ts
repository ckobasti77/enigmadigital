import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  jeVlasnikPlatforme,
  prijavljenQuery,
  projekatMutation,
  projekatQuery,
} from "../lib/projekat";
import { ulogaValidator } from "../lib/uloge";
import { recordActivity } from "./lib/activity";
import { requireClanProjekta } from "./lib/auth";
import { ensureAreaChannel } from "./lib/chat_channels";
import { aktivniClanoviProjekta } from "./lib/ljudi";
import { obezbediRadniDeoProjekta } from "./lib/radniDeo";
import {
  areaDocumentValidator,
  boundedLimit,
  cleanOptionalText,
  cleanRequiredText,
} from "./lib/validators";

/**
 * ============================================================================
 * PROJEKAT U RADNOM DELU (SPAJANJE, plan S01 D4 i §3.4)
 * ============================================================================
 *
 * Projekat je Enigmin `workspaces` red. Ovde je samo ono što je radni deo
 * dobijao iz Devotion `startups.ts`: oblasti (P26), članovi za dodelu i
 * pominjanje (P9) i opis projekta. Ime, logo, članstvo i pozivnice ostaju
 * Enigmini (`projekti.ts`, `podesavanjaStore.ts`, `membersStore.ts`,
 * `invitesStore.ts`).
 * ============================================================================
 */

const NAJVISE_OBLASTI = 50;
const NAJVECI_OPIS = 500;

const projekatRadnogDelaValidator = v.object({
  _id: v.id("workspaces"),
  name: v.string(),
  description: v.string(),
  logoUrl: v.union(v.string(), v.null()),
  areas: v.array(areaDocumentValidator),
  uloga: ulogaValidator,
  isManager: v.boolean(),
});

async function oblasti(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return await ctx.db
    .query("areas")
    .withIndex("by_workspaceId_and_position", (q) => q.eq("workspaceId", workspaceId))
    .take(NAJVISE_OBLASTI);
}

async function uDetalje(
  ctx: QueryCtx,
  workspace: Doc<"workspaces">,
  clan: Doc<"members">,
  vlasnikPlatforme: boolean,
) {
  return {
    _id: workspace._id,
    name: workspace.name,
    description: workspace.opis ?? "",
    logoUrl:
      workspace.brend?.logoStorageId === undefined
        ? null
        : await ctx.storage.getUrl(workspace.brend.logoStorageId),
    areas: await oblasti(ctx, workspace._id),
    uloga: clan.role,
    isManager: clan.role === "owner" || vlasnikPlatforme,
  };
}

/**
 * Moji projekti sa oblastima (ljuska, brzi unos). Zamena za Devotion
 * `startups.listForCurrent`: najnovije članstvo prvo, bez `client_viewer` i
 * arhiviranih projekata.
 */
export const listForCurrent = prijavljenQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = ctx.korisnik.userId;
    const strana = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
    const vlasnikPlatforme = await jeVlasnikPlatforme(ctx, userId);
    const page = [];
    const videni = new Set<Id<"workspaces">>();
    for (const clan of strana.page) {
      if (clan.role === "client_viewer" || videni.has(clan.workspaceId)) continue;
      videni.add(clan.workspaceId);
      const workspace = await ctx.db.get(clan.workspaceId);
      if (workspace === null || workspace.arhiviran === true) continue;
      page.push(await uDetalje(ctx, workspace, clan, vlasnikPlatforme));
    }
    return { ...strana, page };
  },
});

/** Izabran projekat sa oblastima. */
export const get = projekatQuery({
  uloga: "urednik",
  args: {},
  returns: projekatRadnogDelaValidator,
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    return await uDetalje(ctx, actor.workspace, actor.membership, actor.isManager);
  },
});

/**
 * Članovi projekta za dodelu, pominjanje i kanale (P9): samo `owner` i
 * `urednik` sa profilom. Zamena za Devotion `startups.listMembers`.
 */
export const listMembers = projekatQuery({
  uloga: "urednik",
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const limit = boundedLimit(args.limit, 25, 50);
    const clanovi = await aktivniClanoviProjekta(ctx, args.workspaceId, limit);
    return await Promise.all(
      clanovi.map(async ({ membership, profile }) => ({
        membershipId: membership._id,
        profile: {
          ...profile,
          avatarUrl:
            profile.avatarStorageId === undefined
              ? null
              : await ctx.storage.getUrl(profile.avatarStorageId),
        },
      })),
    );
  },
});

/** Nova oblast (svaki član, kao u Devotionu) sa svojim kanalom. */
export const createArea = projekatMutation({
  uloga: "urednik",
  args: { label: v.string() },
  returns: v.id("areas"),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const cleanedLabel = cleanRequiredText(args.label, "Naziv oblasti", 100);
    const existingAreas = await ctx.db
      .query("areas")
      .withIndex("by_workspaceId_and_position", (q) => q.eq("workspaceId", args.workspaceId))
      .take(NAJVISE_OBLASTI);
    const maxPosition = existingAreas.reduce((max, area) => Math.max(max, area.position), -1);
    const now = Date.now();
    const areaId = await ctx.db.insert("areas", {
      workspaceId: args.workspaceId,
      key: `custom_${now}`,
      label: cleanedLabel,
      position: maxPosition + 1,
      createdAt: now,
    });
    // Nova oblast odmah dobija svoj kanal; idempotentno.
    await ensureAreaChannel(ctx, {
      workspaceId: args.workspaceId,
      areaId,
      name: cleanedLabel,
      createdByProfileId: profile._id,
      createdAt: now,
    });
    await recordActivity(ctx, {
      workspaceId: args.workspaceId,
      actorProfileId: profile._id,
      action: "startup_updated",
      targetType: "startup",
      targetId: args.workspaceId,
      title: `Nova oblast „${cleanedLabel}“ je kreirana`,
    });
    return areaId;
  },
});

/** Preimenovanje oblasti. */
export const updateArea = projekatMutation({
  uloga: "urednik",
  args: { areaId: v.id("areas"), label: v.string() },
  returns: v.id("areas"),
  handler: async (ctx, args) => {
    const area = await ctx.db.get("areas", args.areaId);
    if (area === null) throw new Error("Oblast nije pronađena.");
    const { profile } = await requireClanProjekta(ctx, area.workspaceId);
    const cleanedLabel = cleanRequiredText(args.label, "Naziv oblasti", 100);
    await ctx.db.patch("areas", area._id, { label: cleanedLabel });
    await recordActivity(ctx, {
      workspaceId: area.workspaceId,
      actorProfileId: profile._id,
      action: "startup_updated",
      targetType: "startup",
      targetId: area.workspaceId,
      title: `Naziv oblasti je promenjen u „${cleanedLabel}“`,
    });
    return area._id;
  },
});

/** Novi redosled oblasti; oblast iz drugog projekta se preskače. */
export const reorderAreas = projekatMutation({
  uloga: "urednik",
  args: { orderedAreaIds: v.array(v.id("areas")) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    for (let i = 0; i < args.orderedAreaIds.length; i++) {
      const area = await ctx.db.get("areas", args.orderedAreaIds[i]);
      if (area !== null && area.workspaceId === args.workspaceId) {
        await ctx.db.patch("areas", area._id, { position: i });
      }
    }
    return true;
  },
});

/**
 * P26: podrazumevane oblasti i kanali za projekat koji ih još nema (npr.
 * projekat napravljen pre spajanja). Idempotentno; web ga zove pri prvom
 * otvaranju radnog dela.
 */
export const pripremiRadniDeo = projekatMutation({
  uloga: "urednik",
  args: {},
  returns: v.null(),
  handler: async (ctx, args) => {
    await obezbediRadniDeoProjekta(ctx, {
      workspaceId: args.workspaceId,
      userId: ctx.projekat.userId,
      now: Date.now(),
    });
    return null;
  },
});

/** Opis projekta (P5). Menja ga vlasnik projekta (O9); `null` ili prazno briše. */
export const postaviOpis = projekatMutation({
  uloga: "owner",
  args: { opis: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new ConvexError({ code: "not_found", message: "Projekat nije pronađen." });
    }
    const opis = args.opis === null ? undefined : cleanOptionalText(args.opis, "Opis", NAJVECI_OPIS);
    await ctx.db.patch(workspace._id, { opis: opis === "" ? undefined : opis });
    return null;
  },
});
