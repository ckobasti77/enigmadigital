// Preneto iz Devotion apps/web/components/workspace/ideas/ideas-model.test.ts (main @ c05c40f), SPAJANJE S13.
import { describe, expect, it } from "vitest";
import { IDEA_STORED_STAGES, ideaStagePermissions, type IdeaStage } from "..";

import type { Id } from "../../../convex/_generated/dataModel";

import {
  applyIdeaStage,
  applyIdeaVote,
  ariaSortOf,
  boardFocusMove,
  buildIdeaBoard,
  canDropIdeaOn,
  convertHint,
  convertedMessage,
  createIdeaDraft,
  ideaDraftEdit,
  ideaDraftFailed,
  ideaDraftFromServer,
  ideaDraftOnLeave,
  ideaDraftSaved,
  ideaDraftStartSave,
  ideaDraftStatus,
  voteButtonLabel,
  DEFAULT_IDEA_SORT,
  filterIdeas,
  ideaAuthorLine,
  ideaCommentCount,
  ideaDraftChanged,
  ideaDraftError,
  ideaDropTargets,
  IDEAS_VIEW_STORAGE_KEY,
  ideasCountLabel,
  nextIdeaSort,
  readIdeasViewMode,
  sortIdeas,
  stageChangedMessage,
  trashedMessage,
  voteMessage,
  writeIdeasViewMode,
  type IdeaModel,
} from "./ideas-model";

const DAY = 86_400_000;
const NOW = new Date("2026-10-24T09:30:00").getTime();

function idea(n: number, overrides: Partial<IdeaModel> = {}): IdeaModel {
  return {
    _id: `idea_${n}` as Id<"ideaNodes">,
    title: `Ideja ${n}`,
    text: `Tekst ${n}`,
    color: "violet",
    createdAt: NOW - n * DAY,
    stage: "predlog",
    storedStage: "predlog",
    stageChangedAt: null,
    convertedPageId: null,
    upvotes: 0,
    downvotes: 0,
    myVote: null,
    commentCount: 0,
    commentCountCapped: false,
    author: { displayName: "Ana Ilić", avatarUrl: null },
    permissions: {
      canEdit: true,
      canVote: true,
      canSetStage: false,
      canConvert: false,
      canArchive: true,
      canComment: true,
    },
    ...overrides,
  };
}

/** Dozvola faze kako je računa server za ulogu (shared kopija pravila). */
function asRole(role: "autor" | "vlasnik" | "admin" | "clan", stage: IdeaStage) {
  const converted = stage === "postalo_zadatak";
  const perms = ideaStagePermissions({
    isAuthor: role === "autor",
    isManager: role === "vlasnik" || role === "admin",
    stage: converted ? "odobreno" : stage,
    convertedPageId: converted ? "page_1" : null,
  });
  return { stage, permissions: { canSetStage: perms.setStage.allowed } };
}

const ALL_COLUMNS: IdeaStage[] = ["predlog", "razmatra_se", "odobreno", "postalo_zadatak", "odbijeno"];

describe("prevlačenje između kolona (dozvoljeni ciljevi po fazi i ulozi)", () => {
  it("autor, vlasnik i admin: svaka sačuvana faza osim trenutne; „Postalo zadatak” nikad", () => {
    for (const role of ["autor", "vlasnik", "admin"] as const) {
      for (const from of IDEA_STORED_STAGES) {
        const targets = ideaDropTargets(asRole(role, from));
        expect(targets).toEqual(IDEA_STORED_STAGES.filter((stage) => stage !== from));
        expect(targets).not.toContain("postalo_zadatak");
        for (const column of ALL_COLUMNS) {
          expect(canDropIdeaOn(asRole(role, from), column)).toBe(column !== from && column !== "postalo_zadatak");
        }
      }
    }
  });

  it("član koji nije autor: nijedna kolona nije cilj, ni za jednu fazu", () => {
    for (const from of ALL_COLUMNS) {
      expect(ideaDropTargets(asRole("clan", from))).toEqual([]);
      for (const column of ALL_COLUMNS) expect(canDropIdeaOn(asRole("clan", from), column)).toBe(false);
    }
  });

  it("pretvorena ideja (Postalo zadatak) se ne pomera ni za autora, vlasnika i admina", () => {
    for (const role of ["autor", "vlasnik", "admin", "clan"] as const) {
      expect(ideaDropTargets(asRole(role, "postalo_zadatak"))).toEqual([]);
    }
    // I kad bi server greškom dao dozvolu, pretvorena nema cilj.
    expect(ideaDropTargets({ stage: "postalo_zadatak", permissions: { canSetStage: true } })).toEqual([]);
  });

  it("iz „Odbijeno” se vraća u bilo koju fazu (odbijanje nije kraj)", () => {
    expect(ideaDropTargets(asRole("autor", "odbijeno"))).toEqual(["predlog", "razmatra_se", "odobreno"]);
  });
});

