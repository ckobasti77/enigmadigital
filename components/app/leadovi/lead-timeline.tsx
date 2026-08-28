"use client";

import { useMemo } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  Activity,
  Calendar,
  Clock,
  ExternalLink,
  Flame,
  HelpCircle,
  Info,
  MessageSquare,
  PhoneCall,
  Sparkles,
  Tag,
  UserCheck,
  Zap,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { FeedbackNote } from "@/components/app/feedback";
import { leadSignalLabel, leadStageLabel } from "./lead-labels";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type TimelineItem =
  | {
      type: "event";
      id: string;
      timestamp: number;
      event: Doc<"leadStageEvents">;
    }
  | {
      type: "signal";
      id: string;
      timestamp: number;
      signal: Doc<"leadSignals">;
    };

type LeadTimelineProps = {
  signals: Doc<"leadSignals">[];
  stageEvents: Doc<"leadStageEvents">[];
  signalsTruncated: boolean;
};

export function LeadTimeline({
  signals,
  stageEvents,
  signalsTruncated,
}: LeadTimelineProps) {
  // Spajanje signala i CRM događaja u jednu hronološku listu (najnoviji prvi)
  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [
      ...stageEvents.map((event) => ({
        type: "event" as const,
        id: `event-${event._id}`,
        timestamp: event.occurredAt,
        event,
      })),
      ...signals.map((signal) => ({
        type: "signal" as const,
        id: `signal-${signal._id}`,
        timestamp: signal.observedAt,
        signal,
      })),
    ];

    // Sortiraj opadajuće po vremenu
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [signals, stageEvents]);

  const getEventKindLabel = (kind: Doc<"leadStageEvents">["kind"]) => {
    switch (kind) {
      case "dodela":
        return "Promena vlasnika";
      case "faza":
        return "Promena faze";
      case "dodir":
        return "Zabeležen kontakt (dodir)";
      case "ishod":
        return "Zabeležen ishod";
      case "sledeci_korak":
        return "Postavljen sledeći korak";
      default:
        return kind;
    }
  };

  const getEventKindIcon = (kind: Doc<"leadStageEvents">["kind"]) => {
    switch (kind) {
      case "dodela":
        return <UserCheck className="size-3.5 text-accent-400" />;
      case "faza":
        return <Tag className="size-3.5 text-info" />;
      case "dodir":
        return <PhoneCall className="size-3.5 text-success" />;
      case "ishod":
        return <Activity className="size-3.5 text-purple-400" />;
      case "sledeci_korak":
        return <Calendar className="size-3.5 text-amber-400" />;
      default:
        return <Clock className="size-3.5 text-text-muted" />;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Obaveštenje ako je lista signala odsečena na granici */}
      {signalsTruncated && (
        <FeedbackNote tone="warning" title="Prikazan je deo signala">
          Prikazano je 200 najskorijih signala zabeleženih za ovu firmu. Postoje i stariji signali
          koji nisu učitani u ovom pregledu.
        </FeedbackNote>
      )}

      <Card className="border-line bg-surface">
        <CardHeader className="border-b border-line pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Vremenska osa i istorijat ({timelineItems.length})
              </CardTitle>
              <CardDescription className="text-xs text-text-muted mt-0.5">
                Ujedinjen hronološki pregled svih opaženih signala i operativnih CRM radnji.
              </CardDescription>
            </div>
            <span className="rounded bg-surface-raised border border-line px-2 py-0.5 text-micro font-medium text-text-muted">
              §2.5 & §9.1
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {timelineItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              Nema zabeleženih signala niti događaja za ovu firmu.
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-line">
              {timelineItems.map((item) => {
                if (item.type === "event") {
                  const event = item.event;
                  // Pravilo 4: za stageEvents sa timeConfirmed === false prikaži „vreme nije potvrđeno"
                  const isTimeConfirmed = event.timeConfirmed !== false;

                  return (
                    <div key={item.id} className="relative group">
                      {/* Kružić na vremenskoj liniji */}
                      <div className="absolute -left-6 top-0.5 flex size-5 items-center justify-center rounded-full border border-line bg-surface-raised">
                        {getEventKindIcon(event.kind)}
                      </div>

                      <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-raised/40 p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold text-foreground">
                            <span>{getEventKindLabel(event.kind)}</span>
                            {event.kind === "faza" && event.toValue && (
                              <span className="rounded bg-info/10 px-1.5 py-0.2 text-micro font-bold text-info border border-info/30">
                                {leadStageLabel(event.toValue)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-micro text-text-muted">
                            <span>{formatDateTime(event.occurredAt)}</span>
                            <span>({formatRelativeTime(event.occurredAt)})</span>

                            {!isTimeConfirmed && (
                              <span
                                className="rounded bg-warning/10 px-1.5 py-0.2 text-micro font-semibold text-warning border border-warning/30"
                                title="Vreme događaja nije eksplicitno uneo operater već je preuzeto sistemsko vreme unosa"
                              >
                                vreme nije potvrđeno
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Detalji promene (from -> to) */}
                        {event.fromValue && event.toValue && event.kind !== "faza" && (
                          <div className="text-micro text-text-muted">
                            Prethodna vrednost: <span className="line-through">{event.fromValue}</span> →{" "}
                            <strong className="text-foreground">{event.toValue}</strong>
                          </div>
                        )}

                        {/* Ishod ili sledeći korak vrednost */}
                        {event.kind === "ishod" && event.toValue && (
                          <div className="mt-0.5 text-xs text-foreground">
                            Ishod: <strong>{event.toValue}</strong>
                          </div>
                        )}

                        {event.kind === "sledeci_korak" && event.toValue && (
                          <div className="mt-0.5 text-xs text-foreground">
                            Termin:{" "}
                            <strong>
                              {isNaN(Number(event.toValue))
                                ? event.toValue
                                : formatDateTime(Number(event.toValue))}
                            </strong>
                          </div>
                        )}

                        {/* Napomena */}
                        {event.note && (
                          <div className="mt-1 rounded bg-surface border border-line-soft p-2 text-xs italic text-text-muted">
                            „{event.note}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Signal item
                const signal = item.signal;
                const hasSource = Boolean(signal.source && signal.source.trim());

                return (
                  <div key={item.id} className="relative group">
                    {/* Kružić na vremenskoj liniji */}
                    <div className="absolute -left-6 top-0.5 flex size-5 items-center justify-center rounded-full border border-line bg-accent-400/10">
                      <Zap className="size-3 text-accent-400" />
                    </div>

                    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground">
                            {leadSignalLabel(signal.kind)}
                          </span>

                          {/* Pravilo 4: Izvor signala je OBAVEZAN - signal bez izvora nije činjenica */}
                          {hasSource ? (
                            <span
                              className="rounded bg-surface-raised border border-line px-1.5 py-0.2 text-micro font-medium text-text-muted"
                              title="Izvor iz kog je ovaj signal opažen"
                            >
                              Izvor: {signal.source}
                            </span>
                          ) : (
                            <span className="rounded bg-warning/10 border border-warning/30 px-1.5 py-0.2 text-micro font-semibold text-warning">
                              Izvor nije zabeležen
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-micro text-text-muted">
                          <span>{formatDateTime(signal.observedAt)}</span>
                          <span>({formatRelativeTime(signal.observedAt)})</span>
                        </div>
                      </div>

                      {/* Vrednost signala (npr. ocena, brojilac/imenilac, tekst) */}
                      {(signal.value ||
                        (signal.numerator !== undefined && signal.denominator !== undefined)) && (
                        <div className="text-micro text-text-muted mt-0.5">
                          {signal.value && <span>Vrednost: <strong>{signal.value}</strong> </span>}
                          {signal.numerator !== undefined && signal.denominator !== undefined && (
                            <span>
                              Odnos: <strong>{signal.numerator}</strong> od <strong>{signal.denominator}</strong>
                            </span>
                          )}
                        </div>
                      )}

                      {/* URL izvora */}
                      {signal.sourceUrl && (
                        <div className="mt-1 pt-1 border-t border-line-soft flex items-center gap-1 text-micro">
                          <span className="text-text-muted">Referenca:</span>
                          <a
                            href={signal.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-accent-400 hover:underline truncate max-w-sm"
                          >
                            <span>{signal.sourceUrl}</span>
                            <ExternalLink className="size-2.5 shrink-0" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
