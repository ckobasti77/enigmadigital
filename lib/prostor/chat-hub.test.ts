// Preneto iz Devotion packages/shared/src/chat-hub.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { MAX_CHAT_CHANNEL_MEMBERS } from "../../convex/prostor/lib/validators";
import {
  canDeleteChatMessage,
  chatConversationPermissions,
  clanWord,
  compareHubChannels,
  filterPeople,
  findHubChannel,
  GROUP_MEMBERS_MAX,
  GROUP_NAME_MAX,
  GROUP_OTHER_MEMBERS_MAX,
  groupDraftProblem,
  groupMembersLabel,
  hubChannelName,
  hubGroupKey,
  hubGroups,
  hubIsEmpty,
  hubMentionLabel,
  hubNavigableIds,
  hubRowPreview,
  hubUnreadLabel,
  hubUnreadTotal,
  matchesHubQuery,
  mentionCandidates,
  mentionScopeFor,
  PERSONAL_HUB_KEY,
  personalSubtitle,
  sharedStartupsLabel,
  type HubChannel,
  type HubInput,
} from "./chat-hub";

const ME = "p-jovan";
const milica = { _id: "p-milica", displayName: "Milica Jovanović", avatarUrl: null };
const luka = { _id: "p-luka", displayName: "Luka Đorđević", avatarUrl: null };

function channel(over: Partial<HubChannel> & Pick<HubChannel, "_id">): HubChannel {
  return {
    kind: "custom",
    name: "",
    workspaceId: null,
    lastMessageAt: 0,
    lastMessagePreview: "",
    lastMessageAuthor: null,
    unreadCount: 0,
    mentionCount: 0,
    notificationLevel: "all",
    otherParticipant: null,
    ...over,
  };
}

const cluck = { _id: "s-cluck", name: "Cluck Rush", logoUrl: null };
const scan = { _id: "s-scan", name: "Scan Me", logoUrl: null };
const enigma = { _id: "s-enigma", name: "Enigma IT", logoUrl: null };

const dmMilica = channel({ _id: "c-dm", kind: "dm", otherParticipant: milica, lastMessageAt: 500, unreadCount: 2 });
const groupVikend = channel({ _id: "c-vikend", kind: "custom", name: "Vikend plan", lastMessageAt: 300, mentionCount: 1, unreadCount: 1 });
const dmLuka = channel({ _id: "c-luka", kind: "dm", otherParticipant: luka, lastMessageAt: 100 });
const cluckGeneral = channel({ _id: "c-cluck-op", kind: "startup", name: "", workspaceId: cluck._id, lastMessageAt: 400, unreadCount: 3 });
const cluckMarketing = channel({ _id: "c-cluck-mk", kind: "area", name: "Marketing", workspaceId: cluck._id, lastMessageAt: 450, unreadCount: 2 });
const scanGeneral = channel({ _id: "c-scan-op", kind: "startup", name: "Opšte", workspaceId: scan._id, lastMessageAt: 900 });

const INPUT: HubInput = {
  personal: [dmLuka, groupVikend, dmMilica],
  workspaces: [
    { workspace: cluck, unreadCount: 5, mentionCount: 0, channels: [cluckGeneral, cluckMarketing] },
    { workspace: enigma, unreadCount: 0, mentionCount: 0, channels: [] },
    { workspace: scan, unreadCount: 0, mentionCount: 0, channels: [scanGeneral] },
  ],
};

describe("hubChannelName i ključevi", () => {
  test("DM nosi ime sagovornika, opšti kanal „Opšte“, ostalo svoje ime", () => {
    expect(hubChannelName(dmMilica)).toBe("Milica Jovanović");
    expect(hubChannelName(channel({ _id: "x", kind: "dm" }))).toBe("Direktna poruka");
    expect(hubChannelName(cluckGeneral)).toBe("Opšte");
    expect(hubChannelName(cluckMarketing)).toBe("Marketing");
    expect(hubChannelName(channel({ _id: "y", kind: "thread" }))).toBe("Razgovor");
  });

  test("ključ grupe: lično i startup", () => {
    expect(hubGroupKey(null)).toBe(PERSONAL_HUB_KEY);
    expect(hubGroupKey("s-1")).toBe("startup:s-1");
  });
});

