"use client";

import { useEffect, useState } from "react";
import {
  MODULE_KEYS,
  moduleNavItem,
  type ModuleKey,
} from "@/components/app/nav-items";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Grupa, Sekcija } from "./delovi";
import { installForcedStates } from "./force-states";
import { VodicKomponente } from "./vodic-komponente";

/**
 * ============================================================================
 * ŽIVI VODIČ SISTEMA — `/sistem?ux=1` (UI Boost §5.12, samo dev)
 * ============================================================================
 *
 * Jedna strana na kojoj se vidi ceo sistem: tokeni, trinaest modula, dugmad u
 * svim stanjima, pločice, čipovi, prazna stanja i primitivi napretka u akciji.
 * Snima se u svakoj fazi (`scripts/ux-snapshots.mjs`, ekran `sistem`), pa je
 * ovo i regresioni test izgleda.
 *
 * Stoji VAN ljuske aplikacije: birač modula ovde radi ono što u aplikaciji
 * radi ruta — postavlja `data-module` na sadržaj i na `<html>` — pa se na
 * probi portala vidi da boja stiže i do dijaloga.
 */

const MODUL_NAZIV = (kljuc: ModuleKey) => moduleNavItem(kljuc)?.label ?? kljuc;

export function SistemVodic() {
  const [modul, setModul] = useState<ModuleKey>("leadovi");

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.module = modul;
    return () => {
      delete root.dataset.module;
    };
  }, [modul]);

  // Hover i fokus kao statična stanja — vidi `force-states.ts`.
  useEffect(() => installForcedStates(), []);

  return (
    <main
      data-module={modul}
      className="mx-auto flex w-full max-w-[var(--content-max)] flex-col gap-14 px-[var(--gutter)] py-8"
    >
      <header className="aurora flex flex-col gap-4">
        <div>
          <p className="heading-caps text-meta font-medium text-mod">Dizajn sistem 2.0</p>
          <h1 className="mt-1 text-metric font-bold text-foreground">Živi vodič</h1>
          <p className="mt-1 max-w-2xl text-ui text-text-muted">
            Boja kaže gde si, jedan fokus i jedno primarno dugme po pogledu, a napredak
            se vidi. Izaberi modul — cela strana, i svaki dijalog, pređe u njegovu boju.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Aktivni modul"
          className="flex flex-wrap gap-1.5"
        >
          {MODULE_KEYS.map((kljuc) => {
            const Ikona = moduleNavItem(kljuc)?.icon;
            const izabran = kljuc === modul;
            return (
              <button
                key={kljuc}
                type="button"
                role="radio"
                aria-checked={izabran}
                data-module={kljuc}
                onClick={() => setModul(kljuc)}
                className={cn(
                  "touch-target inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-ui font-medium transition-colors",
                  izabran
                    ? "border-mod bg-mod-soft text-mod"
                    : "border-line text-text-muted hover:border-mod-line hover:text-mod",
                )}
              >
                {Ikona && <Ikona className="size-4 text-mod" aria-hidden />}
                {MODUL_NAZIV(kljuc)}
              </button>
            );
          })}
        </div>
      </header>

      <Sekcija
        naslov="Moduli — mesto"
        opis="Trinaest boja iste svetline i hrome. Ink je za ikonice, tekst i linije; strong je puna podloga sa tamnim tekstom; soft, line i glow se izvode."
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {MODULE_KEYS.map((kljuc) => {
            const Ikona = moduleNavItem(kljuc)?.icon;
            return (
              <div
                key={kljuc}
                data-module={kljuc}
                className="flex items-center gap-3 rounded-lg border border-line-soft bg-card p-3"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-mod-line bg-mod-soft text-mod">
                  {Ikona && <Ikona className="size-5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui font-medium text-foreground">
                    {MODUL_NAZIV(kljuc)}
                  </p>
                  <p className="truncate font-mono text-meta text-mod">--mod-{kljuc}</p>
                </div>
                <span className="flex h-8 shrink-0 items-center rounded-md bg-mod-strong px-2 font-mono text-meta font-bold text-text-inverse">
                  strong
                </span>
              </div>
            );
          })}
        </div>
        <VrednostiTokena
          imena={MODULE_KEYS.flatMap((k) => [`mod-${k}`, `mod-${k}-strong`])}
        />
      </Sekcija>

      <Sekcija
        naslov="Stanje, kategorija, napredak"
        opis="Preostale tri uloge boje. Zlatna je samo nagrada; slot 4 (amber) ostaje seriji grafikona."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <Grupa naslov="Stanje">
            {(["success", "warning", "danger", "info"] as const).map((s) => (
              <Uzorak key={s} token={s} soft={`${s}-soft`} line={`${s}-line`} />
            ))}
          </Grupa>
          <Grupa naslov="Kategorija">
            {[1, 2, 3, 5, 6].map((n) => (
              <Uzorak key={n} token={`chart-${n}`} ink={`chart-${n}-ink`} />
            ))}
            <Uzorak token="chart-4" napomena="samo serija" />
          </Grupa>
          <Grupa naslov="Napredak i nagrada">
            {[
              "xp",
              "xp-strong",
              "streak",
              "streak-hot",
              "tier-bronze",
              "tier-silver",
              "tier-gold",
              "tier-platinum",
              "tier-diamond",
            ].map((t) => (
              <Uzorak key={t} token={t} />
            ))}
          </Grupa>
        </div>
        <VrednostiTokena
          imena={[
            "info",
            "chart-1-ink",
            "chart-2-ink",
            "chart-3-ink",
            "chart-5-ink",
            "chart-6-ink",
            "xp",
            "xp-strong",
            "streak",
            "streak-hot",
            "tier-bronze",
            "tier-silver",
            "tier-gold",
            "tier-platinum",
            "tier-diamond",
          ]}
        />
      </Sekcija>

      <Sekcija
        naslov="Tipografija i pokret"
        opis="Skala 12 / 13 / 15 / 20 / 28 i hero (40) za jedini fokus broj ekrana. Pokret je miran; prebačaj je samo za nagradu."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col divide-y divide-line-soft">
            {(
              [
                ["text-hero", "hero · 40", "1.240"],
                ["text-metric", "metric · 28", "Kontrolna tabla"],
                ["text-title", "title · 20", "Naslov kartice i sekcije"],
                ["text-copy", "copy · 15", "Tekst i naziv firme u redu"],
                ["text-ui", "ui · 13", "Ćelije tabele, kontrole, opisi"],
                ["text-meta", "meta · 12", "Natpisi, čipovi, ose grafikona"],
              ] as const
            ).map(([klasa, ime, primer]) => (
              <div key={klasa} className="flex items-baseline gap-4 py-2">
                <span className="w-24 shrink-0 font-mono text-meta text-text-muted">
                  {ime}
                </span>
                <span
                  className={cn(
                    klasa,
                    "min-w-0 truncate text-foreground",
                    klasa === "text-hero" && "font-mono text-mod",
                  )}
                >
                  {primer}
                </span>
              </div>
            ))}
          </div>
          <VrednostiTokena
            imena={[
              "duration-press",
              "duration-fast",
              "duration-base",
              "ease-ui",
              "duration-momentum",
              "ease-momentum",
              "duration-reward",
              "ease-reward",
              "icon-stroke",
              "touch-min",
            ]}
          />
        </div>
      </Sekcija>

      <Sekcija
        naslov="Dugmad — 13 modula × 7 varijanti × 5 stanja"
        opis="Primarno je jedno po pogledu. Sekundarno prati, okvir je za alate i filtere, dugme bez podloge za radnje u redu. Hover i fokus su isti stilovi koje pregledač crta, samo prisilno uključeni."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {MODULE_KEYS.map((kljuc) => (
            <MrezaDugmadi key={kljuc} modul={kljuc} />
          ))}
        </div>
      </Sekcija>

      <VodicKomponente />
    </main>
  );
}

