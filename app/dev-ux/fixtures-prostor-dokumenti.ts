/**
 * Razvojni prikaz: dokumenti radnog dela (SPAJANJE S10, plan S07 §8.1–§8.2).
 *
 * Oblasti, stablo stranica, oblast (Pregled, Dokumenti) i stranica kao
 * dokument tima. Sadržaj je po uzoru na Devotion izlog (`area.ts`,
 * `page-document.ts`), sa lažnim ljudima iz `fixtures-prostor-osnova.ts`.
 * Od S11 i saradnja oko stranice: komentari, istorija izmena, prisustvo,
 * fajlovi, tabela, veze među stranicama i zaključavanje.
 *
 * Adrese (hub, projekat „Enigma IT“):
 *   /enigma-it/dokumenti?ux=1                     → spisak oblasti
 *   /enigma-it/dokumenti/<OBLAST_UX>?ux=1         → oblast „Razvoj“
 *   /enigma-it/stranica/<STRANICA_UX>?ux=1        → „Endpointi za plaćanje“
 *   /enigma-it/stranica/<TABELA_UX>?ux=1          → tabela „Cene provizija po kartici“
 *   /enigma-it/stranica/<FAJL_UX>?ux=1            → fajlovi „Ugovori sa provajderom“
 * `&prazno=1` daje oblasti bez stranica i prazan opis, a stranice bez
 * komentara, istorije, prisustva, fajlova i redova tabele.
 */
import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { serializeComment } from "@/lib/prostor/mentions";
import { htmlToPlainText } from "@/lib/prostor/revisions";
import { type Fixture, type R, WS, now, DAY, HOUR } from "./fixtures-util";
import { fakeId, OBLASTI, PROFILI, PROJEKTI, strana } from "./fixtures-prostor-osnova";

type Stranica = Doc<"pages">;
type Detalj = R<typeof api.prostor.pages.get>;
type Kind = Stranica["kind"];
/** Povratna vrednost mutacije: ista provera ugovora kao `R` za upite. */
type RM<M extends FunctionReference<"mutation">> = FunctionReturnType<M>;

const [JA, ANA, MARKO, MILICA] = PROFILI;
const [RAZVOJ, MARKETING, PRODAJA] = OBLASTI;

/** Stranica sa dokumentom i podstranicama: `/enigma-it/stranica/<STRANICA_UX>?ux=1`. */
export const STRANICA_UX = fakeId("pages", 101);
/** Tabela „Cene provizija po kartici“ (nije zaključana): `/enigma-it/stranica/<TABELA_UX>?ux=1`. */
export const TABELA_UX = fakeId("pages", 103);
/** Stranica sa fajlovima „Ugovori sa provajderom“: `/enigma-it/stranica/<FAJL_UX>?ux=1`. */
export const FAJL_UX = fakeId("pages", 107);

