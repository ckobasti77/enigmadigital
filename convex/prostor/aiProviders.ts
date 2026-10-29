// Preneto iz Devotion packages/backend/convex/aiProviders.ts (main @ c05c40f), SPAJANJE S05.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";
import { requireClanProjekta, type ReadCtx } from "./lib/auth";
import { cleanRequiredText } from "./lib/validators";
import {
  jeVlasnikPlatforme,
  PORUKE,
  projekatMutation,
  projekatQuery,
} from "../lib/projekat";

/**
 * AI provajderi (docs/mobile/06-AGENT.md sekcija 3).
 *
 * OpenAI-kompatibilan provajder = `baseUrl` + `model` + `apiKey`. Konfiguriše ga
 * admin startupa iz UI.
 *
 * ⚠️ DISCIPLINA OKO KLJUČA — jedini razlog zašto ovaj fajl izgleda ovako:
 *  - `apiKey` se čita ISKLJUČIVO iz `internalQuery` / `internalAction`
 *    (`getDefaultProviderWithKey`, `getWithKey`). Nijedan javni upit ga ne vraća.
 *  - Javne funkcije vraćaju samo `toPublic(doc)` / `publicProviderValidator` —
 *    projekcija koja fizički ne sadrži `apiKey`.
 *  - `keySuffix` (poslednja 4 znaka) se računa server-side; klijent ga ne šalje.
 *  - Izmena ključa je „unesi nov" (`update.apiKey` je opciono): ako je izostavljen,
 *    ključ se ne dira; ako je unet, zamenjuje se i suffix se preračunava. Nema
 *    funkcije koja vraća postojeći ključ radi popunjavanja forme.
 *  - `lastError` je UI-vidljiv, pa se pre upisa provlači kroz `sanitizeErrorMessage`
 *    koji izbriše svaku pojavu ključa (npr. ako ga provajder vrati u telu greške).
 *  - Nigde se ne loguje ni ceo red ni `apiKey` (Convex dashboard prikazuje logove).
 */

const MAX_AI_PROVIDER_LABEL_LENGTH = 120;
const MAX_AI_MODEL_LENGTH = 200;
const MAX_BASE_URL_LENGTH = 500;
const MIN_API_KEY_LENGTH = 8;
const MAX_API_KEY_LENGTH = 512;
const MAX_LAST_ERROR_LENGTH = 500;
const AI_PROVIDERS_CAP = 50;

