/// <reference types="vite/client" />
/**
 * Pozivnice po projektu (C13): `invitesStore.ts` (`createInvite`, `getInvite`,
 * `pripremiRegistraciju`, `prihvatiPozivnicu`, `listInvites`, `revokeInvite`,
 * `pripremiAdminSetup`), `auth.ts` (`isEmailAllowed`, `consumeOpenInvite`),
 * `membersStore.promeniUlogu` i `projekti.mojProjekat` / `mojiProjekti`.
 *
 * Pravilo koje sve ovo čuva: pozivnica važi za SVOJ projekat. Pozvan u ScanMe
 * ne dobija ništa u Enigma IT; postojeći korisnik dobija dodatno članstvo, a
 * njegova postojeća članstva i uloge ostaju netaknuti. Prijavu bez pozivnice
 * dozvoljava samo `ALLOWED_EMAILS`, i to bez ijednog projekta.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { consumeOpenInvite, isEmailAllowed } from "./auth";
import { sha256Hex } from "./lib/metaAudienceHash";
import type { Uloga } from "./lib/uloge";
import schema from "./schema";
import { kao, modules, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const DAN = 24 * 60 * 60 * 1000;
const NOVA = "nova.osoba@klijent.test";
const ANA = "ana@enigma.test";

beforeEach(() => {
  vi.stubEnv("ALLOWED_EMAILS", undefined);
  vi.stubEnv("ADMIN_SETUP_CODE", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── pomoćne funkcije ─────────────────────────────────────────────────────────

/** Greška sa kodom koji `odbijeno` ne zna (`bad_request`, `invite_*`, `email_mismatch`…). */
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

const pozovi = (
  s: Svet,
  ko: Id<"users">,
  workspaceId: Id<"workspaces">,
  email: string,
  uloga?: Uloga,
) =>
  kao(s, ko).mutation(api.invitesStore.createInvite, {
    workspaceId,
    email,
    ...(uloga !== undefined ? { uloga } : {}),
  });

const korisnik = (s: Svet, email: string, polja: { emailVerificationTime?: number } = {}) =>
  s.t.run(async (ctx) => await ctx.db.insert("users", { email, ...polja }));

/** Članstva korisnika kao [{ projekat, uloga }], sortirano po projektu. */
async function clanstva(s: Svet, userId: Id<"users">) {
  return await s.t.run(async (ctx) => {
    const redovi = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return redovi
      .map((m) => ({ workspaceId: m.workspaceId, role: m.role }))
      .sort((a, b) => String(a.workspaceId).localeCompare(String(b.workspaceId)));
  });
}

async function pozivnica(s: Svet, token: string) {
  const tokenHash = await sha256Hex(token);
  return await s.t.run(async (ctx) =>
    ctx.db
      .query("invites")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first(),
  );
}

/** Pozivnica upisana direktno (npr. stara, bez polja `uloga`). */
async function ubaciPozivnicu(
  s: Svet,
  o: {
    token: string;
    workspaceId: Id<"workspaces">;
    email: string;
    createdBy: Id<"users">;
    uloga?: Uloga;
    createdAt?: number;
  },
) {
  const tokenHash = await sha256Hex(o.token);
  const createdAt = o.createdAt ?? Date.now();
  return await s.t.run(
    async (ctx) =>
      await ctx.db.insert("invites", {
        workspaceId: o.workspaceId,
        email: o.email,
        tokenHash,
        createdBy: o.createdBy,
        createdAt,
        expiresAt: createdAt + 7 * DAN,
        ...(o.uloga !== undefined ? { uloga: o.uloga } : {}),
      }),
  );
}

const dozvoljeno = (s: Svet, userId: Id<"users">, email: string | null) =>
  s.t.run(async (ctx) => await isEmailAllowed(ctx, userId, email));

const potrosi = (s: Svet, userId: Id<"users">, email: string | null) =>
  s.t.run(async (ctx) => {
    await consumeOpenInvite(ctx.db, userId, email);
  });

const pripremi = (s: Svet, token: string, email?: string) =>
  s.t.mutation(api.invitesStore.pripremiRegistraciju, { token, ...(email !== undefined ? { email } : {}) });

const prihvati = (s: Svet, ko: Id<"users">, token: string) =>
  kao(s, ko).mutation(api.invitesStore.prihvatiPozivnicu, { token });

// ── 1. pravljenje pozivnice ──────────────────────────────────────────────────

