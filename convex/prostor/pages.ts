// Preneto iz Devotion packages/backend/convex/pages.ts (main @ c05c40f), SPAJANJE S03.
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

import {
  movePageAcrossAreasWithSidecars,
  moveWithinArea,
} from "./areasV2";
import { recordActivity } from "./lib/activity";
import { requireClanProjekta } from "./lib/auth";
import { addComment, removeComment, updateComment } from "./lib/comments";
import { writePageContent } from "./lib/page_content";
import {
  assertCanChangeChildren,
  assertCanEditPage,
  assertCanMovePage,
  canArchivePage,
  canEditPage,
  canLockPage,
  conflictError,
  isPageLocked,
  pagePermissions,
  pagePermissionsValidator,
  permissionError,
} from "./lib/permissions";
import {
  cleanPageContent,
  insertWorkspacePage,
  prepareWorkspacePage,
  requirePageArea,
  requirePageParent,
  validateWorkspacePageTarget,
} from "./lib/page_creation";
import { requireVisiblePage, summarizePage } from "./lib/pages";
import { trashPageTree } from "./lib/trash";
import {
  getProfileSummary,
  profileSummaryValidator as profileSummaryDisplayValidator,
} from "./lib/profile_summary";
import { resolveTaskAssignees } from "./lib/task_assignees";
import {
  boundedLimit,
  checkpointItemValidator,
  cleanRequiredText,
  pageDocumentValidator,
  pageKindValidator,
  pageSummaryValidator,
  RECENT_AREA_PAGES_DEFAULT,
  RECENT_AREA_PAGES_MAX,
  roleValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";
import { projekatMutation, projekatQuery } from "../lib/projekat";

const profileDocumentValidator = v.object({
  _id: v.id("profiles"),
  _creationTime: v.number(),
  userId: v.id("users"),
  displayName: v.string(),
  email: v.string(),
  role: roleValidator,
  avatarStorageId: v.optional(v.id("_storage")),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const pageDetailsValidator = pageDocumentValidator.extend({
  content: v.string(),
  creator: v.union(
    profileDocumentValidator.extend({
      avatarUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  updater: v.union(profileDocumentValidator, v.null()),
  /** Prvi izvršilac; ceo spisak je u `assignees`. */
  assignee: v.union(profileDocumentValidator, v.null()),
  assignees: v.array(profileSummaryDisplayValidator),
  /** Ko je zaključao stranicu (PROSTOR P1); `null` kad je otključana. */
  lockedBy: v.union(profileSummaryDisplayValidator, v.null()),
  /** P25: stara polja ostaju, nova se dodaju (`lib/permissions.ts`). */
  permissions: pagePermissionsValidator,
});

export const listChildren = projekatQuery({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    kind: v.optional(pageKindValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    await requirePageArea(ctx, args.workspaceId, args.areaId);
    await requirePageParent(ctx, args.workspaceId, args.areaId, args.parentPageId);
    const kind = args.kind;
    const result =
      kind === undefined
        ? await ctx.db
            .query("pages")
            .withIndex(
              "by_areaId_and_parentPageId_and_archivedAt_and_position",
              (q) =>
                q
                  .eq("areaId", args.areaId)
                  .eq("parentPageId", args.parentPageId)
                  .eq("archivedAt", null),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("pages")
            .withIndex(
              "by_areaId_and_kind_and_parentPageId_and_archivedAt_and_position",
              (q) =>
                q
                  .eq("areaId", args.areaId)
                  .eq("kind", kind)
                  .eq("parentPageId", args.parentPageId)
                  .eq("archivedAt", null),
            )
            .order("desc")
            .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(summarizePage) };
  },
});

export const get = projekatQuery({
  uloga: "urednik",
  args: { pageId: v.id("pages") },
  returns: pageDetailsValidator,
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    const { profile } = actor;
    const [body, creator, updater, assignee, parent] = await Promise.all([
      ctx.db
        .query("pageBodies")
        .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
        .unique(),
      ctx.db.get("profiles", page.createdByProfileId),
      ctx.db.get("profiles", page.updatedByProfileId),
      page.assigneeProfileId === null
        ? Promise.resolve(null)
        : ctx.db.get("profiles", page.assigneeProfileId),
      page.parentPageId === null
        ? Promise.resolve(null)
        : ctx.db.get("pages", page.parentPageId),
    ]);
    const assigneeEntries = await resolveTaskAssignees(ctx, page);
    const assignees = (
      await Promise.all(
        assigneeEntries.map((entry) => getProfileSummary(ctx, entry.profileId)),
      )
    ).filter((summary) => summary !== null);
    const lockedBy =
      isPageLocked(page) && page.lockedByProfileId
        ? await getProfileSummary(ctx, page.lockedByProfileId)
        : null;

    let creatorAvatarUrl = null;
    if (creator?.avatarStorageId) {
      creatorAvatarUrl = await ctx.storage.getUrl(creator.avatarStorageId);
    }
    const creatorWithAvatar = creator ? { ...creator, avatarUrl: creatorAvatarUrl } : null;

    return {
      ...page,
      content: body?.content ?? "",
      creator: creatorWithAvatar,
      updater,
      assignee,
      assignees,
      lockedBy,
      permissions: pagePermissions(actor, page, {
        parent:
          parent !== null &&
          parent.archivedAt === null &&
          parent.workspaceId === page.workspaceId &&
          parent.areaId === page.areaId
            ? parent
            : null,
        isAssignee: assigneeEntries.some(
          (entry) => entry.profileId === profile._id,
        ),
      }),
    };
  },
});

export const getBreadcrumbs = projekatQuery({
  uloga: "urednik",
  args: { pageId: v.id("pages") },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    await requireClanProjekta(ctx, page.workspaceId);
    const breadcrumbs = [{ _id: page._id, title: page.title, kind: page.kind }];
    let parentPageId = page.parentPageId;
    for (let depth = 0; parentPageId !== null && depth < 64; depth += 1) {
      const parent = await ctx.db.get("pages", parentPageId);
      if (
        parent === null ||
        parent.archivedAt !== null ||
        parent.workspaceId !== page.workspaceId ||
        parent.areaId !== page.areaId
      ) {
        throw new Error("Stranica nije pronađena.");
      }
      breadcrumbs.push({ _id: parent._id, title: parent.title, kind: parent.kind });
      parentPageId = parent.parentPageId;
      if (depth === 63 && parentPageId !== null) {
        throw new Error("Hijerarhija stranica je preduboka.");
      }
    }
    return breadcrumbs.reverse();
  },
});

/**
 * Broj stranica na vrhu svake oblasti (`parentPageId === null`) za startup.
 * Napaja brojač u mobilnom „Prostor" tabu (Nivo 1). Čitanje je ograničeno na
 * `CAP + 1` po oblasti — brojanje kroz `.take()` ostaje ograničeno (guidelines
 * zabranjuju `.collect().length`); preko granice klijent prikaže „99+".
 */
export const areaTopLevelCounts = projekatQuery({
  uloga: "urednik",
  args: { },
  returns: v.array(
    v.object({
      areaId: v.id("areas"),
      count: v.number(),
      capped: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const areas = await ctx.db
      .query("areas")
      .withIndex("by_workspaceId_and_position", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .take(50);
    const CAP = 99;
    return await Promise.all(
      areas.map(async (area) => {
        const rows = await ctx.db
          .query("pages")
          .withIndex(
            "by_areaId_and_parentPageId_and_archivedAt_and_position",
            (q) =>
              q
                .eq("areaId", area._id)
                .eq("parentPageId", null)
                .eq("archivedAt", null),
          )
          .take(CAP + 1);
        return {
          areaId: area._id,
          count: Math.min(rows.length, CAP),
          capped: rows.length > CAP,
        };
      }),
    );
  },
});

/**
 * Broj podstranica za zadate roditeljske stranice unutar jedne oblasti. Napaja
 * meta podatak u redu mobilnog „Prostor" stabla — da se pre razvijanja vidi ima
 * li šta unutra. Web ekvivalent nije potreban: `page-tree.tsx` decu ionako drži
 * učitanu u stablu, pa broj vidi bez dodatnog upita.
 *
 * Ograničeno dvostruko: najviše `MAX_CHILD_COUNT_PARENTS` roditelja po pozivu i
 * `CAP + 1` pročitanih redova po roditelju (guidelines zabranjuju
 * `.collect().length`); preko granice klijent prikaže „9+".
 */
const MAX_CHILD_COUNT_PARENTS = 50;

export const childCounts = projekatQuery({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    parentPageIds: v.array(v.id("pages")),
  },
  returns: v.array(
    v.object({
      pageId: v.id("pages"),
      count: v.number(),
      capped: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    // Oblast se proverava; roditelji se ne moraju — upit ide po `areaId`, pa tuđi
    // `parentPageId` jednostavno nema redova u ovoj oblasti (nema curenja).
    await requirePageArea(ctx, args.workspaceId, args.areaId);
    const CAP = 9;
    const ids = args.parentPageIds.slice(0, MAX_CHILD_COUNT_PARENTS);
    return await Promise.all(
      ids.map(async (pageId) => {
        const rows = await ctx.db
          .query("pages")
          .withIndex(
            "by_areaId_and_parentPageId_and_archivedAt_and_position",
            (q) =>
              q
                .eq("areaId", args.areaId)
                .eq("parentPageId", pageId)
                .eq("archivedAt", null),
          )
          .take(CAP + 1);
        return {
          pageId,
          count: Math.min(rows.length, CAP),
          capped: rows.length > CAP,
        };
      }),
    );
  },
});

/**
 * Poslednje izmenjene (ne-arhivirane) stranice startupa — sekcija „Nedavno" u
 * mobilnom „Prostor" tabu. Sortirano po `updatedAt` opadajuće preko indeksa.
 */
export const recentForStartup = projekatQuery({
  uloga: "urednik",
  args: { limit: v.optional(v.number()) },
  returns: v.array(pageSummaryValidator),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const limit = boundedLimit(args.limit, 10, 25);
    const rows = await ctx.db
      .query("pages")
      .withIndex("by_workspaceId_and_archivedAt_and_updatedAt", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("archivedAt", null),
      )
      .order("desc")
      .take(limit);
    return rows.map(summarizePage);
  },
});

/**
 * „Nedavne izmene u oblasti” (PROSTOR D19): poslednje izmenjene stranice oblasti
 * svih vrsta, sa osobom koja je izmenila. Četiri vrste × `limit` redova kroz isti
 * indeks, spojeno po `updatedAt` — bez novog polja u `activities`.
 */
export const recentForArea = projekatQuery({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    pageSummaryValidator.extend({
      updatedBy: v.union(profileSummaryDisplayValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    await requirePageArea(ctx, args.workspaceId, args.areaId);
    const limit = boundedLimit(
      args.limit,
      RECENT_AREA_PAGES_DEFAULT,
      RECENT_AREA_PAGES_MAX,
    );
    const perKind = await Promise.all(
      (["note", "task", "file", "table"] as const).map((kind) =>
        ctx.db
          .query("pages")
          .withIndex("by_workspace_area_kind_active_updated", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("areaId", args.areaId)
              .eq("kind", kind)
              .eq("archivedAt", null),
          )
          .order("desc")
          .take(limit),
      ),
    );
    const rows = perKind
      .flat()
      .sort(
        (a, b) =>
          b.updatedAt - a.updatedAt || b._creationTime - a._creationTime,
      )
      .slice(0, limit);
    const editors = new Map(
      await Promise.all(
        [...new Set(rows.map((row) => row.updatedByProfileId))].map(
          async (profileId) =>
            [profileId, await getProfileSummary(ctx, profileId)] as const,
        ),
      ),
    );
    return rows.map((row) => ({
      ...summarizePage(row),
      updatedBy: editors.get(row.updatedByProfileId) ?? null,
    }));
  },
});

export const create = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    kind: pageKindValidator,
    title: v.string(),
    content: v.optional(v.string()),
    position: v.optional(v.number()),
    taskStatus: v.optional(taskStatusValidator),
    taskPriority: v.optional(taskPriorityValidator),
    assigneeProfileId: v.optional(v.id("profiles")),
    assigneeProfileIds: v.optional(v.array(v.id("profiles"))),
    dueDate: v.optional(v.number()),
    instructions: v.optional(v.string()),
    checkpoints: v.optional(v.array(checkpointItemValidator)),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    const { profile } = actor;
    const now = Date.now();
    const target = await validateWorkspacePageTarget(ctx, {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      parentPageId: args.parentPageId,
      kind: args.kind,
      taskStatus: args.taskStatus,
      taskPriority: args.taskPriority,
      assigneeProfileId: args.assigneeProfileId,
      assigneeProfileIds: args.assigneeProfileIds,
      dueDate: args.dueDate,
      instructions: args.instructions,
      checkpoints: args.checkpoints,
    });
    const parent = await requirePageParent(
      ctx,
      args.workspaceId,
      args.areaId,
      args.parentPageId,
    );
    // PROSTOR P4: podstranicu pod bilo koju stranicu pravi svaki član; spisak
    // dece zaključane stranice menjaju samo autor, vlasnik startupa i admin.
    assertCanChangeChildren(actor, parent);
    const page = prepareWorkspacePage(target, {
      title: args.title,
      content: args.content ?? "",
      position: args.position,
      now,
    });
    return await insertWorkspacePage(ctx, {
      target,
      page,
      actorProfileId: profile._id,
      now,
    });
  },
});

export const update = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    const { profile } = actor;
    // PROSTOR P1: svaki član menja naslov i telo; zaključanu samo autor,
    // vlasnik startupa i admin. Raniji „zaključan zajednički sadržaj"
    // (`legacy_neutral`) više ne blokira izmenu — zatečeno stanje ostaje u
    // Istoriji izmena kao bazna revizija.
    assertCanEditPage(actor, page);
    if (page.revision !== args.expectedRevision) {
      throw conflictError(page);
    }
    const body = await ctx.db
      .query("pageBodies")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .unique();
    const title = args.title === undefined
      ? page.title
      : cleanRequiredText(args.title, "Naslov", 200);
    const currentContent = body?.content ?? "";
    const content = args.content === undefined ? currentContent : cleanPageContent(args.content);
    if (title === page.title && content === currentContent) {
      return { pageId: page._id, revision: page.revision, updatedAt: page.updatedAt };
    }
    const now = Date.now();
    const { revision } = await writePageContent(ctx, {
      page,
      actorProfileId: profile._id,
      now,
      title,
      content,
    });
    if (title !== page.title || now - page.updatedAt >= 5 * 60 * 1_000) {
      await recordActivity(ctx, {
        workspaceId: page.workspaceId,
        actorProfileId: profile._id,
        action: "page_updated",
        targetType: "page",
        targetId: page._id,
        title: `„${title}” je izmenjen/a`,
      });
    }
    return { pageId: page._id, revision, updatedAt: now };
  },
});

const lockStateValidator = v.object({
  lockedAt: v.union(v.number(), v.null()),
  lockedByProfileId: v.union(v.id("profiles"), v.null()),
});

/**
 * Zaključavanje (PROSTOR P1): autor stranice, vlasnik startupa ili admin.
 * Idempotentno; ne menja `revision` (zaključavanje nije izmena sadržaja).
 */
export const lock = projekatMutation({
  uloga: "urednik",
  args: { pageId: v.id("pages") },
  returns: lockStateValidator,
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    if (!canLockPage(actor, page)) {
      throw permissionError(
        "NEMA_DOZVOLU",
        "Stranicu zaključava njen autor ili vlasnik projekta.",
      );
    }
    if (isPageLocked(page)) {
      return {
        lockedAt: page.lockedAt ?? null,
        lockedByProfileId: page.lockedByProfileId ?? null,
      };
    }
    const now = Date.now();
    await ctx.db.patch("pages", page._id, {
      lockedAt: now,
      lockedByProfileId: actor.profile._id,
    });
    await recordActivity(ctx, {
      workspaceId: page.workspaceId,
      actorProfileId: actor.profile._id,
      action: "page_locked",
      targetType: "page",
      targetId: page._id,
      title: page.title,
    });
    return { lockedAt: now, lockedByProfileId: actor.profile._id };
  },
});

export const unlock = projekatMutation({
  uloga: "urednik",
  args: { pageId: v.id("pages") },
  returns: lockStateValidator,
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    if (!canLockPage(actor, page)) {
      throw permissionError(
        "NEMA_DOZVOLU",
        "Stranicu otključava njen autor ili vlasnik projekta.",
      );
    }
    if (!isPageLocked(page)) {
      return { lockedAt: null, lockedByProfileId: null };
    }
    await ctx.db.patch("pages", page._id, {
      lockedAt: null,
      lockedByProfileId: null,
    });
    await recordActivity(ctx, {
      workspaceId: page.workspaceId,
      actorProfileId: actor.profile._id,
      action: "page_unlocked",
      targetType: "page",
      targetId: page._id,
      title: page.title,
    });
    return { lockedAt: null, lockedByProfileId: null };
  },
});

export const move = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
    areaId: v.id("areas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    position: v.optional(v.number()),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    const { profile } = actor;
    await requirePageArea(ctx, page.workspaceId, args.areaId);
    if (args.parentPageId === page._id) throw new Error("Stranica ne može biti sopstveni roditelj.");
    const parent = await requirePageParent(ctx, page.workspaceId, args.areaId, args.parentPageId);
    // PROSTOR P4 (R5): svaki član premešta i ugnežđava odmah; zaključana
    // stranica i spisak dece zaključanog roditelja ostaju autoru i menadžeru.
    const currentParent =
      page.parentPageId === null
        ? null
        : await requireVisiblePage(ctx, page.parentPageId);
    assertCanMovePage(actor, page, currentParent, parent);
    let cursor = parent;
    for (let depth = 0; cursor !== null && depth < 64; depth += 1) {
      if (cursor._id === page._id) throw new Error("Premeštanje bi napravilo kružnu hijerarhiju.");
      cursor = cursor.parentPageId === null
        ? null
        : await requireVisiblePage(ctx, cursor.parentPageId);
    }
    const now = Date.now();
    if (page.areaId !== args.areaId) {
      if (parent !== null) {
        throw new Error(
          "Premeštanje u drugu oblast je dozvoljeno samo u koren oblasti.",
        );
      }
      await movePageAcrossAreasWithSidecars(ctx, {
        page,
        targetAreaId: args.areaId,
        actor,
        position: args.position,
        now,
      });
      return page._id;
    }
    await moveWithinArea(ctx, {
      child: page,
      targetParent: parent,
      actorProfileId: profile._id,
      position: args.position,
      now,
    });
    await recordActivity(ctx, {
      workspaceId: page.workspaceId,
      actorProfileId: profile._id,
      action: "page_moved",
      targetType: "page",
      targetId: page._id,
      title: `„${page.title}” je premešten/a`,
    });
    return page._id;
  },
});

