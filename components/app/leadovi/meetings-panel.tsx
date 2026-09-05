"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type MeetingsPanelProps = {
  workspaceId: Id<"workspaces">;
};

/** Jedna stavka sastanka, kako je vraća `api.leadCrmStore.listMeetings`. */
export type MeetingItem = {
  assignment: Doc<"leadAssignments">;
  company: Doc<"leadCompanies"> | null;
  meetingAt: number;
  meetingNote?: string;
  uProslosti: boolean;
  ishodZabelezen: boolean;
};

export type MeetingGroups = {
  danas: MeetingItem[];
  sutra: MeetingItem[];
  oveNedelje: MeetingItem[];
  prosliBezIshoda: MeetingItem[];
};

/**
 * Razvrstava sastanke u četiri grupe (§4) po LOKALNOM danu.
 *
 * Grupisanje je namerno na klijentu: server je UTC, a „danas" je lokalni pojam,
 * pa bi klasifikacija oko ponoći na serveru bila pogrešna. Granice dana se
 * računaju iz `now` (koji stiže iz upita) tumačenog u lokalnoj zoni.
 *
 * Prioritet upozorenja: prošao sastanak bez ishoda ide u `prosliBezIshoda` bez
 * obzira na dan (to je razlog zbog kog panel postoji). „Danas/Sutra/Ove nedelje"
 * su budući sastanci; prošli-sa-ishodom i oni dalji od ove nedelje se ne prikazuju.
 */
export function groupMeetings(items: MeetingItem[], now: number): MeetingGroups {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const tomorrowStart = todayStart.getTime() + dayMs;
  const dayAfterStart = todayStart.getTime() + 2 * dayMs;

  // Početak sledeće nedelje (ponedeljak 00:00). Nedelja počinje ponedeljkom.
  const dow = todayStart.getDay(); // 0=ned .. 6=sub
  const daysUntilNextMonday = ((8 - dow) % 7) || 7;
  const nextWeekStart = todayStart.getTime() + daysUntilNextMonday * dayMs;

  const groups: MeetingGroups = {
    danas: [],
    sutra: [],
    oveNedelje: [],
    prosliBezIshoda: [],
  };

  for (const item of items) {
    if (item.uProslosti) {
      // Prošao + bez ishoda = upozorenje. Prošao + ishod zabeležen = gotovo, ne prikazuje se.
      if (!item.ishodZabelezen) groups.prosliBezIshoda.push(item);
      continue;
    }
    const t = item.meetingAt;
    if (t < tomorrowStart) groups.danas.push(item);
    else if (t < dayAfterStart) groups.sutra.push(item);
    else if (t < nextWeekStart) groups.oveNedelje.push(item);
    // dalje od ove nedelje: ne prikazuje se
  }

  return groups;
}

/** Broj koji ide na jezičak: sastanci danas + prošli bez zabeleženog ishoda. */
export function meetingsBadgeCount(groups: MeetingGroups): number {
  return groups.danas.length + groups.prosliBezIshoda.length;
}

