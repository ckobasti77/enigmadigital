/// <reference types="vite/client" />
/**
 * Novosti: nacrti iz baze (ULTRA1 T06, plan T03 §7). `postsStore.listaNacrta`
 * daje nacrte, zakazane i arhivirane postove projekta pozivaoca, bez
 * objavljenih (njih daje javni spisak), i samo uredniku i vlasniku.
 * `postsStore.zaUredjivanje` daje ceo post (i objavljen) samo u svom projektu.
 */
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

async function post(
  s: Svet,
  ws: Id<"workspaces">,
  slug: string,
  status: "draft" | "scheduled" | "published" | "archived",
  updatedAt: number,
): Promise<Id<"posts">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("posts", {
      workspaceId: ws,
      slug,
      locale: "sr-Latn",
      kind: "article",
      category: "kako_radi",
      title: `Naslov ${slug}`,
      dek: "",
      body: `Telo ${slug}`,
      authorName: "Enigma IT",
      tags: [],
      status,
      updatedAt,
      ownProofChecked: false,
      ...(status === "published"
        ? { publishedAt: updatedAt, publishedBy: s.ana, firstPublishedAt: updatedAt }
        : {}),
    }),
  );
}

describe("postsStore.listaNacrta", () => {
  test("samo neobjavljeni postovi tog projekta, najnovija izmena prva", async () => {
    const s = await napraviSvet();
    await post(s, s.wsA, "nacrt-stari", "draft", 1_000);
    await post(s, s.wsA, "zakazan", "scheduled", 3_000);
    await post(s, s.wsA, "nacrt-novi", "draft", 4_000);
    await post(s, s.wsA, "arhiva", "archived", 2_000);
    await post(s, s.wsA, "objavljen", "published", 5_000);
    await post(s, s.wsB, "tudji-nacrt", "draft", 6_000);

    const lista = await kao(s, s.ana).query(api.postsStore.listaNacrta, {
      workspaceId: s.wsA,
    });
    expect(lista.map((p) => p.slug)).toEqual(["nacrt-novi", "zakazan", "arhiva", "nacrt-stari"]);
    expect(lista.every((p) => p.workspaceId === s.wsA)).toBe(true);
    // Urednik dobija telo, pa nacrt otvara isto na svakom uređaju.
    expect(lista[0].body).toBe("Telo nacrt-novi");
  });

  test("urednik čita, posmatrač i neprijavljen dobijaju odbijanje", async () => {
    const s = await napraviSvet();
    await post(s, s.wsA, "nacrt", "draft", 1_000);

    const zaUrednicu = await kao(s, s.urednica).query(api.postsStore.listaNacrta, {
      workspaceId: s.wsA,
    });
    expect(zaUrednicu.map((p) => p.slug)).toEqual(["nacrt"]);

    await odbijeno(
      kao(s, s.viewer).query(api.postsStore.listaNacrta, { workspaceId: s.wsA }),
      "forbidden",
    );
    await odbijeno(s.t.query(api.postsStore.listaNacrta, { workspaceId: s.wsA }), "unauthorized");
  });

  test("tuđ projekat se ne čita", async () => {
    const s = await napraviSvet();
    await post(s, s.wsB, "tudji", "draft", 1_000);
    await odbijeno(
      kao(s, s.ana).query(api.postsStore.listaNacrta, { workspaceId: s.wsB }),
      "forbidden",
    );
  });

  test("interna polja o prvoj objavi ne izlaze", async () => {
    const s = await napraviSvet();
    const id = await post(s, s.wsA, "bio-objavljen", "draft", 1_000);
    await s.t.run(async (ctx) => {
      await ctx.db.patch(id, { publishedBy: s.ana, firstPublishedAt: 500 });
    });
    const [p] = await kao(s, s.ana).query(api.postsStore.listaNacrta, { workspaceId: s.wsA });
    expect(p).not.toHaveProperty("publishedBy");
    expect(p).not.toHaveProperty("firstPublishedAt");
  });
});

describe("postsStore.zaUredjivanje", () => {
  test("objavljen post dolazi sa telom, samo u svom projektu", async () => {
    const s = await napraviSvet();
    const nas = await post(s, s.wsA, "objavljen", "published", 1_000);
    const tudj = await post(s, s.wsB, "tudji", "published", 1_000);

    const ceo = await kao(s, s.urednica).query(api.postsStore.zaUredjivanje, {
      workspaceId: s.wsA,
      postId: nas,
    });
    expect(ceo?.body).toBe("Telo objavljen");
    expect(ceo).not.toHaveProperty("publishedBy");

    // Post iz drugog projekta kroz svoj projekat: kao da ne postoji.
    expect(
      await kao(s, s.jovan).query(api.postsStore.zaUredjivanje, { workspaceId: s.wsA, postId: tudj }),
    ).toBeNull();

    await odbijeno(
      kao(s, s.viewer).query(api.postsStore.zaUredjivanje, { workspaceId: s.wsA, postId: nas }),
      "forbidden",
    );
  });
});
