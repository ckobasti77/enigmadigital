/// <reference types="vite/client" />
/**
 * Adapter identiteta radnog dela (SPAJANJE S02, plan S01 §3): `owner` i
 * `urednik` prolaze; `client_viewer`, nečlan, tuđ i arhiviran projekat ne
 * prolaze; menadžer je vlasnik projekta ili vlasnik platforme (P7); opseg
 * „moji projekti“ je 50 (P28) i ljudi su samo oni sa kojima delim projekat (P9).
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { odbijeno } from "../projekatTest.pomoc";
import schema from "../schema";
import {
  aktivniClanoviProjekta,
  ljudiSaKojimaDelim,
} from "./lib/ljudi";
import {
  clanstvoProfila,
  jeMenadzerProjekta,
  requireClanProjekta,
  requireVlasnikPlatforme,
} from "./lib/auth";
import { listMyActiveWorkspaces } from "./lib/my_scope";
import { kao } from "./testSvet.pomoc";

// Koren projekta: ključevi `/convex/...` (iz `convex/prostor/` bi `../**` dao
// `./x.ts` za fajlove u ovoj fascikli, pa ih `convex-test` ne bi našao).
const modules = import.meta.glob("/convex/**/*.*s");

async function osoba(ctx: MutationCtx, ime: string, saProfilom = true) {
  const email = `${ime}@enigma.test`;
  const userId = await ctx.db.insert("users", { email, name: ime });
  const now = Date.now();
  const profileId = saProfilom
    ? await ctx.db.insert("profiles", {
        userId,
        displayName: ime,
        email,
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      })
    : null;
  return { userId, profileId };
}

/**
 * A (interni): ana owner (vlasnik platforme), urednica, viewer (client_viewer),
 * bezProfila (urednik bez profila). K (klijent): klijent owner (NIJE vlasnik
 * platforme), ana urednik. Arh (arhiviran): urednica urednik. stranac: nigde.
 */
async function svet() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const wsA = await ctx.db.insert("workspaces", { name: "Enigma IT", slug: "enigma-it" });
    const wsK = await ctx.db.insert("workspaces", { name: "Klijent", slug: "klijent", vrsta: "klijent" });
    const wsArh = await ctx.db.insert("workspaces", { name: "Stari", slug: "stari", arhiviran: true });
    const ana = await osoba(ctx, "ana");
    const urednica = await osoba(ctx, "urednica");
    const viewer = await osoba(ctx, "viewer");
    const bezProfila = await osoba(ctx, "bezprofila", false);
    const klijent = await osoba(ctx, "klijent");
    const stranac = await osoba(ctx, "stranac");
    const clan = (workspaceId: Id<"workspaces">, userId: Id<"users">, role: "owner" | "urednik" | "client_viewer") =>
      ctx.db.insert("members", { workspaceId, userId, role });
    await clan(wsA, ana.userId, "owner");
    await clan(wsA, urednica.userId, "urednik");
    await clan(wsA, viewer.userId, "client_viewer");
    await clan(wsA, bezProfila.userId, "urednik");
    await clan(wsK, klijent.userId, "owner");
    await clan(wsK, ana.userId, "urednik");
    await clan(wsArh, urednica.userId, "urednik");
    const areaK = await ctx.db.insert("areas", {
      workspaceId: wsK, key: "dev", label: "Razvoj", position: 0, createdAt: Date.now(),
    });
    return { wsA, wsK, wsArh, ana, urednica, viewer, bezProfila, klijent, stranac, areaK };
  });
  return { t, ...s };
}

