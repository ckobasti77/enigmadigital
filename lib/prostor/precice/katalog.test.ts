import { describe, expect, test } from "vitest";

import { EKRANI_PRECICA, SVE_PRECICE, grupisiZaPomoc, kombinacije, sudariPrecica } from "./katalog";
import {
  LEAD_TABLE_HELP,
  SHELL_SHORTCUTS,
  SHORTCUT_GROUP_ORDER,
  TASK_LIST_SHORTCUTS,
  matchShortcut,
  type ShortcutDef,
} from "./registar";

const SVUDA = SVE_PRECICE.filter((def) => def.group === "Svuda");

describe("registar prečica bez duplikata (S24)", () => {
  test("svaki id je jedinstven", () => {
    const ids = SVE_PRECICE.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("svaka grupa iz kataloga ima ekran, a svaki ekran poznate grupe", () => {
    const naEkranima = new Set(EKRANI_PRECICA.flatMap((e) => e.grupe));
    for (const def of SVE_PRECICE) {
      if (def.group === "Svuda") continue;
      expect(naEkranima.has(def.group), def.id).toBe(true);
    }
    for (const grupa of naEkranima) expect(SHORTCUT_GROUP_ORDER).toContain(grupa);
  });

  test.each(EKRANI_PRECICA.map((e) => [e.ekran, e.grupe] as const))(
    "%s: nijedna kombinacija nema dve radnje (uz „Svuda“)",
    (_ekran, grupe) => {
      const defs = [...SVUDA, ...SVE_PRECICE.filter((def) => grupe.includes(def.group))];
      expect(sudariPrecica(defs)).toEqual([]);
    },
  );

  test("globalne prečice (?, Q, Ctrl/⌘ K) ne koristi nijedan ekran", () => {
    const globalne = new Set(SVUDA.flatMap(kombinacije));
    const drugde = SVE_PRECICE.filter((def) => def.group !== "Svuda" && !def.hideInHelp);
    for (const def of drugde) {
      for (const k of kombinacije(def)) expect(globalne.has(k), `${def.id} zauzima ${k}`).toBe(false);
    }
  });

  test("skriven pseudonim je ista radnja kao vidljiva definicija iste grupe", () => {
    for (const alias of SVE_PRECICE.filter((def) => def.hideInHelp)) {
      const [kombinacija] = kombinacije({ ...alias, helpKeys: undefined });
      const vlasnik = SVE_PRECICE.find(
        (def) => !def.hideInHelp && def.group === alias.group && kombinacije(def).includes(kombinacija),
      );
      expect(vlasnik, alias.id).toBeDefined();
    }
  });

  test("provera zaista hvata sudar", () => {
    const sudar: ShortcutDef = { id: "x-q", key: "q", label: "Druga radnja", group: "Leadovi" };
    expect(sudariPrecica([SHELL_SHORTCUTS.quickAdd, sudar])).toEqual([
      { kombinacija: "Q", ids: ["quick-add", "x-q"] },
    ]);
    // Pseudonim (strelica uz J) nije sudar.
    expect(sudariPrecica([TASK_LIST_SHORTCUTS.next, TASK_LIST_SHORTCUTS.nextArrow])).toEqual([]);
  });

  test("Leadovi su samo za pomoć: provider ih nikad ne okida (tabela ih obrađuje sama)", () => {
    for (const def of LEAD_TABLE_HELP) {
      const event = { key: def.key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, typing: false, dialogOpen: false };
      expect(matchShortcut(event, LEAD_TABLE_HELP)).toBeNull();
    }
  });

  test("Ctrl/⌘ K radi i u polju i uz otvoren dijalog (paleta se njime i zatvara)", () => {
    const base = { key: "k", shiftKey: false, altKey: false, typing: true, dialogOpen: true };
    expect(matchShortcut({ ...base, ctrlKey: true, metaKey: false }, SVUDA)).toBe("search");
    expect(matchShortcut({ ...base, ctrlKey: false, metaKey: true }, SVUDA)).toBe("search");
  });
});

describe("dijalog pomoći navodi sve", () => {
  test("prvo prijavljene na ovom ekranu, pa sve ostale grupe, bez ponavljanja", () => {
    const aktivne = [SHELL_SHORTCUTS.help, SHELL_SHORTCUTS.quickAdd, SHELL_SHORTCUTS.search, ...LEAD_TABLE_HELP];
    const { ovde, drugde } = grupisiZaPomoc(aktivne);
    expect(ovde.map((g) => g.group)).toEqual(["Svuda", "Leadovi"]);
    expect(drugde.map((g) => g.group)).not.toContain("Leadovi");
    expect(drugde.map((g) => g.group)).not.toContain("Svuda");
    const navedene = new Set([...ovde, ...drugde].flatMap((g) => g.defs.map((d) => d.id)));
    for (const def of SVE_PRECICE) {
      if (!def.hideInHelp) expect(navedene.has(def.id), def.id).toBe(true);
    }
  });

  test("grupa na ovom ekranu nosi tačno prijavljene prečice (lista bez pretrage nema `/`)", () => {
    const { ovde } = grupisiZaPomoc([TASK_LIST_SHORTCUTS.next, TASK_LIST_SHORTCUTS.complete]);
    expect(ovde[0].defs.map((d) => d.id)).toEqual(["list-next", "list-complete"]);
  });

  test("Mod u pomoći postaje Ctrl ili ⌘", () => {
    const redo = SVE_PRECICE.find((d) => d.id === "map-redo")!;
    expect(kombinacije(redo)).toEqual(["Ctrl+Shift+Z", "Ctrl+Y"]);
  });
});
