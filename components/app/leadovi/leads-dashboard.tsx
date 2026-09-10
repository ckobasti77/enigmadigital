"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Compass,
  Map as MapIcon,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Upload,
  Users,
} from "lucide-react";
import { useWorkspace } from "@/components/app/workspace-provider";
import { useStaMeCeka } from "@/components/app/use-sta-me-ceka";
import type { Id } from "@/convex/_generated/dataModel";
import type { InvalidRule } from "@/convex/lib/leadScoring";
import { TabNav, TabPanel, type TabItem } from "@/components/app/tab-nav";
import { CountBadge } from "@/components/app/system/count-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeedbackNote } from "@/components/app/feedback";
import { pluralSr } from "@/lib/format";
import { LeadsTable } from "./leads-table";
import { GapsPanel } from "./gaps-panel";
import { OverduePanel } from "./overdue-panel";
import { ScoringRulesPanel } from "./scoring-rules-panel";
import { NichesPanel } from "./niches-panel";
import { LeadsMap } from "./leads-map";
import { useLeadFilters } from "./use-lead-filters";
import {
  MeetingsPanel,
  groupMeetings,
  meetingsBadgeCount,
  type MeetingItem,
} from "./meetings-panel";

/**
 * Ljuska ekrana leadova (A1 §4, plan O4).
 *
 * Traka jezičaka ima dve vrste stvari, vizuelno razdvojene grupama:
 *   Leadovi  — prikazi istih leadova (Tabela · Mapa)
 *   Posao    — radni redovi koji nose BROJ (Rupe · Zaostali · Sastanci)
 *
 * Niše i Ocenjivanje su podešavanja, ne podaci, pa ne stoje u istoj traci:
 * žive iza zupčanika „Podešavanja leadova" (isti `?tab=` u URL-u kao i pre,
 * pa stari linkovi rade). Ništa nije nestalo — samo je razvrstano.
 *
 * Brojevi na jezičcima „Posao": Zaostali iz `listOverdue` (indeks
 * `nextActionAt < now`, jeftin), Sastanci iz `listMeetings` (danas + prošli
 * bez ishoda). Rupe NEMAJU broj u ovoj fazi: jedini izvor (`listGaps`) skenira
 * do 10.000 redova i vezao bi taj trošak za svako otvaranje ekrana; A2 uvodi
 * jeftin izvedeni upit i tada broj stiže ovde. Bez bedža = nema broja, nikad
 * „0".
 */
type RadniTab = "leads" | "map" | "gaps" | "overdue" | "meetings";
type PodesavanjaTab = "niche" | "scoring";
type Tab = RadniTab | PodesavanjaTab;

const RADNI: readonly RadniTab[] = ["leads", "map", "gaps", "overdue", "meetings"];
const PODESAVANJA: readonly PodesavanjaTab[] = ["niche", "scoring"];

function jeRadni(raw: string | null): raw is RadniTab {
  return raw !== null && (RADNI as readonly string[]).includes(raw);
}

function jePodesavanja(raw: string | null): raw is PodesavanjaTab {
  return raw !== null && (PODESAVANJA as readonly string[]).includes(raw);
}

