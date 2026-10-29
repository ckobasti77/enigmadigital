// Preneto iz Devotion packages/backend/convex/activity-format-parity.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, it } from "vitest";

import { ACTIVITY_ACTIONS, activityTarget } from "../../lib/prostor/activity-format";
import schema from "../schema";

/**
 * Straža protiv razilaženja (PROSTOR P24): backend dodaje radnje u šemu, a
 * klijenti ih iz shared `formatActivity` pretvaraju u rečenice. Nova radnja bez
 * rečenice bi se u „Nedavnim izmenama” prikazala kao rezervni „Ime · title”.
 */
describe("activity-format ↔ šema", () => {
  const fields = schema.tables.activities.validator.fields;

  it("shared zna tačno one radnje koje šema dozvoljava", () => {
    const schemaActions = fields.action.members.map((member) => member.value);
    expect([...ACTIVITY_ACTIONS].sort()).toEqual([...schemaActions].sort());
  });

  it("svaki ciljni tip iz šeme ima definisano ponašanje klika", () => {
    const kinds = fields.targetType.members.map((member) => ({
      type: member.value as string,
      kind: activityTarget({ targetType: member.value as string, targetId: "x" })
        .kind,
    }));
    // Samo stranica, ideja i oblast vode negde; ostalo je „none”.
    expect(kinds.filter((entry) => entry.kind !== "none").map((e) => e.type).sort()).toEqual(
      ["area", "idea", "page"],
    );
  });
});
