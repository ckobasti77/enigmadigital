/**
 * Veze radnog dela sa Leadovima i kanalima (SPAJANJE P19, S23).
 *
 * - `zadaciFirme`: zadaci projekta vezani za jednu firmu (odeljak „Zadaci“ na
 *   profilu firme), otvoreni pa završeni.
 * - `firma`: ime firme za čip na zadatku; firma koje više nema (ili je iz
 *   drugog projekta) daje `null`, bez imena.
 * - `noviZadatak`: zadatak sa vezom na firmu (P8: firma iz istog projekta)
 *   i/ili na izvor (komentar bez odgovora, stavka „Čeka te“).
 *
 * Logika Leadova se ne menja: ništa ovde ne piše u `lead*` tabele.
 */
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { projekatMutation, projekatQuery } from "../lib/projekat";
import { requireClanProjekta } from "./lib/auth";
import {
  insertWorkspacePage,
  prepareWorkspacePage,
  validateWorkspacePageTarget,
} from "./lib/page_creation";
import { summarizePage } from "./lib/pages";
import {
  checkpointItemValidator,
  pageSummaryValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";
import {
  izvorZadatkaValidator,
  normalizujIzvor,
  PORUKE_VEZA,
  ZADACI_FIRME_MAX,
} from "./lib/veze";

/** Firma iz argumenta mora biti iz projekta poziva (`ctx.projekat`). */
async function requireFirmaProjekta(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  leadCompanyId: Id<"leadCompanies">,
): Promise<Doc<"leadCompanies">> {
  const firma = await ctx.db.get("leadCompanies", leadCompanyId);
  if (firma === null || firma.workspaceId !== workspaceId) {
    throw new ConvexError(PORUKE_VEZA.firmaNijeUProjektu);
  }
  return firma;
}

export const zadaciFirme = projekatQuery({
  uloga: "urednik",
  args: { leadCompanyId: v.id("leadCompanies") },
  returns: v.object({
    zadaci: v.array(pageSummaryValidator),
    /** Firma ima više zadataka nego što odeljak prikazuje. */
    odseceno: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    await requireFirmaProjekta(ctx, args.workspaceId, args.leadCompanyId);
    const redovi = await ctx.db
      .query("pages")
      .withIndex("by_workspaceId_and_leadCompanyId_and_archivedAt", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("leadCompanyId", args.leadCompanyId)
          .eq("archivedAt", null),
      )
      .order("desc")
      .take(ZADACI_FIRME_MAX + 1);
    const zadaci = redovi
      .slice(0, ZADACI_FIRME_MAX)
      .filter((page) => page.kind === "task")
      .sort((a, b) => {
        // Otvoreni prvi, po roku (`taskSortAt`); završeni posle, najnoviji prvi.
        const aGotov = a.taskStatus === "done";
        const bGotov = b.taskStatus === "done";
        if (aGotov !== bGotov) return aGotov ? 1 : -1;
        if (aGotov) return (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt);
        return a.taskSortAt - b.taskSortAt || a._creationTime - b._creationTime;
      });
    return {
      zadaci: zadaci.map(summarizePage),
      odseceno: redovi.length > ZADACI_FIRME_MAX,
    };
  },
});

export const firma = projekatQuery({
  uloga: "urednik",
  args: { leadCompanyId: v.id("leadCompanies") },
  returns: v.union(
    v.null(),
    v.object({ _id: v.id("leadCompanies"), name: v.string() }),
  ),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const red = await ctx.db.get("leadCompanies", args.leadCompanyId);
    if (red === null || red.workspaceId !== args.workspaceId) return null;
    return { _id: red._id, name: red.name };
  },
});

export const noviZadatak = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    title: v.string(),
    taskStatus: v.optional(taskStatusValidator),
    taskPriority: v.optional(taskPriorityValidator),
    assigneeProfileIds: v.optional(v.array(v.id("profiles"))),
    dueDate: v.optional(v.number()),
    instructions: v.optional(v.string()),
    checkpoints: v.optional(v.array(checkpointItemValidator)),
    leadCompanyId: v.optional(v.id("leadCompanies")),
    izvor: v.optional(izvorZadatkaValidator),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    if (args.leadCompanyId === undefined && args.izvor === undefined) {
      throw new ConvexError(PORUKE_VEZA.bezVeze);
    }
    if (args.leadCompanyId !== undefined) {
      await requireFirmaProjekta(ctx, args.workspaceId, args.leadCompanyId);
    }
    const izvor = args.izvor === undefined ? undefined : normalizujIzvor(args.izvor);
    const now = Date.now();
    const target = await validateWorkspacePageTarget(ctx, {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      parentPageId: null,
      kind: "task",
      taskStatus: args.taskStatus,
      taskPriority: args.taskPriority,
      assigneeProfileIds: args.assigneeProfileIds,
      dueDate: args.dueDate,
      instructions: args.instructions,
      checkpoints: args.checkpoints,
    });
    const page = prepareWorkspacePage(target, { title: args.title, content: "", now });
    const pageId = await insertWorkspacePage(ctx, {
      target,
      page,
      actorProfileId: profile._id,
      now,
    });
    await ctx.db.patch("pages", pageId, {
      ...(args.leadCompanyId === undefined ? {} : { leadCompanyId: args.leadCompanyId }),
      ...(izvor === undefined ? {} : { izvor }),
    });
    return pageId;
  },
});
