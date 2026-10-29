"use client";

import type { ComponentType } from "react";
import { Toast } from "@base-ui/react/toast";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { menadzerToasta, type TonToasta } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * TOASTER (P11, plan S07 §5.3, D16, D17)
 * ============================================================================
 *
 * Jedan po aplikaciji, u ljusci (`app-shell.tsx`). Crta toastove iz
 * `lib/toast.ts` (Base UI Toast, globalni menadžer).
 *
 * - Mesto: dole u sredini; na telefonu iznad donje trake. Nagrade
 *   (`RewardToastViewport`) ostaju dole desno, pa se ne sudaraju.
 * - Najviše tri istovremeno; stariji dobija `data-limited` i ne crta se.
 * - Boja je uloga STANJA (ikonica uspeh / greška / upozorenje / info), nikad
 *   boja modula. Radnja je dugme `link` (boja radnje), zatvaranje `ghost`.
 * - Pokret je CSS prelaz na Base UI stanjima (`data-starting-style`,
 *   `data-ending-style`), ne keyframe: kreće od zatečene vrednosti i ne trepće
 *   pri brzom zatvaranju. Pod smanjenim pokretom globalno pravilo ostavlja samo
 *   neprozirnost.
 */

const IKONICA: Partial<Record<TonToasta, ComponentType<{ className?: string }>>> = {
  uspeh: CircleCheck,
  greska: CircleAlert,
  upozorenje: TriangleAlert,
  info: Info,
};

const BOJA_IKONICE: Partial<Record<TonToasta, string>> = {
  uspeh: "text-success",
  greska: "text-danger",
  upozorenje: "text-warning",
  info: "text-info",
};

function Toastovi() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => {
    const ton = (t.type ?? "obicno") as TonToasta;
    const Ikonica = IKONICA[ton];
    return (
      <Toast.Root
        key={t.id}
        toast={t}
        swipeDirection="down"
        data-slot="toast"
        className={cn(
          "pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-line bg-surface-raised py-2.5 pr-2 pl-3.5 text-ui text-foreground shadow-elev-3",
          "transition-[opacity,translate] duration-(--duration-base) ease-(--ease-ui)",
          "data-starting-style:translate-y-2 data-starting-style:opacity-0",
          "data-ending-style:opacity-0",
          "data-limited:hidden",
        )}
      >
        {Ikonica && (
          <Ikonica
            aria-hidden
            className={cn("mt-0.5 size-4 shrink-0", BOJA_IKONICE[ton])}
          />
        )}
        <Toast.Content className="min-w-0 flex-1 py-px">
          <Toast.Title className="font-medium text-foreground" />
          <Toast.Description className="mt-0.5 text-meta text-text-muted empty:hidden" />
        </Toast.Content>
        {t.actionProps && (
          <Toast.Action
            render={<Button variant="link" size="sm" className="shrink-0" />}
          />
        )}
        <Toast.Close
          aria-label="Zatvori obaveštenje"
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-text-muted hover:text-foreground"
            />
          }
        >
          <X className="size-3.5" />
        </Toast.Close>
      </Toast.Root>
    );
  });
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={menadzerToasta} limit={3}>
      <Toast.Portal>
        <Toast.Viewport
          aria-label="Obaveštenja"
          className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex w-[min(26rem,calc(100vw-2rem))] flex-col-reverse gap-2 outline-none md:bottom-6"
        >
          <Toastovi />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
