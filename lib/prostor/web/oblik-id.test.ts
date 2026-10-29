import { describe, expect, test } from "vitest";
import { jeOblikId } from "./oblik-id";

describe("oblik ID-ja u adresi (plan S07 §1.1)", () => {
  test("pravi i lažni ID-jevi prolaze", () => {
    for (const id of ["areasux0001", "pagesux0001", "k57a9b2c3d4e5f6g7h8j9k0m", "ABCdef1234"]) {
      expect(jeOblikId(id), id).toBe(true);
    }
  });

  test("kratak ID, znaci van slova i cifara i prazno ne prolaze", () => {
    for (const id of ["", "abc", "abc123456", "areas_ux_0001", "../etc", "a b c d e f g", "čćžšđ123456"]) {
      expect(jeOblikId(id), id).toBe(false);
    }
  });
});
