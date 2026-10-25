import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { projekatQuery } from "./lib/projekat";
import { CRON_LOCKS, withCronLock } from "./lib/cronLock";
import { podesavanjaProjekta, stanjeTajne } from "./lib/podesavanja";
import { podesavanjaZaAkciju, procitajTajnu } from "./lib/podesavanjaAkcija";
import { proveriAdresuNaSajtu } from "./lib/podesavanjaPravila";
import {
  PULS_BRISANJE_PO_UPISU,
  PULS_ISTEK_MS,
  PULS_MAX_BAJTOVA,
  PULS_MAX_PROJEKATA,
  PULS_PARALELNO,
  PULS_ZADRZAVANJE_MS,
  PULS_ZASTAREO_MS,
  parsirajPuls,
  pulsGreskaValidator,
  type PulsGreska,
} from "./lib/puls";

/**
 * ============================================================================
 * PULS (C17, PROJEKTI-PLAN §11, plan C15 §5)
 * ============================================================================
 *
 * Na 15 minuta (cron) Enigma pita sajt svakog projekta koji je podesio Puls
 * (`podesavanja.pulsUrl` + tajna „puls_token“) za brojke poslovanja i čuva
 * jedan red u `pulsSnimci`. Kartica „Poslovanje“ na kontrolnoj tabli ih čita.
 *
 * PRAVILA:
 * - Greška jednog projekta nikad ne prekida ostale (`Promise.allSettled`, i
 *   svaka greška postaje red sa `greska`, ne izuzetak).
 * - Preusmerenja se NE prate (`redirect: "manual"`): adresa je proverena
 *   protiv sajtova projekta, a preusmerenje bi je zaobišlo (SSRF). Adresa se
 *   ponovo proverava pri svakom pozivu, jer sajtovi mogu da se promene.
 * - Token i telo odgovora se ne loguju i ne čuvaju; `poruka` je naša rečenica.
 * - Bez adrese ili tokena nema poziva ni reda (kartica to kaže sama).
 * ============================================================================
 */

const DAN_MS = 24 * 60 * 60 * 1000;
const SAT_MS = 60 * 60 * 1000;
/** Koliko poslednjih redova kartica čita (greške u nizu i poslednji uspeh). */
const KARTICA_REDOVA = 100;

const snimakArgs = {
  workspaceId: v.id("workspaces"),
  at: v.number(),
  vreme: v.optional(v.number()),
  metrike: v.optional(v.record(v.string(), v.number())),
  oznake: v.optional(v.record(v.string(), v.string())),
  greska: v.optional(v.object({ kod: pulsGreskaValidator, poruka: v.string() })),
  trajanjeMs: v.optional(v.number()),
};

// ── interni put cron-a ───────────────────────────────────────────────────────

/** Projekti sa podešenom adresom Pulsa (interno: prolaz kroz sve projekte). */
export const projektiSaPulsom = internalQuery({
  args: {},
  returns: v.array(v.id("workspaces")),
  handler: async (ctx) => {
    const izlaz: Id<"workspaces">[] = [];
    for await (const ws of ctx.db.query("workspaces")) {
      if (ws.arhiviran === true) continue;
      const url = ws.podesavanja?.pulsUrl;
      if (typeof url !== "string" || url.trim().length === 0) continue;
      izlaz.push(ws._id);
      if (izlaz.length >= PULS_MAX_PROJEKATA) break;
    }
    return izlaz;
  },
});

/** Upis jednog prolaza i brisanje redova starijih od 90 dana (najviše 50). */
export const upisiSnimak = internalMutation({
  args: snimakArgs,
  returns: v.id("pulsSnimci"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("pulsSnimci", args);
    const granica = Date.now() - PULS_ZADRZAVANJE_MS;
    const stari = await ctx.db
      .query("pulsSnimci")
      .withIndex("by_workspace_at", (q) =>
        q.eq("workspaceId", args.workspaceId).lt("at", granica),
      )
      .take(PULS_BRISANJE_PO_UPISU);
    for (const red of stari) await ctx.db.delete(red._id);
    return id;
  },
});

type Ishod =
  | { ok: true; vreme: number; metrike: Record<string, number>; oznake: Record<string, string> | null }
  | { ok: false; kod: PulsGreska; poruka: string };

const greska = (kod: PulsGreska, poruka: string): Ishod => ({ ok: false, kod, poruka });

