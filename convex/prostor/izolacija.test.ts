/// <reference types="vite/client" />
/**
 * SPAJANJE S29 (nov test): izolacija kroz SVE javne funkcije radnog dela.
 *
 * Ostali testovi proveravaju izolaciju funkciju po funkciju; ovaj prolazi kroz
 * svaku javnu funkciju u `convex/prostor/*.ts` (`projekat*` i `prijavljen*`),
 * gradi argumente iz njenog validatora i napada ID-jevima iz tuđeg projekta:
 *
 * - **Napadač** je urednik u projektu B, nije član projekta A. Projektne
 *   funkcije zove sa `workspaceId: B`, a lične bez projekta. Za svaku funkciju
 *   ide varijanta „svi ID-jevi iz A“ i, za svaki ID u argumentima, varijanta
 *   „ovaj ID iz A, ostali iz B“ (sekundarni ID je najčešća rupa).
 * - **Posmatrač** je `client_viewer` u A i urednik u B (pa ima profil). Svaka
 *   projektna funkcija sa `workspaceId: A` mora da ga odbije, a lične ne smeju
 *   da mu pokažu ništa iz A (O5).
 *
 * Prekršaj je: odgovor u kome je tekst iz A (svaki tekst u A nosi oznaku
 * `TAJNA`, i imena ljudi samo iz A) ili ID dokumenta iz A koji nije bio u
 * argumentima; izmenjen ili obrisan dokument iz A; nov dokument koji pokazuje
 * na dokument iz A. „Dokument iz A“ je sve što nosi `workspaceId` A ili
 * (posredno) pokazuje na takav dokument ili na ljude samo iz A.
 *
 * Funkcija čiji argumenti ne prođu validator nije izvršena, pa ih ne sme
 * biti; isto važi za ID tabele koja u semenu nema nijedan dokument.
 */
import { convexTest, type TestConvex } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { obezbediRadniDeoProjekta } from "./lib/radniDeo";
import { insertProfil, kao } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");
const moduliProstora = import.meta.glob("/convex/prostor/*.ts");

const OZNAKA = "TAJNA";
const DAN = 86_400_000;

type Json = { type: string; [k: string]: unknown };
type Doc = Record<string, unknown> & { _id: string };
type Snimak = Map<string, { tabela: string; doc: Doc }>;
type Vrsta = "query" | "mutation" | "action";
type Javna = { modul: string; ime: string; vrsta: Vrsta; args: Json; projektna: boolean };

// ---------------------------------------------------------------- spisak funkcija

async function javneFunkcije(): Promise<Javna[]> {
  const javne: Javna[] = [];
  for (const [putanja, ucitaj] of Object.entries(moduliProstora)) {
    if (/\.(test|pomoc)\.ts$/.test(putanja) || putanja.endsWith("/schema.ts")) continue;
    const modul = putanja.replace(/^.*\/prostor\//, "").replace(/\.ts$/, "");
    const izvoz = (await ucitaj()) as Record<string, Record<string, unknown>>;
    for (const [ime, f] of Object.entries(izvoz)) {
      if (f === null || (typeof f !== "function" && typeof f !== "object")) continue;
      if (f.isPublic !== true || typeof f.exportArgs !== "function") continue;
      const vrsta: Vrsta = f.isQuery ? "query" : f.isMutation ? "mutation" : "action";
      const args = JSON.parse((f.exportArgs as () => string)()) as Json;
      const polja = (args.value ?? {}) as Record<string, unknown>;
      javne.push({ modul, ime, vrsta, args, projektna: "workspaceId" in polja && isProjektnaPoArgs(polja) });
    }
  }
  return javne.sort((a, b) => `${a.modul}.${a.ime}`.localeCompare(`${b.modul}.${b.ime}`));
}

/** Omotač projekta dodaje obavezan `workspaceId: v.id("workspaces")`. */
function isProjektnaPoArgs(polja: Record<string, unknown>): boolean {
  const ws = polja.workspaceId as { fieldType: Json; optional: boolean };
  return ws.optional === false && ws.fieldType.type === "id";
}

// ---------------------------------------------------------------- snimak baze

async function snimi(t: TestConvex<typeof schema>): Promise<Snimak> {
  const redovi = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      query: (t: string) => { collect: () => Promise<Doc[]> };
      system: { query: (t: string) => { collect: () => Promise<Doc[]> } };
    };
    const izlaz: Array<{ tabela: string; doc: Doc }> = [];
    for (const tabela of Object.keys(schema.tables)) {
      for (const doc of await db.query(tabela).collect()) izlaz.push({ tabela, doc });
    }
    for (const doc of await db.system.query("_storage").collect()) {
      izlaz.push({ tabela: "_storage", doc });
    }
    return izlaz;
  });
  return new Map(redovi.map((r) => [r.doc._id, r]));
}

