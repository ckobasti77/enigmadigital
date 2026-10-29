/**
 * Rute radnog dela (P13, plan S07 §4.1, D18) — ČISTO (vitest, bez `@/`).
 *
 * Objekat rute je Devotionov (`apps/web/components/workspace/types.ts`), sa
 * Enigminim ID-jevima: preneti ekrani i dalje zovu `onOpenPage`, `idi({ kind:
 * "tasks", filter: "moji" })` i slično. Menja se samo to kako ruta postaje
 * adresa: Devotion je pisao `?view=…&startupId=…`, a ovde su prave rute
 * Next-a (P13; stari `?view=` linkovi se ne podržavaju).
 *
 *   „Ja“ (bez projekta, nikad prefiks)   projekat (`<p>` = „/<slug>“ u hubu, „“ u panelu)
 *   me-today  → /                         today    → <p>
 *   me-tasks  → /moji-zadaci              tasks    → <p>/zadaci?filter=moji | ?osoba=<id>
 *   me-inbox  → /inbox                    ideas    → <p>/ideje?ideja=<id>
 *   me-chat   → /poruke?kanal=<id>        chat     → <p>/poruke?kanal=<id>
 *   me-notes  → /beleske                  thoughts → <p>/beleske
 *                                         puls     → <p>/puls?nedelja=<ms>
 *                                         activity → <p>/aktivnost
 *                                         trash    → <p>/korpa?vrsta=<vrsta>
 *                                         settings → <p>/settings?tab=<kartica>
 *                                         area     → <p>/dokumenti/<id>?tab=<kartica>
 *                                         page     → <p>/stranica/<id>?tab=mapa
 *
 * Nepoznata vrednost parametra pri čitanju daje podrazumevanu (Devotion K07
 * E13): nepoznat filter = „Svi“, nepoznata kartica = podrazumevana.
 */
import type { Id } from "../../convex/_generated/dataModel";
import { putanjaEkrana } from "../rutiranje";

// ── Tipovi (port Devotion `workspace/types.ts`) ────────────────────────────

/** Lični nivo „Ja“: adresa nikad ne nosi projekat. */
export type JaRuta =
  | { kind: "me-today" }
  | { kind: "me-tasks" }
  | { kind: "me-inbox" }
  | { kind: "me-chat"; channelId?: Id<"chatChannels"> }
  /** Beleške: moje misli iz svih projekata + lične. */
  | { kind: "me-notes" };

/** Filter Zadataka projekta: Svi (podrazumevano) · Moji · osoba. */
export type TasksFilter = "svi" | "moji";

/** Kartica rute stranice: samo Mapa (zadatak je ignoriše). */
export type PageTab = "mapa";

/** Kartica oblasti: Pregled je podrazumevan. */
export type AreaTab = "pregled" | "zadaci" | "dokumenti" | "mapa";

/**
 * Kartice Podešavanja projekta koje radni deo otvara. Enigma ima i druge
 * (Integracije, Sajt…); ovde su one na koje vode Devotion linkovi.
 * Devotion „opste“ je Enigmina „projekat“, a „tim“ i „pozivnice“ su „pristup“.
 */
export type SettingsTab = "projekat" | "oblasti" | "pristup" | "lozinke" | "ai";

/** Segment Korpe — isti ključevi kao `trash.list`. */
export type TrashSegment = "page" | "idea" | "file" | "recovered";

/** Svet jednog projekta. */
export type ProjektnaRuta =
  | { kind: "thoughts" }
  /** `ideaId` = otvoren detalj ideje. */
  | { kind: "ideas"; ideaId?: Id<"ideaNodes"> }
  | { kind: "today" }
  | {
      kind: "tasks";
      /** Odsutno = „Svi“. */
      filter?: TasksFilter;
      /** Zadaci jednog člana (ima prednost nad `filter`). */
      profileId?: Id<"profiles">;
    }
  | { kind: "trash"; segment?: TrashSegment }
  /** Bez `tab` otvara se prva kartica koju uloga sme. */
  | { kind: "settings"; tab?: SettingsTab }
  | { kind: "activity" }
  | { kind: "chat"; channelId?: Id<"chatChannels"> }
  | { kind: "puls"; weekStart?: number }
  /** `tab` iz adrese ima prednost nad zapamćenom karticom. */
  | { kind: "area"; areaId: Id<"areas">; tab?: AreaTab }
  /** `tab: "mapa"` = Mapa stranice; bez njega dokument (ili zadatak). */
  | { kind: "page"; pageId: Id<"pages">; tab?: PageTab };

