// Preneto iz Devotion apps/web/components/collab/collab-model.test.ts (main @ c05c40f), SPAJANJE S11.
import { describe, expect, it } from "vitest";
import { serializeComment } from "..";

import { PAGE_PRESENCE_TTL_MS } from "../../../convex/prostor/lib/pagePresence";

import {
  activeEditors,
  commentAuthorName,
  commentMeta,
  commentToDraft,
  compactComments,
  conflictCopy,
  groupRevisionsByDay,
  keptMentions,
  lockedByLabel,
  mentionSuggestions,
  presenceLabel,
  restoreConfirmTitle,
  restoreOutcomeMessage,
  revisionMoment,
} from "./collab-model";

const NOW = new Date("2026-10-24T09:30:00").getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function presence(profileId: string, displayName: string, editing: boolean, expiresAt: number) {
  return { profileId, displayName, avatarUrl: null, editing, expiresAt };
}

describe("prisustvo (P23, TTL računa klijent)", () => {
  it("prikazuje samo sveže redove koji uređuju; istekao otkucaj ispada", () => {
    const heartbeatAt = NOW - 10_000;
    const rows = [
      presence("p2", "Marko Ilić", true, heartbeatAt + PAGE_PRESENCE_TTL_MS),
      presence("p1", "Ana Petrović", true, heartbeatAt + PAGE_PRESENCE_TTL_MS),
      presence("p3", "Lena Kostić", false, heartbeatAt + PAGE_PRESENCE_TTL_MS),
      presence("p4", "Ivan Jović", true, NOW - 1),
      presence("p5", "Sara Đorđević", true, 0),
    ];
    expect(activeEditors(rows, NOW).map((row) => row.profileId)).toEqual(["p1", "p2"]);
    // Otkucaj stariji od TTL-a (45 s) više ne važi, bez novog upita.
    expect(activeEditors(rows, heartbeatAt + PAGE_PRESENCE_TTL_MS)).toEqual([]);
    expect(activeEditors(undefined, NOW)).toEqual([]);
  });

  it("isti član se broji jednom", () => {
    const rows = [presence("p1", "Ana", true, NOW + 1_000), presence("p1", "Ana", true, NOW + 2_000)];
    expect(activeEditors(rows, NOW)).toHaveLength(1);
  });

  it("tekst: jedan, dva i više urednika, po imenu", () => {
    expect(presenceLabel([])).toBeNull();
    expect(presenceLabel(["Ana Petrović"])).toBe("Ana uređuje");
    expect(presenceLabel(["Ana Petrović", "Marko Ilić"])).toBe("Ana i Marko uređuju");
    expect(presenceLabel(["Ana Petrović", "Marko Ilić", "Lena Kostić"])).toBe("Ana i još 2 uređuju");
    expect(presenceLabel(["  "])).toBe("Član tima uređuje");
  });
});

describe("Istorija izmena — prikaz", () => {
  it("grupiše revizije po lokalnom danu i čuva redosled (najnovije prve)", () => {
    const revisions = [
      { id: "a", updatedAt: NOW - 5 * MIN },
      { id: "b", updatedAt: NOW - 2 * HOUR },
      { id: "c", updatedAt: NOW - DAY },
      { id: "d", updatedAt: NOW - DAY - HOUR },
      { id: "e", updatedAt: NOW - 3 * DAY },
    ];
    const groups = groupRevisionsByDay(revisions, NOW);
    expect(groups.map((group) => group.label)).toEqual(["Danas", "Juče", "Sre 21. okt"]);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(groupRevisionsByDay([], NOW)).toEqual([]);
  });

  it("potvrda i ishod vraćanja nose dan i vreme verzije", () => {
    expect(revisionMoment(NOW - 30 * MIN, NOW)).toBe("danas u 09:00");
    expect(revisionMoment(NOW - DAY, NOW)).toBe("juče u 09:30");
    expect(revisionMoment(NOW - 3 * DAY, NOW)).toBe("sre 21. okt u 09:30");
    expect(restoreConfirmTitle(NOW - DAY, NOW)).toBe("Vratiti verziju od juče u 09:30?");
    expect(restoreOutcomeMessage(true, NOW - DAY, NOW)).toBe("Vraćena je verzija od juče u 09:30.");
    expect(restoreOutcomeMessage(false, NOW - DAY, NOW)).toBe("Ova verzija je ista kao trenutna.");
  });
});

