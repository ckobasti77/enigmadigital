/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/aiProviders.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const KEY_A = "sk-groq-aaaabbbb"; // suffix "bbbb"
const KEY_B = "sk-groq-ccccdddd"; // suffix "dddd"
const BASE_URL = "https://api.groq.com/openai/v1";
const MODEL = "llama-3.3-70b-versatile";

async function seedAiWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    async function createPerson(
      displayName: string,
      email: string,
      role: "admin" | "member",
    ) {
      const userId = await ctx.db.insert("users", { email });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName,
        email,
        role,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId, email };
    }

    const admin = await createPerson("Admin", "admin@example.test", "admin");
    const member = await createPerson("Član", "clan@example.test", "member");
    // Admin drugog startupa — admin rola, ali NIJE član ovog startupa.
    const outsiderAdmin = await createPerson(
      "Tuđ admin",
      "tudj@example.test",
      "admin",
    );
    // Enigma (S01 D14): vlasnik projekta koji NIJE vlasnik platforme.
    const projectOwner = await createPerson(
      "Vlasnik projekta",
      "vlasnik@example.test",
      "member",
    );

    const workspaceId = await insertStartup(ctx, {
      name: "Projekat",
      description: "",
      createdByProfileId: admin.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    for (const profileId of [admin.profileId, member.profileId]) {
      await insertClanstvo(ctx, {
        workspaceId,
        profileId,
        addedByProfileId: admin.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    await ctx.db.insert("members", {
      workspaceId,
      userId: projectOwner.userId,
      role: "owner",
    });

    return { admin, member, outsiderAdmin, projectOwner, workspaceId };
  });

  const asAdmin = t.withIdentity({
    subject: `${seeded.admin.userId}|sesija-test`,
  });
  const asMember = t.withIdentity({
    subject: `${seeded.member.userId}|sesija-test`,
  });
  const asOutsiderAdmin = t.withIdentity({
    subject: `${seeded.outsiderAdmin.userId}|sesija-test`,
  });
  const asProjectOwner = t.withIdentity({
    subject: `${seeded.projectOwner.userId}|sesija-test`,
  });

  return { t, asAdmin, asMember, asOutsiderAdmin, asProjectOwner, ...seeded };
}

describe("aiProviders — disciplina oko ključa", () => {
  test("nijedan javni upit ne vraća apiKey", async () => {
    const { asAdmin, workspaceId } = await seedAiWorkspace();
    await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });

    const rows = await asAdmin.query(api.prostor.aiProviders.list, { workspaceId });
    expect(rows).toHaveLength(1);
    for (const row of rows) {
      expect(row).not.toHaveProperty("apiKey");
    }
    // UI vidi samo poslednja 4 znaka.
    expect(rows[0].keySuffix).toBe("bbbb");
  });

  test("apiKey se čita samo kroz internal funkciju", async () => {
    const { t, asAdmin, workspaceId } = await seedAiWorkspace();
    const providerId = await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });

    const withKey = await t.query(internal.prostor.aiProviders.getWithKey, {
      providerId,
    });
    expect(withKey?.apiKey).toBe(KEY_A);

    const dflt = await t.query(
      internal.prostor.aiProviders.getDefaultProviderWithKey,
      { workspaceId },
    );
    expect(dflt?.apiKey).toBe(KEY_A);
  });

  test("lastError se sanitizuje — ključ ne procuri kroz grešku", async () => {
    const { t, asAdmin, workspaceId } = await seedAiWorkspace();
    const providerId = await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });

    await t.mutation(internal.prostor.aiProviders.recordError, {
      providerId,
      message: `401 Unauthorized: Authorization: Bearer ${KEY_A}`,
    });

    const rows = await asAdmin.query(api.prostor.aiProviders.list, { workspaceId });
    expect(rows[0].lastError).not.toBeNull();
    expect(rows[0].lastError).not.toContain(KEY_A);
    expect(rows[0].lastError).toContain("[REDACTED]");
  });
});

describe("aiProviders — autorizacija", () => {
  test("član bez admin role ne sme da menja provajdere", async () => {
    const { asAdmin, asMember, asProjectOwner, workspaceId } =
      await seedAiWorkspace();
    const providerId = await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });

    await expect(
      asMember.mutation(api.prostor.aiProviders.create, {
        workspaceId,
        label: "X",
        baseUrl: BASE_URL,
        model: MODEL,
        apiKey: KEY_B,
      }),
    ).rejects.toThrow("samo vlasnik projekta");
    await expect(
      asMember.mutation(api.prostor.aiProviders.update, {
        workspaceId,
        providerId,
        label: "X",
      }),
    ).rejects.toThrow("samo vlasnik projekta");
    await expect(
      asMember.mutation(api.prostor.aiProviders.setDefault, { workspaceId, providerId }),
    ).rejects.toThrow("samo vlasnik projekta");
    await expect(
      asMember.mutation(api.prostor.aiProviders.remove, { workspaceId, providerId }),
    ).rejects.toThrow("samo vlasnik projekta");
    await expect(
      asMember.query(api.prostor.aiProviders.list, { workspaceId }),
    ).rejects.toThrow("samo vlasnik projekta");

    // Enigma (S01 D14): vlasnik projekta bez uloge vlasnika platforme prolazi
    // omotač, ali ga proverava vlasnik platforme.
    await expect(
      asProjectOwner.mutation(api.prostor.aiProviders.create, {
        workspaceId,
        label: "X",
        baseUrl: BASE_URL,
        model: MODEL,
        apiKey: KEY_B,
      }),
    ).rejects.toThrow("samo vlasnik platforme");
    await expect(
      asProjectOwner.mutation(api.prostor.aiProviders.update, {
        workspaceId,
        providerId,
        label: "X",
      }),
    ).rejects.toThrow("samo vlasnik platforme");
    await expect(
      asProjectOwner.mutation(api.prostor.aiProviders.setDefault, {
        workspaceId,
        providerId,
      }),
    ).rejects.toThrow("samo vlasnik platforme");
    await expect(
      asProjectOwner.mutation(api.prostor.aiProviders.remove, {
        workspaceId,
        providerId,
      }),
    ).rejects.toThrow("samo vlasnik platforme");
    await expect(
      asProjectOwner.query(api.prostor.aiProviders.list, { workspaceId }),
    ).rejects.toThrow("samo vlasnik platforme");
  });

  test("admin koji nije član startupa je odbijen", async () => {
    const { asOutsiderAdmin, workspaceId } = await seedAiWorkspace();
    await expect(
      asOutsiderAdmin.mutation(api.prostor.aiProviders.create, {
        workspaceId,
        label: "X",
        baseUrl: BASE_URL,
        model: MODEL,
        apiKey: KEY_A,
      }),
    ).rejects.toThrow("Nemaš pristup");
  });
});

