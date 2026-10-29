"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMoze, useProjekat } from "@/components/app/projekat-provider";
import { useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import type { CreatePageTarget, ProfileWithAvatar, StartupWithAreas } from "@/lib/prostor/rute";

// Ljuska nosi ove dijaloge na svakoj strani projekta, a otvaraju se retko:
// njihov kod (sa brzim pravljenjem zadatka, koracima i komentarima) nije u
// prvom učitavanju, nego stiže odmah posle njega (SPAJANJE S28). Montirani
// su kao i pre, pa se ponašaju isto.
const CreatePageDialog = dynamic(() => import("./create-page-dialog").then((m) => m.CreatePageDialog), {
  ssr: false,
});
const CreateAreaDialog = dynamic(() => import("./create-area-dialog").then((m) => m.CreateAreaDialog), {
  ssr: false,
});

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
  // Broj otvaranja daje ključ dijalogu: svako otvaranje počinje čistim
  // poljem, a zatvaranje ne menja ključ, pa dijalog odigra izlaz. Dijalozi se
  // otvaraju spolja (stablo, zaglavlje, ⌘K), bez svog okidača, pa fokus posle
  // zatvaranja vraćamo sami na dugme koje ih je otvorilo. Ranije je ključ
  // nosio i „otvoreno“, a fokus je padao na `body` (pristupačnost, S28).
  const [otvaranjaStranice, setOtvaranjaStranice] = useState(0);
  const [otvaranjaOblasti, setOtvaranjaOblasti] = useState(0);
  const okidac = useRef<HTMLElement | null>(null);
  const zapamtiOkidac = () => {
    const el = document.activeElement;
    okidac.current = el instanceof HTMLElement && el !== document.body ? el : null;
  };
  // Okidač koji je u međuvremenu nestao (zatvoren meni, paleta): podrazumevano.
  const vratiFokus = useCallback(
    () => (okidac.current?.isConnected ? okidac.current : true),
    [],
  );

  const otvoriNovuStranicu = useCallback((target?: CreatePageTarget) => {
    zapamtiOkidac();
    setCilj(target);
    setNovaOtvorena(true);
    setOtvaranjaStranice((n) => n + 1);
  }, []);
  const otvoriNovuOblast = useCallback(() => {
    zapamtiOkidac();
    setOblastOtvorena(true);
    setOtvaranjaOblasti((n) => n + 1);
  }, []);
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
            key={`${otvaranjaStranice}-${cilj?.areaId ?? "bez"}-${cilj?.parentPageId ?? "vrh"}`}
            open={novaOtvorena}
            onOpenChange={setNovaOtvorena}
            workspace={projekat}
            profileId={profil?._id ?? null}
            target={cilj}
            finalFocus={vratiFokus}
            onCreated={(pageId) => {
              setNovaStranicaId(pageId);
              idi({ kind: "page", pageId });
            }}
          />
          <CreateAreaDialog
            key={otvaranjaOblasti}
            open={oblastOtvorena}
            onOpenChange={setOblastOtvorena}
            workspace={projekat}
            finalFocus={vratiFokus}
            onCreated={(areaId) => idi({ kind: "area", areaId })}
          />
        </>
      ) : null}
    </DokumentiContext.Provider>
  );
}
