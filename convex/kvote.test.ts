/// <reference types="vite/client" />
/**
 * Zajedničke kvote svih projekata (C13): YouTube Data API, Google Ads operacije
 * i Meta aplikacija (`lib/globalneKvote.ts`, `globalneKvoteStore.ts`,
 * `ytIngest.ts`, `metaSyncStore.ts`).
 *
 * Tri kvote pripadaju nalogu iza SVIH projekata, ne jednom projektu. Svaki
 * aktivan projekat ima zagarantovan deo bazena (`R = floor(Z / N)`), pozajmljuje
 * samo dok ne zadire u neiskorišćen deo ostalih, a zbir svih projekata nikad ne
 * sme preko plafona `Z`.
 *
 * Vreme je zamrznuto (13:00 po pacifičkom vremenu, 18. mart 2026): dan YouTube
 * brojača je pacifički, sat Google Ads brojača je UTC, pa test ne sme da zavisi
 * od toga kad se pokrene. Zamrznuti tajmeri drže i zakazane funkcije, tako da se
 * `ytReply.replyToComment` (poziv ka YouTube-u) nikad ne izvrši.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { RezultatRezervacije } from "./globalneKvoteStore";
import {
  dostupno,
  obnovaYoutube,
  pacifickiDan,
  plafonGoogleAds,
  plafonYoutube,
  smeDaPotrosi,
  utcSat,
  type UlazRezerve,
} from "./lib/globalneKvote";
import { BACKOFF_MIN_MS, USAGE_TTL_MS } from "./lib/metaRateLimit";
import { kao, napraviSvet, type Svet } from "./projekatTest.pomoc";

const SAT = 60 * 60 * 1000;
const DAN = 24 * SAT;

/** 20:00 UTC = 13:00 PDT (letnje računanje u SAD počelo 8. marta 2026). */
const PODNE = Date.parse("2026-03-18T20:00:00.000Z");
const DANAS = "2026-03-18";
/** Sledeća pacifička ponoć: 19. mart 07:00 UTC = 08:00 u Beogradu (još zimsko vreme). */
const OBNOVA = Date.parse("2026-03-19T07:00:00.000Z");

type YtKlasa = "odgovori" | "izmene" | "upload";

