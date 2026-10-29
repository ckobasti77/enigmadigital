import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import { DAY, HOUR, now, type Fixture, type R } from "./fixtures-util";
import { OBLASTI, PROFILI, fakeId, strana } from "./fixtures-prostor-osnova";

/**
 * Korpa projekta u razvojnom prikazu (SPAJANJE S21, paritet red 25):
 * `trash.list` po vrsti (Stranice · Ideje · Prilozi · Oporavljeno),
 * `trash.counts` i radnje `trash.restore` / `trash.dismissRecovered`.
 *
 * Sadržaj prati Devotion izlog (`trash.ts`, main @ c05c40f): stranica sa
 * podstranicama, stranica čiji je roditelj takođe u Korpi (vraća se na vrh
 * oblasti), prilog čija je stranica u Korpi (vraćanje onemogućeno) i stavka
 * bez prava vraćanja. Stanje živi u modulu: „Vrati“ i „Ukloni“ skidaju red i
 * smanjuju brojeve, kao posle odgovora servera.
 *
 * Adrese (projekat „Enigma IT“):
 *   /enigma-it/korpa?ux=1                   → Stranice
 *   /enigma-it/korpa?ux=1&vrsta=idea        → Ideje (i `file`, `recovered`)
 * `&prazno=1` daje praznu Korpu u sve četiri vrste.
 */

type Lista = R<typeof api.prostor.trash.list>["page"];
type Stavka = Lista[number];
type Kategorija = Extract<Stavka, { kind: "file" }>["category"];

const [JA, ANA, MARKO, MILICA] = PROFILI;
const [RAZVOJ, MARKETING, PRODAJA] = OBLASTI;

const osoba = (p: (typeof PROFILI)[number]) => ({ _id: p._id, displayName: p.displayName, avatarUrl: p.avatarUrl });
const pre = (ms: number) => now - ms;

const STRANICE: Extract<Stavka, { kind: "page" }>[] = [
  {
    kind: "page",
    pageId: fakeId("pages", 801),
    title: "Plan lansiranja Q4",
    pageKind: "note",
    areaId: MARKETING._id,
    areaLabel: MARKETING.label,
    parentPageId: null,
    parentTitle: null,
    parentAvailable: true,
    descendantCount: 3,
    archivedAt: pre(25 * 60_000),
    archivedBy: osoba(ANA),
    canRestore: true,
  },
  {
    kind: "page",
    pageId: fakeId("pages", 802),
    title: "Zadatak: ažuriraj cenovnik",
    pageKind: "task",
    areaId: PRODAJA._id,
    areaLabel: PRODAJA.label,
    parentPageId: fakeId("pages", 803),
    parentTitle: "Cenovnik 2026",
    parentAvailable: false,
    descendantCount: 0,
    archivedAt: pre(5 * HOUR),
    archivedBy: osoba(JA),
    canRestore: true,
  },
  {
    kind: "page",
    pageId: fakeId("pages", 804),
    title: "Beleške sa sastanka o arhitekturi",
    pageKind: "note",
    areaId: RAZVOJ._id,
    areaLabel: RAZVOJ.label,
    parentPageId: fakeId("pages", 805),
    parentTitle: "Arhitektura",
    parentAvailable: true,
    descendantCount: 1,
    archivedAt: pre(2 * DAY),
    archivedBy: osoba(MARKO),
    canRestore: true,
  },
  {
    kind: "page",
    pageId: fakeId("pages", 806),
    title: "Spisak klijenata (stari)",
    pageKind: "table",
    areaId: PRODAJA._id,
    areaLabel: PRODAJA.label,
    parentPageId: null,
    parentTitle: null,
    parentAvailable: true,
    descendantCount: 0,
    archivedAt: pre(9 * DAY),
    archivedBy: null,
    canRestore: false,
  },
  {
    kind: "page",
    pageId: fakeId("pages", 807),
    title: "Uputstvo za novog člana",
    pageKind: "note",
    areaId: RAZVOJ._id,
    areaLabel: RAZVOJ.label,
    parentPageId: null,
    parentTitle: null,
    parentAvailable: true,
    descendantCount: 12,
    archivedAt: pre(41 * DAY),
    archivedBy: osoba(MILICA),
    canRestore: true,
  },
];

const IDEJE: Extract<Stavka, { kind: "idea" }>[] = [
  { kind: "idea", ideaId: fakeId("ideaNodes", 801), title: "Mesečni bilten za klijente", archivedAt: pre(3 * HOUR), archivedBy: osoba(ANA), canRestore: true },
  { kind: "idea", ideaId: fakeId("ideaNodes", 802), title: "Radionica u Nišu", archivedAt: pre(4 * DAY), archivedBy: osoba(MARKO), canRestore: true },
  { kind: "idea", ideaId: fakeId("ideaNodes", 803), title: "Ugrađeni QR čitač u aplikaciji", archivedAt: pre(15 * DAY), archivedBy: null, canRestore: true },
];

