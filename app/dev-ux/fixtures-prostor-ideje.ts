/**
 * Razvojni prikaz: ideje projekta (SPAJANJE S13, plan S07 §8.1–§8.2).
 *
 * Tabla po fazama (Predlog · Razmatra se · Odobreno · Postalo zadatak i
 * skupljeno Odbijeno), lista i detalj sa komentarima. Sadržaj je po uzoru na
 * Devotion izlog (`izlog/fixtures/ideas.ts`), sa lažnim ljudima iz
 * `fixtures-prostor-osnova.ts`. „Postalo zadatak" vodi na zadatke iz
 * `fixtures-prostor-zadaci.ts`.
 *
 * Lažni Convex nema keš ni pretplate, pa glas i faza žive u stanju ovog
 * modula: mutacija ga menja, a ekran ga pročita pri sledećem crtanju (najava
 * i toast posle mutacije). Osvežavanje strane vraća početno stanje.
 *
 * Adrese (hub, projekat „Enigma IT“):
 *   /enigma-it/ideje?ux=1                    → tabla (ili zapamćen prikaz)
 *   /enigma-it/ideje?ux=1&ideja=<IDEJA_UX>   → detalj sa komentarima
 * `&prazno=1` daje projekat bez ideja.
 *
 * Mapa ideja (kartica „Mapa“, SPAJANJE S14) čita iste ideje: raspored
 * (`MAPA`), tri veze (`VEZE`, jedna sa natpisom) i jedna ugnežđena ideja
 * („Šablon ponude u dve strane“ unutar „Paketa Sajt za 7 dana“). Tabla i lista
 * ne koriste ta polja.
 */
import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { IdeaStoredStage } from "@/lib/prostor/idea-stages";
import { serializeComment } from "@/lib/prostor/mentions";
import { type Fixture, type R, WS, now, DAY, HOUR } from "./fixtures-util";
import { fakeId, PROFILI, strana } from "./fixtures-prostor-osnova";
import { FIXTURES_PROSTOR_DOKUMENTI } from "./fixtures-prostor-dokumenti";
import { ZADATAK_UX } from "./fixtures-prostor-zadaci";

type Spisak = R<typeof api.prostor.ideas.list>;
type Ideja = Spisak["nodes"][number];
type Komentar = R<typeof api.prostor.comments.list>["page"][number];
type Osoba = (typeof PROFILI)[number];
type Glas = "up" | "down";

const [JA, ANA, MARKO, MILICA, NIKOLA, STEFAN] = PROFILI;

/** Detalj ideje sa komentarima: `/enigma-it/ideje?ux=1&ideja=<IDEJA_UX>`. */
export const IDEJA_UX = fakeId("ideaNodes", 2);

type Seme = {
  n: number;
  naslov: string;
  tekst: string;
  autor: Osoba;
  faza: IdeaStoredStage;
  /** Pretvorena ideja (prikazana faza „Postalo zadatak"). */
  stranica?: Id<"pages">;
  za: Osoba[];
  protiv: Osoba[];
  komentara: number;
  pre: number;
  /** Koliko je pre stigla u svoju fazu (bez toga = kad je nastala). */
  faza_pre?: number;
};

