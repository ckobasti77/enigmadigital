import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import {
  claudeProsek,
  kvalitetSajta,
  pojasKvaliteta,
  type PojasKvaliteta,
} from "./lib/siteScore";

/**
 * ============================================================================
 * OCENE SAJTOVA — čitanje (GL10, sajt-ocena-plan.md §5)
 * ============================================================================
 *
 * Aplikacija NIKAD ne pravi ocenu: ne pokreće Lighthouse, ne zove LLM. Ovde se
 * samo čita ono što je skill upisao kroz uvoz (`leadImportStore.upisiOcenuSajta`).
 *
 * Ukupna ocena (`kvalitet`) se računa PRI ČITANJU (§0 pravilo 2) iz same
 * ocene — nigde se ne skladišti, pa promena težina u `siteScore.ts` menja sve
 * ekrane odjednom.
 *
 * Snimci se služe kao potpisani `ctx.storage.getUrl` linkovi iza članstva —
 * nikad kroz javnu rutu.
 */

/** Sažetak poslednje ocene za listu/filtere/mapu — bez teksta i snimaka. */
export type SazetakOcene = {
  auditId: Id<"leadSiteAudits">;
  auditedAt: number;
  kvalitet: number | null;
  pojas: PojasKvaliteta | null;
  cms: string | null;
  perfMobile: number | null;
  preporucenaPonuda: string | null;
};

export function sazetakOcene(audit: Doc<"leadSiteAudits">): SazetakOcene {
  const kvalitet = kvalitetSajta(audit);
  return {
    auditId: audit._id,
    auditedAt: audit.auditedAt,
    kvalitet,
    pojas: kvalitet === null ? null : pojasKvaliteta(kvalitet),
    cms: audit.cms ?? null,
    perfMobile: audit.lighthouse?.mobile?.performance ?? null,
    preporucenaPonuda: audit.claude?.preporucenaPonuda ?? null,
  };
}

/**
 * Poslednja ocena po firmi, preko pokazivača `poslednjaOcenaSajtaId` — jedan
 * `get` po firmi koja JE ocenjivana, nula za ostale. Firma bez pokazivača
 * nema ključ u mapi („nikad ocenjivano"), što je drugačije od ocene bez
 * broja (`kvalitet: null`, „ocenjivano, ali nijedan izvor nije uspeo").
 */
export async function ucitajPoslednjeOcene(
  ctx: QueryCtx,
  companies: Array<Doc<"leadCompanies"> | null>,
): Promise<Map<string, SazetakOcene>> {
  const out = new Map<string, SazetakOcene>();
  await Promise.all(
    companies.map(async (company) => {
      if (!company?.poslednjaOcenaSajtaId) return;
      const audit = await ctx.db.get(company.poslednjaOcenaSajtaId);
      if (!audit || audit.companyId !== company._id) return;
      out.set(String(company._id), sazetakOcene(audit));
    }),
  );
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// listSiteAudits — istorija ocena jedne firme, najnovija prva, sa linkovima
// ─────────────────────────────────────────────────────────────────────────────
export const listSiteAudits = query({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const company = await ctx.db.get(args.companyId);
    if (!company || company.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Firma nije pronađena u ovom radnom prostoru.",
      });
    }

    // Najviše 20 ocena: istorija se čuva cela, ali profil crta poslednjih 20 —
    // više od toga je već posao za izvoz, ne za ekran.
    const audits = await ctx.db
      .query("leadSiteAudits")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .take(20);

    const stavke = await Promise.all(
      audits.map(async (audit) => {
        const kvalitet = kvalitetSajta(audit);
        const [desktopUrl, mobilniUrl] = await Promise.all([
          audit.snimci?.desktopId ? ctx.storage.getUrl(audit.snimci.desktopId) : null,
          audit.snimci?.mobilniId ? ctx.storage.getUrl(audit.snimci.mobilniId) : null,
        ]);
        return {
          ...audit,
          kvalitet,
          pojas: kvalitet === null ? null : pojasKvaliteta(kvalitet),
          claudeProsek: claudeProsek(audit.claude),
          snimciUrl: {
            desktop: desktopUrl,
            mobilni: mobilniUrl,
          },
        };
      }),
    );

    return {
      audits: stavke,
      // Pokazivač na firmi može da zaostaje za istorijom (npr. ocena upisana
      // pa revertovana); ekran uzima najnoviju iz liste, ne pokazivač.
      poslednjaId: stavke[0]?._id ?? null,
    };
  },
});
