"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
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
  parseDateKey,
  parseRangeParams,
  RANGE_PRESETS,
  toDateKey,
  type DateRange,
  type RangePreset,
} from "@/lib/date-range";
import { formatDateSpan } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Range lives in the URL (`?range=7d` / `?from&to`), so every screen that
 * mounts this hook shares one selection and links are shareable. Must render
 * under a `<Suspense>` boundary (Next: `useSearchParams` in static routes).
 */
export function useDateRange(): {
  range: DateRange;
  setPreset: (preset: RangePreset) => void;
  setCustom: (from: string, to: string) => void;
} {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Today's key changes only at local midnight; deriving it per render keeps
  // the range honest across a long-lived tab without a timer.
  const today = toDateKey(new Date());
  const range = useMemo(
    () => parseRangeParams(params, parseDateKey(today)!),
    [params, today],
  );

  const push = useCallback(
    (next: { preset: RangePreset } | { from: string; to: string }) => {
      const qs = applyRangeParams(params, next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
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

/** Header control: preset toggles + custom span popover + resolved dates. */
export function DateRangePicker({ className }: { className?: string }) {
  const { range, setPreset, setCustom } = useDateRange();
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);

  const draftValid =
    parseDateKey(draftFrom) !== null &&
    parseDateKey(draftTo) !== null &&
    draftFrom <= draftTo;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-sm",
        className,
      )}
    >
      <div className="flex items-center gap-1 rounded-lg border border-line bg-card p-0.5">
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
              className="rounded-md! px-3 text-text-secondary aria-pressed:text-accent-400 data-pressed:text-accent-400"
            >
              {PRESET_LABEL[preset]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next) {
              setDraftFrom(range.from);
              setDraftTo(range.to);
            }
            setOpen(next);
          }}
        >
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-md px-3 text-text-secondary",
                  range.preset === "custom" && "bg-muted text-accent-400",
                )}
              />
            }
          >
            <CalendarRange data-icon="inline-start" />
            Prilagođeno
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 border border-line p-3">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draftValid) return;
                setCustom(draftFrom, draftTo);
                setOpen(false);
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor="range-from"
                    className="text-xs text-text-muted"
                  >
                    Od
                  </Label>
                  <Input
                    id="range-from"
                    type="date"
                    value={draftFrom}
                    max={draftTo}
                    onChange={(e) => setDraftFrom(e.target.value)}
                    className="font-mono text-xs tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="range-to" className="text-xs text-text-muted">
                    Do
                  </Label>
                  <Input
                    id="range-to"
                    type="date"
                    value={draftTo}
                    min={draftFrom}
                    onChange={(e) => setDraftTo(e.target.value)}
                    className="font-mono text-xs tabular-nums"
                  />
                </div>
              </div>
              <p className="text-xs leading-relaxed text-text-muted">
                Istorija seže 90 dana unazad od prve sinhronizacije.
              </p>
              <Button type="submit" size="sm" disabled={!draftValid}>
                Primeni
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>

      <p className="font-mono text-xs tabular-nums text-text-muted">
        {formatDateSpan(range.from, range.to)}
        <span className="mx-1.5 text-line-strong">·</span>
        {range.days} d
      </p>
    </div>
  );
}
