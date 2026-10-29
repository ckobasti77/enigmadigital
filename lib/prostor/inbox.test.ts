// Preneto iz Devotion packages/shared/src/inbox.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { notificationDestination } from "../../convex/prostor/lib/notificationTarget";
import { noonOfDayKey, startOfDayKey } from "./dates";
import {
  formatInboxTime,
  groupInboxByDay,
  inboxCountLabel,
  inboxEmptyCopy,
  inboxFeedArgs,
  inboxMarkAllArgs,
  inboxMarkedMessage,
  inboxPendingFor,
  inboxScopeKey,
  inboxTarget,
  inboxUnreadFor,
  inboxUnreadWord,
  pendingIdeaVotes,
  pendingIsVote,
  pendingKey,
  pendingTitle,
  startupsWithUnread,
  type InboxCounts,
  type InboxScope,
  type PendingItemLike,
} from "./inbox";

const BG = "Europe/Belgrade";
const HOUR = 3_600_000;
const TODAY = "2026-10-24"; // subota
const at = (key: string, hour: number, minute = 0) =>
  startOfDayKey(key, BG) + hour * HOUR + minute * 60_000;
const NOW = at(TODAY, 10);

describe("groupInboxByDay", () => {
  test("Danas / Juče / Ranije po lokalnom danu, redosled ulaza ostaje", () => {
    const items = [
      { id: "a", createdAt: at(TODAY, 9, 12) },
      { id: "b", createdAt: at(TODAY, 1) },
      { id: "c", createdAt: at("2026-10-23", 23, 59) },
      { id: "d", createdAt: at("2026-10-23", 0) },
      { id: "e", createdAt: at("2026-10-22", 23, 59) },
      { id: "f", createdAt: at("2025-01-02", 12) },
    ];
    const groups = groupInboxByDay(items, NOW, BG);
    expect(groups.map((group) => [group.key, group.title, group.items.map((item) => item.id)])).toEqual([
      ["today", "Danas", ["a", "b"]],
      ["yesterday", "Juče", ["c", "d"]],
      ["earlier", "Ranije", ["e", "f"]],
    ]);
  });

  test("granica je lokalna ponoć: 23:59:59.999 je juče, 00:00 je danas", () => {
    const midnight = startOfDayKey(TODAY, BG);
    const groups = groupInboxByDay(
      [
        { id: "danas", createdAt: midnight },
        { id: "juce", createdAt: midnight - 1 },
      ],
      NOW,
      BG,
    );
    expect(groups.map((group) => group.key)).toEqual(["today", "yesterday"]);
  });

  test("prazne grupe se izostavljaju, prazna lista daje prazan niz", () => {
    expect(groupInboxByDay([], NOW, BG)).toEqual([]);
    const groups = groupInboxByDay([{ createdAt: at("2026-09-01", 12) }], NOW, BG);
    expect(groups.map((group) => group.key)).toEqual(["earlier"]);
  });

  test("vreme iz budućnosti (razlika satova) pada u Danas", () => {
    const groups = groupInboxByDay([{ createdAt: at("2026-10-25", 3) }], NOW, BG);
    expect(groups.map((group) => group.key)).toEqual(["today"]);
  });

  test("prelaz na zimsko vreme (25 h): juče ostaje juče", () => {
    const now = at("2026-10-26", 8);
    const groups = groupInboxByDay(
      [
        { id: "x", createdAt: at("2026-10-26", 0, 30) },
        { id: "y", createdAt: noonOfDayKey("2026-10-25", BG) },
        { id: "z", createdAt: at("2026-10-24", 23, 30) },
      ],
      now,
      BG,
    );
    expect(groups.map((group) => [group.key, group.items.map((item) => item.id)])).toEqual([
      ["today", ["x"]],
      ["yesterday", ["y"]],
      ["earlier", ["z"]],
    ]);
  });
});

describe("formatInboxTime", () => {
  test("danas sat, juče reč, ranije kratak datum, druga godina numerički", () => {
    expect(formatInboxTime(at(TODAY, 9, 12), NOW, BG)).toBe("09:12");
    expect(formatInboxTime(at("2026-10-23", 20), NOW, BG)).not.toBe("");
    expect(formatInboxTime(at("2026-10-23", 20), NOW, BG)).toBe("juče");
    expect(formatInboxTime(at("2026-10-20", 8), NOW, BG)).toBe("uto 20. okt");
    expect(formatInboxTime(at("2025-03-05", 8), NOW, BG)).toBe("05.03.2025.");
  });
});

