"use client";

// Preneto iz Devotion apps/web/components/ui/date-picker.tsx (main @ c05c40f), SPAJANJE S12.
import {
  cloneElement,
  isValidElement,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactElement,
  type Ref,
} from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  CALENDAR_WEEKDAYS,
  calendarMoveForKey,
  datePickerChips,
  dayAriaLabel,
  dayKeyOfDue,
  dueFromDayKey,
  formatMonthTitle,
  monthGrid,
  monthKeyOf,
  moveCalendarFocus,
  selectedDatePickerChip,
} from "@/lib/prostor/calendar";
import { dayKeyOf, formatDateShort, SR_WEEKDAYS, type DayKey } from "@/lib/prostor/dates";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ARRIVE_Y, DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

export type DatePickerPanelProps = {
  /** Lokalno podne izabranog dana ili `null`. */
  value: number | null;
  now: number;
  /** Izbor čipa ili dana — uvek lokalno podne (ili `null` za „Bez roka"). */
  onSelect: (value: number | null) => void;
  /** Čip „Bez roka" (podrazumevano da). */
  allowClear?: boolean;
  className?: string;
};

/**
 * Sadržaj birača datuma (P9, plan K07 §1.4): čipovi brzog izbora (Danas,
 * Sutra, Vikend, Sledeće nedelje, Bez roka) i mesečni kalendar — ponedeljak
 * prvi, srpski nazivi. Tastatura po obrascu WAI-ARIA: strelice dan/nedelja,
 * PageUp/PageDown mesec (Shift: godina), Home/End početak i kraj nedelje,
 * Enter/Space bira. Vrednost je lokalno podne (shared `dueFromDayKey`).
 *
 * Izbor nije boja radnje: izabran čip i izabran dan su neutralno jaki
 * (`foreground`), „danas" nosi liniju od 1 px u boji teksta.
 */
