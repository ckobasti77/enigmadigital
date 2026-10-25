/// <reference types="vite/client" />
/**
 * OAuth povratak (plan C10 §5): jedna registrovana povratna adresa za sve
 * projekte (`OAUTH_CALLBACK_ORIGIN`), a adresu na koju callback vraća korisnika
 * server proverava pri izdavanju stanja i ponovo pri trošenju. Klijent šalje
 * samo origin, putanju gradi server.
 *
 * `proveriPovratak` se ovde proverava kroz `createOAuthState` (upisan red u
 * `oauthStates` je jedini trag), a odbijanje znači: kod `povratak_odbijen` i
 * nijedan upisan red.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { SEGMENT, type OAuthProvider } from "./lib/oauthPovratak";
import { kao, napraviSvet, type Svet } from "./projekatTest.pomoc";

const CB = "https://cb.example";
const PUTANJA = "/settings?tab=integracije";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Svaki test kreće od „ništa nije podešeno“; ono što mu treba, postavlja sam.
beforeEach(() => {
  vi.stubEnv("OAUTH_CALLBACK_ORIGIN", undefined);
  vi.stubEnv("HUB_HOSTS", undefined);
});

/** Kod ConvexError-a (ili `null` kad poziv prođe); ostale greške se vide u poruci. */
async function kodGreske(poziv: Promise<unknown>): Promise<string | null> {
  try {
    await poziv;
    return null;
  } catch (e) {
    const kod = (e as { data?: { code?: string } }).data?.code;
    return kod ?? `bez koda: ${e instanceof Error ? e.message : String(e)}`;
  }
}

const STORES = {
  meta_ig: {
    izdaj: internal.instagramStore.createOAuthState,
    potrosi: internal.instagramStore.consumeOAuthState,
  },
  meta_fb: {
    izdaj: internal.facebookStore.createOAuthState,
    potrosi: internal.facebookStore.consumeOAuthState,
  },
  threads: {
    izdaj: internal.threadsStore.createOAuthState,
    potrosi: internal.threadsStore.consumeOAuthState,
  },
  youtube: {
    izdaj: internal.youtubeStore.createOAuthState,
    potrosi: internal.youtubeStore.consumeOAuthState,
  },
  google_business: {
    izdaj: internal.gbpStore.createOAuthState,
    potrosi: internal.gbpStore.consumeOAuthState,
  },
} as const;
const PROVIDERI = Object.keys(STORES) as OAuthProvider[];

let brojac = 0;
const noviNonce = () => `nonce-${++brojac}`;

/** Izda stanje preko prodavnice datog provajdera i vrati nonce. */
async function izdaj(
  s: Svet,
  workspaceId: Id<"workspaces">,
  povratakOrigin: string,
  provider: OAuthProvider = "youtube",
): Promise<string> {
  const nonce = noviNonce();
  await s.t.mutation(STORES[provider].izdaj, {
    workspaceId,
    userId: s.jovan,
    nonce,
    redirectUri: `${CB}/api/auth/callback/${SEGMENT[provider]}`,
    povratakOrigin,
  });
  return nonce;
}

async function red(s: Svet, nonce: string): Promise<Doc<"oauthStates"> | null> {
  return await s.t.run(async (ctx) =>
    ctx.db
      .query("oauthStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .first(),
  );
}

async function sviRedovi(s: Svet): Promise<Doc<"oauthStates">[]> {
  return await s.t.run(async (ctx) => ctx.db.query("oauthStates").collect());
}

async function dodajDomen(
  s: Svet,
  host: string,
  workspaceId: Id<"workspaces">,
): Promise<Id<"projekatDomeni">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("projekatDomeni", { host, workspaceId, createdAt: 1 }),
  );
}

async function ukloniDomen(s: Svet, id: Id<"projekatDomeni">): Promise<void> {
  await s.t.run(async (ctx) => ctx.db.delete(id));
}

// ── Podešenost ──────────────────────────────────────────────────────────────