// ── pomoćni delovi ───────────────────────────────────────────────────────────

function Uzorak({
  token,
  soft,
  line,
  ink,
  napomena,
}: {
  token: string;
  soft?: string;
  line?: string;
  ink?: string;
  napomena?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="size-7 shrink-0 rounded-md border border-line-soft"
        style={{ background: `var(--${token})` }}
      />
      <span className="min-w-0 flex-1 truncate font-mono text-meta text-foreground">
        --{token}
      </span>
      {soft && (
        <span
          className="inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-meta font-medium"
          style={{
            background: `var(--${soft})`,
            borderColor: `var(--${line})`,
            color: `var(--${token})`,
          }}
        >
          soft
        </span>
      )}
      {ink && (
        <span
          className="shrink-0 font-mono text-meta font-medium"
          style={{ color: `var(--${ink})` }}
        >
          ink
        </span>
      )}
      {napomena && <span className="shrink-0 text-meta text-text-muted">{napomena}</span>}
    </div>
  );
}

/**
 * Vrednosti kako ih vidi pregledač. Izvor istine je OKLCH u `globals.css`;
 * alat za CSS ga pri izgradnji prevodi u heks, pa se ovde čita provera.
 */
function VrednostiTokena({ imena }: { imena: string[] }) {
  const [vrednosti, setVrednosti] = useState<Record<string, string>>({});
  const kljuc = imena.join(",");
  useEffect(() => {
    const stil = getComputedStyle(document.documentElement);
    const lista = kljuc.split(",");
    const procitano = Object.fromEntries(
      lista.map((ime) => [ime, stil.getPropertyValue(`--${ime}`).trim()]),
    );
    // Čitanje iz DOM-a mora da sačeka montiranje; jedan upis, bez petlje.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVrednosti(procitano);
  }, [kljuc]);

  return (
    <dl className="grid gap-x-6 gap-y-1 font-mono text-meta sm:grid-cols-2 xl:grid-cols-3">
      {imena.map((ime) => (
        <div key={ime} className="flex min-w-0 items-baseline gap-2">
          <dt className="shrink-0 text-text-muted">--{ime}</dt>
          <dd className="min-w-0 truncate text-foreground">{vrednosti[ime] || "…"}</dd>
        </div>
      ))}
    </dl>
  );
}

