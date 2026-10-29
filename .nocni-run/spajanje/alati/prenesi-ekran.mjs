#!/usr/bin/env node
// Alat za prenos Devotion ekrana (web) u Enigmu (SPAJANJE, plan S07 §9).
//
//   node .nocni-run/spajanje/alati/prenesi-ekran.mjs --korak S10 [--suvo] [--samo a,b] [--prepisi] [--izlaz tmp]
//   node .nocni-run/spajanje/alati/prenesi-ekran.mjs --pokrivenost
//
// Izvor je snimak `.nocni-run/spajanje/tmp/devotion/apps/web/` (samo se čita).
// Izmene idu kroz TypeScript AST u više prolaza (svaki prolaz ponovo parsira
// tekst), pa se komentari ne diraju. Ono što nije mehaničko ide u izveštaj kao
// RUČNO. Pravila (E1–E13) i tabele: README.md pored ovog fajla.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { IDENTIFIKATORI, LITERALI, PORUKE_DEO, PORUKE_TACNO } from "./prenesi-backend.mjs";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SNIMAK = join(KOREN, ".nocni-run/spajanje/tmp/devotion/apps/web");
const IZVESTAJI = join(KOREN, ".nocni-run/spajanje/tmp");
const PROBA = join(KOREN, ".nocni-run/spajanje/tmp/proba-ekran");
const P = "components/app/prostor";

// ── Kuda ide koji fajl (plan S07 §10) ───────────────────────────────────────
// Ključ: putanja u snimku bez nastavka. Vrednost: [cilj bez nastavka, korak].
// Cilj `lib/...` je čist modul (relativni uvozi, vitest bez `@/`).
const FAJLOVI = {
  // S08 (već preneto ili zamenjeno Enigminim)
  "components/workspace/types": ["lib/prostor/rute", "S08"],
  "components/workspace/workspace-route": ["lib/prostor/rute", "S08"],
  "lib/errors": ["lib/prostor/web/greske", "S08"],
  "lib/today": ["lib/prostor/web/danas", "S08"],
  "lib/use-today": [`${P}/zajednicko/use-danas`, "S08"],
  "lib/workspace": ["lib/prostor/web/projekat", "S08"],
  "lib/page-kinds": ["lib/prostor/web/vrste-stranica", "S08"],
  "lib/motion/flip-snapshot": ["lib/prostor/web/flip-snapshot", "S08"],
  "lib/motion/rail-indicator": ["lib/prostor/web/indikator-trake", "S08"],
  "hooks/use-debounced-callback": [`${P}/zajednicko/use-debounced-callback`, "S08"],
  "lib/shortcuts/registry": ["lib/prostor/precice/registar", "S08"],
  "lib/shortcuts/task-list": ["lib/prostor/precice/lista-zadataka", "S08"],
  "lib/shortcuts/use-task-list-shortcuts": [`${P}/precice/use-precice-liste`, "S08"],
  "components/shortcuts/shortcut-provider": [`${P}/precice/precice-provider`, "S08"],
  "components/shortcuts/shortcut-help-dialog": [`${P}/precice/pomoc-dijalog`, "S08"],
  "components/motion/animated-check": ["components/motion/animated-check", "S08"],
  "components/motion/flip-group": ["components/motion/flip-group", "S08"],
  "components/motion/drawer": ["components/ui/drawer", "ZAMENA"],
  "components/motion/motion-dialog": ["components/ui/dialog", "ZAMENA"],
  "components/motion/collapse": ["components/motion/unfold", "ZAMENA"],
  "components/motion/number-roll": ["components/motion/count-up", "ZAMENA"],
  "components/motion/progress-ring": ["components/app/system/progress", "ZAMENA"],
  "components/workspace/workspace-ui": [`${P}/zajednicko/radni-ui`, "S08"],
  "components/me/startup-chip": [`${P}/zajednicko/projekat-cip`, "S08"],
  // S09 ljuska
  "components/me/shell/scope": ["lib/prostor/web/opseg", "S09"],
  "components/workspace/profile-dialog": [`${P}/profil/profil-dijalog`, "S09"],
  "components/connection-banner": [`${P}/zajednicko/veza-traka`, "S09"],
  // S10 dokumenti 1
  "components/workspace/page-tree": [`${P}/dokumenti/stablo-oblasti`, "S10"],
  "components/workspace/create-page-dialog": [`${P}/dokumenti/create-page-dialog`, "S10"],
  "components/workspace/create-area-dialog": [`${P}/dokumenti/create-area-dialog`, "S10"],
  "components/workspace/move-to-area-menu": [`${P}/dokumenti/move-to-area-menu`, "S10"],
  "components/workspace/nesting-target-menu": [`${P}/dokumenti/nesting-target-menu`, "S10"],
  "components/workspace/detach-page-button": [`${P}/dokumenti/detach-page-button`, "S10"],
  "components/workspace/workspace-history": [`${P}/zajednicko/istorija-radnji`, "S10"],
  "components/rich-text-editor": [`${P}/editor/rich-text-editor`, "S10"],
  "components/workspace/files/note-file-node": [`${P}/editor/note-file-node`, "S10"],
  "components/workspace/notes/note-link-dialog": [`${P}/editor/link-dijalog`, "S10"],
  "lib/note-link": ["lib/prostor/web/note-link", "S10"],
  "lib/me/last-area": ["lib/prostor/web/poslednja-oblast", "S10"],
  // S11 dokumenti 2
  "components/workspace/page-relations": [`${P}/saradnja/page-relations`, "S11"],
  "lib/page-files": ["lib/prostor/web/page-files", "S11"],
  "lib/media-convert": ["lib/prostor/web/media-convert", "S11"],
  "lib/table-file": ["lib/prostor/web/table-file", "S11"],
  "lib/csv": ["lib/prostor/web/csv", "S11"],
  // S12 zadaci
  "components/workspace/tasks-view": [`${P}/zadaci/tasks-view`, "S12"],
  "components/workspace/task-checkpoint-list": [`${P}/zadaci/task-checkpoint-list`, "S12"],
  "components/workspace/assignee-stack": [`${P}/zadaci/assignee-stack`, "S12"],
  "components/workspace/deadline-badge": [`${P}/zadaci/deadline-badge`, "S12"],
  "components/me/task-row": [`${P}/zadaci/task-row`, "S12"],
  "components/me/due-chip": [`${P}/zadaci/due-chip`, "S12"],
  "components/me/meta-chip": [`${P}/zadaci/meta-chip`, "S12"],
  "components/me/priority-dot": [`${P}/zadaci/priority-dot`, "S12"],
  "components/me/section-header": [`${P}/zadaci/section-header`, "S12"],
  "components/ui/date-picker": [`${P}/zajednicko/birac-datuma`, "S12"],
  "lib/deadline": ["lib/prostor/web/deadline", "S12"],
  // S14 mape
  "components/workspace/area-canvas-view": [`${P}/mape/area-canvas-view`, "S14"],
  "components/workspace/ideas-canvas-view": [`${P}/mape/ideas-canvas-view`, "S14"],
  "components/workspace/thought-sidebar-drag": [`${P}/mape/thought-sidebar-drag`, "S14"],
  "components/workspace/page-workspace-view": [`${P}/mape/page-map-view`, "S14"],
  "components/workspace/page-peek": [`${P}/mape/page-peek`, "S14"],
  "components/workspace/workspace-item-dialog": [`${P}/mape/workspace-item-dialog`, "S14"],
  "lib/canvas-nesting": ["lib/prostor/web/canvas-nesting", "S14"],
  "lib/canvas-node-size": ["lib/prostor/web/canvas-node-size", "S14"],
  // S15 poruke
  "components/workspace/chat-view": [`${P}/poruke/chat-view`, "S15"],
  "lib/chat": ["lib/prostor/web/chat", "S15"],
  // S16 Ja
  "components/workspace/thought-destination-picker": [`${P}/ja/brzi-unos/thought-destination-picker`, "S16"],
  "components/workspace/thought-sharing": [`${P}/ja/brzi-unos/thought-sharing`, "S16"],
  "components/me/notes/send-to-startup-dialog": [`${P}/ja/posalji-u-projekat-dijalog`, "S16"],
  // S17 inbox
  "components/workspace/notifications-panel": [`${P}/inbox/notifications-panel`, "S17"],
  "components/workspace/notification-settings-dialog": [`${P}/inbox/notification-settings-dialog`, "S17"],
  "hooks/use-push-notifications": [`${P}/inbox/use-push-notifications`, "S17"],
  // S20 početna
  "components/workspace/command-center-view": [`${P}/pocetna/command-center-view`, "S20"],
  "components/workspace/puls-view": [`${P}/pocetna/puls-view`, "S20"],
  "components/workspace/pulse-bar": [`${P}/pocetna/pulse-bar`, "S20"],
  "components/workspace/activity-view": [`${P}/pocetna/activity-view`, "S20"],
  "lib/puls": ["lib/prostor/web/puls", "S20"],
  // S21 podešavanja
  "components/workspace/member-password-dialog": [`${P}/podesavanja/member-password-dialog`, "S21"],
  // S24 ⌘K
  "components/workspace/search-dialog": [`${P}/pretraga/search-dialog`, "S24"],
};

