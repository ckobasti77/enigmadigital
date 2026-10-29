/**
 * Razvojni prikaz: zadaci tima (SPAJANJE S12, plan S07 §8.1–§8.2).
 *
 * Lista zadataka projekta (filteri Svi · Moji · osoba), izvršioci, koraci,
 * panel zadatka i zadatak na celu stranu. Sadržaj je po uzoru na Devotion
 * izlog (`startup-tasks.ts`, `task-page.ts`), sa lažnim ljudima iz
 * `fixtures-prostor-osnova.ts`. Zadaci su i stranice oblasti, pa ova fikstura
 * dopunjuje dokumente (`pages.get`, stablo, broj na vrhu, Zadaci oblasti) i
 * ostalo prepušta `fixtures-prostor-dokumenti.ts`.
 *
 * Adrese (hub, projekat „Enigma IT“):
 *   /enigma-it/zadaci?ux=1                         → svi zadaci
 *   /enigma-it/zadaci?ux=1&filter=moji             → moji zadaci
 *   /enigma-it/zadaci?ux=1&osoba=<profil>          → zadaci jednog člana
 *   /enigma-it/stranica/<ZADATAK_UX>?ux=1          → zadatak na celu stranu
 *   /enigma-it/dokumenti/<OBLAST_UX>?ux=1&tab=zadaci → Zadaci oblasti
 * `&prazno=1` daje projekat bez zadataka.
 *
 * Veze (S23): zadaci 211, 212 i 214 su vezani za firmu `FIRMA_UX` iz Leadova
 * („Test Salon 2“, profil iz `fixtures-oglasi.ts`), a 213 je nastao iz komentara na
 * Instagramu. Profil firme sa zadacima:
 *   /enigma-it/leadovi/<FIRMA_UX>?ux=1&tab=zadaci
 */
import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { type Fixture, type R, WS, now, DAY, HOUR } from "./fixtures-util";
import { fakeId, OBLASTI, PROFILI, strana } from "./fixtures-prostor-osnova";
import { FIXTURES_PROSTOR_DOKUMENTI } from "./fixtures-prostor-dokumenti";
import { LEAD_PROFIL_ID } from "./fixtures-oglasi";
import type { IzvorZadatka } from "@/lib/prostor/web/veze-zadatka";

type Sazetak = R<typeof api.prostor.tasks.listForStartup>["page"][number];
type Detalj = R<typeof api.prostor.pages.get>;
type Status = NonNullable<Sazetak["taskStatus"]>;
type Prioritet = NonNullable<Sazetak["taskPriority"]>;
type Profil = (typeof PROFILI)[number];
type Oblast = (typeof OBLASTI)[number];

const [JA, ANA, MARKO, MILICA, NIKOLA, STEFAN] = PROFILI;
const [RAZVOJ, MARKETING, PRODAJA, OSTALO] = OBLASTI;

/** Lokalno podne dana `dana` od danas (rok zadatka je podne dana). */
function podne(dana: number): number {
  const dan = new Date(now);
  dan.setHours(12, 0, 0, 0);
  return dan.getTime() + dana * DAY;
}

type Seme = {
  n: number;
  oblast: Oblast;
  naslov: string;
  status: Status;
  prioritet: Prioritet;
  rok: number | null;
  autor: Profil;
  izvrsioci: Profil[];
  koraci?: { ukupno: number; zavrseno: number };
  zakljucan?: boolean;
  instrukcije?: string;
  pre: number;
  /** Firma iz Leadova (S23). */
  firma?: Id<"leadCompanies">;
  /** Komentar ili stavka „Čeka te“ iz koje je zadatak nastao (S23). */
  izvor?: IzvorZadatka;
};

/**
 * Firma iz Leadova za veze (S23): ona čiji profil razvojni prikaz ima
 * (`LEAD_PROFIL_ID`, „Test Salon 2“), pa link sa zadatka vodi na pravi profil.
 */
export const FIRMA_UX = LEAD_PROFIL_ID as Id<"leadCompanies">;

/** Ime firme po obrascu `fixtures.ts` (`lc_ux_test_NNN` → „Test Salon N“). */
function imeFirme(id: string): string | null {
  const m = /^lc_ux_test_(\d{3})$/.exec(id);
  return m ? `Test Salon ${Number(m[1])}` : null;
}