describe("createInvite", () => {
  test("vraća token i panelOrigin; bez domena projekta je null, sa domenom https://<host>", async () => {
    const s = await napraviSvet();
    const pre = Date.now();

    const prva = await pozovi(s, s.boban, s.wsB, " Nova.Osoba@Klijent.TEST ", "client_viewer");
    expect(typeof prva.token).toBe("string");
    expect(prva.token.length).toBeGreaterThanOrEqual(40);
    expect(prva.email).toBe(NOVA);
    expect(prva.panelOrigin).toBeNull();
    // Važi sedam dana.
    expect(prva.expiresAt).toBeGreaterThanOrEqual(pre + 7 * DAN);
    expect(prva.expiresAt).toBeLessThan(pre + 7 * DAN + 60_000);

    // U bazi stoji samo heš tokena; sirov token se nigde ne upisuje.
    const red = await pozivnica(s, prva.token);
    expect(red).toMatchObject({
      workspaceId: s.wsB,
      email: NOVA,
      createdBy: s.boban,
      uloga: "client_viewer",
    });
    expect(JSON.stringify(red)).not.toContain(prva.token);

    // Domen drugog projekta ne cureti u link ScanMe pozivnice.
    await s.t.run(async (ctx) => {
      await ctx.db.insert("projekatDomeni", { host: "panel.enigma.test", workspaceId: s.wsA, createdAt: 1 });
      await ctx.db.insert("projekatDomeni", { host: "panel.scanme.test", workspaceId: s.wsB, createdAt: 2 });
    });
    const druga = await pozovi(s, s.boban, s.wsB, "druga.osoba@klijent.test");
    expect(druga.panelOrigin).toBe("https://panel.scanme.test");
    expect(druga.token).not.toBe(prva.token);
    // Bez izabrane uloge pozivnica daje urednika.
    expect((await pozivnica(s, druga.token))?.uloga).toBe("urednik");
  });

  test("pozivnicu pravi samo vlasnik tog projekta", async () => {
    const s = await napraviSvet();
    // urednik i pregledač istog projekta
    await odbijeno(pozovi(s, s.urednica, s.wsA, NOVA), "forbidden", /vlasnik/);
    await odbijeno(pozovi(s, s.viewer, s.wsA, NOVA), "forbidden");
    // vlasnik drugog projekta
    await odbijeno(pozovi(s, s.boban, s.wsA, NOVA), "forbidden", /pristup/);
    await odbijeno(pozovi(s, s.stranac, s.wsB, NOVA), "forbidden");
    // bez prijave
    await odbijeno(
      s.t.mutation(api.invitesStore.createInvite, { workspaceId: s.wsB, email: NOVA }),
      "unauthorized",
    );
    expect(await s.t.run(async (ctx) => (await ctx.db.query("invites").collect()).length)).toBe(0);
  });

  test("neispravna adresa i već važeća pozivnica za istu adresu se odbijaju", async () => {
    const s = await napraviSvet();
    const losa = await greska(pozovi(s, s.boban, s.wsB, "nije-adresa"));
    expect(losa).toEqual({ kod: "bad_request", poruka: "Unesi ispravnu email adresu." });

    const prva = await pozovi(s, s.boban, s.wsB, NOVA);
    await odbijeno(pozovi(s, s.boban, s.wsB, NOVA), "conflict", /već postoji važeća pozivnica/);

    // Posle povlačenja može nova.
    const spisak = await kao(s, s.boban).query(api.invitesStore.listInvites, { workspaceId: s.wsB });
    await kao(s, s.boban).mutation(api.invitesStore.revokeInvite, {
      workspaceId: s.wsB,
      inviteId: spisak[0]._id,
    });
    const nova = await pozovi(s, s.boban, s.wsB, NOVA);
    expect(nova.token).not.toBe(prva.token);
  });

  test("član ISTOG projekta se ne poziva: conflict „Ta osoba je već član ovog projekta.“", async () => {
    const s = await napraviSvet();
    await odbijeno(
      pozovi(s, s.boban, s.wsB, "boban@scanme.test"),
      "conflict",
      /^Ta osoba je već član ovog projekta\.$/,
    );
    // Član oba projekta je član i tog u koji ga zovu.
    await odbijeno(pozovi(s, s.ana, s.wsA, "jovan@enigma.test"), "conflict", /već član/);
    await odbijeno(pozovi(s, s.boban, s.wsB, "jovan@enigma.test"), "conflict", /već član/);
    expect(await s.t.run(async (ctx) => (await ctx.db.query("invites").collect()).length)).toBe(0);
  });

  test("adresa bez ijednog članstva dobija čist početak: stari users red i login zapisi se brišu", async () => {
    const s = await napraviSvet();
    // Poluispečena registracija: nalog sa lozinkom, bez članstva.
    await s.t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId: s.stranac,
        provider: "password",
        providerAccountId: "stranac@niko.test",
      });
    });
    await pozovi(s, s.boban, s.wsB, "stranac@niko.test");
    expect(await s.t.run(async (ctx) => await ctx.db.get(s.stranac))).toBeNull();
    expect(await s.t.run(async (ctx) => (await ctx.db.query("authAccounts").collect()).length)).toBe(0);
  });
});

// ── 2–3. nov korisnik ────────────────────────────────────────────────────────

