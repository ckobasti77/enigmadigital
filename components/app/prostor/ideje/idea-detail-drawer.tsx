"use client";

// Preneto iz Devotion apps/web/components/workspace/ideas/idea-detail-drawer.tsx (main @ c05c40f), SPAJANJE S13.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";

import { CommentsSection } from "@/components/app/prostor/saradnja/comments-section";
import type { MentionMember } from "@/components/app/prostor/saradnja/comment-composer";
import { RevisionHistoryDrawer } from "@/components/app/prostor/saradnja/revision-history-drawer";
import { DiskusijaDijalog, useDiskusijaSidra } from "@/components/app/prostor/poruke/diskusija";
import { useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";
import { Drawer } from "@/components/ui/drawer";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";

import { IdeaDetail, IdeaDetailError, IdeaDetailHeader, IdeaDetailMissing, IdeaDetailSkeleton, ideaDrawerTitle } from "@/components/app/prostor/ideje/idea-detail";
import { ideaTitleElement, type IdeaActions } from "@/components/app/prostor/ideje/idea-parts";
import {
  createIdeaDraft,
  IDEA_SAVE_DELAY_MS,
  ideaDraftEdit,
  ideaDraftError,
  ideaDraftFailed,
  ideaDraftFromServer,
  ideaDraftOnLeave,
  ideaDraftSaved,
  ideaDraftStartSave,
  ideaDraftStatus,
  type IdeaDraft,
  type IdeaModel,
} from "@/lib/prostor/modeli/ideas-model";
import { useProjekatMutation } from "@/components/app/projekat-provider";

/**
 * Detalj ideje u desnoj fioci (`?ideja=`, K07 §5.9). Ideja dolazi iz
 * `ideas.list` (R7: `ideas.get` ne postoji). `idea === undefined` = lista
 * još stiže; `null` = ideje nema u ovom projektu (Korpa ili tuđ link).
 * Projekat daje okruženje (`useProjekat*`), pa `workspaceId` nije prop.
 * „Diskusija u Porukama" (`chat.channelForAnchor`, S15): postojeći kanal
 * ideje se otvara u Porukama projekta, a bez njega prva poruka ide iz dijaloga.
 */
export function IdeaDetailDrawer({
  open,
  idea,
  now,
  members,
  selfProfileId,
  actions,
  onClose,
  onOpenPage,
  onOpenTrash,
  loadError,
}: {
  open: boolean;
  idea: IdeaModel | null | undefined;
  /** `ideas.list` je pao: fioka nudi „Pokušaj ponovo" umesto večitog učitavanja. */
  loadError: { retry: () => void } | null;
  now: number;
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string;
  actions: IdeaActions;
  onClose: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenTrash: () => void;
}) {
  // Sadržaj ostaje dok fioka izlazi (inače klizi prazna).
  const [shown, setShown] = useState<IdeaModel | null>(idea ?? null);
  if (idea && idea !== shown) setShown(idea);
  const [historyOpen, setHistoryOpen] = useState(false);
  const current = idea ?? (open ? null : shown);
  const diskusija = useDiskusijaSidra("idea", current?._id ?? null);
  // Tim projekta za `@Ime` u prvoj poruci diskusije (ista pretplata kao komentari).
  const tim = useProjekatQueryTolerant(api.prostor.projekat.listMembers, { limit: 50 });

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(next) => (!next ? onClose() : undefined)}
        title={ideaDrawerTitle(current)}
        width="30rem"
        // Fokus na panel: prvi kontrol je „Istorija", a polje teksta se ne sme slučajno kucati.
        initialFocus="panel"
        header={
          current ? (
            <IdeaDetailHeader
              idea={current}
              onOpenHistory={() => setHistoryOpen(true)}
              onArchive={() => actions.onArchive(current)}
              discussionLabel={diskusija.natpis}
              onDiscussion={diskusija.pokreni}
            />
          ) : undefined
        }
        onExited={() => {
          const lastId = shown?._id ?? null;
          setShown(null);
          // Klik na telo kartice ne daje fokusabilan izvor (fokus dobije skrol-kontejner
          // table ili `body`): posle izlaza fokus ide na naslov iste ideje.
          window.requestAnimationFrame(() => {
            const active = document.activeElement;
            const lost =
              !(active instanceof HTMLElement) ||
              active === document.body ||
              !active.matches("button, a[href], input, textarea, select, [tabindex]");
            if (lost && lastId !== null) ideaTitleElement(lastId)?.focus();
          });
        }}
        // Element koji je otvorio fioku je možda nestao (kartica u drugoj koloni, meni):
        // fokus ide na naslov iste ideje na tabli ili u listi.
        returnFocusFallback={() => (shown ? ideaTitleElement(shown._id) : null)}
      >
        {loadError !== null && open ? (
          <IdeaDetailError retry={loadError.retry} />
        ) : idea === undefined && open ? (
          <IdeaDetailSkeleton />
        ) : current === null ? (
          <IdeaDetailMissing onOpenTrash={onOpenTrash} onClose={onClose} />
        ) : (
          <IdeaDetailBody
            key={current._id}
            idea={current}
            now={now}
            members={members}
            selfProfileId={selfProfileId}
            actions={actions}
            onOpenPage={onOpenPage}
          />
        )}
      </Drawer>
      {current ? (
        <RevisionHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          target={{ kind: "idea", id: current._id }}
          // Ideja nema reviziju (vraćanje ne proverava konflikt); 0 je samo popuna.
          currentRevision={0}
          blockedReason={current.permissions.canEdit ? null : "Ideja je već pretvorena."}
          memberName={(profileId) => members.find((member) => member.profileId === profileId)?.displayName ?? null}
          now={now}
        />
      ) : null}
      {current ? (
        <DiskusijaDijalog
          open={diskusija.dijalog.otvoren}
          onOpenChange={diskusija.dijalog.setOtvoren}
          anchorType="idea"
          predmet="ideja"
          anchorId={current._id}
          members={tim}
          onOpenChannel={diskusija.dijalog.otvoriKanal}
        />
      ) : null}
    </>
  );
}

