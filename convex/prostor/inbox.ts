// Preneto iz Devotion packages/backend/convex/inbox.ts (main @ c05c40f), SPAJANJE S06.
import { v, type Infer } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireProfile, requireClanProjekta } from "./lib/auth";
import {
  listMyActiveWorkspaces,
  workspaceMiniOf,
  type WorkspaceMini,
} from "./lib/my_scope";
import {
  INBOX_FEED_PAGE_DEFAULT,
  INBOX_FEED_PAGE_MAX,
  INBOX_IDEA_VOTE_COUNT_CAP,
  INBOX_MARK_ALL_BATCH,
  INBOX_PENDING_CAP,
  INBOX_UNREAD_SCAN_CAP,
  boundedLimit,
  inboxPendingIncludeValidator,
  workspaceMiniValidator,
} from "./lib/validators";
import { notificationItemValidator, withActors } from "./notifications";
import { prostorTabele } from "./schema";
import { prijavljenMutation, prijavljenQuery } from "../lib/projekat";

/**
 * Globalni Inbox: obaveštenja iz SVIH startupa na jednom mestu i „Čeka tebe".
 * Per-startup prikazi i dalje koriste `notifications.ts` (netaknut).
 *
 * Opseg: stavka iz startupa u kome profil nije AKTIVAN član (napustio ga, uklonjen
 * ili je startup arhiviran) se ne vraća i ne broji. `startup: null` nose lična
 * obaveštenja (poruke iz ličnih razgovora, `startupId: null`) — vide se uvek, jer
 * je primalac bio član razgovora kad je obaveštenje nastalo.
 */

/** Stavka feed-a: obaveštenje + mini podaci startupa (`null` za lične poruke). */
const inboxItemValidator = notificationItemValidator.extend({
  workspace: v.union(workspaceMiniValidator, v.null()),
});

/** Filter opsega: `undefined` = sve, Id = jedan startup, `null` = samo lično. */
const scopeArgValidator = v.optional(v.union(v.id("workspaces"), v.null()));

const counterValidator = v.object({ count: v.number(), capped: v.boolean() });

/** Gde se „Označi sve" primenjuje. */
const markTargetValidator = v.union(
  v.object({ kind: v.literal("all") }),
  v.object({ kind: v.literal("startup"), workspaceId: v.id("workspaces") }),
  v.object({ kind: v.literal("personal") }),
);
type MarkTarget = Infer<typeof markTargetValidator>;

/**
 * Stavka „Čeka tebe". `targetType`/`targetId` su isti rečnik kao kod obaveštenja
 * (`notificationDestination`): odobrenja startupa čiji je `startup._id` u stavci.
 */
const pendingBase = {
  workspace: workspaceMiniValidator,
  requesterName: v.union(v.string(), v.null()),
  createdAt: v.number(),
  targetType: v.literal("approvals"),
  targetId: v.string(),
};

const pendingItemValidator = v.union(
  // PROSTOR P22: ideja u fazi „Razmatra se" čeka moj glas.
  v.object({
    kind: v.literal("idea_vote"),
    ideaId: v.id("ideaNodes"),
    title: v.string(),
    authorName: v.union(v.string(), v.null()),
    upvotes: v.number(),
    downvotes: v.number(),
    workspace: workspaceMiniValidator,
    /** `stageChangedAt ?? createdAt` ideje. */
    createdAt: v.number(),
    targetType: v.literal("ideas"),
    targetId: v.string(),
  }),
  // Ugašeni izvori (P4) — ne emituju se, ostaju zbog starih klijenata (P25).
  v.object({
    kind: v.literal("deletion_vote"),
    ballotId: v.id("deletionBallots"),
    requestId: v.id("deletionRequests"),
    title: v.string(),
    targetKind: prostorTabele.deletionRequests.validator.fields.targetKind,
    ...pendingBase,
  }),
  v.object({
    kind: v.literal("page_nesting"),
    requestId: v.id("pageNestingRequests"),
    childTitle: v.string(),
    parentTitle: v.string(),
    ...pendingBase,
  }),
  v.object({
    kind: v.literal("idea_nesting"),
    requestId: v.id("nestingRequests"),
    childTitle: v.string(),
    parentTitle: v.string(),
    ...pendingBase,
  }),
);

type PendingItem = Infer<typeof pendingItemValidator>;

function visibleInScope(
  workspaceId: Id<"workspaces"> | null,
  scope: Map<Id<"workspaces">, WorkspaceMini>,
) {
  return workspaceId === null || scope.has(workspaceId);
}