describe("bez OAUTH_CALLBACK_ORIGIN", () => {
  test("povezivanje pada sa oauth_nije_podesen i ne ostavlja stanje", async () => {
    const s = await napraviSvet();
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_ID", "klijent-id");
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_SECRET", "klijent-tajna");

    const kod = await kodGreske(
      kao(s, s.ana).action(api.gbp.gbpAuthorizeUrl, {
        workspaceId: s.wsA,
        povratakOrigin: "https://x.example",
      }),
    );
    expect(kod).toBe("oauth_nije_podesen");
    expect(await sviRedovi(s)).toEqual([]);
  });

  test("stanje: podeseno je false bez env-a, true sa ispravnim, false sa neispravnim", async () => {
    const s = await napraviSvet();

    expect(await kao(s, s.ana).query(api.oauthPovratak.stanje, {})).toEqual({ podeseno: false });

    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", CB);
    expect(await kao(s, s.ana).query(api.oauthPovratak.stanje, {})).toEqual({ podeseno: true });

    // Putanja nije dozvoljena: kartica Integracije ne sme da ponudi „Poveži“.
    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", `${CB}/x`);
    expect(await kao(s, s.ana).query(api.oauthPovratak.stanje, {})).toEqual({ podeseno: false });
  });

  test("stanje traži prijavu", async () => {
    const s = await napraviSvet();
    expect(await kodGreske(s.t.query(api.oauthPovratak.stanje, {}))).toBe("unauthorized");
  });
});

// ── Provera adrese povratka pri izdavanju ───────────────────────────────────

