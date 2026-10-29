// Preneto iz Devotion packages/backend/convex/adminAuth.ts (main @ c05c40f), SPAJANJE S06.
import {
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { normalizeEmail } from "../auth";
import { jeVlasnikPlatforme, PORUKE, projekatAction } from "../lib/projekat";
import { recordActivity } from "./lib/activity";
import { requireProfilKorisnika, requireProfilUProjektu } from "./lib/auth";
import { proveriLozinku } from "./lib/lozinka";

// Devotion `resetAdminPassword` (server-only reset preko `npx convex run`) se ne
// prenosi (plan S01 §1.2): Enigma ima svoj tok zaboravljene lozinke u `auth.ts`.

/**
 * Autorizacija + učitavanje mete za `adminSetPassword`. Izdvojeno u internalQuery
 * jer akcija nema `ctx.db`. Pozivalac je vlasnik platforme (P7), meta je
 * `owner`/`urednik` projekta iz kog se radnja pokreće. Vraća samo ono što akciji
 * treba — nikad lozinku.
 */
export const authorizeSetPassword = internalQuery({
  args: {
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
  },
  returns: v.object({
    email: v.string(),
    userId: v.id("users"),
    targetName: v.string(),
    adminProfileId: v.id("profiles"),
    adminName: v.string(),
  }),
  handler: async (ctx, { userId, workspaceId, profileId }) => {
    if (!(await jeVlasnikPlatforme(ctx, userId))) {
      throw new ConvexError(PORUKE.platforma);
    }
    const admin = await requireProfilKorisnika(ctx, userId);
    // Blokada sebe: sopstvena lozinka se ne menja ovim (admin) putem — izbegava
    // i samo-odjavu (korak 4 u akciji gasi SVE sesije mete).
    if (admin._id === profileId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Sopstvenu lozinku ne menjaš ovim putem.",
      });
    }
    const target = await requireProfilUProjektu(ctx, workspaceId, profileId);
    return {
      email: target.email,
      userId: target.userId,
      targetName: target.displayName,
      adminProfileId: admin._id,
      adminName: admin.displayName,
    };
  },
});

/**
 * Upis činjenice u activity — u SVAKI projekat u kome je meta `owner`/`urednik`.
 * Bez lozinke. Lozinka je globalna (nalog), pa se zapisuje svuda gde meta radi.
 * `client_viewer` nema radni deo; duplikat reda u `members` se broji jednom.
 */
export const recordPasswordChange = internalMutation({
  args: {
    actorProfileId: v.id("profiles"),
    targetProfileId: v.id("profiles"),
    adminName: v.string(),
    targetName: v.string(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { actorProfileId, targetProfileId, adminName, targetName },
  ) => {
    const target = await ctx.db.get(targetProfileId);
    if (target === null) return null;
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", target.userId))
      .take(100);
    const title = `${adminName} je promenio lozinku članu ${targetName}`;
    const videni = new Set<Id<"workspaces">>();
    for (const membership of memberships) {
      if (membership.role === "client_viewer") continue;
      if (videni.has(membership.workspaceId)) continue;
      if (videni.size === 50) break; // opseg „moji projekti“ (P28)
      videni.add(membership.workspaceId);
      await recordActivity(ctx, {
        workspaceId: membership.workspaceId,
        actorProfileId,
        action: "member_password_changed",
        targetType: "profile",
        targetId: targetProfileId,
        title,
      });
    }
    return null;
  },
});

/**
 * Vlasnik platforme postavlja NOVU lozinku POSTOJEĆEM članu projekta (P7, D13).
 * Menja isključivo `authAccounts.secret` preko zvaničnog helpera — ne pravi nov
 * nalog, ne briše profil, ne dira druge tabele.
 *
 * Omotač traži `owner` projekta; interna autorizacija još i vlasnika platforme.
 * Akcija (ne mutacija) jer `modifyAccountCredentials`/`invalidateSessions`
 * primaju action ctx. Lozinka se NIGDE ne loguje, ne vraća i ne ide u activity.
 */
export const adminSetPassword = projekatAction({
  uloga: "owner",
  args: { profileId: v.id("profiles"), newPassword: v.string() },
  returns: v.null(),
  handler: async (ctx, { profileId, newPassword, workspaceId }) => {
    // 1) Autorizacija + meta PRE provere lozinke — da onaj ko nema pravo ne
    //    sazna pravila lozinke.
    const info: {
      email: string;
      userId: Id<"users">;
      targetName: string;
      adminProfileId: Id<"profiles">;
      adminName: string;
    } = await ctx.runQuery(internal.prostor.adminAuth.authorizeSetPassword, {
      userId: ctx.projekat.userId,
      workspaceId,
      profileId,
    });

    // 2) Pravila lozinke Enigme (baca ConvexError na slabu lozinku).
    proveriLozinku(newPassword);

    // 3) Menja SAMO authAccounts.secret (Scrypt heš). Baca ako nalog ne postoji —
    //    preoblačimo u jasnu srpsku poruku.
    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: normalizeEmail(info.email), secret: newPassword },
      });
    } catch {
      throw new ConvexError({
        code: "not_found",
        message: "Nalog za ovog člana nije pronađen ili se lozinka ne može promeniti.",
      });
    }

    // 4) Sve postojeće sesije + refresh tokeni mete van — meta mora da se prijavi
    //    NOVOM lozinkom (reset je bezbednosni događaj).
    await invalidateSessions(ctx, { userId: info.userId });

    // 5) Činjenica u activity (bez lozinke). Best-effort posle same promene.
    await ctx.runMutation(internal.prostor.adminAuth.recordPasswordChange, {
      actorProfileId: info.adminProfileId,
      targetProfileId: profileId,
      adminName: info.adminName,
      targetName: info.targetName,
    });

    return null;
  },
});
