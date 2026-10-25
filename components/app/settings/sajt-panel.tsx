"use client";

import { useState, type FormEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import { CircleDashed, KeyRound, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FeedbackLine } from "@/components/app/feedback";
import { Field, FormGroup, FormStack } from "@/components/app/form-kit";
import {
  useProjekat,
  useProjekatMutation,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { api } from "@/convex/_generated/api";
import {
  BUDZET_PODRAZUMEVANO,
  proveriAdresuNaSajtu,
  proveriBudzet,
  proveriKratkiLinkoviBaza,
  proveriPikselId,
  proveriPosiljalacIme,
  proveriTajnu,
  type KljucTajne,
  type Provera,
} from "@/convex/lib/podesavanjaPravila";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * PODEŠAVANJA → SAJT I OGLASI (PROJEKTI-PLAN §8, plan C10 §1, §4)
 * ============================================================================
 *
 *   Integracije sajta   piksel, kratki linkovi, osvežavanje novosti, Puls,
 *                       ime pošiljaoca                   → „Sačuvaj izmene“
 *                       tajne (CAPI token, tajna novosti, Puls token)
 *                                                        → upis/brisanje odmah
 *   Budžetske granice   valuta, minimum, maksimum, gornje granice nove
 *                       kampanje                         → „Sačuvaj granice“
 *
 * Vidi ga samo vlasnik projekta. Osnivački projekat bez svojih vrednosti
 * nasleđuje okruženje servera, i to piše uz polje; drugi projekat nikad ne
 * dobija tuđu vrednost. Tajna se nikad ne prikazuje: upit kaže samo da li
 * postoji, polje za unos je `password` i prazni se posle čuvanja.
 * ============================================================================
 */

type Podaci = FunctionReturnType<typeof api.podesavanjaStore.procitaj>;
type Izvor = "projekat" | "env" | "nije_podeseno";
type Status = { tip: "greska" | "uspeh"; tekst: string } | null;

const NASLEDJENO = "Nasleđeno iz okruženja servera.";

/** Oznaka uz natpis polja čija vrednost dolazi iz okruženja servera. */
function OznakaNasledjeno() {
  return (
    <span className="text-micro text-text-muted" title={NASLEDJENO}>
      iz okruženja servera
    </span>
  );
}

function porukaGreske(e: unknown, podrazumevana: string): string {
  const data = (e as { data?: { message?: unknown } } | null)?.data;
  return typeof data?.message === "string" ? data.message : podrazumevana;
}

function StatusRed({ status }: { status: Status }) {
  if (status === null) return null;
  return (
    <FeedbackLine tone={status.tip === "greska" ? "danger" : "success"}>
      {status.tekst}
    </FeedbackLine>
  );
}

/** Sopstvena vrednost projekta (ono što polje uređuje); nasleđena nije njegova. */
const svoja = <T,>(p: { vrednost: T | null; izvor: Izvor }): T | null =>
  p.izvor === "projekat" ? p.vrednost : null;

export function SajtPanel() {
  const { uloga } = useProjekat();
  const vlasnik = uloga === "owner";
  const podaci = useProjekatQuery(api.podesavanjaStore.procitaj, vlasnik ? {} : "skip");

  if (uloga !== null && !vlasnik) {
    return <p className="pt-6 text-ui text-text-muted">Sajt i oglase podešava vlasnik projekta.</p>;
  }
  if (podaci === undefined) {
    return (
      <div className="space-y-7 pt-6" aria-hidden>
        <Skeleton className="h-64 w-full max-w-4xl rounded-xl" />
        <Skeleton className="h-32 w-full max-w-4xl rounded-xl" />
      </div>
    );
  }
  return (
    <FormStack className="pt-6">
      <IntegracijeSajta
        // Ključ vraća polja na sačuvane vrednosti čim server potvrdi izmenu.
        key={JSON.stringify([podaci.podesavanja, podaci.domeni])}
        podaci={podaci}
      />
      <BudzetskeGranice key={JSON.stringify(podaci.podesavanja.budzet)} podaci={podaci} />
    </FormStack>
  );
}

// ── Integracije sajta ──────────────────────────────────────────────────────

const POLJA = [
  "pikselId",
  "kratkiLinkoviBaza",
  "novostiRevalidateUrl",
  "pulsUrl",
  "posiljalacIme",
] as const;
type Polje = (typeof POLJA)[number];

function IntegracijeSajta({ podaci }: { podaci: Podaci }) {
  const p = useProjekat();
  const sacuvaj = useProjekatMutation(api.podesavanjaStore.sacuvajIntegracijeSajta);
  const s = podaci.podesavanja;
  const domeni = podaci.domeni.map((d) => d.host);
  const sajtovi = s.sajtovi.vrednost ?? [];
  const [vrednosti, setVrednosti] = useState<Record<Polje, string>>(
    () =>
      Object.fromEntries(POLJA.map((polje) => [polje, svoja(s[polje]) ?? ""])) as Record<
        Polje,
        string
      >,
  );
  const [cuvam, setCuvam] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const pravila: Record<Polje, (u: string) => Provera<string | null>> = {
    pikselId: proveriPikselId,
    kratkiLinkoviBaza: (u) => proveriKratkiLinkoviBaza(u, domeni),
    novostiRevalidateUrl: (u) => proveriAdresuNaSajtu(u, sajtovi),
    pulsUrl: (u) => proveriAdresuNaSajtu(u, sajtovi),
    posiljalacIme: proveriPosiljalacIme,
  };
  const provere = Object.fromEntries(
    POLJA.map((polje) => [polje, pravila[polje](vrednosti[polje])]),
  ) as Record<Polje, Provera<string | null>>;
  const ispravno = POLJA.every((polje) => provere[polje].ok);
  const izmenjena = POLJA.filter((polje) => {
    const pr = provere[polje];
    return (pr.ok ? pr.vrednost : vrednosti[polje]) !== svoja(s[polje]);
  });

  const posalji = async (e: FormEvent) => {
    e.preventDefault();
    if (!ispravno || izmenjena.length === 0 || cuvam) return;
    setCuvam(true);
    setStatus(null);
    try {
      const izmena: Partial<Record<Polje, string | null>> = {};
      for (const polje of izmenjena) {
        const pr = provere[polje];
        if (pr.ok) izmena[polje] = pr.vrednost;
      }
      await sacuvaj(izmena);
      setStatus({ tip: "uspeh", tekst: "Sačuvano." });
    } catch (err) {
      setStatus({ tip: "greska", tekst: porukaGreske(err, "Izmene nisu sačuvane.") });
    } finally {
      setCuvam(false);
    }
  };

  /** Tekst ispod polja: greška pobeđuje, pa nasleđena vrednost, pa uputstvo. */
  /**
   * Uputstvo ispod polja samo kad traži radnju (npr. „prvo dodaj domen“), da
   * forma i njeno dugme stanu iznad pregiba; nasleđena vrednost se vidi kao
   * primer u polju i oznaka uz natpis.
   */
  const polje = (
    ime: Polje,
    label: string,
    uputstvo: string | null,
    primer: string,
    dodatno?: Partial<React.ComponentProps<typeof Input>>,
  ) => {
    const pr = provere[ime];
    const nasledjeno = s[ime].izvor === "env" && vrednosti[ime].trim().length === 0;
    return (
      <Field
        label={label}
        error={pr.ok ? null : pr.poruka}
        hint={uputstvo ?? undefined}
        action={nasledjeno ? <OznakaNasledjeno /> : undefined}
      >
        {(field) => (
          <Input
            {...field}
            {...dodatno}
            value={vrednosti[ime]}
            onChange={(e) => setVrednosti((v) => ({ ...v, [ime]: e.target.value }))}
            // Nasleđena vrednost stoji kao primer: vidi se šta važi, a polje
            // ostaje prazno dok projekat ne upiše svoju.
            placeholder={s[ime].izvor === "env" ? (s[ime].vrednost ?? primer) : primer}
            className="h-9"
          />
        )}
      </Field>
    );
  };

  return (
    <FormGroup
      title="Integracije sajta"
      description={
        podaci.jeOsnivacki
          ? "Prazno polje nasleđuje vrednost iz okruženja servera, dok projekat ne upiše svoju."
          : "Bez svoje vrednosti projekat ne šalje događaje ni ne osvežava sajt."
      }
    >
      <form onSubmit={(e) => void posalji(e)} className="max-w-4xl space-y-4">
        <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
          {polje(
            "pikselId",
            "Meta piksel ID",
            null,
            "Iz Meta Events Managera, npr. 1234567890123",
            {
              inputMode: "numeric",
              autoComplete: "off",
            },
          )}
          <TajnaPolje
            kljuc="meta_capi_token"
            label="CAPI token"
            stanje={podaci.tajne.meta_capi_token}
            jeOsnivacki={podaci.jeOsnivacki}
          />
          {polje(
            "kratkiLinkoviBaza",
            "Kratki linkovi",
            domeni.length === 0 ? "Prvo dodaj domen panela u jezičku Projekat." : null,
            domeni[0] ? `https://${domeni[0]}` : "https://panel.primer.rs",
            { inputMode: "url", autoComplete: "off", spellCheck: false },
          )}
          {polje("posiljalacIme", "Ime pošiljaoca", null, p.ime ?? "Ime projekta", {
            autoComplete: "off",
          })}
          {polje(
            "novostiRevalidateUrl",
            "Osvežavanje novosti",
            sajtovi.length === 0 ? "Prvo dodaj sajt u jezičku Projekat." : null,
            sajtovi[0]
              ? `https://${sajtovi[0]}/api/revalidate`
              : "https://primer.rs/api/revalidate",
            { inputMode: "url", autoComplete: "off", spellCheck: false },
          )}
          <TajnaPolje
            kljuc="novosti_revalidate_secret"
            label="Tajna osvežavanja"
            stanje={podaci.tajne.novosti_revalidate_secret}
            jeOsnivacki={podaci.jeOsnivacki}
          />
          {polje(
            "pulsUrl",
            "Puls (brojke poslovanja)",
            null,
            sajtovi[0] ? `https://${sajtovi[0]}/api/puls` : "https://primer.rs/api/puls",
            { inputMode: "url", autoComplete: "off", spellCheck: false },
          )}
          <TajnaPolje
            kljuc="puls_token"
            label="Token za Puls"
            stanje={podaci.tajne.puls_token}
            jeOsnivacki={podaci.jeOsnivacki}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            type="submit"
            variant="primary"
            disabled={!ispravno || izmenjena.length === 0 || cuvam}
            aria-busy={cuvam}
          >
            {cuvam && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
            Sačuvaj izmene
          </Button>
          <StatusRed status={status} />
        </div>
      </form>
    </FormGroup>
  );
}

// ── Tajna (samo upis i brisanje) ────────────────────────────────────────────

const DATUM = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "numeric" });

function TajnaPolje({
  kljuc,
  label,
  stanje,
  jeOsnivacki,
}: {
  kljuc: KljucTajne;
  label: string;
  stanje: Podaci["tajne"][KljucTajne];
  /** Osnivački projekat posle brisanja ponovo nasleđuje env (Puls token nema env). */
  jeOsnivacki: boolean;
}) {
  const postavi = useProjekatMutation(api.podesavanjaStore.postaviTajnu);
  const obrisi = useProjekatMutation(api.podesavanjaStore.obrisiTajnu);
  const [unos, setUnos] = useState<string | null>(null);
  const [radim, setRadim] = useState(false);
  const [potvrda, setPotvrda] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const provera = unos === null ? null : proveriTajnu(kljuc, unos);
  const greska = provera && !provera.ok && unos!.trim().length > 0 ? provera.poruka : null;

  const sacuvaj = async () => {
    if (provera === null || !provera.ok || radim) return;
    setRadim(true);
    setStatus(null);
    try {
      await postavi({ kljuc, vrednost: provera.vrednost });
      setUnos(null);
      setStatus({ tip: "uspeh", tekst: "Sačuvano." });
    } catch (err) {
      setStatus({ tip: "greska", tekst: porukaGreske(err, "Tajna nije sačuvana.") });
    } finally {
      setRadim(false);
    }
  };

  const ukloni = async () => {
    setRadim(true);
    setStatus(null);
    try {
      await obrisi({ kljuc });
      setPotvrda(false);
    } catch (err) {
      setStatus({ tip: "greska", tekst: porukaGreske(err, "Tajna nije obrisana.") });
    } finally {
      setRadim(false);
    }
  };

  return (
    <>
      <Field
        label={label}
        error={greska ?? (status?.tip === "greska" ? status.tekst : null)}
        hint={unos === null ? undefined : "Vrednost se čuva šifrovano i ne prikazuje se ponovo."}
      >
        {(field) =>
          unos === null ? (
            <div className="flex items-center gap-2">
              <div
                id={field.id}
                // Stanje tajne čitač ekrana pročita kao opis dugmeta pored.
                role="status"
                className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-soft px-3 text-ui"
              >
                {stanje.izvor === "projekat" ? (
                  <>
                    <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
                    <span className="truncate text-foreground">
                      Postavljeno
                      {stanje.updatedAt !== null && (
                        <span className="text-text-muted">
                          {" · "}
                          <span className="font-mono tabular-nums">
                            {DATUM.format(stanje.updatedAt)}
                          </span>
                        </span>
                      )}
                    </span>
                  </>
                ) : stanje.izvor === "env" ? (
                  <>
                    <KeyRound className="size-4 shrink-0 text-text-muted" aria-hidden />
                    <span className="truncate text-text-secondary">{NASLEDJENO}</span>
                  </>
                ) : (
                  <>
                    <CircleDashed className="size-4 shrink-0 text-text-muted" aria-hidden />
                    <span className="truncate text-text-muted">Nije podešeno</span>
                  </>
                )}
                {status?.tip === "uspeh" && (
                  <span className="ml-auto shrink-0 text-meta text-success">{status.tekst}</span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                aria-label={`${stanje.izvor === "projekat" ? "Zameni" : "Postavi"}: ${label}`}
                aria-describedby={field.id}
                onClick={() => {
                  setStatus(null);
                  setUnos("");
                }}
              >
                {stanje.izvor === "projekat" ? "Zameni" : "Postavi"}
              </Button>
              {stanje.izvor === "projekat" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Obriši: ${label}`}
                  disabled={radim}
                  onClick={() => setPotvrda(true)}
                  className="text-text-muted hover:text-foreground"
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                {...field}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                autoFocus
                value={unos}
                onChange={(e) => setUnos(e.target.value)}
                onKeyDown={(e) => {
                  // Enter čuva tajnu, ne celu formu integracija oko nje.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void sacuvaj();
                  }
                  if (e.key === "Escape") setUnos(null);
                }}
                placeholder="Nalepi vrednost"
                className="h-9 min-w-0 flex-1 font-mono placeholder:font-sans"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                disabled={provera === null || !provera.ok || radim}
                aria-busy={radim}
                onClick={() => void sacuvaj()}
              >
                {radim && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
                Sačuvaj
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                disabled={radim}
                onClick={() => setUnos(null)}
              >
                Odustani
              </Button>
            </div>
          )
        }
      </Field>
      <ConfirmDialog
        open={potvrda}
        onOpenChange={setPotvrda}
        title={`Obrisati: ${label}?`}
        description={
          jeOsnivacki && kljuc !== "puls_token"
            ? "Projekat posle brisanja ponovo koristi vrednost iz okruženja servera, ako postoji."
            : "Funkcija koja ga koristi prestaje da radi dok ne upišeš novu vrednost."
        }
        confirmLabel="Obriši"
        busyLabel="Brišem…"
        busy={radim}
        onConfirm={() => void ukloni()}
      />
    </>
  );
}

// ── Budžetske granice ──────────────────────────────────────────────────────

const GRANICE = ["valuta", "minimum", "maksimum", "metaMaksDnevno", "googleMaksDnevno"] as const;
type Granica = (typeof GRANICE)[number];

function tekstGranice(p: { vrednost: string | number | null; izvor: Izvor }): string {
  const v = svoja(p);
  return v === null ? "" : String(v);
}

function BudzetskeGranice({ podaci }: { podaci: Podaci }) {
  const sacuvaj = useProjekatMutation(api.podesavanjaStore.sacuvajBudzet);
  const b = podaci.podesavanja.budzet;
  const [vrednosti, setVrednosti] = useState<Record<Granica, string>>(
    () =>
      Object.fromEntries(GRANICE.map((g) => [g, tekstGranice(b[g])])) as Record<Granica, string>,
  );
  const [cuvam, setCuvam] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const provera = proveriBudzet(vrednosti);
  const pocetno = Object.fromEntries(GRANICE.map((g) => [g, tekstGranice(b[g])]));
  const izmenjeno = GRANICE.some((g) => vrednosti[g].trim() !== pocetno[g]);

  const posalji = async (e: FormEvent) => {
    e.preventDefault();
    if (!provera.ok || !izmenjeno || cuvam) return;
    setCuvam(true);
    setStatus(null);
    try {
      await sacuvaj({
        valuta: provera.vrednost.valuta ?? null,
        minimum: provera.vrednost.minimum ?? null,
        maksimum: provera.vrednost.maksimum ?? null,
        metaMaksDnevno: provera.vrednost.metaMaksDnevno ?? null,
        googleMaksDnevno: provera.vrednost.googleMaksDnevno ?? null,
      });
      setStatus({ tip: "uspeh", tekst: "Sačuvano." });
    } catch (err) {
      setStatus({ tip: "greska", tekst: porukaGreske(err, "Granice nisu sačuvane.") });
    } finally {
      setCuvam(false);
    }
  };

  /** Šta važi kad je polje prazno: env osnivačkog projekta ili zaštitna ograda. */
  const vazi = (g: Granica): string => {
    if (b[g].izvor === "env" && b[g].vrednost !== null) return String(b[g].vrednost);
    if (g === "valuta") return BUDZET_PODRAZUMEVANO.valuta;
    if (g === "minimum") return String(BUDZET_PODRAZUMEVANO.minimum);
    if (g === "maksimum") return String(BUDZET_PODRAZUMEVANO.maksimum);
    return "Isključeno";
  };

  const polje = (g: Granica, label: string) => (
    <Field label={label}>
      {(field) => (
        <Input
          {...field}
          value={vrednosti[g]}
          onChange={(e) => setVrednosti((v) => ({ ...v, [g]: e.target.value }))}
          placeholder={vazi(g)}
          inputMode={g === "valuta" ? "text" : "decimal"}
          autoComplete="off"
          maxLength={g === "valuta" ? 3 : 12}
          className={cn("h-9", g === "valuta" ? "uppercase" : "font-mono tabular-nums placeholder:font-sans")}
        />
      )}
    </Field>
  );

  const nasledjuje = GRANICE.some((g) => b[g].izvor === "env");

  return (
    <FormGroup
      title="Budžetske granice"
      description="Valuta naloga oglasa mora biti ista kao valuta granica; konverzije po kursu nema."
    >
      <form onSubmit={(e) => void posalji(e)} className="max-w-4xl space-y-4">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3 lg:max-w-xl">
          {polje("valuta", "Valuta")}
          {polje("minimum", "Najmanji dnevni budžet")}
          {polje("maksimum", "Najveći dnevni budžet")}
        </div>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:max-w-xl">
          {polje("metaMaksDnevno", "Najviše dnevno, nova Meta kampanja")}
          {polje("googleMaksDnevno", "Najviše dnevno, nova Google kampanja")}
        </div>
        <p className="text-meta text-text-muted">
          Prazna gornja granica znači da je pravljenje kampanje isključeno.
          {nasledjuje ? ` Prazna polja nasleđuju okruženje servera.` : ""}
        </p>
        {!provera.ok && <FeedbackLine tone="danger">{provera.poruka}</FeedbackLine>}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="secondary"
            disabled={!provera.ok || !izmenjeno || cuvam}
            aria-busy={cuvam}
          >
            {cuvam && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
            Sačuvaj granice
          </Button>
          <StatusRed status={status} />
        </div>
      </form>
    </FormGroup>
  );
}