beforeEach(() => {
  vi.useFakeTimers({ now: PODNE });
  vi.stubEnv("GOOGLE_ADS_ACCESS_LEVEL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// ── pomoćne funkcije ─────────────────────────────────────────────────────────

/**
 * Sat u testu je zamrznut, ali convex-test ga pomera za po koju milisekundu sa
 * svakom transakcijom (da dve nikad ne dobiju isti trenutak). Zato se vreme koje
 * funkcija upiše (npr. kraj prigušenja) poredi sa tolerancijom od sekunde, a
 * pomaci sata u testu idu sa istom marginom.
 */
function okoVremena(stvarno: number | null | undefined, ocekivano: number) {
  expect(stvarno, "vreme nije upisano").toBeTypeOf("number");
  expect(stvarno as number).toBeGreaterThanOrEqual(ocekivano);
  expect(stvarno as number).toBeLessThan(ocekivano + 1000);
}

async function veza(
  s: Svet,
  workspaceId: Id<"workspaces">,
  provider: Doc<"connections">["provider"],
  status: Doc<"connections">["status"] = "active",
): Promise<Id<"connections">> {
  return await s.t.run(
    async (ctx) =>
      await ctx.db.insert("connections", {
        workspaceId,
        provider,
        encryptedCredentials: "sifrovano",
        status,
      }),
  );
}

const rezervisi = (s: Svet, workspaceId: Id<"workspaces">, klasa: YtKlasa, trosak: number) =>
  s.t.mutation(internal.globalneKvoteStore.rezervisi, {
    kljuc: "youtube",
    klasa,
    workspaceId,
    trosak,
  });

const vrati = (s: Svet, workspaceId: Id<"workspaces">, klasa: YtKlasa, trosak: number) =>
  s.t.mutation(internal.globalneKvoteStore.vrati, {
    kljuc: "youtube",
    klasa,
    workspaceId,
    trosak,
  });

const stanjeYt = (s: Svet, workspaceId: Id<"workspaces">, klasa: YtKlasa = "odgovori") =>
  s.t.query(internal.globalneKvoteStore.stanje, { kljuc: "youtube", klasa, workspaceId });

/** Globalni YouTube red za dan (jedinice i uploadi; 0 kad reda nema). */
async function globalniYt(s: Svet, dan: string = DANAS) {
  return await s.t.run(async (ctx) => {
    const redovi = await ctx.db
      .query("globalneKvote")
      .withIndex("by_kljuc_datum", (q) => q.eq("kljuc", "youtube").eq("datum", dan))
      .collect();
    return {
      redova: redovi.length,
      jedinice: redovi[0]?.jedinice ?? 0,
      uploadi: redovi[0]?.uploadi ?? 0,
    };
  });
}

/** Red projekta u `ytQuotaUsage` za dan (jedinice i uploadi; 0 kad reda nema). */
async function projekatYt(s: Svet, workspaceId: Id<"workspaces">, dan: string = DANAS) {
  return await s.t.run(async (ctx) => {
    const redovi = await ctx.db
      .query("ytQuotaUsage")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId).eq("date", dan))
      .collect();
    return {
      redova: redovi.length,
      jedinice: redovi[0]?.unitsUsed ?? 0,
      uploadi: redovi[0]?.uploadsUsed ?? 0,
    };
  });
}

/**
 * Naizmenično rezerviše `korak` za svaki projekat dok nijedan ne bude prihvaćen.
 * Vraća koliko je svaki projekat potrošio i sve odbijene ishode.
 */
async function trosiNaizmenicno(
  s: Svet,
  klasa: YtKlasa,
  korak: number,
  projekti: Id<"workspaces">[],
) {
  const potroseno = new Map<Id<"workspaces">, number>(projekti.map((p) => [p, 0]));
  const odbijeni: RezultatRezervacije[] = [];
  for (let krug = 0; krug < 1000; krug++) {
    let neko = false;
    for (const ws of projekti) {
      const r = await rezervisi(s, ws, klasa, korak);
      if (r.ok) {
        potroseno.set(ws, (potroseno.get(ws) ?? 0) + korak);
        neko = true;
      } else {
        odbijeni.push(r);
      }
    }
    if (!neko) break;
  }
  return { potroseno, odbijeni };
}

/** Samo jedan projekat rezerviše `korak` dok ga ne odbiju. Vraća potrošnju i prvo odbijanje. */
async function trosiDoPada(s: Svet, workspaceId: Id<"workspaces">, klasa: YtKlasa, korak: number) {
  let potroseno = 0;
  for (let i = 0; i < 1000; i++) {
    const r = await rezervisi(s, workspaceId, klasa, korak);
    if (!r.ok) return { potroseno, odbijanje: r };
    potroseno += korak;
  }
  throw new Error("Rezervacija nije stala ni posle 1000 koraka.");
}

// ── čista formula ────────────────────────────────────────────────────────────

describe("formula rezerve i plafoni (čist modul)", () => {
  test("plafoni: odgovori 8.000, izmene 6.000, upload 100; Google Ads 95 % limita tokena", () => {
    expect(plafonYoutube("odgovori")).toBe(8000);
    expect(plafonYoutube("izmene")).toBe(6000);
    expect(plafonYoutube("upload")).toBe(100);
    expect(plafonGoogleAds(2880)).toBe(2736);
    expect(plafonGoogleAds(15000)).toBe(14250);
    expect(plafonGoogleAds(100000)).toBe(95000);
  });

  test("primer iz plana: A 5.000, B 1.000, N = 2 — A ne sme dalje, B sme", () => {
    const A: UlazRezerve = { Z: 8000, ukupno: 6000, projekat: 5000, ostaliPotroseno: [1000], trosak: 50 };
    const B: UlazRezerve = { Z: 8000, ukupno: 6000, projekat: 1000, ostaliPotroseno: [5000], trosak: 50 };
    expect(smeDaPotrosi(A)).toEqual({ ok: false, razlog: "rezerva_drugih" });
    expect(smeDaPotrosi(B)).toEqual({ ok: true });
    expect(smeDaPotrosi({ ...A, ukupno: 7990 })).toEqual({ ok: false, razlog: "globalno" });
  });

  test("za N = 1 projekat sme sve do plafona, ni jedinicu preko", () => {
    const ulaz = { Z: 8000, ukupno: 7950, projekat: 7950, ostaliPotroseno: [] };
    expect(smeDaPotrosi({ ...ulaz, trosak: 50 })).toEqual({ ok: true });
    expect(smeDaPotrosi({ ...ulaz, trosak: 51 })).toEqual({ ok: false, razlog: "globalno" });
  });

  test("dostupno() je najveći trošak koji smeDaPotrosi još pušta", () => {
    const slucajevi: Omit<UlazRezerve, "trosak">[] = [
      { Z: 8000, ukupno: 0, projekat: 0, ostaliPotroseno: [] },
      { Z: 8000, ukupno: 0, projekat: 0, ostaliPotroseno: [0] },
      { Z: 8000, ukupno: 3000, projekat: 3000, ostaliPotroseno: [0] },
      { Z: 8000, ukupno: 6000, projekat: 5000, ostaliPotroseno: [1000] },
      { Z: 8000, ukupno: 6000, projekat: 1000, ostaliPotroseno: [5000] },
      { Z: 8000, ukupno: 8000, projekat: 4000, ostaliPotroseno: [4000] },
      { Z: 8000, ukupno: 2000, projekat: 500, ostaliPotroseno: [500, 1000] },
      { Z: 2736, ukupno: 1400, projekat: 1368, ostaliPotroseno: [32] },
      { Z: 100, ukupno: 50, projekat: 50, ostaliPotroseno: [0] },
      { Z: 100, ukupno: 99, projekat: 49, ostaliPotroseno: [50, 0] },
    ];
    for (const c of slucajevi) {
      const d = dostupno(c);
      expect(d, JSON.stringify(c)).toBeGreaterThanOrEqual(0);
      if (d > 0) expect(smeDaPotrosi({ ...c, trosak: d }).ok, `d=${d} ${JSON.stringify(c)}`).toBe(true);
      expect(smeDaPotrosi({ ...c, trosak: d + 1 }).ok, `d+1 ${JSON.stringify(c)}`).toBe(false);
    }
  });

  test("pacifički dan i obnova prate ponoć po pacifičkom vremenu, i u danima promene sata", () => {
    // Letnje računanje (UTC-7): dan se menja u 07:00 UTC.
    expect(pacifickiDan(Date.parse("2026-03-19T06:59:59Z"))).toBe("2026-03-18");
    expect(pacifickiDan(Date.parse("2026-03-19T07:00:00Z"))).toBe("2026-03-19");
    // Zimsko računanje (UTC-8): dan se menja u 08:00 UTC.
    expect(pacifickiDan(Date.parse("2026-01-15T07:59:59Z"))).toBe("2026-01-14");
    expect(pacifickiDan(Date.parse("2026-01-15T08:00:00Z"))).toBe("2026-01-15");

    expect(obnovaYoutube(PODNE)).toBe(OBNOVA);
    // 8. mart ima 23 sata (prelazak na letnje): ponoć je 9. marta u 07:00 UTC.
    expect(obnovaYoutube(Date.parse("2026-03-08T09:00:00Z"))).toBe(Date.parse("2026-03-09T07:00:00Z"));
    // 1. novembar ima 25 sati (povratak na zimsko): ponoć je 2. novembra u 08:00 UTC.
    expect(obnovaYoutube(Date.parse("2026-11-01T12:00:00Z"))).toBe(Date.parse("2026-11-02T08:00:00Z"));

    expect(utcSat(PODNE)).toBe("2026-03-18T20");
  });
});

// ── 1. jedan projekat ────────────────────────────────────────────────────────

describe("YouTube: jedan projekat (N = 1)", () => {
  test("odgovori od po 50 prolaze do tačno 8.000, sledeća rezervacija pada sa „globalno“", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");

    const { potroseno, odbijanje } = await trosiDoPada(s, s.wsA, "odgovori", 50);
    expect(potroseno).toBe(8000);

    expect(odbijanje.ok).toBe(false);
    expect(odbijanje.razlog).toBe("globalno");
    expect(odbijanje.poruka).toContain("Zajednička");
    expect(odbijanje.poruka).toMatch(/\d{2}:\d{2}/);
    // Sledeća pacifička ponoć, izražena u beogradskom satu.
    expect(odbijanje.obnovaU).toBe(OBNOVA);
    expect(odbijanje.poruka).toContain("08:00");
    // Sa jednim projektom ceo bazen je njegov deo.
    expect(odbijanje.R).toBe(8000);

    // Odbijena rezervacija ne pomera brojače.
    expect(await globalniYt(s)).toMatchObject({ redova: 1, jedinice: 8000 });
    expect(await projekatYt(s, s.wsA)).toMatchObject({ redova: 1, jedinice: 8000 });
  });

  test("stanje() za N = 1: ceo plafon je deo projekta, dostupno opada sa potrošnjom", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    expect(await stanjeYt(s, s.wsA)).toMatchObject({
      Z: 8000,
      R: 8000,
      N: 1,
      ukupno: 0,
      projekat: 0,
      dostupno: 8000,
      obnovaU: OBNOVA,
    });
    await rezervisi(s, s.wsA, "odgovori", 150);
    expect(await stanjeYt(s, s.wsA)).toMatchObject({ ukupno: 150, projekat: 150, dostupno: 7850 });
  });
});

