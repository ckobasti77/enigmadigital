/// <reference types="vite/client" />
/**
 * Profil radnog dela (SPAJANJE S02, P6, plan S01 §3.4): `ensureCurrent` je
 * idempotentan, početno ime je `users.name` ili deo adrese pre `@`, a korisnik
 * koji je samo `client_viewer` ne dobija profil (O5).
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { odbijeno } from "../projekatTest.pomoc";
import schema from "../schema";
import { kao } from "./testSvet.pomoc";

// Koren projekta: ključevi `/convex/...` (vidi `identitet.test.ts`).
const modules = import.meta.glob("/convex/**/*.*s");

async function svet() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const ws = await ctx.db.insert("workspaces", { name: "Enigma IT", slug: "enigma-it" });
    const korisnik = async (email: string, role: "owner" | "urednik" | "client_viewer", name?: string) => {
      const userId = await ctx.db.insert("users", { email, ...(name ? { name } : {}) });
      await ctx.db.insert("members", { workspaceId: ws, userId, role });
      return userId;
    };
    return {
      ws,
      jovan: await korisnik("Jovan.M@Enigma.test", "owner"),
      ana: await korisnik("ana@enigma.test", "urednik", "Ana Anić"),
      viewer: await korisnik("klijent@enigma.test", "client_viewer"),
    };
  });
  return { t, ...s };
}

async function brojProfila(t: TestConvex<typeof schema>, userId: Id<"users">) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(5)
    ).length,
  );
}

describe("ensureCurrent", () => {
  test("je idempotentan: dva poziva, jedan profil, isti _id", async () => {
    const s = await svet();
    const prvi = await kao(s.t, s.jovan).mutation(api.prostor.profiles.ensureCurrent, {});
    const drugi = await kao(s.t, s.jovan).mutation(api.prostor.profiles.ensureCurrent, {});
    expect(prvi?._id).toBeDefined();
    expect(drugi?._id).toBe(prvi?._id);
    expect(await brojProfila(s.t, s.jovan)).toBe(1);
    expect(prvi?.role).toBe("member");
    expect(prvi?.archivedAt).toBeNull();
    expect(prvi?.avatarUrl).toBeNull();
  });

  test("početno ime: users.name, inače deo adrese pre @ (adresa normalizovana)", async () => {
    const s = await svet();
    const ana = await kao(s.t, s.ana).mutation(api.prostor.profiles.ensureCurrent, {});
    expect(ana?.displayName).toBe("Ana Anić");
    const jovan = await kao(s.t, s.jovan).mutation(api.prostor.profiles.ensureCurrent, {});
    expect(jovan?.displayName).toBe("jovan.m");
    expect(jovan?.email).toBe("jovan.m@enigma.test");
  });

  test("client_viewer ne dobija profil; neprijavljen poziv pada", async () => {
    const s = await svet();
    expect(await kao(s.t, s.viewer).mutation(api.prostor.profiles.ensureCurrent, {})).toBeNull();
    expect(await brojProfila(s.t, s.viewer)).toBe(0);
    await odbijeno(s.t.mutation(api.prostor.profiles.ensureCurrent, {}), "unauthorized");
  });
});

describe("getCurrent i updateCurrent", () => {
  test("null pre profila; posle ensureCurrent profil; ime se menja i čisti", async () => {
    const s = await svet();
    const ana = kao(s.t, s.ana);
    expect(await ana.query(api.prostor.profiles.getCurrent, {})).toBeNull();
    await ana.mutation(api.prostor.profiles.ensureCurrent, {});
    expect((await ana.query(api.prostor.profiles.getCurrent, {}))?.displayName).toBe("Ana Anić");
    const izmenjen = await ana.mutation(api.prostor.profiles.updateCurrent, { displayName: "  Ana  " });
    expect(izmenjen.displayName).toBe("Ana");
    await expect(
      ana.mutation(api.prostor.profiles.updateCurrent, { displayName: "   " }),
    ).rejects.toThrow(/obavezno/);
  });

  test("izmena imena bez profila: „Profil još nije spreman“", async () => {
    const s = await svet();
    await expect(
      kao(s.t, s.ana).mutation(api.prostor.profiles.updateCurrent, { displayName: "Ana" }),
    ).rejects.toThrow(/Profil još nije spreman/);
  });
});