describe("inboxTarget", () => {
  const startupItem = (targetType: string, targetId: string | null) => ({
    targetType,
    targetId,
    workspaceId: "s1",
  });

  test("page → stranica u startupu s entitetom", () => {
    expect(inboxTarget(startupItem("page", "p1"), notificationDestination)).toEqual({
      kind: "startup",
      workspaceId: "s1",
      destination: { screen: "page", scope: "startup", entityId: "p1", weekStart: null },
    });
  });

  test("page bez id-ja pada na komandni centar (today)", () => {
    const target = inboxTarget(startupItem("page", null), notificationDestination);
    expect(target).toMatchObject({ kind: "startup", destination: { screen: "today", entityId: null } });
  });

  test("chat u startupu nosi channelId i ostaje startup cilj", () => {
    expect(inboxTarget(startupItem("chat", "c1"), notificationDestination)).toEqual({
      kind: "startup",
      workspaceId: "s1",
      destination: { screen: "chat", scope: "startup", entityId: "c1", weekStart: null },
    });
  });

  test("ideas, approvals i puls", () => {
    expect(inboxTarget(startupItem("ideas", null), notificationDestination)).toMatchObject({
      kind: "startup",
      workspaceId: "s1",
      destination: { screen: "ideas", entityId: null },
    });
    expect(inboxTarget(startupItem("approvals", "r1"), notificationDestination)).toMatchObject({
      kind: "startup",
      workspaceId: "s1",
      destination: { screen: "approvals", entityId: null },
    });
    expect(inboxTarget(startupItem("puls", "1760000000000"), notificationDestination)).toMatchObject({
      kind: "startup",
      destination: { screen: "puls", weekStart: 1_760_000_000_000 },
    });
    expect(inboxTarget(startupItem("puls", null), notificationDestination)).toMatchObject({
      destination: { screen: "puls", weekStart: null },
    });
  });

  test("nepoznat targetType pada na komandni centar tog startupa", () => {
    expect(inboxTarget(startupItem("nesto-novo", "x"), notificationDestination)).toMatchObject({
      kind: "startup",
      workspaceId: "s1",
      destination: { screen: "today" },
    });
  });

  test("lična poruka otvara lični razgovor bez startupa", () => {
    expect(
      inboxTarget({ targetType: "chat", targetId: "c9", workspaceId: null }, notificationDestination),
    ).toEqual({ kind: "personal-chat", channelId: "c9" });
  });

  test("lična poruka bez id-ja otvara listu Poruka", () => {
    expect(
      inboxTarget({ targetType: "chat", targetId: null, workspaceId: null }, notificationDestination),
    ).toEqual({ kind: "personal-chat", channelId: null });
  });

  test("lično obaveštenje drugog tipa nema cilja (samo se označi pročitano)", () => {
    for (const targetType of ["page", "ideas", "approvals", "puls"]) {
      expect(
        inboxTarget({ targetType, targetId: "x", workspaceId: null }, notificationDestination),
      ).toEqual({ kind: "none" });
    }
  });

  test("resolve dobija startupId, pa scope razlikuje lično od startupa", () => {
    const seen: Array<string | null> = [];
    inboxTarget(startupItem("chat", "c1"), (_type, _id, workspaceId) => {
      seen.push(workspaceId);
      return null;
    });
    expect(seen).toEqual(["s1"]);
  });

  test("stavka „Čeka tebe“ vodi u odobrenja svog startupa", () => {
    expect(
      inboxTarget({ targetType: "approvals", targetId: "r7", workspaceId: "s2" }, notificationDestination),
    ).toMatchObject({ kind: "startup", workspaceId: "s2", destination: { screen: "approvals" } });
  });
});

