"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { ScoredAxis } from "@/convex/lib/leadScoring";
import {
  ExternalLink,
  LoaderCircle,
  MapPinOff,
  Plane,
  RefreshCw,
  Square,
  Table2,
  TriangleAlert,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { DUR_REDUCED, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { holdCssTransition, releaseCssTransition } from "@/components/motion/css-transition";
import { LeadFilterBar } from "./lead-filter-bar";
import { LeadsMapPanel } from "./leads-map-panel";
import { StageChip, TEMPERATURA_LABELS, type Temperatura } from "./lead-chips";
import { filtersToQuery, useLeadFilters } from "./use-lead-filters";
import type { MapHover, MapPoint, MapStyleState } from "./leads-map-canvas";
import { pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * ============================================================================
 * MAPA LEADOVA — omotač (GL3) — plan §8
 * ============================================================================
 *
 * MapLibre se učitava tek na klijentu (`dynamic`, `ssr: false`) i tek kad ima
 * šta da se nacrta. Četiri stanja koja moraju da postoje i da se RAZLIKUJU:
 *
 *  (a) učitava se   — skelet preko cele površine + pilula „Učitavam…"
 *  (b) stil nije mogao da se učita — poruka sa razlogom + „Pokušaj ponovo"
 *  (c) nema nijedne firme sa koordinatama u preseku — kartica koja kaže
 *      ZAŠTO (skill nije puštan / ove firme nemaju koordinate / presek je
 *      prazan) + link `?koord=ne` u tabelu; mapa se tada uopšte ne montira
 *  (d) ima tačaka — mapa, legenda, brojač, bočni panel na klik
 */

const LeadsMapCanvas = dynamic(
  () => import("./leads-map-canvas").then((m) => m.LeadsMapCanvas),
  { ssr: false, loading: () => null },
);

/** Širina panela + razmak do ivice — kamera rezerviše toliko piksela desno. */
const PANEL_SIRINA_PX = 380;
const PANEL_RAZMAK_PX = 12;

type LeadsMapProps =
  | { mode: "all"; workspaceId: Id<"workspaces"> }
  | {
      mode: "single";
      workspaceId: Id<"workspaces">;
      company: Doc<"leadCompanies">;
      /** Fit osa iz `scoreCompany` — visina jedinog heksagona. */
      fit: ScoredAxis | undefined;
    };

export function LeadsMap(props: LeadsMapProps) {
  if (props.mode === "single") {
    return <LeadsMapSingle {...props} />;
  }
  return <LeadsMapAll workspaceId={props.workspaceId} />;
}

// ── Zajednički delovi ────────────────────────────────────────────────────────

function fitProcenat(fit: ScoredAxis | undefined): {
  fit: number | null;
  razlog: MapPoint["fitRazlog"];
} {
  if (!fit || fit.maxPoints === 0) return { fit: null, razlog: "bez_pravila" };
  if (fit.signalsCounted === 0) return { fit: null, razlog: "bez_signala" };
  return { fit: Math.round((fit.points / fit.maxPoints) * 100), razlog: null };
}

function fitTekst(p: Pick<MapPoint, "fit" | "fitRazlog">): string {
  if (p.fit !== null) return `${p.fit} %`;
  return p.fitRazlog === "bez_pravila" ? "bez pravila" : "bez signala";
}

/** Stanje (a): površina mape dok stižu podaci ili stil. */
function UcitavanjeMape({ tekst }: { tekst: string }) {
  return (
    <div className="absolute inset-0 z-10" role="status" aria-live="polite">
      <Skeleton className="size-full rounded-none" />
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-line bg-surface/90 px-3.5 py-1.5 text-xs text-text-muted shadow-(--elev-1)">
        <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden />
        {tekst}
      </div>
    </div>
  );
}

/** Stanje (b): izvor stila nije dostupan. Ne liči na učitavanje ni na prazno. */
function GreskaMape({ poruka, onRetry }: { poruka: string; onRetry: () => void }) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-surface p-6"
      role="alert"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="flex size-10 items-center justify-center rounded-full border border-danger/40 bg-danger/10 text-danger">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-foreground">Mapa nije mogla da se učita</p>
        <p className="text-xs leading-relaxed text-text-muted">{poruka}</p>
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5 text-xs">
          <RefreshCw className="size-3.5" aria-hidden />
          Pokušaj ponovo
        </Button>
      </div>
    </div>
  );
}

/**
 * Legenda pina (GL7): CELO telo nosi temperaturu — isto kao pin na mapi —
 * sa belim „prozorom" u glavi. Četiri pina, ne četiri kvadratića; „visina =
 * fit" je uklonjeno (visina više ne postoji, fit je u kartici i panelu).
 */
function PinIkonica({ temp }: { temp: Temperatura }) {
  const telo =
    temp === "hot"
      ? "var(--temp-hot)"
      : temp === "warm"
        ? "var(--temp-warm)"
        : temp === "cold"
          ? "var(--temp-cold)"
          : "color-mix(in srgb, var(--text-muted) 85%, var(--bg-950))";
  return (
    <svg viewBox="0 0 24 32" width="13" height="17" className="shrink-0" aria-hidden>
      <path
        d="M12 2C7 2 3 6 3 11c0 6.5 9 19 9 19s9-12.5 9-19c0-5-4-9-9-9z"
        fill={telo}
        stroke={`color-mix(in srgb, ${telo} 60%, var(--bg-950))`}
        strokeWidth="1"
      />
      <circle
        cx="12"
        cy="11"
        r="4.3"
        fill="var(--text-primary)"
        stroke={`color-mix(in srgb, ${telo} 70%, var(--bg-950))`}
        strokeWidth="1"
      />
    </svg>
  );
}

function Legenda({ className }: { className?: string }) {
  const temperature: Temperatura[] = ["hot", "warm", "cold", "nova_firma"];
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface/90 px-3 py-2 text-micro text-text-muted shadow-(--elev-1) backdrop-blur-sm",
        className,
      )}
    >
      {temperature.map((temp) => (
        <span key={temp} className="inline-flex items-center gap-1">
          <PinIkonica temp={temp} />
          {TEMPERATURA_LABELS[temp]}
        </span>
      ))}
    </div>
  );
}