function stringovi(vrednost: unknown, izlaz: string[] = []): string[] {
  if (typeof vrednost === "string") izlaz.push(vrednost);
  else if (Array.isArray(vrednost)) for (const v of vrednost) stringovi(v, izlaz);
  else if (vrednost !== null && typeof vrednost === "object") {
    for (const v of Object.values(vrednost)) stringovi(v, izlaz);
  }
  return izlaz;
}

function pokazujeNa(doc: Doc, skup: ReadonlySet<string>): string | null {
  const { _id, ...ostalo } = doc;
  void _id;
  return stringovi(ostalo).find((s) => skup.has(s)) ?? null;
}

/** Dokumenti projekta: `workspaceId`, seme (ljudi samo iz projekta) i sve što posredno pokazuje na njih. */
function vlasnistvo(snimak: Snimak, ws: string, seme: string[]): Set<string> {
  const skup = new Set<string>([ws, ...seme]);
  for (let promena = true; promena; ) {
    promena = false;
    for (const [id, { doc }] of snimak) {
      if (skup.has(id)) continue;
      if (doc.workspaceId === ws || pokazujeNa(doc, skup) !== null) {
        skup.add(id);
        promena = true;
      }
    }
  }
  // Blob nema `workspaceId` ni veze; pripada projektu čiji ga dokument drži.
  for (const id of [...skup]) {
    const red = snimak.get(id);
    if (red === undefined) continue;
    for (const s of stringovi(red.doc)) if (snimak.get(s)?.tabela === "_storage") skup.add(s);
  }
  return skup;
}

// ---------------------------------------------------------------- argumenti

class NemaDokumenta extends Error {}

type Bazen = {
  ws: string;
  korisnik: string;
  profil: string;
  stranice: Record<"note" | "task" | "table" | "file", string>;
  poTabeli: Map<string, string[]>;
};

function bazen(
  snimak: Snimak,
  skup: ReadonlySet<string>,
  osnova: Omit<Bazen, "poTabeli">,
): Bazen {
  // Redosled upisa; dokumenti sa `workspaceId` projekta idu napred.
  const svoji = new Map<string, string[]>();
  const ostali = new Map<string, string[]>();
  for (const [id, red] of snimak) {
    if (!skup.has(id)) continue;
    const mapa = red.doc.workspaceId === osnova.ws ? svoji : ostali;
    mapa.set(red.tabela, [...(mapa.get(red.tabela) ?? []), id]);
  }
  const poTabeli = new Map<string, string[]>();
  for (const tabela of new Set([...svoji.keys(), ...ostali.keys()])) {
    poTabeli.set(tabela, [...(svoji.get(tabela) ?? []), ...(ostali.get(tabela) ?? [])]);
  }
  return { ...osnova, poTabeli };
}

/** Zadaci, tabele i fajlovi traže stranicu svoje vrste pre provere projekta. */
const VRSTA_PO_MODULU: Record<string, "task" | "table" | "file"> = {
  tasks: "task",
  taskCheckpoints: "task",
  taskAssignees: "task",
  taskCheckpointCanvasEdges: "task",
  veze: "task",
  pageTables: "table",
  pageFiles: "file",
};

/**
 * ID iz bazena. Drugo mesto iste tabele u istom pozivu dobija drugi dokument
 * (inače „ne može biti povezana sama sa sobom“ odbije pre provere projekta).
 */
function izBazena(b: Bazen, tabela: string, put: string, modul: string, vidjeno: Map<string, number>): string {
  if (tabela === "workspaces") return b.ws;
  if (tabela === "users") return b.korisnik;
  const redni = vidjeno.get(tabela) ?? 0;
  vidjeno.set(tabela, redni + 1);
  if (tabela === "profiles" && redni === 0) return b.profil;
  const p = put.toLowerCase();
  if (tabela === "pages" && redni === 0) {
    const vrsta = VRSTA_PO_MODULU[modul];
    if (vrsta !== undefined) return b.stranice[vrsta];
    if (p.includes("task")) return b.stranice.task;
    if (p.includes("table") || p.includes("tabel")) return b.stranice.table;
    if (p.includes("file")) return b.stranice.file;
    return b.stranice.note;
  }
  const lista = b.poTabeli.get(tabela);
  if (lista === undefined || lista.length === 0) throw new NemaDokumenta(tabela);
  return lista[redni % lista.length];
}