const SEME: Seme[] = [
  {
    n: 200,
    oblast: RAZVOJ,
    naslov: "Poveži webhook naplate sa porudžbinama",
    status: "in_progress",
    prioritet: "high",
    rok: podne(0),
    autor: JA,
    izvrsioci: [JA, MARKO],
    koraci: { ukupno: 4, zavrseno: 2 },
    instrukcije:
      "Kad provajder pošalje webhook, porudžbina menja status. Potvrdi potpis zahteva pre upisa i zapiši svaki neuspeo pokušaj.",
    pre: 2 * HOUR,
  },
  { n: 201, oblast: RAZVOJ, naslov: "Popravi prijavu na staging serveru", status: "blocked", prioritet: "urgent", rok: podne(-2), autor: MARKO, izvrsioci: [MARKO], pre: DAY },
  { n: 202, oblast: MARKETING, naslov: "Plan objava za decembar", status: "next", prioritet: "medium", rok: podne(1), autor: MILICA, izvrsioci: [MILICA, JA], koraci: { ukupno: 3, zavrseno: 0 }, pre: 5 * HOUR },
  { n: 203, oblast: PRODAJA, naslov: "Pozovi pet firmi iz Novog Sada", status: "next", prioritet: "high", rok: podne(3), autor: JA, izvrsioci: [JA], pre: 3 * DAY },
  { n: 204, oblast: MARKETING, naslov: "Snimi kratak video za Instagram", status: "backlog", prioritet: "low", rok: null, autor: ANA, izvrsioci: [ANA], pre: 6 * DAY },
  { n: 205, oblast: RAZVOJ, naslov: "Pregledaj ugovor sa provajderom", status: "next", prioritet: "medium", rok: podne(6), autor: ANA, izvrsioci: [], pre: 2 * DAY },
  { n: 206, oblast: PRODAJA, naslov: "Pripremi ponudu za pekaru", status: "in_progress", prioritet: "urgent", rok: podne(1), autor: MILICA, izvrsioci: [MILICA], zakljucan: true, pre: 4 * HOUR },
  { n: 207, oblast: OSTALO, naslov: "Obnovi domen i SSL sertifikat", status: "backlog", prioritet: "medium", rok: podne(10), autor: JA, izvrsioci: [NIKOLA], pre: 9 * DAY },
  { n: 208, oblast: RAZVOJ, naslov: "Ubrzaj učitavanje panela", status: "done", prioritet: "medium", rok: podne(-1), autor: MARKO, izvrsioci: [MARKO], pre: 3 * HOUR },
  { n: 209, oblast: MARKETING, naslov: "Napiši tekst za landing stranu", status: "next", prioritet: "low", rok: null, autor: STEFAN, izvrsioci: [STEFAN, ANA], pre: 7 * DAY },
  { n: 210, oblast: RAZVOJ, naslov: "Dodaj izvoz izveštaja u CSV", status: "backlog", prioritet: "high", rok: podne(14), autor: JA, izvrsioci: [JA], koraci: { ukupno: 2, zavrseno: 1 }, pre: 12 * DAY },
  // Veze (S23): firma iz Leadova i komentar bez odgovora.
  {
    n: 211,
    oblast: PRODAJA,
    naslov: "Pošalji ponudu za sajt sa zakazivanjem",
    status: "next",
    prioritet: "high",
    rok: podne(2),
    autor: JA,
    izvrsioci: [JA],
    instrukcije: "Paket sa zakazivanjem termina i galerijom radova. Cena iz razgovora od utorka.",
    pre: 3 * HOUR,
    firma: FIRMA_UX,
  },
  { n: 212, oblast: PRODAJA, naslov: "Pripremi primer početne strane", status: "in_progress", prioritet: "medium", rok: podne(4), autor: ANA, izvrsioci: [ANA], pre: DAY, firma: FIRMA_UX },
  {
    n: 213,
    oblast: MARKETING,
    naslov: "Odgovori @ana_frizer: „Koliko košta šišanje i farbanje za dugu…“",
    status: "next",
    prioritet: "medium",
    rok: podne(0),
    autor: JA,
    izvrsioci: [JA],
    instrukcije:
      "Komentar na Instagramu, @ana_frizer:\n„Koliko košta šišanje i farbanje za dugu kosu? Da li radite subotom?“",
    pre: 2 * HOUR,
    izvor: { vrsta: "komentar_ig", naslov: "@ana_frizer", putanja: "/instagram/komentari" },
  },
  { n: 214, oblast: PRODAJA, naslov: "Prvi poziv vlasnici salona", status: "done", prioritet: "medium", rok: podne(-3), autor: JA, izvrsioci: [JA], pre: 3 * DAY, firma: FIRMA_UX },
];

/** Zadatak na celu stranu i u panelu: `/enigma-it/stranica/<ZADATAK_UX>?ux=1`. */
export const ZADATAK_UX = fakeId("pages", 200);

