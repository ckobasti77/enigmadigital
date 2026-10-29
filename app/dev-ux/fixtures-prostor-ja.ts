/**
 * Razvojni prikaz: lični nivo „Ja“ — Moji zadaci, Beleške i brzi unos
 * (SPAJANJE S16, plan S07 §8.1–§8.2).
 *
 * Sadržaj je po uzoru na Devotion izlog (`tasks.ts`, `notes.ts`,
 * `moj-dan.ts`), sa lažnim ljudima i projektima iz
 * `fixtures-prostor-osnova.ts`:
 * - Moji zadaci: zadaci „Enigma IT“ čiji sam izvršilac dolaze iz fiksture
 *   zadataka (S12), pa panel zadatka radi nad istim podacima; uz njih su
 *   zadaci u „ScanMe“ i „Klijent d.o.o.“ i četiri lična zadatka (jedan je u
 *   planu dana iz osnove).
 * - Beleške: misli „Enigma IT“ su iste one sa mape beleški (S14); lične i
 *   beleške drugih projekata su ovde.
 *
 * Mutacije menjaju stanje modula (kvačica, rok, prioritet, nova beleška,
 * arhiva, „Pošalji u projekat“, brzi unos), pa se promena vidi odmah.
 * Mutacije nad podacima drugih fikstura prosleđuju se njima.
 *
 * Adrese: `/moji-zadaci?ux=1`, `/beleske?ux=1`; `&prazno=1` daje prazno
 * stanje. Brzi unos se otvara tasterom `q` ili dugmetom „Brzi unos“.
 */
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { type Fixture, type R, WS, WS_KLIJENT, WS_SCANME, now, DAY, HOUR } from "./fixtures-util";
import { fakeId, OBLASTI, PROFIL_JA, PROJEKTI, strana } from "./fixtures-prostor-osnova";
import { FIXTURES_PROSTOR_ZADACI } from "./fixtures-prostor-zadaci";
import { FIXTURES_PROSTOR_MAPE } from "./fixtures-prostor-mape";

type RM<M extends FunctionReference<"mutation">> = FunctionReturnType<M>;
type Zadatak = R<typeof api.prostor.tasks.listEverywhere>["items"][number];
type Licni = R<typeof api.prostor.personalTasks.list>["items"][number];
type Beleska = R<typeof api.prostor.thoughts.listMine>["page"][number];
type Pogodak = R<typeof api.prostor.thoughts.searchMine>[number];
type SazetakProjekta = R<typeof api.prostor.tasks.listForStartup>["page"][number];
type Misao = R<typeof api.prostor.thoughts.listNodes>["page"][number];
type Oblast = (typeof OBLASTI)[number];

const poziv = (izvor: Record<string, Fixture>, funkcija: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) =>
  izvor[getFunctionName(funkcija)]?.(args);

/** Lokalno podne dana `dana` od danas (rok zadatka je podne dana). */
function podne(dana: number): number {
  const dan = new Date(now);
  dan.setHours(12, 0, 0, 0);
  return dan.getTime() + dana * DAY;
}

const mini = (workspaceId: Id<"workspaces">) => {
  const p = PROJEKTI.find((x) => x._id === workspaceId) ?? PROJEKTI[0];
  return { _id: p._id, name: p.name, logoUrl: p.logoUrl };
};
const oblastiProjekta = (workspaceId: Id<"workspaces">): Oblast[] =>
  PROJEKTI.find((x) => x._id === workspaceId)?.areas ?? OBLASTI;
const oblastMini = (o: Oblast) => ({ _id: o._id, key: o.key, label: o.label });

// ── Zadaci projekata ──────────────────────────────────────────────────────────

