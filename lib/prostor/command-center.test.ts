// Preneto iz Devotion packages/shared/src/command-center.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  BULK_RESCHEDULE_MAX,
  currentWeekBounds,
  forYouTasks,
  PULSE_NOW_STEP_MS,
  pulseCardNow,
  rescheduleChange,
  rescheduleCandidates,
  rescheduleOutcome,
  rescheduleSelectionNote,
  RESCHEDULE_TARGETS,
  selectionForCall,
  skippedNote,
  tasksCountLabel,
  teamWorkloadLabel,
  undoItemsFrom,
  undoOutcome,
  weekPulseFacts,
  withNewRevisions,
} from "./command-center";
import { noonOfDayKey, startOfDayKey } from "./dates";

const BG = "Europe/Belgrade";
const HOUR = 3_600_000;
const due = (key: string) => noonOfDayKey(key, BG);
// Srijeda, 28. 10. 2026, 09:00 po beogradskom vremenu.
const NOW = startOfDayKey("2026-10-28", BG) + 9 * HOUR;

describe("tasksCountLabel", () => {
  test("srpska množina", () => {
    expect(tasksCountLabel(1)).toBe("1 zadatak");
    expect(tasksCountLabel(2)).toBe("2 zadatka");
    expect(tasksCountLabel(5)).toBe("5 zadataka");
    expect(tasksCountLabel(11)).toBe("11 zadataka");
    expect(tasksCountLabel(21)).toBe("21 zadatak");
    expect(tasksCountLabel(22)).toBe("22 zadatka");
    expect(tasksCountLabel(112)).toBe("112 zadataka");
  });
});