const SADRZAJ_PLACANJA = `
<h2>Šta pravimo</h2>
<p>Tri endpointa za naplatu porudžbine: kreiranje naplate, potvrda i povraćaj. Provajder šalje webhook posle svake promene statusa.</p>
<ul>
  <li><p><code>POST /naplata</code> — pravi naplatu i vraća link za plaćanje</p></li>
  <li><p><code>POST /naplata/potvrda</code> — prima webhook i menja status porudžbine</p></li>
  <li><p><code>POST /naplata/povracaj</code> — delimičan ili pun povraćaj</p></li>
</ul>
<div data-note-file="" data-file-id="pageFilesux0105" data-category="image" data-name="Šema-naplate.svg" data-size="1480">Šema-naplate.svg</div>
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
  { n: 103, oblast: RAZVOJ, roditelj: 101, kind: "table", naslov: "Cene provizija po kartici", autor: MILICA, urednik: MILICA, pre: 2 * HOUR },
  { n: 104, oblast: RAZVOJ, roditelj: 100, kind: "note", naslov: "Kontrolna lista pre objave", autor: MILICA, urednik: MILICA, pre: 5 * DAY, zakljucana: true },
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

// ── Saradnja oko stranice (S11) ──────────────────────────────────────────────

type Osoba = (typeof PROFILI)[number];
type VrstaCilja = R<typeof api.prostor.comments.list>["page"][number]["targetKind"];

const VRSTE_CILJA: readonly string[] = ["page", "idea", "area", "task_checkpoint"] satisfies readonly VrstaCilja[];

/** Cilj komentara ili istorije iz argumenta upita (`{ kind, id }`); sve ostalo je `null`. */
function ciljIzArgumenta(cilj: unknown): { kind: VrstaCilja; id: string } | null {
  if (typeof cilj !== "object" || cilj === null) return null;
  const { kind, id: ciljId } = cilj as { kind?: unknown; id?: unknown };
  if (typeof kind !== "string" || typeof ciljId !== "string" || !VRSTE_CILJA.includes(kind)) return null;
  return { kind: kind as VrstaCilja, id: ciljId };
}

// Komentari. Sadržaj ide kroz `serializeComment`, pa je u tačno onom obliku koji
// čuva backend (`<p>` po redu, pomenuti član kao `<span data-mention-id>`).

type Komentar = R<typeof api.prostor.comments.list>["page"][number];

type SemeKomentara = {
  n: number;
  autor: Osoba;
  tekst: string;
  pomenuti?: Osoba[];
  pre: number;
  izmenjen?: boolean;
};

/** Komentari stranice „Endpointi za plaćanje“, od najstarijeg ka najnovijem. */
const KOMENTARI_STRANICE: SemeKomentara[] = [
  {
    n: 1,
    autor: ANA,
    tekst:
      "Prvi nacrt endpointa je gore. Webhook tok sam opisala na podstranici, pa @Marko Proba pogledaj da li fali neki status.",
    pomenuti: [MARKO],
    pre: 2 * DAY - 2 * HOUR,
  },
  {
    n: 2,
    autor: MARKO,
    tekst: "Fali status za delimičan povraćaj. Dodaću ga u tabelu provizija sa podstranice.",
    pre: DAY + 18 * HOUR,
    izmenjen: true,
  },
  {
    n: 3,
    autor: JA,
    tekst: "Limit po kartici za prvi mesec dogovaram sa bankom ovog petka.\nBez toga ne možemo da pustimo plaćanje uživo.",
    pre: 20 * HOUR,
  },
  {
    n: 4,
    autor: MILICA,
    tekst: "@Test Korisnik kad banka potvrdi limit, upiši ga u otvorena pitanja pa ću ažurirati cene u tabeli.",
    pomenuti: [JA],
    pre: 3 * HOUR,
  },
];

/** Komentari opisa oblasti „Razvoj“. */
const KOMENTARI_OBLASTI: SemeKomentara[] = [
  {
    n: 11,
    autor: MILICA,
    tekst: "Prioritet ovog meseca je naplata. Marketing čeka datum lansiranja da zakaže objave.",
    pre: DAY,
  },
  {
    n: 12,
    autor: ANA,
    tekst: "Datum lansiranja znamo tek kad banka potvrdi limit. @Marko Proba da li ide sandbox test pre toga?",
    pomenuti: [MARKO],
    pre: 5 * HOUR,
  },
];

function komentar(seme: SemeKomentara, targetKind: VrstaCilja, targetId: string): Komentar {
  const { content, mentionProfileIds } = serializeComment(
    seme.tekst,
    (seme.pomenuti ?? []).map((osoba) => ({ profileId: osoba._id, displayName: osoba.displayName })),
  );
  const nastao = now - seme.pre;
  const moj = seme.autor._id === JA._id;
  return {
    _id: fakeId("contentContributions", seme.n),
    targetKind,
    targetId,
    content,
    mentions: mentionProfileIds.flatMap((profileId) => {
      const osoba = PROFILI.find((p) => p._id === profileId);
      return osoba ? [sazetak(osoba)] : [];
    }),
    author: sazetak(seme.autor),
    origin: "comment",
    moderationStatus: "approved",
    createdAt: nastao,
    updatedAt: seme.izmenjen ? nastao + 25 * 60_000 : nastao,
    edited: seme.izmenjen === true,
    // Svoje komentare menjam i uklanjam; tuđe samo čitam.
    permissions: { canEdit: moj, canRemove: moj },
  };
}

function komentariZa(cilj: unknown): Komentar[] {
  const c = ciljIzArgumenta(cilj);
  if (c?.kind === "page" && c.id === STRANICA_UX) {
    return KOMENTARI_STRANICE.map((seme) => komentar(seme, "page", c.id));
  }
  if (c?.kind === "area" && c.id === RAZVOJ._id) {
    return KOMENTARI_OBLASTI.map((seme) => komentar(seme, "area", c.id));
  }
  return [];
}

function brojKomentara(targets: unknown): R<typeof api.prostor.comments.countFor> {
  const lista = Array.isArray(targets) ? (targets as unknown[]) : [];
  return lista.flatMap((cilj) => {
    const c = ciljIzArgumenta(cilj);
    return c ? [{ targetKind: c.kind, targetId: c.id, count: komentariZa(cilj).length, capped: false }] : [];
  });
}

// Istorija izmena. Najnovija revizija je prva; isečak je tekst bez HTML-a.

type Revizija = R<typeof api.prostor.history.list>["page"][number];

type SemeRevizije = {
  n: number;
  autor: Osoba;
  vrsta: Revizija["kind"];
  pre: number;
  sadrzaj: string;
  /** Broj revizije iz koje je ova vraćena (samo za vrstu „restore“). */
  vracenaIz?: number;
};

type IstorijaCilja = {
  targetKind: "page" | "area";
  targetId: string;
  naslov: string;
  seme: SemeRevizije[];
};

const izmeni = (...zamene: Array<[string, string]>) =>
  zamene.reduce((html, [staro, novo]) => html.replace(staro, novo), SADRZAJ_PLACANJA);

const PLAN_PLACANJA = `
<h2>Plan</h2>
<p>Endpointi za naplatu porudžbine. Provajder šalje webhook posle svake promene statusa.</p>
<ul>
  <li><p><code>POST /naplata</code> — pravi naplatu</p></li>
  <li><p><code>POST /naplata/potvrda</code> — prima webhook</p></li>
