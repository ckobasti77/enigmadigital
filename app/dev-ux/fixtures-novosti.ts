import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DAY, WS, now, type Fixture, type R } from "./fixtures-util";

/**
 * Novosti u razvojnom prikazu: nacrti iz baze (ULTRA1 T06).
 *
 * Ranije su nacrti živeli u `localStorage` i snimak ih je tamo upisivao. Sada
 * ih daje `postsStore.listaNacrta`, pa se vide bez ikakve pripreme
 * pregledača: jedan nacrt prolazi sve provere, jednom fale dokaz i prirodan
 * ton, zakazanom fali opis slike, a jedan post je u arhivi.
 */

type Nacrt = R<typeof api.postsStore.listaNacrta>[number];

function nacrt(
  n: number,
  polja: Partial<Nacrt> & Pick<Nacrt, "status" | "title" | "kind" | "category">,
  danaUnazad: number,
): Nacrt {
  return {
    _id: `post_ux_nacrt_00${n}` as Id<"posts">,
    _creationTime: now - (danaUnazad + 2) * DAY,
    workspaceId: WS,
    slug: `test-nacrt-${n}`,
    locale: "sr-Latn",
    dek: "",
    body: "Probni tekst nacrta.",
    authorName: "Test Operater",
    tags: ["test"],
    updatedAt: now - danaUnazad * DAY,
    ownProofChecked: false,
    ...polja,
  };
}

const NACRTI: Nacrt[] = [
  nacrt(
    1,
    {
      status: "draft",
      title: "Test nacrt 1: beleška u pripremi",
      kind: "note",
      category: "greske",
      dek: "Probni podnaslov.",
    },
    1,
  ),
  nacrt(
    2,
    {
      status: "draft",
      title: "Test nacrt 2: članak spreman za objavu",
      kind: "article",
      category: "novac_rokovi",
      dek: "Probni podnaslov.",
      ownProofChecked: true,
      ownProofNote: "Probni snimak ekrana sa projekta.",
      humanizerPassedAt: now - 2 * DAY,
    },
    3,
  ),
  nacrt(
    3,
    {
      status: "scheduled",
      title: "Test zakazan članak",
      kind: "article",
      category: "kako_radi",
      dek: "Probni podnaslov.",
      ownProofChecked: true,
      humanizerPassedAt: now - 5 * DAY,
      coverStorageId: "storage_ux_test_naslovna" as Id<"_storage">,
    },
    5,
  ),
  nacrt(
    4,
    {
      status: "archived",
      title: "Test arhiviran post",
      kind: "article",
      category: "srpski_kontekst",
    },
    60,
  ),
];

export const FIXTURES_NOVOSTI: Record<string, Fixture> = {
  [getFunctionName(api.postsStore.listaNacrta)]: () => NACRTI,
  // Objavljeni postovi iz javnog spiska (`fixtures.ts`) dobijaju telo ovde,
  // kao što ga urednik dobija iz baze.
  [getFunctionName(api.postsStore.zaUredjivanje)]: (args) =>
    NACRTI.find((p) => p._id === args.postId) ??
    (String(args.postId).startsWith("post_ux_test_")
      ? nacrt(
          9,
          {
            _id: args.postId as Id<"posts">,
            status: "published",
            title: "Test objavljen članak",
            kind: "article",
            category: "kako_radi",
            dek: "Probni podnaslov.",
            publishedAt: now - 3 * DAY,
            ownProofChecked: true,
            humanizerPassedAt: now - 4 * DAY,
          },
          3,
        )
      : null),
};
