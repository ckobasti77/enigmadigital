#!/usr/bin/env node
// Alat za prenos Devotion backenda i deljene logike u Enigmu (SPAJANJE, plan S01 §4).
//
//   node .nocni-run/spajanje/alati/prenesi-backend.mjs --korak S03 [--suvo] [--samo a,b] [--bez-testova] [--prepisi]
//   node .nocni-run/spajanje/alati/prenesi-backend.mjs --korak S02 --deljeno [--suvo] [--prepisi]
//
// Izvor je snimak `.nocni-run/spajanje/tmp/devotion/` (samo se čita). Izmene nad
// identifikatorima i stringovima idu kroz TypeScript AST (ne regex), pa se
// komentari, enum vrednosti (`"startup"`) i tekst šablona ne diraju slučajno.
// Pravila i tabele: README.md pored ovog fajla.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SNIMAK = join(KOREN, ".nocni-run/spajanje/tmp/devotion/packages");
const IZVOR_CONVEX = join(SNIMAK, "backend/convex");
const IZVOR_DELJENO = join(SNIMAK, "shared/src");
const CILJ_CONVEX = join(KOREN, "convex/prostor");
const CILJ_DELJENO = join(KOREN, "lib/prostor");
const IZVESTAJI = join(KOREN, ".nocni-run/spajanje/tmp");

// ── Grupe po koraku (S01 §1.2, §1.3, §5.4) ──────────────────────────────────
export const GRUPE = {
  S02: {
    moduli: ["profiles", "storage"],
    lib: [
      "auth", "permissions", "validators", "my_scope", "notifications",
      "notificationChannels", "notificationSettingsCatalog", "notificationTarget",
      "page_kinds", "activity", "chat_channels", "day_key", "idea_stages",
      "chatPresence", "pagePresence", "pages",
    ],
    testovi: [
      "lib/permissions", "lib/notificationTarget", "lib/chatPresence",
      "day-key-parity", "idea-stages-parity", "mentions-parity",
      "activity-format-parity", "notificationSettingsCatalog", "pages.validator",
    ],
  },
  S03: {
    moduli: [
      "areasV2", "pages", "collaboration", "comments", "history", "trash",
      "activity", "presence", "search", "dashboard", "canvasPlacement",
    ],
    lib: [
      "collaboration", "history", "page_content", "page_creation",
      "page_relations", "comments", "trash", "profile_summary", "task_assignees",
      "task_checkpoints", "page_tables", "page_files", "task_checkpoint_canvas_edges",
    ],
    testovi: ["areasV2", "canvasPlacement", "pages", "lib/task_checkpoint_canvas_edges"],
  },
  S04: {
    moduli: [
      "tasks", "taskCheckpoints", "taskAssignees", "taskCheckpointCanvasEdges",
      "personalTasks", "myDay", "puls",
    ],
    lib: ["my_day"],
    testovi: [
      "tasks", "tasks.bulk", "taskAssignees", "taskCheckpoints", "personalTasks",
      "myDay", "puls",
    ],
  },
  S05: {
    moduli: ["ideas", "thoughts", "canvases", "pageTables", "pageFiles", "aiProviders"],
    lib: [],
    testovi: [
      "ideas", "ideas.stage", "thoughts.notes", "pageFiles", "pageTables",
      "aiProviders", "collaboration", "comments", "moves", "pages.collaboration",
      "pages.security", "prostor.authz", "search", "trash", "trash.nodelete",
    ],
  },
  S06: {
    moduli: [
      "chat", "notifications", "inbox", "notificationSettings", "pushSubscriptions",
      "push", "expoPush", "expoPushTokens", "pushTest", "adminAuth",
    ],
    lib: [],
    testovi: [
      "chat", "chat.personal", "chat.validator", "inbox", "inbox.ideaVote",
      "notifications", "expoPush", "adminAuth", "crons", "legacyFlows",
    ],
  },
};

