/// <reference types="vite/client" />
/**
 * Izolacija C07, pravila oglasa: član projekta A ne čita i ne menja pravila
 * projekta B, posmatrač samo čita, urednik sme da učita šablone, a pravljenje,
 * izmena, brisanje, uključivanje i ručno pokretanje traže vlasnika (D11:
 * pauza je pisanje na Meta nalogu). ID pravila iz tuđeg projekta se ne otkriva.
 */
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  kao,
  napraviPravilo,
  napraviSvet,
  odbijeno,
  type Svet,
} from "./projekatTest.pomoc";

const NEMA_PRISTUP = /Nemaš pristup ovom projektu/;
const TREBA_UREDNIK = /urednik ili vlasnik/;
const TREBA_VLASNIK = /samo vlasnik projekta/;

const USLOV = { metric: "cpa", operator: "gt", value: 5, windowDays: 3, minImpressions: 0 } as const;

/** Argumenti za `createRule` / `updateRule` (bez `workspaceId`). */
const TELO_PRAVILA = {
  name: "Novo pravilo",
  scope: "campaign",
  condition: USLOV,
  action: "notify",
  cooldownHours: 12,
  enabled: true,
} as const;

async function okidanje(
  s: Svet,
  workspaceId: Id<"workspaces">,
  ruleId: Id<"rules">,
): Promise<Id<"ruleFirings">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("ruleFirings", {
      workspaceId,
      ruleId,
      targetId: "kampanja-1",
      firedAt: 1_760_000_000_000,
      metricValue: 9.5,
      actionTaken: "notify",
      notified: false,
    }),
  );
}

async function pravila(s: Svet, workspaceId: Id<"workspaces">) {
  return await s.t.run(async (ctx) => {
    const sva = await ctx.db.query("rules").collect();
    return sva.filter((r) => r.workspaceId === workspaceId);
  });
}

async function svetSaPravilima() {
  const s = await napraviSvet();
  const a = await napraviPravilo(s, s.wsA, "Pravilo A");
  const b = await napraviPravilo(s, s.wsB, "Pravilo B");
  const okidanjeA = await okidanje(s, s.wsA, a);
  const okidanjeB = await okidanje(s, s.wsB, b);
  return { s, a, b, okidanjeA, okidanjeB };
}

