/**
 * Razvojni prikaz: mape radnog dela (SPAJANJE S14, plan S07 §8.1–§8.2).
 *
 * Četiri mape: mapa oblasti, mapa stranice, mapa ideja i mapa beleški. Sadržaj
 * (raspored kartica, veze, misli) je po uzoru na Devotion izlog (`map.ts`),
 * sa lažnim ljudima iz `fixtures-prostor-osnova.ts`. Kartice mape oblasti i
 * stranice nisu ispisane ručno: grade se iz `pages.get` fikstura dokumenata i
 * zadataka (iste stranice, naslovi i ID-jevi), pa se ne mogu razilaziti sa
 * stablom. Mapa ideja živi u `fixtures-prostor-ideje.ts` (`ideas.list` ima
 * `x`/`y`, veze i jednu ugnežđenu ideju).
 *
 * Lažni Convex nema keš ni pretplate, a svaka mutacija sa fiksturom budi sve
 * upite. Zato mape drže malo stanja u ovom modulu: nove i uklonjene veze,
 * položaj i veličina kartica, a kod beleški cele misli i niti. Mutacije koje
 * ne vraćaju vrednost (pomeranje, veličina) samo upišu stanje i vrate
 * `undefined`, pa ne bude ekran dok korisnik prevlači. Osvežavanje strane
 * vraća početno stanje.
 *
 * Adrese (hub, projekat „Enigma IT“):
 *   /enigma-it/dokumenti/<OBLAST_UX>?ux=1&tab=mapa      → mapa oblasti „Razvoj“ (8 kartica)
 *   /enigma-it/stranica/<STRANICA_MAPA_UX>?ux=1&tab=mapa → mapa podstranica (beleška + tabela)
 *   /enigma-it/ideje?ux=1                               → kartica „Mapa“ (ideje)
 *   /enigma-it/beleske?ux=1                             → mapa beleški (8 misli, 4 niti)
 * `OBLAST_UX` je `areasux0001` (`fixtures-prostor-osnova.ts`); `STRANICA_MAPA_UX`
 * je `pagesux0101` („Endpointi za plaćanje“, ima podstranice 102 i 103).
 * „Marketing“ i „Prodaja“ imaju manje mape; `&prazno=1` daje prazne mape.
 */
import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { htmlToPlainText } from "@/lib/prostor/revisions";
import { type Fixture, type R, WS, now, DAY, HOUR } from "./fixtures-util";
import { fakeId, OBLASTI, PROFILI, strana } from "./fixtures-prostor-osnova";
import { FIXTURES_PROSTOR_DOKUMENTI, STRANICA_UX } from "./fixtures-prostor-dokumenti";
import { FIXTURES_PROSTOR_ZADACI } from "./fixtures-prostor-zadaci";

/** Stranica sa podstranicama za mapu stranice: `/enigma-it/stranica/<STRANICA_MAPA_UX>?ux=1&tab=mapa`. */
export const STRANICA_MAPA_UX = STRANICA_UX;

type Ref = Parameters<typeof getFunctionName>[0];
/** Povratna vrednost mutacije: ista provera ugovora kao `R` za upite. */
type RM<M extends FunctionReference<"mutation">> = FunctionReturnType<M>;
type Platno = R<typeof api.prostor.areasV2.getCanvas>;
type Kartica = Platno["pages"][number];
type VezaPlatna = Platno["edges"][number];
type VezaRelacije = Platno["relations"][number];
type VezaKoraka = Platno["checkpointEdges"][number];
type Detalj = NonNullable<R<typeof api.prostor.pages.get>>;
type Fajl = R<typeof api.prostor.pageFiles.list>[number];
type MetaTabele = R<typeof api.prostor.pageTables.getMeta>;
type Izvrsilac = R<typeof api.prostor.taskAssignees.listForTask>[number];
type Misao = R<typeof api.prostor.thoughts.listNodes>["page"][number];
type Nit = R<typeof api.prostor.thoughts.listEdges>["page"][number];

const JA = PROFILI[0];
const [RAZVOJ, MARKETING] = OBLASTI;

const stranicaId = (n: number) => fakeId("pages", n);

function poziv(izvor: Record<string, Fixture>, funkcija: Ref, args: Record<string, unknown>): unknown {
  return izvor[getFunctionName(funkcija)]?.(args);
}
const izDokumenata = (funkcija: Ref, args: Record<string, unknown>) =>
  poziv(FIXTURES_PROSTOR_DOKUMENTI, funkcija, args);
/** Zadaci dopunjuju dokumente (`pages.get`, `pages.listChildren`), pa su pravi ulaz za oba. */
const izZadataka = (funkcija: Ref, args: Record<string, unknown>) =>
  poziv(FIXTURES_PROSTOR_ZADACI, funkcija, args);

