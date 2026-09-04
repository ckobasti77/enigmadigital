import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { normalizeEmail } from "./auth";
import { sha256Hex } from "./lib/metaAudienceHash";

/**
 * Pozivnice za registraciju (prijava-plan.md §3–§8).
 *
 * SIROV TOKEN SE NIKAD NE UPISUJE: u bazi stoji samo SHA-256 heš. Sirovi token
 * izlazi iz sistema tačno jednom — kao povratna vrednost `createInvite` — i
 * odatle u link koji vlasnik prosleđuje ručno.
 *
 * `getInvite` i `pripremiRegistraciju` su JAVNE: poziva ih neko ko još nema
 * nalog, pa NE primaju `workspaceId` i NE otkrivaju ništa o radnom prostoru.
 */

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 dana
const READY_MS = 10 * 60 * 1000; // 10 minuta

const EMAIL_OBLIK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Status za javne pozive: uključuje `ne_postoji` (token bez pogotka).
const statusValidator = v.union(
  v.literal("vazi"),
  v.literal("istekla"),
  v.literal("iskoriscena"),
  v.literal("povucena"),
  v.literal("ne_postoji"),
);

// Status za spisak: pozivnica uvek postoji, pa nema `ne_postoji`.
const zapisStatusValidator = v.union(
  v.literal("vazi"),
  v.literal("istekla"),
  v.literal("iskoriscena"),
  v.literal("povucena"),
);

type ZapisStatus = "vazi" | "istekla" | "iskoriscena" | "povucena";

/**
 * Status postojeće pozivnice. Redosled provere je nameran: povučena i
 * iskorišćena su konačna stanja i imaju prednost nad istekom.
 */
function classifyInvite(invite: Doc<"invites">, now: number): ZapisStatus {
  if (invite.revokedAt !== undefined) return "povucena";
  if (invite.usedAt !== undefined) return "iskoriscena";
  if (invite.expiresAt < now) return "istekla";
  return "vazi";
}

/**
 * 32 nasumična bajta → base64url (bez paddinga). Convex V8 nema `Buffer`, a
 * ostatak koda koristi hex; token je jedino mesto gde nam treba kraći, URL-safe
 * zapis, pa ga kodiramo ručno.
 */
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
// createInvite — vlasnik pravi pozivnicu (§4.1). JEDINI put kad sirovi token izlazi.
// ─────────────────────────────────────────────────────────────────────────────
export const createInvite = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
  },
  returns: v.object({
    token: v.string(),
    email: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    const email = normalizeEmail(args.email);
    if (!email || !EMAIL_OBLIK.test(email)) {
      throw new ConvexError({
        code: "bad_request",
        message: "Unesi ispravnu email adresu.",
      });
    }

    // Osoba sa tom adresom već ima nalog → nema šta da se poziva. Ovo ujedno
    // sprečava da signUp preko pozivnice napravi dupliran `users` red.
    const postojeciKorisnik = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (postojeciKorisnik !== null) {
      throw new ConvexError({
        code: "conflict",
        message: "Osoba sa tom adresom već ima nalog.",
      });
    }

    // Već postoji važeća neiskorišćena pozivnica → ne pravimo tiho drugu.
    const now = Date.now();
    const zaTuAdresu = await ctx.db
      .query("invites")
      .withIndex("by_workspace_email", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("email", email),
      )
      .collect();
    const vecVazi = zaTuAdresu.some((inv) => classifyInvite(inv, now) === "vazi");
    if (vecVazi) {
      throw new ConvexError({
        code: "conflict",
        message:
          "Za tu adresu već postoji važeća pozivnica. Povuci je pa napravi novu, ili prosledi postojeći link.",
      });
    }

    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = now + EXPIRY_MS;

    await ctx.db.insert("invites", {
      workspaceId: args.workspaceId,
      email,
      tokenHash,
      createdBy: membership.userId,
      createdAt: now,
      expiresAt,
    });

    return { token, email, expiresAt };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// getInvite — JAVAN upit (§4.3). Vraća SAMO { status, email? }.
// ─────────────────────────────────────────────────────────────────────────────
export const getInvite = query({
  args: { token: v.string() },
  returns: v.object({
    status: statusValidator,
    email: v.optional(v.string()),
  }),
  handler: async (ctx, { token }) => {
    if (!token) return { status: "ne_postoji" as const };

    const tokenHash = await sha256Hex(token);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();

    if (invite === null) return { status: "ne_postoji" as const };

    const status = classifyInvite(invite, Date.now());
    // `email` se otkriva samo kad pozivnica važi — inače ništa o adresi/prostoru.
    return status === "vazi"
      ? { status, email: invite.email }
      : { status };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// pripremiRegistraciju — JAVNA mutacija (§4.4a). Ponovna provera pa readyUntil.
// ─────────────────────────────────────────────────────────────────────────────
export const pripremiRegistraciju = mutation({
  args: { token: v.string() },
  returns: v.object({ email: v.string() }),
  handler: async (ctx, { token }) => {
    const porukaZa: Record<string, string> = {
      ne_postoji: "Pozivnica ne postoji.",
      istekla: "Pozivnica je istekla.",
      iskoriscena: "Pozivnica je već iskorišćena.",
      povucena: "Pozivnica je povučena.",
    };

    const odbij = (status: keyof typeof porukaZa) => {
      throw new ConvexError({ code: "invite_" + status, message: porukaZa[status] });
    };

    if (!token) odbij("ne_postoji");

    const tokenHash = await sha256Hex(token);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();

    if (invite === null) odbij("ne_postoji");

    const inv = invite!;
    const status = classifyInvite(inv, Date.now());
    if (status !== "vazi") odbij(status);

    await ctx.db.patch(inv._id, { readyUntil: Date.now() + READY_MS });
    return { email: inv.email };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// listInvites — spisak za sekciju „Pristup" (§8). Sirov token se NE vraća.
// ─────────────────────────────────────────────────────────────────────────────
export const listInvites = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(
    v.object({
      _id: v.id("invites"),
      email: v.string(),
      status: zapisStatusValidator,
      createdAt: v.number(),
      expiresAt: v.number(),
      createdByEmail: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    const now = Date.now();
    const rows = await ctx.db
      .query("invites")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // Najnovije prvo.
    rows.sort((a, b) => b.createdAt - a.createdAt);

    const zapisi = [];
    for (const inv of rows) {
      const autor = await ctx.db.get(inv.createdBy);
      zapisi.push({
        _id: inv._id,
        email: inv.email,
        status: classifyInvite(inv, now),
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
        createdByEmail: autor?.email ?? null,
      });
    }
    return zapisi;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// revokeInvite — povlačenje neiskorišćene pozivnice. Istorija ostaje.
// ─────────────────────────────────────────────────────────────────────────────
export const revokeInvite = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    inviteId: v.id("invites"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    const inv = await ctx.db.get(args.inviteId);
    if (inv === null || inv.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }
    if (inv.usedAt !== undefined) {
      throw new ConvexError({
        code: "conflict",
        message: "Iskorišćena pozivnica se ne povlači.",
      });
    }
    if (inv.revokedAt !== undefined) return null; // već povučena — idempotentno

    await ctx.db.patch(args.inviteId, { revokedAt: Date.now() });
    return null;
  },
});