// Cele fascikle: [prefiks u snimku, cilj (fascikla), korak]. Prvo poklapanje važi.
const FASCIKLE = [
  ["components/workspace/area/", `${P}/dokumenti/`, "S10"],
  ["components/workspace/page/", `${P}/dokumenti/`, "S10"],
  ["components/collab/", `${P}/saradnja/`, "S11"],
  ["components/workspace/files/", `${P}/prilozi/`, "S11"],
  ["components/workspace/tables/", `${P}/tabele/`, "S11"],
  ["components/workspace/startup-tasks/", `${P}/zadaci/`, "S12"],
  ["components/workspace/task-page/", `${P}/zadaci/`, "S12"],
  ["components/me/task-panel/", `${P}/zadaci/panel/`, "S12"],
  ["components/workspace/ideas/", `${P}/ideje/`, "S13"],
  ["components/workspace/thoughts/", `${P}/mape/thoughts/`, "S14"],
  ["components/workspace/canvases/", `${P}/mape/canvases/`, "S14"],
  ["components/map/", `${P}/mape/map/`, "S14"],
  ["components/me/chat/", `${P}/poruke/`, "S15"],
  ["components/workspace/chat/", `${P}/poruke/`, "S15"],
  ["components/me/tasks/", `${P}/ja/`, "S16"],
  ["components/me/notes/", `${P}/ja/`, "S16"],
  ["components/me/quick-add/", `${P}/ja/brzi-unos/`, "S16"],
  ["components/me/inbox/", `${P}/inbox/`, "S17"],
  ["components/me/my-day/", `${P}/danas/`, "S19"],
  ["components/me/plan-day/", `${P}/danas/`, "S19"],
  ["components/workspace/command-center/", `${P}/pocetna/`, "S20"],
  ["components/workspace/trash/", `${P}/korpa/`, "S21"],
  ["components/workspace/settings/", `${P}/podesavanja/`, "S21"],
];

/**
 * Svesno se ne prenose (plan S07 §10.1); izveštaj pokrivenosti ih ne traži.
 * Korak „ZAMENA“ znači da Enigma već ima zamenu: uvoz se preusmerava, a
 * fajl se nikad ne prenosi.
 */
const NE_PRENOSI = new Set([
  "app/layout", "app/page", "app/error", "app/robots", "app/globals.css", "app/icon.svg",
  "components/app-root", "components/app-providers", "components/app-mark",
  "components/theme-provider", "components/theme-toggle", "components/auth/auth-screen",
  "components/workspace/workspace-shell", "components/workspace/workspace-rail",
  "components/workspace/workspace-sidebar", "components/workspace/admin-dialog",
  "components/workspace/workspace-error-boundary",
  "components/me/shell/me-sidebar", "components/me/shell/mobile-scope-header",
  "components/me/shell/scope-chips", "components/me/shell/scope-swap",
  "components/me/my-day/use-query-state",
  "components/workspace/settings/team-tab", "components/workspace/settings/invites-tab",
  "components/workspace/canvases/circular-text-layout",
  "components/workspace/canvases/use-canvas-color-mode",
  "components/motion/motion-stage", "components/motion/index",
  "components/ui/accordion", "components/ui/card", "components/ui/separator", "components/ui/tooltip-provider",
  "lib/utils", "lib/motion/index", "lib/motion/eases", "lib/motion/gsap-setup", "lib/motion/use-gsap",
  "lib/motion/use-enter", "lib/motion/use-pop-enter", "lib/motion/use-press", "lib/motion/use-flip",
  "lib/motion/use-layer-motion", "lib/motion/use-number-roll", "lib/motion/reduced-motion",
  "lib/motion/scale-property", "lib/motion/number-roll", "lib/motion/use-rail-indicator",
]);

/** Primitivi: Devotion `components/ui/*` → Enigmin modul (null = nema zamene). */
const UI = {
  button: "components/ui/button", "dropdown-menu": "components/ui/dropdown-menu",
  dialog: "components/ui/dialog", select: "components/ui/select", tooltip: "components/ui/tooltip",
  popover: "components/ui/popover", label: "components/ui/label", input: "components/ui/input",
  textarea: "components/ui/textarea", checkbox: "components/ui/checkbox", switch: "components/ui/switch",
  skeleton: "components/ui/skeleton", tabs: "components/ui/tabs", avatar: "components/ui/avatar",
  "scroll-area": "components/ui/scroll-area", progress: "components/ui/progress", kbd: "components/ui/kbd",
  badge: "components/ui/badge", sheet: "components/app/system/side-drawer", sonner: "lib/toast",
  "date-picker": `${P}/zajednicko/birac-datuma`, card: null, accordion: null, separator: null,
  "tooltip-provider": null,
};

