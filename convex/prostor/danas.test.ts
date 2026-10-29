/// <reference types="vite/client" />
/**
 * Danas (SPAJANJE S19, plan S18 E6): lični upiti koje ekran zove — Moj dan,
 * Inbox ukratko, nepročitane poruke i ideje za glasanje — ne daju ništa iz
 * projekta u kome sam posmatrač (`client_viewer`) i ne bacaju grešku zbog
 * njega. Projektni upit radnog dela sa ID-jem takvog projekta se odbija.
 *
 * Moj dan, Moji zadaci i `listEverywhere` za posmatrača već pokriva
 * `zadaci.test.ts` (S04); ovde su upiti desne kolone ekrana Danas.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { odbijeno } from "../projekatTest.pomoc";
import schema from "../schema";
import { insertProfil, kao } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const DAN = "2026-10-29";
const PRE = 1_700_000_000_000;

async function osoba(ctx: MutationCtx, ime: string) {
  const email = `${ime}@enigma.test`;
  const userId = await ctx.db.insert("users", { email, name: ime });
  const profileId = await insertProfil(ctx, {
    userId,
    displayName: ime,
    email,
    role: "member",
    archivedAt: null,
    createdAt: PRE,
    updatedAt: PRE,
  });
  return { userId, profileId };
}

async function kanal(ctx: MutationCtx, workspaceId: Id<"workspaces">, autor: Id<"profiles">) {
  return await ctx.db.insert("chatChannels", {
    workspaceId,
    kind: "startup",
    areaId: null,
    anchorType: null,
    anchorId: null,
    dmKey: null,
    name: "Opšte",
    isPrivate: false,
    lastMessageAt: PRE,
    lastMessagePreview: "",
    lastMessageAuthorId: null,
    messageCount: 0,
    createdByProfileId: autor,
    archivedAt: null,
    createdAt: PRE,
  });
}

/**
 * Ja: urednik u A i posmatrač u C (bio urednik, pa su ostali tragovi).
 * Kolega je owner u oba. U oba projekta imam nepročitano obaveštenje,
 * nepročitane poruke i ideju koja čeka moj glas.
 */
async function svet() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const ja = await osoba(ctx, "ja");
    const kolega = await osoba(ctx, "kolega");
    const projekat = async (ime: string, mojaUloga: "urednik" | "client_viewer") => {
      const workspaceId = await ctx.db.insert("workspaces", { name: ime, slug: ime.toLowerCase(), vrsta: "klijent" });
      await ctx.db.insert("members", { workspaceId, userId: kolega.userId, role: "owner" });
      await ctx.db.insert("members", { workspaceId, userId: ja.userId, role: mojaUloga });
      await ctx.db.insert("notifications", {
        recipientProfileId: ja.profileId,
        workspaceId,
        type: "task_assigned",
        title: `Zadatak u ${ime}`,
        targetType: "page",
        targetId: null,
        actorProfileId: kolega.profileId,
        dedupeKey: null,
        readAt: null,
        createdAt: PRE,
      });
      const channelId = await kanal(ctx, workspaceId, kolega.profileId);
      await ctx.db.insert("chatReads", {
        channelId,
        profileId: ja.profileId,
        workspaceId,
        lastReadAt: PRE,
        lastReadMessageId: null,
        unreadCount: 2,
        mentionCount: 1,
        updatedAt: PRE,
      });
      await ctx.db.insert("ideaNodes", {
        workspaceId,
        authorProfileId: kolega.profileId,
        title: `Ideja ${ime}`,
        text: `Ideja ${ime} tekst`,
        searchText: `Ideja ${ime}`,
        x: 0,
        y: 0,
        color: "violet",
        convertedPageId: null,
        convertedAt: null,
        stage: "razmatra_se",
        stageChangedAt: PRE,
        archivedAt: null,
        createdAt: PRE,
        updatedAt: PRE,
      });
      return workspaceId;
    };
    const A = await projekat("A", "urednik");
    const C = await projekat("C", "client_viewer");
    return { ja, kolega, A, C };
  });
  return { t, ...s, ja_: kao(t, s.ja.userId) };
}

describe("Danas: projekat posmatrača ne daje stavke radnog dela", () => {
  test("Inbox ukratko i brojač nepročitanog vide samo projekat radnog dela", async () => {
    const s = await svet();
    const feed = await s.ja_.query(api.prostor.inbox.feed, {
      unreadOnly: true,
      paginationOpts: { numItems: 3, cursor: null },
    });
    expect(feed.page.map((n) => n.workspace?._id)).toEqual([s.A]);

    const brojevi = await s.ja_.query(api.prostor.inbox.unreadCounts, {});
    expect(brojevi.byStartup.map((b) => b.workspaceId)).toEqual([s.A]);
    expect(brojevi.total.count).toBe(1);
  });

  test("nepročitane poruke ne broje kanal projekta posmatrača", async () => {
    const s = await svet();
    const poruke = await s.ja_.query(api.prostor.chat.unreadSummary, {});
    expect(poruke.byStartup.map((b) => b.workspaceId)).toEqual([s.A]);
    expect(poruke.total).toEqual({ unreadCount: 2, mentionCount: 1 });
  });

  test("ideje za glasanje: samo iz projekta radnog dela", async () => {
    const s = await svet();
    const ceka = await s.ja_.query(api.prostor.inbox.pending, { include: ["idea_vote"] });
    expect(ceka.items.map((i) => i.workspace._id)).toEqual([s.A]);
    expect(ceka.truncated).toBe(false);
  });

  test("Moj dan ne nosi projekat posmatrača, a upit radnog dela sa njegovim ID-jem se odbija", async () => {
    const s = await svet();
    const dan = await s.ja_.query(api.prostor.myDay.overview, { dayKey: DAN, doneSince: 0 });
    expect(dan.workspaces.map((w) => w._id)).toEqual([s.A]);
    await odbijeno(
      s.ja_.query(api.prostor.inbox.pending, { include: ["idea_vote"], workspaceId: s.C }),
      "forbidden",
    );
  });
});
