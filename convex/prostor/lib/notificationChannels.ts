// Preneto iz Devotion packages/backend/convex/lib/notificationChannels.ts (main @ c05c40f), SPAJANJE S02.
import type { NotificationType } from "./notifications";

/**
 * Katalog kanala i zvukova za native (Expo) obaveštenja.
 * Vidi docs/mobile/03-NOTIFIKACIJE.md sekcije 3, 4.1 i 8.
 *
 * Plain TS modul — bez Convex importa — da bi ga koristio i server (payload u
 * `expoPush.ts`) i mobilni klijent (kreiranje kanala pri pokretanju). Jedan
 * izvor istine: server i telefon MORAJU da se slože oko ID-jeva kanala.
 */

/**
 * Verzija kataloga. Android (API 26+) zaključava zvuk za kanal pri kreiranju i
 * posle ga ne menja iz koda. Promena zvuka se zato isporučuje kroz NOVI kanal
 * `<base>_v<N>`, ne izmenom starog — pa ID nosi verziju od prvog dana
 * (sekcija 4.1). Ovo je jedina nepovratna odluka u projektu: kad zatreba nov
 * zvuk, digne se `CHANNEL_VERSION`, klijent obriše stare i napravi nove kanale,
 * i pošalje nov `channelVersion` u `expoPushTokens`.
 */
export const CHANNEL_VERSION = 2;

/*
 * v1 -> v2 (12.08.2026): kanali su na nekim telefonima zvonili ali NISU iskakali
 * preko vrha ekrana. Uzrok je bio u zaključanim svojstvima kanala — Android ih
 * fiksira pri kreiranju, pa se popravka isporučuje isključivo novom generacijom.
 * v2 nosi: MAX važnost (umesto HIGH) i PUBLIC vidljivost na zaključanom ekranu.
 */

/** Android važnost kanala. */
export type ChannelImportance = "high" | "default" | "low";

/** iOS nivo prekida (iOS 15+). `timeSensitive` probija Focus režim. */
export type IosInterruptionLevel = "timeSensitive" | "active" | "passive";

/** Kategorija brzih akcija u obaveštenju (sekcija 8). */
export type NotificationCategory = "chat" | "task" | "vote";

/** Osnovni (neverzionisani) ID kanala. */
export type ChannelBase =
  | "dm"
  | "mention"
  | "channel"
  | "task"
  | "deadline"
  | "vote"
  | "quiet";

export type ChannelDefinition = {
  base: ChannelBase;
  /** Ljudsko ime u sistemskim podešavanjima telefona. */
  name: string;
  /**
   * Ime zvučnog fajla BEZ ekstenzije; `null` = bez zvuka. Ekstenzija je `.wav`
   * na obe platforme: iOS uzima `<soundBase>.wav` u payload-u, Android koristi
   * resurs `res/raw/<soundBase>` vezan za kanal. Jedan PCM `.wav` radi svuda —
   * expo-notifications config plugin kopira isti niz zvukova na OBE platforme, a
   * Android `res/raw` izvodi ime resursa bez ekstenzije, pa bi `.wav` i `.caf`
   * pod istim imenom srušili Android build (duplirani resurs). iOS prihvata PCM
   * `.wav` (sekcije 4.2 i 5.1).
   */
  soundBase: string | null;
  importance: ChannelImportance;
  interruptionLevel: IosInterruptionLevel;
  /** Probija server-side tihe sate (sekcija 7). */
  breaksQuietHours: boolean;
  /** Kategorija brzih akcija, ako je ima. */
  category: NotificationCategory | null;
};

/**
 * Sedam kanala za petnaest tipova (sekcija 3). Namerno manje kanala nego tipova
 * — sedam zvukova je granica onoga što se pamti po zvuku.
 */
export const NOTIFICATION_CHANNELS: Record<ChannelBase, ChannelDefinition> = {
  dm: {
    base: "dm",
    name: "Direktne poruke",
    soundBase: "dm",
    importance: "high",
    interruptionLevel: "active",
    breaksQuietHours: false,
    category: "chat",
  },
  mention: {
    base: "mention",
    name: "Pominjanja",
    soundBase: "mention",
    importance: "high",
    interruptionLevel: "timeSensitive",
    breaksQuietHours: true,
    category: "chat",
  },
  channel: {
    base: "channel",
    name: "Poruke u kanalu",
    soundBase: "channel",
    importance: "default",
    // iOS `active` da bi kanalska poruka i na iPhone-u pustila `channel.wav`
    // (Android DEFAULT ga ionako pušta) — paritet ponašanja po platformama.
    interruptionLevel: "active",
    breaksQuietHours: false,
    category: "chat",
  },
  task: {
    base: "task",
    name: "Zadaci",
    soundBase: "task",
    importance: "high",
    interruptionLevel: "active",
    breaksQuietHours: false,
    category: "task",
  },
  deadline: {
    base: "deadline",
    name: "Rokovi",
    soundBase: "deadline",
    importance: "high",
    interruptionLevel: "timeSensitive",
    breaksQuietHours: true,
    category: "task",
  },
  vote: {
    base: "vote",
    name: "Glasanja",
    soundBase: "vote",
    importance: "high",
    interruptionLevel: "timeSensitive",
    breaksQuietHours: true,
    category: "vote",
  },
  quiet: {
    base: "quiet",
    name: "Tiho",
    soundBase: null,
    importance: "low",
    interruptionLevel: "passive",
    breaksQuietHours: false,
    category: null,
  },
};

