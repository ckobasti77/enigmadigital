import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DAY, HOUR, WS, WS_KLIJENT, WS_SCANME, now, type Fixture, type R } from "./fixtures-util";
import { OBLAST_UX, PROFILI, PROFIL_JA, PROJEKTI, fakeId } from "./fixtures-prostor-osnova";
import { STRANICA_UX } from "./fixtures-prostor-dokumenti";
import { ZADATAK_UX } from "./fixtures-prostor-zadaci";

/**
 * Inbox radnog dela u razvojnom prikazu (SPAJANJE S17): feed (`inbox.feed`),
 * nepročitano (`inbox.unreadCounts`), „Čeka tebe“ (`inbox.pending`),
 * označavanje (`notifications.markRead`, `inbox.markAllRead`) i podešavanja
 * obaveštenja (`notificationSettings.get/update`,
 * `pushSubscriptions.myDeviceCount`).
 *
 * Sadržaj prati Devotion izlog (`app/izlog/fixtures/inbox.ts`, main @
 * c05c40f): obaveštenja iz tri projekta i lične poruke, grupe Danas · Juče ·
 * Ranije. Imena su lažna (`PROFILI`), sat je relativni `now`, a ciljevi
 * „Enigma IT“ su pravi ID-jevi drugih fiktura (stranica, zadatak, kanal,
 * ideja, oblast), pa klik vodi na ekran koji postoji.
 *
 * Stanje živi u modulu: označavanje menja feed i brojače (bedž „Ja“, zvono,
 * meni „Ja“), kao posle odgovora servera. Početni brojevi su isti kao u
 * osnovi: 12 nepročitanih (šest u „Enigma IT“, tri u „ScanMe“, tri lična).
 */

type Feed = R<typeof api.prostor.inbox.feed>;
type Stavka = Feed["page"][number];
type Pending = R<typeof api.prostor.inbox.pending>;
type Podesavanja = R<typeof api.prostor.notificationSettings.get>;

const [, ANA, MARKO, MILICA, NIKOLA, STEFAN] = PROFILI;

const mini = (id: Id<"workspaces">) => {
  const p = PROJEKTI.find((x) => x._id === id);
  return p ? { _id: p._id, name: p.name, logoUrl: p.logoUrl } : null;
};

const autor = (p: (typeof PROFILI)[number]) => ({
  _id: p._id,
  displayName: p.displayName,
  avatarUrl: p.avatarUrl,
});

let brojac = 0;
function stavka(
  workspaceId: Id<"workspaces"> | null,
  type: Stavka["type"],
  title: string,
  satiRanije: number,
  deo: Partial<Stavka> & { procitano?: boolean } = {},
): Stavka {
  brojac += 1;
  const { procitano, ...ostalo } = deo;
  const createdAt = now - satiRanije * HOUR;
  return {
    _id: fakeId("notifications", brojac),
    _creationTime: createdAt,
    recipientProfileId: PROFIL_JA._id,
    workspaceId,
    type,
    title,
    targetType: workspaceId === null ? "chat" : "page",
    targetId: null,
    actorProfileId: null,
    dedupeKey: null,
    readAt: procitano ? createdAt + HOUR / 2 : null,
    createdAt,
    actor: null,
    workspace: workspaceId === null ? null : mini(workspaceId),
    ...ostalo,
  };
}

