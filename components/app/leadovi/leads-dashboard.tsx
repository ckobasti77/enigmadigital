"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CalendarClock,
  Clock,
  Compass,
  Map as MapIcon,
  SlidersHorizontal,
  ShieldAlert,
  Upload,
  Users,
} from "lucide-react";
import { useWorkspace } from "@/components/app/workspace-provider";
import type { Id } from "@/convex/_generated/dataModel";
import type { InvalidRule } from "@/convex/lib/leadScoring";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import { LeadsTable } from "./leads-table";
import { GapsPanel } from "./gaps-panel";
import { OverduePanel } from "./overdue-panel";
import { ScoringRulesPanel } from "./scoring-rules-panel";
import { NichesPanel } from "./niches-panel";
import { LeadsMap } from "./leads-map";
import { useLeadFilters } from "./use-lead-filters";
import { LeadExportDialog } from "./lead-export-dialog";
import {
  MeetingsPanel,
  groupMeetings,
  meetingsBadgeCount,
  type MeetingItem,
} from "./meetings-panel";

type Tab = "leads" | "map" | "niche" | "gaps" | "overdue" | "meetings" | "scoring";

const TABOVI: readonly Tab[] = [
  "leads",
  "map",
  "niche",
  "gaps",
  "overdue",
  "meetings",
  "scoring",
];

function jeTab(raw: string | null): raw is Tab {
  return raw !== null && (TABOVI as readonly string[]).includes(raw);
}

export function LeadsDashboard() {
  const { workspace, isLoading } = useWorkspace();
  const { applyQuery, nav, setNav } = useLeadFilters();
  // Jezičak živi u URL-u (GL3): `?tab=map&firma=<id>` iz profila mora da
  // otvori mapu sa panelom, a kopiran link isti jezičak. Tabela je
  // podrazumevana i ne upisuje se. Nepoznata vrednost = tabela.
  const tab: Tab = jeTab(nav.tab) ? nav.tab : "leads";
  const setTab = (next: Tab) => setNav({ tab: next === "leads" ? null : next });
  const [invalidRules, setInvalidRules] = useState<InvalidRule[]>([]);

  // Brojač na jezičku „Sastanci" (§4). Ista query se koristi i unutar panela —
  // Convex klijent deduplikuje na jednu pretplatu. `"skip"` dok radni prostor
  // nije spreman poštuje pravila hukova (poziva se pri svakom renderu).
  const wsId = workspace?.id as Id<"workspaces"> | undefined;
  const meetingsData = useQuery(
    api.leadCrmStore.listMeetings,
    wsId ? { workspaceId: wsId } : "skip",
  );
  const meetingsBadge = useMemo(() => {
    if (!meetingsData) return 0;
    return meetingsBadgeCount(
      groupMeetings(meetingsData.items as MeetingItem[], meetingsData.now),
    );
  }, [meetingsData]);

  if (isLoading || !workspace) {
    return <LeadsDashboardSkeleton />;
  }

  const workspaceId = workspace.id as Id<"workspaces">;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Obaveštenje o nevažećim ICP pravilima ocenjivanja (§4, KORAK 3.6) */}
      {invalidRules.length > 0 && (
        <FeedbackNote
          tone="warning"
          title={`${invalidRules.length} ${
            invalidRules.length === 1
              ? "pravilo ocenjivanja se ne primenjuje"
              : "pravila ocenjivanja se ne primenjuju"
          }`}
        >
          <div className="mt-1 flex flex-col gap-1.5 text-xs">
            <p>
              Pravilo koje ne radi ništa je greška u konfiguraciji, a ne ocena nula:
            </p>
            <div className="space-y-1">
              {invalidRules.map((rule, idx) => (
                <div
                  key={`${rule.ruleName}-${rule.signalKind}-${idx}`}
                  className="rounded border border-warning/30 bg-warning/5 p-2 font-mono text-micro text-foreground"
                >
                  <strong>{rule.ruleName}</strong> (signal: {rule.signalKind}) —{" "}
                  {rule.razlog === "nepoznat_signal"
                    ? "vrsta signala ne postoji u sistemu"
                    : "težina pravila je manja ili jednaka nuli"}
                </div>
              ))}
            </div>
          </div>
        </FeedbackNote>
      )}

      {/* Traka sa jezičcima */}
      <TabNav
        panelId="leadovi-panel"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "leads", label: "Tabela leadova", icon: Users },
          { id: "map", label: "Mapa", icon: MapIcon },
          { id: "niche", label: "Niše", icon: Compass },
          { id: "gaps", label: "Rupe u podacima", icon: ShieldAlert },
          { id: "overdue", label: "Zaostali koraci", icon: Clock },
          {
            id: "meetings",
            label: "Sastanci",
            icon: CalendarClock,
            badge:
              meetingsBadge > 0 ? (
                <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1.5 py-px text-micro font-bold text-white tabular-nums">
                  {meetingsBadge}
                </span>
              ) : undefined,
          },
          { id: "scoring", label: "Ocenjivanje", icon: SlidersHorizontal },
        ]}
        trailing={
          <div className="flex items-center gap-2">
            <LeadExportDialog workspaceId={workspaceId} />
            <Link
              href="/leadovi/uvoz"
              className={buttonVariants({
                size: "sm",
                className: "gap-2 text-xs",
              })}
            >
              <Upload className="size-3.5" />
              <span>Uvoz leadova</span>
            </Link>
          </div>
        }
      />

      {/* Sadržaj aktivnog jezička */}
      <TabPanel id="leadovi-panel" className="flex flex-1 flex-col">
        {tab === "leads" && (
          <LeadsTable
            workspaceId={workspaceId}
            onInvalidRulesFound={setInvalidRules}
          />
        )}
        {tab === "map" && <LeadsMap mode="all" workspaceId={workspaceId} />}
        {tab === "niche" && (
          <NichesPanel
            workspaceId={workspaceId}
            onShowCompanies={(slug) => {
              // Filter i jezičak u JEDNOM upisu — dva `router.replace` zaredom
              // bi drugi pregazio prvi (vidi `upisi` u hooku).
              applyQuery(`nisa=${encodeURIComponent(slug)}`, { tab: null });
            }}
          />
        )}
        {tab === "gaps" && <GapsPanel workspaceId={workspaceId} />}
        {tab === "overdue" && <OverduePanel workspaceId={workspaceId} />}
        {tab === "meetings" && <MeetingsPanel workspaceId={workspaceId} />}
        {tab === "scoring" && <ScoringRulesPanel workspaceId={workspaceId} />}
      </TabPanel>
    </div>
  );
}

function LeadsDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
