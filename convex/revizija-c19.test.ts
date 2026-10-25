/// <reference types="vite/client" />
/**
 * Revizija C19 (bezbednosne popravke), prvi deo: OAuth stanje, fajlovi iz
 * storage-a, odgovori na Threads-u, klik na `/r/`, snimci ocene sajta, mejl
 * pravila, vlasnici projekta, kvota videa, pozivnice i osvežavanje novosti.
 * Veze (webhook, brisanje, sinhronizacija) su u `revizija-c19-veze.test.ts`.
 *
 * Svet je `napraviSvet()`: A = „Enigma IT“ (osnivački), B = „ScanMe“. `fetch` je
 * lažan i baca ako ga neko pozove bez dogovora; testovi koji očekuju poziv ga
 * proveravaju izričito, pa nijedan zahtev ne izlazi na mrežu.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { consumeOpenInvite } from "./auth";
import { pacifickiDan } from "./lib/globalneKvote";
import { INSTAGRAM_OAUTH_TOKEN_URL } from "./lib/instagramApi";
import {
  deleteThreadsPost,
  managePendingReply,
  manageThreadsReply,
  repostThreadsPost,
} from "./lib/threadsApi";
import { kao, napraviPravilo, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

type Mreza = (url: string, init?: RequestInit) => Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn<Mreza>>;

beforeEach(() => {
  fetchMock = vi.fn<Mreza>(async (url) => {
    throw new Error(`neočekivan mrežni poziv: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── pomoćne ──────────────────────────────────────────────────────────────────

/** Greška sa bilo kojim kodom (`bad_request`…): `odbijeno` zna samo pet kodova. */
async function greska(poziv: Promise<unknown>): Promise<{ kod: string; poruka: string }> {
  const e = await poziv.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e, "poziv je morao da padne").not.toBeNull();
  const podaci = (e as { data?: { code?: string; message?: string } }).data;
  return {
    kod: podaci?.code ?? "",
    poruka: podaci?.message ?? (e instanceof Error ? e.message : String(e)),
  };
}

async function fajl(s: Svet, tip = "image/png"): Promise<Id<"_storage">> {
  return await s.t.run(async (ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(2000)], { type: tip })),
  );
}

const postoji = (s: Svet, id: Id<"_storage">) =>
  s.t.run(async (ctx) => (await ctx.db.system.get("_storage", id)) !== null);

// ── 1. instagram.completeOAuth ───────────────────────────────────────────────