export const archive = projekatMutation({
  uloga: "urednik",
  args: { pageId: v.id("pages") },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const actor = await requireClanProjekta(ctx, page.workspaceId);
    // PROSTOR P3: brisanje šalje celu granu u Korpu (svaki član, R7 + D6).
    await trashPageTree(ctx, { actor, page, now: Date.now() });
    return page._id;
  },
});

export const addEntry = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireClanProjekta(ctx, page.workspaceId);
    const cleaned = cleanPageContent(args.content);
    if (!cleaned.trim()) throw new Error("Sadržaj unosa ne može biti prazan.");

    const lastEntry = await ctx.db
      .query("pageEntries")
      .withIndex("by_pageId_and_position", (q) => q.eq("pageId", page._id))
      .order("desc")
      .first();
    const maxPosition = lastEntry?.position ?? 0;
    const now = Date.now();

    const entryId = await ctx.db.insert("pageEntries", {
      pageId: page._id,
      authorProfileId: profile._id,
      content: cleaned,
      position: maxPosition + 1,
      createdAt: now,
      updatedAt: now,
    });

    // PROSTOR P5: unos je komentar — odmah vidljiv, sa aktivnošću i obaveštenjima.
    await addComment(ctx, {
      target: { kind: "page", id: page._id },
      content: cleaned,
      source: { kind: "page_entry", id: entryId },
    });

    await ctx.db.patch("pages", page._id, {
      updatedByProfileId: profile._id,
      updatedAt: now,
    });

    return entryId;
  },
});