function imaId(j: Json): boolean {
  switch (j.type) {
    case "id":
      return true;
    case "array":
      return imaId(j.value as Json);
    case "object":
      return Object.values(j.value as Record<string, { fieldType: Json }>).some((f) =>
        imaId(f.fieldType),
      );
    case "union":
      return (j.value as Json[]).some(imaId);
    case "record":
      return imaId((j.values as { fieldType: Json }).fieldType);
    default:
      return false;
  }
}

const DANAS = new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);

function broj(ime: string): number {
  if (/revision/i.test(ime)) return 0;
  if (/^(position|index|order|redosled)$/i.test(ime)) return 0;
  if (/^(x|y)$/.test(ime)) return 10;
  if (/(width|height|^w$|^h$|size)/i.test(ime)) return 200;
  if (/(numItems|limit|count|max)/i.test(ime)) return 5;
  if (/(At|Date|Since|Start|until|now|week|time|Ms)$/i.test(ime) || /^(now|since)/i.test(ime)) {
    return Date.now() + DAN;
  }
  return 1;
}

function tekst(ime: string): string {
  if (ime === "dayKey" || /dayKey$/i.test(ime)) return DANAS;
  if (/email/i.test(ime)) return "x@example.test";
  if (/(url|endpoint)$/i.test(ime)) return "https://example.test/x";
  if (/emoji/i.test(ime)) return "👍";
  if (/(boja|color)$/i.test(ime)) return "#58c4ff";
  return "x";
}

/** Vrednost za validator; `izbor(tabela, put)` daje ID iz bazena. */
function vrednost(j: Json, put: string, ime: string, izbor: (tabela: string, put: string) => string): unknown {
  if (ime === "paginationOpts") return { numItems: 5, cursor: null };
  if (ime === "cursor") return null;
  switch (j.type) {
    case "id":
      return izbor(j.tableName as string, put);
    case "string":
      return tekst(ime);
    case "number":
    case "float64":
      return broj(ime);
    case "bigint":
    case "int64":
      return BigInt(1);
    case "boolean":
      return true;
    case "null":
      return null;
    case "literal":
      return j.value;
    case "bytes":
      return new ArrayBuffer(1);
    case "any":
      return {};
    case "record":
      return {};
    case "array": {
      const element = j.value as Json;
      return imaId(element) ? [vrednost(element, `${put}[0]`, ime, izbor)] : [];
    }
    case "union": {
      const clanovi = j.value as Json[];
      const izabran =
        clanovi.find(imaId) ??
        clanovi.find((c) => c.type === "literal") ??
        clanovi.find((c) => c.type !== "null") ??
        clanovi[0];
      return vrednost(izabran, put, ime, izbor);
    }
    case "object": {
      const objekat: Record<string, unknown> = {};
      for (const [k, f] of Object.entries(j.value as Record<string, { fieldType: Json; optional: boolean }>)) {
        if (f.optional && !imaId(f.fieldType)) continue;
        objekat[k] = vrednost(f.fieldType, put === "" ? k : `${put}.${k}`, k, izbor);
      }
      return objekat;
    }
    default:
      throw new Error(`nepoznat validator ${j.type} (${put})`);
  }
}

/** Mesta ID-jeva u argumentima (bez `workspaceId` omotača). */
function mestaId(args: Json): string[] {
  const mesta: string[] = [];
  vrednost(args, "", "", (_tabela, put) => {
    if (put !== "workspaceId") mesta.push(put);
    return "x";
  });
  return mesta;
}

// ---------------------------------------------------------------- seme sveta