describe("instagram.completeOAuth traži jednokratno stanje ovog projekta i ovog vlasnika", () => {
  // Namerno različito od adrese iz env-a: razmena mora da koristi sačuvanu.
  const REDIRECT = "https://stari.example/api/auth/callback/instagram";

  beforeEach(() => {
    vi.stubEnv("INSTAGRAM_APP_ID", "app-id");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "app-secret");
    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", "https://novi.example");
  });

  async function upisiStanje(
    s: Svet,
    o: {
      nonce: string;
      workspaceId: Id<"workspaces">;
      userId: Id<"users">;
      provider?: Doc<"oauthStates">["provider"];
      createdAt?: number;
    },
  ) {
    await s.t.run(async (ctx) => {
      await ctx.db.insert("oauthStates", {
        workspaceId: o.workspaceId,
        userId: o.userId,
        provider: o.provider ?? "meta_ig",
        nonce: o.nonce,
        redirectUri: REDIRECT,
        createdAt: o.createdAt ?? Date.now(),
      });
    });
  }

  const stanje = (s: Svet, nonce: string) =>
    s.t.run(async (ctx) =>
      ctx.db
        .query("oauthStates")
        .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
        .first(),
    );
  const veze = (s: Svet) => s.t.run(async (ctx) => await ctx.db.query("connections").collect());
  const zavrsi = (s: Svet, ko: Id<"users">, workspaceId: Id<"workspaces">, state: string) =>
    kao(s, ko).action(api.instagram.completeOAuth, { workspaceId, code: "kod-od-mete", state });

  test("nepoznato stanje: odbijeno, bez veze i bez mrežnog poziva", async () => {
    const s = await napraviSvet();

    await odbijeno(zavrsi(s, s.ana, s.wsA, "izmisljeno-stanje"), "invalid", /state/);

    expect(await veze(s)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("stanje izdato za projekat B ne vredi u A: potrošeno je, veza ne nastaje", async () => {
    const s = await napraviSvet();
    await upisiStanje(s, { nonce: "stanje-b", workspaceId: s.wsB, userId: s.boban });

    await odbijeno(zavrsi(s, s.ana, s.wsA, "stanje-b"), "invalid", /state/);

    expect(await stanje(s, "stanje-b")).toBeNull();
    expect(await veze(s)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    // Jednokratno je: ni vlasnik B ga posle ne može iskoristiti.
    await odbijeno(zavrsi(s, s.boban, s.wsB, "stanje-b"), "invalid", /state/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("isti vlasnik, drugi projekat: stanje izdato za B ne vredi kad se završava kroz A", async () => {
    const s = await napraviSvet();
    // Jovan je vlasnik oba projekta: korisnik stanja se poklapa, a projekat ne.
    await upisiStanje(s, { nonce: "stanje-jovana-b", workspaceId: s.wsB, userId: s.jovan });

    await odbijeno(zavrsi(s, s.jovan, s.wsA, "stanje-jovana-b"), "invalid", /state/);

    expect(await stanje(s, "stanje-jovana-b")).toBeNull();
    expect(await veze(s)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("stanje drugog vlasnika istog projekta ne vredi: potrošeno je, veza ne nastaje", async () => {
    const s = await napraviSvet();
    // Jovan je vlasnik A, ali je stanje pokrenuo on, a ne Ana.
    await upisiStanje(s, { nonce: "stanje-jovana", workspaceId: s.wsA, userId: s.jovan });

    await odbijeno(zavrsi(s, s.ana, s.wsA, "stanje-jovana"), "invalid", /state/);

    expect(await stanje(s, "stanje-jovana")).toBeNull();
    expect(await veze(s)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("stanje drugog provajdera ne otvara Instagram i ostaje za svog vlasnika", async () => {
    const s = await napraviSvet();
    await upisiStanje(s, {
      nonce: "stanje-youtube",
      workspaceId: s.wsA,
      userId: s.ana,
      provider: "youtube",
    });

    await odbijeno(zavrsi(s, s.ana, s.wsA, "stanje-youtube"), "invalid", /state/);

    expect(await stanje(s, "stanje-youtube")).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("stanje starije od 15 minuta se odbija bez mrežnog poziva", async () => {
    const s = await napraviSvet();
    await upisiStanje(s, {
      nonce: "staro-stanje",
      workspaceId: s.wsA,
      userId: s.ana,
      createdAt: Date.now() - 16 * 60 * 1000,
    });

    await odbijeno(zavrsi(s, s.ana, s.wsA, "staro-stanje"), "invalid", /istekla/);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await veze(s)).toEqual([]);
  });

  test("ispravno stanje: razmena ide sa sačuvanim redirect_uri, a stanje je jednokratno", async () => {
    const s = await napraviSvet();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Invalid authorization code", code: 100 } }), {
        status: 400,
      }),
    );
    await upisiStanje(s, { nonce: "moje-stanje", workspaceId: s.wsA, userId: s.ana });

    // Meta odbija lažni kod, ali smo stigli do razmene: provera stanja je prošla.
    await odbijeno(
      zavrsi(s, s.ana, s.wsA, "moje-stanje"),
      "invalid",
      /Greška pri preuzimanju tokena/,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(INSTAGRAM_OAUTH_TOKEN_URL);
    const telo = new URLSearchParams(String(init?.body));
    expect(telo.get("code")).toBe("kod-od-mete");
    expect(telo.get("redirect_uri")).toBe(REDIRECT);
    expect(await stanje(s, "moje-stanje")).toBeNull();

    await odbijeno(
      zavrsi(s, s.ana, s.wsA, "moje-stanje"),
      "invalid",
      /Nepoznat ili već iskorišćen/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── 2. trošenje OAuth stanja traži da je pokretač i dalje vlasnik ────────────

const POTROSNJA_STANJA = [
  ["meta_ig", internal.instagramStore.consumeOAuthState],
  ["meta_fb", internal.facebookStore.consumeOAuthState],
  ["threads", internal.threadsStore.consumeOAuthState],
  ["youtube", internal.youtubeStore.consumeOAuthState],
  ["google_business", internal.gbpStore.consumeOAuthState],
] as const;

describe.each(POTROSNJA_STANJA)("trošenje OAuth stanja: %s", (provider, potrosi) => {
  const REDIRECT = "https://cb.example/api/auth/callback/x";
  let brojac = 0;

  async function izdaj(s: Svet, userId: Id<"users">, workspaceId: Id<"workspaces">) {
    const nonce = `nonce-${++brojac}`;
    await s.t.run(async (ctx) => {
      await ctx.db.insert("oauthStates", {
        workspaceId,
        userId,
        provider,
        nonce,
        redirectUri: REDIRECT,
        createdAt: Date.now(),
      });
    });
    return nonce;
  }
  const red = (s: Svet, nonce: string) =>
    s.t.run(async (ctx) =>
      ctx.db
        .query("oauthStates")
        .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
        .first(),
    );

  test("vlasnik koji je pokrenuo povezivanje prolazi, a stanje nosi njegov userId", async () => {
    const s = await napraviSvet();
    const nonce = await izdaj(s, s.ana, s.wsA);

    const potroseno = await s.t.mutation(potrosi, { nonce });

    expect(potroseno).toMatchObject({ workspaceId: s.wsA, userId: s.ana, redirectUri: REDIRECT });
    expect(await red(s, nonce)).toBeNull();
  });

  test("pokretač koji više nije vlasnik ne prolazi, a stanje je ipak potrošeno", async () => {
    const s = await napraviSvet();
    const anaClanstvo = await s.t.run(async (ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) => q.eq("userId", s.ana).eq("workspaceId", s.wsA))
        .first(),
    );

    for (const uloga of ["urednik", "client_viewer"] as const) {
      await s.t.run(async (ctx) => ctx.db.patch(anaClanstvo!._id, { role: uloga }));
      const nonce = await izdaj(s, s.ana, s.wsA);
      expect(await s.t.mutation(potrosi, { nonce }), uloga).toBeNull();
      expect(await red(s, nonce), uloga).toBeNull();
    }

    // Uklonjen član projekta.
    await s.t.run(async (ctx) => ctx.db.delete(anaClanstvo!._id));
    const nonce = await izdaj(s, s.ana, s.wsA);
    expect(await s.t.mutation(potrosi, { nonce }), "uklonjen").toBeNull();
    expect(await red(s, nonce), "uklonjen").toBeNull();
  });

  test("pokretač koji nikad nije bio član ovog projekta ne prolazi", async () => {
    const s = await napraviSvet();
    // Boban je vlasnik B, ali nije član A.
    const nonce = await izdaj(s, s.boban, s.wsA);

    expect(await s.t.mutation(potrosi, { nonce })).toBeNull();
    expect(await red(s, nonce)).toBeNull();
  });
});

// ── 3. registerUpload (Instagram i Threads) ──────────────────────────────────

const racuniIg = (s: Svet, workspaceId: Id<"workspaces">) =>
  s.t.run(async (ctx) =>
    ctx.db
      .query("igPublishUploads")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect(),
  );
const racuniThreads = (s: Svet, workspaceId: Id<"workspaces">) =>
  s.t.run(async (ctx) =>
    ctx.db
      .query("threadsPublishUploads")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect(),
  );

const MREZE = [
  {
    ime: "Instagram",
    prijavi: api.instagramPublishStore.registerUpload,
    racuni: racuniIg,
    druga: { prijavi: api.threadsPublishStore.registerUpload, racuni: racuniThreads },
  },
  {
    ime: "Threads",
    prijavi: api.threadsPublishStore.registerUpload,
    racuni: racuniThreads,
    druga: { prijavi: api.instagramPublishStore.registerUpload, racuni: racuniIg },
  },
] as const;

const MREZE_PO_IMENU = MREZE.map((m) => [m.ime, m] as const);

describe.each(MREZE_PO_IMENU)("%s registerUpload ne preuzima tuđ ili star fajl", (_ime, m) => {
  const NIJE_NADJEN = /Fajl nije pronađen/;

  const prijaveFajlova = (s: Svet) =>
    s.t.run(async (ctx) => await ctx.db.query("projekatUploadi").collect());

  test("logo ili ikonica projekta se ne prijavljuje, ni tuđa ni sopstvena", async () => {
    const s = await napraviSvet();
    const logoB = await fajl(s);
    const ikonicaB = await fajl(s);
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.wsB, { brend: { logoStorageId: logoB, faviconStorageId: ikonicaB } });
    });

    for (const storageId of [logoB, ikonicaB]) {
      await odbijeno(
        kao(s, s.ana).mutation(m.prijavi, { workspaceId: s.wsA, storageId }),
        "invalid",
        NIJE_NADJEN,
      );
      await odbijeno(
        kao(s, s.boban).mutation(m.prijavi, { workspaceId: s.wsB, storageId }),
        "invalid",
        NIJE_NADJEN,
      );
    }
    expect(await m.racuni(s, s.wsA)).toEqual([]);
    expect(await m.racuni(s, s.wsB)).toEqual([]);
    expect(await m.druga.racuni(s, s.wsA)).toEqual([]);
    // Odbijen fajl se ne briše: možda nije naš.
    expect(await postoji(s, logoB)).toBe(true);
  });

  test("fajl prijavljen za sliku posta ili titl se ne prijavljuje kao objava, ni u istom projektu", async () => {
    const s = await napraviSvet();
    const naslovnaB = await fajl(s);
    const titlA = await fajl(s, "text/vtt");
    await kao(s, s.boban).mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsB,
      storageId: naslovnaB,
      svrha: "novosti_naslovna",
    });
    await kao(s, s.ana).mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsA,
      storageId: titlA,
      svrha: "yt_titl",
    });

    await odbijeno(
      kao(s, s.ana).mutation(m.prijavi, { workspaceId: s.wsA, storageId: naslovnaB }),
      "invalid",
      NIJE_NADJEN,
    );
    await odbijeno(
      kao(s, s.boban).mutation(m.prijavi, { workspaceId: s.wsB, storageId: naslovnaB }),
      "invalid",
      NIJE_NADJEN,
    );
    await odbijeno(
      kao(s, s.ana).mutation(m.prijavi, { workspaceId: s.wsA, storageId: titlA }),
      "invalid",
      NIJE_NADJEN,
    );

    expect(await m.racuni(s, s.wsA)).toEqual([]);
    expect(await m.racuni(s, s.wsB)).toEqual([]);
    // Prijave posta i titla su ostale kakve su bile.
    expect((await prijaveFajlova(s)).map((r) => [r.workspaceId, r.storageId]).sort()).toEqual(
      [
        [s.wsB, naslovnaB],
        [s.wsA, titlA],
      ].sort(),
    );
  });

  test("fajl objave druge mreže, koji je prijavio drugi projekat, se ne preuzima", async () => {
    const s = await napraviSvet();
    const f = await fajl(s, "video/mp4");
    await kao(s, s.boban).mutation(m.druga.prijavi, { workspaceId: s.wsB, storageId: f });
    expect(await m.druga.racuni(s, s.wsB)).toHaveLength(1);

    await odbijeno(
      kao(s, s.ana).mutation(m.prijavi, { workspaceId: s.wsA, storageId: f }),
      "invalid",
      NIJE_NADJEN,
    );

    expect(await m.racuni(s, s.wsA)).toEqual([]);
    expect(await m.druga.racuni(s, s.wsA)).toEqual([]);
    // Račun projekta B je netaknut.
    expect((await m.druga.racuni(s, s.wsB)).map((r) => r.storageId)).toEqual([f]);
  });

  test("star fajl se ne prijavljuje, a svež prolazi", async () => {
    // Samo sat: convex-test sam koristi tajmere.
    vi.useFakeTimers({ toFake: ["Date"] });
    const s = await napraviSvet();
    const t0 = Date.now();
    const star = await fajl(s);
    const svez = await fajl(s);
    const ana = kao(s, s.ana);

    vi.setSystemTime(t0 + 9 * 60 * 1000);
    await ana.mutation(m.prijavi, { workspaceId: s.wsA, storageId: svez });
    expect((await m.racuni(s, s.wsA)).map((r) => r.storageId)).toEqual([svez]);

    vi.setSystemTime(t0 + 11 * 60 * 1000);
    await odbijeno(
      ana.mutation(m.prijavi, { workspaceId: s.wsA, storageId: star }),
      "invalid",
      /isteklo/,
    );
    // Nije nastao račun za star fajl, a ni onaj prethodni nije dirnut.
    expect((await m.racuni(s, s.wsA)).map((r) => r.storageId)).toEqual([svez]);
    expect(await m.druga.racuni(s, s.wsA)).toEqual([]);
  });

  test("isti projekat sme isti fajl da prijavi za obe mreže, i više puta", async () => {
    const s = await napraviSvet();
    const f = await fajl(s, "video/mp4");
    const boban = kao(s, s.boban);

    await boban.mutation(m.prijavi, { workspaceId: s.wsB, storageId: f });
    await boban.mutation(m.druga.prijavi, { workspaceId: s.wsB, storageId: f });
    // Ponovljena prijava istog fajla je ista prijava.
    await boban.mutation(m.prijavi, { workspaceId: s.wsB, storageId: f });

    expect((await m.racuni(s, s.wsB)).map((r) => r.storageId)).toEqual([f]);
    expect((await m.druga.racuni(s, s.wsB)).map((r) => r.storageId)).toEqual([f]);
  });
});

// ── 4. threadsReplies.deleteReply ────────────────────────────────────────────

describe("threadsReplies.deleteReply briše samo odgovor ovog projekta, ne objavu", () => {
  async function postavi() {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("threadsPosts", {
        workspaceId: s.wsA,
        mediaId: "objava-a",
        mediaType: "TEXT_POST",
      });
      await ctx.db.insert("threadsReplies", {
        workspaceId: s.wsA,
        replyId: "odgovor-a",
        text: "A",
        source: "sync",
      });
      await ctx.db.insert("threadsReplies", {
        workspaceId: s.wsB,
        replyId: "odgovor-b",
        text: "B",
        source: "sync",
      });
      // ID koji je istovremeno i odgovor i objava: objava ima prednost.
      await ctx.db.insert("threadsPosts", {
        workspaceId: s.wsA,
        mediaId: "i-objava-i-odgovor",
        mediaType: "TEXT_POST",
        isReply: true,
      });
      await ctx.db.insert("threadsReplies", {
        workspaceId: s.wsA,
        replyId: "i-objava-i-odgovor",
        text: "A2",
        source: "sync",
      });
    });
    return s;
  }

  const obrisi = (s: Svet, replyId: string) =>
    kao(s, s.urednica).action(api.threadsReplies.deleteReply, { workspaceId: s.wsA, replyId });

  const stanjeTabela = (s: Svet) =>
    s.t.run(async (ctx) => ({
      odgovori: (await ctx.db.query("threadsReplies").collect()).map((r) => r.replyId).sort(),
      objave: (await ctx.db.query("threadsPosts").collect()).map((p) => p.mediaId).sort(),
    }));

  test("objava, odgovor drugog projekta i nepoznat ID: nije pronađeno, bez mrežnog poziva", async () => {
    const s = await postavi();
    const pre = await stanjeTabela(s);

    for (const replyId of ["objava-a", "odgovor-b", "izmisljen-id", "i-objava-i-odgovor"]) {
      await odbijeno(obrisi(s, replyId), "not_found", /nije pronađen/);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await stanjeTabela(s)).toEqual(pre);
  });

  test("odgovor ovog projekta prolazi proveru i staje tek na vezi", async () => {
    const s = await postavi();

    await odbijeno(obrisi(s, "odgovor-a"), "invalid", /Threads nalog nije povezan/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── 9. klik na /r/ ───────────────────────────────────────────────────────────

describe("orLinks.registerClick pravi CAPI događaj samo uz piksel i token projekta", () => {
  const ODREDISTE = "https://example.test/ponuda";
  const ENV_PIKSEL = "1111111111111";
  const ENV_TOKEN = "enigma-capi-token-1234567890abc";
  const IP = "203.0.113.7";

  beforeEach(() => {
    // Zakazano slanje na Meta ne sme da se izvrši usred testa.
    vi.useFakeTimers();
    vi.stubEnv("META_PIXEL_ID", undefined);
    vi.stubEnv("META_CAPI_TOKEN", undefined);
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "ab".repeat(32));
  });

  const napraviLink = (s: Svet, workspaceId: Id<"workspaces">, slug: string) =>
    s.t.run(async (ctx) =>
      ctx.db.insert("orTrackedLinks", {
        workspaceId,
        channel: "instagram",
        slug,
        destinationUrl: ODREDISTE,
        createdAt: Date.now(),
      }),
    );
  const klik = (s: Svet, slug: string) =>
    s.t.mutation(internal.orLinks.registerClick, {
      slug,
      countClick: true,
      ipHash: "a".repeat(32),
      clientIp: IP,
      userAgent: "Mozilla/5.0 (test)",
    });
  const capiRedovi = (s: Svet) => s.t.run(async (ctx) => await ctx.db.query("capiEvents").collect());
  const klikovi = (s: Svet, workspaceId: Id<"workspaces">) =>
    s.t.run(async (ctx) =>
      (await ctx.db.query("orLinkClicks").collect()).filter((k) => k.workspaceId === workspaceId),
    );

  test("projekat bez piksela i tokena: klik se broji, a događaj sa IP adresom ne nastaje", async () => {
    const s = await napraviSvet();
    await napraviLink(s, s.wsB, "slug-b");

    const odgovor = await klik(s, "slug-b");

    // Preusmerenje i brojanje rade kao i pre, bez `eventId` za Pixel.
    expect(odgovor).toEqual({ destinationUrl: ODREDISTE, campaignSlug: "threads", channel: "instagram" });
    expect(await klikovi(s, s.wsB)).toHaveLength(1);
    expect(await capiRedovi(s)).toEqual([]);
  });

  test("env piksel i token važe samo za osnivački projekat: B i dalje nema događaj, A ima", async () => {
    const s = await napraviSvet();
    vi.stubEnv("META_PIXEL_ID", ENV_PIKSEL);
    vi.stubEnv("META_CAPI_TOKEN", ENV_TOKEN);
    await napraviLink(s, s.wsB, "slug-b");
    await napraviLink(s, s.wsA, "slug-a");

    const odB = await klik(s, "slug-b");
    expect(odB?.eventId).toBeUndefined();
    expect(await capiRedovi(s)).toEqual([]);

    const odA = await klik(s, "slug-a");
    const redovi = await capiRedovi(s);
    expect(redovi).toHaveLength(1);
    expect(redovi[0]).toMatchObject({
      workspaceId: s.wsA,
      eventName: "PageView",
      sourceKind: "link_redirect",
      actionSource: "website",
      clientIpAddress: IP,
      status: "pending",
    });
    // Isti ključ ide na odredište kao `eid`, da Pixel i server događaj budu jedan.
    expect(odA?.eventId).toBe(redovi[0].eventId);
  });

  test("projekat sa sopstvenim podešavanjima: tek piksel i token zajedno otvaraju događaj", async () => {
    const s = await napraviSvet();
    await napraviLink(s, s.wsB, "slug-b");
    const boban = kao(s, s.boban);

    await boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsB,
      pikselId: "3333333333333",
    });
    await klik(s, "slug-b");
    expect(await capiRedovi(s), "samo piksel").toEqual([]);

    await boban.mutation(api.podesavanjaStore.postaviTajnu, {
      workspaceId: s.wsB,
      kljuc: "meta_capi_token",
      vrednost: "scanme-capi-token-0987654321xyz",
    });
    const odgovor = await klik(s, "slug-b");

    const redovi = await capiRedovi(s);
    expect(redovi).toHaveLength(1);
    expect(redovi[0]).toMatchObject({ workspaceId: s.wsB, clientIpAddress: IP });
    expect(odgovor?.eventId).toBe(redovi[0].eventId);
    expect(await klikovi(s, s.wsB)).toHaveLength(2);
  });
});

// ── 10. snimci ocene sajta ───────────────────────────────────────────────────

describe("snimci ocene sajta pripadaju projektu tokena", () => {
  const PNG = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], {
    type: "image/png",
  });

  async function noviToken(s: Svet, ko: Id<"users">, workspaceId: Id<"workspaces">) {
    const { token } = await kao(s, ko).mutation(api.ingestTokensStore.createIngestToken, {
      workspaceId,
      naziv: "test",
      namena: "uvoz",
    });
    return token;
  }

  async function posaljiSnimak(s: Svet, token: string) {
    const r = await s.t.fetch("/generate-leads/snimak", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "image/png" },
      body: PNG,
    });
    expect(r.status).toBe(200);
    return (await r.json()) as { storageId: Id<"_storage">; bajtova: number; tip: string };
  }

  const prijave = (s: Svet) =>
    s.t.run(async (ctx) => await ctx.db.query("projekatUploadi").collect());
  const uvozi = (s: Svet) => s.t.run(async (ctx) => await ctx.db.query("leadImports").collect());
  const redoviUvoza = (s: Svet) =>
    s.t.run(async (ctx) => await ctx.db.query("leadImportRows").collect());

  const red = (snimci?: { desktopId?: Id<"_storage">; mobilniId?: Id<"_storage"> }) => ({
    nazivFirme: "Salon Lana",
    grad: "Beograd",
    izvori: [] as string[],
    derivedSignals: [] as string[],
    sajtOcena: {
      url: "https://salonlana.example",
      auditedAt: 1_700_000_000_000,
      verzijaSkilla: "1.0.0",
      ...(snimci !== undefined ? { snimci } : {}),
    },
  });

  const izTabele = (s: Svet, rows: ReturnType<typeof red>[]) =>
    kao(s, s.urednica).mutation(api.leadImportStore.createImport, {
      workspaceId: s.wsA,
      fileName: "lista.xlsx",
      sheetsChosen: ["List1"],
      headerRowIndex: 0,
      rows,
      skipped: [],
      warnings: [],
    });

  const izSkilla = (s: Svet, rows: ReturnType<typeof red>[]) =>
    s.t.mutation(internal.leadImportStore.createImportFromIngest, {
      workspaceId: s.wsA,
      uploadedBy: s.ana,
      fileName: "generate-leads",
      rows,
      warnings: [],
    });

  test("uvoz iz tabele ne prima snimke: odbijeno, uvoz ne nastaje; ocena bez snimaka prolazi", async () => {
    const s = await napraviSvet();
    const f = await fajl(s);

    await odbijeno(izTabele(s, [red({ desktopId: f })]), "invalid", /samo iz skilla/);

    expect(await uvozi(s)).toEqual([]);
    expect(await redoviUvoza(s)).toEqual([]);
    // Fajl nije dirnut.
    expect(await postoji(s, f)).toBe(true);

    // Kontrola: ista ocena bez snimaka je običan uvoz.
    const rezultat = await izTabele(s, [red()]);
    expect(rezultat.rowsCount).toBe(1);
    expect(await uvozi(s)).toHaveLength(1);
  });

  test("POST /generate-leads/snimak upisuje fajl u projekat tokena, sa svrhom lead_snimak", async () => {
    const s = await napraviSvet();
    const tokenB = await noviToken(s, s.boban, s.wsB);

    const odgovor = await posaljiSnimak(s, tokenB);

    expect(odgovor).toMatchObject({ bajtova: 12, tip: "image/png" });
    expect(await postoji(s, odgovor.storageId)).toBe(true);
    const redovi = await prijave(s);
    expect(redovi).toHaveLength(1);
    expect(redovi[0]).toMatchObject({
      workspaceId: s.wsB,
      storageId: odgovor.storageId,
      userId: s.boban,
      svrha: "lead_snimak",
    });
  });

  test("uvoz iz skilla izostavlja snimak drugog projekta i kaže to u izveštaju", async () => {
    const s = await napraviSvet();
    const snimakB = (await posaljiSnimak(s, await noviToken(s, s.boban, s.wsB))).storageId;

    const { importId, rowsCount } = await izSkilla(s, [red({ desktopId: snimakB })]);

    expect(rowsCount).toBe(1);
    const uvoz = (await uvozi(s)).find((u) => u._id === importId);
    expect(uvoz?.workspaceId).toBe(s.wsA);
    expect(uvoz?.warnings).toHaveLength(1);
    expect(uvoz?.warnings[0]).toMatch(/Izostavljeno snimaka sajta: 1/);
    const redovi = await redoviUvoza(s);
    expect(redovi).toHaveLength(1);
    expect(redovi[0].parsed.sajtOcena?.snimci?.desktopId).toBeUndefined();
    expect(JSON.stringify(redovi[0].parsed)).not.toContain(snimakB);
    // Ostatak ocene je prošao.
    expect(redovi[0].parsed.sajtOcena?.url).toBe("https://salonlana.example");
  });

  test("uvoz iz skilla zadržava snimak prijavljen za ovaj projekat, a izostavlja ostale vrste fajlova", async () => {
    const s = await napraviSvet();
    const snimakA = (await posaljiSnimak(s, await noviToken(s, s.ana, s.wsA))).storageId;
    const snimakB = (await posaljiSnimak(s, await noviToken(s, s.boban, s.wsB))).storageId;
    // Fajl ovog projekta, ali prijavljen za sliku posta, i fajl koji niko nije prijavio.
    const naslovnaA = await fajl(s);
    await kao(s, s.ana).mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsA,
      storageId: naslovnaA,
      svrha: "novosti_naslovna",
    });
    const neprijavljen = await fajl(s);

    // Samo svoj snimak: ostaje, izveštaj nema upozorenja.
    const cist = await izSkilla(s, [red({ desktopId: snimakA })]);
    const cistUvoz = (await uvozi(s)).find((u) => u._id === cist.importId);
    expect(cistUvoz?.warnings).toEqual([]);
    const cistRed = (await redoviUvoza(s)).find((r) => r.importId === cist.importId);
    expect(cistRed?.parsed.sajtOcena?.snimci).toEqual({ desktopId: snimakA });

    // Mešavina: svoj ostaje, tuđi i pogrešne vrste ispadaju, a broj izostavljenih je tačan.
    const mesavina = await izSkilla(s, [
      red({ desktopId: snimakA, mobilniId: snimakB }),
      red({ desktopId: naslovnaA, mobilniId: neprijavljen }),
    ]);
    const mesavinaUvoz = (await uvozi(s)).find((u) => u._id === mesavina.importId);
    expect(mesavinaUvoz?.warnings).toHaveLength(1);
    expect(mesavinaUvoz?.warnings[0]).toMatch(/Izostavljeno snimaka sajta: 3/);
    const redovi = (await redoviUvoza(s))
      .filter((r) => r.importId === mesavina.importId)
      .sort((a, b) => a.sourceRowIndex - b.sourceRowIndex);
    expect(redovi.map((r) => r.parsed.sajtOcena?.snimci)).toEqual([{ desktopId: snimakA }, {}]);
  });
});

// ── 11. mejl pravila ─────────────────────────────────────────────────────────

describe("mejl pravila: ALLOWED_EMAILS samo za osnivački projekat", () => {
  test("zaMejl kaže da li je projekat osnivački", async () => {
    const s = await napraviSvet();

    expect(await s.t.query(internal.podesavanjaStore.zaMejl, { workspaceId: s.wsA })).toMatchObject({
      ime: "Enigma IT",
      osnivacki: true,
    });
    expect(await s.t.query(internal.podesavanjaStore.zaMejl, { workspaceId: s.wsB })).toMatchObject({
      ime: "ScanMe",
      osnivacki: false,
    });
    expect(await s.t.query(internal.podesavanjaStore.zaMejl, { workspaceId: s.wsK })).toMatchObject({
      osnivacki: false,
    });
  });

  test("projektiSaPravilima vraća samo projekte sa bar jednim uključenim pravilom", async () => {
    const s = await napraviSvet();
    const iskljucenoA = await napraviPravilo(s, s.wsA, "Isključeno pravilo");
    const ukljucenoB = await napraviPravilo(s, s.wsB, "Uključeno pravilo");
    await s.t.run(async (ctx) => ctx.db.patch(ukljucenoB, { enabled: true }));

    expect(await s.t.query(internal.rulesStore.projektiSaPravilima, {})).toEqual([s.wsB]);

    // Projekat sa više pravila se vraća jednom, a uključeno pravilo u A ga dodaje.
    await napraviPravilo(s, s.wsB, "Još jedno isključeno");
    await s.t.run(async (ctx) => ctx.db.patch(iskljucenoA, { enabled: true }));
    expect(await s.t.query(internal.rulesStore.projektiSaPravilima, {})).toEqual([s.wsA, s.wsB]);
  });

  describe("primaoci mejla", () => {
    beforeEach(() => {
      vi.stubEnv("RESEND_API_KEY", "re_probni_kljuc");
      vi.stubEnv("ALLOWED_EMAILS", "spoljni@enigma.test; DRUGI@enigma.test");
      vi.stubEnv("EMAIL_FROM", "Enigma <obavestenja@enigma.test>");
      vi.stubEnv("ADS_WRITE_ENABLED", "false");
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      fetchMock.mockImplementation(
        async () =>
          new Response(JSON.stringify({ id: "mejl-1" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      );
    });

    /** Pravilo „obavesti“ koje se uvek okida: potrošnja ≥ 0 na jedinom nalogu oglasa projekta. */
    async function uvekOkidajuPravilo(s: Svet, workspaceId: Id<"workspaces">, ime: string) {
      await s.t.run(async (ctx) => {
        await ctx.db.insert("adAccounts", {
          workspaceId,
          provider: "meta_ads",
          externalId: `act_${ime}`,
          name: ime,
          currency: "EUR",
        });
        await ctx.db.insert("rules", {
          workspaceId,
          name: `Pravilo ${ime}`,
          enabled: true,
          scope: "account",
          condition: { metric: "spend", operator: "gte", value: 0, windowDays: 1, minImpressions: 0 },
          action: "notify",
          cooldownHours: 24,
        });
      });
    }

    /** Poslati mejlovi: naslov nosi ime naloga oglasa, pa se zna čiji je koji. */
    const poslatiMejlovi = () =>
      fetchMock.mock.calls
        .filter(([url]) => String(url).includes("/emails"))
        .map(
          ([, init]) =>
            JSON.parse(String(init?.body)) as { subject: string; to: string[]; html: string },
        );

    test("cron procenjuje projekat po projekat: B piše samo svojim članovima, A i adresama iz ALLOWED_EMAILS", async () => {
      const s = await napraviSvet();
      await uvekOkidajuPravilo(s, s.wsA, "NalogA");
      await uvekOkidajuPravilo(s, s.wsB, "NalogB");

      const sazetak = await s.t.action(internal.rules.evaluateRulesCron, {});

      expect(sazetak).toMatchObject({
        evaluatedRulesCount: 2,
        firingsCount: 2,
        notificationsSentCount: 2,
      });
      const mejlovi = poslatiMejlovi();
      expect(mejlovi).toHaveLength(2);
      const zaB = mejlovi.find((m) => m.subject.includes("NalogB"));
      const zaA = mejlovi.find((m) => m.subject.includes("NalogA"));
      expect(zaB?.to.slice().sort()).toEqual(["boban@scanme.test", "jovan@enigma.test"]);
      expect(zaA?.to.slice().sort()).toEqual([
        "ana@enigma.test",
        "drugi@enigma.test",
        "jovan@enigma.test",
        "pregled@enigma.test",
        "spoljni@enigma.test",
        "urednica@enigma.test",
      ]);
    });

    test("ime pravila i ime naloga sa Mete ulaze u HTML mejla kao tekst, ne kao oznake", async () => {
      const s = await napraviSvet();
      await s.t.run(async (ctx) => {
        await ctx.db.insert("adAccounts", {
          workspaceId: s.wsB,
          provider: "meta_ads",
          externalId: "act_html",
          name: 'Nalog <b>"B"</b> & Ko',
          currency: "EUR",
        });
        await ctx.db.insert("rules", {
          workspaceId: s.wsB,
          name: "<img src=x onerror=alert(1)>",
          enabled: true,
          scope: "account",
          condition: { metric: "spend", operator: "gte", value: 0, windowDays: 1, minImpressions: 0 },
          action: "notify",
          cooldownHours: 24,
        });
      });

      await s.t.action(internal.rules.evaluateRulesInternal, { workspaceId: s.wsB });

      const mejlovi = poslatiMejlovi();
      expect(mejlovi).toHaveLength(1);
      const { html } = mejlovi[0];
      expect(html).toContain("Upozorenje: &lt;img src=x onerror=alert(1)&gt;");
      expect(html).toContain("Nalog &lt;b&gt;&quot;B&quot;&lt;/b&gt; &amp; Ko");
      expect(html).not.toContain("<img src=x");
    });
  });
});

// ── lib/threadsApi: ID iz argumenta ──────────────────────────────────────────

describe("lib/threadsApi: ID iz argumenta ne menja endpoint koji se zove tokenom projekta", () => {
  // Ako bi se ID ubacio sirov, ovo bi pogodilo `/me` sa upitom umesto `/<id>/…`.
  const PODMETNUT = "1789/../../me?fields=id,username&access_token=tudj";

  beforeEach(() => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: true, deleted_id: "1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
  });

  /** Putanja i upit poslednjeg poziva, i „kako je putanja pročitana“: segmenti posle verzije. */
  function poslednjiPoziv() {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    const adresa = new URL(String(url));
    return {
      init,
      adresa,
      segmenti: adresa.pathname.split("/").filter(Boolean).slice(1),
    };
  }

  const POZIVI = [
    {
      ime: "manageThreadsReply",
      pozovi: (replyId: string) => manageThreadsReply({ accessToken: "t", replyId, hide: true }),
      metoda: "POST",
      sufiks: ["manage_reply"],
      upit: { hide: "true" },
    },
    {
      ime: "managePendingReply",
      pozovi: (replyId: string) => managePendingReply({ accessToken: "t", replyId, approve: true }),
      metoda: "POST",
      sufiks: ["manage_pending_reply"],
      upit: { approve: "true" },
    },
    {
      ime: "repostThreadsPost",
      pozovi: (mediaId: string) => repostThreadsPost({ accessToken: "t", mediaId }),
      metoda: "POST",
      sufiks: ["repost"],
      upit: {},
    },
    {
      ime: "deleteThreadsPost",
      pozovi: (mediaId: string) => deleteThreadsPost({ accessToken: "t", mediaId }),
      metoda: "DELETE",
      sufiks: [],
      upit: {},
    },
  ];

  describe.each(POZIVI.map((p) => [p.ime, p] as const))("%s", (_ime, p) => {
    test("podmetnut ID ostaje jedan segment putanje, bez novih upita", async () => {
      await p.pozovi(PODMETNUT);

      const { init, adresa, segmenti } = poslednjiPoziv();
      expect(adresa.origin).toBe("https://graph.threads.com");
      expect(init?.method).toBe(p.metoda);
      // Jedan segment za ID (kodiran), pa fiksni nastavak endpointa.
      expect(segmenti).toHaveLength(1 + p.sufiks.length);
      expect(decodeURIComponent(segmenti[0])).toBe(PODMETNUT);
      expect(segmenti.slice(1)).toEqual(p.sufiks);
      // Upit sadrži samo ono što funkcija sama šalje; token ide samo u zaglavlje.
      expect(Object.fromEntries(adresa.searchParams)).toEqual(p.upit);
      expect(init?.headers).toMatchObject({ Authorization: "Bearer t" });
    });

    test("običan ID prolazi nepromenjen", async () => {
      await p.pozovi("17890000000000001");

      expect(poslednjiPoziv().segmenti).toEqual(["17890000000000001", ...p.sufiks]);
    });
  });
});

// ── 12. poslednji vlasnik se broji po ljudima ────────────────────────────────

describe("poslednji vlasnik se broji po ljudima, ne po redovima", () => {
  /** B: Boban kao jedini čovek sa ulogom vlasnika, ali sa dva reda u `members`. */
  async function bobanSaDvaReda() {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      const jovanovRed = await ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) => q.eq("userId", s.jovan).eq("workspaceId", s.wsB))
        .first();
      await ctx.db.delete(jovanovRed!._id);
      await ctx.db.insert("members", { workspaceId: s.wsB, userId: s.boban, role: "owner" });
    });
    return s;
  }

  const redoviBobana = (s: Svet) =>
    s.t.run(async (ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) => q.eq("userId", s.boban).eq("workspaceId", s.wsB))
        .collect(),
    );

  test("promeniUlogu: dupli red istog vlasnika nije drugi vlasnik", async () => {
    const s = await bobanSaDvaReda();
    expect((await redoviBobana(s)).map((r) => r.role)).toEqual(["owner", "owner"]);

    const e = await greska(
      kao(s, s.boban).mutation(api.membersStore.promeniUlogu, {
        workspaceId: s.wsB,
        userId: s.boban,
        uloga: "urednik",
      }),
    );

    expect(e.kod).toBe("bad_request");
    expect(e.poruka).toMatch(/poslednjeg vlasnika/);
    expect((await redoviBobana(s)).map((r) => r.role)).toEqual(["owner", "owner"]);
  });

  test("promeniUlogu: sa pravim drugim vlasnikom prolazi i spušta oba reda", async () => {
    const s = await bobanSaDvaReda();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("members", { workspaceId: s.wsB, userId: s.jovan, role: "owner" });
    });

    await kao(s, s.boban).mutation(api.membersStore.promeniUlogu, {
      workspaceId: s.wsB,
      userId: s.boban,
      uloga: "urednik",
    });

    expect((await redoviBobana(s)).map((r) => r.role)).toEqual(["urednik", "urednik"]);
  });

  test("removeMember: vlasnik sa dva reda se uklanja kad postoji drugi vlasnik, oba reda nestaju", async () => {
    const s = await bobanSaDvaReda();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("members", { workspaceId: s.wsB, userId: s.jovan, role: "owner" });
    });

    await kao(s, s.jovan).mutation(api.membersStore.removeMember, {
      workspaceId: s.wsB,
      userId: s.boban,
      preuzimaLeadoveUserId: s.jovan,
    });

    expect(await redoviBobana(s)).toEqual([]);
    // Jovanovo članstvo u A je netaknuto.
    const jovanA = await s.t.run(async (ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) => q.eq("userId", s.jovan).eq("workspaceId", s.wsA))
        .first(),
    );
    expect(jovanA?.role).toBe("owner");
  });
});