async function contributionOfEntry(
  ctx: MutationCtx,
  entryId: Id<"pageEntries">,
) {
  return await ctx.db
    .query("contentContributions")
    .withIndex("by_sourceKind_and_sourceId", (q) =>
      q.eq("sourceKind", "page_entry").eq("sourceId", entryId),
    )
    .unique();
}

export const updateEntry = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
    entryId: v.id("pageEntries"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireClanProjekta(ctx, page.workspaceId);
    const entry = await ctx.db.get("pageEntries", args.entryId);
    if (entry === null || entry.pageId !== page._id) {
      throw new Error("Tekst nije pronađen.");
    }
    if (entry.authorProfileId !== profile._id) {
      throw new Error("Možete urediti samo svoj tekst.");
    }
    const content = cleanPageContent(args.content);
    if (!content.trim()) throw new Error("Tekst ne može biti prazan.");
    const contribution = await contributionOfEntry(ctx, entry._id);
    if (contribution !== null) {
      // Isto pravilo kao za svaki komentar (R13); usput ogleda i sam unos.
      await updateComment(ctx, {
        commentId: contribution._id,
        content,
      });
    } else {
      await ctx.db.patch("pageEntries", entry._id, {
        content,
        updatedAt: Date.now(),
      });
    }
    return entry._id;
  },
});

