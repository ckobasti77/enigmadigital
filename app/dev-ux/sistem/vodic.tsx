"use client";

import { useEffect, useState } from "react";
import {
  MODULE_KEYS,
  moduleNavItem,
  type ModuleKey,
} from "@/components/app/nav-items";
import { ModuleTile } from "@/components/app/module-tile";
import { Button, type UlogaDugmeta } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Grupa, Sekcija } from "./delovi";
import { installForcedStates } from "./force-states";
import { VodicIzbor } from "./vodic-izbor";
import { VodicRecnik } from "./vodic-recnik";
import { VodicKomponente } from "./vodic-komponente";

/**
 * ============================================================================
 * ŽIVI VODIČ SISTEMA — `/sistem?ux=1` (UI Boost §5.12, samo dev)
 * ============================================================================
 *
 * Jedna strana na kojoj se vidi ceo sistem: tokeni, trinaest modula (mesto),
 * jedna boja radnje i šest uloga dugmeta, pločice, čipovi, prazna stanja i
 * primitivi napretka u akciji.
 * Snima se u svakoj fazi (`scripts/ux-snapshots.mjs`, ekran `sistem`), pa je
 * ovo i regresioni test izgleda.
 *
 * Stoji VAN ljuske aplikacije: birač modula ovde radi ono što u aplikaciji
 * radi ruta — postavlja `data-module` na sadržaj i na `<html>`. Promena modula
 * menja samo mesto (pločicu, ikonicu zaglavlja, auroru); dugmad, prekidači i
 * fokus ostaju u boji radnje (ULTRA P1).
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
          <p className="heading-caps text-meta font-medium text-text-muted">Dizajn sistem 2.0</p>
          <h1 className="mt-1 text-metric font-bold text-foreground">Živi vodič</h1>
          <p className="mt-1 max-w-2xl text-ui text-text-muted">
            Boja modula kaže gde si, a jedna boja radnje kaže šta da klikneš. Izaberi
            modul: menja se samo mesto, a dugmad i prekidači ostaju isti.
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
                    ? "border-radnja bg-radnja-soft text-foreground"
                    : "border-line text-text-muted hover:border-line-control hover:text-foreground",
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
        opis="Trinaest boja iste svetline i hrome, samo na tri mesta: aktivna stavka bočne trake (strong, tamna ikonica), ikonica zaglavlja (ink na soft) i aurora. Nikad na dugmetu, broju, natpisu ni grafikonu."
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
                  <p className="truncate font-mono text-meta text-text-muted">--mod-{kljuc}</p>
                </div>
                {Ikona && (
                  <span className="flex shrink-0 items-center gap-1.5 text-meta text-text-muted">
                    <ModuleTile icon={Ikona} active />
                    aktivna
                  </span>
                )}
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
                <span className="w-24 shrink-0 text-meta text-text-muted">
                  {ime}
                </span>
                <span
                  className={cn(
                    klasa,
                    "min-w-0 truncate text-foreground",
                    klasa === "text-hero" && "tabular-nums",
                  )}
                >
                  {primer}
                </span>
              </div>
            ))}
            <div className="flex flex-col gap-2 py-3">
              <p className="text-ui text-text-secondary">
                Mono samo za ID, kod i brojčane kolone tabele; reči, datumi i fokus brojevi su
                Aeonik. Ništa nije ispod 12 px.
              </p>
              <table className="w-full max-w-md text-ui">
                <thead>
                  <tr className="border-b border-line-soft text-left text-meta text-text-muted">
                    <th className="py-1.5 font-medium">ID kampanje</th>
                    <th className="py-1.5 font-medium">Naziv</th>
                    <th className="py-1.5 text-right font-medium">Klikovi</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  <tr className="border-b border-line-soft">
                    <td className="py-1.5 font-mono text-text-secondary">2384 1190</td>
                    <td className="py-1.5">Prolećna akcija</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">1.240</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-mono text-text-secondary">2384 1207</td>
                    <td className="py-1.5">Frizeri Beograd</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">86</td>
                  </tr>
                </tbody>
              </table>
            </div>
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
        naslov="Radnja i uloge dugmeta — 6 uloga × 5 stanja"
        opis="Jedna boja radnje u celoj aplikaciji, ista na svakom modulu. Primarno je jedno po pogledu; sporedno prati, obris je za alate i filtere, tiho dugme za radnje u redu, opasno uvek uz potvrdu. Podrazumevane uloge nema. Hover i fokus su isti stilovi koje pregledač crta, samo prisilno uključeni."
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <MrezaDugmadi />
          <div className="flex flex-col gap-6">
            <Grupa naslov="Boja radnje">
              {["radnja", "radnja-hover", "radnja-soft", "surface-control"].map((t) => (
                <Uzorak key={t} token={t} />
              ))}
            </Grupa>
            <Grupa naslov="Prekidač i polje za potvrdu">
              <div className="flex flex-wrap items-center gap-4">
                <Switch aria-label="Primer: isključeno" />
                <Switch aria-label="Primer: uključeno" defaultChecked />
                <Switch aria-label="Primer: onemogućeno" disabled defaultChecked />
                <Checkbox aria-label="Primer: nije čekirano" />
                <Checkbox aria-label="Primer: čekirano" defaultChecked />
              </div>
              <p className="text-meta text-text-muted">
                Uključeno je u boji radnje na svakom modulu. Na dodir su dugmad,
                jezičci, prekidači i polja visoki najmanje 44 px; na mišu ostaju iste
                veličine.
              </p>
            </Grupa>
          </div>
        </div>
        <Grupa naslov="Jedan pogled, jedno primarno">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-5 py-4">
            <div className="min-w-0">
              <p className="text-copy font-bold text-foreground">Salon Lepota</p>
              <p className="text-ui text-text-muted">Sledeći korak: poziv danas u 14:00</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm">
                Preskoči
              </Button>
              <Button variant="outline" size="sm">
                Zakaži
              </Button>
              <Button variant="secondary" size="sm">
                Zabeleži ishod
              </Button>
              <Button variant="primary" size="sm">
                Pozovi
              </Button>
            </div>
          </div>
        </Grupa>
      </Sekcija>

      <VodicIzbor />
      <VodicRecnik />

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
          className="shrink-0 text-meta font-medium"
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

const ULOGE: ReadonlyArray<readonly [UlogaDugmeta, string]> = [
  ["primary", "Pozovi"],
  ["secondary", "Zabeleži"],
  ["outline", "Filter"],
  ["ghost", "Više"],
  ["destructive", "Obriši"],
  ["link", "Detalj"],
];

const STANJA = [
  ["mirno", {}],
  ["hover", { "data-force": "hover" }],
  ["fokus", { "data-force": "focus" }],
  ["onemogućeno", { disabled: true }],
  ["učitava", { loading: true }],
] as const;

/** Šest uloga × pet stanja — jednom, jer uloga ne zavisi od modula. */
function MrezaDugmadi() {
  return (
    <div className="overflow-x-auto rounded-lg border border-line-soft bg-card p-3">
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
          {ULOGE.map(([uloga, natpis]) => (
            <tr key={uloga}>
              <th
                scope="row"
                className="pr-2 text-left font-mono text-meta font-normal whitespace-nowrap text-text-muted"
              >
                {uloga}
              </th>
              {STANJA.map(([stanje, props]) => (
                <td key={stanje}>
                  <Button variant={uloga} size="sm" {...props}>
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
