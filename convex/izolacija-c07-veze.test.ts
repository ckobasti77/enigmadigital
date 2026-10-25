/// <reference types="vite/client" />
/**
 * Izolacija grupe C07 (veze, sinhronizacija, brisanje podataka, Google Business
 * Profile, brojač javnih ruta): član projekta A ne čita projekat B i ne menja
 * ga, `client_viewer` čita ali ne pokreće sinhronizaciju, a veze, brisanje i
 * Google nalog traže vlasnika. Odbijanje dolazi iz omotača, pre bilo kakvog
 * poziva ka Meti ili Google-u i pre bilo kakvog upisa.
 */
import type { FunctionReference } from "convex/server";
import { afterEach, describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const NEMA_PRISTUP = /Nemaš pristup ovom projektu/;
const TREBA_UREDNIK = /urednik ili vlasnik/;
const TREBA_VLASNIK = /samo vlasnik projekta/;

type Upit = [FunctionReference<"query">, Record<string, unknown>];
type Izmena = [FunctionReference<"mutation">, Record<string, unknown>];
type Akcija = [FunctionReference<"action">, Record<string, unknown>];

/** Svaki upit sa liste, pozvan nad B od člana samo projekta A, pada. */
async function upitiNadBOdbijeni(s: Svet, upiti: Upit[]) {
  for (const [fn, args] of upiti) {
    await odbijeno(
      kao(s, s.ana).query(fn, { ...args, workspaceId: s.wsB }),
      "forbidden",
      NEMA_PRISTUP,
    );
  }
}

async function izmeneNadBOdbijene(s: Svet, izmene: Izmena[]) {
  for (const [fn, args] of izmene) {
    await odbijeno(
      kao(s, s.ana).mutation(fn, { ...args, workspaceId: s.wsB }),
      "forbidden",
      NEMA_PRISTUP,
    );
  }
}

async function akcijeNadBOdbijene(s: Svet, akcije: Akcija[]) {
  for (const [fn, args] of akcije) {
    await odbijeno(
      kao(s, s.ana).action(fn, { ...args, workspaceId: s.wsB }),
      "forbidden",
      NEMA_PRISTUP,
    );
  }
}

/** Urednik u A ne prolazi funkcije vlasnika. */
async function urednikNeMenja(s: Svet, izmene: Izmena[]) {
  for (const [fn, args] of izmene) {
    await odbijeno(
      kao(s, s.urednica).mutation(fn, { ...args, workspaceId: s.wsA }),
      "forbidden",
      TREBA_VLASNIK,
    );
  }
}

async function urednikNePokrece(s: Svet, akcije: Akcija[]) {
  for (const [fn, args] of akcije) {
    await odbijeno(
      kao(s, s.urednica).action(fn, { ...args, workspaceId: s.wsA }),
      "forbidden",
      TREBA_VLASNIK,
    );
  }
}

/** Veza projekta `ws`; `openreply` nema korake brisanja, pa se `remove` ne zakazuje. */
async function napraviVezu(
  s: Svet,
  workspaceId: Id<"workspaces">,
  provider: "ga4" | "meta_ig" | "openreply",
  externalId?: string,
): Promise<Id<"connections">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("connections", {
      workspaceId,
      provider,
      encryptedCredentials: "v1:sifrovano",
      status: "active",
      generation: 1,
      ...(externalId !== undefined ? { externalId } : {}),
    }),
  );
}

async function syncRunovi(s: Svet) {
  return await s.t.run(async (ctx) => ctx.db.query("syncRuns").collect());
}

// ── Veze ────────────────────────────────────────────────────────────────────