describe("proveriPovratak (kroz createOAuthState)", () => {
  beforeEach(() => {
    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", CB);
  });

  describe("prihvaćeno", () => {
    test("panel domen projekta: povratak ide na /settings tog domena", async () => {
      const s = await napraviSvet();
      await dodajDomen(s, "panel.scanme.example", s.wsB);

      for (const origin of [
        "https://panel.scanme.example",
        "https://panel.scanme.example/",
        "https://PANEL.ScanMe.Example",
        "  https://panel.scanme.example  ",
      ]) {
        const nonce = await izdaj(s, s.wsB, origin);
        expect((await red(s, nonce))?.povratak, origin).toBe(
          `https://panel.scanme.example${PUTANJA}`,
        );
      }
    });

    test("upisano stanje nosi projekat, korisnika, provajdera i redirect_uri", async () => {
      const s = await napraviSvet();
      await dodajDomen(s, "panel.scanme.example", s.wsB);
      const nonce = await izdaj(s, s.wsB, "https://panel.scanme.example", "threads");

      const upisano = await red(s, nonce);
      expect(upisano).toMatchObject({
        workspaceId: s.wsB,
        userId: s.jovan,
        provider: "threads",
        nonce,
        redirectUri: `${CB}/api/auth/callback/threads`,
      });
      expect(await sviRedovi(s)).toHaveLength(1);
    });

    test("hub iz HUB_HOSTS: putanju sa slugom projekta gradi server", async () => {
      const s = await napraviSvet();
      vi.stubEnv("HUB_HOSTS", "hub.example");

      const a = await izdaj(s, s.wsA, "https://hub.example");
      expect((await red(s, a))?.povratak).toBe(`https://hub.example/enigma-it${PUTANJA}`);
      const b = await izdaj(s, s.wsB, "https://hub.example");
      expect((await red(s, b))?.povratak).toBe(`https://hub.example/scanme${PUTANJA}`);
    });

    test("HUB_HOSTS: lista sa razmacima, velikim slovima i portom", async () => {
      const s = await napraviSvet();
      vi.stubEnv("HUB_HOSTS", "drugi.example, Hub.Example:443");

      const nonce = await izdaj(s, s.wsA, "https://hub.example");
      expect((await red(s, nonce))?.povratak).toBe(`https://hub.example/enigma-it${PUTANJA}`);
    });

    test("host iz OAUTH_CALLBACK_ORIGIN je hub i bez HUB_HOSTS", async () => {
      const s = await napraviSvet();

      const nonce = await izdaj(s, s.wsA, CB);
      expect((await red(s, nonce))?.povratak).toBe(`${CB}/enigma-it${PUTANJA}`);
    });

    test("domen mapiran na projekat ima prednost nad hubom", async () => {
      const s = await napraviSvet();
      // Callback host je istovremeno panel domen projekta B.
      await dodajDomen(s, "cb.example", s.wsB);

      const nonce = await izdaj(s, s.wsB, CB);
      expect((await red(s, nonce))?.povratak).toBe(`${CB}${PUTANJA}`);
      // Za projekat A isti host je tuđ domen, a ne hub.
      expect(await kodGreske(izdaj(s, s.wsA, CB))).toBe("povratak_odbijen");
    });

    test("lokalni razvoj: http localhost sa istim portom vodi na hub putanju", async () => {
      const s = await napraviSvet();
      vi.stubEnv("OAUTH_CALLBACK_ORIGIN", "http://localhost:3105");

      const nonce = await izdaj(s, s.wsA, "http://localhost:3105");
      expect((await red(s, nonce))?.povratak).toBe(
        "http://localhost:3105/enigma-it/settings?tab=integracije",
      );
    });

    test("lokalni razvoj: svaki lokalni host je hub, ali samo dok je callback lokalan", async () => {
      const s = await napraviSvet();
      vi.stubEnv("OAUTH_CALLBACK_ORIGIN", "http://localhost:3105");

      const drugiPort = await izdaj(s, s.wsB, "http://localhost:3000");
      expect((await red(s, drugiPort))?.povratak).toBe(`http://localhost:3000/scanme${PUTANJA}`);
      const povratnaPetlja = await izdaj(s, s.wsB, "http://127.0.0.1:3105");
      expect((await red(s, povratnaPetlja))?.povratak).toBe(
        `http://127.0.0.1:3105/scanme${PUTANJA}`,
      );

      // Javni callback: lokalni host više nije hub.
      vi.stubEnv("OAUTH_CALLBACK_ORIGIN", CB);
      expect(await kodGreske(izdaj(s, s.wsB, "http://localhost:3000"))).toBe("povratak_odbijen");
    });
  });

  describe("odbijeno", () => {
    type Slucaj = {
      ime: string;
      ws: "A" | "B";
      origin: string;
      hub?: string;
    };
    const SLUCAJEVI: Slucaj[] = [
      { ime: "tuđ domen", ws: "A", origin: "https://evil.example" },
      { ime: "domen drugog projekta", ws: "A", origin: "https://panel.scanme.example" },
      {
        ime: "domen drugog projekta, čak i kad je naveden u HUB_HOSTS",
        ws: "A",
        origin: "https://panel.scanme.example",
        hub: "panel.scanme.example",
      },
      { ime: "http za mapirani domen", ws: "B", origin: "http://panel.scanme.example" },
      { ime: "korisnik u adresi", ws: "B", origin: "https://user@panel.scanme.example" },
      { ime: "korisnik i lozinka u adresi", ws: "B", origin: "https://user:pw@panel.scanme.example" },
      { ime: "putanja", ws: "A", origin: "https://hub.example/x", hub: "hub.example" },
      { ime: "upit", ws: "A", origin: "https://hub.example?a=1", hub: "hub.example" },
      { ime: "upit posle kose crte", ws: "A", origin: "https://hub.example/?a=1", hub: "hub.example" },
      { ime: "heš", ws: "A", origin: "https://hub.example#x", hub: "hub.example" },
      { ime: "javascript: adresa", ws: "A", origin: "javascript:alert(1)" },
      { ime: "ftp adresa", ws: "A", origin: "ftp://hub.example", hub: "hub.example" },
      { ime: "http za host sa huba", ws: "A", origin: "http://hub.example", hub: "hub.example" },
      { ime: "host van huba kad HUB_HOSTS nije podešen", ws: "A", origin: "https://hub.example" },
      {
        ime: "lokalni http dok je OAUTH_CALLBACK_ORIGIN https",
        ws: "A",
        origin: "http://localhost:3000",
      },
      { ime: "IPv6 literal", ws: "A", origin: "https://[::1]" },
      { ime: "tekst koji nije adresa", ws: "A", origin: "nije adresa" },
      { ime: "prazan origin", ws: "A", origin: "" },
    ];

    test.each(SLUCAJEVI)("$ime", async ({ ws, origin, hub }) => {
      const s = await napraviSvet();
      await dodajDomen(s, "panel.scanme.example", s.wsB);
      if (hub !== undefined) vi.stubEnv("HUB_HOSTS", hub);

      const kod = await kodGreske(izdaj(s, ws === "A" ? s.wsA : s.wsB, origin));
      expect(kod).toBe("povratak_odbijen");
      expect(await sviRedovi(s)).toEqual([]);
    });

    test("odbijanje ne briše ni ne menja stanja koja već postoje", async () => {
      const s = await napraviSvet();
      await dodajDomen(s, "panel.scanme.example", s.wsB);
      const postojece = await izdaj(s, s.wsB, "https://panel.scanme.example");

      expect(await kodGreske(izdaj(s, s.wsA, "https://evil.example"))).toBe("povratak_odbijen");
      expect(await sviRedovi(s)).toHaveLength(1);
      expect(await red(s, postojece)).not.toBeNull();
    });
  });

  test("novo stanje briše stanja starija od sat vremena, svežija ostaju", async () => {
    const s = await napraviSvet();
    vi.stubEnv("HUB_HOSTS", "hub.example");
    const sada = Date.now();
    await s.t.run(async (ctx) => {
      for (const [nonce, createdAt] of [
        ["staro", sada - 2 * 60 * 60 * 1000],
        ["sveze", sada - 5 * 60 * 1000],
      ] as const) {
        await ctx.db.insert("oauthStates", {
          workspaceId: s.wsA,
          userId: s.ana,
          provider: "youtube",
          nonce,
          redirectUri: `${CB}/api/auth/callback/youtube`,
          createdAt,
        });
      }
    });

    const novo = await izdaj(s, s.wsA, "https://hub.example");
    expect(await red(s, "staro")).toBeNull();
    expect(await red(s, "sveze")).not.toBeNull();
    expect(await red(s, novo)).not.toBeNull();
  });
});

