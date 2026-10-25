/// <reference types="vite/client" />
/**
 * Hub „Svi projekti“ (C16, plan C15 §1–§2): `hubStore.pregledProjekta` daje
 * brojke JEDNOG projekta i to samo članu tog projekta; nepoznato je `null`
 * sa razlogom, nikad 0.
 */
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { danKljuc, dodajDane } from "./lib/napredak";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const SAT = 60 * 60 * 1000;
const NEMA_PRISTUP = /Nemaš pristup ovom projektu/;

function period(): { od: string; do: string; sada: number } {
  const sada = Date.now();
  const doDana = danKljuc(sada);
  return { od: dodajDane(doDana, -6), do: doDana, sada };
}

async function veza(
  s: Svet,
  ws: Id<"workspaces">,
  provider: "ga4" | "meta_ig" | "meta_fb" | "threads" | "youtube",
  polja: { status?: "active" | "error" | "expired" | "disconnecting"; expiresAt?: number; lastSyncAt?: number } = {},
): Promise<void> {
  await s.t.run(async (ctx) => {
    await ctx.db.insert("connections", {
      workspaceId: ws,
      provider,
      encryptedCredentials: "x",
      status: polja.status ?? "active",
      ...(polja.expiresAt !== undefined ? { expiresAt: polja.expiresAt } : {}),
      ...(polja.lastSyncAt !== undefined ? { lastSyncAt: polja.lastSyncAt } : {}),
    });
  });
}

