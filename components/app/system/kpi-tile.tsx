"use client";

import { useId, type ComponentType, type ReactNode } from "react";
import { ProjekatLink } from "@/components/app/projekat-link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/motion/count-up";
import type { MetricState } from "@/convex/lib/igMetrics";
import {
  dobraPromenaPoSmeru,
  mera as meraIzRecnika,
  type KljucMere,
  type SmerMere,
} from "@/lib/mere";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * KPI PLOČICA — jedna za celu aplikaciju (A1 §3, v2 u B2)
 * ============================================================================
 *
 * Natpis, brojka, poređenje sa prethodnim periodom i sparklinija. Vlasnik je
 * ovaj fajl; `components/app/analytics/kpi-tile.tsx` samo prosleđuje, da 10
 * postojećih uvoza ostane netaknuto.
 *
 * POŠTENO POREĐENJE. Izmereno 9.9.2026: 7/7 pločica na Kontrolnoj tabli i
 * 5/5 na Instagramu ispisivalo je „— — vs prethodnih 28 d" — prazan red pune
 * veličine, dvadeset puta kroz aplikaciju. Sada:
 *
 *   - poređenje se crta SAMO kad delta postoji (broj, ne null/undefined);
 *   - bez poređenja red ne postoji; umesto njega stoji `note` ako pozivalac
 *     ima šta da kaže („od 3 ukupno", „zbir za period"), inače ništa;
 *   - visina pločice je ista u svojoj veličini, pa mreža ostaje ravna kad
 *     jedna pločica ima poređenje a susedna nema.
 *
 * Tri stanja mere (G1): kad `state` nije `"value"`, umesto broja stoji crtica
 * i razlog — nula i „nema podatka" nikad ne izgledaju isto.
 *
 * v2 (UI Boost §5.3):
 *   - tri veličine: `hero` (fokus broj ekrana, 40 px, u boji modula),
 *     `default` (28 px) i `compact` (20 px, bez linije);
 *   - delta je PILULA: strelica kaže smer, boja kaže da li je to dobro.
 *     Smer daje rečnik mera (`mera="potrosnja"` → pad je dobra vest; vidi
 *     `lib/mere.ts`); `higherIsBetter` ostaje samo za pozive bez `mera`;
 *   - sparklinija je u boji modula i premošćuje rupe (vidi `Sparkline`);
 *   - sa `href` cela pločica vodi na detalj.
 *
 * Postojeći pozivi rade bez izmene: svaki novi prop ima podrazumevanu
 * vrednost koja daje dosadašnje ponašanje.
 */
export type KpiDelta =
  | { kind: "pct"; value: number | null | undefined }
  | { kind: "pp"; value: number | null | undefined };

export type KpiSize = "hero" | "default" | "compact";

type TileIcon = ComponentType<{ className?: string }>;

const HEIGHT: Record<KpiSize, string> = {
  hero: "h-48",
  default: "h-40",
  compact: "h-24",
};

const VALUE: Record<KpiSize, string> = {
  hero: "text-hero",
  default: "text-metric",
  compact: "text-title",
};

const CARD = "gap-0 py-0 shadow-card ring-line";