describe("nov korisnik pozvan u ScanMe", () => {
  test("dobija članstvo SAMO u ScanMe sa ulogom iz pozivnice, nikad u Enigma IT", async () => {
    const s = await napraviSvet();
    const { token } = await pozovi(s, s.boban, s.wsB, NOVA, "client_viewer");
    const userId = await korisnik(s, NOVA);

    // Pozivnica još ne otvara vrata: prozor nije otvoren, nema članstva.
    expect(await dozvoljeno(s, userId, NOVA)).toBe(false);

    // Adresa mora biti tačno ona iz pozivnice; prozor se ne otvara.
    expect(await greska(pripremi(s, token, "druga@adresa.test"))).toEqual({
      kod: "email_mismatch",
      poruka: "Email ne odgovara pozivnici.",
    });
    expect((await pozivnica(s, token))?.readyUntil).toBeUndefined();
    expect(await dozvoljeno(s, userId, NOVA)).toBe(false);

    // Tačna adresa (i u drugoj veličini slova) otvara prozor.
    const pripremljeno = await pripremi(s, token, "NOVA.osoba@klijent.test");
    expect(pripremljeno).toEqual({ email: NOVA });
    const otvorena = await pozivnica(s, token);
    expect(otvorena?.readyUntil).toBeGreaterThan(Date.now());
    expect(await dozvoljeno(s, userId, NOVA)).toBe(true);
    expect(await clanstva(s, userId)).toEqual([]);

    // Sesija se pravi → pozivnica se troši i nastaje članstvo u ScanMe.
    await potrosi(s, userId, NOVA);
    expect(await clanstva(s, userId)).toEqual([{ workspaceId: s.wsB, role: "client_viewer" }]);
    const iskoriscena = await pozivnica(s, token);
    expect(iskoriscena?.usedAt).toBeTypeOf("number");
    expect(iskoriscena?.usedByUserId).toBe(userId);

    // Pristup se vidi kroz projekte: ScanMe da, Enigma IT ne.
    const kaoNov = kao(s, userId);
    expect(await kaoNov.query(api.projekti.mojProjekat, { slug: "enigma-it" })).toBeNull();
    const scanme = await kaoNov.query(api.projekti.mojProjekat, { slug: "scanme" });
    expect(scanme).toMatchObject({
      workspaceId: s.wsB,
      slug: "scanme",
      ime: "ScanMe",
      uloga: "client_viewer",
    });
    const projekti = await kaoNov.query(api.projekti.mojiProjekti, {});
    expect(projekti.map((p) => p.slug)).toEqual(["scanme"]);

    // Nijedan podatak Enigma IT-a nije dostupan ni direktno.
    await odbijeno(
      kaoNov.query(api.invitesStore.listInvites, { workspaceId: s.wsA }),
      "forbidden",
    );
    // Nema više otvorene pozivnice; članstvo ostaje razlog da sme.
    expect(await dozvoljeno(s, userId, NOVA)).toBe(true);
    // Ista pozivnica ne može ponovo.
    expect((await greska(pripremi(s, token))).kod).toBe("invite_iskoriscena");
  });

  test("stara pozivnica bez polja uloga daje urednika", async () => {
    const s = await napraviSvet();
    await ubaciPozivnicu(s, {
      token: "stari-token-bez-uloge",
      workspaceId: s.wsB,
      email: NOVA,
      createdBy: s.boban,
    });
    expect((await pozivnica(s, "stari-token-bez-uloge"))?.uloga).toBeUndefined();

    const userId = await korisnik(s, NOVA);
    await pripremi(s, "stari-token-bez-uloge");
    await potrosi(s, userId, NOVA);
    expect(await clanstva(s, userId)).toEqual([{ workspaceId: s.wsB, role: "urednik" }]);
  });

  test("stara pozivnica bez uloge daje urednika i pri prihvatanju posle prijave", async () => {
    const s = await napraviSvet();
    await ubaciPozivnicu(s, {
      token: "stari-token-2",
      workspaceId: s.wsB,
      email: "urednica@enigma.test",
      createdBy: s.boban,
    });
    await prihvati(s, s.urednica, "stari-token-2");
    expect(await clanstva(s, s.urednica)).toEqual(
      [
        { workspaceId: s.wsA, role: "urednik" },
        { workspaceId: s.wsB, role: "urednik" },
      ].sort((a, b) => String(a.workspaceId).localeCompare(String(b.workspaceId))),
    );
  });

  test("potrošnja bez otvorenog prozora ne radi ništa", async () => {
    const s = await napraviSvet();
    await pozovi(s, s.boban, s.wsB, NOVA, "urednik");
    const userId = await korisnik(s, NOVA);
    // Nije prošao kroz pripremiRegistraciju: nema prozora.
    await potrosi(s, userId, NOVA);
    expect(await clanstva(s, userId)).toEqual([]);
    // Bez adrese se ne radi ništa.
    await potrosi(s, userId, null);
    expect(await clanstva(s, userId)).toEqual([]);
  });
});

// ── 4. postojeći korisnik ────────────────────────────────────────────────────