function pocetak(): Stavka[] {
  brojac = 0;
  return [
    // Danas
    stavka(WS, "task_assigned", "Milica Primer ti je dodelila „Poveži webhook naplate sa porudžbinama“", 0.3, {
      actor: autor(MILICA),
      actorProfileId: MILICA._id,
      targetType: "page",
      targetId: ZADATAK_UX,
    }),
    stavka(null, "chat_dm", "Ana Test", 0.8, {
      actor: autor(ANA),
      actorProfileId: ANA._id,
      body: "Možeš li da pogledaš ponudu pre podne?",
      targetType: "chat",
      targetId: fakeId("chatChannels", 21),
    }),
    stavka(WS, "comment_mention", "Marko Proba te je pomenuo u komentaru na „Endpointi za plaćanje“", 1.2, {
      actor: autor(MARKO),
      actorProfileId: MARKO._id,
      body: "@Jovan da li potpis proveravamo pre ili posle upisa?",
      targetType: "page",
      targetId: STRANICA_UX,
    }),
    stavka(WS_SCANME, "task_due_today", "Rok je danas: Landing za QR menije", 1.5, {
      targetType: "page",
      targetId: fakeId("pages", 2),
    }),
    stavka(WS, "chat_mention", "Nikola Uzorak te je pomenuo u #opšte", 2, {
      actor: autor(NIKOLA),
      actorProfileId: NIKOLA._id,
      body: "@Jovan trebaju mi termini za novembar",
      targetType: "chat",
      targetId: fakeId("chatChannels", 1),
    }),
    stavka(null, "chat_message", "Dizajn tim", 2.5, {
      actor: autor(STEFAN),
      actorProfileId: STEFAN._id,
      body: "Poslao sam nove ikonice za meni.",
      targetType: "chat",
      targetId: fakeId("chatChannels", 23),
    }),
    stavka(WS, "task_status_changed", "„Plan objava za decembar“ je završen", 3, {
      targetType: "page",
      targetId: fakeId("pages", 202),
      procitano: true,
    }),
    // Juče
    stavka(WS, "task_overdue", "Kasni: Popravi prijavu na staging serveru", 16, {
      targetType: "page",
      targetId: fakeId("pages", 201),
    }),
    stavka(WS, "idea_voted", "Nova ocena za ideju „Paket „Sajt za 7 dana“ za male firme“", 19, {
      actor: autor(ANA),
      actorProfileId: ANA._id,
      targetType: "ideas",
      targetId: fakeId("ideaNodes", 2),
    }),
    stavka(WS_SCANME, "comment_added", "Novi komentar na „Faktura za hosting“", 21, {
      actor: autor(MILICA),
      actorProfileId: MILICA._id,
      body: "Dodala sam PDF iz prošlog meseca.",
      targetType: "page",
      targetId: fakeId("pages", 3),
    }),
    stavka(null, "chat_dm", "Marko Proba", 22, {
      actor: autor(MARKO),
      actorProfileId: MARKO._id,
      body: "Šaljem ti pristupne podatke za staging.",
      targetType: "chat",
      targetId: fakeId("chatChannels", 22),
    }),
    stavka(WS, "comment_added", "Novi komentar na opis oblasti Razvoj", 23, {
      actor: autor(NIKOLA),
      actorProfileId: NIKOLA._id,
      targetType: "area",
      targetId: OBLAST_UX,
    }),
    // Ranije
    stavka(WS_SCANME, "task_assigned", "Ana Test ti je dodelila „Meni za letnju baštu“", 2 * 24 + 3, {
      actor: autor(ANA),
      actorProfileId: ANA._id,
      targetType: "page",
      targetId: fakeId("pages", 4),
    }),
    stavka(WS, "puls_ready", "Puls nedelje je spreman", 3 * 24, {
      targetType: "puls",
      targetId: String(now - 7 * DAY),
      procitano: true,
    }),
    stavka(WS_KLIJENT, "task_due_soon", "Rok sutra: Izveštaj kanala za oktobar", 4 * 24, {
      targetType: "page",
      targetId: fakeId("pages", 5),
      procitano: true,
    }),
    stavka(WS, "task_assigned", "Stefan Demo ti je dodelio „Pozovi pet firmi iz Novog Sada“", 5 * 24, {
      actor: autor(STEFAN),
      actorProfileId: STEFAN._id,
      targetType: "page",
      targetId: fakeId("pages", 203),
      procitano: true,
    }),
  ];
}

let stavke = pocetak();
let podesavanja: Podesavanja = { mutedTypes: ["chat_message"], quietHoursStart: 22 * 60, quietHoursEnd: 8 * 60 };

const ukljucena = (s: Stavka, args: Record<string, unknown>) =>
  (args.workspaceId === undefined || s.workspaceId === args.workspaceId) &&
  (args.unreadOnly !== true || s.readAt === null);

function feed(args: Record<string, unknown>): Feed {
  const opcije = (args.paginationOpts ?? {}) as { numItems?: number; cursor?: string | null };
  if (opcije.cursor === "kraj") return { page: [], isDone: true, continueCursor: "kraj" };
  const broj = typeof opcije.numItems === "number" ? opcije.numItems : 25;
  const sve = stavke.filter((s) => ukljucena(s, args)).sort((a, b) => b.createdAt - a.createdAt);
  return { page: sve.slice(0, broj), isDone: sve.length <= broj, continueCursor: "kraj" };
}

