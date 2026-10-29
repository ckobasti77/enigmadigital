"use client";

// Preneto iz Devotion apps/web/components/workspace/activity-view.tsx (main @ c05c40f), SPAJANJE S20.
import { useEffect, useMemo, useState } from "react";
import { Activity, Lock } from "lucide-react";
import type { ActivityTarget } from "@/lib/prostor/activity-format";

import { PageHeader } from "@/components/app/page-header";
import { useMoze, useProjekat } from "@/components/app/projekat-provider";
import { useProjekatPaginatedQuery } from "@/components/app/prostor/podaci/projekat";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

import { ActivityRow, activityEntryOf, rutaAktivnosti, type ActivityEntry } from "./activity-row";

/** Unosa po strani (server prima najviše 100 po `paginationOpts`). */
const PAGE = 30;

type ActivityViewProps = {
  status: "loading" | "ready";
  entries: ReadonlyArray<ActivityEntry>;
  /** Ima li još starijih unosa (dugme „Učitaj još"). */
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (target: ActivityTarget) => void;
};

const OPIS = "Ko je šta menjao u projektu, najnovije prvo.";

function AktivnostSkeleton() {
  return (
    <div role="status" aria-label="Učitavanje aktivnosti" className="space-y-1">
      {[0, 1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Aktivnost — prezentacija: rečenice iz `formatActivity`, „Učitaj još". */
export function ActivityScreen({ status, entries, canLoadMore, loadingMore, onLoadMore, onOpen }: ActivityViewProps) {
  return (
    <div className="flex w-full flex-col gap-6 pb-8">
      <PageHeader variant="module" title="Aktivnost" description={OPIS} />
      {status === "loading" ? (
        <AktivnostSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Još nema aktivnosti."
          description="Izmene stranica, zadataka i ideja pojaviće se ovde."
          headingAs="h2"
        />
      ) : (
        <div className="max-w-3xl">
          <ul className="space-y-0.5">
            {entries.map((entry) => (
              <li key={entry.id}>
                <ActivityRow entry={entry} onOpen={onOpen} />
              </li>
            ))}
          </ul>
          {canLoadMore || loadingMore ? (
            <Button variant="secondary" size="sm" className="mt-3" disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? "Učitavam…" : "Učitaj još"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ActivityLoader() {
  const { idi } = useProstorNavigacija();
  const { results, status, loadMore } = useProjekatPaginatedQuery(
    api.prostor.activity.listPaginated,
    {},
    { initialNumItems: PAGE },
  );
  // „pre N min" se osvežava jednom u minuti.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const entries = useMemo<ActivityEntry[]>(() => results.map((item) => activityEntryOf(item, now)), [results, now]);
  return (
    <ActivityScreen
      status={status === "LoadingFirstPage" ? "loading" : "ready"}
      entries={entries}
      canLoadMore={status === "CanLoadMore"}
      loadingMore={status === "LoadingMore"}
      onLoadMore={() => loadMore(PAGE)}
      onOpen={(target) => {
        const ruta = rutaAktivnosti(target);
        if (ruta) idi(ruta);
      }}
    />
  );
}

/**
 * ============================================================================
 * AKTIVNOST (`/[projekat]/aktivnost`, paritet red 26; SPAJANJE S20)
 * ============================================================================
 *
 * `activity.listPaginated` (najnovije prvo) sa „Učitaj još". Greška ide u
 * granicu („Aktivnost nije učitana."). Posmatrač ga ne vidi u meniju; ako
 * adresu otvori ručno, vidi zaključano stanje bez upita.
 */
export function AktivnostEkran() {
  const { uloga, workspaceId } = useProjekat();
  const sme = useMoze("urednik");
  if (uloga !== null && !sme) {
    return (
      <div className="flex w-full flex-col gap-6">
        <PageHeader variant="module" title="Aktivnost" />
        <EmptyState
          icon={Lock}
          headingAs="h2"
          title="Aktivnost nije dostupna."
          description="Tvoja uloga u ovom projektu vidi samo brojeve."
        />
      </div>
    );
  }
  if (uloga === null) {
    return (
      <div className="flex w-full flex-col gap-6">
        <PageHeader variant="module" title="Aktivnost" description={OPIS} />
        <AktivnostSkeleton />
      </div>
    );
  }
  return (
    <WorkspaceErrorBoundary key={`aktivnost-${workspaceId}`} title="Aktivnost nije učitana." className="min-h-[20rem]">
      <ActivityLoader />
    </WorkspaceErrorBoundary>
  );
}