/** Bezbedna projekcija za klijent — bez `apiKey`. */
const publicProviderValidator = v.object({
  _id: v.id("aiProviders"),
  label: v.string(),
  baseUrl: v.string(),
  model: v.string(),
  keySuffix: v.string(),
  isDefault: v.boolean(),
  enabled: v.boolean(),
  lastError: v.union(v.string(), v.null()),
  lastErrorAt: v.union(v.number(), v.null()),
  lastUsedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** Ceo red UKLJUČUJUĆI `apiKey` — samo za internal potrošače (agent akcija). */
const providerWithKeyValidator = v.object({
  _id: v.id("aiProviders"),
  _creationTime: v.number(),
  workspaceId: v.id("workspaces"),
  label: v.string(),
  baseUrl: v.string(),
  model: v.string(),
  apiKey: v.string(),
  keySuffix: v.string(),
  isDefault: v.boolean(),
  enabled: v.boolean(),
  createdByProfileId: v.id("profiles"),
  lastUsedAt: v.union(v.number(), v.null()),
  lastErrorAt: v.union(v.number(), v.null()),
  lastError: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function toPublic(doc: Doc<"aiProviders">) {
  return {
    _id: doc._id,
    label: doc.label,
    baseUrl: doc.baseUrl,
    model: doc.model,
    keySuffix: doc.keySuffix,
    isDefault: doc.isDefault,
    enabled: doc.enabled,
    lastError: doc.lastError,
    lastErrorAt: doc.lastErrorAt,
    lastUsedAt: doc.lastUsedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function deriveKeySuffix(apiKey: string): string {
  return apiKey.slice(-4);
}

/** Trim + granice dužine. Min 8 znakova da `keySuffix` (4) nikad ne bude većina ključa. */
function cleanApiKey(raw: string): string {
  const cleaned = raw.trim();
  if (cleaned.length < MIN_API_KEY_LENGTH) {
    throw new Error("API ključ je prekratak.");
  }
  if (cleaned.length > MAX_API_KEY_LENGTH) {
    throw new Error("API ključ je predugačak.");
  }
  return cleaned;
}

/** Validira da je URL ispravan i https (izuzetak: http://localhost za Ollama). */
function cleanBaseUrl(raw: string): string {
  const cleaned = cleanRequiredText(raw, "Bazni URL", MAX_BASE_URL_LENGTH);
  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    throw new Error("Bazni URL nije ispravan.");
  }
  const isLocalhost =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
    throw new Error(
      "Bazni URL mora koristiti https (izuzetak: http://localhost).",
    );
  }
  return cleaned;
}

/**
 * Uklanja svaku pojavu ključa iz poruke greške i skraćuje je. Poziva se pre
 * upisa u UI-vidljiv `lastError` — čak i ako je pozivalac zaboravio da sanitizuje,
 * ključ ne sme da procuri kroz grešku.
 */
function sanitizeErrorMessage(message: string, apiKey: string): string {
  let safe = message;
  if (apiKey.length >= MIN_API_KEY_LENGTH) {
    safe = safe.split(apiKey).join("[REDACTED]");
  }
  return safe.slice(0, MAX_LAST_ERROR_LENGTH);
}

/**
 * Admin gate za projekat (S01 D14): omotač je već tražio `owner` projekta, a
 * Devotion globalna admin rola je u Enigmi vlasnik platforme (P7).
 */
async function requireStartupAdmin(ctx: ReadCtx, workspaceId: Id<"workspaces">) {
  const { profile, workspace } = await requireClanProjekta(ctx, workspaceId);
  if (!(await jeVlasnikPlatforme(ctx, profile.userId))) {
    throw new ConvexError(PORUKE.platforma);
  }
  return { profile, workspace };
}

/** Učitaj provajdera pa primeni admin gate na njegov `startupId`. */
async function requireProviderAdmin(
  ctx: MutationCtx,
  providerId: Id<"aiProviders">,
) {
  const provider = await ctx.db.get("aiProviders", providerId);
  if (provider === null) throw new Error("AI provajder nije pronađen.");
  const { profile } = await requireStartupAdmin(ctx, provider.workspaceId);
  return { provider, profile };
}

/**
 * Ako startup nema podrazumevanog provajdera, promoviši najskoriji `enabled`.
 * Održava invarijantu „ako postoji uključen provajder, postoji i default", pa
 * agent uvek ima šta da izabere. Idempotentno.
 */
async function promoteAnotherDefault(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
) {
  const existingDefault = await ctx.db
    .query("aiProviders")
    .withIndex("by_workspaceId_and_isDefault", (q) =>
      q.eq("workspaceId", workspaceId).eq("isDefault", true),
    )
    .first();
  if (existingDefault !== null) return;

  const candidate = await ctx.db
    .query("aiProviders")
    .withIndex("by_workspaceId_and_enabled", (q) =>
      q.eq("workspaceId", workspaceId).eq("enabled", true),
    )
    .order("desc")
    .first();
  if (candidate !== null) {
    await ctx.db.patch("aiProviders", candidate._id, {
      isDefault: true,
      updatedAt: Date.now(),
    });
  }
}

// --- Javne funkcije (admin-gated; NIJEDNA ne vraća apiKey) -----------------

/** Lista provajdera startupa (uključeni i isključeni) za admin ekran. Bez ključa. */
export const list = projekatQuery({
  uloga: "owner",
  args: {},
  returns: v.array(publicProviderValidator),
  handler: async (ctx, args) => {
    await requireStartupAdmin(ctx, args.workspaceId);
    const rows = await ctx.db
      .query("aiProviders")
      .withIndex("by_workspaceId_and_enabled", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .take(AI_PROVIDERS_CAP);
    return rows.map(toPublic);
  },
});

/** Dodaje provajdera. Prvi u startupu postaje podrazumevani. Vraća samo id. */
export const create = projekatMutation({
  uloga: "owner",
  args: {
    label: v.string(),
    baseUrl: v.string(),
    model: v.string(),
    apiKey: v.string(),
  },
  returns: v.id("aiProviders"),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupAdmin(ctx, args.workspaceId);

    const label = cleanRequiredText(
      args.label,
      "Naziv",
      MAX_AI_PROVIDER_LABEL_LENGTH,
    );
    const baseUrl = cleanBaseUrl(args.baseUrl);
    const model = cleanRequiredText(args.model, "Model", MAX_AI_MODEL_LENGTH);
    const apiKey = cleanApiKey(args.apiKey);

    const existing = await ctx.db
      .query("aiProviders")
      .withIndex("by_workspaceId_and_enabled", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .first();
    const isDefault = existing === null;

    const now = Date.now();
    return await ctx.db.insert("aiProviders", {
      workspaceId: args.workspaceId,
      label,
      baseUrl,
      model,
      apiKey,
      keySuffix: deriveKeySuffix(apiKey),
      isDefault,
      enabled: true,
      createdByProfileId: profile._id,
      lastUsedAt: null,
      lastErrorAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Menja provajdera. `apiKey` je opciono: izostavljen → ključ netaknut; unet →
 * zamena + novi `keySuffix`. Gašenje podrazumevanog provajdera skida mu default
 * i promoviše drugi uključeni.
 */
export const update = projekatMutation({
  uloga: "owner",
  args: {
    providerId: v.id("aiProviders"),
    label: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
    model: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { provider } = await requireProviderAdmin(ctx, args.providerId);

    const now = Date.now();
    const patch: {
      updatedAt: number;
      label?: string;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      keySuffix?: string;
      enabled?: boolean;
      isDefault?: boolean;
    } = { updatedAt: now };

    if (args.label !== undefined) {
      patch.label = cleanRequiredText(
        args.label,
        "Naziv",
        MAX_AI_PROVIDER_LABEL_LENGTH,
      );
    }
    if (args.baseUrl !== undefined) {
      patch.baseUrl = cleanBaseUrl(args.baseUrl);
    }
    if (args.model !== undefined) {
      patch.model = cleanRequiredText(args.model, "Model", MAX_AI_MODEL_LENGTH);
    }
    if (args.apiKey !== undefined) {
      const apiKey = cleanApiKey(args.apiKey);
      patch.apiKey = apiKey;
      patch.keySuffix = deriveKeySuffix(apiKey);
    }

    let disabledDefault = false;
    if (args.enabled !== undefined) {
      patch.enabled = args.enabled;
      if (!args.enabled && provider.isDefault) {
        patch.isDefault = false;
        disabledDefault = true;
      }
    }

    await ctx.db.patch("aiProviders", args.providerId, patch);
    if (disabledDefault) {
      await promoteAnotherDefault(ctx, provider.workspaceId);
    }
    return null;
  },
});

/** Postavlja podrazumevani provajder; tačno jedan default po startupu. */
export const setDefault = projekatMutation({
  uloga: "owner",
  args: { providerId: v.id("aiProviders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { provider } = await requireProviderAdmin(ctx, args.providerId);
    const now = Date.now();

    const currentDefaults = await ctx.db
      .query("aiProviders")
      .withIndex("by_workspaceId_and_isDefault", (q) =>
        q.eq("workspaceId", provider.workspaceId).eq("isDefault", true),
      )
      .take(AI_PROVIDERS_CAP);
    for (const row of currentDefaults) {
      if (row._id !== provider._id) {
        await ctx.db.patch("aiProviders", row._id, {
          isDefault: false,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch("aiProviders", provider._id, {
      isDefault: true,
      enabled: true,
      updatedAt: now,
    });
    return null;
  },
});

/** Briše provajdera (hard delete). Ako je bio default, promoviše drugi uključeni. */
export const remove = projekatMutation({
  uloga: "owner",
  args: { providerId: v.id("aiProviders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { provider } = await requireProviderAdmin(ctx, args.providerId);
    const wasDefault = provider.isDefault;
    const workspaceId = provider.workspaceId;

    await ctx.db.delete("aiProviders", args.providerId);
    if (wasDefault) {
      await promoteAnotherDefault(ctx, workspaceId);
    }
    return null;
  },
});

// --- Interne funkcije (JEDINI izlaz ključa) --------------------------------

/** Podrazumevani uključeni provajder startupa SA ključem. Zove agent akcija. */
export const getDefaultProviderWithKey = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(providerWithKeyValidator, v.null()),
  handler: async (ctx, args) => {
    const provider = await ctx.db
      .query("aiProviders")
      .withIndex("by_workspaceId_and_isDefault", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("isDefault", true),
      )
      .first();
    if (provider === null || !provider.enabled) return null;
    return provider;
  },
});

/** Jedan provajder po id-u SA ključem (za „Testiraj vezu"). */
export const getWithKey = internalQuery({
  args: { providerId: v.id("aiProviders") },
  returns: v.union(providerWithKeyValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("aiProviders", args.providerId);
  },
});

/** Beleži uspešan poziv; briše prethodnu grešku. */
export const recordUsage = internalMutation({
  args: { providerId: v.id("aiProviders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const provider = await ctx.db.get("aiProviders", args.providerId);
    if (provider === null) return null;
    const now = Date.now();
    await ctx.db.patch("aiProviders", args.providerId, {
      lastUsedAt: now,
      lastErrorAt: null,
      lastError: null,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Beleži grešku poziva. Poruka se sanitizuje protiv STVARNOG uskladištenog ključa
 * pre upisa — garancija da `lastError` (UI-vidljiv) nikad ne nosi trag ključa.
 */
export const recordError = internalMutation({
  args: { providerId: v.id("aiProviders"), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const provider = await ctx.db.get("aiProviders", args.providerId);
    if (provider === null) return null;
    const now = Date.now();
    await ctx.db.patch("aiProviders", args.providerId, {
      lastErrorAt: now,
      lastError: sanitizeErrorMessage(args.message, provider.apiKey),
      updatedAt: now,
    });
    return null;
  },
});
