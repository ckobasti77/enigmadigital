"use client";

/**
 * ============================================================================
 * BRZI UNOS U LJUSCI (SPAJANJE S16, plan §6 red 2, S07 §11.3)
 * ============================================================================
 *
 * Jedan dijalog „Brzi unos“ za celu ljusku, kao u Devotionu
 * (`workspace-shell.tsx`): prečica `q` (registar prečica iz S08) i dugmad
 * („Brzi unos“ na Mojim zadacima) ga otvaraju kroz `useBrziUnos()`.
 *
 * - U opsegu projekta je tekući projekat unapred izabran (preset); u „Ja“ važi
 *   zapamćeno odredište ili Lično.
 * - Sa Beleški (`/beleske`) se otvara kao Beleška, inače kao Zadatak.
 * - Panel domen (klijentski pogled, D4) ga nema.
 *
 * Kontejner (pretplate na moje projekte i profil, prijavljivači po projektu)
 * montira se tek pri prvom otvaranju i ostaje, da „Poništi“ iz toasta radi i
 * posle zatvaranja dijaloga.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import type { QuickAddKind } from "@/lib/prostor/quick-add";
import { SHELL_SHORTCUTS } from "@/lib/prostor/precice/registar";

import { useOpseg } from "@/components/app/opseg-ljuske";
import { useEkranPutanja, useProjekatOpciono } from "@/components/app/projekat-provider";
import { useShortcuts } from "@/components/app/prostor/precice/precice-provider";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { useMojiProjektiRadnogDela } from "@/components/app/prostor/ja/moji-projekti";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// Dijalog se montira tek pri prvom otvaranju (gore), pa i njegov kod stiže
// tek tada (SPAJANJE S28): ljuska ga ne nosi u prvom učitavanju svake strane.
const QuickAddContainer = dynamic(() => import("./quick-add-container").then((m) => m.QuickAddContainer), {
  ssr: false,
});

export type OpcijeBrzogUnosa = { vrsta?: QuickAddKind };

const BrziUnosContext = createContext<((opcije?: OpcijeBrzogUnosa) => void) | null>(null);

/** Otvara brzi unos; `null` van ljuske ili u panelu (nema brzog unosa). */
export function useBrziUnos(): ((opcije?: OpcijeBrzogUnosa) => void) | null {
  return useContext(BrziUnosContext);
}

type Stanje = {
  open: boolean;
  /** Bar jednom otvoren: kontejner ostaje montiran (toast „Poništi“). */
  montiran: boolean;
  kind: QuickAddKind;
  preset: { workspaceId: Id<"workspaces"> } | null;
};

export function BrziUnosProvider({ aktivan, children }: { aktivan: boolean; children: ReactNode }) {
  if (!aktivan) return <>{children}</>;
  return <BrziUnos>{children}</BrziUnos>;
}

function BrziUnos({ children }: { children: ReactNode }) {
  const opseg = useOpseg();
  const ekran = useEkranPutanja();
  const projekat = useProjekatOpciono();
  const [stanje, setStanje] = useState<Stanje>({ open: false, montiran: false, kind: "task", preset: null });

  const workspaceId = opseg === "projekat" ? (projekat?.workspaceId ?? null) : null;
  const otvori = useCallback(
    (opcije?: OpcijeBrzogUnosa) =>
      setStanje({
        open: true,
        montiran: true,
        // Iz Beleški se brzi unos otvara kao Beleška (P7, K18).
        kind: opcije?.vrsta ?? (opseg === "ja" && ekran === "/beleske" ? "note" : "task"),
        preset: workspaceId ? { workspaceId } : null,
      }),
    [ekran, opseg, workspaceId],
  );
  useShortcuts([SHELL_SHORTCUTS.quickAdd], () => otvori());

  const zatvori = useCallback((open: boolean) => setStanje((tek) => ({ ...tek, open })), []);

  return (
    <BrziUnosContext.Provider value={otvori}>
      {children}
      {stanje.montiran ? <BrziUnosDijalog stanje={stanje} onOpenChange={zatvori} /> : null}
    </BrziUnosContext.Provider>
  );
}

function BrziUnosDijalog({ stanje, onOpenChange }: { stanje: Stanje; onOpenChange: (open: boolean) => void }) {
  const today = useToday();
  const profil = useQuery(api.prostor.profiles.getCurrent);
  const projekti = useMojiProjektiRadnogDela();
  const radni = useMemo(() => projekti ?? [], [projekti]);
  // Bez profila nema ni zadatka (izvršilac) ni beleške; dijalog čeka podatke.
  if (!profil) return null;
  return (
    <QuickAddContainer
      open={stanje.open && projekti !== undefined}
      onOpenChange={onOpenChange}
      today={today}
      profileId={profil._id}
      workspaces={radni}
      preset={stanje.preset}
      initialKind={stanje.kind}
    />
  );
}
