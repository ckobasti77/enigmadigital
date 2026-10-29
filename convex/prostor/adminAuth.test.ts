/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/adminAuth.test.ts (main @ c05c40f), SPAJANJE S06.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";
import { greskaLozinke, LOZINKA_MAX, LOZINKA_MIN } from "./lib/lozinka";
import {
  lozinkaValjana,
  MAX_DUZINA,
  MIN_DUZINA,
  prvaGreskaLozinke,
} from "../../lib/password-rules";

const modules = import.meta.glob("/convex/**/*.*s");

/** Veliko/malo/broj/specijalni — prolazi pravila lozinke (Enigma: 8–128, `lib/lozinka.ts`). */
const STRONG = "NovaLozinka123!";

/**
 * Seed: admin + član (u dva aktivna i jednom arhiviranom startupu) + arhiviran
 * profil. Auth helperi (`modifyAccountCredentials`/`invalidateSessions`) traže
 * `authAccounts` + auth store i pokrivaju se ručno u devu (ZA-POPRAVKU Z6); ovde
 * se testira ono što je naše: autorizacija i activity zapis (bez lozinke).
 */
async function seed() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    async function person(
      displayName: string,
      email: string,
      role: "admin" | "member",
      archivedAt: number | null = null,
    ) {
      const userId = await ctx.db.insert("users", { email });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName,
        email,
        role,
        archivedAt,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId, email, displayName };
    }

    const admin = await person("Admin", "admin@example.test", "admin");
    const member = await person("Član", "clan@example.test", "member");
    const archivedMember = await person(
      "Bivši",
      "bivsi@example.test",
      "member",
      now,
    );

    async function workspace(name: string) {
      return await insertStartup(ctx, {
        name,
        description: "",
        createdByProfileId: admin.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    const startupA = await workspace("A");
    const startupB = await workspace("B");
    const startupC = await workspace("C");

    async function member_(
      workspaceId: typeof startupA,
      profileId: typeof member.profileId,
      archivedAt: number | null = null,
    ) {
      await insertClanstvo(ctx, {
        workspaceId,
        profileId,
        addedByProfileId: admin.profileId,
        archivedAt,
        createdAt: now,
      });
    }
    await member_(startupA, admin.profileId);
    await member_(startupA, member.profileId);
    await member_(startupB, member.profileId);
    // Arhivirano članstvo — NE sme da proizvede activity zapis.
    await member_(startupC, member.profileId, now);

    return { admin, member, archivedMember, startupA, startupB, startupC };
  });

  const asAdmin = t.withIdentity({
    subject: `${seeded.admin.userId}|sesija-test`,
  });
  const asMember = t.withIdentity({
    subject: `${seeded.member.userId}|sesija-test`,
  });

  return { t, asAdmin, asMember, ...seeded };
}

describe("adminAuth.authorizeSetPassword — autorizacija", () => {
  test("ne-admin (član) je odbijen", async () => {
    const { asMember, member, startupA } = await seed();
    await expect(
      asMember.query(internal.prostor.adminAuth.authorizeSetPassword, {
        userId: member.userId,
        workspaceId: startupA,
        profileId: member.profileId,
      }),
    ).rejects.toThrow("samo vlasnik platforme");
  });

  test("admin ne može sebi da menja lozinku ovim putem", async () => {
    const { asAdmin, admin, startupA } = await seed();
    await expect(
      asAdmin.query(internal.prostor.adminAuth.authorizeSetPassword, {
        userId: admin.userId,
        workspaceId: startupA,
        profileId: admin.profileId,
      }),
    ).rejects.toThrow("Sopstvenu");
  });

  test("arhiviran član je odbijen", async () => {
    const { asAdmin, admin, archivedMember, startupA } = await seed();
    await expect(
      asAdmin.query(internal.prostor.adminAuth.authorizeSetPassword, {
        userId: admin.userId,
        workspaceId: startupA,
        profileId: archivedMember.profileId,
      }),
    ).rejects.toThrow("nije pronađen");
  });

  test("vraća email/userId/imena za validnog člana (bez lozinke)", async () => {
    const { asAdmin, admin, member, startupA } = await seed();
    const info = await asAdmin.query(internal.prostor.adminAuth.authorizeSetPassword, {
      userId: admin.userId,
      workspaceId: startupA,
      profileId: member.profileId,
    });
    expect(info.email).toBe(member.email);
    expect(info.userId).toBe(member.userId);
    expect(info.targetName).toBe("Član");
    expect(info.adminProfileId).toBe(admin.profileId);
    expect(info.adminName).toBe("Admin");
  });
});