/**
 * Telo odgovora, najviše `PULS_MAX_BAJTOVA`. Čitanje se prekida čim pređe
 * granicu, da veliki odgovor ne napuni memoriju akcije.
 */
async function procitajTelo(
  res: Response,
): Promise<{ ok: true; tekst: string } | { ok: false }> {
  if (res.body === null) return { ok: true, tekst: "" };
  const citac = res.body.getReader();
  const delovi: Uint8Array[] = [];
  let ukupno = 0;
  for (;;) {
    const { done, value } = await citac.read();
    if (done) break;
    ukupno += value.byteLength;
    if (ukupno > PULS_MAX_BAJTOVA) {
      await citac.cancel().catch(() => undefined);
      return { ok: false };
    }
    delovi.push(value);
  }
  const spojeno = new Uint8Array(ukupno);
  let pomeraj = 0;
  for (const deo of delovi) {
    spojeno.set(deo, pomeraj);
    pomeraj += deo.byteLength;
  }
  return { ok: true, tekst: new TextDecoder().decode(spojeno) };
}

/** Jedan poziv Pulsa: GET sa tokenom, bez preusmerenja, istek 10 s. */
async function pozoviPuls(url: string, token: string, at: number): Promise<Ishod> {
  const prekid = new AbortController();
  const tajmer = setTimeout(() => prekid.abort(), PULS_ISTEK_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "EnigmaDigital-Puls/1",
      },
      redirect: "manual",
      signal: prekid.signal,
    });
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
      await res.body?.cancel().catch(() => undefined);
      return greska("preusmerenje", "Puls je odgovorio preusmerenjem; preusmerenja se ne prate.");
    }
    if (res.status !== 200) {
      await res.body?.cancel().catch(() => undefined);
      return greska("http", `HTTP ${res.status}`);
    }
    const telo = await procitajTelo(res);
    if (!telo.ok) return greska("prevelik", "Odgovor je veći od 64 KB.");
    const p = parsirajPuls(telo.tekst, at);
    return p.ok ? { ok: true, vreme: p.vreme, metrike: p.metrike, oznake: p.oznake } : p;
  } catch {
    // Poruka izuzetka se ne prenosi: može da nosi adresu ili delove odgovora.
    return prekid.signal.aborted
      ? greska("istek", "Puls nije odgovorio za 10 sekundi.")
      : greska("mreza", "Puls nije dostupan (mrežna greška).");
  } finally {
    clearTimeout(tajmer);
  }
}

/**
 * Jedan projekat. Ne baca: svaki ishod je red (ili ništa, kad Puls nije
 * podešen do kraja).
 */
export async function pokupiProjekat(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  workspaceId: Id<"workspaces">,
): Promise<"nije_podeseno" | "upisano"> {
  const podesavanja = await podesavanjaZaAkciju(ctx, workspaceId);
  const url = podesavanja.pulsUrl.vrednost;
  if (url === null) return "nije_podeseno";
  const token = await procitajTajnu(ctx, workspaceId, "puls_token");
  if (token === null) return "nije_podeseno";

  const at = Date.now();
  const adresa = proveriAdresuNaSajtu(url, podesavanja.sajtovi.vrednost ?? []);
  if (!adresa.ok || adresa.vrednost === null) {
    await ctx.runMutation(internal.puls.upisiSnimak, {
      workspaceId,
      at,
      greska: {
        kod: "adresa_van_sajta",
        poruka: "Adresa Pulsa više nije na sajtovima projekta; poziv nije poslat.",
      },
    });
    return "upisano";
  }

  const ishod = await pozoviPuls(adresa.vrednost, token, at);
  const trajanjeMs = Date.now() - at;
  await ctx.runMutation(
    internal.puls.upisiSnimak,
    ishod.ok
      ? {
          workspaceId,
          at,
          trajanjeMs,
          vreme: ishod.vreme,
          metrike: ishod.metrike,
          ...(ishod.oznake !== null ? { oznake: ishod.oznake } : {}),
        }
      : { workspaceId, at, trajanjeMs, greska: { kod: ishod.kod, poruka: ishod.poruka } },
  );
  return "upisano";
}

