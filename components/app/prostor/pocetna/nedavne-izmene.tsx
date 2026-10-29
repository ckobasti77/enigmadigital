"use client";

// Preneto iz Devotion apps/web/components/workspace/command-center/recent-block.tsx (main @ c05c40f), SPAJANJE S20.
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { COMMAND_BLOCK_TEXT } from "@/lib/prostor/command-center";
import type { ActivityTarget } from "@/lib/prostor/activity-format";

import { ProjekatLink } from "@/components/app/projekat-link";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";
import { api } from "@/convex/_generated/api";
import { hrefRute } from "@/lib/prostor/rute";

import { ActivityRow, activityEntryOf, rutaAktivnosti, type ActivityEntry } from "./activity-row";
import { Block, type BlockStatus, useBlockRetry } from "./blok";

const AKTIVNOST = hrefRute({ kind: "activity" }, "");

export type RecentViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  entries: ReadonlyArray<ActivityEntry>;
  onOpen: (target: ActivityTarget) => void;
};

/** „Nedavne izmene": rečenice iz `formatActivity`, pa „Sva aktivnost". */
export function RecentView({ status, onRetry, entries, onOpen }: RecentViewProps) {
  return (
    <Block
      id="cc-nedavne-izmene"
      title="Nedavne izmene"
      status={status}
      errorText={COMMAND_BLOCK_TEXT.recentError}
      onRetry={onRetry}
      skeletonRows={4}
    >
      {entries.length === 0 ? (
        <EmptyState size="section" title="Još nema izmena." />
      ) : (
        <>
          <ul className="space-y-0.5">
            {entries.map((entry) => (
              <li key={entry.id}>
                <ActivityRow entry={entry} onOpen={onOpen} />
              </li>
            ))}
          </ul>
          <Button
            variant="link"
            size="sm"
            className="mt-1 px-2"
            render={<ProjekatLink href={AKTIVNOST} />}
            nativeButton={false}
          >
            Sva aktivnost
            <ChevronRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </>
      )}
    </Block>
  );
}

/**
 * Kontejner „Nedavne izmene": prva strana `activity.listPaginated` kao običan
 * upit (8 stavki, na telefonu 5; plan S18 E13).
 */
export function RecentBlock({ now, limit }: { now: number; limit: number }) {
  const retry = useBlockRetry();
  const { idi } = useProstorNavigacija();
  const result = useProjekatQueryResult(api.prostor.activity.listPaginated, {
    paginationOpts: { numItems: limit, cursor: null },
  });
  const entries = useMemo<ActivityEntry[]>(
    () => (result.data?.page ?? []).map((item) => activityEntryOf(item, now)),
    [result.data, now],
  );
  return (
    <RecentView
      status={result.failed ? "error" : result.data === undefined ? "loading" : "ready"}
      onRetry={retry}
      entries={entries}
      onOpen={(target) => {
        const ruta = rutaAktivnosti(target);
        if (ruta) idi(ruta);
      }}
    />
  );
}