/** Zadatak „Enigma IT“ iz fiksture zadataka (S12) u obliku liste „Ja“. */
function izProjekta(s: SazetakProjekta): Zadatak {
  const oblast = OBLASTI.find((o) => o._id === s.areaId);
  return {
    _id: s._id,
    title: s.title,
    taskStatus: s.taskStatus ?? "next",
    taskPriority: s.taskPriority ?? null,
    dueDate: s.dueDate ?? null,
    taskSortAt: s.taskSortAt ?? s.createdAt,
    completedAt: s.completedAt ?? null,
    checkpointTotal: s.checkpointTotal ?? 0,
    checkpointCompleted: s.checkpointCompleted ?? 0,
    createdByProfileId: s.createdByProfileId,
    isCreator: s.createdByProfileId === PROFIL_JA._id,
    isAssignee: true,
    isLocked: s.lockedAt !== null && s.lockedAt !== undefined,
    lockedForViewer: false,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    workspace: mini(WS),
    area: oblast ? oblastMini(oblast) : null,
  };
}

/** Zadaci „Enigma IT“ čiji sam izvršilac (isti podaci kao `/enigma-it/zadaci`). */
function zadaciEnigme(): Zadatak[] {
  const lista = poziv(FIXTURES_PROSTOR_ZADACI, api.prostor.tasks.listForStartup, { workspaceId: WS }) as
    | { page: SazetakProjekta[] }
    | undefined;
  return (lista?.page ?? [])
    .filter((s) => {
      const izvrsioci = poziv(FIXTURES_PROSTOR_ZADACI, api.prostor.taskAssignees.listForTask, { taskPageId: s._id }) as
        | R<typeof api.prostor.taskAssignees.listForTask>
        | undefined;
      return (izvrsioci ?? []).some((i) => i.profileId === PROFIL_JA._id);
    })
    .map(izProjekta);
}

type SemeZadatka = {
  n: number;
  workspaceId: Id<"workspaces">;
  oblast: number;
  naslov: string;
  status: Zadatak["taskStatus"];
  prioritet: Zadatak["taskPriority"];
  rok: number | null;
  koraci?: { ukupno: number; zavrseno: number };
  pre: number;
};

const SEME_ZADATAKA: SemeZadatka[] = [
  { n: 301, workspaceId: WS_SCANME, oblast: 1, naslov: "Landing za QR menije", status: "next", prioritet: "urgent", rok: podne(0), pre: 2 * DAY },
  { n: 302, workspaceId: WS_SCANME, oblast: 2, naslov: "Ponuda za lanac kafića", status: "in_progress", prioritet: "high", rok: podne(-1), koraci: { ukupno: 3, zavrseno: 1 }, pre: 4 * DAY },
  { n: 303, workspaceId: WS_SCANME, oblast: 0, naslov: "Štampa probnih QR nalepnica", status: "backlog", prioritet: "low", rok: null, pre: 9 * DAY },
  { n: 311, workspaceId: WS_KLIJENT, oblast: 1, naslov: "Mesečni izveštaj za klijenta", status: "next", prioritet: "medium", rok: podne(4), pre: 6 * DAY },
];

function izSemena(s: SemeZadatka): Zadatak {
  const nastao = now - s.pre;
  const oblast = oblastiProjekta(s.workspaceId)[s.oblast];
  return {
    _id: fakeId("pages", s.n),
    title: s.naslov,
    taskStatus: s.status,
    taskPriority: s.prioritet,
    dueDate: s.rok,
    taskSortAt: nastao,
    completedAt: null,
    checkpointTotal: s.koraci?.ukupno ?? 0,
    checkpointCompleted: s.koraci?.zavrseno ?? 0,
    createdByProfileId: PROFIL_JA._id,
    isCreator: true,
    isAssignee: true,
    createdAt: nastao,
    updatedAt: nastao + HOUR,
    workspace: mini(s.workspaceId),
    area: oblast ? oblastMini(oblast) : null,
  };
}

