import { describe, expect, test } from "vitest";
import {
  brojSaKapom,
  nepoznato,
  zbirPotrosnje,
  zbirPratilaca,
} from "../convex/lib/hubAgregati";

describe("agregati huba (nepoznato je null sa razlogom, nikad 0)", () => {
  test("brojSaKapom: preko kape vrednost je kapa i `vise`", () => {
    expect(brojSaKapom(0, 2000)).toEqual({ vrednost: 0, razlog: null });
    expect(brojSaKapom(2000, 2000)).toEqual({ vrednost: 2000, razlog: null });
    expect(brojSaKapom(2001, 2000)).toEqual({ vrednost: 2000, razlog: null, vise: true });
    expect(nepoznato("nije_povezano")).toEqual({ vrednost: null, razlog: "nije_povezano" });
  });

  test("pratioci: samo povezani kanali sa brojem; promena samo uz obe tačke", () => {
    expect(
      zbirPratilaca([{ kanal: "instagram", povezan: false, kraj: null, pocetak: null }]),
    ).toMatchObject({ vrednost: null, razlog: "nije_povezano", promena: null, kanali: [] });
    expect(
      zbirPratilaca([{ kanal: "instagram", povezan: true, kraj: null, pocetak: null }]),
    ).toMatchObject({ vrednost: null, razlog: "nema_podataka" });
    const z = zbirPratilaca([
      { kanal: "instagram", povezan: true, kraj: 120, pocetak: 100 },
      { kanal: "facebook", povezan: true, kraj: 50, pocetak: null },
      { kanal: "threads", povezan: true, kraj: null, pocetak: null },
    ]);
    expect(z.vrednost).toBe(170);
    expect(z.promena).toBe(20);
    expect(z.kanali).toEqual([
      { kanal: "instagram", vrednost: 120 },
      { kanal: "facebook", vrednost: 50 },
      { kanal: "threads", vrednost: null },
    ]);
  });

  test("potrošnja: nalozi, valute, kapa i samo dnevni redovi bez preseka", () => {
    expect(zbirPotrosnje({ valute: [], redovi: [], kapaPredjena: false })).toEqual({
      vrednost: null,
      razlog: "nije_povezano",
      valuta: null,
    });
    expect(zbirPotrosnje({ valute: ["EUR", "rsd"], redovi: [], kapaPredjena: false }).razlog).toBe(
      "vise_valuta",
    );
    expect(zbirPotrosnje({ valute: ["EUR", "eur"], redovi: [], kapaPredjena: true })).toEqual({
      vrednost: null,
      razlog: "previse_podataka",
      valuta: "EUR",
    });
    expect(zbirPotrosnje({ valute: ["EUR"], redovi: [], kapaPredjena: false }).razlog).toBe(
      "nema_podataka",
    );
    expect(
      zbirPotrosnje({
        valute: ["EUR"],
        redovi: [
          { spend: 10.1, breakdownHash: "none" },
          { spend: 0.2, breakdownHash: "none" },
          { spend: 99, breakdownHash: "none", hour: 3 },
          { spend: 99, breakdownHash: "x" },
        ],
        kapaPredjena: false,
      }),
    ).toEqual({ vrednost: 10.3, razlog: null, valuta: "EUR" });
  });
});
