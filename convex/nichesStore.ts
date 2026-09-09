import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { normalizeNicheSlug } from "./lib/leadNormalize";
import { ucitajPoslednjeOcene } from "./leadSiteAuditsStore";
import { izvediBooking } from "./lib/siteScore";

/**
 * ============================================================================
 * NIŠE (GL1 backend; ekran je GL2) — plan §4.3, §7.3
 * ============================================================================
 *
 * Niša je entitet, ne slobodan tekst na firmi (plan §O7). Firma ima najviše
 * jednu (`leadCompanies.nicheId`), a niša nosi opis i spisak platformi na
 * kojima se traži.
 *
 * KLJUČNA PRAVILA:
 * 1. Opis pamti KO ga je napisao. Tekst koji je sastavio Claude i tekst koji je
 *    napisao čovek posle mesec dana izgledaju isto ako se autor ne zabeleži —
 *    a razlika je razlika između pretpostavke i znanja. Aplikacija NIKAD ne
 *    poziva LLM; `opisAutor: "claude"` može da upiše samo skill kroz uvoz.
 * 2. Brojači se računaju pri čitanju preko indeksa `by_workspace_niche`, nikad
 *    punim skenom `leadCompanies`.
 * 3. Niša sa firmama se ne briše. Brisanje bi ostavilo firme sa `nicheId` koji
 *    ne pokazuje nigde, a greška bi rekla koliko ih tačno ima.
 */

const platformaValidator = v.union(
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("tiktok"),
  v.literal("google_maps"),
  v.literal("011info"),
  v.literal("companywall"),
  v.literal("drugo"),
);

// ─────────────────────────────────────────────────────────────────────────────
// listNiches — spisak sa brojačima za tab „Niše".
// ─────────────────────────────────────────────────────────────────────────────
export const listNiches = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const niches = await ctx.db
      .query("niches")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    niches.sort((a, b) => a.naziv.localeCompare(b.naziv, "sr-RS"));

    const zapisi = [];
    for (const nisa of niches) {
      // Firme te niše preko indeksa (workspaceId, nicheId) — bez punog skena.
      const firme = await ctx.db
        .query("leadCompanies")
        .withIndex("by_workspace_niche", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("nicheId", nisa._id),
        )
        .collect();

      // „Bez sajta" broji SAMO `imaSajt === "ne"`. Firma koja nikad nije
      // proveravana i firma kod koje provera nije uspela nisu firme bez sajta
      // — one idu u `sajtNepoznato`, i taj broj se prikazuje odvojeno.
      let saSajtom = 0;
      let bezSajta = 0;
      let sajtNepoznato = 0;
      let hot = 0;
      let warm = 0;

      for (const firma of firme) {
        if (firma.imaSajt === "da") saSajtom++;
        else if (firma.imaSajt === "ne") bezSajta++;
        else sajtNepoznato++;

        if (firma.temperatura === "hot") hot++;
        else if (firma.temperatura === "warm") warm++;
      }

      // Ocena sajta po niši (GL10, plan §5.3) — SAMO iz postojećih ocena, preko
      // pokazivača na firmi; bez novih upita po firmi koja nema ocenu.
      const ocene = await ucitajPoslednjeOcene(ctx, firme);
      const cmsBrojaci = new Map<string, number>();
      let zbirKvaliteta = 0;
      let saKvalitetom = 0;
      let bezZakazivanja = 0;
      for (const firma of firme) {
        const o = ocene.get(String(firma._id));
        if (!o) continue;
        if (o.kvalitet !== null) {
          zbirKvaliteta += o.kvalitet;
          saKvalitetom++;
        }
        const cmsKljuc = o.cms ?? "bez CMS-a";
        cmsBrojaci.set(cmsKljuc, (cmsBrojaci.get(cmsKljuc) ?? 0) + 1);
        // „Bez zakazivanja" ima smisla samo kad niša to traži; inače je broj
        // laž koja izgleda kao podatak. Sajt sa formom za termin se ne broji.
        if (nisa.trebaZakazivanje === true) {
          const audit = await ctx.db.get(o.auditId);
          const booking = audit?.booking ?? izvediBooking(audit?.tehnologije);
          if (!booking && audit?.formaZaTermin !== true) bezZakazivanja++;
        }
      }
      const cmsRaspodela = [...cmsBrojaci.entries()]
        .map(([ime, broj]) => ({ ime, broj }))
        .sort((a, b) => b.broj - a.broj || a.ime.localeCompare(b.ime, "sr-RS"));

      const platforme = await ctx.db
        .query("nichePlatforms")
        .withIndex("by_niche", (q) => q.eq("nicheId", nisa._id))
        .collect();
      platforme.sort((a, b) => a.redosled - b.redosled);

      const autorEmail = nisa.createdBy
        ? ((await ctx.db.get(nisa.createdBy))?.email ?? null)
        : null;

      // Ko je poslednji pisao opis. Kad polja nema, bedž piše „Čovek" bez
      // imena — izmišljeno ime bi bilo gore od priznanja da ga ne znamo.
      const opisAutorEmail = nisa.opisAutorUserId
        ? ((await ctx.db.get(nisa.opisAutorUserId))?.email ?? null)
        : null;

      zapisi.push({
        ...nisa,
        createdByEmail: autorEmail,
        opisAutorEmail,
        platforme,
        brojaci: {
          firmi: firme.length,
          saSajtom,
          bezSajta,
          sajtNepoznato,
          hot,
          warm,
        },
        // GL10 (plan §5.3). `prosecanKvalitet` je `null` kad nijedan sajt u
        // niši nema ocenu sa brojem; `bezZakazivanja` je `null` kad niša ne
        // traži zakazivanje (nije „0 firmi bez zakazivanja").
        sajt: {
          ocenjeno: ocene.size,
          prosecanKvalitet:
            saKvalitetom > 0 ? Math.round(zbirKvaliteta / saKvalitetom) : null,
          cmsRaspodela,
          bezZakazivanja: nisa.trebaZakazivanje === true ? bezZakazivanja : null,
        },
      });
    }

    return zapisi;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// upsertNiche — ručno pravljenje ili preimenovanje niše.
