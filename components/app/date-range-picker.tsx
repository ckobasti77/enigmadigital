"use client";

import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  applyRangeParams,
  datumIzTeksta,
  kljucPerioda,
  ovajMesec,
  parseDateKey,
  periodIzTeksta,
  periodIzUpita,
  PERIOD_EVENT,
  procitajSirovPeriod,
  prosliMesec,
  RANGE_PRESETS,
  razresiPeriod,
  toDateKey,
  zapamtiPeriod,
  type DateRange,
  type RangeParams,
  type RangePreset,
} from "@/lib/date-range";
import { formatDate, formatDateSpan } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useProjekatOpciono } from "./projekat-provider";

/**
 * Ključ zapamćenog perioda: po projektu, a u hubu (bez provajdera) svoj.
 * Dok projekat ne stigne nema ključa, pa se ne čita ni ne piše tuđi period.
 */
function useKljucPerioda(): string | null {
  const projekat = useProjekatOpciono();
  if (projekat === null) return kljucPerioda(null);
  return projekat.workspaceId === null ? null : kljucPerioda(projekat.workspaceId);
}

function pretplatiNaPeriod(promena: () => void): () => void {
  window.addEventListener("storage", promena);
  window.addEventListener(PERIOD_EVENT, promena);
  return () => {
    window.removeEventListener("storage", promena);
    window.removeEventListener(PERIOD_EVENT, promena);
  };
}

/**
 * Period zapamćen za ovaj projekat na ovom uređaju (P4), ili `null`. Server
 * i prvi crtež nemaju `localStorage`, pa je tamo `null` i nema razlike pri
 * hidrataciji; zapamćen izbor stiže kadar kasnije.
 */
export function useZapamceniPeriod(): RangeParams | null {
  const kljuc = useKljucPerioda();
  const sirovo = useSyncExternalStore(
    pretplatiNaPeriod,
    () => (kljuc === null ? null : procitajSirovPeriod(kljuc)),
    () => null,
  );
  return useMemo(() => periodIzTeksta(sirovo), [sirovo]);
}

/**
 * Period ekrana. Redom važi: adresa (`?range=7d` / `?from&to`, pa su linkovi
 * deljivi), pa period zapamćen za projekat, pa 28 d. Izbor upisuje adresu i
 * pamti se, pa ga linkovi (`ProjekatLink`) nose na druge ekrane sa periodom.
 * Must render under a `<Suspense>` boundary (Next: `useSearchParams` in
 * static routes).
 */