export function KpiTile({
  label,
  value,
  format,
  delta,
  formatDelta,
  compareLabel,
  note,
  spark = [],
  primary = false,
  state = "value",
  reason,
  size = "default",
  icon,
  higherIsBetter = true,
  mera,
  href,
  shortLabel,
}: {
  label: string;
  /** Kraći natpis za uske pločice (telefon, dve kolone) — da se pun ne seče. */
  shortLabel?: string;
  value: number | undefined;
  format: (v: number) => string;
  /** Promena u odnosu na prethodni period. `value` null/undefined = nema poređenja. */
  delta?: KpiDelta;
  formatDelta?: (v: number) => string;
  /** „vs prethodnih 28 d" — crta se samo uz stvarnu deltu. */
  compareLabel?: string;
  /** Jedna linija kad poređenja nema („od 3 ukupno"). Opciono. */
  note?: string;
  spark?: (number | undefined)[];
  /** Broj u boji modula. `hero` ga nosi uvek. */
  primary?: boolean;
  state?: MetricState;
  reason?: string;
  size?: KpiSize;
  /** Ikonica mere, u pločici boje modula. */
  icon?: TileIcon;
  /** Da li je rast dobra vest. Ignoriše se kad je data `mera`. */
  higherIsBetter?: boolean;
  /** Ključ iz rečnika mera; kad je dat, smer promene dolazi odatle. */
  mera?: KljucMere;
  /** Detalj mere — cela pločica postaje link. */
  href?: string;
}) {
  const compact = size === "compact";
  const smer: SmerMere = mera
    ? meraIzRecnika(mera).smer
    : higherIsBetter
      ? "vise"
      : "manje";

  if (state !== "value" || value === undefined) {
    return (
      <TileShell href={href} label={label}>
        <div className={cn("flex flex-col px-5 pt-4", HEIGHT[size])}>
          <TileLabel label={label} shortLabel={shortLabel} icon={icon} />
          <span
            className={cn(
              "mt-2 block font-mono font-bold leading-none text-text-muted tabular-nums",
              VALUE[size],
            )}
          >
            —
          </span>
          <p
            className={cn(
              "text-ui leading-relaxed text-text-muted",
              compact ? "mt-1 truncate" : "mt-3",
            )}
          >
            {reason ??
              (state === "suppressed"
                ? "Nedovoljno podataka za prikaz."
                : state === "unavailable"
                  ? "Podatak nije dostupan za ovaj period."
                  : "Merenje ove metrike je početo kasnije; stariji dani nemaju podatak.")}
          </p>
        </div>
      </TileShell>
    );
  }

  const d = delta?.value;
  const hasComparison =
    d !== null && d !== undefined && Number.isFinite(d) && formatDelta !== undefined;
  const hasSpark = !compact && spark.some((v) => v !== undefined && v !== null);
  const accent = primary || size === "hero";

  const number = (
    <CountUp
      value={value}
      // Pri otvaranju odbrojava samo fokus broj ekrana (`hero`).
      from={size === "hero" ? 0 : undefined}
      format={format}
      className={cn(
        "block font-mono font-bold leading-none",
        VALUE[size],
        accent ? "text-mod" : "text-foreground",
      )}
    />
  );

  const pill = hasComparison ? (
    <DeltaPill value={d} format={formatDelta} smer={smer} />
  ) : null;

  if (compact) {
    return (
      <TileShell href={href} label={label}>
        <div className={cn("flex flex-col justify-between px-4 py-3", HEIGHT.compact)}>
          <TileLabel label={label} shortLabel={shortLabel} icon={icon} />
          <div className="flex items-baseline justify-between gap-2">
            {number}
            {pill ??
              (note ? (
                <span className="truncate text-meta text-text-muted">{note}</span>
              ) : null)}
          </div>
        </div>
      </TileShell>
    );
  }

  return (
    <TileShell href={href} label={label}>
      <div className={cn("flex flex-col px-5 pt-4 pb-4", HEIGHT[size])}>
        <TileLabel label={label} shortLabel={shortLabel} icon={icon} />
        <div className="mt-2">{number}</div>
        {pill ? (
          <div className="mt-2 flex items-center gap-1.5 text-ui">
            {pill}
            {compareLabel && (
              <span className="truncate text-text-muted">{compareLabel}</span>
            )}
          </div>
        ) : note ? (
          <p className="mt-2 text-ui text-text-muted">{note}</p>
        ) : null}
        {hasSpark && <Sparkline values={spark} className="mt-auto text-mod" />}
      </div>
    </TileShell>
  );
}

/**
 * Omotač pločice. Sa `href` je cela pločica jedan link: podigne se na hover,
 * dobije ivicu u boji modula i strelicu — tri znaka da vodi negde, a nijedan
 * ne pomera raspored.
 */