const stanjeZadataka = {
  /** Izmene kvačicom, rokom i prioritetom (po ID-ju stranice). */
  izmene: new Map<string, Partial<Zadatak>>(),
  /** Zadaci napravljeni brzim unosom. */
  novi: [] as Zadatak[],
  arhivirani: new Set<string>(),
  brojac: 900,
};

function sviZadaci(): Zadatak[] {
  return [...zadaciEnigme(), ...SEME_ZADATAKA.map(izSemena), ...stanjeZadataka.novi]
    .filter((z) => !stanjeZadataka.arhivirani.has(z._id))
    .map((z) => ({ ...z, ...stanjeZadataka.izmene.get(z._id) }));
}

function listaSvuda(a: Record<string, unknown>): R<typeof api.prostor.tasks.listEverywhere> {
  const opseg = a.scope === "done" || a.scope === "all" ? a.scope : "open";
  const items = sviZadaci().filter((z) =>
    opseg === "all" ? true : opseg === "done" ? z.taskStatus === "done" : z.taskStatus !== "done",
  );
  return { items, capped: false };
}

function izmeniZadatak(a: Record<string, unknown>): void {
  const id = String(a.pageId);
  const izmena: Partial<Zadatak> = { ...stanjeZadataka.izmene.get(id) };
  if (typeof a.status === "string") {
    izmena.taskStatus = a.status as Zadatak["taskStatus"];
    izmena.completedAt = a.status === "done" ? Date.now() : null;
  }
  if (a.priority !== undefined) izmena.taskPriority = a.priority as Zadatak["taskPriority"];
  if (a.dueDate !== undefined) izmena.dueDate = a.dueDate as number | null;
  stanjeZadataka.izmene.set(id, izmena);
}

/** Brzi unos u projekat: nov zadatak (backlog, ja izvršilac). */
function noviZadatak(a: Record<string, unknown>): RM<typeof api.prostor.pages.create> {
  const pageId = fakeId("pages", ++stanjeZadataka.brojac);
  if (a.kind === "task" && a.workspaceId) {
    const workspaceId = a.workspaceId as Id<"workspaces">;
    const oblast = oblastiProjekta(workspaceId).find((o) => o._id === a.areaId);
    stanjeZadataka.novi.push({
      _id: pageId,
      title: String(a.title ?? ""),
      taskStatus: "backlog",
      taskPriority: (a.taskPriority as Zadatak["taskPriority"]) ?? null,
      dueDate: typeof a.dueDate === "number" ? a.dueDate : null,
      taskSortAt: Date.now(),
      completedAt: null,
      checkpointTotal: 0,
      checkpointCompleted: 0,
      createdByProfileId: PROFIL_JA._id,
      isCreator: true,
      isAssignee: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspace: mini(workspaceId),
      area: oblast ? oblastMini(oblast) : null,
    });
  }
  return pageId;
}

// ── Lični zadaci ──────────────────────────────────────────────────────────────

function licni(n: number, naslov: string, delimicno: Partial<Licni> = {}): Licni {
  const nastao = now - (n + 2) * DAY;
  return {
    _id: fakeId("personalTasks", n),
    title: naslov,
    notes: null,
    status: "open",
    priority: null,
    dueDate: null,
    sortAt: nastao,
    completedAt: null,
    createdAt: nastao,
    updatedAt: nastao,
    ...delimicno,
  };
}

const stanjeLicnih = {
  zadaci: new Map<string, Licni>(
    [
      // Isti kao lični zadatak u planu dana iz osnove (red nosi „u Moj dan“).
      licni(1, "Pregledati Q4 budžet", { priority: "high", createdAt: now - 5 * DAY, sortAt: now - 5 * DAY }),
      licni(2, "Platiti račun za struju", { dueDate: podne(0), notes: "Uplatnica je u fioci." }),
      licni(3, "Pozvati računovođu", { dueDate: podne(2), priority: "medium" }),
      licni(4, "Rezervisati let za Beč", { status: "done", completedAt: now - DAY, dueDate: podne(-1) }),
    ].map((z) => [z._id as string, z]),
  ),
  arhivirani: new Set<string>(),
  brojac: 100,
};

