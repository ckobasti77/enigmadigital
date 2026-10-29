// Preneto iz Devotion packages/backend/convex/lib/notificationSettingsCatalog.ts (main @ c05c40f), SPAJANJE S02.
import type { ChannelBase } from "./notificationChannels";
import type { NotificationType } from "./notifications";

/**
 * Katalog ekrana „Obaveštenja i zvuci" (docs/mobile/03-NOTIFIKACIJE.md sekcija 7).
 *
 * Plain TS modul — bez Convex importa — da bi ga delili web (dijalog), mobilni
 * (ekran) i backend (mutacija koja upisuje `mutedTypes`). Jedan izvor istine za
 * grupe, redove i mapiranje red → tipovi obaveštenja, pa se tri klijenta ne mogu
 * razići oko toga šta koji prekidač gasi.
 *
 * Prekidač radi na nivou REDA, a potiskivanje na serveru na nivou TIPA
 * (`mutedTypes` u `notificationSettings`). Zato jedan red može da nosi više
 * tipova — „Rokovi" gasi sva tri roka odjednom, „Glasanja i odobrenja" oba
 * tipa glasanja. Grupisanje po zvuku prati katalog kanala: tipovi u istom redu
 * dele isti kanal, pa i isti zvuk.
 */

export type SettingsGroupKey = "chat" | "tasks" | "team";

export type SettingsRow = {
  /** Stabilan ID reda — React key i osnova pristupačnih labela. Ne menjati. */
  key: string;
  label: string;
  /** Kratko pojašnjenje ispod labele; prazno kad je labela dovoljna. */
  description?: string;
  /** Tipovi koje ovaj prekidač gasi/pali zajedno (mute = svi u nizu). */
  types: NotificationType[];
  /**
   * Koji zvuk pušta dugme za probu [▶]; `null` = red bez dugmeta. Redovi koji
   * dele zvuk sa drugim redom (npr. „Promene statusa" deli `task.wav` sa
   * „Dodeljeni zadaci") nose `null` da se isti zvuk ne nudi dvaput; `quiet`
   * kanal (ideje, puls) nema zvuk pa takođe `null` (sekcija 3).
   */
  previewSound: ChannelBase | null;
};

export type SettingsGroup = {
  key: SettingsGroupKey;
  label: string;
  rows: SettingsRow[];
};

/**
 * Tri grupe, jedanaest redova, petnaest tipova (sekcija 7). Dugme za probu stoji uz
 * šest redova — po jedan za svaki od šest zvukova (dm, mention, channel, task,
 * deadline, vote); `quiet` kanal i deljeni `task` red idu bez dugmeta.
 */
export const NOTIFICATION_SETTINGS_GROUPS: SettingsGroup[] = [
  {
    key: "chat",
    label: "Chat",
    rows: [
      {
        key: "chat_dm",
        label: "Direktne poruke",
        types: ["chat_dm"],
        previewSound: "dm",
      },
      {
        key: "chat_mention",
        label: "Pominjanja",
        description: "@ — uvek te probije, i u tihim satima.",
        types: ["chat_mention"],
        previewSound: "mention",
      },
      {
        key: "chat_message",
        label: "Poruke u kanalima",
        types: ["chat_message"],
        previewSound: "channel",
      },
    ],
  },
  {
    key: "tasks",
    label: "Zadaci",
    rows: [
      {
        key: "task_assigned",
        label: "Dodeljeni zadaci",
        types: ["task_assigned"],
        previewSound: "task",
      },
      {
        key: "task_deadlines",
        label: "Rokovi",
        description: "Uskoro, danas i probijeni — probijaju tihe sate.",
        types: ["task_due_soon", "task_due_today", "task_overdue"],
        previewSound: "deadline",
      },
      {
        key: "task_status_changed",
        label: "Promene statusa",
        types: ["task_status_changed"],
        // Deli `task.wav` sa „Dodeljeni zadaci" — bez zasebnog dugmeta za probu.
        previewSound: null,
      },
    ],
  },
  {
    key: "team",
    label: "Tim",
    rows: [
      {
        key: "team_votes",
        label: "Glasanja i odobrenja",
        types: ["vote_requested", "request_resolved"],
        previewSound: "vote",
      },
      {
        key: "team_comment_mentions",
        label: "Pominjanja u komentarima",
        description: "Probijaju tihe sate, kao @ u chatu.",
        types: ["comment_mention"],
        // Deli `mention.wav` sa „Pominjanja" u Chatu — bez zasebnog dugmeta za probu.
        previewSound: null,
      },
      {
        key: "team_comments",
        label: "Komentari",
        description: "Na tvoje stavke i zadatke.",
        types: ["comment_added"],
        // Deli `channel.wav` sa „Poruke u kanalima" — bez zasebnog dugmeta za probu.
        previewSound: null,
      },
      {
        key: "team_ideas",
        label: "Ideje",
        types: ["idea_voted", "idea_converted"],
        // Kanal `quiet` — bez zvuka (sekcija 3).
        previewSound: null,
      },
      {
        key: "team_puls",
        label: "Sedmični puls",
        types: ["puls_ready"],
        previewSound: null,
      },
    ],
  },
];

/** Svi tipovi koje ekran uopšte pokriva — osnova validacije i „utišaj sve". */
export const ALL_SETTINGS_TYPES: NotificationType[] =
  NOTIFICATION_SETTINGS_GROUPS.flatMap((group) =>
    group.rows.flatMap((row) => row.types),
  );

/**
 * Da li je red UPALJEN za dati skup utišanih tipova. Red je upaljen dok mu je
 * makar jedan tip nepotisnut; gasi se tek kad su svi njegovi tipovi utišani.
 * Prekidač uvek pali/gasi ceo red (`toggleRow`), pa parcijalno stanje nastaje
 * samo ako se tipovi utišaju drugim putem — i tada se normalizuje prvim dodirom.
 */
export function isRowEnabled(
  row: SettingsRow,
  mutedTypes: Iterable<string>,
): boolean {
  const muted = mutedTypes instanceof Set ? mutedTypes : new Set(mutedTypes);
  return !row.types.every((type) => muted.has(type));
}

/**
 * Novi `mutedTypes` posle paljenja/gašenja reda. Paljenje uklanja sve tipove
 * reda iz utišanih; gašenje ih sve dodaje. Rezultat je bez duplikata i sadrži
 * samo poznate tipove (nepoznati ulaz se odbacuje).
 */
export function toggleRow(
  row: SettingsRow,
  mutedTypes: Iterable<string>,
  enabled: boolean,
): NotificationType[] {
  const rowTypes = new Set<string>(row.types);
  const next = new Set<string>();
  for (const type of mutedTypes) {
    if (!rowTypes.has(type)) next.add(type);
  }
  if (!enabled) {
    for (const type of row.types) next.add(type);
  }
  // Zadrži samo tipove koje ekran poznaje (odbaci zaostale/nepoznate).
  return ALL_SETTINGS_TYPES.filter((type) => next.has(type));
}