export type ProstorRuta = JaRuta | ProjektnaRuta;

/** Opseg prikaza: lični nivo ili projekat. */
export type OpsegRute = "ja" | "projekat";

export const JA_VRSTE = [
  "me-today",
  "me-tasks",
  "me-inbox",
  "me-chat",
  "me-notes",
] as const satisfies ReadonlyArray<JaRuta["kind"]>;

export function jeJaRuta(ruta: { kind: string }): ruta is JaRuta {
  return (JA_VRSTE as ReadonlyArray<string>).includes(ruta.kind);
}

export function opsegRute(ruta: ProstorRuta): OpsegRute {
  return jeJaRuta(ruta) ? "ja" : "projekat";
}

export const AREA_TABS: ReadonlyArray<AreaTab> = ["pregled", "zadaci", "dokumenti", "mapa"];
export const SETTINGS_TABS: ReadonlyArray<SettingsTab> = [
  "projekat",
  "oblasti",
  "pristup",
  "lozinke",
  "ai",
];
export const TRASH_SEGMENTS: ReadonlyArray<TrashSegment> = ["page", "idea", "file", "recovered"];

export function isAreaTab(value: unknown): value is AreaTab {
  return typeof value === "string" && (AREA_TABS as ReadonlyArray<string>).includes(value);
}

export function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === "string" && (SETTINGS_TABS as ReadonlyArray<string>).includes(value);
}

export function isTrashSegment(value: unknown): value is TrashSegment {
  return typeof value === "string" && (TRASH_SEGMENTS as ReadonlyArray<string>).includes(value);
}

/**
 * Devotion kartica Podešavanja → Enigmina (linkovi iz obaveštenja i
 * prenetog koda): `opste` → `projekat`, `tim`/`pozivnice` → `pristup`.
 */
export function karticaPodesavanja(devotion: string | null | undefined): SettingsTab | undefined {
  if (devotion === "opste") return "projekat";
  if (devotion === "tim" || devotion === "pozivnice") return "pristup";
  return isSettingsTab(devotion) ? devotion : undefined;
}

// ── Ruta → adresa ───────────────────────────────────────────────────────────

function saUpitom(putanja: string, parametri: Array<[string, string | undefined]>): string {
  const upit = new URLSearchParams();
  for (const [kljuc, vrednost] of parametri) {
    if (vrednost !== undefined && vrednost !== "") upit.set(kljuc, vrednost);
  }
  const tekst = upit.toString();
  return tekst === "" ? putanja : `${putanja}?${tekst}`;
}

const seg = (id: string) => encodeURIComponent(id);

/** Pun href za „Ja“ (nikad prefiks projekta). */
export function jaHref(ruta: JaRuta): string {
  switch (ruta.kind) {
    case "me-today":
      return "/";
    case "me-tasks":
      return "/moji-zadaci";
    case "me-inbox":
      return "/inbox";
    case "me-chat":
      return saUpitom("/poruke", [["kanal", ruta.channelId]]);
    case "me-notes":
      return "/beleske";
  }
}

/**
 * Putanja ekrana projekta BEZ prefiksa (ulaz za `putanjaEkrana`, `ProjekatLink`
 * i `useProjekatHref`): „/zadaci?filter=moji“, „/dokumenti/<id>?tab=mapa“.
 */
