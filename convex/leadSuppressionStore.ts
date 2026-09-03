import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { normalizeDomain, normalizePhoneRs } from "./lib/leadNormalize";

/**
 * ============================================================================
 * LEAD SUPPRESSION STORE (§9.3) — Lista zabrane kontakta („ne diraj" lista)
 * ============================================================================
 *
 * Provera se vrši PRI UVOZU podataka, a ne pri pozivanju: time se sprečava
 * da postojeći klijenti ili zaštićeni kontakti uopšte uđu u sistem kao hladni leadovi.
 *
 * Sve vrednosti se normalizuju istim funkcijama kao pri deduplikaciji.
 * Nenormalizovane vrednosti se NIKADA ne upisuju u listu zabrane.
 * ============================================================================
 */

export type MatchOn = "pib" | "domain" | "phone" | "email" | "companyId";

export type SuppressionCheckResult = {
  suppressed: boolean;
  matchedOn?: MatchOn;
  reason?: string;
  /**
   * Ključevi koje NISMO mogli da proverimo jer se vrednost nije dala
   * normalizovati (npr. telefon u obliku koji `normalizePhoneRs` odbija).
   *
   * Bez ovoga `suppressed: false` znači dve različite stvari — „proverio sam i
   * nije na listi" i „nisam mogao da proverim" — a pozivalac ih ne razlikuje.
   * Uvoz koji to ne razlikuje pušta zaštićeni kontakt kao hladan lead i niko
   * ne sazna. Nepoznato stanje nije dozvola da se nastavi (§0, pravilo 5).
   */
  unverifiable?: MatchOn[];
};

/**
 * Pomoćna funkcija za proveru da li je prosleđeni skup identifikatora zabranjen.
 * Proverava sve navedene ključeve i vraća prvi pogodak.
 */
export async function isSuppressed(
  ctx: QueryCtx | MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    pib?: string;
    domain?: string;
    phone?: string;
    email?: string;
    companyId?: Id<"leadCompanies"> | string;
  },
): Promise<SuppressionCheckResult> {
  const { workspaceId, pib, domain, phone, email, companyId } = args;
  const unverifiable: MatchOn[] = [];

  // 1. Provera po ID-ju firme
  if (companyId) {
    const normCompanyId = String(companyId).trim();
    if (normCompanyId) {
      const match = await ctx.db
        .query("leadSuppression")
        .withIndex("by_workspace_match", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("matchOn", "companyId")
            .eq("value", normCompanyId),
        )
        .first();
      if (match !== null) {
        return {
          suppressed: true,
          matchedOn: "companyId",
          reason: match.reason,
        };
      }
    }
  }

  // 2. Provera po PIB-u
  if (pib) {
    const normPib = pib.trim();
    if (normPib) {
      const match = await ctx.db
        .query("leadSuppression")
        .withIndex("by_workspace_match", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("matchOn", "pib")
            .eq("value", normPib),
        )
        .first();
      if (match !== null) {
        return {
          suppressed: true,
          matchedOn: "pib",
          reason: match.reason,
        };
      }
    }
  }

  // 3. Provera po domenu
  if (domain) {
    const normDomain = normalizeDomain(domain);
    if (!normDomain) {
      unverifiable.push("domain");
    }
    if (normDomain) {
      const match = await ctx.db
        .query("leadSuppression")
        .withIndex("by_workspace_match", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("matchOn", "domain")
            .eq("value", normDomain),
        )
        .first();
      if (match !== null) {
        return {
          suppressed: true,
          matchedOn: "domain",
          reason: match.reason,
        };
      }
    }
  }

  // 4. Provera po telefonu (normalizovanom na +381 oblik)
  if (phone) {
    const normPhone = normalizePhoneRs(phone);
    if (!normPhone) {
      unverifiable.push("phone");
    }
    if (normPhone) {
      const match = await ctx.db
        .query("leadSuppression")
        .withIndex("by_workspace_match", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("matchOn", "phone")
            .eq("value", normPhone),
        )
        .first();
      if (match !== null) {
        return {
          suppressed: true,
          matchedOn: "phone",
          reason: match.reason,
        };
      }
    }
  }

  // 5. Provera po email adresi
  if (email) {
    const normEmail = email.trim().toLowerCase();
    if (normEmail) {
      const match = await ctx.db
        .query("leadSuppression")
        .withIndex("by_workspace_match", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("matchOn", "email")
            .eq("value", normEmail),
        )
        .first();
      if (match !== null) {
        return {
          suppressed: true,
          matchedOn: "email",
          reason: match.reason,
        };
      }
    }
  }

  return {
    suppressed: false,
    ...(unverifiable.length > 0 ? { unverifiable } : {}),
  };
}