describe("sortiranje", () => {
  test("najsvežije prvo; isto vreme → ime po srpskom redosledu, pa id", () => {
    const a = channel({ _id: "b", name: "Čaj", lastMessageAt: 10 });
    const b = channel({ _id: "a", name: "Cvet", lastMessageAt: 10 });
    const c = channel({ _id: "c", name: "Zeta", lastMessageAt: 20 });
    const d = channel({ _id: "d", name: "Cvet", lastMessageAt: 10 });
    expect([a, b, c, d].sort(compareHubChannels).map((item) => item._id)).toEqual(["c", "a", "d", "b"]);
  });
});

describe("hubGroups — grupisanje i sortiranje liste", () => {
  test("„Lično“ prvo, pa startupi po najsvežijem kanalu; kanali najsvežiji prvi; prazan startup se ne vidi", () => {
    const groups = hubGroups(INPUT);
    expect(groups.map((group) => group.key)).toEqual([PERSONAL_HUB_KEY, "startup:s-scan", "startup:s-cluck"]);
    expect(groups[0]).toMatchObject({ title: "Lično", workspace: null, collapsible: false, collapsed: false });
    expect(groups[0].channels.map((item) => item._id)).toEqual(["c-dm", "c-vikend", "c-luka"]);
    expect(groups[2].channels.map((item) => item._id)).toEqual(["c-cluck-mk", "c-cluck-op"]);
    expect(groups[2]).toMatchObject({ title: "Cluck Rush", workspace: cluck, collapsible: true });
  });

  test("nepročitano grupe: lično je zbir kanala, startup dolazi sa servera", () => {
    const groups = hubGroups(INPUT);
    expect(groups[0]).toMatchObject({ unreadCount: 3, mentionCount: 1 });
    expect(groups.find((group) => group.key === "startup:s-cluck")).toMatchObject({ unreadCount: 5 });
  });

  test("bez ličnih razgovora grupa „Lično“ ne postoji", () => {
    const groups = hubGroups({ ...INPUT, personal: [] });
    expect(groups.map((group) => group.key)).toEqual(["startup:s-scan", "startup:s-cluck"]);
  });

  test("prazan startup ostaje kad se to traži", () => {
    const groups = hubGroups(INPUT, { hideEmptyStartups: false });
    expect(groups.map((group) => group.key)).toContain("startup:s-enigma");
  });

  test("isto vreme poslednje poruke čuva redosled servera", () => {
    const tie: HubInput = {
      personal: [],
      workspaces: [
        { workspace: cluck, unreadCount: 0, mentionCount: 0, channels: [channel({ _id: "1", workspaceId: cluck._id, lastMessageAt: 7 })] },
        { workspace: scan, unreadCount: 0, mentionCount: 0, channels: [channel({ _id: "2", workspaceId: scan._id, lastMessageAt: 7 })] },
      ],
    };
    expect(hubGroups(tie).map((group) => group.title)).toEqual(["Cluck Rush", "Scan Me"]);
  });

  test("sklopljena grupa nosi zastavicu i ispada iz kretanja strelicama; „Lično“ se ne sklapa", () => {
    const collapsed = new Set(["startup:s-cluck", PERSONAL_HUB_KEY]);
    const groups = hubGroups(INPUT, { collapsed });
    expect(groups.find((group) => group.key === "startup:s-cluck")?.collapsed).toBe(true);
    expect(groups[0].collapsed).toBe(false);
    expect(hubNavigableIds(groups)).toEqual(["c-dm", "c-vikend", "c-luka", "c-scan-op"]);
  });

  test("ulaz se ne menja", () => {
    const before = JSON.stringify(INPUT);
    hubGroups(INPUT, { query: "mil", collapsed: new Set(["startup:s-scan"]) });
    expect(JSON.stringify(INPUT)).toBe(before);
  });
});