describe("postojeći korisnik pozvan u drugi projekat", () => {
  test("ana (vlasnik Enigma IT) dobija dodatno članstvo u ScanMe; Enigma IT ostaje netaknut", async () => {
    const s = await napraviSvet();

    // Pozivnica za nalog koji već postoji NIJE conflict i ništa ne briše.
    const { token } = await pozovi(s, s.boban, s.wsB, ANA, "client_viewer");
    expect(await s.t.run(async (ctx) => await ctx.db.get(s.ana))).toMatchObject({ email: ANA });
    expect(await clanstva(s, s.ana)).toEqual([{ workspaceId: s.wsA, role: "owner" }]);

    const odgovor = await prihvati(s, s.ana, token);
    expect(odgovor).toEqual({ slug: "scanme" });

    const sva = await clanstva(s, s.ana);
    expect(sva).toHaveLength(2);
    expect(sva).toContainEqual({ workspaceId: s.wsA, role: "owner" });
    expect(sva).toContainEqual({ workspaceId: s.wsB, role: "client_viewer" });

    const iskoriscena = await pozivnica(s, token);
    expect(iskoriscena?.usedAt).toBeTypeOf("number");
    expect(iskoriscena?.usedByUserId).toBe(s.ana);

    // Oba projekta su joj vidljiva, svaki sa svojom ulogom.
    const kaoAna = kao(s, s.ana);
    expect(await kaoAna.query(api.projekti.mojProjekat, { slug: "enigma-it" })).toMatchObject({ uloga: "owner" });
    expect(await kaoAna.query(api.projekti.mojProjekat, { slug: "scanme" })).toMatchObject({
      uloga: "client_viewer",
    });

    // Ponovno prihvatanje (i priprema registracije) pada.
    expect(await greska(prihvati(s, s.ana, token))).toEqual({
      kod: "invite_iskoriscena",
      poruka: "Pozivnica je već iskorišćena.",
    });
    expect((await greska(pripremi(s, token))).kod).toBe("invite_iskoriscena");
    expect(await clanstva(s, s.ana)).toHaveLength(2);
  });

  test("pozivnica nikad ne menja postojeće članstvo: vlasnik ne pada na pregledača", async () => {
    const s = await napraviSvet();
    // Jovan je već vlasnik oba projekta; pozivnica upisana direktno (createInvite ga odbija).
    await ubaciPozivnicu(s, {
      token: "token-za-jovana",
      workspaceId: s.wsB,
      email: "jovan@enigma.test",
      createdBy: s.boban,
      uloga: "client_viewer",
    });
    expect(await prihvati(s, s.jovan, "token-za-jovana")).toEqual({ slug: "scanme" });
    const sva = await clanstva(s, s.jovan);
    expect(sva).toHaveLength(2);
    expect(sva.every((m) => m.role === "owner")).toBe(true);
    // Pozivnica je ipak potrošena.
    expect((await pozivnica(s, "token-za-jovana"))?.usedAt).toBeTypeOf("number");
  });

  test("tuđa pozivnica: „Pozivnica je za drugu adresu.“, bez članstva; bez prijave unauthorized", async () => {
    const s = await napraviSvet();
    const { token } = await pozovi(s, s.boban, s.wsB, ANA, "urednik");

    // Urednica pokušava da prihvati pozivnicu napisanu za anu.
    const tudja = await greska(prihvati(s, s.urednica, token));
    expect(tudja).toEqual({ kod: "email_mismatch", poruka: "Pozivnica je za drugu adresu." });
    expect(await clanstva(s, s.urednica)).toEqual([{ workspaceId: s.wsA, role: "urednik" }]);
    expect((await pozivnica(s, token))?.usedAt).toBeUndefined();

    // Bez prijave.
    await odbijeno(
      s.t.mutation(api.invitesStore.prihvatiPozivnicu, { token }),
      "unauthorized",
    );
    expect((await pozivnica(s, token))?.usedAt).toBeUndefined();

    // Prava vlasnica adrese i dalje može.
    expect(await prihvati(s, s.ana, token)).toEqual({ slug: "scanme" });
  });

  test("nepostojeći i prazan token se odbijaju", async () => {
    const s = await napraviSvet();
    expect(await greska(prihvati(s, s.ana, "nepostojeci-token"))).toEqual({
      kod: "invite_ne_postoji",
      poruka: "Pozivnica ne postoji.",
    });
    expect((await greska(prihvati(s, s.ana, ""))).kod).toBe("invite_ne_postoji");
    expect((await greska(pripremi(s, "nepostojeci-token"))).kod).toBe("invite_ne_postoji");
    expect((await greska(pripremi(s, ""))).kod).toBe("invite_ne_postoji");
  });
});

// ── 6. istekla i povučena ────────────────────────────────────────────────────

