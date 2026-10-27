/// <reference types="vite/client" />
/**
 * Jedan status veze (P3, ULTRA1 T04): `statusVeza.lista` vraća činjenice iz
 * kojih se status računa — samo za projekat pozivaoca — a zvono („Šta me
 * čeka") iz istih činjenica pravi iste rečenice kao tačka i kanal.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { porukaStatusa, statusiIzRedova } from "./lib/statusVeze";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const SAT = 60 * 60 * 1000;
const DAN = 24 * SAT;

afterEach(() => {
  vi.unstubAllEnvs();
});

async function veza(
  s: Svet,
  ws: Id<"workspaces">,
  provider: "ga4" | "meta_ig" | "meta_fb" | "threads" | "youtube",
  polja: {
    status?: "active" | "error" | "expired" | "disconnecting";
    expiresAt?: number;
    lastSyncAt?: number;
    authMode?: "oauth" | "system_user";
  } = {},
): Promise<void> {
  await s.t.run(async (ctx) => {
    await ctx.db.insert("connections", {
      workspaceId: ws,
      provider,
      encryptedCredentials: "x",
      status: polja.status ?? "active",
      ...(polja.expiresAt !== undefined ? { expiresAt: polja.expiresAt } : {}),
      ...(polja.lastSyncAt !== undefined ? { lastSyncAt: polja.lastSyncAt } : {}),
      ...(polja.authMode !== undefined ? { authMode: polja.authMode } : {}),
    });
  });
}

async function prolaz(
  s: Svet,
  ws: Id<"workspaces">,
  provider: "ga4" | "meta_ig" | "meta_fb" | "threads" | "youtube",
  status: "ok" | "error" | "running",
  kraj: number,
): Promise<void> {
  await s.t.run(async (ctx) => {
    await ctx.db.insert("syncRuns", {
      workspaceId: ws,
      provider,
      startedAt: kraj - 5000,
      ...(status === "running" ? {} : { finishedAt: kraj }),
      status,
      itemsWritten: 0,
      ...(status === "error" ? { error: "Token je istekao (OAuthException 190)." } : {}),
    });
  });
}

describe("statusVeza.lista", () => {
  test("samo član projekta, i samo veze tog projekta", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "ga4", { lastSyncAt: Date.now() - SAT });
    await veza(s, s.wsB, "meta_ig", { lastSyncAt: Date.now() - SAT });

    await odbijeno(s.t.query(api.statusVeza.lista, { workspaceId: s.wsA }), "unauthorized");
    await odbijeno(kao(s, s.ana).query(api.statusVeza.lista, { workspaceId: s.wsB }), "forbidden");

    // Posmatrač vidi stanje veza svog projekta (tačka stoji u ljusci).
    const redovi = await kao(s, s.viewer).query(api.statusVeza.lista, { workspaceId: s.wsA });
    expect(redovi.map((r) => r.provider)).toEqual(["ga4"]);
  });

  test("poslednji uspeh, poslednji podatak, veza u prekidu i server", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    vi.stubEnv("INSTAGRAM_APP_ID", "app");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "tajna");

    await veza(s, s.wsA, "meta_ig", { lastSyncAt: sada - 2 * DAN });
    await prolaz(s, s.wsA, "meta_ig", "ok", sada - 2 * DAN);
    await prolaz(s, s.wsA, "meta_ig", "error", sada - SAT);
    await s.t.run(async (ctx) => {
      await ctx.db.insert("metaSyncJobs", {
        workspaceId: s.wsA,
        provider: "meta_ig",
        job: "glava",
        lastRunAt: sada - 30 * 60 * 1000,
        lastDataAt: sada - 30 * 60 * 1000,
      });
    });
    await veza(s, s.wsA, "youtube", { status: "disconnecting" });
    await veza(s, s.wsA, "meta_fb", { authMode: "system_user", lastSyncAt: sada - SAT });

    const redovi = await kao(s, s.ana).query(api.statusVeza.lista, { workspaceId: s.wsA });
    const ig = redovi.find((r) => r.provider === "meta_ig");
    expect(ig).toMatchObject({
      status: "active",
      poslednjiUspeh: sada - 2 * DAN,
      poslednjiPodatak: sada - 30 * 60 * 1000,
      serverPodesen: true,
      poslednjiProlaz: { status: "error", finishedAt: sada - SAT },
    });
    // Sistemski korisnik ne zavisi od Meta aplikacije na serveru.
    expect(redovi.find((r) => r.provider === "meta_fb")?.serverPodesen).toBeNull();
    // Veza u prekidu se vraća: status kaže „brisanje u toku", ne ćuti.
    const statusi = statusiIzRedova(redovi, sada);
    const yt = statusi.find((st) => st.provider === "youtube");
    expect(yt).toMatchObject({ vrednost: "nije_povezano", razlog: "brisanje_u_toku" });
    // Pao prolaz posle uspeha pre 2 dana — ali mali prolaz je upisao podatak
    // pre pola sata, pa „podaci od …" ne stoji, a pažnju traži pad prolaza.
    const igStatus = statusi.find((st) => st.provider === "meta_ig");
    expect(igStatus).toMatchObject({ vrednost: "trazi_paznju", razlog: "pao_prolaz" });
    expect(igStatus?.podaciOd).toBe(sada - 30 * 60 * 1000);
  });

  test("server bez Meta aplikacije: Instagram traži pažnju", async () => {
    const s = await napraviSvet();
    vi.stubEnv("INSTAGRAM_APP_ID", "");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "");
    await veza(s, s.wsA, "meta_ig", { lastSyncAt: Date.now() - SAT });
    const redovi = await kao(s, s.ana).query(api.statusVeza.lista, { workspaceId: s.wsA });
    expect(redovi[0].serverPodesen).toBe(false);
    const [ig] = statusiIzRedova(redovi, Date.now()).filter((st) => st.provider === "meta_ig");
    expect(ig.razlog).toBe("server_nije_podesen");
  });
});

describe("zvono i status: iste reči za istu vezu", () => {
  test("istekao Instagram i Facebook pred istekom u zvonu kao u statusu", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    vi.stubEnv("INSTAGRAM_APP_ID", "app");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "tajna");
    vi.stubEnv("FACEBOOK_APP_ID", "app");
    vi.stubEnv("FACEBOOK_APP_SECRET", "tajna");

    await veza(s, s.wsA, "meta_ig", {
      status: "expired",
      expiresAt: sada - 3 * DAN,
      lastSyncAt: sada - 3 * DAN,
    });
    await prolaz(s, s.wsA, "meta_ig", "error", sada - 3 * DAN);
    await veza(s, s.wsA, "meta_fb", { expiresAt: sada + 5 * DAN, lastSyncAt: sada - SAT });
    await prolaz(s, s.wsA, "meta_fb", "ok", sada - SAT);
    await veza(s, s.wsA, "ga4", { lastSyncAt: sada - SAT });
    await prolaz(s, s.wsA, "ga4", "ok", sada - SAT);

    const redovi = await kao(s, s.ana).query(api.statusVeza.lista, { workspaceId: s.wsA });
    const zvono = await kao(s, s.ana).query(api.notificationsStore.staMeCeka, {
      workspaceId: s.wsA,
    });
    const vezeUZvonu = zvono.zadaci.filter((z) => z.kljuc.startsWith("sinhronizacija.greska:"));

    const statusi = statusiIzRedova(redovi, sada).filter((st) => st.vrednost === "trazi_paznju");
    expect(statusi.map((st) => st.provider).sort()).toEqual(["meta_fb", "meta_ig"]);
    expect(vezeUZvonu).toHaveLength(statusi.length);
    for (const st of statusi) {
      const poruka = porukaStatusa(st, sada);
      const zadatak = vezeUZvonu.find((z) => z.kljuc === `sinhronizacija.greska:${st.provider}`);
      expect(zadatak?.naslov).toBe(poruka.recenica);
      expect(zadatak?.radnja).toBe(poruka.radnja?.oznaka);
    }
    // Ljudska rečenica, nikad tehnički kod.
    expect(vezeUZvonu.map((z) => z.naslov).join(" ")).not.toMatch(/OAuth|190/);
  });
});