// ── Ponovna provera pri trošenju ────────────────────────────────────────────

describe("trošenje stanja ponovo proverava povratak", () => {
  beforeEach(() => {
    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", CB);
  });

  test("domen je i dalje projektov: povratak se vraća, a stanje se briše", async () => {
    const s = await napraviSvet();
    await dodajDomen(s, "panel.scanme.example", s.wsB);
    const nonce = await izdaj(s, s.wsB, "https://panel.scanme.example");

    const potroseno = await s.t.mutation(internal.youtubeStore.consumeOAuthState, { nonce });
    expect(potroseno).toMatchObject({
      workspaceId: s.wsB,
      redirectUri: `${CB}/api/auth/callback/youtube`,
      povratak: `https://panel.scanme.example${PUTANJA}`,
    });
    expect(await red(s, nonce)).toBeNull();
    // Jednokratno: drugi pokušaj sa istim nonce-om ne nalazi ništa.
    expect(await s.t.mutation(internal.youtubeStore.consumeOAuthState, { nonce })).toBeNull();
  });

  test("domen uklonjen u međuvremenu: povratak je null, a stanje je ipak potrošeno", async () => {
    const s = await napraviSvet();
    const domen = await dodajDomen(s, "panel.scanme.example", s.wsB);
    const nonce = await izdaj(s, s.wsB, "https://panel.scanme.example");
    await ukloniDomen(s, domen);

    const potroseno = await s.t.mutation(internal.youtubeStore.consumeOAuthState, { nonce });
    expect(potroseno).not.toBeNull();
    expect(potroseno).toMatchObject({ workspaceId: s.wsB, povratak: null });
    expect(await red(s, nonce)).toBeNull();
  });

  test("domen prebačen na drugi projekat: povratak je null", async () => {
    const s = await napraviSvet();
    const domen = await dodajDomen(s, "panel.scanme.example", s.wsB);
    const nonce = await izdaj(s, s.wsB, "https://panel.scanme.example");
    await ukloniDomen(s, domen);
    await dodajDomen(s, "panel.scanme.example", s.wsA);

    const potroseno = await s.t.mutation(internal.youtubeStore.consumeOAuthState, { nonce });
    expect(potroseno).toMatchObject({ workspaceId: s.wsB, povratak: null });
  });

  test("host uklonjen iz HUB_HOSTS u međuvremenu: povratak je null", async () => {
    const s = await napraviSvet();
    vi.stubEnv("HUB_HOSTS", "hub.example");
    const nonce = await izdaj(s, s.wsA, "https://hub.example");
    vi.stubEnv("HUB_HOSTS", undefined);

    const potroseno = await s.t.mutation(internal.youtubeStore.consumeOAuthState, { nonce });
    expect(potroseno).toMatchObject({ workspaceId: s.wsA, povratak: null });
  });

  test("stanje bez sačuvanog povratka (stari red) daje povratak null", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) =>
      ctx.db.insert("oauthStates", {
        workspaceId: s.wsA,
        userId: s.ana,
        provider: "youtube",
        nonce: "stari-red",
        redirectUri: `${CB}/api/auth/callback/youtube`,
        createdAt: Date.now(),
      }),
    );

    const potroseno = await s.t.mutation(internal.youtubeStore.consumeOAuthState, {
      nonce: "stari-red",
    });
    expect(potroseno).toMatchObject({ workspaceId: s.wsA, povratak: null });
  });

  test("nepoznat nonce daje null", async () => {
    const s = await napraviSvet();
    expect(await s.t.mutation(internal.youtubeStore.consumeOAuthState, { nonce: "nema" })).toBeNull();
  });
});

