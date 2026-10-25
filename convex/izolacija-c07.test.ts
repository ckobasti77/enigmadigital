/// <reference types="vite/client" />
/**
 * Izolacija grupe C07, deo koji nije u posebnim fajlovima: članovi,
 * pozivnice i stanje webhook-a (cela platforma). Ostali moduli grupe imaju
 * svoje fajlove: `izolacija-c07-meta` (Meta oglasi, CAPI), `-akcije` (akcije
 * nad oglasima, Google oglasi), `-pravila` (pravila oglasa), `-veze` (veze,
 * sinhronizacija, brisanje, GBP, brojač javnih ruta).
 *
 * Za svaki modul: član projekta A ne čita B i ne menja ga, `client_viewer` ne
 * menja, a funkcije vlasnika odbijaju urednika.
 */
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const NEMA_PRISTUP = /Nemaš pristup ovom projektu/;
const TREBA_VLASNIK = /samo vlasnik projekta/;
const TREBA_PLATFORMA = /samo vlasnik platforme/;

async function clanovi(s: Svet, ws: Id<"workspaces">): Promise<Id<"users">[]> {
  return await s.t.run(async (ctx) =>
    (
      await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", ws))
        .collect()
    ).map((m) => m.userId),
  );
}

async function pozivnica(
  s: Svet,
  ws: Id<"workspaces">,
  createdBy: Id<"users">,
  email: string,
  stanje: { revokedAt?: number } = {},
): Promise<Id<"invites">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("invites", {
      workspaceId: ws,
      email,
      tokenHash: `hash-${email}`,
      createdBy,
      createdAt: 1_760_000_000_000,
      expiresAt: Date.now() + 86_400_000,
      ...stanje,
    }),
  );
}

describe("članovi", () => {
  test("član A ne čita i ne menja članove B; u A vidi samo članove A", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);

    await odbijeno(ana.query(api.membersStore.listMembers, { workspaceId: s.wsB }), "forbidden", NEMA_PRISTUP);
    await odbijeno(
      ana.mutation(api.membersStore.removeMember, {
        workspaceId: s.wsB,
        userId: s.boban,
        preuzimaLeadoveUserId: s.jovan,
      }),
      "forbidden",
      NEMA_PRISTUP,
    );
    expect(await clanovi(s, s.wsB)).toContain(s.boban);

    const uA = await ana.query(api.membersStore.listMembers, { workspaceId: s.wsA });
    expect(new Set(uA.map((c) => c.userId))).toEqual(
      new Set([s.ana, s.urednica, s.viewer, s.jovan]),
    );
    expect(uA.find((c) => c.userId === s.ana)?.isSelf).toBe(true);

    // Jovan (član oba) u B vidi B.
    const uB = await kao(s, s.jovan).query(api.membersStore.listMembers, { workspaceId: s.wsB });
    expect(new Set(uB.map((c) => c.userId))).toEqual(new Set([s.boban, s.jovan]));
  });

  test("posmatrač čita spisak; urednik i posmatrač ne uklanjaju članove", async () => {
    const s = await napraviSvet();
    const spisak = await kao(s, s.viewer).query(api.membersStore.listMembers, {
      workspaceId: s.wsA,
    });
    expect(spisak.length).toBe(4);

    for (const ko of [s.urednica, s.viewer]) {
      await odbijeno(
        kao(s, ko).mutation(api.membersStore.removeMember, {
          workspaceId: s.wsA,
          userId: s.jovan,
          preuzimaLeadoveUserId: s.ana,
        }),
        "forbidden",
        TREBA_VLASNIK,
      );
    }
    expect(await clanovi(s, s.wsA)).toContain(s.jovan);
  });

  test("uklanjanje iz A ne dira članstvo u B; član samo B se ne uklanja kroz A", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);

    await expect(
      ana.mutation(api.membersStore.removeMember, {
        workspaceId: s.wsA,
        userId: s.boban,
        preuzimaLeadoveUserId: s.ana,
      }),
    ).rejects.toThrow(/not_found[\s\S]*nije član ovog projekta/);
    expect(await clanovi(s, s.wsB)).toContain(s.boban);

    const r = await ana.mutation(api.membersStore.removeMember, {
      workspaceId: s.wsA,
      userId: s.jovan,
      preuzimaLeadoveUserId: s.ana,
    });
    expect(r.prenetoLeadova).toBe(0);
    expect(await clanovi(s, s.wsA)).not.toContain(s.jovan);
    expect(await clanovi(s, s.wsB)).toContain(s.jovan);
    // Jovan i dalje radi u B.
    await kao(s, s.jovan).query(api.membersStore.listMembers, { workspaceId: s.wsB });
  });
});

