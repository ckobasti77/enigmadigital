// Preneto iz Devotion packages/backend/convex/lib/chat_channels.ts (main @ c05c40f), SPAJANJE S02.
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/**
 * Opšti (`kind:"startup"`) i kanali oblasti (`kind:"area"`) su JEDINI chat kanali
 * koji se prave automatski — ostali (`dm`/`thread`/`custom`/`agent`) nastaju lenjo.
 * Ova dva helpera su jedini izvor istine za njihovo pravljenje: zovu ih i žive
 * mutacije (`startups.create`, `startups.createArea`) na kreiranju, i backfill
 * migracija (`migrations.backfillChatChannels`) za postojeće startup-e. Oba su
 * insert-if-absent (idempotentna) — ponovni poziv NE duplira kanal.
 *
 * `chatReads` se ovde NE seeduje: `insertMessage` (chat.ts) upsert-uje red pri
 * prvoj poruci, a schema definiše nedostajući red kao „0 unread, nivo all", pa je
 * proaktivan seed nepotreban za tačan unread brojač.
 */

const GENERAL_CHANNEL_NAME = "Opšte";

/** Opšti kanal tima (`kind:"startup"`, `areaId:null`). Vraća id postojećeg ili novog. */
export async function ensureGeneralChannel(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    createdByProfileId: Id<"profiles">;
    createdAt: number;
  },
): Promise<Id<"chatChannels">> {
  const existing = await ctx.db
    .query("chatChannels")
    .withIndex("by_workspace_and_kind", (q) =>
      q
        .eq("workspaceId", args.workspaceId)
        .eq("kind", "startup")
        .eq("archivedAt", null),
    )
    .first();
  if (existing !== null) return existing._id;
  return await ctx.db.insert("chatChannels", {
    workspaceId: args.workspaceId,
    kind: "startup",
    areaId: null,
    anchorType: null,
    anchorId: null,
    dmKey: null,
    name: GENERAL_CHANNEL_NAME,
    isPrivate: false,
    lastMessageAt: args.createdAt,
    lastMessagePreview: "",
    lastMessageAuthorId: null,
    messageCount: 0,
    createdByProfileId: args.createdByProfileId,
    archivedAt: null,
    createdAt: args.createdAt,
  });
}

/** Kanal oblasti (`kind:"area"`, ime = labela oblasti). Vraća id postojećeg ili novog. */
export async function ensureAreaChannel(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    areaId: Id<"areas">;
    name: string;
    createdByProfileId: Id<"profiles">;
    createdAt: number;
  },
): Promise<Id<"chatChannels">> {
  const existing = await ctx.db
    .query("chatChannels")
    .withIndex("by_area", (q) =>
      q.eq("areaId", args.areaId).eq("archivedAt", null),
    )
    .first();
  if (existing !== null) return existing._id;
  return await ctx.db.insert("chatChannels", {
    workspaceId: args.workspaceId,
    kind: "area",
    areaId: args.areaId,
    anchorType: null,
    anchorId: null,
    dmKey: null,
    name: args.name,
    isPrivate: false,
    lastMessageAt: args.createdAt,
    lastMessagePreview: "",
    lastMessageAuthorId: null,
    messageCount: 0,
    createdByProfileId: args.createdByProfileId,
    archivedAt: null,
    createdAt: args.createdAt,
  });
}
