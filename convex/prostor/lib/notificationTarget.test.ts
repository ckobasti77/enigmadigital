// Preneto iz Devotion packages/backend/convex/lib/notificationTarget.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { notificationDestination } from "./notificationTarget";

describe("notificationDestination", () => {
  test("svaki targetType vodi na svoj ekran", () => {
    expect(notificationDestination("chat", "ch1", "s1")).toEqual({
      screen: "chat",
      scope: "startup",
      entityId: "ch1",
      weekStart: null,
    });
    expect(notificationDestination("chat", null, "s1")).toMatchObject({
      screen: "chat",
      entityId: null,
    });
    expect(notificationDestination("page", "p1", "s1")).toMatchObject({
      screen: "page",
      entityId: "p1",
    });
    // `page` bez id-ja je nedosledan cilj → komandni centar.
    expect(notificationDestination("page", null, "s1")).toMatchObject({
      screen: "today",
      entityId: null,
    });
    expect(notificationDestination("ideas", null, "s1")).toMatchObject({
      screen: "ideas",
      entityId: null,
    });
    // Ideja nosi ideaId (komentar, glas); bez id-ja ostaje lista ideja.
    expect(notificationDestination("ideas", "i1", "s1")).toMatchObject({
      screen: "ideas",
      entityId: "i1",
    });
    // Oblast (komentar na opisu) nosi areaId; bez id-ja je nedosledan cilj.
    expect(notificationDestination("area", "a1", "s1")).toMatchObject({
      screen: "area",
      entityId: "a1",
    });
    expect(notificationDestination("area", null, "s1")).toMatchObject({
      screen: "today",
      entityId: null,
    });
    expect(notificationDestination("approvals", "r1", "s1")).toMatchObject({
      screen: "approvals",
      entityId: null,
    });
    expect(notificationDestination("puls", "1700000000000", "s1")).toMatchObject({
      screen: "puls",
      weekStart: 1_700_000_000_000,
    });
    expect(notificationDestination("puls", "nije-broj", "s1")).toMatchObject({
      screen: "puls",
      weekStart: null,
    });
    expect(notificationDestination("nepoznato", "x", "s1")).toMatchObject({
      screen: "today",
      entityId: null,
    });
  });

  test("opseg: null je lično, Id i odsutno su startup", () => {
    expect(notificationDestination("chat", "ch1", null)).toEqual({
      screen: "chat",
      scope: "personal",
      entityId: "ch1",
      weekStart: null,
    });
    expect(notificationDestination("chat", "ch1", "s1").scope).toBe("startup");
    // Stari pozivi bez trećeg argumenta zadržavaju startup opseg.
    expect(notificationDestination("chat", "ch1").scope).toBe("startup");
    expect(notificationDestination("page", "p1", undefined).scope).toBe("startup");
  });
});