async function svet() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const now = Date.now();
    const osoba = async (ime: string, email: string, admin = false) => {
      const userId = await ctx.db.insert("users", { name: ime, email });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: ime,
        email,
        role: admin ? "admin" : "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    // Ljudi samo iz A nose oznaku u imenu: spisak ljudi koji ih pokaže napadaču curi (P9).
    const vlasnikA = await osoba(`Vlasnik ${OZNAKA}`, "vlasnik@a.test", true);
    const clanA = await osoba(`Clan ${OZNAKA}`, "clan@a.test");
    const napadac = await osoba("Napadac", "napadac@b.test");
    const klijent = await osoba("Klijent", "klijent@b.test");
    const logoA = await ctx.storage.store(new Blob([OZNAKA], { type: "image/png" }));
    const A = await ctx.db.insert("workspaces", {
      name: `Projekat ${OZNAKA}`,
      slug: "tajna-a",
      vrsta: "klijent",
      createdBy: vlasnikA.userId,
      opis: `Opis ${OZNAKA}`,
      brend: { logoStorageId: logoA },
    });
    const B = await ctx.db.insert("workspaces", {
      name: "Projekat B",
      slug: "projekat-b",
      vrsta: "klijent",
      createdBy: napadac.userId,
    });
    await ctx.db.insert("members", { workspaceId: A, userId: vlasnikA.userId, role: "owner" });
    await ctx.db.insert("members", { workspaceId: A, userId: clanA.userId, role: "urednik" });
    await ctx.db.insert("members", { workspaceId: A, userId: klijent.userId, role: "client_viewer" });
    await ctx.db.insert("members", { workspaceId: B, userId: napadac.userId, role: "owner" });
    await ctx.db.insert("members", { workspaceId: B, userId: klijent.userId, role: "urednik" });
    await obezbediRadniDeoProjekta(ctx, { workspaceId: A, userId: vlasnikA.userId, now });
    await obezbediRadniDeoProjekta(ctx, { workspaceId: B, userId: napadac.userId, now });
    // Firma iz Leadova (veza zadatka, P19), po jedna u svakom projektu.
    for (const [workspaceId, ime] of [
      [A, `Firma ${OZNAKA}`],
      [B, "Firma B"],
    ] as const) {
      await ctx.db.insert("leadCompanies", {
        workspaceId,
        name: ime,
        nameNormalized: ime.toLowerCase(),
        origin: "import",
        createdAt: now,
        updatedAt: now,
      });
    }
    return { A, B, vlasnikA, clanA, napadac, klijent };
  });
  return { t, ...s };
}