const SEME: Seme[] = [
  {
    n: 1,
    naslov: "Nedeljni bilten za klijente",
    tekst: "Kratak pregled novih objava i rezultata svake nedelje, mejlom petkom. Klijenti pitaju šta smo radili, a ovo bi odgovorilo pre nego što pitaju.",
    autor: MILICA,
    faza: "predlog",
    za: [ANA, MARKO],
    protiv: [],
    komentara: 0,
    pre: 3 * HOUR,
  },
  {
    n: 2,
    naslov: "Paket „Sajt za 7 dana“ za male firme",
    tekst: "Fiksna cena, šablon sa tri strane i domen u ceni. Ciljamo frizere, pekare i servise iz Leadova kojima fali sajt.",
    autor: JA,
    faza: "razmatra_se",
    za: [ANA, MILICA, NIKOLA],
    protiv: [MARKO],
    komentara: 3,
    pre: 2 * DAY,
    faza_pre: 20 * HOUR,
  },
  {
    n: 3,
    naslov: "Video studije slučaja za pekaru",
    tekst: "Snimiti pre i posle: kako je pekara dobila porudžbine preko sajta. Dva minuta, za Instagram i sajt.",
    autor: ANA,
    faza: "predlog",
    za: [JA],
    protiv: [],
    komentara: 1,
    pre: DAY,
  },
  {
    n: 4,
    naslov: "",
    tekst: "Da li da ponudimo održavanje sajta na mesečnoj pretplati umesto po satu?",
    autor: NIKOLA,
    faza: "predlog",
    za: [],
    protiv: [],
    komentara: 0,
    pre: 5 * HOUR,
  },
  {
    n: 5,
    naslov: "QR kod na vizitkartama vodi na portfolio",
    tekst: "Svaka vizitkarta dobija QR kod koji vodi na stranicu sa radovima, sa merenjem skeniranja.",
    autor: STEFAN,
    faza: "predlog",
    za: [MILICA],
    protiv: [ANA],
    komentara: 0,
    pre: 4 * DAY,
  },
  {
    n: 6,
    naslov: "Automatski odgovor na DM sa cenovnikom",
    tekst: "Kad neko na Instagramu napiše „cena“, OpenReply šalje link na cenovnik i pita za delatnost.",
    autor: MARKO,
    faza: "razmatra_se",
    za: [JA, ANA],
    protiv: [],
    komentara: 2,
    pre: 3 * DAY,
    faza_pre: 2 * DAY,
  },
  {
    n: 7,
    naslov: "Radionica „Prvi sajt“ u Novom Sadu",
    tekst: "Besplatna radionica za vlasnike malih firmi, sa ponudom na kraju.",
    autor: MILICA,
    faza: "razmatra_se",
    za: [NIKOLA],
    protiv: [MARKO, STEFAN],
    komentara: 4,
    pre: 6 * DAY,
    faza_pre: 5 * DAY,
  },
  {
    n: 8,
    naslov: "Šablon ponude u dve strane",
    tekst: "Jedan šablon ponude za sve usluge: cena, rok, šta je uključeno i sledeći korak.",
    autor: ANA,
    faza: "odobreno",
    za: [JA, MARKO, MILICA, NIKOLA],
    protiv: [],
    komentara: 2,
    pre: 8 * DAY,
    faza_pre: DAY,
  },
  {
    n: 9,
    naslov: "Mesečni izveštaj kanala za klijenta",
    tekst: "PDF sa brojevima kanala klijenta, izvučen iz panela jednim klikom.",
    autor: JA,
    faza: "odobreno",
    za: [ANA, MILICA],
    protiv: [],
    komentara: 1,
    pre: 10 * DAY,
    faza_pre: 3 * DAY,
  },
  {
    n: 10,
    naslov: "Webhook naplate za porudžbine",
    tekst: "Porudžbina menja status kad provajder javi uplatu.",
    autor: MARKO,
    faza: "odobreno",
    stranica: ZADATAK_UX,
    za: [JA, ANA, MILICA],
    protiv: [],
    komentara: 5,
    pre: 14 * DAY,
    faza_pre: 9 * DAY,
  },
  {
    n: 11,
    naslov: "Plan objava za decembar",
    tekst: "Tema po nedelji i tri objave nedeljno, pripremljeno do kraja novembra.",
    autor: MILICA,
    faza: "odobreno",
    stranica: fakeId("pages", 202),
    za: [ANA],
    protiv: [],
    komentara: 0,
    pre: 12 * DAY,
    faza_pre: 7 * DAY,
  },
  {
    n: 12,
    naslov: "Hladni pozivi vikendom",
    tekst: "Zvati firme subotom pre podne, kad vlasnik ima vremena.",
    autor: STEFAN,
    faza: "odbijeno",
    za: [],
    protiv: [JA, ANA, MILICA],
    komentara: 2,
    pre: 9 * DAY,
    faza_pre: 4 * DAY,
  },
  {
    n: 13,
    naslov: "TikTok nalog agencije",
    tekst: "Kratki snimci iza scene, tri puta nedeljno.",
    autor: NIKOLA,
    faza: "odbijeno",
    za: [STEFAN],
    protiv: [MARKO],
    komentara: 0,
    pre: 11 * DAY,
    faza_pre: 6 * DAY,
  },
];

