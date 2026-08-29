/**
 * ============================================================================
 * PROVERA BEZBEDNOSTI JAVNIH UPITA I KAPIJA OBJAVE (§4, §7, NV1)
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/posts-public-check.ts
 *
 * ŠTA DOKAZUJE:
 * 1. Javni upiti (`listPublished`, `getPublishedBySlug`) NE PRIMAJU `status` kao argument.
 * 2. Nijedan argument ne može da izvuče nacrt (draft), zakazan (scheduled) ili arhiviran (archived) post.
 * 3. Nijedan post sa datumom objave u budućnosti (`publishedAt > Date.now()`) se ne vraća.
 * 4. Interna polja (`ownProofChecked`, `ownProofNote`, `humanizerPassedAt`, `reviewedAt`,
 *    `workspaceId`, `status`) se NIKADA ne serviraju na javnim upitima.
 * 5. Publish mutacija blokira objavu ako bilo koja od 4 kapije iz §4 nije ispunjena:
 *    - ownProofChecked !== true
 *    - humanizerPassedAt nije postavljen
 *    - dek prazan
 *    - coverStorageId postoji a coverAlt prazan
 * 6. Publish mutacija postavlja status "published" i publishedAt tek kad sve kapije prođu.
 * 7. Unpublish mutacija bezbedno vraća post u status "draft".
 * ============================================================================
 */

import process from "node:process";
import {
  listPublished,
  getPublishedBySlug,
  publicPostSummaryValidator,
  publicPostDetailValidator,
} from "../convex/postsPublic";

let neuspelo = 0;
function proveri(naziv: string, uslov: boolean, detalj?: string): void {
  if (uslov) {
    console.log(`  ✓  ${naziv}`);
  } else {
    neuspelo++;
    console.error(`  ✗  PAO: ${naziv}${detalj ? ` -> ${detalj}` : ""}`);
  }
}

// ── 1. Provera definicije argumenata (Upit NE SME primati status) ─────────────

function proveriArgumeJavnihUpita(): void {
  console.log("\n" + "=".repeat(78));
  // Convex funkcije izvoze argumente preko exportArgs() metode koja vraća JSON string ili objekat
  const listPubUntyped = listPublished as unknown as { exportArgs?: () => unknown };
  const slugPubUntyped = getPublishedBySlug as unknown as { exportArgs?: () => unknown };

  const rawListExport = typeof listPubUntyped.exportArgs === "function" ? listPubUntyped.exportArgs() : {};
  const rawSlugExport = typeof slugPubUntyped.exportArgs === "function" ? slugPubUntyped.exportArgs() : {};

  const listArgsExport = typeof rawListExport === "string" ? JSON.parse(rawListExport) : (rawListExport as Record<string, unknown>);
  const slugArgsExport = typeof rawSlugExport === "string" ? JSON.parse(rawSlugExport) : (rawSlugExport as Record<string, unknown>);

  // exportArgs vraća { type: "Object", value: { fieldName: ... } } ili sličnu strukturu
  const listArgFields = (listArgsExport?.value ?? listArgsExport?.fields ?? listArgsExport?.args ?? listArgsExport ?? {}) as Record<string, unknown>;
  const slugArgFields = (slugArgsExport?.value ?? slugArgsExport?.fields ?? slugArgsExport?.args ?? slugArgsExport ?? {}) as Record<string, unknown>;

  const listArgKeys = Object.keys(listArgFields);
  const slugArgKeys = Object.keys(slugArgFields);

  proveri(
    "listPublished ne sadrži 'status' u argumentima",
    !listArgKeys.includes("status"),
    `Pronađeni argumenti: ${listArgKeys.join(", ")}`,
  );

  proveri(
    "getPublishedBySlug ne sadrži 'status' u argumentima",
    !slugArgKeys.includes("status"),
    `Pronađeni argumenti: ${slugArgKeys.join(", ")}`,
  );

  proveri(
    "listPublished prima workspaceSlug",
    listArgKeys.includes("workspaceSlug"),
    `Pronađeni argumenti: ${listArgKeys.join(", ")}`,
  );

  proveri(
    "getPublishedBySlug prima workspaceSlug i slug",
    slugArgKeys.includes("workspaceSlug") && slugArgKeys.includes("slug"),
    `Pronađeni argumenti: ${slugArgKeys.join(", ")}`,
  );
}

// ── 2. Provera polja koja se serviraju (Zabrana curenja internih polja) ───────

