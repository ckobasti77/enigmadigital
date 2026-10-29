// Preneto iz Devotion packages/shared/src/startup-chip.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { STARTUP_TONES, startupInitials, startupTone } from "./startup-chip";

describe("čip startupa", () => {
  const names = [
    "Cluck Rush",
    "Silly Handyman",
    "Beauty Masterclass",
    "Enigma IT",
    "Scan Me",
    "Nauči AI",
  ];

  test("ton je stabilan, u opsegu i ne zavisi od velikih slova i razmaka", () => {
    for (const name of names) {
      const tone = startupTone(name);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(STARTUP_TONES);
      expect(Number.isInteger(tone)).toBe(true);
      expect(startupTone(name)).toBe(tone);
      expect(startupTone(`  ${name.toUpperCase()} `)).toBe(tone);
    }
  });

  test("različita imena se raspoređuju na više tonova", () => {
    expect(new Set(names.map(startupTone)).size).toBeGreaterThan(2);
  });

  test("inicijali: dve reči, jedna reč, dijakritika, prazno", () => {
    expect(names.map(startupInitials)).toEqual(["CR", "SH", "BM", "EI", "SM", "NA"]);
    expect(startupInitials("Enigma")).toBe("EN");
    expect(startupInitials("čvor")).toBe("ČV");
    expect(startupInitials("ćup đak žar")).toBe("ĆĐ");
    expect(startupInitials("A")).toBe("A");
    expect(startupInitials("   ")).toBe("?");
  });
});