// ── Klase javnih funkcija (S01 §3.5) ────────────────────────────────────────
// P = projekatQuery/Mutation/Action sa `uloga: "urednik"`, P! = isto sa
// `uloga: "owner"`, L = prijavljenQuery/Mutation, I = interna.
export const KLASE = {
  profiles: { podrazumevano: "L" },
  storage: { podrazumevano: "L" },
  areasV2: { podrazumevano: "P" },
  pages: { podrazumevano: "P" },
  collaboration: { podrazumevano: "P" },
  comments: { podrazumevano: "P" },
  history: { podrazumevano: "P" },
  trash: { podrazumevano: "P" },
  activity: { podrazumevano: "P" },
  presence: { podrazumevano: "P" },
  search: { podrazumevano: "P", pages: "L" },
  dashboard: { podrazumevano: "L" },
  tasks: { podrazumevano: "P", listMine: "L", listEverywhere: "L" },
  taskCheckpoints: { podrazumevano: "P" },
  taskAssignees: { podrazumevano: "P" },
  taskCheckpointCanvasEdges: { podrazumevano: "P" },
  personalTasks: { podrazumevano: "L", moveToStartup: "P" },
  myDay: { podrazumevano: "L" },
  puls: { podrazumevano: "P" },
  ideas: { podrazumevano: "P" },
  canvases: { podrazumevano: "P" },
  pageTables: { podrazumevano: "P" },
  pageFiles: { podrazumevano: "P" },
  thoughts: {
    podrazumevano: "L",
    getCanvas: "P", listNodes: "P", listEdges: "P", saveViewport: "P",
    createNode: "P", getConnectedGroup: "P", createEdge: "P",
    convertToIdeas: "P", convertToPages: "P",
  },
  aiProviders: { podrazumevano: "P!" },
  chat: {
    podrazumevano: "L",
    listChannels: "P", channelForAnchor: "P", listDirectMessages: "P",
    listFollowedThreads: "P", sendToAnchor: "P", openDirectMessage: "P",
  },
  notifications: { podrazumevano: "P", markRead: "L" },
  inbox: { podrazumevano: "L" },
  notificationSettings: { podrazumevano: "L" },
  pushSubscriptions: { podrazumevano: "L" },
  expoPushTokens: { podrazumevano: "L" },
  pushTest: { podrazumevano: "I" },
  adminAuth: { podrazumevano: "P!" },
};

// ── Tabela preimenovanja identifikatora (S01 §4.3) ──────────────────────────
export const IDENTIFIKATORI = {
  startupIds: "workspaceIds",
  startupId: "workspaceId",
  startups: "workspaces",
  startup: "workspace",
  requireStartupMember: "requireClanProjekta",
  requireProfileInStartup: "requireProfilUProjektu",
  requireAdmin: "requireVlasnikPlatforme",
  isStartupManager: "isManager",
  isStartupOwner: "isOwner",
  inStartup: "inWorkspace",
  listMyActiveStartups: "listMyActiveWorkspaces",
  startupMiniOf: "workspaceMiniOf",
  startupMiniValidator: "workspaceMiniValidator",
  StartupMini: "WorkspaceMini",
  MY_SCOPE_STARTUP_CAP: "MY_SCOPE_WORKSPACE_CAP",
  startupAreaDocumentValidator: "areaDocumentValidator",
};

// String literali: ime tabele i ime polja.
export const LITERALI = {
  startups: "workspaces",
  startupAreas: "areas",
  startupId: "workspaceId",
};

// ── Tekstovi (S01 §3.8): deo teksta → zamena, unutar stringa ili šablona ────
export const PORUKE_DEO = [
  [", vlasnik startupa ili admin", " ili vlasnik projekta"],
  ["Startup nije pronađen.", "Projekat nije pronađen."],
  ["Nemate pristup ovom startupu.", "Nemaš pristup ovom projektu."],
  ["mora pripadati ovom startupu.", "mora pripadati ovom projektu."],
  ["nije pronađena u ovom startupu.", "nije pronađena u ovom projektu."],
  ["ne pripada ovom startupu.", "ne pripada ovom projektu."],
  ["nisu pronađene u ovom startupu.", "nisu pronađene u ovom projektu."],
  ["u kanalima startupa.", "u kanalima projekta."],
  ["Za custom kanal su obavezni startupId, name i isPrivate.", "Za nov kanal su obavezni projekat, naziv i vidljivost."],
  ["Obaveštenje bez startupa je samo za lične poruke.", "Obaveštenje bez projekta je samo za lične poruke."],
  ["nije deo Mape startupa.", "nije deo mape projekta."],
  ["prebačen u startup i", "prebačen u projekat i"],
  ["ne prebacuje u startup.", "ne prebacuje u projekat."],
  ["Potreban je administratorski pristup.", "Ovu radnju može da izvede samo vlasnik platforme."],
  ["Bez zajedničkog startupa", "Bez zajedničkog projekta"],
  ["Nema beležaka u ovom startupu.", "Nema beležaka u ovom projektu."],
  ["Pošalji u startup", "Pošalji u projekat"],
  ["Nisi član nijednog startupa.", "Nisi član nijednog projekta."],
  ["Ideje startupa ", "Ideje projekta "],
  ["U ovom startupu ništa", "U ovom projektu ništa"],
  ["iz svih startupa i ličnih", "iz svih projekata i ličnih"],
  ["ili startup.", "ili projekat."],
  ["Ovaj startup još nema oblasti — dodaj ih u startupu.", "Ovaj projekat još nema oblasti — dodaj ih u projektu."],
  ["u svim startupima.", "u svim projektima."],
  [" iz startupa? ", " iz projekta? "],
  ["Zadatak u startupu uvek", "Zadatak u projektu uvek"],
  ["Naziv, opis i logo menja admin.", "Naziv, opis i logo menja vlasnik projekta."],
];
// Ceo string tačno.
export const PORUKE_TACNO = { Startup: "Projekat" };

