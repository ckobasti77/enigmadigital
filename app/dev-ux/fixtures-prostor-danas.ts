/**
 * Razvojni prikaz: Danas (`/`, SPAJANJE S19, plan S18 §4.1).
 *
 * Sadržaj je po uzoru na Devotion izlog (`moj-dan.ts`: obican, prazan,
 * pretrpan). Moj dan čita zadatke iz fiksture „Ja“ (S16; Enigma IT iz
 * fiksture zadataka S12), pa kvačica, rok i panel rade nad istim podacima
 * kao na Mojim zadacima, uz nekoliko svojih zadataka da se vidi svaka
 * sekcija (Uskoro, Blokirano, Završeno danas) i „Preneto od ranije“.
 *
 * Stanje bira `&stanje=` (harness ga postavlja pre prvog upita):
 * - bez parametra (`obican`): tri projekta, sve sekcije, tri stavke istorije;
 * - `bez-projekata`: nalog bez projekata (samo lično), nijedan projektni upit;
 * - `jedan`: samo Enigma IT;
 * - `pretrpan`: 34 zadatka sa dugim naslovima, `capped`, 20 projekata u Čeka te;
 * - `posmatrac`: u „Klijent d.o.o.“ sam posmatrač — projekat nema radni deo
 *   (nema ga u Moj dan, Inbox-u ni porukama), a Enigmine stavke Čeka te ostaju.
 * `&prazno=1` daje prazan nalog (osnova + prazne fiksture ostalih ekrana).
 *
 * Mutacije plana dana (plan, ukloni, redosled, vrati, skloni) menjaju stanje
 * modula, pa se promena vidi odmah.
 */
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
// Direktno iz modula, ne iz `@/lib/prostor`: provere (`verify:*`) uvoze fiksture
// kroz Node, koji ne razrešava uvoz fascikle.
import { addDaysToKey, type DayKey } from "@/lib/prostor/dates";
import { type Fixture, type R, WS, WS_KLIJENT, WS_SCANME, now, DAY, HOUR } from "./fixtures-util";
import { fakeId, OBLASTI, PROJEKTI } from "./fixtures-prostor-osnova";
import { FIXTURES_PROSTOR_JA } from "./fixtures-prostor-ja";
import { FIXTURES_PROSTOR_INBOX } from "./fixtures-prostor-inbox";
import { FIXTURES_PROSTOR_OSNOVA } from "./fixtures-prostor-osnova";
import { PROJEKTI_UX } from "./fixtures-projekti";
import { projektiUx } from "./fixtures-hub";

type RM<M extends FunctionReference<"mutation">> = FunctionReturnType<M>;
type Dan = R<typeof api.prostor.myDay.overview>;
type Zadatak = Dan["tasks"][number];
type Licni = Dan["personal"][number];
type Unos = Dan["entries"][number];
type Stavka = R<typeof api.projekti.mojiProjekti>[number];

export const STANJA_DANAS = ["obican", "bez-projekata", "jedan", "pretrpan", "posmatrac"] as const;
export type StanjeDanas = (typeof STANJA_DANAS)[number];

let stanjeUx: StanjeDanas = "obican";

/** Harness postavlja stanje iz `&stanje=` pre nego što ijedan upit krene. */
export function postaviStanjeDanas(stanje: string | undefined): void {
  stanjeUx = (STANJA_DANAS as readonly string[]).includes(stanje ?? "") ? (stanje as StanjeDanas) : "obican";
}

const poziv = (izvor: Record<string, Fixture>, funkcija: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) =>
  izvor[getFunctionName(funkcija)]?.(args);

/** Lokalno podne dana `dana` od danas (rok zadatka je podne dana). */
function podne(dana: number): number {
  const dan = new Date(now);
  dan.setHours(12, 0, 0, 0);
  return dan.getTime() + dana * DAY;
}

function kljucDana(ms: number): DayKey {
  const d = new Date(ms);
  const mesec = String(d.getMonth() + 1).padStart(2, "0");
  const dan = String(d.getDate()).padStart(2, "0");
  return `${String(d.getFullYear()).padStart(4, "0")}-${mesec}-${dan}` as DayKey;
}

const mini = (workspaceId: Id<"workspaces">) => {
  const p = PROJEKTI.find((x) => x._id === workspaceId) ?? PROJEKTI[0];
  return { _id: p._id, name: p.name, logoUrl: p.logoUrl };
};
const oblastProjekta = (workspaceId: Id<"workspaces">, i: number) => {
  const oblasti = PROJEKTI.find((x) => x._id === workspaceId)?.areas ?? OBLASTI;
  const o = oblasti[i % oblasti.length];
  return { _id: o._id, key: o.key, label: o.label };
};