const id = (n: number) => fakeId("pages", n);

function sazetak(seme: Seme, pozicija: number): Sazetak {
  const izmena = now - seme.pre;
  const nastao = izmena - 5 * DAY;
  return {
    _id: id(seme.n),
    _creationTime: nastao,
    workspaceId: WS,
    areaId: seme.oblast._id,
    parentPageId: null,
    kind: "task",
    title: seme.naslov,
    searchText: seme.naslov.toLowerCase(),
    revision: 3,
    position: 100 + pozicija,
    taskStatus: seme.status,
    taskPriority: seme.prioritet,
    assigneeProfileId: seme.izvrsioci[0]?._id ?? null,
    dueDate: seme.rok,
    // Sažetak stranice (`pageSummaryValidator`): opciona polja zadatka se šalju i prazna.
    instructions: seme.instrukcije,
    checkpoints: undefined,
    checkpointTotal: seme.koraci?.ukupno,
    checkpointCompleted: seme.koraci?.zavrseno,
    checkpointRevision: undefined,
    taskSortAt: nastao,
    completedAt: seme.status === "done" ? izmena : null,
    createdByProfileId: seme.autor._id,
    updatedByProfileId: seme.autor._id,
    lockedAt: seme.zakljucan ? izmena : null,
    ...(seme.firma ? { leadCompanyId: seme.firma } : {}),
    archivedAt: null,
    createdAt: nastao,
    updatedAt: izmena,
  };
}

const ZADACI: Sazetak[] = SEME.map(sazetak);
const SEME_PO_ID = new Map(SEME.map((s) => [id(s.n) as string, s]));

const kratko = (p: Profil) => ({ _id: p._id, displayName: p.displayName, avatarUrl: p.avatarUrl });

function izvrsilac(p: Profil, seme: Seme): R<typeof api.prostor.taskAssignees.listForTask>[number] {
  return {
    profileId: p._id,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    addedByProfileId: seme.autor._id,
    createdAt: now - seme.pre,
    canRemove: !seme.zakljucan || seme.autor._id === JA._id,
  };
}

function detalj(pageId: string): Detalj | undefined {
  const seme = SEME_PO_ID.get(pageId);
  const red = ZADACI.find((z) => z._id === pageId);
  if (!seme || !red) return undefined;
  const zakljucan = seme.zakljucan === true;
  const autor = seme.autor._id === JA._id;
  const { lockedAt, ...osnova } = red;
  return {
    ...osnova,
    lockedAt: lockedAt ?? null,
    lockedByProfileId: zakljucan ? seme.autor._id : null,
    ...(seme.izvor ? { izvor: seme.izvor } : {}),
    content: "",
    creator: seme.autor,
    updater: seme.autor,
    assignee: seme.izvrsioci[0] ?? null,
    assignees: seme.izvrsioci.map(kratko),
    lockedBy: zakljucan ? kratko(seme.autor) : null,
    permissions: {
      canEdit: !zakljucan || autor,
      canEditBody: !zakljucan || autor,
      canMove: !zakljucan || autor,
      canResize: true,
      canDetach: false,
      canDeleteDirectly: true,
      canRequestDeletion: false,
      canArchive: !zakljucan || autor,
      canChangeStatus: true,
      canLock: !zakljucan,
      canUnlock: zakljucan && autor,
      canComment: true,
      canRestoreRevision: !zakljucan || autor,
      isLocked: zakljucan,
    },
  } satisfies Detalj;
}

const KORACI_200 = [
  "Prihvati webhook i proveri potpis",
  "Upiši novi status porudžbine",
  "Zapiši neuspele pokušaje",
  "Testiraj sa sandbox nalogom",
];

function koraci(taskPageId: unknown): R<typeof api.prostor.taskCheckpoints.listForTask> {
  const seme = SEME_PO_ID.get(String(taskPageId));
  if (!seme?.koraci) return [];
  const tekstovi =
    seme.n === 200
      ? KORACI_200
      : Array.from({ length: seme.koraci.ukupno }, (_, i) => `Korak ${i + 1}`);
  return tekstovi.map((tekst, i) => ({
    _id: fakeId("taskCheckpoints", seme.n * 10 + i),
    _creationTime: now - seme.pre,
    taskPageId: id(seme.n),
    legacyId: `korak-${seme.n}-${i + 1}`,
    text: tekst,
    completed: i < (seme.koraci?.zavrseno ?? 0),
    position: i,
    ordinal: i + 1,
    chainedToPrevious: false,
    locked: false,
    blockedByOrdinal: null,
    createdAt: now - seme.pre,
    updatedAt: now - seme.pre,
    placement: null,
    canEdit: true,
    canToggle: true,
    canMove: true,
    canDeleteDirectly: true,
    canRequestDeletion: false,
  }));
}