// ── 13. ytUpload.failUpload ──────────────────────────────────────────────────

describe("ytUpload.failUpload ne vraća upload za posao druge vrste", () => {
  const PODNE = Date.parse("2026-03-18T20:00:00.000Z");

  beforeEach(() => {
    // Pacifički dan brojača ne sme da zavisi od toga kad se test pokrene.
    vi.useFakeTimers({ toFake: ["Date"], now: PODNE });
  });

  async function postavi() {
    const s = await napraviSvet();
    const dan = pacifickiDan(Date.now());
    await s.t.run(async (ctx) => {
      // Tri slanja videa danas; `updatedAt: 1` otkriva i upis iste vrednosti.
      await ctx.db.insert("globalneKvote", {
        kljuc: "youtube",
        datum: dan,
        jedinice: 0,
        uploadi: 3,
        updatedAt: 1,
      });
      await ctx.db.insert("ytQuotaUsage", {
        workspaceId: s.wsA,
        date: dan,
        unitsUsed: 0,
        uploadsUsed: 3,
        updatedAt: 1,
      });
    });
    return { s, dan };
  }

  const kvote = (s: Svet, dan: string) =>
    s.t.run(async (ctx) => ({
      globalno: await ctx.db
        .query("globalneKvote")
        .withIndex("by_kljuc_datum", (q) => q.eq("kljuc", "youtube").eq("datum", dan))
        .collect(),
      projekat: await ctx.db
        .query("ytQuotaUsage")
        .withIndex("by_workspace_date", (q) => q.eq("workspaceId", s.wsA).eq("date", dan))
        .collect(),
    }));

  const posao = (s: Svet, kind: Doc<"ytMediaJobs">["kind"]) =>
    s.t.run(async (ctx) =>
      ctx.db.insert("ytMediaJobs", {
        workspaceId: s.wsA,
        kind,
        title: "Proba",
        status: "pending",
        unitsSpent: 0,
        createdAt: 1,
      }),
    );

  const propali = (s: Svet, jobId: Id<"ytMediaJobs">, sessionOpened: boolean) =>
    kao(s, s.urednica).mutation(api.ytUpload.failUpload, {
      workspaceId: s.wsA,
      jobId,
      message: "x",
      sessionOpened,
    });

  test("zaglavljen posao sličice ostaje otvoren, a brojač slanja se ne menja", async () => {
    const { s, dan } = await postavi();
    const pre = await kvote(s, dan);
    expect(pre.globalno[0]).toMatchObject({ uploadi: 3 });
    expect(pre.projekat[0]).toMatchObject({ uploadsUsed: 3 });

    for (const kind of ["thumbnail", "caption", "metadata", "playlist", "comment_delete"] as const) {
      const jobId = await posao(s, kind);
      await propali(s, jobId, false);
      const posle = await s.t.run(async (ctx) => await ctx.db.get(jobId));
      expect(posle, kind).toMatchObject({ status: "pending", unitsSpent: 0 });
      expect(posle?.finishedAt, kind).toBeUndefined();
    }

    expect(await kvote(s, dan)).toEqual(pre);
  });

  test("kontrola: posao slanja videa se zatvara i vraća jedan upload samo kad sesija nije otvorena", async () => {
    const { s, dan } = await postavi();

    const neOtvorena = await posao(s, "upload");
    await propali(s, neOtvorena, false);
    expect(await s.t.run(async (ctx) => await ctx.db.get(neOtvorena))).toMatchObject({
      status: "failed",
      errorMessage: "x",
    });
    const posle = await kvote(s, dan);
    expect(posle.globalno[0]).toMatchObject({ uploadi: 2 });
    expect(posle.projekat[0]).toMatchObject({ uploadsUsed: 2 });

    // Sesija je otvorena: pokušaj se računa, brojač ostaje.
    const otvorena = await posao(s, "upload");
    await propali(s, otvorena, true);
    expect(await s.t.run(async (ctx) => await ctx.db.get(otvorena))).toMatchObject({ status: "failed" });
    expect(await kvote(s, dan)).toEqual(posle);
  });
});