// ─────────────────────────────────────────────────────────────────────────────
export const upsertNiche = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    // Bez `nicheId` je novo; sa njim je izmena.
    nicheId: v.optional(v.id("niches")),
    naziv: v.string(),
    // Slug se izvodi iz naziva kad se ne pošalje. Kod IZMENE se NE menja
    // automatski: slug je ključ po kome skill radi upsert, a tiha promena bi
    // sledeći run natera da napravi drugu nišu sa istim firmama.
    slug: v.optional(v.string()),
    sifreDelatnosti: v.optional(v.array(v.string())),
    // GL10 (plan §2.3): da li firme u niši žive od termina. Odsustvo u
    // argumentima = ne diraj postojeću vrednost.
    trebaZakazivanje: v.optional(v.boolean()),
  },
  returns: v.id("niches"),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const naziv = args.naziv.trim();
    if (!naziv) {
      throw new ConvexError({
        code: "invalid",
        message: "Naziv niše ne sme biti prazan.",
      });
    }

    const now = Date.now();

    if (args.nicheId) {
      const existing = await ctx.db.get(args.nicheId);
      if (!existing || existing.workspaceId !== args.workspaceId) {
        throw new ConvexError({
          code: "not_found",
          message: "Niša nije pronađena u ovom radnom prostoru.",
        });
      }

      await ctx.db.patch(args.nicheId, {
        naziv,
        sifreDelatnosti: args.sifreDelatnosti ?? existing.sifreDelatnosti,
        ...(typeof args.trebaZakazivanje === "boolean"
          ? { trebaZakazivanje: args.trebaZakazivanje }
          : {}),
        updatedAt: now,
      });
      return args.nicheId;
    }

    const slug = normalizeNicheSlug(args.slug ?? naziv);
    if (!slug) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Od naziva se ne može napraviti ključ (slug). Napiši naziv slovima ili ciframa.",
      });
    }

    const duplikat = await ctx.db
      .query("niches")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("slug", slug),
      )
      .first();
    if (duplikat !== null) {
      throw new ConvexError({
        code: "conflict",
        message: `Niša sa ključem „${slug}" već postoji („${duplikat.naziv}").`,
      });
    }

    return await ctx.db.insert("niches", {
      workspaceId: args.workspaceId,
      slug,
      naziv,
      sifreDelatnosti: args.sifreDelatnosti,
      ...(typeof args.trebaZakazivanje === "boolean"
        ? { trebaZakazivanje: args.trebaZakazivanje }
        : {}),
      createdBy: membership.userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// updateNicheOpis — čim čovek dirne opis, autor postaje čovek.
// ─────────────────────────────────────────────────────────────────────────────
export const updateNicheOpis = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    nicheId: v.id("niches"),
    opis: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const nisa = await ctx.db.get(args.nicheId);
    if (!nisa || nisa.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Niša nije pronađena u ovom radnom prostoru.",
      });
    }

    const opis = args.opis.trim();
    const now = Date.now();

    // Prazan tekst BRIŠE opis umesto da upiše prazan string — „nema opisa" i
    // „opis je prazan string koji je napisao čovek" nisu isto stanje.
    // `opisModel` se briše zajedno sa autorstvom: model koji je napisao tekst
    // koga više nema je podatak o niotkuda.
    await ctx.db.patch(args.nicheId, {
      opis: opis || undefined,
      opisAutor: opis ? "covek" : undefined,
      opisAt: opis ? now : undefined,
      opisAutorUserId: opis ? membership.userId : undefined,
      opisModel: undefined,
      updatedAt: now,
    });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Platforme niše — CRUD.
