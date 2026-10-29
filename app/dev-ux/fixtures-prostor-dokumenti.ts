/**
 * Razvojni prikaz: dokumenti radnog dela (SPAJANJE S10, plan S07 §8.1–§8.2).
 *
 * Oblasti, stablo stranica, oblast (Pregled, Dokumenti) i stranica kao
 * dokument tima. Sadržaj je po uzoru na Devotion izlog (`area.ts`,
 * `page-document.ts`), sa lažnim ljudima iz `fixtures-prostor-osnova.ts`.
 *
 * Adrese (hub, projekat „Enigma IT“):
 *   /enigma-it/dokumenti?ux=1                     → spisak oblasti
 *   /enigma-it/dokumenti/<OBLAST_UX>?ux=1         → oblast „Razvoj“
 *   /enigma-it/stranica/<STRANICA_UX>?ux=1        → „Endpointi za plaćanje“
 * `&prazno=1` daje oblasti bez stranica i prazan opis.
 */
import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { type Fixture, type R, WS, now, DAY, HOUR } from "./fixtures-util";
import { fakeId, OBLASTI, PROFILI, PROJEKTI, strana } from "./fixtures-prostor-osnova";

type Stranica = Doc<"pages">;
type Detalj = R<typeof api.prostor.pages.get>;
type Kind = Stranica["kind"];

const [JA, ANA, MARKO, MILICA] = PROFILI;
const [RAZVOJ, MARKETING, PRODAJA] = OBLASTI;

/** Stranica sa dokumentom i podstranicama: `/enigma-it/stranica/<STRANICA_UX>?ux=1`. */
export const STRANICA_UX = fakeId("pages", 101);

const SADRZAJ_PLACANJA = `
<h2>Šta pravimo</h2>
<p>Tri endpointa za naplatu porudžbine: kreiranje naplate, potvrda i povraćaj. Provajder šalje webhook posle svake promene statusa.</p>
<ul>
  <li><p><code>POST /naplata</code> — pravi naplatu i vraća link za plaćanje</p></li>
  <li><p><code>POST /naplata/potvrda</code> — prima webhook i menja status porudžbine</p></li>
  <li><p><code>POST /naplata/povracaj</code> — delimičan ili pun povraćaj</p></li>
</ul>
<h2>Otvorena pitanja</h2>
<p>Limit po kartici za prvi mesec i koliko dugo čuvamo neuspele pokušaje.</p>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Izabrati provajdera</p></div></li>
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Dogovoriti limit sa bankom</p></div></li>
</ul>
`.trim();

const SADRZAJ_OPSTI = "<p>Kratke beleške tima. Dopuni kad nešto odlučimo.</p>";

type Seme = {
  n: number;
  oblast: Doc<"areas">;
  roditelj: number | null;
  kind: Kind;
  naslov: string;
  autor: (typeof PROFILI)[number];
  urednik: (typeof PROFILI)[number];
  pre: number;
  zakljucana?: boolean;
  sadrzaj?: string;
};

const SEME: Seme[] = [
  { n: 100, oblast: RAZVOJ, roditelj: null, kind: "note", naslov: "Lansiranje sajta", autor: JA, urednik: ANA, pre: 3 * DAY },
  { n: 101, oblast: RAZVOJ, roditelj: 100, kind: "note", naslov: "Endpointi za plaćanje", autor: ANA, urednik: MARKO, pre: 40 * 60_000, sadrzaj: SADRZAJ_PLACANJA },
  { n: 102, oblast: RAZVOJ, roditelj: 101, kind: "note", naslov: "Webhook tok", autor: ANA, urednik: ANA, pre: 2 * DAY },
  { n: 103, oblast: RAZVOJ, roditelj: 101, kind: "table", naslov: "Cene provizija po kartici", autor: MILICA, urednik: MILICA, pre: 2 * HOUR, zakljucana: true },
  { n: 104, oblast: RAZVOJ, roditelj: 100, kind: "note", naslov: "Kontrolna lista pre objave", autor: JA, urednik: JA, pre: 5 * DAY },
  { n: 105, oblast: RAZVOJ, roditelj: null, kind: "note", naslov: "Arhitektura panela", autor: MARKO, urednik: MARKO, pre: 9 * DAY },
  { n: 106, oblast: RAZVOJ, roditelj: null, kind: "task", naslov: "Testiraj povraćaj u sandboxu", autor: MARKO, urednik: MARKO, pre: DAY },
  { n: 107, oblast: RAZVOJ, roditelj: null, kind: "file", naslov: "Ugovori sa provajderom", autor: JA, urednik: JA, pre: 12 * DAY },
  { n: 110, oblast: MARKETING, roditelj: null, kind: "note", naslov: "Plan objava za novembar", autor: MILICA, urednik: ANA, pre: 6 * HOUR },
  { n: 111, oblast: MARKETING, roditelj: null, kind: "note", naslov: "Kampanja za otvaranje", autor: ANA, urednik: ANA, pre: 4 * DAY },
  { n: 120, oblast: PRODAJA, roditelj: null, kind: "note", naslov: "Skripta za prvi poziv", autor: JA, urednik: JA, pre: 2 * DAY },
];