const VARIJANTE = [
  ["primary", "Pozovi"],
  ["secondary", "Zabeleži"],
  ["default", "Sačuvaj"],
  ["outline", "Filter"],
  ["ghost", "Više"],
  ["destructive", "Obriši"],
  ["link", "Detalj"],
] as const;

const STANJA = [
  ["mirno", {}],
  ["hover", { "data-force": "hover" }],
  ["fokus", { "data-force": "focus" }],
  ["onemogućeno", { disabled: true }],
  ["učitava", { loading: true }],
] as const;

function MrezaDugmadi({ modul }: { modul: ModuleKey }) {
  return (
    <div
      data-module={modul}
      className="overflow-x-auto rounded-lg border border-line-soft bg-card p-3"
    >
      <p className="mb-2 flex items-center gap-2 text-ui font-medium text-foreground">
        <span className="size-2 rounded-full bg-mod" aria-hidden />
        {MODUL_NAZIV(modul)}
      </p>
      {/* Redovi su varijante, kolone stanja: sedam širokih kolona ne staje u
          pola strane, pet staje. */}
      <table className="w-full border-separate border-spacing-x-1.5 border-spacing-y-1.5">
        <thead>
          <tr>
            <th />
            {STANJA.map(([stanje]) => (
              <th
                key={stanje}
                scope="col"
                className="pb-1 text-left text-meta font-normal whitespace-nowrap text-text-muted"
              >
                {stanje}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {VARIJANTE.map(([varijanta, natpis]) => (
            <tr key={varijanta}>
              <th
                scope="row"
                className="pr-2 text-left font-mono text-meta font-normal whitespace-nowrap text-text-muted"
              >
                {varijanta}
              </th>
              {STANJA.map(([stanje, props]) => (
                <td key={stanje}>
                  <Button variant={varijanta} size="sm" {...props}>
                    {natpis}
                  </Button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
