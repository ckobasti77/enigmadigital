"use client";

import { Activity } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/format";
import { StatusPill, PROVIDER_LABELS } from "./status-pill";

type HealthEntry = FunctionReturnType<typeof api.sync.health>[number];

function syncPill(status: HealthEntry["status"]) {
  switch (status) {
    case "ok":
      return <StatusPill tone="success">Uspešno</StatusPill>;
    case "error":
      return <StatusPill tone="danger">Greška</StatusPill>;
    case "running":
      return (
        <StatusPill tone="accent" pulse>
          U toku
        </StatusPill>
      );
    case "stale":
      return <StatusPill tone="warning">Zastalo</StatusPill>;
  }
}

/** Last sync run per provider — status, when it ran, and error text if it failed. */
export function SyncHealth({ entries }: { entries: HealthEntry[] | undefined }) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-text-muted" />
        <h2 className="heading-caps text-micro font-medium text-text-muted">
          Stanje sinhronizacije
        </h2>
      </div>

      <div className="mt-5">
        {entries === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Još nema pokrenutih sinhronizacija. Klikni „Sinhronizuj” na nekoj
            integraciji.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {entries.map((entry) => (
              <li
                key={entry.provider}
                className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {syncPill(entry.status)}
                    <span className="text-sm text-foreground">
                      {PROVIDER_LABELS[entry.provider]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    {entry.status === "ok" && (
                      <span className="font-mono tabular-nums">
                        {entry.itemsWritten} zapisa
                      </span>
                    )}
                    <span>{formatRelativeTime(entry.startedAt)}</span>
                  </div>
                </div>
                {entry.error && (
                  <p className="font-mono text-xs leading-relaxed text-danger">
                    {entry.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
