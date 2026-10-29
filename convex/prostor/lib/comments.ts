// Preneto iz Devotion packages/backend/convex/lib/comments.ts (main @ c05c40f), SPAJANJE S03.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { recordActivity, type ActivityTargetType } from "./activity";
import { clanstvoProfila, profilKreatoraProjekta, requireClanProjekta } from "./auth";
import { contributionTargetKey, insertContribution } from "./collaboration";
import { revisionExcerpt } from "./history";
import {
  createNotification,
  notificationCopy,
  type NotificationTargetType,
} from "./notifications";
import { cleanPageContent } from "./page_creation";
import { requireVisiblePage } from "./pages";
import {
  canComment,
  canEditComment,
  canRemoveComment,
  permissionError,
  type Actor,
} from "./permissions";
import {
  COMMENT_COUNT_CAP,
  COMMENT_MAX_LENGTH,
  COMMENT_UNDO_MS,
  MAX_COMMENT_MENTIONS,
} from "./validators";

/**
 * Komentari (PROSTOR P5, plan K01 §7). Komentar je red u `contentContributions`
 * (bez nove tabele): novi komentar je odmah vidljiv (bez moderacije), autor ga
 * menja i uklanja, vlasnik startupa i admin sklanjaju tuđi. Ovde živi sve što
 * dele nove funkcije (`comments.*`), stare (`collaboration.*Contribution`) i
 * `pages.addEntry/deleteEntry`, da pravila ne mogu da se raziđu.
 *
 * Tela stranica i ideja (`sourceKind: page_body | idea_original`) postoje kao
 * prilozi, ali NISU komentari: ne prikazuju se, ne računaju se i ne uklanjaju se.
 */

type ReadCtx = QueryCtx | MutationCtx;

export type CommentTarget =
  | { kind: "idea"; id: Id<"ideaNodes"> }
  | { kind: "page"; id: Id<"pages"> }
  | { kind: "area"; id: Id<"areas"> }
  | { kind: "task_checkpoint"; id: Id<"taskCheckpoints"> }
  | { kind: "recovered"; id: Id<"recoveredContent"> };

export type CommentTargetKind = CommentTarget["kind"];

export type ResolvedCommentTarget = {
  kind: CommentTargetKind;
  /** Id stavke na kojoj komentar stoji (za korak: id koraka). */
  targetId: string;
  workspaceId: Id<"workspaces">;
  /** Naslov stavke — za obaveštenja i aktivnost. */
  title: string;
  /** Vlasnik stavke: vidi i odbijene komentare (P5). */
  ownerProfileId: Id<"profiles"> | null;
  /** Dobija `comment_added`; `null` za oblast (niko) i Oporavljeno. */
  noticeAuthorProfileId: Id<"profiles"> | null;
  /** Zadatak čiji izvršioci dobijaju `comment_added` (zadatak i njegovi koraci). */
  taskPageId: Id<"pages"> | null;
  activity: { targetType: ActivityTargetType; targetId: string };
  /** Kuda vodi obaveštenje; `null` = bez obaveštenja (Oporavljeno). */
  notice: { targetType: NotificationTargetType; targetId: string } | null;
};

const NOT_FOUND = {
  page: "Stranica nije pronađena.",
  idea: "Ideja nije pronađena.",
  area: "Oblast nije pronađena.",
  task_checkpoint: "Checkpoint nije pronađen.",
  recovered: "Oporavljeni sadržaj nije pronađen.",
} as const;

