"use client";

// Preneto iz Devotion apps/web/components/workspace/puls-view.tsx (main @ c05c40f), SPAJANJE S20.
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Blocks,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Lightbulb,
  Lock,
  Minus,
  PauseCircle,
  Plus,
  UserRound,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { useMoze, useProjekat, useProjekatQuery } from "@/components/app/projekat-provider";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { AssigneeStack } from "@/components/app/prostor/zadaci/assignee-stack";
import { DeadlineBadge } from "@/components/app/prostor/zadaci/deadline-badge";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import {
  AREA_ICONS,
  EmptyState,
  ProfileAvatar,
  SectionHeading,
  TaskStatusBadge,
} from "@/components/app/prostor/zajednicko/radni-ui";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { pulseCardNow } from "@/lib/prostor";
import {
  addWeeks,
  formatDaysStanding,
  formatWeekLabel,
  isCurrentWeek,
  localWeekStart,
  normalizeToLocalWeekStart,
  trendDelta,
  trendDirection,
  type Trend,
} from "@/lib/prostor/web/puls";
import type { AreaKey, TaskStatus } from "@/lib/prostor/web/projekat";
import { formatNumber, formatPercentValue } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PulseBar, type PulseSegment } from "./pulse-bar";

/**
 * ============================================================================
 * PULS TIMA (`/[projekat]/puls?nedelja=<ms>`, paritet red 27; SPAJANJE S20)
 * ============================================================================
 *
 * Nedeljni pregled posla: zaglavlje sa nedeljom (prethodna, sledeća, „Tekuća
 * nedelja") i trakom sastava (Kasni · Zapelo · Završeno), pa Sažetak (četiri
 * broja sa trendom; jedini istaknut blok), Zapelo, Po oblastima, Po članovima
 * i Ideje. Upit je `puls.getWeekly` (projektni). Naziv u interfejsu je „Puls
 * tima"; Enigmin puls sajta (`convex/puls.ts`) je druga stvar.
 *
 * Posmatrač ga ne vidi u meniju; ako adresu otvori ručno, vidi zaključano
 * stanje bez upita. Promena nedelje menja sadržaj odmah, bez animacije.
 */
export function PulsEkran() {
  return (
    <WorkspaceErrorBoundary title="Puls tima nije učitan." className="min-h-[20rem]">
      <PulsSadrzaj />
    </WorkspaceErrorBoundary>
  );
}

function PulsSadrzaj() {
  const { uloga } = useProjekat();
  const sme = useMoze("urednik");
  const parametri = useSearchParams();
  if (uloga !== null && !sme) {
    return (
      <div className="flex w-full flex-col gap-6">
        <PageHeader variant="module" title="Puls tima" />
        <EmptyState
          icon={Lock}
          headingAs="h2"
          title="Puls tima nije dostupan."
          description="Tvoja uloga u ovom projektu vidi samo brojeve."
        />
      </div>
    );
  }
  if (uloga === null) {
    return (
      <div className="flex w-full flex-col gap-6">
        <PageHeader variant="module" title="Puls tima" />
        <PulsSkeleton />
      </div>
    );
  }
  const nedelja = Number(parametri.get("nedelja"));
  return <PulsView initialWeekStart={Number.isFinite(nedelja) && nedelja > 0 ? nedelja : null} />;
}

