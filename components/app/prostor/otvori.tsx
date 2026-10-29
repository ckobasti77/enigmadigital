"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { LoaderCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { adresaZaOtvori } from "@/lib/prostor/web/obavestenja";

/**
 * Razrešava link iz obaveštenja i push poruke (plan S07 D13):
 * `/otvori?projekat=<workspaceId>&vrsta=…&cilj=…` → tačan ekran
 * (`/<slug>/stranica/<id>`, `/<slug>/poruke?kanal=…`, `/<slug>/ideje?ideja=…`,
 * `/<slug>/dokumenti/<id>`, `/<slug>/puls`, `/<slug>/korpa`, početna).
 * Servis radnik zna ID projekta, a ne adresu, pa adresu daje spisak mojih
 * projekata (isti upit kao traka). Lična poruka (bez projekta) vodi u lične
 * Poruke. Projekat koji nije moj vodi na Danas, bez otkrivanja da li postoji.
 */
export function Otvori() {
  const router = useRouter();
  const upit = useSearchParams();
  const projekti = useQuery(api.projekti.mojiProjekti);

  useEffect(() => {
    if (projekti === undefined) return;
    const slugovi = new Map<string, string>(projekti.map((p) => [p.workspaceId, p.slug]));
    router.replace(adresaZaOtvori(new URLSearchParams(upit.toString()), (id) => slugovi.get(id)));
  }, [projekti, upit, router]);

  return (
    <div role="status" className="flex flex-1 items-center justify-center gap-2 py-16 text-ui text-text-muted">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      Otvaram…
    </div>
  );
}
