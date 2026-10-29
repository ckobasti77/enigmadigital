// Preneto iz Devotion apps/web/components/workspace/startup-tasks/command-center-model.test.ts (main @ c05c40f), SPAJANJE S12.
import { describe, expect, test } from "vitest";
import { locateStartupRow, type StartupTaskHold } from "..";

import {
  buildZones,
  COMMAND_CENTER_LIST,
  filterByMember,
  UNASSIGNED_KEY,
  workloadCounts,
  zoneRowCount,
  type CommandCenterAssignee,
  type CommandCenterTask,
} from "./command-center-model";

const NOW = new Date("2026-10-24T09:30:00").getTime();
const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
const STARTUP = { _id: "s1", name: "Cluck Rush", logoUrl: null };

const task = (overrides: Partial<CommandCenterTask> & { _id: string }): CommandCenterTask => ({
  areaId: "a-mkt",
  title: overrides._id,
  taskStatus: "next",
  taskPriority: "medium",
  dueDate: null,
  createdByProfileId: "ana",
  taskSortAt: 1,
  ...overrides,
});

const person = (profileId: string): CommandCenterAssignee => ({ profileId, displayName: profileId, avatarUrl: null });

const TASKS: CommandCenterTask[] = [
  task({ _id: "kasni", dueDate: noon("2026-10-22") }),
  task({ _id: "hitno", taskPriority: "urgent" }),
  task({ _id: "danas", dueDate: noon("2026-10-24") }),
  task({ _id: "sutra", dueDate: noon("2026-10-25") }),
  task({ _id: "bez-roka" }),
];

const ASSIGNEES = new Map<string, CommandCenterAssignee[]>([
  ["kasni", [person("me")]],
  ["hitno", [person("me"), person("ana")]],
  ["danas", [person("ana")]],
  ["sutra", []],
]);

const context = (overrides: Partial<Parameters<typeof buildZones>[1]> = {}): Parameters<typeof buildZones>[1] => ({
  now: NOW,
  profileId: "me",
  workspace: STARTUP,
  areaLabels: new Map([["a-mkt", "Marketing"]]),
  assigneesByTaskId: ASSIGNEES,
  plannedKeys: new Map([["task:danas", "e1"]]),
  holds: new Map(),
  pending: new Map(),
  ...overrides,
});

