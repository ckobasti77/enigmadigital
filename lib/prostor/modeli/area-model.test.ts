// Preneto iz Devotion apps/web/components/workspace/area/area-model.test.ts (main @ c05c40f), SPAJANJE S10.
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import {
  areaBodyEdit,
  areaBodyFromServer,
  areaBodyLoadLatest,
  areaBodyOverwrite,
  areaBodyRetriesExhausted,
  areaBodySaveDelay,
  areaBodySaveFailed,
  areaBodySaveSucceeded,
  areaBodyStartSave,
  areaBodyStateText,
  areaBodyStatus,
  areaHeaderMeta,
  areaTabStorageKey,
  areaTaskCount,
  countText,
  createAreaBodyDraft,
  DOCUMENT_TREE_MAX_DEPTH,
  editMeta,
  flattenDocumentTree,
  isLoadedDescendant,
  nestedMessage,
  nestingCandidates,
  pagesWord,
  readRememberedAreaTab,
  rememberAreaTab,
  resolveAreaTab,
  ROOT_LEVEL,
  shouldLoadMoreAreaTasks,
  validateAreaLabel,
  type DocumentLevel,
  type DocumentPage,
} from "./area-model";

const NOW = new Date("2026-10-24T09:30:00").getTime();
const MIN = 60_000;

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe("kartice oblasti (P12, K07 E15)", () => {
  it("URL ima prednost, pa zapamćena kartica, pa Pregled", () => {
    expect(resolveAreaTab("mapa", "zadaci")).toBe("mapa");
    expect(resolveAreaTab(undefined, "zadaci")).toBe("zadaci");
    expect(resolveAreaTab(undefined, null)).toBe("pregled");
  });

  it("izbor se pamti po oblasti; nepoznata vrednost i skladište koje baca su bezopasni", () => {
    const storage = memoryStorage();
    rememberAreaTab(storage, "area-1", "dokumenti");
    expect(storage.data.get(areaTabStorageKey("area-1"))).toBe("dokumenti");
    expect(areaTabStorageKey("area-1")).toBe("devotion:oblast:area-1:tab");
    expect(readRememberedAreaTab(storage, "area-1")).toBe("dokumenti");
    expect(readRememberedAreaTab(storage, "area-2")).toBeNull();
    expect(readRememberedAreaTab(memoryStorage({ [areaTabStorageKey("area-1")]: "kanvas" }), "area-1")).toBeNull();

    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readRememberedAreaTab(broken, "area-1")).toBeNull();
    expect(() => rememberAreaTab(broken, "area-1", "mapa")).not.toThrow();
    expect(readRememberedAreaTab(null, "area-1")).toBeNull();
  });
});

describe("zaglavlje oblasti", () => {
  it("broj stranica i zadataka sa srpskom množinom i granicom", () => {
    expect(pagesWord(1)).toBe("stranica");
    expect(pagesWord(3)).toBe("stranice");
    expect(pagesWord(12)).toBe("stranica");
    expect(pagesWord(22)).toBe("stranice");
    expect(areaHeaderMeta({ count: 12, capped: false }, { count: 8, capped: false })).toBe("12 stranica · 8 zadataka");
    expect(areaHeaderMeta({ count: 1, capped: false }, { count: 1, capped: false })).toBe("1 stranica · 1 zadatak");
    expect(areaHeaderMeta({ count: 99, capped: true }, { count: 50, capped: true })).toBe("99+ stranica · 50+ zadataka");
    expect(areaHeaderMeta(null, { count: 3, capped: false })).toBe("3 zadatka");
    expect(areaHeaderMeta(null, null)).toBeNull();
    expect(countText({ count: 0, capped: false })).toBe("0");
    expect(countText(null)).toBeNull();
  });

  it("broj zadataka iz prve strane: „50+” dok server ima još", () => {
    expect(areaTaskCount({ status: "LoadingFirstPage", loaded: 0 })).toBeNull();
    expect(areaTaskCount({ status: "Exhausted", loaded: 8 })).toEqual({ count: 8, capped: false });
    expect(areaTaskCount({ status: "CanLoadMore", loaded: 50 })).toEqual({ count: 50, capped: true });
  });

  it("naziv: prazan i predugačak se ne šalju", () => {
    expect(validateAreaLabel("  Razvoj  ")).toEqual({ ok: true, label: "Razvoj" });
    expect(validateAreaLabel("   ")).toEqual({ ok: false, message: "Naziv ne može biti prazan." });
    expect(validateAreaLabel("x".repeat(101))).toEqual({ ok: false, message: "Naziv može imati najviše 100 znakova." });
  });
});