function listaLicnih(a: Record<string, unknown>): R<typeof api.prostor.personalTasks.list> {
  const status = a.status === "done" || a.status === "all" ? a.status : "open";
  const items = [...stanjeLicnih.zadaci.values()]
    .filter((z) => !stanjeLicnih.arhivirani.has(z._id))
    .filter((z) => (status === "all" ? true : z.status === status))
    .sort((x, y) => x.sortAt - y.sortAt);
  return { items, capped: false };
}

function izmeniLicni(id: unknown, izmena: Partial<Licni>): void {
  const z = stanjeLicnih.zadaci.get(String(id));
  if (z) stanjeLicnih.zadaci.set(z._id, { ...z, ...izmena, updatedAt: Date.now() });
}

function noviLicni(a: Record<string, unknown>): RM<typeof api.prostor.personalTasks.create> {
  const z = licni(++stanjeLicnih.brojac, String(a.title ?? ""), {
    dueDate: typeof a.dueDate === "number" ? a.dueDate : null,
    priority: (a.priority as Licni["priority"]) ?? null,
    createdAt: Date.now(),
    sortAt: Date.now(),
    updatedAt: Date.now(),
  });
  stanjeLicnih.zadaci.set(z._id, z);
  return z._id;
}

/** „Prebaci u projekat“: lični zadatak postaje zadatak projekta (plan dana ga prati na serveru). */
function prebaci(a: Record<string, unknown>): RM<typeof api.prostor.personalTasks.moveToStartup> {
  const licniZadatak = stanjeLicnih.zadaci.get(String(a.personalTaskId));
  stanjeLicnih.arhivirani.add(String(a.personalTaskId));
  const pageId = noviZadatak({
    kind: "task",
    workspaceId: a.workspaceId,
    areaId: a.areaId,
    title: licniZadatak?.title ?? "",
    dueDate: licniZadatak?.dueDate ?? undefined,
    taskPriority: licniZadatak?.priority ?? undefined,
  });
  return { pageId };
}

// ── Beleške ───────────────────────────────────────────────────────────────────

type SemeBeleske = {
  n: number;
  workspaceId: Id<"workspaces"> | null;
  naslov: string | null;
  tekst: string;
  boja: Beleska["color"];
  roditelj?: number;
  pre: number;
};

const SEME_BELESKI: SemeBeleske[] = [
  { n: 301, workspaceId: null, naslov: "Knjige za decembar", tekst: "Dve knjige o prodaji i jedna o pisanju. Pitati Anu za preporuku.", boja: "neutral", pre: 3 * HOUR },
  { n: 302, workspaceId: null, naslov: null, tekst: "Proveriti da li važi popust za godišnji hosting pre kraja meseca.", boja: "blue", pre: DAY },
  { n: 303, workspaceId: null, naslov: "Teretana", tekst: "Utorak i četvrtak u 7, pre posla. Subotom trčanje.", boja: "green", pre: 4 * DAY },
  { n: 304, workspaceId: null, naslov: "Ideje za vikend", tekst: "Izlet na Frušku goru ako bude lepo vreme.", boja: "amber", roditelj: 303, pre: 5 * DAY },
  { n: 311, workspaceId: WS_SCANME, naslov: "Cene za kafiće", tekst: "Osnovni paket do 30 stolova, sve preko toga po dogovoru.", boja: "violet", pre: 6 * HOUR },
  { n: 312, workspaceId: WS_SCANME, naslov: null, tekst: "Pitati restorane da li žele meni na engleskom.", boja: "rose", pre: 2 * DAY },
  { n: 321, workspaceId: WS_KLIJENT, naslov: "Ton izveštaja", tekst: "Kratko, sa tri broja na vrhu i jednom preporukom.", boja: "blue", pre: 7 * DAY },
];