describe("pretraga po imenu", () => {
  test("bez dijakritika, bez obzira na veličinu slova, sve reči", () => {
    expect(matchesHubQuery(dmMilica, "milica", null)).toBe(true);
    expect(matchesHubQuery(dmMilica, "JOVANOVIC", null)).toBe(true);
    expect(matchesHubQuery(dmMilica, "milica petrovic", null)).toBe(false);
    expect(matchesHubQuery(dmLuka, "dordevic", null)).toBe(true);
    expect(matchesHubQuery(dmLuka, "djordjevic", null)).toBe(true);
    expect(matchesHubQuery(dmLuka, "   ", null)).toBe(true);
  });

  test("kanal startupa se nalazi i po imenu startupa", () => {
    expect(matchesHubQuery(cluckMarketing, "cluck", "Cluck Rush")).toBe(true);
    expect(matchesHubQuery(cluckGeneral, "cluck opste", "Cluck Rush")).toBe(true);
    expect(matchesHubQuery(cluckGeneral, "scan", "Cluck Rush")).toBe(false);
  });

  test("filter liste: grupe bez pogodaka nestaju, sklopljeno se otvara dok traje pretraga", () => {
    const groups = hubGroups(INPUT, { query: "opšte", collapsed: new Set(["startup:s-cluck"]) });
    expect(groups.map((group) => group.key)).toEqual(["startup:s-scan", "startup:s-cluck"]);
    expect(groups.every((group) => !group.collapsed)).toBe(true);
    expect(groups[1].channels.map((item) => item._id)).toEqual(["c-cluck-op"]);
    // Nepročitano grupe ostaje za celu grupu, ne samo za pogotke.
    expect(groups[1].unreadCount).toBe(5);
  });

  test("upit bez pogotka daje praznu listu", () => {
    expect(hubGroups(INPUT, { query: "nepostoji" })).toEqual([]);
  });

  test("lično po imenu sagovornika i imenu grupe", () => {
    expect(hubGroups(INPUT, { query: "vikend" }).flatMap((group) => group.channels.map((item) => item._id))).toEqual(["c-vikend"]);
  });
});

describe("pomoćne funkcije huba", () => {
  test("prazan hub, traženje kanala, zbir nepročitanog", () => {
    expect(hubIsEmpty(INPUT)).toBe(false);
    expect(hubIsEmpty({ personal: [], workspaces: [{ workspace: enigma, unreadCount: 0, mentionCount: 0, channels: [] }] })).toBe(true);
    expect(findHubChannel(INPUT, "c-scan-op")?._id).toBe("c-scan-op");
    expect(findHubChannel(INPUT, "c-vikend")?._id).toBe("c-vikend");
    expect(findHubChannel(INPUT, "nema")).toBeNull();
    expect(hubUnreadTotal(INPUT)).toEqual({ unreadCount: 8, mentionCount: 1 });
  });

  test("pregled reda: moja poruka, grupa, DM, bez poruka, sistemska", () => {
    const base = channel({ _id: "g", kind: "custom", name: "Vikend", lastMessagePreview: "Vidimo se u 10" });
    expect(hubRowPreview({ ...base, lastMessageAuthor: milica }, ME)).toBe("Milica: Vidimo se u 10");
    expect(hubRowPreview({ ...base, lastMessageAuthor: { ...milica, _id: ME } }, ME)).toBe("Ti: Vidimo se u 10");
    expect(hubRowPreview({ ...base, kind: "dm", lastMessageAuthor: milica }, ME)).toBe("Vidimo se u 10");
    expect(hubRowPreview({ ...base, lastMessageAuthor: null }, ME)).toBe("Vidimo se u 10");
    expect(hubRowPreview({ ...base, lastMessagePreview: "  " }, ME)).toBe("Bez poruka");
  });

  test("srpska množina: član, nepročitane poruke", () => {
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25].map((count) => `${count} ${clanWord(count)}`)).toEqual([
      "1 član", "2 člana", "4 člana", "5 članova", "11 članova", "12 članova", "21 član", "22 člana", "25 članova",
    ]);
    expect(hubUnreadLabel(1)).toBe("1 nepročitana poruka");
    expect(hubUnreadLabel(3)).toBe("3 nepročitane poruke");
    expect(hubUnreadLabel(11)).toBe("11 nepročitanih poruka");
    expect(hubUnreadLabel(21)).toBe("21 nepročitana poruka");
    expect([1, 2, 5, 11, 21].map(hubMentionLabel)).toEqual([
      "1 pominjanje", "2 pominjanja", "5 pominjanja", "11 pominjanja", "21 pominjanje",
    ]);
  });

  test("podnaslov ličnog razgovora", () => {
    expect(personalSubtitle("dm", null)).toBe("Lična poruka");
    expect(personalSubtitle("custom", 3)).toBe("Lična grupa · 3 člana");
    expect(personalSubtitle("custom", null)).toBe("Lična grupa");
  });
});