describe("adminAuth.adminSetPassword — javni gard", () => {
  test("neprijavljen pozivalac je odbijen", async () => {
    const { t, member, startupA } = await seed();
    await expect(
      t.action(api.prostor.adminAuth.adminSetPassword, {
        workspaceId: startupA,
        profileId: member.profileId,
        newPassword: STRONG,
      }),
    ).rejects.toThrow("prijavljeni");
  });
});

describe("adminAuth.recordPasswordChange — activity bez lozinke", () => {
  test("upisuje po jedan zapis za svaki AKTIVAN startup mete, preskače arhiviran", async () => {
    const { t, admin, member, startupA, startupB, startupC } = await seed();

    await t.mutation(internal.prostor.adminAuth.recordPasswordChange, {
      actorProfileId: admin.profileId,
      targetProfileId: member.profileId,
      adminName: "Admin",
      targetName: "Član",
    });

    const activities = await t.run((ctx) =>
      ctx.db.query("activities").collect(),
    );

    expect(activities).toHaveLength(2);
    const workspaceIds = activities.map((a) => a.workspaceId).sort();
    expect(workspaceIds).toEqual([startupA, startupB].sort());
    expect(workspaceIds).not.toContain(startupC);

    for (const a of activities) {
      expect(a.action).toBe("member_password_changed");
      expect(a.targetType).toBe("profile");
      expect(a.targetId).toBe(member.profileId);
      expect(a.actorProfileId).toBe(admin.profileId);
      expect(a.title).toContain("Admin");
      expect(a.title).toContain("Član");
      // Lozinka ne sme nigde da procuri.
      expect(a.title).not.toContain(STRONG);
      expect(typeof a.createdAt).toBe("number");
    }
  });
});

/**
 * SPAJANJE S06 (plan S01 D13, P7): lozinku članu postavlja samo vlasnik
 * platforme, i to iz projekta u kome je i on `owner`; meta mora biti
 * `owner`/`urednik` tog projekta. Pravila lozinke su Enigmina (8–128).
 */
