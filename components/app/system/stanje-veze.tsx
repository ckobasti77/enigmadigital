"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Provider } from "@/convex/lib/providers";
import {
  nazivVeze,
  podaciSuStari,
  porukaStatusa,
  statusiIzRedova,
  zbirStatusa,
  type StatusVeze,
  type ZbirStatusa,
} from "@/convex/lib/statusVeze";
import { resolveModule } from "@/components/app/nav-items";
import { ProjekatLink } from "@/components/app/projekat-link";
import {
  useEkranPutanja,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { useNow } from "@/components/app/use-now";
import { formatShortDateAt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { vezeModula } from "@/lib/veze-ekrana";

/**
 * ============================================================================
 * JEDAN STATUS VEZE NA EKRANU (P3, plan T03 §1)
 * ============================================================================
 *
 * Jedini put kojim ekran saznaje da li veza radi. Upit vraća činjenice, a
 * status se računa ovde, sa satom koji otkucava (`useNow`), istom funkcijom
 * kojom zvono računa na serveru (`convex/lib/statusVeze.ts`). Tačka u gornjoj
 * traci, red stanja u zaglavlju kanala, „podaci od …" uz fokus broj,
 * Podešavanja i pregled na tabli čitaju baš ovo.
 */

export type StanjeVeza = {
  statusi: StatusVeze[];
  poProvajderu: ReadonlyMap<Provider, StatusVeze>;
  zbir: ZbirStatusa;
  sada: number;
};

/** `undefined` dok odgovor ne stigne (i van projekta). */
export function useStatusVeza(): StanjeVeza | undefined {
  const redovi = useProjekatQuery(api.statusVeza.lista);
  const sada = useNow();
  return useMemo(() => {
    if (redovi === undefined) return undefined;
    const statusi = statusiIzRedova(redovi, sada);
    return {
      statusi,
      poProvajderu: new Map(statusi.map((s) => [s.provider, s])),
      zbir: zbirStatusa(statusi),
      sada,
    };
  }, [redovi, sada]);
}

/** Statusi veza od kojih zavise brojevi tekućeg ekrana (`lib/veze-ekrana.ts`). */
export function useStatusEkrana(): { statusi: StatusVeze[]; sada: number } | undefined {
  const stanje = useStatusVeza();
  const putanja = useEkranPutanja();
  if (stanje === undefined) return undefined;
  const statusi = vezeModula(resolveModule(putanja))
    .map((p) => stanje.poProvajderu.get(p))
    .filter((s): s is StatusVeze => s !== undefined);
  return { statusi, sada: stanje.sada };
}

/** „podaci od 24. okt" — samo kad su podaci stariji od 24 h. */
export function podaciOdTekst(s: StatusVeze, sada: number): string | null {
  return podaciSuStari(s, sada) && s.podaciOd !== null
    ? `podaci od ${formatShortDateAt(s.podaciOd)}`
    : null;
}

/** Radnja statusa kao veza u boji radnje (nikad u boji modula). */
export function RadnjaVeze({
  status,
  sada,
  onNavigate,
  className,
}: {
  status: StatusVeze;
  sada: number;
  onNavigate?: () => void;
  className?: string;
}) {
  const radnja = porukaStatusa(status, sada).radnja;
  if (radnja === null) return null;
  return (
    <ProjekatLink
      href={radnja.href}
      onClick={onNavigate}
      className={cn(
        "touch-target inline-flex shrink-0 items-center rounded-sm font-medium text-accent-400 underline-offset-4 hover:underline",
        className,
      )}
    >
      {radnja.oznaka}
    </ProjekatLink>
  );
}

/**
 * Traka na vrhu pogođenog ekrana, ispod zaglavlja: jedan red po vezi koja
 * traži pažnju, sa razlogom, starošću podataka i jednom radnjom. Kad veza
 * radi, trake nema — miran sto ne javlja da je sve u redu.
 */
export function StanjeVezeRed({ className }: { className?: string }) {
  const ekran = useStatusEkrana();
  if (ekran === undefined) return null;
  const paznja = ekran.statusi.filter((s) => s.vrednost === "trazi_paznju");
  if (paznja.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {paznja.map((s) => {
        const podaciOd = podaciOdTekst(s, ekran.sada);
        return (
          <div
            key={s.provider}
            role="status"
            data-veza={s.provider}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-ui"
          >
            <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
            <span className="sr-only">Veza traži pažnju: </span>
            <span className="min-w-0 font-medium text-foreground">
              {porukaStatusa(s, ekran.sada).recenica}
            </span>
            {podaciOd && (
              <span className="text-text-secondary">
                {/* Na uskom ekranu „podaci od" pada u novi red; tada tačka ne
                    sme da otvori red. */}
                <span aria-hidden className="hidden sm:inline">
                  ·{" "}
                </span>
                {podaciOd}
              </span>
            )}
            <RadnjaVeze status={s} sada={ekran.sada} className="ml-auto" />
          </div>
        );
      })}
    </div>
  );
}

/**
 * „podaci od …" uz fokus broj kanala, kad je sinhronizacija starija od 24 h.
 * Na ekranu sa dve veze (Oglasi: Meta i Google) nosi i ime veze.
 */
export function PodaciOd({ className }: { className?: string }) {
  const ekran = useStatusEkrana();
  if (ekran === undefined) return null;
  const stari = ekran.statusi.filter((s) => podaciSuStari(s, ekran.sada));
  if (stari.length === 0) return null;
  const viseVeza = ekran.statusi.length > 1;
  const tekst = stari
    .map((s) => {
      const od = podaciOdTekst(s, ekran.sada);
      return viseVeza ? `${nazivVeze(s.provider)}: ${od}` : od;
    })
    .join(" · ");

  return (
    <p
      className={cn("text-ui text-text-muted", className)}
      title="Brojevi su poslednji put osveženi tada; posle toga ništa novo nije stiglo."
    >
      {tekst}
    </p>
  );
}
