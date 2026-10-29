import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import { fold } from "@/lib/pretraga";
import { HOUR, WS, now, type Fixture, type R } from "./fixtures-util";
import { OBLASTI, PROFILI, fakeId } from "./fixtures-prostor-osnova";

/**
 * Pretraga u ⌘K u razvojnom prikazu (SPAJANJE S24, paritet redovi 6 i 30):
 * `search.pages`, `search.ideasAndThoughts` i `chat.searchMessages`.
 *
 * Mali korpus sa ID-jevima iz ostalih fikstura (stranica `pagesux0101`,
 * zadatak `pagesux0203`, ideja `ideaNodesux0002`, misao `thoughtNodesux0002`,
 * kanal Opšte `chatChannelsux0001`, DM sa Anom `chatChannelsux0021`), pa
 * klik na pogodak otvara pravi ekran. Pretraga je `includes` bez dijakritike
 * nad naslovom i tekstom; server radi pun tekst, ali grupe i adrese su iste.
 *
 * Probaj: `/enigma-it?ux=1`, Ctrl K, „plan“ ili „sajt“ (sve grupe, i Firme iz
 * Leadova), a u „Ja“ (`/?ux=1`) „ponud“ (lični razgovor). `&prazno=1` nema
 * pogodaka.
 */

type Stranica = R<typeof api.prostor.search.pages>[number];
type Cvorovi = R<typeof api.prostor.search.ideasAndThoughts>;
type Poruka = R<typeof api.prostor.chat.searchMessages>[number];

const [RAZVOJ, MARKETING, PRODAJA] = OBLASTI;
const [JA, ANA, MARKO] = PROFILI;

const sadrzi = (term: unknown, ...polja: Array<string | null>) => {
  const t = typeof term === "string" ? fold(term.trim()) : "";
  return t.length >= 2 && polja.some((p) => p !== null && fold(p).includes(t));
};

const projekat = { _id: WS, name: "Enigma IT", logoUrl: null };

function stranica(n: number, kind: "note" | "task", title: string, oblast: (typeof OBLASTI)[number]): Stranica {
  // Sažetak stranice nosi mnogo polja; pretraga palete čita samo ova.
  return {
    _id: fakeId("pages", n),
    kind,
    title,
    areaId: oblast._id,
    workspaceId: WS,
    workspace: projekat,
    area: oblast,
  } as unknown as Stranica;
}

const STRANICE: Stranica[] = [
  stranica(100, "note", "Lansiranje sajta", RAZVOJ),
  stranica(101, "note", "Endpointi za plaćanje", RAZVOJ),
  stranica(104, "note", "Kontrolna lista pre objave", RAZVOJ),
  stranica(110, "note", "Plan objava za novembar", MARKETING),
  stranica(111, "note", "Kampanja za otvaranje", MARKETING),
  stranica(120, "note", "Skripta za prvi poziv", PRODAJA),
  stranica(202, "task", "Plan objava za decembar", MARKETING),
  stranica(203, "task", "Pozovi pet firmi iz Novog Sada", PRODAJA),
  stranica(205, "task", "Pregledaj ugovor sa provajderom", RAZVOJ),
];

const cvor = <T extends "ideaNodes" | "thoughtNodes">(t: T, n: number, title: string | null, text: string) => ({
  _id: fakeId(t, n),
  title,
  text,
  workspaceId: WS,
});

const IDEJE = [
  cvor("ideaNodes", 1, "Nedeljni bilten za klijente", "Kratak pregled novih objava i rezultata svake nedelje."),
  cvor("ideaNodes", 2, "Paket „Sajt za 7 dana“ za male firme", "Fiksna cena, šablon sa tri strane i domen u ceni."),
  cvor("ideaNodes", 3, null, "Video studije slučaja za pekaru — plan snimanja u dva dana."),
];

const MISLI = [
  cvor("thoughtNodes", 1, "Cilj do kraja godine", "Pet novih klijenata iz Leadova."),
  cvor("thoughtNodes", 2, "Pozivi pekarama", "Zvati subotom pre podne, prvo firme bez sajta."),
  cvor("thoughtNodes", 3, "Paket za sajt", "Fiksna cena, rok od sedam dana i domen u ceni."),
];

const osoba = (p: (typeof PROFILI)[number]) => ({ _id: p._id, displayName: p.displayName, avatarUrl: p.avatarUrl });

function poruka(n: number, kanal: number, ime: string, body: string, autor: (typeof PROFILI)[number], pre: number): Poruka {
  return {
    _id: fakeId("chatMessages", n),
    channelId: fakeId("chatChannels", kanal),
    channelName: ime,
    body,
    createdAt: now - pre,
    author: osoba(autor),
  };
}

/** Poruke projekta „Enigma IT“. */
const PORUKE_PROJEKTA: Poruka[] = [
  poruka(901, 1, "Opšte", "Plan objava za novembar je gotov, bacite pogled do petka.", ANA, 3 * HOUR),
  poruka(902, 1, "Opšte", "Sajt za pekaru ide uživo u ponedeljak.", MARKO, 26 * HOUR),
  poruka(903, 6, "Endpointi za plaćanje", "Webhook naplate i dalje vraća 500 na stagingu.", MARKO, 5 * HOUR),
];

/** Lični razgovori (DM sa Anom, lična grupa). */
const PORUKE_LICNE: Poruka[] = [
  poruka(911, 21, "Ana Marković", "Poslala sam ponudu za sajt, javi kad pogledaš.", ANA, 2 * HOUR),
  poruka(912, 23, "Planiranje", "Plan za vikend: radionica u Novom Sadu.", JA, 30 * HOUR),
];

const pages: Fixture = (a) =>
  STRANICE.filter((s) => (a.workspaceId === undefined || a.workspaceId === WS) && sadrzi(a.query, s.title));

const ideasAndThoughts: Fixture = (a): Cvorovi =>
  a.workspaceId === WS
    ? {
        ideas: IDEJE.filter((c) => sadrzi(a.query, c.title, c.text)),
        thoughts: MISLI.filter((c) => sadrzi(a.query, c.title, c.text)),
      }
    : { ideas: [], thoughts: [] };

const searchMessages: Fixture = (a) => {
  const izvor = a.workspaceId === null ? PORUKE_LICNE : a.workspaceId === WS ? PORUKE_PROJEKTA : [];
  return izvor.filter((m) => sadrzi(a.term, m.body));
};

export const FIXTURES_PROSTOR_PRETRAGA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.search.pages)]: pages,
  [getFunctionName(api.prostor.search.ideasAndThoughts)]: ideasAndThoughts,
  [getFunctionName(api.prostor.chat.searchMessages)]: searchMessages,
};

export const PRAZNO_PROSTOR_PRETRAGA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.search.pages)]: () => [],
  [getFunctionName(api.prostor.search.ideasAndThoughts)]: () => ({ ideas: [], thoughts: [] }),
  [getFunctionName(api.prostor.chat.searchMessages)]: () => [],
};
