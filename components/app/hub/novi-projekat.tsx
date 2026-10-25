"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleDashed,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { proveriBoju, proveriIme } from "@/convex/lib/podesavanjaPravila";
import { SABLONI_LEADOVA } from "@/convex/lib/sabloniLeadova";
import { predloziSlug } from "@/lib/slug-predlog";
import { cn } from "@/lib/utils";
import { FeedbackLine } from "../feedback";
import { Field } from "../form-kit";
import { ModuleTile } from "../module-tile";
import { moduleNavItem, type ModuleKey } from "../nav-items";
import {
  ProjekatProvider,
  useModulUkljucen,
  useProjekat,
  useProjekatMutation,
  useProjekatQuery,
} from "../projekat-provider";
import { ProjekatZnak } from "../projekat-znak";
import { IzborBoje } from "../settings/izbor-boje";
import { SlikaBrenda } from "../settings/slika-brenda";
import { EmptyState } from "../system/empty-state";
import { UserMenu } from "../user-menu";

/**
 * ============================================================================
 * ČAROBNJAK „NOVI PROJEKAT“ (PROJEKTI-PLAN §6, plan C10 §3)
 * ============================================================================
 *
 *   1 Osnovno   ime, adresa (P8), vrsta  → projekat nastaje odmah
 *   2 Izgled    boja i logo (može da se preskoči)
 *  (3 Leadovi   šablon — tek kad postoji više od „Prazno“, C14)
 *   3 Kanali    šta je povezano; povezuje se u podešavanjima projekta
 *
 * Projekat nastaje posle prvog koraka: logo traži projekat, a prekinut
 * čarobnjak ne gubi ništa (projekat je odmah u biraču i na hubu). Koraci
 * posle prvog rade unutar `ProjekatProvider`-a novog projekta, istim
 * hookovima kao ostatak aplikacije. Hub je van projekta, pa veze vode
 * eksplicitno na `/<slug>` (`next/link`).
 * ============================================================================
 */

type Korak = "osnovno" | "izgled" | "leadovi" | "kanali";

const KORACI: readonly Korak[] = [
  "osnovno",
  "izgled",
  // Korak bez izbora nije korak: „Prazno“ je jedini šablon dok C14 ne doda ostale.
  ...(SABLONI_LEADOVA.length > 1 ? (["leadovi"] as const) : []),
  "kanali",
];

/** Ista širina i iste ivice kao gornja traka huba. */
const ROW = "mx-auto w-full max-w-[var(--content-max)] px-[var(--gutter)]";

function porukaGreske(e: unknown, podrazumevana: string): string {
  const data = (e as { data?: { message?: unknown } } | null)?.data;
  return typeof data?.message === "string" ? data.message : podrazumevana;
}