// ── Projekti po stanju ────────────────────────────────────────────────────────

/** Projekti radnog dela (bez posmatrača) za Moj dan, Inbox i poruke. */
function projektiRadnogDela(): Id<"workspaces">[] {
  switch (stanjeUx) {
    case "bez-projekata":
      return [];
    case "jedan":
      return [WS];
    case "posmatrac":
      return [WS, WS_SCANME];
    default:
      return [WS, WS_SCANME, WS_KLIJENT];
  }
}

function mojiProjekti(): Stavka[] {
  switch (stanjeUx) {
    case "bez-projekata":
      return [];
    case "jedan":
      return PROJEKTI_UX.slice(0, 1);
    case "pretrpan":
      return projektiUx(20);
    case "posmatrac":
      return PROJEKTI_UX.map((p) => (p.workspaceId === WS_KLIJENT ? { ...p, uloga: "client_viewer" as const } : p));
    default:
      return PROJEKTI_UX;
  }
}

// ── Zadaci samo za Danas ──────────────────────────────────────────────────────

type Seme = {
  n: number;
  ws: Id<"workspaces">;
  oblast: number;
  naslov: string;
  status: Zadatak["taskStatus"];
  prioritet: Zadatak["taskPriority"];
  rok: number | null;
  zavrsen?: number;
};

const SEME_DANAS: Seme[] = [
  { n: 401, ws: WS, oblast: 3, naslov: "Pregledati ugovor sa hostingom", status: "blocked", prioritet: "medium", rok: null },
  { n: 402, ws: WS_SCANME, oblast: 3, naslov: "Poslati fakturu za oktobar", status: "done", prioritet: "high", rok: podne(0), zavrsen: now - 90 * 60_000 },
  { n: 403, ws: WS, oblast: 1, naslov: "Ažurirati cenovnik na sajtu", status: "next", prioritet: "medium", rok: podne(3) },
  { n: 404, ws: WS_SCANME, oblast: 2, naslov: "Pripremiti prezentaciju za sastanak", status: "next", prioritet: "high", rok: podne(5) },
  { n: 405, ws: WS, oblast: 2, naslov: "Odgovoriti na upit sa sajta", status: "next", prioritet: "high", rok: null },
  { n: 406, ws: WS, oblast: 0, naslov: "Proveriti DNS za novi domen", status: "backlog", prioritet: "low", rok: null },
  { n: 407, ws: WS_SCANME, oblast: 1, naslov: "Napisati tekst za Instagram", status: "next", prioritet: "medium", rok: null },
];

const NASLOVI_PRETRPAN = [
  "Popraviti prikaz cenovnika na telefonu kad je naziv paketa duži od jednog reda",
  "Dogovoriti termin snimanja za novu kampanju sa fotografom i stilistom",
  "Proveriti da li svi obrasci na sajtu šalju poruku na pravu adresu",
  "Ponuda",
  "Pripremiti mesečni izveštaj o oglasima za klijenta sa poređenjem prethodnog meseca",
  "Sređivanje",
];

function semePretrpan(): Seme[] {
  const projekti: Id<"workspaces">[] = [WS, WS_SCANME, WS_KLIJENT];
  return Array.from({ length: 34 }, (_, i) => {
    const pomeraj = i < 12 ? -(1 + (i % 9)) : i < 20 ? 0 : i < 28 ? 1 + (i % 6) : null;
    return {
      n: 500 + i,
      ws: projekti[i % 3],
      oblast: i,
      naslov: `${NASLOVI_PRETRPAN[i % NASLOVI_PRETRPAN.length]} (${i + 1})`,
      status: i % 7 === 0 ? "in_progress" : i % 11 === 0 ? "blocked" : "next",
      prioritet: (["urgent", "high", "medium", "low", null] as const)[i % 5],
      rok: pomeraj === null ? null : podne(pomeraj),
    } satisfies Seme;
  });
}

function izSemena(s: Seme): Zadatak {
  const nastao = now - (8 + (s.n % 10)) * DAY;
  return {
    _id: fakeId("pages", s.n),
    title: s.naslov,
    taskStatus: s.status,
    taskPriority: s.prioritet,
    dueDate: s.rok,
    taskSortAt: nastao,
    completedAt: s.zavrsen ?? null,
    checkpointTotal: 0,
    checkpointCompleted: 0,
    createdByProfileId: fakeId("profiles", 1),
    isCreator: true,
    isAssignee: true,
    createdAt: nastao,
    updatedAt: nastao + HOUR,
    workspace: mini(s.ws),
    area: oblastProjekta(s.ws, s.oblast),
  };
}