describe("tabla", () => {
  it("kolone redom, Odbijeno posebno, najnovije stigla prva", () => {
    const board = buildIdeaBoard([
      idea(1, { stage: "razmatra_se", storedStage: "razmatra_se" }),
      idea(2, { stage: "predlog" }),
      idea(3, { stage: "odbijeno", storedStage: "odbijeno" }),
      idea(4, { stage: "predlog", stageChangedAt: NOW }),
      idea(5, { stage: "postalo_zadatak", convertedPageId: "page_1" as Id<"pages"> }),
    ]);
    expect(board.columns.map((column) => column.label)).toEqual(["Predlog", "Razmatra se", "Odobreno", "Postalo zadatak"]);
    expect(board.columns[0]?.ideas.map((item) => item._id)).toEqual(["idea_4", "idea_2"]);
    expect(board.columns[1]?.ideas.map((item) => item._id)).toEqual(["idea_1"]);
    expect(board.columns[2]?.ideas).toEqual([]);
    expect(board.columns[3]?.ideas.map((item) => item._id)).toEqual(["idea_5"]);
    expect(board.rejected).toMatchObject({ stage: "odbijeno", label: "Odbijeno" });
    expect(board.rejected.ideas.map((item) => item._id)).toEqual(["idea_3"]);
  });

  it("tastatura: levo/desno preskače prazne kolone i drži red, gore/dole u koloni", () => {
    const counts = [3, 0, 1, 2];
    expect(boardFocusMove(counts, { column: 0, index: 2 }, "ArrowRight")).toEqual({ column: 2, index: 0 });
    expect(boardFocusMove(counts, { column: 2, index: 0 }, "ArrowRight")).toEqual({ column: 3, index: 0 });
    expect(boardFocusMove(counts, { column: 3, index: 1 }, "ArrowLeft")).toEqual({ column: 2, index: 0 });
    expect(boardFocusMove(counts, { column: 3, index: 1 }, "ArrowRight")).toBeNull();
    expect(boardFocusMove(counts, { column: 0, index: 0 }, "ArrowLeft")).toBeNull();
    expect(boardFocusMove(counts, { column: 0, index: 1 }, "ArrowDown")).toEqual({ column: 0, index: 2 });
    expect(boardFocusMove(counts, { column: 0, index: 2 }, "ArrowDown")).toBeNull();
    expect(boardFocusMove(counts, { column: 0, index: 0 }, "ArrowUp")).toBeNull();
  });
});