/** Nađi stavku na kojoj komentar stoji; baca ako ne postoji ili je u Korpi. */
export async function resolveCommentTarget(
  ctx: ReadCtx,
  target: CommentTarget,
): Promise<ResolvedCommentTarget> {
  if (target.kind === "page") {
    const page = await requireVisiblePage(ctx, target.id);
    return {
      kind: "page",
      targetId: page._id,
      workspaceId: page.workspaceId,
      title: page.title,
      ownerProfileId: page.createdByProfileId,
      noticeAuthorProfileId: page.createdByProfileId,
      taskPageId: page.kind === "task" ? page._id : null,
      activity: { targetType: "page", targetId: page._id },
      notice: { targetType: "page", targetId: page._id },
    };
  }
  if (target.kind === "idea") {
    const idea = await ctx.db.get("ideaNodes", target.id);
    if (idea === null || idea.archivedAt !== null) {
      throw new Error(NOT_FOUND.idea);
    }
    return {
      kind: "idea",
      targetId: idea._id,
      workspaceId: idea.workspaceId,
      title: idea.title ?? idea.text.slice(0, 80),
      ownerProfileId: idea.authorProfileId,
      noticeAuthorProfileId: idea.authorProfileId,
      taskPageId: null,
      activity: { targetType: "idea", targetId: idea._id },
      notice: { targetType: "ideas", targetId: idea._id },
    };
  }
  if (target.kind === "area") {
    const area = await ctx.db.get("areas", target.id);
    const workspace =
      area === null ? null : await ctx.db.get("workspaces", area.workspaceId);
    if (area === null || workspace === null || workspace.arhiviran === true) {
      throw new Error(NOT_FOUND.area);
    }
    return {
      kind: "area",
      targetId: area._id,
      workspaceId: area.workspaceId,
      title: area.label,
      ownerProfileId: await profilKreatoraProjekta(ctx, workspace),
      // Opis oblasti nema autora — komentar ne budi nikoga osim pomenutih.
      noticeAuthorProfileId: null,
      taskPageId: null,
      activity: { targetType: "area", targetId: area._id },
      notice: { targetType: "area", targetId: area._id },
    };
  }
  if (target.kind === "task_checkpoint") {
    const checkpoint = await ctx.db.get("taskCheckpoints", target.id);
    if (checkpoint === null || checkpoint.archivedAt !== null) {
      throw new Error(NOT_FOUND.task_checkpoint);
    }
    const page = await requireVisiblePage(ctx, checkpoint.taskPageId).catch(
      () => null,
    );
    if (page === null || page.kind !== "task") {
      throw new Error(NOT_FOUND.task_checkpoint);
    }
    return {
      kind: "task_checkpoint",
      targetId: checkpoint._id,
      workspaceId: checkpoint.workspaceId,
      title: page.title,
      ownerProfileId: page.createdByProfileId,
      noticeAuthorProfileId: page.createdByProfileId,
      taskPageId: page._id,
      // Korak se otvara kroz svoj zadatak.
      activity: { targetType: "page", targetId: page._id },
      notice: { targetType: "page", targetId: page._id },
    };
  }
  const recovered = await ctx.db.get("recoveredContent", target.id);
  if (recovered === null || recovered.archivedAt !== null) {
    throw new Error(NOT_FOUND.recovered);
  }
  return {
    kind: "recovered",
    targetId: recovered._id,
    workspaceId: recovered.workspaceId,
    title: recovered.title,
    ownerProfileId: recovered.createdByProfileId,
    noticeAuthorProfileId: null,
    taskPageId: null,
    activity: { targetType: "recovered", targetId: recovered._id },
    notice: null,
  };
}

/** Stavka komentara iz njegovog reda (`null` ako stavka više ne postoji). */
function targetFromRow(
  ctx: ReadCtx,
  row: Doc<"contentContributions">,
): CommentTarget | null {
  switch (row.targetKind) {
    case "page": {
      const id = ctx.db.normalizeId("pages", row.targetId);
      return id === null ? null : { kind: "page", id };
    }
    case "idea": {
      const id = ctx.db.normalizeId("ideaNodes", row.targetId);
      return id === null ? null : { kind: "idea", id };
    }
    case "area": {
      const id = ctx.db.normalizeId("areas", row.targetId);
      return id === null ? null : { kind: "area", id };
    }
    case "task_checkpoint": {
      const id = ctx.db.normalizeId("taskCheckpoints", row.targetId);
      return id === null ? null : { kind: "task_checkpoint", id };
    }
    case "recovered": {
      const id = ctx.db.normalizeId("recoveredContent", row.targetId);
      return id === null ? null : { kind: "recovered", id };
    }
  }
}