/** Zadatak dokumenta oblasti (`fixtures-prostor-dokumenti.ts`, stranica 106) kao sažetak. */
function zadaciDokumenata(): Sazetak[] {
  const d = osnovni(api.prostor.pages.get, { pageId: fakeId("pages", 106) }) as Detalj | undefined;
  if (!d) return [];
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { content, creator, updater, assignee, assignees, lockedBy, permissions, lockedByProfileId, ...red } = d;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return [
    {
      ...red,
      instructions: red.instructions,
      checkpoints: red.checkpoints,
      checkpointTotal: red.checkpointTotal,
      checkpointCompleted: red.checkpointCompleted,
      checkpointRevision: red.checkpointRevision,
      completedAt: red.completedAt ?? null,
      lockedAt: red.lockedAt ?? null,
    },
  ];
}

/** Fikstura iz dokumenata za istu funkciju (dopuna, ne zamena). */
function osnovni(funkcija: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>): unknown {
  return FIXTURES_PROSTOR_DOKUMENTI[getFunctionName(funkcija)]?.(args);
}

function sviZadaci(): Sazetak[] {
  return [...ZADACI, ...zadaciDokumenata()];
}

function zaListu(args: Record<string, unknown>): Sazetak[] {
  return sviZadaci().filter((z) => {
    if (typeof args.status === "string" && z.taskStatus !== args.status) return false;
    if (typeof args.assigneeProfileId === "string") {
      const seme = SEME_PO_ID.get(z._id);
      const ljudi: Array<string | null> = seme ? seme.izvrsioci.map((p) => p._id) : [z.assigneeProfileId];
      if (!ljudi.includes(args.assigneeProfileId)) return false;
    }
    return true;
  });
}

function izvrsiociZadatka(pageId: string): R<typeof api.prostor.taskAssignees.listForTask> {
  const seme = SEME_PO_ID.get(pageId);
  if (seme) return seme.izvrsioci.map((p) => izvrsilac(p, seme));
  const z = zadaciDokumenata().find((t) => t._id === pageId);
  const p = z ? PROFILI.find((x) => x._id === z.assigneeProfileId) : undefined;
  return p && z
    ? [{ profileId: p._id, displayName: p.displayName, avatarUrl: p.avatarUrl, addedByProfileId: z.createdByProfileId, createdAt: z.createdAt, canRemove: true }]
    : [];
}

type StavkaStabla = R<typeof api.prostor.pages.listChildren>["page"][number];

/** Stablo i broj na vrhu oblasti: zadaci su stranice oblasti na vrhu. */
function decaSaZadacima(args: Record<string, unknown>) {
  const baza = osnovni(api.prostor.pages.listChildren, args) as { page: StavkaStabla[] } | undefined;
  const page = baza?.page ?? [];
  if ((args.parentPageId ?? null) !== null || (args.kind !== undefined && args.kind !== "task")) {
    return strana(page);
  }
  const dodatak = ZADACI.filter((z) => z.areaId === args.areaId) as unknown as StavkaStabla[];
  return strana([...page, ...dodatak]);
}

function brojeviSaZadacima(): R<typeof api.prostor.pages.areaTopLevelCounts> {
  const baza = (osnovni(api.prostor.pages.areaTopLevelCounts, {}) ?? []) as R<
    typeof api.prostor.pages.areaTopLevelCounts
  >;
  return baza.map((red) => ({
    ...red,
    count: red.count + ZADACI.filter((z) => z.areaId === red.areaId).length,
  }));
}

const NOV_KORAK = fakeId("taskCheckpoints", 9999);

/** Zadaci firme kao `veze.zadaciFirme`: otvoreni po roku, pa završeni. */
function zadaciFirme(leadCompanyId: unknown): R<typeof api.prostor.veze.zadaciFirme> {
  const redovi = ZADACI.filter((z) => z.leadCompanyId === leadCompanyId).sort((a, b) => {
    const aGotov = a.taskStatus === "done";
    const bGotov = b.taskStatus === "done";
    if (aGotov !== bGotov) return aGotov ? 1 : -1;
    return (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity);
  });
  return { zadaci: redovi, odseceno: false };
}