describe("pozivnice", () => {
  test("član A ne vidi i ne menja pozivnice B", async () => {
    const s = await napraviSvet();
    const pozivnicaB = await pozivnica(s, s.wsB, s.boban, "novi@scanme.test");
    const ana = kao(s, s.ana);

    await odbijeno(ana.query(api.invitesStore.listInvites, { workspaceId: s.wsB }), "forbidden", NEMA_PRISTUP);
    await odbijeno(
      ana.mutation(api.invitesStore.createInvite, { workspaceId: s.wsB, email: "upad@niko.test" }),
      "forbidden",
      NEMA_PRISTUP,
    );
    await odbijeno(
      ana.mutation(api.invitesStore.revokeInvite, { workspaceId: s.wsB, inviteId: pozivnicaB }),
      "forbidden",
      NEMA_PRISTUP,
    );
    await odbijeno(
      ana.mutation(api.invitesStore.deleteInvite, { workspaceId: s.wsB, inviteId: pozivnicaB }),
      "forbidden",
      NEMA_PRISTUP,
    );

    // Tuđa pozivnica kroz sopstveni projekat: ne povlači se i ne briše.
    await odbijeno(
      ana.mutation(api.invitesStore.revokeInvite, { workspaceId: s.wsA, inviteId: pozivnicaB }),
      "forbidden",
    );
    await odbijeno(
      ana.mutation(api.invitesStore.deleteInvite, { workspaceId: s.wsA, inviteId: pozivnicaB }),
      "forbidden",
    );

    const posle = await s.t.run(async (ctx) => ({
      b: await ctx.db.get(pozivnicaB),
      sve: await ctx.db.query("invites").collect(),
    }));
    expect(posle.b?.revokedAt).toBeUndefined();
    expect(posle.sve.map((i) => i.email)).toEqual(["novi@scanme.test"]);
  });

  test("pozivnice pravi i vidi samo vlasnik; spisak u A ne sadrži B", async () => {
    const s = await napraviSvet();
    await pozivnica(s, s.wsB, s.boban, "novi@scanme.test");
    const mojaA = await pozivnica(s, s.wsA, s.ana, "stara@enigma.test", { revokedAt: 1 });

    for (const ko of [s.urednica, s.viewer]) {
      await odbijeno(
        kao(s, ko).query(api.invitesStore.listInvites, { workspaceId: s.wsA }),
        "forbidden",
        TREBA_VLASNIK,
      );
      await odbijeno(
        kao(s, ko).mutation(api.invitesStore.createInvite, { workspaceId: s.wsA, email: "x@enigma.test" }),
        "forbidden",
        TREBA_VLASNIK,
      );
      await odbijeno(
        kao(s, ko).mutation(api.invitesStore.deleteInvite, { workspaceId: s.wsA, inviteId: mojaA }),
        "forbidden",
        TREBA_VLASNIK,
      );
    }

    const ana = kao(s, s.ana);
    const nova = await ana.mutation(api.invitesStore.createInvite, {
      workspaceId: s.wsA,
      email: "Nova@Enigma.test",
    });
    expect(nova.email).toBe("nova@enigma.test");

    const spisakA = await ana.query(api.invitesStore.listInvites, { workspaceId: s.wsA });
    expect(spisakA.map((i) => i.email).sort()).toEqual(["nova@enigma.test", "stara@enigma.test"]);
    const spisakB = await kao(s, s.jovan).query(api.invitesStore.listInvites, { workspaceId: s.wsB });
    expect(spisakB.map((i) => i.email)).toEqual(["novi@scanme.test"]);

    await ana.mutation(api.invitesStore.deleteInvite, { workspaceId: s.wsA, inviteId: mojaA });
    expect(await s.t.run(async (ctx) => ctx.db.get(mojaA))).toBeNull();
  });
});

describe("stanje webhook-a (cela platforma)", () => {
  test("čita samo vlasnik platforme", async () => {
    const s = await napraviSvet();

    const stanje = await kao(s, s.ana).query(api.webhookHealth.status, {});
    expect(stanje.map((r) => r.route)).toEqual(["instagram", "facebook", "threads"]);

    await odbijeno(s.t.query(api.webhookHealth.status, {}), "unauthorized");
    for (const ko of [s.klijent, s.urednica, s.viewer, s.stranac]) {
      await odbijeno(kao(s, ko).query(api.webhookHealth.status, {}), "forbidden", TREBA_PLATFORMA);
    }
  });
});
