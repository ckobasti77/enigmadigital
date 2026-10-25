/// <reference types="vite/client" />
/**
 * C17 — `POST /projekti/lead`: forma na sajtu projekta šalje upit tokenom
 * namene „sajt“. Projekat se zna samo iz tokena, izvor zahteva mora biti sajt
 * projekta, a CAPI „Lead“ nastaje samo uz saglasnost, bez zabrane i kad
 * projekat ima i piksel i CAPI token. Obrada upita (firma, odbacivanje) i
 * zvono su na kraju.
 *
 * Svet: A = „Enigma IT“ (sajt enigmait.rs, osnivački), B = „ScanMe“ (scanme.rs).
 * Vreme je zaleđeno (`useFakeTimers`): zakazano slanje na Meta ne sme da se
 * izvrši usred testa, a `fetch` je lažan i nikad ne treba da bude pozvan.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/metaAudienceHash";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const PIKSEL = "3333333333333";
const CAPI_TOKEN = "scanme-capi-token-0987654321xyz";
const HEX64 = /^[0-9a-f]{64}$/;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "ab".repeat(32));
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ── pomoćne ──────────────────────────────────────────────────────────────────

type Opcije = {
  origin?: string;
  zaglavlja?: Record<string, string>;
  /** `null` = bez Content-Type zaglavlja. */
  tip?: string | null;
  /** Sirovo telo umesto `JSON.stringify(telo)`. */
  sirovo?: string;
};

function posalji(s: Svet, token: string | null, telo: unknown, o: Opcije = {}) {
  const zaglavlja: Record<string, string> = {};
  if (o.tip !== null) zaglavlja["content-type"] = o.tip ?? "application/json";
  if (token) zaglavlja.authorization = `Bearer ${token}`;
  if (o.origin) zaglavlja.origin = o.origin;
  Object.assign(zaglavlja, o.zaglavlja);
  return s.t.fetch("/projekti/lead", {
    method: "POST",
    headers: zaglavlja,
    body: o.sirovo ?? JSON.stringify(telo),
  });
}

async function noviToken(
  s: Svet,
  ko: Id<"users">,
  workspaceId: Id<"workspaces">,
  namena?: "uvoz" | "sajt",
): Promise<string> {
  const { token } = await kao(s, ko).mutation(api.ingestTokensStore.createIngestToken, {
    workspaceId,
    naziv: `test-${namena ?? "bez-namene"}`,
    ...(namena ? { namena } : {}),
  });
  return token;
}

/** Token iz vremena pre C17: u redu nema polja `namena`. */
async function stariToken(s: Svet, workspaceId: Id<"workspaces">): Promise<string> {
  const token = "stari-token-bez-namene-1234567890";
  const tokenHash = await sha256Hex(token);
  await s.t.run(async (ctx) => {
    await ctx.db.insert("ingestTokens", {
      workspaceId,
      tokenHash,
      naziv: "stari",
      createdBy: s.boban,
      createdAt: Date.now(),
    });
  });
  return token;
}

/** Svet sa sajtovima projekata i po jednim tokenom „sajt“ za A i B. */
async function postavi() {
  const s = await napraviSvet();
  await kao(s, s.ana).mutation(api.podesavanjaStore.sacuvajSajtove, {
    workspaceId: s.wsA,
    sajtovi: ["enigmait.rs"],
  });
  await kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajSajtove, {
    workspaceId: s.wsB,
    sajtovi: ["scanme.rs"],
  });
  const tokenA = await noviToken(s, s.ana, s.wsA, "sajt");
  const tokenB = await noviToken(s, s.boban, s.wsB, "sajt");
  return { s, tokenA, tokenB };
}

/** ScanMe sa svojim pikselom i CAPI tokenom. */
async function podesiCapiB(s: Svet) {
  await kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
    workspaceId: s.wsB,
    pikselId: PIKSEL,
  });
  await kao(s, s.boban).mutation(api.podesavanjaStore.postaviTajnu, {
    workspaceId: s.wsB,
    kljuc: "meta_capi_token",
    vrednost: CAPI_TOKEN,
  });
}

const upiti = (s: Svet, workspaceId: Id<"workspaces">) =>
  s.t.run(async (ctx) =>
    ctx.db
      .query("leadInbound")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect(),
  );