function prilog(n: number, name: string, category: Kategorija, size: number, stranica: number, naslov: string, dostupna: boolean, ms: number, ko: (typeof PROFILI)[number] | null): Extract<Stavka, { kind: "file" }> {
  return {
    kind: "file",
    fileId: fakeId("pageFiles", n),
    name,
    category,
    size,
    pageId: fakeId("pages", stranica),
    pageTitle: naslov,
    pageAvailable: dostupna,
    archivedAt: pre(ms),
    archivedBy: ko ? osoba(ko) : null,
    canRestore: true,
  };
}

const PRILOZI: Extract<Stavka, { kind: "file" }>[] = [
  prilog(801, "ponuda-q4.pdf", "pdf", 482_000, 811, "Ponuda za klijenta", true, 50 * 60_000, JA),
  prilog(802, "baner-lansiranje.png", "image", 1_840_000, 812, "Plan lansiranja Q4", false, 2 * DAY, ANA),
  prilog(803, "snimak-sastanka.mp3", "audio", 9_600_000, 813, "Sastanak 12. okt", true, 20 * DAY, MARKO),
];

const OPORAVLJENO: Extract<Stavka, { kind: "recovered" }>[] = [
  {
    kind: "recovered",
    recoveredId: fakeId("recoveredContent", 801),
    title: "Ideja: partnerski program",
    sourceKind: "idea",
    createdAt: pre(DAY),
    owner: osoba(JA),
    contributions: [
      { _id: fakeId("contentContributions", 801), excerpt: "Provizija 10 % na prvu godinu, bez ugovora o minimumu.", author: osoba(ANA), createdAt: pre(3 * DAY) },
      { _id: fakeId("contentContributions", 802), excerpt: "Predlažem pilot sa dve agencije pre javnog lansiranja.", author: osoba(MARKO), createdAt: pre(2 * DAY) },
      { _id: fakeId("contentContributions", 803), excerpt: "Treba pravni tekst za partnere.", author: null, createdAt: pre(2 * DAY) },
      { _id: fakeId("contentContributions", 804), excerpt: "Dodatni komentar iz ranije verzije.", author: osoba(MILICA), createdAt: pre(DAY) },
    ],
    canDismiss: true,
  },
  {
    kind: "recovered",
    recoveredId: fakeId("recoveredContent", 802),
    title: "Stranica: Cenovnik 2025",
    sourceKind: "page",
    createdAt: pre(6 * DAY),
    owner: null,
    contributions: [
      { _id: fakeId("contentContributions", 805), excerpt: "Osnovni paket 49 €, napredni 99 €.", author: osoba(JA), createdAt: pre(8 * DAY) },
    ],
    canDismiss: false,
  },
];

// ── Stanje ───────────────────────────────────────────────────────────────────

type Vrsta = "page" | "idea" | "file" | "recovered";
const stanje: Record<Vrsta, Stavka[]> = {
  page: [...STRANICE],
  idea: [...IDEJE],
  file: [...PRILOZI],
  recovered: [...OPORAVLJENO],
};

function kljuc(s: Stavka): string {
  if (s.kind === "page") return s.pageId;
  if (s.kind === "idea") return s.ideaId;
  if (s.kind === "file") return s.fileId;
  return s.recoveredId;
}

const VRSTE: readonly string[] = ["page", "idea", "file", "recovered"];

const lista = (args: Record<string, unknown>) => {
  const vrsta = (VRSTE.includes(String(args.kind)) ? args.kind : "page") as Vrsta;
  return strana(stanje[vrsta]);
};

const brojevi = () => ({
  page: { count: stanje.page.length, capped: false },
  idea: { count: stanje.idea.length, capped: false },
  file: { count: stanje.file.length, capped: false },
  recovered: { count: stanje.recovered.length, capped: false },
});

function skini(id: unknown) {
  for (const vrsta of VRSTE as Vrsta[]) {
    stanje[vrsta] = stanje[vrsta].filter((s) => kljuc(s) !== id);
  }
}

export const FIXTURES_PROSTOR_KORPA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.trash.list)]: lista,
  [getFunctionName(api.prostor.trash.counts)]: brojevi,
  [getFunctionName(api.prostor.trash.restore)]: (args) => {
    const meta = args.target as { kind: "page" | "idea" | "file"; id: string };
    const red = stanje[meta.kind].find((s) => kljuc(s) === meta.id);
    skini(meta.id);
    return {
      kind: meta.kind,
      restoredCount: red?.kind === "page" ? 1 + red.descendantCount : 1,
      movedToAreaRoot: red?.kind === "page" && red.parentPageId !== null && !red.parentAvailable,
    };
  },
  [getFunctionName(api.prostor.trash.dismissRecovered)]: (args) => {
    skini(args.recoveredId);
    return null;
  },
};

/** Prazna Korpa (`&prazno=1`): nijedna vrsta nema stavki. */
export const PRAZNO_PROSTOR_KORPA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.trash.list)]: () => strana([]),
  [getFunctionName(api.prostor.trash.counts)]: () => ({
    page: { count: 0, capped: false },
    idea: { count: 0, capped: false },
    file: { count: 0, capped: false },
    recovered: { count: 0, capped: false },
  }),
};
