import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { slugify } from "./lib/slug";

/**
 * ============================================================================
 * POSTS STORE (NV1) — Skladište za blog postove i revizije
 * ============================================================================
 *
 * ARHITEKTONSKA PRAVILA (§0, §5, §5.1, §5.2):
 * 1. Multi-tenant od prvog dana — svaki post pripada jednom radnom prostoru (`workspaceId`).
 * 2. Status novokreiranog posta je uvek "draft".
 * 3. Tagovi se NE indeksiraju u bazi (§5.1) — pretraga po tagovima ide u memoriji.
 * 4. Nema polja `sourceRefs`.
 * 5. Nema javnih upita (NV2).
 * 6. Nema publish mutacije (NV2 kapije).
 * 7. Zadržavanje revizija (§5.2): poslednjih 20 po postu ili sve mlađe od 180 dana.
 * ============================================================================
 */

export const postKindValidator = v.union(
  v.literal("note"),
  v.literal("article"),
);

export const postCategoryValidator = v.union(
  v.literal("novac_rokovi"),
  v.literal("odluke"),
  v.literal("kako_radi"),
  v.literal("greske"),
  v.literal("ai_razvoj"),
  v.literal("srpski_kontekst"),
);

export const postStatusValidator = v.union(
  v.literal("draft"),
  v.literal("scheduled"),
  v.literal("published"),
  v.literal("archived"),
);

/**
 * Kreira novi post sa statusom "draft".
 * Generiše i proverava jedinstvenost slug-a unutar radnog prostora.
 */
export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    kind: postKindValidator,
    category: postCategoryValidator,
    title: v.string(),
    dek: v.optional(v.string()),
    body: v.optional(v.string()),
    authorName: v.optional(v.string()),
    authorRole: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    slug: v.optional(v.string()),
  },
  returns: v.object({
    postId: v.id("posts"),
    status: v.literal("draft"),
  }),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const trimmedTitle = args.title.trim();
    if (!trimmedTitle) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Naslov posta ne sme biti prazan.",
      });
    }

    let baseSlug = args.slug?.trim() ? slugify(args.slug) : slugify(trimmedTitle);
    if (!baseSlug) {
      baseSlug = `post-${Date.now()}`;
    }

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await ctx.db
        .query("posts")
        .withIndex("by_workspace_slug", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("slug", slug),
        )
        .first();
      if (!existing) break;
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      workspaceId: args.workspaceId,
      slug,
      locale: "sr-Latn",
      kind: args.kind,
      category: args.category,
      title: trimmedTitle,
      dek: args.dek?.trim() ?? "",
      body: args.body ?? "",
      authorName: args.authorName?.trim() || "Enigma IT",
      authorRole: args.authorRole?.trim() || undefined,
      tags: args.tags ?? [],
      status: "draft",
      updatedAt: now,
      ownProofChecked: false,
    });

    return {
      postId,
      status: "draft" as const,
    };
  },
});

/**
 * Ažurira draft verziju posta i postavlja novo vreme izmene (`updatedAt`).
 */
