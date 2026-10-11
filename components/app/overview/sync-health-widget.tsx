"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip, type ChipTone } from "@/components/app/system/chip";
import { formatRelativeTime } from "@/lib/format";
import { PROVIDER_LABELS } from "@/components/app/settings/status-pill";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Provider } from "@/convex/lib/providers";

type HealthEntry = FunctionReturnType<typeof api.sync.health>[number];
type ConnectionView = FunctionReturnType<typeof api.connections.list>[number];

const MAIN_PROVIDERS: Provider[] = ["ga4", "openreply", "meta_ig"];

type Stanje = "ok" | "running" | "error" | "stale" | "unconnected";

const PRIKAZ: Record<
  Stanje,
  { tone: ChipTone; ikona: typeof Clock; natpis: string }
> = {
  ok: { tone: "success", ikona: CheckCircle2, natpis: "uspešno" },
  running: { tone: "info", ikona: RefreshCw, natpis: "u toku" },
  error: { tone: "danger", ikona: AlertCircle, natpis: "greška" },
  stale: { tone: "warning", ikona: Clock, natpis: "zastalo" },
  unconnected: { tone: "muted", ikona: Circle, natpis: "nije povezano" },
};

/**
 * Zdravlje sinhronizacije kao red čipova (UI Boost §8). Da li su brojevi
 * iznad sveži je prateća informacija, ne sadržaj — zato čip po integraciji,
 * a ne kartica od tri reda. Stanje nose i boja i ikonica i reč; poruka
 * greške ostaje vidljiva ispod, jer je to jedino što kaže šta da se popravi.
 */
export function SyncHealthWidget({
  entries,
  connections,
}: {
  entries: HealthEntry[] | undefined;
  connections: ConnectionView[] | undefined;
}) {
  if (entries === undefined || connections === undefined) {
    return <SyncHealthWidgetSkeleton />;
  }

  const healthByProvider = new Map<Provider, HealthEntry>();
  entries.forEach((e) => healthByProvider.set(e.provider, e));
  const connByProvider = new Map<Provider, ConnectionView>();
  connections.forEach((c) => connByProvider.set(c.provider, c));

  const redovi = MAIN_PROVIDERS.map((provider) => {
    const conn = connByProvider.get(provider);
    const health = healthByProvider.get(provider);
    const delimicno = Boolean(health?.note?.startsWith("Delimično"));

    let stanje: Stanje = "unconnected";
    let natpis = PRIKAZ.unconnected.natpis;
    if (conn && !health) {
      stanje = "stale";
      natpis = "čeka prvo pokretanje";
    } else if (conn && health) {
      stanje = health.status === "ok" && delimicno ? "stale" : health.status;
      natpis = health.status === "ok" && delimicno ? "delimično" : PRIKAZ[stanje].natpis;
    }

    const kada = health?.startedAt ? formatRelativeTime(health.startedAt) : null;
    const poruka = health?.error ?? (delimicno ? health?.note : undefined);
    return { provider, stanje, natpis, kada, poruka };
  });

  const saPorukom = redovi.filter((r) => r.poruka);

  return (
    <section
      aria-label="Stanje sinhronizacije"
      className="flex flex-col gap-2 border-t border-line-soft pt-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-ui font-medium text-text-muted">Sinhronizacija</h2>
        <ul className="flex flex-wrap items-center gap-2">
          {redovi.map(({ provider, stanje, natpis, kada }) => {
            const p = PRIKAZ[stanje];
            return (
              <li key={provider}>
                <Chip tone={p.tone} icon={p.ikona} size="md">
                  {PROVIDER_LABELS[provider]}
                  <span className="font-normal text-text-muted">
                    {" · "}
                    {natpis}
                    {kada ? ` · ${kada}` : ""}
                  </span>
                </Chip>
              </li>
            );
          })}
        </ul>
        <Link
          href="/settings"
          className="ml-auto inline-flex cursor-pointer items-center gap-1 text-meta font-medium text-mod underline-offset-2 hover:underline"
        >
          Podešavanja
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {saPorukom.length > 0 && (
        <ul className="flex flex-col gap-1">
          {saPorukom.map(({ provider, stanje, poruka }) => (
            <li
              key={provider}
              className={
                stanje === "error"
                  ? "text-meta text-danger"
                  : "text-meta text-warning"
              }
            >
              <span className="font-medium">{PROVIDER_LABELS[provider]}:</span>{" "}
              <span className="font-mono">{poruka}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SyncHealthWidgetSkeleton() {
  return (
    <section className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-48 rounded-md" />
      <Skeleton className="h-7 w-40 rounded-md" />
      <Skeleton className="h-7 w-40 rounded-md" />
    </section>
  );
}
