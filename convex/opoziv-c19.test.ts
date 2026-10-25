/// <reference types="vite/client" />
/**
 * C19: „Prekini vezu“ u jednom projektu ne sme da ugasi vezu drugog. Meta
 * (`DELETE /me/permissions`) i Google opozivaju dozvolu celog naloga, pa se
 * opoziv preskače kad drugi projekat ima vezu istog provajdera; brisanje
 * podataka ide kao i uvek, a kartica kaže šta je preskočeno.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, type Svet } from "./projekatTest.pomoc";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function veza(
  s: Svet,
  workspaceId: Id<"workspaces">,
  provider: "meta_fb" | "youtube",
  externalId: string,
): Promise<Id<"connections">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("connections", {
      workspaceId,
      provider,
      externalId,
      encryptedCredentials: "v1:nije-pravi",
      status: "active",
    }),
  );
}

async function pokreniBrisanje(s: Svet, connectionId: Id<"connections">) {
  await kao(s, s.ana).mutation(api.connections.remove, { workspaceId: s.wsA, connectionId });
  return await s.t.run(async (ctx) => {
    const run = await ctx.db
      .query("purgeRuns")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", s.wsA))
      .first();
    if (run === null) throw new Error("nema purge run-a");
    return run;
  });
}

describe("opoziv celog naloga", () => {
  test("Facebook: drugi projekat ima vezu → opoziv se preskače, bez poziva Meti", async () => {
    const s = await napraviSvet();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const vezaA = await veza(s, s.wsA, "meta_fb", "stranica-a");
    await veza(s, s.wsB, "meta_fb", "stranica-b");
    const run = await pokreniBrisanje(s, vezaA);

    const kredencijali = await s.t.query(internal.purge.credentialsForRevoke, {
      runId: run._id,
      fenceToken: run.fenceToken,
    });
    expect(kredencijali?.deljenaDozvola).toBe(true);

    await s.t.action(internal.purge.revokeAndStart, {
      runId: run._id,
      fenceToken: run.fenceToken,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const posle = await s.t.run(async (ctx) => ctx.db.get(run._id));
    expect(posle?.revokeStatus).toBe("unsupported");
    expect(posle?.revokeError).toMatch(/preskočen/);
    // Veza drugog projekta je netaknuta.
    const vezeB = await s.t.run(async (ctx) =>
      ctx.db
        .query("connections")
        .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", s.wsB).eq("provider", "meta_fb"))
        .collect(),
    );
    expect(vezeB.map((v) => v.status)).toEqual(["active"]);
  });

  test("YouTube: veza drugog projekta u prekidu se ne broji", async () => {
    const s = await napraviSvet();
    const vezaA = await veza(s, s.wsA, "youtube", `UC${"a".repeat(22)}`);
    const vezaB = await veza(s, s.wsB, "youtube", `UC${"b".repeat(22)}`);
    await s.t.run(async (ctx) => ctx.db.patch(vezaB, { status: "disconnecting" }));
    const run = await pokreniBrisanje(s, vezaA);

    const kredencijali = await s.t.query(internal.purge.credentialsForRevoke, {
      runId: run._id,
      fenceToken: run.fenceToken,
    });
    expect(kredencijali?.deljenaDozvola).toBe(false);
  });

  test("bez veze istog provajdera u drugom projektu opoziv se pokušava kao i do sada", async () => {
    const s = await napraviSvet();
    const vezaA = await veza(s, s.wsA, "meta_fb", "stranica-a");
    // Drugi provajder u drugom projektu ne smeta.
    await veza(s, s.wsB, "youtube", `UC${"b".repeat(22)}`);
    const run = await pokreniBrisanje(s, vezaA);

    const kredencijali = await s.t.query(internal.purge.credentialsForRevoke, {
      runId: run._id,
      fenceToken: run.fenceToken,
    });
    expect(kredencijali).toMatchObject({ provider: "meta_fb", deljenaDozvola: false });
  });
});