const capiRedovi = (s: Svet, workspaceId: Id<"workspaces">) =>
  s.t.run(async (ctx) =>
    ctx.db
      .query("capiEvents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect(),
  );

const red = (s: Svet, id: Id<"leadInbound">) => s.t.run(async (ctx) => await ctx.db.get(id));

/** Upit koji mora da prođe; vraća id reda. */
async function primi(s: Svet, token: string, telo: unknown, o: Opcije = {}): Promise<Id<"leadInbound">> {
  const r = await posalji(s, token, telo, o);
  expect(r.status).toBe(200);
  return ((await r.json()) as { id: Id<"leadInbound"> }).id;
}

const cors = (r: Response) => r.headers.get("access-control-allow-origin");

// ── token određuje projekat ──────────────────────────────────────────────────

describe("token određuje projekat", () => {
  test("tuđi token ne upisuje u projekat: svaki token piše samo u svoj", async () => {
    const { s, tokenA, tokenB } = await postavi();

    const b = await posalji(s, tokenB, { email: "a@firma.rs", eventId: "b-lead-0001" });
    expect(b.status).toBe(200);
    expect(await b.json()).toMatchObject({ ok: true, duplikat: false });
    expect(await upiti(s, s.wsB)).toHaveLength(1);
    expect(await upiti(s, s.wsA)).toHaveLength(0);

    await primi(s, tokenA, { email: "b@firma.rs", eventId: "a-lead-0001" });
    expect(await upiti(s, s.wsA)).toHaveLength(1);
    expect(await upiti(s, s.wsB)).toHaveLength(1);

    // Red pamti token kojim je stigao, a token pamti poslednju upotrebu.
    const tokeniB = await kao(s, s.boban).query(api.ingestTokensStore.listIngestTokens, { workspaceId: s.wsB });
    expect((await upiti(s, s.wsB))[0].ingestTokenId).toBe(tokeniB[0]._id);
    expect(tokeniB[0].lastUsedAt).not.toBeNull();
  });

  test("telo ne može da izabere drugi projekat", async () => {
    const { s, tokenB } = await postavi();
    const r = await posalji(s, tokenB, { email: "a@firma.rs", workspaceId: s.wsA });
    expect(r.status).toBe(422);
    expect(await upiti(s, s.wsA)).toHaveLength(0);
    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });

  test("nema tokena, lažan i opozvan token: isti 401, bez upisa", async () => {
    const { s, tokenB } = await postavi();
    const telo = { email: "a@firma.rs" };

    const bez = await posalji(s, null, telo);
    const lazan = await posalji(s, "lazan-token", telo);
    const sBearer = await s.t.fetch("/projekti/lead", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Basic abc" },
      body: JSON.stringify(telo),
    });
    expect([bez.status, lazan.status, sBearer.status]).toEqual([401, 401, 401]);
    const telaOdgovora = [await bez.json(), await lazan.json(), await sBearer.json()];
    expect(telaOdgovora[1]).toEqual(telaOdgovora[0]);
    expect(telaOdgovora[2]).toEqual(telaOdgovora[0]);

    const tokeni = await kao(s, s.boban).query(api.ingestTokensStore.listIngestTokens, { workspaceId: s.wsB });
    await kao(s, s.boban).mutation(api.ingestTokensStore.revokeIngestToken, {
      workspaceId: s.wsB,
      tokenId: tokeni[0]._id,
    });
    const opozvan = await posalji(s, tokenB, telo);
    expect(opozvan.status).toBe(401);
    expect(await opozvan.json()).toEqual(telaOdgovora[0]);

    expect(await upiti(s, s.wsA)).toHaveLength(0);
    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });
});

describe("namena tokena", () => {
  test("token „uvoz“, token bez namene i stari token bez polja: 403 na /projekti/lead", async () => {
    const { s } = await postavi();
    const uvoz = await noviToken(s, s.boban, s.wsB, "uvoz");
    const bezNamene = await noviToken(s, s.boban, s.wsB);
    const stari = await stariToken(s, s.wsB);

    for (const token of [uvoz, bezNamene, stari]) {
      const r = await posalji(s, token, { email: "a@firma.rs" });
      expect(r.status).toBe(403);
    }
    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });

  test("token „sajt“ ne otvara uvoz, snimke ni mozak projekta", async () => {
    const { s, tokenB } = await postavi();
    const auth = { authorization: `Bearer ${tokenB}` };

    const ingest = await s.t.fetch("/generate-leads/ingest", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: "{}",
    });
    expect(ingest.status).toBe(403);

    const snimak = await s.t.fetch("/generate-leads/snimak", {
      method: "POST",
      headers: { ...auth, "content-type": "image/png" },
      body: "x",
    });
    expect(snimak.status).toBe(403);

    const mozak = await s.t.fetch("/projekti/mozak", { method: "GET", headers: auth });
    expect(mozak.status).toBe(403);

    // Kontrola: token „uvoz“ istog projekta čita mozak.
    const uvoz = await noviToken(s, s.boban, s.wsB, "uvoz");
    const procitano = await s.t.fetch("/projekti/mozak", {
      method: "GET",
      headers: { authorization: `Bearer ${uvoz}` },
    });
    expect(procitano.status).toBe(200);
  });
});

// ── izvor zahteva ────────────────────────────────────────────────────────────

