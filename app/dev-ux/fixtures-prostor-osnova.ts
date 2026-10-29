import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id, TableNames } from "@/convex/_generated/dataModel";
import {
  DAY,
  HOUR,
  USER,
  WS,
  WS_KLIJENT,
  WS_SCANME,
  now,
  type Fixture,
  type R,
} from "./fixtures-util";

/**
 * Osnova razvojnog prikaza radnog dela (`prostor`): ono što ljuska traži pre
 * bilo kog ekrana. Pokriva ID-jeve i stranice (`fakeId`, `strana`), profil
 * prijavljenog korisnika, šestoro lažnih članova tima, četiri podrazumevane
 * oblasti projekta i upite `profiles.getCurrent`, `projekat.listMembers`,
 * `projekat.listForCurrent`, `inbox.unreadCounts`, `chat.unreadSummary` i
 * osnovu za `myDay.overview`.
 *
 * Ovo je osnova za `fixtures-prostor-*.ts` kasnijih koraka (S09 i dalje):
 * oni uvoze `fakeId`, `strana`, `PROFIL_JA`, `PROFILI` i `OBLASTI` odavde i
 * dodaju svoje upite. Sadržaj (imena, naslovi, raspored) potiče iz Devotion
 * fiksture izloga (main @ c05c40f), prilagođen Enigmi: „startup“ je
 * „projekat“, sat je relativni `now`, ID-jevi idu kroz `fakeId`, a imena su
 * očigledno lažna.
 *
 * Svaka vrednost je tipizirana preko povratnog tipa prave Convex funkcije
 * (`satisfies R<…>`), pa `tsc` obara fikturu čim se ugovor backenda promeni.
 */

// ── ID-jevi i stranice ───────────────────────────────────────────────────────

/**
 * Stabilan lažni Convex ID za fikture razvojnog prikaza (nikad ne ide na
 * server). Samo mala slova, velika slova i cifre, bez donje crte: isto kao
 * pravi ID, pa ga propušta i provera oblika ID-ja u `page.tsx` dinamičkih ruta.
 * Primer: `fakeId("areas", 1)` → `areasux0001`.
 */
export function fakeId<T extends TableNames>(table: T, n: number): Id<T> {
  return `${table}ux${String(n).padStart(4, "0")}` as Id<T>;
}

/** Jedna i jedina strana paginiranog upita (`usePaginatedQuery` je tada gotov). */
export function strana<T>(items: T[]): { page: T[]; isDone: true; continueCursor: string } {
  return { page: items, isDone: true, continueCursor: "kraj" };
}

// ── Vreme ────────────────────────────────────────────────────────────────────

/** Lokalno podne dana `pomeraj` dana od danas (kanonska vrednost roka zadatka). */
function podne(pomeraj: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + pomeraj);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function pocetakDana(): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function kljucDana(ms: number): string {
  const d = new Date(ms);
  const mesec = String(d.getMonth() + 1).padStart(2, "0");
  const dan = String(d.getDate()).padStart(2, "0");
  return `${String(d.getFullYear()).padStart(4, "0")}-${mesec}-${dan}`;
}

// ── Profili ──────────────────────────────────────────────────────────────────

type Profil = NonNullable<R<typeof api.prostor.profiles.getCurrent>>;

