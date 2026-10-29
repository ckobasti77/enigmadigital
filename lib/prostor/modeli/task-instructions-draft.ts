// Preneto iz Devotion apps/web/components/workspace/task-instructions-draft.ts (main @ c05c40f), SPAJANJE S12.
export type TaskInstructionsServerState = {
  pageId: string;
  value: string;
  revision: number;
};

type PendingInstructionsSave = {
  id: number;
  value: string;
};

export type TaskInstructionsDraft = {
  pageId: string;
  base: string;
  value: string;
  revision: number;
  pending: Array<PendingInstructionsSave>;
  saveError: boolean;
};

export type TaskInstructionsSubmission = {
  id: number;
  pageId: string;
  value: string;
};

export type TaskInstructionsSaveState =
  | "saved"
  | "dirty"
  | "saving"
  | "error";

export type PageRevisionLedger = {
  activePageId: string;
  revisions: Map<string, number>;
};

function normalizedValue(value: string) {
  return value.trim();
}

export function createTaskInstructionsDraft(
  server: TaskInstructionsServerState,
): TaskInstructionsDraft {
  return {
    pageId: server.pageId,
    base: server.value,
    value: server.value,
    revision: server.revision,
    pending: [],
    saveError: false,
  };
}

export function reconcileTaskInstructionsDraft(
  draft: TaskInstructionsDraft,
  server: TaskInstructionsServerState,
): TaskInstructionsDraft {
  if (draft.pageId !== server.pageId) {
    return createTaskInstructionsDraft(server);
  }
  if (server.revision < draft.revision) return draft;
  if (
    server.revision === draft.revision &&
    server.value === draft.base
  ) {
    return draft;
  }

  const acknowledgedIndex = draft.pending.findIndex(
    (save) => save.value === server.value,
  );
  if (acknowledgedIndex >= 0) {
    const pending = draft.pending.slice(acknowledgedIndex + 1);
    return {
      ...draft,
      base: server.value,
      revision: server.revision,
      pending,
      saveError:
        pending.length === 0 &&
        normalizedValue(draft.value) !== server.value
          ? draft.saveError
          : false,
    };
  }

  const hasLocalWork =
    draft.pending.length > 0 || draft.value !== draft.base;
  const value = hasLocalWork ? draft.value : server.value;
  return {
    ...draft,
    base: server.value,
    value,
    revision: server.revision,
    saveError:
      normalizedValue(value) === server.value ? false : draft.saveError,
  };
}

export function editTaskInstructionsDraft(
  draft: TaskInstructionsDraft,
  server: TaskInstructionsServerState,
  value: string,
) {
  const current = reconcileTaskInstructionsDraft(draft, server);
  return { ...current, value, saveError: false };
}

export function prepareTaskInstructionsSave(
  draft: TaskInstructionsDraft,
  server: TaskInstructionsServerState,
  submissionId: number,
): {
  draft: TaskInstructionsDraft;
  submission: TaskInstructionsSubmission | null;
} {
  const current = reconcileTaskInstructionsDraft(draft, server);
  const value = current.value.trim();
  const latestTarget =
    current.pending.at(-1)?.value ?? current.base;
  if (value === latestTarget) {
    return {
      draft:
        value === current.value ? current : { ...current, value },
      submission: null,
    };
  }

  const submission = {
    id: submissionId,
    pageId: current.pageId,
    value,
  };
  return {
    draft: {
      ...current,
      value,
      pending: [...current.pending, submission],
      saveError: false,
    },
    submission,
  };
}

export function resolveTaskInstructionsSave(
  draft: TaskInstructionsDraft,
  submission: TaskInstructionsSubmission,
  revision: number,
): TaskInstructionsDraft {
  if (draft.pageId !== submission.pageId) return draft;
  if (!draft.pending.some((save) => save.id === submission.id)) {
    return draft;
  }
  const pending = draft.pending.filter(
    (save) => save.id !== submission.id,
  );
  if (revision < draft.revision) {
    return {
      ...draft,
      pending,
      saveError: false,
    };
  }
  return {
    ...draft,
    base: submission.value,
    revision,
    pending,
    saveError: false,
  };
}

export function rejectTaskInstructionsSave(
  draft: TaskInstructionsDraft,
  submission: TaskInstructionsSubmission,
): TaskInstructionsDraft {
  if (draft.pageId !== submission.pageId) return draft;
  const pending = draft.pending.filter(
    (save) => save.id !== submission.id,
  );
  return {
    ...draft,
    pending,
    saveError:
      pending.length === 0 &&
      normalizedValue(draft.value) !== draft.base,
  };
}

export function taskInstructionsSaveState(
  draft: TaskInstructionsDraft,
): TaskInstructionsSaveState {
  if (draft.pending.length > 0) return "saving";
  if (
    draft.saveError &&
    normalizedValue(draft.value) !== draft.base
  ) {
    return "error";
  }
  return normalizedValue(draft.value) === draft.base
    ? "saved"
    : "dirty";
}

export function createPageRevisionLedger(
  pageId: string,
  revision: number,
): PageRevisionLedger {
  return {
    activePageId: pageId,
    revisions: new Map([[pageId, revision]]),
  };
}

export function activatePageRevision(
  ledger: PageRevisionLedger,
  pageId: string,
  revision?: number,
) {
  ledger.activePageId = pageId;
  if (revision !== undefined) {
    const known = ledger.revisions.get(pageId);
    ledger.revisions.set(
      pageId,
      known === undefined ? revision : Math.max(known, revision),
    );
  }
}

export function readPageRevision(
  ledger: PageRevisionLedger,
  pageId: string,
  fallback: number,
) {
  return ledger.revisions.get(pageId) ?? fallback;
}

export function resolvePageRevision(
  ledger: PageRevisionLedger,
  pageId: string,
  revision: number,
) {
  const known = ledger.revisions.get(pageId);
  const resolved =
    known === undefined ? revision : Math.max(known, revision);
  ledger.revisions.set(pageId, resolved);
  return ledger.activePageId === pageId ? resolved : null;
}