const OMOTAC = { query: "Query", mutation: "Mutation", action: "Action" };
const INTERNO = { query: "internalQuery", mutation: "internalMutation", action: "internalAction" };

// ── pomoćno ─────────────────────────────────────────────────────────────────
function argumenti(argv) {
  const a = { suvo: false, prepisi: false, bezTestova: false, deljeno: false, samo: null, korak: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--korak") a.korak = argv[++i];
    else if (x === "--samo") a.samo = new Set(argv[++i].split(","));
    else if (x === "--suvo") a.suvo = true;
    else if (x === "--prepisi") a.prepisi = true;
    else if (x === "--bez-testova") a.bezTestova = true;
    else if (x === "--deljeno") a.deljeno = true;
    else throw new Error(`Nepoznat argument: ${x}`);
  }
  return a;
}

function primeniIzmene(tekst, izmene) {
  const sortirane = [...izmene].sort((x, y) => y.start - x.start);
  let poslednji = Infinity;
  let out = tekst;
  for (const iz of sortirane) {
    if (iz.end > poslednji) throw new Error(`Preklopljene izmene na ${iz.start}`);
    out = out.slice(0, iz.start) + iz.text + out.slice(iz.end);
    poslednji = iz.start;
  }
  return out;
}

function zameniPoruke(t) {
  if (Object.hasOwn(PORUKE_TACNO, t)) return PORUKE_TACNO[t];
  let out = t;
  for (const [od, u] of PORUKE_DEO) out = out.split(od).join(u);
  return out;
}

/** String u tipu koji imenuje polje: argument `Pick`/`Omit` ili `T["x"]`. */
function jeImeSvojstvaUTipu(cvor) {
  let c = cvor.parent;
  if (!c || !ts.isLiteralTypeNode(c)) return false;
  while (c.parent && ts.isUnionTypeNode(c.parent)) c = c.parent;
  const p = c.parent;
  if (!p) return false;
  if (ts.isIndexedAccessTypeNode(p) && p.indexType === c) return true;
  return ts.isTypeReferenceNode(p) && ts.isIdentifier(p.typeName) &&
    (p.typeName.text === "Pick" || p.typeName.text === "Omit") && p.typeArguments?.[1] === c;
}

/** Convex dozvoljava najviše 64 znaka u imenu indeksa: predugo ime gubi `Id`. */
function imeIndeksa(t) {
  if (!/^(by|search)_/.test(t)) return t;
  const novo = t.split("startup").join("workspace");
  return novo.length > 64 ? novo.replace(/^by_workspaceId_and_/, "by_workspace_and_") : novo;
}