describe("mentionCandidates — izbor kandidata za pominjanje po opsegu", () => {
  const member = (id: string, displayName: string) => ({ profile: { _id: id, displayName } });
  const members = [
    member("p-stefan", "Stefan Marković"),
    member(ME, "Jovan Milojević"),
    member("p-ana", "Ana Ilić"),
    member("p-ana", "Ana Ilić"),
    member("p-prazno", "  "),
  ];

  test("lični razgovor: samo članovi, bez mene, bez duplikata i praznih imena, po imenu", () => {
    expect(mentionCandidates({ kind: "personal", members }, ME).map((item) => item.profile._id)).toEqual(["p-ana", "p-stefan"]);
  });

  test("startup: spisak nepromenjen (redosled servera, uključujući mene) — `view=chat` kao pre", () => {
    const result = mentionCandidates({ kind: "startup", members }, ME);
    expect(result).toEqual(members);
    expect(result).not.toBe(members);
  });

  test("opseg se bira po kanalu", () => {
    expect(mentionScopeFor({ workspaceId: null }, members).kind).toBe("personal");
    expect(mentionScopeFor({ workspaceId: "s-1" }, members).kind).toBe("startup");
  });

  test("lični razgovor sa jednim sagovornikom nudi samo njega", () => {
    expect(mentionCandidates({ kind: "personal", members: [member(ME, "Jovan"), member("p-mi", "Milica")] }, ME)).toEqual([
      member("p-mi", "Milica"),
    ]);
  });
});

describe("ljudi i nacrt lične grupe", () => {
  const people = [
    { _id: "1", displayName: "Milica Jovanović" },
    { _id: "2", displayName: "Luka Đorđević" },
    { _id: "3", displayName: "Teodora Pavlović" },
  ];

  test("filter ljudi po imenu bez dijakritika", () => {
    expect(filterPeople(people, "dordj").map((person) => person._id)).toEqual([]);
    expect(filterPeople(people, "dorde").map((person) => person._id)).toEqual(["2"]);
    expect(filterPeople(people, "pavlovic teo").map((person) => person._id)).toEqual(["3"]);
    expect(filterPeople(people, "").map((person) => person._id)).toEqual(["1", "2", "3"]);
  });

  test("podnaslov osobe i brojač članova", () => {
    expect(sharedStartupsLabel(["Cluck Rush", "Scan Me"])).toBe("Zajedno: Cluck Rush, Scan Me");
    expect(sharedStartupsLabel([])).toBe("Bez zajedničkog projekta");
    expect(groupMembersLabel(3)).toBe("Članovi (3/49)");
  });

  test("granice nacrta su iste kao na serveru", () => {
    expect(GROUP_MEMBERS_MAX).toBe(MAX_CHAT_CHANNEL_MEMBERS);
    expect(GROUP_OTHER_MEMBERS_MAX).toBe(49);
    expect(groupDraftProblem({ name: "  ", otherCount: 2 })).toBe("Naziv grupe je obavezno polje.");
    expect(groupDraftProblem({ name: "x".repeat(GROUP_NAME_MAX + 1), otherCount: 2 })).toBe(
      "Naziv grupe može imati najviše 120 znakova.",
    );
    expect(groupDraftProblem({ name: "x".repeat(GROUP_NAME_MAX), otherCount: 1 })).toBeNull();
    expect(groupDraftProblem({ name: "Vikend", otherCount: 0 })).toBe("Grupi treba bar još jedan član.");
    expect(groupDraftProblem({ name: "Vikend", otherCount: 49 })).toBeNull();
    expect(groupDraftProblem({ name: "Vikend", otherCount: 50 })).toBe("Grupa može imati najviše 50 članova.");
  });
});

