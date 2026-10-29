import { describe, expect, it } from "vitest";

import { vidiKarticu, type KarticaPodesavanja } from "./kartice-podesavanja";

const SVE: KarticaPodesavanja[] = [
  "integracije",
  "projekat",
  "oblasti",
  "sajt",
  "mozak",
  "ai",
  "pristup",
  "lozinke",
  "istorija",
  "moderacija",
  "napredak",
];

const vidljive = (uloga: Parameters<typeof vidiKarticu>[1], platforma: boolean) =>
  SVE.filter((k) => vidiKarticu(k, uloga, platforma));

describe("kartice podešavanja po ulozi", () => {
  it("vlasnik projekta koji je i vlasnik platforme vidi sve", () => {
    expect(vidljive("owner", true)).toEqual(SVE);
  });

  it("vlasnik projekta bez platforme ne vidi Lozinke i AI", () => {
    const k = vidljive("owner", false);
    expect(k).not.toContain("lozinke");
    expect(k).not.toContain("ai");
    expect(k).toContain("oblasti");
    expect(k).toContain("pristup");
  });

  it("urednik vidi Oblasti, ali ne Pristup, Sajt, Lozinke ni AI", () => {
    const k = vidljive("urednik", true);
    expect(k).toContain("oblasti");
    expect(k).toContain("integracije");
    for (const skrivena of ["pristup", "sajt", "lozinke", "ai"] as const) expect(k).not.toContain(skrivena);
  });

  it("posmatrač ne vidi Oblasti, Integracije, Lozinke ni AI (ni kao vlasnik platforme)", () => {
    const k = vidljive("client_viewer", true);
    for (const skrivena of ["oblasti", "integracije", "pristup", "sajt", "lozinke", "ai"] as const) {
      expect(k).not.toContain(skrivena);
    }
    expect(k).toContain("projekat");
  });

  it("dok uloga nije poznata, Lozinke i AI se ne crtaju", () => {
    const k = vidljive(null, true);
    expect(k).not.toContain("lozinke");
    expect(k).not.toContain("ai");
    expect(k).toContain("integracije");
  });
});
