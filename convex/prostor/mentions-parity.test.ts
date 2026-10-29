// Preneto iz Devotion packages/backend/convex/mentions-parity.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, it } from "vitest";

// Serverska granica (backend ne uvozi `@devotion/shared`)…
import { MAX_COMMENT_MENTIONS } from "./lib/validators";
// …i klijentska kopija koja mora da bude jednaka.
import { MAX_COMMENT_MENTIONS as SHARED_MAX_COMMENT_MENTIONS } from "../../lib/prostor/mentions";

/**
 * Straža protiv razilaženja: klijent seče pominjanja na `MAX_COMMENT_MENTIONS`
 * iz shared `mentions.ts`, a server ih odbija iznad `lib/validators.ts`. Ako se
 * razlikuju, komentar sa dozvoljenim brojem pominjanja bi pao na serveru.
 */
describe("pominjanja: server = shared", () => {
  it("najveći broj pominjanja po komentaru je isti", () => {
    expect(MAX_COMMENT_MENTIONS).toBe(SHARED_MAX_COMMENT_MENTIONS);
  });
});