describe("istekla i povučena pozivnica", () => {
  test("istekla se odbija i pri prihvatanju i pri pripremi registracije", async () => {
    const s = await napraviSvet();
    const { token } = await pozovi(s, s.boban, s.wsB, NOVA, "urednik");
    const istekla = await pozivnica(s, token);
    await s.t.run(async (ctx) => {
      await ctx.db.patch(istekla!._id, { expiresAt: Date.now() - 1000 });
    });

    const userId = await korisnik(s, NOVA);
    expect(await greska(pripremi(s, token))).toEqual({
      kod: "invite_istekla",
      poruka: "Pozivnica je istekla.",
    });
    expect((await greska(prihvati(s, userId, token))).kod).toBe("invite_istekla");

    // Prozor se nije otvorio, nema članstva, kapija je zatvorena.
    expect((await pozivnica(s, token))?.readyUntil).toBeUndefined();
    await potrosi(s, userId, NOVA);
    expect(await clanstva(s, userId)).toEqual([]);
    expect(await dozvoljeno(s, userId, NOVA)).toBe(false);
  });

  test("povučena se odbija i pri prihvatanju i pri pripremi registracije", async () => {
    const s = await napraviSvet();
    const { token } = await pozovi(s, s.boban, s.wsB, ANA, "urednik");
    const spisak = await kao(s, s.boban).query(api.invitesStore.listInvites, { workspaceId: s.wsB });
    await kao(s, s.boban).mutation(api.invitesStore.revokeInvite, {
      workspaceId: s.wsB,
      inviteId: spisak[0]._id,
    });
    expect((await pozivnica(s, token))?.revokedAt).toBeTypeOf("number");

    expect(await greska(prihvati(s, s.ana, token))).toEqual({
      kod: "invite_povucena",
      poruka: "Pozivnica je povučena.",
    });
    expect((await greska(pripremi(s, token))).kod).toBe("invite_povucena");
    expect(await clanstva(s, s.ana)).toEqual([{ workspaceId: s.wsA, role: "owner" }]);
  });

  test("otvoren prozor povučene pozivnice ne važi: kapija je zatvorena", async () => {
    const s = await napraviSvet();
    const { token } = await pozovi(s, s.boban, s.wsB, NOVA, "urednik");
    const userId = await korisnik(s, NOVA);
    await pripremi(s, token);
    expect(await dozvoljeno(s, userId, NOVA)).toBe(true);

    const spisak = await kao(s, s.boban).query(api.invitesStore.listInvites, { workspaceId: s.wsB });
    await kao(s, s.boban).mutation(api.invitesStore.revokeInvite, {
      workspaceId: s.wsB,
      inviteId: spisak[0]._id,
    });
    expect(await dozvoljeno(s, userId, NOVA)).toBe(false);
    await potrosi(s, userId, NOVA);
    expect(await clanstva(s, userId)).toEqual([]);
  });

  test("tuđ vlasnik ne povlači pozivnicu drugog projekta", async () => {
    const s = await napraviSvet();
    await pozovi(s, s.boban, s.wsB, NOVA, "urednik");
    const spisak = await kao(s, s.boban).query(api.invitesStore.listInvites, { workspaceId: s.wsB });
    // Ana je vlasnik Enigma IT: sa svojim projektom ne sme da dodirne ScanMe pozivnicu.
    await odbijeno(
      kao(s, s.ana).mutation(api.invitesStore.revokeInvite, { workspaceId: s.wsA, inviteId: spisak[0]._id }),
      "forbidden",
    );
    await odbijeno(
      kao(s, s.ana).mutation(api.invitesStore.revokeInvite, { workspaceId: s.wsB, inviteId: spisak[0]._id }),
      "forbidden",
    );
    expect((await kao(s, s.boban).query(api.invitesStore.listInvites, { workspaceId: s.wsB }))[0].status).toBe(
      "vazi",
    );
  });
});

// ── 8. getInvite ─────────────────────────────────────────────────────────────

describe("getInvite (javni upit)", () => {
  test("važeća pozivnica: ime projekta i da li nalog već postoji; ništa više", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.wsB, { brend: { boja: "#22aa88" } });
    });
    const nova = await pozovi(s, s.boban, s.wsB, NOVA, "client_viewer");

    const info = await s.t.query(api.invitesStore.getInvite, { token: nova.token });
    expect(info).toEqual({
      status: "vazi",
      email: NOVA,
      projekat: { ime: "ScanMe", boja: "#22aa88", logoUrl: null },
      postojiNalog: false,
    });
    // Pozivnica za ScanMe ne pominje Enigma IT.
    expect(JSON.stringify(info)).not.toContain("Enigma");
  });

  test("postojiNalog je true tek kad je adresa potvrđena I ima password nalog", async () => {
    const s = await napraviSvet();
    const zaAnu = await pozovi(s, s.boban, s.wsB, ANA);
    const zaUrednicu = await pozovi(s, s.boban, s.wsB, "urednica@enigma.test");
    const postoji = async (token: string) => {
      const info = await s.t.query(api.invitesStore.getInvite, { token });
      expect(info.status).toBe("vazi");
      return "postojiNalog" in info ? info.postojiNalog : undefined;
    };

    expect(await postoji(zaAnu.token)).toBe(false);

    // Potvrđena adresa, ali bez password naloga.
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.ana, { emailVerificationTime: Date.now() });
    });
    expect(await postoji(zaAnu.token)).toBe(false);

    // Potvrđena adresa + password nalog.
    await s.t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId: s.ana,
        provider: "password",
        providerAccountId: ANA,
      });
    });
    expect(await postoji(zaAnu.token)).toBe(true);

    // Password nalog bez potvrđene adrese ne računa se.
    await s.t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId: s.urednica,
        provider: "password",
        providerAccountId: "urednica@enigma.test",
      });
    });
    expect(await postoji(zaUrednicu.token)).toBe(false);
  });

  test("nevažeća pozivnica ne otkriva ni adresu ni projekat", async () => {
    const s = await napraviSvet();
    const istekla = await pozovi(s, s.boban, s.wsB, "istekla@klijent.test");
    const povucena = await pozovi(s, s.boban, s.wsB, "povucena@klijent.test");
    const iskoriscena = await pozovi(s, s.boban, s.wsB, ANA);

    await s.t.run(async (ctx) => {
      const red = await ctx.db
        .query("invites")
        .withIndex("by_workspace_email", (q) => q.eq("workspaceId", s.wsB).eq("email", "istekla@klijent.test"))
        .first();
      await ctx.db.patch(red!._id, { expiresAt: Date.now() - 1000 });
    });
    const spisak = await kao(s, s.boban).query(api.invitesStore.listInvites, { workspaceId: s.wsB });
    const zaPovlacenje = spisak.find((p) => p.email === "povucena@klijent.test")!;
    await kao(s, s.boban).mutation(api.invitesStore.revokeInvite, {
      workspaceId: s.wsB,
      inviteId: zaPovlacenje._id,
    });
    await prihvati(s, s.ana, iskoriscena.token);

    const upit = (token: string) => s.t.query(api.invitesStore.getInvite, { token });
    expect(await upit(istekla.token)).toEqual({ status: "istekla" });
    expect(await upit(povucena.token)).toEqual({ status: "povucena" });
    expect(await upit(iskoriscena.token)).toEqual({ status: "iskoriscena" });
    expect(await upit("nepostojeci-token")).toEqual({ status: "ne_postoji" });
    expect(await upit("")).toEqual({ status: "ne_postoji" });
    for (const t of [istekla.token, povucena.token, iskoriscena.token]) {
      const tekst = JSON.stringify(await upit(t));
      expect(tekst).not.toContain("@");
      expect(tekst).not.toContain("ScanMe");
    }
  });
});