describe("stanje drugog provajdera", () => {
  beforeEach(() => {
    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", CB);
  });

  test("Instagram ne troši YouTube stanje: vraća null, red ostaje, YouTube ga potroši", async () => {
    const s = await napraviSvet();
    const nonce = await izdaj(s, s.wsA, CB, "youtube");

    expect(await s.t.mutation(internal.instagramStore.consumeOAuthState, { nonce })).toBeNull();
    expect(await red(s, nonce)).not.toBeNull();

    const potroseno = await s.t.mutation(internal.youtubeStore.consumeOAuthState, { nonce });
    expect(potroseno).toMatchObject({ workspaceId: s.wsA });
    expect(await red(s, nonce)).toBeNull();
  });

  test("svaki od pet provajdera troši samo svoje stanje", async () => {
    const s = await napraviSvet();

    for (const vlasnik of PROVIDERI) {
      const nonce = await izdaj(s, s.wsA, CB, vlasnik);
      for (const drugi of PROVIDERI.filter((p) => p !== vlasnik)) {
        expect(
          await s.t.mutation(STORES[drugi].potrosi, { nonce }),
          `${drugi} nad stanjem ${vlasnik}`,
        ).toBeNull();
        expect(await red(s, nonce), `${vlasnik} posle pokušaja ${drugi}`).not.toBeNull();
      }
      const svoje = await s.t.mutation(STORES[vlasnik].potrosi, { nonce });
      expect(svoje, vlasnik).toMatchObject({
        workspaceId: s.wsA,
        redirectUri: `${CB}/api/auth/callback/${SEGMENT[vlasnik]}`,
        povratak: `${CB}/enigma-it${PUTANJA}`,
      });
      expect(await red(s, nonce)).toBeNull();
    }
  });
});

// ── Javno čitanje adrese povratka ───────────────────────────────────────────

