/// <reference types="vite/client" />
/**
 * Meta CAPI po projektu (`metaCapi.sendPendingCapiEventsAction`,
 * `metaCapiStore.getCapiStats`): piksel i CAPI token su podešavanja projekta,
 * samo osnivački projekat (Enigma IT) bez svojih vrednosti nasleđuje env, projekat
 * bez piksela ili tokena NIKAD ne šalje na tuđi piksel (događaji ostaju na
 * čekanju), a brava slanja je po projektu: jedan projekat ne blokira drugi.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, type Svet } from "./projekatTest.pomoc";

const ENIGMA_PIKSEL = "1111111111111";
const ENIGMA_TOKEN = "enigma-capi-token-1234567890abc";
const SCANME_PIKSEL = "3333333333333";
const SCANME_TOKEN = "scanme-capi-token-0987654321xyz";
const HES = "a".repeat(64);

let fetchMock: ReturnType<typeof napraviFetch>;

function napraviFetch() {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
  );
}

beforeEach(() => {
  vi.stubEnv("META_PIXEL_ID", ENIGMA_PIKSEL);
  vi.stubEnv("META_CAPI_TOKEN", ENIGMA_TOKEN);
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "TEST1");
  vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "ab".repeat(32));
  fetchMock = napraviFetch();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function dodajDogadjaj(
  s: Svet,
  workspaceId: Id<"workspaces">,
  eventId: string,
): Promise<Id<"capiEvents">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("capiEvents", {
      workspaceId,
      eventName: "Lead",
      eventTime: Math.floor(Date.now() / 1000) - 60,
      eventId,
      actionSource: "website",
      sourceKind: "link_redirect",
      hashedEmail: HES,
      clientUserAgent: "Mozilla/5.0",
      status: "pending",
      attempts: 0,
      syncedAt: Date.now(),
    }),
  );
}

const dogadjaj = (s: Svet, id: Id<"capiEvents">) => s.t.run(async (ctx) => await ctx.db.get(id));

const posalji = (s: Svet, workspaceId: Id<"workspaces">) =>
  s.t.action(internal.metaCapi.sendPendingCapiEventsAction, { workspaceId });

const statistika = (s: Svet, workspaceId: Id<"workspaces">) =>
  kao(s, s.jovan).query(api.metaCapiStore.getCapiStats, { workspaceId });

/** Svoj piksel i CAPI token projekta (upisuje ih vlasnik u Podešavanjima). */
async function podesiCapi(
  s: Svet,
  ko: Id<"users">,
  workspaceId: Id<"workspaces">,
  piksel: string = SCANME_PIKSEL,
  token: string = SCANME_TOKEN,
) {
  await kao(s, ko).mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
    workspaceId,
    pikselId: piksel,
  });
  await kao(s, ko).mutation(api.podesavanjaStore.postaviTajnu, {
    workspaceId,
    kljuc: "meta_capi_token",
    vrednost: token,
  });
}

/** Zakazani naknadni prolazi ne treba da dišu posle testa. */
async function otkaziZakazano(s: Svet) {
  await s.t.run(async (ctx) => {
    for (const f of await ctx.db.system.query("_scheduled_functions").collect()) {
      if (f.state.kind === "pending") await ctx.scheduler.cancel(f._id);
    }
  });
}

type TeloSlanja = { data: Array<Record<string, unknown>>; test_event_code?: string };

/** i-ti poziv `fetch`-a: adresa, zaglavlja i telo. */
function poziv(i: number): { url: string; zaglavlja: Record<string, string>; telo: TeloSlanja } {
  const [url, init] = fetchMock.mock.calls[i];
  return {
    url,
    zaglavlja: (init?.headers ?? {}) as Record<string, string>,
    telo: JSON.parse(String(init?.body)),
  };
}