// ─────────────────────────────────────────────────────────────────────────────
export const upsertNichePlatform = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    nicheId: v.id("niches"),
    platformId: v.optional(v.id("nichePlatforms")),
    platforma: platformaValidator,
    url: v.optional(v.string()),
    napomena: v.optional(v.string()),
    redosled: v.optional(v.number()),
  },
  returns: v.id("nichePlatforms"),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const nisa = await ctx.db.get(args.nicheId);
    if (!nisa || nisa.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Niša nije pronađena u ovom radnom prostoru.",
      });
    }

    const url = args.url?.trim() || undefined;
    const napomena = args.napomena?.trim() || undefined;

    if (args.platformId) {
      const existing = await ctx.db.get(args.platformId);
      if (
        !existing ||
        existing.workspaceId !== args.workspaceId ||
        existing.nicheId !== args.nicheId
      ) {
        throw new ConvexError({
          code: "not_found",
          message: "Platforma nije pronađena u ovoj niši.",
        });
      }

      await ctx.db.patch(args.platformId, {
        platforma: args.platforma,
        url,
        napomena,
        redosled: args.redosled ?? existing.redosled,
      });
      return args.platformId;
    }

    // Redosled se ne pogađa: nova platforma ide na kraj postojećeg spiska.
    let redosled = args.redosled;
    if (redosled === undefined) {
      const postojece = await ctx.db
        .query("nichePlatforms")
        .withIndex("by_niche", (q) => q.eq("nicheId", args.nicheId))
        .collect();
      redosled = postojece.reduce((max, p) => Math.max(max, p.redosled), 0) + 1;
    }

    return await ctx.db.insert("nichePlatforms", {
      workspaceId: args.workspaceId,
      nicheId: args.nicheId,
      platforma: args.platforma,
      url,
      napomena,
      redosled,
      createdAt: Date.now(),
    });
  },
});

export const deleteNichePlatform = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    platformId: v.id("nichePlatforms"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const row = await ctx.db.get(args.platformId);
    if (row === null) return null; // već obrisana — idempotentno
    if (row.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    await ctx.db.delete(args.platformId);
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteNiche — samo prazna niša.
// ─────────────────────────────────────────────────────────────────────────────
export const deleteNiche = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    nicheId: v.id("niches"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const nisa = await ctx.db.get(args.nicheId);
    if (nisa === null) return null; // već obrisana — idempotentno
    if (nisa.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    // Firma sa `nicheId` koji ne pokazuje nigde je tiho pokvaren podatak: u
    // tabeli bi stajala prazna kolona, a filter po niši je nikad ne bi našao.
    // Zato se broj kaže izričito — čovek prvo prebaci firme, pa briše.
    const firme = await ctx.db
      .query("leadCompanies")
      .withIndex("by_workspace_niche", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("nicheId", args.nicheId),
      )
      .collect();

    if (firme.length > 0) {
      throw new ConvexError({
        code: "conflict",
        message: `U niši „${nisa.naziv}" je ${firme.length} ${
          firme.length === 1 ? "firma" : "firmi"
        }. Prvo ih prebaci u drugu nišu ili im skloni nišu, pa je onda obriši.`,
      });
    }

    const platforme = await ctx.db
      .query("nichePlatforms")
      .withIndex("by_niche", (q) => q.eq("nicheId", args.nicheId))
      .collect();
    for (const p of platforme) {
      await ctx.db.delete(p._id);
    }

    await ctx.db.delete(args.nicheId);
    return null;
  },
});
