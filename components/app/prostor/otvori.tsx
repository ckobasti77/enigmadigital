"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { LoaderCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";

/**
 * Razrešava link iz obaveštenja (plan S07 D13):
 * `/otvori?projekat=<workspaceId>&vrsta=…&cilj=…` → `/<slug>`. Servis radnik
 * zna ID projekta, a ne adresu, pa adresu daje spisak mojih projekata (isti
 * upit kao traka). Projekat koji nije moj vodi na Danas, bez otkrivanja da li
 * postoji.
 *
 * Kostur (SPAJANJE S09): vodi na početnu projekta. Vrstu i cilj (stranica,
 * ideja, kanal) dopisuje korak obaveštenja.
 */
export function Otvori() {
  const router = useRouter();
  const upit = useSearchParams();
  const projekti = useQuery(api.projekti.mojiProjekti);
  const workspaceId = upit.get("projekat");

  useEffect(() => {
    if (projekti === undefined) return;
    const p = workspaceId ? projekti.find((x) => x.workspaceId === workspaceId) : undefined;
    router.replace(p ? `/${p.slug}` : "/");
  }, [projekti, workspaceId, router]);

  return (
    <div role="status" className="flex flex-1 items-center justify-center gap-2 py-16 text-ui text-text-muted">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      Otvaram…
    </div>
  );
}