/**
 * Dodaje novi unos u listu zabrane kontakta.
 * Ulazna vrednost se striktno normalizuje. Ako je telefon nenormalizabilan, odbija se.
 */
export const addSuppression = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    kind: v.union(
      v.literal("postojeci_klijent"),
      v.literal("rekao_ne"),
      v.literal("trazio_da_ga_ne_zovemo"),
      v.literal("interno"),
    ),
    matchOn: v.union(
      v.literal("pib"),
      v.literal("domain"),
      v.literal("phone"),
      v.literal("email"),
      v.literal("companyId"),
    ),
    value: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);

    let normalizedValue = "";
    switch (args.matchOn) {
      case "phone": {
        const norm = normalizePhoneRs(args.value);
        if (!norm) {
          throw new ConvexError({
            code: "invalid",
            message:
              "Telefon se ne može normalizovati na validan srpski format (+381...). Nenormalizovan broj se ne može dodati u listu zabrane.",
          });
        }
        normalizedValue = norm;
        break;
      }
      case "domain": {
        const norm = normalizeDomain(args.value);
        if (!norm) {
          throw new ConvexError({
            code: "invalid",
            message: "Domen nije validan.",
          });
        }
        normalizedValue = norm;
        break;
      }
      case "email": {
        const norm = args.value.trim().toLowerCase();
        if (!norm || !norm.includes("@")) {
          throw new ConvexError({
            code: "invalid",
            message: "Email adresa nije validna.",
          });
        }
        normalizedValue = norm;
        break;
      }
      case "pib": {
        const norm = args.value.trim();
        if (!norm) {
          throw new ConvexError({
            code: "invalid",
            message: "PIB ne sme biti prazan.",
          });
        }
        normalizedValue = norm;
        break;
      }
      case "companyId": {
        const norm = args.value.trim();
        if (!norm) {
          throw new ConvexError({
            code: "invalid",
            message: "ID firme ne sme biti prazan.",
          });
        }
        normalizedValue = norm;
        break;
      }
    }

    // Proveri da li već postoji u listi
    const existing = await ctx.db
      .query("leadSuppression")
      .withIndex("by_workspace_match", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("matchOn", args.matchOn)
          .eq("value", normalizedValue),
      )
      .first();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        kind: args.kind,
        reason: args.reason ?? existing.reason,
      });
      return existing._id;
    }

    return await ctx.db.insert("leadSuppression", {
      workspaceId: args.workspaceId,
      kind: args.kind,
      matchOn: args.matchOn,
      value: normalizedValue,
      reason: args.reason,
      addedBy: membership.userId,
      addedAt: Date.now(),
    });
  },
});

/**
 * Uklanja unos iz liste zabrane kontakta.
 */
export const removeSuppression = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("leadSuppression"),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const row = await ctx.db.get(args.id);
    if (row === null || row.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Zapis zabrane nije pronađen.",
      });
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/**
 * Prikazuje sve stavke sa liste zabrane kontakta za radni prostor.
 */
export const listSuppression = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    return await ctx.db
      .query("leadSuppression")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();
  },
});