// ── Mapa ideja ───────────────────────────────────────────────────────────────
//
// Pet kolona, tri reda; kartica je 288 × 196, red je 224 visok. „Paket Sajt za
// 7 dana“ je grupa (352 × 440) koja nosi ideju 8: njen x/y je prema roditelju,
// ispod zaglavlja grupe. Treći red počinje ispod grupe, a kolona desno od nje
// je razmaknuta da natpis veze „Cena iz paketa“ stane između kartica.

type Raspored = { x: number; y: number; width?: number; height?: number; roditelj?: number; glavna?: boolean };

const MAPA: Record<number, Raspored> = {
  1: { x: 0, y: 0 },
  3: { x: 320, y: 0 },
  2: { x: 640, y: 0, width: 352, height: 440, glavna: true },
  6: { x: 1120, y: 0 },
  4: { x: 1440, y: 0 },
  5: { x: 0, y: 224 },
  7: { x: 320, y: 224 },
  8: { x: 32, y: 216, roditelj: 2 },
  9: { x: 1120, y: 224 },
  10: { x: 1440, y: 224 },
  12: { x: 0, y: 468 },
  13: { x: 320, y: 468 },
  11: { x: 640, y: 468 },
};

/** Veze na mapi (puna linija između dve ideje); jedna nosi natpis. */
const VEZE: { n: number; a: number; b: number; natpis: string | null; pre: number }[] = [
  { n: 1, a: 1, b: 3, natpis: null, pre: 3 * DAY },
  { n: 2, a: 5, b: 7, natpis: null, pre: 5 * DAY },
  { n: 3, a: 6, b: 2, natpis: "Cena iz paketa", pre: 2 * DAY },
];

function veza(seme: (typeof VEZE)[number]): Spisak["edges"][number] {
  const a = fakeId("ideaNodes", seme.a);
  const b = fakeId("ideaNodes", seme.b);
  const nastala = now - seme.pre;
  return {
    _id: fakeId("ideaEdges", seme.n),
    _creationTime: nastala,
    workspaceId: WS,
    authorProfileId: JA._id,
    nodeAId: a,
    nodeBId: b,
    pairKey: [a, b].sort().join(":"),
    label: seme.natpis,
    archivedAt: null,
    createdAt: nastala,
    updatedAt: nastala,
    canEdit: true,
    canDeleteDirectly: true,
    canRequestDeletion: false,
  };
}

// ── Stanje (glas i faza) ─────────────────────────────────────────────────────

const pocetniGlasovi = () =>
  new Map<string, Map<string, Glas>>(
    SEME.map((seme) => [
      fakeId("ideaNodes", seme.n) as string,
      new Map<string, Glas>([
        ...seme.za.map((o) => [o._id as string, "up"] as const),
        ...seme.protiv.map((o) => [o._id as string, "down"] as const),
      ]),
    ]),
  );

const stanje = {
  glasovi: pocetniGlasovi(),
  faze: new Map<string, { faza: IdeaStoredStage; u: number }>(),
  obrisane: new Set<string>(),
};

const sazetak = (p: Osoba) => ({ _id: p._id, displayName: p.displayName, email: p.email, avatarUrl: p.avatarUrl });