export const FIXTURES_PROSTOR_ZADACI: Record<string, Fixture> = {
  [getFunctionName(api.prostor.tasks.listForStartup)]: (a) => strana(zaListu(a)),
  [getFunctionName(api.prostor.tasks.listForArea)]: (a) =>
    strana(zaListu(a).filter((z) => z.areaId === a.areaId)),
  [getFunctionName(api.prostor.taskAssignees.listForTasks)]: (a) =>
    (Array.isArray(a.taskPageIds) ? (a.taskPageIds as string[]) : []).map((pageId) => ({
      taskPageId: pageId as Id<"pages">,
      assignees: izvrsiociZadatka(pageId),
    })) satisfies R<typeof api.prostor.taskAssignees.listForTasks>,
  [getFunctionName(api.prostor.taskAssignees.listForTask)]: (a) => izvrsiociZadatka(String(a.taskPageId)),
  [getFunctionName(api.prostor.taskCheckpoints.listForTask)]: (a) => koraci(a.taskPageId),
  // Zadaci su i stranice: detalj, putanja, razrešenje rute, stablo i broj na vrhu.
  [getFunctionName(api.prostor.pages.get)]: (a) => detalj(String(a.pageId)) ?? osnovni(api.prostor.pages.get, a),
  [getFunctionName(api.prostor.pages.getBreadcrumbs)]: (a) => {
    const z = ZADACI.find((t) => t._id === a.pageId);
    return z
      ? ([{ _id: z._id, title: z.title, kind: "task" }] satisfies R<typeof api.prostor.pages.getBreadcrumbs>)
      : osnovni(api.prostor.pages.getBreadcrumbs, a);
  },
  [getFunctionName(api.prostor.areasV2.resolveRoute)]: (a) =>
    a.pageId && SEME_PO_ID.has(String(a.pageId))
      ? { kind: "page", pageId: a.pageId }
      : osnovni(api.prostor.areasV2.resolveRoute, a),
  [getFunctionName(api.prostor.pages.listChildren)]: (a) => decaSaZadacima(a),
  [getFunctionName(api.prostor.pages.areaTopLevelCounts)]: () => brojeviSaZadacima(),
  // Mutacije koje vraćaju vrednost (ostale vraćaju `undefined`, kao i do sada).
  [getFunctionName(api.prostor.tasks.updateMetadata)]: (a) => a.pageId,
  [getFunctionName(api.prostor.taskAssignees.join)]: () => null,
  [getFunctionName(api.prostor.taskAssignees.leave)]: () => null,
  [getFunctionName(api.prostor.taskAssignees.setAssignees)]: () => [],
  [getFunctionName(api.prostor.taskCheckpoints.create)]: () => NOV_KORAK,
  [getFunctionName(api.prostor.taskCheckpoints.updateText)]: (a) => a.checkpointId,
  [getFunctionName(api.prostor.taskCheckpoints.setCompleted)]: (a) => a.checkpointId,
  [getFunctionName(api.prostor.myDay.plan)]: () => ({ entryId: fakeId("myDayEntries", 99), created: true }),
  // Veze (S23): zadaci firme, ime firme za čip i nov zadatak sa vezom.
  [getFunctionName(api.prostor.veze.zadaciFirme)]: (a) => zadaciFirme(a.leadCompanyId),
  [getFunctionName(api.prostor.veze.firma)]: (a) => {
    const ime = imeFirme(String(a.leadCompanyId));
    return ime ? { _id: a.leadCompanyId as Id<"leadCompanies">, name: ime } : null;
  },
  [getFunctionName(api.prostor.veze.noviZadatak)]: () => fakeId("pages", 299),
  // „Sredi rokove": svaki izabran zadatak je „sređen" (lažni Convex ne menja listu).
  [getFunctionName(api.prostor.tasks.bulkReschedule)]: (a) => ({
    updated: (Array.isArray(a.taskPageIds) ? (a.taskPageIds as Id<"pages">[]) : []).map((taskPageId) => {
      const z = ZADACI.find((t) => t._id === taskPageId);
      return {
        taskPageId,
        previous: { dueDate: z?.dueDate ?? null, taskStatus: z?.taskStatus ?? "next" },
        revision: 4,
      };
    }),
    skipped: [],
    unchanged: 0,
  }),
};

/** `&prazno=1`: projekat bez zadataka (Zadaci i Zadaci oblasti pokazuju prazno stanje). */
export const PRAZNO_PROSTOR_ZADACI: Record<string, Fixture> = {
  [getFunctionName(api.prostor.tasks.listForStartup)]: () => strana([]),
  [getFunctionName(api.prostor.tasks.listForArea)]: () => strana([]),
  [getFunctionName(api.prostor.taskAssignees.listForTasks)]: () => [],
  [getFunctionName(api.prostor.veze.zadaciFirme)]: () => ({ zadaci: [], odseceno: false }),
};