/** Imena po modulu kad jedan Devotion modul ide na više mesta. */
const PO_IMENU = {
  "components/workspace/workspace-error-boundary": {
    useQueryTolerant: `${P}/podaci/ja`,
    useQueryResult: `${P}/podaci/ja`,
    WorkspaceErrorBoundary: `${P}/zajednicko/granica-greske`,
  },
  // Barel pokreta: imena koja imaju isti API idu sama; Collapse, MotionDialog,
  // NumberRoll i ProgressRing nemaju isto ime ni API (Unfold, ui/dialog,
  // CountUp, system/progress) pa idu u RUČNO.
  "components/motion": {
    AnimatedCheck: "components/motion/animated-check",
    FlipGroup: "components/motion/flip-group",
    FLIP_MAX_ITEMS: "components/motion/flip-group",
    Drawer: "components/ui/drawer",
  },
  "components/me/my-day/use-query-state": {
    useQueryState: `${P}/podaci/ja`,
    QueryState: `${P}/podaci/ja`,
  },
};

// ── Klasa Convex funkcije: P (projekat), L (lično), I (interna) ─────────────
const KLASE = (() => {
  const mapa = new Map();
  const dir = join(KOREN, "convex/prostor");
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".ts") || f.includes(".test.") || f.includes(".pomoc.")) continue;
    const tekst = readFileSync(join(dir, f), "utf8");
    const re = /export const (\w+)\s*=\s*(projekat|prijavljen|platforma|internal)(Query|Mutation|Action)\b/g;
    for (const m of tekst.matchAll(re)) {
      const klasa = m[2] === "projekat" ? "P" : m[2] === "internal" ? "I" : "L";
      mapa.set(`${f.replace(/\.ts$/, "")}.${m[1]}`, klasa);
    }
  }
  return mapa;
})();

// Devotion modul → Enigma (S01 §8.1.4).
const ZAMENE_API = {
  "startups.listMembers": "prostor.projekat.listMembers",
  "profiles.listAll": "prostor.projekat.listMembers",
  "startups.createArea": "prostor.projekat.createArea",
  "startups.updateArea": "prostor.projekat.updateArea",
  "startups.reorderAreas": "prostor.projekat.reorderAreas",
  "startups.listForCurrent": "prostor.projekat.listForCurrent",
};
const API_RUCNO = new Set(["startups.update", "startups.create", "startups.addMember",
  "startups.removeMember", "profiles.getBootstrapState", "invites.claim", "invites.create",
  "invites.list", "invites.revoke"]);

const HOOK_P = {
  useQuery: ["useProjekatQuery", "@/components/app/projekat-provider"],
  useMutation: ["useProjekatMutation", "@/components/app/projekat-provider"],
  useAction: ["useProjekatAction", "@/components/app/projekat-provider"],
  usePaginatedQuery: ["useProjekatPaginatedQuery", `@/${P}/podaci/projekat`],
  useQueryTolerant: ["useProjekatQueryTolerant", `@/${P}/podaci/projekat`],
  useQueryResult: ["useProjekatQueryResult", `@/${P}/podaci/projekat`],
  useQueryState: ["useProjekatQueryState", `@/${P}/podaci/projekat`],
};