const id = (n: number) => fakeId("pages", n);

function stranica(seme: Seme, pozicija: number): Stranica {
  const izmena = now - seme.pre;
  const nastao = izmena - 7 * DAY;
  const zadatak = seme.kind === "task";
  return {
    _id: id(seme.n),
    _creationTime: nastao,
    workspaceId: WS,
    areaId: seme.oblast._id,
    parentPageId: seme.roditelj === null ? null : id(seme.roditelj),
    kind: seme.kind,
    title: seme.naslov,
    searchText: seme.naslov.toLowerCase(),
    revision: 4,
    position: pozicija,
    taskStatus: zadatak ? "next" : null,
    taskPriority: zadatak ? "medium" : null,
    assigneeProfileId: zadatak ? seme.autor._id : null,
    dueDate: zadatak ? now + 2 * DAY : null,
    taskSortAt: nastao,
    createdByProfileId: seme.autor._id,
    updatedByProfileId: seme.urednik._id,
    lockedAt: seme.zakljucana ? izmena : null,
    lockedByProfileId: seme.zakljucana ? seme.autor._id : null,
    archivedAt: null,
    createdAt: nastao,
    updatedAt: izmena,
  };
}

const STRANICE: Stranica[] = SEME.map((seme) => {
  const brat = SEME.filter((s) => s.oblast._id === seme.oblast._id && s.roditelj === seme.roditelj);
  return stranica(seme, brat.indexOf(seme));
});
const SEME_PO_ID = new Map(SEME.map((s) => [id(s.n) as string, s]));

const sazetak = (p: (typeof PROFILI)[number]) => ({ _id: p._id, displayName: p.displayName, avatarUrl: p.avatarUrl });

function detalj(pageId: string): Detalj | undefined {
  const red = STRANICE.find((s) => s._id === pageId);
  const seme = SEME_PO_ID.get(pageId);
  if (!red || !seme) return undefined;
  const zakljucana = seme.zakljucana === true;
  const autor = seme.autor._id === JA._id;
  return {
    ...red,
    content: seme.sadrzaj ?? (seme.kind === "note" ? SADRZAJ_OPSTI : ""),
    creator: seme.autor,
    updater: seme.urednik,
    assignee: null,
    assignees: [],
    lockedBy: zakljucana ? sazetak(seme.autor) : null,
    permissions: {
      canEdit: !zakljucana || autor,
      canEditBody: !zakljucana || autor,
      canMove: !zakljucana || autor,
      canResize: true,
      canDetach: red.parentPageId !== null,
      canDeleteDirectly: true,
      canRequestDeletion: false,
      canArchive: !zakljucana || autor,
      canChangeStatus: true,
      canLock: !zakljucana,
      canUnlock: zakljucana && autor,
      canComment: true,
      canRestoreRevision: !zakljucana || autor,
      isLocked: zakljucana,
    },
  } satisfies Detalj;
}

function deca(areaId: unknown, parentPageId: unknown, kind?: unknown) {
  return STRANICE.filter(
    (s) =>
      s.areaId === areaId &&
      s.parentPageId === (parentPageId ?? null) &&
      (kind === undefined || s.kind === kind),
  );
}

function preci(pageId: string) {
  const lanac: Array<{ _id: Id<"pages">; title: string; kind: Kind }> = [];
  let tekuca = STRANICE.find((s) => s._id === pageId);
  while (tekuca) {
    lanac.push({ _id: tekuca._id, title: tekuca.title, kind: tekuca.kind });
    const roditelj = tekuca.parentPageId;
    tekuca = roditelj === null ? undefined : STRANICE.find((s) => s._id === roditelj);
  }
  return lanac.reverse() satisfies R<typeof api.prostor.pages.getBreadcrumbs>;
}

const OPISI: Record<string, { tekst: string; urednik: (typeof PROFILI)[number]; pre: number }> = {
  [RAZVOJ._id]: {
    tekst:
      "Sajt, panel i integracije. Ovog meseca je prioritet naplata: endpointi, webhook i povraćaj, pa lansiranje.",
    urednik: ANA,
    pre: 3 * HOUR,
  },
  [MARKETING._id]: {
    tekst: "Objave, kampanje i saradnje. Plan za mesec stoji u prvoj stranici.",
    urednik: MILICA,
    pre: 2 * DAY,
  },
};

function opisOblasti(areaId: unknown, prazno: boolean): R<typeof api.prostor.areasV2.getAreaBody> {
  const oblast = OBLASTI.find((o) => o._id === areaId) ?? RAZVOJ;
  const opis = prazno ? undefined : OPISI[oblast._id];
  return {
    areaId: oblast._id,
    label: oblast.label,
    content: opis?.tekst ?? "",
    revision: opis ? 3 : 0,
    updatedAt: opis ? now - opis.pre : null,
    lastEditor: opis ? sazetak(opis.urednik) : null,
    permissions: { canEdit: true, canComment: true },
  };
}

