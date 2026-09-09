"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Bot,
  Compass,
  Pencil,
  Plus,
  Table2,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { pojasKvaliteta, POJAS_NATPISI } from "@/convex/lib/siteScore";
import { FeedbackNote } from "@/components/app/feedback";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { LinkChip, type LinkChipVrsta } from "@/components/app/link-chip";
import { getErrorMessage } from "./lead-quick-dialogs";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * TAB „NIŠE" (GL2) — plan §7.3, §O7
 * ============================================================================
 *
 * Niša je entitet, ne slobodan tekst na firmi: nosi opis, platforme na kojima
 * se traži i šifre delatnosti. Skill je pravi sam pri prvom uvozu (upsert po
 * slugu); ovde se dopunjuje i ispravlja.
 *
 * APLIKACIJA NE POZIVA NIJEDAN LLM. Dugmeta „generiši opis" ovde nema i neće
 * ga biti — opis piše ili skill (kroz uvoz) ili čovek, i bedž uvek kaže koji
 * od to dvoje.
 */

type Platforma =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "google_maps"
  | "011info"
  | "companywall"
  | "drugo";

const PLATFORMA_NATPISI: Record<Platforma, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  google_maps: "Google Maps",
  "011info": "011info",
  companywall: "CompanyWall",
  drugo: "Drugo",
};

const PLATFORMA_U_CHIP: Record<Platforma, LinkChipVrsta> = {
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  google_maps: "google_maps",
  "011info": "011info",
  companywall: "companywall",
  drugo: "website",
};

const PLATFORME: readonly Platforma[] = [
  "instagram",
  "facebook",
  "tiktok",
  "google_maps",
  "011info",
  "companywall",
  "drugo",
];

type NicheRow = FunctionReturnType<typeof api.nichesStore.listNiches>[number];

/** Tinta pojasa kvaliteta sajta (GL10) — ista paleta kao bedž stanja sajta. */
const POJAS_INK = {
  los: "text-temp-hot",
  srednji: "text-temp-warm",
  dobar: "text-success",
} as const;

function Brojac({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-micro text-text-muted">
      <strong className="font-mono tabular-nums text-foreground">{value}</strong>
      {label}
    </span>
  );
}

/** Bedž autorstva opisa (§7.3): ko je pisao i kada. */
function OpisAutor({ nisa }: { nisa: NicheRow }) {
  if (!nisa.opis) return null;
  const kada = nisa.opisAt ? formatDateTime(nisa.opisAt) : "datum nije zabeležen";

  if (nisa.opisAutor === "claude") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-raised px-1.5 py-px text-micro text-text-muted">
        <Bot className="size-3" aria-hidden />
        {nisa.opisModel ?? "Claude"} · {kada}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-raised px-1.5 py-px text-micro text-text-muted">
      <User className="size-3" aria-hidden />
      {nisa.opisAutorEmail ?? "Čovek"} · {kada}
    </span>
  );
}

function PlatformaChip({
  platforma,
  url,
  napomena,
}: {
  platforma: Platforma;
  url?: string;
  napomena?: string;
}) {
  // Platforma bez URL-a je i dalje podatak („traži po heštegu"), ali nije
  // link — čip koji ne vodi nigde ne sme da izgleda kao da vodi.
  if (!url) {
    return (
      <span
        title={napomena}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-line-soft px-2 py-0.5 text-micro text-text-muted"
      >
        {PLATFORMA_NATPISI[platforma]}
        {napomena ? ` · ${napomena}` : " · bez adrese"}
      </span>
    );
  }

  return (
    <LinkChip
      vrsta={PLATFORMA_U_CHIP[platforma]}
      href={url}
      size="sm"
      title={napomena ? `${PLATFORMA_NATPISI[platforma]}: ${napomena}` : undefined}
    />
  );
}