// ── Klase (E12) ─────────────────────────────────────────────────────────────
const KLASE_ZAMENA = [
  [/^text-\[(0\.625rem|0\.6875rem|0\.5625rem|0\.5rem|0\.75rem|10px|11px|12px)\]$/, "text-meta"],
  [/^text-\[(0\.8125rem|13px)\]$/, "text-ui"],
  [/^text-\[(0\.9375rem|15px)\]$/, "text-copy"],
  [/^border-border$/, "border-line"],
  [/^border-border\/\d+$/, "border-line-soft"],
  [/^divide-border(\/\d+)?$/, "divide-line-soft"],
  [/^border-input$/, "border-line-control"],
  [/^shadow-desk$/, "shadow-elev-3"],
  [/^bg-secondary$/, "bg-surface-raised"],
  [/^text-secondary-foreground$/, "text-foreground"],
  [/^bg-accent$/, "bg-surface-control-hover"],
  [/^text-accent-foreground$/, "text-foreground"],
  [/^text-destructive$/, "text-danger"],
  [/^bg-primary\/(5|8|10|12|15)$/, "bg-radnja-soft"],
  [/^border-primary\/\d+$/, "border-radnja-line"],
  [/^bg-sidebar-accent$/, "bg-surface-control-hover"],
];
const KLASE_RUCNO = [
  [/^font-mono$/, "font-mono: obrisan; ako je ID, kod ili kolona brojeva, vrati ga (plafon 254)"],
  [/^(text|bg|ring|border|fill|stroke|outline)-primary(\/\d+)?$/, "boja radnje nije stanje izbora: link → text-radnja, izbor → text-foreground/bg-surface-control-hover, dugme → <Button variant=\"primary\">"],
  [/startup-tone/, "ton startupa → ProjekatZnak / data-projekat"],
  [/^bg-thread$/, "bg-thread → bg-line-strong (nit u četu)"],
  [/-(success|warning|info|destructive)-foreground$/, "puni čip stanja → bg-<stanje>-soft text-<stanje> border-<stanje>-line"],
  [/^text-[a-z-]+\/\d+$/, "providnost na tekstu (K2) → text-text-secondary / text-text-muted"],
  [/^(hover:|group-hover:|focus:)?opacity-([1-9]\d?)$/, "providnost (K3) samo uz cursor-not-allowed/pointer-events-none"],
  [/^(text|bg|border|ring|fill|stroke|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-\d+)?(\/\d+)?$/, "sirova paleta (K4) → token"],
  [/data-\[state=/, "Radix atribut stanja ostao"],
];
const DATA_STATE = [
  [/data-\[state=open\]:/g, "data-open:"],
  [/data-\[state=closed\]:/g, "data-closed:"],
  [/data-\[state=checked\]:/g, "data-checked:"],
  [/data-\[state=indeterminate\]:/g, "data-indeterminate:"],
  [/data-\[state=active\]:/g, "data-active:"],
  [/data-\[state=on\]:/g, "data-pressed:"],
];

// ── Tekst (E8) ──────────────────────────────────────────────────────────────
const RECI = [
  [/\bStartupima\b/g, "Projektima"], [/\bstartupima\b/g, "projektima"],
  [/\bStartupom\b/g, "Projektom"], [/\bstartupom\b/g, "projektom"],
  [/\bStartupa\b/g, "Projekta"], [/\bstartupa\b/g, "projekta"],
  [/\bStartupu\b/g, "Projektu"], [/\bstartupu\b/g, "projektu"],
  [/\bStartupi\b/g, "Projekti"], [/\bstartupi\b/g, "projekti"],
  [/\bStartupe\b/g, "Projekte"], [/\bstartupe\b/g, "projekte"],
  [/\bStartup\b/g, "Projekat"], [/\bstartup\b/g, "projekat"],
];
function prevediTekst(t) {
  if (Object.hasOwn(PORUKE_TACNO, t)) return PORUKE_TACNO[t];
  let out = t;
  for (const [od, u] of PORUKE_DEO) out = out.split(od).join(u);
  for (const [re, u] of RECI) out = out.replace(re, u);
  return out;
}
/** Rečenica (ne enum ni ključ): ima razmak, veliko slovo ili interpunkciju. */
const jeRecenica = (t) => /[\s.,!?:;„“"]/.test(t) || /^[A-ZČĆŠĐŽ]/.test(t);

// ── RUČNO: obrasci koje alat samo prijavljuje ───────────────────────────────
const PROVERE = [
  [/window\.history|popstate|navigateRoute|workspaceRouteHref|readWorkspace(Location|RouteCandidate|StartupId)/, "navigacija → useProstorNavigacija() i lib/prostor/rute.ts"],
  [/from\s+["']next\/link["']/, "next/link → ProjekatLink ili JaLink"],
  [/\buseRouter\(|\buseSearchParams\(|\busePathname\(/, "ruter Next-a: useProstorNavigacija; useSearchParams traži <Suspense>"],
  [/\bIntl\.|toLocale(Date|Time)?String\(/, "Intl/toLocale → lib/format.ts"],
  [/profile\.role|role\s*===\s*["']admin["']|createdByProfileId/, "uloga: platformaVlasnik / uloga iz useProjekat(), useMoze, SamoZa"],
  [/\bDURATION\.|\bSPRING\.|springTween|standardTween|reducedFade|useTweenSlots|useEnter\b|usePress\b|useLayerMotion|usePopEnter|useRailIndicator|useNumberRoll|MotionStage/, "pokret → lib/motion.ts (DUR_UI/EASE_UI), useGSAP + matchMedia (plan S07 §6.3)"],
  [/⌘/, "znak ⌘ → usePrecica / oznakaPrecice"],
  [/Doc<"startups">|Doc<"startupMembers">/, "Doc<\"startups\"> → WorkspaceMini / mojProjekat"],
  [/\.withOptimisticUpdate\(/, "optimistična izmena: P upit → useProjekatMutationOptimisticno, ključ keša sa workspaceId"],
  [/useConvex\(\)/, "imperativni upit: P funkcija → useProjekatKlijent()"],
  [/\bforceMount\b/, "forceMount → Base UI CSS prelaz (data-starting-style / data-ending-style)"],
  [/from\s+["']@\/lib\/motion["']/, "Devotion @/lib/motion ne postoji u Enigmi"],
  [/ContextMenu\./, "Radix ContextMenu.* → ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem iz @/components/ui/context-menu"],
  [/#[0-9a-fA-F]{3,8}\b/, "hex boja → token"],
  [/workspaceId\??:\s*Id<"workspaces">/, "prop workspaceId: kuke projekta ga ne traže (useProjekat); ostavi samo gde je drugi projekat (Ja)"],
];
const ZABRANJENO = [
  [/from\s+["']framer-motion["']/, "framer-motion je zabranjen"],
  // Kontekstni meni alat preusmerava na Base UI (E10), ostalo je greška.
  [/from\s+["']@radix-ui\/(?!react-context-menu["'])/, "@radix-ui/* se ne prenosi"],
  [/from\s+["']sonner["']/, "sonner → @/lib/toast"],
  [/\bThemeToggle\b|\buseTheme\(/, "tema se ne prenosi (P2)"],
  [/from\s+["']next\/font\/google["']/, "Geist se ne prenosi (Aeonik)"],
];

// ── pomoćno ─────────────────────────────────────────────────────────────────
function argumenti(argv) {
  const a = { suvo: false, prepisi: false, samo: null, korak: null, izlaz: null, pokrivenost: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--korak") a.korak = argv[++i];
    else if (x === "--samo") a.samo = new Set(argv[++i].split(","));
    else if (x === "--suvo") a.suvo = true;
    else if (x === "--prepisi") a.prepisi = true;
    else if (x === "--izlaz") a.izlaz = argv[++i];
    else if (x === "--pokrivenost") a.pokrivenost = true;
    else throw new Error(`Nepoznat argument: ${x}`);
  }
  return a;
}

function sviFajloviSnimka() {
  const out = [];
  const obidji = (rel) => {
    for (const ime of readdirSync(join(SNIMAK, rel))) {
      const r = rel ? `${rel}/${ime}` : ime;
      if (statSync(join(SNIMAK, r)).isDirectory()) {
        if (ime === "node_modules" || ime === "izlog" || ime.startsWith(".")) continue;
        obidji(r);
      } else if (/\.(ts|tsx|css)$/.test(ime) && !ime.endsWith(".d.ts")) out.push(r);
    }
  };
  for (const koren of ["components", "lib", "hooks", "app"]) obidji(koren);
  return out;
}

const bezNastavka = (p) => p.replace(/\.(test\.ts|tsx|ts|module\.css|css)$/, "");
const jeTest = (p) => p.endsWith(".test.ts");

/** Cilj za modul snimka (bez nastavka): [cilj, korak] ili null. */
function ciljModula(modul) {
  if (Object.hasOwn(FAJLOVI, modul)) return FAJLOVI[modul];
  const ui = modul.match(/^components\/ui\/(.+)$/);
  if (ui && Object.hasOwn(UI, ui[1])) {
    // Primitiv se ne prenosi nego menja Enigminim; birač datuma se prenosi u S12.
    if (ui[1] === "date-picker") return [UI[ui[1]], "S12"];
    return UI[ui[1]] ? [UI[ui[1]], "ZAMENA"] : null;
  }
  for (const [pre, cilj, korak] of FASCIKLE) {
    if (modul.startsWith(pre)) {
      const ime = modul.slice(pre.length);
      // Čist model sa testom ide u lib/prostor/modeli (P24).
      const imaTest = existsSync(join(SNIMAK, `${modul}.test.ts`));
      const jeTs = existsSync(join(SNIMAK, `${modul}.ts`));
      if (imaTest && jeTs && !ime.startsWith("use-")) return [`lib/prostor/modeli/${ime}`, korak];
      return [`${cilj}${ime}`, korak];
    }
  }
  const korenWs = modul.match(/^components\/workspace\/([^/]+)$/);
  if (korenWs && existsSync(join(SNIMAK, `${modul}.test.ts`))) {
    return [`lib/prostor/modeli/${korenWs[1]}`, korakPoSusedu(korenWs[1])];
  }
  return null;
}

/** Model u korenu `workspace/` ide u korak ekrana koji ga koristi. */
function korakPoSusedu(ime) {
  if (/^page-tree|^page-entry/.test(ime)) return "S10";
  if (/^task-/.test(ime)) return "S12";
  return "S10";
}

/** Uvoz iz snimka → putanja modula u snimku (bez nastavka) ili null. */
function modulSnimka(specifier, izvorRel) {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (specifier.startsWith(".")) {
    const abs = resolve(join(SNIMAK, dirname(izvorRel)), specifier);
    return relative(SNIMAK, abs).replace(/\\/g, "/");
  }
  return null;
}

/** Specifier za cilj iz fajla `ciljFajla` (repo putanja). `lib/` ide relativno. */
function specifierZa(ciljModula, ciljFajla) {
  if (ciljFajla.startsWith("lib/")) {
    let r = relative(dirname(ciljFajla), ciljModula).replace(/\\/g, "/");
    if (!r.startsWith(".")) r = `./${r}`;
    return r;
  }
  return `@/${ciljModula}`;
}

function primeniIzmene(tekst, izmene) {
  const sortirane = [...izmene].sort((x, y) => y.start - x.start || y.end - x.end);
  let out = tekst;
  let granica = Infinity;
  for (const iz of sortirane) {
    if (iz.end > granica) continue; // preklapanje: spoljna izmena već važi
    out = out.slice(0, iz.start) + iz.text + out.slice(iz.end);
    granica = iz.start;
  }
  return out;
}

function parsiraj(tekst, ime) {
  return ts.createSourceFile(ime, tekst, ts.ScriptTarget.Latest, true,
    ime.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function obidji(cvor, fn) {
  fn(cvor);
  ts.forEachChild(cvor, (d) => obidji(d, fn));
}

const linijaOd = (src, pos) => src.getLineAndCharacterOfPosition(pos).line + 1;

// ── Prolaz 1: JSX (E11, E13) ────────────────────────────────────────────────
function prolazJsx(tekst, ime, b, rucno) {
  const src = parsiraj(tekst, ime);
  const izmene = [];
  const imeTaga = (t) => t.getText(src);
  obidji(src, (c) => {
    // DialogContent → DialogPopup
    if ((ts.isJsxOpeningElement(c) || ts.isJsxClosingElement(c) || ts.isJsxSelfClosingElement(c)) &&
        imeTaga(c.tagName) === "DialogContent") {
      izmene.push({ start: c.tagName.getStart(src), end: c.tagName.end, text: "DialogPopup" });
      b.E11 = (b.E11 ?? 0) + 1;
    }
    const atributi = ts.isJsxOpeningElement(c) || ts.isJsxSelfClosingElement(c) ? c.attributes.properties : null;
    if (!atributi) return;
    const tag = imeTaga(c.tagName);
    for (const at of atributi) {
      if (!ts.isJsxAttribute(at)) continue;
      const n = at.name.getText(src);
      if (n === "onSelect" && /Item$|^ContextMenu\.Item$|MenuItem/.test(tag)) {
        izmene.push({ start: at.name.getStart(src), end: at.name.end, text: "onClick" });
        b.E11 = (b.E11 ?? 0) + 1;
        if (at.getText(src).includes("preventDefault")) {
          izmene.push({ start: at.getStart(src), end: at.getStart(src), text: "closeOnClick={false} " });
          rucno.push(`${linijaOd(src, at.getStart(src))}: onSelect sa preventDefault → closeOnClick={false}; obriši preventDefault`);
        }
      }
      if (n === "forceMount") {
        izmene.push({ start: at.getFullStart(), end: at.end, text: "" });
        rucno.push(`${linijaOd(src, at.getStart(src))}: forceMount obrisan → izlaz kroz Base UI CSS prelaz`);
      }
    }
    // Button bez variant / variant="default" (E13)
    if (tag === "Button") {
      const variant = atributi.find((a) => ts.isJsxAttribute(a) && a.name.getText(src) === "variant");
      const spread = atributi.some((a) => ts.isJsxSpreadAttribute(a));
      if (!variant && !spread) {
        izmene.push({ start: c.tagName.end, end: c.tagName.end, text: ' variant="secondary"' });
        rucno.push(`${linijaOd(src, c.getStart(src))}: Button bez variant → secondary; da li je jedina primarna radnja ekrana?`);
        b.E13 = (b.E13 ?? 0) + 1;
      } else if (variant && ts.isJsxAttribute(variant) && variant.initializer?.getText(src) === '"default"') {
        izmene.push({ start: variant.initializer.getStart(src), end: variant.initializer.end, text: '"secondary"' });
        rucno.push(`${linijaOd(src, c.getStart(src))}: variant="default" → secondary; da li je jedina primarna radnja ekrana?`);
        b.E13 = (b.E13 ?? 0) + 1;
      }
    }
  });
  // asChild sa jednim JSX detetom → render={<dete/>} (§5.2)
  obidji(src, (c) => {
    if (!ts.isJsxElement(c)) return;
    const otv = c.openingElement;
    const asChild = otv.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(src) === "asChild");
    if (!asChild) return;
    const deca = c.children.filter((d) => !(ts.isJsxText(d) && d.getText(src).trim() === ""));
    if (deca.length !== 1 || !(ts.isJsxElement(deca[0]) || ts.isJsxSelfClosingElement(deca[0]))) {
      rucno.push(`${linijaOd(src, otv.getStart(src))}: asChild bez jednog JSX deteta → render ručno`);
      return;
    }
    const dete = deca[0];
    const tag = otv.tagName.getText(src);
    const ostali = otv.attributes.properties.filter((a) => a !== asChild).map((a) => a.getText(src)).join(" ");
    let render;
    let unutra = "";
    if (ts.isJsxSelfClosingElement(dete)) {
      render = dete.getText(src);
    } else {
      const o = dete.openingElement;
      const atr = o.attributes.getText(src);
      render = `<${o.tagName.getText(src)}${atr ? ` ${atr}` : ""} />`;
      unutra = dete.children.map((d) => d.getFullText(src)).join("");
    }
    const glava = `<${tag}${ostali ? ` ${ostali}` : ""} render={${render}}`;
    const novo = unutra.trim() === "" ? `${glava} />` : `${glava}>${unutra}</${tag}>`;
    izmene.push({ start: c.getStart(src), end: c.end, text: novo });
    b.E11 = (b.E11 ?? 0) + 1;
  });
  return primeniIzmene(tekst, izmene);
}

// ── Prolaz 2: Convex api i kuke (E5, E6) ────────────────────────────────────
function lanacApi(izraz) {
  let t = izraz;
  while (ts.isAsExpression(t) || ts.isParenthesizedExpression(t) || ts.isNonNullExpression(t)) t = t.expression;
  const lanac = [];
  while (ts.isPropertyAccessExpression(t)) { lanac.unshift(t.name.text); t = t.expression; }
  if (!ts.isIdentifier(t) || t.text !== "api" || lanac.length < 2) return null;
  return lanac;
}

function prolazPodaci(tekst, ime, cilj, b, rucno, potrebniUvozi) {
  const src = parsiraj(tekst, ime);
  const izmene = [];
  const jaCilj = /prostor\/(ja|danas|inbox)\//.test(cilj);
  // api.X.Y → api.prostor.X.Y (i zamene); skuplja klasu po čvoru izraza.
  const klasaIzraza = new Map();
  obidji(src, (c) => {
    if (!ts.isPropertyAccessExpression(c)) return;
    if (ts.isPropertyAccessExpression(c.parent) && c.parent.expression === c) return; // samo pun lanac
    const lanac = lanacApi(c);
    if (!lanac || lanac[0] === "prostor") return;
    const kljuc = lanac.join(".");
    if (API_RUCNO.has(kljuc)) rucno.push(`${linijaOd(src, c.getStart(src))}: api.${kljuc} nema zamenu u prostor (S01 §8.1.4)`);
    const novo = ZAMENE_API[kljuc] ?? `prostor.${kljuc}`;
    izmene.push({ start: c.getStart(src), end: c.end, text: `api.${novo}` });
    b.E5 = (b.E5 ?? 0) + 1;
    const [, modul, fn] = novo.split(".");
    klasaIzraza.set(c, KLASE.get(`${modul}.${fn}`) ?? null);
    if (!KLASE.has(`${modul}.${fn}`)) rucno.push(`${linijaOd(src, c.getStart(src))}: api.${novo} ne postoji u convex/prostor`);
  });
  obidji(src, (c) => {
    if (!ts.isCallExpression(c) || !ts.isIdentifier(c.expression) || c.arguments.length === 0) return;
    const hook = c.expression.text;
    if (!Object.hasOwn(HOOK_P, hook) && hook !== "useQueries") return;
    if (hook === "useQueries") {
      rucno.push(`${linijaOd(src, c.getStart(src))}: useQueries → useProjekatQueries (P) ili useQueries sa L funkcijom`);
      return;
    }
    let arg0 = c.arguments[0];
    while (ts.isAsExpression(arg0) || ts.isParenthesizedExpression(arg0)) arg0 = arg0.expression;
    const klasa = klasaIzraza.get(arg0);
    if (klasa !== "P") return;
    if (ts.isPropertyAccessExpression(c.parent) && c.parent.name.text === "withOptimisticUpdate") return; // RUČNO kroz PROVERE
    if (jaCilj) rucno.push(`${linijaOd(src, c.getStart(src))}: P funkcija na ekranu „Ja“ → pod ProjekatStavkeProvider (D14)`);
    const [novi, modul] = HOOK_P[hook];
    izmene.push({ start: c.expression.getStart(src), end: c.expression.end, text: novi });
    potrebniUvozi.add(`${novi}|${modul}`);
    b.E6 = (b.E6 ?? 0) + 1;
    // Argumenti: briše `startupId` / `workspaceId` iz objekta (daje ga provider).
    const args = c.arguments[1];
    if (args && ts.isObjectLiteralExpression(args)) {
      const props = args.properties;
      const zaBrisanje = props.filter((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
        ["startupId", "workspaceId"].includes(p.name.getText(src)));
      if (zaBrisanje.length > 0 && zaBrisanje.length === props.length) {
        // Ostao bi prazan objekat: briše se ceo argument (projekat daje provider).
        izmene.push({ start: c.arguments[0].end, end: args.end, text: "" });
      } else {
        for (const p of zaBrisanje) {
          const i = props.indexOf(p);
          const kraj = i < props.length - 1 ? props[i + 1].getStart(src) : p.end;
          const pocetak = i < props.length - 1 ? p.getStart(src) : (i > 0 ? props[i - 1].end : p.getStart(src));
          izmene.push({ start: pocetak, end: kraj, text: "" });
        }
      }
    }
  });
  return primeniIzmene(tekst, izmene);
}

// ── Prolaz 3: identifikatori, literali, tekst, klase (E7, E8, E12) ──────────
function zameniKlase(tekst, linija, rucno, b) {
  let out = tekst;
  for (const [re, u] of DATA_STATE) out = out.replace(re, u);
  const tokeni = out.split(/(\s+)/);
  const novi = tokeni.map((tok) => {
    if (/^\s*$/.test(tok)) return tok;
    const [pre, osnova] = (() => { const m = tok.match(/^((?:[a-z0-9-]+:|\[[^\]]+\]:)*)(.*)$/); return [m[1], m[2]]; })();
    for (const [re, u] of KLASE_ZAMENA) {
      if (re.test(osnova)) { b.E12 = (b.E12 ?? 0) + 1; return pre + u; }
    }
    for (const [re, poruka] of KLASE_RUCNO) {
      if (re.test(osnova) || re.test(tok)) {
        rucno.push(`${linija}: ${tok} — ${poruka}`);
        if (osnova === "font-mono") { b.E12 = (b.E12 ?? 0) + 1; return ""; }
        break;
      }
    }
    return tok;
  });
  return novi.join("").replace(/ {2,}/g, " ");
}

const ATRIBUTI_TEKSTA = new Set(["title", "aria-label", "placeholder", "alt", "label", "description", "aria-description"]);

function prolazListovi(tekst, ime, b, rucno) {
  const src = parsiraj(tekst, ime);
  const izmene = [];
  obidji(src, (c) => {
    if (ts.isIdentifier(c) && Object.hasOwn(IDENTIFIKATORI, c.text)) {
      // ne dira uvoz iz paketa ni JSX ime taga
      if (!ts.isImportSpecifier(c.parent) || !c.parent.parent?.parent?.parent?.moduleSpecifier?.text?.match(/^[a-z@]/)) {
        izmene.push({ start: c.getStart(src), end: c.end, text: IDENTIFIKATORI[c.text] });
        b.E7 = (b.E7 ?? 0) + 1;
      }
      return;
    }
    if (ts.isJsxText(c)) {
      const t = c.getText(src);
      const p = prevediTekst(t);
      if (p !== t) { izmene.push({ start: c.getStart(src), end: c.end, text: p }); b.E8 = (b.E8 ?? 0) + 1; }
      return;
    }
    if (ts.isStringLiteral(c) || ts.isNoSubstitutionTemplateLiteral(c)) {
      if (ts.isImportDeclaration(c.parent) || ts.isExportDeclaration(c.parent)) return;
      const t = c.text;
      let novo = t;
      if (Object.hasOwn(LITERALI, t)) novo = LITERALI[t];
      else if (/(^|\s)[a-z0-9:[\]-]+-[a-z0-9[\]./-]+/.test(t) && !/[A-ZČĆŠĐŽ]/.test(t.split(" ")[0] ?? "")) {
        novo = zameniKlase(t, linijaOd(src, c.getStart(src)), rucno, b);
      }
      if (novo === t && jeRecenica(t)) {
        const ujsx = ts.isJsxAttribute(c.parent) && ATRIBUTI_TEKSTA.has(c.parent.name.getText(src));
        const uToast = ts.isCallExpression(c.parent) && /^toast/.test(c.parent.expression.getText(src));
        if (ujsx || uToast || ts.isPropertyAssignment(c.parent) || ts.isReturnStatement(c.parent) ||
            ts.isConditionalExpression(c.parent) || ts.isVariableDeclaration(c.parent) || ts.isJsxExpression(c.parent)) {
          novo = prevediTekst(t);
          if (novo !== t) b.E8 = (b.E8 ?? 0) + 1;
        }
      }
      if (novo !== t) {
        const navod = c.getText(src)[0];
        const telo = navod === "`" ? novo.replace(/`/g, "\\`") : novo.replace(new RegExp(navod, "g"), `\\${navod}`);
        izmene.push({ start: c.getStart(src), end: c.end, text: `${navod}${telo}${navod}` });
      }
      return;
    }
    if (ts.isTemplateHead(c) || ts.isTemplateMiddle(c) || ts.isTemplateTail(c)) {
      const sirov = c.getText(src);
      let novo = sirov;
      for (const [re, u] of DATA_STATE) novo = novo.replace(re, u);
      novo = prevediTekst(novo);
      if (novo !== sirov) { izmene.push({ start: c.getStart(src), end: c.end, text: novo }); b.E8 = (b.E8 ?? 0) + 1; }
    }
  });
  return primeniIzmene(tekst, izmene);
}

// ── Prolaz 4: uvozi (E2, E3, E4, E9, E10) i dodati uvozi kuka ───────────────
function prolazUvozi(tekst, ime, izvorRel, cilj, b, rucno, potrebniUvozi) {
  const src = parsiraj(tekst, ime);
  const izmene = [];
  const dodatni = [];
  let posle = 0;
  for (const st of src.statements) {
    if (!ts.isImportDeclaration(st) && !ts.isExportDeclaration(st)) continue;
    if (ts.isImportDeclaration(st)) posle = st.end;
    const ms = st.moduleSpecifier;
    if (!ms || !ts.isStringLiteral(ms)) continue;
    const spec = ms.text;
    const zameni = (novi) => { izmene.push({ start: ms.getStart(src), end: ms.end, text: `"${novi}"` }); };
    if (spec === "sonner") { zameni("@/lib/toast"); b.E9 = (b.E9 ?? 0) + 1; continue; }
    if (spec === "@devotion/shared") { zameni(specifierZa("lib/prostor/index", cilj).replace(/\/index$/, "")); b.E4 = (b.E4 ?? 0) + 1; continue; }
    if (spec === "@radix-ui/react-context-menu") { zameni("@/components/ui/context-menu"); rucno.push(`${linijaOd(src, st.getStart(src))}: Radix ContextMenu → imenovani delovi iz @/components/ui/context-menu`); continue; }
    if (spec.startsWith("@/convex/")) { if (cilj.startsWith("lib/")) zameni(specifierZa(spec.slice(2), cilj)); continue; }
    const modul = modulSnimka(spec, izvorRel);
    if (modul === null) continue; // paket (react, lucide-react, convex/react…)
    if (modul === "lib/motion" || modul.startsWith("lib/motion/") && !Object.hasOwn(FAJLOVI, modul)) {
      rucno.push(`${linijaOd(src, st.getStart(src))}: uvoz ${spec} (Devotion pokret) → lib/motion.ts / components/motion`);
      continue;
    }
    if (modul === "lib/utils") {
      // `cn` je isti u Enigmi (`lib/utils.ts`).
      if (cilj.startsWith("lib/")) zameni(specifierZa("lib/utils", cilj));
      continue;
    }
    if (modul === "components/ui/tooltip-provider") {
      izmene.push({ start: st.getFullStart(), end: st.end, text: "" });
      rucno.push(`${linijaOd(src, st.getStart(src))}: TooltipProvider je već u korenu Enigme; obriši ga iz JSX-a`);
      continue;
    }
    if (Object.hasOwn(PO_IMENU, modul) && ts.isImportDeclaration(st) && st.importClause?.namedBindings &&
        ts.isNamedImports(st.importClause.namedBindings)) {
      const grupe = new Map();
      for (const el of st.importClause.namedBindings.elements) {
        const ciljImena = PO_IMENU[modul][el.propertyName?.text ?? el.name.text];
        if (!ciljImena) { rucno.push(`${linijaOd(src, st.getStart(src))}: ${el.name.text} iz ${spec} nema mesto`); continue; }
        const s = specifierZa(ciljImena, cilj);
        grupe.set(s, [...(grupe.get(s) ?? []), el.getText(src)]);
      }
      const novo = [...grupe].map(([s, imena]) => `import { ${imena.join(", ")} } from "${s}";`).join("\n");
      izmene.push({ start: st.getStart(src), end: st.end, text: novo });
      b.E2 = (b.E2 ?? 0) + 1;
      continue;
    }
    const meta = ciljModula(modul) ?? ciljModula(modul.replace(/\/index$/, ""));
    if (!meta) { rucno.push(`${linijaOd(src, st.getStart(src))}: uvoz ${spec} nije u mapi`); continue; }
    zameni(specifierZa(meta[0], cilj));
    b[modul.startsWith("components/ui/") ? "E10" : "E2"] = (b[modul.startsWith("components/ui/") ? "E10" : "E2"] ?? 0) + 1;
  }
  // DialogContent je postao DialogPopup (prolaz 1): ime u uvozu dijaloga.
  const imaPopup = /\bDialogPopup\b/.test(tekst);
  if (imaPopup) {
    obidji(src, (c) => {
      if (ts.isImportSpecifier(c) && c.name.text === "DialogContent") {
        izmene.push({ start: c.getStart(src), end: c.end, text: "DialogPopup" });
      }
    });
  }
  const poModulu = new Map();
  for (const par of potrebniUvozi) {
    const [imeKuke, modul] = par.split("|");
    poModulu.set(modul, [...(poModulu.get(modul) ?? []), imeKuke]);
  }
  for (const [modul, imena] of poModulu) {
    dodatni.push(`import { ${[...new Set(imena)].sort().join(", ")} } from "${modul}";`);
  }
  if (dodatni.length > 0) izmene.push({ start: posle, end: posle, text: `\n${dodatni.join("\n")}` });
  let out = primeniIzmene(tekst, izmene);
  // Uvozi koje više niko ne koristi (useQuery, useMutation… posle E6).
  out = ociscenUvoz(out, ime, ["convex/react", "@/components/app/prostor/podaci/ja"]);
  return out;
}

function ociscenUvoz(tekst, ime, moduli) {
  const src = parsiraj(tekst, ime);
  const izmene = [];
  for (const st of src.statements) {
    if (!ts.isImportDeclaration(st) || !moduli.includes(st.moduleSpecifier.text)) continue;
    const nb = st.importClause?.namedBindings;
    if (!nb || !ts.isNamedImports(nb)) continue;
    const telo = tekst.slice(0, st.getStart(src)) + tekst.slice(st.end);
    const zadrzi = nb.elements.filter((el) => new RegExp(`\\b${el.name.text}\\b`).test(telo));
    if (zadrzi.length === nb.elements.length) continue;
    const novo = zadrzi.length === 0 ? "" :
      `import { ${zadrzi.map((e) => e.getText(src)).join(", ")} } from "${st.moduleSpecifier.text}";`;
    izmene.push({ start: zadrzi.length === 0 ? st.getFullStart() : st.getStart(src), end: st.end, text: novo });
  }
  return primeniIzmene(tekst, izmene);
}

// ── jedan fajl ──────────────────────────────────────────────────────────────
function prenesiFajl(izvorRel, cilj, korak) {
  const b = {};
  const rucno = [];
  const greske = [];
  let tekst = readFileSync(join(SNIMAK, izvorRel), "utf8");
  const ime = cilj;
  if (izvorRel.endsWith(".css")) {
    rucno.push("CSS: boje → var(--…), font ≥ 12 px (plan S07 §7)");
    return { tekst, b, rucno, greske };
  }
  for (const [re, poruka] of ZABRANJENO) if (re.test(tekst) && !/sonner/.test(poruka)) greske.push(poruka);
  const potrebniUvozi = new Set();
  tekst = prolazJsx(tekst, ime, b, rucno);
  tekst = prolazPodaci(tekst, ime, cilj, b, rucno, potrebniUvozi);
  tekst = prolazListovi(tekst, ime, b, rucno);
  tekst = prolazUvozi(tekst, ime, izvorRel, cilj, b, rucno, potrebniUvozi);
  const src = parsiraj(tekst, ime);
  const linije = tekst.split("\n");
  for (const [re, poruka] of PROVERE) {
    linije.forEach((l, i) => { if (re.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)) rucno.push(`${i + 1}: ${poruka}`); });
  }
  void src;
  // E1: zaglavlje
  const zaglavlje = `// Preneto iz Devotion apps/web/${izvorRel} (main @ c05c40f), SPAJANJE ${korak}.`;
  tekst = /^["']use client["'];?\s*\n/.test(tekst)
    ? tekst.replace(/^(["']use client["'];?\s*\n)/, `$1\n${zaglavlje}\n`)
    : `${zaglavlje}\n${tekst}`;
  b.E1 = 1;
  return { tekst, b, rucno: [...new Set(rucno)], greske };
}

function poslovi(a) {
  const lista = [];
  for (const rel of sviFajloviSnimka()) {
    const modul = bezNastavka(rel);
    // Svesno izostavljen fajl se ne prenosi ni kad je u fascikli koraka.
    if (NE_PRENOSI.has(modul) || NE_PRENOSI.has(rel)) continue;
    const meta = ciljModula(modul);
    if (!meta) continue;
    const [cilj, korak] = meta;
    if (korak !== a.korak) continue;
    if (a.samo && !a.samo.has(modul) && !a.samo.has(rel)) continue;
    const nastavak = jeTest(rel) ? ".test.ts" : rel.endsWith(".module.css") ? ".module.css" : rel.endsWith(".tsx") ? ".tsx" : rel.endsWith(".css") ? ".css" : ".ts";
    lista.push({ izvor: rel, cilj: `${cilj}${nastavak}`, korak });
  }
  return lista;
}

function pokrivenost() {
  const nema = [];
  const po = new Map();
  for (const rel of sviFajloviSnimka()) {
    const modul = bezNastavka(rel);
    if (NE_PRENOSI.has(modul) || NE_PRENOSI.has(rel) || rel.startsWith("app/")) continue;
    const meta = ciljModula(modul);
    if (!meta) { nema.push(rel); continue; }
    po.set(meta[1], (po.get(meta[1]) ?? 0) + 1);
  }
  console.log("Fajlova po koraku:", Object.fromEntries([...po].sort()));
  console.log(nema.length === 0 ? "Svaki fajl snimka ima korak ili je na spisku NE_PRENOSI." : `Bez mesta (${nema.length}):\n${nema.join("\n")}`);
  return nema.length;
}

function glavni() {
  const a = argumenti(process.argv.slice(2));
  if (a.pokrivenost) process.exit(pokrivenost() === 0 ? 0 : 1);
  if (!a.korak) throw new Error("Obavezan je --korak S0x (ili --pokrivenost)");
  const lista = poslovi(a);
  const izvestaj = [`# Prenos ekrana ${a.korak}${a.izlaz ? " (proba u tmp)" : ""}`, ""];
  let ukupnoRucno = 0;
  let pada = false;
  for (const p of lista) {
    const ciljPun = a.izlaz === "tmp" ? join(PROBA, p.cilj) : join(KOREN, p.cilj);
    if (existsSync(ciljPun) && !a.prepisi) {
      izvestaj.push(`- preskočeno (cilj postoji, --prepisi): ${p.cilj}`);
      continue;
    }
    const { tekst, b, rucno, greske } = prenesiFajl(p.izvor, p.cilj, p.korak);
    ukupnoRucno += rucno.length;
    izvestaj.push(`## ${p.cilj}  ←  ${p.izvor}`);
    izvestaj.push(`izmene: ${Object.entries(b).sort().map(([k, v]) => `${k} ${v}`).join(", ") || "nema"}`);
    for (const g of greske) { izvestaj.push(`- GREŠKA ${g}`); pada = true; }
    for (const r of rucno) izvestaj.push(`- RUČNO ${r}`);
    izvestaj.push("");
    if (!a.suvo) {
      mkdirSync(dirname(ciljPun), { recursive: true });
      writeFileSync(ciljPun, tekst, "utf8");
    }
  }
  izvestaj.push(`Ukupno fajlova: ${lista.length}; RUČNO stavki: ${ukupnoRucno}.`);
  const putIzvestaja = join(IZVESTAJI, `prenos-ekran-${a.korak}${a.izlaz ? "-proba" : ""}.md`);
  if (!a.suvo) writeFileSync(putIzvestaja, izvestaj.join("\n") + "\n", "utf8");
  console.log(izvestaj.join("\n"));
  if (!a.suvo) console.log(`\nIzveštaj: ${relative(KOREN, putIzvestaja)}`);
  if (pada) process.exit(1);
}

export { ciljModula, prenesiFajl };

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) glavni();