function nedavne(areaId: unknown, limit: unknown) {
  const n = typeof limit === "number" ? limit : 8;
  return STRANICE.filter((s) => s.areaId === areaId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, n)
    .map((s) => {
      const urednik = PROFILI.find((p) => p._id === s.updatedByProfileId) ?? JA;
      // Sažetak stranice (`pageSummaryValidator`): opciona polja zadatka se šalju i prazna.
      return {
        ...s,
        instructions: s.instructions,
        checkpoints: s.checkpoints,
        checkpointTotal: s.checkpointTotal,
        checkpointCompleted: s.checkpointCompleted,
        checkpointRevision: s.checkpointRevision,
        completedAt: s.completedAt ?? null,
        lockedAt: s.lockedAt ?? null,
        updatedBy: sazetak(urednik),
      };
    }) satisfies R<typeof api.prostor.pages.recentForArea>;
}

function brojeviNaVrhu(prazno: boolean): R<typeof api.prostor.pages.areaTopLevelCounts> {
  return OBLASTI.map((oblast) => ({
    areaId: oblast._id,
    count: prazno ? 0 : deca(oblast._id, null).length,
    capped: false,
  }));
}

function brojDece(parentPageIds: unknown): R<typeof api.prostor.pages.childCounts> {
  const ids = Array.isArray(parentPageIds) ? (parentPageIds as Id<"pages">[]) : [];
  return ids.map((pageId) => ({
    pageId,
    count: STRANICE.filter((s) => s.parentPageId === pageId).length,
    capped: false,
  }));
}

function projekatZa(workspaceId: unknown): R<typeof api.prostor.projekat.get> {
  return PROJEKTI.find((p) => p._id === workspaceId) ?? PROJEKTI[0];
}

const NOVA_STRANICA = fakeId("pages", 199);

export const FIXTURES_PROSTOR_DOKUMENTI: Record<string, Fixture> = {
  [getFunctionName(api.prostor.projekat.get)]: (a) => projekatZa(a.workspaceId),
  [getFunctionName(api.prostor.pages.listChildren)]: (a) =>
    strana(deca(a.areaId, a.parentPageId, a.kind)),
  [getFunctionName(api.prostor.pages.childCounts)]: (a) => brojDece(a.parentPageIds),
  [getFunctionName(api.prostor.pages.areaTopLevelCounts)]: () => brojeviNaVrhu(false),
  [getFunctionName(api.prostor.pages.recentForArea)]: (a) => nedavne(a.areaId, a.limit),
  [getFunctionName(api.prostor.pages.get)]: (a) => detalj(String(a.pageId)),
  [getFunctionName(api.prostor.pages.getBreadcrumbs)]: (a) => preci(String(a.pageId)),
  [getFunctionName(api.prostor.areasV2.getAreaBody)]: (a) => opisOblasti(a.areaId, false),
  [getFunctionName(api.prostor.areasV2.resolveRoute)]: (a) =>
    a.pageId && detalj(String(a.pageId)) ? { kind: "page", pageId: a.pageId } : null,
  // Broj zadataka u zaglavlju oblasti; spisak zadataka puni ekran zadataka.
  [getFunctionName(api.prostor.tasks.listForArea)]: () => strana([]),
  [getFunctionName(api.prostor.pageFiles.list)]: () => [],
  // Mutacije koje vraćaju vrednost (lažni klijent nema bazu, pa se ništa ne upisuje).
  [getFunctionName(api.prostor.areasV2.updatePage)]: (a) => ({
    revision: (typeof a.expectedRevision === "number" ? a.expectedRevision : 0) + 1,
    updatedAt: Date.now(),
  }),
  [getFunctionName(api.prostor.areasV2.updateAreaBody)]: (a) => ({
    revision: (typeof a.expectedRevision === "number" ? a.expectedRevision : 0) + 1,
  }),
  [getFunctionName(api.prostor.areasV2.createPage)]: () => ({
    pageId: NOVA_STRANICA,
    nestingStatus: "none",
    requestId: null,
  }),
  [getFunctionName(api.prostor.areasV2.movePage)]: () => ({ requestId: null, nestingStatus: "none" }),
  [getFunctionName(api.prostor.areasV2.detachPage)]: () => ({ status: "detached" }),
  [getFunctionName(api.prostor.projekat.createArea)]: () => OBLASTI[3]._id,
  [getFunctionName(api.prostor.projekat.updateArea)]: (a) => a.areaId,
  [getFunctionName(api.prostor.projekat.reorderAreas)]: () => true,
};

/** `&prazno=1`: oblasti bez stranica i bez opisa (prazna stanja stabla i oblasti). */
export const PRAZNO_PROSTOR_DOKUMENTI: Record<string, Fixture> = {
  [getFunctionName(api.prostor.pages.listChildren)]: () => strana([]),
  [getFunctionName(api.prostor.pages.childCounts)]: () => [],
  [getFunctionName(api.prostor.pages.areaTopLevelCounts)]: () => brojeviNaVrhu(true),
  [getFunctionName(api.prostor.pages.recentForArea)]: () => [],
  [getFunctionName(api.prostor.areasV2.getAreaBody)]: (a) => opisOblasti(a.areaId, true),
  [getFunctionName(api.prostor.tasks.listForArea)]: () => strana([]),
};