// ── Stanje plana dana ─────────────────────────────────────────────────────────

/** Unos bez dana: dan dobija iz upita (plan) ili kao pomeraj od danas (istorija). */
type UnosBezDana = Omit<Unos, "dayKey">;
type UnosIstorije = UnosBezDana & { danaRanije: number };

type StanjePlana = {
  plan: UnosBezDana[];
  istorija: UnosIstorije[];
  /** Izmene zadataka samo za Danas (kvačica, rok, prioritet). */
  izmene: Map<string, Partial<Zadatak>>;
  brojac: number;
};

function unos(n: number, ref: { kind: "task"; id: string } | { kind: "personal"; id: string }, position: number): UnosBezDana {
  const refKey = `${ref.kind}:${ref.id}`;
  return {
    _id: fakeId("myDayEntries", n),
    refKind: ref.kind,
    refKey,
    taskPageId: ref.kind === "task" ? (ref.id as Id<"pages">) : null,
    personalTaskId: ref.kind === "personal" ? (ref.id as Id<"personalTasks">) : null,
    position,
    createdAt: now - HOUR,
  };
}

function pocetniPlan(): StanjePlana {
  const licni1 = fakeId("personalTasks", 1);
  const plan =
    stanjeUx === "bez-projekata"
      ? [unos(1, { kind: "personal", id: licni1 }, 1024)]
      : [unos(1, { kind: "personal", id: licni1 }, 1024), unos(2, { kind: "task", id: fakeId("pages", 405) }, 2048)];
  const istorija: UnosIstorije[] =
    stanjeUx === "bez-projekata"
      ? [{ ...unos(11, { kind: "personal", id: fakeId("personalTasks", 3) }, 1024), danaRanije: 3 }]
      : [
          { ...unos(11, { kind: "task", id: fakeId("pages", 406) }, 1024), danaRanije: 1 },
          { ...unos(12, { kind: "task", id: fakeId("pages", 407) }, 2048), danaRanije: 2 },
          { ...unos(13, { kind: "personal", id: fakeId("personalTasks", 3) }, 1024), danaRanije: 3 },
        ];
  return { plan, istorija, izmene: new Map(), brojac: 100 };
}

const stanja = new Map<StanjeDanas, StanjePlana>();
function plan(): StanjePlana {
  let s = stanja.get(stanjeUx);
  if (!s) {
    s = pocetniPlan();
    stanja.set(stanjeUx, s);
  }
  return s;
}

function sopstveni(): Zadatak[] {
  const seme = stanjeUx === "pretrpan" ? [...SEME_DANAS, ...semePretrpan()] : SEME_DANAS;
  return seme.map(izSemena);
}

// ── Moj dan ───────────────────────────────────────────────────────────────────

function pregled(args: Record<string, unknown>): Dan {
  const dayKey = (typeof args.dayKey === "string" ? args.dayKey : kljucDana(now)) as DayKey;
  const dozvoljeni = new Set<string>(projektiRadnogDela());
  const s = plan();
  const izJa = (poziv(FIXTURES_PROSTOR_JA, api.prostor.tasks.listEverywhere, { scope: "all" }) as
    | R<typeof api.prostor.tasks.listEverywhere>
    | undefined)?.items ?? [];
  const zadaci = [...izJa, ...sopstveni().map((z) => ({ ...z, ...s.izmene.get(z._id) }))].filter((z) =>
    dozvoljeni.has(z.workspace._id),
  ) satisfies Zadatak[];
  const licni = ((poziv(FIXTURES_PROSTOR_JA, api.prostor.personalTasks.list, { status: "all" }) as
    | R<typeof api.prostor.personalTasks.list>
    | undefined)?.items ?? []
  ).map(
    (z): Licni => ({
      _id: z._id,
      title: z.title,
      notes: z.notes,
      status: z.status,
      priority: z.priority,
      dueDate: z.dueDate,
      sortAt: z.sortAt,
      completedAt: z.completedAt,
      createdAt: z.createdAt,
      updatedAt: z.updatedAt,
    }),
  );
  const postoji = new Set<string>([...zadaci.map((z) => `task:${z._id}`), ...licni.map((z) => `personal:${z._id}`)]);
  return {
    dayKey,
    tasks: zadaci,
    personal: licni,
    entries: s.plan
      .filter((e) => postoji.has(e.refKey))
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ ...e, dayKey })),
    history: s.istorija
      .filter((e) => postoji.has(e.refKey))
      .sort((a, b) => a.danaRanije - b.danaRanije)
      .map(({ danaRanije, ...e }) => ({ ...e, dayKey: addDaysToKey(dayKey, -danaRanije) })),
    workspaces: projektiRadnogDela().map(mini),
    capped: { tasks: stanjeUx === "pretrpan", personal: false, history: false },
  };
}