/** Puni projekat kroz javne funkcije (vlasnik i član), svaki tekst sa oznakom. */
async function napuni(
  t: TestConvex<typeof schema>,
  ws: Id<"workspaces">,
  vlasnik: { userId: Id<"users">; profileId: Id<"profiles"> },
  clan: { userId: Id<"users">; profileId: Id<"profiles"> } | null,
  oznaka: string,
) {
  const v = kao(t, vlasnik.userId);
  const P = { workspaceId: ws };
  const oblasti = await t.run((ctx) =>
    ctx.db
      .query("areas")
      .withIndex("by_workspaceId_and_position", (q) => q.eq("workspaceId", ws))
      .collect(),
  );
  const areaId = oblasti[0]._id;
  const stranica = (kind: "note" | "task" | "table" | "file", naslov: string, parent: Id<"pages"> | null = null) =>
    v.mutation(api.prostor.pages.create, {
      ...P,
      areaId,
      parentPageId: parent,
      kind,
      title: `${naslov} ${oznaka}`,
      ...(kind === "note" ? { content: `<p>Sadrzaj ${oznaka}</p>` } : {}),
      ...(kind === "task" && clan !== null
        ? { assigneeProfileIds: [clan.profileId], dueDate: Date.now() + DAN }
        : {}),
    });
  const note = await stranica("note", "Beleska");
  await stranica("note", "Podstranica", note);
  const task = await stranica("task", "Zadatak");
  const table = await stranica("table", "Tabela");
  const file = await stranica("file", "Fajlovi");
  const zaKorpu = await stranica("note", "Obrisana");
  await v.mutation(api.prostor.pages.archive, { ...P, pageId: zaKorpu });
  await v.mutation(api.prostor.pages.update, {
    ...P,
    pageId: note,
    content: `<p>Druga verzija ${oznaka}</p>`,
    expectedRevision: 0,
  });
  await v.mutation(api.prostor.comments.add, {
    ...P,
    target: { kind: "page", id: note },
    content: `Komentar ${oznaka}`,
  });
  await v.mutation(api.prostor.areasV2.createRelation, { ...P, pageAId: note, pageBId: task });
  await v.mutation(api.prostor.taskCheckpoints.create, { ...P, taskPageId: task, text: `Korak ${oznaka}` });
  await v.mutation(api.prostor.pageTables.addColumn, { ...P, pageId: table, label: `Kolona ${oznaka}` });
  await v.mutation(api.prostor.pageTables.addRow, { ...P, pageId: table });
  const { token } = await v.mutation(api.prostor.pageFiles.generateUploadUrl, { ...P, pageId: file });
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([`fajl ${oznaka}`], { type: "image/png" })),
  );
  await v.mutation(api.prostor.pageFiles.attach, { ...P, pageId: file, storageId, token, name: `fajl-${oznaka}.png` });
  const ideja1 = await v.mutation(api.prostor.ideas.create, { ...P, title: `Ideja ${oznaka}`, text: `Tekst ${oznaka}` });
  const ideja2 = await v.mutation(api.prostor.ideas.create, { ...P, title: `Ideja 2 ${oznaka}`, text: `Tekst ${oznaka}` });
  await v.mutation(api.prostor.ideas.connect, { ...P, nodeAId: ideja1, nodeBId: ideja2 });
  await v.mutation(api.prostor.ideas.setStage, { ...P, ideaId: ideja1, stage: "odobreno" });
  await v.mutation(api.prostor.comments.add, {
    ...P,
    target: { kind: "idea", id: ideja1 },
    content: `Komentar ideje ${oznaka}`,
  });
  const misao1 = await v.mutation(api.prostor.thoughts.createNote, { workspaceId: ws, text: `Misao ${oznaka}` });
  const misao2 = await v.mutation(api.prostor.thoughts.createNote, { workspaceId: ws, text: `Misao 2 ${oznaka}` });
  await v.mutation(api.prostor.thoughts.createEdge, { ...P, nodeAId: misao1, nodeBId: misao2 });
  await v.mutation(api.prostor.thoughts.createNote, { workspaceId: null, text: `Licna beleska ${oznaka}` });
  await v.mutation(api.prostor.personalTasks.create, { title: `Licni zadatak ${oznaka}` });
  await v.mutation(api.prostor.myDay.plan, { dayKey: DANAS, ref: { kind: "task", taskPageId: task } });
  await v.mutation(api.prostor.presence.heartbeat, { ...P, pageId: note, editing: true });
  await v.mutation(api.prostor.pushSubscriptions.save, {
    endpoint: `https://push.example.test/${oznaka}`,
    p256dh: `kljuc-${oznaka}`,
    auth: `auth-${oznaka}`,
  });
  const opsti = await t.run(async (ctx) =>
    (await ctx.db.query("chatChannels").collect()).find((c) => c.workspaceId === ws && c.kind === "startup"),
  );
  if (!opsti) throw new Error("nema opšteg kanala");
  const poruka = await v.mutation(api.prostor.chat.sendMessage, {
    channelId: opsti._id,
    body: `Poruka ${oznaka}`,
  });
  if (!poruka.ok) throw new Error("poruka nije poslata");
  await v.mutation(api.prostor.chat.toggleReaction, { messageId: poruka.messageId, emoji: "👍" });
  await v.mutation(api.prostor.chat.markChannelRead, { channelId: opsti._id });
  if (clan !== null) {
    const dm = await v.mutation(api.prostor.chat.openPersonalDm, { otherProfileId: clan.profileId });
    await v.mutation(api.prostor.chat.sendMessage, { channelId: dm, body: `DM ${oznaka}` });
    const grupa = await v.mutation(api.prostor.chat.createPersonalGroup, {
      name: `Grupa ${oznaka}`,
      memberProfileIds: [clan.profileId],
    });
    await v.mutation(api.prostor.chat.sendMessage, { channelId: grupa, body: `Grupa ${oznaka}` });
  }
  if (oznaka === OZNAKA) {
    // Vlasnik A je i vlasnik platforme, pa sme da doda provajdera (D14).
    await v.mutation(api.prostor.aiProviders.create, {
      ...P,
      label: `AI ${oznaka}`,
      baseUrl: "https://api.example.test/v1",
      model: "model-x",
      apiKey: `sk-${oznaka}-kljuc-0123456789`,
    });
  }
  return { stranice: { note, task, table, file }, ideja1, ideja2, areaId };
}