export function ekranRute(ruta: ProjektnaRuta): string {
  switch (ruta.kind) {
    case "today":
      return "/";
    case "thoughts":
      return "/beleske";
    case "activity":
      return "/aktivnost";
    case "ideas":
      return saUpitom("/ideje", [["ideja", ruta.ideaId]]);
    case "tasks":
      // `osoba` ima prednost nad `filter`; „Svi“ se ne piše.
      return saUpitom("/zadaci", [
        ruta.profileId
          ? ["osoba", ruta.profileId]
          : ["filter", ruta.filter === "moji" ? "moji" : undefined],
      ]);
    case "trash":
      return saUpitom("/korpa", [
        ["vrsta", ruta.segment && ruta.segment !== "page" ? ruta.segment : undefined],
      ]);
    case "settings":
      return saUpitom("/settings", [["tab", ruta.tab]]);
    case "chat":
      return saUpitom("/poruke", [["kanal", ruta.channelId]]);
    case "puls":
      return saUpitom("/puls", [
        ["nedelja", ruta.weekStart !== undefined ? String(ruta.weekStart) : undefined],
      ]);
    case "area":
      return saUpitom(`/dokumenti/${seg(ruta.areaId)}`, [["tab", ruta.tab]]);
    case "page":
      return saUpitom(`/stranica/${seg(ruta.pageId)}`, [
        ["tab", ruta.tab === "mapa" ? "mapa" : undefined],
      ]);
  }
}

/** Href rute u projektu sa slugom (iz „Ja“, iz trake, iz obaveštenja). */
export function hrefUProjektu(slug: string, ruta: ProjektnaRuta): string {
  return putanjaEkrana(ekranRute(ruta), `/${slug}`);
}

/**
 * Href bilo koje rute: „Ja“ bez prefiksa, a ruta projekta kroz prefiks
 * tekućeg projekta („/<slug>“ u hubu, „“ u panelu).
 */
export function hrefRute(ruta: ProstorRuta, prefiks: string): string {
  return jeJaRuta(ruta) ? jaHref(ruta) : putanjaEkrana(ekranRute(ruta), prefiks);
}

// ── Adresa → ruta ───────────────────────────────────────────────────────────

function delovi(putanja: string): string[] {
  return putanja
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .filter((d) => d.length > 0)
    .map((d) => decodeURIComponent(d));
}

function citajUpit(upit: string): URLSearchParams {
  return new URLSearchParams(upit.startsWith("?") ? upit.slice(1) : upit);
}

/** Parametar bez praznine: `?ideja=` i `?ideja=%20` su isto što i bez njega. */
function parametar(p: URLSearchParams, kljuc: string): string | undefined {
  const v = p.get(kljuc)?.trim();
  return v ? v : undefined;
}

/**
 * Putanja ekrana (bez prefiksa projekta) + upit → ruta projekta. `null` za
 * ekran koji nije ruta radnog dela (Leadovi, spisak oblasti…).
 */
export function rutaIzEkrana(ekran: string, upit = ""): ProjektnaRuta | null {
  const d = delovi(ekran);
  const p = citajUpit(upit);
  if (d.length === 0) return { kind: "today" };
  const [prvi, drugi] = d;
  if (d.length === 1) {
    switch (prvi) {
      case "zadaci": {
        const osoba = parametar(p, "osoba");
        if (osoba) return { kind: "tasks", profileId: osoba as Id<"profiles"> };
        return p.get("filter") === "moji" ? { kind: "tasks", filter: "moji" } : { kind: "tasks" };
      }
      case "ideje": {
        const ideja = parametar(p, "ideja");
        return ideja ? { kind: "ideas", ideaId: ideja as Id<"ideaNodes"> } : { kind: "ideas" };
      }
      case "poruke": {
        const kanal = parametar(p, "kanal");
        return kanal
          ? { kind: "chat", channelId: kanal as Id<"chatChannels"> }
          : { kind: "chat" };
      }
      case "beleske":
        return { kind: "thoughts" };
      case "aktivnost":
        return { kind: "activity" };
      case "puls": {
        const nedelja = Number(p.get("nedelja"));
        return Number.isFinite(nedelja) && nedelja > 0
          ? { kind: "puls", weekStart: nedelja }
          : { kind: "puls" };
      }
      case "korpa": {
        const vrsta = p.get("vrsta");
        return isTrashSegment(vrsta) ? { kind: "trash", segment: vrsta } : { kind: "trash" };
      }
      case "settings": {
        const tab = p.get("tab");
        return isSettingsTab(tab) ? { kind: "settings", tab } : { kind: "settings" };
      }
      default:
        return null;
    }
  }
  if (d.length === 2 && prvi === "dokumenti") {
    const tab = p.get("tab");
    return isAreaTab(tab)
      ? { kind: "area", areaId: drugi as Id<"areas">, tab }
      : { kind: "area", areaId: drugi as Id<"areas"> };
  }
  if (d.length === 2 && prvi === "stranica") {
    return p.get("tab") === "mapa"
      ? { kind: "page", pageId: drugi as Id<"pages">, tab: "mapa" }
      : { kind: "page", pageId: drugi as Id<"pages"> };
  }
  return null;
}