describe("Origin i CORS", () => {
  test("strani origin: 403, bez upisa i bez CORS zaglavlja", async () => {
    const { s, tokenB } = await postavi();
    const r = await posalji(s, tokenB, { email: "a@firma.rs" }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
    expect(cors(r)).toBeNull();
    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });

  test("origin sa sajta drugog projekta, http, podsajt i „null“ nisu dozvoljeni", async () => {
    const { s, tokenB } = await postavi();
    for (const origin of [
      "https://enigmait.rs",
      "http://scanme.rs",
      "https://app.scanme.rs",
      "https://scanme.rs.evil.example",
      "null",
    ]) {
      const r = await posalji(s, tokenB, { email: "a@firma.rs" }, { origin });
      expect(r.status, origin).toBe(403);
      expect(cors(r), origin).toBeNull();
    }
    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });

  test("origin sa sajta projekta: 200 sa CORS zaglavljima; bez Origin: 200 bez njih", async () => {
    const { s, tokenB } = await postavi();

    const sWww = await posalji(s, tokenB, { email: "a@firma.rs", eventId: "cors-www-0001" }, { origin: "https://www.scanme.rs" });
    expect(sWww.status).toBe(200);
    expect(cors(sWww)).toBe("https://www.scanme.rs");
    expect(sWww.headers.get("vary")).toBe("Origin");

    const bezWww = await posalji(s, tokenB, { email: "b@firma.rs", eventId: "cors-bez-0001" }, { origin: "https://scanme.rs" });
    expect(bezWww.status).toBe(200);
    expect(cors(bezWww)).toBe("https://scanme.rs");

    const server = await posalji(s, tokenB, { email: "c@firma.rs", eventId: "cors-srv-0001" });
    expect(server.status).toBe(200);
    expect(cors(server)).toBeNull();

    expect(await upiti(s, s.wsB)).toHaveLength(3);
  });

  test("OPTIONS sa https origin-om: 204 i CORS zaglavlja", async () => {
    const { s } = await postavi();
    const r = await s.t.fetch("/projekti/lead", { method: "OPTIONS", headers: { origin: "https://scanme.rs" } });
    expect(r.status).toBe(204);
    expect(cors(r)).toBe("https://scanme.rs");
    expect(r.headers.get("vary")).toBe("Origin");
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
    const dozvoljenaZaglavlja = r.headers.get("access-control-allow-headers") ?? "";
    expect(dozvoljenaZaglavlja).toContain("Authorization");
    expect(dozvoljenaZaglavlja).toContain("Content-Type");
    expect(r.headers.get("access-control-max-age")).toBe("600");
  });

  test("OPTIONS sa http origin-om ili bez njega: 204 bez CORS zaglavlja", async () => {
    const { s } = await postavi();
    const http = await s.t.fetch("/projekti/lead", { method: "OPTIONS", headers: { origin: "http://scanme.rs" } });
    expect(http.status).toBe(204);
    expect(cors(http)).toBeNull();
    expect(http.headers.get("access-control-allow-methods")).toBeNull();

    const bez = await s.t.fetch("/projekti/lead", { method: "OPTIONS" });
    expect(bez.status).toBe(204);
    expect(cors(bez)).toBeNull();
  });

  test("preflight ne zna projekat (nema tokena), pa pravo pravilo je tek na POST-u", async () => {
    const { s, tokenB } = await postavi();
    const pre = await s.t.fetch("/projekti/lead", { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    expect(pre.status).toBe(204);
    expect(cors(pre)).toBe("https://evil.example");

    const post = await posalji(s, tokenB, { email: "a@firma.rs" }, { origin: "https://evil.example" });
    expect(post.status).toBe(403);
    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });
});

// ── oblik zahteva ────────────────────────────────────────────────────────────

describe("oblik zahteva", () => {
  test("Content-Type koji nije JSON: 415, pre provere tokena", async () => {
    const { s, tokenB } = await postavi();
    const r = await posalji(s, tokenB, null, { tip: "text/plain", sirovo: '{"email":"a@firma.rs"}' });
    expect(r.status).toBe(415);
    const bezTokena = await posalji(s, null, null, { tip: "text/plain", sirovo: "{}" });
    expect(bezTokena.status).toBe(415);
    const bezTipa = await posalji(s, tokenB, null, { tip: null, sirovo: '{"email":"a@firma.rs"}' });
    expect(bezTipa.status).toBe(415);
    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });

  test("telo preko 16384 bajtova: 413, pre provere tokena", async () => {
    const { s, tokenB } = await postavi();
    const veliko = JSON.stringify({ email: "a@firma.rs", poruka: "x".repeat(17_000) });
    expect(veliko.length).toBeGreaterThan(16_384);
    expect((await posalji(s, tokenB, null, { sirovo: veliko })).status).toBe(413);
    expect((await posalji(s, null, null, { sirovo: veliko })).status).toBe(413);

    // Računaju se bajtovi, ne znakovi: 9000 × „š“ je 18000 bajtova.
    const dvobajtno = JSON.stringify({ email: "a@firma.rs", poruka: "š".repeat(9_000) });
    expect(dvobajtno.length).toBeLessThan(16_384);
    expect((await posalji(s, tokenB, null, { sirovo: dvobajtno })).status).toBe(413);

    // Najavljena veličina u Content-Length odbija telo i pre čitanja.
    const najavljeno = await posalji(s, tokenB, { email: "a@firma.rs" }, { zaglavlja: { "content-length": "20000" } });
    expect(najavljeno.status).toBe(413);

    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });

  test("ni email ni telefon: 422 sa tačnom porukom", async () => {
    const { s, tokenB } = await postavi();
    const r = await posalji(s, tokenB, { ime: "Pera", poruka: "Zdravo" });
    expect(r.status).toBe(422);
    const telo = (await r.json()) as { greska: string; polja: string[] };
    expect(telo.greska).toBe("Treba email ili telefon.");
    expect(telo.polja.length).toBeGreaterThan(0);
    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });

  test("nepoznato polje, loš JSON i loša vrednost: 422, bez vrednosti u odgovoru", async () => {
    const { s, tokenB } = await postavi();

    const nepoznato = await posalji(s, tokenB, { email: "a@firma.rs", nepoznato: 1 });
    expect(nepoznato.status).toBe(422);
    // Odgovor kaže gde je problem, ne citira ime ni vrednost iz tela.
    expect(((await nepoznato.json()) as { polja: string[] }).polja).toEqual(["(koren tela): unrecognized_keys"]);

    const losJson = await posalji(s, tokenB, null, { sirovo: "{ nije json" });
    expect(losJson.status).toBe(422);

    const nizUmestoObjekta = await posalji(s, tokenB, ["a@firma.rs"]);
    expect(nizUmestoObjekta.status).toBe(422);

    const losMejl = await posalji(s, tokenB, { email: "tajni-posetilac@@firma" });
    expect(losMejl.status).toBe(422);
    expect(JSON.stringify(await losMejl.json())).not.toContain("tajni-posetilac");

    const http = await posalji(s, tokenB, { email: "a@firma.rs", stranica: "http://scanme.rs/" });
    expect(http.status).toBe(422);

    const losaIp = await posalji(s, tokenB, { email: "a@firma.rs", klijent: { ip: "abc" } });
    expect(losaIp.status).toBe(422);

    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });
});

// ── kape ─────────────────────────────────────────────────────────────────────

describe("kape po satu", () => {
  test("61. zahtev istim tokenom u satu: 429 sa Retry-After; drugi token projekta prolazi", async () => {
    const { s, tokenB } = await postavi();
    const drugi = await noviToken(s, s.boban, s.wsB, "sajt");

    for (let i = 0; i < 60; i++) {
      const r = await posalji(s, tokenB, { email: `posetilac${i}@firma.rs`, eventId: `kapa-${String(i).padStart(8, "0")}` });
      expect(r.status, `zahtev ${i + 1}`).toBe(200);
    }
    expect(await upiti(s, s.wsB)).toHaveLength(60);

    const preko = await posalji(
      s,
      tokenB,
      { email: "suvisan@firma.rs", eventId: "kapa-suvisan-1" },
      { origin: "https://scanme.rs" },
    );
    expect(preko.status).toBe(429);
    const sekundi = Number(preko.headers.get("retry-after"));
    expect(Number.isInteger(sekundi)).toBe(true);
    expect(sekundi).toBeGreaterThan(0);
    // Sat testa je zaleđen, a transakcija ima sat 1 ms ispred njega: 3601, ne 3600.
    expect(sekundi).toBeLessThanOrEqual(3601);
    // Browser mora da vidi i grešku, pa 429 nosi CORS.
    expect(cors(preko)).toBe("https://scanme.rs");
    expect(await upiti(s, s.wsB)).toHaveLength(60);

    const sused = await posalji(s, drugi, { email: "sused@firma.rs", eventId: "kapa-drugi-001" });
    expect(sused.status).toBe(200);
    // Kapa jednog projekta ne dira drugi.
    const tokenA = await noviToken(s, s.ana, s.wsA, "sajt");
    expect((await posalji(s, tokenA, { email: "a@firma.rs", eventId: "kapa-a-0001" })).status).toBe(200);
  });

  test("kapa po projektu (300/h) važi za sve tokene projekta", async () => {
    const { s, tokenB } = await postavi();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("publicRouteUsage", {
        workspaceId: s.wsB,
        route: "projekti-lead",
        windowStartedAt: Date.now(),
        count: 300,
      });
    });
    const r = await posalji(s, tokenB, { email: "a@firma.rs" });
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await upiti(s, s.wsB)).toHaveLength(0);
  });
});

