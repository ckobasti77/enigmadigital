"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type SelectOption<V extends string = string> = {
  value: V
  label: string
  disabled?: boolean
}

export type SelectOptionGroup<V extends string = string> = {
  label: string
  options: readonly SelectOption<V>[]
}

function jeGrupa<V extends string>(
  stavka: SelectOption<V> | SelectOptionGroup<V>
): stavka is SelectOptionGroup<V> {
  return "options" in stavka
}

function SelectRoot<V extends string>(props: SelectPrimitive.Root.Props<V>) {
  return <SelectPrimitive.Root data-slot="select" modal={false} {...props} />
}

function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className="min-w-0 flex-1 truncate text-left data-placeholder:text-text-muted"
      {...props}
    />
  )
}

/** Okidač izgleda kao polje (`ui/input.tsx`): isti obris, podloga i visina. */
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-input/30 px-2.5 text-ui whitespace-nowrap text-foreground transition-colors outline-none select-none",
        "h-8 data-[size=sm]:h-7 data-[size=sm]:px-2 data-[size=sm]:text-meta pointer-coarse:min-h-11",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "aria-invalid:border-destructive/50 aria-invalid:ring-3 aria-invalid:ring-destructive/40",
        "data-popup-open:border-ring data-disabled:cursor-not-allowed data-disabled:bg-input/80 data-disabled:text-text-muted",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="shrink-0 text-text-muted">
        <ChevronDownIcon className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "side" | "sideOffset" | "align"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        alignItemWithTrigger={false}
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50 outline-none"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-elev-2 ring-1 ring-foreground/10 outline-hidden",
            // Prelaz, ne keyframe — kao u `ui/popover.tsx`.
            "transition-[opacity,scale] duration-(--duration-fast) ease-(--ease-ui)",
            "data-open:scale-100 data-open:opacity-100",
            "data-closed:scale-95 data-closed:opacity-0",
            "data-starting-style:scale-95 data-starting-style:opacity-0",
            className
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-8 cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-2 text-ui outline-hidden select-none pointer-coarse:min-h-11",
        "data-highlighted:bg-surface-control data-highlighted:text-foreground",
        "data-selected:font-medium data-disabled:pointer-events-none data-disabled:text-text-muted",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectGroupLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn("px-2 py-1 text-meta font-medium text-text-muted", className)}
      {...props}
    />
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-line", className)}
      {...props}
    />
  )
}

export type SelectProps<V extends string> = {
  /** Ime izbora — obavezno. Uvek ide u `aria-label` okidača (isti tekst kao vidljiv natpis). */
  label: string
  /** Vidljiv natpis iznad okidača. Podrazumevano false. */
  showLabel?: boolean
  value: V | null
  onValueChange: (value: V) => void
  options: readonly (SelectOption<V> | SelectOptionGroup<V>)[]
  /** Tekst kad ništa nije izabrano („Izaberi objavu“). */
  placeholder?: string
  /** `sm`: 28 px (tabele, trake), `default`: 32 px; na dodir uvek ≥ 44 px. */
  size?: "sm" | "default"
  /** Za spoljni `<Label htmlFor>` (npr. `Field` iz `form-kit.tsx`). */
  id?: string
  name?: string
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  /** Širina okidača. */
  className?: string
  /** Dodatak ispred natpisa u okidaču i stavci (npr. tačka temperature). */
  renderOption?: (option: SelectOption<V>) => React.ReactNode
  /** Klasa okidača po izabranoj vrednosti (boja temperature u pregledu uvoza). */
  triggerClassName?: (value: V | null) => string | undefined
}

/**
 * Jedan meni za izbor (zamena za izvorni `<select>`). Radi sa tastature
 * (strelice, Home/End, kucanje, Enter/Space, Esc), ima vidljiv fokus i 44 px
 * na dodir. `label` je obavezan: ime izbora čita čitač ekrana.
 */
function Select<V extends string>({
  label,
  showLabel = false,
  value,
  onValueChange,
  options,
  placeholder,
  size = "default",
  id,
  name,
  required,
  disabled,
  invalid,
  className,
  renderOption,
  triggerClassName,
}: SelectProps<V>) {
  const ravne = React.useMemo(
    () =>
      options.flatMap((stavka) =>
        jeGrupa(stavka) ? [...stavka.options] : [stavka]
      ),
    [options]
  )
  const items = React.useMemo(
    () => ravne.map((o) => ({ value: o.value, label: o.label })),
    [ravne]
  )

  const prikaz = (o: SelectOption<V>) =>
    renderOption ? renderOption(o) : o.label

  const stavka = (o: SelectOption<V>) => (
    <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
      {prikaz(o)}
    </SelectItem>
  )

  const select = (
    <SelectRoot<V>
      items={items}
      value={value}
      onValueChange={(v) => {
        // Base UI javlja i ponovni izbor iste stavke; izvorni `<select>` tada
        // ne javlja ništa, pa ni ovde nema promene (npr. upis iste temperature).
        if (v !== null && v !== value) onValueChange(v as V)
      }}
      name={name}
      required={required}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={label}
        aria-invalid={invalid || undefined}
        className={cn(triggerClassName?.(value), className)}
      >
        <SelectValue placeholder={placeholder}>
          {(izabrano: V | null) => {
            const o = ravne.find((r) => r.value === izabrano)
            return o ? prikaz(o) : placeholder
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((stavkaIliGrupa) =>
          jeGrupa(stavkaIliGrupa) ? (
            <SelectPrimitive.Group key={stavkaIliGrupa.label}>
              <SelectGroupLabel>{stavkaIliGrupa.label}</SelectGroupLabel>
              {stavkaIliGrupa.options.map(stavka)}
            </SelectPrimitive.Group>
          ) : (
            stavka(stavkaIliGrupa)
          )
        )}
      </SelectContent>
    </SelectRoot>
  )

  if (!showLabel) return select

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-ui font-medium text-foreground">{label}</span>
      {select}
    </div>
  )
}

export {
  Select,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroupLabel,
  SelectSeparator,
}
