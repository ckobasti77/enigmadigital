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

export function UxHarness({ children }: { children: ReactNode }) {
  const client = useMemo(() => createFakeConvexClient(resolveFixture), []);
  return (
    <ConvexProviderWithAuth client={client} useAuth={useFakeAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