// ── upis upita ───────────────────────────────────────────────────────────────

describe("upis u leadInbound", () => {
  test("red je „website“ / „forma“ sa kontaktom malim slovima i utm-om", async () => {
    const { s, tokenB } = await postavi();
    const id = await primi(s, tokenB, {
      ime: "Mika Mikić",
      email: "  Mika@Firma.RS ",
      telefon: "064 123 4567",
      firma: "Mika doo",
      poruka: "Treba mi QR meni",
      stranica: "https://scanme.rs/cene?paket=pro",
      utm: { source: "ig", medium: "bio", campaign: "jesen" },
      eventId: "lead-red-0001",
    });
    const r = await red(s, id);
    expect(r).toMatchObject({
      workspaceId: s.wsB,
      platform: "website",
      kind: "forma",
      status: "nov",
      externalId: "lead-red-0001",
      eventId: "lead-red-0001",
      text: "Treba mi QR meni",
      sourceUrl: "https://scanme.rs/cene?paket=pro",
      kontakt: { ime: "Mika Mikić", email: "mika@firma.rs", telefon: "064 123 4567", firma: "Mika doo" },
      utm: { source: "ig", medium: "bio", campaign: "jesen" },
    });
    expect(r?.authorPlatformId).toMatch(HEX64);
  });

  test("prazna polja se ne upisuju", async () => {
    const { s, tokenB } = await postavi();
    const id = await primi(s, tokenB, { email: "a@firma.rs", poruka: "", utm: { source: "" } });
    const r = await red(s, id);
    expect(r?.text).toBeUndefined();
    expect(r?.utm).toBeUndefined();
    expect(r?.kontakt).toEqual({ email: "a@firma.rs" });
  });

  test("stranica na tuđem sajtu se ne pamti, a upit se prima", async () => {
    const { s, tokenB } = await postavi();
    await podesiCapiB(s);
    const id = await primi(s, tokenB, {
      email: "a@firma.rs",
      stranica: "https://evil.example/scanme.rs",
      saglasnost: { marketing: true },
    });
    expect((await red(s, id))?.sourceUrl).toBeUndefined();
    const capi = await capiRedovi(s, s.wsB);
    expect(capi).toHaveLength(1);
    expect(capi[0].eventSourceUrl).toBeUndefined();
  });

  test("isti eventId je isti upit; bez eventId isti sadržaj u istom minutu je isti upit", async () => {
    const { s, tokenB } = await postavi();

    const prvi = await primi(s, tokenB, { email: "a@firma.rs", eventId: "dupli-0001" });
    const drugiOdgovor = await posalji(s, tokenB, { email: "a@firma.rs", eventId: "dupli-0001" });
    expect(await drugiOdgovor.json()).toMatchObject({ ok: true, id: prvi, duplikat: true });

    const bez1 = await primi(s, tokenB, { email: "b@firma.rs", poruka: "Zdravo" });
    const bez2 = await posalji(s, tokenB, { email: "b@firma.rs", poruka: "Zdravo" });
    expect(await bez2.json()).toMatchObject({ id: bez1, duplikat: true });

    expect(await upiti(s, s.wsB)).toHaveLength(2);
  });
});