export const updateDraft = mutation({
  args: {
    postId: v.id("posts"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    kind: v.optional(postKindValidator),
    category: v.optional(postCategoryValidator),
    dek: v.optional(v.string()),
    body: v.optional(v.string()),
    coverStorageId: v.optional(v.id("_storage")),
    coverAlt: v.optional(v.string()),
    authorName: v.optional(v.string()),
    authorRole: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
    ogImageStorageId: v.optional(v.id("_storage")),
    readingMinutes: v.optional(v.number()),
    ownProofChecked: v.optional(v.boolean()),
    ownProofNote: v.optional(v.string()),
    humanizerPassedAt: v.optional(v.number()),
    relatedSlugs: v.optional(v.array(v.string())),
  },
  returns: v.object({
    success: v.boolean(),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.workspaceId !== membership.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Post nije pronađen u ovom radnom prostoru.",
      });
    }

    const updates: Partial<Doc<"posts">> = {};

    if (args.title !== undefined) {
      const trimmed = args.title.trim();
      if (!trimmed) {
        throw new ConvexError({
          code: "invalid_argument",
          message: "Naslov ne sme biti prazan.",
        });
      }
      updates.title = trimmed;
    }

    if (args.slug !== undefined) {
      const trimmedSlug = slugify(args.slug);
      if (!trimmedSlug) {
        throw new ConvexError({
          code: "invalid_argument",
          message: "Slug ne sme biti prazan.",
        });
      }
      if (trimmedSlug !== post.slug) {
        const existing = await ctx.db
          .query("posts")
          .withIndex("by_workspace_slug", (q) =>
            q.eq("workspaceId", post.workspaceId).eq("slug", trimmedSlug),
          )
          .first();
        if (existing && existing._id !== post._id) {
          throw new ConvexError({
            code: "slug_conflict",
            message: `Post sa slug-om "${trimmedSlug}" već postoji u ovom radnom prostoru.`,
          });
        }
        updates.slug = trimmedSlug;
      }
    }

    if (args.kind !== undefined) updates.kind = args.kind;
    if (args.category !== undefined) updates.category = args.category;
    if (args.dek !== undefined) updates.dek = args.dek;
    if (args.body !== undefined) updates.body = args.body;
    if (args.coverStorageId !== undefined) updates.coverStorageId = args.coverStorageId;
    if (args.coverAlt !== undefined) updates.coverAlt = args.coverAlt;
    if (args.authorName !== undefined) updates.authorName = args.authorName;
    if (args.authorRole !== undefined) updates.authorRole = args.authorRole;
    if (args.tags !== undefined) updates.tags = args.tags;
    if (args.seoTitle !== undefined) updates.seoTitle = args.seoTitle;
    if (args.seoDescription !== undefined) updates.seoDescription = args.seoDescription;
    if (args.canonicalUrl !== undefined) updates.canonicalUrl = args.canonicalUrl;
    if (args.ogImageStorageId !== undefined) updates.ogImageStorageId = args.ogImageStorageId;
    if (args.readingMinutes !== undefined) updates.readingMinutes = args.readingMinutes;
    if (args.ownProofChecked !== undefined) updates.ownProofChecked = args.ownProofChecked;
    if (args.ownProofNote !== undefined) updates.ownProofNote = args.ownProofNote;
    if (args.humanizerPassedAt !== undefined) updates.humanizerPassedAt = args.humanizerPassedAt;
    if (args.relatedSlugs !== undefined) updates.relatedSlugs = args.relatedSlugs;

    const now = Date.now();
    updates.updatedAt = now;

    await ctx.db.patch(args.postId, updates);

    // Ako je post već objavljen, asinhrono osvežavamo Next.js ISR keš (§9).
    // Mutacije ne smeju da rade mrežni poziv, a neuspeh osvežavanja ne sme da poništi izmene.
    if (post.status === "published") {
      const finalSlug = updates.slug ?? post.slug;
      await ctx.scheduler.runAfter(0, internal.http.revalidatePost, {
        slug: finalSlug,
      });
      if (updates.slug !== undefined && updates.slug !== post.slug) {
        await ctx.scheduler.runAfter(0, internal.http.revalidatePost, {
          slug: post.slug,
        });
      }
    }

    return {
      success: true,
      updatedAt: now,
    };
  },
});

/**
 * Snima novu reviziju sadržaja posta u `postRevisions`.
 */
export const saveRevision = mutation({
  args: {
    postId: v.id("posts"),
    body: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.object({
    revisionId: v.id("postRevisions"),
    savedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.workspaceId !== membership.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Post nije pronađen u ovom radnom prostoru.",
      });
    }

    const now = Date.now();
    const revisionId = await ctx.db.insert("postRevisions", {
      postId: args.postId,
      body: args.body,
      savedAt: now,
      note: args.note?.trim() || undefined,
    });

    return {
      revisionId,
      savedAt: now,
    };
  },
});

/**
 * Arhivira post postavljanjem statusa na "archived".
 */
export const archive = mutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.workspaceId !== membership.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Post nije pronađen u ovom radnom prostoru.",
      });
    }

    const now = Date.now();
    const wasPublished = post.status === "published";

    await ctx.db.patch(args.postId, {
      status: "archived",
      updatedAt: now,
    });

    // Arhiviranje objavljenog posta ga sklanja iz javnog upita, ali keširana
    // stranica na enigmait.rs ostaje živa do isteka ISR prozora (sat vremena).
    // Bez ovoga bi arhiviran tekst i dalje bio dostupan, a `unpublish` bi radio
    // ono što `archive` ne radi — dve komande, dva različita ponašanja.
    if (wasPublished) {
      await ctx.scheduler.runAfter(0, internal.http.revalidatePost, {
        slug: post.slug,
      });
    }

    return { success: true };
  },
});

/**
 * Objavljuje post uz striktnu proveru kapija pre objave (§4).
 * Odbija objavu (baca ConvexError) ako bilo koja od 4 kapije nije ispunjena.
 */
