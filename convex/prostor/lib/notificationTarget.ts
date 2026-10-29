// Preneto iz Devotion packages/backend/convex/lib/notificationTarget.ts (main @ c05c40f), SPAJANJE S02.
import type { NotificationTargetType } from "./notifications";

/**
 * JEDAN izvor istine za „kuda vodi klik na obaveštenje". Isti `targetType` MORA
 * da vodi na isto mesto na oba klijenta (docs/mobile/00-PLAN.md, „backend je
 * deljen"). Zato mapiranje živi u deljenom `convex/lib/` modulu — isti obrazac
 * kao `notificationChannels.ts`, koji već koriste i server i mobilni.
 *
 * - Web: mapira `NotificationDestination` na `WorkspaceRoute`
 *   (`components/workspace/workspace-route.ts`), a `sw.js` gradi isti URL
 *   (`view=chat&channelId=…` itd.). SW je statički fajl i ne može da uveze ovaj
 *   modul, pa ga preslikava — svaka izmena ovde ide i tamo.
 * - Mobilni: mapira `NotificationDestination` na expo-router put
 *   (`lib/notifications/deep-link.ts`).
 *
 * `targetId` semantika po tipu (postavlja se u `lib/notifications.ts` na mestu
 * događaja): `page` → pageId, `chat` → channelId, `puls` → početak nedelje (ms),
 * `ideas` → ideaId (komentar i glas na ideji; odsutno = lista ideja), `area` →
 * areaId (komentar na opis oblasti), `approvals` → null.
 *
 * Opseg (`scope`): obaveštenje sa `startupId: null` je LIČNO (poruka iz ličnog
 * razgovora, van startupa) — klijent ga otvara bez promene aktivnog startupa (web
 * `view=me-chat`, mobilni `/chat` + `razgovor/[id]`). Odsutan `startupId` (stari
 * pozivi) znači startup opseg, kao i pre.
 */

export type NotificationScreen =
  | "chat"
  | "page"
  | "ideas"
  | "approvals"
  | "puls"
  | "area"
  | "today";

export type NotificationScope = "startup" | "personal";

export type NotificationDestination = {
  screen: NotificationScreen;
  /** `personal` samo kad je `startupId` eksplicitno `null`. */
  scope: NotificationScope;
  /** channelId za `chat`, pageId za `page`, ideaId za `ideas`, areaId za `area` — inače null. */
  entityId: string | null;
  /** `puls`: početak tražene nedelje (ms) ako je poznat, inače null. */
  weekStart: number | null;
};

/**
 * Klijent-neutralna destinacija za dati cilj obaveštenja. Nepoznat ili
 * nedosledan cilj (npr. `page` bez id-ja) pada na komandni centar (`today`)
 * umesto na prazan ekran.
 */
export function notificationDestination(
  targetType: NotificationTargetType | string,
  targetId: string | null,
  workspaceId?: string | null,
): NotificationDestination {
  const scope: NotificationScope = workspaceId === null ? "personal" : "startup";
  return { ...destinationFor(targetType, targetId), scope };
}

function destinationFor(
  targetType: NotificationTargetType | string,
  targetId: string | null,
): Omit<NotificationDestination, "scope"> {
  switch (targetType) {
    case "chat":
      // Bez channelId chat se otvara na listi razgovora (nije greška).
      return { screen: "chat", entityId: targetId, weekStart: null };
    case "page":
      return targetId
        ? { screen: "page", entityId: targetId, weekStart: null }
        : { screen: "today", entityId: null, weekStart: null };
    case "ideas":
      // Bez ideaId (stari pozivi) klijent otvara listu ideja.
      return { screen: "ideas", entityId: targetId || null, weekStart: null };
    case "area":
      // Ekran oblasti dolazi sa K13/K14; do tada klijenti padaju na komandni
      // centar (njihova `default` grana), isto kao za `today`.
      return targetId
        ? { screen: "area", entityId: targetId, weekStart: null }
        : { screen: "today", entityId: null, weekStart: null };
    case "approvals":
      return { screen: "approvals", entityId: null, weekStart: null };
    case "puls": {
      const week = Number(targetId);
      return {
        screen: "puls",
        entityId: null,
        weekStart: Number.isFinite(week) && week > 0 ? week : null,
      };
    }
    default:
      return { screen: "today", entityId: null, weekStart: null };
  }
}