describe("dozvole u razgovoru — ogledalo serverskih gejtova (D4)", () => {
  test("kanal startupa: admin arhivira (ne „Opšte“) i upravlja članovima samo u `custom`", () => {
    expect(chatConversationPermissions("admin", { workspaceId: "s-1", kind: "area" })).toEqual({
      personal: false,
      canArchive: true,
      canManageMembers: false,
      canOpenGroupSettings: false,
    });
    expect(chatConversationPermissions("admin", { workspaceId: "s-1", kind: "startup" }).canArchive).toBe(false);
    expect(chatConversationPermissions("admin", { workspaceId: "s-1", kind: "custom" }).canManageMembers).toBe(true);
    expect(chatConversationPermissions("admin", { workspaceId: "s-1", kind: "dm" }).canManageMembers).toBe(false);
  });

  test("član startupa ne dobija admin radnje", () => {
    expect(chatConversationPermissions("member", { workspaceId: "s-1", kind: "custom" })).toEqual({
      personal: false,
      canArchive: false,
      canManageMembers: false,
      canOpenGroupSettings: false,
    });
    expect(chatConversationPermissions(undefined, { workspaceId: "s-1", kind: "area" }).canArchive).toBe(false);
  });

  test("lični razgovor: bez arhiviranja i admin-članstva i za admina; podešavanja samo za grupu", () => {
    expect(chatConversationPermissions("admin", { workspaceId: null, kind: "custom" })).toEqual({
      personal: true,
      canArchive: false,
      canManageMembers: false,
      canOpenGroupSettings: true,
    });
    expect(chatConversationPermissions("member", { workspaceId: null, kind: "custom" }).canOpenGroupSettings).toBe(true);
    expect(chatConversationPermissions("admin", { workspaceId: null, kind: "dm" })).toEqual({
      personal: true,
      canArchive: false,
      canManageMembers: false,
      canOpenGroupSettings: false,
    });
  });

  test("brisanje poruke: autor uvek, admin tuđe samo u startupu, obrisana nikad", () => {
    expect(canDeleteChatMessage({ isOwn: true, isAdmin: false, workspaceId: null, deleted: false })).toBe(true);
    expect(canDeleteChatMessage({ isOwn: true, isAdmin: false, workspaceId: "s-1", deleted: false })).toBe(true);
    expect(canDeleteChatMessage({ isOwn: false, isAdmin: true, workspaceId: "s-1", deleted: false })).toBe(true);
    expect(canDeleteChatMessage({ isOwn: false, isAdmin: true, workspaceId: null, deleted: false })).toBe(false);
    expect(canDeleteChatMessage({ isOwn: false, isAdmin: false, workspaceId: "s-1", deleted: false })).toBe(false);
    expect(canDeleteChatMessage({ isOwn: true, isAdmin: true, workspaceId: "s-1", deleted: true })).toBe(false);
  });
});
