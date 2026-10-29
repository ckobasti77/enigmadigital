// Preneto iz Devotion packages/shared/src/notes.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  ALL_NOTES,
  arrangeNotes,
  cleanNoteText,
  defaultSendTarget,
  filterNotes,
  formatNoteAge,
  NOTE_INDENT_MAX,
  NOTE_TEXT_MAX,
  NOTE_TITLE_MAX,
  noteBodyText,
  noteCreatedMessage,
  noteDerivedTitle,
  noteDisplayTitle,
  noteEditPatch,
  noteFilterKey,
  noteMatchesFilter,
  noteMetaLabel,
  notePreview,
  noteScopeArg,
  notesCountLabel,
  notesEmptyText,
  notesMapStartupId,
  resolveNoteFilter,
  sameNoteFilter,
  sentToStartupMessage,
  type NoteFilter,
  type NoteNode,
} from "./notes";

const BG = "Europe/Belgrade";
// 26. oktobar 2026, 15:00 po Beogradu.
const NOW = Date.UTC(2026, 9, 26, 14, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function note(
  id: string,
  options: Partial<NoteNode> = {},
): NoteNode {
  return {
    _id: id,
    workspaceId: null,
    title: id,
    text: `tekst ${id}`,
    parentThoughtId: null,
    updatedAt: NOW,
    ...options,
  };
}

describe("Beleške: filter", () => {
  test("argument servera: sve → bez polja, lično → null, startup → id", () => {
    expect(noteScopeArg(ALL_NOTES)).toEqual({});
    expect(noteScopeArg({ kind: "personal" })).toEqual({ workspaceId: null });
    expect(noteScopeArg({ kind: "startup", workspaceId: "s1" })).toEqual({ workspaceId: "s1" });
    // `{}` nema ključ `startupId` (Convex razlikuje odsutno od null).
    expect("workspaceId" in noteScopeArg(ALL_NOTES)).toBe(false);
  });

  test("Sve · Lično · startup razdvajaju lične od startup beleški", () => {
    const notes = [note("a"), note("b", { workspaceId: "s1" }), note("c", { workspaceId: "s2" })];
    expect(filterNotes(notes, ALL_NOTES).map((item) => item._id)).toEqual(["a", "b", "c"]);
    expect(filterNotes(notes, { kind: "personal" }).map((item) => item._id)).toEqual(["a"]);
    expect(filterNotes(notes, { kind: "startup", workspaceId: "s1" }).map((item) => item._id)).toEqual(["b"]);
    expect(noteMatchesFilter({ workspaceId: null }, { kind: "startup", workspaceId: "s1" })).toBe(false);
  });

  test("ključ i poređenje filtera", () => {
    expect(noteFilterKey({ kind: "startup", workspaceId: "s1" })).toBe("startup:s1");
    expect(sameNoteFilter({ kind: "personal" }, { kind: "personal" })).toBe(true);
    expect(sameNoteFilter({ kind: "startup", workspaceId: "s1" }, { kind: "startup", workspaceId: "s2" })).toBe(false);
  });

  test("napušten startup vraća prikaz na Sve, ostalo ostaje", () => {
    const gone: NoteFilter = { kind: "startup", workspaceId: "s9" };
    expect(resolveNoteFilter(gone, ["s1", "s2"])).toEqual({ kind: "all" });
    expect(resolveNoteFilter({ kind: "startup", workspaceId: "s1" }, ["s1"])).toEqual({
      kind: "startup",
      workspaceId: "s1",
    });
    expect(resolveNoteFilter({ kind: "personal" }, [])).toEqual({ kind: "personal" });
  });

  test("Mapa se nudi samo kad je izabran jedan startup", () => {
    expect(notesMapStartupId(ALL_NOTES)).toBeNull();
    expect(notesMapStartupId({ kind: "personal" })).toBeNull();
    expect(notesMapStartupId({ kind: "startup", workspaceId: "s1" })).toBe("s1");
  });
});

describe("Beleške: raspored i uvlačenje", () => {
  test("koreni ostaju redom sa servera, podbeleške odmah ispod roditelja", () => {
    const rows = arrangeNotes([
      note("novija"),
      note("dete", { parentThoughtId: "starija" }),
      note("starija"),
    ]);
    expect(rows.map((row) => [row.note._id, row.depth])).toEqual([
      ["novija", 0],
      ["starija", 0],
      ["dete", 1],
    ]);
  });

  test("uvlačenje staje na trećem nivou", () => {
    const rows = arrangeNotes([
      note("a"),
      note("b", { parentThoughtId: "a" }),
      note("c", { parentThoughtId: "b" }),
      note("d", { parentThoughtId: "c" }),
      note("e", { parentThoughtId: "d" }),
    ]);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 3, NOTE_INDENT_MAX]);
    expect(NOTE_INDENT_MAX).toBe(3);
  });

  test("roditelj koji nije učitan ili je u drugom opsegu: dete je koren", () => {
    const rows = arrangeNotes([note("dete", { parentThoughtId: "nema-ga" }), note("druga")]);
    expect(rows.map((row) => [row.note._id, row.depth])).toEqual([
      ["dete", 0],
      ["druga", 0],
    ]);
  });

  test("ciklus i beleška koja je sama sebi roditelj ne obaraju prikaz i ne gube beleške", () => {
    const cycle = arrangeNotes([
      note("a", { parentThoughtId: "b" }),
      note("b", { parentThoughtId: "a" }),
      note("c", { parentThoughtId: "c" }),
    ]);
    expect(cycle.map((row) => row.note._id).sort()).toEqual(["a", "b", "c"]);
    expect(cycle).toHaveLength(3);
  });

  test("prazna lista", () => {
    expect(arrangeNotes([])).toEqual([]);
  });
});