/** Mali SVG u `data:` adresi: avatar bez mreže (ostali profili nemaju sliku). */
function avatarSlika(slovo: string, boja: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
    `<rect width="64" height="64" fill="${boja}"/>` +
    `<text x="32" y="42" font-size="28" text-anchor="middle" fill="#ffffff" font-family="sans-serif">${slovo}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function profil(
  n: number,
  userId: Id<"users">,
  displayName: string,
  email: string,
  avatarUrl: string | null,
): Profil {
  const nastao = now - (120 - n * 7) * DAY;
  return {
    _id: fakeId("profiles", n),
    _creationTime: nastao,
    userId,
    displayName,
    email,
    // Radni deo ne čita globalnu ulogu: uvek `member` (uloge daje članstvo).
    role: "member",
    archivedAt: null,
    createdAt: nastao,
    updatedAt: nastao,
    avatarUrl,
  };
}

/** Profil prijavljenog korisnika (`userId` je isti kao u ostatku prikaza). */
export const PROFIL_JA: Profil = profil(1, USER, "Test Korisnik", "test.korisnik@primer.test", null);

/**
 * Šestoro lažnih članova tima; prvi je `PROFIL_JA`, pa je ovo i spisak članova
 * projekta „Enigma IT“. Ostali kasniji koraci (zadaci, poruke) uzimaju ljude
 * odavde. Troje ima sliku, troje ne.
 */
export const PROFILI: Profil[] = [
  PROFIL_JA,
  profil(2, fakeId("users", 2), "Ana Test", "ana@primer.test", avatarSlika("A", "#0e7490")),
  profil(3, fakeId("users", 3), "Marko Proba", "marko@primer.test", null),
  profil(4, fakeId("users", 4), "Milica Primer", "milica@primer.test", avatarSlika("M", "#7c3aed")),
  profil(5, fakeId("users", 5), "Nikola Uzorak", "nikola@primer.test", null),
  profil(6, fakeId("users", 6), "Stefan Demo", "stefan@primer.test", avatarSlika("S", "#b45309")),
];

// ── Oblasti ──────────────────────────────────────────────────────────────────

type Projekat = R<typeof api.prostor.projekat.listForCurrent>["page"][number];
type Oblast = Projekat["areas"][number];

/** Četiri podrazumevane oblasti projekta (isti ključevi i redosled kao backend). */
function napraviOblasti(workspaceId: Id<"workspaces">, prvi: number): Oblast[] {
  const nastao = now - 90 * DAY;
  return [
    { key: "dev", label: "Razvoj" },
    { key: "marketing", label: "Marketing" },
    { key: "sales", label: "Prodaja" },
    { key: "other", label: "Ostalo" },
  ].map((oblast, position) => ({
    _id: fakeId("areas", prvi + position),
    _creationTime: nastao,
    workspaceId,
    key: oblast.key,
    label: oblast.label,
    position,
    createdAt: nastao,
  }));
}

/** Oblasti projekta „Enigma IT“ (`WS`). */
export const OBLASTI: Oblast[] = napraviOblasti(WS, 1);
const OBLASTI_SCANME: Oblast[] = napraviOblasti(WS_SCANME, 11);
const OBLASTI_KLIJENT: Oblast[] = napraviOblasti(WS_KLIJENT, 21);

/**
 * Prva oblast („Razvoj“) za razvojne rute:
 * `/enigma-it/dokumenti/<OBLAST_UX>?ux=1`.
 */
export const OBLAST_UX = OBLASTI[0]._id;

// ── Projekti ─────────────────────────────────────────────────────────────────

const PROJEKTI: Projekat[] = [
  {
    _id: WS,
    name: "Enigma IT",
    description: "Interni projekat: razvoj, marketing i prodaja.",
    logoUrl: null,
    areas: OBLASTI,
    uloga: "owner",
    isManager: true,
  },
  {
    _id: WS_SCANME,
    name: "ScanMe",
    description: "QR meniji za restorane i kafiće.",
    logoUrl: null,
    areas: OBLASTI_SCANME,
    uloga: "owner",
    isManager: true,
  },
  {
    _id: WS_KLIJENT,
    name: "Klijent d.o.o.",
    description: "Projekat klijenta: sajt i analitika.",
    logoUrl: null,
    areas: OBLASTI_KLIJENT,
    uloga: "owner",
    isManager: true,
  },
];

type Mini = { _id: Id<"workspaces">; name: string; logoUrl: string | null };
const MINI: Record<string, Mini> = Object.fromEntries(
  PROJEKTI.map((p) => [p._id, { _id: p._id, name: p.name, logoUrl: p.logoUrl }]),
);
const mini = (id: Id<"workspaces">): Mini => MINI[id];

// ── Članovi projekta ─────────────────────────────────────────────────────────

type Clanovi = R<typeof api.prostor.projekat.listMembers>;

function clanovi(profili: Profil[], limit: unknown): Clanovi {
  const granica = typeof limit === "number" && limit >= 1 ? limit : 25;
  return profili.slice(0, granica).map((p, i) => ({
    membershipId: fakeId("members", i + 1),
    profile: p,
  }));
}

/**
 * „Enigma IT“ ima celu šesticu. Svaki drugi projekat koji nije na spisku
 * praznih (izmišljeni projekti huba) ima mene i Anu. ScanMe i „Klijent d.o.o.“
 * kreću prazni (`PRAZNO_PROSTOR_OSNOVA`): samo ja.
 */
function clanoviZa(args: Record<string, unknown>): Clanovi {
  if (args.workspaceId === WS || args.workspaceId === undefined) {
    return clanovi(PROFILI, args.limit);
  }
  return clanovi(PROFILI.slice(0, 2), args.limit);
}

// ── Nepročitano ──────────────────────────────────────────────────────────────

type NeprocitanoInbox = R<typeof api.prostor.inbox.unreadCounts>;
type NeprocitanoChat = R<typeof api.prostor.chat.unreadSummary>;

const brojac = (count: number) => ({ count, capped: false });

/** Dvanaest nepročitanih u Inboxu: šest u „Enigma IT“, tri u „ScanMe“, tri lična. */
const INBOX_NEPROCITANO = {
  total: brojac(12),
  byStartup: [
    { workspaceId: WS, count: 6, capped: false },
    { workspaceId: WS_SCANME, count: 3, capped: false },
  ],
  personal: brojac(3),
} satisfies NeprocitanoInbox;

const INBOX_BEZ_NEPROCITANOG = {
  total: brojac(0),
  byStartup: [],
  personal: brojac(0),
} satisfies NeprocitanoInbox;

/** Četiri nepročitane poruke: tri lične (jedno pominjanje) i jedna u „Enigma IT“. */
const CHAT_NEPROCITANO = {
  total: { unreadCount: 4, mentionCount: 1 },
  byStartup: [{ workspaceId: WS, unreadCount: 1, mentionCount: 0 }],
  personal: { unreadCount: 3, mentionCount: 1 },
} satisfies NeprocitanoChat;

const CHAT_BEZ_NEPROCITANOG = {
  total: { unreadCount: 0, mentionCount: 0 },
  byStartup: [],
  personal: { unreadCount: 0, mentionCount: 0 },
} satisfies NeprocitanoChat;

// ── Moj dan (osnova; S19 proširuje) ──────────────────────────────────────────

type Dan = R<typeof api.prostor.myDay.overview>;
type Zadatak = Dan["tasks"][number];

const SVI_PROJEKTI_MINI = PROJEKTI.map((p) => mini(p._id));

function zadatak(
  n: number,
  workspaceId: Id<"workspaces">,
  oblast: Oblast,
  naslov: string,
  delimicno: Partial<Zadatak> = {},
): Zadatak {
  const nastao = now - (10 + n) * DAY;
  return {
    _id: fakeId("pages", n),
    title: naslov,
    taskStatus: "next",
    taskPriority: "medium",
    dueDate: null,
    taskSortAt: nastao,
    completedAt: null,
    checkpointTotal: 0,
    checkpointCompleted: 0,
    createdByProfileId: PROFIL_JA._id,
    isCreator: true,
    isAssignee: true,
    createdAt: nastao,
    updatedAt: now - n * HOUR,
    workspace: mini(workspaceId),
    area: { _id: oblast._id, key: oblast.key, label: oblast.label },
    ...delimicno,
  };
}

/**
 * Najmanji ne-prazan dan: jedan zadatak kasni, jedan ističe danas, jedan je
 * završen jutros, uz jedan lični zadatak koji je planiran za danas. Rokovi i
 * dan plana prate `now` (i `dayKey` iz upita, kad ga klijent pošalje).
 */
function danZa(args: Record<string, unknown>): Dan {
  const dayKey = typeof args.dayKey === "string" ? args.dayKey : kljucDana(now);
  const doneSince = typeof args.doneSince === "number" ? args.doneSince : pocetakDana();

  const staging = zadatak(1, WS, OBLASTI[0], "Popravi prijavu na staging serveru", {
    taskStatus: "in_progress",
    taskPriority: "high",
    dueDate: podne(-2),
    checkpointTotal: 3,
    checkpointCompleted: 1,
  });
  const landing = zadatak(2, WS_SCANME, OBLASTI_SCANME[1], "Landing za QR menije", {
    taskPriority: "urgent",
    dueDate: podne(0),
    isCreator: false,
  });
  const faktura = zadatak(3, WS_SCANME, OBLASTI_SCANME[3], "Faktura za hosting", {
    taskStatus: "done",
    dueDate: podne(0),
    completedAt: Math.max(doneSince, now - 2 * HOUR),
  });

  const budzet = {
    _id: fakeId("personalTasks", 1),
    title: "Pregledati Q4 budžet",
    notes: null,
    status: "open",
    priority: "high",
    dueDate: null,
    sortAt: now - 5 * DAY,
    completedAt: null,
    createdAt: now - 5 * DAY,
    updatedAt: now - 5 * DAY,
  } satisfies Dan["personal"][number];

  return {
    dayKey,
    tasks: [staging, landing, faktura],
    personal: [budzet],
    entries: [
      {
        _id: fakeId("myDayEntries", 1),
        dayKey,
        refKind: "personal",
        refKey: `personal:${budzet._id}`,
        taskPageId: null,
        personalTaskId: budzet._id,
        position: 1024,
        createdAt: now - HOUR,
      },
    ],
    history: [],
    workspaces: SVI_PROJEKTI_MINI,
    capped: { tasks: false, personal: false, history: false },
  };
}

function praznDan(args: Record<string, unknown>): Dan {
  return {
    dayKey: typeof args.dayKey === "string" ? args.dayKey : kljucDana(now),
    tasks: [],
    personal: [],
    entries: [],
    history: [],
    workspaces: SVI_PROJEKTI_MINI,
    capped: { tasks: false, personal: false, history: false },
  };
}

// ── Fikture ──────────────────────────────────────────────────────────────────

export const FIXTURES_PROSTOR_OSNOVA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.profiles.getCurrent)]: () => PROFIL_JA,
  [getFunctionName(api.prostor.projekat.listMembers)]: (args) => clanoviZa(args),
  [getFunctionName(api.prostor.projekat.listForCurrent)]: () => strana(PROJEKTI),
  [getFunctionName(api.prostor.inbox.unreadCounts)]: () => INBOX_NEPROCITANO,
  [getFunctionName(api.prostor.chat.unreadSummary)]: () => CHAT_NEPROCITANO,
  [getFunctionName(api.prostor.myDay.overview)]: (args) => danZa(args),
};

/**
 * Prazan nalog (`&prazno=1`) i projekti bez sadržaja (ScanMe, „Klijent
 * d.o.o.“). Profil i spisak projekata ostaju (kao `mojiProjekti`): prazno je
 * stanje sadržaja, ne nalog bez projekata. Članovi su samo ja, ostalo je nula.
 */
export const PRAZNO_PROSTOR_OSNOVA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.profiles.getCurrent)]: () => PROFIL_JA,
  [getFunctionName(api.prostor.projekat.listMembers)]: (args) =>
    clanovi([PROFIL_JA], args.limit),
  [getFunctionName(api.prostor.projekat.listForCurrent)]: () => strana(PROJEKTI),
  [getFunctionName(api.prostor.inbox.unreadCounts)]: () => INBOX_BEZ_NEPROCITANOG,
  [getFunctionName(api.prostor.chat.unreadSummary)]: () => CHAT_BEZ_NEPROCITANOG,
  [getFunctionName(api.prostor.myDay.overview)]: (args) => praznDan(args),
};
