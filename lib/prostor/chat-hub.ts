// Preneto iz Devotion packages/shared/src/chat-hub.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Poruke — hub svih razgovora (K15, plan K07 §1.6; E4) — ČISTA logika koju
 * dele web i telefon: grupisanje liste („Lično" pa startupi), sortiranje,
 * pretraga po imenu, kandidati za pominjanje po opsegu razgovora, tekstovi
 * zaglavlja i provera nacrta lične grupe. Bez React-a i bez Convex tipova
 * (id-jevi su stringovi; klijent ih kastuje u `Id<...>` na ivici).
 */
import { normalizeSearchText } from "./task-filters";
import type { WorkspaceMini } from "./task-row";

// --- Model -------------------------------------------------------------------

export type HubChannelKind = "startup" | "area" | "custom" | "thread" | "agent" | "dm";

export type HubPerson = { _id: string; displayName: string; avatarUrl: string | null };

/** Kanal iz `chat.listConversations` onoliko koliko hub čita. */
export type HubChannel = {
  _id: string;
  kind: HubChannelKind;
  name: string;
  /** `null` = lični razgovor (lični DM ili lična grupa). */
  workspaceId: string | null;
  lastMessageAt: number;
  lastMessagePreview: string;
  lastMessageAuthor?: HubPerson | null;
  unreadCount: number;
  mentionCount: number;
  notificationLevel: "all" | "mentions" | "none";
  otherParticipant: HubPerson | null;
};

export type HubStartupInput<C extends HubChannel = HubChannel> = {
  workspace: WorkspaceMini;
  unreadCount: number;
  mentionCount: number;
  channels: ReadonlyArray<C>;
};

/** Odgovor `chat.listConversations` (bez `capped`). */
export type HubInput<C extends HubChannel = HubChannel> = {
  personal: ReadonlyArray<C>;
  workspaces: ReadonlyArray<HubStartupInput<C>>;
};

export type HubGroup<C extends HubChannel = HubChannel> = {
  /** `"licno"` ili `"startup:<id>"` — stabilan ključ za sklapanje i React. */
  key: string;
  title: string;
  /** `null` = grupa „Lično". */
  workspace: WorkspaceMini | null;
  /** Nepročitano u CELOJ grupi (ne samo u kanalima koji su prošli pretragu). */
  unreadCount: number;
  mentionCount: number;
  /** Kanali grupe posle pretrage, najsvežiji prvi. */
  channels: C[];
  /** Grupa „Lično" se ne sklapa; startupi da. */
  collapsible: boolean;
  /** Sklopljena grupa ne prikazuje redove. Dok traje pretraga, ništa nije sklopljeno. */
  collapsed: boolean;
};

export const PERSONAL_HUB_KEY = "licno";
export const PERSONAL_HUB_TITLE = "Lično";

export function hubGroupKey(workspaceId: string | null): string {
  return workspaceId === null ? PERSONAL_HUB_KEY : `startup:${workspaceId}`;
}

// --- Ime, sortiranje, pretraga -----------------------------------------------

/** Prikazano ime razgovora: DM nosi ime sagovornika, opšti kanal je „Opšte". */
export function hubChannelName(channel: Pick<HubChannel, "kind" | "name" | "otherParticipant">): string {
  if (channel.kind === "dm") return channel.otherParticipant?.displayName || "Direktna poruka";
  if (channel.kind === "startup") return channel.name || "Opšte";
  return channel.name || "Razgovor";
}

/** Najsvežija poruka prva; isto vreme → ime (srpski redosled), pa id (stabilno). */
export function compareHubChannels(a: HubChannel, b: HubChannel): number {
  if (a.lastMessageAt !== b.lastMessageAt) return b.lastMessageAt - a.lastMessageAt;
  const byName = hubChannelName(a).localeCompare(hubChannelName(b), "sr-Latn");
  if (byName !== 0) return byName;
  return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
}

function haystack(parts: ReadonlyArray<string>): string {
  const normalized = normalizeSearchText(parts.join(" "));
  // „đ" → i „dj" i „d", da „Dordevic" i „Djordjevic" oba nađu „Đorđević".
  return normalized.includes("dj") ? `${normalized} ${normalized.replace(/dj/g, "d")}` : normalized;
}

function queryTerms(query: string): string[] {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

/**
 * Pretraga po imenu razgovora (i imenu startupa za kanale startupa): sve reči
 * upita moraju da se nađu, bez obzira na veličinu slova i dijakritike.
 */
export function matchesHubQuery(channel: HubChannel, query: string, startupName: string | null): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const text = haystack([hubChannelName(channel), startupName ?? ""]);
  return terms.every((term) => text.includes(term));
}

// --- Grupisanje ---------------------------------------------------------------

export type HubGroupOptions = {
  query?: string;
  /** Ključevi sklopljenih grupa (`hubGroupKey`). */
  collapsed?: ReadonlySet<string>;
  /** Startup bez ijednog kanala se ne prikazuje (plan K07 §1.6). Podrazumevano da. */
  hideEmptyStartups?: boolean;
};

function sum<C extends HubChannel>(channels: ReadonlyArray<C>, field: "unreadCount" | "mentionCount"): number {
  return channels.reduce((total, channel) => total + channel[field], 0);
}

/**
 * Grupe liste: „Lično" prva (samo kad ima razgovora), pa startupi po najsvežijem
 * kanalu (isto vreme → redosled ulaza). Pretraga filtrira kanale i izbacuje
 * grupe bez pogodaka, a dok traje ne sklapa ništa (pogodak se mora videti).
 */
export function hubGroups<C extends HubChannel>(input: HubInput<C>, options: HubGroupOptions = {}): HubGroup<C>[] {
  const query = options.query ?? "";
  const searching = queryTerms(query).length > 0;
  const collapsed = options.collapsed ?? new Set<string>();
  const hideEmpty = options.hideEmptyStartups ?? true;
  const groups: HubGroup<C>[] = [];

  const personal = [...input.personal]
    .filter((channel) => matchesHubQuery(channel, query, null))
    .sort(compareHubChannels);
  if (personal.length > 0) {
    groups.push({
      key: PERSONAL_HUB_KEY,
      title: PERSONAL_HUB_TITLE,
      workspace: null,
      unreadCount: sum(input.personal, "unreadCount"),
      mentionCount: sum(input.personal, "mentionCount"),
      channels: personal,
      collapsible: false,
      collapsed: false,
    });
  }

  const freshest = (channels: ReadonlyArray<C>) =>
    channels.reduce((latest, channel) => Math.max(latest, channel.lastMessageAt), -1);
  const workspaces = input.workspaces
    .map((group, index) => ({ group, index, freshest: freshest(group.channels) }))
    .sort((a, b) => b.freshest - a.freshest || a.index - b.index);

  for (const { group } of workspaces) {
    if (hideEmpty && group.channels.length === 0) continue;
    const channels = [...group.channels]
      .filter((channel) => matchesHubQuery(channel, query, group.workspace.name))
      .sort(compareHubChannels);
    if (searching && channels.length === 0) continue;
    const key = hubGroupKey(group.workspace._id);
    groups.push({
      key,
      title: group.workspace.name,
      workspace: group.workspace,
      unreadCount: group.unreadCount,
      mentionCount: group.mentionCount,
      channels,
      collapsible: true,
      collapsed: !searching && collapsed.has(key),
    });
  }
  return groups;
}

/** Hub bez ijednog razgovora (ni ličnog, ni kanala u startupima). */
export function hubIsEmpty(input: HubInput): boolean {
  return input.personal.length === 0 && input.workspaces.every((group) => group.channels.length === 0);
}

/** Id-jevi redova kroz koje se kreće strelicama: redom prikaza, bez sklopljenih grupa. */
export function hubNavigableIds(groups: ReadonlyArray<HubGroup>): string[] {
  return groups.flatMap((group) => (group.collapsed ? [] : group.channels.map((channel) => channel._id)));
}

/** Kanal iz huba po id-ju (bilo kog opsega) ili `null`. */
export function findHubChannel<C extends HubChannel>(input: HubInput<C>, channelId: string): C | null {
  const personal = input.personal.find((channel) => channel._id === channelId);
  if (personal) return personal;
  for (const group of input.workspaces) {
    const found = group.channels.find((channel) => channel._id === channelId);
    if (found) return found;
  }
  return null;
}

/** Zbir nepročitanog u hubu (lično + svi startupi). */
export function hubUnreadTotal(input: HubInput): { unreadCount: number; mentionCount: number } {
  return input.workspaces.reduce(
    (total, group) => ({
      unreadCount: total.unreadCount + group.unreadCount,
      mentionCount: total.mentionCount + group.mentionCount,
    }),
    { unreadCount: sum(input.personal, "unreadCount"), mentionCount: sum(input.personal, "mentionCount") },
  );
}

// --- Tekst reda i zaglavlja ---------------------------------------------------

/**
 * Pregled poslednje poruke u redu: „Ti: …" za moju poruku, „Ime: …" u grupi i
 * kanalu (u DM-u je autor očigledan), „Bez poruka" kad pregled ne postoji.
 */
export function hubRowPreview(channel: HubChannel, meId: string | null): string {
  const preview = channel.lastMessagePreview.trim();
  if (preview.length === 0) return "Bez poruka";
  const author = channel.lastMessageAuthor ?? null;
  if (author === null) return preview;
  if (meId !== null && author._id === meId) return `Ti: ${preview}`;
  if (channel.kind === "dm") return preview;
  const firstName = author.displayName.trim().split(/\s+/)[0];
  return firstName ? `${firstName}: ${preview}` : preview;
}

/** „1 član" · „2 člana" · „5 članova" · „11 članova" · „21 član". */
export function clanWord(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return "član";
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return "člana";
  return "članova";
}

/** Podnaslov ličnog razgovora: „Lična poruka" / „Lična grupa · 3 člana". */
export function personalSubtitle(kind: HubChannelKind, memberCount: number | null): string {
  if (kind === "dm") return "Lična poruka";
  return memberCount === null ? "Lična grupa" : `Lična grupa · ${memberCount} ${clanWord(memberCount)}`;
}

/** „1 nepročitana poruka" · „3 nepročitane poruke" · „5 nepročitanih poruka" (čitač ekrana). */
export function hubUnreadLabel(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return `${count} nepročitana poruka`;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} nepročitane poruke`;
  return `${count} nepročitanih poruka`;
}

/** „1 pominjanje" · „2 pominjanja" · „21 pominjanje" (čitač ekrana). */
export function hubMentionLabel(count: number): string {
  const absolute = Math.abs(count);
  return absolute % 10 === 1 && absolute % 100 !== 11 ? `${count} pominjanje` : `${count} pominjanja`;
}

// --- Pominjanja ----------------------------------------------------------------

export type MentionMember = { profile: { _id: string; displayName: string } };

/**
 * Opseg razgovora za pominjanje: lični razgovor nudi SAMO članove tog razgovora
 * (`chat.channelMembers`; server odbija druge), kanal startupa nudi članove
 * startupa (`startups.listMembers`).
 */
export type MentionScope<M extends MentionMember> =
  | { kind: "personal"; members: ReadonlyArray<M> }
  | { kind: "startup"; members: ReadonlyArray<M> };

/**
 * Ko se nudi posle `@`. Lični razgovor: članovi bez mene, bez duplikata i bez
 * praznog imena, po imenu (srpski redosled). Startup: spisak NEPROMENJEN
 * (redosled servera, uključujući mene) — `view=chat` radi kao i pre K15.
 */
export function mentionCandidates<M extends MentionMember>(scope: MentionScope<M>, me: string): M[] {
  if (scope.kind === "startup") return [...scope.members];
  const seen = new Set<string>();
  const result: M[] = [];
  for (const member of scope.members) {
    const id = member.profile._id;
    if (id === me || seen.has(id) || member.profile.displayName.trim().length === 0) continue;
    seen.add(id);
    result.push(member);
  }
  return result.sort((a, b) => a.profile.displayName.localeCompare(b.profile.displayName, "sr-Latn"));
}

/** Opseg pominjanja po kanalu: `startupId === null` je lični razgovor. */
export function mentionScopeFor<M extends MentionMember>(
  channel: { workspaceId: string | null },
  members: ReadonlyArray<M>,
): MentionScope<M> {
  return channel.workspaceId === null ? { kind: "personal", members } : { kind: "startup", members };
}

// --- Ljudi i lična grupa -----------------------------------------------------

/** Ista granica kao server (`chat.createPersonalGroup`, `MAX_CHANNEL_NAME_LENGTH`). */
export const GROUP_NAME_MAX = 120;
/** Grupa ima najviše 50 članova sa vlasnikom (`MAX_CHAT_CHANNEL_MEMBERS`). */
export const GROUP_MEMBERS_MAX = 50;
export const GROUP_OTHER_MEMBERS_MAX = GROUP_MEMBERS_MAX - 1;

/** Ljudi po imenu: sve reči upita, bez dijakritika. */
export function filterPeople<P extends { displayName: string }>(people: ReadonlyArray<P>, query: string): P[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [...people];
  return people.filter((person) => {
    const text = haystack([person.displayName]);
    return terms.every((term) => text.includes(term));
  });
}

/** Podnaslov osobe u „Nova poruka": „Zajedno: A, B" ili „Bez zajedničkog startupa". */
export function sharedStartupsLabel(names: ReadonlyArray<string>): string {
  return names.length === 0 ? "Bez zajedničkog projekta" : `Zajedno: ${names.join(", ")}`;
}

/** „Članovi (3/49)" — broje se drugi članovi, vlasnik je uvek tu. */
export function groupMembersLabel(otherCount: number): string {
  return `Članovi (${otherCount}/${GROUP_OTHER_MEMBERS_MAX})`;
}

/**
 * Šta sprečava „Napravi grupu" / „Sačuvaj" — isti tekst kao serverske greške
 * (`cleanRequiredText`, `groupSizeError`), da korisnik ne vidi dve poruke za
 * istu granicu. `null` = nacrt je ispravan.
 */
export function groupDraftProblem(draft: { name: string; otherCount: number }): string | null {
  const name = draft.name.trim();
  if (name.length === 0) return "Naziv grupe je obavezno polje.";
  if (name.length > GROUP_NAME_MAX) return `Naziv grupe može imati najviše ${GROUP_NAME_MAX} znakova.`;
  if (draft.otherCount < 1) return "Grupi treba bar još jedan član.";
  if (draft.otherCount > GROUP_OTHER_MEMBERS_MAX) return `Grupa može imati najviše ${GROUP_MEMBERS_MAX} članova.`;
  return null;
}

// --- Dozvole u razgovoru (ogledalo serverskih gejtova, K06 D4) ---------------

export type ChatConversationPermissions = {
  /** Lični razgovor (`startupId === null`). */
  personal: boolean;
  /** „Arhiviraj razgovor": admin, kanal startupa, ne „Opšte" (`chat.archiveChannel`). */
  canArchive: boolean;
  /** „Članovi kanala": admin i kanal startupa vrste `custom` (`chat.setChannelMembers`). */
  canManageMembers: boolean;
  /** „Podešavanja grupe": samo lična grupa (ime i članove menja vlasnik, napušta svako). */
  canOpenGroupSettings: boolean;
};

/**
 * Šta meni razgovora nudi — isto pravilo kao server, da korisnik ne dobije
 * serversku grešku: lični razgovor se ne arhivira i nema admin-članstvo (D4),
 * grupom upravlja njen vlasnik kroz „Podešavanja grupe".
 */
export function chatConversationPermissions(
  role: string | null | undefined,
  channel: { workspaceId: string | null; kind: HubChannelKind },
): ChatConversationPermissions {
  const personal = channel.workspaceId === null;
  const admin = role === "admin";
  return {
    personal,
    canArchive: !personal && admin && channel.kind !== "startup",
    canManageMembers: !personal && admin && channel.kind === "custom",
    canOpenGroupSettings: personal && channel.kind === "custom",
  };
}

/**
 * Ogledalo `chat.deleteMessage`: autor briše svoju poruku; admin briše tuđe
 * samo u kanalima startupa (u ličnom razgovoru briše samo autor).
 */
export function canDeleteChatMessage(input: {
  isOwn: boolean;
  isAdmin: boolean;
  /** `startupId` poruke (`null` = lični razgovor). */
  workspaceId: string | null;
  deleted: boolean;
}): boolean {
  if (input.deleted) return false;
  return input.isOwn || (input.isAdmin && input.workspaceId !== null);
}