export function NoviProjekat() {
  const ja = useQuery(api.projekti.ja);
  const [korak, setKorak] = useState<Korak>("osnovno");
  const [slug, setSlug] = useState<string | null>(null);
  const redni = KORACI.indexOf(korak) + 1;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="material edge-fade-b sticky top-0 z-30 shrink-0">
        <div
          className={cn(
            ROW,
            "flex h-[var(--chrome-height)] items-center gap-3",
          )}
        >
          <Link
            href="/"
            className="touch-target -ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-ui text-text-muted transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Svi projekti
          </Link>
          <span className="flex-1" />
          <UserMenu />
        </div>
      </header>

      <main
        id="sadrzaj"
        tabIndex={-1}
        className={cn(ROW, "flex flex-1 flex-col py-8 outline-none")}
      >
        {ja === undefined ? (
          <Skeleton className="h-80 w-full max-w-xl rounded-xl" />
        ) : !ja.platformaVlasnik ? (
          <EmptyState
            icon={TriangleAlert}
            size="lg"
            title="Nove projekte pravi vlasnik platforme."
            action={
              <Button
                variant="secondary"
                nativeButton={false}
                render={<Link href="/" />}
              >
                Svi projekti
              </Button>
            }
          />
        ) : (
          <div className="w-full max-w-xl">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-title font-bold text-foreground">
                Novi projekat
              </h1>
              <Koraci redni={redni} ukupno={KORACI.length} />
            </div>
            <div className="mt-6 rounded-xl border border-line bg-card p-5 shadow-elev-1 sm:p-6">
              {korak === "osnovno" || slug === null ? (
                <Osnovno
                  onNapravljen={(s) => {
                    setSlug(s);
                    setKorak("izgled");
                  }}
                />
              ) : (
                <ProjekatProvider slug={slug} rezim="hub">
                  {korak === "izgled" ? (
                    <Izgled
                      onDalje={() =>
                        setKorak(KORACI[KORACI.indexOf("izgled") + 1])
                      }
                    />
                  ) : (
                    <Kanali slug={slug} />
                  )}
                </ProjekatProvider>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Koraci({ redni, ukupno }: { redni: number; ukupno: number }) {
  return (
    <p className="flex items-center gap-2.5 text-meta text-text-muted">
      <span className="tabular-nums">
        Korak {redni} od {ukupno}
      </span>
      <span aria-hidden className="hidden items-center gap-1 sm:flex">
        {Array.from({ length: ukupno }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-6 rounded-full",
              i < redni ? "bg-mod-strong" : "bg-surface-raised",
            )}
          />
        ))}
      </span>
    </p>
  );
}

// ── 1. Osnovno ─────────────────────────────────────────────────────────────

function Osnovno({ onNapravljen }: { onNapravljen: (slug: string) => void }) {
  const kreiraj = useMutation(api.projekti.kreirajProjekat);
  const [ime, setIme] = useState("");
  const [slug, setSlug] = useState("");
  const [rucno, setRucno] = useState(false);
  const [vrsta, setVrsta] = useState<"interni" | "klijent">("interni");
  const [proveravam, setProveravam] = useState("");
  const [radim, setRadim] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const vrstaIme = useId();

  const adresa = rucno ? slug : predloziSlug(ime);
  // Provera zauzetosti kreće 300 ms posle poslednjeg slova, ne na svako.
  useEffect(() => {
    const t = setTimeout(() => setProveravam(adresa), 300);
    return () => clearTimeout(t);
  }, [adresa]);
  const provera = useQuery(
    api.projekti.proveriSlug,
    proveravam.length > 0 ? { slug: proveravam } : "skip",
  );
  const azurno = proveravam === adresa;
  const pIme = proveriIme(ime);
  const imeGreska = ime.trim().length > 0 && !pIme.ok ? pIme.poruka : null;
  const adresaOk = azurno && provera?.ok === true;
  const adresaGreska =
    azurno && provera !== undefined && !provera.ok ? provera.poruka : null;
  const spremno = pIme.ok && adresaOk && !radim;

  const posalji = async (e: FormEvent) => {
    e.preventDefault();
    if (!spremno) return;
    setRadim(true);
    setGreska(null);
    try {
      const r = await kreiraj({
        ime: pIme.ok ? pIme.vrednost : ime,
        slug: adresa,
        vrsta,
      });
      onNapravljen(r.slug);
    } catch (err) {
      setGreska(porukaGreske(err, "Projekat nije napravljen. Pokušaj ponovo."));
      setRadim(false);
    }
  };

  return (
    <form onSubmit={(e) => void posalji(e)} className="space-y-5">
      <Field label="Ime projekta" error={imeGreska} required>
        {(field) => (
          <Input
            {...field}
            value={ime}
            onChange={(e) => setIme(e.target.value)}
            placeholder="Ime firme ili brenda"
            autoFocus
            maxLength={80}
            className="h-10"
          />
        )}
      </Field>
      <Field
        label="Adresa"
        error={adresaGreska}
        hint={
          adresaOk ? (
            <span className="inline-flex items-center gap-1 text-success">
              <Check className="size-3.5" aria-hidden />
              Slobodna: projekat će biti na /{adresa}
            </span>
          ) : (
            "Mala slova, cifre i crtice. Posle se ne menja."
          )
        }
      >
        {(field) => (
          <div className="flex items-center rounded-lg border border-input bg-input/30 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <span
              className="select-none pl-2.5 font-mono text-ui text-text-muted"
              aria-hidden
            >
              /
            </span>
            <input
              {...field}
              value={adresa}
              onChange={(e) => {
                setRucno(true);
                setSlug(e.target.value.toLowerCase());
              }}
              spellCheck={false}
              autoComplete="off"
              maxLength={40}
              className="h-10 min-w-0 flex-1 bg-transparent px-1 font-mono text-ui text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="nastaje iz imena"
            />
            {adresa.length > 0 && !azurno && (
              <LoaderCircle
                className="mr-2.5 size-4 text-text-muted motion-safe:animate-spin"
                aria-hidden
              />
            )}
          </div>
        )}
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-text-muted">Vrsta</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              [
                "interni",
                "Interni",
                "Tvoj projekat; vidi se u svemu što radiš.",
              ],
              [
                "klijent",
                "Klijent",
                "Projekat za klijenta; podaci se ne mešaju sa tvojim.",
              ],
            ] as const
          ).map(([v, naziv, opis]) => (
            <label
              key={v}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
                vrsta === v
                  ? "border-mod-line bg-mod-soft"
                  : "border-line hover:border-line-control",
              )}
            >
              <input
                type="radio"
                name={vrstaIme}
                value={v}
                checked={vrsta === v}
                onChange={() => setVrsta(v)}
                className="mt-0.5 size-4 accent-[var(--mod-strong)]"
              />
              <span className="min-w-0">
                <span className="block text-ui font-medium text-foreground">
                  {naziv}
                </span>
                <span className="mt-0.5 block text-meta text-text-muted">
                  {opis}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          type="submit"
          variant="primary"
          disabled={!spremno}
          aria-busy={radim}
          className="h-10 px-4"
        >
          {radim ? (
            <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
          ) : null}
          Napravi projekat
          {!radim && <ArrowRight aria-hidden />}
        </Button>
        {greska && <FeedbackLine tone="danger">{greska}</FeedbackLine>}
      </div>
    </form>
  );
}