// --- Vidljivost i oblik --------------------------------------------------------

/** Telo stranice ili ideje (prilog) — nikad komentar. */
export function isCommentBody(
  row: Pick<Doc<"contentContributions">, "sourceKind">,
): boolean {
  return row.sourceKind === "page_body" || row.sourceKind === "idea_original";
}

/**
 * Da li gledalac vidi red među komentarima (plan K01 §7.1): tela nikad,
 * „odbijeni" samo autor komentara i vlasnik stavke, ostali (na čekanju, odobreni,
 * bez statusa) svi članovi. Arhivirane red i ne stiže ovamo (indeks).
 */
export function isCommentVisible(
  row: Doc<"contentContributions">,
  viewerProfileId: Id<"profiles">,
  ownerProfileId: Id<"profiles"> | null,
): boolean {
  if (isCommentBody(row)) return false;
  if (row.moderationStatus !== "rejected") return true;
  return (
    row.authorProfileId === viewerProfileId || ownerProfileId === viewerProfileId
  );
}

/** Poreklo reda: novi komentar, stari potpisani unos ili zajednički tekst bez autora. */
export function commentOrigin(
  row: Pick<Doc<"contentContributions">, "attribution" | "sourceKind">,
): "comment" | "legacy_entry" | "legacy_shared" {
  if (row.attribution === "legacy_neutral") return "legacy_shared";
  return row.sourceKind === "page_entry" ? "legacy_entry" : "comment";
}

/** Tekst komentara: ne prazan (ni kad su ostali samo tagovi) i do 20.000 znakova. */
export function cleanCommentContent(value: string): string {
  const content = cleanPageContent(value);
  if (!content.trim() || revisionExcerpt(content, 1) === "") {
    throw new Error("Tekst ne može biti prazan.");
  }
  if (content.length > COMMENT_MAX_LENGTH) {
    throw new Error("Tekst može imati najviše 20.000 znakova.");
  }
  return content;
}

/** Koliko redova koji nisu komentari (tela, odbijeni) brojač sme da preskoči. */
const COUNT_SKIP_ALLOWANCE = 10;

/**
 * Broj komentara na jednoj stavci za liste i kartice: staje čim nađe `cap + 1`
 * vidljivih ili pročita `cap + 1 + 10` redova, pa jedan poziv čita najviše ~31
 * redova. Preskače tela i odbijene (njihovu vidljivost određuje gledalac, pa se
 * u broju ne računaju nikome); stavka sa više od 10 takvih redova može biti
 * podbrojana. Redovi iz drugog startupa se ne računaju (id cilja dolazi od
 * klijenta).
 */
export async function countVisibleComments(
  ctx: ReadCtx,
  args: {
    workspaceId: Id<"workspaces">;
    kind: CommentTargetKind;
    targetId: string;
    cap?: number;
  },
): Promise<{ count: number; capped: boolean }> {
  const cap = args.cap ?? COMMENT_COUNT_CAP;
  const scanLimit = cap + 1 + COUNT_SKIP_ALLOWANCE;
  const rows = ctx.db
    .query("contentContributions")
    .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
      q
        .eq("targetKey", contributionTargetKey(args.kind, args.targetId))
        .eq("archivedAt", null),
    );
  let count = 0;
  let scanned = 0;
  for await (const row of rows) {
    scanned += 1;
    if (
      row.workspaceId === args.workspaceId &&
      !isCommentBody(row) &&
      row.moderationStatus !== "rejected"
    ) {
      count += 1;
    }
    if (count > cap || scanned >= scanLimit) break;
  }
  return { count: Math.min(count, cap), capped: count > cap };
}

