// Preneto iz Devotion apps/web/components/me/shell/scope.ts (main @ c05c40f), SPAJANJE S09.
/**
 * Opseg ljuske (traka i mobilni red opsega) — ČISTO (vitest).
 */
import type { Id } from "../../../convex/_generated/dataModel";
import { startupsWithUnread } from "../inbox";

/** Projekat na traci opsega (ime iz Devotiona ostaje zbog ostalih fajlova trake). */
export type RailStartup = { id: Id<"workspaces">; name: string; logoUrl: string | null };

export type RailScope = { kind: "me" } | { kind: "projekat"; workspaceId: string };

export type RailBadges = {
  /** Bedž „Ja" (P14); `null` dok brojači nisu poznati. */
  me: number | null;
  meCapped: boolean;
  /** Tačka na pločici projekta kad u njemu ima nepročitanog. */
  startupDots: Record<string, boolean>;
};

/** Srpska množina: 1, 21… → one; 2–4, 22–24… → few; ostalo (i 11–14) → many. */
function pluralForm(count: number): "one" | "few" | "many" {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
  return "many";
}

/**
 * „1 nepročitano", „3 nepročitana", „12 nepročitanih", „više od 99
 * nepročitanih" — za čitač ekrana uz bedževe.
 */
export function unreadPhrase(count: number, capped = false): string {
  if (capped || count > 99) return "više od 99 nepročitanih";
  const form = pluralForm(count);
  return `${count} ${form === "one" ? "nepročitano" : form === "few" ? "nepročitana" : "nepročitanih"}`;
}

/** „1 nepročitana poruka", „3 nepročitane poruke", „7 nepročitanih poruka". */
export function unreadMessagesPhrase(count: number, capped = false): string {
  if (capped || count > 99) return "više od 99 nepročitanih poruka";
  const form = pluralForm(count);
  return form === "one"
    ? `${count} nepročitana poruka`
    : form === "few"
      ? `${count} nepročitane poruke`
      : `${count} nepročitanih poruka`;
}

/** Ključ stavke trake (`data-rail-key`). */
export function railKey(scope: RailScope): string {
  return scope.kind === "me" ? "me" : scope.workspaceId;
}

/**
 * Smer kretanja kroz traku: +1 kad je nova stavka niže („Ja" je prva),
 * −1 kad je više, 0 kad je ista ili nepoznata.
 */
export function railDirection(
  previous: RailScope | null,
  next: RailScope,
  workspaceOrder: ReadonlyArray<string>,
): -1 | 0 | 1 {
  if (previous === null) return 0;
  // „Ja" = 0, projekti 1…n redom trake; nepoznat projekat = −1.
  const index = (scope: RailScope) =>
    scope.kind === "me" ? 0 : (workspaceOrder.indexOf(scope.workspaceId) + 1 || -1);
  const from = index(previous);
  const to = index(next);
  if (from === -1 || to === -1) return 0;
  return to > from ? 1 : to < from ? -1 : 0;
}

type UnreadCounts = {
  total: { count: number; capped: boolean };
  byStartup: ReadonlyArray<{ workspaceId: string; count: number }>;
};

type ChatUnread = {
  total: { unreadCount: number };
  byStartup: ReadonlyArray<{ workspaceId: string; unreadCount: number }>;
};

/**
 * Bedževi trake po P14: „Ja" = nepročitana obaveštenja (sva) + nepročitane
 * poruke (sve); tačka projekta = ima nepročitanog u tom projektu. Kad nijedan
 * brojač nije stigao (ili upit ne postoji), bedž se ne prikazuje.
 */
export function railBadges(
  inbox: UnreadCounts | undefined | null,
  chat: ChatUnread | undefined | null,
): RailBadges {
  const startupDots: Record<string, boolean> = {};
  for (const workspaceId of startupsWithUnread(inbox, chat)) startupDots[workspaceId] = true;
  if (!inbox && !chat) return { me: null, meCapped: false, startupDots };
  return {
    me: (inbox?.total.count ?? 0) + (chat?.total.unreadCount ?? 0),
    meCapped: inbox?.total.capped ?? false,
    startupDots,
  };
}
