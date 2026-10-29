// Preneto iz Devotion apps/web/components/workspace/task-instructions-draft.test.ts (main @ c05c40f), SPAJANJE S12.
import { describe, expect, test } from "vitest";

import {
  activatePageRevision,
  createPageRevisionLedger,
  createTaskInstructionsDraft,
  editTaskInstructionsDraft,
  prepareTaskInstructionsSave,
  readPageRevision,
  reconcileTaskInstructionsDraft,
  rejectTaskInstructionsSave,
  resolvePageRevision,
  resolveTaskInstructionsSave,
  taskInstructionsSaveState,
} from "./task-instructions-draft";

const server = (value: string, revision: number) => ({
  pageId: "page-1",
  value,
  revision,
});

describe("task instructions draft", () => {
  test("ne prepisuje novije lokalno brisanje zakasnelom potvrdom prvog čuvanja", () => {
    let draft = createTaskInstructionsDraft(server("", 0));
    draft = editTaskInstructionsDraft(draft, server("", 0), "Prva verzija");

    const first = prepareTaskInstructionsSave(draft, server("", 0), 1);
    expect(first.submission?.value).toBe("Prva verzija");
    draft = first.draft;

    draft = editTaskInstructionsDraft(draft, server("", 0), "");
    const cleared = prepareTaskInstructionsSave(draft, server("", 0), 2);
    expect(cleared.submission?.value).toBe("");
    draft = cleared.draft;

    draft = reconcileTaskInstructionsDraft(
      draft,
      server("Prva verzija", 1),
    );
    expect(draft.value).toBe("");
    expect(draft.base).toBe("Prva verzija");

    draft = resolveTaskInstructionsSave(
      draft,
      first.submission!,
      1,
    );
    expect(draft.value).toBe("");
    expect(draft.base).toBe("Prva verzija");

    draft = resolveTaskInstructionsSave(
      draft,
      cleared.submission!,
      2,
    );
    draft = reconcileTaskInstructionsDraft(draft, server("", 2));
    expect(draft).toMatchObject({
      base: "",
      value: "",
      revision: 2,
      pending: [],
    });
  });

  test("čist nacrt prihvata noviju timsku vrednost", () => {
    const draft = reconcileTaskInstructionsDraft(
      createTaskInstructionsDraft(server("Staro", 1)),
      server("Novo", 2),
    );
    expect(draft).toMatchObject({ base: "Novo", value: "Novo", revision: 2 });
  });

  test("lokalno dirty polje ostaje sačuvano preko spoljne server izmene", () => {
    let draft = createTaskInstructionsDraft(server("Staro", 1));
    draft = editTaskInstructionsDraft(draft, server("Staro", 1), "Moj nacrt");
    draft = reconcileTaskInstructionsDraft(draft, server("Timsko", 2));
    expect(draft).toMatchObject({
      base: "Timsko",
      value: "Moj nacrt",
      revision: 2,
    });
  });

  test("neuspešno čuvanje ostavlja nacrt spreman za ponovni blur", () => {
    let draft = createTaskInstructionsDraft(server("Staro", 1));
    draft = editTaskInstructionsDraft(draft, server("Staro", 1), "Novo");
    const first = prepareTaskInstructionsSave(draft, server("Staro", 1), 1);
    draft = rejectTaskInstructionsSave(first.draft, first.submission!);
    expect(taskInstructionsSaveState(draft)).toBe("error");

    const retry = prepareTaskInstructionsSave(draft, server("Staro", 1), 2);
    expect(retry.submission?.value).toBe("Novo");
    expect(taskInstructionsSaveState(retry.draft)).toBe("saving");
  });

  test("stariji mutation odgovor ne vraća bazu preko novije subscription verzije", () => {
    let draft = createTaskInstructionsDraft(server("Staro", 1));
    draft = editTaskInstructionsDraft(
      draft,
      server("Staro", 1),
      "Moj nacrt",
    );
    const prepared = prepareTaskInstructionsSave(
      draft,
      server("Staro", 1),
      1,
    );
    draft = reconcileTaskInstructionsDraft(
      prepared.draft,
      server("Timska verzija", 3),
    );
    draft = resolveTaskInstructionsSave(
      draft,
      prepared.submission!,
      2,
    );

    expect(draft).toMatchObject({
      base: "Timska verzija",
      value: "Moj nacrt",
      revision: 3,
      pending: [],
    });
    expect(taskInstructionsSaveState(draft)).toBe("dirty");
  });

  test("revision ledger izoluje zakašnjeli odgovor prethodne stranice", () => {
    const ledger = createPageRevisionLedger("page-a", 4);
    activatePageRevision(ledger, "page-b", 10);

    expect(resolvePageRevision(ledger, "page-a", 5)).toBeNull();
    expect(readPageRevision(ledger, "page-a", 0)).toBe(5);
    expect(readPageRevision(ledger, "page-b", 0)).toBe(10);

    expect(resolvePageRevision(ledger, "page-b", 11)).toBe(11);
    expect(readPageRevision(ledger, "page-b", 0)).toBe(11);
  });
});