function refIz(refKey: string): RM<typeof api.prostor.myDay.unplan>["ref"] {
  const [kind, id] = [refKey.slice(0, refKey.indexOf(":")), refKey.slice(refKey.indexOf(":") + 1)];
  return kind === "task"
    ? { kind: "task", taskPageId: id as Id<"pages"> }
    : { kind: "personal", personalTaskId: id as Id<"personalTasks"> };
}

function dodajUPlan(a: Record<string, unknown>): RM<typeof api.prostor.myDay.plan> {
  const s = plan();
  const ref = a.ref as { kind: "task"; taskPageId: string } | { kind: "personal"; personalTaskId: string };
  const id = ref.kind === "task" ? ref.taskPageId : ref.personalTaskId;
  const refKey = `${ref.kind}:${id}`;
  const postojeci = s.plan.find((e) => e.refKey === refKey);
  if (postojeci) return { entryId: postojeci._id, created: false };
  const poslednja = s.plan.reduce((max, e) => Math.max(max, e.position), 0);
  const nov = unos(++s.brojac, { kind: ref.kind, id }, typeof a.position === "number" ? a.position : poslednja + 1024);
  s.plan.push(nov);
  return { entryId: nov._id, created: true };
}

function ukloniIzPlana(a: Record<string, unknown>): RM<typeof api.prostor.myDay.unplan> {
  const s = plan();
  const i = s.plan.findIndex((e) => e._id === a.entryId);
  const [stari] = i === -1 ? [] : s.plan.splice(i, 1);
  const refKey = stari?.refKey ?? "personal:nema";
  return { dayKey: kljucDana(now), refKey, ref: refIz(refKey), position: stari?.position ?? 0 };
}

function preuredi(a: Record<string, unknown>): RM<typeof api.prostor.myDay.reorder> {
  const s = plan();
  const ids = Array.isArray(a.entryIds) ? (a.entryIds as string[]) : [];
  ids.forEach((id, i) => {
    const e = s.plan.find((x) => x._id === id);
    if (e) e.position = (i + 1) * 1024;
  });
  return null;
}

function vratiURedPlana(a: Record<string, unknown>): RM<typeof api.prostor.myDay.carryOver> {
  const s = plan();
  const kljucevi = new Set(Array.isArray(a.refKeys) ? (a.refKeys as string[]) : []);
  let moved = 0;
  for (const e of s.istorija.filter((x) => kljucevi.has(x.refKey))) {
    if (!s.plan.some((p) => p.refKey === e.refKey)) {
      const poslednja = s.plan.reduce((max, p) => Math.max(max, p.position), 0);
      const { danaRanije: _dana, ...ostalo } = e;
      void _dana;
      s.plan.push({ ...ostalo, _id: fakeId("myDayEntries", ++s.brojac), position: poslednja + 1024 });
      moved += 1;
    }
  }
  s.istorija = s.istorija.filter((x) => !kljucevi.has(x.refKey));
  return { moved };
}

function skloniStaro(a: Record<string, unknown>): RM<typeof api.prostor.myDay.clearOld> {
  const s = plan();
  const pre = s.istorija.length;
  s.istorija = Array.isArray(a.refKeys) ? s.istorija.filter((x) => !(a.refKeys as string[]).includes(x.refKey)) : [];
  return { removed: pre - s.istorija.length };
}

/** Kvačica, rok i prioritet: svoje zadatke menja ovde, ostale prosleđuje fiksturi „Ja“. */
function izmeniZadatak(a: Record<string, unknown>): unknown {
  const id = String(a.pageId);
  if (!sopstveni().some((z) => z._id === id)) {
    return poziv(FIXTURES_PROSTOR_JA, api.prostor.tasks.updateMetadata, a) ?? a.pageId;
  }
  const s = plan();
  const izmena: Partial<Zadatak> = { ...s.izmene.get(id) };
  if (typeof a.status === "string") {
    izmena.taskStatus = a.status as Zadatak["taskStatus"];
    izmena.completedAt = a.status === "done" ? Date.now() : null;
  }
  if (a.priority !== undefined) izmena.taskPriority = a.priority as Zadatak["taskPriority"];
  if (a.dueDate !== undefined) izmena.dueDate = a.dueDate as number | null;
  s.izmene.set(id, izmena);
  return a.pageId;
}

// ── Desna kolona: posmatrač nema radni deo projekta ──────────────────────────