export function DatePickerPanel({ value, now, onSelect, allowClear = true, className }: DatePickerPanelProps) {
  const todayKey = dayKeyOf(now);
  const selectedKey = dayKeyOfDue(value);
  const [focusKey, setFocusKey] = useState<DayKey>(selectedKey ?? todayKey);
  const month = monthKeyOf(focusKey);
  const weeks = useMemo(() => monthGrid(month, { todayKey, selectedKey }), [month, todayKey, selectedKey]);
  const chips = useMemo(() => datePickerChips(now, { allowClear }), [now, allowClear]);
  const selectedChip = selectedDatePickerChip(value, now);
  const titleId = useId();

  const gridRef = useRef<HTMLDivElement>(null);
  // Fokus prati aktivan dan samo kad je korisnik već u mreži (tastatura).
  const moveFocusToGrid = useRef(false);
  const previousMonth = useRef(month);

  useLayoutEffect(() => {
    if (!moveFocusToGrid.current) return;
    moveFocusToGrid.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('[data-active-day="true"]')?.focus({ preventScroll: true });
  }, [focusKey]);

  // Promena meseca: mreža doputuje ±6 px uz neprozirnost (jedini pokret birača);
  // pod smanjenim pokretom samo kratko izbledi.
  useGSAP(
    () => {
      if (previousMonth.current === month) return;
      const direction = month > previousMonth.current ? 1 : -1;
      previousMonth.current = month;
      const grid = gridRef.current;
      if (!grid) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) {
          gsap.fromTo(
            grid,
            { opacity: 0 },
            { opacity: 1, duration: DUR_REDUCED, ease: "none", overwrite: "auto", clearProps: "opacity" },
          );
          return;
        }
        gsap.fromTo(
          grid,
          { opacity: 0, x: ARRIVE_Y * direction },
          { opacity: 1, x: 0, duration: DUR_UI, ease: EASE_UI, overwrite: "auto", clearProps: "opacity,transform" },
        );
      });
    },
    { dependencies: [month], scope: gridRef },
  );

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Alt+← (nazad u pregledaču) i Ctrl/⌘ prečice pripadaju pregledaču.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const move = calendarMoveForKey(event.key, event.shiftKey);
    if (move === null) return;
    event.preventDefault();
    moveFocusToGrid.current = true;
    setFocusKey((current) => moveCalendarFocus(current, move));
  };

  const stepMonth = (delta: -1 | 1) =>
    setFocusKey((current) => moveCalendarFocus(current, delta === 1 ? "nextMonth" : "prevMonth"));

  return (
    <div className={cn("w-[17.5rem] space-y-3 pointer-coarse:w-[20.5rem]", className)}>
      <div role="group" aria-label="Brzi izbor" className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const selected = selectedChip === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={selected}
              title={chip.value === null ? undefined : formatDateShort(chip.value)}
              onClick={() => onSelect(chip.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-meta font-medium transition-colors pointer-coarse:h-11 pointer-coarse:px-3.5",
                selected
                  ? "border-line-strong bg-surface-control-hover text-foreground"
                  : "border-line bg-transparent text-text-secondary hover:bg-surface-control-hover hover:text-foreground",
              )}
            >
              {selected ? <Check className="size-3" aria-hidden="true" /> : null}
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p id={titleId} aria-live="polite" className="pl-1 text-sm font-semibold">
            {formatMonthTitle(month)}
          </p>
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Prethodni mesec"
              onClick={() => stepMonth(-1)}
              className="text-text-secondary"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Sledeći mesec"
              onClick={() => stepMonth(1)}
              className="text-text-secondary"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div ref={gridRef} role="grid" aria-labelledby={titleId} onKeyDown={onGridKeyDown} className="select-none">
          <div role="row" className="grid grid-cols-7">
            {CALENDAR_WEEKDAYS.map((label, index) => (
              <span
                key={label}
                role="columnheader"
                aria-label={SR_WEEKDAYS[index]}
                className="grid h-7 place-items-center text-meta font-medium text-text-muted"
              >
                {label}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0].key} role="row" className="grid grid-cols-7">
              {week.map((day) => {
                const active = day.key === focusKey;
                return (
                  <span key={day.key} role="gridcell" aria-selected={day.isSelected} className="grid place-items-center p-px">
                    <button
                      type="button"
                      tabIndex={active ? 0 : -1}
                      data-active-day={active ? "true" : undefined}
                      aria-label={dayAriaLabel(day.key, todayKey)}
                      aria-pressed={day.isSelected}
                      onClick={() => onSelect(dueFromDayKey(day.key))}
                      onFocus={() => setFocusKey(day.key)}
                      className={cn(
                        "relative grid size-9 place-items-center rounded-lg text-sm tabular-nums transition-colors focus-visible:-outline-offset-2 pointer-coarse:size-11",
                        day.isSelected
                          ? "bg-foreground font-semibold text-background hover:bg-foreground/90"
                          : day.inMonth
                            ? "text-foreground hover:bg-surface-control-hover"
                            : "text-text-muted hover:bg-surface-control-hover",
                        day.isToday && !day.isSelected && "font-semibold",
                      )}
                    >
                      {day.day}
                      {day.isToday ? (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-1 left-1/2 h-px w-3 -translate-x-1/2 rounded-full bg-current"
                        />
                      ) : null}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <p className="px-1 text-meta leading-4 text-text-muted pointer-coarse:hidden">
          Strelice biraju dan, Enter potvrđuje.
        </p>
      </div>
    </div>
  );
}

export type DatePickerProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  now: number;
  /** Okidač: jedan element koji prima ref i događaje (ide u `render` okidača popovera). */
  children: ReactElement;
  /**
   * Element uz koji se popover postavlja umesto uz okidač (npr. desna ivica
   * reda kad je okidač sakriven na dodiru ili kad ga otvara prečica `d`).
   * Renderuje se na mestu birača; mora biti običan DOM element, jer mu birač
   * upisuje ref.
   */
  anchor?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  allowClear?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  /**
   * Gde ide fokus posle zatvaranja (podrazumevano okidač). Funkcija vraća
   * element, `true` (podrazumevano) ili `false` (ništa — pozivalac sam fokusira).
   */
  finalFocus?: ComponentProps<typeof PopoverContent>["finalFocus"];
};

/**
 * Birač datuma (P9): popover sa čipovima i kalendarom; izbor zatvara popover.
 * Pri otvaranju fokus dobija izabrani dan (ili danas), pa strelice odmah rade.
 * Zamenjuje izvorni datumski input (mm/dd/yyyy) za rok zadatka svuda: lični
 * nivo od K11, zadaci u projektu od K17.
 */
export function DatePicker({
  value,
  onChange,
  now,
  children,
  anchor,
  open: controlledOpen,
  onOpenChange,
  allowClear = true,
  align = "start",
  side = "bottom",
  finalFocus,
}: DatePickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const contentRef = useRef<HTMLDivElement>(null);
  // Sidro je stanje, ne ref: pozicioner dobija element tek kad se prikači.
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children} />
      {isValidElement<{ ref?: Ref<HTMLElement> }>(anchor) ? cloneElement(anchor, { ref: setAnchorElement }) : null}
      <PopoverContent
        ref={contentRef}
        align={align}
        side={side}
        anchor={anchor ? anchorElement : undefined}
        aria-label="Izaberi rok"
        className="w-auto"
        initialFocus={() =>
          contentRef.current?.querySelector<HTMLElement>('[data-active-day="true"]') ?? true
        }
        finalFocus={finalFocus}
      >
        <DatePickerPanel
          value={value}
          now={now}
          allowClear={allowClear}
          onSelect={(next) => {
            setOpen(false);
            onChange(next);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
