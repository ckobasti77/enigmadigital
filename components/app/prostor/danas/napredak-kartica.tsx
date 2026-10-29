"use client";

import { ArrowRight } from "lucide-react";

import { JaLink } from "@/components/app/ja-link";
import { usePoslednjiProjekat } from "@/components/app/podaci-ljuske";

import { NAPREDAK_HREF, type ModuleKey } from "@/components/app/nav-items";
import { ikonaMisije, odredisteMisije } from "@/components/app/napredak/napredak-ikone";
import {
  stanjeNiza,
  useNapredak,
  useNapredakPao,
  useNapredakZastoj,
  useSada,
  type Misija,
  type NapredakUkljucen,
} from "@/components/app/napredak/use-napredak";
import { ProgressBar, ProgressRing } from "@/components/app/system/progress";
import { StreakFlame } from "@/components/app/system/reward-badges";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { putanjaEkrana } from "@/lib/rutiranje";
import { misijeZaKarticu, stanjeNapretka, type StanjeNapretka } from "@/lib/prostor/modeli/danas-model";

/**
 * ============================================================================
 * NAPREDAK NA DANAS — tiha kartica (SPAJANJE S19, plan S18 E3)
 * ============================================================================
 *
 * „Danas · misije" sa Kontrolne table seli se ovde (O7, P17): niz, tri
 * nedeljna cilja i do dve nezavršene misije dana sa napretkom. Nivo je samo
 * tekst koji vodi na Napredak. Bez XP čipa, XP trake, bonusa i zlata: radni
 * ekran je „Tih" (CLAUDE.md), a nagrada živi na `/napredak`.
 *
 * Kartica nema primarno dugme i ne animira se pri učitavanju; prstenovi i
 * trake se pomere tek kad se vrednost promeni dok je ekran otvoren (to rade
 * same komponente). Podatke čita iz prodavnice `NapredakIzvor` (ljuska), pa
 * ne pravi novu pretplatu. U „Ja" nema tekućeg projekta: misija projekta vodi
 * pravo u taj projekat (`/<slug>/…`), a Napredak i misija bez projekta u
 * poslednji otvoren projekat (kolačić, kao „Projekat" u donjoj traci). Bez
 * poslednjeg projekta red misije nema adresu, a Napredak vodi na „Svi
 * projekti".
 */

/** Boja prstena je boja modula iz kog posao dolazi (isto kao Kontrolna tabla, §6.6). */
const MODUL_PRSTENA: Record<string, ModuleKey> = {
  pozivi: "leadovi",
  sastanci: "tabla",
  objave: "instagram",
};

/** Šta kartica crta, iz prodavnice napretka (bez nove pretplate). */
export function useStanjeNapretka(): StanjeNapretka {
  const stanje = useNapredak();
  const pao = useNapredakPao();
  const zastoj = useNapredakZastoj();
  return stanjeNapretka({ stanje, pao, zastoj });
}

export function NapredakKartica({ stanje: prikaz }: { stanje: StanjeNapretka }) {
  const stanje = useNapredak();
  if (prikaz === "skriveno") return null;
  if (prikaz === "spremno" && stanje?.ukljucen && stanje.spremno) return <Kartica stanje={stanje} />;
  return (
    <section aria-label="Napredak" aria-busy="true" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-copy font-bold text-foreground">Napredak</h2>
        {prikaz === "sabira" ? <span className="text-meta text-text-muted">Sabiram dan…</span> : null}
      </div>
      <Skeleton className="h-5 w-24" />
      <div className="flex gap-4">
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="size-12 rounded-full" />
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </section>
  );
}

function Kartica({ stanje }: { stanje: NapredakUkljucen }) {
  const sada = useSada();
  const poslednji = usePoslednjiProjekat();
  const prefiks = poslednji === null ? null : `/${poslednji}`;
  const { nivo, niz, misije, prstenovi } = stanje;
  const { prikazane, zavrsenih, ukupno } = misijeZaKarticu(misije);

  return (
    <section aria-labelledby="danas-napredak" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="danas-napredak" className="text-copy font-bold text-foreground">
          Napredak
        </h2>
        <JaLink
          href={prefiks === null ? "/projekti" : putanjaEkrana(NAPREDAK_HREF, prefiks)}
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-meta font-medium text-radnja underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
        >
          Nivo {formatNumber(nivo.broj)} · {nivo.zvanje}
          <ArrowRight className="size-3.5" aria-hidden />
        </JaLink>
      </div>

      <div className="flex items-center gap-x-5 gap-y-3">
        <StreakFlame days={niz.dani} state={stanjeNiza(niz, sada)} size="sm" />
        <ul aria-label="Ova nedelja" className="flex min-w-0 flex-1 items-start justify-end gap-3">
          {prstenovi.map((prsten) => (
            <li
              key={prsten.kljuc}
              data-module={MODUL_PRSTENA[prsten.kljuc]}
              className="flex flex-col items-center gap-1"
            >
              <ProgressRing
                value={prsten.vrednost}
                max={prsten.cilj}
                size={44}
                stroke={5}
                label={`${prsten.naziv} ove nedelje: ${prsten.vrednost} od ${prsten.cilj}`}
              >
                <span className="text-meta font-bold tabular-nums text-foreground">{prsten.vrednost}</span>
              </ProgressRing>
              <span className="text-meta text-text-muted">{prsten.naziv}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-ui text-text-muted">
          <span className="font-medium text-foreground">Misije danas</span>
          {ukupno > 0 ? (
            <span className="tabular-nums text-foreground">
              {" "}
              {formatNumber(zavrsenih)} / {formatNumber(ukupno)}
            </span>
          ) : null}
        </p>
        {ukupno === 0 ? (
          <p className="text-ui text-text-muted">Danas nema misija.</p>
        ) : prikazane.length === 0 ? (
          <p className="text-ui text-text-muted">Sve misije za danas su završene.</p>
        ) : (
          <ul className="flex flex-col">
            {prikazane.map((misija) => (
              <RedMisije key={misija.kljuc} misija={misija} ikona={ikonaMisije(misija.kljuc)} prefiks={prefiks} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function RedMisije({
  misija,
  ikona: Ikona,
  prefiks,
}: {
  misija: Misija;
  ikona: ReturnType<typeof ikonaMisije>;
  prefiks: string | null;
}) {
  // U „Ja" nema tekućeg projekta: misija projekta vodi u svoj projekat, a
  // misija bez projekta na isti ekran poslednjeg projekta.
  const kuda = odredisteMisije(misija, { slug: null, rezim: "hub" });
  const href =
    kuda === null ? null : kuda.vrsta === "projekat" ? kuda.href : prefiks === null ? null : putanjaEkrana(kuda.href, prefiks);
  const naslov = misija.projekat ? `${misija.naslov} · ${misija.projekat.ime}` : misija.naslov;
  const telo = (
    <>
      <Ikona className="size-4 shrink-0 text-text-muted" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-ui text-foreground">{naslov}</span>
          <span className="shrink-0 text-meta tabular-nums text-text-muted">
            {formatNumber(misija.napredak)} / {formatNumber(misija.cilj)}
          </span>
        </span>
        <ProgressBar value={misija.napredak} max={misija.cilj} label={`${misija.naslov}: napredak`} size="sm" />
      </span>
    </>
  );
  const klasa =
    "flex min-h-10 items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11";
  return (
    <li>
      {href === null ? (
        <span className={klasa}>{telo}</span>
      ) : (
        <JaLink href={href} className={klasa}>
          {telo}
        </JaLink>
      )}
    </li>
  );
}