// --- Pominjanja ----------------------------------------------------------------

/**
 * Pominjanja koja server zadržava: samo aktivni članovi startupa, bez autora
 * komentara. Više od `MAX_COMMENT_MENTIONS` ili isti član dvaput je greška
 * klijenta (ODLUKA K04-1) — nečlan se tiho odbacuje.
 */
export async function keepMentionableMembers(
  ctx: ReadCtx,
  args: {
    workspaceId: Id<"workspaces">;
    authorProfileId: Id<"profiles">;
    mentionProfileIds: ReadonlyArray<Id<"profiles">> | undefined;
  },
): Promise<Array<Id<"profiles">>> {
  const ids = args.mentionProfileIds ?? [];
  if (ids.length > MAX_COMMENT_MENTIONS) {
    throw new Error(
      `Komentar može pomenuti najviše ${MAX_COMMENT_MENTIONS} članova.`,
    );
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("Isti član je pomenut više puta.");
  }
  const kept: Array<Id<"profiles">> = [];
  for (const profileId of ids) {
    if (profileId === args.authorProfileId) continue;
    // Aktivan profil sa owner/urednik članstvom u projektu (S01 §3.3).
    const membership = await clanstvoProfila(ctx, args.workspaceId, profileId);
    if (membership === null) continue;
    kept.push(profileId);
  }
  return kept;
}

// --- Obaveštenja ---------------------------------------------------------------

async function notifyMentions(
  ctx: MutationCtx,
  args: {
    commentId: Id<"contentContributions">;
    actor: Actor;
    target: ResolvedCommentTarget;
    content: string;
    recipients: ReadonlyArray<Id<"profiles">>;
  },
) {
  if (args.target.notice === null) return;
  const copy = notificationCopy.commentMention(
    args.actor.profile.displayName,
    args.target.title,
    revisionExcerpt(args.content, 120),
  );
  for (const recipientProfileId of args.recipients) {
    await createNotification(ctx, {
      recipientProfileId,
      workspaceId: args.target.workspaceId,
      type: "comment_mention",
      title: copy.title,
      ...(copy.body === undefined ? {} : { body: copy.body }),
      targetType: args.target.notice.targetType,
      targetId: args.target.notice.targetId,
      actorProfileId: args.actor.profile._id,
      dedupeKey: `comment:${args.commentId}:${recipientProfileId}:comment_mention`,
    });
  }
}

/** Autor stavke i izvršioci zadatka, bez autora komentara i već pomenutih. */
async function notifyCommentAdded(
  ctx: MutationCtx,
  args: {
    commentId: Id<"contentContributions">;
    actor: Actor;
    target: ResolvedCommentTarget;
    content: string;
    mentioned: ReadonlyArray<Id<"profiles">>;
  },
) {
  if (args.target.notice === null) return;
  const recipients = new Set<Id<"profiles">>();
  if (args.target.noticeAuthorProfileId !== null) {
    recipients.add(args.target.noticeAuthorProfileId);
  }
  if (args.target.taskPageId !== null) {
    const taskPageId = args.target.taskPageId;
    const assignees = await ctx.db
      .query("taskAssignees")
      .withIndex("by_task_active_created", (q) =>
        q.eq("taskPageId", taskPageId).eq("archivedAt", null),
      )
      .take(100);
    for (const assignee of assignees) recipients.add(assignee.profileId);
  }
  recipients.delete(args.actor.profile._id);
  for (const profileId of args.mentioned) recipients.delete(profileId);

  const copy = notificationCopy.commentAdded(
    args.actor.profile.displayName,
    args.target.title,
    revisionExcerpt(args.content, 120),
  );
  for (const recipientProfileId of recipients) {
    await createNotification(ctx, {
      recipientProfileId,
      workspaceId: args.target.workspaceId,
      type: "comment_added",
      title: copy.title,
      ...(copy.body === undefined ? {} : { body: copy.body }),
      targetType: args.target.notice.targetType,
      targetId: args.target.notice.targetId,
      actorProfileId: args.actor.profile._id,
      dedupeKey: `comment:${args.commentId}:${recipientProfileId}:comment_added`,
    });
  }
}

