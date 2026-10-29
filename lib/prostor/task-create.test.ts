// Preneto iz Devotion packages/shared/src/task-create.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { noonOfDayKey } from "./dates";
import {
  assigneesChipValue,
  defaultTaskDraft,
  TASK_CREATE_DEFAULT_PRIORITY,
  TASK_CREATE_DEFAULT_STATUS,
  TASK_CREATE_INSTRUCTIONS_MAX,
  TASK_CREATE_MAX_ASSIGNEES,
  taskCreateExtrasCount,
  taskCreateFields,
  toggleTaskAssignee,
  type TaskCreateDraft,
} from "./task-create";

const AREAS = [
  { _id: "a-dev", label: "Dev" },
  { _id: "a-mkt", label: "Marketing" },
  { _id: "a-sales", label: "Sales" },
];

const draft = (overrides: Partial<TaskCreateDraft> = {}): TaskCreateDraft => ({
  ...defaultTaskDraft({ profileId: "me", areas: AREAS }),
  ...overrides,
});

describe("podrazumevane vrednosti brzog pravljenja", () => {
  test("Neplanirano, Srednji, bez roka, izvršilac sam ja, prazne dodatne opcije", () => {
    expect(defaultTaskDraft({ profileId: "me", areas: AREAS })).toEqual({
      status: "backlog",
      priority: "medium",
      dueDate: null,
      assigneeProfileIds: ["me"],
      areaId: "a-dev",
      instructions: "",
      checkpoints: [],
    });
    expect(TASK_CREATE_DEFAULT_STATUS).toBe("backlog");
    expect(TASK_CREATE_DEFAULT_PRIORITY).toBe("medium");
  });

  test("oblast: zadata pobeđuje zapamćenu, zapamćena pobeđuje prvu", () => {
    const base = { profileId: "me", areas: AREAS };
    expect(defaultTaskDraft({ ...base, presetAreaId: "a-sales", rememberedAreaId: "a-mkt" }).areaId).toBe("a-sales");
    expect(defaultTaskDraft({ ...base, rememberedAreaId: "a-mkt" }).areaId).toBe("a-mkt");
    expect(defaultTaskDraft({ ...base, presetAreaId: null, rememberedAreaId: null }).areaId).toBe("a-dev");
  });

  test("oblast koja više ne postoji se preskače (zadata i zapamćena)", () => {
    const base = { profileId: "me", areas: AREAS };
    expect(defaultTaskDraft({ ...base, presetAreaId: "obrisana", rememberedAreaId: "a-mkt" }).areaId).toBe("a-mkt");
    expect(defaultTaskDraft({ ...base, rememberedAreaId: "obrisana" }).areaId).toBe("a-dev");
  });

  test("startup bez oblasti: oblast je null", () => {
    expect(defaultTaskDraft({ profileId: "me", areas: [], presetAreaId: "a-dev" }).areaId).toBeNull();
  });

  test("svaki poziv daje nov niz izvršilaca (izmena nacrta ne kvari sledeći)", () => {
    const first = defaultTaskDraft({ profileId: "me", areas: AREAS });
    first.assigneeProfileIds.push("ana");
    expect(defaultTaskDraft({ profileId: "me", areas: AREAS }).assigneeProfileIds).toEqual(["me"]);
  });
});

describe("polja za createPage", () => {
  test("podrazumevan nacrt šalje status, prioritet i mene kao izvršioca — bez roka i dodataka", () => {
    expect(taskCreateFields(draft())).toEqual({
      taskStatus: "backlog",
      taskPriority: "medium",
      assigneeProfileIds: ["me"],
    });
  });

  test("bez izvršilaca se polje ne šalje (kao do sada)", () => {
    expect(taskCreateFields(draft({ assigneeProfileIds: [] }))).not.toHaveProperty("assigneeProfileIds");
  });

  test("rok ide kao lokalno podne koje je birač dao", () => {
    const due = noonOfDayKey("2026-10-28", "Europe/Belgrade");
    expect(taskCreateFields(draft({ dueDate: due })).dueDate).toBe(due);
  });

  test("instrukcije: obrezane, prazne se ne šalju, sečene na granicu servera", () => {
    expect(taskCreateFields(draft({ instructions: "   " }))).not.toHaveProperty("instructions");
    expect(taskCreateFields(draft({ instructions: "  Pošalji ponudu  " })).instructions).toBe("Pošalji ponudu");
    const long = "x".repeat(TASK_CREATE_INSTRUCTIONS_MAX + 5);
    expect(taskCreateFields(draft({ instructions: long })).instructions).toHaveLength(TASK_CREATE_INSTRUCTIONS_MAX);
  });

  test("koraci: prazni se izbacuju, bez koraka se polje ne šalje", () => {
    expect(taskCreateFields(draft({ checkpoints: [{ id: "c1", text: "  ", completed: false }] }))).not.toHaveProperty(
      "checkpoints",
    );
    expect(
      taskCreateFields(
        draft({
          checkpoints: [
            { id: "c1", text: " Nacrt ", completed: false },
            { id: "c2", text: "", completed: false },
          ],
        }),
      ).checkpoints,
    ).toEqual([{ id: "c1", text: "Nacrt", completed: false }]);
  });

  test("izmenjeni čipovi idu takvi kakvi su", () => {
    expect(
      taskCreateFields(draft({ status: "in_progress", priority: "urgent", assigneeProfileIds: ["ana", "me"] })),
    ).toMatchObject({ taskStatus: "in_progress", taskPriority: "urgent", assigneeProfileIds: ["ana", "me"] });
  });
});

describe("čipovi", () => {
  const names = new Map([
    ["me", "Jovan Milojević"],
    ["ana", "Ana Ilić"],
    ["luka", "Luka Đorđević"],
  ]);

  test("tekst izvršilaca", () => {
    expect(assigneesChipValue([], "me", names)).toBe("Niko");
    expect(assigneesChipValue(["me"], "me", names)).toBe("Ja");
    expect(assigneesChipValue(["ana", "me", "luka"], "me", names)).toBe("Ja + 2");
    expect(assigneesChipValue(["ana"], "me", names)).toBe("Ana Ilić");
    expect(assigneesChipValue(["ana", "luka"], "me", names)).toBe("Ana Ilić + 1");
    expect(assigneesChipValue(["nepoznat"], "me", names)).toBe("1 član");
  });

  test("izbor izvršilaca poštuje granicu od 10", () => {
    expect(toggleTaskAssignee(["me"], "ana")).toEqual(["me", "ana"]);
    expect(toggleTaskAssignee(["me", "ana"], "me")).toEqual(["ana"]);
    const full = Array.from({ length: TASK_CREATE_MAX_ASSIGNEES }, (_, index) => `p${index}`);
    expect(toggleTaskAssignee(full, "novi")).toEqual(full);
    expect(toggleTaskAssignee(full, "p3")).toHaveLength(TASK_CREATE_MAX_ASSIGNEES - 1);
  });

  test("broj popunjenih polja iza „Više opcija\"", () => {
    expect(taskCreateExtrasCount(draft())).toBe(0);
    expect(taskCreateExtrasCount(draft({ instructions: "x" }))).toBe(1);
    expect(
      taskCreateExtrasCount(draft({ instructions: "x", checkpoints: [{ id: "c", text: "a", completed: false }] })),
    ).toBe(2);
  });
});
