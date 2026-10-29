/**
 * Razvojni prikaz: poruke (SPAJANJE S15, plan S07 §8.1–§8.2).
 *
 * Tri razgovora u "Ja" (dva lična DM-a i lična grupa) i kanali dva projekta:
 * "Enigma IT" ima Opšte, dva kanala oblasti, privatni kanal "Klijenti", tri
 * diskusije (stranica "Endpointi za plaćanje", podstranica "Webhook tok" i
 * ideja "Paket Sajt za 7 dana") i jedan direktan razgovor; ScanMe ima Opšte i
 * kanal oblasti. Sadržaj je po uzoru na Devotion izlog (`izlog/fixtures/chat.ts`),
 * sa lažnim ljudima iz `fixtures-prostor-osnova.ts`. Sat je relativni `now`,
 * pa uvek ima poruka od juče i od danas (dnevni separatori).
 *
 * Lažni Convex nema keš ni pretplate, a svaka mutacija sa fiksturom budi sve
 * upite. Zato razgovori i poruke žive u stanju ovog modula: slanje, izmena,
 * brisanje, reakcije, čitanje i članstvo ga menjaju, a ekran ga pročita pri
 * sledećem crtanju. Osvežavanje strane vraća početno stanje.
 *
 * Odgovori upita se pamte po ključu dok se stanje ne promeni (stabilne
 * reference, pa nema kruga crtanja). Mutacija bez promene stanja
 * (`setPresence`, ponovno `markChannelRead`) vraća `undefined` i ne budi
 * ekrane. Nepročitano u traci ("Ja") izvodi se iz istog stanja i na početku je
 * jednako osnovi: 4 nepročitane, 1 pominjanje (3/1 lično, 1/0 "Enigma IT").
 *
 * Adrese (izabran razgovor je `?kanal=<id>`):
 *   /poruke?ux=1                                   → "Ja": lični razgovori + kanali projekata
 *   /poruke?ux=1&kanal=<KANAL_DM_UX>               → DM sa Anom (2 nepročitane)
 *   /poruke?ux=1&kanal=<KANAL_GRUPA_UX>            → lična grupa (vlasnik sam)
 *   /enigma-it/poruke?ux=1&kanal=<KANAL_OPSTE_UX>  → Opšte (15 poruka, juče i danas)
 *   /enigma-it/poruke?ux=1&kanal=<KANAL_DISKUSIJA_UX> → diskusija stranice
 *   /enigma-it/stranica/<STRANICA_UX>?ux=1         → panel "Diskusija" sa 2 poruke
 * `&prazno=1` daje nalog bez razgovora (ostaje spisak ljudi za "Nova poruka").
 */
import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { type Fixture, type R, WS, WS_SCANME, now, DAY } from "./fixtures-util";
import { fakeId, OBLASTI, PROFILI, PROJEKTI, strana } from "./fixtures-prostor-osnova";
import { STRANICA_UX } from "./fixtures-prostor-dokumenti";
import { FIXTURES_PROSTOR_IDEJE, IDEJA_UX } from "./fixtures-prostor-ideje";
import { FIXTURES_PROSTOR_ZADACI } from "./fixtures-prostor-zadaci";

type Hub = R<typeof api.prostor.chat.listConversations>;
type Kanal = R<typeof api.prostor.chat.listChannels>[number];
type KanalSaUlogom = R<typeof api.prostor.chat.getChannel>;
type Poruka = R<typeof api.prostor.chat.messages>["page"][number];
type Clan = R<typeof api.prostor.chat.channelMembers>[number];
type Ljudi = R<typeof api.prostor.chat.listPeople>;
type Neprocitano = R<typeof api.prostor.chat.unreadSummary>;
/** Povratna vrednost mutacije: ista provera ugovora kao `R` za upite. */
type RM<M extends FunctionReference<"mutation">> = FunctionReturnType<M>;

type Osoba = (typeof PROFILI)[number];
type Vrsta = Kanal["kind"];
type Sidro = NonNullable<Kanal["anchorType"]>;
type Nivo = Kanal["notificationLevel"];
type UlogaClana = Clan["role"];
type Radnja = Record<string, unknown>;

const [JA, ANA, MARKO, MILICA, NIKOLA, STEFAN] = PROFILI;

/** Opšte projekta "Enigma IT" (15 poruka, jedna nepročitana). */
export const KANAL_OPSTE_UX = fakeId("chatChannels", 1);
/** Diskusija stranice "Endpointi za plaćanje" (`STRANICA_UX`), 2 poruke. */
export const KANAL_DISKUSIJA_UX = fakeId("chatChannels", 6);
/** Lični DM sa Anom: 2 nepročitane. */
export const KANAL_DM_UX = fakeId("chatChannels", 21);
/** Lična grupa "Vikend plan": 4 člana, ja sam vlasnik. */
export const KANAL_GRUPA_UX = fakeId("chatChannels", 23);

// ── Vreme ────────────────────────────────────────────────────────────────────

const MIN = 60_000;

function pocetakDana(): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * `minuta` (najviše 200) pre sada, ali ne pre početka današnjeg dana, pa
 * separator "Danas" postoji i kad se prikaz otvori u prvim satima posle ponoći.
 * Veći broj minuta uvek daje raniji trenutak.
 */
function danas(minuta: number): number {
  return Math.max(now - minuta * MIN, pocetakDana() + (200 - minuta) * 1000);
}

/** Lokalno vreme `dana` dana pre današnjeg, u `sat:minut`. */
function pre(dana: number, sat: number, minut = 0): number {
  const d = new Date(now);
  d.setDate(d.getDate() - dana);
  d.setHours(sat, minut, 0, 0);
  return d.getTime();
}

// ── Ljudi i projekti ─────────────────────────────────────────────────────────

const mali = (osoba: Osoba) => ({
  _id: osoba._id,
  displayName: osoba.displayName,
  avatarUrl: osoba.avatarUrl,
});

const radniProstor = (id: Id<"workspaces">) => {
  const projekat = PROJEKTI.find((p) => p._id === id);
  return { _id: id, name: projekat?.name ?? "Projekat", logoUrl: projekat?.logoUrl ?? null };
};

const dmKljuc = (a: Osoba, b: Osoba) => [a._id, b._id].sort().join(":");

