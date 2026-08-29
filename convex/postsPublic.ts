import { query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { postCategoryValidator, postKindValidator } from "./postsStore";

/**
 * ============================================================================
 * JAVNI UPITI ZA NOVOSTI / BLOG (§7, NV1)
 * ============================================================================
 *
 * BEZBEDNOSNO JEZGRO:
 * 1. Filter `status === "published"` i `publishedAt <= Date.now()` je UNUTAR
 *    handlera, nikada u klijentskom kodu (Next.js).
 * 2. Upit NE SME da prima `status` kao argument, ni u kom obliku.
 * 3. Nacrti (draft), zakazani (scheduled) i arhivirani (archived) postovi se
 *    NE VRAĆAJU ni pod kojim argumentima.
 * 4. Upiti vraćaju SAMO polja koja idu na javnu stranicu. Interna polja
 *    (`ownProofChecked`, `ownProofNote`, `humanizerPassedAt`, `reviewedAt`,
 *    `workspaceId`, `status`) se NE SERVIRAJU — uvek se gradi eksplicitan objekat.
 * 5. Eksplicitan `returns` validator striktno definiše dozvoljena javna polja.
 * 6. Plafon čitanja (limit je ograničen na najviše 50 stavki po pozivu).
 * ============================================================================
 */

export const publicPostSummaryValidator = v.object({
  _id: v.id("posts"),
  _creationTime: v.number(),
  slug: v.string(),
  locale: v.string(),
  kind: postKindValidator,
  category: postCategoryValidator,
  title: v.string(),
  dek: v.string(),
  coverStorageId: v.optional(v.id("_storage")),
  coverAlt: v.optional(v.string()),
  authorName: v.string(),
  authorRole: v.optional(v.string()),
  tags: v.array(v.string()),
  publishedAt: v.number(),
  updatedAt: v.number(),
  readingMinutes: v.optional(v.number()),
});

export const publicPostDetailValidator = v.object({
  _id: v.id("posts"),
  _creationTime: v.number(),
  slug: v.string(),
  locale: v.string(),
  kind: postKindValidator,
  category: postCategoryValidator,
  title: v.string(),
  dek: v.string(),
  body: v.string(),
  coverStorageId: v.optional(v.id("_storage")),
  coverAlt: v.optional(v.string()),
  authorName: v.string(),
  authorRole: v.optional(v.string()),
  tags: v.array(v.string()),
  publishedAt: v.number(),
  updatedAt: v.number(),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  ogImageStorageId: v.optional(v.id("_storage")),
  readingMinutes: v.optional(v.number()),
  relatedSlugs: v.optional(v.array(v.string())),
});

/**
 * Javni upit za listanje objavljenih postova radnog prostora.
 *
 * Podržava filtriranje po kategoriji i paginaciju.
 * NIKADA ne vraća draft, scheduled ni archived postove.
 */
export const listPublished = query({
  args: {
    workspaceSlug: v.string(),
    category: v.optional(postCategoryValidator),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    posts: v.array(publicPostSummaryValidator),
    nextCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.workspaceSlug))
      .first();

    if (!workspace) {
      return { posts: [], nextCursor: null, hasMore: false };
    }

    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const now = Date.now();

    // Kursor je `publishedAt` poslednje pročitane stavke, kao string.
    // Ranije je kursor bio `_id`, pa se stranica tražila kroz findIndex nad
    // CELIM spiskom. Dve posledice, obe otklonjene ovde:
    //   1. `.collect()` je čitao sve objavljene postove pri svakom pozivu
    //      javne rute — isti kvar kao u pruneRevisions i leadInboundIngest.
    //   2. Ako bi post iz kursora u međuvremenu bio povučen, findIndex bi
    //      vratio -1 i listanje bi se TIHO vratilo na prvu stranicu. Čitalac
    //      bi dobio stranicu 1 umesto stranice 3, bez ijedne poruke.
    //      Neuspeh ne sme da izgleda kao uredan rezultat.
    let cursorAt: number | null = null;
    if (args.cursor !== undefined) {
      const parsed = Number(args.cursor);
      if (!Number.isFinite(parsed)) {
        throw new ConvexError({
          code: "invalid_cursor",
          message: "Kursor nije ispravan.",
        });
      }
      cursorAt = parsed;
    }

    // Kad je zadata kategorija, indeks je i dalje po statusu i datumu, pa se
    // čita nešto šire i filtrira u memoriji. Ograničeno namerno: nikad preko
    // SCAN_CAP dokumenata po pozivu, ma koliko kategorija bila retka.
    const SCAN_CAP = 200;
    const scanLimit =
      args.category === undefined
        ? limit + 1
        : Math.min(limit * 5, SCAN_CAP);

    const raw = await ctx.db
      .query("posts")
      .withIndex("by_workspace_status_published", (q) => {
        const base = q
          .eq("workspaceId", workspace._id)
          .eq("status", "published");
        // cursorAt je uvek <= now, pa `lt(cursorAt)` već isključuje budućnost.
        // Napomena: dva posta objavljena u istoj milisekundi ne mogu se
        // razlučiti ovim kursorom. Za jedan blog to se ne dešava.
        return cursorAt === null
          ? base.lte("publishedAt", now)
          : base.lt("publishedAt", cursorAt);
      })
      .order("desc")
      .take(scanLimit);

    const usable = raw.filter(
      (p) => p.publishedAt !== undefined && p.publishedAt <= now,
    );

    const filtered =
      args.category === undefined
        ? usable
        : usable.filter((p) => p.category === args.category);

    const page = filtered.slice(0, limit);

    // hasMore se određuje iz DVA razloga, da se „nema više" nikad ne slaže
    // sa „nisam stigao da pogledam":
    //   a) posle filtriranja je ostalo više nego što staje na stranicu
    //   b) skeniranje je popunilo svoj plafon, pa iza njega može biti još
    let hasMore = false;
    let nextCursor: string | null = null;

    if (filtered.length > limit) {
      hasMore = true;
      nextCursor = String(page[page.length - 1].publishedAt);
    } else if (raw.length === scanLimit && raw.length > 0) {
      hasMore = true;
      nextCursor = String(raw[raw.length - 1].publishedAt);
    }

    return {
      posts: page.map((post) => ({
        _id: post._id,
        _creationTime: post._creationTime,
        slug: post.slug,
        locale: post.locale,
        kind: post.kind,
        category: post.category,
        title: post.title,
        dek: post.dek,
        coverStorageId: post.coverStorageId,
        coverAlt: post.coverAlt,
        authorName: post.authorName,
        authorRole: post.authorRole,
        tags: post.tags,
        publishedAt: post.publishedAt as number,
        updatedAt: post.updatedAt,
        readingMinutes: post.readingMinutes,
      })),
      nextCursor,
      hasMore,
    };
  },
});

