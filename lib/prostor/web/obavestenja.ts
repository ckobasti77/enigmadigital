/**
 * ============================================================================
 * KUDA VODI OBAVEŠTENJE (SPAJANJE S17, plan S07 D13 i §10 S17) — ČISTO
 * ============================================================================
 *
 * Jedan put od obaveštenja do adrese, za tri ulaza:
 *  - klik na red Inboxa, u zvonu i u toastu (`rutaObavestenja` + projekat);
 *  - link iz push poruke: servis radnik (`public/sw.js`) zna ID projekta, a ne
 *    njegovu adresu, pa pravi `/otvori?projekat=…&vrsta=…&cilj=…`
 *    (`adresaOtvori`), a strana `/otvori` je čita (`citajOtvori`) i razrešava
 *    slug iz mojih projekata (`adresaObavestenja`).
 *
 * Cilj po vrsti daje `notificationDestination` iz backenda (jedan izvor istine,
 * deli ga i Expo). `sw.js` je statički fajl i ne može da uveze ovaj modul, pa
 * ga preslikava; `obavestenja.test.ts` proverava da se oba slažu.
 */
import {
  notificationDestination,
  type NotificationDestination,
} from "../../../convex/prostor/lib/notificationTarget";
import type { Id } from "../../../convex/_generated/dataModel";
import { hrefUProjektu, jaHref, type JaRuta, type ProjektnaRuta } from "../rute";

/** Ono što se čita iz obaveštenja (feed, „Čeka tebe“, push). */
export type CiljObavestenja = {
  /** `null` = lično obaveštenje (poruka iz ličnog razgovora). */
  workspaceId: string | null;
  targetType: string;
  targetId: string | null;
};

/**
 * Ruta projekta za destinaciju obaveštenja (mapa vrsta iz plana S07 §10 S17):
 * stranica → `stranica`, poruka → `poruke?kanal=`, ideja → `ideje?ideja=`,
 * oblast → `dokumenti/<id>` na Pregledu (tamo su opis i komentari), puls →
 * `puls?nedelja=`, odobrenja (ugašena) → Korpa, ostalo → početna.
 */
export function rutaObavestenja(cilj: NotificationDestination): ProjektnaRuta {
  switch (cilj.screen) {
    case "page":
      return cilj.entityId
        ? { kind: "page", pageId: cilj.entityId as Id<"pages"> }
        : { kind: "today" };
    case "chat":
      return cilj.entityId
        ? { kind: "chat", channelId: cilj.entityId as Id<"chatChannels"> }
        : { kind: "chat" };
    case "ideas":
      return cilj.entityId
        ? { kind: "ideas", ideaId: cilj.entityId as Id<"ideaNodes"> }
        : { kind: "ideas" };
    case "area":
      return cilj.entityId
        ? { kind: "area", areaId: cilj.entityId as Id<"areas">, tab: "pregled" }
        : { kind: "today" };
    case "puls":
      return cilj.weekStart !== null ? { kind: "puls", weekStart: cilj.weekStart } : { kind: "puls" };
    case "approvals":
      // Odobrenja više ne postoje: stari cilj vodi u Korpu (kao Devotion).
      return { kind: "trash" };
    case "today":
      return { kind: "today" };
  }
}

/**
 * Gde vodi obaveštenje: ruta projekta (sa ID-jem projekta), lična ruta (poruka
 * iz ličnog razgovora) ili ništa (lično obaveštenje druge vrste: označi
 * pročitano i ostani).
 */
export type OdredisteObavestenja =
  | { kind: "projekat"; workspaceId: Id<"workspaces">; ruta: ProjektnaRuta }
  | { kind: "ja"; ruta: JaRuta }
  | { kind: "nista" };

export function odredisteObavestenja(cilj: CiljObavestenja): OdredisteObavestenja {
  if (cilj.workspaceId === null) {
    if (cilj.targetType !== "chat") return { kind: "nista" };
    return {
      kind: "ja",
      ruta: cilj.targetId
        ? { kind: "me-chat", channelId: cilj.targetId as Id<"chatChannels"> }
        : { kind: "me-chat" },
    };
  }
  return {
    kind: "projekat",
    workspaceId: cilj.workspaceId as Id<"workspaces">,
    ruta: rutaObavestenja(
      notificationDestination(cilj.targetType, cilj.targetId, cilj.workspaceId),
    ),
  };
}

/**
 * Pun href obaveštenja. `slugZa` vraća adresu MOG projekta po ID-ju (iz
 * `projekti.mojiProjekti`); projekat koji nije moj daje `null` — pozivalac
 * tada ide na Danas, bez otkrivanja da li projekat postoji.
 */
export function adresaObavestenja(
  cilj: CiljObavestenja,
  slugZa: (workspaceId: string) => string | null | undefined,
): string | null {
  const odrediste = odredisteObavestenja(cilj);
  if (odrediste.kind === "nista") return null;
  if (odrediste.kind === "ja") return jaHref(odrediste.ruta);
  const slug = slugZa(odrediste.workspaceId);
  return slug ? hrefUProjektu(slug, odrediste.ruta) : null;
}

// ── /otvori ─────────────────────────────────────────────────────────────────

export const PUTANJA_OTVORI = "/otvori";

/**
 * Adresa iz push poruke (plan S07 D13): `/otvori?projekat=<id>&vrsta=<tip>&cilj=<id>`.
 * Lično obaveštenje nema `projekat`. Prazne vrednosti se ne pišu. `sw.js`
 * pravi istu adresu (proverava test).
 */
export function adresaOtvori(cilj: Partial<CiljObavestenja>): string {
  const upit = new URLSearchParams();
  if (cilj.workspaceId) upit.set("projekat", cilj.workspaceId);
  if (cilj.targetType) upit.set("vrsta", cilj.targetType);
  if (cilj.targetId) upit.set("cilj", cilj.targetId);
  const tekst = upit.toString();
  return tekst ? `${PUTANJA_OTVORI}?${tekst}` : PUTANJA_OTVORI;
}

/** Čita upit strane `/otvori`. Bez vrste je cilj početna (projekta ili Danas). */
export function citajOtvori(upit: URLSearchParams): CiljObavestenja {
  const procitaj = (kljuc: string) => {
    const vrednost = upit.get(kljuc)?.trim();
    return vrednost ? vrednost : null;
  };
  return {
    workspaceId: procitaj("projekat"),
    targetType: procitaj("vrsta") ?? "today",
    targetId: procitaj("cilj"),
  };
}

/**
 * Konačna adresa strane `/otvori`: tačan cilj kad je projekat moj (ili kad je
 * lična poruka), Inbox za lično obaveštenje bez odredišta, a Danas kad
 * projekat nije moj ili ga nema.
 */
export function adresaZaOtvori(
  upit: URLSearchParams,
  slugZa: (workspaceId: string) => string | null | undefined,
): string {
  const cilj = citajOtvori(upit);
  const adresa = adresaObavestenja(cilj, slugZa);
  if (adresa !== null) return adresa;
  return cilj.workspaceId === null ? jaHref({ kind: "me-inbox" }) : jaHref({ kind: "me-today" });
}