type Osoba = { _id: Id<"profiles">; displayName: string; avatarUrl: string | null };
const sazetak = (p: Osoba) => ({ _id: p._id, displayName: p.displayName, avatarUrl: p.avatarUrl });

// ── Mapa oblasti i stranice ──────────────────────────────────────────────────

const KOLONA = 4;
// Razmak 72 px između kolona: natpis veze („Zavisi od“) stane između kartica.
const KORAK_X = 360;
const KORAK_Y = 240;
const SIRINA = 288;
const VISINA = 196;
/** Najviše kartica koje razvojni prikaz crta po mapi. */
const MAX_KARTICA = 8;
/** Najduži isečak koji server šalje za karticu (`areasV2.ts › canvasPreview`). */
const PREGLED_MAX = 480;

/**
 * Mapa oblasti „Razvoj“, red po red: beleške, tabela, fajl i tri zadatka.
 * „Cene provizija po kartici“ (103) je u stablu dete stranice 101; ovde je
 * na vrhu da mapa pokaže sve vrste kartica (stranica 101 je ima i kao dete).
 */
const RAZVOJ_MAPA = [100, 105, 103, 107, 106, 200, 201, 205];

function kljucScopa(areaId: unknown, rootPageId: unknown): string {
  return `${String(areaId)}|${rootPageId === null || rootPageId === undefined ? "vrh" : String(rootPageId)}`;
}

function detaljStranice(pageId: string): Detalj | undefined {
  return izZadataka(api.prostor.pages.get, { pageId }) as Detalj | undefined;
}

function idjeviStranica(areaId: Id<"areas">, rootPageId: Id<"pages"> | null): Id<"pages">[] {
  if (rootPageId === null && areaId === RAZVOJ._id) return RAZVOJ_MAPA.map(stranicaId);
  const deca = izZadataka(api.prostor.pages.listChildren, { areaId, parentPageId: rootPageId }) as
    | { page: Array<{ _id: Id<"pages"> }> }
    | undefined;
  return (deca?.page ?? []).slice(0, MAX_KARTICA).map((s) => s._id);
}

function isecak(d: Detalj): string {
  const tekst = (d.kind === "task" ? d.instructions : undefined) || htmlToPlainText(d.content) || d.title;
  return tekst.slice(0, PREGLED_MAX);
}

const stanjeMape = {
  polozaj: new Map<string, { x: number; y: number }>(),
  velicina: new Map<string, { width: number; height: number }>(),
  brojac: 100,
};

function kartica(d: Detalj, i: number, scope: string, rootPageId: Id<"pages"> | null): Kartica {
  const kljuc = `${scope}|${d._id}`;
  const polozaj = stanjeMape.polozaj.get(kljuc) ?? {
    x: (i % KOLONA) * KORAK_X,
    y: Math.floor(i / KOLONA) * KORAK_Y,
  };
  const velicina = stanjeMape.velicina.get(kljuc) ?? { width: SIRINA, height: VISINA };
  const zadatak = d.kind === "task";
  const izvrsioci = zadatak
    ? ((izZadataka(api.prostor.taskAssignees.listForTask, { taskPageId: d._id }) as Izvrsilac[] | undefined) ?? [])
    : [];
  const prikazani = izvrsioci.map((e) => sazetak({ _id: e.profileId, displayName: e.displayName, avatarUrl: e.avatarUrl }));
  const fajlovi =
    d.kind === "file"
      ? ((izDokumenata(api.prostor.pageFiles.list, { pageId: d._id }) as Fajl[] | undefined) ?? [])
      : [];
  const tabela =
    d.kind === "table"
      ? (izDokumenata(api.prostor.pageTables.getMeta, { pageId: d._id }) as MetaTabele | undefined)
      : undefined;
  return {
    _id: d._id,
    title: d.title,
    text: isecak(d),
    kind: d.kind,
    parentPageId: rootPageId,
    taskStatus: d.taskStatus ?? null,
    taskPriority: d.taskPriority ?? null,
    dueDate: zadatak ? (d.dueDate ?? null) : null,
    checkpointTotal: zadatak ? (d.checkpointTotal ?? 0) : 0,
    checkpointCompleted: zadatak ? (d.checkpointCompleted ?? 0) : 0,
    assignee: prikazani[0] ?? null,
    assignees: prikazani,
    fileCount: fajlovi.length,
    // Ugovor je glavni prilog; inače prva kategorija.
    fileCategory: fajlovi.find((f) => f.category === "pdf")?.category ?? fajlovi[0]?.category ?? null,
    filePreviewUrl: null,
    tableRowCount: tabela?.rowCount ?? 0,
    tableColumnCount: tabela?.columns.length ?? 0,
    updatedAt: d.updatedAt,
    x: polozaj.x,
    y: polozaj.y,
    width: velicina.width,
    height: velicina.height,
    // Raspored menja svaki član (kao `canLayoutOnMap` na serveru).
    canMove: true,
    canResize: true,
    canDetach: rootPageId !== null && d.permissions.canDetach,
    canEdit: d.permissions.canEdit,
    isLocked: d.permissions.isLocked,
    creator: d.creator ? sazetak(d.creator) : null,
  };
}