function startupOfRow(
  workspaceId: Id<"workspaces"> | null,
  scope: Map<Id<"workspaces">, WorkspaceMini>,
) {
  return workspaceId === null ? null : (scope.get(workspaceId) ?? null);
}

function paginateFeed(
  ctx: QueryCtx,
  options: {
    profileId: Id<"profiles">;
    /** `undefined` = svi opsezi; `null` = samo lična obaveštenja. */
    workspaceId: Id<"workspaces"> | null | undefined;
    unreadOnly: boolean;
    paginationOpts: PaginationOptions;
  },
): Promise<PaginationResult<Doc<"notifications">>> {
  const { profileId, workspaceId, unreadOnly, paginationOpts } = options;
  if (workspaceId !== undefined) {
    return unreadOnly
      ? ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_workspace_and_readAt", (q) =>
            q
              .eq("recipientProfileId", profileId)
              .eq("workspaceId", workspaceId)
              .eq("readAt", null),
          )
          .order("desc")
          .paginate(paginationOpts)
      : ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_workspace_and_createdAt", (q) =>
            q.eq("recipientProfileId", profileId).eq("workspaceId", workspaceId),
          )
          .order("desc")
          .paginate(paginationOpts);
  }
  return unreadOnly
    ? ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_readAt", (q) =>
          q.eq("recipientProfileId", profileId).eq("readAt", null),
        )
        .order("desc")
        .paginate(paginationOpts)
    : ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_createdAt", (q) =>
          q.eq("recipientProfileId", profileId),
        )
        .order("desc")
        .paginate(paginationOpts);
}

/**
 * Feed obaveštenja iz svih mojih aktivnih startupa i ličnih razgovora, najnovije
 * prvo. Stavke iz startupa van opsega se izbacuju POSLE čitanja, pa stranica može
 * biti kraća od `numItems` — klijent koristi „Učitaj još" dok `isDone` nije true.
 * `startupId: null` vraća samo lična obaveštenja (`startup: null`).
 */
export const feed = prijavljenQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    workspaceId: scopeArgValidator,
    unreadOnly: v.optional(v.boolean()),
  },
  returns: paginationResultValidator(inboxItemValidator),
  handler: async (ctx, args) => {
    boundedLimit(
      args.paginationOpts.numItems,
      INBOX_FEED_PAGE_DEFAULT,
      INBOX_FEED_PAGE_MAX,
    );

    let profile: Doc<"profiles">;
    let scope: Map<Id<"workspaces">, WorkspaceMini>;
    if (args.workspaceId === undefined) {
      profile = await requireProfile(ctx);
      scope = await listMyActiveWorkspaces(ctx, profile._id);
    } else if (args.workspaceId === null) {
      // Samo lično: startup stavke se ni ne čitaju (indeks `startupId = null`).
      profile = await requireProfile(ctx);
      scope = new Map();
    } else {
      const member = await requireClanProjekta(ctx, args.workspaceId);
      profile = member.profile;
      scope = new Map([[args.workspaceId, await workspaceMiniOf(ctx, member.workspace)]]);
    }

    const page = await paginateFeed(ctx, {
      profileId: profile._id,
      workspaceId: args.workspaceId,
      unreadOnly: args.unreadOnly === true,
      paginationOpts: args.paginationOpts,
    });

    const rows = page.page.filter((row) => visibleInScope(row.workspaceId, scope));
    const withActor = await withActors(ctx, rows);
    return {
      ...page,
      page: withActor.map((item) => ({
        ...item,
        workspace: startupOfRow(item.workspaceId, scope),
      })),
    };
  },
});

/**
 * Nepročitano po opsezima. Skenira najviše `INBOX_UNREAD_SCAN_CAP` najnovijih
 * nepročitanih; kad dostigne granicu, SVI brojači su `capped` (prikaz „N+").
 * `byStartup` sadrži samo aktivne startupe sa bar jednim nepročitanim.
 */