describe("Veze (connections)", () => {
  test("član A ne čita B; u A vidi samo vezu A, a Jovan u B vidi B", async () => {
    const s = await napraviSvet();
    const vezaA = await napraviVezu(s, s.wsA, "ga4", "111");
    const vezaB = await napraviVezu(s, s.wsB, "meta_ig", "222");

    await upitiNadBOdbijeni(s, [[api.connections.list, {}]]);
    await odbijeno(
      kao(s, s.stranac).query(api.connections.list, { workspaceId: s.wsA }),
      "forbidden",
      NEMA_PRISTUP,
    );
    await odbijeno(
      s.t.query(api.connections.list, { workspaceId: s.wsA }),
      "unauthorized",
    );

    const uA = await kao(s, s.viewer).query(api.connections.list, { workspaceId: s.wsA });
    expect(uA.map((c) => c._id)).toEqual([vezaA]);
    expect(JSON.stringify(uA)).not.toContain("sifrovano");
    const uB = await kao(s, s.jovan).query(api.connections.list, { workspaceId: s.wsB });
    expect(uB.map((c) => c._id)).toEqual([vezaB]);
  });

  test("save i remove: B odbijen, urednik i posmatrač odbijeni, ništa se ne upisuje", async () => {
    const s = await napraviSvet();
    const vezaA = await napraviVezu(s, s.wsA, "openreply");
    const vezaB = await napraviVezu(s, s.wsB, "openreply");

    await izmeneNadBOdbijene(s, [
      [api.connections.save, { provider: "ga4", externalId: "1", secret: "x" }],
      [api.connections.remove, { connectionId: vezaB }],
    ]);
    await urednikNeMenja(s, [
      [api.connections.save, { provider: "ga4", externalId: "1", secret: "x" }],
      [api.connections.remove, { connectionId: vezaA }],
    ]);
    await odbijeno(
      kao(s, s.viewer).mutation(api.connections.remove, {
        workspaceId: s.wsA,
        connectionId: vezaA,
      }),
      "forbidden",
      TREBA_VLASNIK,
    );

    const sve = await s.t.run(async (ctx) => ctx.db.query("connections").collect());
    expect(sve.map((c) => c._id).sort()).toEqual([vezaA, vezaB].sort());
  });

  test("vlasnik A prekida samo vezu A; veza B kroz projekat A ostaje", async () => {
    const s = await napraviSvet();
    const vezaA = await napraviVezu(s, s.wsA, "openreply");
    const vezaB = await napraviVezu(s, s.wsB, "openreply");

    // Tuđa veza kroz sopstveni projekat: odbijena, veza B ostaje.
    await odbijeno(
      kao(s, s.ana).mutation(api.connections.remove, {
        workspaceId: s.wsA,
        connectionId: vezaB,
      }),
      "forbidden",
    );
    expect(await s.t.run(async (ctx) => ctx.db.get(vezaB))).not.toBeNull();

    await kao(s, s.ana).mutation(api.connections.remove, {
      workspaceId: s.wsA,
      connectionId: vezaA,
    });
    expect(await s.t.run(async (ctx) => ctx.db.get(vezaA))).toBeNull();
    expect(await s.t.run(async (ctx) => ctx.db.get(vezaB))).not.toBeNull();
  });

  test("save: vlasnik prolazi omotač i stiže do provere kredencijala", async () => {
    const s = await napraviSvet();
    await odbijeno(
      kao(s, s.ana).mutation(api.connections.save, {
        workspaceId: s.wsA,
        provider: "openreply",
        secret: "x",
      }),
      "invalid",
      /OpenReply se uključuje u Podešavanjima/,
    );
  });

  test("syncNow: B odbijen, posmatrač ne pokreće; tuđa veza kroz A ne pokreće ništa", async () => {
    const s = await napraviSvet();
    const vezaA = await napraviVezu(s, s.wsA, "openreply");
    const vezaB = await napraviVezu(s, s.wsB, "openreply");

    await akcijeNadBOdbijene(s, [[api.connections.syncNow, { connectionId: vezaB }]]);
    await odbijeno(
      kao(s, s.viewer).action(api.connections.syncNow, {
        workspaceId: s.wsA,
        connectionId: vezaA,
      }),
      "forbidden",
      TREBA_UREDNIK,
    );

    // Veza iz drugog projekta kroz projekat A: isto ponašanje kao i pre, `forbidden`.
    await odbijeno(
      kao(s, s.ana).action(api.connections.syncNow, {
        workspaceId: s.wsA,
        connectionId: vezaB,
      }),
      "forbidden",
    );
    // Jovan je vlasnik i A i B, ali kroz A ne sme da pokrene vezu B.
    await odbijeno(
      kao(s, s.jovan).action(api.connections.syncNow, {
        workspaceId: s.wsA,
        connectionId: vezaB,
      }),
      "forbidden",
    );
    expect(await syncRunovi(s)).toEqual([]);
  });

  test("syncNow: urednik pokreće vezu svog projekta, trag stiže samo u A", async () => {
    const s = await napraviSvet();
    const vezaA = await napraviVezu(s, s.wsA, "openreply");
    await napraviVezu(s, s.wsB, "openreply");

    await kao(s, s.urednica).action(api.connections.syncNow, {
      workspaceId: s.wsA,
      connectionId: vezaA,
    });
    const runovi = await syncRunovi(s);
    expect(runovi).toHaveLength(1);
    expect(runovi[0].workspaceId).toBe(s.wsA);
    expect(runovi[0].connectionId).toBe(vezaA);
    expect(runovi[0].status).toBe("ok");
  });
});

