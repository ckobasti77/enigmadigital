/// <reference types="vite/client" />
// SPAJANJE S06: ljudi u porukama (P9), vlasnik platforme umesto admina (P7) i
// opseg „Čeka tebe” kroz Enigmino članstvo (plan S01 §9.1).

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

async function osoba(ctx: MutationCtx, ime: string, role: "admin" | "member" = "member") {
  const now = Date.now();
  const email = `${ime.toLowerCase()}@example.test`;
  const userId = await ctx.db.insert("users", { name: ime, email });
  const profileId = await insertProfil(ctx, {
    userId,
    displayName: ime,
    email,
    role,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { userId, profileId };
}

async function projekat(ctx: MutationCtx, ime: string, kreator: Id<"profiles">) {
  const now = Date.now();
  return await insertStartup(ctx, {
    name: ime,
    description: "",
    createdByProfileId: kreator,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function opstiKanal(ctx: MutationCtx, workspaceId: Id<"workspaces">, autor: Id<"profiles">) {
  const now = Date.now();
  return await ctx.db.insert("chatChannels", {
    workspaceId,
    kind: "startup",
    areaId: null,
    anchorType: null,
    anchorId: null,
    dmKey: null,
    name: "Opšte",
    isPrivate: false,
    lastMessageAt: now,
    lastMessagePreview: "",
    lastMessageAuthorId: null,
    messageCount: 0,
    createdByProfileId: autor,
    archivedAt: null,
    createdAt: now,
  });
}

/**
 * Jovan (vlasnik platforme) i Ana (vlasnica projekta, nije vlasnik platforme)
 * vode projekat „Tim”; Marko je urednik, Klijent je `client_viewer` sa starim
 * profilom. Stranac ima profil, ali nijedan zajednički projekat.
 */
async function seed() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const jovan = await osoba(ctx, "Jovan", "admin");
    const ana = await osoba(ctx, "Ana");
    const marko = await osoba(ctx, "Marko");
    const klijent = await osoba(ctx, "Klijent");
    const stranac = await osoba(ctx, "Stranac");
    const tim = await projekat(ctx, "Tim", ana.profileId);
    await insertClanstvo(ctx, { workspaceId: tim, profileId: jovan.profileId, archivedAt: null });
    await insertClanstvo(ctx, { workspaceId: tim, profileId: marko.profileId, archivedAt: null });
    await ctx.db.insert("members", { workspaceId: tim, userId: klijent.userId, role: "client_viewer" });
    const tudji = await projekat(ctx, "Tuđi", stranac.profileId);
    const opste = await opstiKanal(ctx, tim, ana.profileId);
    return { jovan, ana, marko, klijent, stranac, tim, tudji, opste };
  });
  const kao = (p: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${p.userId}|sesija-test` });
  return { t, ...s, kao };
}

describe("P9: ljudi u porukama", () => {
  test("listPeople: samo owner/urednik iz zajedničkih projekata, bez client_viewer-a i stranaca", async () => {
    const s = await seed();
    const ljudi = await s.kao(s.marko).query(api.prostor.chat.listPeople, {});
    expect(ljudi.map((p) => p.displayName)).toEqual(["Ana", "Jovan"]);
    for (const p of ljudi) {
      expect(p.sharedStartupNames).toEqual(["Tim"]);
      expect(Object.keys(p).sort()).toEqual(
        ["_id", "avatarUrl", "displayName", "sharedStartupNames"].sort(),
      );
    }
  });

  test("lični razgovor ne može da se otvori sa strancem ni sa client_viewer-om", async () => {
    const s = await seed();
    for (const drugi of [s.stranac, s.klijent]) {
      await expect(
        s.kao(s.marko).mutation(api.prostor.chat.openPersonalDm, {
          otherProfileId: drugi.profileId,
        }),
      ).rejects.toThrow("Sa ovom osobom ne deliš nijedan projekat.");
      await expect(
        s.kao(s.marko).mutation(api.prostor.chat.createPersonalGroup, {
          name: "Grupa",
          memberProfileIds: [s.ana.profileId, drugi.profileId],
        }),
      ).rejects.toThrow("Sa ovom osobom ne deliš nijedan projekat.");
    }
    const dm = await s.kao(s.marko).mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    expect(dm).toBeDefined();
    const kanali = await s.t.run((ctx) => ctx.db.query("chatChannels").collect());
    // Opšti kanal + jedan DM; odbijeni pokušaji ništa nisu upisali.
    expect(kanali).toHaveLength(2);
  });

  test("poruka u opštem kanalu ne obaveštava client_viewer-a", async () => {
    const s = await seed();
    await s.kao(s.ana).mutation(api.prostor.chat.sendMessage, {
      channelId: s.opste,
      body: "Zdravo timu",
    });
    const primaoci = await s.t.run(async (ctx) =>
      (await ctx.db.query("notifications").collect()).map((n) => n.recipientProfileId),
    );
    expect(primaoci.sort()).toEqual([s.jovan.profileId, s.marko.profileId].sort());
    await expect(
      s.kao(s.klijent).query(api.prostor.chat.messages, {
        channelId: s.opste,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();
  });
});

describe("P7: kanale tima drži vlasnik platforme", () => {
  test("vlasnica projekta ne pravi kanal tima, vlasnik platforme pravi i arhivira", async () => {
    const s = await seed();
    await expect(
      s.kao(s.ana).mutation(api.prostor.chat.createChannel, {
        workspaceId: s.tim,
        name: "Prodaja",
        isPrivate: false,
      }),
    ).rejects.toThrow("samo vlasnik platforme");
    const kanal = await s.kao(s.jovan).mutation(api.prostor.chat.createChannel, {
      workspaceId: s.tim,
      name: "Prodaja",
      isPrivate: false,
    });
    await expect(
      s.kao(s.ana).mutation(api.prostor.chat.archiveChannel, { channelId: kanal }),
    ).rejects.toThrow("samo vlasnik platforme");
    await s.kao(s.jovan).mutation(api.prostor.chat.archiveChannel, { channelId: kanal });
    const red = await s.t.run((ctx) => ctx.db.get("chatChannels", kanal));
    expect(red?.archivedAt).not.toBeNull();
  });

  test("tuđu poruku briše vlasnik platforme, ne vlasnica projekta", async () => {
    const s = await seed();
    const poslata = await s.kao(s.marko).mutation(api.prostor.chat.sendMessage, {
      channelId: s.opste,
      body: "Moja poruka",
    });
    if (!poslata.ok) throw new Error("Poruka nije poslata.");
    await expect(
      s.kao(s.ana).mutation(api.prostor.chat.deleteMessage, { messageId: poslata.messageId }),
    ).rejects.toThrow("samo autor ili vlasnik platforme");
    await s.kao(s.jovan).mutation(api.prostor.chat.deleteMessage, {
      messageId: poslata.messageId,
    });
    const red = await s.t.run((ctx) => ctx.db.get("chatMessages", poslata.messageId));
    expect(red?.deletedAt).not.toBeNull();
  });
});

describe("„Čeka tebe” kroz sve projekte (plan S01 §9.1)", () => {
  async function seedProjekti(broj: number) {
    const t = convexTest(schema, modules);
    const ja = await t.run(async (ctx) => {
      const ja = await osoba(ctx, "Ja");
      for (let i = 0; i < broj; i++) await projekat(ctx, `P${i + 1}`, ja.profileId);
      return ja;
    });
    return t.withIdentity({ subject: `${ja.userId}|sesija-test` });
  }

  test("20 projekata se čita cele; 21. projekat daje truncated umesto tihog odsecanja", async () => {
    const dvadeset = await seedProjekti(20);
    expect(
      await dvadeset.query(api.prostor.inbox.pending, { include: ["idea_vote"] }),
    ).toEqual({ items: [], truncated: false });
    const dvadesetJedan = await seedProjekti(21);
    expect(
      await dvadesetJedan.query(api.prostor.inbox.pending, { include: ["idea_vote"] }),
    ).toEqual({ items: [], truncated: true });
  });
});
