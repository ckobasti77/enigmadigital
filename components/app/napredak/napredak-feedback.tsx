"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { Sparkles } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { danKljuc } from "@/convex/lib/napredak";
import { LevelUpBanner } from "@/components/app/system/level-up-banner";
import {
  RewardToast,
  RewardToastViewport,
} from "@/components/app/system/reward-toast";
import { useProjekatOpciono } from "@/components/app/projekat-provider";
import {
  izdvojiNagrade,
  novoPamcenje,
  type NagradaToast,
  type NovNivo,
} from "./nagrade";
import {
  ikonaDogadjaja,
  ikonaDostignuca,
  ikonaMisije,
} from "./napredak-ikone";
import {
  postaviZastojNapretka,
  useNapredak,
  useSada,
  useVidljivo,
} from "./use-napredak";

/**
 * ============================================================================
 * POVRATNA INFORMACIJA NAPRETKA — jedan hook u ljusci (UI Boost §6.9)
 * ============================================================================
 *
 * Nijedna mutacija u aplikaciji ne zna za XP. Ovaj hook prati `napredak.stanje`
 * (Convex je reaktivan) i iz PROMENE stanja pali:
 *
 *   +N XP · radnja     za svaki nov događaj u `poslednji` (toast, 2,5 s)
 *   misija, bonus      iz `proslave` (toast, 4 s)
 *   dostignuće         iz `proslave` (toast sa ikonicom dostignuća, 4 s)
 *   nov nivo           iz `proslave` (traka sa vrha, jedina sa sekvencom)
 *
 * ŠTA se pali odlučuje `izdvojiNagrade` (`nagrade.ts`, čista i pokrivena
 * proverom); ovde se to samo crta i viđeno javlja serveru
 * (`napredak.potvrdi`), pa se posle osvežavanja ne ponavlja. Isključen
 * Napredak ne crta ništa; reduced-motion poštuju same komponente.
 *
 * Hook usput drži i dan: upit ne čita sat, pa kad dan sidra nije današnji
 * beogradski datum (prvo otvaranje dana, tab otvoren preko ponoći), zove
 * `zamrzniDan`.
 */

type Ikona = ComponentType<{ className?: string }>;

type Red = { toasts: NagradaToast[]; nivo: NovNivo | null };

const PRAZAN: Red = { toasts: [], nivo: null };

/** Najviše toliko toastova odjednom; okvir ionako crta poslednja tri. */
const NAJVISE_TOASTOVA = 3;
/** Koliko puta se u jednom danu pokušava zamrzavanje ako poziv padne. */
const POKUSAJA_ZAMRZAVANJA = 3;

function ikonaToasta(ikona: NagradaToast["ikona"]): Ikona {
  switch (ikona.tip) {
    case "dogadjaj":
      return ikonaDogadjaja(ikona.kljuc);
    case "misija":
      return ikonaMisije(ikona.kljuc);
    case "dostignuce":
      return ikonaDostignuca(ikona.kljuc);
    default:
      return Sparkles;
  }
}

/**
 * Red čekanja nagrada. Živi van React stanja jer ga puni efekat koji prati
 * upit — a efekat ne sme da zove `setState`. `useSyncExternalStore` ga čita.
 */
function napraviRed() {
  let red: Red = PRAZAN;
  const slusaoci = new Set<() => void>();
  const postavi = (sledeci: Red): void => {
    red = sledeci;
    for (const javi of slusaoci) javi();
  };
  return {
    prijavi(javi: () => void) {
      slusaoci.add(javi);
      return () => {
        slusaoci.delete(javi);
      };
    },
    snimak: () => red,
    dodaj(novi: NagradaToast[]) {
      if (novi.length === 0) return;
      postavi({
        ...red,
        toasts: [...red.toasts, ...novi].slice(-NAJVISE_TOASTOVA),
      });
    },
    skloni(id: string) {
      postavi({ ...red, toasts: red.toasts.filter((t) => t.id !== id) });
    },
    nivo(nivo: NovNivo | null) {
      postavi({ ...red, nivo });
    },
  };
}

export function useNapredakFeedback(): ReactNode {
  // U opsegu „Ja“ (SPAJANJE) projekta nema; napredak je lični (P12), pa je
  // spreman čim je ljuska montirana (sesija je potvrđena).
  const spreman = useProjekatOpciono()?.spreman ?? true;
  const stanje = useNapredak();
  const sada = useSada();
  const vidljivo = useVidljivo();
  const zamrzniDan = useMutation(api.napredak.zamrzniDan);
  const potvrdi = useMutation(api.napredak.potvrdi);

  const [red] = useState(napraviRed);
  const { toasts, nivo } = useSyncExternalStore(
    red.prijavi,
    red.snimak,
    () => PRAZAN,
  );

  // ── dan ────────────────────────────────────────────────────────────────────
  const zamrzavanje = useRef<{ dan: string; pokusaja: number } | null>(null);
  const ukljucen = stanje?.ukljucen === true;
  const sidro = stanje?.ukljucen ? stanje.dan : null;

  useEffect(() => {
    if (!spreman || !ukljucen || sada === 0) return;
    const danas = danKljuc(sada);
    if (sidro === danas) return;
    const tekuce = zamrzavanje.current;
    const pokusaja = tekuce?.dan === danas ? tekuce.pokusaja : 0;
    // Server računa dan iz SVOG sata; ako se sa klijentskim ne slaže, poziv se
    // vrati sa `novo: false` i ovde se ne ponavlja u krug.
    if (pokusaja >= POKUSAJA_ZAMRZAVANJA) return;
    zamrzavanje.current = { dan: danas, pokusaja: pokusaja + 1 };
    void zamrzniDan().then(
      () => postaviZastojNapretka(false),
      () => {
        // Sledeći otkucaj sata pokušava ponovo, do granice; posle poslednjeg
        // pokušaja ekran prestaje da tvrdi da se nešto sabira.
        if (pokusaja + 1 >= POKUSAJA_ZAMRZAVANJA) postaviZastojNapretka(true);
      },
    );
  }, [spreman, ukljucen, sidro, sada, zamrzniDan]);

  // ── nagrade ────────────────────────────────────────────────────────────────
  const pamcenje = useRef(novoPamcenje());

  useEffect(() => {
    if (!stanje?.ukljucen) return;
    const nagrade = izdvojiNagrade(stanje, pamcenje.current, vidljivo);
    red.dodaj(nagrade.toasts);
    if (nagrade.nivo) red.nivo(nagrade.nivo);
    if (nagrade.potvrdi.length > 0 && spreman) {
      void potvrdi({ kljucevi: nagrade.potvrdi }).catch(() => {
        // Nepotvrđena proslava se vrati pri sledećem učitavanju — manje zlo
        // nego greška preko posla.
      });
    }
  }, [stanje, vidljivo, spreman, potvrdi, red]);

  if (!ukljucen) return null;

  return (
    <>
      {nivo && (
        <LevelUpBanner
          key={nivo.kljuc}
          level={nivo.level}
          rank={nivo.rank}
          tier={nivo.tier}
          onDismiss={() => red.nivo(null)}
        />
      )}
      <RewardToastViewport>
        {toasts.map((toast) => (
          <RewardToast
            key={toast.id}
            title={toast.title}
            xp={toast.xp}
            icon={ikonaToasta(toast.ikona)}
            tone={toast.tone}
            duration={toast.duration}
            onDismiss={() => red.skloni(toast.id)}
          />
        ))}
      </RewardToastViewport>
    </>
  );
}