// ── 2. Izgled ──────────────────────────────────────────────────────────────

function Izgled({ onDalje }: { onDalje: () => void }) {
  const { spreman, brend } = useProjekat();
  if (!spreman) return <Skeleton className="h-64 w-full rounded-lg" />;
  return <IzgledForma pocetnaBoja={brend.boja ?? ""} onDalje={onDalje} />;
}

function IzgledForma({
  pocetnaBoja,
  onDalje,
}: {
  pocetnaBoja: string;
  onDalje: () => void;
}) {
  const p = useProjekat();
  const azuriraj = useProjekatMutation(api.projekti.azurirajProjekat);
  const [boja, setBoja] = useState(pocetnaBoja);
  const [radim, setRadim] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const bojaId = useId();
  const pBoja = proveriBoju(boja);

  const dalje = async () => {
    if (!pBoja.ok) return;
    if (pBoja.vrednost === null || pBoja.vrednost === p.brend.boja) {
      onDalje();
      return;
    }
    setRadim(true);
    setGreska(null);
    try {
      await azuriraj({ boja: pBoja.vrednost });
      onDalje();
    } catch (err) {
      setGreska(porukaGreske(err, "Boja nije sačuvana."));
      setRadim(false);
    }
  };

  const pregledBoja =
    pBoja.ok && pBoja.vrednost !== null ? pBoja.vrednost : p.brend.boja;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <ProjekatZnak
          projekat={{
            ime: p.ime ?? "",
            boja: pregledBoja,
            logoUrl: p.brend.logoUrl,
          }}
          velicina="md"
        />
        <div className="min-w-0">
          <p className="truncate text-copy font-medium text-foreground">
            {p.ime}
          </p>
          <p className="text-meta text-text-muted">
            Projekat je napravljen. Izgled može i kasnije.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={bojaId} className="text-xs font-medium text-text-muted">
          Boja
        </label>
        <IzborBoje
          id={bojaId}
          vrednost={boja}
          onChange={setBoja}
          invalid={!pBoja.ok && boja.length >= 7}
        />
        {!pBoja.ok && boja.length >= 7 && (
          <p className="text-xs text-danger">{pBoja.poruka}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-text-muted">Logo</span>
        <SlikaBrenda
          vrsta="logo"
          url={p.brend.logoUrl}
          uredjuje={p.uloga === "owner"}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          variant="primary"
          disabled={!pBoja.ok || radim}
          aria-busy={radim}
          onClick={() => void dalje()}
          className="h-10 px-4"
        >
          Dalje
          <ArrowRight aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onDalje}
          disabled={radim}
          className="h-10"
        >
          Preskoči
        </Button>
        {greska && <FeedbackLine tone="danger">{greska}</FeedbackLine>}
      </div>
    </div>
  );
}