export const unreadCounts = prijavljenQuery({
  args: {},
  returns: v.object({
    total: counterValidator,
    byStartup: v.array(
      v.object({
        workspaceId: v.id("workspaces"),
        count: v.number(),
        capped: v.boolean(),
      }),
    ),
    personal: counterValidator,
  }),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const [scope, unread] = await Promise.all([
      listMyActiveWorkspaces(ctx, profile._id),
      ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_readAt", (q) =>
          q.eq("recipientProfileId", profile._id).eq("readAt", null),
        )
        .order("desc")
        .take(INBOX_UNREAD_SCAN_CAP),
    ]);
    const capped = unread.length === INBOX_UNREAD_SCAN_CAP;

    const perStartup = new Map<Id<"workspaces">, number>();
    let personal = 0;
    for (const row of unread) {
      const workspaceId: Id<"workspaces"> | null = row.workspaceId;
      if (workspaceId === null) {
        personal += 1;
      } else if (scope.has(workspaceId)) {
        perStartup.set(workspaceId, (perStartup.get(workspaceId) ?? 0) + 1);
      }
    }

    // Redosled prati `listMyActiveStartups`, pa je stabilan između poziva.
    const byStartup = [...scope.keys()]
      .map((workspaceId) => ({
        workspaceId,
        count: perStartup.get(workspaceId) ?? 0,
        capped,
      }))
      .filter((entry) => entry.count > 0);
    const total = byStartup.reduce((sum, entry) => sum + entry.count, personal);

    return {
      total: { count: total, capped },
      byStartup,
      personal: { count: personal, capped },
    };
  },
});

/** Jedna serija „Označi sve": prvih `INBOX_MARK_ALL_BATCH` nepročitanih u opsegu. */
async function markBatch(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  target: MarkTarget,
) {
  const rows =
    target.kind === "all"
      ? await ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_readAt", (q) =>
            q.eq("recipientProfileId", profileId).eq("readAt", null),
          )
          .take(INBOX_MARK_ALL_BATCH)
      : await ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_workspace_and_readAt", (q) =>
            q
              .eq("recipientProfileId", profileId)
              .eq(
                "workspaceId",
                target.kind === "personal" ? null : target.workspaceId,
              )
              .eq("readAt", null),
          )
          .take(INBOX_MARK_ALL_BATCH);

  const now = Date.now();
  for (const row of rows) {
    await ctx.db.patch("notifications", row._id, { readAt: now });
  }
  return rows.length;
}

/**
 * „Označi sve kao pročitano": bez `startupId` svi opsezi (i lični), sa Id-jem samo
 * taj startup, sa `null` samo lična obaveštenja. Prva serija ide odmah, ostalo
 * kroz scheduler (obrazac `notifications.markAllReadBatch`). Bez `startupId` se
 * pročita i ono iz startupa koji više nisu u opsegu — to su moja obaveštenja i
 * brojač ne sme da ostane zaglavljen na nečemu što se ne vidi.
 */
export const markAllRead = prijavljenMutation({
  args: { workspaceId: scopeArgValidator },
  returns: v.object({ marked: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const workspaceId = args.workspaceId;
    const profile =
      workspaceId === undefined || workspaceId === null
        ? await requireProfile(ctx)
        : (await requireClanProjekta(ctx, workspaceId)).profile;
    const target: MarkTarget =
      workspaceId === undefined
        ? { kind: "all" }
        : workspaceId === null
          ? { kind: "personal" }
          : { kind: "startup", workspaceId };

    const marked = await markBatch(ctx, profile._id, target);
    const hasMore = marked === INBOX_MARK_ALL_BATCH;
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.prostor.inbox.markAllReadBatch, {
        profileId: profile._id,
        target,
      });
    }
    return { marked, hasMore };
  },
});

/** Nastavak `markAllRead` u novoj transakciji kad ih je previše za jednu. */
export const markAllReadBatch = internalMutation({
  args: { profileId: v.id("profiles"), target: markTargetValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const marked = await markBatch(ctx, args.profileId, args.target);
    if (marked === INBOX_MARK_ALL_BATCH) {
      await ctx.scheduler.runAfter(0, internal.prostor.inbox.markAllReadBatch, args);
    }
    return null;
  },
});

/** Prvih N kandidata po startupu (+1 da se zna da li ih ima još). */
const IDEA_VOTE_SCAN_PER_STARTUP = INBOX_PENDING_CAP + 1;

/**
 * SPAJANJE (plan S01 §9.1): opseg „moji projekti” je 50 (P28), ali „Čeka tebe”
 * kroz sve projekte čita najviše 20 projekata × 31 ideju, kao Devotion. Ko ima
 * više projekata dobija `truncated: true`, a ne tiho odsečen spisak.
 */
const INBOX_PENDING_WORKSPACE_CAP = 20;

/**
 * Ideje u fazi „Razmatra se" jednog startupa za koje profil još nije glasao
 * (P22). Najnovije promene faze prvo; čita najviše `IDEA_VOTE_SCAN_PER_STARTUP`
 * ideja, pa `full` kaže da ih ima možda još (i ispod granice, jer se moje
 * izglasane preskaču posle čitanja).
 */
