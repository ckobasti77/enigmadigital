// Preneto iz Devotion packages/backend/convex/idea-stages-parity.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, it } from "vitest";

// Serverska kopija (backend ne uvozi `@devotion/shared`)…
import {
  IDEA_CONVERT_MESSAGE,
  IDEA_CONVERT_STAGE_MESSAGE,
  IDEA_CONVERTED_MESSAGE,
  IDEA_STAGE_CHANGE_MESSAGE,
  IDEA_STAGE_LABELS,
  ideaDisplayStage,
  ideaStoredStage,
} from "./lib/idea_stages";
// …i klijentska koja mora da kaže isto.
import {
  IDEA_CONVERT_REASON,
  IDEA_CONVERT_STAGE_REASON,
  IDEA_CONVERTED_REASON,
  IDEA_STAGE_CHANGE_REASON,
  IDEA_STAGE_LABELS as SHARED_IDEA_STAGE_LABELS,
  IDEA_STAGE_ORDER,
  IDEA_STORED_STAGES,
  ideaDisplayStage as sharedIdeaDisplayStage,
} from "../../lib/prostor/idea-stages";
import { ideaStageValidator } from "./lib/validators";

/**
 * Straža protiv razilaženja (PROSTOR P6): server čuva i odlučuje fazu, a
 * klijenti iz shared kopije crtaju nazive, kolone i razloge. Ako se raziđu,
 * tabla bi prikazala fazu koju server ne zna ili poruku koja ne odgovara grešci.
 */
describe("faze ideje: server = shared", () => {
  it("iste sačuvane faze kao validator šeme", () => {
    const schemaStages = ideaStageValidator.members.map((member) => member.value);
    expect([...IDEA_STORED_STAGES].sort()).toEqual([...schemaStages].sort());
  });

  it("isti nazivi i ista izvedena faza", () => {
    expect(IDEA_STAGE_LABELS).toEqual(SHARED_IDEA_STAGE_LABELS);
    expect(Object.keys(IDEA_STAGE_LABELS).sort()).toEqual([...IDEA_STAGE_ORDER].sort());
    for (const stage of [undefined, ...IDEA_STORED_STAGES]) {
      for (const convertedPageId of [null, "p1"]) {
        const idea = { stage, convertedPageId };
        expect(ideaDisplayStage(idea)).toBe(sharedIdeaDisplayStage(idea));
      }
      expect(ideaStoredStage({ stage })).toBe(stage ?? "predlog");
    }
  });

  it("iste poruke grešaka i razlozi", () => {
    expect(IDEA_STAGE_CHANGE_MESSAGE).toBe(IDEA_STAGE_CHANGE_REASON);
    expect(IDEA_CONVERT_MESSAGE).toBe(IDEA_CONVERT_REASON);
    expect(IDEA_CONVERT_STAGE_MESSAGE).toBe(IDEA_CONVERT_STAGE_REASON);
    expect(IDEA_CONVERTED_MESSAGE).toBe(IDEA_CONVERTED_REASON);
  });
});
