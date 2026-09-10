"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  DodirFilter,
  KvalitetFilter,
  PlatformaFilter,
  PonudaFilter,
  SajtFilter,
} from "@/convex/leadFiltersStore";
import { PONUDA_NATPISI } from "./site-audit-labels";
import {
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ALL_STAGES, TEMPERATURA_LABELS, type Temperatura } from "./lead-chips";
import { leadStageLabel } from "./lead-labels";
import { getErrorMessage } from "./lead-quick-dialogs";
import { useLeadFilters, type LeadFilters } from "./use-lead-filters";
import { pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * TRAKA FILTERA (GL2) — plan §7.1
 * ============================================================================
 *
 * Svaki chip nosi broj pogodaka U TRENUTNOM PRESEKU, računat bez sopstvene
 * grupe: „Hot (12)" znači „ako ovde kliknem, dobiću 12", a ne „sad je
 * izabrano 12". Bez toga bi svaki neizabrani chip u grupi pokazivao nulu čim
 * je bilo šta izabrano.
 *
 * NULA NIJE DUGME (postojeće pravilo iz `leads-table`): chip bez pogodaka je
 * `disabled` sa objašnjenjem u `title`. Izuzetak je chip koji je već aktivan —
 * njega mora biti moguće ugasiti i kad je presek prazan.
 */

const SAJT_NATPISI: Record<SajtFilter, string> = {
  ima: "ima sajt",
  nema: "nema sajt",
  nepoznato: "nepoznato",
  ne_radi: "ne radi",
  parkiran: "parkiran",
  drustvene: "vodi na mrežu",
  bez_https: "bez HTTPS-a",
};

const PLATFORMA_NATPISI: Record<PlatformaFilter, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  threads: "Threads",
  website: "sajt kao kanal",
};

const DODIR_NATPISI: Record<DodirFilter, string> = {
  "7d": "bez dodira 7+ dana",
  "30d": "bez dodira 30+ dana",
  nikad: "nikad dodirnut",
};

const TEL_NATPISI: Record<string, string> = {
  "70": "telefon ≥ 70 %",
  "40": "telefon ≥ 40 %",
  "0": "ima procenu telefona",
};

// GL10 (plan §5.2): filteri iz ocene sajta.
const KVALITET_NATPISI: Record<KvalitetFilter, string> = {
  los: "loš",
  srednji: "srednji",
  dobar: "dobar",
  neocenjen: "neocenjen",
};

const CMS_POSEBNI: Record<string, string> = {
  drugo: "drugo",
  bez_cms: "bez CMS-a",
};

function cmsNatpis(ime: string): string {
  return CMS_POSEBNI[ime] ?? ime;
}

const PRAZAN_CHIP_TITLE = "Nema pogodaka u ovom preseku.";

/** `id` polja pretrage — prečica `/` u tabeli (A3, O2) ga fokusira. */
export const SEARCH_INPUT_ID = "leadovi-pretraga";

function Chip({
  label,
  count,
  active,
  onToggle,
  title,
}: {
  label: string;
  /** `undefined` = brojači nisu dostupni (presek preko granice). */
  count?: number;
  active: boolean;
  onToggle: () => void;
  title?: string;
}) {
  const prazan = count === 0 && !active;

  if (prazan) {
    return (
      <span
        title={title ?? PRAZAN_CHIP_TITLE}
        aria-disabled
        className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-line-soft px-2.5 py-1 text-xs text-text-muted opacity-60"
      >
        <span>{label}</span>
        <span className="font-mono tabular-nums">(0)</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      title={title}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent-400 bg-accent-400/15 text-accent-400 ring-1 ring-accent-400/40"
          : "border-line bg-surface-raised text-text-muted hover:border-line-strong hover:text-foreground",
      )}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className="font-mono tabular-nums opacity-80">({count})</span>
      )}
    </button>
  );
}