export function LeadsDashboard() {
  const { workspace, isLoading } = useWorkspace();
  const { applyQuery, nav, setNav } = useLeadFilters();
  // Jezičak živi u URL-u (GL3): `?tab=map&firma=<id>` iz profila mora da
  // otvori mapu sa panelom, a kopiran link isti jezičak. Tabela je
  // podrazumevana i ne upisuje se. Nepoznata vrednost = tabela.
  const tab: Tab = jeRadni(nav.tab) || jePodesavanja(nav.tab) ? nav.tab : "leads";
  const setTab = (next: Tab) => setNav({ tab: next === "leads" ? null : next });
  const [invalidRules, setInvalidRules] = useState<InvalidRule[]>([]);

  // Brojači na jezičcima „Posao". Iste upite koriste i paneli — Convex klijent
  // deduplikuje na jednu pretplatu. `"skip"` dok radni prostor nije spreman
  // poštuje pravila hukova (poziva se pri svakom renderu).
  const wsId = workspace?.id as Id<"workspaces"> | undefined;
  const meetingsData = useQuery(
    api.leadCrmStore.listMeetings,
    wsId ? { workspaceId: wsId } : "skip",
  );
  const overdueData = useQuery(
    api.leadCrmStore.listOverdue,
    wsId ? { workspaceId: wsId, limit: 100 } : "skip",
  );
  const meetings = useMemo(() => {
    if (!meetingsData) return null;
    const groups = groupMeetings(meetingsData.items as MeetingItem[], meetingsData.now);
    return { count: meetingsBadgeCount(groups), prosli: groups.prosliBezIshoda.length };
  }, [meetingsData]);
  const overdueCount = overdueData?.count ?? 0;

  // „Rupe u podacima" (A2): broj firmi bez telefona stiže iz istog izvedenog
  // upita koji hrani zvono, pa se ne otvara drugo brojanje istog posla.
  const staMeCeka = useStaMeCeka();
  const rupeCount =
    staMeCeka?.zadaci.find((z) => z.kljuc === "leadovi.bez_telefona")?.broj ?? 0;

  if (isLoading || !workspace) {
    return <LeadsDashboardSkeleton />;
  }

  const workspaceId = workspace.id as Id<"workspaces">;

  const radniTabovi: readonly TabItem<RadniTab>[] = [
    { id: "leads", label: "Tabela", icon: Users, group: "Leadovi" },
    { id: "map", label: "Mapa", icon: MapIcon, group: "Leadovi" },
    {
      id: "gaps",
      label: "Rupe u podacima",
      icon: ShieldAlert,
      group: "Posao",
      // A1 je ostavio ovaj jezičak bez broja jer je jedini izvor (`listGaps`)
      // skenirao do 10.000 redova i vezao bi taj trošak za svako otvaranje
      // ekrana. A2 je uveo jeftin izvedeni upit (telefoni se čitaju kroz
      // `by_workspace_kind_value`, dakle SAMO telefoni), pa broj sad stiže i
      // ovde — iz istog izvora iz kog ga čita zvono.
      badge: (
        <CountBadge
          count={rupeCount}
          tone="warning"
          label={`${rupeCount} ${pluralSr(rupeCount, "firma bez broja", "firme bez broja", "firmi bez broja")}`}
        />
      ),
    },
    {
      id: "overdue",
      label: "Zaostali",
      icon: Clock,
      group: "Posao",
      badge: (
        <CountBadge
          count={overdueCount}
          tone="danger"
          label={`${overdueCount} ${pluralSr(overdueCount, "zaostao korak", "zaostala koraka", "zaostalih koraka")}`}
        />
      ),
    },
    {
      id: "meetings",
      label: "Sastanci",
      icon: CalendarClock,
      group: "Posao",
      badge: meetings ? (
        <CountBadge
          count={meetings.count}
          tone={meetings.prosli > 0 ? "danger" : "warning"}
          label={
            meetings.prosli > 0
              ? `${meetings.count} — od toga ${meetings.prosli} bez zabeleženog ishoda`
              : `${meetings.count} ${pluralSr(meetings.count, "sastanak danas", "sastanka danas", "sastanaka danas")}`
          }
        />
      ) : undefined,
    },
  ];

  const podesavanjaTabovi: readonly TabItem<PodesavanjaTab>[] = [
    { id: "niche", label: "Niše", icon: Compass },
    { id: "scoring", label: "Ocenjivanje", icon: SlidersHorizontal },
  ];

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
          action={
            <Button size="xs" variant="outline" onClick={() => setTab("scoring")}>
              Otvori ocenjivanje
            </Button>
          }
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

      {jePodesavanja(tab) ? (
        <>
          {/* Podešavanja leadova: isti `?tab=`, druga traka. Nazad vodi na
              tabelu i čuva filtere iz URL-a (setNav, ne link). */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTab("leads")}
              className="gap-1.5 text-text-muted"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Leadovi
            </Button>
            <span className="h-4 w-px bg-line-soft" aria-hidden />
            <span className="inline-flex items-center gap-1.5 text-ui font-medium text-foreground">
              <Settings2 className="size-3.5 text-text-muted" aria-hidden />
              Podešavanja leadova
            </span>
          </div>

          <TabNav
            panelId="leadovi-podesavanja-panel"
            active={tab}
            onChange={setTab}
            tabs={podesavanjaTabovi}
          />

          <TabPanel id="leadovi-podesavanja-panel" className="flex flex-1 flex-col">
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
            {tab === "scoring" && <ScoringRulesPanel workspaceId={workspaceId} />}
          </TabPanel>
        </>
      ) : (
        <>
          {/* Traka sa jezičcima: Leadovi (Tabela · Mapa) | Posao (Rupe · Zaostali · Sastanci) */}
          <TabNav
            panelId="leadovi-panel"
            active={tab}
            onChange={setTab}
            tabs={radniTabovi}
            trailing={
              <div className="flex items-center gap-2">
                <Link
                  href="/leadovi/uvoz"
                  className={buttonVariants({
                    size: "sm",
                    className: "gap-2 text-xs",
                  })}
                >
                  <Upload className="size-3.5" aria-hidden />
                  <span>Uvoz leadova</span>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Podešavanja leadova"
                        title="Podešavanja leadova: niše i ocenjivanje"
                        className="gap-1.5 text-xs"
                      />
                    }
                  >
                    <Settings2 className="size-3.5" aria-hidden />
                    <span className="hidden sm:inline">Podešavanja</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel>Podešavanja leadova</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setTab("niche")}>
                      <Compass />
                      Niše
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTab("scoring")}>
                      <SlidersHorizontal />
                      Ocenjivanje (Fit / Intent)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
            {tab === "gaps" && <GapsPanel workspaceId={workspaceId} />}
            {tab === "overdue" && <OverduePanel workspaceId={workspaceId} />}
            {tab === "meetings" && <MeetingsPanel workspaceId={workspaceId} />}
          </TabPanel>
        </>
      )}
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
