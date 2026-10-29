// Preneto iz Devotion packages/shared/src/inbox.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Inbox (K14, plan K07 §1.5) — ČISTA logika koju dele web i telefon: grupisanje
 * po danima, izbor cilja za klik, argumenti upita po opsegu/segmentu, brojači,
 * tekstovi praznih stanja i stavke „Čeka tebe". Bez React-a i bez Convex tipova
 * (id-jevi su stringovi; klijent ih kastuje u `Id<...>` na ivici).
 */
import { formatNumber } from "../format";
import { addDaysToKey, dayKeyOf, formatClock, formatDayRelative } from "./dates";

// --- Segmenti i opseg --------------------------------------------------------

export type InboxSegment = "all" | "unread" | "pending";

/** Segmenti redom prikaza (plan K07 §3: „Sve" · „Nepročitano" · „Čeka tebe"). */
export const INBOX_SEGMENTS: ReadonlyArray<{ key: InboxSegment; label: string }> = [
  { key: "all", label: "Sve" },
  { key: "unread", label: "Nepročitano" },
  { key: "pending", label: "Čeka tebe" },
];

/** Čip opsega: svi, samo lično ili jedan startup. */
export type InboxScope =
  | { kind: "all" }
  | { kind: "personal" }
  | { kind: "startup"; workspaceId: string };

export function inboxScopeKey(scope: InboxScope): string {
  return scope.kind === "startup" ? `startup:${scope.workspaceId}` : scope.kind;
}

export type InboxFeedArgs = { workspaceId?: string | null; unreadOnly?: boolean };

/**
 * Argumenti `inbox.feed` (bez `paginationOpts`): „Lično" šalje `startupId: null`,
 * „Svi" izostavlja polje. Segment „Čeka tebe" ne koristi feed — vraća isto što i
 * „Sve" da hook može da bude uvek pretplaćen na istu listu.
 */
export function inboxFeedArgs(scope: InboxScope, segment: InboxSegment): InboxFeedArgs {
  const args: InboxFeedArgs = {};
  if (scope.kind === "personal") args.workspaceId = null;
  else if (scope.kind === "startup") args.workspaceId = scope.workspaceId;
  if (segment === "unread") args.unreadOnly = true;
  return args;
}

export type InboxMarkAllArgs = { workspaceId?: string | null };

/** Argumenti `inbox.markAllRead`: „Označi sve" poštuje čip opsega (K07 §1.5). */
export function inboxMarkAllArgs(scope: InboxScope): InboxMarkAllArgs {
  if (scope.kind === "personal") return { workspaceId: null };
  if (scope.kind === "startup") return { workspaceId: scope.workspaceId };
  return {};
}

/** Strukturni oblik odgovora `inbox.unreadCounts`. */
export type InboxCounts = {
  total: { count: number; capped: boolean };
  byStartup: ReadonlyArray<{ workspaceId: string; count: number; capped: boolean }>;
  personal: { count: number; capped: boolean };
};

/** Nepročitano u izabranom opsegu (`byStartup` nema startup bez nepročitanog → 0). */
export function inboxUnreadFor(
  counts: InboxCounts,
  scope: InboxScope,
): { count: number; capped: boolean } {
  if (scope.kind === "all") return counts.total;
  if (scope.kind === "personal") return counts.personal;
  const entry = counts.byStartup.find((item) => item.workspaceId === scope.workspaceId);
  return entry
    ? { count: entry.count, capped: entry.capped }
    : { count: 0, capped: counts.total.capped };
}

/**
 * Startupi u kojima ima nepročitanog — obaveštenja (`inbox.unreadCounts`) ili
 * poruka (`chat.unreadSummary`): tačka uz startup (P14). Web traka i telefonski
 * birač startupa čitaju isti skup; nepoznat brojač (`null`/`undefined`) se
 * preskače.
 */
export function startupsWithUnread(
  inbox: { byStartup: ReadonlyArray<{ workspaceId: string; count: number }> } | null | undefined,
  chat: { byStartup: ReadonlyArray<{ workspaceId: string; unreadCount: number }> } | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const entry of inbox?.byStartup ?? []) {
    if (entry.count > 0) ids.add(entry.workspaceId);
  }
  for (const entry of chat?.byStartup ?? []) {
    if (entry.unreadCount > 0) ids.add(entry.workspaceId);
  }
  return ids;
}

/** „12", a od 100 naviše ili kad je brojač odsečen „99+" (isto kao bedževi). */
export function inboxCountLabel(count: number, capped = false): string {
  return capped || count > 99 ? "99+" : String(count);
}

