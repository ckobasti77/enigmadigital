/**
 * TEST TIPOVA za kuke podataka radnog dela (`./projekat`, `./ja`). Ne izvršava
 * se i ništa ga ne uvozi: proverava ga `npm run typecheck`. Svaki
 * `@ts-expect-error` mora da naiđe na grešku; ako kuka počne da prima pogrešan
 * poziv, tsc javlja „Unused '@ts-expect-error' directive“ i provera pada.
 */
import { makeFunctionReference, type PaginationOptions, type PaginationResult } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import {
  useProjekatKlijent,
  useProjekatMutationOptimisticno,
  useProjekatPaginatedQuery,
  useProjekatQueryResult,
  useProjekatQueryState,
  useProjekatQueryTolerant,
} from "./projekat";
import { useQueryState, useQueryTolerant } from "./ja";

type W = Id<"workspaces">;

const upit = makeFunctionReference<"query", { workspaceId: W; od: string }, number>(
  "proba:upit",
);
const upitSamoProjekat = makeFunctionReference<"query", { workspaceId: W }, number>(
  "proba:upitSamoProjekat",
);
const upitBezProjekta = makeFunctionReference<"query", { od: string }, number>(
  "proba:upitBezProjekta",
);
const strane = makeFunctionReference<
  "query",
  { workspaceId: W; paginationOpts: PaginationOptions; vrsta: string },
  PaginationResult<{ ime: string }>
>("proba:strane");
const izmena = makeFunctionReference<"mutation", { workspaceId: W; ime: string }, null>(
  "proba:izmena",
);

export function useTipoviPodataka(drugi: W): void {
  const a: number | undefined = useProjekatQueryTolerant(upit, { od: "2026-10-01" });
  const b: { data: number | undefined; failed: boolean } = useProjekatQueryResult(upit, "skip");
  const c = useProjekatQueryState(upitSamoProjekat);
  if (c.status === "ready") {
    const broj: number = c.data;
    void broj;
  }
  void a;
  void b;

  // @ts-expect-error workspaceId se nikad ne šalje ručno
  useProjekatQueryTolerant(upit, { od: "x", workspaceId: drugi });
  // @ts-expect-error funkcija bez projekta ne ide kroz kuku projekta
  useProjekatQueryState(upitBezProjekta, { od: "x" });
  // @ts-expect-error obavezan argument ne sme da se izostavi
  useProjekatQueryResult(upit);

  const lista = useProjekatPaginatedQuery(strane, { vrsta: "a" }, { initialNumItems: 20 });
  const ime: string | undefined = lista.results[0]?.ime;
  void ime;
  useProjekatPaginatedQuery(strane, "skip", { initialNumItems: 20 });
  // @ts-expect-error ni stranica ni projekat se ne šalju ručno
  useProjekatPaginatedQuery(strane, { vrsta: "a", workspaceId: drugi }, { initialNumItems: 20 });

  const klijent = useProjekatKlijent();
  const obecanje: Promise<number> = klijent.query(upit, { od: "x" });
  void obecanje;
  // @ts-expect-error ni imperativni upit ne prima workspaceId
  void klijent.query(upit, { od: "x", workspaceId: drugi });

  const sacuvaj = useProjekatMutationOptimisticno(izmena, (store, args) => {
    const projekat: W = args.workspaceId;
    void store;
    void projekat;
  });
  void sacuvaj({ ime: "a" });
  // @ts-expect-error workspaceId se nikad ne šalje ručno
  void sacuvaj({ ime: "a", workspaceId: drugi });

  const d: number | undefined = useQueryTolerant(upitBezProjekta, { od: "x" });
  void d;
  useQueryState(upitBezProjekta, "skip");
}
