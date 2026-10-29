"use client";

// Preneto iz Devotion apps/web/components/workspace/area/area-overview-container.tsx (main @ c05c40f), SPAJANJE S10.
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { CommentsSection } from "@/components/app/prostor/saradnja/comments-section";
import type { MentionMember } from "@/components/app/prostor/saradnja/comment-composer";
import { ConflictDialog } from "@/components/app/prostor/saradnja/conflict-dialog";
import { RevisionHistoryDrawer } from "@/components/app/prostor/saradnja/revision-history-drawer";
import { useCuvarNapustanja } from "@/components/app/prostor/cuvar-napustanja";
import type { PageEditorSaveState } from "@/lib/prostor/modeli/page-autosave-model";
import { useBeforeUnloadGuard } from "@/components/app/prostor/dokumenti/use-page-autosave";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { areaBodyStateText, editMeta, type AreaBodyServer } from "@/lib/prostor/modeli/area-model";
import {
  AreaDescription,
  AreaOverviewLayout,
  RecentChanges,
  type AreaDescriptionState,
  type RecentChangesState,
} from "@/components/app/prostor/dokumenti/area-overview";
import { useAreaBody } from "@/components/app/prostor/dokumenti/use-area-body";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";

/** Nedavnih izmena u Pregledu (K07 §5.5). */
const RECENT_LIMIT = 8;

/**
 * Pregled oblasti — kontejner (PROSTOR P12, K07 §5.5): opis oblasti
 * (`areasV2.getAreaBody` / `updateAreaBody` sa revizijom i konfliktom, fioka
 * Istorija izmena), Nedavne izmene (`pages.recentForArea`) i Komentari oblasti
 * (`comments.*`, cilj `area`).
 */