// ── 2. dva projekta, isti budžet ─────────────────────────────────────────────

describe("YouTube: dva projekta troše isti budžet", () => {
  test("odgovori: zbir projekata je tačno 8.000 i globalni brojač mu je jednak", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "youtube");

    const { potroseno, odbijeni } = await trosiNaizmenicno(s, "odgovori", 50, [s.wsA, s.wsB]);
    const a = potroseno.get(s.wsA) ?? 0;
    const b = potroseno.get(s.wsB) ?? 0;
    expect(a + b).toBe(8000);
    expect(a).toBeLessThanOrEqual(4000);
    expect(b).toBeLessThanOrEqual(4000);
    expect(odbijeni.length).toBeGreaterThan(0);

    const g = await globalniYt(s);
    expect(g.jedinice).toBe(8000);
    expect(g.jedinice).toBe((await projekatYt(s, s.wsA)).jedinice + (await projekatYt(s, s.wsB)).jedinice);

    // Ni jedan od dva projekta ne može ni jednu rezervaciju više.
    for (const ws of [s.wsA, s.wsB]) {
      const r = await rezervisi(s, ws, "odgovori", 50);
      expect(r.ok).toBe(false);
      expect(r.razlog).toBe("globalno");
    }
  });

  test("izmene staju na 6.000 nad istim brojačem jedinica; odgovori nastavljaju do 8.000", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "youtube");

    const izmene = await trosiNaizmenicno(s, "izmene", 50, [s.wsA, s.wsB]);
    expect((izmene.potroseno.get(s.wsA) ?? 0) + (izmene.potroseno.get(s.wsB) ?? 0)).toBe(6000);
    expect(izmene.odbijeni[0].razlog).toBe("globalno");
    expect(izmene.odbijeni[0].poruka).toContain("Zajednička YouTube kvota za izmene");

    // Isti brojač jedinica, bez zasebnog „izmene“ polja.
    expect((await globalniYt(s)).jedinice).toBe(6000);

    // Preostalih 2.000 jedinica pripada odgovorima na komentare.
    const odgovori = await trosiNaizmenicno(s, "odgovori", 50, [s.wsA, s.wsB]);
    expect((odgovori.potroseno.get(s.wsA) ?? 0) + (odgovori.potroseno.get(s.wsB) ?? 0)).toBe(2000);
    expect(await globalniYt(s)).toMatchObject({ jedinice: 8000 });
    expect((await projekatYt(s, s.wsA)).jedinice + (await projekatYt(s, s.wsB)).jedinice).toBe(8000);
  });

  test("upload: 100 dnevno za sve projekte, poseban brojač koji ne troši jedinice", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "youtube");

    const { potroseno, odbijeni } = await trosiNaizmenicno(s, "upload", 1, [s.wsA, s.wsB]);
    expect((potroseno.get(s.wsA) ?? 0) + (potroseno.get(s.wsB) ?? 0)).toBe(100);
    expect(potroseno.get(s.wsA)).toBe(50);
    expect(potroseno.get(s.wsB)).toBe(50);
    expect(odbijeni[0].razlog).toBe("globalno");
    expect(odbijeni[0].poruka).toContain("Zajednički dnevni limit slanja videa");

    const g = await globalniYt(s);
    expect(g.uploadi).toBe(100);
    expect(g.uploadi).toBe((await projekatYt(s, s.wsA)).uploadi + (await projekatYt(s, s.wsB)).uploadi);
    // Upload nije potrošio nijednu jedinicu Data API budžeta.
    expect(g.jedinice).toBe(0);
    expect((await projekatYt(s, s.wsA)).jedinice).toBe(0);
    expect((await rezervisi(s, s.wsA, "odgovori", 50)).ok).toBe(true);
  });
});

// ── 3. rezerva štiti drugi projekat ──────────────────────────────────────────

describe("YouTube: rezerva štiti drugi projekat", () => {
  test("primer iz plana: A 5.000, B 1.000 → A-ov sledeći odgovor pada, B i dalje prolazi", async () => {
    const s = await napraviSvet();
    // A je potrošio pre nego što je B povezao YouTube (tada je N = 1 i ceo
    // bazen je A-ov deo); B se priključuje kasnije i dobija svoj deo.
    await veza(s, s.wsA, "youtube");
    expect((await rezervisi(s, s.wsA, "odgovori", 5000)).ok).toBe(true);
    await veza(s, s.wsB, "youtube");
    expect((await rezervisi(s, s.wsB, "odgovori", 1000)).ok).toBe(true);

    expect(await stanjeYt(s, s.wsA)).toMatchObject({
      Z: 8000,
      N: 2,
      R: 4000,
      ukupno: 6000,
      projekat: 5000,
      dostupno: 0,
    });

    const a = await rezervisi(s, s.wsA, "odgovori", 50);
    expect(a.ok).toBe(false);
    expect(a.razlog).toBe("rezerva_drugih");
    expect(a.poruka).toContain("Deo dnevne YouTube kvote za ovaj projekat");
    expect(a.poruka).toMatch(/\d{2}:\d{2}/);
    expect(a.R).toBe(4000);
    // Odbijanje ništa ne upisuje.
    expect((await projekatYt(s, s.wsA)).jedinice).toBe(5000);
    expect((await globalniYt(s)).jedinice).toBe(6000);

    // B prolazi: njegov deo je netaknut. Do kraja bazena ima 2.000 jedinica
    // (A je već preko svog dela), pa B stane tek kad je bazen prazan.
    const b = await trosiDoPada(s, s.wsB, "odgovori", 50);
    expect(b.potroseno).toBe(2000);
    expect(b.odbijanje.razlog).toBe("globalno");
    expect((await projekatYt(s, s.wsB)).jedinice).toBe(3000);
    expect((await globalniYt(s)).jedinice).toBe(8000);
  });

  test("oba projekta povezana od početka: A staje na svom delu od 4.000 dok B miruje", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "youtube");

    const a = await trosiDoPada(s, s.wsA, "odgovori", 50);
    expect(a.potroseno).toBe(4000);
    expect(a.odbijanje.razlog).toBe("rezerva_drugih");
    expect(a.odbijanje.poruka).toContain("Deo dnevne YouTube kvote za ovaj projekat");

    // B je mirovao: ceo njegov deo je i dalje slobodan.
    expect(await stanjeYt(s, s.wsB)).toMatchObject({ N: 2, R: 4000, projekat: 0, dostupno: 4000 });

    // Dok B troši svoj deo, A ostaje blokiran iz istog razloga — sve dok B ne
    // potroši ceo deo, tek tada je to običan prazan bazen.
    await rezervisi(s, s.wsB, "odgovori", 3950);
    expect((await rezervisi(s, s.wsA, "odgovori", 50)).razlog).toBe("rezerva_drugih");
    expect((await rezervisi(s, s.wsB, "odgovori", 50)).ok).toBe(true);
    expect((await rezervisi(s, s.wsA, "odgovori", 50)).razlog).toBe("globalno");

    expect(await globalniYt(s)).toMatchObject({ jedinice: 8000 });
    expect((await projekatYt(s, s.wsA)).jedinice).toBe(4000);
    expect((await projekatYt(s, s.wsB)).jedinice).toBe(4000);
  });

  test("upload: A sa 50, B sa 0 → A-ov 51. pada, B šalje svojih 50", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "youtube");

    const a = await trosiDoPada(s, s.wsA, "upload", 1);
    expect(a.potroseno).toBe(50);
    expect(a.odbijanje.razlog).toBe("rezerva_drugih");
    expect(a.odbijanje.poruka).toContain("Danas je poslato 50 od 50 videa za ovaj projekat");
    expect((await projekatYt(s, s.wsA)).uploadi).toBe(50);

    const b = await trosiDoPada(s, s.wsB, "upload", 1);
    expect(b.potroseno).toBe(50);
    // B je potrošio ceo svoj deo, a bazen je pun: razlog je sad zajednički limit.
    expect(b.odbijanje.razlog).toBe("globalno");
    expect((await globalniYt(s)).uploadi).toBe(100);
    expect((await rezervisi(s, s.wsA, "upload", 1)).razlog).toBe("globalno");
  });
});

