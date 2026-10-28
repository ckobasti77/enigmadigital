"use client";

import { useMemo, type ReactNode } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  Activity,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Clock,
  ExternalLink,
  PhoneCall,
  Tag,
  UserCheck,
  Zap,
} from "lucide-react";
import { FeedbackNote } from "@/components/app/feedback";
import { useNow } from "@/components/app/use-now";
import { Chip } from "@/components/app/system/chip";
import { signalSlot, type CategorySlot } from "@/lib/signal-colors";
import { leadOutcomeLabel, leadSignalLabel, leadStageLabel } from "./lead-labels";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * ISTORIJA FIRME KAO VREMENSKA OSA (§8, v2 u B7)
 * ============================================================================
 *
 * Signali (šta je o firmi opaženo) i CRM događaji (šta je sa njom urađeno) u
 * jednoj hronologiji, najnovije prvo. Do B7 je svaka stavka bila kutija u
 * kutiji, sa ikonicama u bojama koje nisu bile tokeni; sada je to osa: linija,
 * tačka u boji VRSTE događaja i tekst bez okvira.
 *
 * Boja tačke je kategorija (ista paleta kao čipovi signala), pa se niz
 * poziva, ishoda i sastanaka čita pogledom niz liniju. Vrstu uvek nosi i
 * natpis stavke — boja nije jedini nosilac.
 *
 * Dva pravila poštenja ostaju: događaj čije vreme operater nije potvrdio to
 * kaže, a signal bez izvora je označen — signal bez izvora nije činjenica.
 */

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

/** Natpis, ikonica i boja kategorije po vrsti CRM događaja. `null` = neutralno. */
const DOGADJAJ: Record<
  string,
  { natpis: string; ikona: typeof Clock; boja: CategorySlot | null }
> = {
  dodela: { natpis: "Promena vlasnika", ikona: UserCheck, boja: null },
  faza: { natpis: "Promena faze", ikona: Tag, boja: 5 },
  dodir: { natpis: "Zabeležen kontakt (dodir)", ikona: PhoneCall, boja: 3 },
  ishod: { natpis: "Zabeležen ishod", ikona: Activity, boja: 6 },
  sledeci_korak: { natpis: "Postavljen sledeći korak", ikona: Calendar, boja: 2 },
  sastanak: { natpis: "Sastanak", ikona: CalendarClock, boja: 1 },
};

/** Korak skinut bez novog roka (`toValue` izostaje): urađen ili posao zatvoren. */
const KORAK_ZATVOREN = {
  uradjen: { natpis: "Korak urađen", ikona: CalendarCheck, boja: 2 },
  posao_zatvoren: { natpis: "Korak skinut: posao je zatvoren", ikona: CalendarX, boja: 2 },
} as const;

function opisDogadjaja(event: Doc<"leadStageEvents">) {
  if (event.kind === "sledeci_korak" && event.toValue === undefined) {
    return KORAK_ZATVOREN[event.korakZatvoren ?? "uradjen"];
  }
  return DOGADJAJ[event.kind] ?? { natpis: String(event.kind), ikona: Clock, boja: null };
}

const SEDAM_DANA_MS = 7 * 24 * 60 * 60 * 1000;

/** Vrednost koja je možda vreme (epoha kao tekst) — tada se ispisuje kao datum. */
function mozdaVreme(vrednost: string): string {
  return Number.isNaN(Number(vrednost)) ? vrednost : formatDateTime(Number(vrednost));
}

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
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [signals, stageEvents]);

  return (
    <section aria-label="Istorija" className="flex flex-col gap-4">
      {signalsTruncated && (
        <FeedbackNote tone="warning" title="Prikazan je deo signala">
          Prikazano je 200 najskorijih signala zabeleženih za ovu firmu. Postoje i stariji signali
          koji nisu učitani u ovom pregledu.
        </FeedbackNote>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-copy font-bold text-foreground">
          Istorija{" "}
          <span className="text-ui font-medium tabular-nums text-text-muted">
            {timelineItems.length}
          </span>
        </h2>
        <p className="text-meta text-text-muted">
          Opaženi signali i ono što je sa firmom urađeno, najnovije prvo.
        </p>
      </div>

      {timelineItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-ui text-text-muted">
          Nema zabeleženih signala ni događaja za ovu firmu. Prvi poziv ili ishod
          započinje istoriju.
        </p>
      ) : (
        <ol className="relative flex flex-col before:absolute before:top-3 before:bottom-3 before:left-3 before:w-px before:bg-line">
          {timelineItems.map((item) =>
            item.type === "event" ? (
              <Dogadjaj key={item.id} event={item.event} />
            ) : (
              <Signal key={item.id} signal={item.signal} />
            ),
          )}
        </ol>
      )}
    </section>
  );
}