export const publish = mutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.object({
    success: v.boolean(),
    status: v.literal("published"),
    publishedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.workspaceId !== membership.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Post nije pronađen u ovom radnom prostoru.",
      });
    }

    // §4 Kapije pre objave — blokade, ne upozorenja:
    // 1. ownProofChecked === true
    if (post.ownProofChecked !== true) {
      throw new ConvexError({
        code: "own_proof_required",
        message:
          "Kapija objave pala: Vlasnički dokaz nije potvrđen (ownProofChecked mora biti označen od strane čoveka).",
      });
    }

    // 2. humanizerPassedAt postavljen
    if (post.humanizerPassedAt === undefined || post.humanizerPassedAt === null) {
      throw new ConvexError({
        code: "humanizer_required",
        message:
          "Kapija objave pala: Tekst nije prošao proveru humanizera (humanizerPassedAt nije postavljen).",
      });
    }

    // 3. dek neprazan
    if (!post.dek || post.dek.trim().length === 0) {
      throw new ConvexError({
        code: "dek_required",
        message:
          "Kapija objave pala: Podnaslov (dek) je prazan.",
      });
    }

    // 4. coverAlt popunjen ako postoji slika
    if (
      post.coverStorageId !== undefined &&
      (!post.coverAlt || post.coverAlt.trim().length === 0)
    ) {
      throw new ConvexError({
        code: "cover_alt_required",
        message:
          "Kapija objave pala: Naslovna slika postoji, ali je opis (coverAlt) prazan.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.postId, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });

    // Asinhrono osvežavanje Next.js ISR keša (§9).
    await ctx.scheduler.runAfter(0, internal.http.revalidatePost, {
      slug: post.slug,
    });

    return {
      success: true,
      status: "published" as const,
      publishedAt: now,
    };
  },
});

/**
 * Vraća objavljeni ili zakazani post u status nacrta ("draft").
 */
export const unpublish = mutation({
  args: {
    postId: v.id("posts"),
  },
  returns: v.object({
    success: v.boolean(),
    status: v.literal("draft"),
  }),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.workspaceId !== membership.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Post nije pronađen u ovom radnom prostoru.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.postId, {
      status: "draft",
      updatedAt: now,
    });

    // Asinhrono osvežavanje Next.js ISR keša nakon povlačenja posta (§9).
    await ctx.scheduler.runAfter(0, internal.http.revalidatePost, {
      slug: post.slug,
    });

    return {
      success: true,
      status: "draft" as const,
    };
  },
});

/**
 * Zadržavanje revizija (§5.2):
 * Za svaki post zadržava poslednjih 20 revizija ILI sve mlađe od 180 dana, šta je veće.
 *
 * OGRANIČENO NAMERNO. Ranija verzija je radila `ctx.db.query("posts").collect()` —
 * ceo spisak postova iz SVIH radnih prostora u jednoj transakciji, pa za svaki
 * post sve njegove revizije. To je isti kvar koji je popravljen u
 * `leadInboundIngest`: radi dok je tabela mala, a onda tiho probije Convexov
 * plafon pročitanih dokumenata i cron prestane da radi bez ijedne poruke.
 *
 * Zato: stranica od PRUNE_POSTS_PER_RUN postova po pozivu, sa kursorom, i
 * najviše REVISIONS_SCAN_CAP revizija po postu. Ako post ima više revizija od
 * te granice, ostatak ulazi u vidno polje u nekom od narednih prolaza — posao
 * konvergira umesto da pukne.
 */
const PRUNE_POSTS_PER_RUN = 25;
const REVISIONS_SCAN_CAP = 500;
const RETENTION_MIN_COUNT = 20;
const RETENTION_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export const pruneRevisions = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    deletedCount: v.number(),
    scannedPosts: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - RETENTION_MAX_AGE_MS;

    const page = await ctx.db.query("posts").paginate({
      numItems: PRUNE_POSTS_PER_RUN,
      cursor: args.cursor ?? null,
    });

    let deletedCount = 0;

    for (const post of page.page) {
      const revisions = await ctx.db
        .query("postRevisions")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .order("desc")
        .take(REVISIONS_SCAN_CAP);

      if (revisions.length <= RETENTION_MIN_COUNT) continue;

      // `.order("desc")` ide po _creationTime; `savedAt` se upisuje u istom
      // trenutku, ali se sortira izričito da redosled ne zavisi od te podudarnosti.
      revisions.sort((a, b) => b.savedAt - a.savedAt);

      for (const rev of revisions.slice(RETENTION_MIN_COUNT)) {
        if (rev.savedAt < cutoff) {
          await ctx.db.delete(rev._id);
          deletedCount++;
        }
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.postsStore.pruneRevisions, {
        cursor: page.continueCursor,
      });
    }

    return {
      deletedCount,
      scannedPosts: page.page.length,
      isDone: page.isDone,
    };
  },
});