// ── Sinhronizacija ──────────────────────────────────────────────────────────

describe("Sinhronizacija (sync)", () => {
  async function upisiTragove(s: Svet) {
    await s.t.run(async (ctx) => {
      await ctx.db.insert("syncRuns", {
        workspaceId: s.wsA,
        provider: "ga4",
        startedAt: 1_760_000_000_000,
        finishedAt: 1_760_000_100_000,
        status: "ok",
        itemsWritten: 5,
      });
      await ctx.db.insert("syncRuns", {
        workspaceId: s.wsB,
        provider: "youtube",
        startedAt: 1_770_000_000_000,
        finishedAt: 1_770_000_100_000,
        status: "ok",
        itemsWritten: 9,
      });
    });
  }

  test("član A ne čita B; zdravlje i svežina u A su samo od A, a Jovan u B vidi B", async () => {
    const s = await napraviSvet();
    await upisiTragove(s);

    await upitiNadBOdbijeni(s, [
      [api.sync.health, {}],
      [api.sync.freshness, {}],
    ]);

    const zdravljeA = await kao(s, s.viewer).query(api.sync.health, { workspaceId: s.wsA });
    expect(zdravljeA.map((h) => h.provider)).toEqual(["ga4"]);
    const zdravljeB = await kao(s, s.jovan).query(api.sync.health, { workspaceId: s.wsB });
    expect(zdravljeB.map((h) => h.provider)).toEqual(["youtube"]);

    expect(await kao(s, s.viewer).query(api.sync.freshness, { workspaceId: s.wsA })).toBe(
      1_760_000_100_000,
    );
    expect(await kao(s, s.jovan).query(api.sync.freshness, { workspaceId: s.wsB })).toBe(
      1_770_000_100_000,
    );
  });
});

// ── Brisanje podataka ───────────────────────────────────────────────────────