describe("SPAJANJE: adminSetPassword samo za vlasnika platforme", () => {
  /** Projekat čiji je vlasnik obična osoba (nije vlasnik platforme), sa članom. */
  async function seedVlasnikProjekta() {
    const s = await seed();
    const extra = await s.t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", { email: "vlasnik@example.test" });
      const vlasnikProfileId = await insertProfil(ctx, {
        userId,
        displayName: "Vlasnik",
        email: "vlasnik@example.test",
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const klijentski = await insertStartup(ctx, {
        name: "Klijentski",
        description: "",
        createdByProfileId: vlasnikProfileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await insertClanstvo(ctx, {
        workspaceId: klijentski,
        profileId: s.member.profileId,
        archivedAt: null,
      });
      // Nalog sa lozinkom mete i jedna njena sesija (za proveru odjave).
      await ctx.db.insert("authAccounts", {
        userId: s.member.userId,
        provider: "password",
        providerAccountId: s.member.email,
        secret: "stari-hes",
      });
      const sesija = await ctx.db.insert("authSessions", {
        userId: s.member.userId,
        expirationTime: now + 60 * 60 * 1000,
      });
      return { vlasnikUserId: userId, klijentski, sesija };
    });
    return {
      ...s,
      ...extra,
      asVlasnik: s.t.withIdentity({ subject: `${extra.vlasnikUserId}|sesija-test` }),
    };
  }

  test("vlasnik projekta koji nije vlasnik platforme i urednik su odbijeni; ništa se ne menja", async () => {
    const s = await seedVlasnikProjekta();
    await expect(
      s.asVlasnik.action(api.prostor.adminAuth.adminSetPassword, {
        workspaceId: s.klijentski,
        profileId: s.member.profileId,
        newPassword: STRONG,
      }),
    ).rejects.toThrow("samo vlasnik platforme");
    // Urednik pada već na omotaču (P!: samo vlasnik projekta).
    await expect(
      s.asMember.action(api.prostor.adminAuth.adminSetPassword, {
        workspaceId: s.startupA,
        profileId: s.admin.profileId,
        newPassword: STRONG,
      }),
    ).rejects.toThrow("samo vlasnik projekta");

    const stanje = await s.t.run(async (ctx) => ({
      account: await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", s.member.userId).eq("provider", "password"),
        )
        .first(),
      sesija: await ctx.db.get(s.sesija),
      aktivnosti: await ctx.db.query("activities").collect(),
    }));
    expect(stanje.account?.secret).toBe("stari-hes");
    expect(stanje.sesija).not.toBeNull();
    expect(stanje.aktivnosti).toHaveLength(0);
  });

  test("meta mora biti član projekta iz kog se radnja pokreće", async () => {
    const s = await seedVlasnikProjekta();
    // Vlasnik platforme je owner A, ali meta „Vlasnik” nije član A.
    const vlasnikProfila = await s.t.run((ctx) =>
      ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", s.vlasnikUserId))
        .first(),
    );
    await expect(
      s.asAdmin.query(internal.prostor.adminAuth.authorizeSetPassword, {
        userId: s.admin.userId,
        workspaceId: s.startupA,
        profileId: vlasnikProfila!._id,
      }),
    ).rejects.toThrow("mora pripadati ovom projektu");
  });

  test("pravila lozinke su Enigmina: 8 znakova je dovoljno, 7 nije", async () => {
    const s = await seedVlasnikProjekta();
    await expect(
      s.asAdmin.action(api.prostor.adminAuth.adminSetPassword, {
        workspaceId: s.startupA,
        profileId: s.member.profileId,
        newPassword: "Kratk1!",
      }),
    ).rejects.toThrow("bar 8 znakova");
    // Bez znaka koji nije slovo ni cifra.
    await expect(
      s.asAdmin.action(api.prostor.adminAuth.adminSetPassword, {
        workspaceId: s.startupA,
        profileId: s.member.profileId,
        newPassword: "Kratka12",
      }),
    ).rejects.toThrow("nije slovo ni cifra");
  });

  test("vlasnik platforme menja lozinku: novi heš, sesije mete ugašene, aktivnost bez lozinke", async () => {
    const s = await seedVlasnikProjekta();
    const nova = "Kratka1!"; // 8 znakova: Devotion (12+) bi je odbio
    await s.asAdmin.action(api.prostor.adminAuth.adminSetPassword, {
      workspaceId: s.startupA,
      profileId: s.member.profileId,
      newPassword: nova,
    });
    const stanje = await s.t.run(async (ctx) => ({
      account: await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", s.member.userId).eq("provider", "password"),
        )
        .first(),
      sesija: await ctx.db.get(s.sesija),
      aktivnosti: await ctx.db.query("activities").collect(),
    }));
    expect(stanje.account?.secret).toBeDefined();
    expect(stanje.account?.secret).not.toBe("stari-hes");
    expect(stanje.account?.secret).not.toContain(nova);
    expect(stanje.sesija).toBeNull();
    // Meta je urednik u A, B i „Klijentski” (C je napustila): po jedan zapis.
    expect(stanje.aktivnosti.map((a) => a.workspaceId).sort()).toEqual(
      [s.startupA, s.startupB, s.klijentski].sort(),
    );
    for (const a of stanje.aktivnosti) expect(a.title).not.toContain(nova);
  });
});

describe("SPAJANJE: pravila lozinke = Enigmina prijava", () => {
  test("lib/lozinka.ts daje istu poruku kao lib/password-rules.ts", () => {
    expect(LOZINKA_MIN).toBe(MIN_DUZINA);
    expect(LOZINKA_MAX).toBe(MAX_DUZINA);
    const uzorci = [
      "a",
      "Kratk1!",
      "Kratka1!",
      "kratka1!",
      "KRATKA1!",
      "Kratkaa!",
      "Kratka12",
      "Čćžšđ12!",
      "čćžšđ12!",
      "NovaLozinka123!",
      "A1!" + "a".repeat(125),
      "A1!" + "a".repeat(126),
    ];
    for (const lozinka of uzorci) {
      expect(greskaLozinke(lozinka)).toBe(prvaGreskaLozinke(lozinka));
      expect(greskaLozinke(lozinka) === null).toBe(lozinkaValjana(lozinka));
    }
  });
});
