"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { ConvexProviderWithAuth } from "convex/react";
import { createFakeConvexClient } from "./fake-convex";
import { resolveFixture } from "./fixtures";

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

/**
 * `prazno` (`?ux=1&prazno=1`) vraća prazan nalog: bez veza ka kanalima i bez
 * redova, za snimanje praznih stanja kanala.
 */
export function UxHarness({
  children,
  prazno = false,
  pad,
}: {
  children: ReactNode;
  prazno?: boolean;
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
        return resolveFixture(name, args, prazno);
      }),
    [prazno, pad],
  );
  return (
    <ConvexProviderWithAuth client={client} useAuth={useFakeAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