// Veze: puna linija (`canvas`) između dve kartice iste vrste, isprekidana
// (`relation`) između beleške i zadatka, i veze koraka zadatka.

type SkupVeza = { platno: VezaPlatna[]; relacije: VezaRelacije[]; koraci: VezaKoraka[] };

const vezaPlatna = (id: VezaPlatna["_id"], source: number, target: number, natpis: string | null): VezaPlatna => ({
  _id: id,
  source: stranicaId(source),
  target: stranicaId(target),
  label: natpis,
  kind: "canvas",
  canDelete: true,
  canRequestDeletion: false,
});

const vezaRelacije = (
  id: VezaRelacije["_id"],
  source: number,
  target: number,
  natpis: string | null,
): VezaRelacije => ({
  _id: id,
  source: stranicaId(source),
  target: stranicaId(target),
  label: natpis,
  kind: "relation",
  canDelete: true,
  canRequestDeletion: false,
});

const VEZE = new Map<string, SkupVeza>();

function veze(scope: string): SkupVeza {
  let skup = VEZE.get(scope);
  if (!skup) {
    skup = { platno: [], relacije: [], koraci: [] };
    VEZE.set(scope, skup);
  }
  return skup;
}

const platnoId = (n: number) => fakeId("pageCanvasEdgesV2", n);
const relacijaId = (n: number) => fakeId("pageRelations", n);
const korak = (n: number) => fakeId("taskCheckpoints", n);

{
  // Razvoj: dve zavisnosti beleški/zadataka, lanac zadataka i jedna relacija.
  const razvoj = veze(kljucScopa(RAZVOJ._id, null));
  razvoj.platno.push(
    vezaPlatna(platnoId(1), 100, 105, "Zavisi od"),
    vezaPlatna(platnoId(2), 200, 201, null),
    vezaPlatna(platnoId(3), 106, 200, null),
  );
  razvoj.relacije.push(vezaRelacije(relacijaId(301), 105, 201, null));
  // Vidi se kad se koraci zadatka 200 prošire: dva koraka povezana među sobom.
  razvoj.koraci.push({
    _id: fakeId("taskCheckpointCanvasEdges", 1),
    source: { kind: "task_checkpoint", id: korak(2001) },
    target: { kind: "task_checkpoint", id: korak(2003) },
    canDelete: true,
    canRequestDeletion: false,
  });
  veze(kljucScopa(MARKETING._id, null)).platno.push(vezaPlatna(platnoId(4), 110, 111, "Iz plana"));
  veze(kljucScopa(RAZVOJ._id, stranicaId(100))).platno.push(vezaPlatna(platnoId(5), 101, 104, null));
  veze(kljucScopa(RAZVOJ._id, STRANICA_MAPA_UX)).relacije.push(
    vezaRelacije(relacijaId(302), 102, 103, "Provizije"),
  );
}

function opseg(
  workspaceId: Id<"workspaces">,
  areaId: Id<"areas">,
  rootPageId: Id<"pages"> | null,
  prazno: boolean,
): Platno["scope"] {
  if (rootPageId === null) {
    const telo = prazno
      ? undefined
      : (izDokumenata(api.prostor.areasV2.getAreaBody, { areaId }) as
          | R<typeof api.prostor.areasV2.getAreaBody>
          | undefined);
    return {
      kind: "area",
      workspaceId,
      areaId,
      rootPageId: null,
      title: OBLASTI.find((o) => o._id === areaId)?.label ?? "Oblast",
      pageKind: null,
      briefing: {
        content: telo?.content ?? "",
        instructions: null,
        revision: telo?.revision ?? 0,
        ownerProfileId: JA._id,
        canEdit: true,
      },
    };
  }
  const d = detaljStranice(rootPageId);
  return {
    kind: "page",
    workspaceId,
    areaId,
    rootPageId,
    title: d?.title ?? "Stranica",
    pageKind: d?.kind ?? null,
    briefing: {
      content: d?.content ?? "",
      instructions: d?.kind === "task" ? (d.instructions ?? null) : null,
      revision: d?.revision ?? 0,
      ownerProfileId: d?.createdByProfileId ?? JA._id,
      canEdit: d?.permissions.canEdit ?? true,
    },
  };
}