// --- Dodavanje, izmena, uklanjanje, vraćanje ----------------------------------

/**
 * Novi komentar: odmah vidljiv svim članovima (bez moderacije), aktivnost
 * `comment_created`, `comment_mention` pomenutima i `comment_added` autoru
 * stavke i izvršiocima zadatka. Komentarisanje je dozvoljeno i na zaključanoj
 * stranici (R12).
 */
export async function addComment(
  ctx: MutationCtx,
  args: {
    target: CommentTarget;
    content: string;
    mentionProfileIds?: ReadonlyArray<Id<"profiles">>;
    /** Stari potpisani unos stranice (`pages.addEntry`) koji ovaj komentar ogleda. */
    source?: { kind: "page_entry"; id: string };
  },
): Promise<Id<"contentContributions">> {
  const target = await resolveCommentTarget(ctx, args.target);
  const actor = await requireClanProjekta(ctx, target.workspaceId);
  if (!canComment(actor)) {
    throw permissionError("NEMA_DOZVOLU", "Komentarisanje nije dozvoljeno.");
  }
  const content = cleanCommentContent(args.content);
  const mentions = await keepMentionableMembers(ctx, {
    workspaceId: target.workspaceId,
    authorProfileId: actor.profile._id,
    mentionProfileIds: args.mentionProfileIds,
  });

  const commentId = await insertContribution(ctx, {
    workspaceId: target.workspaceId,
    targetKind: target.kind,
    targetId: target.targetId,
    authorProfileId: actor.profile._id,
    content,
    moderationStatus: "approved",
    mentionProfileIds: mentions,
    ...(args.source === undefined
      ? {}
      : { sourceKind: args.source.kind, sourceId: args.source.id }),
  });
  await recordActivity(ctx, {
    workspaceId: target.workspaceId,
    actorProfileId: actor.profile._id,
    action: "comment_created",
    targetType: target.activity.targetType,
    targetId: target.activity.targetId,
    title: target.title,
    detail: revisionExcerpt(content, 80),
  });
  await notifyMentions(ctx, {
    commentId,
    actor,
    target,
    content,
    recipients: mentions,
  });
  await notifyCommentAdded(ctx, {
    commentId,
    actor,
    target,
    content,
    mentioned: mentions,
  });
  return commentId;
}

async function requireLiveComment(
  ctx: ReadCtx,
  commentId: Id<"contentContributions">,
) {
  const row = await ctx.db.get("contentContributions", commentId);
  if (row === null || row.archivedAt !== null) {
    throw new Error("Tekst nije pronađen.");
  }
  return row;
}

/**
 * Izmena SVOG komentara (R13). Status moderacije se ne menja; obaveštava se
 * samo ko je NOVO pomenut. Stavka mora i dalje da postoji (nije u Korpi).
 */
