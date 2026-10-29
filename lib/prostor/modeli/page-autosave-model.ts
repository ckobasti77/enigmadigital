// Preneto iz Devotion apps/web/components/workspace/page/page-autosave-model.ts (main @ c05c40f), SPAJANJE S10.
/**
 * Čista logika automatskog čuvanja stranice (PROSTOR K10, plan K07 §3): red
 * poziva, stanja čuvanja, prepoznavanje konflikta i kada se prihvata verzija
 * sa servera. Logika je ista kao pre izdvajanja iz `page-editor-view.tsx`
 * (650 ms, jedan red poziva, konflikt zaustavlja čuvanje) — novo je samo
 * ponovni pokušaj posle greške i „Prepiši". Testovi: `page-autosave-model.test.ts`.
 */
import { accessErrorCode } from "../web/greske";

export type PageEditorSaveState =
  | "saved"
  | "saving"
  | "dirty"
  | "error"
  | "conflict"
  | "invalid";

/** Pauza posle poslednjeg kucanja pre čuvanja. */
export const AUTOSAVE_DELAY_MS = 650;
/** Posle neuspelog čuvanja pokušava se ponovo (tekst „pokušavam ponovo"). */
export const AUTOSAVE_RETRY_MS = 5_000;
/** Posle ovoliko neuspeha zaredom staje (trajna greška ne sme da kuca zauvek). */
export const AUTOSAVE_MAX_RETRIES = 3;

/**
 * Kada sledeće čuvanje kreće: `dirty` posle pauze, `error` posle pauze za ponovni
 * pokušaj, `now` odmah (Ctrl/⌘ S, „Prepiši"); ostala stanja ne čuvaju.
 */
export function autosaveDelay(
  state: PageEditorSaveState,
  immediate: boolean,
  failures = 0,
): number | null {
  if (state === "dirty") return immediate ? 0 : AUTOSAVE_DELAY_MS;
  if (state === "error") {
    if (immediate) return 0;
    return failures >= AUTOSAVE_MAX_RETRIES ? null : AUTOSAVE_RETRY_MS;
  }
  return null;
}

/**
 * Red poziva: svaki sledeći upis kreće tek kad prethodni završi (uspeh ili
 * greška), pa `expectedRevision` uvek nosi poslednju poznatu reviziju.
 */
export function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const queued = tail.then(operation, operation);
    tail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  };
}

/** Posle izmene polja: prazan naslov se ne čuva, konflikt ostaje konflikt. */
export function stateAfterEdit(current: PageEditorSaveState, title: string): PageEditorSaveState {
  if (!title.trim()) return "invalid";
  return current === "conflict" ? "conflict" : "dirty";
}

/** Uspeh: ako je korisnik kucao dok je čuvanje trajalo, ostaje `dirty`. */
export function stateAfterSuccess(localVersion: number, snapshotVersion: number): PageEditorSaveState {
  return localVersion === snapshotVersion ? "saved" : "dirty";
}

/** Greška (ne konflikt): novije kucanje ide u sledeće čuvanje, inače ponovni pokušaj. */
export function stateAfterFailure(localVersion: number, snapshotVersion: number): PageEditorSaveState {
  return localVersion === snapshotVersion ? "error" : "dirty";
}

export type ConflictInfo = {
  /** Revizija na serveru; `null` kad je greška iz starog oblika (samo tekst). */
  currentRevision: number | null;
  updatedByProfileId: string | null;
  updatedAt: number | null;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Konflikt revizije (K07 R1): `ConvexError` sa kodom `KONFLIKT_IZMENA` i
 * podacima o trenutnoj verziji; stari oblik (samo tekst) se i dalje prepoznaje.
 */
export function conflictFromError(error: unknown): ConflictInfo | null {
  if (accessErrorCode(error) === "KONFLIKT_IZMENA") {
    const data = (error as Error & { data?: Record<string, unknown> }).data ?? {};
    const updatedBy = data.updatedByProfileId;
    return {
      currentRevision: numberOrNull(data.currentRevision),
      updatedByProfileId: typeof updatedBy === "string" ? updatedBy : null,
      updatedAt: numberOrNull(data.updatedAt),
    };
  }
  if (String(error).includes("KONFLIKT_IZMENA")) {
    return { currentRevision: null, updatedByProfileId: null, updatedAt: null };
  }
  return null;
}

/**
 * Da li verzija sa servera zamenjuje nacrt u polju. Samo kad lokalno ništa ne
 * čeka (`saved`) i kad je stigla stvarno nova verzija — dok je nacrt
 * `dirty/saving/conflict`, osnova ostaje revizija od koje je korisnik krenuo.
 */
export function shouldAcceptRemote(input: {
  saveState: PageEditorSaveState;
  baseRevision: number;
  remote: { revision: number; title: string; content: string };
  draft: { title: string; content: string };
}): boolean {
  const { saveState, baseRevision, remote, draft } = input;
  if (saveState !== "saved" || remote.revision < baseRevision) return false;
  return !(
    remote.revision === baseRevision &&
    remote.title === draft.title &&
    remote.content === draft.content
  );
}

/** Stranica + instrukcije zadatka kao jedno stanje (za napuštanje stranice). */
export function combinedEditorSaveState(
  pageState: PageEditorSaveState,
  instructionsState: "saved" | "saving" | "dirty" | "error",
): PageEditorSaveState {
  if (pageState === "saving" || instructionsState === "saving") return "saving";
  if (pageState === "dirty" || instructionsState === "dirty") return "dirty";
  if (pageState === "invalid") return "invalid";
  if (pageState === "conflict") return "conflict";
  if (pageState === "error" || instructionsState === "error") return "error";
  return "saved";
}

/** Tekst stanja u zaglavlju dokumenta (K07 §5.6). */
export const SAVE_STATE_LABELS: Record<PageEditorSaveState, string> = {
  saving: "Čuvam…",
  saved: "Sačuvano",
  dirty: "Izmene čekaju",
  error: "Nije sačuvano — pokušavam ponovo.",
  invalid: "Naslov ne može biti prazan.",
  conflict: "Nije sačuvano zbog izmene tima.",
};

/** Da li napuštanje stranice traži pitanje (nešto još nije na serveru). */
export function hasUnsavedWork(state: PageEditorSaveState): boolean {
  return state !== "saved";
}

/** Stanja koja se sama završe za trenutak (shell sačeka do 2 s pre pitanja). */
export function isSettling(state: PageEditorSaveState): boolean {
  return state === "dirty" || state === "saving";
}

/** Pitanje pri napuštanju stranice sa nesačuvanim izmenama. */
export function leavePageQuestion(state: PageEditorSaveState): string {
  return state === "invalid"
    ? "Naslov je prazan, pa izmene ne mogu da se sačuvaju. Napusti stranicu?"
    : "Izmene još nisu sačuvane. Napusti stranicu?";
}
