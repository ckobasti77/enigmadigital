"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Opseg } from "./nav-items";
import { useProjekatOpciono } from "./projekat-provider";

/**
 * Opseg ljuske (SPAJANJE P14, plan S07 §2.4): lični nivo „Ja“ (rute bez
 * projekta) ili projekat. Postavlja ga `AppShell`. Van ljuske (vodič sistema,
 * razvojni prikaz bez nje) opseg se izvodi iz toga da li postoji projekat.
 *
 * Opseg nije isto što i „postoji projekat“: ekran „Ja“ sme ispod sebe da
 * otvori projekat stavke (`ProjekatStavkeProvider`), a da ljuska i dalje bude
 * „Ja“.
 */
const OpsegContext = createContext<Opseg | null>(null);

export function OpsegProvider({
  opseg,
  children,
}: {
  opseg: Opseg;
  children: ReactNode;
}) {
  return <OpsegContext.Provider value={opseg}>{children}</OpsegContext.Provider>;
}

export function useOpseg(): Opseg {
  const zadat = useContext(OpsegContext);
  const projekat = useProjekatOpciono();
  return zadat ?? (projekat === null ? "ja" : "projekat");
}
