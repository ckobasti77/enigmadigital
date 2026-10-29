"use client";

// Preneto iz Devotion apps/web/components/workspace/task-page/use-task-instructions.ts (main @ c05c40f), SPAJANJE S12.
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";

import {
  createTaskInstructionsDraft,
  editTaskInstructionsDraft,
  prepareTaskInstructionsSave,
  reconcileTaskInstructionsDraft,
  rejectTaskInstructionsSave,
  resolveTaskInstructionsSave,
  taskInstructionsSaveState,
  type TaskInstructionsDraft,
  type TaskInstructionsSaveState,
  type TaskInstructionsServerState,
} from "@/lib/prostor/modeli/task-instructions-draft";

import { taskSaveErrorMessage } from "@/lib/prostor/modeli/task-page-model";

/**
 * Instrukcije zadatka na punoj strani: nacrt sa spiskom čuvanja koji na
 * stranu servera ne gubi kucanje (model `task-instructions-draft`, isti kao
 * pre PROSTORA). Čuva na blur kroz `save` (red automatskog čuvanja stranice,
 * sa revizijom); greška ostavlja nacrt i nudi „Pokušaj ponovo". Kad pravo
 * izmene nestane (zaključano), nacrt se vidi samo kroz stanje (`dirty`) i
 * `discard()` ga vraća na verziju sa servera.
 */
export function useTaskInstructions({
  page,
  canEdit,
  save,
}: {
  page: { _id: string; instructions?: string | null; revision: number };
  canEdit: boolean;
  /** Šalje tekst (prazan = bez instrukcija) i vraća novu reviziju stranice. */
  save: (value: string) => Promise<{ revision: number }>;
}) {
  const server: TaskInstructionsServerState = {
    pageId: page._id,
    value: page.instructions ?? "",
    revision: page.revision,
  };
  const [draft, setDraft] = useState<TaskInstructionsDraft>(() => createTaskInstructionsDraft(server));
  const draftRef = useRef(draft);
  const submissionIdRef = useRef(0);

  const ownDraft = draft.pageId === page._id;
  // Ko ne sme da menja, vidi verziju sa servera (nacrt koji je čekao nije sačuvan).
  const value = ownDraft && canEdit ? draft.value : server.value;
  const state: TaskInstructionsSaveState = ownDraft ? taskInstructionsSaveState(draft) : "saved";

  useEffect(() => {
    const next = reconcileTaskInstructionsDraft(draftRef.current, {
      pageId: page._id,
      value: page.instructions ?? "",
      revision: page.revision,
    });
    if (next === draftRef.current) return;
    draftRef.current = next;
    setDraft(next);
  }, [page._id, page.instructions, page.revision]);

  function change(next: string) {
    const edited = editTaskInstructionsDraft(draftRef.current, server, next);
    draftRef.current = edited;
    setDraft(edited);
  }

  async function commit() {
    if (!canEdit) return;
    submissionIdRef.current += 1;
    const prepared = prepareTaskInstructionsSave(draftRef.current, server, submissionIdRef.current);
    draftRef.current = prepared.draft;
    setDraft(prepared.draft);
    if (prepared.submission === null) return;
    try {
      const result = await save(prepared.submission.value);
      const resolved = resolveTaskInstructionsSave(draftRef.current, prepared.submission, result.revision);
      draftRef.current = resolved;
      setDraft(resolved);
    } catch (error) {
      const rejected = rejectTaskInstructionsSave(draftRef.current, prepared.submission);
      draftRef.current = rejected;
      setDraft(rejected);
      toast.error(taskSaveErrorMessage(error, "Instrukcije nisu sačuvane."));
    }
  }

  /** Odbacuje nacrt: polje i stanje se vraćaju na verziju sa servera. */
  function discard() {
    const fresh = createTaskInstructionsDraft(server);
    draftRef.current = fresh;
    setDraft(fresh);
  }

  /** Tekst nacrta (za „Kopiraj moju verziju"); prazno kad nema šta da se izgubi. */
  function draftText(): string {
    return ownDraft && state !== "saved" ? draft.value.trim() : "";
  }

  return { value, state, change, commit, discard, draftText };
}