// ── 9. ALLOWED_EMAILS ────────────────────────────────────────────────────────

describe("ALLOWED_EMAILS bez pozivnice", () => {
  test("kapija propušta adresu sa liste, ali ona ne dobija nijedan projekat", async () => {
    const s = await napraviSvet();
    const adresa = "stranac@niko.test";

    // Bez env-a kapija je zatvorena (fail closed).
    expect(await dozvoljeno(s, s.stranac, adresa)).toBe(false);
    vi.stubEnv("ALLOWED_EMAILS", "   ");
    expect(await dozvoljeno(s, s.stranac, adresa)).toBe(false);

    vi.stubEnv("ALLOWED_EMAILS", "Neko@Drugi.test; STRANAC@niko.test, treci@niko.test");
    expect(await dozvoljeno(s, s.stranac, adresa)).toBe(true);
    // Veličina slova i razmaci ne pomažu napadaču ni onome ko je na listi.
    expect(await dozvoljeno(s, s.stranac, "  Stranac@Niko.TEST ")).toBe(true);
    // Adresa koja nije na listi i nema pozivnicu ni članstvo ne ulazi.
    const drugi = await korisnik(s, "drugi@niko.test");
    expect(await dozvoljeno(s, drugi, "drugi@niko.test")).toBe(false);
    // Bez adrese nema ni liste.
    expect(await dozvoljeno(s, drugi, null)).toBe(false);

    // Prijava prolazi, ali bez pozivnice i članstva nema nijednog projekta.
    await potrosi(s, s.stranac, adresa);
    expect(await clanstva(s, s.stranac)).toEqual([]);
    const kaoStranac = kao(s, s.stranac);
    expect(await kaoStranac.query(api.projekti.mojiProjekti, {})).toEqual([]);
    expect(await kaoStranac.query(api.projekti.mojProjekat, { slug: "enigma-it" })).toBeNull();
    expect(await kaoStranac.query(api.projekti.mojProjekat, { slug: "scanme" })).toBeNull();
  });

  test("član projekta sme da uđe i bez liste i bez pozivnice", async () => {
    const s = await napraviSvet();
    expect(await dozvoljeno(s, s.boban, "boban@scanme.test")).toBe(true);
    expect(await dozvoljeno(s, s.klijent, "vlasnik@klijent.test")).toBe(true);
  });
});

// ── 10. promena uloge ────────────────────────────────────────────────────────

