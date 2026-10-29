// Preneto iz Devotion apps/web/components/me/my-day/side-model.ts (main @ c05c40f), SPAJANJE S19.
/**
 * Desna kolona Moj dan (plan K07 §1.2): Inbox ukratko, nepročitane poruke i
 * „Čeka tebe". ČISTO (vitest). Svaki blok ima svoje stanje; blok čiji upit
 * padne ili ne postoji se tiho skriva (`hidden`).
 */
import { pendingIdeaVotes, pendingKey, pendingTitle, type WorkspaceMini } from "..";

// Tekst i ključ stavke „Čeka tebe" žive u shared (`inbox.ts`) — dele ih Inbox i telefon.
export { pendingTitle };

export type SideBlock<T> = { status: "loading" } | { status: "hidden" } | { status: "ready"; data: T };

export type SideInbox = {
  unread: number;
  capped: boolean;
  items: Array<{ id: string; title: string; workspace: WorkspaceMini | null; createdAt: number }>;
};

export type SideChat = {
  total: number;
  personal: number;
  byStartup: Array<{ workspace: WorkspaceMini; unread: number }>;
};

export type SidePending = {
  /** Samo ideje koje čekaju moj glas (PROSTOR P22); „Glasaj" otvara ideju u njenom startupu. */
  items: Array<{ key: string; title: string; workspace: WorkspaceMini; ideaId: string }>;
  truncated: boolean;
};

/** Strukturni oblik `chat.unreadSummary`. */
type UnreadSummaryLike = {
  total: { unreadCount: number };
  personal: { unreadCount: number };
  byStartup: ReadonlyArray<{ workspaceId: string; unreadCount: number }>;
};

/** Poruke po startupu sa imenima iz `overview.startups` (startup van liste se preskače). */
export function chatSummary(
  summary: UnreadSummaryLike,
  workspaces: ReadonlyArray<WorkspaceMini>,
): SideChat {
  const byId = new Map(workspaces.map((workspace) => [workspace._id, workspace] as const));
  return {
    total: summary.total.unreadCount,
    personal: summary.personal.unreadCount,
    byStartup: summary.byStartup
      .filter((entry) => entry.unreadCount > 0 && byId.has(entry.workspaceId))
      .map((entry) => ({ workspace: byId.get(entry.workspaceId)!, unread: entry.unreadCount })),
  };
}

/** Strukturni oblik stavke `inbox.pending` (PROSTOR P22: `idea_vote`; stare vrste se više ne emituju). */
export type PendingItemLike =
  | {
      kind: "idea_vote";
      ideaId: string;
      title: string;
      authorName: string | null;
      upvotes: number;
      downvotes: number;
      workspace: WorkspaceMini;
    }
  | { kind: "deletion_vote"; ballotId: string; title: string; workspace: WorkspaceMini }
  | {
      kind: "page_nesting" | "idea_nesting";
      requestId: string;
      childTitle: string;
      parentTitle: string;
      requesterName: string | null;
      workspace: WorkspaceMini;
    };

/** Stare vrste (glasanje o brisanju, ugnežđavanje) se više ne prikazuju (K16). */
export function pendingSummary(pending: { items: ReadonlyArray<PendingItemLike>; truncated: boolean }): SidePending {
  return {
    items: pendingIdeaVotes(pending.items).map((item) => ({
      key: pendingKey(item),
      title: pendingTitle(item),
      workspace: item.workspace,
      ideaId: item.ideaId,
    })),
    truncated: pending.truncated,
  };
}

/** Broj za sažeti čip (< xl); `null` kad blok nije spreman. */
export function blockCount<T>(block: SideBlock<T>, count: (data: T) => number): number | null {
  return block.status === "ready" ? count(block.data) : null;
}