function platno(a: Record<string, unknown>, prazno: boolean): Platno {
  const areaId = a.areaId as Id<"areas">;
  const rootPageId = (a.rootPageId ?? null) as Id<"pages"> | null;
  const workspaceId = (a.workspaceId ?? WS) as Id<"workspaces">;
  const scope = kljucScopa(areaId, rootPageId);
  const pages = prazno
    ? []
    : idjeviStranica(areaId, rootPageId).flatMap((pageId, i) => {
        const d = detaljStranice(pageId);
        return d ? [kartica(d, i, scope, rootPageId)] : [];
      });
  const vidljive = new Set<string>(pages.map((p) => p._id));
  const oba = (v: { source: string; target: string }) => vidljive.has(v.source) && vidljive.has(v.target);
  const skup = prazno ? { platno: [], relacije: [], koraci: [] } : veze(scope);
  return {
    pages,
    edges: skup.platno.filter(oba),
    relations: skup.relacije.filter(oba),
    checkpointEdges: skup.koraci,
    ghosts: [],
    // Bez sačuvanog pogleda mapa se sama uklopi (`fitView` pri otvaranju).
    viewport: { x: 0, y: 0, zoom: 1, persisted: false },
    truncated: false,
    scope: opseg(workspaceId, areaId, rootPageId, prazno),
  };
}

// Mutacije mape oblasti: veze ostaju na mapi, a položaj i veličina se pamte.

function poveziStranice(a: Record<string, unknown>): RM<typeof api.prostor.areasV2.connectPages> {
  const id = platnoId(++stanjeMape.brojac);
  veze(kljucScopa(a.areaId, a.rootPageId)).platno.push({
    _id: id,
    source: a.sourcePageId as Id<"pages">,
    target: a.targetPageId as Id<"pages">,
    label: typeof a.label === "string" ? a.label : null,
    kind: "canvas",
    canDelete: true,
    canRequestDeletion: false,
  });
  return id;
}

function razdvojStranice(a: Record<string, unknown>): RM<typeof api.prostor.areasV2.disconnectPages> {
  const skup = veze(kljucScopa(a.areaId, a.rootPageId));
  skup.platno = skup.platno.filter((v) => v._id !== a.edgeId);
  return null;
}

function poveziKorake(a: Record<string, unknown>): RM<typeof api.prostor.taskCheckpointCanvasEdges.connect> {
  const id = fakeId("taskCheckpointCanvasEdges", ++stanjeMape.brojac);
  veze(kljucScopa(a.areaId, a.rootPageId)).koraci.push({
    _id: id,
    source: a.source as VezaKoraka["source"],
    target: a.target as VezaKoraka["target"],
    canDelete: true,
    canRequestDeletion: false,
  });
  return id;
}

function razdvojKorake(a: Record<string, unknown>): RM<typeof api.prostor.taskCheckpointCanvasEdges.disconnect> {
  const skup = veze(kljucScopa(a.areaId, a.rootPageId));
  skup.koraci = skup.koraci.filter((v) => v._id !== a.edgeId);
  return null;
}

/** Relacija sa mape se briše iz stanja mape; tuđe (stranica dokumenata) ostaju dokumentima. */
function obrisiRelaciju(a: Record<string, unknown>): unknown {
  for (const skup of VEZE.values()) {
    if (skup.relacije.some((v) => v._id === a.relationId)) {
      skup.relacije = skup.relacije.filter((v) => v._id !== a.relationId);
      return null satisfies RM<typeof api.prostor.areasV2.deleteRelation>;
    }
  }
  return izDokumenata(api.prostor.areasV2.deleteRelation, a);
}

function pomeriStranice(a: Record<string, unknown>): undefined {
  const scope = kljucScopa(a.areaId, a.rootPageId);
  for (const u of (a.updates as Array<{ pageId: string; x: number; y: number }>) ?? []) {
    stanjeMape.polozaj.set(`${scope}|${u.pageId}`, { x: u.x, y: u.y });
  }
  return undefined;
}

function promeniVelicinu(a: Record<string, unknown>): undefined {
  const kljuc = `${kljucScopa(a.areaId, a.rootPageId)}|${String(a.pageId)}`;
  stanjeMape.velicina.set(kljuc, { width: Number(a.width), height: Number(a.height) });
  if (typeof a.x === "number" && typeof a.y === "number") stanjeMape.polozaj.set(kljuc, { x: a.x, y: a.y });
  return undefined;
}

function vratiVelicinu(a: Record<string, unknown>): undefined {
  stanjeMape.velicina.delete(`${kljucScopa(a.areaId, a.rootPageId)}|${String(a.pageId)}`);
  return undefined;
}

// ── Mapa beleški ─────────────────────────────────────────────────────────────
//
// Lične misli korisnika (`thoughts.*`): glavna misao „Cilj do kraja godine“
// sa lepezom tri misli desno od nje, par o naplati i dve misli bez veze. Boje
// su svih šest vrednosti; jedna misao je poslata u Ideje.

type SemeMisli = {
  n: number;
  naslov: string | null;
  tekst: string;
  boja: Misao["color"];
  x: number;
  y: number;
  width?: number;
  height?: number;
  glavna?: boolean;
  /** Poslata u Ideje: ideja 2 iz `fixtures-prostor-ideje.ts`. */
  poslata?: boolean;
  pre: number;
};

