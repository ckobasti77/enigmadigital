"use client";

import { useState } from "react";
import {
  useMoze,
  useProjekatAction,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import {
  Send,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Info,
  ShieldAlert,
  RotateCcw,
} from "lucide-react";
import { formatDateTime, formatNumber } from "@/lib/format";
import { DOGADJAJ_KONVERZIJE, POJAM, naziv } from "@/lib/recnik";

export function CapiSection() {
  // Ručno slanje događaja ka Meti sme samo vlasnik; ostali vide samo stanje.
  const mozeVlasnik = useMoze("owner");
  const [dispatching, setDispatching] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "danger";
    message: string;
  } | null>(null);

  const [clientNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const stats = useProjekatQuery(api.metaCapiStore.getCapiStats, { nowSec: clientNowSec });
  const triggerDispatch = useProjekatAction(api.metaCapi.triggerCapiDispatchAction);

  const handleManualDispatch = async () => {
    setDispatching(true);
    setFeedback(null);
    try {
      const res = await triggerDispatch();
      if (res.skipped) {
        setFeedback({
          tone: "warning",
          message:
            "Slanje je već u toku u drugom procesu. Događaji na čekanju se trenutno obrađuju.",
        });
      } else if (res.success) {
        setFeedback({
          tone: "success",
          message: `Uspešno poslato događaja Meti: ${res.sent}.${res.rejected > 0 ? ` Odbijeno: ${res.rejected}.` : ""}`,
        });
      } else {
        if (res.reason === "missing_credentials") {
          setFeedback({
            tone: "warning",
            message:
              "Slanje konverzija Meti nije podešeno. Podesi Meta piksel i pristupni token u Podešavanjima → Sajt i oglasi.",
          });
        } else {
          setFeedback({
            tone: "danger",
            message: `Slanje nije uspelo: ${res.reason || "Nepoznata greška"}`,
          });
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Greška pri pokretanju slanja konverzija Meti.";
      setFeedback({ tone: "danger", message: msg });
    } finally {
      setDispatching(false);
    }
  };

  const isConfigured = stats?.configured ?? false;
  const nedostaje = stats?.nedostaje ?? [];
  const sentCount = stats?.sentCount;
  const pendingCount = stats?.pendingCount;
  const retryingCount = stats?.retryingCount;
  const rejectedCount = stats?.rejectedCount;
  const recentRejected = stats?.recentRejected ?? [];

  return (
    <Card className="border-line bg-surface-raised shadow-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold text-foreground">
              {POJAM.slanjeKonverzija}
            </CardTitle>
            {stats !== undefined && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-medium ${
                  isConfigured
                    ? "bg-success-soft text-success border border-success-line"
                    : "bg-warning/10 text-warning border border-warning/20"
                }`}
              >
                {isConfigured ? (
                  <>
                    <CheckCircle2 className="size-3" />
                    Aktivan
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-3" />
                    Nije konfigurisan
                  </>
                )}
              </span>
            )}
          </div>
          <CardDescription className="text-xs text-text-muted">
            Praćenje konverzija i preusmeravanja sa servera (/r/ linkovi i OpenReply) bez curenja ličnih podataka.
          </CardDescription>
        </div>

        {mozeVlasnik && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualDispatch}
              disabled={dispatching || (pendingCount !== undefined && pendingCount === 0)}
              className="text-xs"
            >
              <RefreshCw
                className={`mr-1.5 size-3.5 ${dispatching ? "animate-spin" : ""}`}
              />
              {dispatching ? "Slanje..." : "Pošalji na čekanju"}
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Feedback Alert */}
        {feedback && (
          <FeedbackNote
            tone={feedback.tone}
            title={
              feedback.tone === "success"
                ? "Uspešno"
                : feedback.tone === "warning"
                  ? "Obaveštenje"
                  : "Greška"
            }
          >
            {feedback.message}
          </FeedbackNote>
        )}

        {/* Configuration Notice */}
        {stats !== undefined && !isConfigured && (
          <FeedbackNote
            tone="warning"
            title="Slanje konverzija Meti nije u potpunosti podešeno"
          >
            <p className="mt-0.5 text-xs text-text-muted">
              Događaji se bezbedno heširaju i čuvaju u bazi u statusu <strong>„na čekanju”</strong>.
              Da bi se automatski slali Meti, podesi{" "}
              <span className="font-semibold text-foreground">
                {nedostaje
                  .map((n) => (n === "piksel" ? "Meta piksel" : "pristupni token"))
                  .join(" i ")}
              </span>{" "}
              u Podešavanjima → Sajt i oglasi.
            </p>
          </FeedbackNote>
        )}

        {/* 4 Metric Cards for 7 Days (B-F3e) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Poslati */}
          <div className="flex flex-col rounded-lg border border-line bg-surface-subtle p-3">
            <div className="flex items-center justify-between text-text-muted">
              <span className="text-xs font-medium">Poslati (7 dana)</span>
              <Send className="size-4 text-success" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="tabular-nums text-2xl font-bold text-foreground">
                {sentCount !== undefined ? formatNumber(sentCount) : "—"}
              </span>
            </div>
          </div>

          {/* Na čekanju */}
          <div className="flex flex-col rounded-lg border border-line bg-surface-subtle p-3">
            <div className="flex items-center justify-between text-text-muted">
              <span className="text-xs font-medium">Na čekanju</span>
              <Clock className="size-4 text-mod" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="tabular-nums text-2xl font-bold text-foreground">
                {pendingCount !== undefined ? formatNumber(pendingCount) : "—"}
              </span>
            </div>
          </div>

          {/* U ponovnom pokušaju (B-F3e) */}
          <div className="flex flex-col rounded-lg border border-line bg-surface-subtle p-3">
            <div className="flex items-center justify-between text-text-muted">
              <span className="text-xs font-medium">U ponovnom pokušaju</span>
              <RotateCcw className="size-4 text-warning" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="tabular-nums text-2xl font-bold text-foreground">
                {retryingCount !== undefined ? formatNumber(retryingCount) : "—"}
              </span>
            </div>
          </div>

          {/* Odbijeni lokalno / trajno */}
          <div className="flex flex-col rounded-lg border border-line bg-surface-subtle p-3">
            <div className="flex items-center justify-between text-text-muted">
              <span className="text-xs font-medium">Odbijeni</span>
              <ShieldAlert className="size-4 text-danger" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="tabular-nums text-2xl font-bold text-foreground">
                {rejectedCount !== undefined ? formatNumber(rejectedCount) : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Rejected Events Table / Empty State */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Nedavno odbijeni događaji ({recentRejected.length})
            </span>
          </div>

          {recentRejected.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-line bg-surface">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-subtle text-text-muted">
                    <th className="px-3 py-2 font-medium">Vreme</th>
                    <th className="px-3 py-2 font-medium">Događaj</th>
                    <th className="px-3 py-2 font-medium">Izvor</th>
                    <th className="px-3 py-2 font-medium">Pokušaji</th>
                    <th className="px-3 py-2 font-medium">Razlog odbijanja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recentRejected.map((item) => (
                    <tr key={item._id} className="hover:bg-surface-raised/50">
                      <td className="whitespace-nowrap px-3 py-2 text-text-muted">
                        {formatDateTime(item.eventTime * 1000)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                        {naziv(DOGADJAJ_KONVERZIJE, item.eventName)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-text-muted">
                        {item.sourceKind === "link_redirect"
                          ? "Link preusmeravanje (/r/)"
                          : "OpenReply konverzija"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-text-muted">
                        {item.attempts || 0}
                      </td>
                      <td className="px-3 py-2 text-warning">
                        {item.rejectReason || "Nevalidan format podataka."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-line p-3 text-xs text-text-muted">
              <Info className="size-4 text-text-muted" />
              <span>
                Nema odbijenih događaja. Svi zabeleženi događaji su uspešno procesirani.
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
