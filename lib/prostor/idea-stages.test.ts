// Preneto iz Devotion packages/shared/src/idea-stages.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  groupIdeasByStage,
  IDEA_BOARD_COLUMNS,
  IDEA_CONVERT_REASON,
  IDEA_CONVERT_STAGE_REASON,
  IDEA_CONVERTED_REASON,
  IDEA_STAGE_CHANGE_REASON,
  IDEA_STAGE_LABELS,
  IDEA_STAGE_ORDER,
  IDEA_STORED_STAGES,
  ideaDisplayStage,
  ideaStagePermissions,
  stageTargets,
} from "./idea-stages";

describe("faze ideje", () => {
  test("odsutna faza je Predlog, a pretvorena ideja pobeđuje svaku fazu", () => {
    expect(ideaDisplayStage({ convertedPageId: null })).toBe("predlog");
    expect(ideaDisplayStage({ stage: null, convertedPageId: null })).toBe("predlog");
    for (const stage of IDEA_STORED_STAGES) {
      expect(ideaDisplayStage({ stage, convertedPageId: null })).toBe(stage);
      expect(ideaDisplayStage({ stage, convertedPageId: "p1" })).toBe("postalo_zadatak");
    }
  });

  test("nazivi i redosled kolona", () => {
    expect(IDEA_STAGE_ORDER.map((stage) => IDEA_STAGE_LABELS[stage])).toEqual([
      "Predlog",
      "Razmatra se",
      "Odobreno",
      "Postalo zadatak",
      "Odbijeno",
    ]);
    expect(IDEA_BOARD_COLUMNS).toEqual(["predlog", "razmatra_se", "odobreno", "postalo_zadatak"]);
    expect(IDEA_STORED_STAGES).not.toContain("postalo_zadatak");
  });

  test("prelazi: svaka sačuvana faza u svaku drugu; pretvorena nigde", () => {
    expect(stageTargets("predlog")).toEqual(["razmatra_se", "odobreno", "odbijeno"]);
    expect(stageTargets("odbijeno")).toEqual(["predlog", "razmatra_se", "odobreno"]);
    expect(stageTargets("postalo_zadatak")).toEqual([]);
  });

  test("grupisanje po prikazanoj fazi čuva ulazni redosled", () => {
    const ideas = [
      { id: "a", convertedPageId: null },
      { id: "b", stage: "odobreno" as const, convertedPageId: null },
      { id: "c", stage: "odobreno" as const, convertedPageId: "p1" },
      { id: "d", stage: "razmatra_se" as const, convertedPageId: null },
      { id: "e", stage: "odobreno" as const, convertedPageId: null },
      { id: "f", stage: "odbijeno" as const, convertedPageId: null },
    ];
    const groups = groupIdeasByStage(ideas);
    expect(Object.fromEntries(
      Object.entries(groups).map(([stage, items]) => [stage, items.map((item) => item.id)]),
    )).toEqual({
      predlog: ["a"],
      razmatra_se: ["d"],
      odobreno: ["b", "e"],
      postalo_zadatak: ["c"],
      odbijeno: ["f"],
    });
    expect(groupIdeasByStage([]).predlog).toEqual([]);
  });
});

describe("ko sme da menja fazu i da pretvori", () => {
  test("autor ili menadžer menja fazu; član ne", () => {
    const base = { stage: "predlog" as const, convertedPageId: null };
    expect(ideaStagePermissions({ ...base, isAuthor: true, isManager: false }).setStage).toEqual({ allowed: true });
    expect(ideaStagePermissions({ ...base, isAuthor: false, isManager: true }).setStage).toEqual({ allowed: true });
    expect(ideaStagePermissions({ ...base, isAuthor: false, isManager: false }).setStage).toEqual({
      allowed: false,
      reason: IDEA_STAGE_CHANGE_REASON,
    });
  });

  test("„Pretvori” samo u fazi Odobreno i samo autor ili menadžer", () => {
    const approved = { stage: "odobreno" as const, convertedPageId: null };
    expect(ideaStagePermissions({ ...approved, isAuthor: true, isManager: false }).convert).toEqual({ allowed: true });
    expect(ideaStagePermissions({ ...approved, isAuthor: false, isManager: true }).convert).toEqual({ allowed: true });
    expect(ideaStagePermissions({ ...approved, isAuthor: false, isManager: false }).convert).toEqual({
      allowed: false,
      reason: IDEA_CONVERT_REASON,
    });
    for (const stage of ["predlog", "razmatra_se", "odbijeno", null, undefined] as const) {
      expect(
        ideaStagePermissions({ stage, convertedPageId: null, isAuthor: true, isManager: true }).convert,
      ).toEqual({ allowed: false, reason: IDEA_CONVERT_STAGE_REASON });
    }
  });

  test("pretvorena ideja: niko ne menja fazu ni ne pretvara ponovo", () => {
    const result = ideaStagePermissions({
      stage: "odobreno",
      convertedPageId: "p1",
      isAuthor: true,
      isManager: true,
    });
    expect(result).toEqual({
      setStage: { allowed: false, reason: IDEA_CONVERTED_REASON },
      convert: { allowed: false, reason: IDEA_CONVERTED_REASON },
    });
  });
});