/** Cron: svi projekti sa Pulsom, po 4 paralelno, pod bravom. */
export const pokupiSve = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await withCronLock(ctx, CRON_LOCKS.puls, async () => {
      const projekti: Id<"workspaces">[] = await ctx.runQuery(
        internal.puls.projektiSaPulsom,
        {},
      );
      for (let i = 0; i < projekti.length; i += PULS_PARALELNO) {
        const grupa = projekti.slice(i, i + PULS_PARALELNO);
        const ishodi = await Promise.allSettled(
          grupa.map((ws) => pokupiProjekat(ctx, ws)),
        );
        for (const ishod of ishodi) {
          if (ishod.status === "rejected") {
            // Ne bi trebalo da se desi (pokupiProjekat ne baca), ali jedan
            // projekat ne sme da zaustavi ostale. Bez detalja: može da nosi URL.
            console.warn("[Puls] Prolaz jednog projekta nije završen.");
          }
        }
      }
    });
    return null;
  },
});

// ── kartica „Poslovanje“ ─────────────────────────────────────────────────────

const metrikaOdgovor = v.object({
  kljuc: v.string(),
  naziv: v.string(),
  vrednost: v.number(),
  promena24h: v.union(v.number(), v.null()),
});

export const poslednji = projekatQuery({
  args: { sada: v.number() },
  returns: v.object({
    podeseno: v.object({ adresa: v.boolean(), token: v.boolean() }),
    poslednji: v.union(
      v.object({
        at: v.number(),
        vreme: v.union(v.number(), v.null()),
        zastareo: v.boolean(),
        metrike: v.array(metrikaOdgovor),
      }),
      v.null(),
    ),
    greska: v.union(
      v.object({
        kod: pulsGreskaValidator,
        poruka: v.string(),
        od: v.number(),
        uzastopno: v.number(),
      }),
      v.null(),
    ),
    /** Poslednji uspeh je stariji od 1 h (ili ga nema, a greška postoji). */
    zastao: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const ws = args.workspaceId;
    const podesavanja = await podesavanjaProjekta(ctx, ws);
    const token = await stanjeTajne(ctx, ws, "puls_token");
    const podeseno = {
      adresa: podesavanja.pulsUrl.vrednost !== null,
      token: token.postavljeno,
    };

    const redovi = await ctx.db
      .query("pulsSnimci")
      .withIndex("by_workspace_at", (q) => q.eq("workspaceId", ws))
      .order("desc")
      .take(KARTICA_REDOVA);

    // Greške u nizu od najnovijeg reda unazad.
    let uzastopno = 0;
    let najstarijaUNizu: Doc<"pulsSnimci"> | null = null;
    for (const red of redovi) {
      if (red.greska === undefined) break;
      uzastopno++;
      najstarijaUNizu = red;
    }
    const najnoviji = redovi[0];
    const greska =
      najnoviji?.greska !== undefined && najstarijaUNizu !== null
        ? {
            kod: najnoviji.greska.kod,
            poruka: najnoviji.greska.poruka,
            od: najstarijaUNizu.at,
            uzastopno,
          }
        : null;

    const uspeh = redovi.find((r) => r.metrike !== undefined) ?? null;
    if (uspeh === null || uspeh.metrike === undefined) {
      return { podeseno, poslednji: null, greska, zastao: greska !== null };
    }

    // Red od pre ~24 h za promenu: prvi uspešan red na ili pre `at − 24 h`.
    const ranije = await ctx.db
      .query("pulsSnimci")
      .withIndex("by_workspace_at", (q) =>
        q.eq("workspaceId", ws).lte("at", uspeh.at - DAN_MS),
      )
      .order("desc")
      .take(8);
    const ranijiUspeh = ranije.find((r) => r.metrike !== undefined)?.metrike ?? null;

    const metrike = Object.entries(uspeh.metrike).map(([kljuc, vrednost]) => {
      const stara = ranijiUspeh?.[kljuc];
      return {
        kljuc,
        naziv: uspeh.oznake?.[kljuc] ?? kljuc,
        vrednost,
        promena24h: typeof stara === "number" ? vrednost - stara : null,
      };
    });

    const referenca = uspeh.vreme ?? uspeh.at;
    return {
      podeseno,
      poslednji: {
        at: uspeh.at,
        vreme: uspeh.vreme ?? null,
        zastareo: args.sada - referenca > PULS_ZASTAREO_MS,
        metrike,
      },
      greska,
      zastao: args.sada - uspeh.at > SAT_MS,
    };
  },
});
