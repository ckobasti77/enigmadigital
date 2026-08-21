"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Info,
  Layers,
  LoaderCircle,
  Megaphone,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/motion/reveal";
import { formatLongDate, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Enum translations (Serbian with original in parentheses) ─────────────────

function translateServiceLevel(level?: string): { label: string; raw?: string } {
  if (!level) return { label: "Standardni", raw: "STANDARD" };
  switch (level) {
    case "STANDARD":
    case "GOOGLE_ANALYTICS_STANDARD":
      return { label: "Standardni", raw: level };
    case "GOOGLE_ANALYTICS_360":
    case "360":
      return { label: "Google Analytics 360", raw: level };
    default:
      return { label: level, raw: level };
  }
}

function translateRetention(retention?: string): {
  label: string;
  raw?: string;
  isShort: boolean;
} {
  if (!retention) {
    return { label: "Nepoznato", raw: undefined, isShort: false };
  }
  switch (retention) {
    case "TWO_MONTHS":
      return { label: "2 meseca", raw: "TWO_MONTHS", isShort: true };
    case "FOURTEEN_MONTHS":
      return { label: "14 meseci", raw: "FOURTEEN_MONTHS", isShort: false };
    case "TWENTY_SIX_MONTHS":
      return { label: "26 meseci", raw: "TWENTY_SIX_MONTHS", isShort: false };
    case "THIRTY_EIGHT_MONTHS":
      return { label: "38 meseci", raw: "THIRTY_EIGHT_MONTHS", isShort: false };
    case "FIFTY_MONTHS":
      return { label: "50 meseci", raw: "FIFTY_MONTHS", isShort: false };
    default:
      return { label: retention, raw: retention, isShort: false };
  }
}

function translateCountingMethod(method?: string): { label: string; raw?: string } {
  if (!method) return { label: "Standardno", raw: undefined };
  switch (method) {
    case "ONCE_PER_EVENT":
      return { label: "Jednom po događaju", raw: "ONCE_PER_EVENT" };
    case "ONCE_PER_SESSION":
      return { label: "Jednom po sesiji", raw: "ONCE_PER_SESSION" };
    default:
      return { label: method, raw: method };
  }
}

function translateStreamType(type?: string): { label: string; raw?: string } {
  if (!type) return { label: "Veb", raw: "WEB_DATA_STREAM" };
  switch (type) {
    case "WEB_DATA_STREAM":
      return { label: "Veb sajt", raw: "WEB_DATA_STREAM" };
    case "ANDROID_APP_DATA_STREAM":
      return { label: "Android aplikacija", raw: "ANDROID_APP_DATA_STREAM" };
    case "IOS_APP_DATA_STREAM":
      return { label: "iOS aplikacija", raw: "IOS_APP_DATA_STREAM" };
    default:
      return { label: type, raw: type };
  }
}

function translateScope(scope?: string): string {
  if (!scope) return "—";
  switch (scope) {
    case "EVENT":
      return "Događaj (EVENT)";
    case "USER":
      return "Korisnik (USER)";
    case "ITEM":
      return "Stavka (ITEM)";
    default:
      return scope;
  }
}

function formatCustomerId(id?: string): string {
  if (!id) return "—";
  const clean = id.replace(/\D/g, "");
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return id;
}

export function Ga4Configuration() {
  const config = useQuery(api.analytics.ga4Configuration);
  const refresh = useAction(api.ga4.refreshGa4Config);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  async function handleRefresh() {
    setRefreshing(true);
    setFeedback(null);
    try {
      const res = await refresh({});
      if (res.ok) {
        setFeedback({ ok: true, message: "Konfiguracija je uspešno ažurirana." });
      } else {
        setFeedback({
          ok: false,
          message: res.error ?? "Osvežavanje konfiguracije nije uspelo.",
        });
      }
    } catch (err) {
      setFeedback({
        ok: false,
        message: err instanceof Error ? err.message : "Greška pri osvežavanju.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  if (config === undefined) {
    return <Ga4ConfigurationSkeleton />;
  }

  if (config === null) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 text-center shadow-card ring-line">
        <Database className="size-8 text-text-muted mb-3" />
        <h3 className="text-sm font-semibold text-foreground">
          Konfiguracija propertije još nije očitana
        </h3>
        <p className="mt-1 max-w-md text-xs text-text-muted">
          Pokrenite prvo očitavanje konfiguracije preko GA4 Admin API-ja kako biste
          pregledali parametre zadržavanja, ključne događaje i povezane servise.
        </p>
        <Button
          onClick={handleRefresh}
          disabled={refreshing}
          className="mt-4"
          size="sm"
        >
          {refreshing ? (
            <>
              <LoaderCircle className="mr-2 size-3.5 animate-spin" />
              Očitavanje u toku...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 size-3.5" />
              Očitaj konfiguraciju sada
            </>
          )}
        </Button>
      </Card>
    );
  }

  const serviceLevel = translateServiceLevel(config.serviceLevel);
  const retention = translateRetention(config.eventDataRetention);

  return (
    <section className="rounded-xl border bg-card p-6 shadow-card space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-soft pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Google Analytics - konfiguracija propertije
            </h2>
            <span className="rounded-md bg-surface-raised px-2 py-0.5 font-mono text-[11px] text-text-muted border border-line-soft">
              ID: {config.propertyId}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Očitana podešavanja sa GA4 Admin API-ja koja utiču na raspoloživost i tumačenje izveštaja.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="shrink-0 text-xs"
        >
          {refreshing ? (
            <>
              <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
              Osvežavanje...
            </>
          ) : (
            <>
              <RefreshCw className="mr-1.5 size-3.5" />
              Osveži konfiguraciju
            </>
          )}
        </Button>
      </div>

      {feedback && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg p-3 text-xs",
            feedback.ok
              ? "bg-surface-raised text-foreground border border-line"
              : "bg-danger/10 text-danger border border-danger/20",
          )}
        >
          {feedback.ok ? (
            <CheckCircle2 className="size-4 shrink-0 text-accent-400" />
          ) : (
            <ShieldAlert className="size-4 shrink-0 text-danger" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* a) Osnovni podaci */}
      <Reveal>
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Osnovni podaci
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-line-soft bg-surface-raised/40 p-3">
              <span className="text-[11px] text-text-muted block">Naziv propertije</span>
              <span className="text-xs font-medium text-foreground font-mono">
                {config.displayName || "(Nije postavljen)"}
              </span>
            </div>

            <div className="rounded-lg border border-line-soft bg-surface-raised/40 p-3">
              <span className="text-[11px] text-text-muted block">Vremenska zona</span>
              <span className="text-xs font-medium text-foreground font-mono">
                {config.timeZone || "UTC"}
              </span>
            </div>

            <div className="rounded-lg border border-line-soft bg-surface-raised/40 p-3">
              <span className="text-[11px] text-text-muted block">Valuta izveštaja</span>
              <span className="text-xs font-medium text-foreground font-mono">
                {config.currencyCode || "Nije definisana"}
              </span>
            </div>

            <div className="rounded-lg border border-line-soft bg-surface-raised/40 p-3">
              <span className="text-[11px] text-text-muted block">Nivo usluge</span>
              <span className="text-xs font-medium text-foreground">
                {serviceLevel.label}{" "}
                {serviceLevel.raw && (
                  <span className="font-mono text-[10px] text-text-muted">
                    ({serviceLevel.raw})
                  </span>
                )}
              </span>
            </div>

            <div className="rounded-lg border border-line-soft bg-surface-raised/40 p-3">
              <span className="text-[11px] text-text-muted block">Industrija</span>
              <span className="text-xs font-medium text-foreground font-mono">
                {config.industryCategory || "UNSPECIFIED"}
              </span>
            </div>

            <div className="rounded-lg border border-line-soft bg-surface-raised/40 p-3">
              <span className="text-[11px] text-text-muted block">Datum kreiranja</span>
              <span className="text-xs font-medium text-foreground">
                {config.createTime ? formatLongDate(config.createTime) : "—"}
              </span>
            </div>
          </div>
        </div>
      </Reveal>

      {/* b) Čuvanje podataka (ISTAKNUTO) */}
      <Reveal delay={0.05}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-text-muted" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Čuvanje podataka (Data Retention)
            </h3>
          </div>

          <div className="rounded-xl border border-line bg-surface-raised/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs text-text-muted block">
                  Period zadržavanja podataka o događajima i korisnicima:
                </span>
                <span className="text-sm font-semibold text-foreground font-mono">
                  {retention.label}{" "}
                  {retention.raw && (
                    <span className="text-xs font-normal text-text-muted">
                      ({retention.raw})
                    </span>
                  )}
                </span>
              </div>

              <div className="text-right">
                <span className="text-xs text-text-muted block">
                  Resetovanje na novu aktivnost:
                </span>
                <span className="text-xs font-medium text-foreground">
                  {config.resetUserDataOnNewActivity === true
                    ? "Uključeno (Da)"
                    : config.resetUserDataOnNewActivity === false
                      ? "Isključeno (Ne)"
                      : "—"}
                </span>
              </div>
            </div>

            {/* Warning when retention is under 90 days (e.g. TWO_MONTHS) */}
            {retention.isShort && (
              <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  GA4 čuva podatke o događajima {retention.label}. Istorija duža od toga
                  ne postoji ni kod Google-a, pa je panel ne može prikazati — to nije
                  greška u sinhronizaciji. Period se menja u GA4 administraciji.
                </p>
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* c) Ključni događaji (Key Events) */}
      <Reveal delay={0.1}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-text-muted" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Ključni događaji
            </h3>
          </div>
          <p className="text-xs text-text-muted">
            Metrika &apos;Ključni događaji&apos; na svim ekranima broji tačno ove događaje.
          </p>

          {!config.keyEvents || config.keyEvents.length === 0 ? (
            <div className="rounded-lg border border-line-soft bg-surface-raised/30 p-4 text-xs text-text-muted">
              Nijedan događaj nije označen kao ključni, pa je metrika svuda 0. Označava se u GA4 administraciji.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line-soft">
              <table className="w-full text-xs">
                <thead className="bg-surface-raised/60 border-b border-line-soft text-text-muted text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-medium">Naziv događaja</th>
                    <th className="py-2.5 px-3 text-left font-medium">Način brojanja</th>
                    <th className="py-2.5 px-3 text-left font-medium">Tip</th>
                    <th className="py-2.5 px-3 text-right font-medium">Datum kreiranja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft font-mono">
                  {config.keyEvents.map((ke) => {
                    const counting = translateCountingMethod(ke.countingMethod);
                    return (
                      <tr key={ke.eventName} className="hover:bg-surface-raised/30">
                        <td className="py-2.5 px-3 font-semibold text-foreground">
                          {ke.eventName}
                        </td>
                        <td className="py-2.5 px-3 text-foreground font-sans">
                          {counting.label}{" "}
                          {counting.raw && (
                            <span className="text-[10px] text-text-muted font-mono">
                              ({counting.raw})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-text-muted font-sans">
                          {ke.custom ? "Prilagođeni" : "Standardni"}
                        </td>
                        <td className="py-2.5 px-3 text-right text-text-muted font-sans">
                          {ke.createTime ? formatLongDate(ke.createTime) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Reveal>

      {/* d) Tokovi podataka (Data Streams) */}
      <Reveal delay={0.15}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-text-muted" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Tokovi podataka (Data Streams)
            </h3>
          </div>

          {!config.dataStreams || config.dataStreams.length === 0 ? (
            <div className="rounded-lg border border-line-soft bg-surface-raised/30 p-4 text-xs text-text-muted">
              Nema registrovanih tokova podataka za ovu propertiju.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line-soft">
              <table className="w-full text-xs">
                <thead className="bg-surface-raised/60 border-b border-line-soft text-text-muted text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-medium">Naziv toka</th>
                    <th className="py-2.5 px-3 text-left font-medium">Tip</th>
                    <th className="py-2.5 px-3 text-left font-medium">Measurement ID</th>
                    <th className="py-2.5 px-3 text-left font-medium">Adresa veb sajta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft font-mono">
                  {config.dataStreams.map((ds, i) => {
                    const streamType = translateStreamType(ds.type);
                    return (
                      <tr key={`${ds.displayName}-${i}`} className="hover:bg-surface-raised/30">
                        <td className="py-2.5 px-3 font-semibold text-foreground font-sans">
                          {ds.displayName}
                        </td>
                        <td className="py-2.5 px-3 text-text-muted font-sans">
                          {streamType.label}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-foreground">
                          {ds.measurementId || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-text-muted">
                          {ds.defaultUri || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Reveal>

      {/* e) Veze ka Google Ads */}
      <Reveal delay={0.2}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone className="size-4 text-text-muted" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Veze ka Google Ads
            </h3>
          </div>

          {!config.googleAdsLinks || config.googleAdsLinks.length === 0 ? (
            <div className="rounded-lg border border-line-soft bg-surface-raised/30 p-4 text-xs text-text-muted">
              Google Ads nije povezan sa ovom propertijom. Povezivanje se vrši u GA4 administraciji pod sekcijom <em>Veze proizvoda (Product Links)</em>.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line-soft">
              <table className="w-full text-xs">
                <thead className="bg-surface-raised/60 border-b border-line-soft text-text-muted text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-medium">Customer ID</th>
                    <th className="py-2.5 px-3 text-left font-medium">Personalizacija oglasa</th>
                    <th className="py-2.5 px-3 text-right font-medium">Datum povezivanja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft font-mono">
                  {config.googleAdsLinks.map((gal) => (
                    <tr key={gal.customerId} className="hover:bg-surface-raised/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">
                        {formatCustomerId(gal.customerId)}
                      </td>
                      <td className="py-2.5 px-3 text-foreground font-sans">
                        {gal.adsPersonalizationEnabled ? "Omogućena (Da)" : "Onemogućena (Ne)"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-text-muted font-sans">
                        {gal.createTime ? formatLongDate(gal.createTime) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Reveal>

      {/* f) Prilagođene dimenzije i metrike */}
      <Reveal delay={0.25}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-text-muted" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Prilagođene dimenzije i metrike
            </h3>
          </div>
          <p className="text-xs text-text-muted">
            Ove se mogu koristiti u budućim izveštajima.
          </p>

          {(!config.customDimensions || config.customDimensions.length === 0) &&
          (!config.customMetrics || config.customMetrics.length === 0) ? (
            <div className="rounded-lg border border-line-soft bg-surface-raised/30 p-4 text-xs text-text-muted">
              Nema prilagođenih dimenzija i metrika. Ovo je uobičajeno stanje za standardne sajtove.
            </div>
          ) : (
            <div className="space-y-4">
              {config.customDimensions && config.customDimensions.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-line-soft">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-raised/60 border-b border-line-soft text-text-muted text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3 text-left font-medium">Naziv parametra</th>
                        <th className="py-2.5 px-3 text-left font-medium">Prikazno ime</th>
                        <th className="py-2.5 px-3 text-left font-medium">Opseg (Scope)</th>
                        <th className="py-2.5 px-3 text-left font-medium">Opis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft font-mono">
                      {config.customDimensions.map((cd) => (
                        <tr key={cd.parameterName} className="hover:bg-surface-raised/30">
                          <td className="py-2.5 px-3 font-semibold text-foreground">
                            {cd.parameterName}
                          </td>
                          <td className="py-2.5 px-3 text-foreground font-sans">
                            {cd.displayName}
                          </td>
                          <td className="py-2.5 px-3 text-text-muted font-sans">
                            {translateScope(cd.scope)}
                          </td>
                          <td className="py-2.5 px-3 text-text-muted font-sans">
                            {cd.description || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {config.customMetrics && config.customMetrics.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-line-soft">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-raised/60 border-b border-line-soft text-text-muted text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3 text-left font-medium">Naziv parametra</th>
                        <th className="py-2.5 px-3 text-left font-medium">Prikazno ime</th>
                        <th className="py-2.5 px-3 text-left font-medium">Opseg (Scope)</th>
                        <th className="py-2.5 px-3 text-left font-medium">Opis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft font-mono">
                      {config.customMetrics.map((cm) => (
                        <tr key={cm.parameterName} className="hover:bg-surface-raised/30">
                          <td className="py-2.5 px-3 font-semibold text-foreground">
                            {cm.parameterName}
                          </td>
                          <td className="py-2.5 px-3 text-foreground font-sans">
                            {cm.displayName}
                          </td>
                          <td className="py-2.5 px-3 text-text-muted font-sans">
                            {translateScope(cm.scope)}
                          </td>
                          <td className="py-2.5 px-3 text-text-muted font-sans">
                            {cm.description || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </Reveal>

      {/* g) Greške pri očitavanju (ako postoje) */}
      {config.errors && config.errors.length > 0 && (
        <Reveal delay={0.3}>
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Resursi koji nisu očitani
            </h3>
            <div className="rounded-lg border border-line-soft bg-surface-raised/30 p-3 space-y-2">
              {config.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-text-muted">
                  <Info className="size-3.5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-mono font-medium text-foreground">
                      {err.resource}:
                    </span>{" "}
                    <span>{err.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {/* h) Podnožje */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-4 text-xs text-text-muted">
        <div>
          <span>
            Očitano {formatRelativeTime(config.fetchedAt)}.
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs"
        >
          {refreshing ? (
            <>
              <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
              Osvežavanje...
            </>
          ) : (
            <>
              <RefreshCw className="mr-1.5 size-3.5" />
              Ručno osveži
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

export function Ga4ConfigurationSkeleton() {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-card space-y-6">
      <div className="flex justify-between items-center border-b border-line-soft pb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </section>
  );
}