// ── 4. istovremene rezervacije ───────────────────────────────────────────────

describe("YouTube: istovremene rezervacije", () => {
  test("40 paralelnih rezervacija od po 500 (20 iz A, 20 iz B) ne prelaze 8.000", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "youtube");

    const ishodi = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        rezervisi(s, i % 2 === 0 ? s.wsA : s.wsB, "odgovori", 500),
      ),
    );
    const uspesnih = ishodi.filter((r) => r.ok).length;
    expect(uspesnih * 500).toBeLessThanOrEqual(8000);
    expect(ishodi.filter((r) => !r.ok).every((r) => r.razlog !== undefined)).toBe(true);

    const g = await globalniYt(s);
    const a = await projekatYt(s, s.wsA);
    const b = await projekatYt(s, s.wsB);
    expect(g.jedinice).toBeLessThanOrEqual(8000);
    expect(g.jedinice).toBe(a.jedinice + b.jedinice);
    expect(g.jedinice).toBe(uspesnih * 500);
    // Nijedan projekat nije preuzeo deo onog drugog.
    expect(a.jedinice).toBeLessThanOrEqual(4000);
    expect(b.jedinice).toBeLessThanOrEqual(4000);
    // Bazen je iskorišćen do kraja: 8 + 8 prihvaćenih rezervacija.
    expect(uspesnih).toBe(16);
    expect(g.redova).toBe(1);
  });
});

// ── 5. povraćaj ──────────────────────────────────────────────────────────────

describe("YouTube: vrati()", () => {
  test("umanjuje globalni brojač i brojač projekta, nikad ispod nule", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");

    await rezervisi(s, s.wsA, "odgovori", 300);
    await vrati(s, s.wsA, "odgovori", 100);
    expect(await globalniYt(s)).toMatchObject({ jedinice: 200 });
    expect(await projekatYt(s, s.wsA)).toMatchObject({ jedinice: 200 });

    // Povraćaj veći od potrošenog: oba brojača staju na nuli, ne idu u minus.
    await vrati(s, s.wsA, "odgovori", 500);
    expect(await globalniYt(s)).toMatchObject({ jedinice: 0 });
    expect(await projekatYt(s, s.wsA)).toMatchObject({ jedinice: 0 });

    // Nula i negativan trošak ne rade ništa.
    await vrati(s, s.wsA, "odgovori", 0);
    await vrati(s, s.wsA, "odgovori", -50);
    expect(await globalniYt(s)).toMatchObject({ jedinice: 0 });
  });

  test("upload se vraća na svoj brojač; ne dira jedinice niti brojač drugog projekta", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "youtube");

    await rezervisi(s, s.wsA, "upload", 3);
    await rezervisi(s, s.wsA, "odgovori", 200);
    await rezervisi(s, s.wsB, "odgovori", 100);

    await vrati(s, s.wsA, "upload", 2);
    expect(await projekatYt(s, s.wsA)).toMatchObject({ uploadi: 1, jedinice: 200 });
    expect(await globalniYt(s)).toMatchObject({ uploadi: 1, jedinice: 300 });

    await vrati(s, s.wsA, "odgovori", 200);
    expect(await projekatYt(s, s.wsA)).toMatchObject({ uploadi: 1, jedinice: 0 });
    expect(await projekatYt(s, s.wsB)).toMatchObject({ jedinice: 100 });
    expect(await globalniYt(s)).toMatchObject({ uploadi: 1, jedinice: 100 });
  });

  test("povraćaj vraća kapacitet: pun bazen opet prima rezervaciju", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");

    expect((await rezervisi(s, s.wsA, "odgovori", 8000)).ok).toBe(true);
    expect((await rezervisi(s, s.wsA, "odgovori", 50)).ok).toBe(false);
    await vrati(s, s.wsA, "odgovori", 50);
    expect((await rezervisi(s, s.wsA, "odgovori", 50)).ok).toBe(true);
    expect((await globalniYt(s)).jedinice).toBe(8000);
  });

  test("povraćaj bez ijedne rezervacije ne pravi redove", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await vrati(s, s.wsA, "odgovori", 50);
    await vrati(s, s.wsA, "upload", 1);
    expect(await globalniYt(s)).toMatchObject({ redova: 0 });
    expect(await projekatYt(s, s.wsA)).toMatchObject({ redova: 0 });
  });
});

// ── 6. quotaExceeded ─────────────────────────────────────────────────────────

