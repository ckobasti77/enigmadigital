"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { ConvexProviderWithAuth } from "convex/react";
import { createFakeConvexClient } from "./fake-convex";
import { resolveFixture } from "./fixtures";
import { projektiUx } from "./fixtures-hub";

/**
 * Omotač koji pravim ekranima podmeće lažni Convex klijent i „ulogovanu"
 * sesiju. Ugnježden je ISPOD pravog `ConvexClientProvider`-a iz korenskog
 * layouta: najbliži provider pobeđuje, pa svaki `useQuery` ispod ovoga čita
 * sintetičke podatke, a `<Authenticated>` u ljusci vidi da je sesija tu.
 */
function useFakeAuth() {
  const fetchAccessToken = useCallback(async () => "ux-harness", []);
  return useMemo(
    () => ({ isLoading: false, isAuthenticated: true, fetchAccessToken }),
    [fetchAccessToken],
  );
}

/** Ista sesija, samo odjavljena — za ekrane koji se otvaraju pre prijave. */
function useFakeAuthOdjavljen() {
  const fetchAccessToken = useCallback(async () => null, []);
  return useMemo(
    () => ({ isLoading: false, isAuthenticated: false, fetchAccessToken }),
    [fetchAccessToken],
  );
}

/**
 * `prazno` (`?ux=1&prazno=1`) vraća prazan nalog: bez veza ka kanalima i bez
 * redova, za snimanje praznih stanja kanala. `odjavljen` crta ekran bez
 * sesije (pozivnica pre prijave). `uloga` (`?ux=1&uloga=client_viewer`)
 * menja ulogu u tekućem projektu, da se vidi šta urednik i posmatrač ne vide.
 * `projekata` (`?ux=1&rezim=hub&projekata=1|22`) menja broj projekata
 * korisnika, za hub „Svi projekti“ sa jednim i sa više od 20 projekata.
 */
export function UxHarness({
  children,
  prazno = false,
  pad,
  odjavljen = false,
  uloga,
  projekata,
}: {
  children: ReactNode;
  projekata?: number;
  prazno?: boolean;
  odjavljen?: boolean;
  uloga?: string;
  /**
   * Modul čiji upiti namerno PADAJU (`?ux=1&pad=napredak`). Služi da se vidi
   * šta ekran radi kad upit baci grešku — pravi Convex klijent tada baca iz
   * `useQuery`, i ovaj radi isto.
   */
  pad?: string;
}) {
  const client = useMemo(
    () =>
      createFakeConvexClient((name, args) => {
        if (pad && name.startsWith(`${pad}:`)) {
          throw new Error(`Razvojni prikaz: namerni pad upita ${name}`);
        }
        if (projekata !== undefined && name === "projekti:mojiProjekti") {
          return projektiUx(projekata);
        }
        const rez = resolveFixture(name, args, prazno);
        if (
          name === "projekti:mojProjekat" &&
          rez !== null &&
          typeof rez === "object" &&
          (uloga === "urednik" || uloga === "client_viewer" || uloga === "owner")
        ) {
          return { ...rez, uloga };
        }
        return rez;
      }),
    [prazno, pad, uloga, projekata],
  );
  return (
    <ConvexProviderWithAuth
      client={client}
      useAuth={odjavljen ? useFakeAuthOdjavljen : useFakeAuth}
    >
      {children}
    </ConvexProviderWithAuth>
  );
}
