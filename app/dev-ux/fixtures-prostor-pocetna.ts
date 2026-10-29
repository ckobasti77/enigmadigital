/**
 * Razvojni prikaz: početna projekta, Puls tima i Aktivnost (SPAJANJE S20, plan S18 §4.2).
 *
 * Po uzoru na Devotion izlog (`command-center.ts`): Trijaža je zadaci tima iz
 * fiksture zadataka (S12) + nekoliko svojih (tri zastarela, prekoračeni za
 * „Za tebe"), Ideje za glasanje su tri ideje „Enigma IT“, Puls nedelje je
 * 14 / 9 / 3, a aktivnost ima 40 unosa (8 na početnoj, 30 + „Učitaj još" na
 * `/aktivnost`).
 *
 * Adrese (hub, projekat „Enigma IT“):
 *   /enigma-it?ux=1                        → početna (owner)
 *   /enigma-it?ux=1&uloga=client_viewer    → početna posmatrača (E9)
 *   /enigma-it?ux=1&stanje=pretrpan        → 30 prekoračenih, „Prikaži još", `hasMore`
 *   /enigma-it/puls?ux=1                   → Puls tima
 *   /enigma-it/aktivnost?ux=1              → Aktivnost
 *   /?ux=1&rezim=panel                     → početna u panelu (napredak ostaje, E10)
 * `&prazno=1` daje prazan projekat (nijedan zadatak, puls nula, bez aktivnosti).
 *
 * Kvačica, rok i prioritet (`tasks.updateMetadata`) se pamte ovde i prosleđuju
 * fiksturama Danas/„Ja“, pa Za tebe i Trijaža pokazuju istu promenu. Glas
 * skida ideju sa spiska.
 */