// ── 14–15. pozivnice ─────────────────────────────────────────────────────────

describe("pozivnice", () => {
  const pozovi = (s: Svet, email: string, uloga?: Doc<"members">["role"]) =>
    kao(s, s.boban).mutation(api.invitesStore.createInvite, {
      workspaceId: s.wsB,
      email,
      ...(uloga !== undefined ? { uloga } : {}),
    });

  const clanstvaU = (s: Svet, userId: Id<"users">, workspaceId: Id<"workspaces">) =>
    s.t.run(async (ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) => q.eq("userId", userId).eq("workspaceId", workspaceId))
        .collect(),
    );

  const pozivniceZa = (s: Svet, email: string) =>
    s.t.run(async (ctx) =>
      ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect(),
    );

  test("createInvite ne briše potvrđen nalog bez članstva (uklonjen član), pozivnica nastaje", async () => {
    const s = await napraviSvet();
    const { bivsi, nalog } = await s.t.run(async (ctx) => {
      const bivsi = await ctx.db.insert("users", {
        email: "bivsi@klijent.test",
        emailVerificationTime: 1_700_000_000_000,
      });
      const nalog = await ctx.db.insert("authAccounts", {
        userId: bivsi,
        provider: "password",
        providerAccountId: "bivsi@klijent.test",
      });
      return { bivsi, nalog };
    });

    const pozivnica = await pozovi(s, " Bivsi@Klijent.test ");

    expect(pozivnica.email).toBe("bivsi@klijent.test");
    expect(await s.t.run(async (ctx) => await ctx.db.get(bivsi))).toMatchObject({
      email: "bivsi@klijent.test",
      emailVerificationTime: 1_700_000_000_000,
    });
    // Ni njegov login zapis nije obrisan.
    expect(await s.t.run(async (ctx) => await ctx.db.get(nalog))).not.toBeNull();
    expect(await pozivniceZa(s, "bivsi@klijent.test")).toHaveLength(1);
  });

  test("kontrola: nepotvrđen nalog bez članstva (zaglavljena registracija) se briše sa login zapisima", async () => {
    const s = await napraviSvet();
    const { zaglavljen, nalog } = await s.t.run(async (ctx) => {
      const zaglavljen = await ctx.db.insert("users", { email: "zaglavljen@klijent.test" });
      const nalog = await ctx.db.insert("authAccounts", {
        userId: zaglavljen,
        provider: "password",
        providerAccountId: "zaglavljen@klijent.test",
      });
      return { zaglavljen, nalog };
    });

    await pozovi(s, "zaglavljen@klijent.test");

    expect(await s.t.run(async (ctx) => await ctx.db.get(zaglavljen))).toBeNull();
    expect(await s.t.run(async (ctx) => await ctx.db.get(nalog))).toBeNull();
    expect(await pozivniceZa(s, "zaglavljen@klijent.test")).toHaveLength(1);
  });

  test("consumeOpenInvite ne učlanjuje postojećeg člana; pozivnicu on prihvata sam posle prijave", async () => {
    const s = await napraviSvet();
    // Boban poziva Anu (već vlasnicu A) u B i otvara prozor pozivnice.
    const { token } = await pozovi(s, "ana@enigma.test");
    await s.t.mutation(api.invitesStore.pripremiRegistraciju, { token });
    expect((await pozivniceZa(s, "ana@enigma.test"))[0].readyUntil).toBeGreaterThan(Date.now());

    // Obična prijava Ane, dok je prozor otvoren.
    await s.t.run(async (ctx) => {
      await consumeOpenInvite(ctx.db, s.ana, "ana@enigma.test");
    });

    expect(await clanstvaU(s, s.ana, s.wsB)).toEqual([]);
    const neiskoriscena = (await pozivniceZa(s, "ana@enigma.test"))[0];
    expect(neiskoriscena.usedAt).toBeUndefined();
    expect(neiskoriscena.usedByUserId).toBeUndefined();
    // Njeno članstvo u A je kakvo je bilo.
    expect((await clanstvaU(s, s.ana, s.wsA)).map((c) => c.role)).toEqual(["owner"]);

    // Sama prihvata posle prijave.
    expect(await kao(s, s.ana).mutation(api.invitesStore.prihvatiPozivnicu, { token })).toEqual({
      slug: "scanme",
    });
    expect((await clanstvaU(s, s.ana, s.wsB)).map((c) => c.role)).toEqual(["urednik"]);
    const iskoriscena = (await pozivniceZa(s, "ana@enigma.test"))[0];
    expect(iskoriscena.usedAt).toBeTypeOf("number");
    expect(iskoriscena.usedByUserId).toBe(s.ana);
  });

  test("kontrola: nov nalog bez ijednog članstva dobija članstvo iz pozivnice pri prvoj sesiji", async () => {
    const s = await napraviSvet();
    const nova = await s.t.run(async (ctx) => ctx.db.insert("users", { email: "nova@klijent.test" }));
    const { token } = await pozovi(s, "nova@klijent.test", "client_viewer");
    await s.t.mutation(api.invitesStore.pripremiRegistraciju, { token });

    await s.t.run(async (ctx) => {
      await consumeOpenInvite(ctx.db, nova, "nova@klijent.test");
    });

    expect((await clanstvaU(s, nova, s.wsB)).map((c) => c.role)).toEqual(["client_viewer"]);
    const pozivnica = (await pozivniceZa(s, "nova@klijent.test"))[0];
    expect(pozivnica.usedAt).toBeTypeOf("number");
    expect(pozivnica.usedByUserId).toBe(nova);
  });
});