describe("oauthPovratak.procitaj", () => {
  beforeEach(() => {
    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", CB);
  });

  test("vraća sačuvanu adresu bez prijave i ne troši stanje", async () => {
    const s = await napraviSvet();
    await dodajDomen(s, "panel.scanme.example", s.wsB);
    const nonce = await izdaj(s, s.wsB, "https://panel.scanme.example");
    const pre = await sviRedovi(s);

    const prvi = await s.t.query(api.oauthPovratak.procitaj, { state: nonce });
    const drugi = await s.t.query(api.oauthPovratak.procitaj, { state: nonce });
    expect(prvi).toBe(`https://panel.scanme.example${PUTANJA}`);
    expect(drugi).toBe(prvi);

    const posle = await sviRedovi(s);
    expect(posle).toHaveLength(pre.length);
    expect(posle.map((r) => r._id)).toEqual(pre.map((r) => r._id));
    // Stanje je i dalje upotrebljivo za razmenu koda.
    expect(await s.t.mutation(internal.youtubeStore.consumeOAuthState, { nonce })).not.toBeNull();
  });

  test("nepoznato, prazno ili predugo stanje daje null", async () => {
    const s = await napraviSvet();
    expect(await s.t.query(api.oauthPovratak.procitaj, { state: "nepoznato" })).toBeNull();
    expect(await s.t.query(api.oauthPovratak.procitaj, { state: "" })).toBeNull();
    expect(await s.t.query(api.oauthPovratak.procitaj, { state: "x".repeat(201) })).toBeNull();
  });

  test("iskorišćeno stanje daje null", async () => {
    const s = await napraviSvet();
    const nonce = await izdaj(s, s.wsA, CB);
    await s.t.mutation(internal.youtubeStore.consumeOAuthState, { nonce });

    expect(await s.t.query(api.oauthPovratak.procitaj, { state: nonce })).toBeNull();
  });

  test("domen uklonjen posle izdavanja: null, a ne stara adresa", async () => {
    const s = await napraviSvet();
    const domen = await dodajDomen(s, "panel.scanme.example", s.wsB);
    const nonce = await izdaj(s, s.wsB, "https://panel.scanme.example");
    await ukloniDomen(s, domen);

    expect(await s.t.query(api.oauthPovratak.procitaj, { state: nonce })).toBeNull();
    expect(await red(s, nonce)).not.toBeNull();
  });

  test("isteklo, a neobrisano stanje i dalje daje svoju adresu", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) =>
      ctx.db.insert("oauthStates", {
        workspaceId: s.wsA,
        userId: s.ana,
        provider: "google_business",
        nonce: "isteklo",
        redirectUri: `${CB}/api/auth/callback/google-business`,
        createdAt: 1,
        povratak: `${CB}/enigma-it${PUTANJA}`,
      }),
    );

    expect(await s.t.query(api.oauthPovratak.procitaj, { state: "isteklo" })).toBe(
      `${CB}/enigma-it${PUTANJA}`,
    );
  });

  test("stanje bez sačuvanog povratka daje null", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) =>
      ctx.db.insert("oauthStates", {
        workspaceId: s.wsA,
        userId: s.ana,
        provider: "youtube",
        nonce: "bez-povratka",
        redirectUri: `${CB}/api/auth/callback/youtube`,
        createdAt: Date.now(),
      }),
    );

    expect(await s.t.query(api.oauthPovratak.procitaj, { state: "bez-povratka" })).toBeNull();
  });
});

// ── Akcije koje izdaju autorizacionu adresu ─────────────────────────────────

