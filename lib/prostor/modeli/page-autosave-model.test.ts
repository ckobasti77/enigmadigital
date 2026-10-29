// Preneto iz Devotion apps/web/components/workspace/page/page-autosave-model.test.ts (main @ c05c40f), SPAJANJE S10.
import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";

import {
  AUTOSAVE_DELAY_MS,
  AUTOSAVE_MAX_RETRIES,
  AUTOSAVE_RETRY_MS,
  autosaveDelay,
  combinedEditorSaveState,
  conflictFromError,
  createSerialQueue,
  isSettling,
  leavePageQuestion,
  SAVE_STATE_LABELS,
  shouldAcceptRemote,
  stateAfterEdit,
  stateAfterFailure,
  stateAfterSuccess,
} from "./page-autosave-model";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("red čuvanja stranice", () => {
  it("drugi upis kreće tek kad prvi završi, i kad prvi padne", async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const first = deferred<number>();
    const a = enqueue(async () => {
      log.push("a:start");
      const value = await first.promise;
      log.push("a:end");
      return value;
    });
    const b = enqueue(async () => {
      log.push("b:start");
      return 2;
    });
    await Promise.resolve();
    expect(log).toEqual(["a:start"]);
    first.reject(new Error("mreža"));
    await expect(a).rejects.toThrow("mreža");
    await expect(b).resolves.toBe(2);
    expect(log).toEqual(["a:start", "b:start"]);
  });
});

describe("stanja čuvanja", () => {
  it("prazan naslov se ne čuva; konflikt ostaje konflikt dok se ne reši", () => {
    expect(stateAfterEdit("saved", "   ")).toBe("invalid");
    expect(stateAfterEdit("invalid", "Plan")).toBe("dirty");
    expect(stateAfterEdit("saved", "Plan")).toBe("dirty");
    expect(stateAfterEdit("conflict", "Plan")).toBe("conflict");
  });

  it("kucanje tokom čuvanja ostavlja dirty i posle uspeha i posle greške", () => {
    expect(stateAfterSuccess(3, 3)).toBe("saved");
    expect(stateAfterSuccess(4, 3)).toBe("dirty");
    expect(stateAfterFailure(3, 3)).toBe("error");
    expect(stateAfterFailure(4, 3)).toBe("dirty");
  });

  it("dirty čeka 650 ms, greška se ponavlja posle pauze, Ctrl+S odmah; ostalo ne čuva", () => {
    expect(autosaveDelay("dirty", false)).toBe(AUTOSAVE_DELAY_MS);
    expect(autosaveDelay("dirty", true)).toBe(0);
    expect(autosaveDelay("error", false)).toBe(AUTOSAVE_RETRY_MS);
    // Trajna greška: posle tri neuspeha zaredom staje, Ctrl+S i dalje pokušava.
    expect(autosaveDelay("error", false, AUTOSAVE_MAX_RETRIES)).toBeNull();
    expect(autosaveDelay("error", true, AUTOSAVE_MAX_RETRIES)).toBe(0);
    expect(autosaveDelay("conflict", true)).toBeNull();
    expect(autosaveDelay("invalid", false)).toBeNull();
    expect(autosaveDelay("saved", true)).toBeNull();
    expect(SAVE_STATE_LABELS.error).toBe("Nije sačuvano — pokušavam ponovo.");
    expect(SAVE_STATE_LABELS.invalid).toBe("Naslov ne može biti prazan.");
  });

  it("instrukcije zadatka se spajaju sa stanjem stranice", () => {
    expect(combinedEditorSaveState("saved", "saving")).toBe("saving");
    expect(combinedEditorSaveState("conflict", "dirty")).toBe("dirty");
    expect(combinedEditorSaveState("conflict", "error")).toBe("conflict");
    expect(combinedEditorSaveState("saved", "error")).toBe("error");
    expect(combinedEditorSaveState("saved", "saved")).toBe("saved");
  });

  it("napuštanje: dirty/saving se sačeka, ostalo pita", () => {
    expect(isSettling("dirty")).toBe(true);
    expect(isSettling("saving")).toBe(true);
    expect(isSettling("conflict")).toBe(false);
    expect(leavePageQuestion("invalid")).toMatch(/Naslov je prazan/);
    expect(leavePageQuestion("conflict")).toBe("Izmene još nisu sačuvane. Napusti stranicu?");
  });
});

describe("konflikt revizije", () => {
  it("ConvexError sa kodom nosi trenutnu reviziju i ko je menjao", () => {
    const error = new ConvexError({
      code: "KONFLIKT_IZMENA",
      message: "KONFLIKT_IZMENA: Neko iz tima je u međuvremenu izmenio ovu stranicu.",
      currentRevision: 7,
      updatedByProfileId: "profiles_0002",
      updatedAt: 1_000,
    });
    expect(conflictFromError(error)).toEqual({
      currentRevision: 7,
      updatedByProfileId: "profiles_0002",
      updatedAt: 1_000,
    });
  });

  it("stari tekstualni oblik se i dalje prepoznaje; druge greške nisu konflikt", () => {
    expect(conflictFromError(new Error("Uncaught Error: KONFLIKT_IZMENA: izmenjeno"))).toEqual({
      currentRevision: null,
      updatedByProfileId: null,
      updatedAt: null,
    });
    expect(conflictFromError(new ConvexError({ code: "ZAKLJUCANO", message: "Stranica je zaključana." }))).toBeNull();
    expect(conflictFromError(new Error("mreža"))).toBeNull();
  });
});

describe("verzija sa servera", () => {
  const draft = { title: "Plan", content: "<p>a</p>" };

  it("prihvata se samo kad lokalno ništa ne čeka i kad je stvarno nova", () => {
    const remote = { revision: 5, title: "Plan", content: "<p>b</p>" };
    expect(shouldAcceptRemote({ saveState: "saved", baseRevision: 4, remote, draft })).toBe(true);
    expect(shouldAcceptRemote({ saveState: "dirty", baseRevision: 4, remote, draft })).toBe(false);
    expect(shouldAcceptRemote({ saveState: "conflict", baseRevision: 4, remote, draft })).toBe(false);
    expect(shouldAcceptRemote({ saveState: "saved", baseRevision: 6, remote, draft })).toBe(false);
  });

  it("ista revizija i isti tekst nisu promena (sopstveno čuvanje se vraća)", () => {
    expect(
      shouldAcceptRemote({ saveState: "saved", baseRevision: 5, remote: { revision: 5, ...draft }, draft }),
    ).toBe(false);
  });
});