/**
 * Javni upit za dohvatanje jednog objavljenog posta po slug-u.
 *
 * Vraća celokupan javni sadržaj posta uključujući telo (body) i SEO polja.
 * Ako post ne postoji, nije u statusu "published", ili mu je datum objave u budućnosti, vraća null.
 */
export const getPublishedBySlug = query({
  args: {
    workspaceSlug: v.string(),
    slug: v.string(),
  },
  returns: v.union(publicPostDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.workspaceSlug))
      .first();

    if (!workspace) {
      return null;
    }

    const post = await ctx.db
      .query("posts")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceId", workspace._id).eq("slug", args.slug),
      )
      .first();

    if (!post) {
      return null;
    }

    const now = Date.now();
    // Stroga bezbednosna provera (§7):
    // Nikada ne servirati draft, scheduled pre zakazanog vremena ili arhiviran post
    if (
      post.status !== "published" ||
      post.publishedAt === undefined ||
      post.publishedAt > now
    ) {
      return null;
    }

    return {
      _id: post._id,
      _creationTime: post._creationTime,
      slug: post.slug,
      locale: post.locale,
      kind: post.kind,
      category: post.category,
      title: post.title,
      dek: post.dek,
      body: post.body,
      coverStorageId: post.coverStorageId,
      coverAlt: post.coverAlt,
      authorName: post.authorName,
      authorRole: post.authorRole,
      tags: post.tags,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      canonicalUrl: post.canonicalUrl,
      ogImageStorageId: post.ogImageStorageId,
      readingMinutes: post.readingMinutes,
      relatedSlugs: post.relatedSlugs,
    };
  },
});