describe("forYouTasks", () => {
  const task = (id: string, dueKey: string | null, status: string, priority = "medium") => ({
    id,
    dueDate: dueKey === null ? null : due(dueKey),
    taskStatus: status,
    taskPriority: priority,
  });

  test("prekoračeno → danas → u toku, ostalo ne ulazi", () => {
    const { items, total } = forYouTasks(
      [
        task("sutra", "2026-10-29", "next"),
        task("u-toku", null, "in_progress"),
        task("danas", "2026-10-28", "next"),
        task("kasni", "2026-10-26", "blocked"),
        task("gotovo", "2026-10-20", "done"),
        task("bez-roka", null, "backlog"),
      ],
      NOW,
      6,
      BG,
    );
    expect(items.map((item) => item.id)).toEqual(["kasni", "danas", "u-toku"]);
    expect(total).toBe(3);
  });

  test("najstariji rok prvi, pa prioritet; granica reže, ali total broji sve", () => {
    const { items, total } = forYouTasks(
      [
        task("a", "2026-10-27", "next", "low"),
        task("b", "2026-10-20", "next", "low"),
        task("c", "2026-10-27", "next", "urgent"),
        task("d", "2026-10-28", "next", "high"),
        task("e", "2026-10-28", "next", "urgent"),
      ],
      NOW,
      3,
      BG,
    );
    expect(items.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(total).toBe(5);
  });

  test("prazan ulaz i granica 0", () => {
    expect(forYouTasks([], NOW, 6, BG)).toEqual({ items: [], total: 0 });
    expect(forYouTasks([task("x", "2026-10-27", "next")], NOW, 0, BG)).toEqual({ items: [], total: 1 });
  });
});

describe("Sredi rokove", () => {
  test("dugmad redom Danas · Sutra · Sledeće nedelje · Bez roka · Završi", () => {
    expect(RESCHEDULE_TARGETS.map((target) => target.label)).toEqual([
      "Danas",
      "Sutra",
      "Sledeće nedelje",
      "Bez roka",
      "Završi",
    ]);
  });

  test("rok je lokalno podne; Bez roka je null; Završi je complete", () => {
    expect(rescheduleChange("today", NOW, BG)).toEqual({ dueDate: due("2026-10-28") });
    expect(rescheduleChange("tomorrow", NOW, BG)).toEqual({ dueDate: due("2026-10-29") });
    // Sledeće nedelje = ponedeljak (srijeda 28. 10. → 2. 11.).
    expect(rescheduleChange("nextWeek", NOW, BG)).toEqual({ dueDate: due("2026-11-02") });
    expect(rescheduleChange("none", NOW, BG)).toEqual({ dueDate: null });
    expect(rescheduleChange("done", NOW, BG)).toEqual({ complete: true });
  });

  test("kandidati: samo otvoreni sa prošlim rokom, najstariji prvi, zastareli označeni", () => {
    const candidates = rescheduleCandidates(
      [
        { _id: "danas", title: "Danas", dueDate: due("2026-10-28"), taskStatus: "next" },
        { _id: "juce", title: "Juče", dueDate: due("2026-10-27"), taskStatus: "next" },
        { _id: "staro", title: "Staro", dueDate: due("2026-09-01"), taskStatus: "blocked" },
        { _id: "granica", title: "Granica", dueDate: due("2026-10-14"), taskStatus: "in_progress" },
        { _id: "gotovo", title: "Gotovo", dueDate: due("2026-10-01"), taskStatus: "done" },
        { _id: "bez", title: "Bez roka", dueDate: null, taskStatus: "next" },
      ],
      NOW,
      BG,
    );
    expect(candidates.map((candidate) => candidate.id)).toEqual(["staro", "granica", "juce"]);
    expect(candidates.map((candidate) => candidate.stale)).toEqual([true, false, false]);
    expect(candidates[2].daysLate).toBe(1);
  });

  test("izbor se seče na 50 i beleška to kaže", () => {
    const ids = Array.from({ length: 70 }, (_, index) => `t${index}`);
    expect(BULK_RESCHEDULE_MAX).toBe(50);
    const call = selectionForCall(ids);
    expect(call.ids).toHaveLength(50);
    expect(call.ids[0]).toBe("t0");
    expect(call.capped).toBe(true);
    expect(selectionForCall(ids.slice(0, 50)).capped).toBe(false);
    expect(rescheduleSelectionNote(0)).toBe("Nijedan zadatak nije izabran.");
    expect(rescheduleSelectionNote(12)).toBe("Izabrano: 12");
    expect(rescheduleSelectionNote(70)).toBe("Izabrano: 70 · obrađuje se prvih 50");
  });

  test("ishod: sređeno, preskočeno, ništa", () => {
    expect(rescheduleOutcome("tomorrow", { updated: 12, unchanged: 0, skipped: [] })).toEqual({
      message: "Sređeno: 12 zadataka → sutra.",
      changed: true,
    });
    expect(
      rescheduleOutcome("none", {
        updated: 1,
        unchanged: 0,
        skipped: [{ reason: "zakljucan" }, { reason: "zakljucan" }],
      }).message,
    ).toBe("Sređeno: 1 zadatak → bez roka. 2 zaključana su preskočena.");
    expect(rescheduleOutcome("done", { updated: 3, unchanged: 0, skipped: [] }).message).toBe(
      "Sređeno: 3 zadatka → završeno.",
    );
    expect(rescheduleOutcome("today", { updated: 0, unchanged: 4, skipped: [] })).toEqual({
      message: "Zadaci već imaju taj rok.",
      changed: false,
    });
    expect(rescheduleOutcome("done", { updated: 0, unchanged: 2, skipped: [] }).message).toBe("Zadaci su već završeni.");
    expect(rescheduleOutcome("today", { updated: 0, unchanged: 0, skipped: [] }).message).toBe(
      "Ništa nije promenjeno.",
    );
  });

  test("skippedNote: rod i broj", () => {
    expect(skippedNote([])).toBe("");
    expect(skippedNote([{ reason: "zakljucan" }])).toBe("1 zaključan je preskočen.");
    expect(skippedNote(Array(5).fill({ reason: "zakljucan" }))).toBe("5 zaključanih je preskočeno.");
    expect(skippedNote([{ reason: "nije_pronadjen" }])).toBe("1 je preskočen.");
    expect(skippedNote([{ reason: "zakljucan" }, { reason: "nije_pronadjen" }, { reason: "zakljucan" }])).toBe(
      "3 su preskočena.",
    );
  });
});

describe("Poništi", () => {
  test("stavke nose prethodni rok i status i novu reviziju", () => {
    expect(
      undoItemsFrom([
        { taskPageId: "a", previous: { dueDate: 5, taskStatus: "next" }, revision: 7 },
        { taskPageId: "b", previous: { dueDate: null, taskStatus: "blocked" }, revision: 3 },
      ]),
    ).toEqual([
      { taskPageId: "a", dueDate: 5, taskStatus: "next", expectedRevision: 7 },
      { taskPageId: "b", dueDate: null, taskStatus: "blocked", expectedRevision: 3 },
    ]);
  });

  test("ulančano poništavanje: starije stavke dobijaju novu reviziju", () => {
    const older = [
      { taskPageId: "a", dueDate: 1, taskStatus: "next", expectedRevision: 2 },
      { taskPageId: "b", dueDate: 2, taskStatus: "next", expectedRevision: 2 },
    ];
    const next = withNewRevisions(older, [{ taskPageId: "a", revision: 4 }]);
    expect(next.map((item) => item.expectedRevision)).toEqual([4, 2]);
    // Ništa se ne menja na ulazu i prazna lista vraća kopiju.
    expect(older[0].expectedRevision).toBe(2);
    expect(withNewRevisions(older, [])).toEqual(older);
  });

  test("ishod: vraćeno, menjano u međuvremenu, drugo", () => {
    expect(undoOutcome({ restored: 10, unchanged: 0, skipped: [] })).toBe("Vraćeno 10 zadataka.");
    expect(undoOutcome({ restored: 9, unchanged: 0, skipped: [{ reason: "izmenjen" }] })).toBe(
      "Vraćeno 9 zadataka · 1 je u međuvremenu menjan.",
    );
    expect(
      undoOutcome({ restored: 0, unchanged: 0, skipped: [{ reason: "izmenjen" }, { reason: "izmenjen" }] }),
    ).toBe("2 su u međuvremenu menjana.");
    expect(undoOutcome({ restored: 1, unchanged: 0, skipped: [{ reason: "zakljucan" }] })).toBe(
      "Vraćeno 1 zadatak · 1 nije vraćeno.",
    );
    expect(undoOutcome({ restored: 0, unchanged: 2, skipped: [] })).toBe("Zadaci su već vraćeni.");
    expect(undoOutcome({ restored: 0, unchanged: 0, skipped: [] })).toBe("Ništa nije vraćeno.");
  });
});

describe("Puls nedelje i Tim", () => {
  test("granice nedelje: ponedeljak 00:00, prethodna nedelja, kraj", () => {
    const bounds = currentWeekBounds(NOW, BG);
    expect(bounds.weekStart).toBe(startOfDayKey("2026-10-26", BG));
    expect(bounds.prevWeekStart).toBe(startOfDayKey("2026-10-19", BG));
    expect(bounds.weekEnd).toBe(startOfDayKey("2026-11-02", BG));
    expect(bounds.now).toBe(NOW);
    // Backend traži prevWeekStart < weekStart < weekEnd, a razmak ≤ 8 dana (i kroz DST).
    expect(bounds.prevWeekStart).toBeLessThan(bounds.weekStart);
    expect(bounds.weekEnd - bounds.weekStart).toBeLessThanOrEqual(8 * 24 * HOUR);
  });

  test("kartica Pulsa: „sada” u koracima od 15 min, bez prelaza u prethodni dan (K23)", () => {
    // Povratak u aplikaciju posle 1–14 min ne menja argument pretplate.
    const base = startOfDayKey("2026-10-28", BG) + 9 * HOUR;
    expect(pulseCardNow(base)).toBe(base);
    expect(pulseCardNow(base + 60_000)).toBe(base);
    expect(pulseCardNow(base + PULSE_NOW_STEP_MS - 1)).toBe(base);
    expect(pulseCardNow(base + PULSE_NOW_STEP_MS)).toBe(base + PULSE_NOW_STEP_MS);
    // Minut posle lokalne ponoći (i ponedeljka) ostaje u istom danu i nedelji.
    const monday = startOfDayKey("2026-10-26", BG);
    expect(pulseCardNow(monday + 60_000)).toBe(monday);
    expect(currentWeekBounds(pulseCardNow(monday + 60_000), BG).weekStart).toBe(monday);
    // Zona sa pomakom od pola sata: zaokruživanje ne vraća u prethodni dan.
    const kolkataMidnight = startOfDayKey("2026-10-26", "Asia/Kolkata");
    expect(pulseCardNow(kolkataMidnight + 60_000)).toBe(kolkataMidnight);
  });

  test("nedelja se računa i u ponedeljak u ponoć i u nedelju uveče", () => {
    expect(currentWeekBounds(startOfDayKey("2026-10-26", BG), BG).weekStart).toBe(startOfDayKey("2026-10-26", BG));
    expect(currentWeekBounds(startOfDayKey("2026-11-01", BG) + 23 * HOUR, BG).weekStart).toBe(
      startOfDayKey("2026-10-26", BG),
    );
  });

  test("činjenice Pulsa: Završeno · Novo · Zapelo", () => {
    expect(
      weekPulseFacts({ completed: { current: 14 }, created: { current: 9 }, stuck: { current: 3 } }),
    ).toEqual([
      { key: "completed", label: "Završeno", value: 14 },
      { key: "created", label: "Novo", value: 9 },
      { key: "stuck", label: "Zapelo", value: 3 },
    ]);
  });

  test("red Tima", () => {
    expect(teamWorkloadLabel({ open: 6, overdue: 2 })).toBe("6 otvoreno · 2 kasni");
    expect(teamWorkloadLabel({ open: 4, overdue: 0 })).toBe("4 otvoreno");
    expect(teamWorkloadLabel({ open: 0, overdue: 0 })).toBe("Nema otvorenih");
  });
});