export function NichesPanel({
  workspaceId,
  onShowCompanies,
}: {
  workspaceId: Id<"workspaces">;
  /** Postavlja filter po niši i prebacuje na jezičak sa tabelom. */
  onShowCompanies: (slug: string) => void;
}) {
  const nise = useQuery(api.nichesStore.listNiches, { workspaceId });
  const upsertNiche = useMutation(api.nichesStore.upsertNiche);
  const deleteNiche = useMutation(api.nichesStore.deleteNiche);

  const [izabrana, setIzabrana] = useState<Id<"niches"> | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [novaNisa, setNovaNisa] = useState<string | null>(null);
  const [zaBrisanje, setZaBrisanje] = useState<NicheRow | null>(null);
  const [brisem, setBrisem] = useState(false);

  // Prazan desni panel uz punu listu izgleda kao da se nešto nije učitalo, pa
  // je otvorena prva niša kad nijedna nije izabrana. Izvedeno, ne upisano u
  // stanje: obrisana niša tako sama prepušta mesto sledećoj.
  const aktivna =
    nise?.find((n) => n._id === izabrana) ?? nise?.[0] ?? null;

  const napraviNisu = async () => {
    const naziv = (novaNisa ?? "").trim();
    setGreska(null);
    try {
      const id = await upsertNiche({ workspaceId, naziv });
      setNovaNisa(null);
      setIzabrana(id);
    } catch (err) {
      setGreska(getErrorMessage(err));
    }
  };

  const obrisiNisu = async () => {
    if (!zaBrisanje) return;
    setBrisem(true);
    setGreska(null);
    try {
      await deleteNiche({ workspaceId, nicheId: zaBrisanje._id });
      if (izabrana === zaBrisanje._id) setIzabrana(null);
      setZaBrisanje(null);
    } catch (err) {
      setGreska(getErrorMessage(err));
      setZaBrisanje(null);
    } finally {
      setBrisem(false);
    }
  };

  if (nise === undefined) {
    return (
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {greska && (
        <FeedbackNote
          tone="danger"
          title="Radnja nije izvršena"
          action={
            <Button size="xs" variant="ghost" onClick={() => setGreska(null)}>
              Zatvori
            </Button>
          }
        >
          {greska}
        </FeedbackNote>
      )}

      {nise.length === 0 ? (
        <Card className="border-line bg-surface">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-line-soft text-text-muted">
              <Compass className="size-5" />
            </div>
            <div className="flex max-w-md flex-col gap-1">
              <p className="text-sm font-semibold text-foreground">
                Još nema nijedne niše
              </p>
              <p className="text-xs leading-relaxed text-text-muted">
                Nišu obično pravi skill `/generate-leads` sam, pri prvom uvozu:
                ako ključ niše iz upita ne postoji, napravi je i upiše opis.
                Ovde je praviš ručno kad želiš da pripremiš platforme i opis
                pre prvog uvoza.
              </p>
            </div>
            {novaNisa === null ? (
              <Button size="sm" onClick={() => setNovaNisa("")} className="gap-1.5">
                <Plus className="size-3.5" />
                Nova niša
              </Button>
            ) : (
              <NovaNisaForma
                value={novaNisa}
                onChange={setNovaNisa}
                onSubmit={napraviNisu}
                onCancel={() => setNovaNisa(null)}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          {/* ── Spisak niša ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro font-semibold text-text-muted">
                {nise.length} niša u radnom prostoru
              </span>
              {novaNisa === null && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setNovaNisa("")}
                  className="gap-1"
                >
                  <Plus className="size-3" />
                  Nova
                </Button>
              )}
            </div>

            {novaNisa !== null && (
              <NovaNisaForma
                value={novaNisa}
                onChange={setNovaNisa}
                onSubmit={napraviNisu}
                onCancel={() => setNovaNisa(null)}
              />
            )}

            {nise.map((n) => {
              const active = n._id === izabrana;
              return (
                <button
                  key={n._id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setIzabrana(n._id)}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-accent-400 bg-accent-400/5"
                      : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {n.naziv}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-accent-400">
                      {n.brojaci.firmi}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <Brojac label="sa sajtom" value={n.brojaci.saSajtom} />
                    <Brojac label="bez sajta" value={n.brojaci.bezSajta} />
                    <Brojac label="hot" value={n.brojaci.hot} />
                    <Brojac label="warm" value={n.brojaci.warm} />
                  </div>
                  {n.brojaci.sajtNepoznato > 0 && (
                    <span className="text-micro text-text-muted">
                      sajt nepoznat: {n.brojaci.sajtNepoznato}
                    </span>
                  )}
                  {/* GL10 (plan §5.3): prosečan kvalitet sajta, samo iz ocena. */}
                  {n.sajt.ocenjeno > 0 && (
                    <span className="text-micro text-text-muted">
                      sajt:{" "}
                      {n.sajt.prosecanKvalitet === null ? (
                        "ocenjen bez broja"
                      ) : (
                        <>
                          <strong className={cn("font-mono tabular-nums", POJAS_INK[pojasKvaliteta(n.sajt.prosecanKvalitet)])}>
                            {POJAS_NATPISI[pojasKvaliteta(n.sajt.prosecanKvalitet)]} {n.sajt.prosecanKvalitet}
                          </strong>{" "}
                          prosek
                        </>
                      )}{" "}
                      · ocenjeno {n.sajt.ocenjeno}
                    </span>
                  )}
                  {n.opis && (
                    <p className="line-clamp-2 text-micro leading-relaxed text-text-muted">
                      {n.opis}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Panel izabrane niše ── */}
          {aktivna ? (
            <NichePanel
              key={aktivna._id}
              workspaceId={workspaceId}
              nisa={aktivna}
              onError={setGreska}
              onDelete={() => setZaBrisanje(aktivna)}
              onShowCompanies={onShowCompanies}
            />
          ) : (
            <Card className="border-line bg-surface">
              <CardContent className="py-16 text-center text-xs text-text-muted">
                Izaberi nišu sa spiska.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={zaBrisanje !== null}
        onOpenChange={(open) => {
          if (!open) setZaBrisanje(null);
        }}
        title={`Obrisati nišu „${zaBrisanje?.naziv ?? ""}"?`}
        description="Brišu se niša i njene platforme. Firme se NE brišu — ako ih niša ima, brisanje se odbija i piše koliko ih je."
        confirmLabel="Obriši nišu"
        busyLabel="Brišem…"
        busy={brisem}
        onConfirm={() => void obrisiNisu()}
      />
    </div>
  );
}

function NovaNisaForma({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-3"
    >
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Naziv niše (npr. Frizerski saloni)"
        aria-label="Naziv nove niše"
        className="h-8 text-xs"
      />
      <p className="text-micro text-text-muted">
        Ključ (slug) se izvodi iz naziva i po njemu skill prepoznaje istu nišu.
      </p>
      <div className="flex items-center gap-2">
        <Button size="xs" type="submit" disabled={!value.trim()}>
          Napravi nišu
        </Button>
        <Button size="xs" type="button" variant="ghost" onClick={onCancel}>
          Otkaži
        </Button>
      </div>
    </form>
  );
}

function NichePanel({
  workspaceId,
  nisa,
  onError,
  onDelete,
  onShowCompanies,
}: {
  workspaceId: Id<"workspaces">;
  nisa: NicheRow;
  onError: (msg: string | null) => void;
  onDelete: () => void;
  onShowCompanies: (slug: string) => void;
}) {
  const updateOpis = useMutation(api.nichesStore.updateNicheOpis);
  const upsertNiche = useMutation(api.nichesStore.upsertNiche);
  const upsertPlatform = useMutation(api.nichesStore.upsertNichePlatform);
  const deletePlatform = useMutation(api.nichesStore.deleteNichePlatform);

  const [opis, setOpis] = useState(nisa.opis ?? "");
  const [urediOpis, setUrediOpis] = useState(false);
  const [cuvam, setCuvam] = useState(false);

  const [sifre, setSifre] = useState((nisa.sifreDelatnosti ?? []).join(", "));
  const [urediSifre, setUrediSifre] = useState(false);

  const [novaPlatforma, setNovaPlatforma] = useState<{
    platforma: Platforma;
    url: string;
    napomena: string;
  } | null>(null);

  const sacuvajOpis = async () => {
    setCuvam(true);
    onError(null);
    try {
      await updateOpis({ workspaceId, nicheId: nisa._id, opis });
      setUrediOpis(false);
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setCuvam(false);
    }
  };

  const sacuvajSifre = async () => {
    setCuvam(true);
    onError(null);
    try {
      const lista = sifre
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await upsertNiche({
        workspaceId,
        nicheId: nisa._id,
        naziv: nisa.naziv,
        sifreDelatnosti: lista,
      });
      setUrediSifre(false);
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setCuvam(false);
    }
  };

  const dodajPlatformu = async () => {
    if (!novaPlatforma) return;
    setCuvam(true);
    onError(null);
    try {
      await upsertPlatform({
        workspaceId,
        nicheId: nisa._id,
        platforma: novaPlatforma.platforma,
        url: novaPlatforma.url.trim() || undefined,
        napomena: novaPlatforma.napomena.trim() || undefined,
      });
      setNovaPlatforma(null);
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setCuvam(false);
    }
  };

  const skloniPlatformu = async (platformId: Id<"nichePlatforms">) => {
    onError(null);
    try {
      await deletePlatform({ workspaceId, platformId });
    } catch (err) {
      onError(getErrorMessage(err));
    }
  };

  // GL10 (plan §2.3): da li niša traži zakazivanje. Odluka čoveka; skill je
  // upiše samo dok polje ne postoji.
  const postaviZakazivanje = async (vrednost: boolean) => {
    onError(null);
    try {
      await upsertNiche({
        workspaceId,
        nicheId: nisa._id,
        naziv: nisa.naziv,
        trebaZakazivanje: vrednost,
      });
    } catch (err) {
      onError(getErrorMessage(err));
    }
  };

  const najviseCms = nisa.sajt.cmsRaspodela[0]?.broj ?? 0;

  return (
    <Card className="border-line bg-surface">
      <CardContent className="flex flex-col gap-5 p-4 sm:p-5">
        {/* Zaglavlje */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-base font-bold text-foreground">{nisa.naziv}</h3>
            <span className="font-mono text-micro text-text-muted">
              ključ: {nisa.slug}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Ne `Link` na `/leadovi?nisa=…`: ekran je već `/leadovi`, pa bi
                navigacija promenila adresu a ostavila otvoren ovaj jezičak —
                klik bez vidljivog ishoda. Zato radnja i menja filter i
                prebacuje na tabelu. */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onShowCompanies(nisa.slug)}
              className="gap-1.5 text-xs"
            >
              <Table2 className="size-3.5" />
              Prikaži firme ({nisa.brojaci.firmi})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="gap-1.5 text-xs text-text-muted hover:text-danger"
            >
              <Trash2 className="size-3.5" />
              Obriši
            </Button>
          </div>
        </div>

        {/* Opis */}
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-micro font-semibold uppercase tracking-wider text-text-muted">
              Opis
            </h4>
            <OpisAutor nisa={nisa} />
            {!urediOpis && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setOpis(nisa.opis ?? "");
                  setUrediOpis(true);
                }}
                className="ml-auto gap-1 text-text-muted hover:text-foreground"
              >
                <Pencil className="size-3" />
                {nisa.opis ? "Izmeni" : "Napiši opis"}
              </Button>
            )}
          </div>

          {urediOpis ? (
            <div className="flex flex-col gap-2">
              <Textarea
                autoFocus
                value={opis}
                onChange={(e) => setOpis(e.target.value)}
                placeholder="Čime se firme u ovoj niši bave, ko odlučuje o sajtu, šta ih boli…"
                className="min-h-24 text-xs"
              />
              <p className="text-micro text-text-muted">
                Čim sačuvaš, opis se vodi kao tvoj — bedž prestaje da kaže da ga
                je pisao Claude.
              </p>
              <div className="flex items-center gap-2">
                <Button size="xs" disabled={cuvam} onClick={() => void sacuvajOpis()}>
                  {cuvam ? "Čuvam…" : "Sačuvaj opis"}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setUrediOpis(false)}
                >
                  Otkaži
                </Button>
              </div>
            </div>
          ) : nisa.opis ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
              {nisa.opis}
            </p>
          ) : (
            <p className="text-xs text-text-muted">
              Nema opisa. Skill ga piše pri uvozu; do tada ga možeš napisati sam.
            </p>
          )}
        </section>

        {/* Platforme */}
        <section className="flex flex-col gap-2 border-t border-line-soft pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-micro font-semibold uppercase tracking-wider text-text-muted">
              Platforme ({nisa.platforme.length})
            </h4>
            {novaPlatforma === null && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  setNovaPlatforma({ platforma: "instagram", url: "", napomena: "" })
                }
                className="ml-auto gap-1 text-text-muted hover:text-foreground"
              >
                <Plus className="size-3" />
                Dodaj platformu
              </Button>
            )}
          </div>

          {nisa.platforme.length === 0 ? (
            <p className="text-xs text-text-muted">
              Nema zabeleženih platformi — gde se ova niša traži još nije upisano.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {nisa.platforme.map((p) => (
                <li key={p._id} className="flex flex-wrap items-center gap-2">
                  <PlatformaChip
                    platforma={p.platforma}
                    url={p.url}
                    napomena={p.napomena}
                  />
                  {p.url && p.napomena && (
                    <span className="text-micro text-text-muted">{p.napomena}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void skloniPlatformu(p._id)}
                    aria-label={`Ukloni platformu ${PLATFORMA_NATPISI[p.platforma]}`}
                    className="cursor-pointer rounded p-1 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {novaPlatforma && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void dodajPlatformu();
              }}
              className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`platforma-${nisa._id}`}>
                  Platforma
                </label>
                <select
                  id={`platforma-${nisa._id}`}
                  value={novaPlatforma.platforma}
                  onChange={(e) =>
                    setNovaPlatforma({
                      ...novaPlatforma,
                      platforma: e.target.value as Platforma,
                    })
                  }
                  className="h-8 cursor-pointer rounded-md border border-line bg-surface-raised px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {PLATFORME.map((p) => (
                    <option key={p} value={p} className="bg-surface">
                      {PLATFORMA_NATPISI[p]}
                    </option>
                  ))}
                </select>
                <Input
                  value={novaPlatforma.url}
                  onChange={(e) =>
                    setNovaPlatforma({ ...novaPlatforma, url: e.target.value })
                  }
                  placeholder="URL (nije obavezan)"
                  aria-label="URL platforme"
                  className="h-8 min-w-52 flex-1 text-xs"
                />
              </div>
              <Input
                value={novaPlatforma.napomena}
                onChange={(e) =>
                  setNovaPlatforma({ ...novaPlatforma, napomena: e.target.value })
                }
                placeholder={`Napomena — npr. „pretraga po heštegu #frizerbeograd"`}
                aria-label="Napomena o platformi"
                className="h-8 text-xs"
              />
              <div className="flex items-center gap-2">
                <Button size="xs" type="submit" disabled={cuvam}>
                  {cuvam ? "Dodajem…" : "Dodaj"}
                </Button>
                <Button
                  size="xs"
                  type="button"
                  variant="ghost"
                  onClick={() => setNovaPlatforma(null)}
                >
                  Otkaži
                </Button>
              </div>
            </form>
          )}
        </section>

        {/* Sajtovi u niši (GL10, plan §5.3) — samo iz postojećih ocena */}
        <section className="flex flex-col gap-2 border-t border-line-soft pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-micro font-semibold uppercase tracking-wider text-text-muted">
              Sajtovi
            </h4>
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-micro text-text-muted">
              <span title={`Kad je uključeno, sajt bez alata ili forme za termin dobija signal „nema zakazivanja".`}>
                niša traži zakazivanje
              </span>
              <Switch
                checked={nisa.trebaZakazivanje === true}
                onCheckedChange={(v) => void postaviZakazivanje(v)}
                aria-label="Niša traži zakazivanje"
              />
            </label>
          </div>

          {nisa.sajt.ocenjeno === 0 ? (
            <p className="text-xs text-text-muted">
              Nijedan sajt u ovoj niši nije ocenjen. Ocena se pokreće iz skilla:{" "}
              <code className="font-mono text-micro text-foreground">/generate-leads oceni-sajtove</code>.
            </p>
          ) : (
            <div className="grid gap-4 text-xs sm:grid-cols-[auto_1fr]">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-micro text-text-muted">Prosečan kvalitet</span>
                  {nisa.sajt.prosecanKvalitet === null ? (
                    <span className="text-text-muted">bez broja</span>
                  ) : (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span
                        className={cn(
                          "font-mono text-xl font-semibold tabular-nums",
                          POJAS_INK[pojasKvaliteta(nisa.sajt.prosecanKvalitet)],
                        )}
                      >
                        {nisa.sajt.prosecanKvalitet}
                      </span>
                      <span className="text-text-muted">
                        {POJAS_NATPISI[pojasKvaliteta(nisa.sajt.prosecanKvalitet)]} · {nisa.sajt.ocenjeno}{" "}
                        {nisa.sajt.ocenjeno === 1 ? "sajt" : "sajtova"}
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-micro text-text-muted">Bez zakazivanja</span>
                  {nisa.sajt.bezZakazivanja === null ? (
                    <span className="text-text-muted" title={`Uključi „niša traži zakazivanje" da se broji.`}>
                      niša ga ne traži
                    </span>
                  ) : (
                    <span className="font-mono text-xl font-semibold tabular-nums text-foreground">
                      {nisa.sajt.bezZakazivanja}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-micro text-text-muted">CMS</span>
                <ul className="flex flex-col gap-1">
                  {nisa.sajt.cmsRaspodela.map((c) => (
                    <li key={c.ime} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2">
                      <span className="truncate text-foreground" title={c.ime}>
                        {c.ime}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-sm bg-line" aria-hidden>
                        <span
                          className="block h-full rounded-sm bg-chart-1"
                          style={{ width: `${najviseCms > 0 ? (c.broj / najviseCms) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="text-right font-mono tabular-nums text-text-muted">{c.broj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* Šifre delatnosti */}
        <section className="flex flex-col gap-2 border-t border-line-soft pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-micro font-semibold uppercase tracking-wider text-text-muted">
              Šifre delatnosti (APR)
            </h4>
            {!urediSifre && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setSifre((nisa.sifreDelatnosti ?? []).join(", "));
                  setUrediSifre(true);
                }}
                className="ml-auto gap-1 text-text-muted hover:text-foreground"
              >
                <Pencil className="size-3" />
                Izmeni
              </Button>
            )}
          </div>

          {urediSifre ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sacuvajSifre();
              }}
              className="flex flex-col gap-2"
            >
              <Input
                autoFocus
                value={sifre}
                onChange={(e) => setSifre(e.target.value)}
                placeholder="npr. 9602, 9604"
                aria-label="Šifre delatnosti, razdvojene zarezom"
                className="h-8 text-xs"
              />
              <div className="flex items-center gap-2">
                <Button size="xs" type="submit" disabled={cuvam}>
                  {cuvam ? "Čuvam…" : "Sačuvaj"}
                </Button>
                <Button
                  size="xs"
                  type="button"
                  variant="ghost"
                  onClick={() => setUrediSifre(false)}
                >
                  Otkaži
                </Button>
              </div>
            </form>
          ) : (nisa.sifreDelatnosti ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(nisa.sifreDelatnosti ?? []).map((s) => (
                <span
                  key={s}
                  className="rounded border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-micro tabular-nums text-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">
              Nisu poznate. Skill ih često nema, pa se ne izmišljaju.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