function izSemenaBeleske(s: SemeBeleske): Beleska {
  const nastala = now - s.pre;
  return {
    _id: fakeId("thoughtNodes", s.n),
    workspaceId: s.workspaceId,
    workspace: s.workspaceId === null ? null : mini(s.workspaceId),
    title: s.naslov,
    text: s.tekst,
    color: s.boja,
    parentThoughtId: s.roditelj ? fakeId("thoughtNodes", s.roditelj) : null,
    isParent: SEME_BELESKI.some((x) => x.roditelj === s.n),
    conversionCount: 0,
    lastConvertedIdeaId: null,
    createdAt: nastala,
    updatedAt: nastala,
  };
}

const stanjeBeleski = {
  beleske: new Map<string, Beleska>(
    SEME_BELESKI.map((s) => [fakeId("thoughtNodes", s.n) as string, izSemenaBeleske(s)]),
  ),
  arhivirane: new Set<string>(),
  brojac: 500,
};

/** Misli „Enigma IT“ sa mape beleški (S14) kao beleške „Ja“. */
function misliEnigme(): Beleska[] {
  const lista = poziv(FIXTURES_PROSTOR_MAPE, api.prostor.thoughts.listNodes, { workspaceId: WS }) as
    | { page: Misao[] }
    | undefined;
  return (lista?.page ?? []).map((m) => ({
    _id: m._id,
    workspaceId: WS,
    workspace: mini(WS),
    title: m.title,
    text: m.text,
    color: m.color,
    parentThoughtId: m.parentThoughtId ?? null,
    isParent: m.isParent ?? false,
    conversionCount: m.conversionCount,
    lastConvertedIdeaId: m.lastConvertedIdeaId ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }));
}

