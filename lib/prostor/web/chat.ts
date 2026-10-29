// Preneto iz Devotion apps/web/lib/chat.ts (main @ c05c40f), SPAJANJE S15.
import type { FunctionReturnType } from "convex/server";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatClockTime, formatDate } from "../../format";

// Tipovi izvedeni iz backend povratnih vrednosti — jedan izvor istine.
export type ChatChannel = FunctionReturnType<typeof api.prostor.chat.listChannels>[number];
export type ChatMessage = FunctionReturnType<typeof api.prostor.chat.messages>["page"][number];
export type ChatChannelKind = ChatChannel["kind"];
export type ChatReaction = ChatMessage["reactions"][number];

/**
 * Član razgovora onoliko koliko ga chat komponente čitaju (pominjanja, imena
 * u porukama, avatar). Član projekta (`prostor.projekat.listMembers`) i član ličnog
 * razgovora (`chat.channelMembers`) oba odgovaraju ovom obliku.
 */
export type ChatMember = {
  profile: { _id: Id<"profiles">; displayName: string; avatarUrl: string | null };
};

/**
 * Segmenti liste razgovora u traženom redosledu: Opšte → kanali oblasti/custom
 * → diskusije (threadovi) → direktne poruke. Unutar segmenta backend već sortira
 * po `lastMessageAt` opadajuće.
 */
export const CHAT_SECTIONS = [
  { id: "general", label: "Opšte" },
  { id: "channels", label: "Kanali" },
  { id: "threads", label: "Diskusije" },
  { id: "direct", label: "Direktne" },
] as const;
export type ChatSectionId = (typeof CHAT_SECTIONS)[number]["id"];

/** Kojem segmentu liste pripada kanal date vrste. */
export function channelSection(kind: ChatChannelKind): ChatSectionId {
  switch (kind) {
    case "startup":
      return "general";
    case "area":
    case "custom":
      return "channels";
    case "thread":
    case "agent":
      return "threads";
    case "dm":
      return "direct";
  }
}

/** Prikazano ime kanala: DM nosi ime sagovornika, opšti kanal je „Opšte". */
export function channelDisplayName(channel: ChatChannel): string {
  if (channel.kind === "dm") {
    return channel.otherParticipant?.displayName ?? "Direktna poruka";
  }
  if (channel.kind === "startup") return channel.name || "Opšte";
  return channel.name || "Razgovor";
}

/** Curirani brzi set reakcija (bez emoji biblioteke). */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏", "🔥"] as const;

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isTodayTs(ts: number): boolean {
  return isSameCalendarDay(new Date(ts), new Date());
}

export function isYesterdayTs(ts: number): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameCalendarDay(new Date(ts), yesterday);
}

export function sameDay(a: number, b: number): boolean {
  return isSameCalendarDay(new Date(a), new Date(b));
}

/** Vreme poruke: „14:07" (`lib/format`, čitaočeva vremenska zona). */
export function formatMessageTime(ts: number): string {
  return formatClockTime(ts);
}

/** Labela dnevnog separatora: „Danas" / „Juče" / datum („27. 10. 2026."). */
export function formatDaySeparator(ts: number): string {
  if (isTodayTs(ts)) return "Danas";
  if (isYesterdayTs(ts)) return "Juče";
  return formatDate(ts);
}

/** Srpska množina za „poruka": 1 poruka · 2–4 poruke · 5+ poruka. */
export function porukaWord(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return "poruka";
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return "poruke";
  }
  return "poruka";
}

/**
 * Da li dve uzastopne poruke dele zaglavlje autora (grupisanje). Uslov: isti
 * autor, obe nesistemske, u razmaku kraćem od 5 minuta.
 */
const GROUP_WINDOW_MS = 5 * 60 * 1_000;
export function shouldGroupWithPrevious(
  message: ChatMessage,
  previous: ChatMessage | undefined,
): boolean {
  if (previous === undefined) return false;
  if (message.authorProfileId === null || previous.authorProfileId === null) {
    return false;
  }
  return (
    message.authorProfileId === previous.authorProfileId &&
    message.createdAt - previous.createdAt < GROUP_WINDOW_MS &&
    sameDay(message.createdAt, previous.createdAt)
  );
}

/**
 * Deli telo poruke na segmente teksta i pominjanja radi isticanja. Pominjanje se
 * prepoznaje kao `@Ime` gde `Ime` odgovara prikazanom imenu nekog od pomenutih
 * profila (`message.mentions`). Duža imena imaju prednost kod poklapanja.
 */
export type MessageSegment =
  | { kind: "text"; value: string }
  | { kind: "mention"; value: string };

export function splitMentions(
  body: string,
  mentionNames: string[],
): MessageSegment[] {
  const names = [...new Set(mentionNames.filter((name) => name.trim().length > 0))]
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return [{ kind: "text", value: body }];

  const escaped = names.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const regex = new RegExp(`@(?:${escaped.join("|")})`, "g");

  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(regex)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ kind: "text", value: body.slice(lastIndex, start) });
    }
    segments.push({ kind: "mention", value: match[0] });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < body.length) {
    segments.push({ kind: "text", value: body.slice(lastIndex) });
  }
  return segments;
}

/**
 * Izvlači id-jeve pomenutih profila iz teksta poruke pri slanju: član je pomenut
 * ako se `@Ime` (njegovo prikazano ime) pojavljuje kao ceo token. Negativni
 * lookahead sprečava da `@Ana` upadne u `@Anastasija`.
 */
export function resolveMentions(
  body: string,
  members: Array<{ profile: { _id: Id<"profiles">; displayName: string } }>,
): Id<"profiles">[] {
  const ids: Id<"profiles">[] = [];
  for (const { profile } of members) {
    const name = profile.displayName?.trim();
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`@${escaped}(?![\\p{L}\\p{N}_])`, "u");
    if (regex.test(body)) ids.push(profile._id);
  }
  return ids;
}

/** Trajanje glasovne poruke: „0:07" / „1:23"; „—" kad trajanje nije zabeleženo. */
export function formatVoiceDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.max(0, Math.round(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
