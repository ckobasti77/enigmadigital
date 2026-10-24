/// <reference types="vite/client" />
/**
 * Meta deautorizacija i zahtev za brisanje (Threads) idu samo kroz Convex HTTP
 * akciju i rade samo sa ispravnim `signed_request` potpisom.
 */
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  izvuciSignedRequest,
  proveriSignedRequest,
} from "./lib/metaSignedRequest";

const modules = import.meta.glob("./**/*.*s");
const TAJNA = "test-threads-tajna";
const META_KORISNIK = "1789000111";

function base64Url(bajtovi: Uint8Array): string {
  let bin = "";
  for (const b of bajtovi) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `signed_request` kako ga Meta pravi: HMAC-SHA256 nad base64url JSON-om. */
async function potpisi(payload: object, tajna: string): Promise<string> {
  const enc = new TextEncoder();
  const sadrzaj = base64Url(enc.encode(JSON.stringify(payload)));
  const kljuc = await crypto.subtle.importKey(
    "raw",
    enc.encode(tajna),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const potpis = new Uint8Array(await crypto.subtle.sign("HMAC", kljuc, enc.encode(sadrzaj)));
  return `${base64Url(potpis)}.${sadrzaj}`;
}

const ISPRAVAN = { algorithm: "HMAC-SHA256", issued_at: 1_790_000_000, user_id: META_KORISNIK };

function formTelo(signedRequest: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ signed_request: signedRequest }).toString(),
  };
}

describe("metaSignedRequest (čista funkcija)", () => {
  test("prihvata ispravan potpis i vraća sadržaj", async () => {
    const sr = await potpisi(ISPRAVAN, TAJNA);
    expect(await proveriSignedRequest(sr, TAJNA)).toMatchObject({ user_id: META_KORISNIK });
  });

  test("odbija pogrešnu tajnu, izmenjen sadržaj, drugi algoritam i loš format", async () => {
    const sr = await potpisi(ISPRAVAN, TAJNA);
    expect(await proveriSignedRequest(sr, "druga-tajna")).toBeNull();
    expect(await proveriSignedRequest(sr, undefined)).toBeNull();
    expect(await proveriSignedRequest(sr, "  ")).toBeNull();

    const [potpis] = sr.split(".");
    const tudj = base64Url(new TextEncoder().encode(JSON.stringify({ ...ISPRAVAN, user_id: "999" })));
    expect(await proveriSignedRequest(`${potpis}.${tudj}`, TAJNA)).toBeNull();

    const drugiAlgoritam = await potpisi({ ...ISPRAVAN, algorithm: "HMAC-SHA1" }, TAJNA);
    expect(await proveriSignedRequest(drugiAlgoritam, TAJNA)).toBeNull();

    expect(await proveriSignedRequest("bez-tacke", TAJNA)).toBeNull();
    expect(await proveriSignedRequest("a.b.c", TAJNA)).toBeNull();
    expect(await proveriSignedRequest("!!!.???", TAJNA)).toBeNull();
  });

  test("izvlači signed_request iz form, JSON i multipart tela", () => {
    expect(izvuciSignedRequest("application/x-www-form-urlencoded", "signed_request=abc.def")).toBe("abc.def");
    expect(izvuciSignedRequest("application/json", JSON.stringify({ signed_request: "abc.def" }))).toBe("abc.def");
    const granica = "----granica";
    const multipart =
      `--${granica}\r\nContent-Disposition: form-data; name="signed_request"\r\n\r\nabc.def\r\n--${granica}--\r\n`;
    expect(izvuciSignedRequest(`multipart/form-data; boundary=${granica}`, multipart)).toBe("abc.def");
    expect(izvuciSignedRequest("application/x-www-form-urlencoded", "drugo=1")).toBeNull();
    expect(izvuciSignedRequest(null, "")).toBeNull();
  });
});

describe("Convex HTTP akcije /threads/data-deletion i /threads/deauthorize", () => {
  beforeEach(() => {
    vi.useFakeTimers(); // zakazani koraci brisanja (opoziv, prolaz) se ne izvršavaju
    vi.stubEnv("THREADS_APP_SECRET", TAJNA);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  async function svetSaVezom() {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const workspaceId = await ctx.db.insert("workspaces", { name: "Enigma IT", slug: "enigma-it" });
      const connectionId = await ctx.db.insert("connections", {
        workspaceId,
        provider: "threads",
        encryptedCredentials: "sifrovano",
        externalId: META_KORISNIK,
        status: "active",
      });
      return { workspaceId, connectionId };
    });
    return { t, ...ids };
  }

  async function stanje(
    t: TestConvex<typeof schema>,
    connectionId: Id<"connections">,
  ) {
    return await t.run(async (ctx) => ({
      status: (await ctx.db.get(connectionId))?.status,
      brisanja: (await ctx.db.query("purgeRuns").collect()).length,
    }));
  }

  test("brisanje bez potpisa ili sa lažnim potpisom ne radi ništa", async () => {
    const { t, connectionId } = await svetSaVezom();

    const bez = await t.fetch("/threads/data-deletion", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "nesto=drugo",
    });
    expect(bez.status).toBe(401);

    const lazan = await t.fetch("/threads/data-deletion", formTelo(await potpisi(ISPRAVAN, "pogresna")));
    expect(lazan.status).toBe(401);

    expect(await stanje(t, connectionId)).toEqual({ status: "active", brisanja: 0 });
  });

  test("brisanje sa ispravnim potpisom pokreće brisanje i vraća kod potvrde", async () => {
    const { t, connectionId } = await svetSaVezom();

    const odgovor = await t.fetch("/threads/data-deletion", formTelo(await potpisi(ISPRAVAN, TAJNA)));
    expect(odgovor.status).toBe(200);
    const telo = (await odgovor.json()) as { confirmation_code: string };
    expect(typeof telo.confirmation_code).toBe("string");
    expect(await stanje(t, connectionId)).toEqual({ status: "disconnecting", brisanja: 1 });

    // Javna stranica statusa čita samo pravi kod brisanja.
    const run = await t.run(async (ctx) => (await ctx.db.query("purgeRuns").first())!._id);
    expect(telo.confirmation_code).toBe(run);
  });

  test("bez tajne u env-u ni ispravno potpisan zahtev ne prolazi", async () => {
    vi.stubEnv("THREADS_APP_SECRET", "");
    const { t, connectionId } = await svetSaVezom();
    const odgovor = await t.fetch("/threads/data-deletion", formTelo(await potpisi(ISPRAVAN, TAJNA)));
    expect(odgovor.status).toBe(401);
    expect(await stanje(t, connectionId)).toEqual({ status: "active", brisanja: 0 });
  });

  test("deautorizacija radi samo sa ispravnim potpisom", async () => {
    const { t, connectionId } = await svetSaVezom();

    const lazan = await t.fetch("/threads/deauthorize", formTelo(await potpisi(ISPRAVAN, "pogresna")));
    expect(lazan.status).toBe(401);
    expect((await stanje(t, connectionId)).status).toBe("active");

    const ispravan = await t.fetch("/threads/deauthorize", formTelo(await potpisi(ISPRAVAN, TAJNA)));
    expect(ispravan.status).toBe(200);
    expect((await stanje(t, connectionId)).status).toBe("expired");
  });
});
