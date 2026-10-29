// Preneto iz Devotion packages/backend/convex/profiles.ts (main @ c05c40f), SPAJANJE S02.
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { prijavljenMutation, prijavljenQuery } from "../lib/projekat";
import { getCurrentProfile, requireProfile } from "./lib/auth";
import { obezbediProfil } from "./lib/radniDeo";
import { cleanRequiredText, roleValidator } from "./lib/validators";

/**
 * Profil radnog dela (SPAJANJE, P6, plan S01 §3.4). Nalog je Enigmin (Convex
 * Auth); profil nosi ime i avatar za radni deo i pravi se lenjo
 * (`ensureCurrent`, poziva ga auth-gate posle prijave). Devotion bootstrap,
 * pozivnice, globalne uloge i arhiva profila se ne prenose (D15, D22):
 * `role` je uvek `"member"` i ne čita se, a uloge daje `members` (P7).
 */

const profilValidator = v.object({
  _id: v.id("profiles"),
  _creationTime: v.number(),
  userId: v.id("users"),
  displayName: v.string(),
  email: v.string(),
  role: roleValidator,
  avatarStorageId: v.optional(v.id("_storage")),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  avatarUrl: v.union(v.string(), v.null()),
});

async function withAvatarUrl(ctx: QueryCtx, profile: Doc<"profiles">) {
  return {
    ...profile,
    avatarUrl:
      profile.avatarStorageId === undefined
        ? null
        : await ctx.storage.getUrl(profile.avatarStorageId),
  };
}

/** Profil prijavljenog korisnika, ili `null` dok ga `ensureCurrent` ne napravi. */
export const getCurrent = prijavljenQuery({
  args: {},
  returns: v.union(profilValidator, v.null()),
  handler: async (ctx) => {
    const profile = await getCurrentProfile(ctx);
    return profile === null ? null : await withAvatarUrl(ctx, profile);
  },
});

/**
 * Pravi profil ako ne postoji (idempotentno). `null` za korisnika koji je
 * samo `client_viewer` (O5) ili čiji je profil deaktiviran. Početno ime je
 * `users.name`, a bez njega deo adrese pre `@`.
 */
export const ensureCurrent = prijavljenMutation({
  args: { displayName: v.optional(v.string()) },
  returns: v.union(profilValidator, v.null()),
  handler: async (ctx, args) => {
    const profile = await obezbediProfil(ctx, ctx.korisnik.userId, args.displayName);
    return profile === null ? null : await withAvatarUrl(ctx, profile);
  },
});

/** Izmena imena (meni korisnika). */
export const updateCurrent = prijavljenMutation({
  args: { displayName: v.string() },
  returns: profilValidator,
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const displayName = cleanRequiredText(args.displayName, "Ime", 80);
    await ctx.db.patch("profiles", profile._id, {
      displayName,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get("profiles", profile._id);
    if (updated === null) throw new Error("Profil nije pronađen.");
    return await withAvatarUrl(ctx, updated);
  },
});