describe("Beleške: naslov, isečak i starost", () => {
  test("naslov: eksplicitan, pa prvi red teksta, pa rezerva", () => {
    expect(noteDisplayTitle({ title: " Plan ", text: "x" })).toBe("Plan");
    expect(noteDisplayTitle({ title: null, text: "\n  Prvi red\nDrugi" })).toBe("Prvi red");
    expect(noteDisplayTitle({ title: null, text: "   " })).toBe("Bez naslova");
    const long = noteDisplayTitle({ title: null, text: "a".repeat(200) });
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("…")).toBe(true);
  });

  test("isečak ne ponavlja prvi red kad nema naslova", () => {
    expect(notePreview({ title: null, text: "Prvi red\nDrugi red\nTreći" })).toBe("Drugi red Treći");
    expect(notePreview({ title: null, text: "Samo jedan red" })).toBeNull();
    expect(notePreview({ title: "Naslov", text: "Tekst\nu dva reda" })).toBe("Tekst u dva reda");
    // Server pravi naslov iz prvog reda teksta: isečak ga ne ponavlja.
    expect(notePreview({ title: "Prvi red", text: "Prvi red\nDrugi red" })).toBe("Drugi red");
    expect(notePreview({ title: "Samo jedan red", text: "Samo jedan red" })).toBeNull();
    expect(notePreview({ title: "Naslov", text: "   " })).toBeNull();
    expect(notePreview({ title: "N", text: "x".repeat(300) })?.length).toBeLessThanOrEqual(120);
  });

  test("starost: upravo, minuti, sati istog dana, juče, dani", () => {
    expect(formatNoteAge(NOW - 5_000, NOW, BG)).toBe("upravo");
    expect(formatNoteAge(NOW - 7 * 60_000, NOW, BG)).toBe("pre 7 min");
    expect(formatNoteAge(NOW - 2 * HOUR, NOW, BG)).toBe("pre 2 h");
    expect(formatNoteAge(NOW - DAY, NOW, BG)).toBe("juče");
    expect(formatNoteAge(NOW - 3 * DAY, NOW, BG)).toBe("pre 3 dana");
  });

  test("meta red: startup ili Lično, pa starost", () => {
    expect(noteMetaLabel({ workspace: { name: "Cluck Rush" }, updatedAt: NOW - 2 * HOUR }, NOW, BG)).toBe(
      "Cluck Rush · pre 2 h",
    );
    expect(noteMetaLabel({ workspace: null, updatedAt: NOW - 3 * DAY }, NOW, BG)).toBe("Lično · pre 3 dana");
  });
});

describe("Beleške: prazna stanja i poruke", () => {
  test("broj beležaka sa srpskom množinom i znakom da ima još", () => {
    expect(notesCountLabel(1)).toBe("1 beleška");
    expect(notesCountLabel(2)).toBe("2 beleške");
    expect(notesCountLabel(5)).toBe("5 beležaka");
    expect(notesCountLabel(11)).toBe("11 beležaka");
    expect(notesCountLabel(12)).toBe("12 beležaka");
    expect(notesCountLabel(21)).toBe("21 beleška");
    expect(notesCountLabel(24)).toBe("24 beleške");
    expect(notesCountLabel(50, true)).toBe("50+ beležaka");
  });

  test("tekst po filteru i pretrazi", () => {
    expect(notesEmptyText(ALL_NOTES, { searching: false }).title).toBe("Još nema beležaka.");
    expect(notesEmptyText(ALL_NOTES, { searching: false }).description).toBe("Zapiši prvu belešku gore.");
    expect(notesEmptyText({ kind: "personal" }, { searching: false }).title).toBe("Nema ličnih beležaka.");
    expect(notesEmptyText({ kind: "startup", workspaceId: "s1" }, { searching: false }).title).toBe(
      "Nema beležaka u ovom projektu.",
    );
    expect(notesEmptyText({ kind: "personal" }, { searching: true }).title).toBe(
      "Nema beležaka za ovu pretragu.",
    );
  });

  test("poruke posle pravljenja i slanja", () => {
    expect(noteCreatedMessage(null)).toBe("Beleška je sačuvana u Lično.");
    expect(noteCreatedMessage("Cluck Rush")).toBe("Beleška je sačuvana u Cluck Rush.");
    expect(sentToStartupMessage("Scan Me")).toBe("Poslato u Ideje projekta Scan Me.");
  });
});