function sveBeleske(): Beleska[] {
  const svoje = [...stanjeBeleski.beleske.values()].filter((b) => !stanjeBeleski.arhivirane.has(b._id));
  return [...svoje, ...misliEnigme()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Filter opsega: odsutno = sve, `null` = lične, ID = jedan projekat. */
function uOpsegu(a: Record<string, unknown>) {
  return (b: Beleska) => (!("workspaceId" in a) || a.workspaceId === undefined ? true : b.workspaceId === a.workspaceId);
}

/** Upit filtriran na jedan projekat (ne „sve“ ni „lično“). */
const jedanProjekat = (a: Record<string, unknown>) => typeof a.workspaceId === "string";

const normalizuj = (tekst: string) => tekst.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function pretraga(a: Record<string, unknown>): Pogodak[] {
  const upit = normalizuj(String(a.query ?? "").trim());
  if (upit.length < 2) return [];
  return sveBeleske()
    .filter(uOpsegu(a))
    .filter((b) => normalizuj(`${b.title ?? ""} ${b.text}`).includes(upit))
    .slice(0, typeof a.limit === "number" ? a.limit : 20)
    .map((b) => ({ _id: b._id, title: b.title, text: b.text.slice(0, 280), workspaceId: b.workspaceId }));
}

const svojaBeleska = (id: unknown) => stanjeBeleski.beleske.get(String(id));
const idjevi = (vrednost: unknown) => (Array.isArray(vrednost) ? (vrednost as Id<"thoughtNodes">[]) : []);

function izmeniBelesku(a: Record<string, unknown>): RM<typeof api.prostor.thoughts.updateNode> {
  const b = svojaBeleska(a.nodeId);
  if (!b) return poziv(FIXTURES_PROSTOR_MAPE, api.prostor.thoughts.updateNode, a) as Id<"thoughtNodes">;
  stanjeBeleski.beleske.set(b._id, {
    ...b,
    ...(typeof a.title === "string" ? { title: a.title.trim() === "" ? null : a.title } : {}),
    ...(typeof a.text === "string" ? { text: a.text } : {}),
    updatedAt: Date.now(),
  });
  return b._id;
}

function arhiviraj(a: Record<string, unknown>, arhivirana: boolean): Id<"thoughtNodes">[] {
  const sve = idjevi(a.nodeIds);
  const tudje = sve.filter((id) => !svojaBeleska(id));
  for (const id of sve) {
    const b = svojaBeleska(id);
    if (!b) continue;
    if (arhivirana) stanjeBeleski.arhivirane.add(b._id);
    else stanjeBeleski.arhivirane.delete(b._id);
  }
  if (tudje.length > 0) {
    poziv(FIXTURES_PROSTOR_MAPE, arhivirana ? api.prostor.thoughts.archiveNodes : api.prostor.thoughts.restoreNodes, {
      nodeIds: tudje,
    });
  }
  return sve;
}

function posaljiUIdeje(a: Record<string, unknown>): RM<typeof api.prostor.thoughts.convertToIdeas> {
  const sve = idjevi(a.nodeIds);
  const svoje = sve.filter((id) => svojaBeleska(id));
  if (svoje.length === 0) {
    return poziv(FIXTURES_PROSTOR_MAPE, api.prostor.thoughts.convertToIdeas, a) as RM<
      typeof api.prostor.thoughts.convertToIdeas
    >;
  }
  const ideaIds = svoje.map(() => fakeId("ideaNodes", ++stanjeBeleski.brojac));
  svoje.forEach((id, i) => {
    const b = svojaBeleska(id);
    if (b) {
      stanjeBeleski.beleske.set(b._id, {
        ...b,
        conversionCount: b.conversionCount + 1,
        lastConvertedIdeaId: ideaIds[i],
        updatedAt: Date.now(),
      });
    }
  });
  return { ideaIds, createdEdgeCount: 0 };
}

function novaBeleska(a: Record<string, unknown>): RM<typeof api.prostor.thoughts.createNote> {
  const workspaceId = (a.workspaceId ?? null) as Id<"workspaces"> | null;
  const id = fakeId("thoughtNodes", ++stanjeBeleski.brojac);
  stanjeBeleski.beleske.set(id, {
    _id: id,
    workspaceId,
    workspace: workspaceId === null ? null : mini(workspaceId),
    title: typeof a.title === "string" && a.title.trim() !== "" ? a.title : null,
    text: String(a.text ?? ""),
    color: "neutral",
    parentThoughtId: null,
    isParent: false,
    conversionCount: 0,
    lastConvertedIdeaId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return id;
}

// ── Registar ─────────────────────────────────────────────────────────────────

export const FIXTURES_PROSTOR_JA: Record<string, Fixture> = {
  // Moji zadaci.
  [getFunctionName(api.prostor.tasks.listEverywhere)]: (a) => listaSvuda(a),
  [getFunctionName(api.prostor.personalTasks.list)]: (a) => listaLicnih(a),
  [getFunctionName(api.prostor.personalTasks.get)]: (a) =>
    (stanjeLicnih.arhivirani.has(String(a.personalTaskId)) ? null : (stanjeLicnih.zadaci.get(String(a.personalTaskId)) ?? null)) satisfies R<
      typeof api.prostor.personalTasks.get
    >,
  [getFunctionName(api.prostor.tasks.updateMetadata)]: (a) => {
    izmeniZadatak(a);
    return poziv(FIXTURES_PROSTOR_ZADACI, api.prostor.tasks.updateMetadata, a) ?? a.pageId;
  },
  [getFunctionName(api.prostor.personalTasks.setStatus)]: (a) => {
    const prethodni = stanjeLicnih.zadaci.get(String(a.personalTaskId))?.status ?? "open";
    izmeniLicni(a.personalTaskId, {
      status: a.status as Licni["status"],
      completedAt: a.status === "done" ? Date.now() : null,
    });
    return { previousStatus: prethodni } satisfies RM<typeof api.prostor.personalTasks.setStatus>;
  },
  [getFunctionName(api.prostor.personalTasks.update)]: (a) => {
    izmeniLicni(a.personalTaskId, {
      ...(typeof a.title === "string" ? { title: a.title } : {}),
      ...(a.notes !== undefined ? { notes: (a.notes as string | null) ?? null } : {}),
      ...(a.priority !== undefined ? { priority: a.priority as Licni["priority"] } : {}),
      ...(a.dueDate !== undefined ? { dueDate: a.dueDate as number | null } : {}),
    });
    return null satisfies RM<typeof api.prostor.personalTasks.update>;
  },
  [getFunctionName(api.prostor.personalTasks.archive)]: (a) => {
    stanjeLicnih.arhivirani.add(String(a.personalTaskId));
    return null satisfies RM<typeof api.prostor.personalTasks.archive>;
  },
  [getFunctionName(api.prostor.personalTasks.moveToStartup)]: (a) => prebaci(a),
  [getFunctionName(api.prostor.personalTasks.restore)]: (a) => {
    stanjeLicnih.arhivirani.delete(String(a.personalTaskId));
    return null satisfies RM<typeof api.prostor.personalTasks.restore>;
  },
  // Brzi unos.
  [getFunctionName(api.prostor.personalTasks.create)]: (a) => noviLicni(a),
  [getFunctionName(api.prostor.pages.create)]: (a) => noviZadatak(a),
  [getFunctionName(api.prostor.areasV2.archivePage)]: (a) => {
    stanjeZadataka.arhivirani.add(String(a.pageId));
    return null satisfies RM<typeof api.prostor.areasV2.archivePage>;
  },
  [getFunctionName(api.prostor.thoughts.createNote)]: (a) => novaBeleska(a),
  // Beleške.
  [getFunctionName(api.prostor.thoughts.listMine)]: (a) => strana(sveBeleske().filter(uOpsegu(a))),
  [getFunctionName(api.prostor.thoughts.searchMine)]: (a) => pretraga(a),
  [getFunctionName(api.prostor.thoughts.getNote)]: (a) =>
    (sveBeleske().find((b) => b._id === a.nodeId) ?? null) satisfies R<typeof api.prostor.thoughts.getNote>,
  [getFunctionName(api.prostor.thoughts.updateNode)]: (a) => izmeniBelesku(a),
  [getFunctionName(api.prostor.thoughts.archiveNodes)]: (a) => arhiviraj(a, true),
  [getFunctionName(api.prostor.thoughts.restoreNodes)]: (a) => arhiviraj(a, false),
  [getFunctionName(api.prostor.thoughts.convertToIdeas)]: (a) => posaljiUIdeje(a),
};

/**
 * `&prazno=1`: nalog bez zadataka i beleški (Moji zadaci i Beleške pokazuju
 * prazno stanje). `resolveFixture` ovde šalje i svaki upit sa projektom
 * „ScanMe“ ili „Klijent d.o.o.“; beleške filtrirane na taj projekat zato
 * ostaju pune (u praznom nalogu filter ionako nema projekata sa beleškama).
 */
export const PRAZNO_PROSTOR_JA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.tasks.listEverywhere)]: () =>
    ({ items: [], capped: false }) satisfies R<typeof api.prostor.tasks.listEverywhere>,
  [getFunctionName(api.prostor.personalTasks.list)]: () =>
    ({ items: [], capped: false }) satisfies R<typeof api.prostor.personalTasks.list>,
  [getFunctionName(api.prostor.thoughts.listMine)]: (a) =>
    jedanProjekat(a) ? strana(sveBeleske().filter(uOpsegu(a))) : strana([] as Beleska[]),
  [getFunctionName(api.prostor.thoughts.searchMine)]: (a) => (jedanProjekat(a) ? pretraga(a) : ([] as Pogodak[])),
};