export function PulsView({ initialWeekStart }: { initialWeekStart: number | null }) {
  const { idi } = useProstorNavigacija();
  const today = useToday();
  // „Sada" u koracima od 15 min (kao kartica na početnoj): povratak u aplikaciju
  // ne pravi novu pretplatu na težak upit, a pragovi zapelog ostaju sveži.
  const now = pulseCardNow(today.now);
  const [weekStart, setWeekStart] = useState(() =>
    initialWeekStart === null ? localWeekStart(today.now) : normalizeToLocalWeekStart(initialWeekStart),
  );

  // Nedelja u budućnosti ne postoji (server je odbija): adresa sa njom pada na tekuću.
  const tekuca = localWeekStart(now);
  const shownWeek = weekStart > tekuca ? tekuca : weekStart;
  const weekEnd = addWeeks(shownWeek, 1);
  const prevWeekStart = addWeeks(shownWeek, -1);

  const data = useProjekatQuery(api.prostor.puls.getWeekly, {
    prevWeekStart,
    weekStart: shownWeek,
    weekEnd,
    now,
  });

  const currentWeek = isCurrentWeek(shownWeek, now);
  const isFirstWeek = data !== undefined && shownWeek <= data.startupCreatedAt;
  const canGoBack = data === undefined || weekEnd > data.startupCreatedAt;

  const pulseSegments: Array<PulseSegment> =
    data === undefined
      ? []
      : [
          { key: "kasni", label: "Kasni", count: data.summary.overdueOpen.current, tone: "danger" },
          { key: "zapelo", label: "Zapelo", count: data.summary.stuck.current, tone: "warn" },
          { key: "zavrseno", label: "Završeno", count: data.summary.completed.current, tone: "success" },
        ];

  return (
    <div className="flex w-full flex-col gap-6 pb-8">
      <div className="flex flex-col gap-4">
        <PageHeader variant="module" title="Puls tima" description="Šta je tim završio, započeo i gde je zapelo, po nedeljama." />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Prethodna nedelja"
            disabled={!canGoBack}
            onClick={() => setWeekStart(addWeeks(shownWeek, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="min-w-44 text-center text-ui font-medium tabular-nums text-foreground">
            {formatWeekLabel(shownWeek, weekEnd)}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Sledeća nedelja"
            disabled={currentWeek}
            onClick={() => setWeekStart(addWeeks(shownWeek, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          {currentWeek ? (
            <Badge ton="muted">Tekuća nedelja</Badge>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(localWeekStart(now))}>
              Tekuća nedelja
            </Button>
          )}
          {isFirstWeek ? <Badge ton="info">Prva nedelja</Badge> : null}
        </div>
        {data === undefined ? (
          <Skeleton className="h-2.5 w-full rounded-sm" />
        ) : (
          <PulseBar segments={pulseSegments} label="Sastav nedelje" emptyLabel="Nedelja bez zabeleženog posla" />
        )}
      </div>

      {data === undefined ? (
        <PulsSkeleton />
      ) : (
        <div className="flex flex-col gap-8">
          {/* Jedini istaknut blok ekrana: jedna površina sa četiri broja (bez kartice u kartici). */}
          <section
            aria-label="Sažetak nedelje"
            className="grid gap-px overflow-hidden rounded-xl border border-line bg-line shadow-elev-1 sm:grid-cols-2 xl:grid-cols-4"
          >
            <StatCard
              label="Završeno ove nedelje"
              value={data.summary.completed.current}
              trend={data.summary.completed}
              upIsGood
              hideTrend={isFirstWeek}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label="Novo kreirano"
              value={data.summary.created.current}
              trend={data.summary.created}
              upIsGood
              hideTrend={isFirstWeek}
              icon={Plus}
            />
            <StatCard
              label="Trenutno kasni"
              value={data.summary.overdueOpen.current}
              trend={data.summary.overdueOpen}
              upIsGood={false}
              hideTrend={isFirstWeek}
              icon={Flame}
              tone="danger"
            />
            <StatCard
              label="Zapelo"
              value={data.summary.stuck.current}
              icon={PauseCircle}
              tone="warn"
              detail="trenutno stanje"
            />
          </section>

          <StuckSection tasks={data.stuckTasks} now={now} onOpenPage={(pageId) => idi({ kind: "page", pageId })} />

          <AreasSection areas={data.areas} onOpenArea={(areaId) => idi({ kind: "area", areaId })} />

          <MembersSection members={data.members} unassigned={data.unassigned} />

          <IdeasSection ideas={data.ideas} hideTrend={isFirstWeek} />

          {data.truncated ? (
            <p className="text-meta text-text-muted">Prikaz je približan — nedelja ima izuzetno mnogo podataka.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PulsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Učitavanje Pulsa tima">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-24 rounded-lg" />
        ))}
      </div>
      {[0, 1].map((item) => (
        <div key={item} className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

const TON_IKONE = {
  success: "text-success",
  danger: "text-danger",
  warn: "text-warning",
} as const;

function StatCard({
  label,
  value,
  trend,
  upIsGood,
  hideTrend,
  icon: Icon,
  tone,
  detail,
  plain = false,
}: {
  label: string;
  value: number;
  trend?: Trend;
  upIsGood?: boolean;
  hideTrend?: boolean;
  icon: typeof CheckCircle2;
  tone?: "success" | "danger" | "warn";
  detail?: string;
  /** Van istaknutog bloka: bez sopstvene površine (nikad kartica u kartici). */
  plain?: boolean;
}) {
  return (
    <div className={cn("bg-card p-4", plain && "rounded-lg bg-transparent px-2 py-2")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-meta text-text-muted">{label}</p>
          <p className="mt-1 text-metric tabular-nums text-foreground">{formatNumber(value)}</p>
        </div>
        {/* Boja ikonice nosi samo stanje, bez pločice. */}
        <Icon
          className={cn("mt-0.5 size-4 shrink-0", tone ? TON_IKONE[tone] : "text-text-muted")}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 min-h-5">
        {detail !== undefined ? (
          <p className="text-meta text-text-muted">{detail}</p>
        ) : trend === undefined || hideTrend ? (
          <p className="text-meta text-text-muted">{hideTrend ? "Prva nedelja — nema poređenja" : ""}</p>
        ) : (
          <TrendBadge trend={trend} upIsGood={upIsGood ?? true} />
        )}
      </div>
    </div>
  );
}

/** Strelica gore nije uvek dobra vest — smer se tumači po značenju metrike. */
function TrendBadge({ trend, upIsGood }: { trend: Trend; upIsGood: boolean }) {
  const direction = trendDirection(trend);
  const delta = Math.abs(trendDelta(trend));

  if (direction === "flat") {
    return (
      <span className="inline-flex items-center gap-1 text-meta text-text-muted">
        <Minus className="size-3" aria-hidden="true" />
        isto kao prošle nedelje
      </span>
    );
  }

  const good = direction === "up" ? upIsGood : !upIsGood;
  const Arrow = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-meta font-medium", good ? "text-success" : "text-danger")}
      title={`Prošle nedelje: ${formatNumber(trend.previous)}`}
    >
      <Arrow className="size-3" aria-hidden="true" />
      <span className="tabular-nums">{formatNumber(delta)}</span>
      <span className="font-normal text-text-muted">u odnosu na prošlu nedelju</span>
    </span>
  );
}

type StuckTask = {
  pageId: Id<"pages">;
  title: string;
  taskStatus: TaskStatus;
  taskPriority: string | null;
  areaLabel: string;
  assignee: { displayName: string; avatarUrl: string | null } | null;
  assignees: Array<{ displayName: string; avatarUrl: string | null }>;
  dueDate: number | null;
  lastTouchedAt: number;
};

function StuckSection({
  tasks,
  now,
  onOpenPage,
}: {
  tasks: Array<StuckTask>;
  now: number;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  return (
    <section>
      <SectionHeading
        title="Zapelo"
        count={tasks.length > 0 ? formatNumber(tasks.length) : undefined}
        action={<span className="text-meta text-text-muted">U toku &gt; 4 radna dana · blokirano &gt; 2 dana</span>}
      />
      {tasks.length === 0 ? (
        <EmptyState size="section" title="Ništa nije zapelo." />
      ) : (
        <div className="space-y-0.5">
          {tasks.map((task) => (
            <button
              key={task.pageId}
              type="button"
              onClick={() => onOpenPage(task.pageId)}
              className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-(--duration-fast) ease-(--ease-ui) hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-medium text-foreground">{task.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-meta text-text-muted">
                  <span className="truncate">{task.areaLabel}</span>
                  <span aria-hidden="true">·</span>
                  <AssigneeStack assignees={task.assignees} showLabel max={3} />
                </span>
              </span>
              <TaskStatusBadge status={task.taskStatus} />
              <DeadlineBadge dueDate={task.dueDate} taskStatus={task.taskStatus} now={now} size="sm" />
              <span className="text-meta font-medium tabular-nums text-warning">
                stoji {formatDaysStanding(now - task.lastTouchedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function AreasSection({
  areas,
  onOpenArea,
}: {
  areas: Array<{
    areaId: Id<"areas">;
    key: string;
    label: string;
    openCount: number;
    doneCount: number;
    completedThisWeek: number;
  }>;
  onOpenArea: (areaId: Id<"areas">) => void;
}) {
  if (areas.length === 0) return null;

  return (
    <section>
      <SectionHeading title="Po oblastima" />
      <div className="space-y-0.5">
        {areas.map((area) => {
          const total = area.openCount + area.doneCount;
          // Oblast bez zadataka nema udeo: „—“, ne 0 %.
          const percent = total === 0 ? null : Math.round((area.doneCount / total) * 100);
          const Icon = AREA_ICONS[area.key as AreaKey] || Blocks;
          return (
            <button
              key={area.areaId}
              type="button"
              onClick={() => onOpenArea(area.areaId)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-(--duration-fast) ease-(--ease-ui) hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-ui font-medium text-foreground">{area.label}</span>
                  <span className="text-meta tabular-nums text-text-muted">
                    {percent === null ? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">Nema zadataka u ovoj oblasti.</span>
                      </>
                    ) : (
                      formatPercentValue(percent)
                    )}
                  </span>
                </span>
                <Progress value={percent ?? 0} ton="success" size="sm" label={`${area.label}: završeno`} className="mt-2" />
                <span className="mt-1.5 block text-meta text-text-muted">
                  <span className="tabular-nums">{formatNumber(area.openCount)}</span> otvoreno ·{" "}
                  <span className="tabular-nums">{formatNumber(area.doneCount)}</span> gotovo
                  {area.completedThisWeek > 0 ? (
                    <>
                      {" "}
                      <span className="font-medium text-success">
                        (+{formatNumber(area.completedThisWeek)} ove nedelje)
                      </span>
                    </>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MembersSection({
  members,
  unassigned,
}: {
  members: Array<{
    profileId: Id<"profiles">;
    displayName: string;
    avatarUrl: string | null;
    isArchived: boolean;
    completedThisWeek: number;
    activityCount: number;
    openCount: number;
    overdueCount: number;
  }>;
  unassigned: {
    completedThisWeek: number;
    openCount: number;
    overdueCount: number;
  };
}) {
  const showUnassigned = unassigned.openCount > 0 || unassigned.completedThisWeek > 0 || unassigned.overdueCount > 0;

  if (members.length === 0 && !showUnassigned) {
    return (
      <section>
        <SectionHeading title="Po članovima" />
        <EmptyState size="section" title="Ove nedelje niko nije radio na zadacima." />
      </section>
    );
  }

  return (
    <section>
      <SectionHeading title="Po članovima" />
      <div className="space-y-0.5">
        {members.map((member) => (
          <div key={member.profileId} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-2">
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <ProfileAvatar profile={member} />
              <span className="min-w-0">
                <span className="block truncate text-ui font-medium text-foreground">{member.displayName}</span>
                {member.isArchived ? <span className="block text-meta text-text-muted">bivši član</span> : null}
              </span>
            </span>
            <MemberStat label="Završeno" value={member.completedThisWeek} />
            <MemberStat label="Aktivnosti" value={member.activityCount} />
            <MemberStat label="Otvoreno" value={member.openCount} />
            <MemberStat label="Kasni" value={member.overdueCount} tone={member.overdueCount > 0 ? "danger" : undefined} />
          </div>
        ))}
        {showUnassigned ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-2">
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-text-muted">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <span className="truncate text-ui font-medium text-foreground">Bez zaduženog</span>
            </span>
            <MemberStat label="Završeno" value={unassigned.completedThisWeek} />
            <MemberStat label="Aktivnosti" value={null} reason="Aktivnosti se računaju po osobi." />
            <MemberStat label="Otvoreno" value={unassigned.openCount} />
            <MemberStat
              label="Kasni"
              value={unassigned.overdueCount}
              tone={unassigned.overdueCount > 0 ? "danger" : undefined}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** `value === null` = nije izmereno: piše „—“, a razlog je u `reason` (čitač ga dobija kao natpis). */
function MemberStat({
  label,
  value,
  tone,
  reason,
}: {
  label: string;
  value: number | null;
  tone?: "danger";
  reason?: string;
}) {
  return (
    <span className="w-20 shrink-0" title={value === null ? reason : undefined}>
      <span
        className={cn(
          "block text-ui font-semibold tabular-nums text-foreground",
          tone === "danger" && "text-danger",
          (value === null || value === 0) && tone === undefined && "text-text-muted",
        )}
      >
        {value === null ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">{reason ?? "Nema podatka."}</span>
          </>
        ) : (
          formatNumber(value)
        )}
      </span>
      <span className="block text-meta text-text-muted">{label}</span>
    </span>
  );
}

function IdeasSection({
  ideas,
  hideTrend,
}: {
  ideas: { created: Trend; votes: Trend; converted: Trend };
  hideTrend: boolean;
}) {
  const total = ideas.created.current + ideas.votes.current + ideas.converted.current;

  return (
    <section>
      <SectionHeading title="Ideje" />
      {total === 0 ? (
        <EmptyState size="section" title="Ove nedelje nije bilo rada na idejama." />
      ) : (
        <div className="grid gap-1 sm:grid-cols-3">
          <StatCard
            label="Nove ideje"
            value={ideas.created.current}
            trend={ideas.created}
            upIsGood
            hideTrend={hideTrend}
            icon={Lightbulb}
            plain
          />
          <StatCard
            label="Glasova"
            value={ideas.votes.current}
            trend={ideas.votes}
            upIsGood
            hideTrend={hideTrend}
            icon={CheckCircle2}
            plain
          />
          <StatCard
            label="Pretvoreno u zadatke"
            value={ideas.converted.current}
            trend={ideas.converted}
            upIsGood
            hideTrend={hideTrend}
            icon={Plus}
            tone="success"
            plain
          />
        </div>
      )}
    </section>
  );
}