function neprocitano(): R<typeof api.prostor.inbox.unreadCounts> {
  const nove = stavke.filter((s) => s.readAt === null);
  const poProjektu = new Map<Id<"workspaces">, number>();
  for (const s of nove) {
    if (s.workspaceId !== null) poProjektu.set(s.workspaceId, (poProjektu.get(s.workspaceId) ?? 0) + 1);
  }
  return {
    total: { count: nove.length, capped: false },
    byStartup: [...poProjektu].map(([workspaceId, count]) => ({ workspaceId, count, capped: false })),
    personal: { count: nove.filter((s) => s.workspaceId === null).length, capped: false },
  };
}

const enigma = mini(WS)!;
const scanme = mini(WS_SCANME)!;

const PENDING: Pending = {
  items: [
    {
      kind: "idea_vote",
      ideaId: fakeId("ideaNodes", 2),
      title: "Paket „Sajt za 7 dana“ za male firme",
      authorName: MILICA.displayName,
      upvotes: 3,
      downvotes: 1,
      workspace: enigma,
      createdAt: now - 4 * HOUR,
      targetType: "ideas",
      targetId: fakeId("ideaNodes", 2),
    },
    {
      kind: "idea_vote",
      ideaId: fakeId("ideaNodes", 6),
      title: "Automatski odgovor na DM sa cenovnikom",
      authorName: NIKOLA.displayName,
      upvotes: 2,
      downvotes: 2,
      workspace: enigma,
      createdAt: now - 26 * HOUR,
      targetType: "ideas",
      targetId: fakeId("ideaNodes", 6),
    },
    {
      kind: "idea_vote",
      ideaId: fakeId("ideaNodes", 902),
      title: "Popust za stalne goste petkom",
      authorName: ANA.displayName,
      upvotes: 1,
      downvotes: 0,
      workspace: scanme,
      createdAt: now - 30 * HOUR,
      targetType: "ideas",
      targetId: fakeId("ideaNodes", 902),
    },
  ],
  truncated: false,
};

export const FIXTURES_PROSTOR_INBOX: Record<string, Fixture> = {
  [getFunctionName(api.prostor.inbox.feed)]: (args) => feed(args),
  [getFunctionName(api.prostor.inbox.unreadCounts)]: () => neprocitano(),
  [getFunctionName(api.prostor.inbox.pending)]: (args) =>
    (args.include as string[] | undefined)?.includes("idea_vote") ? PENDING : { items: [], truncated: false },
  [getFunctionName(api.prostor.notifications.markRead)]: (args) => {
    stavke = stavke.map((s) => (s._id === args.notificationId && s.readAt === null ? { ...s, readAt: Date.now() } : s));
    return null;
  },
  [getFunctionName(api.prostor.inbox.markAllRead)]: (args) => {
    // `workspaceId: null` = samo lično; bez polja = sve.
    const cilj = (s: Stavka) => s.readAt === null && (args.workspaceId === undefined || s.workspaceId === args.workspaceId);
    const marked = stavke.filter(cilj).length;
    stavke = stavke.map((s) => (cilj(s) ? { ...s, readAt: Date.now() } : s));
    return { marked, hasMore: false };
  },
  [getFunctionName(api.prostor.notificationSettings.get)]: () => podesavanja,
  [getFunctionName(api.prostor.notificationSettings.update)]: (args) => {
    podesavanja = args as Podesavanja;
    return null;
  },
  [getFunctionName(api.prostor.pushSubscriptions.myDeviceCount)]: () => 1,
};

/**
 * Prazan nalog (`&prazno=1`): Inbox bez obaveštenja i bez odluka. Brojače
 * (nula) daje osnova. Upit filtriran na ScanMe ili „Klijent d.o.o.“ ide ovuda
 * i kad nalog nije prazan (`resolveFixture` tu granu deli), a Inbox je lični,
 * pa tada vraća stavke tog projekta.
 */
export const PRAZNO_PROSTOR_INBOX: Record<string, Fixture> = {
  [getFunctionName(api.prostor.inbox.feed)]: (args) =>
    args.workspaceId === WS_SCANME || args.workspaceId === WS_KLIJENT
      ? feed(args)
      : ({ page: [], isDone: true, continueCursor: "kraj" } satisfies Feed),
  [getFunctionName(api.prostor.inbox.pending)]: () => ({ items: [], truncated: false }) satisfies Pending,
};