/** Putanja nivoa „Ja“ + upit → ruta; `null` van „Ja“. */
export function rutaIzJa(putanja: string, upit = ""): JaRuta | null {
  const d = delovi(putanja);
  const p = citajUpit(upit);
  if (d.length === 0) return { kind: "me-today" };
  if (d.length !== 1) return null;
  switch (d[0]) {
    case "moji-zadaci":
      return { kind: "me-tasks" };
    case "inbox":
      return { kind: "me-inbox" };
    case "beleske":
      return { kind: "me-notes" };
    case "poruke": {
      const kanal = parametar(p, "kanal");
      return kanal
        ? { kind: "me-chat", channelId: kanal as Id<"chatChannels"> }
        : { kind: "me-chat" };
    }
    default:
      return null;
  }
}

// ── Pomoćne rute (port Devotion `workspace-route.ts`) ───────────────────────

/**
 * Razrešena ruta stranice ili oblasti zadržava traženu karticu (`tab=mapa`,
 * `tab=dokumenti`…): `areasV2.resolveRoute` vraća samo ID, a obaveštenja i
 * linkovi vode i na Mapu ili Dokumente.
 */
export function withPageTab(
  resolved: ProjektnaRuta | null,
  candidate: ProjektnaRuta,
): ProjektnaRuta | null {
  if (resolved?.kind === "area" && candidate.kind === "area" && candidate.tab) {
    return resolved.areaId === candidate.areaId ? { ...resolved, tab: candidate.tab } : resolved;
  }
  if (resolved?.kind !== "page" || candidate.kind !== "page" || !candidate.tab) return resolved;
  return resolved.pageId === candidate.pageId ? { ...resolved, tab: candidate.tab } : resolved;
}

/**
 * Ruta posle prelaska u drugi projekat (Devotion
 * `workspaceRouteAfterStartupSwitch`): ono što pripada starom projektu
 * (kanal, ideja, osoba, stranica) se ne prenosi.
 */
export function rutaPosleProjekta(trenutna: ProstorRuta): ProjektnaRuta {
  // Iz ličnog nivoa se u projekat ulazi kroz početnu.
  if (jeJaRuta(trenutna)) return { kind: "today" };
  // Kanali su po projektu: ostani u porukama, ali otpusti izabrani kanal.
  if (trenutna.kind === "chat") return { kind: "chat" };
  // Član drugog projekta nije član ovog: filter osobe se ne prenosi.
  if (trenutna.kind === "tasks") {
    return trenutna.filter === "moji" ? { kind: "tasks", filter: "moji" } : { kind: "tasks" };
  }
  // Ideja pripada projektu: u drugom projektu se otvara tabla, bez detalja.
  if (trenutna.kind === "ideas") return { kind: "ideas" };
  // Podešavanja ostaju na istoj kartici.
  if (trenutna.kind === "settings") return trenutna;
  return trenutna.kind === "thoughts" || trenutna.kind === "today" || trenutna.kind === "trash"
    ? trenutna
    : { kind: "today" };
}

/** Kuda posle arhiviranja stranice: roditelj, a bez njega njena oblast. */
export function pageArchiveFallbackRoute(page: {
  areaId: Id<"areas">;
  parentPageId: Id<"pages"> | null;
}): ProjektnaRuta {
  return page.parentPageId === null
    ? { kind: "area", areaId: page.areaId }
    : { kind: "page", pageId: page.parentPageId };
}

/**
 * „Nazad“ kroz hijerarhiju: jedan nivo naviše — roditeljska stranica ako je
 * stavka ugnežđena, inače koren njene oblasti. Ista putanja kao
 * `pageArchiveFallbackRoute`, ali pod svojim imenom, da izmena jedne
 * semantike ne povuče drugu.
 */
export function pageBackRoute(page: {
  areaId: Id<"areas">;
  parentPageId: Id<"pages"> | null;
}): ProjektnaRuta {
  return pageArchiveFallbackRoute(page);
}