// ── CAPI ─────────────────────────────────────────────────────────────────────

describe("CAPI „Lead“", () => {
  test("dupli eventId ne pravi drugi CAPI događaj", async () => {
    const { s, tokenB } = await postavi();
    await podesiCapiB(s);
    const telo = { email: "mika@firma.rs", eventId: "lead-capi-dup1", saglasnost: { marketing: true } };

    const prvi = await posalji(s, tokenB, telo);
    const drugi = await posalji(s, tokenB, telo);
    const p = (await prvi.json()) as { id: string; duplikat: boolean };
    const d = (await drugi.json()) as { id: string; duplikat: boolean };
    expect(p.duplikat).toBe(false);
    expect(d.duplikat).toBe(true);
    expect(d.id).toBe(p.id);

    expect(await upiti(s, s.wsB)).toHaveLength(1);
    const capi = await capiRedovi(s, s.wsB);
    expect(capi).toHaveLength(1);
    expect(capi[0]).toMatchObject({
      eventName: "Lead",
      sourceKind: "website_lead",
      actionSource: "website",
      eventId: "lead-capi-dup1",
      status: "pending",
    });
  });

  test("bez eventId događaj dobija ključ iz upita, pa ni tu nema duplog slanja", async () => {
    const { s, tokenB } = await postavi();
    await podesiCapiB(s);
    const telo = { email: "mika@firma.rs", poruka: "Zdravo", saglasnost: { marketing: true } };
    const id = await primi(s, tokenB, telo);
    await posalji(s, tokenB, telo);
    const capi = await capiRedovi(s, s.wsB);
    expect(capi).toHaveLength(1);
    expect(capi[0].eventId).toBe(`web_${id}`);
  });

  test("događaj nosi stranicu i heševe; IP ide samo u CAPI red, nikad u leadInbound", async () => {
    const { s, tokenB } = await postavi();
    await podesiCapiB(s);
    const stranica = "https://scanme.rs/cene?paket=pro";
    const id = await primi(
      s,
      tokenB,
      {
        ime: "Mika Mikić",
        email: "  Mika@Firma.RS ",
        telefon: "064 123 4567",
        stranica,
        eventId: "lead-capi-0001",
        saglasnost: { marketing: true },
      },
      {
        origin: "https://www.scanme.rs",
        zaglavlja: { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Mozilla/5.0 (test)" },
      },
    );

    const capi = await capiRedovi(s, s.wsB);
    expect(capi).toHaveLength(1);
    const c = capi[0];
    expect(c.eventSourceUrl).toBe(stranica);
    expect(c.hashedEmail).toMatch(HEX64);
    expect(c.hashedPhone).toMatch(HEX64);
    expect(c.hashedEmail).toBe(await sha256Hex("mika@firma.rs"));
    expect(c.hashedPhone).toBe(await sha256Hex("381641234567"));
    expect(c.clientIpAddress).toBe("203.0.113.7");
    expect(c.clientUserAgent).toBe("Mozilla/5.0 (test)");

    const upis = JSON.stringify(await red(s, id));
    expect(upis).not.toContain("203.0.113.7");
    expect(upis).not.toContain("Mozilla");
    // Lead ne zove Meta sinhrono.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("poziv sa servera: podaci posetioca iz tela, IP iz zahteva se ne uzima", async () => {
    const { s, tokenB } = await postavi();
    await podesiCapiB(s);

    const izTela = await primi(
      s,
      tokenB,
      {
        email: "a@firma.rs",
        eventId: "lead-srv-0001",
        saglasnost: { marketing: true },
        klijent: { ip: "198.51.100.9", userAgent: "Posetilac/1.0", fbp: "fb.1.1.2", fbc: "fb.1.1.abc" },
      },
      { zaglavlja: { "x-forwarded-for": "10.9.9.9" } },
    );
    await primi(
      s,
      tokenB,
      { email: "b@firma.rs", eventId: "lead-srv-0002", saglasnost: { marketing: true } },
      { zaglavlja: { "x-forwarded-for": "10.9.9.9" } },
    );

    const capi = await capiRedovi(s, s.wsB);
    const prvi = capi.find((c) => c.eventId === "lead-srv-0001");
    const drugi = capi.find((c) => c.eventId === "lead-srv-0002");
    expect(prvi).toMatchObject({
      clientIpAddress: "198.51.100.9",
      clientUserAgent: "Posetilac/1.0",
      fbp: "fb.1.1.2",
      fbc: "fb.1.1.abc",
    });
    // Zahtev bez Origin-a je server ScanMe-a, ne posetilac: njegova IP nije podatak o posetiocu.
    expect(drugi?.clientIpAddress).toBeUndefined();
    expect(drugi?.hashedEmail).toMatch(HEX64);
    expect(JSON.stringify(await red(s, izTela))).not.toContain("198.51.100.9");
  });

  test("bez saglasnosti (nema je ili je marketing:false) upit se čuva, CAPI ne nastaje", async () => {
    const { s, tokenB } = await postavi();
    await podesiCapiB(s);
    await primi(s, tokenB, { email: "a@firma.rs", eventId: "bez-sagl-0001" });
    await primi(s, tokenB, { email: "b@firma.rs", eventId: "bez-sagl-0002", saglasnost: { marketing: false } });
    expect(await upiti(s, s.wsB)).toHaveLength(2);
    expect(await capiRedovi(s, s.wsB)).toHaveLength(0);
  });

  test("kontakt sa liste zabrane: upit je „zabranjen_kontakt“, CAPI ne nastaje", async () => {
    const { s, tokenB } = await postavi();
    await podesiCapiB(s);
    const boban = kao(s, s.boban);
    const zabrani = (matchOn: "email" | "phone" | "domain", value: string) =>
      boban.mutation(api.leadSuppressionStore.addSuppression, {
        workspaceId: s.wsB,
        kind: "rekao_ne",
        matchOn,
        value,
      });
    await zabrani("email", "ne@firma.rs");
    await zabrani("phone", "064 999 8888");
    await zabrani("domain", "zabranjena-firma.rs");
    // Besplatni domen na listi ne sme da zabrani svakog sa tog domena.
    await zabrani("domain", "gmail.com");

    const saglasnost = { marketing: true };
    const poEmailu = await primi(s, tokenB, { email: "NE@firma.rs", eventId: "zabr-mejl-001", saglasnost });
    const poTelefonu = await primi(s, tokenB, { telefon: "+381 64 999 8888", eventId: "zabr-tel-0001", saglasnost });
    const poDomenu = await primi(s, tokenB, { email: "neko@zabranjena-firma.rs", eventId: "zabr-dom-0001", saglasnost });
    expect((await red(s, poEmailu))?.status).toBe("zabranjen_kontakt");
    expect((await red(s, poTelefonu))?.status).toBe("zabranjen_kontakt");
    expect((await red(s, poDomenu))?.status).toBe("zabranjen_kontakt");
    expect(await capiRedovi(s, s.wsB)).toHaveLength(0);

    // Dozvoljen kontakt na gmail.com prolazi i ide u CAPI.
    const gmail = await primi(s, tokenB, { email: "neko@gmail.com", eventId: "zabr-gmail-001", saglasnost });
    expect((await red(s, gmail))?.status).toBe("nov");
    expect(await capiRedovi(s, s.wsB)).toHaveLength(1);
  });

  test("projekat bez piksela ili bez CAPI tokena: upit se čuva, CAPI ne nastaje", async () => {
    const { s, tokenB } = await postavi();
    const saglasnost = { marketing: true };

    await primi(s, tokenB, { email: "a@firma.rs", eventId: "bez-pik-0001", saglasnost });
    expect(await capiRedovi(s, s.wsB)).toHaveLength(0);

    // Samo piksel nije dovoljan.
    await kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsB,
      pikselId: PIKSEL,
    });
    await primi(s, tokenB, { email: "b@firma.rs", eventId: "bez-pik-0002", saglasnost });
    expect(await capiRedovi(s, s.wsB)).toHaveLength(0);

    // Piksel i token: sledeći upit ide u CAPI.
    await kao(s, s.boban).mutation(api.podesavanjaStore.postaviTajnu, {
      workspaceId: s.wsB,
      kljuc: "meta_capi_token",
      vrednost: CAPI_TOKEN,
    });
    await primi(s, tokenB, { email: "c@firma.rs", eventId: "bez-pik-0003", saglasnost });
    expect(await upiti(s, s.wsB)).toHaveLength(3);
    expect(await capiRedovi(s, s.wsB)).toHaveLength(1);
  });

  test("samo osnivački projekat nasleđuje piksel i token iz env-a", async () => {
    const { s, tokenA, tokenB } = await postavi();
    vi.stubEnv("META_PIXEL_ID", "1111111111111");
    vi.stubEnv("META_CAPI_TOKEN", "enigma-capi-token-1234567890abc");
    const saglasnost = { marketing: true };

    await primi(s, tokenB, { email: "a@firma.rs", eventId: "env-b-000001", saglasnost });
    await primi(s, tokenA, { email: "b@firma.rs", eventId: "env-a-000001", saglasnost });

    expect(await capiRedovi(s, s.wsB)).toHaveLength(0);
    const capiA = await capiRedovi(s, s.wsA);
    expect(capiA).toHaveLength(1);
    expect(capiA[0].eventId).toBe("env-a-000001");
  });
});