describe("requireClanProjekta (lični nivo, bez omotača)", () => {
  test("owner i urednik prolaze; menadžer je owner ili vlasnik platforme", async () => {
    const s = await svet();
    const ana = await kao(s.t, s.ana.userId).run((ctx) => requireClanProjekta(ctx, s.wsA));
    expect(ana.membership.role).toBe("owner");
    expect(ana.isManager).toBe(true);
    const urednica = await kao(s.t, s.urednica.userId).run((ctx) => requireClanProjekta(ctx, s.wsA));
    expect(urednica.membership.role).toBe("urednik");
    expect(urednica.isManager).toBe(false);
    expect(urednica.profile._id).toBe(s.urednica.profileId);
    // Ana je u K samo urednik, ali je vlasnik platforme → menadžer (P7).
    const anaUK = await kao(s.t, s.ana.userId).run((ctx) => requireClanProjekta(ctx, s.wsK));
    expect(anaUK.membership.role).toBe("urednik");
    expect(anaUK.isManager).toBe(true);
    // Vlasnik klijentskog projekta je menadžer tog projekta, ali ne i platforme.
    const klijent = await kao(s.t, s.klijent.userId).run((ctx) => requireClanProjekta(ctx, s.wsK));
    expect(klijent.isManager).toBe(true);
  });

  test("client_viewer, nečlan, arhiviran projekat i član bez profila ne prolaze", async () => {
    const s = await svet();
    await odbijeno(
      kao(s.t, s.viewer.userId).run((ctx) => requireClanProjekta(ctx, s.wsA)),
      "forbidden",
      /urednik ili vlasnik/,
    );
    await odbijeno(
      kao(s.t, s.stranac.userId).run((ctx) => requireClanProjekta(ctx, s.wsA)),
      "forbidden",
      /Nemaš pristup ovom projektu/,
    );
    await odbijeno(
      kao(s.t, s.urednica.userId).run((ctx) => requireClanProjekta(ctx, s.wsArh)),
      "not_found",
      /Projekat nije pronađen/,
    );
    await expect(
      kao(s.t, s.bezProfila.userId).run((ctx) => requireClanProjekta(ctx, s.wsA)),
    ).rejects.toThrow(/Profil još nije spreman/);
    await odbijeno(
      s.t.run((ctx) => requireClanProjekta(ctx, s.wsA)),
      "unauthorized",
    );
  });

  test("vlasnik platforme: owner internog projekta, ne vlasnik klijentskog", async () => {
    const s = await svet();
    const ana = await kao(s.t, s.ana.userId).run((ctx) => requireVlasnikPlatforme(ctx));
    expect(ana._id).toBe(s.ana.profileId);
    await odbijeno(
      kao(s.t, s.klijent.userId).run((ctx) => requireVlasnikPlatforme(ctx)),
      "forbidden",
      /vlasnik platforme/,
    );
    const menadzeri = await s.t.run(async (ctx) => ({
      anaUK: await jeMenadzerProjekta(ctx, s.wsK, s.ana.profileId!),
      klijentUK: await jeMenadzerProjekta(ctx, s.wsK, s.klijent.profileId!),
      urednicaUA: await jeMenadzerProjekta(ctx, s.wsA, s.urednica.profileId!),
      viewerUA: await jeMenadzerProjekta(ctx, s.wsA, s.viewer.profileId!),
    }));
    expect(menadzeri).toEqual({ anaUK: true, klijentUK: true, urednicaUA: false, viewerUA: false });
  });

  test("dupli red u members ne zaključava člana i ne duplira spisak", async () => {
    const s = await svet();
    await s.t.run((ctx) =>
      ctx.db.insert("members", { workspaceId: s.wsA, userId: s.urednica.userId, role: "urednik" }),
    );
    const actor = await kao(s.t, s.urednica.userId).run((ctx) => requireClanProjekta(ctx, s.wsA));
    expect(actor.membership.role).toBe("urednik");
    const clanovi = await s.t.run((ctx) => aktivniClanoviProjekta(ctx, s.wsA, 50));
    expect(clanovi.map((c) => c.profile.displayName).sort()).toEqual(["ana", "urednica"]);
    const viewerClan = await s.t.run((ctx) => clanstvoProfila(ctx, s.wsA, s.viewer.profileId!));
    expect(viewerClan).toBeNull();
  });
});

