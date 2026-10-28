"use client";

import { ProjekatLink } from "@/components/app/projekat-link";
import {
  AlertTriangle,
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
import {
  OZNAKA_STATUSA,
  porukaStatusa,
  type VrednostStatusa,
} from "@/convex/lib/statusVeze";
import {
  RadnjaVeze,
  useStatusVeza,
} from "@/components/app/system/stanje-veze";

type HealthEntry = FunctionReturnType<typeof api.sync.health>[number];
type ConnectionView = FunctionReturnType<typeof api.connections.list>[number];

const MAIN_PROVIDERS: Provider[] = ["ga4", "openreply", "meta_ig"];

const PRIKAZ: Record<
  VrednostStatusa | "tece",
  { tone: ChipTone; ikona: typeof Clock }
> = {
  radi: { tone: "success", ikona: CheckCircle2 },
  tece: { tone: "info", ikona: RefreshCw },
  trazi_paznju: { tone: "warning", ikona: AlertTriangle },
  nije_povezano: { tone: "muted", ikona: Circle },
};

/**
 * Stanje glavnih veza kao red čipova (UI Boost §8), po jednom statusu veze
 * (P3): iste reči kao tačka u gornjoj traci, kanal, Podešavanja i zvono —
 * „Radi", „Traži pažnju", „Nije povezano". Ispod čipova, za vezu koja traži
 * pažnju, ide ljudska rečenica sa jednom radnjom; tehnički tekst greške
 * ostaje samo u detaljima u Podešavanjima.
 */
export function SyncHealthWidget({
  entries,
  connections,
}: {
  entries: HealthEntry[] | undefined;
  connections: ConnectionView[] | undefined;
}) {
  const veze = useStatusVeza();
  if (entries === undefined || connections === undefined || veze === undefined) {
    return <SyncHealthWidgetSkeleton />;
  }
  const { sada } = veze;

  const redovi = MAIN_PROVIDERS.flatMap((provider) => {
    const status = veze.poProvajderu.get(provider);
    if (status === undefined) return [];
    const tece =
      status.vrednost === "radi" &&
      entries.some((e) => e.provider === provider && e.status === "running");
    const kada =
      status.vrednost === "nije_povezano" || status.podaciOd === null
        ? null
        : formatRelativeTime(status.podaciOd, sada);
    return [{ status, prikaz: PRIKAZ[tece ? "tece" : status.vrednost], tece, kada }];
  });

  const paznja = redovi.filter((r) => r.status.vrednost === "trazi_paznju");

  return (
    <section
      aria-label="Stanje veza"
      className="flex flex-col gap-2 border-t border-line-soft pt-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-ui font-medium text-text-muted">Veze</h2>
        <ul className="flex flex-wrap items-center gap-2">
          {redovi.map(({ status, prikaz, tece, kada }) => (
            <li key={status.provider}>
              <Chip tone={prikaz.tone} icon={prikaz.ikona} size="md">
                {PROVIDER_LABELS[status.provider]}
                <span className="font-normal text-text-muted">
                  {" · "}
                  {tece ? "sinhronizacija teče" : OZNAKA_STATUSA[status.vrednost]}
                  {kada ? ` · ${kada}` : ""}
                </span>
              </Chip>
            </li>
          ))}
        </ul>
        <ProjekatLink
          href="/settings?tab=integracije"
          className="ml-auto inline-flex cursor-pointer items-center gap-1 text-meta font-medium text-radnja underline-offset-2 hover:underline"
        >
          Podešavanja
          <ArrowUpRight className="size-3.5" aria-hidden />
        </ProjekatLink>
      </div>

      {paznja.length > 0 && (
        <ul className="flex flex-col gap-1">
          {paznja.map(({ status }) => (
            <li
              key={status.provider}
              className="flex flex-wrap items-center gap-x-2 text-meta text-text-secondary"
            >
              <span>{porukaStatusa(status, sada).recenica}</span>
              <RadnjaVeze status={status} sada={sada} />
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