describe("lista", () => {
  const ideas = [
    idea(1, { title: "Šablon", upvotes: 1, downvotes: 0, commentCount: 5, stage: "odobreno", author: { displayName: "Marko", avatarUrl: null } }),
    idea(2, { title: "Anketa", upvotes: 4, downvotes: 1, commentCount: 0, stage: "predlog", author: { displayName: "Ana", avatarUrl: null } }),
    idea(3, { title: "Cena", upvotes: 2, downvotes: 2, commentCount: 2, stage: "razmatra_se", author: null }),
  ];
  const ids = (list: IdeaModel[]) => list.map((item) => item._id);

  it("podrazumevano najnovije prvo", () => {
    expect(ids(sortIdeas(ideas, DEFAULT_IDEA_SORT))).toEqual(["idea_1", "idea_2", "idea_3"]);
  });

  it("sortira po svakoj koloni, a ista kolona menja smer", () => {
    expect(ids(sortIdeas(ideas, { key: "ideja", direction: "asc" }))).toEqual(["idea_2", "idea_3", "idea_1"]);
    expect(ids(sortIdeas(ideas, { key: "glasovi", direction: "desc" }))).toEqual(["idea_2", "idea_1", "idea_3"]);
    expect(ids(sortIdeas(ideas, { key: "faza", direction: "asc" }))).toEqual(["idea_2", "idea_3", "idea_1"]);
    expect(ids(sortIdeas(ideas, { key: "komentari", direction: "desc" }))).toEqual(["idea_1", "idea_3", "idea_2"]);
    expect(nextIdeaSort(DEFAULT_IDEA_SORT, "starost")).toEqual({ key: "starost", direction: "desc" });
    expect(nextIdeaSort(DEFAULT_IDEA_SORT, "glasovi")).toEqual({ key: "glasovi", direction: "desc" });
    expect(nextIdeaSort(DEFAULT_IDEA_SORT, "ideja")).toEqual({ key: "ideja", direction: "asc" });
    expect(ariaSortOf(DEFAULT_IDEA_SORT, "starost")).toBe("ascending");
    expect(ariaSortOf(DEFAULT_IDEA_SORT, "autor")).toBe("none");
  });

  it("pretraga po naslovu i tekstu, bez obzira na kvačice i velika slova", () => {
    expect(ids(filterIdeas(ideas, "SABLON"))).toEqual(["idea_1"]);
    expect(ids(filterIdeas([idea(7, { title: "Đački meni" })], "djacki"))).toEqual(["idea_7"]);
    // Bez pojma isti niz (Mapa ne resinhronizuje čvorove).
    expect(filterIdeas(ideas, "")).toBe(ideas);
    expect(ids(filterIdeas(ideas, "tekst 3"))).toEqual(["idea_3"]);
    expect(filterIdeas(ideas, "  ")).toHaveLength(3);
    expect(filterIdeas(ideas, "nema")).toEqual([]);
  });
});

describe("glas i faza (optimistički, kao server)", () => {
  it("glas: dodaje, menja i skida; stari klijentski `userVote` prati", () => {
    const base = { ...idea(1, { upvotes: 2, downvotes: 1 }), userVote: null as "up" | "down" | null };
    const up = applyIdeaVote(base, "up");
    expect(up).toMatchObject({ upvotes: 3, downvotes: 1, myVote: "up", userVote: "up" });
    const down = applyIdeaVote(up, "down");
    expect(down).toMatchObject({ upvotes: 2, downvotes: 2, myVote: "down" });
    expect(applyIdeaVote(down, "down")).toMatchObject({ upvotes: 2, downvotes: 1, myVote: null });
    expect(voteMessage(null, "up")).toBe("Glas je sačuvan.");
    expect(voteMessage("up", "up")).toBe("Glas je povučen.");
  });

  it("faza: „Pretvori” postaje dostupno tek u „Odobreno”; pretvorena se ne menja", () => {
    const author = idea(1, { permissions: { ...idea(1).permissions, canSetStage: true } });
    const approved = applyIdeaStage(author, "odobreno", NOW);
    expect(approved).toMatchObject({ stage: "odobreno", storedStage: "odobreno", stageChangedAt: NOW });
    expect(approved.permissions.canConvert).toBe(true);
    expect(applyIdeaStage(approved, "razmatra_se", NOW).permissions.canConvert).toBe(false);
    const member = applyIdeaStage(idea(2), "odobreno", NOW);
    expect(member.permissions.canConvert).toBe(false);
    const converted = idea(3, { stage: "postalo_zadatak", convertedPageId: "page_1" as Id<"pages"> });
    expect(applyIdeaStage(converted, "predlog", NOW)).toBe(converted);
  });

  it("„Pretvori”: dugme samo uz dozvolu, objašnjenje samo odgovornom van faze", () => {
    const perms = idea(1).permissions;
    expect(convertHint(idea(1, { stage: "odobreno", permissions: { ...perms, canSetStage: true, canConvert: true } }))).toEqual({ kind: "button" });
    expect(convertHint(idea(1, { stage: "razmatra_se", permissions: { ...perms, canSetStage: true } }))).toEqual({
      kind: "hint",
      text: "Pretvara se u fazi „Odobreno”.",
    });
    expect(convertHint(idea(1, { stage: "odobreno" }))).toEqual({ kind: "none" });
    expect(convertHint(idea(1, { stage: "postalo_zadatak", convertedPageId: "p" as Id<"pages"> }))).toEqual({ kind: "none" });
  });
});