export function useDateRange(): {
  range: DateRange;
  setPreset: (preset: RangePreset) => void;
  setCustom: (from: string, to: string) => void;
} {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const kljuc = useKljucPerioda();
  const zapamcen = useZapamceniPeriod();
  const izAdrese = useMemo(() => periodIzUpita(params), [params]);

  // Today's key changes only at local midnight; deriving it per render keeps
  // the range honest across a long-lived tab without a timer.
  const today = toDateKey(new Date());
  const range = useMemo(
    () => razresiPeriod(izAdrese ?? zapamcen, parseDateKey(today)!),
    [izAdrese, zapamcen, today],
  );

  const push = useCallback(
    (next: { preset: RangePreset } | { from: string; to: string }) => {
      if (kljuc !== null) {
        const zapis: RangeParams =
          "preset" in next ? { range: next.preset } : next;
        if (zapamtiPeriod(kljuc, zapis)) {
          window.dispatchEvent(new Event(PERIOD_EVENT));
        }
      }
      const qs = applyRangeParams(params, next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [kljuc, params, pathname, router],
  );

  return {
    range,
    setPreset: (preset) => push({ preset }),
    setCustom: (from, to) => push({ from, to }),
  };
}

const PRESET_LABEL: Record<RangePreset, string> = {
  "7d": "7 dana",
  "28d": "28 dana",
  "90d": "90 dana",
};

/** Kratak natpis za gornju traku; pun ostaje naziv za čitač ekrana. */
const PRESET_SHORT: Record<RangePreset, string> = {
  "7d": "7 d",
  "28d": "28 d",
  "90d": "90 d",
};

/**
 * Header control: preset toggles + custom span popover + resolved dates.
 *
 * `compact` je za gornju traku (UI Boost §7.2): kratki natpisi („28 d") i
 * prilagođen period kao sama ikonica, pa birač zauzima polovinu ranije širine
 * i traka više ne probija ekran na 768 i 1024 px. Svaki izbor je i dalje
 * jedan klik. Razrešeni datumi tamo dele red sa mrvicom, pa se pojavljuju tek
 * kada ima mesta; do tada ih nosi `title` birača.
 *
 * `variant="meni"` je za gornju traku telefona: jedno dugme („28 d ▾“) koje
 * otvara isti izbor, pa traka staje u jedan red.
 */
export function DateRangePicker({
  className,
  compact = false,
  variant,
}: {
  className?: string;
  compact?: boolean;
  variant?: "meni";
}) {
  if (variant === "meni") return <MeniBirac className={className} />;
  return <TrakaBirac className={className} compact={compact} />;
}

/**
 * Polja „Od/Do“ za prilagođen period, ista u oba oblika birača. Montira se
 * pri otvaranju, pa polja kreću od tekućeg perioda. Datum se kuca kao
 * „27. 10. 2026.“ (pregledačev `type="date"` piše format jezika pregledača).
 */
function PrilagodjenPeriod({
  range,
  onApply,
}: {
  range: DateRange;
  onApply: (from: string, to: string) => void;
}) {
  const [draftFrom, setDraftFrom] = useState(formatDate(range.from));
  const [draftTo, setDraftTo] = useState(formatDate(range.to));
  const [diran, setDiran] = useState({ from: false, to: false });

  const fromKey = datumIzTeksta(draftFrom, new Date());
  const toKey = datumIzTeksta(draftTo, new Date());
  const draftValid = fromKey !== null && toKey !== null && fromKey <= toKey;

  const popuni = (p: { from: string; to: string }) => {
    setDraftFrom(formatDate(p.from));
    setDraftTo(formatDate(p.to));
    setDiran({ from: false, to: false });
  };

  const greska = (key: string | null, tekst: string, jeDiran: boolean) =>
    jeDiran && tekst.trim() !== "" && key === null
      ? "Upiši datum kao 27. 10. 2026."
      : null;
  const greskaOd = greska(fromKey, draftFrom, diran.from);
  const greskaDo = greska(toKey, draftTo, diran.to);
  const redosled =
    fromKey !== null && toKey !== null && fromKey > toKey
      ? "„Od“ mora biti pre „Do“."
      : null;

  const poNapustanju = (polje: "from" | "to") => {
    const key = polje === "from" ? fromKey : toKey;
    if (key !== null) {
      (polje === "from" ? setDraftFrom : setDraftTo)(formatDate(key));
    }
    setDiran((d) => ({ ...d, [polje]: true }));
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draftValid || fromKey === null || toKey === null) return;
        onApply(fromKey, toKey);
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => popuni(ovajMesec(new Date()))}
        >
          Ovaj mesec
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => popuni(prosliMesec(new Date()))}
        >
          Prošli mesec
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="range-from" className="text-xs text-text-muted">
            Od
          </Label>
          <Input
            id="range-from"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="27. 10. 2026."
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            onBlur={() => poNapustanju("from")}
            aria-invalid={greskaOd ? true : undefined}
            aria-describedby={greskaOd ? "range-from-greska" : undefined}
            className="text-xs tabular-nums"
          />
          {greskaOd && (
            <p id="range-from-greska" className="text-xs text-danger">
              {greskaOd}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="range-to" className="text-xs text-text-muted">
            Do
          </Label>
          <Input
            id="range-to"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="27. 10. 2026."
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            onBlur={() => poNapustanju("to")}
            aria-invalid={greskaDo ? true : undefined}
            aria-describedby={greskaDo ? "range-to-greska" : undefined}
            className="text-xs tabular-nums"
          />
          {greskaDo && (
            <p id="range-to-greska" className="text-xs text-danger">
              {greskaDo}
            </p>
          )}
        </div>
      </div>
      {redosled && <p className="text-xs text-danger">{redosled}</p>}
      <p className="text-xs leading-relaxed text-text-muted">
        Istorija seže 90 dana unazad od prve sinhronizacije.
      </p>
      <Button variant="secondary" type="submit" size="sm" disabled={!draftValid}>
        Primeni
      </Button>
    </form>
  );
}

function TrakaBirac({
  className,
  compact,
}: {
  className?: string;
  compact: boolean;
}) {
  const { range, setPreset, setCustom } = useDateRange();
  const [open, setOpen] = useState(false);

  const span = `${formatDateSpan(range.from, range.to)} · ${range.days} d`;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 text-sm",
        className,
      )}
    >
      <div
        title={compact ? span : undefined}
        className="flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5"
      >
        <ToggleGroup
          value={range.preset === "custom" ? [] : [range.preset]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) setPreset(next as RangePreset);
          }}
          spacing={0}
          aria-label="Period"
        >
          {RANGE_PRESETS.map((preset) => (
            <ToggleGroupItem
              key={preset}
              value={preset}
              size="sm"
              aria-label={compact ? PRESET_LABEL[preset] : undefined}
              className={cn(
                "cursor-pointer rounded-md! text-text-secondary aria-pressed:text-foreground data-pressed:text-foreground",
                // Svoj red birač ima samo na telefonu, pa su tamo mete 44 px.
                compact ? "px-2" : "h-11 px-3",
              )}
            >
              {compact ? PRESET_SHORT[preset] : PRESET_LABEL[preset]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size={compact ? "icon-sm" : "sm"}
                aria-label={compact ? "Prilagođen period" : undefined}
                title={compact ? "Prilagođen period" : undefined}
                className={cn(
                  "rounded-md text-text-secondary",
                  !compact && "h-11 px-3",
                  range.preset === "custom" && "bg-muted text-radnja",
                )}
              />
            }
          >
            <CalendarRange data-icon={compact ? undefined : "inline-start"} />
            {!compact && "Prilagođeno"}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 border border-line p-3">
            <PrilagodjenPeriod
              range={range}
              onApply={(from, to) => {
                setCustom(from, to);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Razrešen opseg je IMENILAC svakog broja na ekranu (plan §4) — bez
          njega „40" ne znači ništa. Zato se u gornjoj traci (`compact`) krije
          tek na uskom desktopu (< lg), a u svom redu (mobilni, `compact=false`)
          se uvek vidi. */}
      <p
        className={cn(
          "whitespace-nowrap font-mono text-xs tabular-nums text-text-muted",
          compact && "hidden lg:block",
        )}
      >
        {formatDateSpan(range.from, range.to)}
        <span className="mx-1.5 text-line-strong">·</span>
        {range.days} d
      </p>
    </div>
  );
}

/**
 * Telefon: jedno dugme sa tekućim periodom. Meni nosi isti izbor kao traka
 * (7 / 28 / 90 d i prilagođen raspon) i razrešene datume, imenilac brojeva.
 */
function MeniBirac({ className }: { className?: string }) {
  const { range, setPreset, setCustom } = useDateRange();
  const [open, setOpen] = useState(false);
  const [prilagodjen, setPrilagodjen] = useState(false);

  const natpis =
    range.preset === "custom"
      ? formatDateSpan(range.from, range.to)
      : PRESET_SHORT[range.preset];
  const pun =
    range.preset === "custom"
      ? `${formatDateSpan(range.from, range.to)}, ${range.days} dana`
      : PRESET_LABEL[range.preset];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setPrilagodjen(range.preset === "custom");
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Period: ${pun}`}
            className={cn(
              "touch-target h-8 gap-1 whitespace-nowrap px-2.5 text-sm tabular-nums",
              className,
            )}
          />
        }
      >
        {natpis}
        <ChevronDown data-icon="inline-end" className="text-text-muted" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 border border-line p-3">
        <div className="flex flex-col gap-3">
          <ToggleGroup
            value={range.preset === "custom" ? [] : [range.preset]}
            onValueChange={(value) => {
              const next = value[0];
              if (!next) return;
              setPreset(next as RangePreset);
              setOpen(false);
            }}
            spacing={0}
            aria-label="Period"
            className="w-full rounded-lg border border-line bg-card p-0.5"
          >
            {RANGE_PRESETS.map((preset) => (
              <ToggleGroupItem
                key={preset}
                value={preset}
                aria-label={PRESET_LABEL[preset]}
                className="h-11 flex-1 cursor-pointer rounded-md! text-text-secondary aria-pressed:text-foreground data-pressed:text-foreground"
              >
                {PRESET_SHORT[preset]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs tabular-nums text-text-muted">
            {formatDateSpan(range.from, range.to)} · {range.days} d
          </p>
          {prilagodjen ? (
            <PrilagodjenPeriod
              range={range}
              onApply={(from, to) => {
                setCustom(from, to);
                setOpen(false);
              }}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="touch-target h-11 justify-start px-2 text-text-secondary"
              onClick={() => setPrilagodjen(true)}
            >
              <CalendarRange data-icon="inline-start" />
              Prilagođen period…
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