describe("opis oblasti: čuvanje sa revizijom (P1, P2, P23)", () => {
  const server = { areaId: "area-1", content: "Stari opis", revision: 3 };

  it("kucanje → čuvanje sa revizijom od koje je krenulo → sačuvano", () => {
    let draft = createAreaBodyDraft(server);
    expect(areaBodyStatus(draft)).toBe("saved");
    draft = areaBodyEdit(draft, "Novi opis");
    expect(areaBodyStatus(draft)).toBe("dirty");
    const started = areaBodyStartSave(draft);
    expect(started.submission).toEqual({ value: "Novi opis", expectedRevision: 3 });
    expect(areaBodyStatus(started.draft)).toBe("saving");
    // Dok čeka odgovor, drugo čuvanje ne kreće.
    expect(areaBodyStartSave(started.draft).submission).toBeNull();
    draft = areaBodySaveSucceeded(started.draft, started.submission!, 4);
    expect(areaBodyStatus(draft)).toBe("saved");
    expect(draft.baseRevision).toBe(4);
  });

  it("kucanje tokom čuvanja ostaje nacrt i ide sledećim čuvanjem sa novom revizijom", () => {
    const started = areaBodyStartSave(areaBodyEdit(createAreaBodyDraft(server), "A"));
    const typing = areaBodyEdit(started.draft, "AB");
    const done = areaBodySaveSucceeded(typing, started.submission!, 4);
    expect(areaBodyStatus(done)).toBe("dirty");
    expect(areaBodyStartSave(done).submission).toEqual({ value: "AB", expectedRevision: 4 });
  });

  it("verzija sa servera zamenjuje polje samo kad lokalno ništa ne čeka", () => {
    const draft = createAreaBodyDraft(server);
    const remote = { areaId: "area-1", content: "Ana je dopisala", revision: 4 };
    expect(areaBodyFromServer(draft, remote).value).toBe("Ana je dopisala");
    const dirty = areaBodyEdit(draft, "Moj nacrt");
    const kept = areaBodyFromServer(dirty, remote);
    expect(kept.value).toBe("Moj nacrt");
    // Osnova ostaje revizija od koje je korisnik krenuo → tuđa izmena daje konflikt, ne tiho prepisivanje.
    expect(areaBodyStartSave(kept).submission?.expectedRevision).toBe(3);
    // Starija revizija (zakasnela pretplata) se ignoriše.
    expect(areaBodyFromServer(draft, { ...remote, revision: 2 })).toBe(draft);
    // Druga oblast = nov nacrt.
    expect(areaBodyFromServer(draft, { areaId: "area-2", content: "", revision: 0 }).areaId).toBe("area-2");
  });

  it("konflikt revizije zaustavlja čuvanje; Učitaj najnoviju odbacuje nacrt, Prepiši šalje preko", () => {
    const started = areaBodyStartSave(areaBodyEdit(createAreaBodyDraft(server), "Moj opis"));
    const error = new ConvexError({
      code: "KONFLIKT_IZMENA",
      message: "KONFLIKT_IZMENA: Briefing je u međuvremenu izmenjen.",
      currentRevision: 5,
      updatedByProfileId: null,
      updatedAt: NOW - 2 * MIN,
    });
    const conflicted = areaBodySaveFailed(started.draft, error);
    expect(areaBodyStatus(conflicted)).toBe("conflict");
    expect(conflicted.conflict).toEqual({ currentRevision: 5, updatedByProfileId: null, updatedAt: NOW - 2 * MIN });
    expect(conflicted.value).toBe("Moj opis");
    expect(areaBodyStartSave(conflicted).submission).toBeNull();
    expect(areaBodySaveDelay(areaBodyStatus(conflicted), 0, false)).toBeNull();

    const latest = areaBodyLoadLatest(conflicted, { areaId: "area-1", content: "Markova verzija", revision: 5 });
    expect(latest.value).toBe("Markova verzija");
    expect(areaBodyStatus(latest)).toBe("saved");

    const overwrite = areaBodyOverwrite(conflicted, 4);
    expect(overwrite.submission).toEqual({ value: "Moj opis", expectedRevision: 5 });
    expect(areaBodyStatus(overwrite.draft)).toBe("saving");
    // Pretplata je već videla noviju reviziju od one iz greške.
    expect(areaBodyOverwrite(conflicted, 7).submission.expectedRevision).toBe(7);
    // Prolazna greška posle „Prepiši": ponovni pokušaj nosi tuđu reviziju, ne staru osnovu.
    const retried = areaBodySaveFailed(overwrite.draft, new Error("mreža"));
    expect(areaBodyStatus(retried)).toBe("error");
    expect(areaBodyStartSave(retried).submission).toEqual({ value: "Moj opis", expectedRevision: 5 });
  });

  it("druga greška: ponovni pokušaj posle 5 s, najviše tri puta, pa „Pokušaj ponovo”", () => {
    let draft = areaBodyEdit(createAreaBodyDraft(server), "Opis");
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const started = areaBodyStartSave(draft);
      draft = areaBodySaveFailed(started.draft, new Error("mreža"));
      expect(areaBodyStatus(draft)).toBe("error");
      expect(draft.failures).toBe(attempt);
    }
    expect(areaBodyRetriesExhausted(draft)).toBe(true);
    expect(areaBodySaveDelay("error", 3, false)).toBeNull();
    expect(areaBodySaveDelay("error", 1, false)).toBe(5_000);
    expect(areaBodySaveDelay("dirty", 0, false)).toBe(1_000);
    expect(areaBodySaveDelay("saved", 0, true)).toBeNull();
    // Novo kucanje vraća nacrt u red za čuvanje.
    expect(areaBodyStatus(areaBodyEdit(draft, "Opis!"))).toBe("dirty");
  });

  it("tekst stanja ispod polja", () => {
    const base = { exhausted: false, editorName: "Marko Ilić", updatedAt: NOW - 2 * 24 * 60 * MIN, now: NOW };
    expect(areaBodyStateText({ ...base, status: "saved" })).toMatch(/^Sačuvano · Marko Ilić · /);
    expect(areaBodyStateText({ ...base, status: "saved", updatedAt: null })).toBe("");
    expect(areaBodyStateText({ ...base, status: "saving" })).toBe("Čuvam…");
    expect(areaBodyStateText({ ...base, status: "error" })).toBe("Nije sačuvano — pokušavam ponovo.");
    expect(areaBodyStateText({ ...base, status: "error", exhausted: true })).toBe("Nije sačuvano.");
    expect(areaBodyStateText({ ...base, status: "conflict" })).toBe("Nije sačuvano zbog izmene tima.");
    expect(areaBodyStateText({ ...base, status: "saved", editorName: null })).toMatch(/^Sačuvano · Član tima · /);
  });
});