export const deleteEntry = projekatMutation({
  uloga: "urednik",
  args: {
    pageId: v.id("pages"),
    entryId: v.id("pageEntries"),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    await requireClanProjekta(ctx, page.workspaceId);
    const entry = await ctx.db.get("pageEntries", args.entryId);
    if (entry && entry.pageId === page._id) {
      // PROSTOR P5/R14: autor svoj, vlasnik startupa i admin tuđi. Red unosa se
      // NE briše — komentar se arhivira (vraća se u roku od 8 s).
      const contribution = await contributionOfEntry(ctx, entry._id);
      if (contribution !== null && contribution.archivedAt === null) {
        await removeComment(ctx, contribution._id);
      }
    }
  },
});

export const listAreaCanvasPages = projekatQuery({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    kind: v.optional(pageKindValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireClanProjekta(ctx, args.workspaceId);
    await requirePageArea(ctx, args.workspaceId, args.areaId);
    const kind = args.kind;
    const filteredPages = kind
      ? await ctx.db
          .query("pages")
          .withIndex(
            "by_areaId_and_kind_and_parentPageId_and_archivedAt_and_position",
            (q) =>
              q
                .eq("areaId", args.areaId)
                .eq("kind", kind)
                .eq("parentPageId", null)
                .eq("archivedAt", null),
          )
          .take(250)
      : await ctx.db
          .query("pages")
          .withIndex(
            "by_areaId_and_parentPageId_and_archivedAt_and_position",
            (q) =>
              q
                .eq("areaId", args.areaId)
                .eq("parentPageId", null)
                .eq("archivedAt", null),
          )
          .take(250);

    const edges = await ctx.db
      .query("pageEdges")
      .withIndex("by_areaId", (q) => q.eq("areaId", args.areaId))
      .take(500);

    // Map creator details for each page
    const pagesWithDetails = await Promise.all(
      filteredPages.map(async (p) => {
        const creator = await ctx.db.get("profiles", p.createdByProfileId);
        let creatorAvatarUrl = null;
        if (creator?.avatarStorageId) {
          creatorAvatarUrl = await ctx.storage.getUrl(creator.avatarStorageId);
        }
        return {
          ...p,
          creator: creator ? { displayName: creator.displayName, avatarUrl: creatorAvatarUrl } : null,
          // PROSTOR P1/P3: kartice su na vrhu oblasti (bez roditelja).
          canEdit: canEditPage(actor, p),
          canMove: true,
          canResize: true,
          canDeleteDirectly: canArchivePage(actor, p, null),
          canRequestDeletion: false,
        };
      })
    );
    const visiblePageIds = new Set(filteredPages.map((page) => page._id));

    return {
      pages: pagesWithDetails,
      edges: edges
        .filter(
          (edge) =>
            edge.workspaceId === args.workspaceId &&
            visiblePageIds.has(edge.nodeAId) &&
            visiblePageIds.has(edge.nodeBId) &&
            (edge.archivedAt === undefined || edge.archivedAt === null),
        )
        .map((edge) => ({
          ...edge,
          canEdit: true,
          canDeleteDirectly: true,
          canRequestDeletion: false,
        })),
    };
  },
});