describe("promeniUlogu", () => {
  const promeni = (s: Svet, ko: Id<"users">, workspaceId: Id<"workspaces">, userId: Id<"users">, uloga: Uloga) =>
    kao(s, ko).mutation(api.membersStore.promeniUlogu, { workspaceId, userId, uloga });

  test("vlasnik menja ulogu člana svog projekta; drugi projekti istog člana ostaju", async () => {
    const s = await napraviSvet();
    expect(await promeni(s, s.ana, s.wsA, s.urednica, "client_viewer")).toBeNull();
    expect(await clanstva(s, s.urednica)).toEqual([{ workspaceId: s.wsA, role: "client_viewer" }]);

    // Jovan je vlasnik oba projekta: spuštanje u Enigma IT ne dira ScanMe.
    await promeni(s, s.ana, s.wsA, s.jovan, "urednik");
    const jovan = await clanstva(s, s.jovan);
    expect(jovan).toContainEqual({ workspaceId: s.wsA, role: "urednik" });
    expect(jovan).toContainEqual({ workspaceId: s.wsB, role: "owner" });

    // I unapređenje radi.
    await promeni(s, s.ana, s.wsA, s.viewer, "owner");
    expect(await clanstva(s, s.viewer)).toEqual([{ workspaceId: s.wsA, role: "owner" }]);
  });

  test("jedini vlasnik ne može da spusti sebe: bad_request, uloga ostaje", async () => {
    const s = await napraviSvet();
    const odgovor = await greska(promeni(s, s.klijent, s.wsK, s.klijent, "urednik"));
    expect(odgovor.kod).toBe("bad_request");
    expect(odgovor.poruka).toContain("poslednjeg vlasnika");
    expect(await clanstva(s, s.klijent)).toEqual([{ workspaceId: s.wsK, role: "owner" }]);

    // Pravilo važi po projektu: Enigma IT i ScanMe imaju po dva vlasnika
    // (jovan je vlasnik oba), pa jedan sme da side; poslednji više ne sme.
    await promeni(s, s.ana, s.wsA, s.ana, "urednik");
    expect(await clanstva(s, s.ana)).toEqual([{ workspaceId: s.wsA, role: "urednik" }]);
    expect((await greska(promeni(s, s.jovan, s.wsA, s.jovan, "urednik"))).kod).toBe("bad_request");

    await promeni(s, s.boban, s.wsB, s.boban, "client_viewer");
    expect((await greska(promeni(s, s.jovan, s.wsB, s.jovan, "urednik"))).kod).toBe("bad_request");
    // Jovanova uloga u Enigma IT je nezavisna od ScanMe.
    expect(await clanstva(s, s.jovan)).toHaveLength(2);
    expect((await clanstva(s, s.jovan)).every((m) => m.role === "owner")).toBe(true);
  });

  test("urednik i pregledač ne smeju: forbidden; vlasnik drugog projekta takođe", async () => {
    const s = await napraviSvet();
    await odbijeno(promeni(s, s.urednica, s.wsA, s.viewer, "owner"), "forbidden", /vlasnik/);
    await odbijeno(promeni(s, s.viewer, s.wsA, s.viewer, "owner"), "forbidden");
    await odbijeno(promeni(s, s.boban, s.wsA, s.urednica, "client_viewer"), "forbidden", /pristup/);
    await odbijeno(
      s.t.mutation(api.membersStore.promeniUlogu, { workspaceId: s.wsA, userId: s.urednica, uloga: "owner" }),
      "unauthorized",
    );
    expect(await clanstva(s, s.urednica)).toEqual([{ workspaceId: s.wsA, role: "urednik" }]);
    expect(await clanstva(s, s.viewer)).toEqual([{ workspaceId: s.wsA, role: "client_viewer" }]);
  });

  test("meta koja nije član tog projekta: not_found", async () => {
    const s = await napraviSvet();
    await odbijeno(
      promeni(s, s.ana, s.wsA, s.boban, "urednik"),
      "not_found",
      /Ta osoba nije član ovog projekta\./,
    );
    await odbijeno(promeni(s, s.ana, s.wsA, s.stranac, "urednik"), "not_found");
    // Bobanovo članstvo u ScanMe nije dotaknuto.
    expect(await clanstva(s, s.boban)).toEqual([{ workspaceId: s.wsB, role: "owner" }]);
  });
});

// ── 11. listInvites ──────────────────────────────────────────────────────────

describe("listInvites", () => {
  test("vraća ulogu (bez vrednosti u bazi je urednik), status i autora; ne vraća token", async () => {
    const s = await napraviSvet();
    const pre = Date.now() - 10 * DAN;
    await ubaciPozivnicu(s, {
      token: "stari-token",
      workspaceId: s.wsB,
      email: "stara@klijent.test",
      createdBy: s.boban,
      createdAt: pre,
    });
    await pozovi(s, s.boban, s.wsB, NOVA, "client_viewer");

    const spisak = await kao(s, s.boban).query(api.invitesStore.listInvites, { workspaceId: s.wsB });
    expect(spisak).toHaveLength(2);
    // Najnovija prva.
    expect(spisak.map((p) => p.email)).toEqual([NOVA, "stara@klijent.test"]);
    expect(spisak[0]).toMatchObject({ uloga: "client_viewer", status: "vazi", createdByEmail: "boban@scanme.test" });
    // Stara pozivnica: bez polja u bazi → urednik; napravljena pre 10 dana → istekla.
    expect(spisak[1]).toMatchObject({ uloga: "urednik", status: "istekla", createdByEmail: "boban@scanme.test" });

    const tekst = JSON.stringify(spisak);
    expect(tekst).not.toContain("tokenHash");
    expect(tekst).not.toContain("stari-token");
  });

  test("spisak pripada projektu: Enigma IT ne vidi ScanMe pozivnice, tuđ vlasnik ne sme da pita", async () => {
    const s = await napraviSvet();
    await pozovi(s, s.boban, s.wsB, NOVA, "urednik");
    expect(await kao(s, s.ana).query(api.invitesStore.listInvites, { workspaceId: s.wsA })).toEqual([]);
    await odbijeno(kao(s, s.boban).query(api.invitesStore.listInvites, { workspaceId: s.wsA }), "forbidden");
    await odbijeno(kao(s, s.urednica).query(api.invitesStore.listInvites, { workspaceId: s.wsA }), "forbidden");
  });
});

// ── 12. prvi admin ───────────────────────────────────────────────────────────