describe("prikaz se pamti lokalno", () => {
  it("čita zapamćen izbor, nepoznata vrednost i skladište koje baca daju Tablu", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    expect(readIdeasViewMode(storage)).toBe("tabla");
    writeIdeasViewMode(storage, "lista");
    expect(store.get(IDEAS_VIEW_STORAGE_KEY)).toBe("lista");
    expect(readIdeasViewMode(storage)).toBe("lista");
    store.set(IDEAS_VIEW_STORAGE_KEY, "kanvas");
    expect(readIdeasViewMode(storage)).toBe("tabla");
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(readIdeasViewMode(broken)).toBe("tabla");
    expect(() => writeIdeasViewMode(broken, "mapa")).not.toThrow();
    expect(readIdeasViewMode(null)).toBe("tabla");
  });
});

describe("tekstovi i nacrt", () => {
  it("tekstovi kartice, toastova i brojača", () => {
    expect(ideaAuthorLine(idea(3), NOW)).toBe("Ana Ilić · pre 3 dana");
    expect(ideaAuthorLine(idea(0, { author: null }), NOW)).toBe("Član tima · upravo");
    expect(ideaCommentCount(idea(1, { commentCount: 20, commentCountCapped: true }))).toBe("20+");
    expect(ideasCountLabel(1)).toBe("1 ideja");
    expect(ideasCountLabel(3)).toBe("3 ideje");
    expect(ideasCountLabel(12)).toBe("12 ideja");
    expect(ideasCountLabel(22)).toBe("22 ideje");
    expect(stageChangedMessage("odobreno")).toBe("Ideja je u fazi „Odobreno”.");
    expect(convertedMessage("task", "Cenovnik")).toBe("Ideja je postala zadatak „Cenovnik”.");
    expect(convertedMessage("note", "Cenovnik")).toBe("Ideja je postala beleška „Cenovnik”.");
    expect(trashedMessage("Cenovnik")).toBe("„Cenovnik” je u Korpi.");
  });

  it("nacrt: prazan naslov ili tekst se ne šalje; razmaci se ne računaju kao izmena", () => {
    expect(ideaDraftError({ title: " ", text: "x" })).toBe("Naslov ne može biti prazan.");
    expect(ideaDraftError({ title: "x", text: "" })).toBe("Tekst ideje ne može biti prazan.");
    expect(ideaDraftError({ title: "x".repeat(201), text: "x" })).toMatch(/najviše 200/);
    expect(ideaDraftError({ title: "Ok", text: "Ok" })).toBeNull();
    expect(ideaDraftChanged({ title: "Ideja 1 ", text: "Tekst 1" }, idea(1))).toBe(false);
    expect(ideaDraftChanged({ title: "Ideja 1", text: "Novo" }, idea(1))).toBe(true);
  });
});