</ul>
<h2>Otvorena pitanja</h2>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Izabrati provajdera</p></div></li>
</ul>
`.trim();

const REVIZIJE_STRANICE: SemeRevizije[] = [
  {
    n: 1,
    autor: MARKO,
    vrsta: "edit",
    pre: 40 * 60_000,
    sadrzaj: izmeni([
      "Limit po kartici za prvi mesec i koliko dugo čuvamo neuspele pokušaje.",
      "Limit po kartici za prvi mesec dogovaramo sa bankom. Ostaje rok čuvanja neuspelih pokušaja.",
    ]),
  },
  {
    n: 2,
    autor: ANA,
    vrsta: "edit",
    pre: 3 * HOUR,
    sadrzaj: izmeni(["delimičan ili pun povraćaj", "pun povraćaj"]),
  },
  {
    n: 3,
    autor: JA,
    vrsta: "restore",
    pre: 26 * HOUR,
    sadrzaj: PLAN_PLACANJA,
    vracenaIz: 5,
  },
  {
    n: 4,
    autor: ANA,
    vrsta: "edit",
    pre: 30 * HOUR,
    sadrzaj: izmeni(
      ["Tri endpointa", "Dva endpointa"],
      ["kreiranje naplate, potvrda i povraćaj", "kreiranje naplate i potvrda"],
      ["<li><p><code>POST /naplata/povracaj</code> — delimičan ili pun povraćaj</p></li>", ""],
    ),
  },
  {
    n: 5,
    autor: MARKO,
    vrsta: "edit",
    pre: 4 * DAY,
    sadrzaj: PLAN_PLACANJA,
  },
  {
    n: 6,
    autor: ANA,
    vrsta: "baseline",
    pre: 4 * DAY + 5 * HOUR,
    sadrzaj: "<p>Beleške o plaćanju. Popuniti kad izaberemo provajdera.</p>",
  },
];

const REVIZIJE_OBLASTI: SemeRevizije[] = [
  {
    n: 11,
    autor: ANA,
    vrsta: "edit",
    pre: 3 * HOUR,
    sadrzaj: OPISI[RAZVOJ._id].tekst,
  },
  {
    n: 12,
    autor: MARKO,
    vrsta: "edit",
    pre: 2 * DAY,
    sadrzaj: "Sajt, panel i integracije. Prioritet ovog meseca je lansiranje sajta.",
  },
  {
    n: 13,
    autor: JA,
    vrsta: "baseline",
    pre: 6 * DAY,
    sadrzaj: "Sajt i panel.",
  },
];

const ISTORIJE: IstorijaCilja[] = [
  { targetKind: "page", targetId: STRANICA_UX, naslov: "Endpointi za plaćanje", seme: REVIZIJE_STRANICE },
  { targetKind: "area", targetId: RAZVOJ._id, naslov: RAZVOJ.label, seme: REVIZIJE_OBLASTI },
];

function istorijaZa(cilj: unknown): IstorijaCilja | null {
  const c = ciljIzArgumenta(cilj);
  if (!c) return null;
  return ISTORIJE.find((i) => i.targetKind === c.kind && i.targetId === c.id) ?? null;
}

function isecak(html: string): string {
  const tekst = htmlToPlainText(html).replace(/\s+/g, " ");
  return tekst.length > 160 ? `${tekst.slice(0, 159).trimEnd()}…` : tekst;
}

function sazetakRevizije(istorija: IstorijaCilja, seme: SemeRevizije): Revizija {
  const vreme = now - seme.pre;
  return {
    _id: fakeId("contentRevisions", seme.n),
    kind: seme.vrsta,
    author: sazetak(seme.autor),
    title: istorija.naslov,
    excerpt: isecak(seme.sadrzaj),
    contentLength: seme.sadrzaj.length,
    restoredFromId: seme.vracenaIz === undefined ? null : fakeId("contentRevisions", seme.vracenaIz),
    createdAt: vreme,
    updatedAt: vreme,
    canRestore: true,
  };
}

function revizijaPoId(revisionId: unknown): R<typeof api.prostor.history.get> | undefined {
  for (const istorija of ISTORIJE) {
    const indeks = istorija.seme.findIndex((s) => fakeId("contentRevisions", s.n) === revisionId);
    if (indeks === -1) continue;
    const seme = istorija.seme[indeks];
    const starija = istorija.seme[indeks + 1];
    return {
      ...sazetakRevizije(istorija, seme),
      content: seme.sadrzaj,
      instructions: null,
      targetKind: istorija.targetKind,
      targetId: istorija.targetId,
      previousRevisionId: starija ? fakeId("contentRevisions", starija.n) : null,
    };
  }
  return undefined;
}

// Prisustvo. Upit ne čita sat, pa su vremena sveža u trenutku poziva (a ne pri
// učitavanju modula): „Marko uređuje“ ostaje vidljivo koliko god prikaz stoji.

function prisutni(pageId: unknown): R<typeof api.prostor.presence.listForPage> {
  if (pageId !== STRANICA_UX) return [];
  const sada = Date.now();
  return [
    {
      profileId: MARKO._id,
      displayName: MARKO.displayName,
      avatarUrl: MARKO.avatarUrl,
      editing: true,
      expiresAt: sada + 5 * 60_000,
      updatedAt: sada - 4_000,
    },
  ];
}

// Fajlovi na stranici. Slika je SVG u `data:` adresi (bez mreže); PDF je mali,
// ispravan jednostrani dokument; tabela i dokument nose običan tekst.

type Fajl = R<typeof api.prostor.pageFiles.list>[number];

/** Dijagram u neutralnim sivim tonovima: tri koraka naplate i stubići ispod. */
function napraviSliku(): string {
  const korak = (x: number) =>
    `<rect x="${x}" y="48" width="160" height="96" rx="10" fill="#2a303c"/>` +
    `<rect x="${x + 16}" y="68" width="88" height="8" rx="4" fill="#7a8294"/>` +
    `<rect x="${x + 16}" y="88" width="120" height="6" rx="3" fill="#4a5262"/>` +
    `<rect x="${x + 16}" y="104" width="72" height="6" rx="3" fill="#4a5262"/>`;
  const stubici = [60, 96, 72, 120, 88, 132, 108]
    .map((visina, i) => `<rect x="${64 + i * 76}" y="${356 - visina}" width="40" height="${visina}" rx="6" fill="#3a4150"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">` +
    `<rect width="640" height="400" rx="16" fill="#1c2029"/>` +
    korak(40) +
    korak(240) +
    korak(440) +
    `<path d="M200 96h40M400 96h40" stroke="#7a8294" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 6"/>` +
    `<path d="M40 356h560" stroke="#4a5262" stroke-width="2"/>` +
    stubici +
    `</svg>`
  );
}