// ── obrada upita u projektu ──────────────────────────────────────────────────

describe("upit postaje firma", () => {
  const podaci = {
    ime: "Pera Perić",
    email: "Pera@Firma.rs",
    telefon: "064 111 2222",
    firma: "Pera doo",
    poruka: "Koliko košta sajt?",
    stranica: "https://enigmait.rs/kontakt",
  };

  test("urednik pravi firmu, osobu i kontakte sa osnovom „data_subject_request“", async () => {
    const { s, tokenA } = await postavi();
    const id = await primi(s, tokenA, { ...podaci, eventId: "firma-0000001" });

    const { companyId } = await kao(s, s.urednica).mutation(api.leadInboundStore.napraviFirmuIzUpita, {
      workspaceId: s.wsA,
      inboundId: id,
    });

    const stanje = await s.t.run(async (ctx) => ({
      firma: await ctx.db.get(companyId),
      osobe: (await ctx.db.query("leadPeople").collect()).filter((o) => o.companyId === companyId),
      identiteti: (await ctx.db.query("leadIdentities").collect()).filter((i) => i.companyId === companyId),
      signali: (await ctx.db.query("leadSignals").collect()).filter((x) => x.companyId === companyId),
    }));
    expect(stanje.firma).toMatchObject({ workspaceId: s.wsA, name: "Pera doo", origin: "inbound" });
    expect(stanje.osobe.map((o) => o.name)).toEqual(["Pera Perić"]);
    expect(stanje.identiteti.map((i) => i.kind).sort()).toEqual(["email", "phone"]);
    for (const i of stanje.identiteti) {
      expect(i.lawfulBasis).toBe("data_subject_request");
      expect(i.sourceUrl).toBe("https://enigmait.rs/kontakt");
      expect(i.workspaceId).toBe(s.wsA);
    }
    expect(stanje.identiteti.find((i) => i.kind === "email")?.valueNormalized).toBe("pera@firma.rs");
    expect(stanje.identiteti.find((i) => i.kind === "phone")?.valueNormalized).toBe("+381641112222");
    expect(stanje.signali.map((x) => x.kind)).toContain("pitao_cenu");

    expect(await red(s, id)).toMatchObject({ status: "povezan", linkedCompanyId: companyId });

    // Već obrađen upit se ne obrađuje ponovo.
    await odbijeno(
      kao(s, s.ana).mutation(api.leadInboundStore.napraviFirmuIzUpita, { workspaceId: s.wsA, inboundId: id }),
      "conflict",
    );
  });

  test("posmatrač, tuđi projekat i tuđi upit su odbijeni", async () => {
    const { s, tokenA } = await postavi();
    const id = await primi(s, tokenA, { ...podaci, eventId: "firma-0000002" });

    await odbijeno(
      kao(s, s.viewer).mutation(api.leadInboundStore.napraviFirmuIzUpita, { workspaceId: s.wsA, inboundId: id }),
      "forbidden",
    );
    // Vlasnik drugog projekta ne piše u A.
    await odbijeno(
      kao(s, s.boban).mutation(api.leadInboundStore.napraviFirmuIzUpita, { workspaceId: s.wsA, inboundId: id }),
      "forbidden",
    );
    // Upit A nije vidljiv iz B, ni članu oba projekta.
    await odbijeno(
      kao(s, s.jovan).mutation(api.leadInboundStore.napraviFirmuIzUpita, { workspaceId: s.wsB, inboundId: id }),
      "not_found",
    );

    expect((await red(s, id))?.status).toBe("nov");
    const firme = await s.t.run(async (ctx) => await ctx.db.query("leadCompanies").collect());
    expect(firme).toHaveLength(0);
  });

  test("bez firme i imena treba naziv; sa nazivom prolazi", async () => {
    const { s, tokenA } = await postavi();
    const id = await primi(s, tokenA, { email: "pekara@gmail.com", eventId: "firma-0000003" });
    const ana = kao(s, s.ana);

    await odbijeno(ana.mutation(api.leadInboundStore.napraviFirmuIzUpita, { workspaceId: s.wsA, inboundId: id }), "invalid");
    const { companyId } = await ana.mutation(api.leadInboundStore.napraviFirmuIzUpita, {
      workspaceId: s.wsA,
      inboundId: id,
      nazivFirme: "Pekara Đorđević",
    });
    const firma = await s.t.run(async (ctx) => await ctx.db.get(companyId));
    expect(firma?.name).toBe("Pekara Đorđević");
  });

  test("kontakt sa liste zabrane se ne pretvara u firmu, ni kad je zabrana dodata posle prijema", async () => {
    const { s, tokenA } = await postavi();
    const ana = kao(s, s.ana);
    const zabrani = (value: string) =>
      ana.mutation(api.leadSuppressionStore.addSuppression, {
        workspaceId: s.wsA,
        kind: "rekao_ne",
        matchOn: "email",
        value,
      });

    await zabrani("ranije@firma.rs");
    const ranije = await primi(s, tokenA, { ...podaci, email: "ranije@firma.rs", eventId: "firma-0000004" });
    expect((await red(s, ranije))?.status).toBe("zabranjen_kontakt");
    await odbijeno(ana.mutation(api.leadInboundStore.napraviFirmuIzUpita, { workspaceId: s.wsA, inboundId: ranije }), "forbidden");

    const kasnije = await primi(s, tokenA, { ...podaci, email: "kasnije@firma.rs", eventId: "firma-0000005" });
    expect((await red(s, kasnije))?.status).toBe("nov");
    await zabrani("kasnije@firma.rs");
    await odbijeno(ana.mutation(api.leadInboundStore.napraviFirmuIzUpita, { workspaceId: s.wsA, inboundId: kasnije }), "forbidden");

    const firme = await s.t.run(async (ctx) => await ctx.db.query("leadCompanies").collect());
    expect(firme).toHaveLength(0);
  });

  test("upit sa sajta se ne povezuje kroz društvene mreže: linkInboundToCompany odbija", async () => {
    const { s, tokenA } = await postavi();
    const id = await primi(s, tokenA, { ...podaci, eventId: "firma-0000006" });
    await odbijeno(
      kao(s, s.ana).mutation(api.leadInboundStore.linkInboundToCompany, {
        workspaceId: s.wsA,
        inboundId: id,
        newCompanyName: "Pera doo",
        identityValue: "pera@firma.rs",
        lawfulBasis: "legitimate_interest",
        sourceUrl: "https://enigmait.rs/kontakt",
      }),
      "invalid",
    );
    expect((await red(s, id))?.status).toBe("nov");
    const firme = await s.t.run(async (ctx) => await ctx.db.query("leadCompanies").collect());
    expect(firme).toHaveLength(0);
  });

  test("odbacivanje briše sirov kontakt i postavlja status „odbacen“", async () => {
    const { s, tokenA } = await postavi();
    const id = await primi(s, tokenA, { ...podaci, eventId: "firma-0000007" });
    expect((await red(s, id))?.kontakt).toMatchObject({ email: "pera@firma.rs" });

    await kao(s, s.urednica).mutation(api.leadInboundStore.dismissInbound, {
      workspaceId: s.wsA,
      inboundId: id,
      reason: "Nije kupac",
    });
    const r = await red(s, id);
    expect(r?.status).toBe("odbacen");
    expect(r?.kontakt).toBeUndefined();
    expect(r?.dismissReason).toBe("Nije kupac");
    expect(JSON.stringify(r)).not.toContain("pera@firma.rs");
  });
});