function TileShell({
  href,
  label,
  children,
}: {
  href?: string;
  label: string;
  children: ReactNode;
}) {
  if (!href) {
    return (
      <Card className={CARD} size="sm">
        {children}
      </Card>
    );
  }
  return (
    <ProjekatLink
      href={href}
      aria-label={`${label} — otvori detalj`}
      className="group/tile hover-lift relative block cursor-pointer rounded-xl"
    >
      <Card
        className={cn(
          CARD,
          "transition-shadow duration-(--duration-base) group-hover/tile:ring-mod-line group-focus-visible/tile:ring-mod-line",
        )}
        size="sm"
      >
        {children}
      </Card>
      <ArrowUpRight
        aria-hidden
        className="absolute top-3 right-3 size-4 text-mod opacity-0 transition-opacity duration-(--duration-fast) group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100"
      />
    </ProjekatLink>
  );
}

function TileLabel({
  label,
  shortLabel,
  icon: Icon,
}: {
  label: string;
  shortLabel?: string;
  icon?: TileIcon;
}) {
  return (
    <div className="flex items-center gap-2">
      {Icon && (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-mod-soft text-mod">
          <Icon className="size-3.5" aria-hidden />
        </span>
      )}
      <p className="heading-caps truncate text-meta font-medium text-text-muted">
        {shortLabel ? (
          <>
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </p>
    </div>
  );
}

/**
 * Promena kao pilula. Strelica i znak nose SMER, boja nosi OCENU — pa „▼ 12 %"
 * na CPA može da bude zeleno, a čovek koji ne razlikuje crvenu i zelenu i
 * dalje vidi kuda je broj otišao.
 */
export function DeltaPill({
  value,
  format,
  higherIsBetter = true,
  smer,
  className,
}: {
  value: number;
  format: (v: number) => string;
  higherIsBetter?: boolean;
  /** Smer iz rečnika mera; `neutralno` daje prigušenu pilulu. Ima prednost. */
  smer?: SmerMere;
  className?: string;
}) {
  const flat = Math.abs(value) < 1e-9;
  const up = value > 0;
  const good = dobraPromenaPoSmeru(
    smer ?? (higherIsBetter ? "vise" : "manje"),
    value,
  );
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 font-mono text-meta font-medium leading-none tabular-nums",
        good === null && "bg-surface-raised text-text-muted",
        good === true && "bg-success-soft text-success",
        good === false && "bg-danger-soft text-danger",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {format(value)}
    </span>
  );
}

/**
 * KPI bez poređenja i bez linije: mera koja za period postoji samo kao zbir.
 * Niža je od `KpiTile` tačno za sparkliniju — red sa istim ovakvim pločicama
 * ne laže praznim prostorom.
 */
export function StatTile({
  label,
  value,
  format,
  note,
  icon: Icon,
  valueClassName,
  constant = false,
  href,
}: {
  label: string;
  value: number | undefined;
  format: (v: number) => string;
  /** Šta broj znači — jedna linija, bez ponavljanja natpisa. */
  note: string;
  icon: ComponentType<{ className?: string }>;
  valueClassName?: string;
  /** Vrednost je podešavanje, ne mera — ispisuje se bez odbrojavanja (F7). */
  constant?: boolean;
  /** Detalj mere — cela pločica postaje link. */
  href?: string;
}) {
  return (
    <TileShell href={href} label={label}>
      <div className="flex h-32 flex-col justify-between px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="heading-caps text-meta font-medium text-text-muted">
            {label}
          </p>
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md bg-mod-soft text-mod",
              // Strelica linka stoji u istom uglu; ikonica joj ustupa mesto.
              href && "transition-opacity group-hover/tile:opacity-0 group-focus-visible/tile:opacity-0",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
        </div>
        <div>
          {value !== undefined && constant ? (
            <span
              className={cn(
                "block font-mono text-metric font-bold leading-none tabular-nums",
                valueClassName ?? "text-foreground",
              )}
            >
              {format(value)}
            </span>
          ) : value !== undefined ? (
            <CountUp
              value={value}
              format={format}
              className={cn(
                "block font-mono text-metric font-bold leading-none",
                valueClassName ?? "text-foreground",
              )}
            />
          ) : (
            <span className="block font-mono text-metric font-bold leading-none text-text-muted tabular-nums">
              —
            </span>
          )}
          <p className="mt-1.5 text-ui text-text-muted">{note}</p>
        </div>
      </div>
    </TileShell>
  );
}

export function StatTileSkeleton() {
  return (
    <Card className={CARD} size="sm">
      <div className="flex h-32 flex-col justify-between px-5 py-4">
        <Skeleton className="h-3 w-24" />
        <div>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      </div>
    </Card>
  );
}

/** Isti otisak kao učitana pločica — podaci ništa ne pomeraju. */
export function KpiTileSkeleton({ size = "default" }: { size?: KpiSize }) {
  if (size === "compact") {
    return (
      <Card className={CARD} size="sm">
        <div className={cn("flex flex-col justify-between px-4 py-3", HEIGHT.compact)}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      </Card>
    );
  }
  return (
    <Card className={CARD} size="sm">
      <div className={cn("flex flex-col px-5 pt-4", HEIGHT[size])}>
        <Skeleton className="h-3 w-20" />
        <Skeleton className={cn("mt-3 w-28", size === "hero" ? "h-10" : "h-8")} />
        <Skeleton className="mt-3 h-3 w-32" />
        <Skeleton className="mt-auto mb-4 h-8 w-full" />
      </div>
    </Card>
  );
}

const SPARK_W = 100;
const SPARK_H = 32;

/**
 * Inline SVG sparklinija — fiksan viewBox razvučen na širinu pločice, pa ne
 * meri ništa i ne treperi.
 *
 * OTPORNA NA RUPE (F4, UI Boost §5.3). Dan bez podatka nije nula i ne
 * interpolira se — ali linija isečena na komadiće izgleda pokvareno. Zato:
 *
 *   - izmereni dani su puna linija sa gradijentom površine;
 *   - rupa između dva izmerena komada je TIHA ISPREKIDANA linija od poslednje
 *     izmerene tačke do sledeće: kaže „ovde nema merenja", ne „ovde je bilo
 *     toliko";
 *   - usamljena tačka je tačka.
 *
 * Usamljena tačka je linija dužine nula sa zaobljenim krajem, ne `<circle>`:
 * viewBox se razvlači po širini, pa bi krug ispao vodoravna crtica (F4).
 * Uz `non-scaling-stroke` debljina 3 daje pravu tačku r = 1,5 px.
 */
function Sparkline({
  values,
  className,
}: {
  values: (number | undefined)[];
  className?: string;
}) {
  const gradientId = useId();
  const defined = values.filter((v): v is number => v !== undefined && v !== null);
  if (defined.length === 0) return null;

  const max = Math.max(1, ...defined);
  const n = values.length;

  const segments: Array<Array<[number, number]>> = [];
  let currentSegment: Array<[number, number]> = [];

  values.forEach((v, i) => {
    if (v !== undefined && v !== null) {
      const x = n === 1 ? SPARK_W / 2 : (i / (n - 1)) * SPARK_W;
      const y = SPARK_H - 2 - (v / max) * (SPARK_H - 4);
      currentSegment.push([x, y]);
    } else if (currentSegment.length > 0) {
      segments.push(currentSegment);
      currentSegment = [];
    }
  });
  if (currentSegment.length > 0) segments.push(currentSegment);

  const point = ([x, y]: [number, number]) => `${x.toFixed(2)},${y.toFixed(2)}`;

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Mostovi preko rupa — ispod linija, da krajevi ostanu čisti. */}
      {segments.slice(1).map((seg, i) => {
        const from = segments[i][segments[i].length - 1];
        const to = seg[0];
        return (
          <line
            key={`gap-${i}`}
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
            stroke="currentColor"
            strokeOpacity={0.4}
            strokeWidth={1}
            strokeDasharray="2 3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {segments.map((seg, sIdx) => {
        if (seg.length === 1) {
          const [cx, cy] = seg[0];
          return (
            <line
              key={sIdx}
              x1={cx}
              y1={cy}
              x2={cx}
              y2={cy}
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        const line = seg.map(point).join(" ");
        const firstX = seg[0][0].toFixed(2);
        const lastX = seg[seg.length - 1][0].toFixed(2);
        const area = `M${firstX},${SPARK_H} L${line.replace(/ /g, " L")} L${lastX},${SPARK_H} Z`;
        return (
          <g key={sIdx}>
            <path d={area} fill={`url(#${gradientId})`} />
            <polyline
              points={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </svg>
  );
}
