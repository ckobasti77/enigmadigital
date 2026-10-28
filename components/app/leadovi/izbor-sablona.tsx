"use client";

import { useId } from "react";
import {
  NISE_SABLONA,
  SABLONI_LEADOVA,
  brojPravilaPoOsi,
  type SablonLeadova,
} from "@/convex/lib/sabloniLeadova";
import { pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Izbor šablona leadova (C14): čarobnjak „Novi projekat“ i prazno stanje
 * ocenjivanja. Brojevi pravila i niša stižu iz istih podataka koje upisuje
 * `leadScoringStore.primeniSablon`, pa se najava ne razilazi sa onim što
 * se upiše.
 */
export function IzborSablona({
  vrednost,
  onChange,
  ponudi = SABLONI_LEADOVA.map((s) => s.kljuc),
  disabled,
}: {
  vrednost: SablonLeadova | null;
  onChange: (sablon: SablonLeadova) => void;
  ponudi?: readonly SablonLeadova[];
  disabled?: boolean;
}) {
  const ime = useId();
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">Šablon leadova</legend>
      {SABLONI_LEADOVA.filter((s) => ponudi.includes(s.kljuc)).map((s) => {
        const ose = brojPravilaPoOsi(s.kljuc);
        const nise = NISE_SABLONA[s.kljuc].length;
        const izabran = vrednost === s.kljuc;
        return (
          <label
            key={s.kljuc}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
              izabran
                ? "border-mod-line bg-mod-soft"
                : "border-line hover:border-line-control",
            )}
          >
            <input
              type="radio"
              name={ime}
              value={s.kljuc}
              checked={izabran}
              onChange={() => onChange(s.kljuc)}
              className="mt-0.5 size-4 accent-[var(--radnja)]"
            />
            <span className="min-w-0">
              <span className="block text-ui font-medium text-foreground">
                {s.naziv}
              </span>
              <span className="mt-0.5 block text-meta text-text-muted">
                {s.opis}
              </span>
              {ose.fit + ose.intent > 0 && (
                <span className="mt-1.5 block text-meta text-text-muted">
                  <span className="font-mono tabular-nums text-foreground">
                    {ose.fit}
                  </span>{" "}
                  Fit ·{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {ose.intent}
                  </span>{" "}
                  Intent pravila ·{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {nise}
                  </span>{" "}
                  {pluralSr(nise, "niša", "niše", "niša")}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
