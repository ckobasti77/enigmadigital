"use client";

import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { izvediBojuProjekta, PREDLOZI_BOJA, stilProjekta } from "@/lib/boja-projekta";
import { cn } from "@/lib/utils";

/**
 * Boja projekta (peta uloga boje, identitet): šest predloga i polje za
 * „#rrggbb“. Predlozi su podatak iz `lib/boja-projekta.ts` i crtaju se kroz
 * `stilProjekta`, pa komponenta nema heks. Kad izabrana boja ne prolazi
 * kontrast, ispod piše da je prilagođena: znak projekta tada nosi izvedenu
 * nijansu, ne tačno upisanu.
 */
export function IzborBoje({
  id,
  vrednost,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
}: {
  id: string;
  /** Tekst iz polja (može biti nedovršen dok se kuca). */
  vrednost: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const normalizovana = vrednost.trim().toLowerCase();
  const izvedena = izvediBojuProjekta(normalizovana);
  const prilagodjena = izvedena !== null && izvedena.boja !== normalizovana;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="radiogroup" aria-label="Predlozi boje" className="flex flex-wrap gap-1.5">
          {PREDLOZI_BOJA.map((boja) => {
            const izabrana = normalizovana === boja;
            return (
              <button
                key={boja}
                type="button"
                role="radio"
                aria-checked={izabrana}
                aria-label={`Boja ${boja}`}
                disabled={disabled}
                onClick={() => onChange(boja)}
                data-projekat=""
                style={stilProjekta(boja)}
                className={cn(
                  // `touch-target`: 44 px tamo gde se dodiruje prstom.
                  "touch-target flex size-8 cursor-pointer items-center justify-center rounded-lg bg-projekat text-projekat-tekst ring-offset-2 ring-offset-card transition-shadow",
                  izabrana ? "ring-2 ring-foreground" : "ring-1 ring-line hover:ring-line-control",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {izabrana && <Check className="size-4" aria-hidden />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            data-projekat=""
            style={stilProjekta(normalizovana)}
            className="size-6 shrink-0 rounded-md bg-projekat ring-1 ring-line"
          />
          <Input
            id={id}
            value={vrednost}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            placeholder="#rrggbb"
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            className="h-8 w-28 font-mono tabular-nums"
          />
        </div>
      </div>
      {prilagodjena && (
        <p className="text-meta text-text-muted">
          Prilagođeno radi čitljivosti: znak projekta koristi{" "}
          <span className="font-mono tabular-nums text-text-secondary">{izvedena.boja}</span>.
        </p>
      )}
    </div>
  );
}
