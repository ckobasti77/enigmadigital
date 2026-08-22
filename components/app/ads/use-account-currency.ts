"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Hook koji čita valutu ad naloga (adAccounts.currency) iz Convex-a.
 * Ako valuta nije poznata ili nalog nije izabran, vraća `undefined` — nikada ne vraća "EUR" ili "RSD".
 */
export function useAccountCurrency(
  adAccountId?: string | Id<"adAccounts">,
): string | undefined {
  const currency = useQuery(api.metaAdsStore.getAccountCurrency, {
    accountId: adAccountId,
  });

  if (!currency || typeof currency !== "string" || !currency.trim()) {
    return undefined;
  }

  return currency.trim();
}