describe("zone Komandnog centra", () => {
  test("trijaža po zonama i redovi sa oblašću, planom i dozvolama", () => {
    const zones = buildZones(TASKS, context());
    expect(zones.map((zone) => [zone.id, zone.rows.map((row) => row.id)])).toEqual([
      ["gori", ["kasni", "hitno"]],
      ["zastarelo", []],
      ["danas", ["danas"]],
      ["nedelja", ["sutra"]],
      ["kasnije", ["bez-roka"]],
    ]);
    const [gori, , danas] = zones;
    expect(danas.rows[0]).toMatchObject({ areaLabel: "Marketing", planned: true, planEntryId: "e1" });
    // PROSTOR P1 (namerna promena pravila): otključan zadatak menja svaki član.
    expect(gori.rows[0].permissions.status.allowed).toBe(true);
    expect(gori.rows[0].permissions.due.allowed).toBe(true);
    expect(danas.rows[0].permissions.status.allowed).toBe(true);
    expect(zoneRowCount(zones)).toBe(5);
    // Zaključan: izvršilac (ja) sme status, ne i rok; tuđ zadatak je zaključan.
    const locked = buildZones(
      TASKS.map((item) => ({ ...item, lockedAt: 1 })),
      context(),
    );
    expect(locked[0].rows[0].permissions.status.allowed).toBe(true);
    expect(locked[0].rows[0].permissions.due.allowed).toBe(false);
    expect(locked[2].rows[0].permissions.status.allowed).toBe(false);
  });

  test("zastarelo (rok stariji od 14 dana) se izdvaja iz Gori, ostalo prekoračeno ostaje", () => {
    const zones = buildZones(
      [
        task({ _id: "juce", dueDate: noon("2026-10-23") }),
        task({ _id: "granica", dueDate: noon("2026-10-10") }),
        task({ _id: "staro", dueDate: noon("2026-10-09") }),
        task({ _id: "davno", dueDate: noon("2026-08-01"), taskStatus: "blocked" }),
        task({ _id: "hitno", taskPriority: "urgent" }),
      ],
      context(),
    );
    const byId = Object.fromEntries(zones.map((zone) => [zone.id, zone.rows.map((row) => row.id)]));
    expect(byId.gori).toEqual(expect.arrayContaining(["juce", "granica", "hitno"]));
    expect(byId.gori).toHaveLength(3);
    expect(byId.zastarelo).toEqual(expect.arrayContaining(["staro", "davno"]));
    expect(byId.zastarelo).toHaveLength(2);
    expect(zoneRowCount(zones)).toBe(5);
  });

  test("zaključan: dok se izvršioci učitavaju, niko osim kreatora ne menja status", () => {
    const zones = buildZones(
      [task({ _id: "x", createdByProfileId: "me", lockedAt: 1 }), task({ _id: "y", lockedAt: 1 })],
      context({ assigneesByTaskId: null }),
    );
    const rows = zones.flatMap((zone) => zone.rows);
    expect(rows.find((row) => row.id === "x")?.permissions.status.allowed).toBe(true);
    expect(rows.find((row) => row.id === "y")?.permissions.status.allowed).toBe(false);
  });

  test("završen zadatak ostaje u zoni dok traje zadržavanje, i kad ga server skloni", () => {
    const before = buildZones(TASKS, context());
    const location = locateStartupRow(COMMAND_CENTER_LIST, before, "task:kasni");
    expect(location).toEqual({ section: "zones:gori", index: 0 });
    const hold: StartupTaskHold = { section: location!.section, index: 0, row: before[0].rows[0], done: true };
    // Server je završen zadatak izbacio iz Komandnog centra.
    const after = buildZones(TASKS.slice(1), context({ holds: new Map([["task:kasni", hold]]) }));
    expect(after[0].rows.map((row) => [row.id, row.done])).toEqual([
      ["kasni", true],
      ["hitno", false],
    ]);
    // Posle zadržavanja red nestaje.
    expect(buildZones(TASKS.slice(1), context())[0].rows.map((row) => row.id)).toEqual(["hitno"]);
  });

  test("promena roka seli red u drugu zonu (optimistička slika → nova zona)", () => {
    const moved = TASKS.map((item) => (item._id === "bez-roka" ? { ...item, dueDate: noon("2026-10-24") } : item));
    const zones = buildZones(moved, context());
    expect(zones[2].rows.map((row) => row.id)).toEqual(["danas", "bez-roka"]);
    expect(zones[4].rows).toEqual([]);
  });
});

describe("filter člana i opterećenje", () => {
  test("svi, samo moji, nedodeljeni", () => {
    expect(filterByMember(TASKS, null, ASSIGNEES)).toHaveLength(5);
    expect(filterByMember(TASKS, "me", ASSIGNEES).map((item) => item._id)).toEqual(["kasni", "hitno"]);
    expect(filterByMember(TASKS, UNASSIGNED_KEY, ASSIGNEES).map((item) => item._id)).toEqual(["sutra", "bez-roka"]);
  });

  test("opterećenje broji svakog izvršioca; nedodeljeno samo kad postoji", () => {
    const counts = workloadCounts(TASKS, ["me", "ana", "luka"], ASSIGNEES, NOW);
    expect(counts).toEqual([
      { key: "me", open: 2, overdue: 1, urgent: 1 },
      { key: "ana", open: 2, overdue: 0, urgent: 1 },
      { key: "luka", open: 0, overdue: 0, urgent: 0 },
      { key: UNASSIGNED_KEY, open: 2, overdue: 0, urgent: 0 },
    ]);
    const allAssigned = workloadCounts(TASKS.slice(0, 3), ["me", "ana"], ASSIGNEES, NOW);
    expect(allAssigned.map((entry) => entry.key)).toEqual(["me", "ana"]);
  });
});