export function AreaOverviewContainer({
  areaId,
  profileId,
  members,
  memberName,
  now,
  onOpenPage,
}: {
  areaId: Id<"areas">;
  profileId: Id<"profiles">;
  members: ReadonlyArray<MentionMember>;
  memberName: (profileId: string | null) => string | null;
  now: number;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const descriptionHeadingId = useId();
  const recentHeadingId = useId();
  const commentsHeadingId = useId();
  // Greška upita se ne popravlja sama: „Pokušaj ponovo" pravi novu pretplatu.
  const [bodyAttempt, setBodyAttempt] = useState(0);
  const [recentAttempt, setRecentAttempt] = useState(0);

  return (
    <AreaOverviewLayout
      description={
        <DescriptionLoader
          key={`${areaId}:${bodyAttempt}`}
          areaId={areaId}
          headingId={descriptionHeadingId}
          memberName={memberName}
          now={now}
          onRetry={() => setBodyAttempt((value) => value + 1)}
        />
      }
      recent={
        <RecentLoader
          key={`${areaId}:${recentAttempt}`}
          areaId={areaId}
          headingId={recentHeadingId}
          now={now}
          onOpenPage={onOpenPage}
          onRetry={() => setRecentAttempt((value) => value + 1)}
        />
      }
      comments={
        <CommentsSection
          target={{ kind: "area", id: areaId }}
          members={members}
          selfProfileId={profileId}
          now={now}
          headingId={commentsHeadingId}
        />
      }
    />
  );
}

function DescriptionLoader({
  areaId,
  headingId,
  memberName,
  now,
  onRetry,
}: {
  areaId: Id<"areas">;
  headingId: string;
  memberName: (profileId: string | null) => string | null;
  now: number;
  onRetry: () => void;
}) {
  const { data, failed } = useProjekatQueryResult(api.prostor.areasV2.getAreaBody, { areaId });
  const server = useMemo<AreaBodyServer | undefined>(
    () => (data ? { areaId: data.areaId, content: data.content, revision: data.revision } : undefined),
    [data],
  );
  const body = useAreaBody({ areaId, server });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dismissedConflict, setDismissedConflict] = useState<string | null>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);

  const saveState: PageEditorSaveState = body.status;
  useBeforeUnloadGuard(saveState);
  // Čuvar napuštanja ljuske pita pre odlaska dok opis nije sačuvan.
  const { prijavi } = useCuvarNapustanja();
  useEffect(() => {
    prijavi(`oblast:${areaId}`, saveState, "oblast");
  }, [areaId, prijavi, saveState]);
  // Pregled nestaje (druga kartica, druga oblast): ljuska više ne čeka ovaj nacrt.
  useEffect(() => () => prijavi(`oblast:${areaId}`, null), [areaId, prijavi]);

  const conflictKey = body.conflict
    ? `${body.conflict.currentRevision ?? "?"}:${body.conflict.updatedAt ?? "?"}`
    : null;
  // Nov konflikt otvara dijalog sam; Esc ga zatvara za taj konflikt (ostaje „Reši").
  const conflictOpen = conflictKey !== null && dismissedConflict !== conflictKey;
  const setConflictOpen = (open: boolean) => setDismissedConflict(open ? null : conflictKey);
  // Server ne zna ko je sačuvao u konfliktu; poslednji urednik iz Istorije je najbolja procena.
  const conflictEditor = body.conflict?.updatedByProfileId
    ? memberName(body.conflict.updatedByProfileId)
    : (data?.lastEditor?.displayName ?? null);

  const state: AreaDescriptionState =
    failed
      ? { status: "error", onRetry }
      : data === undefined || !body.ready
        ? { status: "loading" }
        : {
            status: "ready",
            value: body.value,
            editable: data.permissions.canEdit,
            saveStatus: body.status,
            stateText: areaBodyStateText({
              status: body.status,
              exhausted: body.exhausted,
              editorName: data.lastEditor?.displayName ?? null,
              updatedAt: data.updatedAt,
              now,
            }),
            onRetry: body.exhausted ? body.flush : null,
            onResolveConflict: body.status === "conflict" && !conflictOpen ? () => setConflictOpen(true) : null,
            onChange: body.edit,
            onBlur: body.flush,
          };

  return (
    <>
      <AreaDescription
        headingId={headingId}
        state={state}
        onOpenHistory={data ? () => setHistoryOpen(true) : null}
        historyButtonRef={historyButtonRef}
      />
      {data ? (
        <RevisionHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          target={{ kind: "area", id: areaId }}
          currentRevision={data.revision}
          blockedReason={
            !data.permissions.canEdit
              ? "Opis oblasti ne možeš da menjaš."
              : body.status !== "saved"
                ? "Sačekaj da se tvoje izmene sačuvaju."
                : null
          }
          memberName={memberName}
          now={now}
          returnFocusFallback={() => historyButtonRef.current}
        />
      ) : null}
      <ConflictDialog
        open={conflictOpen && body.status === "conflict"}
        onOpenChange={setConflictOpen}
        subject="area"
        updaterName={conflictEditor}
        updatedAt={body.conflict?.updatedAt ?? null}
        now={now}
        onCopy={() => void body.copyDraft()}
        onLoadLatest={() => {
          if (body.loadLatest()) setConflictOpen(false);
        }}
        onOverwrite={() => {
          setConflictOpen(false);
          body.overwrite();
        }}
      />
    </>
  );
}

function RecentLoader({
  areaId,
  headingId,
  now,
  onOpenPage,
  onRetry,
}: {
  areaId: Id<"areas">;
  headingId: string;
  now: number;
  onOpenPage: (pageId: Id<"pages">) => void;
  onRetry: () => void;
}) {
  const { data, failed } = useProjekatQueryResult(api.prostor.pages.recentForArea, { areaId, limit: RECENT_LIMIT });
  const state: RecentChangesState = failed
    ? { status: "error", onRetry }
    : data === undefined
      ? { status: "loading" }
      : {
          status: "ready",
          items: data.map((page) => ({
            id: page._id,
            title: page.title,
            kind: page.kind,
            meta: editMeta(page.updatedBy?.displayName ?? null, page.updatedAt, now),
            locked: page.lockedAt !== null && page.lockedAt !== undefined,
          })),
        };
  return <RecentChanges headingId={headingId} state={state} onOpen={(id) => onOpenPage(id as Id<"pages">)} />;
}
