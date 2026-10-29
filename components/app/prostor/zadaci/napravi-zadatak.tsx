"use client";

import { useCallback } from "react";
import { ListPlus } from "lucide-react";

import { useMoze } from "@/components/app/projekat-provider";
import { useDokumenti } from "@/components/app/prostor/dokumenti/dokumenti-kontekst";
import { Button } from "@/components/ui/button";
import type { NoviZadatakVeza } from "@/lib/prostor/web/veze-zadatka";
import { cn } from "@/lib/utils";

/**
 * Otvara deljeni dijalog „Novi zadatak“ sa vezom. `null` kad radni deo nije
 * dostupan (posmatrač, projekat ili profil se još učitavaju).
 */
export function useNoviZadatakSaVezom(): ((veza: NoviZadatakVeza) => void) | null {
  const sme = useMoze("urednik");
  const { projekat, profil, otvoriNovuStranicu } = useDokumenti();
  const otvori = useCallback(
    (veza: NoviZadatakVeza) => otvoriNovuStranicu({ initialKind: "task", veza }),
    [otvoriNovuStranicu],
  );
  return sme && projekat && profil ? otvori : null;
}

/** Sporedna radnja „Napravi zadatak“ (komentar, stavka „Čeka te“). */
export function NapraviZadatak({
  veza,
  onPre,
  samoIkona = false,
  className,
}: {
  /** Predlog zadatka; `null` = ova stavka ne može da postane zadatak. */
  veza: NoviZadatakVeza | null;
  /** Pre otvaranja dijaloga (npr. zatvori zvono). */
  onPre?: () => void;
  /** Uzan red (zvono): samo ikonica, natpis u oblačiću i za čitač ekrana. */
  samoIkona?: boolean;
  className?: string;
}) {
  const otvori = useNoviZadatakSaVezom();
  if (!otvori || !veza) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size={samoIkona ? "icon-xs" : "xs"}
      onClick={() => {
        onPre?.();
        otvori(veza);
      }}
      aria-label={samoIkona ? "Napravi zadatak" : undefined}
      title={samoIkona ? "Napravi zadatak" : undefined}
      className={cn("text-text-muted hover:text-foreground", className)}
    >
      <ListPlus data-icon={samoIkona ? undefined : "inline-start"} aria-hidden />
      {samoIkona ? null : "Napravi zadatak"}
    </Button>
  );
}