describe("Beleške: unos i izmena", () => {
  test("tekst: prazan nema poruke, predug ima", () => {
    expect(cleanNoteText("   ")).toEqual({ ok: false, reason: null });
    expect(cleanNoteText("  zapis  ")).toEqual({ ok: true, text: "zapis" });
    const tooLong = cleanNoteText("x".repeat(NOTE_TEXT_MAX + 1));
    expect(tooLong.ok).toBe(false);
    expect(cleanNoteText("x".repeat(NOTE_TEXT_MAX)).ok).toBe(true);
  });

  test("izmena šalje samo promenjena polja", () => {
    const original = { title: "Plan", text: "Staro" };
    expect(noteEditPatch(original, { title: "Plan", text: "Staro" })).toEqual({ ok: true, patch: null });
    expect(noteEditPatch(original, { title: " Plan ", text: " Staro " })).toEqual({ ok: true, patch: null });
    expect(noteEditPatch(original, { title: "Novi", text: "Staro" })).toEqual({
      ok: true,
      patch: { title: "Novi" },
    });
    expect(noteEditPatch(original, { title: "Plan", text: "Novo" })).toEqual({
      ok: true,
      patch: { text: "Novo" },
    });
  });

  test("naslov izveden iz prvog reda prati tekst; zadat naslov ostaje", () => {
    // Server pravi naslov iz prvog reda: ispravka prvog reda menja i naslov.
    expect(
      noteEditPatch(
        { title: "Kupiti mleko", text: "Kupiti mleko\nI hleb" },
        { title: "Kupiti mleko", text: "Kupiti mleka\nI hleb" },
      ),
    ).toEqual({ ok: true, patch: { text: "Kupiti mleka\nI hleb", title: "Kupiti mleka" } });
    // Izmena samo drugog reda ne dira naslov.
    expect(
      noteEditPatch(
        { title: "Kupiti mleko", text: "Kupiti mleko\nI hleb" },
        { title: "Kupiti mleko", text: "Kupiti mleko\nI kafu" },
      ),
    ).toEqual({ ok: true, patch: { text: "Kupiti mleko\nI kafu" } });
    // Zadat naslov (različit od prvog reda) se ne izvodi iznova.
    expect(noteEditPatch({ title: "Plan", text: "Staro\nx" }, { title: "Plan", text: "Novo\nx" })).toEqual({
      ok: true,
      patch: { text: "Novo\nx" },
    });
    expect(noteDerivedTitle("\n  Prvi\nDrugi")).toBe("Prvi");
    expect(noteDerivedTitle("   ")).toBe("");
  });

  test("telo za prikaz ne ponavlja prvi red koji je naslov", () => {
    expect(noteBodyText({ title: "Kupiti mleko", text: "Kupiti mleko" })).toBe("");
    expect(noteBodyText({ title: "Kupiti mleko", text: "Kupiti mleko\n\nI hleb\nI kafu" })).toBe("I hleb\nI kafu");
    expect(noteBodyText({ title: "Plan", text: "Nešto drugo\nDrugi red" })).toBe("Nešto drugo\nDrugi red");
    expect(noteBodyText({ title: null, text: "Prvi red\nDrugi" })).toBe("Drugi");
  });

  test("prazan tekst ili naslov se odbija porukom, bez tihog vraćanja", () => {
    const original = { title: "Plan", text: "Staro" };
    expect(noteEditPatch(original, { title: "Plan", text: "  " })).toEqual({
      ok: false,
      reason: "Beleška ne može biti prazna.",
      field: "text",
    });
    expect(noteEditPatch(original, { title: " ", text: "Staro" })).toEqual({
      ok: false,
      reason: "Naslov ne može biti prazan.",
      field: "title",
    });
    // Stara beleška bez naslova može da ostane bez njega.
    expect(noteEditPatch({ title: null, text: "a" }, { title: "", text: "b" })).toEqual({
      ok: true,
      patch: { text: "b" },
    });
    expect(noteEditPatch(original, { title: "n".repeat(NOTE_TITLE_MAX + 1), text: "Staro" }).ok).toBe(false);
  });
});

describe("Beleške: Pošalji u projekat", () => {
  test("cilj: startup same beleške, inače prvi, inače nijedan", () => {
    expect(defaultSendTarget({ workspaceId: "s2" }, ["s1", "s2"])).toBe("s2");
    expect(defaultSendTarget({ workspaceId: null }, ["s1", "s2"])).toBe("s1");
    // Beleška iz startupa koji više nije u listi ne cilja taj startup.
    expect(defaultSendTarget({ workspaceId: "s9" }, ["s1"])).toBe("s1");
    expect(defaultSendTarget({ workspaceId: null }, [])).toBeNull();
  });
});
