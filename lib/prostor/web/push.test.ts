// SPAJANJE S17: stanje prekidača za web push i pretvaranje VAPID ključa.
import { describe, expect, test } from "vitest";

import {
  PUSH_TEKST,
  base64UrlUBajtove,
  mozeUkljuciti,
  pushPodesen,
  stanjePusha,
  type PushState,
} from "./push";

const osnova = { podrzano: true, javniKljuc: "BKey", dozvola: "default" as const, pretplacen: false };

describe("stanjePusha", () => {
  test("bez podrške pregledača, pa bez ključa — redom provera", () => {
    expect(stanjePusha({ ...osnova, podrzano: false, javniKljuc: "" })).toBe("unsupported");
    expect(stanjePusha({ ...osnova, javniKljuc: "" })).toBe("unconfigured");
    expect(stanjePusha({ ...osnova, javniKljuc: "   " })).toBe("unconfigured");
  });

  test("dozvola i pretplata", () => {
    expect(stanjePusha({ ...osnova, dozvola: "denied" })).toBe("blocked");
    expect(stanjePusha(osnova)).toBe("idle");
    expect(stanjePusha({ ...osnova, dozvola: "granted" })).toBe("permitted");
    expect(stanjePusha({ ...osnova, dozvola: "granted", pretplacen: true })).toBe("enabled");
  });

  test("uključuje se samo iz idle i permitted", () => {
    const sva: PushState[] = ["unsupported", "unconfigured", "checking", "idle", "permitted", "enabled", "blocked"];
    expect(sva.filter(mozeUkljuciti)).toEqual(["idle", "permitted"]);
  });

  test("bez ključa nema teksta (prekidač se ne crta)", () => {
    expect(PUSH_TEKST.unconfigured).toBeNull();
    expect(PUSH_TEKST.checking).toBeNull();
    expect(pushPodesen(undefined)).toBe(false);
    expect(pushPodesen("")).toBe(false);
    expect(pushPodesen("BKey")).toBe(true);
  });
});

describe("base64UrlUBajtove", () => {
  test("dopuna i base64url znaci", () => {
    // „-_“ u base64url je „+/“ u base64: bajtovi 0xfb 0xff.
    expect(Array.from(base64UrlUBajtove("-_8"))).toEqual([0xfb, 0xff]);
    expect(Array.from(base64UrlUBajtove("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(base64UrlUBajtove("AQ"))).toEqual([1]);
  });
});