describe("projekat bez svog piksela i tokena", () => {
  test("ScanMe ne šalje ništa na Enigmin piksel, događaj ostaje „pending“", async () => {
    const s = await napraviSvet();
    const dogadjajB = await dodajDogadjaj(s, s.wsB, "ev-b-1");
    const dogadjajA = await dodajDogadjaj(s, s.wsA, "ev-a-1");

    const rezultat = await posalji(s, s.wsB);
    expect(rezultat).toEqual({ success: false, sent: 0, rejected: 0, reason: "missing_credentials" });
    expect(fetchMock).not.toHaveBeenCalled();

    const b = await dogadjaj(s, dogadjajB);
    expect(b?.status).toBe("pending");
    expect(b?.attempts).toBe(0);
    expect(b?.sentAt).toBeUndefined();
    // Enigmin događaj nije dirnut.
    expect((await dogadjaj(s, dogadjajA))?.status).toBe("pending");

    // Brava je vraćena: sledeći prolaz ne sme da bude preskočen.
    const brave = await s.t.run(async (ctx) => await ctx.db.query("cronLocks").collect());
    expect(brave.map((b) => b.name)).toEqual([`meta:capi:dispatch:${s.wsB}`]);
    expect(brave[0].expiresAt).toBeLessThanOrEqual(Date.now());
  });

  test("ekran stanja kaže šta fali: oba za ScanMe, ništa za Enigmu sa env-om", async () => {
    const s = await napraviSvet();
    await dodajDogadjaj(s, s.wsB, "ev-b-1");

    const b = await statistika(s, s.wsB);
    expect(b.configured).toBe(false);
    expect(b.nedostaje).toEqual(["piksel", "capi_token"]);
    expect(b.pendingCount).toBe(1);
    expect(b.sentCount).toBe(0);
    expect(JSON.stringify(b)).not.toContain(ENIGMA_PIKSEL);
    expect(JSON.stringify(b)).not.toContain(ENIGMA_TOKEN);

    const a = await statistika(s, s.wsA);
    expect(a.configured).toBe(true);
    expect(a.nedostaje).toEqual([]);
  });

  test("samo piksel ili samo token nije dovoljno: nema slanja, nedostaje ono što fali", async () => {
    const s = await napraviSvet();
    const id = await dodajDogadjaj(s, s.wsB, "ev-b-1");
    const boban = kao(s, s.boban);

    await boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsB,
      pikselId: SCANME_PIKSEL,
    });
    expect((await statistika(s, s.wsB)).nedostaje).toEqual(["capi_token"]);
    expect(await posalji(s, s.wsB)).toMatchObject({ success: false, reason: "missing_credentials" });

    await boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsB,
      pikselId: null,
    });
    await boban.mutation(api.podesavanjaStore.postaviTajnu, {
      workspaceId: s.wsB,
      kljuc: "meta_capi_token",
      vrednost: SCANME_TOKEN,
    });
    expect((await statistika(s, s.wsB)).nedostaje).toEqual(["piksel"]);
    expect(await posalji(s, s.wsB)).toMatchObject({ success: false, reason: "missing_credentials" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await dogadjaj(s, id))?.status).toBe("pending");
  });

  test("obrisan token vraća ScanMe na „ne šalje“, ne na Enigmin token", async () => {
    const s = await napraviSvet();
    const id = await dodajDogadjaj(s, s.wsB, "ev-b-1");
    await podesiCapi(s, s.boban, s.wsB);
    await kao(s, s.boban).mutation(api.podesavanjaStore.obrisiTajnu, {
      workspaceId: s.wsB,
      kljuc: "meta_capi_token",
    });

    expect(await posalji(s, s.wsB)).toMatchObject({ success: false, reason: "missing_credentials" });
    expect((await statistika(s, s.wsB)).nedostaje).toEqual(["capi_token"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await dogadjaj(s, id))?.status).toBe("pending");
  });
});