describe("konflikt i zaključavanje", () => {
  it("dijalog kaže ko je i kada sačuvao, za stranicu i opis oblasti", () => {
    expect(conflictCopy({ subject: "page", updaterName: "Ana Petrović", updatedAt: NOW - 2 * MIN, now: NOW })).toEqual({
      title: "Neko je u međuvremenu izmenio stranicu",
      body: "Ana Petrović je sačuvao/la izmenu pre 2 min. Tvoja verzija još nije sačuvana.",
    });
    expect(conflictCopy({ subject: "area", updaterName: null, updatedAt: null, now: NOW })).toEqual({
      title: "Neko je u međuvremenu izmenio opis oblasti",
      body: "Neko iz tima je sačuvao/la izmenu. Tvoja verzija još nije sačuvana.",
    });
  });

  it("opis oznake zaključanog", () => {
    expect(lockedByLabel({ lockedByName: "Ana", lockedAt: NOW - DAY, now: NOW })).toBe(
      "Zaključao/la Ana · juče u 09:30",
    );
    expect(lockedByLabel({ lockedByName: null, lockedAt: null, now: NOW })).toBe("Zaključao/la Neko iz tima");
  });
});

describe("komentari — pominjanja u unosu", () => {
  const members = [
    { profileId: "p1", displayName: "Jovan Milojević" },
    { profileId: "p2", displayName: "Ana Petrović" },
    { profileId: "p3", displayName: "Đorđe Antić" },
    { profileId: "p4", displayName: "Marko Ilić" },
  ];

  it("predlozi: bez autora, po bilo kojoj reči imena, bez dijakritika, abecedno", () => {
    expect(mentionSuggestions(members, "", "p1").map((member) => member.profileId)).toEqual(["p2", "p3", "p4"]);
    expect(mentionSuggestions(members, "an", "p1").map((member) => member.profileId)).toEqual(["p2", "p3"]);
    expect(mentionSuggestions(members, "djo", null).map((member) => member.profileId)).toEqual(["p3"]);
    expect(mentionSuggestions(members, "ilic", null).map((member) => member.profileId)).toEqual(["p4"]);
    expect(mentionSuggestions(members, "x", null)).toEqual([]);
  });

  it("obrisano „@Ime” izbacuje pominjanje, duplikati se šalju jednom", () => {
    const ana = members[1];
    const marko = members[3];
    expect(keptMentions("Pitaj @Ana Petrović", [ana, marko, ana])).toEqual([ana]);
  });

  it("izmena u mestu: sačuvan komentar se vraća u isti tekst i pominjanja (kružno)", () => {
    const ana = { profileId: "p2", displayName: "Ana Petrović" };
    const saved = serializeComment("Proveri sa @Ana Petrović limit\ndrugi red", [ana]);
    const draft = commentToDraft(saved.content);
    expect(draft).toEqual({ text: "Proveri sa @Ana Petrović limit\ndrugi red", mentions: [ana] });
    expect(serializeComment(draft.text, draft.mentions)).toEqual(saved);
  });

  it("stari HTML komentar postaje običan tekst bez pominjanja", () => {
    expect(commentToDraft("<p><strong>Važno</strong> &amp; hitno</p><p>da</p>")).toEqual({
      text: "Važno & hitno\nda",
      mentions: [],
    });
  });

  it("autor i meta reda", () => {
    expect(commentAuthorName({ origin: "legacy_shared", author: null })).toBe("Raniji tekst tima");
    expect(commentAuthorName({ origin: "comment", author: { displayName: "Ana" } })).toBe("Ana");
    expect(commentMeta({ createdAt: NOW - 5 * MIN, edited: true, moderationStatus: "approved" }, NOW)).toBe(
      "pre 5 min · izmenjeno",
    );
    expect(commentMeta({ createdAt: NOW - 30_000, edited: false, moderationStatus: "rejected" }, NOW)).toBe(
      "upravo · Odbijeno ranije",
    );
  });
});

describe("compactComments", () => {
  it("prikazuje poslednja tri, a ostale broji kao skrivene", () => {
    const result = compactComments(["a", "b", "c", "d", "e"]);
    expect(result.shown).toEqual(["c", "d", "e"]);
    expect(result.hidden).toBe(2);
  });

  it("kratka lista se prikazuje cela", () => {
    expect(compactComments(["a", "b"])).toEqual({ shown: ["a", "b"], hidden: 0 });
    expect(compactComments([])).toEqual({ shown: [], hidden: 0 });
  });

  it("nevalidna veličina ne baca (0 sakriva sve)", () => {
    expect(compactComments(["a", "b"], 0)).toEqual({ shown: [], hidden: 2 });
    expect(compactComments(["a", "b"], -1)).toEqual({ shown: [], hidden: 2 });
  });
});