/**
 * Tip događaja → kanal (sekcija 3). `deadline` skuplja tri roka, `vote` dva
 * glasanja/odobrenja, `quiet` ideje i puls (bez zvuka).
 */
export const TYPE_TO_CHANNEL: Record<NotificationType, ChannelBase> = {
  chat_dm: "dm",
  chat_mention: "mention",
  chat_message: "channel",
  task_assigned: "task",
  task_status_changed: "task",
  task_due_soon: "deadline",
  task_due_today: "deadline",
  task_overdue: "deadline",
  vote_requested: "vote",
  request_resolved: "vote",
  idea_voted: "quiet",
  idea_converted: "quiet",
  puls_ready: "quiet",
  // PROSTOR P5: komentari koriste POSTOJEĆE kanale i zvukove (bez novih ID-jeva):
  // pominjanje zvoni kao @ u chatu (probija tihe sate), komentar kao poruka u kanalu.
  comment_mention: "mention",
  comment_added: "channel",
};

/**
 * Per-tip fina podešavanja koja gaze podrazumevano ponašanje kanala. Neki tipovi
 * dele kanal (isti zvuk) ali nisu jednako hitni: `request_resolved` deli
 * `vote.wav` sa `vote_requested`, ali je informativan (odluka je već pala) pa ne
 * probija ni iOS Focus ni tihe sate; `task_due_soon` deli `deadline.wav`, ali
 * „uskoro ističe" ne zaslužuje da probije Focus kao „danas"/„prekoračeno".
 * `active` i „ne probija tihe sate" idu zajedno: ako nešto ne sme da probije
 * Focus, ne sme ni da te budi u tihim satima.
 */
const TYPE_OVERRIDES: Partial<
  Record<
    NotificationType,
    { interruptionLevel?: IosInterruptionLevel; breaksQuietHours?: boolean }
  >
> = {
  request_resolved: { interruptionLevel: "active", breaksQuietHours: false },
  task_due_soon: { interruptionLevel: "active", breaksQuietHours: false },
};

/** Verzionisani ID kanala, npr. `dm_v1`. */
export function channelIdFor(
  base: ChannelBase,
  channelVersion: number,
): string {
  return `${base}_v${channelVersion}`;
}

/**
 * Da li tip probija tihe sate — bez rešavanja celog kanala. Web push (`push.ts`)
 * nema pojam kanala ni `channelVersion`, ali mora da poštuje ISTO pravilo tihih
 * sati kao native (`mention` i `deadline` prolaze; sekcija 7), pa deli ovaj
 * izvor umesto da drugi put nabraja tipove.
 */
export function typeBreaksQuietHours(type: NotificationType): boolean {
  const def = NOTIFICATION_CHANNELS[TYPE_TO_CHANNEL[type]];
  return TYPE_OVERRIDES[type]?.breaksQuietHours ?? def.breaksQuietHours;
}

export type ResolvedChannel = {
  channelId: string;
  soundBase: string | null;
  importance: ChannelImportance;
  interruptionLevel: IosInterruptionLevel;
  breaksQuietHours: boolean;
  category: NotificationCategory | null;
};

/**
 * Sve što payload treba za dati tip i generaciju kanala na uređaju. Uzima
 * `channelVersion` sa tokena da bi server ciljao tačan `_vN` kanal — stari
 * uređaji (v1) i novi (v2) mogu da postoje istovremeno.
 */
export function resolveChannel(
  type: NotificationType,
  channelVersion: number,
): ResolvedChannel {
  const def = NOTIFICATION_CHANNELS[TYPE_TO_CHANNEL[type]];
  const override = TYPE_OVERRIDES[type];
  return {
    channelId: channelIdFor(def.base, channelVersion),
    soundBase: def.soundBase,
    importance: def.importance,
    interruptionLevel: override?.interruptionLevel ?? def.interruptionLevel,
    breaksQuietHours: override?.breaksQuietHours ?? def.breaksQuietHours,
    category: def.category,
  };
}
