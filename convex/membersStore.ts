import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { deleteLoginMachinery, requireMembership } from "./lib/auth";
import { isEmailInAllowlist } from "./auth";

/**
 * Upravljanje članovima radnog prostora (sekcija „Pristup").
 *
 * `role` polje se NAMERNO ne koristi kao sistem dozvola (to je van opsega) —
 * ovde služi samo za prikaz i za pravilo „ne briši poslednjeg ownera". Sve
 * funkcije gateuju kroz `requireMembership` i porede `workspaceId` iz argumenta
 * sa onim iz članstva pozivaoca, isto kao `invitesStore`.
 */

const uloga = v.union(v.literal("owner"), v.literal("client_viewer"));

// ─────────────────────────────────────────────────────────────────────────────
// listMembers — spisak članova za sekciju „Pristup".
// ─────────────────────────────────────────────────────────────────────────────
export const listMembers = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      email: v.union(v.string(), v.null()),
      role: uloga,
      joinedAt: v.number(),
      hasPassword: v.boolean(),
      emailVerified: v.boolean(),
      inAllowlist: v.boolean(),
      leadCount: v.number(),
      isSelf: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    const rows = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // Najnoviji član prvi.
    rows.sort((a, b) => b._creationTime - a._creationTime);

    const zapisi = [];
    for (const clan of rows) {
      const user = await ctx.db.get(clan.userId);
      const email = user?.email ?? null;

      // Ima li password nalog: `providerAndAccountId` je (provider, accountId), a
      // za password provajder je `accountId` = normalizovan email (auth.ts
      // `profile()`), pa je eq nad oba polja tačan pogodak.
      let hasPassword = false;
      if (email) {
        const acc = await ctx.db
          .query("authAccounts")
          .withIndex("providerAndAccountId", (q) =>
            q.eq("provider", "password").eq("providerAccountId", email),
          )
          .first();
        hasPassword = acc !== null;
      }

      // Broj leadova čiji je vlasnik ovaj član (prenose se pri uklanjanju).
      const leadovi = await ctx.db
        .query("leadAssignments")
        .withIndex("by_workspace_owner", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("ownerUserId", clan.userId),
        )
        .collect();

      zapisi.push({
        userId: clan.userId,
        email,
        role: clan.role,
        joinedAt: clan._creationTime,
        hasPassword,
        emailVerified: user?.emailVerificationTime !== undefined,
        inAllowlist: email ? isEmailInAllowlist(email) : false,
        leadCount: leadovi.length,
        isSelf: clan.userId === membership.userId,
      });
    }
    return zapisi;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// removeMember — ukloni člana i prenesi njegove leadove na drugog.
// ─────────────────────────────────────────────────────────────────────────────
export const removeMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    // NIJE opcion: bez izabranog primaoca, prenešeni leadovi bi pokazivali na
    // obrisanog vlasnika. Ekran bira, ne pogađa.
    preuzimaLeadoveUserId: v.id("users"),
  },
  returns: v.object({ prenetoLeadova: v.number() }),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    // Ne možeš sebe — zaključao bi se napolju.
    if (args.userId === membership.userId) {
      throw new ConvexError({
        code: "bad_request",
        message: "Ne možeš da ukloniš sam/a sebe iz radnog prostora.",
      });
    }

    // Primalac leadova ne sme biti onaj koga uklanjamo.
    if (args.preuzimaLeadoveUserId === args.userId) {
      throw new ConvexError({
        code: "bad_request",
        message: "Leadovi ne mogu da se prenesu na člana koga uklanjaš.",
      });
    }

    // Svi članovi ovog prostora — za validacije (meta, primalac, poslednji owner).
    const clanovi = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const meta = clanovi.filter((m) => m.userId === args.userId);
    if (meta.length === 0) {
      throw new ConvexError({
        code: "not_found",
        message: "Ta osoba nije član ovog radnog prostora.",
      });
    }

    const primalacJeClan = clanovi.some(
      (m) => m.userId === args.preuzimaLeadoveUserId,
    );
    if (!primalacJeClan) {
      throw new ConvexError({
        code: "bad_request",
        message: "Primalac leadova mora biti član ovog radnog prostora.",
      });
    }

    // Ne možeš poslednjeg ownera — ostao bi prostor bez ijednog vlasnika.
    const metaJeOwner = meta.some((m) => m.role === "owner");
    if (metaJeOwner) {
      const ownera = clanovi.filter((m) => m.role === "owner").length;
      if (ownera <= 1) {
        throw new ConvexError({
          code: "bad_request",
          message:
            "Ne možeš da ukloniš poslednjeg vlasnika. Prvo dodeli ulogu vlasnika nekom drugom.",
        });
      }
    }

    const now = Date.now();

    // Prenos leadova: svaki assignment tog vlasnika ide na primaoca, uz „dodela"
    // događaj (isti obrazac kao `leadCrmStore.assignLead`). Ovo je i jedini
    // trajni trag uklanjanja — po dizajnu, bez zasebne audit tabele.
    const assignments = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_owner", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("ownerUserId", args.userId),
      )
      .collect();

    for (const a of assignments) {
      await ctx.db.patch(a._id, {
        ownerUserId: args.preuzimaLeadoveUserId,
        updatedAt: now,
      });
      await ctx.db.insert("leadStageEvents", {
        workspaceId: args.workspaceId,
        companyId: a.companyId,
        kind: "dodela",
        fromValue: String(args.userId),
        toValue: String(args.preuzimaLeadoveUserId),
        actorUserId: membership.userId,
        note: "Vlasništvo prenešeno pri uklanjanju člana iz radnog prostora.",
        occurredAt: now,
      });
    }

    // UPOZORENJE: ako je adresa ovog člana u `ALLOWED_EMAILS`, ovo brisanje je
    // NEĆE zaustaviti da ponovo uđe — `isEmailAllowed` pravilo 3 (allowlista) ne
    // gleda ni `members` ni `authAccounts`, pa bi novi `signUp` te adrese opet
    // prošao. Ekran to mora reći kad uklanja takvu adresu. (Uklanjanje iz
    // `ALLOWED_EMAILS` je ručna izmena env-a, van ovog toka.)
    await deleteLoginMachinery(ctx, args.userId);

    // Članstvo mete u ovom prostoru se briše; `users` red OSTAJE jer
    // `leadStageEvents.actorUserId` i istorija pokazuju na njega.
    for (const m of meta) await ctx.db.delete(m._id);

    return { prenetoLeadova: assignments.length };
  },
});