const SEME_MISLI: SemeMisli[] = [
  {
    n: 1,
    naslov: "Cilj do kraja godine",
    tekst: "Pet novih klijenata iz Leadova. Svaka druga misao na ovoj mapi treba da pomogne tome ili da ode u arhivu.",
    boja: "amber",
    x: 0,
    y: 200,
    width: 296,
    height: 184,
    glavna: true,
    pre: 6 * DAY,
  },
  {
    n: 2,
    naslov: "Pozivi pekarama",
    tekst: "Zvati subotom pre podne, prvo firme bez sajta. Skripta za prvi poziv je u Prodaji.",
    boja: "blue",
    x: 400,
    y: 0,
    pre: 2 * DAY,
  },
  {
    n: 3,
    naslov: "Paket za sajt",
    tekst: "Fiksna cena, rok od sedam dana i domen u ceni. Proveriti sa Markom šta stane u rok.",
    boja: "green",
    x: 400,
    y: 220,
    poslata: true,
    pre: 3 * DAY,
  },
  {
    n: 7,
    naslov: "Radionica u Novom Sadu",
    tekst: "Besplatna, za vlasnike malih firmi, sa ponudom na kraju. Naći salu i datum pre decembra.",
    boja: "amber",
    x: 400,
    y: 440,
    pre: 5 * DAY,
  },
  {
    n: 5,
    naslov: "Webhook naplate",
    tekst: "Provajder javlja uplatu, a porudžbina menja status. Sandbox test mora da prođe pre lansiranja.",
    boja: "rose",
    x: 800,
    y: 0,
    pre: 4 * HOUR,
  },
  {
    n: 6,
    naslov: "Pitanja za banku",
    tekst: "Limit po kartici za prvi mesec, rok isplate i da li postoji sandbox za povraćaj.",
    boja: "neutral",
    x: 1120,
    y: 0,
    pre: DAY,
  },
  {
    n: 4,
    naslov: "Bilten petkom",
    tekst: "Tri stavke: šta smo objavili, šta je radilo i šta sledi. Klijenti pitaju, a ovo odgovara unapred.",
    boja: "violet",
    x: 800,
    y: 240,
    pre: 8 * DAY,
  },
  {
    n: 8,
    naslov: null,
    tekst: "Možda mesečni izveštaj kao deo održavanja? Pitati Anu koliko bi to trajalo.",
    boja: "blue",
    x: 1120,
    y: 240,
    pre: 9 * HOUR,
  },
];

function napraviMisao(seme: SemeMisli): Misao {
  const nastala = now - seme.pre;
  return {
    _id: fakeId("thoughtNodes", seme.n),
    _creationTime: nastala,
    workspaceId: WS,
    ownerProfileId: JA._id,
    title: seme.naslov,
    text: seme.tekst,
    searchText: `${seme.naslov ?? ""} ${seme.tekst}`.trim().toLowerCase(),
    x: seme.x,
    y: seme.y,
    width: seme.width,
    height: seme.height,
    color: seme.boja,
    isParent: seme.glavna ?? false,
    conversionCount: seme.poslata ? 1 : 0,
    lastConvertedIdeaId: seme.poslata ? fakeId("ideaNodes", 2) : undefined,
    lastConvertedPageId: null,
    lastConvertedAt: seme.poslata ? now - DAY : null,
    archivedAt: null,
    createdAt: nastala,
    updatedAt: nastala,
  };
}

const SEME_NITI: { n: number; a: number; b: number; natpis: string | null; pre: number }[] = [
  { n: 1, a: 1, b: 2, natpis: null, pre: 5 * DAY },
  { n: 2, a: 1, b: 3, natpis: "Prvi korak", pre: 3 * DAY },
  { n: 3, a: 1, b: 7, natpis: null, pre: 5 * DAY },
  { n: 4, a: 5, b: 6, natpis: null, pre: DAY },
];

const parKljuc = (a: string, b: string) => [a, b].sort().join(":");

function napraviNit(n: number, a: string, b: string, natpis: string | null, nastala: number): Nit {
  return {
    _id: fakeId("thoughtEdges", n),
    _creationTime: nastala,
    workspaceId: WS,
    ownerProfileId: JA._id,
    nodeAId: a as Id<"thoughtNodes">,
    nodeBId: b as Id<"thoughtNodes">,
    pairKey: parKljuc(a, b),
    label: natpis,
    archivedAt: null,
    createdAt: nastala,
    updatedAt: nastala,
  };
}

const misli = new Map<string, Misao>(SEME_MISLI.map((s) => [fakeId("thoughtNodes", s.n) as string, napraviMisao(s)]));
const niti = new Map<string, Nit>(
  SEME_NITI.map((s) => [
    fakeId("thoughtEdges", s.n) as string,
    napraviNit(s.n, fakeId("thoughtNodes", s.a), fakeId("thoughtNodes", s.b), s.natpis, now - s.pre),
  ]),
);
const brojaci = { misao: 100, nit: 100, ideja: 200 };

