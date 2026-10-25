"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { imaUlogu, type Uloga } from "@/convex/lib/uloge";
import {
  KOLACIC_PROJEKAT,
  ekranIzPutanje,
  modulUkljucen,
  prefiksProjekta,
  putanjaEkrana,
  type Rezim,
} from "@/lib/rutiranje";
import { ProjekatNedostupan } from "./projekat-nedostupan";

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
 * Izvor projekta je slug iz rute `[projekat]` (prop `slug`), a režim
 * (`hub`/`panel`) daje server layout iz zaglavlja `x-panel-rezim` koje
 * postavlja `proxy.ts`. Backend nikad ne bira projekat sam.
 *
 * Slug koji ne postoji ili za koji pozivalac nije član daje isti odgovor
 * (`mojProjekat` → `null`): umesto ekrana stoji „Projekat nije dostupan“.
 * U hubu provider, tek posle potvrde članstva, pamti projekat u kolačiću
 * `ep_projekat` (stare adrese poput `/leadovi` vode na njega).
 *
 * Upiti čekaju potvrđenu sesiju (`useConvexAuth`).
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
  /** „“ (panel) ili „/<slug>“ (hub). */
  prefiks: string;
  brend: { boja: string | null; logoUrl: string | null; faviconUrl: string | null };
  /** `null` = svi moduli. */
  moduli: string[] | null;
  /** „interni“ ili „klijent“; `null` dok projekat nije učitan. */
  vrsta: "interni" | "klijent" | null;
  /** Praćeni domeni sajta (podešavanja projekta). */
  sajtovi: string[];
  korisnik: { id: Id<"users">; email: string | null; ime: string | null } | null;
  platformaVlasnik: boolean;
};

const ProjekatContext = createContext<ProjekatKontekst | null>(null);

/** Stalna prazna lista, da kontekst ne menja identitet dok projekat stiže. */
const BEZ_SAJTOVA: string[] = [];

export function ProjekatProvider({
  slug,
  rezim,
  children,
}: {
  /** Slug iz rute `[projekat]`. */
  slug: string;
  rezim: Rezim;
  children: ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const projekat = useQuery(
    api.projekti.mojProjekat,
    isAuthenticated ? { slug } : "skip",
  );
  const prefiks = prefiksProjekta(slug, rezim);
  const potvrdjen = projekat?.slug ?? null;

  // Poslednji projekat u hubu (stare adrese, plan C02 §7.6). Tek posle potvrde
  // članstva, pa u kolačić ne ulazi slug na koji korisnik nema pravo. Panel
  // ga ne koristi: domen je već zaključan na jedan projekat.
  useEffect(() => {
    if (rezim !== "hub" || potvrdjen === null) return;
    const bezbedno = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${KOLACIC_PROJEKAT}=${potvrdjen}; Path=/; Max-Age=31536000; SameSite=Lax${bezbedno}`;
  }, [rezim, potvrdjen]);

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
      vrsta: projekat?.vrsta ?? null,
      sajtovi: projekat?.sajtovi ?? BEZ_SAJTOVA,
      korisnik: projekat?.korisnik ?? null,
      platformaVlasnik: projekat?.platformaVlasnik ?? false,
    }),
    [projekat, rezim, prefiks],
  );

  return (
    <ProjekatContext.Provider value={vrednost}>
      {projekat === null ? <ProjekatNedostupan rezim={rezim} /> : children}
    </ProjekatContext.Provider>
  );
}

export function useProjekat(): ProjekatKontekst {
  const kontekst = useContext(ProjekatContext);
  if (kontekst === null) {
    throw new Error("useProjekat mora da se koristi unutar ProjekatProvider-a");
  }
  return kontekst;
}

/**
 * Da li uloga u tekućem projektu sme ono što traži `minimalna` (P9):
 * `urednik` radi posao (leadovi, objave, poruke), `owner` još i veze,
 * brisanje, članove i podešavanja, a `client_viewer` samo gleda. Backend te
 * izmene već odbija; UI samo ne nudi dugme koje bi puklo. Dok projekat nije
 * učitan odgovor je `false`, pa se dugme za izmenu ne pojavi pa nestane.
 */
export function useMoze(minimalna: Uloga): boolean {
  const { uloga } = useProjekat();
  return uloga !== null && imaUlogu(uloga, minimalna);
}

/**
 * Projekat kad ga ima, `null` van projekta (hub „Svi projekti“). Samo za
 * delove koji stoje na oba mesta, kao meni korisnika.
 */
export function useProjekatOpciono(): ProjekatKontekst | null {
  return useContext(ProjekatContext);
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

/**
 * `useQuery` nad funkcijom projekta za ZADATI projekat, van `ProjekatProvider`-a.
 * Samo za hub „Svi projekti“ (`components/app/hub/**`, čuva ga
 * `lib/linkovi-cuvar.test.ts`): red po projektu zove isti upit za svaki
 * projekat iz `mojiProjekti`, a članstvo i dalje proverava omotač na serveru.
 */
export function useQueryZaProjekat<
  Q extends FunctionReference<"query", "public", SaProjektom>,
>(
  workspaceId: Id<"workspaces"> | null,
  upit: Q,
  ...args: ArgsUpita<Q>
): FunctionReturnType<Q> | undefined {
  const zadati = args[0];
  const pun =
    zadati === "skip" || workspaceId === null
      ? "skip"
      : ({ ...(zadati ?? {}), workspaceId } as FunctionArgs<Q>);
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

/**
 * Da li je modul uključen u tekućem projektu (`moduli` bez vrednosti = svi;
 * kontrolna tabla i podešavanja uvek). Van projekta je sve uključeno.
 */
export function useModulUkljucen(): (modul: string) => boolean {
  const moduli = useContext(ProjekatContext)?.moduli ?? null;
  return useCallback((modul: string) => modulUkljucen(moduli, modul), [moduli]);
}

/** Pravi adresu linka za ekran u tekućem projektu (`/leadovi` → `/enigma-it/leadovi`). */
export function useProjekatHref(): (ekran: string) => string {
  const { prefiks } = useProjekat();
  return useCallback((ekran: string) => putanjaEkrana(ekran, prefiks), [prefiks]);
}
