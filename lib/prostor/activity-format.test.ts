// Preneto iz Devotion packages/shared/src/activity-format.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  ACTIVITY_ACTIONS,
  activityTarget,
  formatActivity,
  UNKNOWN_ACTIVITY_ACTOR,
} from "./activity-format";

const OLD_ACTIONS = [
  "startup_created",
  "startup_updated",
  "startup_archived",
  "member_added",
  "member_removed",
  "invite_created",
  "invite_claimed",
  "invite_revoked",
  "page_created",
  "page_updated",
  "page_moved",
  "page_archived",
  "task_updated",
  "contribution_created",
  "contribution_updated",
  "deletion_requested",
  "deletion_voted",
  "deletion_resolved",
  "nesting_requested",
  "nesting_resolved",
  "content_recovered",
  "content_soft_deleted",
  "member_password_changed",
];

const NEW_ACTIONS = [
  "page_locked",
  "page_unlocked",
  "revision_restored",
  "page_restored",
  "idea_archived",
  "idea_restored",
  "comment_created",
  "idea_stage_changed",
  "tasks_rescheduled",
];

describe("formatActivity — pokrivenost", () => {
  test("zna svih 32 radnji iz šeme (23 stare + 9 nove)", () => {
    expect(OLD_ACTIONS).toHaveLength(23);
    expect(NEW_ACTIONS).toHaveLength(9);
    expect([...ACTIVITY_ACTIONS].sort()).toEqual(
      [...OLD_ACTIONS, ...NEW_ACTIONS].sort(),
    );
    expect(ACTIVITY_ACTIONS).toHaveLength(32);
  });

  test("svaka radnja ima rečenicu sa imenom, ikonicu i ton", () => {
    for (const action of ACTIVITY_ACTIONS) {
      const result = formatActivity(
        { action, title: "Naslov", detail: "Detalj" },
        "Ana",
      );
      expect(result.sentence, action).toContain("Ana");
      // „Sredi rokove” ne pominje naslov: rečenicu nosi `detail`.
      expect(result.sentence, action).toContain(
        action === "tasks_rescheduled" ? "Detalj" : "Naslov",
      );
      expect(result.icon, action).not.toBe("other");
      expect(["neutral", "danger", "success"]).toContain(result.tone);
    }
  });
});

describe("formatActivity — stare radnje", () => {
  test("potpisuje gotovu rečenicu: „Ime · title”", () => {
    expect(
      formatActivity(
        { action: "task_updated", title: "Task „Lansiranje” je ažuriran" },
        "Ana",
      ),
    ).toEqual({
      sentence: "Ana · Task „Lansiranje” je ažuriran",
      icon: "edit",
      tone: "neutral",
    });
  });

  test("dodaje detalj posle crtice, a prazan detalj preskače", () => {
    expect(
      formatActivity(
        {
          action: "page_archived",
          title: "„Plan” je premešten/a u Korpu",
          detail: "Sa 3 podstranice",
        },
        "Ana",
      ).sentence,
    ).toBe("Ana · „Plan” je premešten/a u Korpu — Sa 3 podstranice");
    expect(
      formatActivity({ action: "page_moved", title: "Premešteno", detail: "  " }, "Ana")
        .sentence,
    ).toBe("Ana · Premešteno");
    expect(
      formatActivity({ action: "page_moved", title: "Premešteno", detail: null }, "Ana")
        .sentence,
    ).toBe("Ana · Premešteno");
  });

  test("ton: brisanje je opasno, vraćanje uspešno", () => {
    expect(formatActivity({ action: "member_removed", title: "x" }, "A").tone).toBe("danger");
    expect(formatActivity({ action: "content_soft_deleted", title: "x" }, "A").tone).toBe("danger");
    expect(formatActivity({ action: "content_recovered", title: "x" }, "A").tone).toBe("success");
  });
});