describe("Brisanje podataka (purge)", () => {
  async function upisiBrisanje(
    s: Svet,
    workspaceId: Id<"workspaces">,
    provider: "youtube" | "meta_ig",
    status: "done" | "failed",
    deletedTotal: number,
  ) {
    return await s.t.run(async (ctx) =>
      ctx.db.insert("purgeRuns", {
        workspaceId,
        provider,
        startedAt: 1_760_000_000_000,
        updatedAt: 1_760_000_000_000,
        status,
        stepIndex: 0,
        deletedTotal,
        fenceToken: 1,
        resumes: 0,
        revokeStatus: "ok",
        revokeAttempts: 1,
        ...(status === "failed" ? { lastError: "puklo" } : {}),
      }),
    );
  }

  test("član A ne čita B; u A vidi samo brisanja A, a Jovan u B vidi B", async () => {
    const s = await napraviSvet();
    await upisiBrisanje(s, s.wsA, "youtube", "done", 11);
    await upisiBrisanje(s, s.wsB, "meta_ig", "done", 22);

    await upitiNadBOdbijeni(s, [[api.purge.status, {}]]);

    const uA = await kao(s, s.viewer).query(api.purge.status, { workspaceId: s.wsA });
    expect(uA.map((r) => [r.provider, r.deletedTotal])).toEqual([["youtube", 11]]);
    const uB = await kao(s, s.jovan).query(api.purge.status, { workspaceId: s.wsB });
    expect(uB.map((r) => [r.provider, r.deletedTotal])).toEqual([["meta_ig", 22]]);
  });

  test("retry: B odbijen, urednik i posmatrač odbijeni, neuspelo brisanje ostaje", async () => {
    const s = await napraviSvet();
    const runA = await upisiBrisanje(s, s.wsA, "youtube", "failed", 3);
    const runB = await upisiBrisanje(s, s.wsB, "meta_ig", "failed", 4);

    await izmeneNadBOdbijene(s, [[api.purge.retry, { provider: "meta_ig" }]]);
    await urednikNeMenja(s, [[api.purge.retry, { provider: "youtube" }]]);
    await odbijeno(
      kao(s, s.viewer).mutation(api.purge.retry, {
        workspaceId: s.wsA,
        provider: "youtube",
      }),
      "forbidden",
      TREBA_VLASNIK,
    );

    // Vlasnik A kroz A ne vidi neuspelo brisanje B: nema šta da se ponovi.
    await odbijeno(
      kao(s, s.ana).mutation(api.purge.retry, { workspaceId: s.wsA, provider: "meta_ig" }),
      "invalid",
      /Nema neuspelog brisanja/,
    );

    for (const [id, status] of [
      [runA, "failed"],
      [runB, "failed"],
    ] as const) {
      const red = await s.t.run(async (ctx) => ctx.db.get(id));
      expect(red?.status).toBe(status);
      expect(red?.fenceToken).toBe(1);
    }
  });
});

// ── Google Business Profile ─────────────────────────────────────────────────