// ── Puna mapa (jezičak „Mapa") ───────────────────────────────────────────────

function LeadsMapAll({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const router = useRouter();
  const { filters, args, nav, setNav, aktivnihGrupa, clearAll } = useLeadFilters();
  const data = useQuery(api.leadFiltersStore.listLeadsForMap, { workspaceId, ...args });

  const [stil, setStil] = useState<MapStyleState>({ faza: "loading" });
  const [retryKey, setRetryKey] = useState(0);
  const [hover, setHover] = useState<MapHover | null>(null);
  // Prelet hot firmi (GL4): redosled id-jeva dok traje, inače `null`.
  const [tura, setTura] = useState<string[] | null>(null);
  const okvirRef = useRef<HTMLDivElement>(null);

  const tacke = useMemo<MapPoint[]>(
    () =>
      (data?.tacke ?? []).map((t) => ({
        ...t,
        temperatura: t.temperatura ?? "nova_firma",
      })),
    [data],
  );

  // Hot firme za prelet: najveći fit prvi, pa po nazivu — obilazak kreće od
  // najizglednijih, a redosled je isti pri svakom pokretanju.
  const hotIds = useMemo(
    () =>
      tacke
        .filter((t) => t.temperatura === "hot")
        .sort(
          (a, b) =>
            (b.fit ?? -1) - (a.fit ?? -1) || a.naziv.localeCompare(b.naziv, "sr-RS"),
        )
        .map((t) => t.companyId),
    [tacke],
  );
  const onTuraKraj = useCallback(() => setTura(null), []);

  const selectedId = nav.firma;
  const izabrana = useMemo(
    () => (selectedId ? tacke.find((t) => t.companyId === selectedId) : undefined),
    [tacke, selectedId],
  );

  const onSelect = useCallback(
    (companyId: string | null) => setNav({ firma: companyId }),
    [setNav],
  );
  const onOpenProfile = useCallback(
    (companyId: string) => router.push(`/leadovi/${companyId}`),
    [router],
  );
  const onStyleState = useCallback((s: MapStyleState) => setStil(s), []);

  // Link u tabelu sa istim filterima + `koord=ne` (plan §8). Jezičak se ne
  // upisuje: podrazumevani je tabela.
  const uTabeluHref = useMemo(() => {
    const qs = filtersToQuery({ ...filters, koord: "ne" });
    return `/leadovi?${qs}`;
  }, [filters]);

  const ucitava = data === undefined;
  const praznoBezKoordinata = data !== undefined && tacke.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <LeadFilterBar workspaceId={workspaceId} />

      {/* Brojač + chip „bez koordinata" — uz traku filtera */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {ucitava ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <>
            <span>
              <strong className="font-mono tabular-nums text-foreground">
                {tacke.length}
              </strong>{" "}
              {pluralSr(tacke.length, "firma", "firme", "firmi")} na mapi
            </span>
            {data.bezKoordinata > 0 && (
              <Link
                href={uTabeluHref}
                title={"Otvara tabelu sa istim filterima i dodatim filterom „bez koordinata”."}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-2.5 py-1 font-medium text-text-muted transition-colors hover:border-line-strong hover:text-foreground"
              >
                bez koordinata:{" "}
                <span className="font-mono tabular-nums">{data.bezKoordinata}</span>
                <Table2 className="size-3" aria-hidden />
                prikaži u tabeli
              </Link>
            )}
            {stil.faza === "ready" && stil.izvor === "openfreemap" && (
              <span className="text-micro">· rezervni izvor mape (OpenFreeMap)</span>
            )}

            {/* Prelet hot firmi (GL4). Nula nije dugme: bez hot firmi u
                preseku dugme je onemogućeno i kaže zašto. */}
            <span
              className="ml-auto"
              title={
                hotIds.length === 0 ? "nema hot firmi u ovom preseku" : undefined
              }
            >
              {tura ? (
                <Button
                  size="sm"
                  variant="outline"
                  data-tura-stop
                  onClick={() => setTura(null)}
                  className="gap-1.5 text-xs"
                >
                  <Square className="size-3" aria-hidden />
                  Zaustavi prelet
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={hotIds.length === 0 || stil.faza !== "ready"}
                  onClick={() => setTura(hotIds)}
                  className="gap-1.5 text-xs"
                >
                  <Plane className="size-3.5" aria-hidden />
                  Preleti hot firme
                  {hotIds.length > 0 && (
                    <span className="font-mono tabular-nums opacity-80">
                      ({hotIds.length})
                    </span>
                  )}
                </Button>
              )}
            </span>
          </>
        )}
      </div>

      {data?.prekoracen && (
        <FeedbackNote tone="warning" title="Mapa nije potpuna">
          Filter je pregledao {data.pregledano} dodela, koliko upit najviše čita.
          Ima ih još iza te granice — suzi filter da bi mapa bila potpuna.
        </FeedbackNote>
      )}
      {data?.signaliOdseceni && (
        <FeedbackNote tone="warning" title="Neke visine su nepotpune">
          Signali su pročitani do granice od 8000 redova; firmama iza nje fit
          skor je izračunat bez dela signala, pa im je heksagon možda niži nego
          što treba.
        </FeedbackNote>
      )}
      {data?.identitetiOdseceni && (
        <FeedbackNote tone="warning" title="Filter platformi je nepotpun">
          Identiteti su pročitani do granice od 8000 redova, pa filter po
          platformi ili telefonu možda nije obuhvatio sve firme.
        </FeedbackNote>
      )}
      {selectedId && data !== undefined && !izabrana && (
        <FeedbackNote
          tone="warning"
          title="Firma iz linka nije u trenutnom preseku filtera"
          action={
            <div className="flex items-center gap-1.5">
              {aktivnihGrupa > 0 && (
                <Button size="xs" variant="outline" onClick={clearAll}>
                  Očisti filtere
                </Button>
              )}
              <Button size="xs" variant="ghost" onClick={() => setNav({ firma: null })}>
                Skloni
              </Button>
            </div>
          }
        >
          Ili nema koordinate, ili je filter ne obuhvata — mapa je zato nije
          centrirala.
        </FeedbackNote>
      )}

      {praznoBezKoordinata ? (
        <PraznoStanje
          ukupno={data.ukupno}
          saKoordinatamaUkupno={data.saKoordinatamaUkupno}
          aktivnihGrupa={aktivnihGrupa}
          uTabeluHref={uTabeluHref}
          onClearAll={clearAll}
        />
      ) : (
        <div
          ref={okvirRef}
          className="relative h-[min(70vh,720px)] min-h-[440px] overflow-hidden rounded-xl border border-line bg-surface shadow-(--elev-1)"
        >
          {ucitava ? (
            <UcitavanjeMape tekst="Učitavam firme…" />
          ) : (
            <>
              <LeadsMapCanvas
                mode="all"
                tacke={tacke}
                selectedId={izabrana ? selectedId : null}
                onSelect={onSelect}
                onOpenProfile={onOpenProfile}
                onHover={setHover}
                onStyleState={onStyleState}
                paddingRight={PANEL_SIRINA_PX + PANEL_RAZMAK_PX * 2}
                retryKey={retryKey}
                tura={tura}
                onTuraKraj={onTuraKraj}
              />
              {stil.faza === "loading" && <UcitavanjeMape tekst="Učitavam mapu…" />}
              {stil.faza === "error" && (
                <GreskaMape
                  poruka={stil.poruka}
                  onRetry={() => setRetryKey((k) => k + 1)}
                />
              )}
              {/* Kontrole zuma su gore levo (MapLibre), atribucija dole levo;
                  legenda ide desno od kontrola da panel ne prekrije ni nju
                  ni atribuciju. */}
              {stil.faza === "ready" && (
                <Legenda className="absolute left-14 top-3 z-[5]" />
              )}
              {stil.faza === "ready" && hover && (
                <HoverKartica hover={hover} okvirRef={okvirRef} />
              )}
              {izabrana && selectedId && (
                <LeadsMapPanel
                  workspaceId={workspaceId}
                  companyId={selectedId as Id<"leadCompanies">}
                  temperatura={izabrana.temperatura}
                  onClose={() => setNav({ firma: null })}
                  className="absolute inset-y-3 right-3 z-20 w-[min(380px,calc(100%-1.5rem))]"
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Stanje (c). Tri različita razloga, tri različite rečenice — jer „skill nije
 * puštan", „ove firme nemaju koordinate" i „presek je prazan" traže tri
 * različita sledeća poteza.
 */
function PraznoStanje({
  ukupno,
  saKoordinatamaUkupno,
  aktivnihGrupa,
  uTabeluHref,
  onClearAll,
}: {
  ukupno: number;
  saKoordinatamaUkupno: number;
  aktivnihGrupa: number;
  uTabeluHref: string;
  onClearAll: () => void;
}) {
  let naslov: string;
  let objasnjenje: string;
  if (ukupno === 0) {
    naslov =
      aktivnihGrupa > 0
        ? "Presek filtera je prazan"
        : "U radnom prostoru još nema nijednog dodeljenog leada";
    objasnjenje =
      aktivnihGrupa > 0
        ? "Nijedan lead ne odgovara ovim filterima, pa nema šta da se nacrta."
        : "Mapa crta dodeljene leadove sa koordinatama — prvo uvezi firme.";
  } else if (saKoordinatamaUkupno === 0) {
    naslov = `Nijedna od ${ukupno} ${pluralSr(ukupno, "firme", "firme", "firmi")} nema koordinate`;
    objasnjenje =
      "Nijedna firma u radnom prostoru još nema koordinate. Njih dodeljuje skill /generate-leads pri uvozu (Nominatim, iz adrese) — dok se skill ne pusti, mapa nema šta da nacrta.";
  } else {
    naslov = `Nijedna od ${ukupno} ${pluralSr(ukupno, "firme", "firme", "firmi")} u preseku nema koordinate`;
    objasnjenje = `U radnom prostoru ${saKoordinatamaUkupno} ${pluralSr(saKoordinatamaUkupno, "firma ima", "firme imaju", "firmi ima")} koordinate, ali nijedna nije u ovom preseku. Firme koje ih nemaju su uvezene pre skilla ili Nominatim nije našao njihovu adresu.`;
  }

  return (
    <Card className="items-center gap-3 border-line bg-surface px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border border-line bg-surface-raised text-text-muted">
        <MapPinOff className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-foreground">{naslov}</p>
      <p className="max-w-md text-xs leading-relaxed text-text-muted">{objasnjenje}</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {ukupno > 0 && (
          <Link
            href={uTabeluHref}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1.5 text-xs")}
          >
            <Table2 className="size-3.5" aria-hidden />
            Prikaži ih u tabeli ({ukupno})
          </Link>
        )}
        {aktivnihGrupa > 0 && (
          <Button size="sm" variant="ghost" onClick={onClearAll} className="text-xs">
            Očisti filtere
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Kartica iznad kursora: naziv, grad · niša, temperatura, fit, faza. Ulaz je
 * 120 ms fade + 4 px (tooltip po tabeli trajanja), pri promeni FIRME — ne pri
 * svakom pomeraju miša. Pod `prefers-reduced-motion` samo fade.
 */
function HoverKartica({
  hover,
  okvirRef,
}: {
  hover: MapHover;
  okvirRef: RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { point, x, y } = hover;

  // Položaj se upisuje pre iscrtavanja, iz stvarne širine okvira: kartica
  // uz desnu/donju ivicu se prevrće na drugu stranu kursora umesto da iscuri.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sirina = okvirRef.current?.clientWidth ?? 0;
    const visina = okvirRef.current?.clientHeight ?? 0;
    const levo = sirina > 0 && x > sirina - 280;
    const gore = visina > 0 && y > visina - 160;
    el.style.left = `${levo ? x - 14 : x + 14}px`;
    el.style.top = `${gore ? y - 14 : y + 14}px`;
    el.style.translate = `${levo ? "-100%" : "0"} ${gore ? "-100%" : "0"}`;
  }, [x, y, okvirRef]);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const still = Boolean(ctx.conditions?.still);
        if (still) holdCssTransition(el);
        gsap.set(el, still ? { opacity: 0 } : { opacity: 0, y: 4 });
        gsap.to(el, {
          opacity: 1,
          ...(still ? {} : { y: 0 }),
          duration: still ? DUR_REDUCED : 0.12,
          ease: still ? "none" : EASE_UI,
          overwrite: "auto",
          onComplete: () => releaseCssTransition(el),
        });
      });
    },
    { scope: ref, dependencies: [point.companyId] },
  );

  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none absolute z-[6] w-60 rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-(--elev-2) backdrop-blur-sm"
    >
      <p className="truncate font-semibold text-foreground">{point.naziv}</p>
      {(point.grad || point.nisa) && (
        <p className="truncate text-micro text-text-muted">
          {[point.grad, point.nisa].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-micro font-semibold",
            point.temperatura === "hot" && "border-temp-hot/50 bg-temp-hot-bg",
            point.temperatura === "warm" && "border-temp-warm/50 bg-temp-warm-bg",
            point.temperatura === "cold" && "border-temp-cold/50 bg-temp-cold-bg",
            point.temperatura === "nova_firma" && "border-line-soft bg-surface-raised text-text-muted",
          )}
        >
          {TEMPERATURA_LABELS[point.temperatura]}
        </span>
        <span className="rounded-md border border-line bg-surface-raised px-1.5 py-px text-micro">
          <span className="text-text-muted">Fit </span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {fitTekst(point)}
          </span>
        </span>
        <StageChip stage={point.faza} className="px-1.5 py-px text-micro" />
      </div>
    </div>
  );
}

// ── Mini mapa u profilu firme ────────────────────────────────────────────────

/**
 * Zašto firma nema koordinate — po `koordinateIzvor`, adresi i tragovima
 * skilla na firmi, ne nasumično. Skill (GL1) upisuje `placeId`, `imaSajt` ili
 * vreme provere sajta i kad Nominatim ne nađe adresu, pa je to razlika između
 * „skill nije puštan" i „Nominatim nije našao".
 */
function razlogBezKoordinata(c: Doc<"leadCompanies">): string {
  const imaAdresu = Boolean(c.street?.trim() || c.city?.trim());
  if (!imaAdresu) return "firma nema zabeleženu adresu, pa nema šta da se geokodira";
  const skillObradio =
    c.placeId !== undefined || c.imaSajt !== undefined || c.sajtProverenAt !== undefined;
  if (skillObradio) return "skill je obradio firmu, ali Nominatim nije našao ovu adresu";
  return "skill /generate-leads nije puštan za ovu firmu";
}

function LeadsMapSingle({ company, fit }: Extract<LeadsMapProps, { mode: "single" }>) {
  const [stil, setStil] = useState<MapStyleState>({ faza: "loading" });
  const [retryKey, setRetryKey] = useState(0);
  const onStyleState = useCallback((s: MapStyleState) => setStil(s), []);

  const tacke = useMemo<MapPoint[]>(() => {
    if (company.lat === undefined || company.lng === undefined) return [];
    const f = fitProcenat(fit);
    return [
      {
        companyId: company._id,
        naziv: company.name,
        grad: company.city ?? null,
        lat: company.lat,
        lng: company.lng,
        temperatura: company.temperatura ?? "nova_firma",
        fit: f.fit,
        fitRazlog: f.razlog,
        faza: "",
        nisa: null,
        imaSajt: company.imaSajt ?? null,
        poslednjiDodirAt: null,
        sastanakAt: null,
      },
    ];
  }, [company, fit]);

  if (tacke.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
        <MapPinOff className="size-3.5 shrink-0" aria-hidden />
        <span>Bez koordinata ({razlogBezKoordinata(company)}).</span>
      </div>
    );
  }

  return (
    <div className="relative h-56 overflow-hidden rounded-lg border border-line bg-surface">
      <LeadsMapCanvas
        mode="single"
        tacke={tacke}
        selectedId={null}
        onStyleState={onStyleState}
        retryKey={retryKey}
      />
      {stil.faza === "loading" && <UcitavanjeMape tekst="Učitavam mapu…" />}
      {stil.faza === "error" && (
        <GreskaMape poruka={stil.poruka} onRetry={() => setRetryKey((k) => k + 1)} />
      )}
      <Link
        href={`/leadovi?tab=map&firma=${company._id}`}
        className={cn(
          buttonVariants({ size: "xs", variant: "outline" }),
          "absolute right-2 top-2 z-[5] gap-1 bg-surface/90 text-micro backdrop-blur-sm",
        )}
      >
        <ExternalLink className="size-3" aria-hidden />
        Otvori na mapi
      </Link>
      {stil.faza === "ready" && (
        <span className="absolute bottom-2 right-2 z-[5] rounded-md border border-line bg-surface/90 px-2 py-0.5 text-micro text-text-muted backdrop-blur-sm">
          {company.koordinateIzvor === "rucno" ? "koordinate: ručno" : "koordinate: Nominatim"}
          {" · fit "}
          <span className="font-mono tabular-nums text-foreground">{fitTekst(tacke[0])}</span>
        </span>
      )}
    </div>
  );
}
