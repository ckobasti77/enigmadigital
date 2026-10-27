"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMoze, useProjekatMutation } from "@/components/app/projekat-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "./lead-quick-dialogs";

/**
 * „Urađeno" uz svaki prikazan sledeći korak (ULTRA-PLAN §4, tačka 6): skida
 * korak (`zavrsiKorak`) i upisuje ga u istoriju, pa firma izlazi iz „Vrati se
 * na" i Zaostalih. Faza se ne menja.
 *
 * Isto dugme stoji na Danas, u Zaostalima, u profilu i u proširenom redu —
 * jedna komponenta, da se natpis i ponašanje ne raziđu. Posmatrač ga ne vidi.
 * Na dodir je meta ≥ 44 px (`touch-target`).
 */
export function KorakUradjen({
  companyId,
  companyName,
  variant = "secondary",
  size = "sm",
  onError,
  className,
}: {
  companyId: Id<"leadCompanies">;
  companyName: string;
  variant?: "secondary" | "ghost" | "outline";
  size?: "sm" | "xs";
  /** Kad ga nema, greška se ispisuje odmah pored dugmeta. */
  onError?: (poruka: string) => void;
  className?: string;
}) {
  const moze = useMoze("urednik");
  const zavrsiKorak = useProjekatMutation(api.leadCrmStore.zavrsiKorak);
  const [busy, setBusy] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  if (!moze) return null;

  const zavrsi = async () => {
    setBusy(true);
    setGreska(null);
    try {
      await zavrsiKorak({ companyId });
    } catch (err) {
      const poruka = getErrorMessage(err);
      if (onError) onError(poruka);
      else setGreska(poruka);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        loading={busy}
        onClick={zavrsi}
        aria-label={`Korak urađen: ${companyName}`}
        title="Korak je urađen: skida se iz „Vrati se na” i Zaostalih, a ostaje u istoriji"
        className={cn("touch-target", className)}
      >
        <Check data-icon="inline-start" aria-hidden />
        Urađeno
      </Button>
      {greska && (
        <span role="alert" className="text-meta text-danger">
          Nije sačuvano: {greska}
        </span>
      )}
    </>
  );
}
