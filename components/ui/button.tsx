import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Uloge dugmeta (ULTRA P1, O5; DESIGN.md „Buttons"):
 *
 *   primary      puna boja radnje, tamni tekst — JEDNO po pogledu
 *                (ekran, dijalog, fokus kartica); ista boja na svakom modulu
 *   secondary    neutralna podloga, bez boje modula — prateće radnje
 *   outline      neutralan obris — alati i filteri
 *   ghost        bez podloge — radnje u redu tabele, ikonice
 *   destructive  tinta greške — uvek uz potvrdu
 *   link         tekst u boji radnje
 *
 * Uloge `default` nema: `variant` je obavezan u tipu, pa dugme bez uloge ne
 * prolazi `npm run typecheck`, a `verify:ultra-dugmad` hvata ostatak.
 *
 * Svako dugme nosi `data-variant`, pa se „jedno primarno iznad preloma" meri
 * nad DOM-om, a ne procenjuje.
 *
 * Dodir: pod `pointer: coarse` svako dugme je najmanje 44 × 44 px
 * (`pointer-coarse:min-h-11 min-w-11`); na mišu veličine ostaju iste.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none not-aria-busy:disabled:opacity-50 aria-busy:opacity-80 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
  {
    variants: {
      variant: {
        // Hover posvetljuje, ne potamnjuje: tamni tekst ostaje ≥ 4,5:1
        // (9,67:1 u miru, 10,45:1 na hover-u).
        primary:
          "bg-radnja text-radnja-tekst shadow-[inset_0_1px_0_var(--material-edge)] hover:bg-radnja-hover",
        secondary:
          "bg-surface-control text-foreground hover:bg-surface-control-hover aria-expanded:bg-surface-control-hover",
        outline:
          "border-line-control bg-transparent text-foreground hover:bg-surface-control aria-expanded:bg-surface-control",
        // Bez boje teksta: radnje u redu nasleđuju prigušen tekst roditelja.
        ghost:
          "hover:bg-surface-control hover:text-foreground aria-expanded:bg-surface-control aria-expanded:text-foreground",
        // Hover menja ivicu, ne podlogu: tekst ostaje 5,12:1.
        destructive:
          "border-danger-line bg-danger-soft text-danger hover:border-danger focus-visible:border-danger",
        link: "text-radnja underline-offset-4 hover:text-radnja-hover hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

/** Uloga dugmeta — obavezna (nema `default`). */
type UlogaDugmeta = NonNullable<VariantProps<typeof buttonVariants>["variant"]>

function Button({
  className,
  variant,
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  Omit<VariantProps<typeof buttonVariants>, "variant"> & {
    /** Uloga: primary, secondary, outline, ghost, destructive ili link. */
    variant: UlogaDugmeta
    /** Radnja je u toku: dugme je onemogućeno i nosi spiner. */
    loading?: boolean
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && (
        <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
      )}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
export type { UlogaDugmeta }