function ideja(seme: Seme): Ideja {
  const id = fakeId("ideaNodes", seme.n);
  const nastala = now - seme.pre;
  const promena = stanje.faze.get(id);
  const sacuvana = promena?.faza ?? seme.faza;
  const pretvorena = seme.stranica ?? null;
  const prikazana = pretvorena ? "postalo_zadatak" : sacuvana;
  const glasovi = stanje.glasovi.get(id) ?? new Map<string, Glas>();
  const upvotes = [...glasovi.values()].filter((g) => g === "up").length;
  const downvotes = [...glasovi.values()].filter((g) => g === "down").length;
  const moj = glasovi.get(JA._id) ?? null;
  // Prijavljen sam vlasnik projekta: menjam fazu svake ideje (osim pretvorene).
  const permissions = {
    canEdit: pretvorena === null,
    canVote: pretvorena === null,
    canSetStage: pretvorena === null,
    canConvert: pretvorena === null && sacuvana === "odobreno",
    canArchive: true,
    canComment: true,
  };
  const raspored = MAPA[seme.n];
  return {
    _id: id,
    _creationTime: nastala,
    workspaceId: WS,
    authorProfileId: seme.autor._id,
    title: seme.naslov || null,
    text: seme.tekst,
    x: raspored.x,
    y: raspored.y,
    ...(raspored.width !== undefined && raspored.height !== undefined
      ? { width: raspored.width, height: raspored.height }
      : {}),
    ...(raspored.roditelj !== undefined ? { parentIdeaId: fakeId("ideaNodes", raspored.roditelj) } : {}),
    ...(raspored.glavna ? { isParent: true } : {}),
    color: "neutral",
    convertedPageId: pretvorena,
    convertedAt: pretvorena ? now - (seme.faza_pre ?? seme.pre) : null,
    stage: prikazana,
    stageChangedAt: promena?.u ?? (seme.faza_pre !== undefined ? now - seme.faza_pre : null),
    archivedAt: null,
    createdAt: nastala,
    updatedAt: promena?.u ?? nastala,
    storedStage: sacuvana,
    author: sazetak(seme.autor),
    upvotes,
    downvotes,
    userVote: moj,
    myVote: moj,
    isApproved: prikazana === "odobreno",
    netVotes: upvotes - downvotes,
    commentCount: seme.komentara,
    commentCountCapped: false,
    contributionCount: seme.komentara,
    permissions,
    pendingDeletionRequest: null,
    canEdit: permissions.canEdit,
    canMove: permissions.canEdit,
    canResize: permissions.canEdit,
    canDeleteDirectly: permissions.canArchive,
    canRequestDeletion: false,
    canDetach: raspored.roditelj !== undefined && permissions.canEdit,
    nestingRequestId: null,
    nestingModerationStatus: null,
    canModerateNesting: false,
  } satisfies Ideja;
}

function spisak(): Spisak {
  const prikazane = SEME.filter((seme) => !stanje.obrisane.has(fakeId("ideaNodes", seme.n)));
  const vidljive = new Set(prikazane.map((seme) => seme.n));
  return {
    nodes: prikazane.map(ideja),
    edges: VEZE.filter((v) => vidljive.has(v.a) && vidljive.has(v.b)).map(veza),
    // Mapa ideja kreće od sačuvanog pogleda (nema „uklopi sve“): 0,6 uklapa
    // ceo raspored (1728 × 664) u ~1060 × 430 px.
    canvasState: { x: 24, y: 72, zoom: 0.6 },
    currentProfileId: JA._id,
    viewer: { profileId: JA._id, isManager: true },
  };
}

function glasaj(args: Record<string, unknown>) {
  const id = String(args.ideaId);
  const glas = args.voteType as Glas;
  const glasovi = stanje.glasovi.get(id) ?? new Map<string, Glas>();
  if (glasovi.get(JA._id) === glas) glasovi.delete(JA._id);
  else glasovi.set(JA._id, glas);
  stanje.glasovi.set(id, glasovi);
  return null;
}

// ── Komentari ideje ──────────────────────────────────────────────────────────