/** Sačuvan pogled: ceo raspored (1392 × 600) staje u ~1000 × 430 px. */
const PLATNO_MISLI = {
  _id: fakeId("thoughtCanvases", 1),
  _creationTime: now - 6 * DAY,
  workspaceId: WS,
  ownerProfileId: JA._id,
  x: 24,
  y: 40,
  zoom: 0.72,
  createdAt: now - 6 * DAY,
  updatedAt: now - 2 * HOUR,
} satisfies NonNullable<R<typeof api.prostor.thoughts.getCanvas>>;

const aktivneMisli = () =>
  [...misli.values()].filter((m) => m.archivedAt === null).sort((a, b) => b.updatedAt - a.updatedAt);

/** Nit se vidi dok su obe misli aktivne (kao kad se misao arhivira zajedno sa nitima). */
const aktivneNiti = () =>
  [...niti.values()]
    .filter(
      (n) =>
        n.archivedAt === null &&
        misli.get(n.nodeAId)?.archivedAt === null &&
        misli.get(n.nodeBId)?.archivedAt === null,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

function izmeniMisao(nodeId: unknown, izmena: Partial<Misao>): Id<"thoughtNodes"> {
  const misao = misli.get(String(nodeId));
  if (misao) misli.set(misao._id, { ...misao, ...izmena, updatedAt: Date.now() });
  return nodeId as Id<"thoughtNodes">;
}

function apsolutno(misao: Misao): { x: number; y: number } {
  let { x, y } = misao;
  const videne = new Set<string>([misao._id]);
  let roditelj = misao.parentThoughtId ? misli.get(misao.parentThoughtId) : undefined;
  while (roditelj && !videne.has(roditelj._id)) {
    videne.add(roditelj._id);
    x += roditelj.x;
    y += roditelj.y;
    roditelj = roditelj.parentThoughtId ? misli.get(roditelj.parentThoughtId) : undefined;
  }
  return { x, y };
}

const idjeviMisli = (vrednost: unknown) => (Array.isArray(vrednost) ? (vrednost as Id<"thoughtNodes">[]) : []);
const idjeviNiti = (vrednost: unknown) => (Array.isArray(vrednost) ? (vrednost as Id<"thoughtEdges">[]) : []);

function povezanaGrupa(a: Record<string, unknown>): R<typeof api.prostor.thoughts.getConnectedGroup> {
  const pocetak = misli.get(String(a.nodeId));
  if (!pocetak || pocetak.archivedAt !== null) throw new Error("Misao nije pronađena.");
  const granica = typeof a.limit === "number" ? a.limit : 200;
  const sve = aktivneNiti();
  const ids = new Set<string>([pocetak._id]);
  const red: string[] = [pocetak._id];
  let skraceno = false;
  for (let i = 0; i < red.length && !skraceno; i += 1) {
    for (const nit of sve) {
      const sused = nit.nodeAId === red[i] ? nit.nodeBId : nit.nodeBId === red[i] ? nit.nodeAId : null;
      if (sused === null || ids.has(sused)) continue;
      if (ids.size >= granica) {
        skraceno = true;
        break;
      }
      ids.add(sused);
      red.push(sused);
    }
  }
  return {
    nodes: [...ids].flatMap((id) => {
      const misao = misli.get(id);
      return misao ? [misao] : [];
    }),
    edges: sve.filter((n) => ids.has(n.nodeAId) && ids.has(n.nodeBId)),
    truncated: skraceno,
  };
}

function novaMisao(a: Record<string, unknown>): RM<typeof api.prostor.thoughts.createNode> {
  const id = fakeId("thoughtNodes", ++brojaci.misao);
  const sad = Date.now();
  misli.set(id, {
    _id: id,
    _creationTime: sad,
    workspaceId: WS,
    ownerProfileId: JA._id,
    title: typeof a.title === "string" ? a.title : null,
    text: typeof a.text === "string" ? a.text : "",
    x: Number(a.x ?? 0),
    y: Number(a.y ?? 0),
    color: (a.color ?? "neutral") as Misao["color"],
    isParent: a.isParent === true,
    conversionCount: 0,
    lastConvertedPageId: null,
    lastConvertedAt: null,
    archivedAt: null,
    createdAt: sad,
    updatedAt: sad,
  });
  return id;
}

function dupliraj(a: Record<string, unknown>): RM<typeof api.prostor.thoughts.duplicateNodes> {
  const pomeraj = { x: Number(a.offsetX ?? 0), y: Number(a.offsetY ?? 0) };
  return idjeviMisli(a.nodeIds).flatMap((izvor) => {
    const original = misli.get(izvor);
    if (!original) return [];
    const id = fakeId("thoughtNodes", ++brojaci.misao);
    const sad = Date.now();
    misli.set(id, {
      ...original,
      _id: id,
      _creationTime: sad,
      x: original.x + pomeraj.x,
      y: original.y + pomeraj.y,
      isParent: undefined,
      conversionCount: 0,
      lastConvertedIdeaId: undefined,
      lastConvertedAt: null,
      createdAt: sad,
      updatedAt: sad,
    });
    return [id];
  });
}

function arhivirajMisli(nodeIds: unknown, arhivirano: boolean): RM<typeof api.prostor.thoughts.archiveNodes> {
  const ids = idjeviMisli(nodeIds);
  for (const id of ids) izmeniMisao(id, { archivedAt: arhivirano ? Date.now() : null });
  return ids;
}

function arhivirajNiti(edgeIds: unknown, arhivirano: boolean): RM<typeof api.prostor.thoughts.archiveEdges> {
  const ids = idjeviNiti(edgeIds);
  for (const id of ids) {
    const nit = niti.get(id);
    if (nit) niti.set(id, { ...nit, archivedAt: arhivirano ? Date.now() : null, updatedAt: Date.now() });
  }
  return ids;
}

function novaNit(a: Record<string, unknown>): RM<typeof api.prostor.thoughts.createEdge> {
  const aId = String(a.nodeAId);
  const bId = String(a.nodeBId);
  const natpis = typeof a.label === "string" && a.label.trim() !== "" ? a.label.trim() : null;
  const postojeca = [...niti.values()].find((n) => n.pairKey === parKljuc(aId, bId));
  if (postojeca) {
    niti.set(postojeca._id, { ...postojeca, label: natpis, archivedAt: null, updatedAt: Date.now() });
    return postojeca._id;
  }
  const nit = napraviNit(++brojaci.nit, aId, bId, natpis, Date.now());
  niti.set(nit._id, nit);
  return nit._id;
}

function izmeniNit(a: Record<string, unknown>): RM<typeof api.prostor.thoughts.updateEdge> {
  const nit = niti.get(String(a.edgeId));
  if (nit) {
    const aId = typeof a.nodeAId === "string" ? a.nodeAId : nit.nodeAId;
    const bId = typeof a.nodeBId === "string" ? a.nodeBId : nit.nodeBId;
    niti.set(nit._id, {
      ...nit,
      nodeAId: aId as Id<"thoughtNodes">,
      nodeBId: bId as Id<"thoughtNodes">,
      pairKey: parKljuc(aId, bId),
      label: "label" in a ? (typeof a.label === "string" && a.label.trim() !== "" ? a.label.trim() : null) : nit.label,
      updatedAt: Date.now(),
    });
  }
  return a.edgeId as Id<"thoughtEdges">;
}

function posaljiUIdeje(a: Record<string, unknown>): RM<typeof api.prostor.thoughts.convertToIdeas> {
  const izabrane = idjeviMisli(a.nodeIds);
  const ideaIds = izabrane.map(() => fakeId("ideaNodes", ++brojaci.ideja));
  izabrane.forEach((id, i) => {
    const misao = misli.get(id);
    izmeniMisao(id, {
      conversionCount: (misao?.conversionCount ?? 0) + 1,
      lastConvertedIdeaId: ideaIds[i],
      lastConvertedAt: Date.now(),
    });
  });
  const skup = new Set<string>(izabrane);
  const createdEdgeCount = aktivneNiti().filter((n) => skup.has(n.nodeAId) && skup.has(n.nodeBId)).length;
  return { ideaIds, createdEdgeCount };
}

// ── Registar ─────────────────────────────────────────────────────────────────

export const FIXTURES_PROSTOR_MAPE: Record<string, Fixture> = {
  // Mapa oblasti i stranice.
  [getFunctionName(api.prostor.areasV2.getCanvas)]: (a) => platno(a, false),
  [getFunctionName(api.prostor.areasV2.connectPages)]: (a) => poveziStranice(a),
  [getFunctionName(api.prostor.areasV2.disconnectPages)]: (a) => razdvojStranice(a),
  [getFunctionName(api.prostor.areasV2.movePages)]: (a) => pomeriStranice(a),
  [getFunctionName(api.prostor.areasV2.resizePage)]: (a) => promeniVelicinu(a),
  [getFunctionName(api.prostor.areasV2.resetPageSize)]: (a) => vratiVelicinu(a),
  [getFunctionName(api.prostor.areasV2.deleteRelation)]: (a) => obrisiRelaciju(a),
  [getFunctionName(api.prostor.taskCheckpointCanvasEdges.connect)]: (a) => poveziKorake(a),
  [getFunctionName(api.prostor.taskCheckpointCanvasEdges.disconnect)]: (a) => razdvojKorake(a),
  // Mapa beleški.
  [getFunctionName(api.prostor.thoughts.getCanvas)]: () => PLATNO_MISLI,
  [getFunctionName(api.prostor.thoughts.listNodes)]: () => strana(aktivneMisli()),
  [getFunctionName(api.prostor.thoughts.listEdges)]: () => strana(aktivneNiti()),
  [getFunctionName(api.prostor.thoughts.getConnectedGroup)]: (a) => povezanaGrupa(a),
  [getFunctionName(api.prostor.thoughts.createNode)]: (a) => novaMisao(a),
  [getFunctionName(api.prostor.thoughts.updateNode)]: (a) =>
    izmeniMisao(a.nodeId, {
      ...(typeof a.title === "string" ? { title: a.title } : {}),
      ...(typeof a.text === "string" ? { text: a.text } : {}),
      ...(a.color !== undefined ? { color: a.color as Misao["color"] } : {}),
      ...(typeof a.isParent === "boolean" ? { isParent: a.isParent } : {}),
    }) satisfies RM<typeof api.prostor.thoughts.updateNode>,
  [getFunctionName(api.prostor.thoughts.toggleNodeParent)]: (a) => {
    const sledece = typeof a.isParent === "boolean" ? a.isParent : !misli.get(String(a.nodeId))?.isParent;
    izmeniMisao(a.nodeId, { isParent: sledece });
    return sledece satisfies RM<typeof api.prostor.thoughts.toggleNodeParent>;
  },
  [getFunctionName(api.prostor.thoughts.moveNodes)]: (a) => {
    const pomeranja = (Array.isArray(a.moves) ? a.moves : []) as Array<{ nodeId: Id<"thoughtNodes">; x: number; y: number }>;
    for (const { nodeId, x, y } of pomeranja) izmeniMisao(nodeId, { x, y });
    return pomeranja.map((p) => p.nodeId) satisfies RM<typeof api.prostor.thoughts.moveNodes>;
  },
  [getFunctionName(api.prostor.thoughts.updateNodeLayout)]: (a) =>
    izmeniMisao(a.nodeId, {
      x: Number(a.x),
      y: Number(a.y),
      width: Number(a.width),
      height: Number(a.height),
    }) satisfies RM<typeof api.prostor.thoughts.updateNodeLayout>,
  [getFunctionName(api.prostor.thoughts.resetNodeLayoutSize)]: (a) =>
    izmeniMisao(a.nodeId, { width: undefined, height: undefined }) satisfies RM<
      typeof api.prostor.thoughts.resetNodeLayoutSize
    >,
  [getFunctionName(api.prostor.thoughts.nestNode)]: (a) => {
    const dete = misli.get(String(a.childNodeId));
    const roditelj = misli.get(String(a.parentNodeId));
    if (dete && roditelj) {
      const d = apsolutno(dete);
      const r = apsolutno(roditelj);
      izmeniMisao(dete._id, { parentThoughtId: roditelj._id, x: d.x - r.x, y: d.y - r.y });
    }
    return a.childNodeId as RM<typeof api.prostor.thoughts.nestNode>;
  },
  [getFunctionName(api.prostor.thoughts.detachNode)]: (a) => {
    const misao = misli.get(String(a.nodeId));
    if (misao?.parentThoughtId) {
      izmeniMisao(misao._id, { parentThoughtId: undefined, ...apsolutno(misao) });
    }
    return a.nodeId as RM<typeof api.prostor.thoughts.detachNode>;
  },
  [getFunctionName(api.prostor.thoughts.duplicateNodes)]: (a) => dupliraj(a),
  [getFunctionName(api.prostor.thoughts.archiveNodes)]: (a) => arhivirajMisli(a.nodeIds, true),
  [getFunctionName(api.prostor.thoughts.restoreNodes)]: (a) => arhivirajMisli(a.nodeIds, false),
  [getFunctionName(api.prostor.thoughts.createEdge)]: (a) => novaNit(a),
  [getFunctionName(api.prostor.thoughts.updateEdge)]: (a) => izmeniNit(a),
  [getFunctionName(api.prostor.thoughts.archiveEdges)]: (a) => arhivirajNiti(a.edgeIds, true),
  [getFunctionName(api.prostor.thoughts.restoreEdges)]: (a) => arhivirajNiti(a.edgeIds, false),
  [getFunctionName(api.prostor.thoughts.convertToIdeas)]: (a) => posaljiUIdeje(a),
};

/** `&prazno=1` i projekti bez sadržaja: prazne mape sa pozivom „Dodaj“. */
export const PRAZNO_PROSTOR_MAPE: Record<string, Fixture> = {
  [getFunctionName(api.prostor.areasV2.getCanvas)]: (a) => platno(a, true),
  [getFunctionName(api.prostor.thoughts.getCanvas)]: () => null satisfies R<typeof api.prostor.thoughts.getCanvas>,
  [getFunctionName(api.prostor.thoughts.listNodes)]: () => strana([] as Misao[]),
  [getFunctionName(api.prostor.thoughts.listEdges)]: () => strana([] as Nit[]),
};
