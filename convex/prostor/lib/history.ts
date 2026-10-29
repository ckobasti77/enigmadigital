// Preneto iz Devotion packages/backend/convex/lib/history.ts (main @ c05c40f), SPAJANJE S03.
import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { contributionTargetKey } from "./collaboration";

type ReadCtx = QueryCtx | MutationCtx;

/**
 * Istorija izmena (PROSTOR P2, plan K01 §3). Snimak naslova i sadržaja POSLE
 * izmene, za stranice (uz instrukcije zadatka), opis oblasti i ideje.
 *
 * - Pre prve izmene upisuje se bazna revizija (zatečeno stanje).
 * - Izmene istog autora na istoj stavci u roku od 10 minuta se spajaju.
 * - „Vrati ovu verziju" pravi NOVU reviziju; ništa se ne briše niti obrezuje.
 *
 * Sat čita samo mutacija koja upisuje; upiti nad istorijom ga ne čitaju.
 */
export const REVISION_MERGE_WINDOW_MS = 10 * 60 * 1_000;
export const HISTORY_PAGE_DEFAULT = 20;
export const HISTORY_PAGE_MAX = 50;
const EXCERPT_LENGTH = 160;

export const revisionTargetKindValidator = v.union(
  v.literal("page"),
  v.literal("area"),
  v.literal("idea"),
);
export const revisionKindValidator = v.union(
  v.literal("baseline"),
  v.literal("edit"),
  v.literal("restore"),
);
export const revisionTargetValidator = v.union(
  v.object({ kind: v.literal("page"), id: v.id("pages") }),
  v.object({ kind: v.literal("area"), id: v.id("areas") }),
  v.object({ kind: v.literal("idea"), id: v.id("ideaNodes") }),
);

export type RevisionTarget =
  | { kind: "page"; id: Id<"pages"> }
  | { kind: "area"; id: Id<"areas"> }
  | { kind: "idea"; id: Id<"ideaNodes"> };

export type RevisionSnapshot = {
  title: string | null;
  content: string;
  /** Samo zadaci; `undefined` = stavka nema instrukcije. */
  instructions?: string | null;
};

export function revisionTargetKey(target: RevisionTarget): string {
  return contributionTargetKey(target.kind, target.id);
}

function sameSnapshot(a: RevisionSnapshot, b: RevisionSnapshot) {
  return (
    a.title === b.title &&
    a.content === b.content &&
    (a.instructions ?? null) === (b.instructions ?? null)
  );
}

function snapshotFields(snapshot: RevisionSnapshot) {
  return {
    title: snapshot.title,
    content: snapshot.content,
    ...(snapshot.instructions === undefined
      ? {}
      : { instructions: snapshot.instructions }),
  };
}

export async function latestRevision(
  ctx: ReadCtx,
  targetKey: string,
): Promise<Doc<"contentRevisions"> | null> {
  return await ctx.db
    .query("contentRevisions")
    .withIndex("by_targetKey_and_updatedAt", (q) =>
      q.eq("targetKey", targetKey),
    )
    .order("desc")
    .first();
}

/**
 * Upisuje izmenu u Istoriju. Vraća `null` kad se naslov, sadržaj i instrukcije
 * nisu promenili. Prva izmena stavke prvo upisuje baznu reviziju sa stanjem
 * PRE izmene.
 */
export async function recordRevision(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    target: RevisionTarget;
    before: RevisionSnapshot;
    after: RevisionSnapshot;
    /** Ko i kada je napravio zatečeno stanje (bazna revizija). */
    baseline: { authorProfileId: Id<"profiles"> | null; at: number };
    actorProfileId: Id<"profiles">;
    now: number;
    targetRevision: number | null;
  },
): Promise<Id<"contentRevisions"> | null> {
  if (sameSnapshot(args.before, args.after)) return null;
  const targetKey = revisionTargetKey(args.target);
  const latest = await latestRevision(ctx, targetKey);
  const base = {
    workspaceId: args.workspaceId,
    targetKind: args.target.kind,
    targetId: args.target.id as string,
    targetKey,
  };
  if (latest === null) {
    const at = Math.min(args.baseline.at, args.now);
    await ctx.db.insert("contentRevisions", {
      ...base,
      kind: "baseline",
      authorProfileId: args.baseline.authorProfileId,
      ...snapshotFields(args.before),
      targetRevision: null,
      createdAt: at,
      updatedAt: at,
    });
  } else if (
    latest.kind === "edit" &&
    latest.authorProfileId === args.actorProfileId &&
    args.now - latest.updatedAt < REVISION_MERGE_WINDOW_MS
  ) {
    await ctx.db.patch("contentRevisions", latest._id, {
      ...snapshotFields(args.after),
      targetRevision: args.targetRevision,
      updatedAt: args.now,
    });
    return latest._id;
  }
  return await ctx.db.insert("contentRevisions", {
    ...base,
    kind: "edit",
    authorProfileId: args.actorProfileId,
    ...snapshotFields(args.after),
    targetRevision: args.targetRevision,
    createdAt: args.now,
    updatedAt: args.now,
  });
}

/** „Vrati ovu verziju" — uvek nova revizija, nikad spajanje. */
export async function insertRestoreRevision(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    target: RevisionTarget;
    snapshot: RevisionSnapshot;
    actorProfileId: Id<"profiles">;
    now: number;
    restoredFromId: Id<"contentRevisions">;
    targetRevision: number | null;
  },
): Promise<Id<"contentRevisions">> {
  return await ctx.db.insert("contentRevisions", {
    workspaceId: args.workspaceId,
    targetKind: args.target.kind,
    targetId: args.target.id as string,
    targetKey: revisionTargetKey(args.target),
    kind: "restore",
    authorProfileId: args.actorProfileId,
    ...snapshotFields(args.snapshot),
    targetRevision: args.targetRevision,
    restoredFromId: args.restoredFromId,
    createdAt: args.now,
    updatedAt: args.now,
  });
}

/** Kratak čist tekst za listu revizija (bez HTML-a). */
export function revisionExcerpt(content: string, max = EXCERPT_LENGTH): string {
  const text = content
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/div)\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Bazna revizija stranice: autor je poznat samo dok stranica nije menjana. */
export function pageBaseline(page: Doc<"pages">) {
  return {
    authorProfileId: page.revision === 0 ? page.createdByProfileId : null,
    at: page.updatedAt,
  };
}

/** Bazna revizija ideje: autor je poznat samo dok ideja nije menjana. */
export function ideaBaseline(idea: Doc<"ideaNodes">) {
  return {
    authorProfileId:
      idea.updatedAt === idea.createdAt ? idea.authorProfileId : null,
    at: idea.updatedAt,
  };
}