describe("pravila oglasa", () => {
  test("član A ne čita i ne menja pravila B; pravilo B ostaje netaknuto", async () => {
    const { s, b, okidanjeB } = await svetSaPravilima();
    const ana = kao(s, s.ana);
    const upiti = [
      () => ana.query(api.rulesStore.listRules, { workspaceId: s.wsB }),
      () => ana.query(api.rulesStore.getRule, { workspaceId: s.wsB, ruleId: b }),
      () => ana.query(api.rulesStore.listRuleFirings, { workspaceId: s.wsB, ruleId: b }),
    ];
    for (const poziv of upiti) await odbijeno(poziv(), "forbidden", NEMA_PRISTUP);

    const izmene = [
      () => ana.mutation(api.rulesStore.ensureTemplateRules, { workspaceId: s.wsB }),
      () => ana.mutation(api.rulesStore.createRule, { workspaceId: s.wsB, ...TELO_PRAVILA }),
      () =>
        ana.mutation(api.rulesStore.updateRule, {
          workspaceId: s.wsB,
          ruleId: b,
          ...TELO_PRAVILA,
        }),
      () => ana.mutation(api.rulesStore.deleteRule, { workspaceId: s.wsB, ruleId: b }),
      () =>
        ana.mutation(api.rulesStore.toggleRule, {
          workspaceId: s.wsB,
          ruleId: b,
          enabled: true,
        }),
    ];
    for (const poziv of izmene) await odbijeno(poziv(), "forbidden", NEMA_PRISTUP);

    await odbijeno(
      ana.action(api.rules.manualEvaluateRules, { workspaceId: s.wsB }),
      "forbidden",
      NEMA_PRISTUP,
    );
    await odbijeno(
      ana.action(api.rules.manualEvaluateRules, { workspaceId: s.wsB, ruleId: b }),
      "forbidden",
      NEMA_PRISTUP,
    );

    const redovi = await pravila(s, s.wsB);
    expect(redovi).toHaveLength(1);
    expect(redovi[0]).toMatchObject({ _id: b, name: "Pravilo B", enabled: false });
    expect(await s.t.run(async (ctx) => ctx.db.get(okidanjeB))).not.toBeNull();
  });

  test("u A se vide samo pravila A; tuđe pravilo kroz A se ne otkriva i ne menja", async () => {
    const { s, a, b, okidanjeA, okidanjeB } = await svetSaPravilima();
    const ana = kao(s, s.ana);

    const spisak = await ana.query(api.rulesStore.listRules, { workspaceId: s.wsA });
    expect(spisak.map((r) => r._id)).toEqual([a]);
    const istorija = await ana.query(api.rulesStore.listRuleFirings, { workspaceId: s.wsA });
    expect(istorija.map((f) => f._id)).toEqual([okidanjeA]);
    expect(istorija[0].ruleName).toBe("Pravilo A");

    // Član oba projekta vidi pravilo i istoriju B kroz B: podaci stvarno postoje.
    const jovan = kao(s, s.jovan);
    expect(await jovan.query(api.rulesStore.getRule, { workspaceId: s.wsB, ruleId: b })).not.toBeNull();
    const istorijaB = await jovan.query(api.rulesStore.listRuleFirings, {
      workspaceId: s.wsB,
      ruleId: b,
    });
    expect(istorijaB.map((f) => f._id)).toEqual([okidanjeB]);

    // Kroz A, ID pravila iz B ništa ne otkriva.
    expect(await ana.query(api.rulesStore.getRule, { workspaceId: s.wsA, ruleId: b })).toBeNull();
    expect(
      await ana.query(api.rulesStore.listRuleFirings, { workspaceId: s.wsA, ruleId: b }),
    ).toEqual([]);

    // Izmena, brisanje i uključivanje tuđeg pravila kroz A: nije pronađeno.
    await expect(
      ana.mutation(api.rulesStore.updateRule, {
        workspaceId: s.wsA,
        ruleId: b,
        ...TELO_PRAVILA,
      }),
    ).rejects.toThrow(/Pravilo nije pronađeno/);
    await expect(
      ana.mutation(api.rulesStore.deleteRule, { workspaceId: s.wsA, ruleId: b }),
    ).rejects.toThrow(/Pravilo nije pronađeno/);
    await expect(
      ana.mutation(api.rulesStore.toggleRule, { workspaceId: s.wsA, ruleId: b, enabled: true }),
    ).rejects.toThrow(/Pravilo nije pronađeno/);

    const redovi = await pravila(s, s.wsB);
    expect(redovi).toHaveLength(1);
    expect(redovi[0]).toMatchObject({
      _id: b,
      name: "Pravilo B",
      enabled: false,
      cooldownHours: 24,
      condition: { value: 1, windowDays: 3 },
    });
    expect(await s.t.run(async (ctx) => ctx.db.get(okidanjeB))).not.toBeNull();

    // Ručna provera tuđeg pravila kroz A ne procenjuje ništa.
    const tudje = await ana.action(api.rules.manualEvaluateRules, {
      workspaceId: s.wsA,
      ruleId: b,
    });
    expect(tudje.evaluatedRulesCount).toBe(0);
    const svoje = await ana.action(api.rules.manualEvaluateRules, {
      workspaceId: s.wsA,
      ruleId: a,
    });
    expect(svoje.evaluatedRulesCount).toBe(1);
  });

  test("posmatrač čita, ali ne učitava šablone ni piše", async () => {
    const { s, a, okidanjeA } = await svetSaPravilima();
    const viewer = kao(s, s.viewer);

    const spisak = await viewer.query(api.rulesStore.listRules, { workspaceId: s.wsA });
    expect(spisak.map((r) => r._id)).toEqual([a]);
    expect(await viewer.query(api.rulesStore.getRule, { workspaceId: s.wsA, ruleId: a })).not.toBeNull();
    const istorija = await viewer.query(api.rulesStore.listRuleFirings, { workspaceId: s.wsA });
    expect(istorija.map((f) => f._id)).toEqual([okidanjeA]);

    await odbijeno(
      viewer.mutation(api.rulesStore.ensureTemplateRules, { workspaceId: s.wsA }),
      "forbidden",
      TREBA_UREDNIK,
    );
    await odbijeno(
      viewer.mutation(api.rulesStore.createRule, { workspaceId: s.wsA, ...TELO_PRAVILA }),
      "forbidden",
      TREBA_VLASNIK,
    );
    await odbijeno(
      viewer.mutation(api.rulesStore.updateRule, { workspaceId: s.wsA, ruleId: a, ...TELO_PRAVILA }),
      "forbidden",
      TREBA_VLASNIK,
    );
    await odbijeno(
      viewer.mutation(api.rulesStore.deleteRule, { workspaceId: s.wsA, ruleId: a }),
      "forbidden",
      TREBA_VLASNIK,
    );
    await odbijeno(
      viewer.mutation(api.rulesStore.toggleRule, { workspaceId: s.wsA, ruleId: a, enabled: true }),
      "forbidden",
      TREBA_VLASNIK,
    );
    await odbijeno(
      viewer.action(api.rules.manualEvaluateRules, { workspaceId: s.wsA }),
      "forbidden",
      TREBA_VLASNIK,
    );

    const redovi = await pravila(s, s.wsA);
    expect(redovi).toHaveLength(1);
    expect(redovi[0]).toMatchObject({ _id: a, name: "Pravilo A", enabled: false });
  });

  test("urednik učitava šablone, ali ne pravi, ne menja i ne pokreće pravila", async () => {
    const s = await napraviSvet();
    const pravilo = await napraviPravilo(s, s.wsB, "Pravilo B");
    const urednica = kao(s, s.urednica);

    // A nema pravila: šabloni se upisuju u A, jednom, i ne diraju B.
    expect(await pravila(s, s.wsA)).toHaveLength(0);
    await urednica.mutation(api.rulesStore.ensureTemplateRules, { workspaceId: s.wsA });
    await urednica.mutation(api.rulesStore.ensureTemplateRules, { workspaceId: s.wsA });
    const sablonski = await pravila(s, s.wsA);
    expect(sablonski).toHaveLength(2);
    expect(sablonski.every((r) => !r.enabled)).toBe(true);
    expect(await pravila(s, s.wsB)).toHaveLength(1);

    const [prvo] = sablonski;
    await odbijeno(
      urednica.mutation(api.rulesStore.createRule, { workspaceId: s.wsA, ...TELO_PRAVILA }),
      "forbidden",
      TREBA_VLASNIK,
    );
    await odbijeno(
      urednica.mutation(api.rulesStore.updateRule, {
        workspaceId: s.wsA,
        ruleId: prvo._id,
        ...TELO_PRAVILA,
      }),
      "forbidden",
      TREBA_VLASNIK,
    );
    await odbijeno(
      urednica.mutation(api.rulesStore.deleteRule, { workspaceId: s.wsA, ruleId: prvo._id }),
      "forbidden",
      TREBA_VLASNIK,
    );
    await odbijeno(
      urednica.mutation(api.rulesStore.toggleRule, {
        workspaceId: s.wsA,
        ruleId: prvo._id,
        enabled: true,
      }),
      "forbidden",
      TREBA_VLASNIK,
    );
    await odbijeno(
      urednica.action(api.rules.manualEvaluateRules, { workspaceId: s.wsA }),
      "forbidden",
      TREBA_VLASNIK,
    );

    const posle = await pravila(s, s.wsA);
    expect(posle).toHaveLength(2);
    expect(posle.find((r) => r._id === prvo._id)).toMatchObject({
      name: prvo.name,
      enabled: false,
    });
    expect((await pravila(s, s.wsB))[0]._id).toBe(pravilo);
  });

  test("vlasnik A pravi, menja, uključuje i briše pravila u A", async () => {
    const { s, b, okidanjeB } = await svetSaPravilima();
    const ana = kao(s, s.ana);

    const id = await ana.mutation(api.rulesStore.createRule, {
      workspaceId: s.wsA,
      ...TELO_PRAVILA,
      name: "  Čuvar potrošnje  ",
    });
    const napravljeno = await s.t.run(async (ctx) => ctx.db.get(id));
    expect(napravljeno).toMatchObject({
      workspaceId: s.wsA,
      name: "Čuvar potrošnje",
      createdBy: s.ana,
      enabled: true,
    });

    await ana.mutation(api.rulesStore.updateRule, {
      workspaceId: s.wsA,
      ruleId: id,
      ...TELO_PRAVILA,
      name: "Čuvar CPA",
      cooldownHours: 48,
    });
    await ana.mutation(api.rulesStore.toggleRule, {
      workspaceId: s.wsA,
      ruleId: id,
      enabled: false,
    });
    const izmenjeno = await ana.query(api.rulesStore.getRule, { workspaceId: s.wsA, ruleId: id });
    expect(izmenjeno).toMatchObject({ name: "Čuvar CPA", cooldownHours: 48, enabled: false });

    const rezultat = await ana.action(api.rules.manualEvaluateRules, { workspaceId: s.wsA });
    expect(rezultat.evaluatedRulesCount).toBe(0);

    await okidanje(s, s.wsA, id);
    await ana.mutation(api.rulesStore.deleteRule, { workspaceId: s.wsA, ruleId: id });
    expect(await s.t.run(async (ctx) => ctx.db.get(id))).toBeNull();
    const ostaloUA = await s.t.run(async (ctx) =>
      (await ctx.db.query("ruleFirings").collect()).filter((f) => f.ruleId === id),
    );
    expect(ostaloUA).toEqual([]);

    // B nije dirnut.
    const redoviB = await pravila(s, s.wsB);
    expect(redoviB.map((r) => r._id)).toEqual([b]);
    expect(await s.t.run(async (ctx) => ctx.db.get(okidanjeB))).not.toBeNull();
  });

  test("vlasnik proverava samo sopstveni projekat; neprijavljen i stranac ne ulaze", async () => {
    const { s } = await svetSaPravilima();
    await odbijeno(
      s.t.query(api.rulesStore.listRules, { workspaceId: s.wsA }),
      "unauthorized",
    );
    await odbijeno(
      kao(s, s.stranac).query(api.rulesStore.listRules, { workspaceId: s.wsA }),
      "forbidden",
      NEMA_PRISTUP,
    );
    await odbijeno(
      kao(s, s.klijent).mutation(api.rulesStore.createRule, {
        workspaceId: s.wsA,
        ...TELO_PRAVILA,
      }),
      "forbidden",
      NEMA_PRISTUP,
    );
    expect(await pravila(s, s.wsA)).toHaveLength(1);
  });
});
