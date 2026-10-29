/**
 * Šema radnog dela (SPAJANJE S02, plan S01 §2): 51 tabela iz
 * `prostor/schema.ts` je u Enigminoj šemi baš ona koja je definisana (nijedna
 * Enigmina tabela istog imena je ne zamenjuje), a svaka tabela sa projektom ima
 * indeks koji počinje sa `workspaceId`.
 */
import { describe, expect, test } from "vitest";

import schema from "../schema";
import { prostorTabele } from "./schema";

type Tabela = {
  validator: { fields: Record<string, unknown> };
  export(): { indexes: Array<{ indexDescriptor: string; fields: string[] }> };
};

describe("šema radnog dela", () => {
  test("51 tabela, svaka baš iz prostor/schema.ts (bez sudara imena)", () => {
    const imena = Object.keys(prostorTabele);
    expect(imena).toHaveLength(51);
    const tabele = (schema as unknown as { tables: Record<string, unknown> }).tables;
    for (const ime of imena) {
      expect(tabele[ime], ime).toBe(prostorTabele[ime as keyof typeof prostorTabele]);
    }
    for (const nema of ["startups", "startupMembers", "appState", "startupAreas", "areasMigrationIssues"]) {
      expect(imena).not.toContain(nema);
    }
  });

  test("svaka tabela sa projektom ima indeks koji počinje sa workspaceId", () => {
    const bez: string[] = [];
    for (const [ime, def] of Object.entries(prostorTabele)) {
      const tabela = def as unknown as Tabela;
      if (!("workspaceId" in tabela.validator.fields)) continue;
      if (!tabela.export().indexes.some((i) => i.fields[0] === "workspaceId")) bez.push(ime);
    }
    expect(bez).toEqual([]);
  });

  test("workspaces.opis je opciono polje", () => {
    const ws = (schema as unknown as { tables: Record<string, Tabela> }).tables.workspaces;
    expect(Object.keys(ws.validator.fields)).toContain("opis");
  });
});
