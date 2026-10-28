"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Polje za potvrdu. Čekirano je u boji radnje na svakom modulu (ULTRA P1).
 *
 * Koren je zona dodira: na mišu 16 × 16, a pod `pointer: coarse` najmanje
 * 44 × 44 px; kućica ostaje 16 × 16 u sredini.
 */
function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer inline-flex shrink-0 items-center justify-center rounded-[min(var(--radius-sm),6px)] outline-none disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        className
      )}
      {...props}
    >
      <span
        data-slot="checkbox-box"
        className="flex size-4 shrink-0 items-center justify-center rounded-[min(var(--radius-sm),6px)] border border-input transition-colors group-focus-visible/checkbox:border-ring group-data-[checked]/checkbox:border-radnja group-data-[checked]/checkbox:bg-radnja group-data-[checked]/checkbox:text-radnja-tekst group-data-[indeterminate]/checkbox:border-radnja group-data-[indeterminate]/checkbox:bg-radnja group-data-[indeterminate]/checkbox:text-radnja-tekst"
      >
        <CheckboxPrimitive.Indicator
          data-slot="checkbox-indicator"
          className="flex items-center justify-center text-current"
          render={(indicatorProps, state) => (
            <span {...indicatorProps}>
              {state.indeterminate ? (
                <Minus className="size-3" />
              ) : (
                <Check className="size-3" />
              )}
            </span>
          )}
        />
      </span>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
