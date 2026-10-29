"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  jeNavigacijaUnutarAplikacije,
  najteziNacrt,
  odlukaNapustanja,
  type PrijavljenNacrt,
  type StanjeCuvanja,
  type VrstaNacrta,
} from "@/lib/prostor/web/cuvar-napustanja";

/**
 * ============================================================================
 * ČUVAR NAPUŠTANJA (plan S07 §4.3, Devotion „Ostani / Napusti“)
 * ============================================================================
 *
 * Stranica i oblast (S10) prijavljuju stanje čuvanja kroz
 * `useCuvarNapustanja().prijavi(id, stanje, vrsta)`. Dok nešto nije
 * sačuvano, odlazak sa ekrana:
 *   - kroz `useProstorNavigacija().idi(…)`, ili
 *   - klikom na bilo koji interni link (traka, meni, `ProjekatLink`, `JaLink`)
 * čeka do 2 s da autosave završi, pa pita „Ostani / Napusti“ (greška ili
 * konflikt pitaju odmah). Pravila su čista funkcija u
 * `lib/prostor/web/cuvar-napustanja.ts`.
 *
 * Dugme Nazad u pregledaču se ovde ne hvata: Next ruter sam obrađuje
 * `popstate`, a vraćanje adrese bi se sa njim posvađalo. Za to i za
 * zatvaranje kartice ostaje `beforeunload` iz autosave-a stranice (S10).
 */
type Kontekst = {
  /** Prijava stanja nacrta; `null` = nacrt je otišao sa ekrana. */
  prijavi: (id: string, stanje: StanjeCuvanja | null, vrsta?: VrstaNacrta) => void;
  /**
   * Pokušaj odlaska: odmah, posle čekanja, ili posle „Napusti“. Vraća `true`
   * kad je `nastavi` pozvan odmah.
   */
  pokusaj: (nastavi: () => void) => boolean;
};

const CuvarContext = createContext<Kontekst | null>(null);

/** Čuvar iz ljuske; van nje (vodič, test) odlazak ide bez pitanja. */
export function useCuvarNapustanja(): Kontekst {
  return useContext(CuvarContext) ?? BEZ_CUVARA;
}

const BEZ_CUVARA: Kontekst = {
  prijavi: () => {},
  pokusaj: (nastavi) => {
    nastavi();
    return true;
  },
};

type Zahtev = { nastavi: () => void; pitanje: string; pitano: boolean; od: number };

export function CuvarNapustanjaProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [nacrti, setNacrti] = useState<ReadonlyMap<string, PrijavljenNacrt>>(() => new Map());
  const [zahtev, setZahtev] = useState<Zahtev | null>(null);
  const najtezi = useMemo(() => najteziNacrt(nacrti.values()), [nacrti]);
  // Povratni pozivi čitaju poslednje stanje bez ponovnog pravljenja.
  const najteziRef = useRef(najtezi);
  const zahtevRef = useRef(zahtev);
  useEffect(() => {
    najteziRef.current = najtezi;
    zahtevRef.current = zahtev;
  }, [najtezi, zahtev]);

  const prijavi = useCallback(
    (id: string, stanje: StanjeCuvanja | null, vrsta: VrstaNacrta = "stranica") => {
      setNacrti((pre) => {
        const staro = pre.get(id);
        if (stanje === null) {
          if (!staro) return pre;
          const novo = new Map(pre);
          novo.delete(id);
          return novo;
        }
        if (staro && staro.stanje === stanje && staro.vrsta === vrsta) return pre;
        const novo = new Map(pre);
        novo.set(id, { stanje, vrsta });
        return novo;
      });
    },
    [],
  );

  const pokusaj = useCallback((nastavi: () => void) => {
    const odluka = odlukaNapustanja(najteziRef.current);
    if (odluka.tip === "idi") {
      nastavi();
      return true;
    }
    setZahtev({ nastavi, pitanje: odluka.pitanje, pitano: odluka.tip === "pitaj", od: Date.now() });
    return false;
  }, []);

  // Dok se čeka: čim autosave završi, odlazak ide sam; 2 s od pokušaja se
  // pita. Odluka se primenjuje u tajmeru (i kad je odmah), ne u telu efekta.
  useEffect(() => {
    if (!zahtev || zahtev.pitano) return;
    const odluka = odlukaNapustanja(najtezi);
    const ms = odluka.tip === "sacekaj" ? Math.max(0, zahtev.od + odluka.ms - Date.now()) : 0;
    const tajmer = window.setTimeout(() => {
      if (odluka.tip === "idi") {
        setZahtev(null);
        zahtev.nastavi();
        return;
      }
      const sada = zahtevRef.current;
      if (sada) setZahtev({ ...sada, pitanje: odluka.pitanje, pitano: true });
    }, ms);
    return () => window.clearTimeout(tajmer);
  }, [zahtev, najtezi]);

  // Klik na interni link dok nešto nije sačuvano: preuzima ga čuvar.
  const imaNacrt = najtezi !== null;
  useEffect(() => {
    if (!imaNacrt) return;
    const naKlik = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      const trenutna = window.location.href;
      if (
        !jeNavigacijaUnutarAplikacije(
          e,
          { href: a.href, target: a.target, download: a.hasAttribute("download") },
          trenutna,
        )
      ) {
        return;
      }
      const cilj = new URL(a.href);
      const adresa = `${cilj.pathname}${cilj.search}${cilj.hash}`;
      e.preventDefault();
      e.stopPropagation();
      pokusaj(() => router.push(adresa));
    };
    document.addEventListener("click", naKlik, true);
    return () => document.removeEventListener("click", naKlik, true);
  }, [imaNacrt, pokusaj, router]);

  const vrednost = useMemo(() => ({ prijavi, pokusaj }), [prijavi, pokusaj]);
  const ostaniRef = useRef<HTMLButtonElement>(null);

  return (
    <CuvarContext.Provider value={vrednost}>
      {children}
      <Dialog
        open={zahtev?.pitano === true}
        onOpenChange={(otvoren) => {
          if (!otvoren) setZahtev(null);
        }}
      >
        <DialogPopup initialFocus={ostaniRef} className="sm:max-w-[26rem]">
          <DialogHeader>
            <DialogTitle>{zahtev?.pitanje ?? ""}</DialogTitle>
            <DialogDescription>
              Ako napustiš, nesačuvane izmene se gube.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button ref={ostaniRef} variant="outline" onClick={() => setZahtev(null)}>
              Ostani
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const nastavi = zahtev?.nastavi;
                setZahtev(null);
                nastavi?.();
              }}
            >
              Napusti
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </CuvarContext.Provider>
  );
}
