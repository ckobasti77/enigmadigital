/**
 * Katalog svih prečica aplikacije — ČISTO (vitest), SPAJANJE S24 (P20).
 *
 * Jedan registar (`registar.ts`) nosi definicije obe aplikacije: globalne
 * (`?`, `q`, Ctrl/⌘ K), liste zadataka, Inbox, Poruke, tabelu Leadova, režim
 * poziva, stranicu i mapu. Tastere Leadova, režima poziva, stranice i mape i
 * dalje obrađuju njihovi ekrani (ponašanje se ne menja); u registru su kao
 * `displayOnly`, da ih pomoć navede i da test sudara vidi ceo ekran.
 *
 * Pravilo: na jednom ekranu jedna kombinacija tastera ima jednu radnju.
 * `EKRANI_PRECICA` kaže koje grupe žive zajedno; „Svuda“ je uvek uz njih.
 */
import { PLAN_REORDER_HELP } from "./lista-zadataka";
import {
  CALL_MODE_HELP,
  CANVAS_HELP,
  CHAT_LIST_HELP,
  CHAT_SHORTCUTS,
  DATE_PICKER_HELP,
  INBOX_SHORTCUTS,
  LEAD_TABLE_HELP,
  MAP_HISTORY_HELP,
  PAGE_HELP,
  PAGE_MAP_HELP,
  SHELL_SHORTCUTS,
  TASK_LIST_SHORTCUTS,
  groupShortcuts,
  shortcutHelpKeys,
  type ShortcutDef,
  type ShortcutGroup,
} from "./registar";

export const SVE_PRECICE: ReadonlyArray<ShortcutDef> = [
  ...Object.values(SHELL_SHORTCUTS),
  ...Object.values(TASK_LIST_SHORTCUTS),
  PLAN_REORDER_HELP,
  ...Object.values(INBOX_SHORTCUTS),
  ...Object.values(CHAT_SHORTCUTS),
  ...CHAT_LIST_HELP,
  ...LEAD_TABLE_HELP,
  ...CALL_MODE_HELP,
  ...PAGE_HELP,
  ...MAP_HISTORY_HELP,
  ...PAGE_MAP_HELP,
  ...CANVAS_HELP,
  ...DATE_PICKER_HELP,
];

/**
 * Grupe koje su istovremeno aktivne na jednom ekranu (uz „Svuda“). Režim
 * poziva zamenjuje tabelu Leadova, a birač datuma je iskačući sloj (dok je
 * otvoren, prečice liste ćute), pa su odvojeni.
 */
export const EKRANI_PRECICA: ReadonlyArray<{ ekran: string; grupe: ReadonlyArray<ShortcutGroup> }> = [
  { ekran: "Danas, Moji zadaci i Zadaci projekta", grupe: ["Liste zadataka"] },
  { ekran: "Inbox", grupe: ["Inbox"] },
  { ekran: "Poruke", grupe: ["Poruke"] },
  { ekran: "Leadovi", grupe: ["Leadovi"] },
  { ekran: "Režim poziva", grupe: ["Režim poziva"] },
  { ekran: "Stranica i njena mapa", grupe: ["Stranica", "Mapa"] },
  { ekran: "Birač datuma", grupe: ["Birač datuma"] },
];

/**
 * Kombinacije koje definicija stvarno zauzima, za proveru sudara: `helpKeys`
 * kad postoje (npr. J i ↓ za istu radnju), inače jedina kombinacija.
 */
export function kombinacije(def: ShortcutDef): string[] {
  return shortcutHelpKeys(def).map((combo) => combo.join("+"));
}

export type SudarPrecica = { kombinacija: string; ids: string[] };

/**
 * Kombinacije koje nose dve ili više radnji. Skriveni pseudonimi
 * (`hideInHelp`, npr. strelica uz `j`) su ista radnja kao vidljiva definicija
 * koja ih navodi u `helpKeys`, pa se ne broje dvaput.
 */
export function sudariPrecica(defs: ReadonlyArray<ShortcutDef>): SudarPrecica[] {
  const po = new Map<string, Set<string>>();
  for (const def of defs) {
    if (def.hideInHelp) continue;
    for (const kombinacija of kombinacije(def)) {
      const ids = po.get(kombinacija) ?? new Set<string>();
      ids.add(def.id);
      po.set(kombinacija, ids);
    }
  }
  return [...po.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([kombinacija, ids]) => ({ kombinacija, ids: [...ids] }));
}

type GrupaPomoci = { group: ShortcutGroup; defs: ShortcutDef[] };

/**
 * Dijalog pomoći navodi sve prečice: prvo one koje su prijavljene na ovom
 * ekranu (tačno onakve kakve su, npr. `/` samo gde lista ima pretragu), pa
 * ostale grupe iz kataloga.
 */
export function grupisiZaPomoc(
  aktivne: ReadonlyArray<ShortcutDef>,
  sve: ReadonlyArray<ShortcutDef> = SVE_PRECICE,
): { ovde: GrupaPomoci[]; drugde: GrupaPomoci[] } {
  const ovde = groupShortcuts(aktivne);
  const zauzete = new Set(ovde.map((g) => g.group));
  const drugde = groupShortcuts(sve.filter((def) => !zauzete.has(def.group)));
  return { ovde, drugde };
}
