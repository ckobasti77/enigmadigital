import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Uloge dugmeta (UI Boost §4.2):
 *
 *   primary      puna boja modula, tamni tekst — JEDNO po pogledu
 *   secondary    tinta modula — prateće radnje
 *   outline      neutralno — alati i filteri
 *   ghost        bez podloge — radnje u redu tabele, ikonice
 *   destructive  brisanje, uvek uz potvrdu
 *   default      zatečeno puno dugme; boju modula dobija kroz `--primary`.
 *                Ekrani ga zamenjuju sa `primary` ili `secondary` kako se sele.
 *
 * Svako dugme nosi `data-variant`, pa se „jedno primarno iznad preloma" meri
 * nad DOM-om, a ne procenjuje.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none not-aria-busy:disabled:opacity-50 aria-busy:opacity-80 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Hover posvetljuje, ne potamnjuje: tamni tekst na potamnjenoj boji
        // modula pada ispod 4,5:1 (izmereno za roze, crvenu i fuksiju).
        default:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_10%)]",
        primary:
          "bg-mod-strong text-text-inverse shadow-[inset_0_1px_0_var(--material-edge)] hover:bg-[color-mix(in_oklch,var(--mod-strong),var(--foreground)_10%)] hover:shadow-mod",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border-mod-line bg-mod-soft text-mod hover:bg-[color-mix(in_oklab,var(--mod)_22%,var(--surface))] aria-expanded:bg-[color-mix(in_oklab,var(--mod)_22%,var(--surface))]",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
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
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Radnja je u toku: dugme je onemogućeno i nosi spiner. */
    loading?: boolean
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant ?? "default"}
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