export const connectCanvasPages = projekatMutation({
  uloga: "urednik",
  args: {
    areaId: v.id("areas"),
    nodeAId: v.id("pages"),
    nodeBId: v.id("pages"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    await requirePageArea(ctx, args.workspaceId, args.areaId);
    if (args.nodeAId === args.nodeBId) throw new Error("Ne možete povezati istu stavku.");
    const [nodeA, nodeB] = await Promise.all([
      ctx.db.get("pages", args.nodeAId),
      ctx.db.get("pages", args.nodeBId),
    ]);
    if (
      nodeA === null ||
      nodeB === null ||
      nodeA.workspaceId !== args.workspaceId ||
      nodeB.workspaceId !== args.workspaceId ||
      nodeA.areaId !== args.areaId ||
      nodeB.areaId !== args.areaId ||
      nodeA.archivedAt !== null ||
      nodeB.archivedAt !== null ||
      nodeA.parentPageId !== null ||
      nodeB.parentPageId !== null
    ) {
      // PROSTOR D20: veze pravi svaki član; opseg (startup, oblast, vrh) ostaje.
      throw new Error(
        "Poveži samo dostupne kartice sa kanvasa iste oblasti.",
      );
    }
    if (nodeA.kind !== nodeB.kind) {
      throw new Error("Na podeljenom kanvasu povežite kartice istog tipa.");
    }

    const pairKey = [args.nodeAId, args.nodeBId].sort().join(":");
    const existing = await ctx.db
      .query("pageEdges")
      .withIndex("by_areaId_and_pairKey", (q) =>
        q.eq("areaId", args.areaId).eq("pairKey", pairKey)
      )
      .unique();

    const now = Date.now();
    if (existing) {
      if (existing.workspaceId !== args.workspaceId) {
        throw new Error("Postojeća veza ne pripada ovom projektu.");
      }
      if (existing.archivedAt !== undefined && existing.archivedAt !== null) {
        await ctx.db.patch("pageEdges", existing._id, {
          label: args.label ? args.label.trim() : existing.label,
          authorProfileId: profile._id,
          archivedAt: null,
          updatedAt: now,
        });
      }
      return existing._id;
    }

    return await ctx.db.insert("pageEdges", {
      workspaceId: args.workspaceId,
      areaId: args.areaId,
      nodeAId: args.nodeAId,
      nodeBId: args.nodeBId,
      pairKey,
      label: args.label ? args.label.trim() : null,
      authorProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const disconnectCanvasPages = projekatMutation({
  uloga: "urednik",
  args: {
    edgeId: v.id("pageEdges"),
  },
  handler: async (ctx, args) => {
    await requireClanProjekta(ctx, args.workspaceId);
    const edge = await ctx.db.get("pageEdges", args.edgeId);
    if (edge === null || edge.workspaceId !== args.workspaceId) {
      throw new Error("Veza nije pronađena.");
    }
    // PROSTOR D20: vezu uklanja svaki član.
    if (edge.archivedAt === undefined || edge.archivedAt === null) {
      await ctx.db.delete("pageEdges", args.edgeId);
    }
  },
});