/**
 * Stari tokovi i redovi koje javne funkcije ne prave lako (P21: tabele koje
 * preneti kod i dalje čita), upisani direktno, da bi i njihove funkcije bile
 * napadnute. Isti oblik u oba projekta.
 */
async function stariTokovi(
  t: TestConvex<typeof schema>,
  ws: Id<"workspaces">,
  profil: Id<"profiles">,
  p: Awaited<ReturnType<typeof napuni>>,
  oznaka: string,
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const { note, task, table } = p.stranice;
    const korak = (
      await ctx.db
        .query("taskCheckpoints")
        .collect()
    ).find((c) => c.taskPageId === task);
    if (!korak) throw new Error("nema koraka zadatka");
    const vreme = { createdAt: now, updatedAt: now };
    await ctx.db.insert("pageEntries", { pageId: note, authorProfileId: profil, content: `Unos ${oznaka}`, position: 0, ...vreme });
    await ctx.db.insert("pageEdges", {
      workspaceId: ws,
      areaId: p.areaId,
      nodeAId: note,
      nodeBId: task,
      pairKey: `${note}:${task}`,
      label: `Veza ${oznaka}`,
      authorProfileId: profil,
      archivedAt: null,
      ...vreme,
    });
    await ctx.db.insert("nestingRequests", {
      workspaceId: ws,
      childIdeaId: p.ideja2,
      parentIdeaId: p.ideja1,
      requesterProfileId: profil,
      parentAuthorProfileId: profil,
      status: "pending",
      resolvedAt: null,
      ...vreme,
    });
    await ctx.db.insert("deletionRequests", {
      workspaceId: ws,
      targetKind: "page",
      targetId: note,
      targetTitle: `Brisanje ${oznaka}`,
      requesterProfileId: profil,
      status: "pending",
      eligibleCount: 1,
      approveCount: 0,
      rejectCount: 0,
      resolvedAt: null,
      ...vreme,
    });
    await ctx.db.insert("recoveredContent", {
      workspaceId: ws,
      title: `Oporavljeno ${oznaka}`,
      sourceKind: "page",
      sourceTargetId: note,
      createdByProfileId: profil,
      archivedAt: null,
      ...vreme,
    });
    await ctx.db.insert("pageNestingRequests", {
      workspaceId: ws,
      areaId: p.areaId,
      childPageId: table,
      sourceParentPageId: null,
      targetParentPageId: note,
      requesterProfileId: profil,
      parentAuthorProfileId: profil,
      expectedTreeRevision: 0,
      status: "pending",
      resolvedAt: null,
      ...vreme,
    });
    await ctx.db.insert("pageCanvasEdgesV2", {
      workspaceId: ws,
      areaId: p.areaId,
      rootPageId: null,
      nodeAId: note,
      nodeBId: table,
      pairKey: `${note}:${table}`,
      label: `Ivica ${oznaka}`,
      authorProfileId: profil,
      attribution: "author",
      archivedAt: null,
      ...vreme,
    });
    await ctx.db.insert("taskCheckpointCanvasEdges", {
      workspaceId: ws,
      areaId: p.areaId,
      rootPageId: null,
      endpointA: { kind: "page", id: task },
      endpointB: { kind: "task_checkpoint", id: korak._id },
      endpointAKey: `page:${task}`,
      endpointBKey: `task_checkpoint:${korak._id}`,
      endpointAPageId: task,
      endpointBPageId: task,
      pairKey: `page:${task}|task_checkpoint:${korak._id}`,
      authorProfileId: profil,
      archivedAt: null,
      ...vreme,
    });
    if (oznaka !== OZNAKA) {
      // B nema vlasnika platforme, pa provajder ide direktno (za varijante „jedan iz A“).
      await ctx.db.insert("aiProviders", {
        workspaceId: ws,
        label: `AI ${oznaka}`,
        baseUrl: "https://api.example.test/v1",
        model: "model-x",
        apiKey: `sk-${oznaka}-kljuc-0123456789`,
        keySuffix: "6789",
        isDefault: false,
        enabled: true,
        createdByProfileId: profil,
        lastUsedAt: null,
        lastErrorAt: null,
        lastError: null,
        ...vreme,
      });
    }
  });
}

// ---------------------------------------------------------------- napad