describe("YouTube: zatvoriYoutubeDan()", () => {
  test("posle quotaExceeded i A i B dobijaju „globalno“ za odgovore; brojač projekta ostaje", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "youtube");
    await rezervisi(s, s.wsA, "odgovori", 50);

    await s.t.mutation(internal.globalneKvoteStore.zatvoriYoutubeDan, {});

    expect(await globalniYt(s)).toMatchObject({ redova: 1, jedinice: 8000 });
    // Brojač projekta je stvarna potrošnja projekta, ne zajednički plafon.
    expect(await projekatYt(s, s.wsA)).toMatchObject({ jedinice: 50 });
    expect(await projekatYt(s, s.wsB)).toMatchObject({ redova: 0, jedinice: 0 });

    for (const ws of [s.wsA, s.wsB]) {
      const r = await rezervisi(s, ws, "odgovori", 50);
      expect(r.ok).toBe(false);
      expect(r.razlog).toBe("globalno");
      expect(r.poruka).toContain("Zajednička");
      // Izmene dele isti brojač jedinica, pa staju i one.
      expect((await rezervisi(s, ws, "izmene", 50)).razlog).toBe("globalno");
    }
    expect(await projekatYt(s, s.wsA)).toMatchObject({ jedinice: 50 });
    expect(await projekatYt(s, s.wsB)).toMatchObject({ jedinice: 0 });

    // Upload ima svoj brojač: videos.insert nije u budžetu koji je potrošen.
    expect((await rezervisi(s, s.wsB, "upload", 1)).ok).toBe(true);
    expect((await stanjeYt(s, s.wsA)).dostupno).toBe(0);
  });

  test("ponovljen poziv ne menja ništa, a bez reda za dan ga pravi", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    expect(await globalniYt(s)).toMatchObject({ redova: 0 });

    await s.t.mutation(internal.globalneKvoteStore.zatvoriYoutubeDan, {});
    await s.t.mutation(internal.globalneKvoteStore.zatvoriYoutubeDan, {});
    expect(await globalniYt(s)).toMatchObject({ redova: 1, jedinice: 8000 });
    expect(await projekatYt(s, s.wsA)).toMatchObject({ redova: 0 });
  });

  test("posle pacifičke ponoći kvota se obnavlja: novi dan, novi brojač", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await s.t.mutation(internal.globalneKvoteStore.zatvoriYoutubeDan, {});

    const pao = await rezervisi(s, s.wsA, "odgovori", 50);
    expect(pao.ok).toBe(false);
    expect(pao.obnovaU).toBe(OBNOVA);

    vi.setSystemTime(OBNOVA - 1000);
    expect((await rezervisi(s, s.wsA, "odgovori", 50)).ok).toBe(false);

    vi.setSystemTime(OBNOVA);
    expect((await rezervisi(s, s.wsA, "odgovori", 50)).ok).toBe(true);
    expect(await globalniYt(s, "2026-03-19")).toMatchObject({ jedinice: 50 });
    expect(await globalniYt(s, DANAS)).toMatchObject({ jedinice: 8000 });
  });
});

// ── 7. ko se računa u N ──────────────────────────────────────────────────────

describe("YouTube: koji projekti se računaju u N", () => {
  test("arhiviran projekat i veza u prekidu ne dele bazen", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    const vezaB = await veza(s, s.wsB, "youtube");
    await veza(s, s.wsK, "youtube");

    expect(await stanjeYt(s, s.wsA)).toMatchObject({ N: 3, R: 2666 });

    // Arhiviran projekat se ne računa.
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.wsK, { arhiviran: true });
    });
    expect(await stanjeYt(s, s.wsA)).toMatchObject({ N: 2, R: 4000 });

    // Veza u prekidu (brisanje podataka u toku) se ne računa.
    await s.t.run(async (ctx) => {
      await ctx.db.patch(vezaB, { status: "disconnecting" });
    });
    expect(await stanjeYt(s, s.wsA)).toMatchObject({ N: 1, R: 8000 });

    // Projekat koji pita je uvek u spisku, pa i B kome veza upravo prelazi u prekid.
    expect(await stanjeYt(s, s.wsB)).toMatchObject({ N: 2, R: 4000 });
    // I arhiviran projekat kad sam pita broji sebe.
    expect(await stanjeYt(s, s.wsK)).toMatchObject({ N: 2 });

    // Veza u grešci ili istekla je i dalje veza: projekat deli bazen.
    await s.t.run(async (ctx) => {
      await ctx.db.patch(vezaB, { status: "error" });
    });
    expect(await stanjeYt(s, s.wsA)).toMatchObject({ N: 2 });
    await s.t.run(async (ctx) => {
      await ctx.db.patch(vezaB, { status: "expired" });
    });
    expect(await stanjeYt(s, s.wsA)).toMatchObject({ N: 2 });
  });

  test("veza drugog provajdera i duplikat reda veze ne menjaju N", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "ga4");
    await veza(s, s.wsB, "google_ads");
    expect(await stanjeYt(s, s.wsA)).toMatchObject({ N: 1 });

    await veza(s, s.wsB, "youtube");
    await veza(s, s.wsB, "youtube");
    expect(await stanjeYt(s, s.wsA)).toMatchObject({ N: 2 });

    // Projekat bez YouTube veze, ako pita, ima ostale + sebe.
    expect(await stanjeYt(s, s.wsK)).toMatchObject({ N: 3, R: 2666 });
  });

  test("arhiviran projekat ne drži rezervu: A sme preko polovine kad je B arhiviran", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "youtube");
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.wsB, { arhiviran: true });
    });
    const a = await trosiDoPada(s, s.wsA, "odgovori", 50);
    expect(a.potroseno).toBe(8000);
    expect(a.odbijanje.razlog).toBe("globalno");
  });
});

// ── 8. ingestComment ─────────────────────────────────────────────────────────