import { getFunctionName, type FunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { type Fixture, type R, WS, now, DAY, lcg } from "./fixtures-util";
import { fakeId, OBLASTI, PROFILI, PROFIL_JA, strana } from "./fixtures-prostor-osnova";
import { FIXTURES_PROSTOR_ZADACI } from "./fixtures-prostor-zadaci";
import { FIXTURES_PROSTOR_IDEJE } from "./fixtures-prostor-ideje";
import { FIXTURES_PROSTOR_DANAS } from "./fixtures-prostor-danas";
import { FIXTURES_PROSTOR_JA } from "./fixtures-prostor-ja";

type Sazetak = R<typeof api.prostor.tasks.commandCenter>["tasks"][number];
type Detalj = NonNullable<R<typeof api.prostor.pages.get>>;
type Stavka = R<typeof api.prostor.tasks.listEverywhere>["items"][number];
type Pending = R<typeof api.prostor.inbox.pending>;
type Puls = R<typeof api.prostor.puls.getWeekly>;
type Aktivnost = R<typeof api.prostor.activity.listPaginated>["page"][number];
type Status = NonNullable<Sazetak["taskStatus"]>;
type Prioritet = NonNullable<Sazetak["taskPriority"]>;
type Profil = (typeof PROFILI)[number];

const [JA, ANA, MARKO, MILICA, NIKOLA, STEFAN] = PROFILI;
const [RAZVOJ, MARKETING, PRODAJA, OSTALO] = OBLASTI;

/**
 * Upiti radnog dela početne (plan S18 E17). Posmatrač ih nikad ne sme pozvati
 * sa projektom: `UxHarness` za `&uloga=client_viewer` baca istu grešku kao
 * backend, pa bi svaki takav poziv bio vidljiv u konzoli i na snimku.
 */
export const RADNI_UPITI_POCETNE: ReadonlySet<string> = new Set([
  getFunctionName(api.prostor.tasks.commandCenter),
  getFunctionName(api.prostor.tasks.listEverywhere),
  getFunctionName(api.prostor.projekat.listMembers),
  getFunctionName(api.prostor.taskAssignees.listForTasks),
  getFunctionName(api.prostor.inbox.pending),
  getFunctionName(api.prostor.puls.getWeekly),
  getFunctionName(api.prostor.activity.listPaginated),
]);

export const STANJA_POCETNE = ["obican", "pretrpan"] as const;
type StanjePocetne = (typeof STANJA_POCETNE)[number];
let stanjeUx: StanjePocetne = "obican";

/** Harness postavlja stanje iz `&stanje=` (grana projekta) pre prvog upita. */
export function postaviStanjePocetne(stanje: string | undefined): void {
  stanjeUx = (STANJA_POCETNE as readonly string[]).includes(stanje ?? "") ? (stanje as StanjePocetne) : "obican";
}

const poziv = (izvor: Record<string, Fixture>, funkcija: FunctionReference<"query" | "mutation">, args: Record<string, unknown>) =>
  izvor[getFunctionName(funkcija)]?.(args);

/** Lokalno podne dana `dana` od danas (rok zadatka je podne dana). */
function podne(dana: number): number {
  const dan = new Date(now);
  dan.setHours(12, 0, 0, 0);
  return dan.getTime() + dana * DAY;
}

// ── Sopstveni zadaci (uz zadatke tima iz S12) ─────────────────────────────────

type Seme = {
  n: number;
  oblast: (typeof OBLASTI)[number];
  naslov: string;
  status: Status;
  prioritet: Prioritet;
  rok: number | null;
  autor: Profil;
  izvrsioci: Profil[];
  pre: number;
};

const SEME: Seme[] = [
  // Zastarelo (rok stariji od 14 dana).
  { n: 400, oblast: PRODAJA, naslov: "Ugovor sa dobavljačem štampe", status: "next", prioritet: "high", rok: podne(-16), autor: JA, izvrsioci: [JA], pre: 20 * DAY },
  { n: 401, oblast: MARKETING, naslov: "Fotografije za portfolio sajta", status: "backlog", prioritet: "medium", rok: podne(-21), autor: ANA, izvrsioci: [ANA], pre: 25 * DAY },
  { n: 402, oblast: OSTALO, naslov: "Arhiviraj stare ponude iz 2025.", status: "next", prioritet: "low", rok: podne(-30), autor: MARKO, izvrsioci: [], pre: 35 * DAY },
  // Za tebe: prekoračeno, danas, u toku.
  { n: 403, oblast: PRODAJA, naslov: "Odgovori na upit pekare „Zrno“", status: "next", prioritet: "urgent", rok: podne(-1), autor: MILICA, izvrsioci: [JA], pre: 3 * DAY },
  { n: 404, oblast: PRODAJA, naslov: "Pošalji ponudu salonu „Lotos“", status: "next", prioritet: "high", rok: podne(0), autor: JA, izvrsioci: [JA, MILICA], pre: 2 * DAY },
  { n: 405, oblast: MARKETING, naslov: "Mesečni izveštaj kanala za oktobar", status: "in_progress", prioritet: "medium", rok: null, autor: JA, izvrsioci: [JA], pre: 4 * DAY },
  { n: 406, oblast: RAZVOJ, naslov: "Ažuriraj cenovnik na sajtu", status: "in_progress", prioritet: "medium", rok: podne(2), autor: NIKOLA, izvrsioci: [JA, NIKOLA], pre: 5 * DAY },
  // Tim: ostali u Danas i Ovoj nedelji.
  { n: 407, oblast: MARKETING, naslov: "Objava za Instagram: radionica", status: "next", prioritet: "medium", rok: podne(0), autor: STEFAN, izvrsioci: [STEFAN], pre: DAY },
  { n: 408, oblast: RAZVOJ, naslov: "Proveri brzinu učitavanja početne", status: "blocked", prioritet: "high", rok: podne(4), autor: MARKO, izvrsioci: [MARKO], pre: 6 * DAY },
];

/** `&stanje=pretrpan`: 30 prekoračenih zadataka tima (Gori), dugi naslovi. */
const SEME_PRETRPAN: Seme[] = Array.from({ length: 30 }, (_, i) => {
  const ljudi = [ANA, MARKO, MILICA, NIKOLA, STEFAN, JA];
  return {
    n: 500 + i,
    oblast: OBLASTI[i % OBLASTI.length],
    naslov: `Prekoračen zadatak tima broj ${i + 1} sa dužim naslovom da se vidi kako se red seče`,
    status: (i % 3 === 0 ? "in_progress" : "next") as Status,
    prioritet: (["urgent", "high", "medium", "low"] as const)[i % 4],
    rok: podne(-1 - (i % 10)),
    autor: ljudi[(i + 1) % ljudi.length],
    izvrsioci: i % 7 === 0 ? [] : [ljudi[i % ljudi.length]],
    pre: (i + 2) * DAY,
  };
});

function seme(): Seme[] {
  return stanjeUx === "pretrpan" ? [...SEME, ...SEME_PRETRPAN] : SEME;
}

const id = (n: number) => fakeId("pages", n);

function sazetak(s: Seme, pozicija: number): Sazetak {
  const izmena = now - s.pre;
  const nastao = izmena - 5 * DAY;
  return {
    _id: id(s.n),
    _creationTime: nastao,
    workspaceId: WS,
    areaId: s.oblast._id,
    parentPageId: null,
    kind: "task",
    title: s.naslov,
    searchText: s.naslov.toLowerCase(),
    revision: 2,
    position: 400 + pozicija,
    taskStatus: s.status,
    taskPriority: s.prioritet,
    assigneeProfileId: s.izvrsioci[0]?._id ?? null,
    dueDate: s.rok,
    instructions: undefined,
    checkpoints: undefined,
    checkpointTotal: undefined,
    checkpointCompleted: undefined,
    checkpointRevision: undefined,
    taskSortAt: nastao,
    completedAt: null,
    createdByProfileId: s.autor._id,
    updatedByProfileId: s.autor._id,
    lockedAt: null,
    archivedAt: null,
    createdAt: nastao,
    updatedAt: izmena,
  };
}

function semePoId(): Map<string, Seme> {
  return new Map(seme().map((s) => [id(s.n) as string, s]));
}

// ── Stanje izmena (kvačica, rok, prioritet) ──────────────────────────────────

const izmene = new Map<string, { taskStatus?: Status; dueDate?: number | null; taskPriority?: Prioritet | null }>();

function izmeniZadatak(a: Record<string, unknown>): unknown {
  const kljuc = String(a.pageId);
  const izmena = { ...izmene.get(kljuc) };
  if (typeof a.status === "string") izmena.taskStatus = a.status as Status;
  if (a.dueDate !== undefined) izmena.dueDate = a.dueDate as number | null;
  if (a.priority !== undefined) izmena.taskPriority = a.priority as Prioritet | null;
  izmene.set(kljuc, izmena);
  // Danas i „Ja“ vode svoje stanje (Moji zadaci, Moj dan) za iste zadatke.
  return poziv(FIXTURES_PROSTOR_DANAS, api.prostor.tasks.updateMetadata, a) ?? a.pageId;
}

function primeni<T extends { _id: string; taskStatus?: Status | null; dueDate?: number | null; taskPriority?: Prioritet | null; completedAt?: number | null }>(z: T): T {
  const i = izmene.get(z._id);
  if (!i) return z;
  return {
    ...z,
    ...(i.taskStatus === undefined ? {} : { taskStatus: i.taskStatus, completedAt: i.taskStatus === "done" ? Date.now() : null }),
    ...(i.dueDate === undefined ? {} : { dueDate: i.dueDate }),
    ...(i.taskPriority === undefined ? {} : { taskPriority: i.taskPriority }),
  };
}

// ── Trijaža (`tasks.commandCenter`) ──────────────────────────────────────────

function zadaciTima(): Sazetak[] {
  const s12 = (poziv(FIXTURES_PROSTOR_ZADACI, api.prostor.tasks.listForStartup, { workspaceId: WS }) as
    | { page: Sazetak[] }
    | undefined)?.page ?? [];
  return [...s12, ...seme().map(sazetak)].map(primeni).filter((z) => z.taskStatus !== "done");
}

function komandniCentar(): R<typeof api.prostor.tasks.commandCenter> {
  return { tasks: zadaciTima(), hasMore: stanjeUx === "pretrpan" };
}

function izvrsiociZadataka(a: Record<string, unknown>): R<typeof api.prostor.taskAssignees.listForTasks> {
  const ids = Array.isArray(a.taskPageIds) ? (a.taskPageIds as Id<"pages">[]) : [];
  const moji = semePoId();
  const tudji = ids.filter((pageId) => !moji.has(pageId));
  const izS12 = new Map(
    ((poziv(FIXTURES_PROSTOR_ZADACI, api.prostor.taskAssignees.listForTasks, { ...a, taskPageIds: tudji }) ?? []) as R<
      typeof api.prostor.taskAssignees.listForTasks
    >).map((red) => [red.taskPageId as string, red]),
  );
  return ids.map((pageId) => {
    const s = moji.get(pageId);
    if (!s) return izS12.get(pageId) ?? { taskPageId: pageId, assignees: [] };
    return { taskPageId: pageId, assignees: s.izvrsioci.map((p) => izvrsilac(p, s)) };
  });
}

function izvrsilac(p: Profil, s: Seme): R<typeof api.prostor.taskAssignees.listForTask>[number] {
  return {
    profileId: p._id,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    addedByProfileId: s.autor._id,
    createdAt: now - s.pre,
    canRemove: true,
  };
}

/** Panel zadatka za sopstvene zadatke (ostale daje fikstura S12). */
function detalj(a: Record<string, unknown>): unknown {
  const s = semePoId().get(String(a.pageId));
  if (!s) return poziv(FIXTURES_PROSTOR_ZADACI, api.prostor.pages.get, a);
  const red = primeni(sazetak(s, 0));
  const kratko = (p: Profil) => ({ _id: p._id, displayName: p.displayName, avatarUrl: p.avatarUrl });
  return {
    ...red,
    lockedByProfileId: null,
    content: "",
    creator: s.autor,
    updater: s.autor,
    assignee: s.izvrsioci[0] ?? null,
    assignees: s.izvrsioci.map(kratko),
    lockedBy: null,
    permissions: {
      canEdit: true,
      canEditBody: true,
      canMove: true,
      canResize: true,
      canDetach: false,
      canDeleteDirectly: true,
      canRequestDeletion: false,
      canArchive: true,
      canChangeStatus: true,
      canLock: true,
      canUnlock: false,
      canComment: true,
      canRestoreRevision: true,
      isLocked: false,
    },
  } satisfies Detalj;
}

// ── Za tebe (`tasks.listEverywhere` sa projektom) ────────────────────────────

function stavka(s: Seme): Stavka {
  const red = sazetak(s, 0);
  return {
    _id: red._id,
    title: red.title,
    taskStatus: s.status,
    taskPriority: s.prioritet,
    dueDate: s.rok,
    taskSortAt: red.taskSortAt,
    completedAt: null,
    checkpointTotal: 0,
    checkpointCompleted: 0,
    createdByProfileId: s.autor._id,
    isCreator: s.autor._id === PROFIL_JA._id,
    isAssignee: true,
    isLocked: false,
    lockedForViewer: false,
    createdAt: red.createdAt,
    updatedAt: red.updatedAt,
    workspace: { _id: WS, name: "Enigma IT", logoUrl: null },
    area: { _id: s.oblast._id, key: s.oblast.key, label: s.oblast.label },
  };
}

function mojiZadaci(a: Record<string, unknown>): unknown {
  const osnova = poziv(FIXTURES_PROSTOR_JA, api.prostor.tasks.listEverywhere, a) as
    | R<typeof api.prostor.tasks.listEverywhere>
    | undefined;
  if (a.workspaceId === undefined || !osnova) return osnova;
  const opseg = a.scope === "done" || a.scope === "all" ? a.scope : "open";
  const sopstveni = seme()
    .filter((s) => s.izvrsioci.some((p) => p._id === PROFIL_JA._id))
    .map(stavka);
  const items = [...osnova.items.filter((z) => z.workspace._id === a.workspaceId), ...(a.workspaceId === WS ? sopstveni : [])]
    .map(primeni)
    .filter((z) => (opseg === "all" ? true : opseg === "done" ? z.taskStatus === "done" : z.taskStatus !== "done"));
  return { ...osnova, items };
}

// ── Ideje za glasanje (`inbox.pending` sa projektom) ─────────────────────────

const glasano = new Set<string>();

const IDEJA_7: Pending["items"][number] = {
  kind: "idea_vote",
  ideaId: fakeId("ideaNodes", 7),
  title: "Radionica „Prvi sajt“ u Novom Sadu",
  authorName: MILICA.displayName,
  upvotes: 1,
  downvotes: 2,
  workspace: { _id: WS, name: "Enigma IT", logoUrl: null },
  createdAt: now - 2 * DAY,
  targetType: "ideas",
  targetId: fakeId("ideaNodes", 7),
};

function cekaGlas(a: Record<string, unknown>): unknown {
  const osnova = poziv(FIXTURES_PROSTOR_DANAS, api.prostor.inbox.pending, a) as Pending | undefined;
  if (!osnova) return osnova;
  const dopuna = a.workspaceId === WS && (a.include as string[] | undefined)?.includes("idea_vote") ? [IDEJA_7] : [];
  const items = [...osnova.items, ...dopuna].filter(
    (s) =>
      (a.workspaceId === undefined || s.workspace._id === a.workspaceId) &&
      !(s.kind === "idea_vote" && glasano.has(s.ideaId)),
  );
  return { ...osnova, items };
}

function glasaj(a: Record<string, unknown>): unknown {
  glasano.add(String(a.ideaId));
  return poziv(FIXTURES_PROSTOR_IDEJE, api.prostor.ideas.vote, a) ?? null;
}

// ── Puls tima (`puls.getWeekly`) ─────────────────────────────────────────────

const NEDELJA = 7 * DAY;

function pulsNedelje(a: Record<string, unknown>, prazno: boolean): Puls {
  const weekStart = Number(a.weekStart);
  const weekEnd = Number(a.weekEnd);
  const sada = Number(a.now) || now;
  // Nedelja pre tekuće ima drugačije brojeve (poređenje i strelice trenda).
  const unazad = Math.max(0, Math.round((sada - weekStart) / NEDELJA - 0.5));
  const r = lcg(1000 + unazad);
  const broj = (osnova: number) => (prazno ? 0 : unazad === 0 ? osnova : Math.round(osnova * (0.5 + r())));
  const trend = (tekuca: number, prosla: number) => ({ current: broj(tekuca), previous: prazno ? 0 : prosla });
  const kratko = (p: Profil) => ({ profileId: p._id, displayName: p.displayName, avatarUrl: p.avatarUrl });
  return {
    range: { weekStart, weekEnd },
    startupCreatedAt: now - 70 * DAY,
    summary: {
      completed: trend(14, 11),
      created: trend(9, 12),
      overdueOpen: trend(4, 5),
      stuck: { current: broj(3), previous: null },
    },
    stuckTasks: prazno
      ? []
      : [
          {
            pageId: id(201),
            title: "Popravi prijavu na staging serveru",
            taskStatus: "blocked" as const,
            taskPriority: "urgent" as const,
            areaId: RAZVOJ._id,
            areaLabel: RAZVOJ.label,
            assignee: kratko(MARKO),
            assignees: [kratko(MARKO)],
            dueDate: podne(-2),
            lastTouchedAt: now - 3 * DAY,
          },
          {
            pageId: id(206),
            title: "Pripremi ponudu za pekaru",
            taskStatus: "in_progress" as const,
            taskPriority: "urgent" as const,
            areaId: PRODAJA._id,
            areaLabel: PRODAJA.label,
            assignee: kratko(MILICA),
            assignees: [kratko(MILICA)],
            dueDate: podne(1),
            lastTouchedAt: now - 6 * DAY,
          },
          {
            pageId: id(408),
            title: "Proveri brzinu učitavanja početne",
            taskStatus: "blocked" as const,
            taskPriority: "high" as const,
            areaId: RAZVOJ._id,
            areaLabel: RAZVOJ.label,
            assignee: kratko(MARKO),
            assignees: [kratko(MARKO)],
            dueDate: podne(4),
            lastTouchedAt: now - 5 * DAY,
          },
        ].slice(0, broj(3)),
    areas: OBLASTI.map((o, i) => ({
      areaId: o._id,
      key: o.key,
      label: o.label,
      openCount: prazno ? 0 : [7, 5, 6, 2][i],
      doneCount: prazno ? 0 : [12, 4, 9, 1][i],
      completedThisWeek: broj([5, 3, 4, 2][i]),
    })),
    members: prazno
      ? []
      : [JA, ANA, MARKO, MILICA, NIKOLA, STEFAN].map((p, i) => ({
          profileId: p._id,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
          isArchived: false,
          completedThisWeek: broj([4, 3, 2, 3, 1, 1][i]),
          activityCount: broj([18, 11, 9, 14, 4, 6][i]),
          openCount: [6, 3, 4, 3, 1, 2][i],
          overdueCount: [2, 1, 1, 0, 0, 0][i],
        })),
    unassigned: { completedThisWeek: 0, openCount: prazno ? 0 : 2, overdueCount: prazno ? 0 : 1 },
    ideas: { created: trend(3, 2), votes: trend(7, 4), converted: trend(1, 0) },
    truncated: false,
  };
}

// ── Aktivnost (`activity.listPaginated`) ─────────────────────────────────────

type SemeAktivnosti = {
  action: Aktivnost["action"];
  targetType: Aktivnost["targetType"];
  targetId: string;
  title: string;
  detail?: string;
  akter: Profil | null;
  minuta: number;
};

/** Prvih osam po uzoru na Devotion `IZLOG_CC_ACTIVITY`, pa starije izmene. */
const AKTIVNOSTI_SEME: SemeAktivnosti[] = [
  { action: "page_locked", targetType: "page", targetId: id(206), title: "Pripremi ponudu za pekaru", akter: MILICA, minuta: 62 },
  { action: "page_restored", targetType: "page", targetId: id(207), title: "Obnovi domen i SSL sertifikat", detail: "Sa 2 podstranice", akter: MARKO, minuta: 180 },
  { action: "idea_stage_changed", targetType: "idea", targetId: fakeId("ideaNodes", 2), title: "Paket „Sajt za 7 dana“ za male firme", detail: "Razmatra se", akter: JA, minuta: 400 },
  { action: "tasks_rescheduled", targetType: "startup", targetId: WS, title: "Enigma IT", detail: "4 zadatka → sutra", akter: NIKOLA, minuta: 1_500 },
  { action: "comment_created", targetType: "page", targetId: id(200), title: "Poveži webhook naplate sa porudžbinama", akter: ANA, minuta: 1_900 },
  { action: "revision_restored", targetType: "area", targetId: PRODAJA._id, title: "Opis oblasti Prodaja", akter: ANA, minuta: 3_000 },
  { action: "page_updated", targetType: "page", targetId: id(202), title: "Plan objava za decembar", akter: STEFAN, minuta: 4_300 },
  { action: "idea_archived", targetType: "idea", targetId: fakeId("ideaNodes", 7), title: "Maskota za Instagram", akter: null, minuta: 6_000 },
  ...Array.from({ length: 32 }, (_, i): SemeAktivnosti => {
    const ljudi = [ANA, MARKO, MILICA, NIKOLA, STEFAN, JA];
    const zadatak = 200 + (i % 11);
    return i % 3 === 0
      ? { action: "page_created", targetType: "page", targetId: id(zadatak), title: `Beleška sa sastanka ${i + 1}`, akter: ljudi[i % 6], minuta: 7_000 + i * 600 }
      : i % 3 === 1
        ? { action: "task_updated", targetType: "page", targetId: id(zadatak), title: `Zadatak tima ${i + 1}`, detail: "Status", akter: ljudi[(i + 2) % 6], minuta: 7_000 + i * 600 }
        : { action: "comment_created", targetType: "page", targetId: id(zadatak), title: `Zadatak tima ${i + 1}`, akter: ljudi[(i + 4) % 6], minuta: 7_000 + i * 600 };
  }),
];

const AKTIVNOSTI: Aktivnost[] = AKTIVNOSTI_SEME.map((s, i) => {
  const kada = now - s.minuta * 60_000;
  const akter = s.akter ?? PROFILI[5];
  return {
    _id: fakeId("activities", i + 1),
    _creationTime: kada,
    workspaceId: WS,
    actorProfileId: akter._id,
    action: s.action,
    targetType: s.targetType,
    targetId: s.targetId,
    title: s.title,
    ...(s.detail === undefined ? {} : { detail: s.detail }),
    createdAt: kada,
    // Bez imena (obrisan profil) rečenica kaže „Član tima“.
    actor: s.akter ? { _id: s.akter._id, displayName: s.akter.displayName, avatarUrl: s.akter.avatarUrl } : null,
  };
});

function aktivnost(a: Record<string, unknown>): R<typeof api.prostor.activity.listPaginated> {
  const opts = (a.paginationOpts ?? {}) as { numItems?: number; cursor?: string | null };
  const od = Number(opts.cursor ?? 0) || 0;
  const koliko = Math.max(1, Math.min(100, opts.numItems ?? 30));
  const page = AKTIVNOSTI.slice(od, od + koliko);
  const sledeci = od + page.length;
  return { page, isDone: sledeci >= AKTIVNOSTI.length, continueCursor: String(sledeci) };
}

// ── Registar ─────────────────────────────────────────────────────────────────

export const FIXTURES_PROSTOR_POCETNA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.tasks.commandCenter)]: () => komandniCentar(),
  [getFunctionName(api.prostor.taskAssignees.listForTasks)]: (a) => izvrsiociZadataka(a),
  [getFunctionName(api.prostor.taskAssignees.listForTask)]: (a) => {
    const s = semePoId().get(String(a.taskPageId));
    return s ? s.izvrsioci.map((p) => izvrsilac(p, s)) : poziv(FIXTURES_PROSTOR_ZADACI, api.prostor.taskAssignees.listForTask, a);
  },
  [getFunctionName(api.prostor.pages.get)]: (a) => detalj(a),
  [getFunctionName(api.prostor.tasks.listEverywhere)]: (a) => mojiZadaci(a),
  [getFunctionName(api.prostor.tasks.updateMetadata)]: (a) => izmeniZadatak(a),
  [getFunctionName(api.prostor.inbox.pending)]: (a) => cekaGlas(a),
  [getFunctionName(api.prostor.ideas.vote)]: (a) => glasaj(a),
  [getFunctionName(api.prostor.puls.getWeekly)]: (a) => pulsNedelje(a, false),
  [getFunctionName(api.prostor.activity.listPaginated)]: (a) => aktivnost(a),
};

/** `&prazno=1`: projekat bez zadataka, puls nula, bez aktivnosti (nula je izmerena). */
export const PRAZNO_PROSTOR_POCETNA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.tasks.commandCenter)]: () =>
    ({ tasks: [], hasMore: false }) satisfies R<typeof api.prostor.tasks.commandCenter>,
  [getFunctionName(api.prostor.puls.getWeekly)]: (a) => pulsNedelje(a, true),
  [getFunctionName(api.prostor.activity.listPaginated)]: () => strana<Aktivnost>([]),
};