// ── 3. Kanali ──────────────────────────────────────────────────────────────

const KANALI: ReadonlyArray<{
  provider: string;
  naziv: string;
  modul: ModuleKey;
}> = [
  { provider: "meta_ig", naziv: "Instagram", modul: "instagram" },
  { provider: "meta_fb", naziv: "Facebook stranica", modul: "facebook" },
  { provider: "threads", naziv: "Threads", modul: "threads" },
  { provider: "youtube", naziv: "YouTube kanal", modul: "youtube" },
  { provider: "ga4", naziv: "Google Analytics", modul: "analitika" },
  { provider: "meta_ads", naziv: "Meta oglasi", modul: "oglasi" },
  { provider: "google_ads", naziv: "Google oglasi", modul: "oglasi" },
  { provider: "openreply", naziv: "OpenReply", modul: "openreply" },
];

function Kanali({ slug }: { slug: string }) {
  const veze = useProjekatQuery(api.connections.list);
  const ukljucen = useModulUkljucen();
  const kanali = KANALI.filter((k) => ukljucen(k.modul));
  // Broje se samo kanali sa spiska (veza `leads` i slične nisu kanal).
  const povezano = kanali.filter((k) =>
    veze?.some((v) => v.provider === k.provider && v.status === "active"),
  ).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-copy font-medium text-foreground">
          Spremnost kanala
        </h2>
        <p className="mt-1 text-meta text-text-muted">
          Kanali se povezuju u podešavanjima projekta; svaki traži prijavu na
          svoj nalog.
        </p>
      </div>
      {veze === undefined ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : (
        <ul className="divide-y divide-line-soft rounded-lg border border-line">
          {kanali.map((k) => {
            const veza = veze.find((v) => v.provider === k.provider);
            const stanje =
              veza === undefined || veza.status === "disconnecting"
                ? "nije"
                : veza.status === "active"
                  ? "da"
                  : "paznja";
            const ikonica = moduleNavItem(k.modul)?.icon;
            return (
              <li
                key={k.provider}
                data-module={k.modul}
                className="flex min-h-11 items-center gap-3 px-3 py-1.5"
              >
                {ikonica && <ModuleTile icon={ikonica} />}
                <span className="min-w-0 flex-1 truncate text-ui text-foreground">
                  {k.naziv}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-meta",
                    stanje === "da"
                      ? "text-success"
                      : stanje === "paznja"
                        ? "text-warning"
                        : "text-text-muted",
                  )}
                >
                  {stanje === "da" ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : stanje === "paznja" ? (
                    <TriangleAlert className="size-3.5" aria-hidden />
                  ) : (
                    <CircleDashed className="size-3.5" aria-hidden />
                  )}
                  {stanje === "da"
                    ? "Povezano"
                    : stanje === "paznja"
                      ? "Treba pažnju"
                      : "Nije povezano"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-meta text-text-muted">
        <span className="font-mono tabular-nums">
          {veze === undefined ? "—" : `${povezano} od ${kanali.length}`}
        </span>{" "}
        povezano
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          nativeButton={false}
          render={<Link href={`/${slug}`} />}
          className="h-10 px-4"
        >
          Otvori projekat
          <ArrowRight aria-hidden />
        </Button>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={`/${slug}/settings?tab=integracije`} />}
          className="h-10"
        >
          Poveži kanale
        </Button>
      </div>
    </div>
  );
}