const KOMENTARI_IDEJE: { n: number; autor: Osoba; tekst: string; pomenuti?: Osoba[]; pre: number }[] = [
  {
    n: 51,
    autor: MARKO,
    tekst: "Sedam dana je tesno ako klijent kasni sa slikama i tekstom. Možemo li rok da brojimo od dana kad stigne sav sadržaj?",
    pre: DAY + 4 * HOUR,
  },
  {
    n: 52,
    autor: ANA,
    tekst: "@Marko Proba slažem se. Ja bih u ponudi napisala tačan spisak šta klijent šalje prvog dana.",
    pomenuti: [MARKO],
    pre: 22 * HOUR,
  },
  {
    n: 53,
    autor: JA,
    tekst: "Važi. Probaću paket na tri firme iz Leadova pre nego što ga odobrimo.",
    pre: 2 * HOUR,
  },
];

function komentariIdeje(): Komentar[] {
  return KOMENTARI_IDEJE.map((seme) => {
    const { content, mentionProfileIds } = serializeComment(
      seme.tekst,
      (seme.pomenuti ?? []).map((osoba) => ({ profileId: osoba._id, displayName: osoba.displayName })),
    );
    const nastao = now - seme.pre;
    const moj = seme.autor._id === JA._id;
    return {
      _id: fakeId("contentContributions", seme.n),
      targetKind: "idea",
      targetId: IDEJA_UX,
      content,
      mentions: mentionProfileIds.flatMap((profileId) => {
        const osoba = PROFILI.find((p) => p._id === profileId);
        return osoba ? [{ _id: osoba._id, displayName: osoba.displayName, avatarUrl: osoba.avatarUrl }] : [];
      }),
      author: { _id: seme.autor._id, displayName: seme.autor.displayName, avatarUrl: seme.autor.avatarUrl },
      origin: "comment",
      moderationStatus: "approved",
      createdAt: nastao,
      updatedAt: nastao,
      edited: false,
      permissions: { canEdit: moj, canRemove: moj },
    } satisfies Komentar;
  });
}

function jeIdejaUx(cilj: unknown): boolean {
  if (typeof cilj !== "object" || cilj === null) return false;
  const { kind, id } = cilj as { kind?: unknown; id?: unknown };
  return kind === "idea" && id === IDEJA_UX;
}

function osnovni(funkcija: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>): unknown {
  return FIXTURES_PROSTOR_DOKUMENTI[getFunctionName(funkcija)]?.(args);
}

export const FIXTURES_PROSTOR_IDEJE: Record<string, Fixture> = {
  [getFunctionName(api.prostor.ideas.list)]: () => spisak(),
  [getFunctionName(api.prostor.comments.list)]: (a) =>
    jeIdejaUx(a.target) ? strana(komentariIdeje()) : osnovni(api.prostor.comments.list, a),
  // Mutacije menjaju stanje modula (vidi zaglavlje) i vraćaju što i server.
  [getFunctionName(api.prostor.ideas.vote)]: (a) => glasaj(a),
  [getFunctionName(api.prostor.ideas.setStage)]: (a) => {
    stanje.faze.set(String(a.ideaId), { faza: a.stage as IdeaStoredStage, u: Date.now() });
    return null;
  },
  [getFunctionName(api.prostor.ideas.archive)]: (a) => {
    stanje.obrisane.add(String(a.ideaId));
    return null;
  },
  [getFunctionName(api.prostor.ideas.restoreOwn)]: (a) => {
    stanje.obrisane.delete(String(a.ideaId));
    return null;
  },
  [getFunctionName(api.prostor.ideas.create)]: () => fakeId("ideaNodes", 99),
  [getFunctionName(api.prostor.ideas.convertToPage)]: () => fakeId("pages", 203),
};

/** `&prazno=1`: projekat bez ideja. */
export const PRAZNO_PROSTOR_IDEJE: Record<string, Fixture> = {
  [getFunctionName(api.prostor.ideas.list)]: () =>
    ({
      nodes: [],
      edges: [],
      canvasState: { x: 0, y: 0, zoom: 1 },
      currentProfileId: JA._id,
      viewer: { profileId: JA._id, isManager: true },
    }) satisfies Spisak,
};