// ── zvono ────────────────────────────────────────────────────────────────────

describe("zvono „Šta me čeka“", () => {
  test("broji samo upite sa sajta koji čekaju, ne i komentare sa mreža", async () => {
    const { s, tokenA, tokenB } = await postavi();
    await primi(s, tokenB, { email: "a@firma.rs", eventId: "zvono-0000001" });
    await primi(s, tokenB, { email: "b@firma.rs", eventId: "zvono-0000002" });
    await s.t.run(async (ctx) => {
      await ctx.db.insert("leadInbound", {
        workspaceId: s.wsB,
        platform: "instagram",
        kind: "komentar",
        externalId: "ig-komentar-1",
        occurredAt: Date.now(),
        status: "nov",
        derivedSignals: [],
        createdAt: Date.now(),
      });
    });

    const boban = kao(s, s.boban);
    const zadatak = async () =>
      (await boban.query(api.notificationsStore.staMeCeka, { workspaceId: s.wsB })).zadaci.find(
        (z) => z.kljuc === "leadovi.upiti_sa_sajta",
      );

    expect(await zadatak()).toMatchObject({ broj: 2 });
    // Spisak upita sa sajta ne meša mreže.
    const saSajta = await boban.query(api.leadInboundStore.listInbound, { workspaceId: s.wsB, platform: "website" });
    expect(saSajta).toHaveLength(2);

    // Zabranjen i odbačen upit ne čekaju nikoga.
    await kao(s, s.boban).mutation(api.leadSuppressionStore.addSuppression, {
      workspaceId: s.wsB,
      kind: "rekao_ne",
      matchOn: "email",
      value: "zabranjen@firma.rs",
    });
    await primi(s, tokenB, { email: "zabranjen@firma.rs", eventId: "zvono-0000003" });
    expect(await zadatak()).toMatchObject({ broj: 2 });

    await boban.mutation(api.leadInboundStore.dismissInbound, {
      workspaceId: s.wsB,
      inboundId: saSajta[0]._id,
      reason: "Spam",
    });
    expect(await zadatak()).toMatchObject({ broj: 1 });

    // Upiti B ne ulaze u zvono projekta A.
    await primi(s, tokenA, { email: "c@firma.rs", eventId: "zvono-a-00001" });
    const ana = kao(s, s.ana);
    const zaA = (await ana.query(api.notificationsStore.staMeCeka, { workspaceId: s.wsA })).zadaci.find(
      (z) => z.kljuc === "leadovi.upiti_sa_sajta",
    );
    expect(zaA).toMatchObject({ broj: 1 });
  });
});