describe("pripremiAdminSetup", () => {
  const SIFRA = "setup-sifra-za-test-123";
  const pripremiAdmina = (t: Svet["t"], email: string, setupCode = SIFRA) =>
    t.mutation(api.invitesStore.pripremiAdminSetup, { setupCode, email });

  test("u svetu sa projektima prvi admin postaje vlasnik NAJSTARIJEG projekta (Enigma IT)", async () => {
    vi.stubEnv("ADMIN_SETUP_CODE", SIFRA);
    const s = await napraviSvet();

    expect(await pripremiAdmina(s.t, " Prvi.Admin@Enigma.test ")).toBeNull();

    const stanje = await s.t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", "prvi.admin@enigma.test"))
        .first();
      const clanovi = user
        ? await ctx.db
            .query("members")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect()
        : [];
      const pozivnice = await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", "prvi.admin@enigma.test"))
        .collect();
      return { user, clanovi, pozivnice, projekata: (await ctx.db.query("workspaces").collect()).length };
    });

    expect(stanje.user).not.toBeNull();
    expect(stanje.user?.emailVerificationTime).toBeTypeOf("number");
    expect(stanje.clanovi.map((m) => ({ workspaceId: m.workspaceId, role: m.role }))).toEqual([
      { workspaceId: s.wsA, role: "owner" },
    ]);
    // Nov projekat se ne pravi kad već postoje.
    expect(stanje.projekata).toBe(3);
    // Prozor za lozinku je otvoren, uloga je vlasnik.
    expect(stanje.pozivnice).toHaveLength(1);
    expect(stanje.pozivnice[0]).toMatchObject({ workspaceId: s.wsA, uloga: "owner", createdBy: stanje.user?._id });
    expect(stanje.pozivnice[0].readyUntil).toBeGreaterThan(Date.now());
    expect(await dozvoljeno(s, stanje.user!._id, "prvi.admin@enigma.test")).toBe(true);

    // Ponavljanje ne pravi drugo članstvo ni drugu pozivnicu.
    await pripremiAdmina(s.t, "prvi.admin@enigma.test");
    const posle = await s.t.run(async (ctx) => ({
      clanova: (await ctx.db.query("members").withIndex("by_user", (q) => q.eq("userId", stanje.user!._id)).collect()).length,
      pozivnica: (await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", "prvi.admin@enigma.test")).collect()).length,
    }));
    expect(posle).toEqual({ clanova: 1, pozivnica: 1 });
  });

  test("u PRAZNOJ bazi pravi projekat „prvi-projekat“ i vlasničko članstvo", async () => {
    vi.stubEnv("ADMIN_SETUP_CODE", SIFRA);
    const t = convexTest(schema, modules);
    expect(await t.query(api.invitesStore.trebaSetup, {})).toBe(true);

    await pripremiAdmina(t, "admin@prazno.test");

    const stanje = await t.run(async (ctx) => ({
      projekti: await ctx.db.query("workspaces").collect(),
      clanovi: await ctx.db.query("members").collect(),
      users: await ctx.db.query("users").collect(),
      pozivnice: await ctx.db.query("invites").collect(),
    }));
    expect(stanje.projekti).toHaveLength(1);
    expect(stanje.projekti[0]).toMatchObject({ slug: "prvi-projekat", name: "Prvi projekat", vrsta: "interni" });
    expect(stanje.users).toHaveLength(1);
    expect(stanje.clanovi).toHaveLength(1);
    expect(stanje.clanovi[0]).toMatchObject({
      workspaceId: stanje.projekti[0]._id,
      userId: stanje.users[0]._id,
      role: "owner",
    });
    expect(stanje.pozivnice).toHaveLength(1);
    expect(stanje.pozivnice[0]).toMatchObject({ workspaceId: stanje.projekti[0]._id, uloga: "owner" });

    // Ponavljanje ne pravi drugi projekat.
    await pripremiAdmina(t, "admin@prazno.test");
    const ponovo = await t.run(async (ctx) => ({
      projekata: (await ctx.db.query("workspaces").collect()).length,
      clanova: (await ctx.db.query("members").collect()).length,
      pozivnica: (await ctx.db.query("invites").collect()).length,
    }));
    expect(ponovo).toEqual({ projekata: 1, clanova: 1, pozivnica: 1 });

    // Novi vlasnik vidi svoj projekat.
    const kaoAdmin = t.withIdentity({ subject: `${stanje.users[0]._id}|sesija-test` });
    expect((await kaoAdmin.query(api.projekti.mojProjekat, { slug: "prvi-projekat" }))?.uloga).toBe("owner");
  });

  test("zaštite: pogrešna šifra, nekonfigurisan server, postojeći password nalog, loša adresa", async () => {
    const s = await napraviSvet();

    // Server nema ADMIN_SETUP_CODE.
    expect((await greska(pripremiAdmina(s.t, "admin@enigma.test"))).kod).toBe("setup_not_configured");

    vi.stubEnv("ADMIN_SETUP_CODE", SIFRA);
    expect((await greska(pripremiAdmina(s.t, "admin@enigma.test", "pogresna-sifra"))).kod).toBe("bad_setup_code");
    expect((await greska(pripremiAdmina(s.t, "nije-adresa"))).kod).toBe("bad_request");
    // Ništa od toga nije ostavilo trag.
    expect(await s.t.run(async (ctx) => (await ctx.db.query("invites").collect()).length)).toBe(0);
    expect(await s.t.run(async (ctx) => (await ctx.db.query("members").collect()).length)).toBe(7);

    // Kad postoji ijedan password nalog, setup je zatvoren.
    await s.t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", { userId: s.ana, provider: "password", providerAccountId: ANA });
    });
    expect(await s.t.query(api.invitesStore.trebaSetup, {})).toBe(false);
    expect((await greska(pripremiAdmina(s.t, "admin@enigma.test"))).kod).toBe("admin_exists");
    expect(await s.t.run(async (ctx) => (await ctx.db.query("invites").collect()).length)).toBe(0);
  });
});