export function MeetingsPanel({ workspaceId }: MeetingsPanelProps) {
  const data = useQuery(api.leadCrmStore.listMeetings, { workspaceId });

  const groups = useMemo(
    () => (data ? groupMeetings(data.items as MeetingItem[], data.now) : null),
    [data],
  );

  if (data === undefined || groups === null) {
    return <MeetingsPanelSkeleton />;
  }

  const ukupno =
    groups.danas.length +
    groups.sutra.length +
    groups.oveNedelje.length +
    groups.prosliBezIshoda.length;

  return (
    <div className="flex flex-col gap-6">
      {data.mozdaImaJos && (
        <FeedbackNote tone="warning" title="Lista sastanaka nije potpuna">
          Iza granice pretrage možda ima još sastanaka. Rešite prikazane stavke
          kako bi se oslobodilo mesto za preostale.
        </FeedbackNote>
      )}

      {ukupno === 0 ? (
        <Card className="border-line bg-surface">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-text-muted">
            <CalendarClock className="mb-2 size-10 text-text-soft" />
            <p className="text-sm font-semibold text-foreground">
              Nema zakazanih sastanaka
            </p>
            <p className="mt-1 max-w-sm text-xs text-text-muted">
              Sastanci zakazani iz tabele ili profila firme pojaviće se ovde,
              raspoređeni po danima.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Grupa upozorenja ide prva — to je razlog postojanja panela (§4). */}
          <MeetingGroup
            title="Prošli, bez zabeleženog ishoda"
            description="Sastanak je prošao, a niko nije upisao šta se desilo."
            items={groups.prosliBezIshoda}
            tone="danger"
          />
          <MeetingGroup
            title="Danas"
            description="Sastanci zakazani za danas."
            items={groups.danas}
            tone="warning"
          />
          <MeetingGroup
            title="Sutra"
            description="Sastanci zakazani za sutra."
            items={groups.sutra}
            tone="neutral"
          />
          <MeetingGroup
            title="Ove nedelje"
            description="Sastanci do kraja ove nedelje."
            items={groups.oveNedelje}
            tone="neutral"
          />
        </>
      )}
    </div>
  );
}

function MeetingGroup({
  title,
  description,
  items,
  tone,
}: {
  title: string;
  description: string;
  items: MeetingItem[];
  tone: "danger" | "warning" | "neutral";
}) {
  // Prazne grupe se ne crtaju osim upozorenja — čist ekran kad nema ničega,
  // ali grupa upozorenja se izostavlja jednako (nema šta da upozori).
  if (items.length === 0) return null;

  const toneRing =
    tone === "danger"
      ? "border-danger/40"
      : tone === "warning"
        ? "border-warning/40"
        : "border-line";

  return (
    <Card className={cn("bg-surface", toneRing)}>
      <CardHeader className="border-b border-line pb-3">
        <div className="flex items-center gap-2">
          {tone === "danger" && (
            <AlertTriangle className="size-4 shrink-0 text-danger" />
          )}
          <div>
            <CardTitle
              className={cn(
                "text-sm font-bold",
                tone === "danger" ? "text-danger" : "text-foreground",
              )}
            >
              {title} ({items.length})
            </CardTitle>
            <CardDescription className="text-xs text-text-muted">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col divide-y divide-line p-0">
        {items.map((item) => (
          <MeetingRow key={item.assignment._id} item={item} tone={tone} />
        ))}
      </CardContent>
    </Card>
  );
}

function MeetingRow({
  item,
  tone,
}: {
  item: MeetingItem;
  tone: "danger" | "warning" | "neutral";
}) {
  const companyId = item.assignment.companyId;
  const profileHref = `/leadovi/${companyId}`;

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <Building2 className="mt-0.5 size-4 shrink-0 text-text-muted" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">
            {item.company ? item.company.name : "Nepoznata firma"}
          </span>
          <span
            className={cn(
              "text-xs font-medium",
              tone === "danger" ? "text-danger" : "text-text-muted",
            )}
          >
            <CalendarClock className="mr-1 inline size-3 -translate-y-px" />
            {formatDateTime(item.meetingAt)}
          </span>
          {item.meetingNote && (
            <span className="mt-0.5 truncate text-xs italic text-text-muted">
              „{item.meetingNote}"
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={profileHref}
          className={buttonVariants({
            size: "sm",
            variant: tone === "danger" ? "default" : "outline",
            className: "gap-1.5 text-xs",
          })}
        >
          <ClipboardCheck className="size-3.5" />
          Zabeleži ishod
        </Link>
        <Link
          href={profileHref}
          className={buttonVariants({
            size: "sm",
            variant: "outline",
            className: "gap-1.5 text-xs",
          })}
        >
          <ExternalLink className="size-3.5" />
          Otvori profil
        </Link>
      </div>
    </div>
  );
}

function MeetingsPanelSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
