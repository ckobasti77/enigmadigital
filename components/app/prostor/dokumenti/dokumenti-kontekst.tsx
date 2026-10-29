"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMoze, useProjekat } from "@/components/app/projekat-provider";
import { useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import type { CreatePageTarget, ProfileWithAvatar, StartupWithAreas } from "@/lib/prostor/rute";
import { CreateAreaDialog } from "./create-area-dialog";
import { CreatePageDialog } from "./create-page-dialog";

/**
 * ============================================================================
 * DOKUMENTI PROJEKTA (SPAJANJE S10, paritet redovi 16–18)
 * ============================================================================
 *
 * Ono što su u Devotionu držali ljuska i bočni meni, a sada dele meni
 * projekta (stablo oblasti) i ekrani oblasti i stranice:
 *   - projekat sa oblastima (`prostor.projekat.get`) i moj profil;
 *   - dijalozi „Nova stranica“ i „Nova oblast“ (jedan primerak po ljusci);
 *   - upravo napravljena stranica (fokus na naslov kad se otvori).
 *
 * Montira se samo u opsegu projekta. Posmatrač (`client_viewer`) nema radni
 * deo, pa za njega nema ni upita.
 */
export type DokumentiKontekst = {
  /** `undefined` dok stiže ili kad radni deo nije dostupan. */
  projekat: StartupWithAreas | undefined;
  profil: ProfileWithAvatar | null | undefined;
  otvoriNovuStranicu: (target?: CreatePageTarget) => void;
  otvoriNovuOblast: () => void;
  /** Stranica napravljena u ovoj sesiji; njen naslov dobija fokus. */
  novaStranicaId: Id<"pages"> | null;
  zaboraviNovuStranicu: () => void;
};

const DokumentiContext = createContext<DokumentiKontekst | null>(null);

const BEZ_DOKUMENATA: DokumentiKontekst = {
  projekat: undefined,
  profil: undefined,
  otvoriNovuStranicu: () => {},
  otvoriNovuOblast: () => {},
  novaStranicaId: null,
  zaboraviNovuStranicu: () => {},
};

/** Dokumenti tekućeg projekta; van provajdera (opseg „Ja“) prazno. */
export function useDokumenti(): DokumentiKontekst {
  return useContext(DokumentiContext) ?? BEZ_DOKUMENATA;
}

export function DokumentiProvider({ children }: { children: ReactNode }) {
  const { uloga } = useProjekat();
  const smeRadniDeo = useMoze("urednik");
  const { idi } = useProstorNavigacija();
  // Tolerantno: pad upita ne obara ljusku (stablo tada ne crta oblasti).
  const projekat = useProjekatQueryTolerant(api.prostor.projekat.get, smeRadniDeo ? {} : "skip");
  const profil = useQuery(api.prostor.profiles.getCurrent, smeRadniDeo ? {} : "skip");

  const [novaOtvorena, setNovaOtvorena] = useState(false);
  const [cilj, setCilj] = useState<CreatePageTarget | undefined>();
  const [oblastOtvorena, setOblastOtvorena] = useState(false);
  const [novaStranicaId, setNovaStranicaId] = useState<Id<"pages"> | null>(null);

  const otvoriNovuStranicu = useCallback((target?: CreatePageTarget) => {
    setCilj(target);
    setNovaOtvorena(true);
  }, []);
  const otvoriNovuOblast = useCallback(() => setOblastOtvorena(true), []);
  const zaboraviNovuStranicu = useCallback(() => setNovaStranicaId(null), []);

  const vrednost = useMemo<DokumentiKontekst>(
    () => ({
      projekat: smeRadniDeo ? projekat : undefined,
      profil: smeRadniDeo ? profil : undefined,
      otvoriNovuStranicu,
      otvoriNovuOblast,
      novaStranicaId,
      zaboraviNovuStranicu,
    }),
    [smeRadniDeo, projekat, profil, otvoriNovuStranicu, otvoriNovuOblast, novaStranicaId, zaboraviNovuStranicu],
  );

  return (
    <DokumentiContext.Provider value={vrednost}>
      {children}
      {projekat && uloga !== null ? (
        <>
          <CreatePageDialog
            // Nov ključ = čisto polje za svaki cilj (oblast, roditelj).
            key={`${novaOtvorena}-${cilj?.areaId ?? "bez"}-${cilj?.parentPageId ?? "vrh"}`}
            open={novaOtvorena}
            onOpenChange={setNovaOtvorena}
            workspace={projekat}
            target={cilj}
            onCreated={(pageId) => {
              setNovaStranicaId(pageId);
              idi({ kind: "page", pageId });
            }}
          />
          <CreateAreaDialog
            key={`${oblastOtvorena}`}
            open={oblastOtvorena}
            onOpenChange={setOblastOtvorena}
            workspace={projekat}
            onCreated={(areaId) => idi({ kind: "area", areaId })}
          />
        </>
      ) : null}
    </DokumentiContext.Provider>
  );
}
