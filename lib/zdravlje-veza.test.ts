import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  PODACI_STARI_MS,
  TOKEN_ISTICE_MS,
  ZAGLAVLJEN_MS,
  zdravljeProjekta,
  type VezaZaZdravlje,
} from "../convex/lib/zdravljeVeza";
import { TOKEN_EXPIRY_WARNING_MS } from "./token-expiry";

const SAT = 60 * 60 * 1000;
const SADA = 1_760_000_000_000;

const zdrava: VezaZaZdravlje = {
  status: "active",
  lastSyncAt: SADA - SAT,
  poslednjiProlaz: { status: "ok", startedAt: SADA - SAT - 5000, finishedAt: SADA - SAT },
};

describe("zdravljeProjekta (tačka u biraču projekta)", () => {
  test("pragovi su isti kao na frontu", () => {
    expect(TOKEN_ISTICE_MS).toBe(TOKEN_EXPIRY_WARNING_MS);
    // `lib/channel-readiness.ts` uvozi `@/`, pa se vrednost čita iz izvora.
    const izvor = readFileSync(
      fileURLToPath(new URL("./channel-readiness.ts", import.meta.url)),
      "utf8",
    );
    expect(izvor).toMatch(/export const SYNC_FRESH_MS = 24 \* HOUR;/);
    expect(PODACI_STARI_MS).toBe(24 * SAT);
    expect(ZAGLAVLJEN_MS).toBe(15 * 60 * 1000);
  });

  test("bez veza i samo veza u prekidu → bez_veza", () => {
    expect(zdravljeProjekta([], SADA)).toBe("bez_veza");
    expect(
      zdravljeProjekta([{ status: "disconnecting", poslednjiProlaz: null }], SADA),
    ).toBe("bez_veza");
  });

  test("sveža veza → ok; veza bez ijednog prolaza nije zastoj", () => {
    expect(zdravljeProjekta([zdrava], SADA)).toBe("ok");
    expect(zdravljeProjekta([{ status: "active", poslednjiProlaz: null }], SADA)).toBe("ok");
  });

  test("greška: status veze ili pao prolaz posle kog ništa nije stiglo", () => {
    expect(zdravljeProjekta([{ ...zdrava, status: "error" }], SADA)).toBe("greska");
    expect(zdravljeProjekta([{ ...zdrava, status: "expired" }], SADA)).toBe("greska");
    const pao = { status: "error" as const, startedAt: SADA - 2 * SAT, finishedAt: SADA - 2 * SAT + 10 };
    expect(
      zdravljeProjekta([{ status: "active", lastSyncAt: SADA - 3 * SAT, poslednjiProlaz: pao }], SADA),
    ).toBe("greska");
    // Posle pada je ipak stiglo nešto svežije → kvar je prošao (isto kao zvono).
    expect(
      zdravljeProjekta([{ status: "active", lastSyncAt: SADA - SAT, poslednjiProlaz: pao }], SADA),
    ).toBe("ok");
  });

  test("upozorenje: token ističe, zaglavljen prolaz, stari podaci", () => {
    expect(
      zdravljeProjekta([{ ...zdrava, expiresAt: SADA + 3 * 24 * SAT }], SADA),
    ).toBe("upozorenje");
    expect(
      zdravljeProjekta([{ ...zdrava, expiresAt: SADA + 30 * 24 * SAT }], SADA),
    ).toBe("ok");
    expect(
      zdravljeProjekta(
        [{ status: "active", poslednjiProlaz: { status: "running", startedAt: SADA - 20 * 60 * 1000 } }],
        SADA,
      ),
    ).toBe("upozorenje");
    // Prolaz u toku kraći od praga (i prvo povezivanje bez `lastSyncAt`) je u redu.
    expect(
      zdravljeProjekta(
        [{ status: "active", poslednjiProlaz: { status: "running", startedAt: SADA - 60 * 1000 } }],
        SADA,
      ),
    ).toBe("ok");
    expect(
      zdravljeProjekta(
        [
          {
            status: "active",
            lastSyncAt: SADA - 30 * SAT,
            poslednjiProlaz: { status: "ok", startedAt: SADA - 30 * SAT, finishedAt: SADA - 30 * SAT },
          },
        ],
        SADA,
      ),
    ).toBe("upozorenje");
  });

  test("najgora veza pobeđuje", () => {
    const istice = { ...zdrava, expiresAt: SADA + 24 * SAT };
    const greska = { ...zdrava, status: "error" as const };
    expect(zdravljeProjekta([zdrava, istice], SADA)).toBe("upozorenje");
    expect(zdravljeProjekta([istice, greska, zdrava], SADA)).toBe("greska");
  });
});
