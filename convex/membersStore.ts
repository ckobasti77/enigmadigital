import { ConvexError, v } from "convex/values";
import { deleteLoginMachinery } from "./lib/auth";
import { isEmailInAllowlist } from "./auth";
import { ulogaValidator } from "./lib/uloge";
import { projekatMutation, projekatQuery } from "./lib/projekat";
import { ukloniClanaIzRadnogDela } from "./prostor/lib/radniDeo";

/**
 * Upravljanje članovima projekta (sekcija „Pristup").
 *
 * Pristup daju omotači iz `lib/projekat.ts`: spisak čita svaki član projekta,
 * a uklanjanje člana traži vlasnika projekta (PROJEKTI-PLAN §5). Pravilo „ne
 * briši poslednjeg ownera" ostaje u handleru.
 */

const uloga = ulogaValidator;

// ─────────────────────────────────────────────────────────────────────────────
// listMembers — spisak članova za sekciju „Pristup".
// ─────────────────────────────────────────────────────────────────────────────
export const listMembers = projekatQuery({
  args: {},
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
        isSelf: clan.userId === ctx.projekat.userId,
      });
    }
    return zapisi;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// promeniUlogu — vlasnik menja ulogu člana ovog projekta (E16).
// ─────────────────────────────────────────────────────────────────────────────
export const promeniUlogu = projekatMutation({
  uloga: "owner",
  args: {
    userId: v.id("users"),
    uloga,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clanovi = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const meta = clanovi.filter((m) => m.userId === args.userId);
    if (meta.length === 0) {
      throw new ConvexError({
        code: "not_found",
        message: "Ta osoba nije član ovog projekta.",
      });
    }

    // Isto pravilo kao kod uklanjanja: projekat ne sme ostati bez vlasnika.
    const metaJeOwner = meta.some((m) => m.role === "owner");
    if (metaJeOwner && args.uloga !== "owner") {
      // Broje se drugi LJUDI sa ulogom vlasnika, ne redovi (C19): dupli red
      // istog člana ne sme da prođe kao drugi vlasnik.
      const drugihVlasnika = new Set(
        clanovi
          .filter((m) => m.role === "owner" && m.userId !== args.userId)
          .map((m) => m.userId),
      ).size;
      if (drugihVlasnika === 0) {
        throw new ConvexError({
          code: "bad_request",
          message:
            "Ne možeš da spustiš poslednjeg vlasnika. Prvo dodeli ulogu vlasnika nekom drugom.",
        });
      }
    }

    for (const m of meta) {
      if (m.role !== args.uloga) await ctx.db.patch(m._id, { role: args.uloga });
    }
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// removeMember — ukloni člana i prenesi njegove leadove na drugog.
// ─────────────────────────────────────────────────────────────────────────────
export const removeMember = projekatMutation({
  uloga: "owner",
  args: {
    userId: v.id("users"),
    // NIJE opcion: bez izabranog primaoca, prenešeni leadovi bi pokazivali na
    // obrisanog vlasnika. Ekran bira, ne pogađa.
    preuzimaLeadoveUserId: v.id("users"),
  },
  returns: v.object({ prenetoLeadova: v.number() }),
  handler: async (ctx, args) => {
    // Ne možeš sebe — zaključao bi se napolju.
    if (args.userId === ctx.projekat.userId) {
      throw new ConvexError({
        code: "bad_request",
        message: "Ne možeš da ukloniš sam/a sebe iz projekta.",
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
        message: "Ta osoba nije član ovog projekta.",
      });
    }

    const primalacJeClan = clanovi.some(
      (m) => m.userId === args.preuzimaLeadoveUserId,
    );
    if (!primalacJeClan) {
      throw new ConvexError({
        code: "bad_request",
        message: "Primalac leadova mora biti član ovog projekta.",
      });
    }

    // Ne možeš poslednjeg ownera — ostao bi prostor bez ijednog vlasnika.
    const metaJeOwner = meta.some((m) => m.role === "owner");
    if (metaJeOwner) {
      // Broje se drugi LJUDI sa ulogom vlasnika, ne redovi (C19).
      const drugihVlasnika = new Set(
        clanovi
          .filter((m) => m.role === "owner" && m.userId !== args.userId)
          .map((m) => m.userId),
      ).size;
      if (drugihVlasnika === 0) {
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
        actorUserId: ctx.projekat.userId,
        note: "Vlasništvo prenešeno pri uklanjanju člana iz projekta.",
        occurredAt: now,
      });
    }

    // UPOZORENJE: ako je adresa ovog člana u `ALLOWED_EMAILS`, ovo brisanje je
    // NEĆE zaustaviti da ponovo uđe — `isEmailAllowed` pravilo 3 (allowlista) ne
    // gleda ni `members` ni `authAccounts`, pa bi novi `signUp` te adrese opet
    // prošao. Ekran to mora reći kad uklanja takvu adresu. (Uklanjanje iz
    // `ALLOWED_EMAILS` je ručna izmena env-a, van ovog toka.)
    // Radni deo (SPAJANJE D23): uklonjen član se skida sa zadataka projekta.
    await ukloniClanaIzRadnogDela(ctx, {
      workspaceId: args.workspaceId,
      userId: args.userId,
      now,
    });

    // Članstvo mete u ovom prostoru se briše; `users` red OSTAJE jer
    // `leadStageEvents.actorUserId` i istorija pokazuju na njega.
    for (const m of meta) await ctx.db.delete(m._id);

    // Prijava se gasi samo kad meti ne ostane nijedno članstvo: uklanjanje iz
    // ovog prostora ne sme da je izbaci iz drugog.
    const preostalaClanstva = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (preostalaClanstva === null) {
      await deleteLoginMachinery(ctx, args.userId);
    }

    return { prenetoLeadova: assignments.length };
  },
});
