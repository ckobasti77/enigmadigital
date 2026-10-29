"use client";

/**
 * ============================================================================
 * PODACI PROJEKTA ZA RADNI DEO (plan S07 §3.1)
 * ============================================================================
 *
 * Projektne varijante Devotion kuka. Kao `useProjekatQuery` iz
 * `projekat-provider.tsx`, same ubacuju `workspaceId` tekućeg projekta:
 * pozivalac ne može ni da ga izostavi ni da pošalje drugi (tipovi to ne
 * dozvoljavaju, a u runtime-u se `workspaceId` upisuje poslednji). Dok projekat
 * nije učitan, upit čeka.
 *
 * | Devotion                          | ovde                                   |
 * |-----------------------------------|----------------------------------------|
 * | `useQueryTolerant`                | `useProjekatQueryTolerant`             |
 * | `useQueryResult`                  | `useProjekatQueryResult`               |
 * | `useQueryState`                   | `useProjekatQueryState`                |
 * | `usePaginatedQuery`               | `useProjekatPaginatedQuery`            |
 * | `useQueries({ k: {query, args} })`| `useProjekatQueries`                   |
 * | `useConvex().query(api…)`         | `useProjekatKlijent().query`           |
 * | `useMutation(…).withOptimisticUpdate` | `useProjekatMutationOptimisticno`  |
 *
 * Opšte implementacije primaju referencu kao promenljivu, pa ih čuvar fronta
 * ne vidi kao direktan poziv — kao i `useProjekatQuery`.
 */
import { useCallback, useMemo } from "react";
import {
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQueries,
  type PaginatedQueryReference,
  type UsePaginatedQueryReturnType,
} from "convex/react";
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server";
import type { OptimisticUpdate } from "convex/browser";
import type { Value } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel";
import { useProjekat } from "@/components/app/projekat-provider";
import { uRezultat, uStanje, useUpitSaGreskom, type QueryState } from "./ja";

type SaProjektom = { workspaceId: Id<"workspaces"> };

/** Argumenti funkcije bez `workspaceId` (njega daje provider). */
type BezProjekta<F extends FunctionReference<"query" | "mutation" | "action">> = Omit<
  FunctionArgs<F>,
  "workspaceId"
>;

/** Prazni argumenti smeju da se izostave, kao kod `useQuery`. */
type ArgsUpita<Q extends FunctionReference<"query">> =
  Record<string, never> extends BezProjekta<Q>
    ? [args?: BezProjekta<Q> | "skip"]
    : [args: BezProjekta<Q> | "skip"];

type ArgsPoziva<F extends FunctionReference<"mutation">> =
  Record<string, never> extends BezProjekta<F>
    ? [args?: BezProjekta<F>]
    : [args: BezProjekta<F>];

type UpitProjekta = FunctionReference<"query", "public", SaProjektom>;

type PaginiraniUpitProjekta = FunctionReference<
  "query",
  "public",
  SaProjektom & { paginationOpts: PaginationOptions },
  PaginationResult<unknown>
>;

const NIJE_UCITAN = "Projekat još nije učitan. Pokušaj ponovo za trenutak.";

/** Argumenti sa `workspaceId` tekućeg projekta, ili `"skip"` dok ga nema. */
function useSaProjektom<Q extends FunctionReference<"query">>(
  zadati: object | "skip" | undefined,
): FunctionArgs<Q> | "skip" {
  const { workspaceId } = useProjekat();
  return zadati === "skip" || workspaceId === null
    ? "skip"
    : ({ ...(zadati ?? {}), workspaceId } as FunctionArgs<Q>);
}

/** Greška upita postaje `undefined` (prateći upit ne ruši ekran). */
export function useProjekatQueryTolerant<Q extends UpitProjekta>(
  upit: Q,
  ...args: ArgsUpita<Q>
): FunctionReturnType<Q> | undefined {
  const rezultat = useUpitSaGreskom(upit, useSaProjektom<Q>(args[0]));
  return rezultat instanceof Error ? undefined : rezultat;
}

/** `{ data, failed }`: blok sam piše da nije učitano. */
export function useProjekatQueryResult<Q extends UpitProjekta>(
  upit: Q,
  ...args: ArgsUpita<Q>
): { data: FunctionReturnType<Q> | undefined; failed: boolean } {
  return uRezultat(useUpitSaGreskom(upit, useSaProjektom<Q>(args[0])));
}

/** Učitavanje, greška i podaci odvojeno. */
export function useProjekatQueryState<Q extends UpitProjekta>(
  upit: Q,
  ...args: ArgsUpita<Q>
): QueryState<FunctionReturnType<Q>> {
  return uStanje(useUpitSaGreskom(upit, useSaProjektom<Q>(args[0])));
}