describe("opseg i segment", () => {
  const all: InboxScope = { kind: "all" };
  const personal: InboxScope = { kind: "personal" };
  const workspace: InboxScope = { kind: "startup", workspaceId: "s1" };

  test("inboxFeedArgs: Svi bez polja, Lično null, startup Id; Nepročitano dodaje unreadOnly", () => {
    expect(inboxFeedArgs(all, "all")).toEqual({});
    expect(inboxFeedArgs(personal, "all")).toEqual({ workspaceId: null });
    expect(inboxFeedArgs(workspace, "all")).toEqual({ workspaceId: "s1" });
    expect(inboxFeedArgs(all, "unread")).toEqual({ unreadOnly: true });
    expect(inboxFeedArgs(personal, "unread")).toEqual({ workspaceId: null, unreadOnly: true });
    expect(inboxFeedArgs(workspace, "unread")).toEqual({ workspaceId: "s1", unreadOnly: true });
    // „Čeka tebe“ ne koristi feed: isti argumenti kao „Sve“.
    expect(inboxFeedArgs(workspace, "pending")).toEqual({ workspaceId: "s1" });
  });

  test("inboxMarkAllArgs poštuje čip", () => {
    expect(inboxMarkAllArgs(all)).toEqual({});
    expect(inboxMarkAllArgs(personal)).toEqual({ workspaceId: null });
    expect(inboxMarkAllArgs(workspace)).toEqual({ workspaceId: "s1" });
  });

  test("inboxScopeKey je stabilan i različit po opsegu", () => {
    expect(new Set([inboxScopeKey(all), inboxScopeKey(personal), inboxScopeKey(workspace)]).size).toBe(3);
  });

  const counts: InboxCounts = {
    total: { count: 7, capped: false },
    byStartup: [{ workspaceId: "s1", count: 5, capped: false }],
    personal: { count: 2, capped: false },
  };

  test("inboxUnreadFor: zbir, lično, startup sa i bez nepročitanog", () => {
    expect(inboxUnreadFor(counts, all)).toEqual({ count: 7, capped: false });
    expect(inboxUnreadFor(counts, personal)).toEqual({ count: 2, capped: false });
    expect(inboxUnreadFor(counts, workspace)).toEqual({ count: 5, capped: false });
    expect(inboxUnreadFor(counts, { kind: "startup", workspaceId: "s2" })).toEqual({
      count: 0,
      capped: false,
    });
    expect(
      inboxUnreadFor({ ...counts, total: { count: 300, capped: true } }, { kind: "startup", workspaceId: "s2" }),
    ).toEqual({ count: 0, capped: true });
  });

  test("inboxUnreadWord: srpska množina", () => {
    expect([1, 21, 101].map(inboxUnreadWord)).toEqual(["nepročitano", "nepročitano", "nepročitano"]);
    expect([2, 3, 4, 22, 24].map(inboxUnreadWord).every((word) => word === "nepročitana")).toBe(true);
    expect([0, 5, 11, 12, 13, 14, 20, 111].map(inboxUnreadWord).every((word) => word === "nepročitanih")).toBe(true);
  });

  test("inboxCountLabel: 99+ iznad 99 i kad je odsečeno", () => {
    expect(inboxCountLabel(0)).toBe("0");
    expect(inboxCountLabel(99)).toBe("99");
    expect(inboxCountLabel(100)).toBe("99+");
    expect(inboxCountLabel(4, true)).toBe("99+");
  });
});

