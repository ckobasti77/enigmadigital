import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireOwner } from "./lib/auth";
import { sha256Hex } from "./lib/metaAudienceHash";

/**
 * ============================================================================
 * TOKENI ZA UVOZ (`POST /generate-leads/ingest`) — GL1, plan §5
 * ============================================================================
 *
 * SIROV TOKEN SE NIKAD NE UPISUJE. U bazi stoji samo SHA-256 heš, isti obrazac
 * kao `invitesStore`. Sirov token izlazi iz sistema tačno jednom — kao povratna
 * vrednost `createIngestToken` — i odatle u `ENIGMA_INGEST_TOKEN` na Jovanovoj
 * mašini. Posle zatvaranja modala se ne može ponovo videti; izgubljen token se
 * opoziva i pravi novi.
 *
 * SAMO VLASNIK. Ovaj token je pravo pisanja u staging bez sesije i bez lozinke;
 * `client_viewer` postoji da bi gledao. Provera je u mutaciji (`requireOwner`),
 * ne samo u interfejsu — dugme koje se ne crta i dalje se može pozvati.
 *
 * NIŠTA ODAVDE NE LOGUJE TOKEN NI HEŠ.
 */

/** 32 nasumična bajta -> base64url, isto kodiranje kao pozivnice. */
const B64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToBase64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64URL[b0 >> 2];
    out += B64URL[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64URL[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64URL[b2 & 0b111111];
  }
  return out;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64url(bytes);
}

// ─────────────────────────────────────────────────────────────────────────────
// createIngestToken — JEDINI put kad sirov token izlazi iz sistema.
// ─────────────────────────────────────────────────────────────────────────────
export const createIngestToken = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    naziv: v.string(),
  },
  returns: v.object({
    token: v.string(),
    naziv: v.string(),
  }),
  handler: async (ctx, args) => {
    const membership = await requireOwner(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    const naziv = args.naziv.trim();
    if (!naziv) {
      throw new ConvexError({
        code: "bad_request",
        message: "Daj tokenu naziv po kome ćeš znati sa koje je mašine.",
      });
    }

    const token = generateToken();
    const tokenHash = await sha256Hex(token);

    await ctx.db.insert("ingestTokens", {
      workspaceId: args.workspaceId,
      tokenHash,
      naziv,
      createdBy: membership.userId,
      createdAt: Date.now(),
    });

    return { token, naziv };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// listIngestTokens — spisak za Podešavanja. Heš se NE vraća.
// ─────────────────────────────────────────────────────────────────────────────
export const listIngestTokens = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(
    v.object({
      _id: v.id("ingestTokens"),
      naziv: v.string(),
      createdAt: v.number(),
      // `null` znači „nijednom upotrebljen". Nula bi ovde bila 1. januar 1970.
      lastUsedAt: v.union(v.number(), v.null()),
      revokedAt: v.union(v.number(), v.null()),
      createdByEmail: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const membership = await requireOwner(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    const rows = await ctx.db
      .query("ingestTokens")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    rows.sort((a, b) => b.createdAt - a.createdAt);

    const zapisi = [];
    for (const row of rows) {
      const autor = await ctx.db.get(row.createdBy);
      zapisi.push({
        _id: row._id,
        naziv: row.naziv,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt ?? null,
        revokedAt: row.revokedAt ?? null,
        createdByEmail: autor?.email ?? null,
      });
    }
    return zapisi;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// revokeIngestToken — opoziv. Red ostaje kao trag da je token postojao.
// ─────────────────────────────────────────────────────────────────────────────
export const revokeIngestToken = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    tokenId: v.id("ingestTokens"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await requireOwner(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    const row = await ctx.db.get(args.tokenId);
    if (row === null || row.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }
    if (row.revokedAt !== undefined) return null; // već opozvan — idempotentno

    await ctx.db.patch(args.tokenId, { revokedAt: Date.now() });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Interni put za HTTP akciju.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ko je vlasnik ovog heša, ako token važi.
 *
 * Vraća `null` i za „nema takvog tokena" i za „opozvan je". Ta dva odgovora se
 * spolja NE razlikuju: ruta na oba vraća isti 401 bez detalja, jer bi razlika
 * potvrdila pogađaču da je pogodio postojeći token.
 */
export const findValidTokenByHash = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.object({
      tokenId: v.id("ingestTokens"),
      workspaceId: v.id("workspaces"),
      createdBy: v.id("users"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("ingestTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    if (row === null || row.revokedAt !== undefined) return null;

    return {
      tokenId: row._id,
      workspaceId: row.workspaceId,
      createdBy: row.createdBy,
    };
  },
});

/** Poslednja upotreba tokena — da spisak u Podešavanjima ne laže. */
export const markTokenUsed = internalMutation({
  args: { tokenId: v.id("ingestTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenId);
    if (row === null) return null;
    await ctx.db.patch(args.tokenId, { lastUsedAt: Date.now() });
    return null;
  },
});
