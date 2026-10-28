"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

/**
 * Prekidač. Uključen je u boji radnje na svakom modulu (ULTRA P1), da
 * „uključeno" nikad ne izgleda kao isključeno.
 *
 * Koren je zona dodira: na mišu je veličine staze (36 × 20), a pod
 * `pointer: coarse` najmanje 44 × 44 px; staza ostaje iste veličine u sredini.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch peer inline-flex shrink-0 items-center justify-center rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        className
      )}
      {...props}
    >
      <span
        data-slot="switch-track"
        className="inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-line-control bg-surface-raised p-0.5 transition-colors group-focus-visible/switch:border-ring group-data-[checked]/switch:border-radnja group-data-[checked]/switch:bg-radnja"
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className="pointer-events-none block size-3.5 rounded-full bg-text-muted transition-[translate,background-color] duration-(--duration-fast) ease-(--ease-ui) data-[checked]:translate-x-4 data-[checked]:bg-radnja-tekst"
        />
      </span>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