describe("nacrt teksta u detalju (čuva se sam, tim menja)", () => {
  const server = { _id: "idea_1", title: "Cenovnik", text: "Prvi tekst" };

  it("kucanje → čuvanje → sačuvano; kucanje tokom čuvanja ide sledećim čuvanjem", () => {
    let draft = createIdeaDraft(server);
    expect(ideaDraftStatus(draft)).toBe("saved");
    expect(ideaDraftStartSave(draft)).toBeNull();
    draft = ideaDraftEdit(draft, { text: "Drugi tekst " });
    expect(ideaDraftStatus(draft)).toBe("dirty");
    const started = ideaDraftStartSave(draft)!;
    expect(started.submission).toEqual({ title: "Cenovnik", text: "Drugi tekst" });
    draft = ideaDraftEdit(started.draft, { text: "Treći" });
    expect(ideaDraftStatus(draft)).toBe("saving");
    draft = ideaDraftSaved(draft, started.submission);
    expect(ideaDraftStatus(draft)).toBe("dirty");
    const second = ideaDraftStartSave(draft)!;
    expect(ideaDraftStatus(ideaDraftSaved(second.draft, second.submission))).toBe("saved");
  });

  it("prazan naslov se ne šalje; greška čeka „Pokušaj ponovo”", () => {
    const empty = ideaDraftEdit(createIdeaDraft(server), { title: "  " });
    expect(ideaDraftStatus(empty)).toBe("invalid");
    expect(ideaDraftStartSave(empty)).toBeNull();
    const started = ideaDraftStartSave(ideaDraftEdit(createIdeaDraft(server), { text: "Novo" }))!;
    const failed = ideaDraftFailed(started.draft);
    expect(ideaDraftStatus(failed)).toBe("error");
    expect(ideaDraftStartSave(failed)?.submission).toEqual({ title: "Cenovnik", text: "Novo" });
  });

  it("izmena drugog člana se prima samo kad ništa ne čeka; druga ideja = nov nacrt", () => {
    const clean = createIdeaDraft(server);
    const adopted = ideaDraftFromServer(clean, { ...server, text: "Anin tekst" });
    expect(adopted.text).toBe("Anin tekst");
    expect(ideaDraftStatus(adopted)).toBe("saved");
    const typing = ideaDraftEdit(clean, { text: "Moj tekst" });
    const kept = ideaDraftFromServer(typing, { ...server, text: "Anin tekst" });
    expect(kept.text).toBe("Moj tekst");
    expect(ideaDraftStatus(kept)).toBe("dirty");
    expect(ideaDraftFromServer(typing, { _id: "idea_2", title: "Druga", text: "x" })).toMatchObject({ ideaId: "idea_2", title: "Druga" });
  });

  it("menjam naslov dok drugi menja tekst: tuđi tekst se prima, moj naslov ostaje, čuvanje ne gazi", () => {
    const mine = ideaDraftEdit(createIdeaDraft(server), { title: "Cenovnik 2027" });
    const merged = ideaDraftFromServer(mine, { ...server, text: "Markov tekst" });
    expect(merged).toMatchObject({ title: "Cenovnik 2027", text: "Markov tekst" });
    expect(ideaDraftStartSave(merged)?.submission).toEqual({ title: "Cenovnik 2027", text: "Markov tekst" });
  });

  it("odlazak iz fioke šalje i ono što je otkucano tokom čuvanja; prazan naslov ne", () => {
    expect(ideaDraftOnLeave(createIdeaDraft(server))).toBeNull();
    const started = ideaDraftStartSave(ideaDraftEdit(createIdeaDraft(server), { text: "Prvo" }))!;
    expect(ideaDraftOnLeave(started.draft)).toBeNull();
    const typed = ideaDraftEdit(started.draft, { text: "Prvo i drugo" });
    expect(ideaDraftOnLeave(typed)).toEqual({ title: "Cenovnik", text: "Prvo i drugo" });
    expect(ideaDraftOnLeave(ideaDraftEdit(createIdeaDraft(server), { title: "" }))).toBeNull();
  });

  it("oznaka glasa za čitač ekrana", () => {
    expect(voteButtonLabel("up", 1)).toBe("Za: 1 glas");
    expect(voteButtonLabel("down", 3)).toBe("Protiv: 3 glasa");
    expect(voteButtonLabel("up", 12)).toBe("Za: 12 glasova");
    expect(voteButtonLabel("up", 0)).toBe("Za: 0 glasova");
  });
});
