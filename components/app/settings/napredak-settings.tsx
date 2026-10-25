"use client";

import { useId, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { GRANICE_CILJA } from "@/convex/lib/napredak";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { FeedbackLine, FeedbackNote } from "@/components/app/feedback";
import { Field, FormGroup, FormStack } from "@/components/app/form-kit";
import {
  useNapredak,
  useNapredakPao,
  type NapredakStanje,
} from "@/components/app/napredak/use-napredak";
import {
  useProjekat,
  useProjekatMutation,
} from "@/components/app/projekat-provider";

/**
 * ============================================================================
 * PODEŠAVANJA → NAPREDAK (UI Boost §6.1, §6.5, §6.6)
 * ============================================================================
 *
 * Tri odluke, i sve tri su lične (važe za ovog korisnika, ne za radni prostor):
 *
 *   Prikazuj XP i proslave   isključeno = nema XP-a, misija, niza ni proslava
 *   Nedeljni ciljevi         pozivi / sastanci / objave — tri prstena
 *   Vikend ne prekida niz    subota i nedelja bez rada su neutralne
 *
 * Prekidači se čuvaju odmah (jedna radnja, jedna posledica); ciljevi se čuvaju
 * dugmetom, jer se kucaju. Greška polja stoji uz polje dok se kuca.
 */

type Podesavanja = NapredakStanje["podesavanja"];
type KljucCilja = keyof typeof GRANICE_CILJA;

const CILJEVI: ReadonlyArray<{ kljuc: KljucCilja; naziv: string }> = [
  { kljuc: "ciljPozivi", naziv: "Pozivi nedeljno" },
  { kljuc: "ciljSastanci", naziv: "Sastanci nedeljno" },
  { kljuc: "ciljObjave", naziv: "Objave nedeljno" },
];

function greskaCilja(kljuc: KljucCilja, tekst: string): string | null {
  const { min, max } = GRANICE_CILJA[kljuc];
  if (!/^\d+$/.test(tekst.trim())) return `Ceo broj od ${min} do ${max}.`;
  const broj = Number(tekst);
  return broj < min || broj > max ? `Ceo broj od ${min} do ${max}.` : null;
}

export function NapredakSettings() {
  const stanje = useNapredak();
  const pao = useNapredakPao();

  if (pao) {
    return (
      <FeedbackNote
        tone="warning"
        title="Podešavanja Napretka trenutno nisu dostupna"
        className="mt-6 max-w-xl"
      >
        Podaci nisu stigli. Osveži stranu.
      </FeedbackNote>
    );
  }

  if (stanje === undefined) {
    return (
      <div className="space-y-7 pt-6">
        <Skeleton className="h-16 w-full max-w-xl rounded-xl" />
        <Skeleton className="h-28 w-full max-w-xl rounded-xl" />
        <Skeleton className="h-16 w-full max-w-xl rounded-xl" />
      </div>
    );
  }

  const p = stanje.podesavanja;
  return (
    // Ključ vraća polja na sačuvane vrednosti čim server potvrdi izmenu.
    <Forma
      key={`${p.ciljPozivi}-${p.ciljSastanci}-${p.ciljObjave}`}
      podesavanja={p}
    />
  );
}

/**
 * Stanje prekidača i rečima: u Podešavanjima je boja modula neutralna siva, pa
 * se uključen prekidač od isključenog razlikuje samo položajem.
 */
function StanjePrekidaca({
  ukljuceno,
  children,
}: {
  ukljuceno: boolean;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="text-meta text-text-muted">
        {ukljuceno ? "Uključeno" : "Isključeno"}
      </span>
      {children}
    </span>
  );
}

function Forma({ podesavanja }: { podesavanja: Podesavanja }) {
  const { spreman } = useProjekat();
  const podesi = useProjekatMutation(api.napredak.podesi);

  const [ciljevi, setCiljevi] = useState<Record<KljucCilja, string>>({
    ciljPozivi: String(podesavanja.ciljPozivi),
    ciljSastanci: String(podesavanja.ciljSastanci),
    ciljObjave: String(podesavanja.ciljObjave),
  });
  const [cuva, setCuva] = useState<"prikaz" | "vikend" | "ciljevi" | null>(null);
  const [greska, setGreska] = useState(false);
  const [sacuvano, setSacuvano] = useState(false);
  const prikazId = useId();
  const vikendId = useId();

  const posalji = async (
    sta: "prikaz" | "vikend" | "ciljevi",
    izmena: Partial<Podesavanja>,
  ) => {
    if (!spreman) return;
    setCuva(sta);
    setGreska(false);
    setSacuvano(false);
    try {
      await podesi(izmena);
      if (sta === "ciljevi") setSacuvano(true);
    } catch {
      setGreska(true);
    } finally {
      setCuva(null);
    }
  };

  const greske = {
    ciljPozivi: greskaCilja("ciljPozivi", ciljevi.ciljPozivi),
    ciljSastanci: greskaCilja("ciljSastanci", ciljevi.ciljSastanci),
    ciljObjave: greskaCilja("ciljObjave", ciljevi.ciljObjave),
  };
  const ispravno = CILJEVI.every((c) => greske[c.kljuc] === null);
  const izmenjeno = CILJEVI.some(
    (c) => ciljevi[c.kljuc].trim() !== String(podesavanja[c.kljuc]),
  );

  return (
    <FormStack className="max-w-xl pt-6">
      <FormGroup
        boxed
        title="Prikaz"
        control={
          <StanjePrekidaca ukljuceno={podesavanja.ukljucen}>
            <Switch
              id={prikazId}
              checked={podesavanja.ukljucen}
              disabled={cuva !== null || !spreman}
              onCheckedChange={(ukljucen) =>
                void posalji("prikaz", { ukljucen })
              }
            />
          </StanjePrekidaca>
        }
      >
        <label htmlFor={prikazId} className="block cursor-pointer">
          <span className="block text-ui font-medium text-foreground">
            Prikazuj XP i proslave
          </span>
          <span className="mt-0.5 block text-meta leading-relaxed text-text-muted">
            {podesavanja.ukljucen
              ? "Kartica igrača, misije dana, niz i nagrade su uključeni."
              : "Nema XP-a, misija, niza ni proslava. Radnje se i dalje beleže, pa je posle uključivanja sve tu."}
          </span>
        </label>
      </FormGroup>

      <FormGroup
        title="Nedeljni ciljevi"
        description="Tri prstena na ekranu Napredak: koliko poziva, sastanaka i objava hoćeš u jednoj nedelji."
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ispravno || !izmenjeno) return;
            void posalji("ciljevi", {
              ciljPozivi: Number(ciljevi.ciljPozivi),
              ciljSastanci: Number(ciljevi.ciljSastanci),
              ciljObjave: Number(ciljevi.ciljObjave),
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {CILJEVI.map((cilj) => (
              <Field
                key={cilj.kljuc}
                label={cilj.naziv}
                error={greske[cilj.kljuc]}
              >
                {(props) => (
                  <Input
                    {...props}
                    inputMode="numeric"
                    value={ciljevi[cilj.kljuc]}
                    onChange={(event) => {
                      setSacuvano(false);
                      setCiljevi((prev) => ({
                        ...prev,
                        [cilj.kljuc]: event.target.value,
                      }));
                    }}
                    className="font-mono tabular-nums"
                  />
                )}
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={!ispravno || !izmenjeno || !spreman}
              loading={cuva === "ciljevi"}
            >
              Sačuvaj ciljeve
            </Button>
            {sacuvano && !izmenjeno && (
              <FeedbackLine tone="success">Ciljevi su sačuvani.</FeedbackLine>
            )}
          </div>
        </form>
      </FormGroup>

      <FormGroup
        boxed
        title="Niz"
        control={
          <StanjePrekidaca ukljuceno={podesavanja.vikendNePrekida}>
            <Switch
              id={vikendId}
              checked={podesavanja.vikendNePrekida}
              disabled={cuva !== null || !spreman}
              onCheckedChange={(vikendNePrekida) =>
                void posalji("vikend", { vikendNePrekida })
              }
            />
          </StanjePrekidaca>
        }
      >
        <label htmlFor={vikendId} className="block cursor-pointer">
          <span className="block text-ui font-medium text-foreground">
            Vikend ne prekida niz
          </span>
          <span className="mt-0.5 block text-meta leading-relaxed text-text-muted">
            {podesavanja.vikendNePrekida
              ? "Subota i nedelja bez rada ne prekidaju niz; rad vikendom ga produžava."
              : "Svaki dan bez rada prekida niz, i subota i nedelja."}
          </span>
        </label>
      </FormGroup>

      {greska && (
        <FeedbackNote tone="danger" title="Izmena nije sačuvana">
          Proveri vezu i pokušaj ponovo.
        </FeedbackNote>
      )}
    </FormStack>
  );
}