type Ishod =
  | { vrsta: "odbijeno"; poruka: string }
  | { vrsta: "argumenti"; poruka: string }
  | { vrsta: "nema"; tabela: string }
  | { vrsta: "proslo" };

type Prekrsaj = { funkcija: string; varijanta: string; sta: string };

async function napadni(
  t: TestConvex<typeof schema>,
  korisnik: Id<"users">,
  f: Javna,
  args: Record<string, unknown>,
  aSkup: ReadonlySet<string>,
  varijanta: string,
  prekrsaji: Prekrsaj[],
): Promise<Ishod> {
  const putanja = `prostor/${f.modul}:${f.ime}`;
  const ja = kao(t, korisnik);
  const pre = f.vrsta === "query" ? null : await snimi(t);
  let rezultat: unknown;
  let ishod: Ishod;
  try {
    if (f.vrsta === "query") {
      rezultat = await ja.query(makeFunctionReference<"query">(putanja), args);
    } else if (f.vrsta === "mutation") {
      rezultat = await ja.mutation(makeFunctionReference<"mutation">(putanja), args);
    } else {
      rezultat = await ja.action(makeFunctionReference<"action">(putanja), args);
    }
    ishod = { vrsta: "proslo" };
  } catch (greska) {
    const poruka = greska instanceof Error ? greska.message : String(greska);
    ishod = /ArgumentValidationError|does not match validator|Validator error/i.test(poruka)
      ? { vrsta: "argumenti", poruka }
      : { vrsta: "odbijeno", poruka };
  }
  const ime = `${f.modul}.${f.ime}`;
  if (ishod.vrsta === "proslo") {
    const uArgumentima = new Set(stringovi(args));
    const tekstovi = stringovi(rezultat);
    const sOznakom = tekstovi.find((s) => s.includes(OZNAKA));
    if (sOznakom !== undefined) {
      prekrsaji.push({ funkcija: ime, varijanta, sta: `odgovor nosi tekst iz A: „${sOznakom.slice(0, 60)}“` });
    }
    const idIzA = tekstovi.find((s) => aSkup.has(s) && !uArgumentima.has(s));
    if (idIzA !== undefined) {
      prekrsaji.push({ funkcija: ime, varijanta, sta: `odgovor nosi ID iz A (${idIzA})` });
    }
  }
  if (pre !== null) {
    const posle = await snimi(t);
    for (const id of aSkup) {
      const p = pre.get(id);
      if (p === undefined) continue;
      const q = posle.get(id);
      if (q === undefined) prekrsaji.push({ funkcija: ime, varijanta, sta: `obrisan ${p.tabela} ${id}` });
      else if (JSON.stringify(q.doc) !== JSON.stringify(p.doc)) {
        prekrsaji.push({ funkcija: ime, varijanta, sta: `izmenjen ${p.tabela} ${id}` });
      }
    }
    for (const [id, { tabela, doc }] of posle) {
      if (pre.has(id)) continue;
      const veza = pokazujeNa(doc, aSkup);
      if (veza !== null) prekrsaji.push({ funkcija: ime, varijanta, sta: `nov ${tabela} pokazuje na A (${veza})` });
    }
  }
  return ishod;
}

