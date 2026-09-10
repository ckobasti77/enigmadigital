import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `tailwind-merge` poznaje samo stok veličine teksta (`text-sm`, `text-2xl`…).
 * Svaku drugu klasu `text-*` tumači kao BOJU, pa `cn("text-metric",
 * "text-accent-400")` tiho izbaci `text-metric` kao „sukobljenu boju" —
 * brojka na pločici ostane bez veličine. Isti kvar je već postojao za
 * `text-micro`/`text-h2`/`text-body` (A1 §2). Ovde se imenovani koraci skale
 * prijavljuju kao veličine, pa se sukobljavaju samo međusobno.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "meta",
            "ui",
            "copy",
            "title",
            "metric",
            "display",
            "micro",
            "small",
            "body",
            "h1",
            "h2",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