describe("YouTube: ingestComment poštuje zajedničku kvotu", () => {
  async function automatizacija(s: Svet, workspaceId: Id<"workspaces">) {
    return await s.t.run(
      async (ctx) =>
        await ctx.db.insert("ytAutomations", {
          workspaceId,
          name: "Cena",
          keywords: ["cena"],
          matchAnyWord: true,
          wholeWordMatch: false,
          matchAnyVideo: true,
          replyEnabled: true,
          replyMessage: "Pošaljite nam poruku.",
          moderationEnabled: false,
          isActive: true,
          createdAt: PODNE,
          updatedAt: PODNE,
        }),
    );
  }

  const komentar = (s: Svet, workspaceId: Id<"workspaces">, commentId: string, text = "Kolika je cena?") =>
    s.t.mutation(internal.ytIngest.ingestComment, {
      workspaceId,
      commentId,
      videoId: "video-1",
      text,
    });

  const dnevnik = (s: Svet, workspaceId: Id<"workspaces">) =>
    s.t.run(async (ctx) =>
      ctx.db
        .query("ytCommentLogs")
        .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
    );

  test("globalni brojač pun: „skipped_quota“, a red u dnevniku kaže zašto", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    const automatizacijaId = await automatizacija(s, s.wsA);
    await s.t.mutation(internal.globalneKvoteStore.zatvoriYoutubeDan, {});

    expect(await komentar(s, s.wsA, "komentar-1")).toBe("skipped_quota");

    const redovi = await dnevnik(s, s.wsA);
    expect(redovi).toHaveLength(1);
    expect(redovi[0].status).toBe("skipped_quota");
    expect(redovi[0].errorMessage?.startsWith("Zajednička")).toBe(true);
    expect(redovi[0].automationId).toBe(automatizacijaId);
    expect(redovi[0].matchedKeyword).toBe("cena");

    // Ništa nije potrošeno ni zakazano, a komentar je upamćen (nema dupliranja).
    expect(await projekatYt(s, s.wsA)).toMatchObject({ jedinice: 0 });
    expect(await globalniYt(s)).toMatchObject({ jedinice: 8000 });
    expect(await komentar(s, s.wsA, "komentar-1")).toBe("duplicate");
    expect(await dnevnik(s, s.wsA)).toHaveLength(1);
  });

  test("ima kvote: „queued“, a oba brojača porastu za cenu odgovora (50)", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await automatizacija(s, s.wsA);

    expect(await komentar(s, s.wsA, "komentar-1")).toBe("queued");
    expect(await projekatYt(s, s.wsA)).toMatchObject({ jedinice: 50 });
    expect(await globalniYt(s)).toMatchObject({ jedinice: 50 });

    const redovi = await dnevnik(s, s.wsA);
    expect(redovi).toHaveLength(1);
    expect(redovi[0].status).toBe("pending");
    expect(redovi[0].errorMessage).toBeUndefined();

    // Odgovor je zakazan, ali ne i izvršen (tajmeri su zamrznuti).
    const zakazano = await s.t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(zakazano).toHaveLength(1);
    expect(zakazano[0].state.kind).toBe("pending");

    // Drugi komentar plaća drugih 50.
    expect(await komentar(s, s.wsA, "komentar-2")).toBe("queued");
    expect(await globalniYt(s)).toMatchObject({ jedinice: 100 });
  });

  test("komentar bez pogotka ne troši kvotu", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await automatizacija(s, s.wsA);

    expect(await komentar(s, s.wsA, "komentar-1", "Odličan video!")).toBe("no_match");
    expect(await globalniYt(s)).toMatchObject({ redova: 0 });
    expect(await projekatYt(s, s.wsA)).toMatchObject({ redova: 0 });
    expect((await dnevnik(s, s.wsA))[0].status).toBe("skipped_no_match");
  });

  test("projekat na svom delu: „skipped_quota“ zbog rezerve drugih, a B i dalje dobija odgovor", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube");
    await veza(s, s.wsB, "youtube");
    await automatizacija(s, s.wsA);
    await automatizacija(s, s.wsB);

    // A je potrošio ceo svoj deo (4.000 od 8.000).
    expect((await rezervisi(s, s.wsA, "odgovori", 4000)).ok).toBe(true);

    expect(await komentar(s, s.wsA, "komentar-a")).toBe("skipped_quota");
    const a = await dnevnik(s, s.wsA);
    expect(a[0].status).toBe("skipped_quota");
    expect(a[0].errorMessage?.startsWith("Deo dnevne YouTube kvote za ovaj projekat")).toBe(true);
    expect(await projekatYt(s, s.wsA)).toMatchObject({ jedinice: 4000 });

    expect(await komentar(s, s.wsB, "komentar-b")).toBe("queued");
    expect(await projekatYt(s, s.wsB)).toMatchObject({ jedinice: 50 });
    expect(await globalniYt(s)).toMatchObject({ jedinice: 4050 });
  });

  test("veza koja nije aktivna: „ignored_engine_off“, bez traga u kvoti", async () => {
    const s = await napraviSvet();
    await veza(s, s.wsA, "youtube", "error");
    await automatizacija(s, s.wsA);
    expect(await komentar(s, s.wsA, "komentar-1")).toBe("ignored_engine_off");
    expect(await globalniYt(s)).toMatchObject({ redova: 0 });
    expect(await dnevnik(s, s.wsA)).toHaveLength(0);
  });
});

// ── 9. Google Ads ────────────────────────────────────────────────────────────