describe("Google Business Profile (gbp, gbpStore)", () => {
  const ENV = ["GOOGLE_BUSINESS_CLIENT_ID", "GOOGLE_BUSINESS_CLIENT_SECRET"] as const;
  const staro = new Map<string, string | undefined>(ENV.map((k) => [k, process.env[k]]));

  afterEach(() => {
    for (const ime of ENV) {
      const vrednost = staro.get(ime);
      if (vrednost === undefined) delete process.env[ime];
      else process.env[ime] = vrednost;
    }
  });

  async function upisiStanje(s: Svet) {
    await s.t.run(async (ctx) => {
      for (const [workspaceId, razlog] of [
        [s.wsA, "razlog A"],
        [s.wsB, "razlog B"],
      ] as const) {
        await ctx.db.insert("gbAccessState", {
          workspaceId,
          lastOutcome: "nepoznato",
          lastReason: razlog,
          updatedAt: 1,
        });
      }
    });
  }

  test("stanje pristupa i podešavanje: B odbijen, u A se vidi samo stanje A", async () => {
    const s = await napraviSvet();
    await upisiStanje(s);

    await upitiNadBOdbijeni(s, [
      [api.gbpStore.getAccessState, {}],
      [api.gbpStore.setupInfo, {}],
    ]);

    const uA = await kao(s, s.viewer).query(api.gbpStore.getAccessState, { workspaceId: s.wsA });
    expect(uA?.lastReason).toBe("razlog A");
    const uB = await kao(s, s.jovan).query(api.gbpStore.getAccessState, { workspaceId: s.wsB });
    expect(uB?.lastReason).toBe("razlog B");
    const podesavanje = await kao(s, s.viewer).query(api.gbpStore.setupInfo, {
      workspaceId: s.wsA,
    });
    expect(typeof podesavanje.isConfigured).toBe("boolean");
  });

  test("povezivanje naloga: B odbijen, urednik odbijen, OAuth stanje ne nastaje", async () => {
    const s = await napraviSvet();
    process.env.GOOGLE_BUSINESS_CLIENT_ID = "klijent-id";
    process.env.GOOGLE_BUSINESS_CLIENT_SECRET = "klijent-tajna";

    await akcijeNadBOdbijene(s, [[api.gbp.gbpAuthorizeUrl, {}]]);
    await urednikNePokrece(s, [[api.gbp.gbpAuthorizeUrl, {}]]);
    await odbijeno(
      kao(s, s.viewer).action(api.gbp.gbpAuthorizeUrl, { workspaceId: s.wsA }),
      "forbidden",
      TREBA_VLASNIK,
    );
    expect(await s.t.run(async (ctx) => ctx.db.query("oauthStates").collect())).toEqual([]);

    // Vlasnik A dobija adresu, a stanje se vezuje za A i za njega.
    const { url } = await kao(s, s.ana).action(api.gbp.gbpAuthorizeUrl, { workspaceId: s.wsA });
    expect(url).toContain("accounts.google.com");
    const stanja = await s.t.run(async (ctx) => ctx.db.query("oauthStates").collect());
    expect(stanja).toHaveLength(1);
    expect(stanja[0].workspaceId).toBe(s.wsA);
    expect(stanja[0].userId).toBe(s.ana);
  });

  test("provera pristupa: B odbijen, urednik odbijen, veza B se ne vidi kroz A", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) =>
      ctx.db.insert("connections", {
        workspaceId: s.wsB,
        provider: "google_business",
        encryptedCredentials: "v1:sifrovano",
        status: "active",
        generation: 1,
      }),
    );

    await akcijeNadBOdbijene(s, [[api.gbp.checkGbpAccess, {}]]);
    await urednikNePokrece(s, [[api.gbp.checkGbpAccess, {}]]);
    await odbijeno(
      kao(s, s.viewer).action(api.gbp.checkGbpAccess, { workspaceId: s.wsA }),
      "forbidden",
      TREBA_VLASNIK,
    );

    // Vlasnik A: omotač prolazi, ali u A nema Google naloga (B ima, to se ne vidi).
    await odbijeno(
      kao(s, s.ana).action(api.gbp.checkGbpAccess, { workspaceId: s.wsA }),
      "invalid",
      /nije povezan za ovaj projekat/,
    );
    expect(await s.t.run(async (ctx) => ctx.db.query("gbAccessState").collect())).toEqual([]);
  });
});

// ── Brojač javnih ruta ──────────────────────────────────────────────────────

describe("Brojač javnih ruta (publicRouteLimit)", () => {
  test("član A ne čita B; u A se vide samo dostignuti plafoni A, a Jovan u B vidi B", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("publicRouteUsage", {
        workspaceId: s.wsA,
        route: "ig-media",
        windowStartedAt: sada,
        count: 60,
        cappedAt: sada,
      });
      await ctx.db.insert("publicRouteUsage", {
        workspaceId: s.wsB,
        route: "r",
        windowStartedAt: sada,
        count: 60,
        cappedAt: sada,
      });
    });

    await upitiNadBOdbijeni(s, [[api.publicRouteLimit.routeUsageStatus, {}]]);

    const uA = await kao(s, s.viewer).query(api.publicRouteLimit.routeUsageStatus, {
      workspaceId: s.wsA,
    });
    expect(uA.map((r) => r.route)).toEqual(["ig-media"]);
    const uB = await kao(s, s.jovan).query(api.publicRouteLimit.routeUsageStatus, {
      workspaceId: s.wsB,
    });
    expect(uB.map((r) => r.route)).toEqual(["r"]);
  });
});