async function firma(s: Svet, ws: Id<"workspaces">, ime: string): Promise<void> {
  await s.t.run(async (ctx) => {
    await ctx.db.insert("leadCompanies", {
      workspaceId: ws,
      name: ime,
      nameNormalized: ime.toLowerCase(),
      origin: "import",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

/** Nalog → kampanja → set → oglas; vraća ID oglasa. */
async function oglas(s: Svet, ws: Id<"workspaces">, valuta: string): Promise<Id<"ads">> {
  return await s.t.run(async (ctx) => {
    const accountId = await ctx.db.insert("adAccounts", {
      workspaceId: ws,
      provider: "meta_ads",
      externalId: `act_${valuta}_${Math.random()}`,
      name: "Nalog",
      currency: valuta,
    });
    const campaignId = await ctx.db.insert("adCampaigns", {
      workspaceId: ws,
      accountId,
      externalId: "c1",
      name: "Kampanja",
      status: "ACTIVE",
      syncPriority: "hot",
    });
    const adSetId = await ctx.db.insert("adSets", {
      workspaceId: ws,
      campaignId,
      externalId: "s1",
      name: "Set",
      status: "ACTIVE",
    });
    return await ctx.db.insert("ads", {
      workspaceId: ws,
      adSetId,
      externalId: "a1",
      name: "Oglas",
      status: "ACTIVE",
    });
  });
}

describe("hubStore.pregledProjekta", () => {
  test("portfolio ne vraća projekat čiji korisnik nije član", async () => {
    const s = await napraviSvet();
    const p = period();
    await odbijeno(s.t.query(api.hubStore.pregledProjekta, { ...p, workspaceId: s.wsA }), "unauthorized");
    await odbijeno(
      kao(s, s.ana).query(api.hubStore.pregledProjekta, { ...p, workspaceId: s.wsB }),
      "forbidden",
      NEMA_PRISTUP,
    );
    await odbijeno(
      kao(s, s.stranac).query(api.hubStore.pregledProjekta, { ...p, workspaceId: s.wsA }),
      "forbidden",
      NEMA_PRISTUP,
    );
    await odbijeno(
      kao(s, s.klijent).query(api.hubStore.pregledProjekta, { ...p, workspaceId: s.wsA }),
      "forbidden",
      NEMA_PRISTUP,
    );
    // Posmatrač čita brojke svog projekta.
    const pregled = await kao(s, s.viewer).query(api.hubStore.pregledProjekta, {
      ...p,
      workspaceId: s.wsA,
    });
    expect(pregled.noviLeadovi).toEqual({ vrednost: 0, razlog: null });
  });

  test("Jovan dobija brojke svakog projekta posebno, nikad tuđe", async () => {
    const s = await napraviSvet();
    const p = period();
    await firma(s, s.wsA, "Alfa");
    await firma(s, s.wsA, "Beta");
    await firma(s, s.wsB, "Gama");
    const a = await kao(s, s.jovan).query(api.hubStore.pregledProjekta, { ...p, workspaceId: s.wsA });
    const b = await kao(s, s.jovan).query(api.hubStore.pregledProjekta, { ...p, workspaceId: s.wsB });
    expect(a.noviLeadovi.vrednost).toBe(2);
    expect(b.noviLeadovi.vrednost).toBe(1);
  });

  test("nepoznato je null sa razlogom, nikad 0", async () => {
    const s = await napraviSvet();
    const p = period();
    const prazno = await kao(s, s.jovan).query(api.hubStore.pregledProjekta, {
      ...p,
      workspaceId: s.wsB,
    });
    expect(prazno.posete).toEqual({ vrednost: null, razlog: "nije_povezano" });
    expect(prazno.pratioci.vrednost).toBeNull();
    expect(prazno.pratioci.razlog).toBe("nije_povezano");
    expect(prazno.oglasi.vrednost).toBeNull();
    expect(prazno.oglasi.razlog).toBe("nije_povezano");
    expect(prazno.poruke).toEqual({ vrednost: null, razlog: "nije_povezano" });
    expect(prazno.zdravlje).toBe("bez_veza");
    expect(prazno.veze).toEqual([]);

    // Povezan GA4 bez ijednog dana: „nema podataka“, ne nula.
    await veza(s, s.wsB, "ga4", { lastSyncAt: p.sada - SAT });
    const bezDana = await kao(s, s.jovan).query(api.hubStore.pregledProjekta, {
      ...p,
      workspaceId: s.wsB,
    });
    expect(bezDana.posete).toEqual({ vrednost: null, razlog: "nema_podataka" });

    // Isključen modul leadova: broj nije poznat (ne crta se lažna nula).
    await s.t.run(async (ctx) => ctx.db.patch(s.wsB, { moduli: ["novosti"] }));
    const bezModula = await kao(s, s.jovan).query(api.hubStore.pregledProjekta, {
      ...p,
      workspaceId: s.wsB,
    });
    expect(bezModula.noviLeadovi).toEqual({ vrednost: null, razlog: "modul_iskljucen" });
  });

  test("zbirovi: posete u periodu, pratioci, oglasi, poruke", async () => {
    const s = await napraviSvet();
    const p = period();
    const ws = s.wsA;
    await veza(s, ws, "ga4", { lastSyncAt: p.sada - SAT });
    await veza(s, ws, "meta_ig", { lastSyncAt: p.sada - SAT });
    await veza(s, ws, "meta_fb", { lastSyncAt: p.sada - SAT });
    const adId = await oglas(s, ws, "EUR");
    await s.t.run(async (ctx) => {
      // GA4: granice perioda su uključive; dan pre perioda se ne broji.
      for (const [date, sessions] of [
        [dodajDane(p.od, -1), 1000],
        [p.od, 10],
        [dodajDane(p.od, 3), 20],
        [p.do, 30],
      ] as const) {
        await ctx.db.insert("ga4Daily", { workspaceId: ws, date, sessions, activeUsers: 1, newUsers: 1 });
      }
      // Instagram 100 → 120; Facebook povezan, bez dana; Threads nepovezan.
      for (const [date, followersCount] of [
        [p.od, 100],
        [p.do, 120],
      ] as const) {
        await ctx.db.insert("igAccountDaily", {
          workspaceId: ws,
          date,
          followersCount,
          reach: 0,
          accountsEngaged: 0,
        });
      }
      // Oglasi: samo dnevni redovi bez preseka ulaze u zbir.
      const red = { workspaceId: ws, adId, impressions: 0, clicks: 0 };
      await ctx.db.insert("adInsights", { ...red, date: p.od, breakdownHash: "none", spend: 10 });
      await ctx.db.insert("adInsights", { ...red, date: p.do, breakdownHash: "none", spend: 5.5 });
      await ctx.db.insert("adInsights", { ...red, date: p.do, breakdownHash: "none", hour: 9, spend: 3 });
      await ctx.db.insert("adInsights", { ...red, date: p.do, breakdownHash: "abc", spend: 7 });
      // Poruke: dva razgovora sa nepročitanim.
      for (const [igsid, unreadCount] of [
        ["1", 2],
        ["2", 0],
        ["3", 1],
      ] as const) {
        await ctx.db.insert("orConversations", {
          workspaceId: ws,
          igsid,
          createdAt: p.sada,
          updatedAt: p.sada,
          unreadCount,
        });
      }
    });

    const r = await kao(s, s.jovan).query(api.hubStore.pregledProjekta, { ...p, workspaceId: ws });
    expect(r.posete).toEqual({ vrednost: 60, razlog: null });
    expect(r.pratioci.vrednost).toBe(120);
    expect(r.pratioci.promena).toBe(20);
    expect(r.pratioci.kanali).toEqual([
      { kanal: "instagram", vrednost: 120 },
      { kanal: "facebook", vrednost: null },
    ]);
    expect(r.oglasi).toEqual({ vrednost: 15.5, razlog: null, valuta: "EUR" });
    expect(r.poruke).toEqual({ vrednost: 2, razlog: null });

    // Drugi nalog u drugoj valuti: zbir nije poznat.
    await oglas(s, ws, "RSD");
    const dveValute = await kao(s, s.jovan).query(api.hubStore.pregledProjekta, { ...p, workspaceId: ws });
    expect(dveValute.oglasi).toEqual({ vrednost: null, razlog: "vise_valuta", valuta: null });
  });

  test("zdravlje: najgora veza, razlog i kvota; veza u prekidu se ne broji", async () => {
    const s = await napraviSvet();
    const p = period();
    await veza(s, s.wsA, "ga4", { status: "error" });
    await veza(s, s.wsA, "meta_ig", { expiresAt: p.sada + 9 * 24 * SAT, lastSyncAt: p.sada - SAT });
    await veza(s, s.wsA, "youtube", { status: "disconnecting" });
    await veza(s, s.wsA, "threads", { lastSyncAt: p.sada - SAT });
    const r = await kao(s, s.jovan).query(api.hubStore.pregledProjekta, { ...p, workspaceId: s.wsA });
    expect(r.zdravlje).toBe("greska");
    const poProvajderu = Object.fromEntries(r.veze.map((v) => [v.provider, v]));
    expect(Object.keys(poProvajderu).sort()).toEqual(["ga4", "meta_ig", "threads"]);
    expect(poProvajderu.ga4.stanje).toBe("greska");
    expect(poProvajderu.ga4.razlog).toBe("greska_veze");
    expect(poProvajderu.meta_ig.stanje).toBe("upozorenje");
    expect(poProvajderu.meta_ig.razlog).toBe("token_istice");
    expect(poProvajderu.meta_ig.za).toBe(9);
    expect(poProvajderu.threads.stanje).toBe("ok");
  });

  test("neispravan period se odbija", async () => {
    const s = await napraviSvet();
    const p = period();
    await expect(
      kao(s, s.jovan).query(api.hubStore.pregledProjekta, { ...p, od: p.do, do: p.od, workspaceId: s.wsA }),
    ).rejects.toThrow(/Neispravan period/);
    await expect(
      kao(s, s.jovan).query(api.hubStore.pregledProjekta, { ...p, od: "2026-13-01", workspaceId: s.wsA }),
    ).rejects.toThrow(/Neispravan period/);
    await expect(
      kao(s, s.jovan).query(api.hubStore.pregledProjekta, {
        ...p,
        od: dodajDane(p.do, -400),
        workspaceId: s.wsA,
      }),
    ).rejects.toThrow(/Neispravan period/);
  });
});
