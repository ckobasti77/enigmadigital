"use client";

/**
 * ============================================================================
 * PODACI NIVOA „JA“ (plan S07 §3.1, D15)
 * ============================================================================
 *
 * Devotion kuke koje NE bacaju grešku upita, za lične (L) funkcije bez
 * projekta: Danas, Moji zadaci, Inbox, Poruke, Beleške. Imena i ponašanje su
 * Devotionovi (`workspace-error-boundary.tsx`, `use-query-state.ts`), pa
 * preneti ekrani menjaju samo uvoz:
 *
 * - `useQueryTolerant` — greška pratećeg upita postaje `undefined`;
 * - `useQueryResult` — `{ data, failed }`, blok može da napiše „… nije učitano“;
 * - `useQueryState` — učitavanje, greška i podaci odvojeno.
 *
 * Idu preko Convex `useQueries`, koje grešku vraća kao vrednost umesto da je
 * baci, pa nema try/catch oko kuke.
 *
 * Čuvar fronta (`lib/front-cuvar.ts`) ove tri kuke vidi kao direktan poziv
 * (D15): funkcija mora biti na spisku `DOZVOLJENI_DIREKTNI`
 * (`scripts/verify-pristup.ts`). Funkcija projekta ide kroz
 * `useProjekatQueryTolerant/Result/State` iz `./projekat`.
 */
import { useMemo } from "react";
import { useQueries, type RequestForQueries } from "convex/react";
import type { Value } from "convex/values";
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";

export type QueryState<T> =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ready"; data: T };

/**
 * Jedan upit kroz `useQueries`: vrednost, `Error` ili `undefined` (učitava se
 * ili je preskočen). Ključ pretplate je IME funkcije i JSON argumenata:
 * `api.x.y` je Proxy koji na svaki pristup daje novu referencu, a nov objekat
 * na svaki render pravio bi novu pretplatu i beskonačnu petlju.
 *
 * Interno: koriste ga i projektne kuke (`./projekat`), posle ubacivanja
 * `workspaceId`.
 */
export function useUpitSaGreskom<Q extends FunctionReference<"query">>(
  upit: Q,
  args: FunctionArgs<Q> | "skip",
): FunctionReturnType<Q> | Error | undefined {
  const kljucArgs = args === "skip" ? "skip" : JSON.stringify(args);
  const kljucUpita = getFunctionName(upit);
  const zahtevi = useMemo(
    (): RequestForQueries =>
      args === "skip" ? {} : { vrednost: { query: upit, args: args as Record<string, Value> } },
    // `kljucUpita`/`kljucArgs` vrednosno pokrivaju `upit`/`args`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kljucUpita, kljucArgs],
  );
  return useQueries(zahtevi).vrednost as FunctionReturnType<Q> | Error | undefined;
}

/** Kao `useQuery`, ali greška upita postaje `undefined` (ne ruši render). */
export function useQueryTolerant<Q extends FunctionReference<"query">>(
  upit: Q,
  args: FunctionArgs<Q> | "skip",
): FunctionReturnType<Q> | undefined {
  const rezultat = useUpitSaGreskom(upit, args);
  return rezultat instanceof Error ? undefined : rezultat;
}

/** Greška ostaje vidljiva pozivaocu (blok piše „… nije učitano.“). */
export function useQueryResult<Q extends FunctionReference<"query">>(
  upit: Q,
  args: FunctionArgs<Q> | "skip",
): { data: FunctionReturnType<Q> | undefined; failed: boolean } {
  return uRezultat(useUpitSaGreskom(upit, args));
}

/** Učitavanje, greška i podaci odvojeno (`"skip"` ostaje „učitavanje“). */
export function useQueryState<Q extends FunctionReference<"query">>(
  upit: Q,
  args: FunctionArgs<Q> | "skip",
): QueryState<FunctionReturnType<Q>> {
  return uStanje(useUpitSaGreskom(upit, args));
}

export function uRezultat<T>(
  rezultat: T | Error | undefined,
): { data: T | undefined; failed: boolean } {
  return rezultat instanceof Error
    ? { data: undefined, failed: true }
    : { data: rezultat, failed: false };
}

export function uStanje<T>(rezultat: T | Error | undefined): QueryState<T> {
  if (rezultat === undefined) return { status: "loading" };
  if (rezultat instanceof Error) return { status: "error", error: rezultat };
  return { status: "ready", data: rezultat };
}