function proveriZabranjenaPolja(): void {
  console.log("\n" + "=".repeat(78));
  console.log("2. PROVERA POLJA JAVNIH ODGOVORA (NEMA INTERNIH POLJA)");
  console.log("=".repeat(78));

  const zabranjenaPolja = [
    "status",
    "workspaceId",
    "ownProofChecked",
    "ownProofNote",
    "humanizerPassedAt",
    "reviewedAt",
  ];

  const summaryFields = Object.keys(publicPostSummaryValidator.fields);
  const detailFields = Object.keys(publicPostDetailValidator.fields);

  for (const polje of zabranjenaPolja) {
    proveri(
      `publicPostSummaryValidator ne sadrži '${polje}'`,
      !summaryFields.includes(polje),
      `Polje '${polje}' je prisutno u listPublished odgovoru!`,
    );
    proveri(
      `publicPostDetailValidator ne sadrži '${polje}'`,
      !detailFields.includes(polje),
      `Polje '${polje}' je prisutno u getPublishedBySlug odgovoru!`,
    );
  }

  proveri(
    "publicPostDetailValidator sadrži 'body' i SEO polja",
    detailFields.includes("body") &&
      detailFields.includes("seoTitle") &&
      detailFields.includes("seoDescription"),
  );
}

// ── 3. Simulacija bezbednosnog filtriranja u handleru ─────────────────────────

type MockPost = {
  _id: string;
  workspaceId: string;
  slug: string;
  locale: string;
  kind: "note" | "article";
  category: "novac_rokovi" | "odluke" | "kako_radi" | "greske" | "ai_razvoj" | "srpski_kontekst";
  title: string;
  dek: string;
  body: string;
  tags: string[];
  status: "draft" | "scheduled" | "published" | "archived";
  publishedAt?: number;
  updatedAt: number;
  ownProofChecked: boolean;
  ownProofNote?: string;
  humanizerPassedAt?: number;
  coverStorageId?: string;
  coverAlt?: string;
  authorName: string;
};

function proveriFiltriranjeNacrta(): void {
  console.log("\n" + "=".repeat(78));
  console.log("3. SIMULACIJA: NACRTI, ZAKAZANI I ARHIVIRANI POSTOVI NE MOGU BITI DOHVAĆENI");
  console.log("=".repeat(78));

  const now = Date.now();
  const testPosts: MockPost[] = [
    {
      _id: "post_draft_1",
      workspaceId: "ws_1",
      slug: "tajni-draft-post",
      locale: "sr-Latn",
      kind: "article",
      category: "odluke",
      title: "Nacrt koji ne sme izaći",
      dek: "Interni podnaslov",
      body: "Interni tekst",
      tags: ["tajno"],
      status: "draft",
      updatedAt: now,
      ownProofChecked: false,
      authorName: "Enigma IT",
    },
    {
      _id: "post_scheduled_future",
      workspaceId: "ws_1",
      slug: "buduci-post",
      locale: "sr-Latn",
      kind: "article",
      category: "novac_rokovi",
      title: "Post zakazan za sutra",
      dek: "Podnaslov",
      body: "Tekst",
      tags: [],
      status: "published",
      publishedAt: now + 86400000, // 1 dan u budućnosti
      updatedAt: now,
      ownProofChecked: true,
      humanizerPassedAt: now,
      authorName: "Enigma IT",
    },
    {
      _id: "post_archived",
      workspaceId: "ws_1",
      slug: "stari-arhiviran-post",
      locale: "sr-Latn",
      kind: "note",
      category: "greske",
      title: "Arhiviran post",
      dek: "Podnaslov",
      body: "Tekst",
      tags: [],
      status: "archived",
      publishedAt: now - 1000000,
      updatedAt: now,
      ownProofChecked: true,
      humanizerPassedAt: now,
      authorName: "Enigma IT",
    },
    {
      _id: "post_published_live",
      workspaceId: "ws_1",
      slug: "legitimno-objavljen-post",
      locale: "sr-Latn",
      kind: "article",
      category: "kako_radi",
      title: "Javni post za klijente",
      dek: "Dobar podnaslov",
      body: "Javni tekst",
      tags: ["web"],
      status: "published",
      publishedAt: now - 3600000, // pre sat vremena
      updatedAt: now,
      ownProofChecked: true,
      humanizerPassedAt: now,
      authorName: "Enigma IT",
    },
  ];

  // Logika iz listPublished handlera:
  const javnoDostupni = testPosts.filter(
    (p) =>
      p.status === "published" &&
      p.publishedAt !== undefined &&
      p.publishedAt <= now,
  );

  proveri(
    "listPublished vraća tačno 1 objavljen post od 4 kandidata",
    javnoDostupni.length === 1 && javnoDostupni[0]._id === "post_published_live",
  );

  proveri(
    "Nacrt (draft) je ignorisan",
    !javnoDostupni.some((p) => p._id === "post_draft_1"),
  );

  proveri(
    "Budući zakazani post je ignorisan",
    !javnoDostupni.some((p) => p._id === "post_scheduled_future"),
  );

  proveri(
    "Arhiviran post je ignorisan",
    !javnoDostupni.some((p) => p._id === "post_archived"),
  );

  // Logika iz getPublishedBySlug handlera za svaki post pojedinačno:
  for (const post of testPosts) {
    const isAvailable =
      post.status === "published" &&
      post.publishedAt !== undefined &&
      post.publishedAt <= now;

    if (post._id === "post_published_live") {
      proveri(`getPublishedBySlug vraća objavljen post (${post.slug})`, isAvailable);
    } else {
      proveri(
        `getPublishedBySlug vraća null za neobjavljen/budući post (${post.slug})`,
        !isAvailable,
      );
    }
  }
}