describe("akcije za povezivanje", () => {
  type Akcija = {
    ime: string;
    provider: OAuthProvider;
    env: Record<string, string>;
    poziv: (s: Svet, povratakOrigin: string) => Promise<{ url: string }>;
  };

  const AKCIJE: Akcija[] = [
    {
      ime: "Google Business",
      provider: "google_business",
      env: { GOOGLE_BUSINESS_CLIENT_ID: "klijent-id", GOOGLE_BUSINESS_CLIENT_SECRET: "tajna" },
      poziv: (s, povratakOrigin) =>
        kao(s, s.ana).action(api.gbp.gbpAuthorizeUrl, { workspaceId: s.wsA, povratakOrigin }),
    },
    {
      ime: "YouTube",
      provider: "youtube",
      env: { YOUTUBE_CLIENT_ID: "klijent-id", YOUTUBE_CLIENT_SECRET: "tajna" },
      poziv: (s, povratakOrigin) =>
        kao(s, s.ana).action(api.youtube.youtubeAuthorizeUrl, { workspaceId: s.wsA, povratakOrigin }),
    },
    {
      ime: "Threads",
      provider: "threads",
      env: { THREADS_APP_ID: "app-id", THREADS_APP_SECRET: "tajna" },
      poziv: (s, povratakOrigin) =>
        kao(s, s.ana).action(api.threads.threadsAuthorizeUrl, { workspaceId: s.wsA, povratakOrigin }),
    },
    {
      ime: "Facebook",
      provider: "meta_fb",
      env: { FACEBOOK_APP_ID: "app-id", FACEBOOK_APP_SECRET: "tajna" },
      poziv: (s, povratakOrigin) =>
        kao(s, s.ana).action(api.facebook.getOAuthUrl, { workspaceId: s.wsA, povratakOrigin }),
    },
  ];

  function postaviEnv(a: Akcija) {
    for (const [ime, vrednost] of Object.entries(a.env)) vi.stubEnv(ime, vrednost);
  }

  test("Google Business: redirect_uri i povratak gradi server, a stanje ih pamti", async () => {
    const s = await napraviSvet();
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_ID", "klijent-id");
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_SECRET", "klijent-tajna");
    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", CB);

    const { url } = await kao(s, s.ana).action(api.gbp.gbpAuthorizeUrl, {
      workspaceId: s.wsA,
      povratakOrigin: CB,
    });

    const adresa = new URL(url);
    expect(adresa.hostname).toBe("accounts.google.com");
    const redirectUri = adresa.searchParams.get("redirect_uri");
    expect(redirectUri).toBe(`${CB}/api/auth/callback/google-business`);

    const stanja = await sviRedovi(s);
    expect(stanja).toHaveLength(1);
    expect(stanja[0]).toMatchObject({
      workspaceId: s.wsA,
      userId: s.ana,
      provider: "google_business",
      redirectUri,
      povratak: `${CB}/enigma-it/settings?tab=integracije`,
    });
    // `state` iz adrese je baš sačuvani nonce, pa ga callback može potrošiti.
    expect(adresa.searchParams.get("state")).toBe(stanja[0].nonce);
  });

  test("Google Business: tuđ povratni origin se odbija i ne ostavlja stanje", async () => {
    const s = await napraviSvet();
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_ID", "klijent-id");
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_SECRET", "klijent-tajna");
    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", CB);

    const kod = await kodGreske(
      kao(s, s.ana).action(api.gbp.gbpAuthorizeUrl, {
        workspaceId: s.wsA,
        povratakOrigin: "https://evil.example",
      }),
    );
    expect(kod).toBe("povratak_odbijen");
    expect(await sviRedovi(s)).toEqual([]);
  });

  test.each(AKCIJE)("$ime: bez OAUTH_CALLBACK_ORIGIN pada pre bilo kakvog upisa", async (a) => {
    const s = await napraviSvet();
    postaviEnv(a);

    expect(await kodGreske(a.poziv(s, CB))).toBe("oauth_nije_podesen");
    expect(await sviRedovi(s)).toEqual([]);
  });

  test.each(AKCIJE)("$ime: redirect_uri dolazi iz env-a, povratak je proveren", async (a) => {
    const s = await napraviSvet();
    postaviEnv(a);
    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", CB);

    const { url } = await a.poziv(s, CB);
    const redirectUri = `${CB}/api/auth/callback/${SEGMENT[a.provider]}`;
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(redirectUri);

    const stanja = await sviRedovi(s);
    expect(stanja).toHaveLength(1);
    expect(stanja[0]).toMatchObject({
      workspaceId: s.wsA,
      userId: s.ana,
      provider: a.provider,
      redirectUri,
      povratak: `${CB}/enigma-it${PUTANJA}`,
    });
  });

  test.each(AKCIJE)("$ime: tuđ povratni origin se odbija", async (a) => {
    const s = await napraviSvet();
    postaviEnv(a);
    vi.stubEnv("OAUTH_CALLBACK_ORIGIN", CB);

    expect(await kodGreske(a.poziv(s, "https://evil.example"))).toBe("povratak_odbijen");
    expect(await sviRedovi(s)).toEqual([]);
  });
});
