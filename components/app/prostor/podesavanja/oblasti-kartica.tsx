"use client";

import { SETTINGS_TEXT, moveInOrder } from "@/lib/prostor";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  useMoze,
  useProjekatMutation,
} from "@/components/app/projekat-provider";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";
import { AreasTab } from "@/components/app/prostor/podesavanja/areas-tab";
import {
  SettingsListError,
  SettingsListSkeleton,
} from "@/components/app/prostor/podesavanja/liste";
import { useRadnja } from "@/components/app/prostor/podesavanja/use-radnja";

/**
 * Kartica „Oblasti“ u podešavanjima projekta (paritet red 28): preimenuj,
 * pomeri, nova oblast. Menja svaki urednik; posmatrač kartici ne dolazi, a ako
 * je ipak otvori, vidi spisak bez radnji.
 */
export function OblastiKartica() {
  // „Pokušaj ponovo“ ponovo montira karticu, pa se upit ponovo pretplati.
  const [pokusaj, setPokusaj] = useState(0);
  return <Oblasti key={pokusaj} onRetry={() => setPokusaj((n) => n + 1)} />;
}

function Oblasti({ onRetry }: { onRetry: () => void }) {
  const sme = useMoze("urednik");
  const projekat = useProjekatQueryResult(api.prostor.projekat.get);
  const createArea = useProjekatMutation(api.prostor.projekat.createArea);
  const updateArea = useProjekatMutation(api.prostor.projekat.updateArea);
  const reorderAreas = useProjekatMutation(api.prostor.projekat.reorderAreas);
  const { busy, run } = useRadnja();

  if (projekat.failed) {
    return <SettingsListError what="Oblasti" onRetry={onRetry} />;
  }
  if (projekat.data === undefined)
    return <SettingsListSkeleton label="Učitavanje oblasti" />;
  const areas = projekat.data.areas;
  return (
    <div className="pt-5">
      <AreasTab
        areas={areas}
        busy={busy}
        canEdit={sme}
        onRename={(areaId, label) =>
          run(
            () => updateArea({ areaId: areaId as Id<"areas">, label }),
            SETTINGS_TEXT.areaRenamed,
            SETTINGS_TEXT.notSaved,
          )
        }
        onMove={(index, direction) => {
          const next = moveInOrder(
            areas.map((area) => area._id),
            index,
            direction,
          );
          if (next) {
            void run(
              () => reorderAreas({ orderedAreaIds: next }),
              SETTINGS_TEXT.areasReordered,
              SETTINGS_TEXT.notSaved,
            );
          }
        }}
        onCreate={(label) =>
          run(
            () => createArea({ label }),
            SETTINGS_TEXT.areaCreated,
            SETTINGS_TEXT.notSaved,
          )
        }
      />
    </div>
  );
}
