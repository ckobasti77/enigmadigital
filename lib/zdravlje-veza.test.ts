import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  OCEKIVANI_RAZMAK_H,
  PODACI_KRITICNO_MS,
  PODACI_STARI_MS,
  TOKEN_ISTICE_MS,
  TOKEN_KRITICNO_MS,
  ZAGLAVLJEN_MS,
  najgoraVeza,
  pragoviStarosti,
  razlogZdravlja,
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
    // C16: token za ≤ 2 dana je crven, pa „ističe“ ovde znači za 5 dana.
    const istice = { ...zdrava, expiresAt: SADA + 5 * 24 * SAT };
    const greska = { ...zdrava, status: "error" as const };
    expect(zdravljeProjekta([zdrava, istice], SADA)).toBe("upozorenje");
    expect(zdravljeProjekta([istice, greska, zdrava], SADA)).toBe("greska");
  });

  test("C16: crveno za token pred istekom (≤ 2 dana) i istekao token", () => {
    expect(TOKEN_KRITICNO_MS).toBe(2 * 24 * SAT);
    expect(zdravljeProjekta([{ ...zdrava, expiresAt: SADA + 24 * SAT }], SADA)).toBe("greska");
    expect(zdravljeProjekta([{ ...zdrava, expiresAt: SADA + 2 * 24 * SAT }], SADA)).toBe("greska");
    expect(zdravljeProjekta([{ ...zdrava, expiresAt: SADA + 3 * 24 * SAT }], SADA)).toBe("upozorenje");
    expect(zdravljeProjekta([{ ...zdrava, expiresAt: SADA - SAT }], SADA)).toBe("greska");
    expect(razlogZdravlja({ ...zdrava, expiresAt: SADA + 9 * 24 * SAT }, SADA)).toEqual({
      stanje: "upozorenje",
      razlog: "token_istice",
      za: 9,
    });
    expect(razlogZdravlja({ ...zdrava, expiresAt: SADA - SAT }, SADA).razlog).toBe("token_istekao");
    expect(razlogZdravlja({ ...zdrava, status: "expired" }, SADA).razlog).toBe("token_istekao");
    expect(razlogZdravlja({ ...zdrava, status: "error" }, SADA).razlog).toBe("greska_veze");
  });

  test("C16: stari podaci — žuto posle max(24 h, 2 × razmak), crveno posle max(72 h, 4 × razmak)", () => {
    expect(PODACI_KRITICNO_MS).toBe(72 * SAT);
    const stara = (provider: string, sati: number): VezaZaZdravlje => ({
      provider,
      status: "active",
      lastSyncAt: SADA - sati * SAT,
      poslednjiProlaz: { status: "ok", startedAt: SADA - sati * SAT, finishedAt: SADA - sati * SAT },
    });
    // GA4 (6 h): 24 h je granica žutog, 72 h crvenog.
    expect(zdravljeProjekta([stara("ga4", 23)], SADA)).toBe("ok");
    expect(zdravljeProjekta([stara("ga4", 30)], SADA)).toBe("upozorenje");
    expect(zdravljeProjekta([stara("ga4", 73)], SADA)).toBe("greska");
    expect(razlogZdravlja(stara("ga4", 73), SADA)).toEqual({
      stanje: "greska",
      razlog: "stari_podaci",
      za: 73,
    });
    // Threads se sinhronizuje jednom dnevno: žuto tek posle 48 h, crveno posle 96 h.
    expect(OCEKIVANI_RAZMAK_H.threads).toBe(24);
    expect(zdravljeProjekta([stara("threads", 30)], SADA)).toBe("ok");
    expect(zdravljeProjekta([stara("threads", 50)], SADA)).toBe("upozorenje");
    expect(zdravljeProjekta([stara("threads", 90)], SADA)).toBe("upozorenje");
    expect(zdravljeProjekta([stara("threads", 97)], SADA)).toBe("greska");
    // Bez redovnog prolaza (lead mašina, Google Business): starost se ne meri.
    expect(pragoviStarosti("leads")).toBeNull();
    expect(pragoviStarosti("google_business")).toBeNull();
    expect(zdravljeProjekta([stara("leads", 500)], SADA)).toBe("ok");
    // Bez provajdera važi donja granica (kao pre C16).
    expect(pragoviStarosti(undefined)).toEqual({ zuto: 24 * SAT, crveno: 72 * SAT });
  });

  test("C16: najgora veza nosi razlog za liniju ispod imena projekta", () => {
    const ga4 = { ...zdrava, provider: "ga4" };
    const ig = { ...zdrava, provider: "meta_ig", expiresAt: SADA + 9 * 24 * SAT };
    const prekid = { ...zdrava, provider: "youtube", status: "disconnecting" as const };
    expect(najgoraVeza([], SADA)).toBeNull();
    expect(najgoraVeza([prekid], SADA)).toBeNull();
    const n = najgoraVeza([ga4, ig, prekid], SADA);
    expect(n?.veza.provider).toBe("meta_ig");
    expect(n?.zdravlje.razlog).toBe("token_istice");
  });
});