/** Jedna stavka ose: tačka u boji vrste, naslov levo, vreme desno, pa detalji. */
function Stavka({
  boja,
  ikona: Ikona,
  naslov,
  vreme,
  uzVreme,
  children,
}: {
  boja: CategorySlot | null;
  ikona: typeof Clock;
  naslov: ReactNode;
  vreme: number;
  uzVreme?: ReactNode;
  children?: ReactNode;
}) {
  const now = useNow();
  const jeSkoro = now - vreme < SEDAM_DANA_MS;
  return (
    <li className="relative flex flex-col gap-1 pb-5 pl-10 last:pb-0">
      <span
        aria-hidden
        data-cat={boja ?? undefined}
        className={cn(
          "absolute top-0 left-0 flex size-6 items-center justify-center rounded-full border",
          boja
            ? "border-cat-line bg-cat-soft text-cat-ink"
            : "border-line bg-surface-raised text-text-muted",
        )}
      >
        <Ikona className="size-3.5" />
      </span>
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-ui font-medium text-foreground">
          {naslov}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-meta text-text-muted">
          <time dateTime={new Date(vreme).toISOString()}>{formatDateTime(vreme)}</time>
          {/* Posle sedam dana „relativno" vreme je opet datum — ne ponavlja se. */}
          {jeSkoro && <span>· {formatRelativeTime(vreme, now)}</span>}
          {uzVreme}
        </div>
      </div>
      {children}
    </li>
  );
}

function Dogadjaj({ event }: { event: Doc<"leadStageEvents"> }) {
  const opis = opisDogadjaja(event);
  // Pravilo 4: događaj čije vreme operater nije uneo to mora da kaže.
  const vremePotvrdjeno = event.timeConfirmed !== false;

  return (
    <Stavka
      boja={opis.boja}
      ikona={opis.ikona}
      vreme={event.occurredAt}
      naslov={
        <>
          <span>{opis.natpis}</span>
          {event.kind === "faza" && event.toValue && (
            <Chip size="sm" tone="neutral">
              {leadStageLabel(event.toValue)}
            </Chip>
          )}
        </>
      }
      uzVreme={
        !vremePotvrdjeno && (
          <Chip
            size="sm"
            tone="warning"
            title="Vreme događaja nije uneo operater; preuzeto je vreme upisa."
          >
            vreme nije potvrđeno
          </Chip>
        )
      }
    >
      {event.fromValue && event.toValue && event.kind !== "faza" && (
        <p className="text-ui text-text-muted">
          <span className="line-through">{event.fromValue}</span> →{" "}
          <span className="font-medium text-foreground">{event.toValue}</span>
        </p>
      )}

      {event.kind === "ishod" && event.toValue && (
        <p className="text-ui text-text-muted">
          Ishod:{" "}
          <span className="font-medium text-foreground">
            {leadOutcomeLabel(event.toValue)}
          </span>
        </p>
      )}

      {event.kind === "sledeci_korak" && event.toValue && (
        <p className="text-ui text-text-muted">
          Termin:{" "}
          <span className="font-medium text-foreground">{mozdaVreme(event.toValue)}</span>
        </p>
      )}

      {event.kind === "sledeci_korak" && !event.toValue && event.fromValue && (
        <p className="text-ui text-text-muted">
          Bio je dogovoren za:{" "}
          <span className="font-medium text-foreground">{mozdaVreme(event.fromValue)}</span>
        </p>
      )}

      {event.kind === "sastanak" &&
        (event.toValue ? (
          <p className="text-ui text-text-muted">
            Zakazan za:{" "}
            <span className="font-medium text-foreground">{mozdaVreme(event.toValue)}</span>
          </p>
        ) : (
          <p className="text-ui font-medium text-danger">Sastanak otkazan</p>
        ))}

      {event.note && (
        <p className="border-l-2 border-line pl-3 text-ui text-text-secondary italic">
          „{event.note}”
        </p>
      )}
    </Stavka>
  );
}

function Signal({ signal }: { signal: Doc<"leadSignals"> }) {
  const imaIzvor = Boolean(signal.source && signal.source.trim());
  const imaOdnos = signal.numerator !== undefined && signal.denominator !== undefined;

  return (
    <Stavka
      boja={signalSlot(signal.kind)}
      ikona={Zap}
      vreme={signal.observedAt}
      naslov={
        <>
          <span>{leadSignalLabel(signal.kind)}</span>
          {/* Pravilo 4: izvor je obavezan — signal bez izvora nije činjenica. */}
          {imaIzvor ? (
            <Chip size="sm" tone="muted" title="Izvor iz kog je ovaj signal opažen">
              {signal.source}
            </Chip>
          ) : (
            <Chip size="sm" tone="warning">
              izvor nije zabeležen
            </Chip>
          )}
        </>
      }
    >
      {(signal.value || imaOdnos) && (
        <p className="text-ui text-text-muted">
          {signal.value && (
            <>
              Vrednost:{" "}
              <span className="font-medium text-foreground">{signal.value}</span>{" "}
            </>
          )}
          {imaOdnos && (
            <>
              Odnos:{" "}
              <span className="font-medium tabular-nums text-foreground">
                {signal.numerator} od {signal.denominator}
              </span>
            </>
          )}
        </p>
      )}

      {signal.sourceUrl && (
        <a
          href={signal.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-meta text-mod underline-offset-2 hover:underline"
        >
          <span className="truncate">{signal.sourceUrl}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
      )}
    </Stavka>
  );
}