/** Reč uz broj: 1, 21 → „nepročitano"; 2–4, 22–24 → „nepročitana"; ostalo (i 11–14) → „nepročitanih". */
export function inboxUnreadWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "nepročitano";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "nepročitana";
  return "nepročitanih";
}

// --- Grupisanje po danima ----------------------------------------------------

export type InboxDayGroup<T> = {
  key: "today" | "yesterday" | "earlier";
  title: "Danas" | "Juče" | "Ranije";
  items: T[];
};

const DAY_GROUPS: ReadonlyArray<Pick<InboxDayGroup<never>, "key" | "title">> = [
  { key: "today", title: "Danas" },
  { key: "yesterday", title: "Juče" },
  { key: "earlier", title: "Ranije" },
];

/**
 * Grupiše stavke (najnovije prvo) na Danas / Juče / Ranije po lokalnom kalendarskom
 * danu (`zone` samo za testove i server). Redosled unutar grupe je ulazni; prazne
 * grupe se izostavljaju. Vreme iz budućnosti (razlika satova) pada u „Danas".
 */
export function groupInboxByDay<T extends { createdAt: number }>(
  items: ReadonlyArray<T>,
  now: number,
  zone?: string,
): InboxDayGroup<T>[] {
  const today = dayKeyOf(now, zone);
  const yesterday = addDaysToKey(today, -1);
  const buckets: Record<InboxDayGroup<T>["key"], T[]> = { today: [], yesterday: [], earlier: [] };
  for (const item of items) {
    const key = dayKeyOf(item.createdAt, zone);
    // Ključevi `YYYY-MM-DD` se porede leksikografski kao datumi.
    if (key >= today) buckets.today.push(item);
    else if (key === yesterday) buckets.yesterday.push(item);
    else buckets.earlier.push(item);
  }
  return DAY_GROUPS.filter((group) => buckets[group.key].length > 0).map((group) => ({
    ...group,
    items: buckets[group.key],
  }));
}

/** Vreme u redu: danas „09:12", juče „juče", ranije „uto 27. okt" (druga godina numerički). */
export function formatInboxTime(createdAt: number, now: number, zone?: string): string {
  return dayKeyOf(createdAt, zone) >= dayKeyOf(now, zone)
    ? formatClock(createdAt, zone)
    : formatDayRelative(createdAt, now, zone);
}

// --- Cilj klika --------------------------------------------------------------

/** Ono što `inboxTarget` čita iz stavke feed-a (ili iz „Čeka tebe"). */
export type InboxTargetItem = {
  targetType: string;
  targetId: string | null;
  /** `null` = lično obaveštenje (poruka iz ličnog razgovora). */
  workspaceId: string | null;
};

/**
 * Gde vodi klik na stavku:
 *  - startup obaveštenje → `startup` sa Id-jem startupa i klijent-neutralnom
 *    destinacijom (`notificationDestination`: ekran + entitet);
 *  - lična poruka → `personal-chat` (razgovor po id-ju, BEZ promene startupa;
 *    `channelId: null` otvara listu Poruka);
 *  - lično obaveštenje bilo kog drugog tipa → `none` (označi pročitano, ostani).
 */
export type InboxTarget<D> =
  | { kind: "startup"; workspaceId: string; destination: D }
  | { kind: "personal-chat"; channelId: string | null }
  | { kind: "none" };

/**
 * `resolve` je `notificationDestination` iz `convex/lib/notificationTarget.ts`
 * (JEDAN izvor istine za cilj obaveštenja, deli ga i push); prosleđuje ga
 * pozivalac jer shared ne uvozi backend.
 */
export function inboxTarget<D>(
  item: InboxTargetItem,
  resolve: (targetType: string, targetId: string | null, workspaceId: string | null) => D,
): InboxTarget<D> {
  if (item.workspaceId === null) {
    return item.targetType === "chat"
      ? { kind: "personal-chat", channelId: item.targetId }
      : { kind: "none" };
  }
  return {
    kind: "startup",
    workspaceId: item.workspaceId,
    destination: resolve(item.targetType, item.targetId, item.workspaceId),
  };
}

// --- „Čeka tebe" -------------------------------------------------------------

/**
 * Strukturni oblik stavke `inbox.pending`. PROSTOR P22: novi izvor je samo
 * `idea_vote` (ideja u fazi „Razmatra se" čeka moj glas; server je vraća uz
 * `include: ["idea_vote"]`); glasanja o brisanju i zahtevi za ugnežđavanje se
 * više ne emituju, ali ostaju u tipu zbog starih podataka.
 */