describe("Čeka tebe", () => {
  const vote: PendingItemLike = {
    kind: "deletion_vote",
    ballotId: "b1",
    title: "Stari logo",
    workspace: { _id: "s1" },
  };
  const nesting: PendingItemLike = {
    kind: "page_nesting",
    requestId: "r1",
    childTitle: "Cenovnik",
    parentTitle: "Prodaja",
    requesterName: "Ana Ilić",
    workspace: { _id: "s2" },
  };
  const idea: PendingItemLike = {
    kind: "idea_vote",
    ideaId: "i1",
    title: "Novi meni",
    authorName: "Ana Ilić",
    upvotes: 2,
    downvotes: 1,
    workspace: { _id: "s1" },
  };

  test("idea_vote (PROSTOR P22): naslov, ključ i glasanje", () => {
    expect(pendingTitle(idea)).toBe("Glasaj o ideji „Novi meni“");
    expect(pendingKey(idea)).toBe("idea_vote:i1");
    expect(pendingIsVote(idea)).toBe(true);
    expect(pendingIsVote(vote)).toBe(true);
    expect(pendingIsVote(nesting)).toBe(false);
    expect(inboxPendingFor([idea, nesting], { kind: "startup", workspaceId: "s1" })).toEqual([idea]);
    expect(inboxPendingFor([idea], { kind: "personal" })).toEqual([]);
  });

  test("pendingIdeaVotes (K16): crtaju se samo ideje, stare vrste ispadaju", () => {
    expect(pendingIdeaVotes([vote, idea, nesting])).toEqual([idea]);
    expect(pendingIdeaVotes([vote, nesting])).toEqual([]);
    expect(pendingIdeaVotes([])).toEqual([]);
  });

  test("naslovi i ključevi", () => {
    expect(pendingTitle(vote)).toBe("Brisanje: „Stari logo“");
    expect(pendingTitle(nesting)).toBe("Ana Ilić predlaže da „Cenovnik“ pređe pod „Prodaja“");
    expect(pendingTitle({ ...nesting, kind: "idea_nesting", requesterName: null })).toBe(
      "Neko predlaže da „Cenovnik“ pređe pod „Prodaja“",
    );
    expect(pendingKey(vote)).toBe("vote:b1");
    expect(pendingKey(nesting)).toBe("page_nesting:r1");
    expect(pendingKey({ ...nesting, kind: "idea_nesting" })).toBe("idea_nesting:r1");
  });

  test("inboxPendingFor: svi, lično nikad, startup filtrira", () => {
    const items = [vote, nesting];
    expect(inboxPendingFor(items, { kind: "all" })).toEqual(items);
    expect(inboxPendingFor(items, { kind: "personal" })).toEqual([]);
    expect(inboxPendingFor(items, { kind: "startup", workspaceId: "s2" })).toEqual([nesting]);
    expect(inboxPendingFor(items, { kind: "startup", workspaceId: "s9" })).toEqual([]);
  });
});

describe("tekstovi", () => {
  test("prazno stanje po segmentu", () => {
    const all: InboxScope = { kind: "all" };
    expect(inboxEmptyCopy("all", all).title).toBe("Inbox je prazan");
    expect(inboxEmptyCopy("unread", all).title).toBe("Nema nepročitanih obaveštenja");
    expect(inboxEmptyCopy("pending", all).title).toBe("Niko ne čeka tvoju odluku");
    expect(inboxEmptyCopy("pending", all).description).toBe("Ideje koje tim razmatra stižu ovde.");
  });

  test("prazno stanje sa čipom kaže da je prazan taj opseg", () => {
    const workspace: InboxScope = { kind: "startup", workspaceId: "s1" };
    expect(inboxEmptyCopy("all", workspace).title).toBe("Nema obaveštenja");
    expect(inboxEmptyCopy("pending", workspace).description).toBe("U ovom projektu ništa ne čeka tvoju odluku.");
    expect(inboxEmptyCopy("pending", { kind: "personal" }).description).toContain("Lične poruke");
  });

  test("poruka posle „Označi sve“", () => {
    expect(inboxMarkedMessage({ marked: 0, hasMore: false })).toBe("Nema nepročitanih obaveštenja.");
    expect(inboxMarkedMessage({ marked: 12, hasMore: false })).toBe("Označeno kao pročitano: 12.");
    expect(inboxMarkedMessage({ marked: 200, hasMore: true })).toBe(
      "Označeno je prvih 200, ostalo se označava.",
    );
  });
});

describe("startupsWithUnread (tačka startupa, P14)", () => {
  test("startup ulazi kad ima nepročitano obaveštenje ILI poruku; nula se preskače", () => {
    const ids = startupsWithUnread(
      {
        byStartup: [
          { workspaceId: "s1", count: 2 },
          { workspaceId: "s2", count: 0 },
        ],
      },
      {
        byStartup: [
          { workspaceId: "s2", unreadCount: 0 },
          { workspaceId: "s3", unreadCount: 4 },
          { workspaceId: "s1", unreadCount: 1 },
        ],
      },
    );
    expect([...ids].sort()).toEqual(["s1", "s3"]);
  });

  test("nepoznat brojač (učitavanje ili greška) se preskače", () => {
    expect(startupsWithUnread(undefined, null).size).toBe(0);
    expect([...startupsWithUnread(null, { byStartup: [{ workspaceId: "s9", unreadCount: 1 }] })]).toEqual([
      "s9",
    ]);
  });
});