/** Mali SVG u `data:` adresi: slika priloga bez mreže. */
const SLIKA_PRILOGA = (() => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">` +
    `<rect width="640" height="400" fill="#16324a"/>` +
    `<rect x="40" y="40" width="560" height="64" rx="8" fill="#245a82"/>` +
    `<rect x="40" y="136" width="360" height="18" rx="4" fill="#3b7aa6"/>` +
    `<rect x="40" y="168" width="440" height="18" rx="4" fill="#3b7aa6"/>` +
    `<rect x="40" y="200" width="300" height="18" rx="4" fill="#3b7aa6"/>` +
    `<rect x="40" y="272" width="180" height="56" rx="8" fill="#58c4ff"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
})();

// ── Stanje ───────────────────────────────────────────────────────────────────

type Razgovor = {
  id: Id<"chatChannels">;
  workspaceId: Id<"workspaces"> | null;
  kind: Vrsta;
  areaId: Id<"areas"> | null;
  anchorType: Sidro | null;
  anchorId: string | null;
  dmKey: string | null;
  name: string;
  isPrivate: boolean;
  napravio: Osoba;
  nastao: number;
  /** Eksplicitni članovi (lični razgovori, privatni kanal); ostali kanali ih nemaju. */
  clanovi: { osoba: Osoba; uloga: UlogaClana }[];
  neprocitano: number;
  pominjanja: number;
  nivo: Nivo;
  arhiviran: boolean;
};

let brojPoruke = 0;
let brojKanala = 100;

function kanal(
  n: number,
  d: Pick<Razgovor, "workspaceId" | "kind"> & Partial<Razgovor>,
): Razgovor {
  return {
    id: fakeId("chatChannels", n),
    areaId: null,
    anchorType: null,
    anchorId: null,
    dmKey: null,
    name: "",
    isPrivate: false,
    napravio: JA,
    nastao: now - 30 * DAY,
    clanovi: [],
    neprocitano: 0,
    pominjanja: 0,
    nivo: "all",
    arhiviran: false,
    ...d,
  };
}

function poruka(
  r: Pick<Razgovor, "id" | "workspaceId">,
  autor: Osoba | null,
  kad: number,
  body: string,
  d: Partial<Poruka> = {},
): Poruka {
  brojPoruke += 1;
  return {
    _id: fakeId("chatMessages", brojPoruke),
    _creationTime: kad,
    channelId: r.id,
    workspaceId: r.workspaceId,
    authorProfileId: autor?._id ?? null,
    body,
    mentions: [],
    kind: autor === null ? "system" : "text",
    attachmentName: null,
    attachmentType: null,
    attachmentSize: null,
    voiceDurationMs: null,
    replyToMessageId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: kad,
    deleted: false,
    author: autor === null ? null : mali(autor),
    reactions: [],
    attachmentUrl: null,
    ...d,
  };
}

type Stanje = {
  razgovori: Map<string, Razgovor>;
  /** Poruke po razgovoru, najnovija PRVA (kao `chat.messages`); nikad se ne menjaju na licu mesta. */
  poruke: Map<string, Poruka[]>;
};

function napraviStanje(): Stanje {
  const razgovori = new Map<string, Razgovor>();
  const poruke = new Map<string, Poruka[]>();
  /** Razgovor sa porukama zadatim redom nastanka (najstarija prva). */
  const stavi = (r: Razgovor, hronoloski: Poruka[]) => {
    razgovori.set(r.id, r);
    poruke.set(r.id, [...hronoloski].reverse());
  };
  const pojedinac = (osoba: Osoba) => ({ osoba, uloga: "member" as const });

  // Lično: DM sa Anom (2 nepročitane), DM sa Markom (pročitano), lična grupa.
  const dmAna = kanal(21, {
    workspaceId: null,
    kind: "dm",
    isPrivate: true,
    dmKey: dmKljuc(JA, ANA),
    clanovi: [pojedinac(JA), pojedinac(ANA)],
    neprocitano: 2,
    nastao: pre(20, 9),
  });
  stavi(dmAna, [
    poruka(dmAna, JA, pre(1, 17, 40), "Imaš li minut da pogledaš tekst za sajt pekare?"),
    poruka(dmAna, ANA, pre(1, 17, 52), "Imam, pošalji."),
    poruka(dmAna, JA, pre(1, 17, 55), "Evo, ubacio sam ga u dokumente."),
    poruka(dmAna, ANA, danas(55), "Pregledala sam, ima par sitnih stvari za ispravku."),
    poruka(dmAna, ANA, danas(54), "Javi kad možeš, pa da prođemo zajedno."),
  ]);

  const dmMarko = kanal(22, {
    workspaceId: null,
    kind: "dm",
    isPrivate: true,
    dmKey: dmKljuc(JA, MARKO),
    clanovi: [pojedinac(JA), pojedinac(MARKO)],
    nastao: pre(25, 9),
  });
  const pitanje = poruka(dmMarko, MARKO, pre(1, 12, 10), "Šta je sa nalogom za hosting, jesi li plaćao?");
  stavi(dmMarko, [
    pitanje,
    poruka(dmMarko, JA, pre(1, 12, 25), "Jesam, faktura je u dokumentima.", { replyToMessageId: pitanje._id }),
    poruka(dmMarko, MARKO, pre(1, 12, 26), "Super, hvala."),
  ]);

  const grupa = kanal(23, {
    workspaceId: null,
    kind: "custom",
    name: "Vikend plan",
    isPrivate: true,
    clanovi: [{ osoba: JA, uloga: "owner" }, pojedinac(MILICA), pojedinac(NIKOLA), pojedinac(STEFAN)],
    neprocitano: 1,
    pominjanja: 1,
    nastao: pre(2, 9),
  });
  stavi(grupa, [
    poruka(grupa, null, pre(2, 9), `${JA.displayName} je napravio/la grupu`),
    poruka(grupa, NIKOLA, pre(1, 21, 2), "Ja nosim ugalj i roštilj."),
    poruka(grupa, STEFAN, pre(1, 21, 5), "Polazak u 10 ispred kancelarije?", {
      reactions: [{ emoji: "✅", count: 2, mine: false }],
    }),
    poruka(grupa, MILICA, pre(1, 21, 10), `@${JA.displayName} ti voziš u subotu?`, { mentions: [JA._id] }),
  ]);

  // Projekat "Enigma IT": Opšte.
  const opste = kanal(1, {
    workspaceId: WS,
    kind: "startup",
    name: "Opšte",
    neprocitano: 1,
    nastao: now - 90 * DAY,
  });
  const nacrt = poruka(opste, MILICA, pre(1, 9, 13), "Nacrt naslovne strane ponude.", {
    kind: "file",
    attachmentName: "nacrt-ponude.png",
    attachmentType: "image/png",
    attachmentSize: 48_212,
    attachmentUrl: SLIKA_PRILOGA,
  });
  const sistemska = poruka(opste, null, pre(1, 8, 55), `${MILICA.displayName} se pridružila projektu.`);
  const pocetak = poruka(
    opste,
    MILICA,
    pre(1, 9, 12),
    "Dobro jutro, tim. Danas šaljem ponudu za pekaru, pa javite ako nešto fali.",
  );
  const rok = poruka(opste, MARKO, pre(1, 10, 5), "Rok stavi sedam radnih dana, duže od toga ne obećavamo.");
  stavi(opste, [
    sistemska,
    pocetak,
    nacrt,
    poruka(opste, ANA, pre(1, 9, 40), "Pogledala sam. Cena je u redu, samo bih dodala rok isporuke.", {
      replyToMessageId: nacrt._id,
      reactions: [{ emoji: "👍", count: 3, mine: true }],
    }),
    rok,
    poruka(opste, MARKO, pre(1, 10, 6), "I neka ide PDF, ne slika.", { editedAt: pre(1, 10, 9) }),
    poruka(opste, JA, pre(1, 10, 30), "Slažem se sa Markom. Ana, ubaci rok pa pošalji klijentu.", {
      replyToMessageId: rok._id,
    }),
    poruka(opste, NIKOLA, pre(1, 15, 20), "Webhook za naplatu je na stagingu, test kreće u petak.", {
      reactions: [{ emoji: "🎉", count: 1, mine: false }],
    }),
    poruka(opste, STEFAN, pre(1, 16, 45), "", { deleted: true, deletedAt: pre(1, 16, 50) }),
    poruka(opste, ANA, danas(150), "Dobro jutro. Ponuda za pekaru je otišla klijentu."),
    poruka(opste, ANA, danas(148), "Javili su da će odgovoriti do kraja dana."),
    poruka(
      opste,
      MARKO,
      danas(90),
      `@${JA.displayName} možeš li da pogledaš izveštaj za Instagram pre sastanka?`,
      { mentions: [JA._id] },
    ),
    poruka(opste, JA, danas(80), "Gledam sada, javljam do podne."),
    poruka(opste, MILICA, danas(30), "Letak je spreman za pregled, fajl je u dokumentima.", {
      reactions: [{ emoji: "👀", count: 2, mine: false }],
    }),
    poruka(opste, NIKOLA, danas(12), "Staging je gore, test naplate je prošao."),
  ]);

  // Kanali oblasti.
  const razvoj = kanal(2, {
    workspaceId: WS,
    kind: "area",
    name: OBLASTI[0].label,
    areaId: OBLASTI[0]._id,
    nastao: now - 80 * DAY,
  });
  stavi(razvoj, [
    poruka(razvoj, MARKO, pre(1, 14, 2), "Build 1.4 je na stagingu, proverite prijavu."),
    poruka(razvoj, ANA, pre(1, 14, 20), "Prijava radi, ali kolačić ističe prerano."),
    poruka(razvoj, MARKO, danas(180), "Ispravljeno, sada ističe posle sedam dana."),
  ]);

  const marketing = kanal(3, {
    workspaceId: WS,
    kind: "area",
    name: OBLASTI[1].label,
    areaId: OBLASTI[1]._id,
    nastao: now - 80 * DAY,
  });
  stavi(marketing, [
    poruka(marketing, MILICA, pre(1, 11), "Plan objava za novembar je u dokumentima."),
    poruka(marketing, ANA, pre(1, 11, 30), "Dodala sam dve teme za video."),
  ]);

  // Privatni kanal "Klijenti" (ja sam vlasnik).
  const klijenti = kanal(4, {
    workspaceId: WS,
    kind: "custom",
    name: "Klijenti",
    isPrivate: true,
    clanovi: [{ osoba: JA, uloga: "owner" }, pojedinac(ANA), pojedinac(MILICA), pojedinac(MARKO)],
    nastao: now - 40 * DAY,
  });
  stavi(klijenti, [
    poruka(klijenti, ANA, pre(2, 16), "Pekara traži izmenu cene na drugoj strani ponude."),
    poruka(klijenti, JA, pre(2, 16, 10), "Primljeno, menjam večeras."),
  ]);

  // Diskusije: podstranica "Webhook tok", stranica "Endpointi za plaćanje" i
  // ideja "Paket Sajt za 7 dana".
  const webhook = kanal(5, {
    workspaceId: WS,
    kind: "thread",
    name: "Webhook tok",
    anchorType: "page",
    anchorId: fakeId("pages", 102),
    napravio: ANA,
    nastao: pre(2, 10),
  });
  stavi(webhook, [
    poruka(webhook, ANA, pre(2, 10), "Koji statusi dolaze od provajdera, samo uspeh i greška?"),
    poruka(webhook, MARKO, pre(2, 10, 15), "Još i istek i povraćaj. Dopisaću ih na stranicu."),
  ]);

  const endpointi = kanal(6, {
    workspaceId: WS,
    kind: "thread",
    name: "Endpointi za plaćanje",
    anchorType: "page",
    anchorId: STRANICA_UX,
    napravio: MARKO,
    nastao: pre(1, 13, 30),
  });
  stavi(endpointi, [
    poruka(endpointi, MARKO, pre(1, 13, 30), "Endpoint za povraćaj još nema proveru potpisa."),
    poruka(endpointi, JA, pre(1, 13, 45), "Dodajem je danas, pa pregledaj."),
  ]);

  const paket = kanal(7, {
    workspaceId: WS,
    kind: "thread",
    name: "Paket „Sajt za 7 dana“ za male firme",
    anchorType: "idea",
    anchorId: IDEJA_UX,
    napravio: MARKO,
    nastao: pre(1, 8),
  });
  stavi(paket, [
    poruka(paket, MARKO, pre(1, 8), "Sedam dana je tesno ako klijent kasni sa sadržajem.", { mentions: [JA._id] }),
  ]);

  // Direktan razgovor u projektu.
  const dmMilica = kanal(8, {
    workspaceId: WS,
    kind: "dm",
    isPrivate: true,
    dmKey: dmKljuc(JA, MILICA),
    clanovi: [pojedinac(JA), pojedinac(MILICA)],
    nastao: pre(30, 9),
  });
  stavi(dmMilica, [
    poruka(dmMilica, MILICA, pre(3, 18), "Imaš li ponudu za pekaru u PDF-u?"),
    poruka(dmMilica, JA, pre(3, 18, 20), "Šaljem sutra ujutru."),
  ]);

  // Projekat ScanMe: Opšte i jedan kanal oblasti (ako ih osnova ima).
  const scanMe = PROJEKTI.find((p) => p._id === WS_SCANME);
  const opsteScanMe = kanal(11, {
    workspaceId: WS_SCANME,
    kind: "startup",
    name: "Opšte",
    nastao: now - 60 * DAY,
  });
  stavi(opsteScanMe, [
    poruka(opsteScanMe, ANA, pre(1, 10), "Meni za probni restoran je objavljen, QR kodovi su spremni."),
    poruka(opsteScanMe, JA, pre(1, 10, 20), "Super, hvala. Šaljem ih na štampu."),
    poruka(opsteScanMe, ANA, danas(120), "Štampa javlja da su kodovi gotovi u četvrtak."),
  ]);
  const oblastScanMe = scanMe?.areas[1];
  if (oblastScanMe) {
    const marketingScanMe = kanal(12, {
      workspaceId: WS_SCANME,
      kind: "area",
      name: oblastScanMe.label,
      areaId: oblastScanMe._id,
      nastao: now - 60 * DAY,
    });
    stavi(marketingScanMe, [
      poruka(marketingScanMe, ANA, pre(2, 15), "Objava za otvaranje restorana ide u petak u 12."),
    ]);
  }

  return { razgovori, poruke };
}

const stanje = napraviStanje();

// ── Pamćenje odgovora ────────────────────────────────────────────────────────

const kes = new Map<string, unknown>();

/** Isti odgovor (ista referenca) dok se stanje ne promeni. */
function zapamti<T>(kljuc: string, napravi: () => T): T {
  if (kes.has(kljuc)) return kes.get(kljuc) as T;
  const vrednost = napravi();
  kes.set(kljuc, vrednost);
  return vrednost;
}

function promeni(): void {
  kes.clear();
}

// ── Izvođenje odgovora iz stanja ─────────────────────────────────────────────

const nadji = (id: unknown): Razgovor | undefined => stanje.razgovori.get(String(id));
const poruciKanala = (id: string): Poruka[] => stanje.poruke.get(id) ?? [];

/** Isto što radi server: pregled poslednje poruke za listu. */
function pregled(p: Poruka): string {
  if (p.deleted) return "Poruka je obrisana";
  if (p.kind === "file") return "\u{1F4CE} Prilog";
  if (p.kind === "voice") return "\u{1F3A4} Glasovna poruka";
  const tekst = p.body.trim();
  return tekst.length <= 100 ? tekst : tekst.slice(0, 100);
}

function vidljiv(r: Razgovor): boolean {
  if (r.arhiviran) return false;
  // DM i custom kanal: samo eksplicitni članovi (i u projektu i van njega).
  if (r.kind === "dm" || r.kind === "custom") {
    return r.clanovi.some((c) => c.osoba._id === JA._id);
  }
  return true;
}

function sazetak(r: Razgovor): Kanal {
  const zadnja = poruciKanala(r.id)[0];
  const drugi =
    r.kind === "dm" ? r.clanovi.find((c) => c.osoba._id !== JA._id)?.osoba : undefined;
  return {
    _id: r.id,
    _creationTime: r.nastao,
    workspaceId: r.workspaceId,
    kind: r.kind,
    areaId: r.areaId,
    anchorType: r.anchorType,
    anchorId: r.anchorId,
    dmKey: r.dmKey,
    name: r.name,
    isPrivate: r.isPrivate,
    lastMessageAt: zadnja?.createdAt ?? r.nastao,
    lastMessagePreview: zadnja ? pregled(zadnja) : "",
    lastMessageAuthorId: zadnja?.authorProfileId ?? null,
    messageCount: poruciKanala(r.id).length,
    createdByProfileId: r.napravio._id,
    archivedAt: null,
    createdAt: r.nastao,
    unreadCount: r.neprocitano,
    mentionCount: r.pominjanja,
    notificationLevel: r.nivo,
    lastMessageAuthor: zadnja?.author ?? null,
    otherParticipant: drugi ? mali(drugi) : null,
  };
}

const najsvezije = (a: Kanal, b: Kanal) => b.lastMessageAt - a.lastMessageAt;

function kanaliProjekta(workspaceId: Id<"workspaces">): Kanal[] {
  return [...stanje.razgovori.values()]
    .filter((r) => r.workspaceId === workspaceId && vidljiv(r))
    .map(sazetak)
    .sort(najsvezije);
}

function licniKanali(): Kanal[] {
  return [...stanje.razgovori.values()]
    .filter((r) => r.workspaceId === null && vidljiv(r))
    .map(sazetak)
    .sort(najsvezije);
}

function hub(): Hub {
  const grupe = PROJEKTI.map((projekat) => {
    const channels = kanaliProjekta(projekat._id);
    return {
      workspace: radniProstor(projekat._id),
      unreadCount: channels.reduce((zbir, c) => zbir + c.unreadCount, 0),
      mentionCount: channels.reduce((zbir, c) => zbir + c.mentionCount, 0),
      channels,
    };
  });
  // Grupe po najsvežijem kanalu; projekat bez kanala ide na kraj.
  const svezina = (g: (typeof grupe)[number]) => (g.channels.length === 0 ? -1 : g.channels[0].lastMessageAt);
  grupe.sort((a, b) => svezina(b) - svezina(a));
  return { personal: licniKanali(), workspaces: grupe, capped: false };
}

function kanalSaUlogom(id: unknown): KanalSaUlogom {
  const r = nadji(id);
  if (!r || !vidljiv(r)) throw new Error("Razgovor nije pronađen.");
  return {
    ...sazetak(r),
    workspace: r.workspaceId === null ? null : radniProstor(r.workspaceId),
    myRole: r.clanovi.find((c) => c.osoba._id === JA._id)?.uloga ?? null,
  };
}

function clanoviKanala(id: unknown): Clan[] {
  const r = nadji(id);
  if (!r || !vidljiv(r)) throw new Error("Razgovor nije pronađen.");
  if (r.kind === "dm" || r.kind === "custom") {
    return r.clanovi.map((c) => ({ profile: mali(c.osoba), role: c.uloga }));
  }
  if (r.kind === "thread") {
    // Učesnici diskusije: ko je pisao, redom prve poruke.
    const videni = new Set<string>();
    const clanovi: Clan[] = [];
    for (const p of [...poruciKanala(r.id)].reverse()) {
      if (p.author === null || videni.has(p.author._id)) continue;
      videni.add(p.author._id);
      clanovi.push({ profile: p.author, role: "member" });
    }
    return clanovi;
  }
  // Opšte i javni kanali oblasti nemaju eksplicitne članove: tu je ceo tim.
  return [];
}

function kanalZaSidro(a: Radnja): Kanal | null {
  const r = [...stanje.razgovori.values()].find(
    (k) =>
      k.workspaceId === a.workspaceId &&
      k.anchorType === a.anchorType &&
      k.anchorId === a.anchorId &&
      !k.arhiviran,
  );
  return r ? sazetak(r) : null;
}

/** Nepročitano po opsezima, izvedeno iz stanja (na početku jednako osnovi). */
function neprocitano(): Neprocitano {
  const licno = { unreadCount: 0, mentionCount: 0 };
  const poProjektu = new Map<Id<"workspaces">, { unreadCount: number; mentionCount: number }>();
  for (const r of stanje.razgovori.values()) {
    if (!vidljiv(r)) continue;
    if (r.workspaceId === null) {
      licno.unreadCount += r.neprocitano;
      licno.mentionCount += r.pominjanja;
      continue;
    }
    const zbir = poProjektu.get(r.workspaceId) ?? { unreadCount: 0, mentionCount: 0 };
    zbir.unreadCount += r.neprocitano;
    zbir.mentionCount += r.pominjanja;
    poProjektu.set(r.workspaceId, zbir);
  }
  const byStartup = [...poProjektu.entries()]
    .filter(([, brojevi]) => brojevi.unreadCount > 0 || brojevi.mentionCount > 0)
    .map(([workspaceId, brojevi]) => ({ workspaceId, ...brojevi }));
  return {
    total: {
      unreadCount: byStartup.reduce((zbir, g) => zbir + g.unreadCount, licno.unreadCount),
      mentionCount: byStartup.reduce((zbir, g) => zbir + g.mentionCount, licno.mentionCount),
    },
    byStartup,
    personal: licno,
  };
}

// ── Ljudi ────────────────────────────────────────────────────────────────────

/** Sa svima delim "Enigma IT"; ostale projekte (osnova) delim samo sa Anom. */
function zajednickiProjekti(osoba: Osoba): string[] {
  return PROJEKTI.filter((p) => p._id === WS || osoba._id === ANA._id)
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b, "sr-Latn"));
}

const LJUDI: Ljudi = PROFILI.slice(1)
  .map((osoba) => ({ ...mali(osoba), sharedStartupNames: zajednickiProjekti(osoba) }))
  .sort((a, b) => a.displayName.localeCompare(b.displayName, "sr-Latn"));

// ── Mutacije ─────────────────────────────────────────────────────────────────

function osoba(id: unknown): Osoba | undefined {
  return PROFILI.find((p) => p._id === id);
}

function ostaliClanovi(ids: unknown): Osoba[] {
  if (!Array.isArray(ids)) return [];
  const jedinstveni = [...new Set(ids.map(String))];
  return jedinstveni.flatMap((id) => {
    const o = osoba(id);
    return o && o._id !== JA._id ? [o] : [];
  });
}

function dodajPoruku(r: Razgovor, p: Poruka): void {
  stanje.poruke.set(r.id, [p, ...poruciKanala(r.id)]);
}

function novaPoruka(r: Razgovor, autor: Osoba | null, body: string, d: Partial<Poruka> = {}): Poruka {
  const p = poruka(r, autor, Date.now(), body, d);
  dodajPoruku(r, p);
  return p;
}

/** Zameni jednu poruku (nova referenca, da ekran vidi izmenu); `false` ako je nema. */
function izmeniPoruku(id: unknown, izmena: (p: Poruka) => Poruka): boolean {
  for (const [kanalId, lista] of stanje.poruke) {
    const i = lista.findIndex((p) => p._id === id);
    if (i < 0) continue;
    const kopija = [...lista];
    kopija[i] = izmena(lista[i]);
    stanje.poruke.set(kanalId, kopija);
    return true;
  }
  return false;
}

function dodajRazgovor(r: Razgovor, pocetne: Poruka[] = []): Id<"chatChannels"> {
  stanje.razgovori.set(r.id, r);
  stanje.poruke.set(r.id, [...pocetne].reverse());
  return r.id;
}

/** Samo poznati profili; ostalo server odbija, a prikaz ga tiho izostavlja. */
function idPominjanih(ids: unknown): Id<"profiles">[] {
  if (!Array.isArray(ids)) return [];
  return ids.flatMap((id) => {
    const o = osoba(id);
    return o ? [o._id] : [];
  });
}

function posalji(a: Radnja): RM<typeof api.prostor.chat.sendMessage> {
  const r = nadji(a.channelId);
  if (!r || !vidljiv(r)) throw new Error("Razgovor nije pronađen.");
  const kind = a.kind === "file" || a.kind === "voice" ? a.kind : "text";
  const body = typeof a.body === "string" ? a.body.trim() : "";
  if (kind === "text" && body === "") throw new Error("Poruka ne sme biti prazna.");
  const odgovor = poruciKanala(r.id).find((p) => p._id === a.replyToMessageId);
  const tip = typeof a.attachmentType === "string" ? a.attachmentType : null;
  const p = novaPoruka(r, JA, body, {
    kind,
    mentions: idPominjanih(a.mentions),
    replyToMessageId: odgovor?._id ?? null,
    attachmentName: typeof a.attachmentName === "string" ? a.attachmentName : null,
    attachmentType: tip,
    attachmentSize: typeof a.attachmentSize === "number" ? a.attachmentSize : null,
    voiceDurationMs: typeof a.voiceDurationMs === "number" ? a.voiceDurationMs : null,
    attachmentUrl: tip?.startsWith("image/") ? SLIKA_PRILOGA : null,
  });
  promeni();
  return { ok: true as const, messageId: p._id };
}

/** Naslov diskusije: naslov stranice ili ideje iz drugih fikstura. */
function naslovSidra(tip: Sidro, id: string): string {
  if (tip === "page") {
    const detalj = FIXTURES_PROSTOR_ZADACI[getFunctionName(api.prostor.pages.get)]?.({ pageId: id });
    if (detalj && typeof detalj === "object" && "title" in detalj && typeof detalj.title === "string") {
      return detalj.title;
    }
    return "Diskusija o stranici";
  }
  if (tip === "idea") {
    const spisak = FIXTURES_PROSTOR_IDEJE[getFunctionName(api.prostor.ideas.list)]?.({});
    const cvorovi =
      spisak && typeof spisak === "object" && "nodes" in spisak && Array.isArray(spisak.nodes)
        ? (spisak.nodes as { _id: string; title: string | null }[])
        : [];
    return cvorovi.find((c) => c._id === id)?.title ?? "Diskusija o ideji";
  }
  return "Diskusija";
}

function posaljiNaSidro(a: Radnja): RM<typeof api.prostor.chat.sendToAnchor> {
  const workspaceId = a.workspaceId as Id<"workspaces">;
  const tip = a.anchorType as Sidro;
  const sidro = String(a.anchorId);
  const body = typeof a.body === "string" ? a.body.trim() : "";
  if (body === "") throw new Error("Poruka ne sme biti prazna.");
  // Diskusija nastaje tek uz prvu poruku (lenjo kreiranje, kao na serveru).
  let r = [...stanje.razgovori.values()].find(
    (k) => k.workspaceId === workspaceId && k.anchorType === tip && k.anchorId === sidro && !k.arhiviran,
  );
  if (!r) {
    brojKanala += 1;
    r = kanal(brojKanala, {
      workspaceId,
      kind: "thread",
      name: naslovSidra(tip, sidro),
      anchorType: tip,
      anchorId: sidro,
      nastao: Date.now(),
    });
    dodajRazgovor(r);
  }
  const p = novaPoruka(r, JA, body, { mentions: idPominjanih(a.mentions) });
  promeni();
  return p._id;
}

function preklopiReakciju(a: Radnja): RM<typeof api.prostor.chat.toggleReaction> {
  const emoji = typeof a.emoji === "string" ? a.emoji.trim() : "";
  if (emoji === "" || emoji.length > 32) throw new Error("Nevažeći emoji.");
  let reacted = false;
  const nadjena = izmeniPoruku(a.messageId, (p) => {
    const postojeca = p.reactions.find((r) => r.emoji === emoji);
    if (postojeca?.mine) {
      reacted = false;
      return {
        ...p,
        reactions:
          postojeca.count <= 1
            ? p.reactions.filter((r) => r.emoji !== emoji)
            : p.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r)),
      };
    }
    reacted = true;
    return {
      ...p,
      reactions: postojeca
        ? p.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r))
        : [...p.reactions, { emoji, count: 1, mine: true }],
    };
  });
  if (!nadjena) throw new Error("Poruka nije pronađena.");
  promeni();
  return { reacted };
}

function izmeniTekst(a: Radnja): RM<typeof api.prostor.chat.editMessage> {
  const body = typeof a.body === "string" ? a.body.trim() : "";
  if (body === "") throw new Error("Poruka ne sme biti prazna.");
  const nadjena = izmeniPoruku(a.messageId, (p) => ({ ...p, body, editedAt: Date.now() }));
  if (!nadjena) throw new Error("Poruka nije pronađena.");
  promeni();
  return null;
}

function obrisiPoruku(a: Radnja): RM<typeof api.prostor.chat.deleteMessage> {
  const nadjena = izmeniPoruku(a.messageId, (p) => ({
    ...p,
    // Obrisana poruka ne nosi telo, prilog ni reakcije (kao `enrichMessages`).
    body: "",
    mentions: [],
    attachmentName: null,
    attachmentType: null,
    attachmentSize: null,
    voiceDurationMs: null,
    attachmentUrl: null,
    reactions: [],
    deleted: true,
    deletedAt: Date.now(),
  }));
  if (!nadjena) throw new Error("Poruka nije pronađena.");
  promeni();
  return null;
}

function oznaciProcitano(a: Radnja): RM<typeof api.prostor.chat.markChannelRead> | undefined {
  const r = nadji(a.channelId);
  // Već pročitano: ništa se ne menja, pa se ekran ne budi (nema kruga).
  if (!r || (r.neprocitano === 0 && r.pominjanja === 0)) return undefined;
  r.neprocitano = 0;
  r.pominjanja = 0;
  promeni();
  return null;
}

function postaviNivo(a: Radnja): RM<typeof api.prostor.chat.setNotificationLevel> | undefined {
  const r = nadji(a.channelId);
  if (!r) throw new Error("Razgovor nije pronađen.");
  const nivo = a.level as Nivo;
  if (r.nivo === nivo) return undefined;
  r.nivo = nivo;
  promeni();
  return null;
}

function arhiviraj(a: Radnja): RM<typeof api.prostor.chat.archiveChannel> {
  const r = nadji(a.channelId);
  if (!r || r.arhiviran) throw new Error("Razgovor nije pronađen.");
  if (r.workspaceId === null) throw new Error("Lični razgovor se ne arhivira — napusti grupu.");
  if (r.kind === "startup") throw new Error("Opšti kanal se ne može arhivirati.");
  r.arhiviran = true;
  promeni();
  return null;
}

/** Direktan razgovor sa osobom: postojeći ili nov (u projektu ili lični). */
function otvoriDm(workspaceId: Id<"workspaces"> | null, drugiId: unknown): Id<"chatChannels"> {
  const drugi = osoba(drugiId);
  if (!drugi || drugi._id === JA._id) throw new Error("Ne možeš otvoriti razgovor sa samim sobom.");
  const kljuc = dmKljuc(JA, drugi);
  const postojeci = [...stanje.razgovori.values()].find(
    (r) => r.kind === "dm" && r.workspaceId === workspaceId && r.dmKey === kljuc && !r.arhiviran,
  );
  if (postojeci) return postojeci.id;
  brojKanala += 1;
  const id = dodajRazgovor(
    kanal(brojKanala, {
      workspaceId,
      kind: "dm",
      isPrivate: true,
      dmKey: kljuc,
      clanovi: [
        { osoba: JA, uloga: "member" },
        { osoba: drugi, uloga: "member" },
      ],
      nastao: Date.now(),
    }),
  );
  promeni();
  return id;
}

function napraviKanal(a: Radnja): RM<typeof api.prostor.chat.createChannel> {
  if (typeof a.fromMessageId === "string") {
    // Diskusija otvorena iz poruke: jedna po poruci.
    const izvorna = [...stanje.poruke.values()].flat().find((p) => p._id === a.fromMessageId);
    const izvor = izvorna ? nadji(izvorna.channelId) : undefined;
    if (!izvorna || !izvor) throw new Error("Poruka nije pronađena.");
    const postojeci = [...stanje.razgovori.values()].find(
      (r) => r.anchorType === "message" && r.anchorId === izvorna._id && !r.arhiviran,
    );
    if (postojeci) return postojeci.id;
    brojKanala += 1;
    const r = kanal(brojKanala, {
      workspaceId: izvor.workspaceId,
      kind: "thread",
      name: izvorna.body.trim().slice(0, 40) || "Diskusija",
      anchorType: "message",
      anchorId: izvorna._id,
      nastao: Date.now(),
    });
    const id = dodajRazgovor(r);
    novaPoruka(r, null, "Diskusija otvorena iz poruke.");
    promeni();
    return id;
  }
  const workspaceId = a.workspaceId as Id<"workspaces"> | undefined;
  const ime = typeof a.name === "string" ? a.name.trim() : "";
  if (workspaceId === undefined || ime === "" || typeof a.isPrivate !== "boolean") {
    throw new Error("Za nov kanal su obavezni projekat, naziv i vidljivost.");
  }
  brojKanala += 1;
  const id = dodajRazgovor(
    kanal(brojKanala, {
      workspaceId,
      kind: "custom",
      name: ime,
      isPrivate: a.isPrivate,
      clanovi: [
        { osoba: JA, uloga: "owner" },
        ...ostaliClanovi(a.memberProfileIds).map((o) => ({ osoba: o, uloga: "member" as const })),
      ],
      nastao: Date.now(),
    }),
  );
  promeni();
  return id;
}

/** Postavi članove na tačno traženi spisak (ja uvek ostajem); vraća stanje pre izmene. */
function postaviClanove(r: Razgovor, trazeni: unknown) {
  const zeljeni = new Set<string>([JA._id, ...ostaliClanovi(trazeni).map((o) => o._id)]);
  const previousProfileIds = r.clanovi.map((c) => c.osoba._id);
  const zadrzani = r.clanovi.filter((c) => zeljeni.has(c.osoba._id));
  const dodati = [...zeljeni]
    .filter((id) => !previousProfileIds.includes(id as Id<"profiles">))
    .flatMap((id) => {
      const o = osoba(id);
      return o ? [{ osoba: o, uloga: "member" as const }] : [];
    });
  r.clanovi = [...zadrzani, ...dodati];
  return {
    previousProfileIds,
    added: dodati.length,
    removed: previousProfileIds.length - zadrzani.length,
  };
}

function postaviClanoveKanala(a: Radnja): RM<typeof api.prostor.chat.setChannelMembers> {
  const r = nadji(a.channelId);
  if (!r || r.arhiviran) throw new Error("Razgovor nije pronađen.");
  if (r.workspaceId === null) throw new Error("Za ličnu grupu koristi podešavanja grupe.");
  if (r.kind !== "custom") throw new Error("Članovi se menjaju samo na kanalu koji je napravio tim.");
  const rezultat = postaviClanove(r, a.memberProfileIds);
  promeni();
  return rezultat;
}

function napraviGrupu(a: Radnja): RM<typeof api.prostor.chat.createPersonalGroup> {
  const ime = typeof a.name === "string" ? a.name.trim() : "";
  if (ime === "") throw new Error("Naziv grupe je obavezan.");
  brojKanala += 1;
  const r = kanal(brojKanala, {
    workspaceId: null,
    kind: "custom",
    name: ime,
    isPrivate: true,
    clanovi: [
      { osoba: JA, uloga: "owner" },
      ...ostaliClanovi(a.memberProfileIds).map((o) => ({ osoba: o, uloga: "member" as const })),
    ],
    nastao: Date.now(),
  });
  const id = dodajRazgovor(r);
  novaPoruka(r, null, `${JA.displayName} je napravio/la grupu`);
  promeni();
  return id;
}

function izmeniGrupu(a: Radnja): RM<typeof api.prostor.chat.updatePersonalGroup> {
  const r = nadji(a.channelId);
  if (!r || !vidljiv(r) || r.workspaceId !== null || r.kind !== "custom") {
    throw new Error("Ovo nije lična grupa.");
  }
  if (r.clanovi.find((c) => c.osoba._id === JA._id)?.uloga !== "owner") {
    throw new Error("Podešavanja grupe menja samo njen vlasnik.");
  }
  const previousName = r.name;
  const ime = typeof a.name === "string" ? a.name.trim() : undefined;
  if (ime === "") throw new Error("Naziv grupe je obavezan.");
  if (ime !== undefined) r.name = ime;
  const clanovi =
    a.memberProfileIds === undefined
      ? { previousProfileIds: r.clanovi.map((c) => c.osoba._id), added: 0, removed: 0 }
      : postaviClanove(r, a.memberProfileIds);
  promeni();
  return { previousName, ...clanovi };
}

function napustiGrupu(a: Radnja): RM<typeof api.prostor.chat.leavePersonalGroup> {
  const r = nadji(a.channelId);
  if (!r || !vidljiv(r)) throw new Error("Razgovor nije pronađen.");
  if (r.workspaceId === null && r.kind === "dm") throw new Error("Iz ličnog razgovora se ne izlazi.");
  if (r.workspaceId !== null || r.kind !== "custom") throw new Error("Ovo nije lična grupa.");
  const bio = r.clanovi.find((c) => c.osoba._id === JA._id);
  const preostali = r.clanovi.filter((c) => c.osoba._id !== JA._id);
  r.clanovi = preostali;
  r.neprocitano = 0;
  r.pominjanja = 0;
  const arhivirana = preostali.length === 0;
  if (arhivirana) {
    r.arhiviran = true;
  } else {
    if (bio?.uloga === "owner") {
      // Vlasništvo prelazi na prvog preostalog člana (najranije pridruženog).
      r.clanovi = preostali.map((c, i) => (i === 0 ? { ...c, uloga: "owner" as const } : c));
    }
    novaPoruka(r, null, `${JA.displayName} je napustio/la grupu`);
  }
  promeni();
  return { archived: arhivirana };
}

// ── Fikture ──────────────────────────────────────────────────────────────────

export const FIXTURES_PROSTOR_PORUKE: Record<string, Fixture> = {
  [getFunctionName(api.prostor.chat.listConversations)]: () => zapamti("hub", hub),
  [getFunctionName(api.prostor.chat.listChannels)]: (a) =>
    zapamti(`kanali:${String(a.workspaceId)}`, () => kanaliProjekta(a.workspaceId as Id<"workspaces">)),
  [getFunctionName(api.prostor.chat.messages)]: (a) =>
    zapamti(`poruke:${String(a.channelId)}`, () => strana([...poruciKanala(String(a.channelId))])),
  [getFunctionName(api.prostor.chat.getChannel)]: (a) =>
    zapamti(`kanal:${String(a.channelId)}`, () => kanalSaUlogom(a.channelId)),
  [getFunctionName(api.prostor.chat.channelMembers)]: (a) =>
    zapamti(`clanovi:${String(a.channelId)}`, () => clanoviKanala(a.channelId)),
  [getFunctionName(api.prostor.chat.listPeople)]: () => LJUDI,
  [getFunctionName(api.prostor.chat.channelForAnchor)]: (a) =>
    zapamti(`sidro:${String(a.workspaceId)}:${String(a.anchorType)}:${String(a.anchorId)}`, () => kanalZaSidro(a)),
  // Izvedeno iz istog stanja kao spisak razgovora (traka "Ja" čita ovaj broj).
  [getFunctionName(api.prostor.chat.unreadSummary)]: () => zapamti("neprocitano", neprocitano),

  // Mutacije menjaju stanje modula (vidi zaglavlje) i vraćaju što i server.
  [getFunctionName(api.prostor.chat.sendMessage)]: (a) => posalji(a),
  [getFunctionName(api.prostor.chat.sendToAnchor)]: (a) => posaljiNaSidro(a),
  [getFunctionName(api.prostor.chat.toggleReaction)]: (a) => preklopiReakciju(a),
  [getFunctionName(api.prostor.chat.editMessage)]: (a) => izmeniTekst(a),
  [getFunctionName(api.prostor.chat.deleteMessage)]: (a) => obrisiPoruku(a),
  [getFunctionName(api.prostor.chat.markChannelRead)]: (a) => oznaciProcitano(a),
  // Otkucaj prisustva stiže periodično: vraća `undefined` da ne budi ekrane.
  [getFunctionName(api.prostor.chat.setPresence)]: () => undefined,
  [getFunctionName(api.prostor.chat.openPersonalDm)]: (a) => otvoriDm(null, a.otherProfileId),
  [getFunctionName(api.prostor.chat.openDirectMessage)]: (a) =>
    otvoriDm(a.workspaceId as Id<"workspaces">, a.otherProfileId),
  [getFunctionName(api.prostor.chat.createPersonalGroup)]: (a) => napraviGrupu(a),
  [getFunctionName(api.prostor.chat.updatePersonalGroup)]: (a) => izmeniGrupu(a),
  [getFunctionName(api.prostor.chat.leavePersonalGroup)]: (a) => napustiGrupu(a),
  [getFunctionName(api.prostor.chat.setNotificationLevel)]: (a) => postaviNivo(a),
  [getFunctionName(api.prostor.chat.archiveChannel)]: (a) => arhiviraj(a),
  [getFunctionName(api.prostor.chat.createChannel)]: (a) => napraviKanal(a),
  [getFunctionName(api.prostor.chat.setChannelMembers)]: (a) => postaviClanoveKanala(a),
  [getFunctionName(api.prostor.chat.generateUploadUrl)]: () =>
    "https://primer.test/otpremanje" satisfies RM<typeof api.prostor.chat.generateUploadUrl>,
};

// Stalne vrednosti (ne nove pri svakom pozivu), da prazan prikaz ne zavrti krug.
const PRAZAN_HUB: Hub = { personal: [], workspaces: [], capped: false };
const PRAZNI_KANALI: Kanal[] = [];
const DVE_OSOBE: Ljudi = LJUDI.slice(0, 2);

/**
 * `&prazno=1`: nalog bez razgovora. Ostaju dve osobe, da "Nova poruka" u
 * praznom stanju ima koga da ponudi. `resolveFixture` projekte ScanMe i
 * "Klijent d.o.o." šalje kroz ovaj isti unos, pa `listChannels` za ScanMe
 * vraća njegove kanale (kao bez `&prazno=1`), a za sve ostalo prazan spisak.
 */
export const PRAZNO_PROSTOR_PORUKE: Record<string, Fixture> = {
  [getFunctionName(api.prostor.chat.listConversations)]: () => PRAZAN_HUB,
  [getFunctionName(api.prostor.chat.listChannels)]: (a) =>
    a.workspaceId === WS_SCANME
      ? zapamti(`kanali:${WS_SCANME}`, () => kanaliProjekta(WS_SCANME))
      : PRAZNI_KANALI,
  [getFunctionName(api.prostor.chat.listPeople)]: () => DVE_OSOBE,
  [getFunctionName(api.prostor.chat.channelForAnchor)]: () => null,
};
