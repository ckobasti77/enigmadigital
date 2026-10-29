// Preneto iz Devotion packages/backend/convex/crons.test.ts (main @ c05c40f), SPAJANJE S06.
import { describe, expect, test } from "vitest";

import crons from "../crons";
import { typeBreaksQuietHours } from "./lib/notificationChannels";
import { notificationTypeValidator } from "./lib/validators";

type Posao = { name: string };
const poslovi = crons.crons as Record<string, Posao>;

/**
 * PROSTOR P9: Puls je kartica, ne obaveštenje. Cron „nedeljni puls” je uklonjen;
 * tip `puls_ready` ostaje (postojeća obaveštenja se i dalje prikazuju i utišavaju).
 *
 * SPAJANJE S06 (plan S01 §9.6): poslovi žive u Enigminom `convex/crons.ts`, koji
 * ima i svoje poslove, pa test ne traži „samo jedan posao”, nego da posao
 * radnog dela postoji tačno jednom, pod svojim imenom.
 */
describe("crons", () => {
  test("registrovan je „podsetnici za rokove” radnog dela", () => {
    expect(Object.keys(poslovi)).toContain("podsetnici za rokove");
    expect(poslovi["podsetnici za rokove"].name).toBe(
      "prostor/notifications:remindDueTasks",
    );
    const radniDeo = Object.values(poslovi).filter((job) =>
      job.name.startsWith("prostor/"),
    );
    expect(radniDeo).toHaveLength(1);
  });

  test("nijedan cron ne poziva puls tima", () => {
    const targets = Object.values(poslovi).map((job) => job.name);
    expect(targets.some((name) => name.startsWith("prostor/puls:"))).toBe(false);
  });

  test("tip puls_ready ostaje u validatoru i katalogu podešavanja", () => {
    const types = notificationTypeValidator.members.map((member) => member.value);
    expect(types).toContain("puls_ready");
    expect(typeBreaksQuietHours("puls_ready")).toBe(false);
  });
});