function IdeaDetailBody({
  idea,
  now,
  members,
  selfProfileId,
  actions,
  onOpenPage,
}: {
  idea: IdeaModel;
  now: number;
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string;
  actions: IdeaActions;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const draft = useIdeaDraft(idea);
  return (
    <IdeaDetail
      idea={idea}
      now={now}
      draft={draft.value}
      saveState={draft.status}
      saveError={draft.error}
      onDraftChange={draft.edit}
      onDraftBlur={draft.flush}
      onRetrySave={draft.flush}
      actions={actions}
      onOpenConverted={onOpenPage}
      comments={
        <CommentsSection target={{ kind: "idea", id: idea._id }} members={members} selfProfileId={selfProfileId} now={now} />
      }
    />
  );
}

/**
 * Naslov i tekst ideje kao dokument tima: čuva se 1 s posle kucanja i na blur
 * (`ideas.update`; boja ostaje ista). Izmena drugog člana se prima samo kad
 * ništa ne čeka; odlazak sa nesačuvanim izmenama ih šalje.
 */
function useIdeaDraft(idea: IdeaModel) {
  const update = useProjekatMutation(api.prostor.ideas.update);
  const [draft, setDraftState] = useState<IdeaDraft>(() => createIdeaDraft(idea));
  const draftRef = useRef(draft);
  const colorRef = useRef(idea.color);

  const setDraft = useCallback((next: IdeaDraft) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const { _id: ideaId, title, text, color } = idea;
  useEffect(() => {
    colorRef.current = color;
    const next = ideaDraftFromServer(draftRef.current, { _id: ideaId, title, text });
    if (next !== draftRef.current) setDraft(next);
  }, [ideaId, title, text, color, setDraft]);

  const send = useCallback(
    (submission: { title: string; text: string }) =>
      update({ ideaId, title: submission.title, text: submission.text, color: colorRef.current }),
    [ideaId, update],
  );

  const saveNow = useCallback(() => {
    const started = ideaDraftStartSave(draftRef.current);
    if (started === null) return;
    setDraft(started.draft);
    // Greška se vidi u polju i najavljuje jednom (`role=alert`), bez dodatnog toasta.
    void send(started.submission)
      .then(() => setDraft(ideaDraftSaved(draftRef.current, started.submission)))
      .catch(() => setDraft(ideaDraftFailed(draftRef.current)));
  }, [send, setDraft]);

  const status = ideaDraftStatus(draft);
  useEffect(() => {
    if (status !== "dirty") return;
    const timer = window.setTimeout(saveNow, IDEA_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [status, draft.title, draft.text, saveNow]);

  // Zatvaranje fioke ili prelaz na drugu ideju: ono što čeka ide odmah.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(
    () => () => {
      // I ono što je otkucano dok je prethodno čuvanje bilo na putu.
      const leaving = ideaDraftOnLeave(draftRef.current);
      if (leaving === null) return;
      void sendRef.current(leaving).catch((error: unknown) =>
        toast.error(accessErrorMessage(error, "Ideja nije sačuvana.")),
      );
    },
    [],
  );

  return {
    value: { title: draft.title, text: draft.text },
    status,
    error: status === "invalid" ? ideaDraftError(draft) : null,
    edit: (patch: Partial<{ title: string; text: string }>) => setDraft(ideaDraftEdit(draftRef.current, patch)),
    flush: saveNow,
  };
}
