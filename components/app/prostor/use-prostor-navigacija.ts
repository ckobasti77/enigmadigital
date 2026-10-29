"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useProjekatOpciono } from "@/components/app/projekat-provider";
import { hrefRute, hrefUProjektu, jeJaRuta, type ProstorRuta } from "@/lib/prostor/rute";
import { useCuvarNapustanja } from "./cuvar-napustanja";

/**
 * ============================================================================
 * NAVIGACIJA RADNOG DELA (plan S07 §4.2, D18)
 * ============================================================================
 *
 * Zamena za Devotion `navigateRoute(route, { replace, bypassGuard,
 * targetStartupId })` i `workspaceRouteHref`. Ruta je Devotionov objekat
 * (`lib/prostor/rute.ts`), a adresa je prava ruta Next-a:
 *   - ruta „Ja“ → `/`, `/moji-zadaci`, … (nikad prefiks projekta);
 *   - ruta projekta → u tekućem projektu kroz prefiks (`/<slug>/…` u hubu,
 *     `/…` u panelu), a u DRUGOM projektu (`projekat`) kroz njegov slug iz
 *     `projekti.mojiProjekti`.
 *
 * `idi` pre odlaska pita čuvar napuštanja (`cuvar-napustanja.tsx`).
 *
 *   const { idi, href } = useProstorNavigacija();
 *   idi({ kind: "page", pageId });                       // tekući projekat
 *   idi({ kind: "tasks", filter: "moji" }, { zameni: true });
 *   idi({ kind: "page", pageId }, { projekat: stavka.workspaceId }); // iz „Ja“
 */
export type OpcijeNavigacije = {
  /** `router.replace` umesto `push` (bez novog unosa u istoriji). */
  zameni?: boolean;
  /** Bez pitanja čuvara (posle „Napusti“, ili posle sopstvenog čuvanja). */
  zaobidjiCuvara?: boolean;
  /** Projekat rute; bez njega tekući. */
  projekat?: Id<"workspaces">;
};

export function useProstorNavigacija(): {
  idi: (ruta: ProstorRuta, opcije?: OpcijeNavigacije) => void;
  href: (ruta: ProstorRuta, projekat?: Id<"workspaces">) => string;
} {
  const router = useRouter();
  const tekuci = useProjekatOpciono();
  const { pokusaj } = useCuvarNapustanja();
  // Spisak projekata (već dozvoljen direktan poziv): slug za rutu u drugom
  // projektu. Pretplata je ista kao u traci, pa ne košta ništa novo.
  const projekti = useQuery(api.projekti.mojiProjekti);

  const slugovi = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of projekti ?? []) mapa.set(p.workspaceId, p.slug);
    return mapa;
  }, [projekti]);

  const href = useCallback(
    (ruta: ProstorRuta, projekat?: Id<"workspaces">): string => {
      if (jeJaRuta(ruta)) return hrefRute(ruta, "");
      const uTekucem =
        tekuci !== null && (projekat === undefined || projekat === tekuci.workspaceId);
      if (uTekucem) return hrefRute(ruta, tekuci.prefiks);
      const slug = projekat ? slugovi.get(projekat) : undefined;
      if (slug) return hrefUProjektu(slug, ruta);
      // Projekat još nije poznat (spisak se učitava) ili nije moj: na spisak
      // projekata, nikad na stranu bez projekta.
      if (process.env.NODE_ENV !== "production" && projekat === undefined) {
        console.error("useProstorNavigacija: ruta projekta van projekta, bez `projekat`.", ruta);
      }
      return "/projekti";
    },
    [tekuci, slugovi],
  );

  const idi = useCallback(
    (ruta: ProstorRuta, opcije: OpcijeNavigacije = {}) => {
      const adresa = href(ruta, opcije.projekat);
      const kreni = () => (opcije.zameni ? router.replace(adresa) : router.push(adresa));
      if (opcije.zaobidjiCuvara) kreni();
      else pokusaj(kreni);
    },
    [href, pokusaj, router],
  );

  return { idi, href };
}
