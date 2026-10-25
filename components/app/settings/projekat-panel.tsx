"use client";

import { useId, useState, type FormEvent } from "react";
import { Globe, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { FeedbackLine } from "@/components/app/feedback";
import { Field, FormGroup, FormStack } from "@/components/app/form-kit";
import { moduleNavItem, type ModuleKey } from "@/components/app/nav-items";
import { ModuleTile } from "@/components/app/module-tile";
import { ProjekatZnak } from "@/components/app/projekat-znak";
import {
  useProjekat,
  useProjekatMutation,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MODULI_PROJEKTA } from "@/convex/lib/moduli";
import {
  KRATKO_IME_MAX,
  MAKS_DOMENA,
  MAKS_SAJTOVA,
  proveriBoju,
  proveriDomen,
  proveriIme,
  proveriKratkoIme,
  proveriSajt,
} from "@/convex/lib/podesavanjaPravila";
import { stilProjekta } from "@/lib/boja-projekta";
import { cn } from "@/lib/utils";
import { IzborBoje } from "./izbor-boje";
import { SlikaBrenda } from "./slika-brenda";

/**
 * ============================================================================
 * PODEŠAVANJA → PROJEKAT (PROJEKTI-PLAN §8, plan C10 §1)
 * ============================================================================
 *
 *   Identitet   ime, kratko ime, boja, logo, ikonica, vrsta  → „Sačuvaj izmene“
 *   Domeni      panel domeni (samo vlasnik platforme)        → odmah
 *   Sajtovi     praćeni domeni sajta                          → odmah
 *   Moduli      šta projekat prikazuje                        → odmah
 *
 * Menja samo vlasnik projekta; urednik i posmatrač vide iste podatke kao
 * tekst. Vrstu menja samo vlasnik platforme (D7). Jedino primarno dugme na
 * ekranu je „Sačuvaj izmene“: sve ostalo se čuva samo, jednom radnjom.
 * ============================================================================
 */

function porukaGreske(e: unknown, podrazumevana: string): string {
  const data = (e as { data?: { message?: unknown } } | null)?.data;
  return typeof data?.message === "string" ? data.message : podrazumevana;
}

type Status = { tip: "greska" | "uspeh"; tekst: string } | null;

function StatusRed({ status }: { status: Status }) {
  if (status === null) return null;
  return (
    <FeedbackLine tone={status.tip === "greska" ? "danger" : "success"}>
      {status.tekst}
    </FeedbackLine>
  );
}

export function ProjekatPanel() {
  const p = useProjekat();
  if (!p.spreman) {
    return (
      <div className="space-y-7 pt-6" aria-hidden>
        <Skeleton className="h-72 w-full max-w-xl rounded-xl" />
        <Skeleton className="h-24 w-full max-w-xl rounded-xl" />
      </div>
    );
  }
  const vlasnik = p.uloga === "owner";
  return (
    <FormStack className="pt-6">
      <Identitet
        // Ključ vraća polja na sačuvane vrednosti čim server potvrdi izmenu.
        key={`${p.ime}|${p.kratkoIme}|${p.brend.boja}|${p.vrsta}`}
        vlasnik={vlasnik}
      />
      {vlasnik && p.platformaVlasnik && <Domeni />}
      <Sajtovi vlasnik={vlasnik} />
      <Moduli vlasnik={vlasnik} />
    </FormStack>
  );
}

// ── Identitet ──────────────────────────────────────────────────────────────

function Identitet({ vlasnik }: { vlasnik: boolean }) {
  const p = useProjekat();
  const azuriraj = useProjekatMutation(api.projekti.azurirajProjekat);
  const [ime, setIme] = useState(p.ime ?? "");
  const [kratko, setKratko] = useState(p.kratkoIme ?? "");
  const [boja, setBoja] = useState(p.brend.boja ?? "");
  const [vrsta, setVrsta] = useState(p.vrsta ?? "interni");
  const [cuvam, setCuvam] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const bojaId = useId();
  const bojaGreskaId = useId();
  const vrstaIme = useId();

  const pIme = proveriIme(ime);
  const pKratko = proveriKratkoIme(kratko);
  const pBoja = proveriBoju(boja);
  // Greška boje se pokaže tek kad je unos dovoljno dug da bude ceo.
  const bojaGreska = !pBoja.ok && boja.trim().length >= 7 ? pBoja.poruka : null;
  const ispravno = pIme.ok && pKratko.ok && pBoja.ok;
  const menjaVrstu = p.platformaVlasnik;
  const izmenjeno =
    (pIme.ok ? pIme.vrednost : ime) !== (p.ime ?? "") ||
    (pKratko.ok ? pKratko.vrednost : kratko) !== p.kratkoIme ||
    (pBoja.ok ? pBoja.vrednost : boja) !== p.brend.boja ||
    (menjaVrstu && vrsta !== p.vrsta);

  const sacuvaj = async (e: FormEvent) => {
    e.preventDefault();
    if (!ispravno || !izmenjeno || cuvam) return;
    setCuvam(true);
    setStatus(null);
    try {
      await azuriraj({
        ime: pIme.vrednost,
        kratkoIme: pKratko.vrednost,
        boja: pBoja.vrednost,
        ...(menjaVrstu && vrsta !== p.vrsta ? { vrsta } : {}),
      });
      setStatus({ tip: "uspeh", tekst: "Sačuvano." });
    } catch (err) {
      setStatus({ tip: "greska", tekst: porukaGreske(err, "Izmene nisu sačuvane.") });
    } finally {
      setCuvam(false);
    }
  };

  const pregledIme = pIme.ok ? pIme.vrednost : (p.ime ?? "");
  const pregledBoja = pBoja.ok ? pBoja.vrednost : p.brend.boja;
  const duzinaKratkog = kratko.trim().length;

  return (
    // Dve kolone na širem ekranu: polja koja se čuvaju dugmetom levo, znak
    // projekta (pregled, logo, ikonica — čuvaju se odmah) desno. Tako forma i
    // njeno dugme staju iznad pregiba na 1536 × 695.
    <div className="grid gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,34rem)_17rem]">
      <FormGroup title="Identitet">
        {vlasnik ? (
          <form onSubmit={(e) => void sacuvaj(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <Field
                label="Ime projekta"
                error={pIme.ok ? null : pIme.poruka}
                hint={
                  <>
                    Adresa <span className="font-mono">/{p.slug}</span> se ne menja.
                  </>
                }
                required
              >
                {(field) => (
                  <Input
                    {...field}
                    value={ime}
                    onChange={(e) => setIme(e.target.value)}
                    maxLength={80}
                    className="h-9"
                  />
                )}
              </Field>
              <Field
                label="Kratko ime"
                error={pKratko.ok ? null : pKratko.poruka}
                action={
                  <span
                    className={cn(
                      "font-mono text-micro tabular-nums",
                      duzinaKratkog > KRATKO_IME_MAX ? "text-danger" : "text-text-muted",
                    )}
                  >
                    {duzinaKratkog}/{KRATKO_IME_MAX}
                  </span>
                }
              >
                {(field) => (
                  <Input
                    {...field}
                    value={kratko}
                    onChange={(e) => setKratko(e.target.value)}
                    placeholder="—"
                    className="h-9"
                  />
                )}
              </Field>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={bojaId} className="text-xs font-medium text-text-muted">
                Boja
              </label>
              <IzborBoje
                id={bojaId}
                vrednost={boja}
                onChange={(v) => setBoja(v)}
                invalid={bojaGreska !== null}
                describedBy={bojaGreska ? bojaGreskaId : undefined}
              />
              {bojaGreska && (
                <p id={bojaGreskaId} className="text-xs text-danger">
                  {bojaGreska}
                </p>
              )}
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-text-muted">Vrsta</legend>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {(["interni", "klijent"] as const).map((v) => (
                  <label
                    key={v}
                    className={cn(
                      "touch-target flex items-center gap-2 text-ui text-foreground",
                      menjaVrstu ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name={vrstaIme}
                      value={v}
                      checked={vrsta === v}
                      disabled={!menjaVrstu}
                      onChange={() => setVrsta(v)}
                      className="size-4 accent-[var(--mod-strong)]"
                    />
                    {v === "interni" ? "Interni" : "Klijent"}
                  </label>
                ))}
                {!menjaVrstu && (
                  <span className="text-meta text-text-muted">
                    Vrstu menja samo vlasnik platforme.
                  </span>
                )}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="submit"
                variant="primary"
                disabled={!ispravno || !izmenjeno || cuvam}
                aria-busy={cuvam}
                className="touch-target"
              >
                {cuvam && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
                Sačuvaj izmene
              </Button>
              <StatusRed status={status} />
            </div>
          </form>
        ) : (
          <SamoCitanje />
        )}
      </FormGroup>

      <FormGroup title="Znak projekta">
        <div className="hidden overflow-hidden rounded-xl border border-line bg-card lg:block">
          <div
            aria-hidden
            data-projekat=""
            style={stilProjekta(pregledBoja)}
            className="h-0.5 bg-projekat"
          />
          <div className="flex items-center gap-2.5 p-4">
            <ProjekatZnak
              projekat={{ ime: pregledIme, boja: pregledBoja, logoUrl: p.brend.logoUrl }}
              velicina="md"
            />
            <span className="min-w-0 truncate text-copy font-medium text-foreground">
              {pregledIme}
            </span>
          </div>
          <p className="border-t border-line-soft px-4 py-3 text-meta text-text-muted">
            Ovako stoji u biraču, na traci vrha i na prijavi panel domena.
          </p>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-text-muted">Logo</span>
          <SlikaBrenda vrsta="logo" url={p.brend.logoUrl} uredjuje={vlasnik} />
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-text-muted">Ikonica (favicon)</span>
          <SlikaBrenda vrsta="favicon" url={p.brend.faviconUrl} uredjuje={vlasnik} />
        </div>
      </FormGroup>
    </div>
  );
}

/** Identitet za urednika i posmatrača: isti podaci, bez polja za unos. */
function SamoCitanje() {
  const p = useProjekat();
  const redovi: Array<[string, React.ReactNode]> = [
    ["Ime projekta", p.ime ?? "—"],
    ["Kratko ime", p.kratkoIme ?? "—"],
    ["Adresa", <span key="a" className="font-mono">{p.slug}</span>],
    [
      "Boja",
      p.brend.boja ? (
        <span key="b" className="flex items-center gap-2">
          <span
            aria-hidden
            data-projekat=""
            style={stilProjekta(p.brend.boja)}
            className="size-4 rounded bg-projekat ring-1 ring-line"
          />
          <span className="font-mono tabular-nums">{p.brend.boja}</span>
        </span>
      ) : (
        "Podrazumevana"
      ),
    ],
    ["Vrsta", p.vrsta === "klijent" ? "Klijent" : "Interni"],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-ui">
        {redovi.map(([naziv, vrednost]) => (
          <div key={naziv} className="contents">
            <dt className="text-text-muted">{naziv}</dt>
            <dd className="min-w-0 text-foreground">{vrednost}</dd>
          </div>
        ))}
      </dl>
      <p className="text-meta text-text-muted">Podešavanja projekta menja vlasnik projekta.</p>
    </div>
  );
}

// ── Domeni panela ──────────────────────────────────────────────────────────

function Domeni() {
  const podaci = useProjekatQuery(api.podesavanjaStore.procitaj);
  const dodaj = useProjekatMutation(api.podesavanjaStore.dodajDomen);
  const ukloni = useProjekatMutation(api.podesavanjaStore.ukloniDomen);
  const [unos, setUnos] = useState("");
  const [radim, setRadim] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const provera = unos.trim().length > 0 ? proveriDomen(unos) : null;
  const domeni = podaci?.domeni;
  const pun = domeni !== undefined && domeni.length >= MAKS_DOMENA;

  const posalji = async (e: FormEvent) => {
    e.preventDefault();
    if (provera === null || !provera.ok || radim !== null || pun) return;
    setRadim("dodaj");
    setStatus(null);
    try {
      await dodaj({ host: provera.vrednost });
      setUnos("");
      setStatus({ tip: "uspeh", tekst: "Domen je dodat. Panel će raditi na njemu najkasnije za minut." });
    } catch (err) {
      setStatus({ tip: "greska", tekst: porukaGreske(err, "Domen nije dodat.") });
    } finally {
      setRadim(null);
    }
  };

  const obrisi = async (domenId: Id<"projekatDomeni">) => {
    setRadim(domenId);
    setStatus(null);
    try {
      await ukloni({ domenId });
    } catch (err) {
      setStatus({ tip: "greska", tekst: porukaGreske(err, "Domen nije uklonjen.") });
    } finally {
      setRadim(null);
    }
  };

  return (
    <FormGroup
      title="Domeni panela"
      description="Na ovim domenima se otvara samo ovaj projekat, bez birača. Domen dodaj i u Vercel projektu i usmeri ga CNAME zapisom."
      className="max-w-xl"
    >
      {domeni === undefined ? (
        <Skeleton className="h-10 w-full rounded-lg" />
      ) : domeni.length === 0 ? (
        <p className="text-ui text-text-muted">Nema domena: projekat se otvara samo sa ekrana „Svi projekti“.</p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-lg border border-line">
          {domeni.map((d) => (
            <li key={d.domenId} className="group flex min-h-11 items-center gap-2.5 px-3 py-1.5">
              <Globe className="size-4 shrink-0 text-text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-ui text-foreground">
                {d.host}
              </span>
              {d.primarni && (
                <span className="rounded-full border border-line px-2 py-0.5 text-meta text-text-secondary">
                  primarni
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ukloni domen ${d.host}`}
                disabled={radim !== null}
                onClick={() => void obrisi(d.domenId)}
                className="touch-target text-text-muted opacity-100 hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              >
                {radim === d.domenId ? (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
                ) : (
                  <Trash2 aria-hidden />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void posalji(e)} className="flex flex-wrap items-start gap-2">
        <Field
          label="Nov domen"
          error={provera !== null && !provera.ok ? provera.poruka : null}
          className="min-w-0 flex-1"
        >
          {(field) => (
            <Input
              {...field}
              value={unos}
              onChange={(e) => setUnos(e.target.value)}
              placeholder="panel.primer.rs"
              spellCheck={false}
              autoComplete="off"
              disabled={pun}
              className="h-9 font-mono"
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="secondary"
          className="touch-target mt-[1.375rem] h-9"
          disabled={provera === null || !provera.ok || radim !== null || pun}
          aria-busy={radim === "dodaj"}
        >
          <Plus aria-hidden />
          Dodaj
        </Button>
      </form>
      {pun && (
        <p className="text-meta text-text-muted">
          Projekat može imati najviše {MAKS_DOMENA} domena.
        </p>
      )}
      <StatusRed status={status} />
    </FormGroup>
  );
}

// ── Sajtovi ────────────────────────────────────────────────────────────────

function Sajtovi({ vlasnik }: { vlasnik: boolean }) {
  const { sajtovi } = useProjekat();
  const sacuvaj = useProjekatMutation(api.podesavanjaStore.sacuvajSajtove);
  const [unos, setUnos] = useState("");
  const [radim, setRadim] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const provera = unos.trim().length > 0 ? proveriSajt(unos) : null;
  const vecPostoji = provera?.ok === true && sajtovi.includes(provera.vrednost);
  const pun = sajtovi.length >= MAKS_SAJTOVA;

  const upisi = async (novi: string[], poruka: string) => {
    setRadim(true);
    setStatus(null);
    try {
      await sacuvaj({ sajtovi: novi });
      return true;
    } catch (err) {
      setStatus({ tip: "greska", tekst: porukaGreske(err, poruka) });
      return false;
    } finally {
      setRadim(false);
    }
  };

  const posalji = async (e: FormEvent) => {
    e.preventDefault();
    if (provera === null || !provera.ok || vecPostoji || pun || radim) return;
    if (await upisi([...sajtovi, provera.vrednost], "Sajt nije dodat.")) setUnos("");
  };

  return (
    <FormGroup
      title="Sajtovi"
      description="Domeni sajta koje projekat prati: linkovi ka njima u objavama postaju praćeni kratki linkovi."
      className="max-w-xl"
    >
      {sajtovi.length === 0 ? (
        <p className="text-ui text-text-muted">Nijedan sajt nije upisan.</p>
      ) : (
        <ul aria-label="Praćeni sajtovi" className="flex flex-wrap gap-1.5">
          {sajtovi.map((s) => (
            <li
              key={s}
              className="flex h-8 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 font-mono text-ui text-foreground"
            >
              {s}
              {vlasnik ? (
                <button
                  type="button"
                  aria-label={`Ukloni sajt ${s}`}
                  disabled={radim}
                  onClick={() =>
                    void upisi(
                      sajtovi.filter((x) => x !== s),
                      "Sajt nije uklonjen.",
                    )
                  }
                  className="touch-target flex size-6 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : (
                <span className="w-2" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}
      {vlasnik && (
        <form onSubmit={(e) => void posalji(e)} className="flex flex-wrap items-start gap-2">
          <Field
            label="Nov sajt"
            error={
              provera !== null && !provera.ok
                ? provera.poruka
                : vecPostoji
                  ? "Ovaj sajt je već na spisku."
                  : null
            }
            className="min-w-0 flex-1"
          >
            {(field) => (
              <Input
                {...field}
                value={unos}
                onChange={(e) => setUnos(e.target.value)}
                placeholder="primer.rs"
                spellCheck={false}
                autoComplete="off"
                disabled={pun}
                className="h-9 font-mono"
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="secondary"
            className="touch-target mt-[1.375rem] h-9"
            disabled={provera === null || !provera.ok || vecPostoji || pun || radim}
            aria-busy={radim}
          >
            <Plus aria-hidden />
            Dodaj
          </Button>
        </form>
      )}
      {pun && vlasnik && (
        <p className="text-meta text-text-muted">Najviše {MAKS_SAJTOVA} sajtova.</p>
      )}
      <StatusRed status={status} />
    </FormGroup>
  );
}

// ── Moduli ─────────────────────────────────────────────────────────────────

function Moduli({ vlasnik }: { vlasnik: boolean }) {
  const { moduli } = useProjekat();
  const sacuvaj = useProjekatMutation(api.podesavanjaStore.sacuvajModule);
  const [radim, setRadim] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const ukljuceni = new Set<string>(moduli ?? MODULI_PROJEKTA);

  const upisi = async (kljuc: string, novi: string[] | null) => {
    setRadim(kljuc);
    setStatus(null);
    try {
      await sacuvaj({ moduli: novi });
    } catch (err) {
      setStatus({ tip: "greska", tekst: porukaGreske(err, "Izmena nije sačuvana.") });
    } finally {
      setRadim(null);
    }
  };

  const prebaci = (kljuc: string, ukljuci: boolean) => {
    const novi = MODULI_PROJEKTA.filter((m) =>
      m === kljuc ? ukljuci : ukljuceni.has(m),
    );
    void upisi(kljuc, novi);
  };

  return (
    <FormGroup
      title="Moduli"
      description="Isključen modul nestaje iz navigacije ovog projekta; podaci ostaju."
      control={
        vlasnik && moduli !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="touch-target"
            disabled={radim !== null}
            onClick={() => void upisi("sve", null)}
          >
            Uključi sve
          </Button>
        ) : undefined
      }
      className="max-w-xl"
    >
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {MODULI_PROJEKTA.map((kljuc) => {
          const stavka = moduleNavItem(kljuc as ModuleKey);
          if (!stavka) return null;
          const ukljucen = ukljuceni.has(kljuc);
          return (
            <ModulRed
              key={kljuc}
              kljuc={kljuc as ModuleKey}
              naziv={stavka.label}
              ikonica={stavka.icon}
              ukljucen={ukljucen}
              uredjuje={vlasnik}
              radim={radim !== null}
              onPromena={(v) => prebaci(kljuc, v)}
            />
          );
        })}
      </ul>
      <StatusRed status={status} />
    </FormGroup>
  );
}

function ModulRed({
  kljuc,
  naziv,
  ikonica,
  ukljucen,
  uredjuje,
  radim,
  onPromena,
}: {
  kljuc: ModuleKey;
  naziv: string;
  ikonica: NonNullable<ReturnType<typeof moduleNavItem>>["icon"];
  ukljucen: boolean;
  uredjuje: boolean;
  radim: boolean;
  onPromena: (ukljucen: boolean) => void;
}) {
  const id = useId();
  return (
    <li
      data-module={kljuc}
      className="flex min-h-11 items-center gap-3 border-b border-line-soft py-1.5"
    >
      <ModuleTile icon={ikonica} />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-ui text-foreground">
        {naziv}
      </label>
      <span aria-hidden className="text-meta text-text-muted">
        {ukljucen ? "Uključen" : "Isključen"}
      </span>
      <Switch
        id={id}
        checked={ukljucen}
        disabled={!uredjuje || radim}
        onCheckedChange={(v) => onPromena(v)}
      />
    </li>
  );
}
