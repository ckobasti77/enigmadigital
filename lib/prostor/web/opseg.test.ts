// Preneto iz Devotion apps/web/components/me/shell/scope.test.ts (main @ c05c40f), SPAJANJE S09.
import { describe, expect, test } from "vitest";

import {
  railBadges,
  railDirection,
  railKey,
  unreadMessagesPhrase,
  unreadPhrase,
  type RailScope,
} from "./opseg";

describe("srpska množina uz bedževe", () => {
  test("nepročitano / nepročitana / nepročitanih", () => {
    expect(unreadPhrase(1)).toBe("1 nepročitano");
    expect(unreadPhrase(3)).toBe("3 nepročitana");
    expect(unreadPhrase(11)).toBe("11 nepročitanih");
    expect(unreadPhrase(21)).toBe("21 nepročitano");
    expect(unreadPhrase(14)).toBe("14 nepročitanih");
    expect(unreadPhrase(22)).toBe("22 nepročitana");
    expect(unreadPhrase(5, true)).toBe("više od 99 nepročitanih");
    expect(unreadPhrase(150)).toBe("više od 99 nepročitanih");
  });

  test("poruke", () => {
    expect(unreadMessagesPhrase(1)).toBe("1 nepročitana poruka");
    expect(unreadMessagesPhrase(4)).toBe("4 nepročitane poruke");
    expect(unreadMessagesPhrase(12)).toBe("12 nepročitanih poruka");
  });
});

const ORDER = ["s1", "s2", "s3"];
const me: RailScope = { kind: "me" };
const s = (id: string): RailScope => ({ kind: "projekat", workspaceId: id });

describe("opseg ljuske", () => {
  test("ključ stavke trake", () => {
    expect(railKey(me)).toBe("me");
    expect(railKey(s("s2"))).toBe("s2");
  });

  test("smer kroz traku: Ja je prva, niže = +1, više = −1", () => {
    expect(railDirection(null, s("s1"), ORDER)).toBe(0);
    expect(railDirection(me, s("s1"), ORDER)).toBe(1);
    expect(railDirection(s("s3"), me, ORDER)).toBe(-1);
    expect(railDirection(s("s1"), s("s3"), ORDER)).toBe(1);
    expect(railDirection(s("s3"), s("s2"), ORDER)).toBe(-1);
    expect(railDirection(s("s2"), s("s2"), ORDER)).toBe(0);
    expect(railDirection(me, s("nepoznat"), ORDER)).toBe(0);
  });
});

describe("bedževi trake (P14)", () => {
  test("Ja = sva nepročitana obaveštenja + sve nepročitane poruke; tačke po projektu", () => {
    const badges = railBadges(
      { total: { count: 7, capped: false }, byStartup: [{ workspaceId: "s1", count: 4 }, { workspaceId: "s2", count: 0 }] },
      { total: { unreadCount: 3 }, byStartup: [{ workspaceId: "s3", unreadCount: 2 }] },
    );
    expect(badges).toEqual({ me: 10, meCapped: false, startupDots: { s1: true, s3: true } });
  });

  test("odsečen brojač obaveštenja prenosi „99+“", () => {
    expect(railBadges({ total: { count: 300, capped: true }, byStartup: [] }, undefined).meCapped).toBe(true);
  });

  test("bez ijednog brojača bedž se ne prikazuje", () => {
    expect(railBadges(undefined, undefined)).toEqual({ me: null, meCapped: false, startupDots: {} });
    expect(railBadges(undefined, { total: { unreadCount: 2 }, byStartup: [] }).me).toBe(2);
  });
});
