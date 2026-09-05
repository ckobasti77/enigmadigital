import { internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireMembership } from "./lib/auth";
import {
  normalizeEmail,
  isEmailInAllowlist,
  WORKSPACE_SLUG,
  WORKSPACE_NAME,
} from "./auth";
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
  args: { token: v.string(), email: v.optional(v.string()) },
  returns: v.object({ email: v.string() }),
  handler: async (ctx, { token, email }) => {
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

    // §15: ne veruj zaključanom polju na ekranu. Adresa koja ide u `signUp` mora
    // biti tačno ona iz pozivnice — poređenje nad normalizovanom vrednošću.
    if (email !== undefined && normalizeEmail(email) !== inv.email) {
      throw new ConvexError({
        code: "email_mismatch",
        message: "Email ne odgovara pozivnici.",
      });
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// smeDaDobijeKod — INTERNI upit (§14). `sendVerificationRequest` u auth.ts ga zove
// preko `ctx.runQuery` da odluči sme li kod za potvrdu/reset da se pošalje.
// Pravilo: allowlist ILI otvoren invite prozor ILI postojeći (verifikovan) član.
// Nema `userId` (nema sesije pri slanju), pa se članstvo izvodi email→user→members.
// ─────────────────────────────────────────────────────────────────────────────
export const smeDaDobijeKod = internalQuery({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { email: rawEmail }) => {
    const email = normalizeEmail(rawEmail);
    if (!email) return false;

    // 1. nasleđena allowlista (env se čita i unutar query-ja)
    if (isEmailInAllowlist(email)) return true;

    // 2. otvoren invite prozor
    const now = Date.now();
    const workspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", WORKSPACE_SLUG))
      .collect();
    for (const ws of workspaces) {
      const invites = await ctx.db
        .query("invites")
        .withIndex("by_workspace_email", (q) =>
          q.eq("workspaceId", ws._id).eq("email", email),
        )
        .collect();
      const otvoren = invites.some(
        (inv) =>
          inv.readyUntil !== undefined &&
          inv.readyUntil > now &&
          inv.usedAt === undefined &&
          inv.revokedAt === undefined,
      );
      if (otvoren) return true;
    }

    // 3. postojeći verifikovan član (reset lozinke)
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (user !== null && user.emailVerificationTime !== undefined) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();
      if (member !== null) return true;
    }

    return false;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap prvog admin naloga (§13).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Da li postoji ijedan `authAccounts` red sa `provider === "password"`. Indeks
 * `providerAndAccountId` je na `["provider","providerAccountId"]`, pa je
 * `.eq("provider", "password")` validan prefiks.
 */
async function postojiPasswordNalog(ctx: {
  db: QueryCtx["db"];
}): Promise<boolean> {
  const acc = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) => q.eq("provider", "password"))
    .first();
  return acc !== null;
}

/** Najstariji workspace sa `WORKSPACE_SLUG`, ili sveže napravljen ako ga nema. */
async function nadjiIliNapraviWorkspace(
  ctx: MutationCtx,
): Promise<Id<"workspaces">> {
  const workspaces = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (q) => q.eq("slug", WORKSPACE_SLUG))
    .collect();
  if (workspaces.length === 0) {
    return await ctx.db.insert("workspaces", {
      name: WORKSPACE_NAME,
      slug: WORKSPACE_SLUG,
    });
  }
  return workspaces.reduce((oldest, c) =>
    c._creationTime < oldest._creationTime ? c : oldest,
  )._id;
}

/**
 * Poređenje bez ranog izlaza na prvoj različitoj cifri. Razlika u dužini se i
 * dalje otkriva (mora), ali se svaki znak preklopljene dužine svejedno poredi.
 */