// ── Prolaz A: tekstualna pravila (seed, okruženje testa, putanje) ───────────
function prolazA(tekst, vrsta, brojac) {
  let t = tekst;
  // Nativni `replace`: string zamena zna `$1`, funkcija dobija grupe.
  const zameni = (re, u, kljuc) => {
    const n = (t.match(re) ?? []).length;
    if (n > 0) brojac[kljuc] = (brojac[kljuc] ?? 0) + n;
    t = t.replace(re, u);
  };
  const jeTest = vrsta === "test" || vrsta === "lib-test";
  if (jeTest) {
    // T2: seed
    zameni(/ctx\.db\.insert\("startups",\s*/g, "insertStartup(ctx, ", "T2 insertStartup");
    zameni(/ctx\.db\.insert\("startupMembers",\s*/g, "insertClanstvo(ctx, ", "T2 insertClanstvo");
    zameni(/ctx\.db\.insert\("profiles",\s*/g, "insertProfil(ctx, ", "T2 insertProfil");
    zameni(
      /ctx\.db\.patch\("startupMembers",\s*([^,()]+),\s*\{\s*archivedAt:[^{}]*\}\s*\)/g,
      (_m, id) => `ukloniClanstvo(ctx, ${id.trim()})`,
      "T2 ukloniClanstvo",
    );
    zameni(
      /ctx\.db\.patch\("startups",\s*([^,()]+),\s*\{\s*archivedAt:\s*([^,{}]+?)\s*,?\s*\}\s*\)/g,
      (_m, id, val) => `ctx.db.patch("workspaces", ${id.trim()}, { arhiviran: (${val}) !== null })`,
      "T2 arhiviran",
    );
    // T3: okruženje
    zameni(/subject:\s*`\$\{([^}]+)\}\|[^`]*`/g, (_m, x) => `subject: \`\${${x}}|sesija-test\``, "T3 identitet");
    zameni(/subject:\s*([A-Za-z_$][\w.$]*)(\s*[,}\n])/g, (_m, x, kraj) => `subject: \`\${${x}}|sesija-test\`${kraj}`, "T3 identitet");
    // Koren projekta: iz `convex/prostor/` bi `../**` dao `./x.ts`, a convex-test traži `prefiks + prostor/x`.
    zameni(/import\.meta\.glob\("\.\/\*\*\/\*\.ts"\)/g, 'import.meta.glob("/convex/**/*.*s")', "T3 glob");
    zameni(/import schema from "\.\/schema";/g, 'import schema from "../schema";', "T3 schema");
    zameni(/"\.\.\/\.\.\/shared\/src\//g, '"../../lib/prostor/', "T3 shared");
    zameni(/"\.\.\/\.\.\/\.\.\/shared\/src\//g, '"../../../lib/prostor/', "T3 shared");
  }
  // T4: _generated
  if (vrsta === "modul" || vrsta === "test") {
    zameni(/(["'])\.\/_generated\//g, "$1../_generated/", "T4 _generated");
  } else if (vrsta === "lib" || vrsta === "lib-test") {
    zameni(/(["'])\.\.\/_generated\//g, "$1../../_generated/", "T4 _generated");
  }
  if (vrsta === "modul") {
    if (/import schema from "\.\/schema";/.test(t)) {
      zameni(/import schema from "\.\/schema";/g, 'import { prostorTabele } from "./schema";', "T4 schema");
      zameni(/\bschema\.tables\./g, "prostorTabele.", "T4 schema");
    }
  }
  if (vrsta === "deljeno-test") {
    zameni(/"\.\.\/\.\.\/backend\/convex\/lib\//g, '"../../convex/prostor/lib/', "T3 backend lib");
  }
  // Uvoz pomoćnika seed-a (posle T2).
  if (jeTest) {
    const trebaju = ["insertClanstvo", "insertProfil", "insertStartup", "ukloniClanstvo"].filter((ime) =>
      new RegExp(`\\b${ime}\\(`).test(t),
    );
    if (trebaju.length > 0) {
      const put = vrsta === "lib-test" ? "../testSvet.pomoc" : "./testSvet.pomoc";
      t = dodajUvoz(t, `import { ${trebaju.join(", ")} } from "${put}";`);
    }
  }
  return t;
}

function dodajUvoz(tekst, linija) {
  const sf = ts.createSourceFile("x.ts", tekst, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let kraj = 0;
  for (const s of sf.statements) if (ts.isImportDeclaration(s)) kraj = s.getEnd();
  if (kraj === 0) {
    // posle `/// <reference …>` ako postoji
    const m = /^(\/\/\/ <reference[^\n]*\n)/.exec(tekst);
    const poz = m ? m[0].length : 0;
    return tekst.slice(0, poz) + linija + "\n" + tekst.slice(poz);
  }
  return tekst.slice(0, kraj) + "\n" + linija + tekst.slice(kraj);
}

// ── Prolaz B: AST nad listovima (T1, T5, T6, T7, T8) ────────────────────────
function prolazB(tekst, imeFajla, brojac) {
  const sf = ts.createSourceFile(imeFajla, tekst, ts.ScriptTarget.Latest, true,
    imeFajla.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const izmene = [];
  const broj = (k) => { brojac[k] = (brojac[k] ?? 0) + 1; };

  const string = (cvor) => {
    // StringLiteral i NoSubstitutionTemplateLiteral: sadržaj je između navodnika.
    const sirov = tekst.slice(cvor.getStart(sf) + 1, cvor.getEnd() - 1);
    let novi = sirov;
    if (Object.hasOwn(LITERALI, sirov)) { novi = LITERALI[sirov]; broj("T6 literal"); }
    else if (Object.hasOwn(IDENTIFIKATORI, sirov) && jeImeSvojstvaUTipu(cvor)) {
      // `Pick<T, "startup">`, `T["startup"]`: ime polja u tipu prati preimenovano polje.
      novi = IDENTIFIKATORI[sirov];
      broj("T8 ime polja u tipu");
    }
    else if (/^(by|search)_/.test(sirov) && sirov.includes("startup")) { novi = imeIndeksa(sirov); broj("T7 indeks"); }
    else {
      const p = zameniPoruke(sirov);
      if (p !== sirov) { novi = p; broj("T1 poruka"); }
    }
    if (novi !== sirov) izmene.push({ start: cvor.getStart(sf) + 1, end: cvor.getEnd() - 1, text: novi });
  };

  const deoSablona = (cvor, pocetakPomak, krajPomak) => {
    const s = cvor.getStart(sf) + pocetakPomak;
    const e = cvor.getEnd() - krajPomak;
    const sirov = tekst.slice(s, e);
    const p = zameniPoruke(sirov);
    if (p !== sirov) { izmene.push({ start: s, end: e, text: p }); broj("T1 poruka"); }
  };

  const obidji = (cvor) => {
    if (ts.isStringLiteral(cvor) || ts.isNoSubstitutionTemplateLiteral(cvor)) {
      string(cvor);
      return;
    }
    if (ts.isTemplateHead(cvor)) { deoSablona(cvor, 1, 2); return; }
    if (ts.isTemplateMiddle(cvor)) { deoSablona(cvor, 1, 2); return; }
    if (ts.isTemplateTail(cvor)) { deoSablona(cvor, 1, 1); return; }
    // T5: api.X / internal.X → api.prostor.X
    if (
      ts.isPropertyAccessExpression(cvor) &&
      ts.isIdentifier(cvor.expression) &&
      (cvor.expression.text === "api" || cvor.expression.text === "internal") &&
      cvor.name.text !== "prostor"
    ) {
      izmene.push({ start: cvor.name.getStart(sf), end: cvor.name.getEnd(), text: `prostor.${cvor.name.text}` });
      broj("T5 api");
      return; // ime ispod ne preimenovati
    }
    if (ts.isIdentifier(cvor)) {
      const novo = Object.hasOwn(IDENTIFIKATORI, cvor.text) ? IDENTIFIKATORI[cvor.text] : undefined;
      if (novo !== undefined) {
        // Skraćeno svojstvo `{ startup }` ostaje skraćeno: menja se i ključ i vrednost.
        izmene.push({ start: cvor.getStart(sf), end: cvor.getEnd(), text: novo });
        broj("T8 identifikator");
      }
      return;
    }
    ts.forEachChild(cvor, obidji);
  };
  obidji(sf);
  return primeniIzmene(tekst, izmene);
}

// ── Prolaz C: registracije (T9) ─────────────────────────────────────────────
function klasaFunkcije(modul, ime) {
  const k = Object.hasOwn(KLASE, modul) ? KLASE[modul] : undefined;
  if (k === undefined) return null;
  return Object.hasOwn(k, ime) ? k[ime] : k.podrazumevano;
}

function prolazC(tekst, imeFajla, modul, brojac, rucno) {
  const sf = ts.createSourceFile(imeFajla, tekst, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const izmene = [];
  const potrebniOmotaci = new Set();
  const potrebneInterne = new Set();
  const red = (poz) => sf.getLineAndCharacterOfPosition(poz).line + 1;

  for (const iskaz of sf.statements) {
    if (!ts.isVariableStatement(iskaz)) continue;
    const izvoz = (ts.getModifiers(iskaz) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!izvoz) continue;
    for (const d of iskaz.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer || !ts.isCallExpression(d.initializer)) continue;
      const poziv = d.initializer;
      if (!ts.isIdentifier(poziv.expression)) continue;
      const vrsta = poziv.expression.text;
      if (!Object.hasOwn(OMOTAC, vrsta)) continue; // interne i ostalo ostaju
      const ime = d.name.text;
      const klasa = klasaFunkcije(modul, ime);
      if (klasa === null) {
        rucno.push(`${imeFajla}:${red(poziv.getStart(sf))} ${ime}: modul nema klasu u KLASE`);
        continue;
      }
      const obj = poziv.arguments[0];
      if (!obj || !ts.isObjectLiteralExpression(obj)) {
        rucno.push(`${imeFajla}:${red(poziv.getStart(sf))} ${ime}: registracija bez objektnog argumenta`);
        continue;
      }
      if (klasa === "I") {
        izmene.push({ start: poziv.expression.getStart(sf), end: poziv.expression.getEnd(), text: INTERNO[vrsta] });
        potrebneInterne.add(INTERNO[vrsta]);
        brojac["T9 interna"] = (brojac["T9 interna"] ?? 0) + 1;
        continue;
      }
      if (klasa === "L") {
        if (vrsta === "action") {
          rucno.push(`${imeFajla}:${red(poziv.getStart(sf))} ${ime}: lična akcija nema omotač (prijavljenAction ne postoji)`);
          continue;
        }
        const omotac = `prijavljen${OMOTAC[vrsta]}`;
        izmene.push({ start: poziv.expression.getStart(sf), end: poziv.expression.getEnd(), text: omotac });
        potrebniOmotaci.add(omotac);
        brojac["T9 lična"] = (brojac["T9 lična"] ?? 0) + 1;
        continue;
      }
      // P ili P!
      const omotac = `projekat${OMOTAC[vrsta]}`;
      izmene.push({ start: poziv.expression.getStart(sf), end: poziv.expression.getEnd(), text: omotac });
      potrebniOmotaci.add(omotac);
      const uloga = klasa === "P!" ? "owner" : "urednik";
      izmene.push({ start: obj.getStart(sf) + 1, end: obj.getStart(sf) + 1, text: `\n  uloga: "${uloga}",` });
      brojac["T9 projektna"] = (brojac["T9 projektna"] ?? 0) + 1;
      const args = obj.properties.find(
        (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "args",
      );
      if (args && ts.isPropertyAssignment(args) && ts.isObjectLiteralExpression(args.initializer)) {
        for (const p of args.initializer.properties) {
          if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name) || p.name.text !== "workspaceId") continue;
          const vrednost = p.initializer.getText(sf).replace(/\s+/g, "");
          if (vrednost === 'v.id("workspaces")') {
            // Briše se svojstvo sa zarezom i praznim prostorom do sledećeg.
            let kraj = p.getEnd();
            const posle = tekst.slice(kraj);
            const m = /^\s*,/.exec(posle);
            if (m) kraj += m[0].length;
            let pocetak = p.getFullStart();
            izmene.push({ start: pocetak, end: kraj, text: "" });
            brojac["T9 workspaceId arg"] = (brojac["T9 workspaceId arg"] ?? 0) + 1;
          } else {
            rucno.push(`${imeFajla}:${red(p.getStart(sf))} ${ime}: projektna funkcija sa ne-obaveznim workspaceId (${vrednost})`);
          }
        }
      }
    }
  }
  if (izmene.length === 0) return tekst;
  let t = primeniIzmene(tekst, izmene);
  t = srediUvozServera(t, imeFajla, potrebneInterne);
  if (potrebniOmotaci.size > 0) {
    t = dodajUvoz(t, `import { ${[...potrebniOmotaci].sort().join(", ")} } from "../lib/projekat";`);
  }
  return t;
}

/** Iz uvoza `_generated/server` skida query/mutation/action koje se više ne koriste, dodaje interne. */
function srediUvozServera(tekst, imeFajla, dodaj) {
  const sf = ts.createSourceFile(imeFajla, tekst, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const koriscena = new Set();
  const obidji = (c) => {
    if (ts.isImportDeclaration(c)) return;
    // `ctx.db.query(…)` nije upotreba uvezenog `query`: ime svojstva se ne broji.
    const imeSvojstva = c.parent && ts.isPropertyAccessExpression(c.parent) && c.parent.name === c;
    if (ts.isIdentifier(c) && !imeSvojstva) koriscena.add(c.text);
    ts.forEachChild(c, obidji);
  };
  obidji(sf);
  // Svi uvozi iz `_generated/server` (`import type { MutationCtx }` i
  // `import { mutation, query }` su često dva iskaza); interne se dodaju jednom.
  const izmene = [];
  let dodato = false;
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    if (!/_generated\/server$/.test(s.moduleSpecifier.text)) continue;
    const ni = s.importClause?.namedBindings;
    if (!ni || !ts.isNamedImports(ni)) continue;
    const jeTipski = s.importClause.isTypeOnly;
    const imena = ni.elements
      .map((e) => ({ tekst: e.getText(sf), ime: e.name.text, tip: jeTipski || e.isTypeOnly }))
      .filter((e) => e.tip || !["query", "mutation", "action"].includes(e.ime) || koriscena.has(e.ime));
    if (!jeTipski && !dodato) {
      for (const d of dodaj) if (!imena.some((e) => e.ime === d)) imena.push({ tekst: d, ime: d, tip: false });
      dodato = true;
    }
    const nova = imena.length === 0
      ? ""
      : `import ${jeTipski ? "type " : ""}{ ${imena.map((e) => e.tekst).join(", ")} } from "${s.moduleSpecifier.text}";`;
    izmene.push({ start: s.getStart(sf), end: s.getEnd(), text: nova });
  }
  let out = primeniIzmene(tekst, izmene);
  if (!dodato && dodaj.size > 0) {
    const put = imeFajla.startsWith("lib/") ? "../../_generated/server" : "../_generated/server";
    out = dodajUvoz(out, `import { ${[...dodaj].sort().join(", ")} } from "${put}";`);
  }
  return out;
}

// ── Izveštaj: šta ostaje ručno (S01 §4.4) ───────────────────────────────────
const PROVERE = [
  [/"startupMembers"/, "upit nad startupMembers → members kroz adapter (S01 §3.3)"],
  [/"appState"/, "appState se ne prenosi"],
  [/"invites"/, "Devotion invites se ne prenose"],
  [/\bgetAuthUserId\b/, "getAuthUserId van adaptera"],
  [/\.role\s*[!=]==/, "čitanje profile.role (P7: isManager / vlasnik platforme)"],
  [/\bisManagerProfile\b/, "isManagerProfile → jeMenadzerProjekta"],
  [/\bworkspace\??\.(archivedAt|description|logoStorageId|createdByProfileId)\b/, "polje projekta (arhiviran / opis / brend.logoStorageId / vlasnikProjektaProfileId)"],
  [/\bprocess\.env\b/, "env promenljiva"],
  [/from "\.\/auth"/, "uvoz Devotion auth.ts"],
  [/\bstartupDocumentValidator\b/, "startupDocumentValidator → workspaceMiniValidator"],
  [/api\.prostor\.(startups|invites|migrations|areasV2Migrations)\b/, "poziv modula koji se ne prenosi"],
  [/internal\.prostor\.(migrations|areasV2Migrations)\b/, "poziv migracija (S01 §5.3)"],
];

function proveri(tekst, imeFajla, rucno, jeTest) {
  const linije = tekst.split(/\r?\n/);
  linije.forEach((l, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(l)) return;
    for (const [re, poruka] of PROVERE) if (re.test(l)) rucno.push(`${imeFajla}:${i + 1} ${poruka}`);
  });
  if (jeTest) return;
  // Tekst sa „startup“ u stringovima i delovima šablona (ne u izrazima i komentarima).
  const sf = ts.createSourceFile(imeFajla, tekst, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const obidji = (c) => {
    let sirov = null;
    if (ts.isStringLiteral(c) || ts.isNoSubstitutionTemplateLiteral(c)) sirov = c.text;
    else if (ts.isTemplateHead(c) || ts.isTemplateMiddle(c) || ts.isTemplateTail(c)) sirov = c.text;
    if (sirov !== null) {
      if (/[Ss]tartup/.test(sirov) && !/^(startup|startup:|\.\/startup-[a-z]+)$/.test(sirov) && !/startup_/.test(sirov) && !/^(by|search)_/.test(sirov)) {
        const red = sf.getLineAndCharacterOfPosition(c.getStart(sf)).line + 1;
        rucno.push(`${imeFajla}:${red} tekst sa „startup“: ${sirov.slice(0, 70)}`);
      }
      return;
    }
    ts.forEachChild(c, obidji);
  };
  obidji(sf);
}

// ── jedan fajl ──────────────────────────────────────────────────────────────
export function prenesiTekst(tekst, { vrsta, modul, imeFajla, korak }) {
  const brojac = {};
  const rucno = [];
  let t = tekst.replace(/\r\n/g, "\n");
  t = prolazA(t, vrsta, brojac);
  t = prolazB(t, imeFajla, brojac);
  if (vrsta === "modul") t = prolazC(t, imeFajla, modul, brojac, rucno);
  const izvor = vrsta.startsWith("deljeno") ? "packages/shared/src" : "packages/backend/convex";
  const zaglavlje = `// Preneto iz Devotion ${izvor}/${imeFajla} (main @ c05c40f), SPAJANJE ${korak}.\n`;
  if (/^\/\/\/ <reference/.test(t)) {
    const kraj = t.indexOf("\n") + 1;
    t = t.slice(0, kraj) + zaglavlje + t.slice(kraj);
  } else {
    t = zaglavlje + t;
  }
  proveri(t, imeFajla, rucno, vrsta.endsWith("test"));
  return { tekst: t, brojac, rucno };
}

// ── glavni tok ──────────────────────────────────────────────────────────────
function poslovi(a) {
  const out = [];
  if (a.deljeno) {
    const imena = listaDeljeno();
    for (const ime of imena) {
      if (a.samo && !a.samo.has(ime.replace(/\.ts$/, ""))) continue;
      const jeTest = ime.endsWith(".test.ts");
      out.push({
        izvor: join(IZVOR_DELJENO, ime),
        cilj: join(CILJ_DELJENO, ime),
        vrsta: jeTest ? "deljeno-test" : "deljeno",
        modul: null,
        imeFajla: ime,
      });
    }
    return out;
  }
  const g = GRUPE[a.korak];
  if (!g) throw new Error(`Nepoznat korak ${a.korak}`);
  for (const m of g.moduli) {
    if (a.samo && !a.samo.has(m)) continue;
    out.push({ izvor: join(IZVOR_CONVEX, `${m}.ts`), cilj: join(CILJ_CONVEX, `${m}.ts`), vrsta: "modul", modul: m, imeFajla: `${m}.ts` });
  }
  for (const l of g.lib) {
    if (a.samo && !a.samo.has(`lib/${l}`) && !a.samo.has(l)) continue;
    out.push({ izvor: join(IZVOR_CONVEX, "lib", `${l}.ts`), cilj: join(CILJ_CONVEX, "lib", `${l}.ts`), vrsta: "lib", modul: null, imeFajla: `lib/${l}.ts` });
  }
  if (!a.bezTestova) {
    for (const tst of g.testovi) {
      if (a.samo && !a.samo.has(tst)) continue;
      const jeLib = tst.startsWith("lib/");
      out.push({
        izvor: join(IZVOR_CONVEX, `${tst}.test.ts`),
        cilj: join(CILJ_CONVEX, `${tst}.test.ts`),
        vrsta: jeLib ? "lib-test" : "test",
        modul: null,
        imeFajla: `${tst}.test.ts`,
      });
    }
  }
  return out;
}

function listaDeljeno() {
  return readdir(IZVOR_DELJENO).filter((f) => f.endsWith(".ts"));
}

function readdir(dir) {
  return ts.sys.readDirectory(dir, [".ts"], undefined, undefined, 1).map((p) => relative(dir, p).replace(/\\/g, "/"));
}

function glavni() {
  const a = argumenti(process.argv.slice(2));
  if (!a.korak) throw new Error("Obavezan je --korak S0x");
  const lista = poslovi(a);
  const izvestaj = [`# Prenos ${a.korak}${a.deljeno ? " (deljeno)" : ""}`, ""];
  let ukupnoRucno = 0;
  for (const p of lista) {
    if (!existsSync(p.izvor)) {
      izvestaj.push(`- NEMA IZVORA: ${p.izvor}`);
      continue;
    }
    if (existsSync(p.cilj) && !a.prepisi) {
      izvestaj.push(`- preskočeno (cilj postoji, --prepisi): ${relative(KOREN, p.cilj)}`);
      continue;
    }
    const { tekst, brojac, rucno } = prenesiTekst(readFileSync(p.izvor, "utf8"), { ...p, korak: a.korak });
    ukupnoRucno += rucno.length;
    izvestaj.push(`## ${relative(KOREN, p.cilj).replace(/\\/g, "/")}`);
    izvestaj.push(`izmene: ${Object.entries(brojac).map(([k, v]) => `${k} ${v}`).join(", ") || "nema"}`);
    for (const r of rucno) izvestaj.push(`- RUČNO ${r}`);
    izvestaj.push("");
    if (!a.suvo) {
      mkdirSync(dirname(p.cilj), { recursive: true });
      writeFileSync(p.cilj, tekst, "utf8");
    }
  }
  izvestaj.push(`Ukupno fajlova: ${lista.length}; RUČNO stavki: ${ukupnoRucno}.`);
  const putIzvestaja = join(IZVESTAJI, `prenos-${a.korak}${a.deljeno ? "-deljeno" : ""}.md`);
  if (!a.suvo) writeFileSync(putIzvestaja, izvestaj.join("\n") + "\n", "utf8");
  console.log(izvestaj.join("\n"));
  if (!a.suvo) console.log(`\nIzveštaj: ${relative(KOREN, putIzvestaja)}`);
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) glavni();