export type PendingItemLike =
  | {
      kind: "idea_vote";
      ideaId: string;
      title: string;
      authorName: string | null;
      upvotes: number;
      downvotes: number;
      workspace: { _id: string };
    }
  | {
      kind: "deletion_vote";
      ballotId: string;
      title: string;
      workspace: { _id: string };
    }
  | {
      kind: "page_nesting" | "idea_nesting";
      requestId: string;
      childTitle: string;
      parentTitle: string;
      requesterName: string | null;
      workspace: { _id: string };
    };

/** Tekst stavke „Čeka tebe" (plan K07 §3, Inbox). */
export function pendingTitle(item: PendingItemLike): string {
  if (item.kind === "idea_vote") return `Glasaj o ideji „${item.title}“`;
  if (item.kind === "deletion_vote") return `Brisanje: „${item.title}“`;
  const who = item.requesterName ?? "Neko";
  return `${who} predlaže da „${item.childTitle}“ pređe pod „${item.parentTitle}“`;
}

/** Stabilan ključ stavke (ideja, listić ili zahtev). */
export function pendingKey(item: PendingItemLike): string {
  if (item.kind === "idea_vote") return `idea_vote:${item.ideaId}`;
  return item.kind === "deletion_vote" ? `vote:${item.ballotId}` : `${item.kind}:${item.requestId}`;
}

/** Stavka traži glas (dugme „Glasaj"), za razliku od starog predloga („Pogledaj"). */
export function pendingIsVote(item: Pick<PendingItemLike, "kind">): boolean {
  return item.kind === "idea_vote" || item.kind === "deletion_vote";
}

/**
 * Stavke koje se crtaju (PROSTOR P22, K16): samo `idea_vote`. Stare vrste
 * (glasanje o brisanju, zahtev za ugnežđavanje) se više ne prikazuju ni kad
 * ih stari backend vrati.
 */
export function pendingIdeaVotes<T extends { kind: string }>(
  items: ReadonlyArray<T>,
): Array<Extract<T, { kind: "idea_vote" }>> {
  return items.filter((item): item is Extract<T, { kind: "idea_vote" }> => item.kind === "idea_vote");
}

/** „Čeka tebe" u izabranom opsegu: lično nikad nema odobrenja, startup filtrira. */
export function inboxPendingFor<T extends { workspace: { _id: string } }>(
  items: ReadonlyArray<T>,
  scope: InboxScope,
): T[] {
  if (scope.kind === "all") return [...items];
  if (scope.kind === "personal") return [];
  return items.filter((item) => item.workspace._id === scope.workspaceId);
}

// --- Tekstovi ----------------------------------------------------------------

export type InboxEmptyCopy = { title: string; description: string };

/** Prazno stanje po segmentu; sa čipom opsega kaže da je prazan baš taj opseg. */
export function inboxEmptyCopy(segment: InboxSegment, scope: InboxScope): InboxEmptyCopy {
  const filtered = scope.kind !== "all";
  if (segment === "unread") {
    return {
      title: "Nema nepročitanih obaveštenja",
      description: filtered
        ? "Za ovaj filter su sva obaveštenja pročitana."
        : "Nova obaveštenja će se pojaviti ovde.",
    };
  }
  if (segment === "pending") {
    return {
      title: "Niko ne čeka tvoju odluku",
      description:
        scope.kind === "personal"
          ? "Lične poruke nemaju ideje za glasanje. Izaberi „Svi“ ili projekat."
          : filtered
            ? "U ovom projektu ništa ne čeka tvoju odluku."
            : "Ideje koje tim razmatra stižu ovde.",
    };
  }
  return filtered
    ? { title: "Nema obaveštenja", description: "Za ovaj filter još nema obaveštenja." }
    : {
        title: "Inbox je prazan",
        description: "Obaveštenja iz svih projekata i ličnih poruka stižu ovde.",
      };
}

/** Poruka posle „Označi sve" (`inbox.markAllRead` vraća `marked` i `hasMore`). */
export function inboxMarkedMessage(result: { marked: number; hasMore: boolean }): string {
  if (result.marked === 0) return "Nema nepročitanih obaveštenja.";
  if (result.hasMore) return `Označeno je prvih ${formatNumber(result.marked)}, ostalo se označava.`;
  return `Označeno kao pročitano: ${formatNumber(result.marked)}.`;
}
