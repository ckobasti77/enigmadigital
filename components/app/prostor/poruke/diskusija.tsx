"use client";

import { useCallback, useState } from "react";

import { useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatNumber } from "@/lib/format";
import type { StartupMember } from "@/lib/prostor/rute";

import { EntityDiscussionPanel } from "./entity-discussion-panel";

/**
 * ============================================================================
 * „DISKUSIJA U PORUKAMA“ NAD STRANICOM, ZADATKOM I IDEJOM (SPAJANJE S15)
 * ============================================================================
 *
 * Devotion je ovo ponavljao u tri prikaza (`page-document-view`,
 * `task-page-view`, `idea-detail-drawer`): upit `chat.channelForAnchor`,
 * stavka menija „Diskusija u Porukama · N“ i dijalog sa
 * `EntityDiscussionPanel`. Ponašanje je isto kao tamo:
 * - kad diskusija postoji, stavka vodi pravo u razgovor u Porukama projekta
 *   (`/<projekat>/poruke?kanal=…`);
 * - kad ne postoji, otvara dijalog u kome prva poruka pravi nit
 *   (`chat.sendToAnchor`), a „Otvori razgovor“ posle toga vodi u Poruke.
 */

type Sidro = "page" | "idea";

/** Šta je sidro, za opis dijaloga (zadatak je stranica vrste „zadatak“). */
const OPIS: Record<"stranica" | "zadatak" | "ideja", string> = {
  stranica: "Poruka ide u kanal ove stranice u Porukama projekta.",
  zadatak: "Poruka ide u kanal ovog zadatka u Porukama projekta.",
  ideja: "Poruka ide u kanal ove ideje u Porukama projekta.",
};

/** `anchorId === null` (npr. fioka ideje bez ideje) preskače upit. */
export function useDiskusijaSidra(anchorType: Sidro, anchorId: string | null) {
  const diskusija = useProjekatQueryTolerant(
    api.prostor.chat.channelForAnchor,
    anchorId === null ? "skip" : { anchorType, anchorId },
  );
  const { idi } = useProstorNavigacija();
  const [otvoren, setOtvoren] = useState(false);

  const otvoriKanal = useCallback(
    (channelId: Id<"chatChannels">) => idi({ kind: "chat", channelId }),
    [idi],
  );
  const pokreni = useCallback(() => {
    if (diskusija) otvoriKanal(diskusija._id);
    else setOtvoren(true);
  }, [diskusija, otvoriKanal]);

  return {
    /** Natpis stavke menija, sa brojem poruka kad diskusija postoji. */
    natpis: diskusija
      ? `Diskusija u Porukama · ${formatNumber(diskusija.messageCount)}`
      : "Diskusija u Porukama",
    pokreni,
    dijalog: { otvoren, setOtvoren, otvoriKanal },
  };
}

export function DiskusijaDijalog({
  open,
  onOpenChange,
  anchorType,
  predmet,
  anchorId,
  members,
  onOpenChannel,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorType: Sidro;
  predmet: keyof typeof OPIS;
  anchorId: string;
  members?: StartupMember[];
  onOpenChannel: (channelId: Id<"chatChannels">) => void;
  /** Kuda fokus posle zatvaranja (stavka menija koja je dijalog otvorila je nestala). */
  finalFocus?: () => HTMLElement | null;
}) {
  const opis = OPIS[predmet];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-[32rem]" finalFocus={finalFocus ? () => finalFocus() ?? true : undefined}>
        <DialogHeader>
          <DialogTitle>Diskusija u Porukama</DialogTitle>
          <DialogDescription>{opis}</DialogDescription>
        </DialogHeader>
        <EntityDiscussionPanel
          anchorType={anchorType}
          anchorId={anchorId}
          members={members}
          onOpenChannel={(channelId) => {
            onOpenChange(false);
            onOpenChannel(channelId);
          }}
        />
      </DialogPopup>
    </Dialog>
  );
}