const bezPosmatranog = (workspaceId: unknown) => !(stanjeUx === "posmatrac" && workspaceId === WS_KLIJENT);

function feed(a: Record<string, unknown>): unknown {
  const rez = poziv(FIXTURES_PROSTOR_INBOX, api.prostor.inbox.feed, a) as R<typeof api.prostor.inbox.feed> | undefined;
  if (!rez) return rez;
  if (stanjeUx === "bez-projekata") return { ...rez, page: rez.page.filter((s) => s.workspace === null) };
  return { ...rez, page: rez.page.filter((s) => bezPosmatranog(s.workspace?._id)) };
}

function neprocitano(a: Record<string, unknown>): unknown {
  const rez = poziv(FIXTURES_PROSTOR_INBOX, api.prostor.inbox.unreadCounts, a) as
    | R<typeof api.prostor.inbox.unreadCounts>
    | undefined;
  if (!rez) return rez;
  const dozvoljeni = new Set<string>(projektiRadnogDela());
  const byStartup = rez.byStartup.filter((b) => dozvoljeni.has(b.workspaceId));
  const ukupno = rez.personal.count + byStartup.reduce((zbir, b) => zbir + b.count, 0);
  return { ...rez, byStartup, total: { ...rez.total, count: ukupno } };
}

function cekaGlas(a: Record<string, unknown>): unknown {
  const rez = poziv(FIXTURES_PROSTOR_INBOX, api.prostor.inbox.pending, a) as R<typeof api.prostor.inbox.pending> | undefined;
  if (!rez) return rez;
  const dozvoljeni = new Set<string>(projektiRadnogDela());
  return { ...rez, items: rez.items.filter((s) => dozvoljeni.has(s.workspace._id)) };
}

function poruke(a: Record<string, unknown>): unknown {
  const rez = poziv(FIXTURES_PROSTOR_OSNOVA, api.prostor.chat.unreadSummary, a) as
    | R<typeof api.prostor.chat.unreadSummary>
    | undefined;
  if (!rez) return rez;
  const dozvoljeni = new Set<string>(projektiRadnogDela());
  const byStartup = rez.byStartup.filter((b) => dozvoljeni.has(b.workspaceId));
  const zbir = (polje: "unreadCount" | "mentionCount") =>
    rez.personal[polje] + byStartup.reduce((ukupno, b) => ukupno + b[polje], 0);
  return { ...rez, byStartup, total: { unreadCount: zbir("unreadCount"), mentionCount: zbir("mentionCount") } };
}

// ── Registar ─────────────────────────────────────────────────────────────────

export const FIXTURES_PROSTOR_DANAS: Record<string, Fixture> = {
  [getFunctionName(api.projekti.mojiProjekti)]: () => mojiProjekti(),
  [getFunctionName(api.prostor.projekat.listForCurrent)]: () => {
    const dozvoljeni = new Set<string>(projektiRadnogDela());
    return { page: PROJEKTI.filter((p) => dozvoljeni.has(p._id)), isDone: true, continueCursor: "kraj" };
  },
  [getFunctionName(api.projekti.stanjeProjekata)]: (a) =>
    stanjeUx === "bez-projekata" ? [] : FIXTURES_STANJE_PRE?.(a),
  [getFunctionName(api.prostor.myDay.overview)]: (a) => pregled(a),
  [getFunctionName(api.prostor.myDay.plan)]: (a) => dodajUPlan(a),
  [getFunctionName(api.prostor.myDay.unplan)]: (a) => ukloniIzPlana(a),
  [getFunctionName(api.prostor.myDay.reorder)]: (a) => preuredi(a),
  [getFunctionName(api.prostor.myDay.carryOver)]: (a) => vratiURedPlana(a),
  [getFunctionName(api.prostor.myDay.clearOld)]: (a) => skloniStaro(a),
  [getFunctionName(api.prostor.tasks.updateMetadata)]: (a) => izmeniZadatak(a),
  [getFunctionName(api.prostor.inbox.feed)]: (a) => feed(a),
  [getFunctionName(api.prostor.inbox.unreadCounts)]: (a) => neprocitano(a),
  [getFunctionName(api.prostor.inbox.pending)]: (a) => cekaGlas(a),
  [getFunctionName(api.prostor.chat.unreadSummary)]: (a) => poruke(a),
};

/** Prethodni odgovor za `stanjeProjekata` (zvono „Ja“); postavlja ga registar u `fixtures.ts`. */
let FIXTURES_STANJE_PRE: Fixture | undefined;
export function postaviPrethodnoStanjeProjekata(fx: Fixture | undefined): void {
  FIXTURES_STANJE_PRE = fx;
}