async function ideaVoteCandidates(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  profileId: Id<"profiles">,
) {
  const rows = await ctx.db
    .query("ideaNodes")
    .withIndex("by_workspaceId_and_stage_and_archivedAt_and_stageChangedAt", (q) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("stage", "razmatra_se")
        .eq("archivedAt", null),
    )
    .order("desc")
    .take(IDEA_VOTE_SCAN_PER_STARTUP);
  const ideas: Doc<"ideaNodes">[] = [];
  for (const idea of rows) {
    if (idea.convertedPageId !== null) continue;
    const myVote = await ctx.db
      .query("ideaVotes")
      .withIndex("by_ideaId_and_profileId", (q) =>
        q.eq("ideaId", idea._id).eq("profileId", profileId),
      )
      .first();
    if (myVote === null) ideas.push(idea);
  }
  return { ideas, full: rows.length === IDEA_VOTE_SCAN_PER_STARTUP };
}

async function ideaVoteItem(
  ctx: QueryCtx,
  idea: Doc<"ideaNodes">,
  workspace: WorkspaceMini,
): Promise<PendingItem> {
  const [author, votes] = await Promise.all([
    ctx.db.get("profiles", idea.authorProfileId),
    ctx.db
      .query("ideaVotes")
      .withIndex("by_ideaId", (q) => q.eq("ideaId", idea._id))
      .take(INBOX_IDEA_VOTE_COUNT_CAP),
  ]);
  return {
    kind: "idea_vote",
    ideaId: idea._id,
    title: idea.title ?? idea.text.slice(0, 80),
    authorName: author?.displayName ?? null,
    upvotes: votes.filter((vote) => vote.voteType === "up").length,
    downvotes: votes.filter((vote) => vote.voteType === "down").length,
    workspace,
    createdAt: pendingIdeaAt(idea),
    targetType: "ideas",
    targetId: idea._id,
  };
}

function pendingIdeaAt(idea: Doc<"ideaNodes">) {
  return idea.stageChangedAt ?? idea.createdAt;
}

/**
 * „Čeka tebe" (PROSTOR P22): ideje u fazi „Razmatra se" za koje nisam glasao,
 * iz svih mojih aktivnih startupa ili iz jednog (`startupId`). Glasanja o
 * brisanju i zahtevi za ugnežđavanje su ugašeni (P4) i više se ne emituju;
 * njihove varijante ostaju u validatoru zbog starih klijenata (P25).
 *
 * `idea_vote` se vraća SAMO uz `include: ["idea_vote"]` (K01 D16): stari
 * buildovi nepoznatu vrstu prikazuju kao ugnežđavanje, pa bez `include` lista
 * ostaje prazna. Najviše `INBOX_PENDING_CAP` stavki, najnovije prvo; `truncated`
 * kad ih ima (možda) još.
 */
export const pending = prijavljenQuery({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    include: v.optional(v.array(inboxPendingIncludeValidator)),
  },
  returns: v.object({
    items: v.array(pendingItemValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const member =
      args.workspaceId === undefined
        ? null
        : await requireClanProjekta(ctx, args.workspaceId);
    const profile = member?.profile ?? (await requireProfile(ctx));
    if (args.include?.includes("idea_vote") !== true) {
      return { items: [], truncated: false };
    }
    let truncated = false;
    let scope: Map<Id<"workspaces">, WorkspaceMini>;
    if (member === null) {
      const moji = await listMyActiveWorkspaces(
        ctx,
        profile._id,
        INBOX_PENDING_WORKSPACE_CAP + 1,
      );
      if (moji.size > INBOX_PENDING_WORKSPACE_CAP) truncated = true;
      scope = new Map([...moji].slice(0, INBOX_PENDING_WORKSPACE_CAP));
    } else {
      scope = new Map([[member.workspace._id, await workspaceMiniOf(ctx, member.workspace)]]);
    }

    const candidates: Array<{ idea: Doc<"ideaNodes">; workspace: WorkspaceMini }> = [];
    for (const [workspaceId, workspace] of scope) {
      const found = await ideaVoteCandidates(ctx, workspaceId, profile._id);
      if (found.full) truncated = true;
      for (const idea of found.ideas) candidates.push({ idea, workspace });
    }
    candidates.sort(
      (first, second) =>
        pendingIdeaAt(second.idea) - pendingIdeaAt(first.idea) ||
        second.idea._creationTime - first.idea._creationTime,
    );
    if (candidates.length > INBOX_PENDING_CAP) truncated = true;

    const items: PendingItem[] = [];
    for (const { idea, workspace } of candidates.slice(0, INBOX_PENDING_CAP)) {
      items.push(await ideaVoteItem(ctx, idea, workspace));
    }
    return { items, truncated };
  },
});
