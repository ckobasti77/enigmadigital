"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Activity,
  AlertCircle,
  Globe,
  Info,
  Laptop,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  Unplug,
} from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/motion/reveal";
import { EmptyState } from "@/components/app/empty-state";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RealtimeDashboard() {
  const connections = useQuery(api.connections.list);
  const snapshot = useQuery(api.analytics.realtimeSnapshot);
  const refresh = useAction(api.ga4.refreshRealtime);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);

  // Trigger refresh on mount and every 60s
  useEffect(() => {
    let isMounted = true;

    const doRefresh = async () => {
      try {
        setIsRefreshing(true);
        await refresh({});
      } catch {
        // Handled via snapshot error or toast
      } finally {
        if (isMounted) setIsRefreshing(false);
      }
    };

    void doRefresh();
    const interval = setInterval(doRefresh, 60_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [refresh]);

  // Update elapsed seconds ticker every 1s
  useEffect(() => {
    if (!snapshot?.fetchedAt) return;
    const updateAge = () => {
      const sec = Math.max(
        0,
        Math.floor((Date.now() - snapshot.fetchedAt) / 1000),
      );
      setSecondsAgo(sec);
    };
    updateAge();
    const interval = setInterval(updateAge, 1000);
    return () => clearInterval(interval);
  }, [snapshot?.fetchedAt]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh({});
    } finally {
      setIsRefreshing(false);
    }
  };

  const hasGa4 = Boolean(
    connections?.some((c) => c.provider === "ga4" && c.status === "active"),
  );

  if (connections !== undefined && !hasGa4) {
    return (
      <EmptyState icon={Unplug}>
        Google Analytics nije povezan. Povežite GA4 nalog sa JSON ključem servisnog naloga u{" "}
        <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">
          Podešavanjima
        </Link>{" "}
        da biste pratili podatke uživo.
      </EmptyState>
    );
  }

  if (snapshot === undefined) {
    return <RealtimeDashboardSkeleton />;
  }

  const activeUsers = snapshot?.activeUsers ?? 0;
  const isUnavailable = snapshot?.state === "unavailable";
  const minutes = snapshot?.byMinute ?? [];
  const maxMinuteUsers = Math.max(
    1,
    ...minutes.map((m) => m.activeUsers),
  );

  const screens = snapshot?.byScreen ?? [];
  const countries = snapshot?.byCountry ?? [];
  const devices = snapshot?.byDevice ?? [];

  const totalScreenViews = screens.reduce((s, x) => s + x.value, 0);
  const totalCountryUsers = countries.reduce((s, x) => s + x.value, 0);
  const totalDeviceUsers = devices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Bar: Status indicator, freshness badge, and refresh button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Aktivnost uživo
            </span>
          </div>

          <span className="inline-flex items-center rounded-md border border-line px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
            {secondsAgo !== null
              ? `Ažurirano pre ${secondsAgo}s`
              : "Učitavanje..."}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
          />
          <span>{isRefreshing ? "Osvežavanje..." : "Osveži"}</span>
        </Button>
      </div>

      {/* Quota warning or error banner */}
      {isUnavailable && (
        <Card className="flex items-start gap-3 border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-semibold">
              Privremeno ograničenje podataka uživo
            </p>
            <p className="text-xs opacity-90">
              {snapshot?.error ||
                "GA4 kvota je trenutno preopterećena. Podaci uživo se privremeno pauziraju kako bi se zaštitila dnevna sinhronizacija."}
            </p>
          </div>
        </Card>
      )}

      {/* Hero KPI Card: Active users & 30-minute minute-by-minute bar chart */}
      <Reveal>
        <Card className="flex flex-col gap-6 p-6 shadow-card ring-line">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Korisnici u poslednjih 30 minuta
              </p>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                  {formatNumber(activeUsers)}
                </span>
                <span className="text-xs text-muted-foreground">
                  aktivnih posetilaca
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-4 w-4 text-primary" />
              <span>Pregled po minutima (29 min pre → sada)</span>
            </div>
          </div>

          {/* 30 Minute Columns */}
          <div className="flex flex-col gap-2">
            <div className="flex h-32 items-end gap-1 sm:gap-1.5">
              {minutes.map((m) => {
                const heightPct =
                  maxMinuteUsers > 0
                    ? (m.activeUsers / maxMinuteUsers) * 100
                    : 0;
                const isNow = m.minutesAgo === 0;

                return (
                  <div
                    key={m.minutesAgo}
                    className="group relative flex flex-1 flex-col items-center justify-end h-full"
                  >
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute -top-8 z-10 hidden rounded bg-popover px-2 py-1 font-mono text-[10px] text-popover-foreground shadow-md group-hover:block whitespace-nowrap">
                      {m.minutesAgo === 0
                        ? "Ovaj minut"
                        : `Pre ${m.minutesAgo} min`}
                      : {m.activeUsers} korisnika
                    </div>

                    <div
                      className={cn(
                        "w-full rounded-t transition-all duration-300",
                        isNow
                          ? "bg-primary"
                          : m.activeUsers > 0
                            ? "bg-primary/70 group-hover:bg-primary"
                            : "bg-muted/40",
                      )}
                      style={{
                        height: `${Math.max(m.activeUsers > 0 ? 8 : 2, heightPct)}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* X-axis labels */}
            <div className="flex justify-between border-t border-line/60 pt-1 font-mono text-[10px] text-muted-foreground">
              <span>pre 29 min</span>
              <span>pre 15 min</span>
              <span className="font-semibold text-primary">Sada</span>
            </div>
          </div>
        </Card>
      </Reveal>

      {/* 3 Breakdown Cards: Screens, Locations, Devices */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Top Screens */}
        <Reveal delay={0.05}>
          <Card className="flex flex-col gap-4 p-5 shadow-card ring-line h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Top ekrani / stranice
                </h3>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                Prikazi
              </span>
            </div>

            {screens.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Nema aktivnih prikaza u poslednjih 30 min.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {screens.slice(0, 7).map((item, idx) => {
                  const share =
                    totalScreenViews > 0
                      ? (item.value / totalScreenViews) * 100
                      : 0;
                  return (
                    <div key={`${item.key}-${idx}`} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span
                          className="truncate max-w-[200px] text-foreground"
                          title={item.key}
                        >
                          {item.key}
                        </span>
                        <span className="tabular-nums font-semibold text-foreground">
                          {formatNumber(item.value)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full rounded-full bg-primary/80 transition-all duration-300"
                          style={{ width: `${Math.max(2, share)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Reveal>

        {/* Top Countries */}
        <Reveal delay={0.1}>
          <Card className="flex flex-col gap-4 p-5 shadow-card ring-line h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Lokacije posetilaca
                </h3>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                Korisnici
              </span>
            </div>

            {countries.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Nema zabeleženih lokacija u poslednjih 30 min.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {countries.slice(0, 7).map((item, idx) => {
                  const share =
                    totalCountryUsers > 0
                      ? (item.value / totalCountryUsers) * 100
                      : 0;
                  return (
                    <div key={`${item.key}-${idx}`} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span
                          className="truncate max-w-[200px] text-foreground"
                          title={item.key}
                        >
                          {item.key}
                        </span>
                        <span className="tabular-nums font-semibold text-foreground">
                          {formatNumber(item.value)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full rounded-full bg-primary/80 transition-all duration-300"
                          style={{ width: `${Math.max(2, share)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Reveal>

        {/* Top Devices */}
        <Reveal delay={0.15}>
          <Card className="flex flex-col gap-4 p-5 shadow-card ring-line h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Kategorije uređaja
                </h3>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                Korisnici
              </span>
            </div>

            {devices.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Nema zabeleženih uređaja u poslednjih 30 min.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {devices.map((item, idx) => {
                  const share =
                    totalDeviceUsers > 0
                      ? (item.value / totalDeviceUsers) * 100
                      : 0;

                  const DeviceIcon =
                    item.key.toLowerCase() === "desktop"
                      ? Laptop
                      : item.key.toLowerCase() === "tablet"
                        ? Tablet
                        : Smartphone;

                  return (
                    <div key={`${item.key}-${idx}`} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-1.5">
                          <DeviceIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="capitalize text-foreground">
                            {item.key}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className="text-[10px] text-muted-foreground">
                            {formatPercent(share / 100)}
                          </span>
                          <span className="font-semibold text-foreground">
                            {formatNumber(item.value)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full rounded-full bg-primary/80 transition-all duration-300"
                          style={{ width: `${Math.max(2, share)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Reveal>
      </div>

      {/* Methodology & Latency Disclaimer Notice */}
      <Card className="flex items-start gap-3 border-line/70 bg-muted/20 p-4 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="flex flex-col gap-1 text-xs leading-relaxed">
          <p className="font-medium text-foreground">
            Napomena o podacima uživo i kašnjenju obrade
          </p>
          <p>
            Ovaj ekran prikazuje isključivo aktivnost zabeleženu u <strong>poslednjih 30 minuta</strong> putem GA4 Realtime API-ja i ne čuva se u trajni istorijski zapis. Standardni istorijski izveštaji (stranice, izvori saobraćaja, geografija) podležu redovnoj obradi Google Analytics sistema koja traje između <strong>2 i 6 sati</strong> pre nego što podaci postanu konačni.
          </p>
        </div>
      </Card>
    </div>
  );
}

export function RealtimeDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48 rounded" />
        <Skeleton className="h-9 w-24 rounded" />
      </div>
      <Card className="flex flex-col gap-6 p-6">
        <Skeleton className="h-16 w-64 rounded" />
        <Skeleton className="h-32 w-full rounded" />
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