describe("izolacija kroz sve javne funkcije radnog dela (S29)", () => {
  test(
    "napadač iz B i posmatrač iz A ne čitaju i ne menjaju ništa iz A",
    async () => {
      const s = await svet();
      const punA = await napuni(s.t, s.A, s.vlasnikA, s.clanA, OZNAKA);
      const punB = await napuni(s.t, s.B, s.napadac, s.klijent, "B");
      await stariTokovi(s.t, s.A, s.vlasnikA.profileId, punA, OZNAKA);
      await stariTokovi(s.t, s.B, s.napadac.profileId, punB, "B");
      const snimak = await snimi(s.t);
      const aSkup = vlasnistvo(snimak, s.A, [
        s.vlasnikA.userId,
        s.vlasnikA.profileId,
        s.clanA.userId,
        s.clanA.profileId,
      ]);
      // Napadačevi dokumenti: projekat B i njegovi lični (bez posmatrača, koji je u oba).
      const bSkup = vlasnistvo(snimak, s.B, [s.napadac.userId, s.napadac.profileId]);
      for (const id of aSkup) bSkup.delete(id);
      const bazenA = bazen(snimak, aSkup, {
        ws: s.A,
        korisnik: s.vlasnikA.userId,
        profil: s.vlasnikA.profileId,
        stranice: punA.stranice,
      });
      const bazenB = bazen(snimak, bSkup, {
        ws: s.B,
        korisnik: s.napadac.userId,
        profil: s.napadac.profileId,
        stranice: punB.stranice,
      });

      const javne = await javneFunkcije();
      const prekrsaji: Prekrsaj[] = [];
      const izvestaj: Array<{ funkcija: string; varijanta: string; ishod: Ishod }> = [];
      const pokusaj = async (
        korisnik: Id<"users">,
        f: Javna,
        varijanta: string,
        izbor: (vidjeno: Map<string, number>) => (tabela: string, put: string) => string,
        ws: string | null,
      ) => {
        let args: Record<string, unknown>;
        try {
          args = vrednost(f.args, "", "", izbor(new Map())) as Record<string, unknown>;
        } catch (greska) {
          if (greska instanceof NemaDokumenta) {
            izvestaj.push({ funkcija: `${f.modul}.${f.ime}`, varijanta, ishod: { vrsta: "nema", tabela: greska.message } });
            return;
          }
          throw greska;
        }
        if (ws !== null) args.workspaceId = ws;
        const ishod = await napadni(s.t, korisnik, f, args, aSkup, varijanta, prekrsaji);
        izvestaj.push({ funkcija: `${f.modul}.${f.ime}`, varijanta, ishod });
      };

      for (const f of javne) {
        const mesta = mestaId(f.args);
        const ws = f.projektna ? s.B : null;
        // 1. Napadač: svi ID-jevi iz A.
        await pokusaj(s.napadac.userId, f, "napadač: sve iz A", (vidjeno) => (tabela, put) =>
          put === "workspaceId" ? s.A : izBazena(bazenA, tabela, put, f.modul, vidjeno), ws);
        // 2. Napadač: jedan ID iz A, ostali iz B.
        if (mesta.length > 1 || (mesta.length === 1 && !f.projektna)) {
          for (const mesto of mesta) {
            await pokusaj(s.napadac.userId, f, `napadač: ${mesto} iz A`, (vidjeno) => (tabela, put) =>
              put === mesto || put === "workspaceId" && !f.projektna
                ? izBazena(bazenA, tabela, put, f.modul, vidjeno)
                : izBazena(bazenB, tabela, put, f.modul, vidjeno), ws);
          }
        }
        // 3. Napadač sa `workspaceId: A` (omotač ga odbija; lična funkcija sa
        //    obaveznim projektom ne sme da mu vrati ništa iz A).
        if (f.projektna) {
          await pokusaj(s.napadac.userId, f, "napadač: projekat A", (vidjeno) => (tabela, put) =>
            izBazena(bazenA, tabela, put, f.modul, vidjeno), s.A);
        }
        // 4. Posmatrač: projektne sa `workspaceId: A`, lične sa ID-jevima iz A.
        await pokusaj(s.klijent.userId, f, f.projektna ? "posmatrač: projekat A" : "posmatrač: sve iz A", (vidjeno) => (tabela, put) =>
          put === "workspaceId" ? s.A : izBazena(bazenA, tabela, put, f.modul, vidjeno), f.projektna ? s.A : null);
      }

      // Posmatrač nikad ne prolazi omotač projekta A.
      const posmatracProsao = izvestaj.filter(
        (r) => r.varijanta === "posmatrač: projekat A" && r.ishod.vrsta === "proslo",
      );
      expect(posmatracProsao.map((r) => r.funkcija)).toEqual([]);

      // Funkcija čiji generisani argumenti ne prođu validator nije proverena.
      const neizvrseno = izvestaj
        .filter((r) => r.ishod.vrsta === "argumenti")
        .map((r) => `${r.funkcija} · ${r.varijanta}`);

      // Svaka funkcija je imala dokument za svaki ID (inače bi deo ostao neproveren).
      const bezDokumenta = [
        ...new Set(
          izvestaj
            .filter((r) => r.ishod.vrsta === "nema")
            .map((r) => `${r.funkcija} (${(r.ishod as { tabela: string }).tabela})`),
        ),
      ];
      expect(bezDokumenta).toEqual([]);
      expect(javne.length).toBeGreaterThan(250);
      expect(neizvrseno).toEqual([]);
      expect(prekrsaji).toEqual([]);
    },
    600_000,
  );
});