describe("formatActivity — nove radnje", () => {
  const sentence = (action: string, title: string, detail?: string) =>
    formatActivity({ action, title, detail }, "Ana").sentence;

  test("zaključavanje i Istorija izmena", () => {
    expect(sentence("page_locked", "Specifikacija")).toBe(
      "Ana je zaključao/la „Specifikacija”",
    );
    expect(sentence("page_unlocked", "Specifikacija")).toBe(
      "Ana je otključao/la „Specifikacija”",
    );
    expect(sentence("revision_restored", "Specifikacija")).toBe(
      "Ana je vratio/la raniju verziju „Specifikacija”",
    );
  });

  test("Korpa: stranica sa i bez podstranica, ideja", () => {
    expect(sentence("page_restored", "Plan")).toBe(
      "Ana je vratio/la „Plan” iz Korpe",
    );
    expect(sentence("page_restored", "Plan", "Sa 1 podstranicom")).toBe(
      "Ana je vratio/la „Plan” iz Korpe i 1 podstranica",
    );
    expect(sentence("page_restored", "Plan", "Sa 3 podstranice")).toBe(
      "Ana je vratio/la „Plan” iz Korpe i 3 podstranice",
    );
    expect(sentence("page_restored", "Plan", "Sa 7 podstranica")).toBe(
      "Ana je vratio/la „Plan” iz Korpe i 7 podstranica",
    );
    expect(sentence("page_restored", "Plan", "bez broja")).toBe(
      "Ana je vratio/la „Plan” iz Korpe",
    );
    expect(sentence("idea_archived", "Ideja")).toBe(
      "Ana je obrisao/la ideju „Ideja”",
    );
    expect(sentence("idea_restored", "Ideja")).toBe(
      "Ana je vratio/la ideju „Ideja” iz Korpe",
    );
    expect(formatActivity({ action: "idea_archived", title: "x" }, "A").tone).toBe("danger");
    expect(formatActivity({ action: "page_restored", title: "x" }, "A").tone).toBe("success");
  });

  test("komentar, faza ideje i sređivanje rokova", () => {
    expect(sentence("comment_created", "Plan", "Pogledaj ovo")).toBe(
      "Ana je komentarisao/la „Plan”",
    );
    expect(sentence("idea_stage_changed", "Ideja", "Razmatra se")).toBe(
      "Ana je premestio/la ideju „Ideja” u fazu Razmatra se",
    );
    expect(sentence("idea_stage_changed", "Ideja")).toBe(
      "Ana je promenio/la fazu ideje „Ideja”",
    );
    expect(sentence("tasks_rescheduled", "Projekat", "3 zadatka → 28. 10.")).toBe(
      "Ana je sredio/la rokove: 3 zadatka → 28. 10.",
    );
    expect(sentence("tasks_rescheduled", "Projekat")).toBe("Ana je sredio/la rokove");
    expect(formatActivity({ action: "tasks_rescheduled", title: "x" }, "A").icon).toBe("calendar");
  });

  test("prazan naslov postaje „bez naslova”", () => {
    expect(sentence("page_locked", "  ")).toBe("Ana je zaključao/la „bez naslova”");
  });
});

describe("formatActivity — rezervni slučajevi", () => {
  test("nepoznata radnja pada na „Ime · title”", () => {
    expect(
      formatActivity({ action: "buduca_radnja", title: "Nešto", detail: "d" }, "Ana"),
    ).toEqual({ sentence: "Ana · Nešto — d", icon: "other", tone: "neutral" });
  });

  test("ključevi iz prototipa nisu radnje", () => {
    expect(formatActivity({ action: "toString", title: "x" }, "Ana").icon).toBe("other");
    expect(formatActivity({ action: "constructor", title: "x" }, "Ana").icon).toBe("other");
  });

  test("bez imena je „Član tima”", () => {
    expect(UNKNOWN_ACTIVITY_ACTOR).toBe("Član tima");
    expect(formatActivity({ action: "page_locked", title: "X" }, null).sentence).toBe(
      "Član tima je zaključao/la „X”",
    );
    expect(formatActivity({ action: "page_locked", title: "X" }, "  ").sentence).toBe(
      "Član tima je zaključao/la „X”",
    );
    expect(formatActivity({ action: "task_updated", title: "T" }, null).sentence).toBe(
      "Član tima · T",
    );
  });
});

describe("activityTarget", () => {
  test("cilj po targetType", () => {
    expect(activityTarget({ targetType: "page", targetId: "p1" })).toEqual({ kind: "page", pageId: "p1" });
    expect(activityTarget({ targetType: "idea", targetId: "i1" })).toEqual({ kind: "idea", ideaId: "i1" });
    expect(activityTarget({ targetType: "area", targetId: "a1" })).toEqual({ kind: "area", areaId: "a1" });
  });

  test("startup, profil, poziv, zahtev i nepoznato ne vode nigde", () => {
    for (const targetType of [
      "startup",
      "profile",
      "invite",
      "contribution",
      "request",
      "recovered",
      "nesto_novo",
    ]) {
      expect(activityTarget({ targetType, targetId: "x" })).toEqual({ kind: "none" });
    }
  });
});