describe("osnivački projekat sa env-om", () => {
  test("Enigma šalje na svoj piksel sa svojim tokenom i događaj postaje „sent“", async () => {
    const s = await napraviSvet();
    const dogadjajA = await dodajDogadjaj(s, s.wsA, "ev-a-1");
    const dogadjajB = await dodajDogadjaj(s, s.wsB, "ev-b-1");

    const rezultat = await posalji(s, s.wsA);
    expect(rezultat).toEqual({ success: true, sent: 1, rejected: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const p = poziv(0);
    expect(p.url).toMatch(/^https:\/\/graph\.facebook\.com\/v[\d.]+\/1111111111111\/events$/);
    expect(p.zaglavlja.Authorization).toBe(`Bearer ${ENIGMA_TOKEN}`);
    expect(p.telo.data).toHaveLength(1);
    expect(p.telo.data[0]).toMatchObject({
      event_name: "Lead",
      event_id: "ev-a-1",
      action_source: "website",
      user_data: { em: [HES], client_user_agent: "Mozilla/5.0" },
    });
    // Kod testnog događaja važi za osnivački piksel.
    expect(p.telo.test_event_code).toBe("TEST1");
    // Token ne ide u telo ni u adresu.
    expect(p.url).not.toContain(ENIGMA_TOKEN);
    expect(JSON.stringify(p.telo)).not.toContain(ENIGMA_TOKEN);

    const poslato = await dogadjaj(s, dogadjajA);
    expect(poslato?.status).toBe("sent");
    expect(typeof poslato?.sentAt).toBe("number");
    // Događaj drugog projekta nije poslat sa Enigminim pikselom.
    expect((await dogadjaj(s, dogadjajB))?.status).toBe("pending");
  });

  test("sopstveni piksel i token Enigme pobeđuju env", async () => {
    const s = await napraviSvet();
    await dodajDogadjaj(s, s.wsA, "ev-a-1");
    const svojPiksel = "4444444444444";
    const svojToken = "enigma-svoj-token-1234567890";
    await podesiCapi(s, s.ana, s.wsA, svojPiksel, svojToken);

    expect(await posalji(s, s.wsA)).toEqual({ success: true, sent: 1, rejected: 0 });
    const p = poziv(0);
    expect(p.url).toContain(`/${svojPiksel}/events`);
    expect(p.url).not.toContain(ENIGMA_PIKSEL);
    expect(p.zaglavlja.Authorization).toBe(`Bearer ${svojToken}`);
  });
});

describe("brava slanja je po projektu", () => {
  test("zauzeta brava Enigme preskače samo Enigmu, ScanMe sa svojim podešavanjima šalje", async () => {
    const s = await napraviSvet();
    const dogadjajA = await dodajDogadjaj(s, s.wsA, "ev-a-1");
    const dogadjajB = await dodajDogadjaj(s, s.wsB, "ev-b-1");
    await podesiCapi(s, s.boban, s.wsB);

    const sada = Date.now();
    const imeBraveA = `meta:capi:dispatch:${s.wsA}`;
    await s.t.run(async (ctx) => {
      await ctx.db.insert("cronLocks", {
        name: imeBraveA,
        startedAt: sada,
        expiresAt: sada + 10 * 60 * 1000,
      });
    });

    // Enigma: brava je zauzeta, prolaz se preskače i ništa se ne šalje.
    expect(await posalji(s, s.wsA)).toEqual({ success: true, sent: 0, rejected: 0, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await dogadjaj(s, dogadjajA))?.status).toBe("pending");

    // Preskočen prolaz zakazuje sledeći, za isti projekat.
    const zakazano = await s.t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    const zaA = zakazano.filter(
      (f) => (f.args[0] as { workspaceId?: string } | undefined)?.workspaceId === s.wsA,
    );
    expect(zaA.length).toBeGreaterThanOrEqual(1);

    // ScanMe: druga brava, nije preskočen i šalje na SVOJ piksel sa SVOJIM tokenom.
    const rezultatB = await posalji(s, s.wsB);
    expect(rezultatB).toEqual({ success: true, sent: 1, rejected: 0 });
    expect(rezultatB.skipped).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const p = poziv(0);
    expect(p.url).toContain(`/${SCANME_PIKSEL}/events`);
    expect(p.url).not.toContain(ENIGMA_PIKSEL);
    expect(p.zaglavlja.Authorization).toBe(`Bearer ${SCANME_TOKEN}`);
    expect(p.zaglavlja.Authorization).not.toContain(ENIGMA_TOKEN);
    // Enigmin kod testnog događaja ne ide na tuđ piksel.
    expect(p.telo.test_event_code).toBeUndefined();
    expect(p.telo.data[0]).toMatchObject({ event_id: "ev-b-1" });

    expect((await dogadjaj(s, dogadjajB))?.status).toBe("sent");
    expect((await dogadjaj(s, dogadjajA))?.status).toBe("pending");

    // Brava Enigme je ostala netaknuta, ScanMe ima svoju.
    const brave = await s.t.run(async (ctx) => await ctx.db.query("cronLocks").collect());
    const braveA = brave.find((b) => b.name === imeBraveA);
    expect(braveA?.startedAt).toBe(sada);
    expect(braveA?.expiresAt).toBe(sada + 10 * 60 * 1000);
    expect(brave.map((b) => b.name).sort()).toEqual([imeBraveA, `meta:capi:dispatch:${s.wsB}`].sort());

    await otkaziZakazano(s);
  });

  test("istekla brava ne zaustavlja slanje", async () => {
    const s = await napraviSvet();
    const id = await dodajDogadjaj(s, s.wsA, "ev-a-1");
    const sada = Date.now();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("cronLocks", {
        name: `meta:capi:dispatch:${s.wsA}`,
        startedAt: sada - 20 * 60 * 1000,
        expiresAt: sada - 10 * 60 * 1000,
      });
    });

    expect(await posalji(s, s.wsA)).toEqual({ success: true, sent: 1, rejected: 0 });
    expect((await dogadjaj(s, id))?.status).toBe("sent");
  });

  test("dva projekta mogu da šalju jedan za drugim, svaki svojim podacima", async () => {
    const s = await napraviSvet();
    await dodajDogadjaj(s, s.wsA, "ev-a-1");
    await dodajDogadjaj(s, s.wsB, "ev-b-1");
    await podesiCapi(s, s.boban, s.wsB);

    expect(await posalji(s, s.wsA)).toEqual({ success: true, sent: 1, rejected: 0 });
    expect(await posalji(s, s.wsB)).toEqual({ success: true, sent: 1, rejected: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [prvi, drugi] = [poziv(0), poziv(1)];
    expect(prvi.url).toContain(`/${ENIGMA_PIKSEL}/events`);
    expect(prvi.zaglavlja.Authorization).toBe(`Bearer ${ENIGMA_TOKEN}`);
    expect(prvi.telo.data[0]).toMatchObject({ event_id: "ev-a-1" });
    expect(drugi.url).toContain(`/${SCANME_PIKSEL}/events`);
    expect(drugi.zaglavlja.Authorization).toBe(`Bearer ${SCANME_TOKEN}`);
    expect(drugi.telo.data[0]).toMatchObject({ event_id: "ev-b-1" });

    expect((await statistika(s, s.wsA)).sentCount).toBe(1);
    expect((await statistika(s, s.wsB)).sentCount).toBe(1);
    expect((await statistika(s, s.wsB)).configured).toBe(true);
  });
});