/** Jednostrani PDF sa tabelom pomeraja (`xref`), pa ga otvara svaki čitač. Samo ASCII. */
function napraviPdf(naslov: string): string {
  const tok = `BT /F1 20 Tf 40 340 Td (${naslov}) Tj ET`;
  const objekti = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${tok.length}>>\nstream\n${tok}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let pdf = "%PDF-1.4\n";
  const pomeraji: number[] = [];
  objekti.forEach((objekat, i) => {
    pomeraji.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objekat}\nendobj\n`;
  });
  const tabela = pdf.length;
  pdf += `xref\n0 ${objekti.length + 1}\n0000000000 65535 f \n`;
  pdf += pomeraji.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<</Size ${objekti.length + 1}/Root 1 0 R>>\nstartxref\n${tabela}\n%%EOF`;
  return `data:application/pdf;base64,${btoa(pdf)}`;
}

const SLIKA_SVG = napraviSliku();
const SLIKA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SLIKA_SVG)}`;
const SLIKA_BAJTOVA = new TextEncoder().encode(SLIKA_SVG).length;
const PDF_URL = napraviPdf("Ugovor 2026");
const TABELA_URL = `data:text/csv;charset=utf-8,${encodeURIComponent("Kartica;Provizija\nVisa;1,40 %\nMastercard;1,45 %\nDinaCard;0,90 %\n")}`;
const DOKUMENT_URL = `data:text/plain;charset=utf-8,${encodeURIComponent("Aneks ugovora sa provajderom plaćanja.\n")}`;

const FAJLOVI_UGOVORA: Fajl[] = [
  {
    _id: fakeId("pageFiles", 101),
    name: "Šema-naplate.svg",
    contentType: "image/svg+xml",
    size: SLIKA_BAJTOVA,
    category: "image",
    position: 0,
    url: SLIKA_URL,
    uploadedByProfileId: JA._id,
    createdAt: now - 14 * DAY,
    canManage: true,
  },
  {
    _id: fakeId("pageFiles", 102),
    name: "Ugovor-2026.pdf",
    contentType: "application/pdf",
    size: 482_304,
    category: "pdf",
    position: 1,
    url: PDF_URL,
    uploadedByProfileId: ANA._id,
    createdAt: now - 13 * DAY,
    canManage: true,
  },
  {
    _id: fakeId("pageFiles", 103),
    name: "Provizije-Q3.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 38_912,
    category: "sheet",
    position: 2,
    url: TABELA_URL,
    uploadedByProfileId: MILICA._id,
    createdAt: now - 13 * DAY + 4 * HOUR,
    canManage: true,
  },
  {
    _id: fakeId("pageFiles", 104),
    name: "Aneks-ugovora.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 126_976,
    category: "document",
    position: 3,
    url: DOKUMENT_URL,
    uploadedByProfileId: MARKO._id,
    createdAt: now - 12 * DAY,
    canManage: true,
  },
];

/** Jedna slika u prilogu beleške „Endpointi za plaćanje“. */
const FAJLOVI_BELESKE: Fajl[] = [
  {
    _id: fakeId("pageFiles", 105),
    name: "Šema-naplate.svg",
    contentType: "image/svg+xml",
    size: SLIKA_BAJTOVA,
    category: "image",
    position: 0,
    url: SLIKA_URL,
    uploadedByProfileId: ANA._id,
    createdAt: now - 3 * DAY,
    canManage: true,
  },
];

function fajlovi(pageId: unknown, prazno: boolean): R<typeof api.prostor.pageFiles.list> {
  if (prazno) return [];
  if (pageId === FAJL_UX) return FAJLOVI_UGOVORA;
  if (pageId === STRANICA_UX) return FAJLOVI_BELESKE;
  return [];
}

// Tabela „Cene provizija po kartici“.

type MetaTabele = R<typeof api.prostor.pageTables.getMeta>;
type RedTabele = R<typeof api.prostor.pageTables.listRows>["page"][number];

const KOLONE_TABELE = [
  { id: "kolona-kartica", label: "Kartica" },
  { id: "kolona-provizija", label: "Provizija" },
  { id: "kolona-fiksno", label: "Fiksno" },
  { id: "kolona-napomena", label: "Napomena" },
] satisfies MetaTabele["columns"];

const [KARTICA, PROVIZIJA, FIKSNO, NAPOMENA] = KOLONE_TABELE.map((kolona) => kolona.id);

const CELIJE_TABELE: Array<[string, string, string, string]> = [
  ["Visa", "1,40 %", "0,10 €", "Domaće kartice"],
  ["Mastercard", "1,45 %", "0,10 €", "Domaće kartice"],
  ["Maestro", "1,20 %", "0,08 €", "Debitne kartice"],
  ["DinaCard", "0,90 %", "0,05 €", "Domaća šema, najpovoljnije"],
  ["American Express", "2,60 %", "0,15 €", "Samo na zahtev"],
  ["Visa (inostrane)", "2,10 %", "0,15 €", "Kartice izdate van EU"],
  ["Mastercard (inostrane)", "2,15 %", "0,15 €", "Kartice izdate van EU"],
];

const REDOVI_TABELE: RedTabele[] = CELIJE_TABELE.map(([kartica, provizija, fiksno, napomena], i) => ({
  _id: fakeId("pageTableRows", i + 1),
  rowKey: `red-${i + 1}`,
  position: i,
  cells: { [KARTICA]: kartica, [PROVIZIJA]: provizija, [FIKSNO]: fiksno, [NAPOMENA]: napomena },
}));

function metaTabele(pageId: unknown, prazno: boolean): MetaTabele {
  const tabela = pageId === TABELA_UX;
  return {
    columns: tabela ? [...KOLONE_TABELE] : [],
    revision: tabela ? 3 : 0,
    canEditStructure: true,
    canEditCells: true,
    rowCount: tabela && !prazno ? REDOVI_TABELE.length : 0,
  };
}

// Veze među stranicama.

type StranicaVeze = R<typeof api.prostor.areasV2.listRelations>["candidates"][number];

function stranicaVeze(n: number): StranicaVeze {
  const red = STRANICE.find((s) => s._id === id(n));
  if (!red) throw new Error(`Fiksture: nema stranice ${n}.`);
  return { pageId: red._id, title: red.title, kind: red.kind, parentPageId: red.parentPageId, areaId: red.areaId };
}

/** „Endpointi za plaćanje“ je povezan sa „Arhitekturom panela“ i planom objava (Marketing). */
const VEZE_STRANICE: Array<{ n: number; label: string | null; strana: number }> = [
  { n: 1, label: null, strana: 105 },
  { n: 2, label: "Za objavu u novembru", strana: 110 },
];

/** Redosled ponuđenih stranica; PRODAJA (120) je među prvih pet. */
const KANDIDATI_VEZA = [103, 102, 100, 111, 120, 101, 105, 110];

function vezeStranice(pageId: unknown, prazno: boolean): R<typeof api.prostor.areasV2.listRelations> {
  const relations =
    pageId === STRANICA_UX && !prazno
      ? VEZE_STRANICE.map((veza) => ({
          _id: fakeId("pageRelations", veza.n),
          label: veza.label,
          linkedPage: stranicaVeze(veza.strana),
          canDelete: true,
          canRequestDeletion: false,
        }))
      : [];
  const povezane = new Set(relations.map((relacija) => relacija.linkedPage.pageId));
  const candidates = KANDIDATI_VEZA.filter((n) => id(n) !== pageId && !povezane.has(id(n)))
    .slice(0, 5)
    .map(stranicaVeze);
  return { relations, candidates, candidatesTruncated: false };
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
  [getFunctionName(api.prostor.pageFiles.list)]: (a) => fajlovi(a.pageId, false),
  // Saradnja oko stranice: komentari, istorija, prisustvo, tabela, veze.
  [getFunctionName(api.prostor.comments.list)]: (a) => strana(komentariZa(a.target)),
  [getFunctionName(api.prostor.comments.countFor)]: (a) => brojKomentara(a.targets),
  [getFunctionName(api.prostor.history.list)]: (a) => {
    const istorija = istorijaZa(a.target);
    return strana(istorija ? istorija.seme.map((seme) => sazetakRevizije(istorija, seme)) : []);
  },
  [getFunctionName(api.prostor.history.get)]: (a) => revizijaPoId(a.revisionId),
  [getFunctionName(api.prostor.presence.listForPage)]: (a) => prisutni(a.pageId),
  [getFunctionName(api.prostor.pageTables.getMeta)]: (a) => metaTabele(a.pageId, false),
  [getFunctionName(api.prostor.pageTables.listRows)]: (a) =>
    strana(a.pageId === TABELA_UX ? REDOVI_TABELE : []),
  [getFunctionName(api.prostor.areasV2.listRelations)]: (a) => vezeStranice(a.pageId, false),
  // Razgovor vezan za stranicu još nije otvoren.
  [getFunctionName(api.prostor.chat.channelForAnchor)]: () =>
    null satisfies R<typeof api.prostor.chat.channelForAnchor>,
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
  // Komentari.
  [getFunctionName(api.prostor.comments.add)]: () =>
    fakeId("contentContributions", 199) satisfies RM<typeof api.prostor.comments.add>,
  [getFunctionName(api.prostor.comments.update)]: () => null satisfies RM<typeof api.prostor.comments.update>,
  [getFunctionName(api.prostor.comments.remove)]: (a) =>
    ({
      commentId: a.commentId as Id<"contentContributions">,
      undoUntil: Date.now() + 8_000,
    }) satisfies RM<typeof api.prostor.comments.remove>,
  [getFunctionName(api.prostor.comments.restore)]: () => null satisfies RM<typeof api.prostor.comments.restore>,
  // Istorija i prisustvo.
  [getFunctionName(api.prostor.history.restore)]: (a) =>
    ({
      changed: true,
      revisionId: fakeId("contentRevisions", 99),
      targetRevision: (typeof a.expectedRevision === "number" ? a.expectedRevision : 0) + 1,
    }) satisfies RM<typeof api.prostor.history.restore>,
  [getFunctionName(api.prostor.presence.heartbeat)]: () => null satisfies RM<typeof api.prostor.presence.heartbeat>,
  [getFunctionName(api.prostor.presence.leave)]: () => null satisfies RM<typeof api.prostor.presence.leave>,
  // Fajlovi (adresa za slanje je lažna i ne zove se).
  [getFunctionName(api.prostor.pageFiles.generateUploadUrl)]: () =>
    ({
      uploadUrl: "https://example.invalid/upload",
      token: "ux-token",
      expiresAt: Date.now() + 30 * 60_000,
    }) satisfies RM<typeof api.prostor.pageFiles.generateUploadUrl>,
  [getFunctionName(api.prostor.pageFiles.attach)]: (a) =>
    ({
      ok: true,
      fileId: fakeId("pageFiles", 199),
      name: typeof a.name === "string" ? a.name : "Fajl",
      size: 0,
      category: "document",
    }) satisfies RM<typeof api.prostor.pageFiles.attach>,
  [getFunctionName(api.prostor.pageFiles.rename)]: () => null satisfies RM<typeof api.prostor.pageFiles.rename>,
  [getFunctionName(api.prostor.pageFiles.remove)]: () => null satisfies RM<typeof api.prostor.pageFiles.remove>,
  [getFunctionName(api.prostor.pageFiles.reorder)]: () => null satisfies RM<typeof api.prostor.pageFiles.reorder>,
  [getFunctionName(api.prostor.pageFiles.prune)]: () =>
    ({ removed: 0 }) satisfies RM<typeof api.prostor.pageFiles.prune>,
  // Tabela.
  [getFunctionName(api.prostor.pageTables.addColumn)]: () =>
    "kolona-nova" satisfies RM<typeof api.prostor.pageTables.addColumn>,
  [getFunctionName(api.prostor.pageTables.renameColumn)]: () =>
    null satisfies RM<typeof api.prostor.pageTables.renameColumn>,
  [getFunctionName(api.prostor.pageTables.removeColumn)]: () =>
    null satisfies RM<typeof api.prostor.pageTables.removeColumn>,
  [getFunctionName(api.prostor.pageTables.moveColumn)]: () =>
    null satisfies RM<typeof api.prostor.pageTables.moveColumn>,
  [getFunctionName(api.prostor.pageTables.addRow)]: () =>
    fakeId("pageTableRows", 99) satisfies RM<typeof api.prostor.pageTables.addRow>,
  [getFunctionName(api.prostor.pageTables.removeRow)]: () =>
    null satisfies RM<typeof api.prostor.pageTables.removeRow>,
  [getFunctionName(api.prostor.pageTables.setCells)]: () =>
    null satisfies RM<typeof api.prostor.pageTables.setCells>,
  [getFunctionName(api.prostor.pageTables.importRows)]: (a) => {
    const uvezeno = Array.isArray(a.rows) ? a.rows.length : 0;
    return {
      importedRows: uvezeno,
      totalRows: REDOVI_TABELE.length + uvezeno,
    } satisfies RM<typeof api.prostor.pageTables.importRows>;
  },
  // Veze među stranicama i zaključavanje.
  [getFunctionName(api.prostor.areasV2.createRelation)]: () =>
    fakeId("pageRelations", 99) satisfies RM<typeof api.prostor.areasV2.createRelation>,
  [getFunctionName(api.prostor.areasV2.deleteRelation)]: () =>
    null satisfies RM<typeof api.prostor.areasV2.deleteRelation>,
  [getFunctionName(api.prostor.pages.lock)]: () =>
    ({ lockedAt: Date.now(), lockedByProfileId: JA._id }) satisfies RM<typeof api.prostor.pages.lock>,
  [getFunctionName(api.prostor.pages.unlock)]: () =>
    ({ lockedAt: null, lockedByProfileId: null }) satisfies RM<typeof api.prostor.pages.unlock>,
};

/** `&prazno=1`: oblasti bez stranica i bez opisa (prazna stanja stabla i oblasti). */
export const PRAZNO_PROSTOR_DOKUMENTI: Record<string, Fixture> = {
  [getFunctionName(api.prostor.pages.listChildren)]: () => strana([]),
  [getFunctionName(api.prostor.pages.childCounts)]: () => [],
  [getFunctionName(api.prostor.pages.areaTopLevelCounts)]: () => brojeviNaVrhu(true),
  [getFunctionName(api.prostor.pages.recentForArea)]: () => [],
  [getFunctionName(api.prostor.areasV2.getAreaBody)]: (a) => opisOblasti(a.areaId, true),
  [getFunctionName(api.prostor.tasks.listForArea)]: () => strana([]),
  // Stranice bez komentara, istorije, prisustva, fajlova i redova tabele.
  [getFunctionName(api.prostor.comments.list)]: () => strana([]),
  [getFunctionName(api.prostor.history.list)]: () => strana([]),
  [getFunctionName(api.prostor.presence.listForPage)]: () => [],
  [getFunctionName(api.prostor.pageFiles.list)]: () => [],
  [getFunctionName(api.prostor.pageTables.listRows)]: () => strana([]),
  [getFunctionName(api.prostor.pageTables.getMeta)]: (a) => metaTabele(a.pageId, true),
  [getFunctionName(api.prostor.areasV2.listRelations)]: (a) => vezeStranice(a.pageId, true),
};
