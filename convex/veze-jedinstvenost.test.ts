/// <reference types="vite/client" />
/**
 * Isti spoljni nalog u dva projekta (plan C10 E3, `lib/vezaDrugde.ts`).
 *
 * Instagram, Facebook stranica i Threads: webhook traži vezu po spoljnom ID-u i
 * uzima prvi pogodak, pa se povezivanje naloga koji je već u drugom projektu
 * ODBIJA (`nalog_u_drugom_projektu`), pre upisa. YouTube, Meta oglasi, Google
 * oglasi i GA4 rade po vezi, pa se upisuju uz UPOZORENJE. Veza u prekidu
 * (`disconnecting`) se ne broji, a isti nalog u istom projektu nikad ne smeta.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { UPOZORENJE_NALOG_DRUGDE } from "./lib/vezaDrugde";
import { kao, napraviSvet, type Svet } from "./projekatTest.pomoc";

beforeEach(() => {
  // `connections.save` šifruje kredencijale; ključ je lažan, samo oblikom ispravan.
  vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "ab".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const DRUGDE = "nalog_u_drugom_projektu";

async function kodGreske(poziv: Promise<unknown>): Promise<string | null> {
  try {
    await poziv;
    return null;
  } catch (e) {
    const kod = (e as { data?: { code?: string } }).data?.code;
    return kod ?? `bez koda: ${e instanceof Error ? e.message : String(e)}`;
  }
}

type Provajder = Doc<"connections">["provider"];

async function veza(
  s: Svet,
  workspaceId: Id<"workspaces">,
  provider: Provajder,
): Promise<Doc<"connections"> | null> {
  return await s.t.run(async (ctx) =>
    ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", provider),
      )
      .first(),
  );
}

async function postaviStatus(
  s: Svet,
  id: Id<"connections">,
  status: Doc<"connections">["status"],
): Promise<void> {
  await s.t.run(async (ctx) => ctx.db.patch(id, { status }));
}

// ── Instagram ───────────────────────────────────────────────────────────────

describe("Instagram nalog u dva projekta", () => {
  const sacuvaj = (
    s: Svet,
    workspaceId: Id<"workspaces">,
    externalId: string,
    externalIdAlt?: string,
    encryptedCredentials = "v1:token",
  ) =>
    s.t.mutation(internal.instagramStore.saveConnectedCredentials, {
      workspaceId,
      externalId,
      ...(externalIdAlt !== undefined ? { externalIdAlt } : {}),
      encryptedCredentials,
      expiresAt: 1_900_000_000_000,
    });

  test("isti ID, profesionalni ID ili ID unakrsno se odbija; veza A ostaje netaknuta", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "ig1", "igpro1", "v1:tokenA");
    const pre = await veza(s, s.wsA, "meta_ig");
    expect(pre).toMatchObject({ externalId: "ig1", externalIdAlt: "igpro1", status: "active" });

    // externalId poklapa externalId.
    expect(await kodGreske(sacuvaj(s, s.wsB, "ig1", undefined, "v1:tokenB"))).toBe(DRUGDE);
    // externalIdAlt poklapa externalIdAlt (kod Instagrama alt je spoljni ID).
    expect(await kodGreske(sacuvaj(s, s.wsB, "ig2", "igpro1", "v1:tokenB"))).toBe(DRUGDE);
    // externalId poklapa tuđi alt.
    expect(await kodGreske(sacuvaj(s, s.wsB, "igpro1", undefined, "v1:tokenB"))).toBe(DRUGDE);
    // externalIdAlt poklapa tuđi externalId.
    expect(await kodGreske(sacuvaj(s, s.wsB, "ig2", "ig1", "v1:tokenB"))).toBe(DRUGDE);

    expect(await veza(s, s.wsB, "meta_ig")).toBeNull();
    expect(await veza(s, s.wsA, "meta_ig")).toEqual(pre);
    expect(pre?.encryptedCredentials).toBe("v1:tokenA");
  });

  test("poruka greške ne otkriva drugi projekat", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "ig1");

    const greska = await sacuvaj(s, s.wsB, "ig1").then(
      () => null,
      (e: unknown) => e as { data?: { message?: string } },
    );
    expect(greska?.data?.message).toMatch(/već povezan u drugom projektu/);
    expect(greska?.data?.message).not.toMatch(/Enigma|enigma-it/);
  });

  test("veza u prekidu (disconnecting) se ne broji, ali istekla (expired) se broji", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "ig1");
    const a = await veza(s, s.wsA, "meta_ig");

    await postaviStatus(s, a!._id, "expired");
    expect(await kodGreske(sacuvaj(s, s.wsB, "ig1"))).toBe(DRUGDE);

    await postaviStatus(s, a!._id, "disconnecting");
    expect(await kodGreske(sacuvaj(s, s.wsB, "ig1"))).toBeNull();
    expect(await veza(s, s.wsB, "meta_ig")).toMatchObject({ externalId: "ig1", status: "active" });
  });

  test("različit nalog u drugom projektu prolazi, a isti nalog u istom projektu nikad ne smeta", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "ig1", "igpro1");

    expect(await kodGreske(sacuvaj(s, s.wsB, "ig9", "igpro9"))).toBeNull();
    expect(await veza(s, s.wsB, "meta_ig")).toMatchObject({ externalId: "ig9" });

    // Ponovno povezivanje istog naloga u A: veza se osvežava, generacija raste.
    expect(await kodGreske(sacuvaj(s, s.wsA, "ig1", "igpro1", "v1:novi"))).toBeNull();
    expect(await veza(s, s.wsA, "meta_ig")).toMatchObject({
      externalId: "ig1",
      encryptedCredentials: "v1:novi",
      generation: 2,
    });
  });
});

// ── Facebook stranica ───────────────────────────────────────────────────────

describe("Facebook stranica u dva projekta", () => {
  const sacuvaj = (
    s: Svet,
    workspaceId: Id<"workspaces">,
    pageId: string,
    pageName?: string,
    encryptedCredentials = "v1:strana",
  ) =>
    s.t.mutation(internal.facebookStore.saveConnectedCredentials, {
      workspaceId,
      pageId,
      ...(pageName !== undefined ? { pageName } : {}),
      encryptedCredentials,
    });

  const sacuvajSystemUser = (
    s: Svet,
    workspaceId: Id<"workspaces">,
    pageId: string,
    pageName?: string,
  ) =>
    s.t.mutation(internal.facebookStore.saveSystemUserPageCredentials, {
      workspaceId,
      pageId,
      ...(pageName !== undefined ? { pageName } : {}),
      encryptedCredentials: "v1:system-user",
    });

  test("ista stranica se odbija i kroz OAuth i kroz System User put; B nema vezu", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "p1", "Strana A", "v1:stranaA");
    const pre = await veza(s, s.wsA, "meta_fb");

    expect(await kodGreske(sacuvaj(s, s.wsB, "p1"))).toBe(DRUGDE);
    expect(await kodGreske(sacuvajSystemUser(s, s.wsB, "p1"))).toBe(DRUGDE);

    expect(await veza(s, s.wsB, "meta_fb")).toBeNull();
    expect(await veza(s, s.wsA, "meta_fb")).toEqual(pre);
    expect(pre?.encryptedCredentials).toBe("v1:stranaA");
  });

  test("straniceDrugde vraća samo stranice povezane u drugom projektu", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "p1");

    expect(
      await s.t.query(internal.facebookStore.straniceDrugde, {
        workspaceId: s.wsB,
        pageIds: ["p1", "p2"],
      }),
    ).toEqual(["p1"]);
    // Sopstvena stranica nije „tuđa“.
    expect(
      await s.t.query(internal.facebookStore.straniceDrugde, {
        workspaceId: s.wsA,
        pageIds: ["p1", "p2"],
      }),
    ).toEqual([]);
    expect(
      await s.t.query(internal.facebookStore.straniceDrugde, { workspaceId: s.wsB, pageIds: [] }),
    ).toEqual([]);
  });

  test("externalIdAlt je IME stranice: stranica čiji je ID ime tuđe stranice nije duplikat", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "p1", "Strana");
    expect(await veza(s, s.wsA, "meta_fb")).toMatchObject({
      externalId: "p1",
      externalIdAlt: "Strana",
    });

    // Ime stranice A nije ID stranice: ni upit ni upis ga ne računaju kao tuđe.
    expect(
      await s.t.query(internal.facebookStore.straniceDrugde, {
        workspaceId: s.wsB,
        pageIds: ["Strana"],
      }),
    ).toEqual([]);
    expect(await kodGreske(sacuvaj(s, s.wsB, "Strana"))).toBeNull();
    expect(await veza(s, s.wsB, "meta_fb")).toMatchObject({ externalId: "Strana" });

    // Tek kad B zaista upiše ID „Strana“, taj ID je zauzet za treći projekat.
    expect(
      await s.t.query(internal.facebookStore.straniceDrugde, {
        workspaceId: s.wsK,
        pageIds: ["Strana"],
      }),
    ).toEqual(["Strana"]);
  });

  test("ime stranice nije ključ ni u suprotnom smeru: B sa imenom A stranice prolazi", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "p1", "Zajedničko ime");

    expect(await kodGreske(sacuvaj(s, s.wsB, "p2", "Zajedničko ime"))).toBeNull();
    expect(await kodGreske(sacuvajSystemUser(s, s.wsK, "p3", "Zajedničko ime"))).toBeNull();
  });

  test("posle prekida u A (disconnecting) B sme da poveže istu stranicu", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "p1");
    const a = await veza(s, s.wsA, "meta_fb");
    await postaviStatus(s, a!._id, "disconnecting");

    expect(
      await s.t.query(internal.facebookStore.straniceDrugde, {
        workspaceId: s.wsB,
        pageIds: ["p1"],
      }),
    ).toEqual([]);
    expect(await kodGreske(sacuvaj(s, s.wsB, "p1"))).toBeNull();
    expect(await veza(s, s.wsB, "meta_fb")).toMatchObject({ externalId: "p1" });
  });

  test("posle prekida u A i System User put prolazi za B", async () => {
    const s = await napraviSvet();
    await sacuvajSystemUser(s, s.wsA, "p1");
    const a = await veza(s, s.wsA, "meta_fb");
    expect(a).toMatchObject({ externalId: "p1", authMode: "system_user" });
    expect(await kodGreske(sacuvajSystemUser(s, s.wsB, "p1"))).toBe(DRUGDE);

    await postaviStatus(s, a!._id, "disconnecting");
    expect(await kodGreske(sacuvajSystemUser(s, s.wsB, "p1"))).toBeNull();
  });

  test("ista stranica u istom projektu se ponovo upisuje bez odbijanja", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "p1", "Strana", "v1:prvi");

    expect(await kodGreske(sacuvaj(s, s.wsA, "p1", "Strana", "v1:drugi"))).toBeNull();
    expect(await kodGreske(sacuvajSystemUser(s, s.wsA, "p1", "Strana"))).toBeNull();
    expect(await veza(s, s.wsA, "meta_fb")).toMatchObject({
      externalId: "p1",
      generation: 3,
      authMode: "system_user",
    });
  });
});

// ── Threads ─────────────────────────────────────────────────────────────────

describe("Threads nalog u dva projekta", () => {
  const sacuvaj = (
    s: Svet,
    workspaceId: Id<"workspaces">,
    userId: string,
    encryptedCredentials = "v1:threads",
  ) =>
    s.t.mutation(internal.threadsStore.saveConnectedCredentials, {
      workspaceId,
      userId,
      username: "firma",
      encryptedCredentials,
    });

  test("isti Threads nalog se odbija; veza A ostaje netaknuta, B nema vezu", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "t1", "v1:threadsA");
    const pre = await veza(s, s.wsA, "threads");

    expect(await kodGreske(sacuvaj(s, s.wsB, "t1", "v1:threadsB"))).toBe(DRUGDE);

    expect(await veza(s, s.wsB, "threads")).toBeNull();
    expect(await veza(s, s.wsA, "threads")).toEqual(pre);
    expect(pre?.encryptedCredentials).toBe("v1:threadsA");
  });

  test("drugi nalog prolazi, a posle prekida u A prolazi i isti nalog", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "t1");

    expect(await kodGreske(sacuvaj(s, s.wsB, "t2"))).toBeNull();
    expect(await kodGreske(sacuvaj(s, s.wsK, "t1"))).toBe(DRUGDE);

    const a = await veza(s, s.wsA, "threads");
    await postaviStatus(s, a!._id, "disconnecting");
    expect(await kodGreske(sacuvaj(s, s.wsK, "t1"))).toBeNull();
    expect(await veza(s, s.wsK, "threads")).toMatchObject({ externalId: "t1" });
  });

  test("isti nalog u istom projektu se ponovo upisuje bez odbijanja", async () => {
    const s = await napraviSvet();
    await sacuvaj(s, s.wsA, "t1", "v1:prvi");

    expect(await kodGreske(sacuvaj(s, s.wsA, "t1", "v1:drugi"))).toBeNull();
    expect(await veza(s, s.wsA, "threads")).toMatchObject({
      encryptedCredentials: "v1:drugi",
      generation: 2,
    });
  });
});

// ── Javna mutacija connections.save ─────────────────────────────────────────

const SERVISNI_NALOG = JSON.stringify({
  type: "service_account",
  project_id: "projekat-test",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  client_email: "servis@projekat-test.iam.gserviceaccount.com",
});
const KANAL = `UC${"a".repeat(22)}`;
const YOUTUBE_KREDENCIJALI = JSON.stringify({
  clientId: "klijent-id",
  clientSecret: "klijent-tajna",
  refreshToken: "refresh-token",
  channelId: KANAL,
});
const META_TOKEN = "t".repeat(24);

describe("connections.save", () => {
  test("meta_ig: nalog iz drugog projekta se odbija, B nema vezu", async () => {
    const s = await napraviSvet();
    await kao(s, s.ana).mutation(api.connections.save, {
      workspaceId: s.wsA,
      provider: "meta_ig",
      externalId: "ig1",
      secret: META_TOKEN,
    });
    const pre = await veza(s, s.wsA, "meta_ig");

    expect(
      await kodGreske(
        kao(s, s.boban).mutation(api.connections.save, {
          workspaceId: s.wsB,
          provider: "meta_ig",
          externalId: "ig1",
          secret: META_TOKEN,
        }),
      ),
    ).toBe(DRUGDE);
    expect(await veza(s, s.wsB, "meta_ig")).toBeNull();
    expect(await veza(s, s.wsA, "meta_ig")).toEqual(pre);
  });

  test("meta_ig: nalog sačuvan kroz OAuth (sa alt ID-jem) blokira i ručni unos po alt ID-ju", async () => {
    const s = await napraviSvet();
    await s.t.mutation(internal.instagramStore.saveConnectedCredentials, {
      workspaceId: s.wsA,
      externalId: "ig1",
      externalIdAlt: "igpro1",
      encryptedCredentials: "v1:token",
      expiresAt: 1,
    });

    expect(
      await kodGreske(
        kao(s, s.boban).mutation(api.connections.save, {
          workspaceId: s.wsB,
          provider: "meta_ig",
          externalId: "igpro1",
          secret: META_TOKEN,
        }),
      ),
    ).toBe(DRUGDE);
    expect(await veza(s, s.wsB, "meta_ig")).toBeNull();
  });

  test("threads: nalog iz drugog projekta se odbija", async () => {
    const s = await napraviSvet();
    await kao(s, s.ana).mutation(api.connections.save, {
      workspaceId: s.wsA,
      provider: "threads",
      externalId: "t1",
      secret: META_TOKEN,
    });

    expect(
      await kodGreske(
        kao(s, s.boban).mutation(api.connections.save, {
          workspaceId: s.wsB,
          provider: "threads",
          externalId: "t1",
          secret: META_TOKEN,
        }),
      ),
    ).toBe(DRUGDE);
    expect(await veza(s, s.wsB, "threads")).toBeNull();
  });

  test("meta_ig i threads: posle prekida u A, B sme da poveže isti nalog", async () => {
    const s = await napraviSvet();
    for (const provider of ["meta_ig", "threads"] as const) {
      await kao(s, s.ana).mutation(api.connections.save, {
        workspaceId: s.wsA,
        provider,
        externalId: "isti",
        secret: META_TOKEN,
      });
      const a = await veza(s, s.wsA, provider);
      await postaviStatus(s, a!._id, "disconnecting");

      const rezultat = await kao(s, s.boban).mutation(api.connections.save, {
        workspaceId: s.wsB,
        provider,
        externalId: "isti",
        secret: META_TOKEN,
      });
      expect(rezultat.upozorenje, provider).toBeNull();
      expect(await veza(s, s.wsB, provider), provider).toMatchObject({ externalId: "isti" });
    }
  });

  test("isti nalog u istom projektu: ponovni unos nije odbijen i nema upozorenja", async () => {
    const s = await napraviSvet();
    const unosi = [
      { provider: "meta_ig", externalId: "ig1", secret: META_TOKEN },
      { provider: "threads", externalId: "t1", secret: META_TOKEN },
      { provider: "youtube", secret: YOUTUBE_KREDENCIJALI },
      { provider: "meta_ads", externalId: "123456789", secret: META_TOKEN },
      { provider: "ga4", externalId: "123456", secret: SERVISNI_NALOG },
      { provider: "google_ads", externalId: "123-456-7890", secret: SERVISNI_NALOG },
    ] as const;

    for (const unos of unosi) {
      const prvi = await kao(s, s.ana).mutation(api.connections.save, {
        workspaceId: s.wsA,
        ...unos,
      });
      const drugi = await kao(s, s.ana).mutation(api.connections.save, {
        workspaceId: s.wsA,
        ...unos,
      });
      expect(prvi.upozorenje, `${unos.provider} prvi put`).toBeNull();
      expect(drugi.upozorenje, `${unos.provider} drugi put`).toBeNull();
      expect(drugi.connectionId, unos.provider).toBe(prvi.connectionId);
      expect((await veza(s, s.wsA, unos.provider))?.generation, unos.provider).toBe(2);
    }
  });
});

// ── Provajderi bez webhook-a: samo upozorenje ───────────────────────────────

describe("YouTube kanal u dva projekta", () => {
  const sacuvaj = (s: Svet, workspaceId: Id<"workspaces">, channelId = KANAL) =>
    s.t.mutation(internal.youtubeStore.saveConnectedCredentials, {
      workspaceId,
      channelId,
      channelTitle: "Kanal",
      encryptedCredentials: "v1:youtube",
    });

  test("prvi upis nema upozorenja, drugi projekat upisuje vezu uz upozorenje", async () => {
    const s = await napraviSvet();

    const a = await sacuvaj(s, s.wsA);
    expect(a.upozorenje).toBeNull();

    const b = await sacuvaj(s, s.wsB);
    expect(typeof b.upozorenje).toBe("string");
    expect(b.upozorenje?.length ?? 0).toBeGreaterThan(0);
    expect(b.upozorenje).toBe(UPOZORENJE_NALOG_DRUGDE);

    // Oba projekta zadržavaju svoju vezu.
    expect(await veza(s, s.wsB, "youtube")).toMatchObject({ _id: b.connectionId, externalId: KANAL });
    expect(await veza(s, s.wsA, "youtube")).toMatchObject({ _id: a.connectionId, externalId: KANAL });
  });

  test("ponovni upis u istom projektu nema upozorenja i ne pravi novu vezu", async () => {
    const s = await napraviSvet();
    const prvi = await sacuvaj(s, s.wsA);
    const drugi = await sacuvaj(s, s.wsA);

    expect(drugi.upozorenje).toBeNull();
    expect(drugi.connectionId).toBe(prvi.connectionId);
    expect(await veza(s, s.wsA, "youtube")).toMatchObject({ generation: 2 });
  });

  test("različit kanal nema upozorenja, a veza u prekidu se ne broji", async () => {
    const s = await napraviSvet();
    const a = await sacuvaj(s, s.wsA);

    expect((await sacuvaj(s, s.wsB, `UC${"b".repeat(22)}`)).upozorenje).toBeNull();

    await postaviStatus(s, a.connectionId, "disconnecting");
    expect((await sacuvaj(s, s.wsK)).upozorenje).toBeNull();
  });
});

describe("connections.save za provajdere bez webhook-a", () => {
  /** Isti nalog prvo u A, pa u B: B dobija upozorenje, a veza se upisuje. */
  async function drugiProjekatDobijaUpozorenje(
    provider: "youtube" | "meta_ads" | "ga4" | "google_ads",
    unos: { externalId?: string; externalIdAlt?: string; secret: string },
  ) {
    const s = await napraviSvet();
    const a = await kao(s, s.ana).mutation(api.connections.save, {
      workspaceId: s.wsA,
      provider,
      ...unos,
    });
    expect(a.upozorenje, `${provider}: prvi projekat`).toBeNull();

    const b = await kao(s, s.boban).mutation(api.connections.save, {
      workspaceId: s.wsB,
      provider,
      ...unos,
    });
    expect(typeof b.upozorenje, `${provider}: drugi projekat`).toBe("string");
    expect(b.upozorenje).toBe(UPOZORENJE_NALOG_DRUGDE);
    expect(await veza(s, s.wsB, provider), provider).toMatchObject({
      _id: b.connectionId,
      status: "active",
    });
    expect(await veza(s, s.wsA, provider), provider).toMatchObject({ _id: a.connectionId });
  }

  test("meta_ads: isti nalog u dva projekta, upozorenje", async () => {
    await drugiProjekatDobijaUpozorenje("meta_ads", {
      externalId: "123456789",
      secret: META_TOKEN,
    });
  });

  test("ga4: ista osobina u dva projekta, upozorenje", async () => {
    await drugiProjekatDobijaUpozorenje("ga4", {
      externalId: "123456",
      secret: SERVISNI_NALOG,
    });
  });

  test("google_ads: isti Customer ID u dva projekta, upozorenje", async () => {
    await drugiProjekatDobijaUpozorenje("google_ads", {
      externalId: "123-456-7890",
      externalIdAlt: "111-222-3333",
      secret: SERVISNI_NALOG,
    });
  });

  test("youtube: isti kanal u dva projekta, upozorenje", async () => {
    await drugiProjekatDobijaUpozorenje("youtube", { secret: YOUTUBE_KREDENCIJALI });
  });

  test("google_ads: isti login (MCC) ali drugi Customer ID nema upozorenja", async () => {
    const s = await napraviSvet();
    await kao(s, s.ana).mutation(api.connections.save, {
      workspaceId: s.wsA,
      provider: "google_ads",
      externalId: "123-456-7890",
      externalIdAlt: "111-222-3333",
      secret: SERVISNI_NALOG,
    });

    const b = await kao(s, s.boban).mutation(api.connections.save, {
      workspaceId: s.wsB,
      provider: "google_ads",
      externalId: "987-654-3210",
      externalIdAlt: "111-222-3333",
      secret: SERVISNI_NALOG,
    });
    expect(b.upozorenje).toBeNull();
    expect(await veza(s, s.wsB, "google_ads")).toMatchObject({
      externalId: "9876543210",
      externalIdAlt: "1112223333",
    });
  });

  test("različit nalog u drugom projektu nema upozorenja", async () => {
    const s = await napraviSvet();
    await kao(s, s.ana).mutation(api.connections.save, {
      workspaceId: s.wsA,
      provider: "ga4",
      externalId: "111",
      secret: SERVISNI_NALOG,
    });

    const b = await kao(s, s.boban).mutation(api.connections.save, {
      workspaceId: s.wsB,
      provider: "ga4",
      externalId: "222",
      secret: SERVISNI_NALOG,
    });
    expect(b.upozorenje).toBeNull();
  });

  test("veza u prekidu u drugom projektu ne daje upozorenje", async () => {
    const s = await napraviSvet();
    const a = await kao(s, s.ana).mutation(api.connections.save, {
      workspaceId: s.wsA,
      provider: "meta_ads",
      externalId: "123456789",
      secret: META_TOKEN,
    });
    await postaviStatus(s, a.connectionId, "disconnecting");

    const b = await kao(s, s.boban).mutation(api.connections.save, {
      workspaceId: s.wsB,
      provider: "meta_ads",
      externalId: "123456789",
      secret: META_TOKEN,
    });
    expect(b.upozorenje).toBeNull();
  });
});