describe("Google Ads: zajednička kvota operacija", () => {
  const gRezervisi = (s: Svet, workspaceId: Id<"workspaces">, trosak: number, customerId?: string) =>
    s.t.mutation(internal.globalneKvoteStore.rezervisi, {
      kljuc: "google_ads",
      klasa: "operacije",
      workspaceId,
      trosak,
      ...(customerId !== undefined ? { customerId } : {}),
    });

  const gStanje = (s: Svet, workspaceId: Id<"workspaces">) =>
    s.t.query(internal.globalneKvoteStore.stanje, {
      kljuc: "google_ads",
      klasa: "operacije",
      workspaceId,
    });

  const sati = (s: Svet) =>
    s.t.run(async (ctx) =>
      ctx.db
        .query("globalneKvote")
        .withIndex("by_kljuc_datum", (q) => q.eq("kljuc", "google_ads"))
        .collect(),
    );

  const gadsRedovi = (s: Svet, workspaceId: Id<"workspaces">) =>
    s.t.run(async (ctx) =>
      ctx.db
        .query("gadsQuota")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
    );

  const CUSTOMER = "1234567890";

  async function dvaProjekta() {
    const s = await napraviSvet();
    await veza(s, s.wsA, "google_ads");
    await veza(s, s.wsB, "google_ads");
    return s;
  }

  test("rezervacija upisuje globalni sat i brojač projekta; ispravka ih oba pomera", async () => {
    const s = await dvaProjekta();

    const r = await gRezervisi(s, s.wsA, 22, CUSTOMER);
    expect(r.ok).toBe(true);
    // Bez GOOGLE_ADS_ACCESS_LEVEL važi explorer: 2.880 operacija, plafon 95 % = 2.736.
    expect(r.R).toBe(1368);

    const sat = await sati(s);
    expect(sat).toHaveLength(1);
    expect(sat[0]).toMatchObject({ kljuc: "google_ads", datum: utcSat(PODNE), jedinice: 22 });
    const a = await gadsRedovi(s, s.wsA);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      customerId: CUSTOMER,
      accessLevel: "explorer",
      dailyLimit: 2880,
      consumed24h: 22,
      operations: [{ timestamp: expect.any(Number), count: 22 }],
    });
    expect(a[0].operations).toHaveLength(1);
    expect((a[0].operations ?? [])[0].timestamp).toBeGreaterThanOrEqual(PODNE);
    expect((a[0].operations ?? [])[0].timestamp).toBeLessThan(PODNE + 1000);
    expect(await gadsRedovi(s, s.wsB)).toHaveLength(0);
    expect(await gStanje(s, s.wsA)).toMatchObject({ Z: 2736, N: 2, R: 1368, ukupno: 22, projekat: 22 });

    // Stvarna potrošnja je bila 17: ispravka od −5 skida sa oba brojača.
    await s.t.mutation(internal.globalneKvoteStore.ispraviGoogleAds, {
      workspaceId: s.wsA,
      customerId: CUSTOMER,
      delta: -5,
    });
    expect((await sati(s))[0].jedinice).toBe(17);
    expect((await gadsRedovi(s, s.wsA))[0]).toMatchObject({ consumed24h: 17, operations: [{ count: 17 }] });
    expect(await gStanje(s, s.wsA)).toMatchObject({ ukupno: 17, projekat: 17 });

    // Ispravka naviše važi isto (bez provere: operacije su već potrošene).
    await s.t.mutation(internal.globalneKvoteStore.ispraviGoogleAds, {
      workspaceId: s.wsA,
      customerId: CUSTOMER,
      delta: 3,
    });
    expect(await gStanje(s, s.wsA)).toMatchObject({ ukupno: 20, projekat: 20 });

    // vrati() skida celu rezervaciju sa oba brojača, nikad ispod nule.
    await s.t.mutation(internal.globalneKvoteStore.vrati, {
      kljuc: "google_ads",
      klasa: "operacije",
      workspaceId: s.wsA,
      trosak: 500,
      customerId: CUSTOMER,
    });
    expect(await gStanje(s, s.wsA)).toMatchObject({ ukupno: 0, projekat: 0 });
    expect((await sati(s))[0].jedinice).toBe(0);
    expect((await gadsRedovi(s, s.wsA))[0].consumed24h).toBe(0);
  });

  test("sat stariji od 24 h ne ulazi u prozor (stanje.ukupno), noviji ulazi", async () => {
    const s = await dvaProjekta();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("globalneKvote", {
        kljuc: "google_ads",
        datum: new Date(PODNE - 25 * SAT).toISOString().slice(0, 13),
        jedinice: 500,
        updatedAt: PODNE - 25 * SAT,
      });
    });
    expect((await gStanje(s, s.wsA)).ukupno).toBe(0);

    await s.t.run(async (ctx) => {
      await ctx.db.insert("globalneKvote", {
        kljuc: "google_ads",
        datum: new Date(PODNE - 22 * SAT).toISOString().slice(0, 13),
        jedinice: 100,
        updatedAt: PODNE - 22 * SAT,
      });
    });
    expect((await gStanje(s, s.wsA)).ukupno).toBe(100);

    // Stari sat ne zauzima mesto: nova rezervacija se dodaje samo na noviji zbir.
    expect((await gRezervisi(s, s.wsA, 22, CUSTOMER)).ok).toBe(true);
    expect((await gStanje(s, s.wsA)).ukupno).toBe(122);
  });

  test("rezerva drugih važi i ovde: A ne sme preko svog dela ni dok B miruje", async () => {
    const s = await dvaProjekta();

    // Svoj deo (1.368) A troši slobodno…
    expect((await gRezervisi(s, s.wsA, 1368, CUSTOMER)).ok).toBe(true);
    // …ali ni jedna operacija više: B-ov neiskorišćeni deo je zaštićen.
    const a = await gRezervisi(s, s.wsA, 1, CUSTOMER);
    expect(a.ok).toBe(false);
    expect(a.razlog).toBe("rezerva_drugih");
    expect(a.poruka).toContain("deo kvote za ovaj projekat");
    expect(a.poruka).toContain("1.368 od 1.368 operacija za 24 h");
    expect(a.poruka).toMatch(/oko \d{2}:\d{2}/);
    // Odbijanje ništa ne upisuje.
    expect(await gStanje(s, s.wsA)).toMatchObject({ ukupno: 1368, projekat: 1368 });

    // B troši deo po deo; sve dok nije potrošio svoj deo, A ostaje zaključan.
    expect((await gRezervisi(s, s.wsB, 1000, CUSTOMER)).ok).toBe(true);
    expect((await gRezervisi(s, s.wsA, 1, CUSTOMER)).razlog).toBe("rezerva_drugih");
    expect(await gStanje(s, s.wsB)).toMatchObject({ N: 2, projekat: 1000, dostupno: 368 });
    expect((await gRezervisi(s, s.wsB, 368, CUSTOMER)).ok).toBe(true);

    // Bazen je pun: sad je razlog zajednički plafon.
    const pun = await gRezervisi(s, s.wsA, 1, CUSTOMER);
    expect(pun.ok).toBe(false);
    expect(pun.razlog).toBe("globalno");
    expect(pun.poruka).toContain("zajednička kvota svih projekata je potrošena");
    expect(await gStanje(s, s.wsB)).toMatchObject({ ukupno: 2736, projekat: 1368, dostupno: 0 });
  });

  test("GOOGLE_ADS_ACCESS_LEVEL menja plafon: basic = 14.250", async () => {
    vi.stubEnv("GOOGLE_ADS_ACCESS_LEVEL", "basic");
    const s = await dvaProjekta();
    expect(await gStanje(s, s.wsA)).toMatchObject({ Z: 14250, R: 7125, N: 2 });
  });
});

// ── 10. Meta ─────────────────────────────────────────────────────────────────

