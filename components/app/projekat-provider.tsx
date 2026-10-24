"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Uloga } from "@/convex/lib/uloge";
import {
  ekranIzPutanje,
  prefiksProjekta,
  putanjaEkrana,
  type Rezim,
} from "@/lib/rutiranje";

/**
 * ============================================================================
 * PROJEKAT U LJUSCI (PROJEKTI-PLAN §7, plan C02 §6)
 * ============================================================================
 *
 * `ProjekatProvider` zna u kom je projektu ekran i daje hookove koji sami
 * ubacuju `workspaceId` u poziv Convex funkcije: pozivalac ne može ni da ga
 * izostavi ni da pošalje drugi (tipovi to ne dozvoljavaju, a u runtime-u se
 * `workspaceId` upisuje poslednji).
 *
 * Izvor projekta:
 *   - od C08: slug iz rute `[projekat]` (prop `slug`) i režim iz zaglavlja;
 *   - do C08 (privremeno, SAMO na frontu): prvi projekat korisnika, tj.
 *     `mojiProjekti[0]` — isti red koji backend danas vraća iz
 *     `requireMembership().first()`. Backend nikad ne bira projekat sam.
 *
 * Upiti čekaju potvrđenu sesiju (`useConvexAuth`), pa provider sme da stoji
 * iznad `AppShell`-ovog `<Authenticated>`.
 * ============================================================================
 */

export type ProjekatKontekst = {
  /** `mojProjekat` je stigao i pozivalac je član. */
  spreman: boolean;
  workspaceId: Id<"workspaces"> | null;
  slug: string | null;
  ime: string | null;
  kratkoIme: string | null;
  uloga: Uloga | null;
  rezim: Rezim;
  /** „“ (panel, i svuda do C08) ili „/<slug>“ (hub). */
  prefiks: string;
  brend: { boja: string | null; logoUrl: string | null; faviconUrl: string | null };
  /** `null` = svi moduli. */
  moduli: string[] | null;
  korisnik: { id: Id<"users">; email: string | null; ime: string | null } | null;
  platformaVlasnik: boolean;
};

const ProjekatContext = createContext<ProjekatKontekst | null>(null);

export function ProjekatProvider({
  slug,
  rezim = "hub",
  children,
}: {
  /** Od C08 uvek; do tada nema (privremeni izvor: prvi projekat korisnika). */
  slug?: string;
  rezim?: Rezim;
  children: ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const spisak = useQuery(
    api.projekti.mojiProjekti,
    isAuthenticated && slug === undefined ? {} : "skip",
  );
  const efektivniSlug = slug ?? spisak?.[0]?.slug;
  const projekat = useQuery(
    api.projekti.mojProjekat,
    isAuthenticated && efektivniSlug !== undefined ? { slug: efektivniSlug } : "skip",
  );
  // Pre rutiranja (C08) adrese nemaju prefiks projekta.
  const prefiks = slug === undefined ? "" : prefiksProjekta(slug, rezim);

  const vrednost = useMemo<ProjekatKontekst>(
    () => ({
      spreman: projekat !== undefined && projekat !== null,
      workspaceId: projekat?.workspaceId ?? null,
      slug: projekat?.slug ?? null,
      ime: projekat?.ime ?? null,
      kratkoIme: projekat?.kratkoIme ?? null,
      uloga: projekat?.uloga ?? null,
      rezim,
      prefiks,
      brend: {
        boja: projekat?.boja ?? null,
        logoUrl: projekat?.logoUrl ?? null,
        faviconUrl: projekat?.faviconUrl ?? null,
      },
      moduli: projekat?.moduli ?? null,
      korisnik: projekat?.korisnik ?? null,
      platformaVlasnik: projekat?.platformaVlasnik ?? false,
    }),
    [projekat, rezim, prefiks],
  );

  return (
    <ProjekatContext.Provider value={vrednost}>{children}</ProjekatContext.Provider>
  );
}

export function useProjekat(): ProjekatKontekst {
  const kontekst = useContext(ProjekatContext);
  if (kontekst === null) {
    throw new Error("useProjekat mora da se koristi unutar ProjekatProvider-a");
  }
  return kontekst;
}

// ── Hookovi koji sami ubacuju projekat ──────────────────────────────────────

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

type ArgsPoziva<F extends FunctionReference<"mutation" | "action">> =
  Record<string, never> extends BezProjekta<F>
    ? [args?: BezProjekta<F>]
    : [args: BezProjekta<F>];

/**
 * `useQuery` nad funkcijom projekta. Dok projekat nije učitan, upit čeka
 * (`undefined`, ekran crta učitavanje).
 */
export function useProjekatQuery<
  Q extends FunctionReference<"query", "public", SaProjektom>,
>(upit: Q, ...args: ArgsUpita<Q>): FunctionReturnType<Q> | undefined {
  const { workspaceId } = useProjekat();
  const zadati = args[0];
  const pun =
    zadati === "skip" || workspaceId === null
      ? "skip"
      : ({ ...(zadati ?? {}), workspaceId } as FunctionArgs<Q>);
  // `useQuery` tipizira argumente kao rest parametar; jedini `as` je ovde.
  return useQuery(upit as FunctionReference<"query">, pun);
}

const NIJE_UCITAN = "Projekat još nije učitan. Pokušaj ponovo za trenutak.";

/** `useMutation` nad funkcijom projekta. */
export function useProjekatMutation<
  M extends FunctionReference<"mutation", "public", SaProjektom>,
>(mutacija: M): (...args: ArgsPoziva<M>) => Promise<FunctionReturnType<M>> {
  const { workspaceId } = useProjekat();
  const pozovi = useMutation(mutacija as FunctionReference<"mutation">);
  return useCallback(
    (...args: ArgsPoziva<M>) =>
      workspaceId === null
        ? Promise.reject(new Error(NIJE_UCITAN))
        : (pozovi({ ...(args[0] ?? {}), workspaceId }) as Promise<
            FunctionReturnType<M>
          >),
    [pozovi, workspaceId],
  );
}

/** `useAction` nad funkcijom projekta. */
export function useProjekatAction<
  A extends FunctionReference<"action", "public", SaProjektom>,
>(akcija: A): (...args: ArgsPoziva<A>) => Promise<FunctionReturnType<A>> {
  const { workspaceId } = useProjekat();
  const pozovi = useAction(akcija as FunctionReference<"action">);
  return useCallback(
    (...args: ArgsPoziva<A>) =>
      workspaceId === null
        ? Promise.reject(new Error(NIJE_UCITAN))
        : (pozovi({ ...(args[0] ?? {}), workspaceId }) as Promise<
            FunctionReturnType<A>
          >),
    [pozovi, workspaceId],
  );
}

// ── Putanje u oba režima ────────────────────────────────────────────────────

/**
 * Putanja ekrana bez prefiksa projekta (`/enigma-it/leadovi` → `/leadovi`).
 * Za navigaciju, naslove i boju modula. Za `router.replace` na ISTU stranu
 * koristi pun `usePathname()`.
 */
export function useEkranPutanja(): string {
  const pathname = usePathname();
  const { prefiks } = useProjekat();
  return ekranIzPutanje(pathname, prefiks);
}

/** Pravi adresu linka za ekran u tekućem projektu (`/leadovi` → `/enigma-it/leadovi`). */
export function useProjekatHref(): (ekran: string) => string {
  const { prefiks } = useProjekat();
  return useCallback((ekran: string) => putanjaEkrana(ekran, prefiks), [prefiks]);
}