// ── 16. osvežavanje novosti ──────────────────────────────────────────────────

describe("http.revalidatePost ne šalje tajnu na adresu van sajtova projekta", () => {
  const ADRESA = "https://scanme.example/api/revalidate";
  const TAJNA = "tajna-za-osvezavanje-1234567890";

  beforeEach(() => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("NOVOSTI_REVALIDATE_URL", undefined);
    vi.stubEnv("NOVOSTI_REVALIDATE_SECRET", undefined);
    vi.stubEnv("TRACKED_DOMAINS", undefined);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  /** Adresa i tajna su upisane dok je sajt bio projektov; posle toga se sajtovi menjaju. */
  async function podesi(s: Svet, sajtoviPosle: string[]) {
    const boban = kao(s, s.boban);
    await boban.mutation(api.podesavanjaStore.sacuvajSajtove, {
      workspaceId: s.wsB,
      sajtovi: ["scanme.example"],
    });
    await boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsB,
      novostiRevalidateUrl: ADRESA,
    });
    await boban.mutation(api.podesavanjaStore.postaviTajnu, {
      workspaceId: s.wsB,
      kljuc: "novosti_revalidate_secret",
      vrednost: TAJNA,
    });
    await boban.mutation(api.podesavanjaStore.sacuvajSajtove, {
      workspaceId: s.wsB,
      sajtovi: sajtoviPosle,
    });
  }

  const osvezi = (s: Svet, workspaceId: Id<"workspaces">) =>
    s.t.action(internal.http.revalidatePost, { workspaceId, slug: "x" });

  test("sajt uklonjen posle upisa adrese: tajna ne ide nigde", async () => {
    const s = await napraviSvet();
    await podesi(s, []);

    await osvezi(s, s.wsB);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("više nije na sajtovima projekta"),
    );
  });

  test("sajt zamenjen drugim: adresa koja nije na sajtovima projekta ne dobija tajnu", async () => {
    const s = await napraviSvet();
    await podesi(s, ["drugi.example"]);

    await osvezi(s, s.wsB);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("kontrola: adresa na sajtu projekta dobija poziv bez praćenja preusmerenja", async () => {
    const s = await napraviSvet();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await podesi(s, ["scanme.example"]);

    await osvezi(s, s.wsB);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ADRESA);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("manual");
    expect(init?.headers).toMatchObject({ "x-revalidate-secret": TAJNA });
    expect(JSON.parse(String(init?.body))).toEqual({ path: "/novosti/x" });
    // Tajna ide samo u zaglavlje.
    expect(url).not.toContain(TAJNA);
  });

  test("osnivački projekat sa env vrednostima i dalje šalje, a B bez svojih ne dobija ništa", async () => {
    const s = await napraviSvet();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    vi.stubEnv("NOVOSTI_REVALIDATE_URL", "https://enigmait.example/api/revalidate");
    vi.stubEnv("NOVOSTI_REVALIDATE_SECRET", "env-tajna-za-osvezavanje-123");

    await osvezi(s, s.wsB);
    expect(fetchMock).not.toHaveBeenCalled();

    await osvezi(s, s.wsA);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://enigmait.example/api/revalidate");
    expect(init?.redirect).toBe("manual");
    expect(init?.headers).toMatchObject({ "x-revalidate-secret": "env-tajna-za-osvezavanje-123" });
  });
});
