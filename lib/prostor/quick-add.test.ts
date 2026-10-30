// Preneto iz Devotion packages/shared/src/quick-add.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { dueShortcutValue, noonOfDayKey, startOfDayKey } from "./dates";
import {
  cleanQuickAddTitle,
  defaultAddToMyDay,
  lastAreaKey,
  matchDueShortcut,
  NO_AREA_REASON,
  parseStoredDestination,
  QUICK_ADD_TITLE_MAX,
  quickAddCall,
  quickAddNoteCall,
  quickAddNoteSuccessMessage,
  quickAddSuccessMessage,
  resolveArea,
  resolveDestination,
  serializeDestination,
  type QuickAddStartup,
} from "./quick-add";

const BG = "Europe/Belgrade";
const TODAY = "2026-10-24"; // subota
const NOW = startOfDayKey(TODAY, BG) + 9.5 * 3_600_000;
const noon = (key: string) => noonOfDayKey(key, BG);

const STARTUPS: QuickAddStartup[] = [
  {
    _id: "s1",
    name: "Cluck Rush",
    areas: [
      { _id: "a-dev", label: "Dev" },
      { _id: "a-mkt", label: "Marketing" },
    ],
  },
  { _id: "s2", name: "Scan Me", areas: [] },
];

describe("odredište brzog unosa", () => {
  test("podrazumevano je Lično", () => {
    expect(resolveDestination(null, STARTUPS)).toEqual({ kind: "personal" });
    expect(resolveDestination({ kind: "personal" }, STARTUPS)).toEqual({ kind: "personal" });
  });

  test("zapamćen startup sa zapamćenom oblašću; inače prva oblast", () => {
    expect(
      resolveDestination({ kind: "startup", workspaceId: "s1" }, STARTUPS, {
        rememberedArea: () => "a-mkt",
      }),
    ).toEqual({ kind: "startup", workspaceId: "s1", areaId: "a-mkt" });
    expect(resolveDestination({ kind: "startup", workspaceId: "s1" }, STARTUPS)).toEqual({
      kind: "startup",
      workspaceId: "s1",
      areaId: "a-dev",
    });
  });

  test("zapamćen startup koji više nije u listi pada na Lično", () => {
    expect(resolveDestination({ kind: "startup", workspaceId: "nema" }, STARTUPS)).toEqual({
      kind: "personal",
    });
  });

  test("preset (startup u kome si) pobeđuje zapamćen izbor; nepostojeći preset se preskače", () => {
    expect(
      resolveDestination({ kind: "personal" }, STARTUPS, { preset: { workspaceId: "s1", areaId: "a-mkt" } }),
    ).toEqual({ kind: "startup", workspaceId: "s1", areaId: "a-mkt" });
    expect(
      resolveDestination({ kind: "startup", workspaceId: "s1" }, STARTUPS, { preset: { workspaceId: "nema" } }),
    ).toEqual({ kind: "startup", workspaceId: "s1", areaId: "a-dev" });
  });

  test("startup bez oblasti: oblast je null", () => {
    expect(resolveDestination({ kind: "startup", workspaceId: "s2" }, STARTUPS)).toEqual({
      kind: "startup",
      workspaceId: "s2",
      areaId: null,
    });
  });

  test("oblast: zadata → zapamćena → prva; strana oblast se ignoriše", () => {
    expect(resolveArea(STARTUPS[0], "a-mkt", "a-dev")).toBe("a-dev");
    expect(resolveArea(STARTUPS[0], "a-mkt")).toBe("a-mkt");
    expect(resolveArea(STARTUPS[0], "tuđa", "tuđa")).toBe("a-dev");
    expect(resolveArea(STARTUPS[1], "a-dev")).toBeNull();
  });

  test("skladište: zapis i čitanje, pokvaren zapis = ništa", () => {
    const raw = serializeDestination({ kind: "startup", workspaceId: "s1", areaId: "a-dev" });
    expect(JSON.parse(raw)).toEqual({ kind: "startup", workspaceId: "s1" });
    expect(parseStoredDestination(raw)).toEqual({ kind: "startup", workspaceId: "s1" });
    expect(parseStoredDestination(serializeDestination({ kind: "personal" }))).toEqual({ kind: "personal" });
    for (const broken of [null, "", "{", "[]", "null", '{"kind":"startup"}', '{"kind":"x"}']) {
      expect(parseStoredDestination(broken)).toBeNull();
    }
    expect(lastAreaKey("s1")).toBe("enigma:quick-add:area:s1");
  });
});

describe("rok i Moj dan", () => {
  test("„Dodaj i u Moj dan“ je uključeno samo kad je rok danas", () => {
    expect(defaultAddToMyDay(noon(TODAY), NOW, BG)).toBe(true);
    expect(defaultAddToMyDay(noon("2026-10-25"), NOW, BG)).toBe(false);
    expect(defaultAddToMyDay(noon("2026-10-23"), NOW, BG)).toBe(false);
    expect(defaultAddToMyDay(null, NOW, BG)).toBe(false);
  });

  test("izabran čip roka", () => {
    expect(matchDueShortcut(dueShortcutValue("today", NOW, BG), NOW, BG)).toBe("today");
    expect(matchDueShortcut(dueShortcutValue("tomorrow", NOW, BG), NOW, BG)).toBe("tomorrow");
    expect(matchDueShortcut(dueShortcutValue("nextWeek", NOW, BG), NOW, BG)).toBe("nextWeek");
    // Subota: „Vikend" je danas — prvi čip koji se poklapa je „Danas".
    expect(matchDueShortcut(dueShortcutValue("weekend", NOW, BG), NOW, BG)).toBe("today");
    expect(matchDueShortcut(noon("2026-11-20"), NOW, BG)).toBeNull();
    expect(matchDueShortcut(null, NOW, BG)).toBeNull();
  });
});