function Grupa({ naziv, children }: { naziv: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="w-28 shrink-0 text-micro font-semibold text-text-muted">
        {naziv}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Kratak opis jedne aktivne grupe — ono što se vidi u sklopljenoj traci. */
function opisiAktivne(filters: LeadFilters): { grupa: keyof LeadFilters; tekst: string }[] {
  const out: { grupa: keyof LeadFilters; tekst: string }[] = [];
  if (filters.faza.length) {
    out.push({ grupa: "faza", tekst: filters.faza.map(leadStageLabel).join(", ") });
  }
  if (filters.zaostali) out.push({ grupa: "zaostali", tekst: "samo zaostali" });
  if (filters.temp.length) {
    out.push({
      grupa: "temp",
      tekst: filters.temp.map((t) => TEMPERATURA_LABELS[t]).join(", "),
    });
  }
  if (filters.nisa.length) out.push({ grupa: "nisa", tekst: filters.nisa.join(", ") });
  if (filters.grad.length) out.push({ grupa: "grad", tekst: filters.grad.join(", ") });
  if (filters.sajt.length) {
    out.push({
      grupa: "sajt",
      tekst: filters.sajt.map((s) => SAJT_NATPISI[s]).join(", "),
    });
  }
  if (filters.platforma.length) {
    out.push({
      grupa: "platforma",
      tekst: filters.platforma.map((p) => PLATFORMA_NATPISI[p]).join(", "),
    });
  }
  if (filters.koord) {
    out.push({
      grupa: "koord",
      tekst: filters.koord === "da" ? "ima koordinate" : "bez koordinata",
    });
  }
  if (filters.tel !== null) {
    out.push({
      grupa: "tel",
      tekst: TEL_NATPISI[String(filters.tel)] ?? `telefon ≥ ${filters.tel} %`,
    });
  }
  if (filters.dodir.length) {
    out.push({
      grupa: "dodir",
      tekst: filters.dodir.map((d) => DODIR_NATPISI[d]).join(", "),
    });
  }
  if (filters.q) out.push({ grupa: "q", tekst: `naziv sadrži „${filters.q}"` });
  if (filters.kvalitet.length) {
    out.push({
      grupa: "kvalitet",
      tekst: `sajt: ${filters.kvalitet.map((k) => KVALITET_NATPISI[k]).join(", ")}`,
    });
  }
  if (filters.cms.length) {
    out.push({ grupa: "cms", tekst: `CMS: ${filters.cms.map(cmsNatpis).join(", ")}` });
  }
  if (filters.sajtSpor) out.push({ grupa: "sajtSpor", tekst: "spor sajt" });
  if (filters.ponuda.length) {
    out.push({
      grupa: "ponuda",
      tekst: `ponuda: ${filters.ponuda.map((p) => PONUDA_NATPISI[p]).join(", ")}`,
    });
  }
  return out;
}

export function LeadFilterBar({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const {
    filters,
    args,
    queryString,
    aktivnihGrupa,
    toggle,
    setZaostali,
    setKoord,
    setTel,
    setSajtSpor,
    setQ,
    clearGroup,
    clearAll,
    applyQuery,
  } = useLeadFilters();

  const [otvorena, setOtvorena] = useState(false);
  const [sviGradovi, setSviGradovi] = useState(false);
  const [imePreseta, setImePreseta] = useState<string | null>(null);
  const [presetGreska, setPresetGreska] = useState<string | null>(null);
  const [zaBrisanje, setZaBrisanje] = useState<{
    id: Id<"leadFilterPresets">;
    naziv: string;
  } | null>(null);
  const [brisem, setBrisem] = useState(false);

  const brojaci = useQuery(api.leadFiltersStore.countLeadsByFacet, {
    workspaceId,
    ...args,
  });
  const preseti = useQuery(api.leadFiltersStore.listPresets, { workspaceId });
  const savePreset = useMutation(api.leadFiltersStore.savePreset);
  const deletePreset = useMutation(api.leadFiltersStore.deletePreset);

  // ── Tekstualna pretraga: URL se ne prepisuje na svaki pritisak tastera ──
  const [tekst, setTekst] = useState(filters.q);
  const poslednjiUpisan = useRef(filters.q);
  useEffect(() => {
    if (filters.q !== poslednjiUpisan.current) {
      poslednjiUpisan.current = filters.q;
      setTekst(filters.q);
    }
  }, [filters.q]);
  useEffect(() => {
    if (tekst.trim() === filters.q) return;
    const t = setTimeout(() => {
      poslednjiUpisan.current = tekst.trim();
      setQ(tekst);
    }, 350);
    return () => clearTimeout(t);
  }, [tekst, filters.q, setQ]);

  const ucitava = brojaci === undefined;
  const preko =
    brojaci !== undefined && brojaci.prekoracen === true ? brojaci : null;
  const prekoracen = preko !== null;
  const b =
    brojaci !== undefined && brojaci.prekoracen === false ? brojaci : null;

  const aktivni = useMemo(() => opisiAktivne(filters), [filters]);

  const gradoviZaPrikaz = useMemo(() => {
    if (!b) return [];
    if (sviGradovi || b.grad.length <= 10) return b.grad;
    // Grad koji je izabran mora da se vidi i kad nije među prvih deset —
    // inače aktivan filter nema gde da se ugasi.
    const prvi = b.grad.slice(0, 10);
    const izabraniVanListe = b.grad.filter(
      (g) => filters.grad.includes(g.naziv) && !prvi.some((p) => p.naziv === g.naziv),
    );
    return [...prvi, ...izabraniVanListe];
  }, [b, sviGradovi, filters.grad]);

  const sacuvajPreset = async () => {
    const naziv = (imePreseta ?? "").trim();
    setPresetGreska(null);
    try {
      await savePreset({ workspaceId, naziv, query: queryString });
      setImePreseta(null);
    } catch (err) {
      setPresetGreska(getErrorMessage(err));
    }
  };

  const obrisiPreset = async () => {
    if (!zaBrisanje) return;
    setBrisem(true);
    setPresetGreska(null);
    try {
      await deletePreset({ workspaceId, presetId: zaBrisanje.id });
      setZaBrisanje(null);
    } catch (err) {
      setPresetGreska(getErrorMessage(err));
    } finally {
      setBrisem(false);
    }
  };

  const broj = (n: number | undefined) => (prekoracen ? undefined : n);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-raised/30 p-3">
      {/* ── Faze toka: uvek vidljive, ne iza „Filteri” ──
          Faza je osnovna navigacija kroz tok i pre GL2 je bila stalno na
          ekranu. Sklapanje bi je sakrilo iza jednog klika, a ostale grupe su
          povremene i tamo im je mesto. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-micro font-semibold text-text-muted">
          Faze toka:
        </span>
        {ucitava ? (
          <Skeleton className="h-6 w-96" />
        ) : (
          <>
            {ALL_STAGES.map((stage) => (
              <Chip
                key={stage}
                label={leadStageLabel(stage)}
                count={broj(b?.faza[stage] ?? 0)}
                active={filters.faza.includes(stage)}
                onToggle={() => toggle("faza", stage)}
              />
            ))}
            <div className="mx-1 h-4 w-px bg-line" />
            <Chip
              label="samo zaostali"
              count={broj(b?.zaostali ?? 0)}
              active={filters.zaostali}
              onToggle={() => setZaostali(!filters.zaostali)}
              title="Sledeći korak je planiran, a rok je prošao."
            />
          </>
        )}
      </div>

      {/* ── Gornji red: pretraga, sažetak, otvaranje ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
          <Input
            id={SEARCH_INPUT_ID}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            placeholder="Traži po nazivu firme…  ( / )"
            aria-label="Pretraga po nazivu firme"
            aria-keyshortcuts="/"
            className="h-8 pl-8 text-xs"
          />
          {tekst && (
            <button
              type="button"
              onClick={() => setTekst("")}
              aria-label="Očisti pretragu"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-text-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setOtvorena((o) => !o)}
          aria-expanded={otvorena}
          className="gap-1.5 text-xs"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-(--duration-base)",
              otvorena && "rotate-180",
            )}
          />
          Filteri
          {aktivnihGrupa > 0 && (
            <span className="rounded bg-accent-400/15 px-1.5 font-mono text-micro font-bold tabular-nums text-accent-400">
              {aktivnihGrupa}
            </span>
          )}
        </Button>

        {b && (
          <span className="text-xs text-text-muted">
            <strong className="font-mono tabular-nums text-foreground">
              {b.ukupno}
            </strong>{" "}
            u preseku
          </span>
        )}
      </div>

      {/* ── Aktivni filteri: vide se i kad je traka sklopljena ── */}
      {aktivni.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-text-muted">
            {aktivnihGrupa} {pluralSr(aktivnihGrupa, "filter", "filtera", "filtera")} ·
          </span>
          {aktivni.map((a) => (
            <button
              key={a.grupa}
              type="button"
              onClick={() => clearGroup(a.grupa)}
              title={`Skloni filter: ${a.tekst}`}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-accent-400/50 bg-accent-400/10 px-2 py-0.5 text-accent-400 transition-colors hover:border-accent-400"
            >
              <span className="max-w-56 truncate">{a.tekst}</span>
              <X className="size-3 shrink-0" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="cursor-pointer text-text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            očisti
          </button>
        </div>
      )}

      {/* ── Preseti ── */}
      {(preseti === undefined || preseti.length > 0 || aktivnihGrupa > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1 text-micro font-semibold text-text-muted">
            <Bookmark className="size-3" aria-hidden />
            Preseti
          </span>
          {preseti === undefined ? (
            <Skeleton className="h-6 w-28 rounded-lg" />
          ) : preseti.length === 0 ? (
            <span className="text-text-muted">nijedan još nije sačuvan</span>
          ) : (
            preseti.map((p) => (
              <span
                key={p._id}
                className={cn(
                  "inline-flex items-center rounded-lg border transition-colors",
                  p.query === queryString
                    ? "border-accent-400 bg-accent-400/15 text-accent-400"
                    : "border-line bg-surface-raised text-text-muted hover:border-line-strong",
                )}
              >
                <button
                  type="button"
                  onClick={() => applyQuery(p.query)}
                  className="cursor-pointer px-2 py-0.5 hover:text-foreground"
                >
                  {p.naziv}
                </button>
                <button
                  type="button"
                  onClick={() => setZaBrisanje({ id: p._id, naziv: p.naziv })}
                  aria-label={`Obriši preset ${p.naziv}`}
                  className="cursor-pointer rounded-r-lg px-1 py-0.5 text-text-muted hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))
          )}

          {imePreseta === null ? (
            aktivnihGrupa > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPresetGreska(null);
                  setImePreseta("");
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-line px-2 py-0.5 text-text-muted transition-colors hover:border-line-strong hover:text-foreground"
              >
                <BookmarkPlus className="size-3" />
                Sačuvaj kao preset
              </button>
            )
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sacuvajPreset();
              }}
              className="flex items-center gap-1.5"
            >
              <Input
                autoFocus
                value={imePreseta}
                onChange={(e) => setImePreseta(e.target.value)}
                placeholder="Ime preseta"
                aria-label="Ime preseta"
                className="h-7 w-40 text-xs"
              />
              <Button size="xs" type="submit" disabled={!imePreseta.trim()}>
                Sačuvaj
              </Button>
              <Button
                size="xs"
                type="button"
                variant="ghost"
                onClick={() => {
                  setImePreseta(null);
                  setPresetGreska(null);
                }}
              >
                Otkaži
              </Button>
            </form>
          )}
        </div>
      )}

      {presetGreska && (
        <FeedbackNote tone="danger" title="Preset nije sačuvan">
          {presetGreska}
        </FeedbackNote>
      )}

      {/* ── Chipovi ── */}
      {otvorena && (
        <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3">
          {preko && (
            <FeedbackNote tone="warning" title="Previše leadova za brojače">
              U radnom prostoru ima više od {preko.granica} dodela, pa se
              brojevi uz chipove ne računaju — odsečen brojač izgleda isto kao
              tačan. Suzi filter (npr. po fazi ili gradu) pa će se brojevi
              vratiti.
            </FeedbackNote>
          )}

          {ucitava ? (
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-24 shrink-0" />
                  <Skeleton className="h-6 w-72" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <Grupa naziv="Temperatura">
                {(Object.keys(TEMPERATURA_LABELS) as Temperatura[]).map((t) => (
                  <Chip
                    key={t}
                    label={TEMPERATURA_LABELS[t]}
                    count={broj(b?.temp[t] ?? 0)}
                    active={filters.temp.includes(t)}
                    onToggle={() => toggle("temp", t)}
                  />
                ))}
              </Grupa>

              <Grupa naziv="Sajt">
                {(Object.keys(SAJT_NATPISI) as SajtFilter[]).map((s) => (
                  <Chip
                    key={s}
                    label={SAJT_NATPISI[s]}
                    count={broj(b?.sajt[s] ?? 0)}
                    active={filters.sajt.includes(s)}
                    onToggle={() => toggle("sajt", s)}
                  />
                ))}
                {b && b.sajtNeprovereno > 0 && (
                  <span
                    className="text-micro text-text-muted"
                    title={`Firma kod koje sajt nikad nije proveravan ne ulazi ni u jedan chip — „nismo gledali" nije isto što i „nema sajt".`}
                  >
                    neprovereno:{" "}
                    <strong className="font-mono tabular-nums">
                      {b.sajtNeprovereno}
                    </strong>
                  </span>
                )}
              </Grupa>

              {/* ── GL10 (plan §5.2): iz poslednje ocene sajta ── */}
              <Grupa naziv="Kvalitet sajta">
                {(Object.keys(KVALITET_NATPISI) as KvalitetFilter[]).map((k) => (
                  <Chip
                    key={k}
                    label={KVALITET_NATPISI[k]}
                    count={broj(b?.kvalitet[k] ?? 0)}
                    active={filters.kvalitet.includes(k)}
                    onToggle={() => toggle("kvalitet", k)}
                    title={
                      k === "neocenjen"
                        ? "Firma ima sajt koji radi, a skill ga još nije ocenio (oceni-sajtove)."
                        : "Ukupna ocena sajta iz Lighthousea i Claudeovog suda; računa se pri čitanju."
                    }
                  />
                ))}
                <Chip
                  label="spor sajt"
                  count={broj(b?.sajtSpor ?? 0)}
                  active={filters.sajtSpor}
                  onToggle={() => setSajtSpor(!filters.sajtSpor)}
                  title="Lighthouse mobilni performance ispod 50."
                />
              </Grupa>

              <Grupa naziv="CMS">
                {b && b.cms.length === 0 && b.cmsBez === 0 ? (
                  <span className="text-micro text-text-muted">
                    Nijedan sajt u preseku nije ocenjen.
                  </span>
                ) : (
                  <>
                    {b?.cms.map((c) => (
                      <Chip
                        key={c.ime}
                        label={c.ime}
                        count={broj(c.broj)}
                        active={filters.cms.includes(c.ime)}
                        onToggle={() => toggle("cms", c.ime)}
                      />
                    ))}
                    <Chip
                      label={cmsNatpis("drugo")}
                      count={broj(b?.cmsDrugo ?? 0)}
                      active={filters.cms.includes("drugo")}
                      onToggle={() => toggle("cms", "drugo")}
                      title="CMS koji nije među prvih osam u radnom prostoru."
                    />
                    <Chip
                      label={cmsNatpis("bez_cms")}
                      count={broj(b?.cmsBez ?? 0)}
                      active={filters.cms.includes("bez_cms")}
                      onToggle={() => toggle("cms", "bez_cms")}
                      title="Ocenjen sajt bez prepoznatog CMS-a (ručni HTML, framework bez CMS-a…)."
                    />
                  </>
                )}
              </Grupa>

              <Grupa naziv="Preporučena ponuda">
                {(Object.keys(PONUDA_NATPISI) as PonudaFilter[]).map((p) => (
                  <Chip
                    key={p}
                    label={PONUDA_NATPISI[p]}
                    count={broj(b?.ponuda[p] ?? 0)}
                    active={filters.ponuda.includes(p)}
                    onToggle={() => toggle("ponuda", p)}
                    title="Šta bi Enigma prodala po Claudeovom sudu nad snimcima sajta."
                  />
                ))}
              </Grupa>

              <Grupa naziv="Niša">
                {b && b.nisa.length === 0 ? (
                  <span className="text-micro text-text-muted">
                    Nijedna firma u preseku nije u niši.
                  </span>
                ) : (
                  b?.nisa.map((n) => (
                    <Chip
                      key={n.slug}
                      label={n.naziv}
                      count={broj(n.broj)}
                      active={filters.nisa.includes(n.slug)}
                      onToggle={() => toggle("nisa", n.slug)}
                    />
                  ))
                )}
                {b && b.bezNise > 0 && (
                  <span className="text-micro text-text-muted">
                    bez niše:{" "}
                    <strong className="font-mono tabular-nums">{b.bezNise}</strong>
                  </span>
                )}
              </Grupa>

              <Grupa naziv="Grad">
                {gradoviZaPrikaz.length === 0 ? (
                  <span className="text-micro text-text-muted">
                    Nijedna firma u preseku nema zabeležen grad.
                  </span>
                ) : (
                  gradoviZaPrikaz.map((g) => (
                    <Chip
                      key={g.naziv}
                      label={g.naziv}
                      count={broj(g.broj)}
                      active={filters.grad.includes(g.naziv)}
                      onToggle={() => toggle("grad", g.naziv)}
                    />
                  ))
                )}
                {b && !sviGradovi && b.grad.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setSviGradovi(true)}
                    className="cursor-pointer text-micro text-text-muted underline-offset-2 hover:text-foreground hover:underline"
                  >
                    još {b.grad.length - 10}
                  </button>
                )}
                {b && b.bezGrada > 0 && (
                  <span className="text-micro text-text-muted">
                    bez grada:{" "}
                    <strong className="font-mono tabular-nums">{b.bezGrada}</strong>
                  </span>
                )}
              </Grupa>

              <Grupa naziv="Platforme">
                {(Object.keys(PLATFORMA_NATPISI) as PlatformaFilter[]).map((p) => (
                  <Chip
                    key={p}
                    label={PLATFORMA_NATPISI[p]}
                    count={broj(b?.platforma[p] ?? 0)}
                    active={filters.platforma.includes(p)}
                    onToggle={() => toggle("platforma", p)}
                  />
                ))}
              </Grupa>

              <Grupa naziv="Telefon">
                {(["70", "40", "0"] as const).map((prag) => (
                  <Chip
                    key={prag}
                    label={TEL_NATPISI[prag]}
                    count={broj(b?.tel[prag] ?? 0)}
                    active={filters.tel === Number(prag)}
                    onToggle={() =>
                      setTel(filters.tel === Number(prag) ? null : Number(prag))
                    }
                    title="Firma ima bar jedan broj sa procenom da pripada baš toj osobi."
                  />
                ))}
              </Grupa>

              <Grupa naziv="Koordinate">
                <Chip
                  label="ima koordinate"
                  count={broj(b?.koord.da ?? 0)}
                  active={filters.koord === "da"}
                  onToggle={() => setKoord(filters.koord === "da" ? null : "da")}
                />
                <Chip
                  label="bez koordinata"
                  count={broj(b?.koord.ne ?? 0)}
                  active={filters.koord === "ne"}
                  onToggle={() => setKoord(filters.koord === "ne" ? null : "ne")}
                />
              </Grupa>

              <Grupa naziv="Poslednji dodir">
                {(Object.keys(DODIR_NATPISI) as DodirFilter[]).map((d) => (
                  <Chip
                    key={d}
                    label={DODIR_NATPISI[d]}
                    count={broj(b?.dodir[d] ?? 0)}
                    active={filters.dodir.includes(d)}
                    onToggle={() => toggle("dodir", d)}
                  />
                ))}
              </Grupa>

              {b?.identitetiOdseceni && (
                <FeedbackNote tone="warning" title="Kontakti su odsečeni">
                  Radni prostor ima više kontakata nego što jedan upit sme da
                  pročita, pa filteri „Platforme” i „Telefon” možda ne vide sve.
                  Ostali filteri su tačni.
                </FeedbackNote>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={zaBrisanje !== null}
        onOpenChange={(open) => {
          if (!open) setZaBrisanje(null);
        }}
        title={`Obrisati preset „${zaBrisanje?.naziv ?? ""}"?`}
        description="Preset je samo sačuvan link ka filteru. Brisanje ne dira nijedan lead, ali ga gube i ostali članovi tima."
        confirmLabel="Obriši preset"
        busyLabel="Brišem…"
        busy={brisem}
        onConfirm={() => void obrisiPreset()}
      />
    </div>
  );
}