describe("zadaci oblasti: kraća strana nije kraj (K07 R6)", () => {
  it("učitava dalje dok ne skupi traženo ili server ne kaže kraj", () => {
    expect(shouldLoadMoreAreaTasks({ status: "CanLoadMore", loaded: 3, wanted: 50 })).toBe(true);
    expect(shouldLoadMoreAreaTasks({ status: "CanLoadMore", loaded: 50, wanted: 50 })).toBe(false);
    expect(shouldLoadMoreAreaTasks({ status: "Exhausted", loaded: 3, wanted: 50 })).toBe(false);
    expect(shouldLoadMoreAreaTasks({ status: "LoadingMore", loaded: 3, wanted: 50 })).toBe(false);
    expect(shouldLoadMoreAreaTasks({ status: "LoadingFirstPage", loaded: 0, wanted: 50 })).toBe(false);
  });
});

describe("Dokumenti: stablo (P12, P4)", () => {
  const page = (id: string, parent: string | null, extra: Partial<DocumentPage> = {}): DocumentPage => ({
    _id: id,
    title: id.toUpperCase(),
    kind: "note",
    parentPageId: parent,
    createdByProfileId: "p1",
    updatedByProfileId: "p2",
    updatedAt: NOW,
    lockedAt: null,
    ...extra,
  });
  const ready = (pages: DocumentPage[], hasMore = false): DocumentLevel => ({ status: "ready", pages, hasMore });

  it("razvijena stranica pokazuje decu uvučenu za nivo; nivo koji stiže, pada ili ima još", () => {
    const levels = new Map<string, DocumentLevel>([
      [ROOT_LEVEL, ready([page("a", null), page("b", null), page("c", null)], true)],
      ["a", ready([page("a1", "a"), page("a2", "a")])],
      ["b", { status: "loading" }],
      ["c", { status: "error" }],
    ]);
    const rows = flattenDocumentTree({
      levels,
      expanded: new Set(["a", "b", "c"]),
      childCounts: new Map([
        ["a", 2],
        ["b", 1],
        ["c", 3],
        ["a1", 0],
      ]),
    });
    expect(rows.map((row) => `${row.type}:${row.key}:${row.depth}`)).toEqual([
      "page:a:0",
      "page:a1:1",
      "page:a2:1",
      "page:b:0",
      "loading:loading:b:1",
      "page:c:0",
      "error:error:c:1",
      "more:more:root:0",
    ]);
    const a1 = rows.find((row) => row.key === "a1");
    expect(a1).toMatchObject({ hasChildren: false, expandable: false, expanded: false });
    const a2 = rows.find((row) => row.key === "a2");
    expect(a2).toMatchObject({ hasChildren: null, expandable: true });
  });

  it("stranica bez dece se ne razvija ni kad je u skupu; koren koji stiže je jedan red", () => {
    const rows = flattenDocumentTree({
      levels: new Map([[ROOT_LEVEL, ready([page("a", null)])]]),
      expanded: new Set(["a"]),
      childCounts: new Map([["a", 0]]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "page", expanded: false, expandable: false, hasChildren: false });
    expect(flattenDocumentTree({ levels: new Map(), expanded: new Set(), childCounts: new Map() })).toEqual([
      { type: "loading", key: `loading:${ROOT_LEVEL}`, depth: 0, parentId: null },
    ]);
  });

  it("dubina je ograničena (dalje vodi stranica)", () => {
    const levels = new Map<string, DocumentLevel>([[ROOT_LEVEL, ready([page("n0", null)])]]);
    const expanded = new Set<string>();
    for (let depth = 0; depth < DOCUMENT_TREE_MAX_DEPTH + 2; depth += 1) {
      levels.set(`n${depth}`, ready([page(`n${depth + 1}`, `n${depth}`)]));
      expanded.add(`n${depth}`);
    }
    const rows = flattenDocumentTree({ levels, expanded, childCounts: new Map() });
    const maxDepth = Math.max(...rows.map((row) => row.depth));
    expect(maxDepth).toBe(DOCUMENT_TREE_MAX_DEPTH);
    // Najdublji red nema strelicu (ne obećava razvijanje koje ne radi); otvara se stranica.
    const deepest = rows.find((row) => row.type === "page" && row.depth === DOCUMENT_TREE_MAX_DEPTH);
    expect(deepest).toMatchObject({ expandable: false, expanded: false });
    const shallow = rows.find((row) => row.type === "page" && row.depth === 0);
    expect(shallow).toMatchObject({ expandable: true, expanded: true });
  });

  it("Ugnezdi u…: bez same stranice, njenog roditelja i učitanih potomaka", () => {
    const rows = flattenDocumentTree({
      levels: new Map<string, DocumentLevel>([
        [ROOT_LEVEL, ready([page("a", null), page("b", null), page("c", null)])],
        ["a", ready([page("a1", "a")])],
        ["a1", ready([page("a11", "a1")])],
        ["b", ready([page("b1", "b")])],
      ]),
      expanded: new Set(["a", "a1", "b"]),
      childCounts: new Map(),
    });
    const a = rows.find((row) => row.type === "page" && row.page._id === "a");
    const b1 = rows.find((row) => row.type === "page" && row.page._id === "b1");
    if (a?.type !== "page" || b1?.type !== "page") throw new Error("nema reda");
    expect(nestingCandidates(a.page, rows).map((item) => item._id)).toEqual(["b", "b1", "c"]);
    expect(nestingCandidates(b1.page, rows).map((item) => item._id)).toEqual(["a", "a1", "a11", "c"]);
    expect(nestingCandidates(a.page, rows, 2)).toHaveLength(2);
    expect(isLoadedDescendant(rows, "a", "a11")).toBe(true);
    expect(isLoadedDescendant(rows, "a", "b1")).toBe(false);
    expect(isLoadedDescendant(rows, "a11", "a")).toBe(false);
  });

  it("tekstovi reda i ugnežđavanja", () => {
    expect(editMeta("Ana Petrović", NOW - 5 * MIN, NOW)).toBe("Ana Petrović · pre 5 min");
    expect(editMeta(null, NOW - 5 * MIN, NOW)).toBe("Član tima · pre 5 min");
    expect(nestedMessage("Plan", "Lansiranje")).toBe("„Plan” je ugnežđeno u „Lansiranje”.");
    expect(nestedMessage("  ", "")).toBe("„Bez naslova” je ugnežđeno u „Bez naslova”.");
  });
});