describe("naslov", () => {
  test("prazan = onemogućeno bez poruke; predug = poruka; razmaci se skidaju", () => {
    expect(cleanQuickAddTitle("   ")).toEqual({ ok: false, reason: null });
    expect(cleanQuickAddTitle("  Pozovi Milicu ")).toEqual({ ok: true, title: "Pozovi Milicu" });
    expect(cleanQuickAddTitle("x".repeat(QUICK_ADD_TITLE_MAX)).ok).toBe(true);
    expect(cleanQuickAddTitle("x".repeat(QUICK_ADD_TITLE_MAX + 1))).toEqual({
      ok: false,
      reason: "Naslov može imati najviše 200 znakova.",
    });
  });
});

describe("koji poziv pravi zadatak (E16)", () => {
  const context = { profileId: "me", dayKey: TODAY };

  test("Lično: personalTasks.create, sa ili bez Moj dan", () => {
    expect(
      quickAddCall(
        { title: " Račun ", destination: { kind: "personal" }, dueDate: noon(TODAY), addToMyDay: true },
        context,
      ),
    ).toEqual({
      fn: "personalTasks.create",
      args: { title: "Račun", dueDate: noon(TODAY), addToMyDay: { dayKey: TODAY } },
    });
    expect(
      quickAddCall({ title: "Račun", destination: { kind: "personal" }, dueDate: null, addToMyDay: false }, context),
    ).toEqual({ fn: "personalTasks.create", args: { title: "Račun", dueDate: null } });
  });

  test("Startup: pages.create (task, backlog, ja izvršilac), plan posle ako je čekirano", () => {
    expect(
      quickAddCall(
        {
          title: "Snimi reel",
          destination: { kind: "startup", workspaceId: "s1", areaId: "a-mkt" },
          dueDate: noon("2026-10-25"),
          addToMyDay: true,
        },
        context,
      ),
    ).toEqual({
      fn: "pages.create",
      args: {
        workspaceId: "s1",
        areaId: "a-mkt",
        parentPageId: null,
        kind: "task",
        title: "Snimi reel",
        taskStatus: "backlog",
        assigneeProfileIds: ["me"],
        dueDate: noon("2026-10-25"),
      },
      planDayKey: TODAY,
    });
    const noDue = quickAddCall(
      { title: "Snimi reel", destination: { kind: "startup", workspaceId: "s1", areaId: "a-mkt" }, dueDate: null, addToMyDay: false },
      context,
    );
    expect(noDue).toMatchObject({ fn: "pages.create", planDayKey: null });
    expect(noDue.fn === "pages.create" && "dueDate" in noDue.args).toBe(false);
  });

  test("neispravno: prazan naslov, predug naslov, startup bez oblasti", () => {
    expect(
      quickAddCall({ title: " ", destination: { kind: "personal" }, dueDate: null, addToMyDay: false }, context),
    ).toEqual({ fn: "invalid", reason: null });
    expect(
      quickAddCall(
        { title: "x".repeat(201), destination: { kind: "personal" }, dueDate: null, addToMyDay: false },
        context,
      ),
    ).toMatchObject({ fn: "invalid", reason: expect.stringContaining("200") });
    expect(
      quickAddCall(
        { title: "Faktura", destination: { kind: "startup", workspaceId: "s2", areaId: null }, dueDate: null, addToMyDay: false },
        context,
      ),
    ).toEqual({ fn: "invalid", reason: NO_AREA_REASON });
  });

  test("poruka uspeha", () => {
    expect(quickAddSuccessMessage({ kind: "personal" }, STARTUPS)).toBe("Dodato u Lično.");
    expect(quickAddSuccessMessage({ kind: "startup", workspaceId: "s1", areaId: "a-mkt" }, STARTUPS)).toBe(
      "Dodato u Cluck Rush · Marketing.",
    );
    expect(quickAddSuccessMessage({ kind: "startup", workspaceId: "s2", areaId: null }, STARTUPS)).toBe(
      "Dodato u Scan Me.",
    );
  });
});

describe("brzi unos: beleška (K18)", () => {
  test("poziv: lično → startupId null, startup → id; oblast se ne traži", () => {
    expect(quickAddNoteCall({ destination: { kind: "personal" }, text: "  zapis  " })).toEqual({
      fn: "thoughts.createNote",
      args: { workspaceId: null, text: "zapis" },
    });
    expect(
      quickAddNoteCall({ destination: { kind: "startup", workspaceId: "s2", areaId: null }, text: "ideja" }),
    ).toEqual({ fn: "thoughts.createNote", args: { workspaceId: "s2", text: "ideja" } });
  });

  test("prazan tekst nema poruke, predug ima", () => {
    expect(quickAddNoteCall({ destination: { kind: "personal" }, text: "   " })).toEqual({
      fn: "invalid",
      reason: null,
    });
    expect(
      quickAddNoteCall({ destination: { kind: "personal" }, text: "x".repeat(12_001) }),
    ).toMatchObject({ fn: "invalid", reason: expect.stringContaining("12.000") });
  });

  test("poruka uspeha", () => {
    expect(quickAddNoteSuccessMessage({ kind: "personal" }, STARTUPS)).toBe("Beleška je sačuvana u Lično.");
    expect(quickAddNoteSuccessMessage({ kind: "startup", workspaceId: "s1", areaId: null }, STARTUPS)).toBe(
      "Beleška je sačuvana u Cluck Rush.",
    );
  });
});