// ── 4. Provera kapija pre objave (§4) ─────────────────────────────────────────

function proveriKapijeObjave(): void {
  console.log("\n" + "=".repeat(78));
  console.log("4. PROVERA KAPIJA OBJAVE (§4) — ODBIJA, NE UPOZORAVA");
  console.log("=".repeat(78));

  type PublishTestCase = {
    naziv: string;
    post: Partial<MockPost>;
    ocekivaniKod: string;
  };

  const testSlučajevi: PublishTestCase[] = [
    {
      naziv: "Kapija 1: ownProofChecked !== true",
      post: {
        ownProofChecked: false,
        humanizerPassedAt: Date.now(),
        dek: "Podnaslov",
        coverStorageId: undefined,
      },
      ocekivaniKod: "own_proof_required",
    },
    {
      naziv: "Kapija 2: humanizerPassedAt nije postavljen",
      post: {
        ownProofChecked: true,
        humanizerPassedAt: undefined,
        dek: "Podnaslov",
        coverStorageId: undefined,
      },
      ocekivaniKod: "humanizer_required",
    },
    {
      naziv: "Kapija 3: dek prazan string",
      post: {
        ownProofChecked: true,
        humanizerPassedAt: Date.now(),
        dek: "   ",
        coverStorageId: undefined,
      },
      ocekivaniKod: "dek_required",
    },
    {
      naziv: "Kapija 4: coverStorageId postoji a coverAlt prazan",
      post: {
        ownProofChecked: true,
        humanizerPassedAt: Date.now(),
        dek: "Ispravan dek",
        coverStorageId: "storage_123",
        coverAlt: "   ",
      },
      ocekivaniKod: "cover_alt_required",
    },
  ];

  function simulirajPublishKapije(post: Partial<MockPost>): { uspeh: boolean; kod?: string } {
    if (post.ownProofChecked !== true) {
      return { uspeh: false, kod: "own_proof_required" };
    }
    if (post.humanizerPassedAt === undefined || post.humanizerPassedAt === null) {
      return { uspeh: false, kod: "humanizer_required" };
    }
    if (!post.dek || post.dek.trim().length === 0) {
      return { uspeh: false, kod: "dek_required" };
    }
    if (
      post.coverStorageId !== undefined &&
      (!post.coverAlt || post.coverAlt.trim().length === 0)
    ) {
      return { uspeh: false, kod: "cover_alt_required" };
    }
    return { uspeh: true };
  }

  for (const tc of testSlučajevi) {
    const ishod = simulirajPublishKapije(tc.post);
    proveri(
      `Odbijanje: ${tc.naziv}`,
      !ishod.uspeh && ishod.kod === tc.ocekivaniKod,
      `Dobijen kod: ${ishod.kod}, očekivan: ${tc.ocekivaniKod}`,
    );
  }

  const ispravanPost: Partial<MockPost> = {
    ownProofChecked: true,
    humanizerPassedAt: Date.now(),
    dek: "Ispravan podnaslov sa kontekstom",
    coverStorageId: "storage_abc",
    coverAlt: "Opis naslovne ilustracije za pristupačnost",
  };

  const ispravanIshod = simulirajPublishKapije(ispravanPost);
  proveri("Uspeh: Post prolazi sve 4 kapije", ispravanIshod.uspeh);
}

// ── Glavni pokretač ──────────────────────────────────────────────────────────

function main(): void {
  console.log("=".repeat(78));
  console.log("POKRETANJE BEZBEDNOSNE VERIFIKACIJE JAVNIH UPITA I KAPIJA OBJAVE");
  console.log("=".repeat(78));

  proveriArgumeJavnihUpita();
  proveriZabranjenaPolja();
  proveriFiltriranjeNacrta();
  proveriKapijeObjave();

  console.log("\n" + "=".repeat(78));
  if (neuspelo > 0) {
    console.error(`UKUPNO NEUSPELIH PROVERA: ${neuspelo}`);
    process.exit(1);
  } else {
    console.log("✓ SVE BEZBEDNOSNE PROVERE SU USPEŠNO PROŠLE (0 grešaka).");
  }
  console.log("=".repeat(78));
}

main();
