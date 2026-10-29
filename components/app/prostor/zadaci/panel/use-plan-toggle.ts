"use client";

// Preneto iz Devotion apps/web/components/me/task-panel/use-plan-toggle.ts (main @ c05c40f), SPAJANJE S12.
import { useRef } from "react";
import { useMutation } from "convex/react";
import { toast } from "@/lib/toast";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import type { Today } from "@/lib/prostor/web/danas";

import { useQueryState } from "@/components/app/prostor/podaci/ja";

/** „Poništi" traje 8 s (plan K07 E6). */
export const PLAN_UNDO_MS = 8_000;

export type PlanRef = { kind: "task"; taskPageId: Id<"pages"> } | { kind: "personal"; personalTaskId: Id<"personalTasks"> };

/** Stavka plana za danas (iz deljene pretplate `myDay.overview`). */
export function usePlanEntry(today: Today, refKey: string) {
  const overview = useQueryState(api.prostor.myDay.overview, { dayKey: today.dayKey, doneSince: today.doneSince });
  if (overview.status !== "ready") return null;
  return overview.data.entries.find((entry) => entry.refKey === refKey)?._id ?? null;
}

/** „Dodaj u Moj dan" / „Ukloni iz Moj dan" — isti rukovalac za panel i punu stranicu zadatka. */
export function usePlanToggle(today: Today, entryId: Id<"myDayEntries"> | null, ref: PlanRef) {
  const plan = useMutation(api.prostor.myDay.plan);
  const unplan = useMutation(api.prostor.myDay.unplan);
  // Dvoklik ne sme da pošalje dva poziva (drugi „ukloni" bi pao).
  const busy = useRef(false);
  const release = () => {
    busy.current = false;
  };
  return () => {
    if (busy.current) return;
    busy.current = true;
    if (entryId !== null) {
      void unplan({ entryId })
        .then((removed) =>
          toast("Uklonjeno iz Moj dan.", {
            duration: PLAN_UNDO_MS,
            action: {
              label: "Poništi",
              onClick: () => {
                void plan({ dayKey: removed.dayKey, ref: removed.ref, position: removed.position }).catch((error: unknown) =>
                  toast.error(accessErrorMessage(error, "Plan nije sačuvan.")),
                );
              },
            },
          }),
        )
        .catch((error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")))
        .finally(release);
      return;
    }
    void plan({ dayKey: today.dayKey, ref })
      .then(() => toast.success("Dodato u Moj dan."))
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")))
      .finally(release);
  };
}
