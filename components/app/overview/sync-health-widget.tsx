"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, CheckCircle2, AlertCircle, Clock, Disc } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/format";
import { PROVIDER_LABELS } from "@/components/app/settings/status-pill";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Provider } from "@/convex/lib/providers";

type HealthEntry = FunctionReturnType<typeof api.sync.health>[number];
type ConnectionView = FunctionReturnType<typeof api.connections.list>[number];

const MAIN_PROVIDERS: Provider[] = ["ga4", "openreply", "meta_ig"];

export function SyncHealthWidget({
  entries,
  connections,
}: {
  entries: HealthEntry[] | undefined;
  connections: ConnectionView[] | undefined;
}) {
  const healthByProvider = new Map<Provider, HealthEntry>();
  entries?.forEach((e) => healthByProvider.set(e.provider, e));

  const connByProvider = new Map<Provider, ConnectionView>();
  connections?.forEach((c) => connByProvider.set(c.provider, c));

  return (
    <Link
      href="/settings"
      className="group block rounded-xl border bg-card p-6 shadow-card transition-all hover:border-line-strong hover:bg-card/90"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg border border-line-soft bg-surface-raised/50 text-text-muted group-hover:text-accent-400">
            <Activity className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Stanje sinhronizacije
            </h2>
            <p className="text-xs text-text-muted">
              Pregled statusa podataka po integracijama
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs font-medium text-text-muted transition-colors group-hover:text-accent-400">
          <span>Podešavanja</span>
          <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>

      <div className="mt-5 divide-y divide-line-soft">
        {entries === undefined || connections === undefined ? (
          <div className="space-y-3 py-1">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          MAIN_PROVIDERS.map((provider) => {
            const conn = connByProvider.get(provider);
            const health = healthByProvider.get(provider);
            const isConnected = conn !== undefined;

            let statusTone: "ok" | "running" | "error" | "stale" | "unconnected" = "unconnected";
            let statusText = "Nije povezano";

            if (!isConnected) {
              statusTone = "unconnected";
              statusText = "Nije povezano";
            } else if (!health) {
              statusTone = "stale";
              statusText = "Čeka prvo pokretanje";
            } else {
              statusTone = health.status;
              if (health.status === "ok") {
                if (health.note && health.note.startsWith("Delimično")) {
                  statusTone = "stale";
                  statusText = "Delimično";
                } else {
                  statusText = "Uspešno";
                }
              } else if (health.status === "running") {
                statusText = "U toku";
              } else if (health.status === "error") {
                statusText = "Greška";
              } else if (health.status === "stale") {
                statusText = "Zastalo";
              }
            }

            return (
              <div
                key={provider}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-raised border border-line-soft">
                    {statusTone === "ok" && (
                      <CheckCircle2 className="size-3.5 text-success" />
                    )}
                    {statusTone === "running" && (
                      <Disc className="size-3.5 text-accent-400 motion-safe:animate-spin" />
                    )}
                    {statusTone === "error" && (
                      <AlertCircle className="size-3.5 text-danger" />
                    )}
                    {statusTone === "stale" && (
                      <Clock className="size-3.5 text-warning" />
                    )}
                    {statusTone === "unconnected" && (
                      <span className="size-2 rounded-full bg-text-muted/40" />
                    )}
                  </span>

                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {PROVIDER_LABELS[provider]}
                    </span>
                    {health?.error && (
                      <p className="line-clamp-1 text-micro text-danger font-mono mt-0.5">
                        {health.error}
                      </p>
                    )}
                    {!health?.error && health?.note && health.note.startsWith("Delimično") && (
                      <p className="line-clamp-1 text-micro text-warning font-mono mt-0.5">
                        {health.note}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right text-xs">
                  <span
                    className={
                      statusTone === "ok"
                        ? "text-success font-medium"
                        : statusTone === "error"
                          ? "text-danger font-medium"
                          : statusTone === "running"
                            ? "text-accent-400 font-medium"
                            : statusTone === "stale"
                              ? "text-warning font-medium"
                              : "text-text-muted"
                    }
                  >
                    {statusText}
                  </span>
                  <p className="text-micro text-text-muted">
                    {health?.startedAt
                      ? formatRelativeTime(health.startedAt)
                      : isConnected
                        ? "Nije sinhronizovano"
                        : "Potrebno podešavanje"}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Link>
  );
}

export function SyncHealthWidgetSkeleton() {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-7 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="mt-5 space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </section>
  );
}