describe("aiProviders — CRUD i podrazumevani model", () => {
  test("prvi provajder je podrazumevani i uključen; keySuffix je poslednja 4", async () => {
    const { asAdmin, workspaceId } = await seedAiWorkspace();
    await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });
    const rows = await asAdmin.query(api.prostor.aiProviders.list, { workspaceId });
    expect(rows[0].isDefault).toBe(true);
    expect(rows[0].enabled).toBe(true);
    expect(rows[0].keySuffix).toBe("bbbb");
  });

  test("izmena bez apiKey ne dira ključ; sa apiKey menja suffix", async () => {
    const { t, asAdmin, workspaceId } = await seedAiWorkspace();
    const providerId = await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "Groq",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });

    // Izmena samo naziva — ključ ostaje netaknut.
    await asAdmin.mutation(api.prostor.aiProviders.update, {
      workspaceId,
      providerId,
      label: "Groq — Llama",
    });
    let withKey = await t.query(internal.prostor.aiProviders.getWithKey, {
      providerId,
    });
    expect(withKey?.apiKey).toBe(KEY_A);
    expect(withKey?.label).toBe("Groq — Llama");

    // Izmena sa novim ključem — suffix se preračunava.
    await asAdmin.mutation(api.prostor.aiProviders.update, {
      workspaceId,
      providerId,
      apiKey: KEY_B,
    });
    withKey = await t.query(internal.prostor.aiProviders.getWithKey, { providerId });
    expect(withKey?.apiKey).toBe(KEY_B);
    const rows = await asAdmin.query(api.prostor.aiProviders.list, { workspaceId });
    expect(rows[0].keySuffix).toBe("dddd");
  });

  test("setDefault ostavlja tačno jedan podrazumevani", async () => {
    const { asAdmin, workspaceId } = await seedAiWorkspace();
    const p1 = await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "P1",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });
    const p2 = await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "P2",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_B,
    });

    await asAdmin.mutation(api.prostor.aiProviders.setDefault, { workspaceId, providerId: p2 });
    const rows = await asAdmin.query(api.prostor.aiProviders.list, { workspaceId });
    const defaults = rows.filter((r) => r.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]._id).toBe(p2);
    expect(rows.find((r) => r._id === p1)?.isDefault).toBe(false);
  });

  test("brisanje podrazumevanog promoviše drugi uključeni", async () => {
    const { asAdmin, workspaceId } = await seedAiWorkspace();
    const p1 = await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "P1",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });
    const p2 = await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "P2",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_B,
    });

    await asAdmin.mutation(api.prostor.aiProviders.remove, { workspaceId, providerId: p1 });
    const rows = await asAdmin.query(api.prostor.aiProviders.list, { workspaceId });
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(p2);
    expect(rows[0].isDefault).toBe(true);
  });

  test("gašenje podrazumevanog promoviše drugi uključeni", async () => {
    const { asAdmin, workspaceId } = await seedAiWorkspace();
    const p1 = await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "P1",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_A,
    });
    const p2 = await asAdmin.mutation(api.prostor.aiProviders.create, {
      workspaceId,
      label: "P2",
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: KEY_B,
    });

    await asAdmin.mutation(api.prostor.aiProviders.update, {
      workspaceId,
      providerId: p1,
      enabled: false,
    });
    const rows = await asAdmin.query(api.prostor.aiProviders.list, { workspaceId });
    expect(rows.find((r) => r._id === p1)?.isDefault).toBe(false);
    expect(rows.find((r) => r._id === p2)?.isDefault).toBe(true);
  });

  test("prekratak ključ je odbijen", async () => {
    const { asAdmin, workspaceId } = await seedAiWorkspace();
    await expect(
      asAdmin.mutation(api.prostor.aiProviders.create, {
        workspaceId,
        label: "Groq",
        baseUrl: BASE_URL,
        model: MODEL,
        apiKey: "short",
      }),
    ).rejects.toThrow("prekratak");
  });

  test("neispravan baseUrl je odbijen", async () => {
    const { asAdmin, workspaceId } = await seedAiWorkspace();
    await expect(
      asAdmin.mutation(api.prostor.aiProviders.create, {
        workspaceId,
        label: "Groq",
        baseUrl: "ftp://nije-ok",
        model: MODEL,
        apiKey: KEY_A,
      }),
    ).rejects.toThrow("https");
  });
});