export async function updateComment(
  ctx: MutationCtx,
  args: {
    commentId: Id<"contentContributions">;
    content: string;
    mentionProfileIds?: ReadonlyArray<Id<"profiles">>;
  },
): Promise<Id<"contentContributions">> {
  const row = await requireLiveComment(ctx, args.commentId);
  const actor = await requireClanProjekta(ctx, row.workspaceId);
  if (isCommentBody(row) || !canEditComment(actor, row)) {
    throw permissionError("NEMA_DOZVOLU", "Možete urediti samo svoj tekst.");
  }
  const commentTarget = targetFromRow(ctx, row);
  if (commentTarget === null) throw new Error("Tekst nije pronađen.");
  const target = await resolveCommentTarget(ctx, commentTarget);
  if (target.workspaceId !== row.workspaceId) {
    throw new Error("Tekst nije pronađen.");
  }

  const content = cleanCommentContent(args.content);
  // Bez liste klijent ne dira pominjanja (stari klijenti je ni ne šalju).
  const mentions =
    args.mentionProfileIds === undefined
      ? (row.mentionProfileIds ?? [])
      : await keepMentionableMembers(ctx, {
          workspaceId: row.workspaceId,
          authorProfileId: actor.profile._id,
          mentionProfileIds: args.mentionProfileIds,
        });
  const now = Date.now();
  await ctx.db.patch("contentContributions", row._id, {
    content,
    mentionProfileIds: mentions.length === 0 ? undefined : [...mentions],
    editedAt: now,
    updatedAt: now,
  });
  if (row.sourceKind === "page_entry" && row.sourceId !== undefined) {
    const entryId = ctx.db.normalizeId("pageEntries", row.sourceId);
    const entry =
      entryId === null ? null : await ctx.db.get("pageEntries", entryId);
    if (entry !== null && entry.authorProfileId === actor.profile._id) {
      await ctx.db.patch("pageEntries", entry._id, {
        content,
        updatedAt: now,
      });
    }
  }
  await recordActivity(ctx, {
    workspaceId: row.workspaceId,
    actorProfileId: actor.profile._id,
    action: "contribution_updated",
    targetType: "contribution",
    targetId: row._id,
    title: "Tekst je izmenjen",
  });
  // Odbijen komentar vide samo autor i vlasnik stavke — pomenuti ne sme da
  // dobije isečak koji ne može da otvori.
  if (row.moderationStatus !== "rejected") {
    const previous = new Set(row.mentionProfileIds ?? []);
    await notifyMentions(ctx, {
      commentId: row._id,
      actor,
      target,
      content,
      recipients: mentions.filter((profileId) => !previous.has(profileId)),
    });
  }
  return row._id;
}

/**
 * Uklanjanje komentara (R14): autor svoj, vlasnik startupa i admin tuđi. Red se
 * arhivira — ništa se ne briše — i može da se vrati narednih 8 s.
 */
export async function removeComment(
  ctx: MutationCtx,
  commentId: Id<"contentContributions">,
): Promise<{ commentId: Id<"contentContributions">; undoUntil: number }> {
  const row = await requireLiveComment(ctx, commentId);
  const actor = await requireClanProjekta(ctx, row.workspaceId);
  if (isCommentBody(row)) {
    throw permissionError(
      "NEMA_DOZVOLU",
      "Sadržaj stranice ili ideje se ne briše kao komentar.",
    );
  }
  if (!canRemoveComment(actor, row)) {
    throw permissionError(
      "NEMA_DOZVOLU",
      "Tuđi komentar uklanja njegov autor ili vlasnik projekta.",
    );
  }
  const now = Date.now();
  await ctx.db.patch("contentContributions", row._id, {
    archivedAt: now,
    updatedAt: now,
  });
  return { commentId: row._id, undoUntil: now + COMMENT_UNDO_MS };
}

/** „Poništi" uklanjanje: ista prava kao uklanjanje, najviše 8 s posle njega. */
export async function restoreComment(
  ctx: MutationCtx,
  commentId: Id<"contentContributions">,
): Promise<Id<"contentContributions">> {
  const row = await ctx.db.get("contentContributions", commentId);
  if (row === null || row.archivedAt === null) {
    throw new Error("Tekst nije pronađen.");
  }
  const actor = await requireClanProjekta(ctx, row.workspaceId);
  if (isCommentBody(row) || !canRemoveComment(actor, row)) {
    throw permissionError(
      "NEMA_DOZVOLU",
      "Možete vratiti samo komentar koji smete da uklonite.",
    );
  }
  const now = Date.now();
  if (now - row.archivedAt > COMMENT_UNDO_MS) {
    throw new Error("Vreme za Undo je isteklo.");
  }
  await ctx.db.patch("contentContributions", row._id, {
    archivedAt: null,
    updatedAt: now,
  });
  return row._id;
}
