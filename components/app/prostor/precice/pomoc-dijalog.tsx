"use client";

// Preneto iz Devotion apps/web/components/shortcuts/shortcut-help-dialog.tsx (main @ c05c40f), SPAJANJE S08.
// S24: pomoć navodi sve prečice aplikacije — prvo one sa ovog ekrana, pa ostale.
import { useId } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, type LucideIcon } from "lucide-react";

import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { shortcutHelpKeys, type ShortcutDef, type ShortcutGroup } from "@/lib/prostor/precice/registar";

type Grupa = { group: ShortcutGroup; defs: ShortcutDef[] };

/**
 * Strelice se crtaju lucide ikonicama: znak „↓“ Aeonik nema, pa ga Windows
 * uzima iz fonta emodžija (u boji). Čitač ekrana čita `aria-label` reda.
 */
const STRELICE: Record<string, LucideIcon> = { "↑": ArrowUp, "↓": ArrowDown, "←": ArrowLeft, "→": ArrowRight };

export type ShortcutHelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prečice prijavljene na ovom ekranu, po grupama. */
  groups: Grupa[];
  /** Ostale grupe iz kataloga (drugi ekrani). */
  otherGroups?: Grupa[];
  isMac?: boolean;
};

/**
 * Dijalog „Prečice" (`?`, ili „Prečice na tastaturi“ u paleti). Grupe ovog
 * ekrana su na vrhu; ispod razdelnika su prečice drugih ekrana, da se vidi
 * ceo skup. Redovi su gusti spiskovi sa razdelnicima, bez kutija.
 */
export function ShortcutHelpDialog({
  open,
  onOpenChange,
  groups,
  otherGroups = [],
  isMac = false,
}: ShortcutHelpDialogProps) {
  const idPrefix = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Prečice</DialogTitle>
          <DialogDescription>Ne rade dok kucaš u polju. Prvo su prečice ovog ekrana.</DialogDescription>
        </DialogHeader>
        <Grupe grupe={groups} isMac={isMac} idPrefix={`${idPrefix}-ovde`} />
        {otherGroups.length > 0 ? (
          <section aria-labelledby={`${idPrefix}-drugde`} className="mt-1 border-t border-line pt-4">
            <h2 id={`${idPrefix}-drugde`} className="mb-3 text-ui font-medium text-text-secondary">
              Na drugim ekranima
            </h2>
            <Grupe grupe={otherGroups} isMac={isMac} idPrefix={`${idPrefix}-drugde`} />
          </section>
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}

function Grupe({ grupe, isMac, idPrefix }: { grupe: Grupa[]; isMac: boolean; idPrefix: string }) {
  return (
    <div className="gap-x-8 md:columns-2">
      {grupe.map(({ group, defs }, index) => (
        <section
          key={group}
          aria-labelledby={`${idPrefix}-${index}`}
          className="mb-4 break-inside-avoid"
        >
          <h3 id={`${idPrefix}-${index}`} className="mb-1 text-ui font-semibold text-foreground">
            {group}
          </h3>
          <dl className="divide-y divide-line-soft">
            {defs.map((def) => {
              const kombinacije = shortcutHelpKeys(def, isMac);
              return (
                <div key={def.id} className="flex min-h-9 items-center justify-between gap-3 py-1">
                  <dt className="text-ui text-text-secondary">{def.label}</dt>
                  <dd
                    className="flex shrink-0 items-center gap-1"
                    aria-label={kombinacije.map((combo) => combo.join(" + ")).join(" ili ")}
                  >
                    {kombinacije.map((combo, i) => (
                      <span key={combo.join("+")} className="flex items-center gap-1">
                        {i > 0 ? (
                          <span aria-hidden="true" className="text-meta text-text-muted">
                            /
                          </span>
                        ) : null}
                        {combo.map((key) => {
                          const Strelica = STRELICE[key];
                          return (
                            <Kbd key={key} aria-hidden="true">
                              {Strelica ? <Strelica className="size-3" strokeWidth={1.75} /> : key}
                            </Kbd>
                          );
                        })}
                      </span>
                    ))}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