function konstantnoVremeJednako(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * JAVAN upit: da li /login treba da ponudi „Napravi admin nalog". `true` kad
 * NIJEDAN password nalog ne postoji — postojeći `users` red od ranije (npr. OTP)
 * ga NE blokira.
 */
export const trebaSetup = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    return !(await postojiPasswordNalog(ctx));
  },
});

/**
 * JAVNA mutacija (§13): otvara prozor za pravljenje PRVOG admin naloga.
 *
 * Namerno koristi ISTU `invites` tabelu i isti `readyUntil` prozor kao pozivnice
 * — jedan mehanizam, jedan put kroz kod. `createdBy` je uvek popunjen: nađe se
 * (ili napravi) verifikovan `users` red za tu adresu, čime `shouldLinkViaEmail`
 * u `signUp`-u kači lozinku baš na njega (čuva vlasnikov postojeći nalog, §223).
 *
 * `ADMIN_SETUP_CODE`, lozinka i sirov token NIKAD ne ulaze u log, povratnu
 * vrednost ni poruku greške. „Nije konfigurisano", „šifra nije tačna" i „nalog
 * već postoji" su tri različite poruke.
 */
export const pripremiAdminSetup = mutation({
  args: { setupCode: v.string(), email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // 1. Password nalog se mogao napraviti između učitavanja ekrana i klika.
    if (await postojiPasswordNalog(ctx)) {
      throw new ConvexError({
        code: "admin_exists",
        message: "Admin nalog već postoji. Prijavi se lozinkom.",
      });
    }

    // 2. Šifra za setup mora biti konfigurisana na serveru.
    const serverCode = process.env.ADMIN_SETUP_CODE;
    if (!serverCode || serverCode.length === 0) {
      throw new ConvexError({
        code: "setup_not_configured",
        message: "Setup nije konfigurisan na serveru.",
      });
    }

    // 3. Poređenje bez ranog izlaza. Vrednost se nigde ne loguje/vraća.
    if (!konstantnoVremeJednako(args.setupCode, serverCode)) {
      throw new ConvexError({
        code: "bad_setup_code",
        message: "Setup šifra nije tačna.",
      });
    }

    // 4. Email.
    const email = normalizeEmail(args.email);
    if (!email || !EMAIL_OBLIK.test(email)) {
      throw new ConvexError({
        code: "bad_request",
        message: "Unesi ispravnu email adresu.",
      });
    }

    const now = Date.now();
    const workspaceId = await nadjiIliNapraviWorkspace(ctx);

    // 5. Verifikovan `users` red za `createdBy` + povezivanje lozinke, i članstvo.
    let uid: Id<"users">;
    const postojeci = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (postojeci !== null) {
      uid = postojeci._id;
      if (postojeci.emailVerificationTime === undefined) {
        await ctx.db.patch(uid, { emailVerificationTime: now });
      }
    } else {
      uid = await ctx.db.insert("users", { email, emailVerificationTime: now });
    }
    const clan = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", uid))
      .first();
    if (clan === null) {
      await ctx.db.insert("members", { workspaceId, userId: uid, role: "owner" });
    }

    // 6. Bootstrap red u `invites` (ili osveži postojeći otvoreni prozor).
    const zaAdresu = await ctx.db
      .query("invites")
      .withIndex("by_workspace_email", (q) =>
        q.eq("workspaceId", workspaceId).eq("email", email),
      )
      .collect();
    const otvorena = zaAdresu.find(
      (inv) =>
        inv.usedAt === undefined &&
        inv.revokedAt === undefined &&
        inv.expiresAt > now,
    );
    if (otvorena) {
      await ctx.db.patch(otvorena._id, { readyUntil: now + READY_MS });
    } else {
      const token = generateToken();
      const tokenHash = await sha256Hex(token);
      await ctx.db.insert("invites", {
        workspaceId,
        email,
        tokenHash,
        createdBy: uid,
        createdAt: now,
        expiresAt: now + EXPIRY_MS,
        readyUntil: now + READY_MS,
      });
    }

    return null;
  },
});