/**
 * `usePaginatedQuery` nad funkcijom projekta. Argumenti su bez
 * `paginationOpts` (daje ih Convex) i bez `workspaceId` (daje ga provider).
 */
export function useProjekatPaginatedQuery<Q extends PaginiraniUpitProjekta>(
  upit: Q,
  args: Omit<FunctionArgs<Q>, "paginationOpts" | "workspaceId"> | "skip",
  opcije: { initialNumItems: number },
): UsePaginatedQueryReturnType<Q & PaginatedQueryReference> {
  const { workspaceId } = useProjekat();
  const pun =
    args === "skip" || workspaceId === null ? "skip" : { ...args, workspaceId };
  return usePaginatedQuery(
    upit as unknown as PaginatedQueryReference,
    pun as never,
    opcije,
  ) as UsePaginatedQueryReturnType<Q & PaginatedQueryReference>;
}

/** Zahtev za `useProjekatQueries`: argumenti su bez `workspaceId`. */
export type ZahtevProjekta = {
  query: UpitProjekta;
  args: Record<string, unknown>;
};

/**
 * Više upita odjednom (npr. deca svake otvorene stranice u stablu). Svaki
 * dobija `workspaceId`; rezultat po ključu je vrednost, `Error` ili
 * `undefined`, kao Convex `useQueries`. Dok projekat nije učitan, sve je
 * `undefined`.
 */
export function useProjekatQueries(
  zahtevi: Record<string, ZahtevProjekta>,
): Record<string, unknown | Error | undefined> {
  const { workspaceId } = useProjekat();
  const kljuc = JSON.stringify(
    Object.entries(zahtevi).map(([k, z]) => [k, getFunctionName(z.query), z.args]),
  );
  const puni = useMemo(() => {
    if (workspaceId === null) return {};
    const izlaz: Record<string, { query: FunctionReference<"query">; args: Record<string, Value> }> =
      {};
    for (const [k, z] of Object.entries(zahtevi)) {
      izlaz[k] = { query: z.query, args: { ...(z.args as Record<string, Value>), workspaceId } };
    }
    return izlaz;
    // `kljuc` vrednosno pokriva `zahtevi` (nov objekat na svaki render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kljuc, workspaceId]);
  return useQueries(puni);
}

/**
 * Imperativni upit projekta (`useConvex().query(…)` u Devotionu): razrešenje
 * rute stranice, povezana grupa beleški. Projekat se ubacuje u trenutku poziva.
 */
export function useProjekatKlijent(): {
  query: <Q extends UpitProjekta>(
    upit: Q,
    ...args: Record<string, never> extends BezProjekta<Q>
      ? [args?: BezProjekta<Q>]
      : [args: BezProjekta<Q>]
  ) => Promise<FunctionReturnType<Q>>;
} {
  const convex = useConvex();
  const { workspaceId } = useProjekat();
  return useMemo(
    () => ({
      query: (upit, ...args) =>
        workspaceId === null
          ? Promise.reject(new Error(NIJE_UCITAN))
          : convex.query(upit as FunctionReference<"query">, {
              ...(args[0] ?? {}),
              workspaceId,
            }),
    }),
    [convex, workspaceId],
  );
}

/**
 * `useMutation(…).withOptimisticUpdate(…)` nad funkcijom projekta. Optimistična
 * izmena dobija PUNE argumente, sa `workspaceId`, pa ključ keša P upita
 * (`localStore.getQuery(api.prostor.tasks.commandCenter, { workspaceId, … })`)
 * ide sa njim. Izmena treba da bude stabilna funkcija (van komponente ili
 * `useCallback`), inače se vraćena funkcija menja na svaki render.
 */
export function useProjekatMutationOptimisticno<
  M extends FunctionReference<"mutation", "public", SaProjektom>,
>(
  mutacija: M,
  izmena: OptimisticUpdate<FunctionArgs<M>>,
): (...args: ArgsPoziva<M>) => Promise<FunctionReturnType<M>> {
  const { workspaceId } = useProjekat();
  const osnovna = useMutation(mutacija as FunctionReference<"mutation">);
  const pozovi = useMemo(
    () => osnovna.withOptimisticUpdate(izmena as OptimisticUpdate<Record<string, Value>>),
    [osnovna, izmena],
  );
  return useCallback(
    (...args: ArgsPoziva<M>) =>
      workspaceId === null
        ? Promise.reject(new Error(NIJE_UCITAN))
        : (pozovi({ ...(args[0] ?? {}), workspaceId }) as Promise<FunctionReturnType<M>>),
    [pozovi, workspaceId],
  );
}
