"use client";

// Preneto iz Devotion apps/web/components/workspace/area/area-view.tsx (main @ c05c40f), SPAJANJE S10.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Blocks } from "lucide-react";
import { toast } from "@/lib/toast";

import { useLiveNow } from "@/components/app/prostor/saradnja/use-live-now";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { AreaTab, StartupWithAreas } from "@/lib/prostor/rute";
import { isAreaTab } from "@/lib/prostor/rute";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { AREA_ICONS, EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import type { PageKind } from "@/lib/prostor/web/vrste-stranica";
import type { AreaKey } from "@/lib/prostor/web/projekat";
import { tasksWord } from "@/lib/prostor/web/projekat";

import { AreaDocumentsContainer } from "@/components/app/prostor/dokumenti/area-documents-container";
import { AreaHeader } from "@/components/app/prostor/dokumenti/area-header";
import { VRSTE_NOVE_STRANICE } from "@/components/app/prostor/dokumenti/create-page-dialog";
import {
  AREA_TASKS_PAGE,
  areaHeaderMeta,
  areaTaskCount,
  countText,
  pagesWord,
  readRememberedAreaTab,
  rememberAreaTab,
  resolveAreaTab,
} from "@/lib/prostor/modeli/area-model";
import { AreaOverviewContainer } from "@/components/app/prostor/dokumenti/area-overview-container";
import { AreaTasksContainer } from "@/components/app/prostor/dokumenti/area-tasks";
import type { MentionMember } from "@/components/app/prostor/saradnja/comment-composer";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";
import type { CreatePageTarget } from "@/lib/prostor/rute";
import { MapaOblasti } from "@/components/app/prostor/mape";
import { TaskPanel, type TaskPanelRequest } from "@/components/app/prostor/zadaci/panel/task-panel";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";

/**
 * Kartice oblasti u redu kartica. Mapa (`?tab=mapa`) se učitava tek kad se
 * izabere (`MapaOblasti`, dinamički ulaz `mape/index.tsx`).
 */
const KARTICE_OBLASTI: ReadonlyArray<AreaTab> = ["pregled", "zadaci", "dokumenti", "mapa"];

type FilterMape = "all" | PageKind;

/** `localStorage` kad postoji (SSR ga nema). */
function tabStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export type AreaViewProps = {
  workspace: StartupWithAreas;
  profileId: Id<"profiles">;
  areaId: Id<"areas">;
  /** Kartica iz adrese (`?tab=`); bez nje zapamćena ili Pregled. */
  tab: AreaTab | undefined;
  now: number;
  onTabChange: (tab: AreaTab) => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreate: (target: CreatePageTarget) => void;
};

/**
 * Oblast — kontejner (PROSTOR P12, plan K07 §5.5): zaglavlje (naziv menja svaki
 * član, broj stranica i zadataka, „Nova stranica") i kartice Pregled · Zadaci ·
 * Dokumenti. Kartica iz adrese ima prednost, pa zapamćena po oblasti, pa
 * Pregled. Svaka kartica ima svoju granicu greške.
 */
export function AreaView({
  workspace,
  profileId,
  areaId,
  tab: routeTab,
  now,
  onTabChange,
  onOpenPage,
  onCreate,
}: AreaViewProps) {
  const area = workspace.areas.find((item) => item._id === areaId) ?? null;
  const liveNow = useLiveNow(now);
  // Zapamćena kartica se čita pri svakom prikazu: link iz menija bez `tab` vraća
  // poslednju prikazanu karticu i kad oblast ostane montirana.
  const tab = resolveAreaTab(routeTab, readRememberedAreaTab(tabStorage(), areaId));
  useEffect(() => {
    rememberAreaTab(tabStorage(), areaId, tab);
  }, [areaId, tab]);
  const [mapFilter, setMapFilter] = useState<FilterMape>("all");
  // „Pregled" zadatka na Mapi otvara panel zadatka (isti kao u Zadacima).
  const [mapTask, setMapTask] = useState<TaskPanelRequest | null>(null);
  const today = useToday();
  const panelWorkspaces = useMemo(
    () => [
      {
        _id: workspace._id,
        name: workspace.name,
        logoUrl: workspace.logoUrl,
        areas: workspace.areas.map((item) => ({ _id: item._id, label: item.label })),
      },
    ],
    [workspace],
  );

  const updateArea = useProjekatMutation(api.prostor.projekat.updateArea);
  const membersResult = useProjekatQueryTolerant(api.prostor.projekat.listMembers, { limit: 50 });
  const topCounts = useProjekatQueryTolerant(api.prostor.pages.areaTopLevelCounts, {});
  // Broj zadataka: prva strana bez filtera („50+" kad ima još). Tolerantno — zaglavlje ne pada.
  const firstTasks = useProjekatQueryTolerant(api.prostor.tasks.listForArea, {
    areaId,
    paginationOpts: { numItems: AREA_TASKS_PAGE, cursor: null },
  });

  const members = useMemo(() => membersResult ?? [], [membersResult]);
  const memberName = useCallback(
    (id: string | null) => members.find(({ profile: member }) => member._id === id)?.profile.displayName ?? null,
    [members],
  );
  // Članovi za @pominjanje u Komentarima oblasti.
  const mentionMembers = useMemo<MentionMember[]>(
    () =>
      members.map(({ profile: member }) => ({
        profileId: member._id,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
      })),
    [members],
  );

  if (!area) {
    return (
      <EmptyState
        icon={Blocks}
        headingAs="h2"
        title="Oblast nije pronađena."
        description="Izaberi drugu oblast u meniju."
      />
    );
  }

  const pageCount = topCounts?.find((entry) => entry.areaId === areaId) ?? null;
  const taskCount =
    firstTasks === undefined
      ? null
      : areaTaskCount({ status: firstTasks.isDone ? "Exhausted" : "CanLoadMore", loaded: firstTasks.page.length });

  function create(kind?: PageKind) {
    onCreate({ areaId, parentPageId: null, ...(kind ? { initialKind: kind } : {}) });
  }

  async function rename(label: string): Promise<boolean> {
    try {
      await updateArea({ areaId, label });
      toast.success("Naziv oblasti je sačuvan.");
      return true;
    } catch (error) {
      toast.error(accessErrorMessage(error, "Naziv oblasti nije sačuvan."));
      return false;
    }
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isAreaTab(value)) onTabChange(value);
      }}
      className="flex w-full flex-col gap-6"
    >
      <AreaHeader
        label={area.label}
        icon={AREA_ICONS[area.key as AreaKey] ?? Blocks}
        meta={areaHeaderMeta(pageCount, taskCount)}
        tabs={KARTICE_OBLASTI}
        tabCounts={{ zadaci: countText(taskCount), dokumenti: countText(pageCount) }}
        tabCountLabels={{
          zadaci: taskCount ? `${countText(taskCount)} ${tasksWord(taskCount.count)}` : null,
          dokumenti: pageCount ? `${countText(pageCount)} ${pagesWord(pageCount.count)} na vrhu` : null,
        }}
        onRename={rename}
        kinds={VRSTE_NOVE_STRANICE}
        onCreate={create}
      />
      <TabsContent value="pregled" className="mt-0">
        <WorkspaceErrorBoundary title="Pregled oblasti nije učitan." className="min-h-[16rem]">
          <AreaOverviewContainer
            areaId={areaId}
            profileId={profileId}
            members={mentionMembers}
            memberName={memberName}
            now={liveNow}
            onOpenPage={onOpenPage}
          />
        </WorkspaceErrorBoundary>
      </TabsContent>
      <TabsContent value="zadaci" className="mt-0">
        <WorkspaceErrorBoundary title="Zadaci oblasti nisu učitani." className="min-h-[16rem]">
          <AreaTasksContainer
            workspace={workspace}
            profileId={profileId}
            areaId={areaId}
            onOpenPage={onOpenPage}
            onCreateTask={() => create("task")}
          />
        </WorkspaceErrorBoundary>
      </TabsContent>
      <TabsContent value="dokumenti" className="mt-0">
        <WorkspaceErrorBoundary title="Dokumenti oblasti nisu učitani." className="min-h-[16rem]">
          <AreaDocumentsContainer
            workspace={workspace}
            profileId={profileId}
            canManage={workspace.isManager}
            areaId={areaId}
            memberName={memberName}
            now={liveNow}
            onOpenPage={onOpenPage}
            onCreate={create}
          />
        </WorkspaceErrorBoundary>
      </TabsContent>
      <TabsContent value="mapa" className="mt-0">
        <WorkspaceErrorBoundary title="Mapa oblasti nije učitana." className="min-h-[16rem]">
          <MapaOblasti
            areaId={areaId}
            rootPageId={null}
            canvasLabel={area.label}
            areaKey={area.key}
            areas={workspace.areas}
            filter={mapFilter}
            onFilterChange={setMapFilter}
            onOpenCanvas={onOpenPage}
            onOpenDetails={onOpenPage}
            onCreatePage={create}
            onOpenTask={(pageId, title) =>
              setMapTask({
                target: { kind: "task", pageId },
                title,
                origin: null,
                openedAt: performance.now(),
              })
            }
          />
        </WorkspaceErrorBoundary>
        <TaskPanel
          request={mapTask}
          onClose={() => setMapTask(null)}
          today={today}
          profileId={profileId}
          workspaces={panelWorkspaces}
          onOpenInStartup={(_workspaceId, pageId) => onOpenPage(pageId)}
          onOpenFull={onOpenPage}
        />
      </TabsContent>
    </Tabs>
  );
}