describe("Meta: prigušenje cele aplikacije i prigušenje jednog projekta", () => {
  const gate = (s: Svet, workspaceId: Id<"workspaces">) =>
    s.t.query(internal.metaSyncStore.gate, { workspaceId });

  const rateLimit = (s: Svet, ko: Id<"users">, workspaceId: Id<"workspaces">) =>
    kao(s, ko).query(api.metaSyncStore.rateLimit, { workspaceId });

  const brojMetaApp = (s: Svet) =>
    s.t.run(
      async (ctx) =>
        (
          await ctx.db
            .query("globalneKvote")
            .withIndex("by_kljuc_datum", (q) => q.eq("kljuc", "meta_app"))
            .collect()
        ).length,
    );

  test("kod 4 (cela aplikacija): gate je „backoff“ za OBA projekta, rateLimit kaže globalno", async () => {
    const s = await napraviSvet();
    await s.t.mutation(internal.globalneKvoteStore.zabeleziMetaApp, {
      callCount: 12,
      cpuTime: 3,
      totalTime: 4,
      throttled: true,
    });

    for (const ws of [s.wsA, s.wsB, s.wsK]) {
      const { retryAt, ...ostalo } = await gate(s, ws);
      expect(ostalo).toEqual({ state: "backoff", peak: 12 });
      okoVremena(retryAt, PODNE + BACKOFF_MIN_MS);
    }

    // Ekran svakog projekta vidi da ograničava zajednička aplikacija.
    const zaA = await rateLimit(s, s.ana, s.wsA);
    expect(zaA).toMatchObject({ state: "backoff", limited: true, globalno: true });
    okoVremena(zaA.retryAt, PODNE + BACKOFF_MIN_MS);
    expect(await rateLimit(s, s.boban, s.wsB)).toMatchObject({
      state: "backoff",
      limited: true,
      globalno: true,
    });

    // Prigušenje je vremensko: posle minuta kapija se otvara za sve.
    vi.setSystemTime(PODNE + BACKOFF_MIN_MS + 1000);
    expect((await gate(s, s.wsA)).state).toBe("ok");
    expect((await gate(s, s.wsB)).state).toBe("ok");
    expect(await rateLimit(s, s.ana, s.wsA)).toMatchObject({ limited: false, globalno: false });
  });

  test("ponovljeno odbijanje udvostručuje čekanje cele aplikacije", async () => {
    const s = await napraviSvet();
    const odbijeno = { callCount: 5, cpuTime: 5, totalTime: 5, throttled: true };
    await s.t.mutation(internal.globalneKvoteStore.zabeleziMetaApp, odbijeno);
    await s.t.mutation(internal.globalneKvoteStore.zabeleziMetaApp, odbijeno);
    okoVremena((await gate(s, s.wsA)).retryAt, PODNE + 2 * BACKOFF_MIN_MS);
    // Jedan globalni red, ne po jedan za svaki poziv.
    expect(await brojMetaApp(s)).toBe(1);
  });

  test("kod 32 (jedan projekat): A je „backoff“, B ostaje „ok“; nema globalnog reda", async () => {
    const s = await napraviSvet();
    await s.t.mutation(internal.metaSyncStore.recordUsage, {
      workspaceId: s.wsA,
      callCount: 5,
      cpuTime: 5,
      totalTime: 5,
      throttled: true,
    });

    const { retryAt, ...ostalo } = await gate(s, s.wsA);
    expect(ostalo).toEqual({ state: "backoff", peak: 5 });
    okoVremena(retryAt, PODNE + BACKOFF_MIN_MS);
    expect(await gate(s, s.wsB)).toEqual({ state: "ok", retryAt: null, peak: 0 });
    expect(await brojMetaApp(s)).toBe(0);

    expect(await rateLimit(s, s.ana, s.wsA)).toMatchObject({
      state: "backoff",
      limited: true,
      globalno: false,
    });
    expect(await rateLimit(s, s.boban, s.wsB)).toMatchObject({
      state: "ok",
      limited: false,
      globalno: false,
      retryAt: null,
    });

    // Prigušenje jednog projekta ne gasi se prigušenjem aplikacije koje nema.
    expect((await gate(s, s.wsK)).state).toBe("ok");
  });

  test("visok procenat cele aplikacije (97 %) je „stop“ za sve; posle sat vremena kapija se otvara", async () => {
    const s = await napraviSvet();
    await s.t.mutation(internal.globalneKvoteStore.zabeleziMetaApp, {
      callCount: 97,
      cpuTime: 10,
      totalTime: 10,
      throttled: false,
    });
    for (const ws of [s.wsA, s.wsB]) {
      const { retryAt, ...ostalo } = await gate(s, ws);
      expect(ostalo).toEqual({ state: "stop", peak: 97 });
      okoVremena(retryAt, PODNE + USAGE_TTL_MS);
    }
    expect(await rateLimit(s, s.boban, s.wsB)).toMatchObject({ state: "stop", limited: true, globalno: true });

    // Očitavanje se računa kao zastarelo posle sata, kao i kod procenta projekta.
    vi.setSystemTime(PODNE + USAGE_TTL_MS + 1000);
    expect((await gate(s, s.wsA)).state).toBe("ok");
  });

  test("gori projekat i aplikacija: strožije stanje pobeđuje, globalno samo kad je aplikacija gora", async () => {
    const s = await napraviSvet();
    // Aplikacija na 85 % (upozorenje), A odbijen (backoff), B čist.
    await s.t.mutation(internal.globalneKvoteStore.zabeleziMetaApp, {
      callCount: 85,
      cpuTime: 0,
      totalTime: 0,
      throttled: false,
    });
    await s.t.mutation(internal.metaSyncStore.recordUsage, {
      workspaceId: s.wsA,
      callCount: 2,
      cpuTime: 2,
      totalTime: 2,
      throttled: true,
    });
    expect(await rateLimit(s, s.ana, s.wsA)).toMatchObject({ state: "backoff", globalno: false, limited: true });
    expect(await rateLimit(s, s.boban, s.wsB)).toMatchObject({ state: "warn", globalno: true, limited: false });
  });
});

// ── 11. čišćenje ─────────────────────────────────────────────────────────────

describe("ocisti()", () => {
  test("briše YouTube redove starije od 3 dana i Google Ads sate starije od 48 h, novije ostavlja", async () => {
    const s = await napraviSvet();
    const dan = (pre: number) => pacifickiDan(PODNE - pre * DAN);
    const sat = (pre: number) => utcSat(PODNE - pre * SAT);

    await s.t.run(async (ctx) => {
      const red = (kljuc: "youtube" | "google_ads" | "meta_app", datum: string, jedinice = 10) =>
        ctx.db.insert("globalneKvote", { kljuc, datum, jedinice, updatedAt: PODNE });
      for (const pre of [5, 4, 3, 2, 1, 0]) await red("youtube", dan(pre));
      for (const pre of [72, 49, 48, 47, 30, 1, 0]) await red("google_ads", sat(pre));
      await red("meta_app", "tekuce", 0);
    });

    const rezultat = await s.t.mutation(internal.globalneKvoteStore.ocisti, {});
    expect(rezultat).toEqual({ obrisano: 4 });

    const ostalo = await s.t.run(async (ctx) => {
      const redovi = await ctx.db.query("globalneKvote").collect();
      const po = (kljuc: string) =>
        redovi
          .filter((r) => r.kljuc === kljuc)
          .map((r) => r.datum)
          .sort();
      return { youtube: po("youtube"), google_ads: po("google_ads"), meta_app: po("meta_app") };
    });

    // „Starije od 3 dana“: red od pre tačno 3 dana još stoji.
    expect(ostalo.youtube).toEqual([dan(3), dan(2), dan(1), dan(0)].sort());
    expect(ostalo.youtube).not.toContain(dan(4));
    expect(ostalo.youtube).not.toContain(dan(5));
    // Sat od pre tačno 48 h još stoji; sat iz prozora od 24 h i stariji od njega (do 48 h) takođe.
    expect(ostalo.google_ads).toEqual([sat(48), sat(47), sat(30), sat(1), sat(0)].sort());
    expect(ostalo.google_ads).not.toContain(sat(49));
    expect(ostalo.google_ads).not.toContain(sat(72));
    // Meta red nikad ne briše ovaj prolaz.
    expect(ostalo.meta_app).toEqual(["tekuce"]);

    // Drugi prolaz nema šta da obriše.
    expect(await s.t.mutation(internal.globalneKvoteStore.ocisti, {})).toEqual({ obrisano: 0 });
  });
});