describe("omotač projekta + adapter", () => {
  test("client_viewer i nečlan ne čitaju radni deo; urednik čita", async () => {
    const s = await svet();
    await odbijeno(
      kao(s.t, s.viewer.userId).query(api.prostor.projekat.get, { workspaceId: s.wsA }),
      "forbidden",
      /urednik ili vlasnik/,
    );
    await odbijeno(
      kao(s.t, s.stranac.userId).query(api.prostor.projekat.get, { workspaceId: s.wsA }),
      "forbidden",
      /Nemaš pristup/,
    );
    const projekat = await kao(s.t, s.urednica.userId).query(api.prostor.projekat.get, {
      workspaceId: s.wsA,
    });
    expect(projekat.name).toBe("Enigma IT");
    expect(projekat.uloga).toBe("urednik");
    expect(projekat.isManager).toBe(false);
    await odbijeno(
      kao(s.t, s.urednica.userId).query(api.prostor.projekat.get, { workspaceId: s.wsArh }),
      "not_found",
    );
  });

  test("dokument iz drugog projekta: „Stavka nije pronađena u ovom projektu“", async () => {
    const s = await svet();
    // Ana je članica i A i K, ali oblast iz K ne sme kroz poziv za A.
    await odbijeno(
      kao(s.t, s.ana.userId).mutation(api.prostor.projekat.updateArea, {
        workspaceId: s.wsA,
        areaId: s.areaK,
        label: "Upad",
      }),
      "not_found",
      /Stavka nije pronađena u ovom projektu/,
    );
    const oblast = await s.t.run((ctx) => ctx.db.get(s.areaK));
    expect(oblast?.label).toBe("Razvoj");
  });

  test("članovi projekta: samo owner i urednik sa profilom", async () => {
    const s = await svet();
    const clanovi = await kao(s.t, s.urednica.userId).query(api.prostor.projekat.listMembers, {
      workspaceId: s.wsA,
    });
    expect(clanovi.map((c) => c.profile.displayName).sort()).toEqual(["ana", "urednica"]);
  });
});

describe("opseg ličnog nivoa i ljudi (P28, P9)", () => {
  test("moji projekti: bez client_viewer i arhiviranih, najviše 50", async () => {
    const s = await svet();
    const kljucevi = (profileId: Id<"profiles">) =>
      s.t.run(async (ctx) => [...(await listMyActiveWorkspaces(ctx, profileId)).keys()]);
    expect(await kljucevi(s.urednica.profileId!)).toEqual([s.wsA]);
    expect(await kljucevi(s.viewer.profileId!)).toEqual([]);

    await s.t.run(async (ctx) => {
      for (let i = 0; i < 51; i++) {
        const ws = await ctx.db.insert("workspaces", { name: `P${i}`, slug: `p-${i}` });
        await ctx.db.insert("members", { workspaceId: ws, userId: s.klijent.userId, role: "urednik" });
      }
    });
    expect((await kljucevi(s.klijent.profileId!)).length).toBe(50);
  });

  test("ljudi: samo oni sa kojima delim projekat, bez client_viewer i mene", async () => {
    const s = await svet();
    const zaKlijenta = await s.t.run(async (ctx) => {
      const profil = await ctx.db.get(s.klijent.profileId!);
      return await ljudiSaKojimaDelim(ctx, profil!);
    });
    // Klijent deli samo K sa Anom; urednica, viewer i stranac nisu tu.
    expect(zaKlijenta.map((o) => o.profile.displayName)).toEqual(["ana"]);
    expect(zaKlijenta[0].zajedno.map((p) => p.name)).toEqual(["Klijent"]);
    const zaAnu = await s.t.run(async (ctx) => {
      const profil = await ctx.db.get(s.ana.profileId!);
      return await ljudiSaKojimaDelim(ctx, profil!);
    });
    expect(zaAnu.map((o) => o.profile.displayName)).toEqual(["klijent", "urednica"]);
  });
});
