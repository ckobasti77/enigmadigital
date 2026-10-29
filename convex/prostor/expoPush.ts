// Preneto iz Devotion packages/backend/convex/expoPush.ts (main @ c05c40f), SPAJANJE S06.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import {
  belgradeMinutesOfDay,
  isWithinQuietHours,
  type NotificationType,
} from "./lib/notifications";
import {
  CHANNEL_VERSION,
  type ResolvedChannel,
  resolveChannel,
} from "./lib/notificationChannels";

/**
 * Native (Expo) push dostava — paralelna grana pored web `push.ts`. Radi u
 * default runtime-u: slanje je običan `fetch` na Expo Push API, ne treba
 * `"use node"` (za razliku od web push-a kome VAPID traži Node kriptografiju).
 *
 * Zakazuje se iz `lib/notifications.ts` uz `push.deliver`; dve grane su
 * nezavisne, pa pad ove ne dira web dostavu (03-NOTIFIKACIJE.md sekcija 2).
 *
 * `EXPO_ACCESS_TOKEN` je opciono (Expo „Enhanced Security for Push"); bez njega
 * slanje radi, kao što web bez VAPID ključeva tiho preskoči.
 */

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
/** Expo prima najviše 100 poruka po zahtevu. */
const EXPO_BATCH_SIZE = 100;

type DeliveryOutcome = "sent" | "gone" | "failed";

type DeliveryResult = {
  tokenId: Id<"expoPushTokens">;
  outcome: DeliveryOutcome;
};

/**
 * Ispisano rukom umesto izvođenja iz `ctx.runQuery`: dostava se zakazuje iz
 * `lib/notifications.ts`, pa bi izvođenje kroz `internal` napravilo kružnu
 * referencu koju TypeScript ne razrešava (isti razlog kao u `push.ts`).
 */
type ExpoPayload = {
  title: string;
  body: string | null;
  type: NotificationType;
  /** `null` = lično obaveštenje; `data.startupId: null` ne menja aktivan startup. */
  workspaceId: Id<"workspaces"> | null;
  targetType: string;
  targetId: string | null;
  notificationId: Id<"notifications">;
  badge: number;
  // Podešavanja PO PROFILU (isti za sve uređaje) — filter je po notifikaciji,
  // ne po tokenu (docs/mobile/03-NOTIFIKACIJE.md sekcija 7).
  mutedTypes: Array<NotificationType>;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  tokens: Array<{
    _id: Id<"expoPushTokens">;
    token: string;
    platform: "ios" | "android";
    channelVersion: number;
  }>;
} | null;

type DeliverResult = {
  sent: number;
  removed: number;
  failed: number;
  rateLimited: number;
  skipped: string | null;
};

type ExpoMessage = Record<string, unknown>;

type Outgoing = { tokenId: Id<"expoPushTokens">; message: ExpoMessage };

export const deliver = internalAction({
  args: { notificationId: v.id("notifications") },
  returns: v.object({
    sent: v.number(),
    removed: v.number(),
    failed: v.number(),
    rateLimited: v.number(),
    skipped: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<DeliverResult> => {
    const empty = (skipped: string | null): DeliverResult => ({
      sent: 0,
      removed: 0,
      failed: 0,
      rateLimited: 0,
      skipped,
    });

    const payload: ExpoPayload = await ctx.runQuery(
      internal.prostor.expoPushTokens.expoPayloadForNotification,
      { notificationId: args.notificationId },
    );
    if (payload === null) return empty("nema pretplaćenih uređaja");

    // Filter je PO PROFILU (podešavanja su ista za sve uređaje), pa se odlučuje
    // jednom za celu notifikaciju, ne po tokenu.
    if (payload.mutedTypes.includes(payload.type)) return empty("utišan tip");

    // Tihi sati na serveru; `mention` i `deadline` ih probijaju (sekcija 7) —
    // to nosi `breaksQuietHours` iz kataloga kanala, isto pravilo kao web push.
    const minuteOfDay = belgradeMinutesOfDay(Date.now());
    if (
      !resolveChannel(payload.type, CHANNEL_VERSION).breaksQuietHours &&
      isWithinQuietHours(payload.quietHoursStart, payload.quietHoursEnd, minuteOfDay)
    ) {
      return empty("tihi sati");
    }

    // Poruka se i dalje gradi po tokenu — kanal cilja tačan `_vN` po uređaju.
    const outgoing: Array<Outgoing> = payload.tokens.map((token) => ({
      tokenId: token._id,
      message: buildMessage(
        token,
        payload,
        resolveChannel(payload.type, token.channelVersion),
      ),
    }));
    if (outgoing.length === 0) return empty("nema pretplaćenih uređaja");

    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    const results: Array<DeliveryResult> = [];
    let rateLimited = 0;

    for (let i = 0; i < outgoing.length; i += EXPO_BATCH_SIZE) {
      const batch = outgoing.slice(i, i + EXPO_BATCH_SIZE);
      const outcome = await sendBatch(batch, accessToken);
      results.push(...outcome.results);
      rateLimited += outcome.rateLimited;
    }

    if (results.length > 0) {
      await ctx.runMutation(internal.prostor.expoPushTokens.recordDeliveryResults, {
        results,
      });
    }

    return {
      sent: results.filter((r) => r.outcome === "sent").length,
      removed: results.filter((r) => r.outcome === "gone").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      rateLimited,
      skipped: null,
    };
  },
});

/**
 * Payload po uređaju. `data` nosi ista polja koja web `push.ts` šalje da bi tap
 * otvorio tačan ekran. Zvuk: iOS uzima `<sound>.wav` iz payload-a; Android ga
 * dobija iz kanala (postavljen pri kreiranju), pa se u payload šalje samo
 * `channelId` (sekcije 4.1, 4.2, 5.1).
 */
function buildMessage(
  token: { token: string; platform: "ios" | "android" },
  payload: NonNullable<ExpoPayload>,
  channel: ResolvedChannel,
): ExpoMessage {
  const base: ExpoMessage = {
    to: token.token,
    title: payload.title,
    priority: "high",
    badge: payload.badge,
    data: {
      notificationId: payload.notificationId,
      workspaceId: payload.workspaceId,
      targetType: payload.targetType,
      targetId: payload.targetId,
      type: payload.type,
    },
    ...(payload.body ? { body: payload.body } : {}),
    ...(channel.category ? { categoryId: channel.category } : {}),
  };

  if (token.platform === "ios") {
    return {
      ...base,
      sound: channel.soundBase ? `${channel.soundBase}.wav` : null,
      interruptionLevel: channel.interruptionLevel,
    };
  }
  return { ...base, channelId: channel.channelId };
}

type BatchOutcome = {
  results: Array<DeliveryResult>;
  rateLimited: number;
};

/** Cela serija „failed" — greška na nivou zahteva (ne mrtav token). */
function allFailed(batch: Array<Outgoing>): BatchOutcome {
  return {
    results: batch.map((o) => ({ tokenId: o.tokenId, outcome: "failed" })),
    rateLimited: 0,
  };
}

/** Cela serija „rate limited" — prolazno, ne broji se kao kvar tokena. */
function allRateLimited(batch: Array<Outgoing>): BatchOutcome {
  return { results: [], rateLimited: batch.length };
}

async function sendBatch(
  batch: Array<Outgoing>,
  accessToken: string | undefined,
): Promise<BatchOutcome> {
  const messages = batch.map((o) => o.message);

  let response: Response;
  try {
    response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(messages),
    });
  } catch (error) {
    console.error("Expo push: mrežna greška", error);
    return allRateLimited(batch); // prolazno; pokušaj ponovo kasnije
  }

  if (response.status === 429) {
    console.warn("Expo push: rate limit (HTTP 429)");
    return allRateLimited(batch);
  }
  if (!response.ok) {
    console.error("Expo push: HTTP greška", response.status);
    return allFailed(batch);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    console.error("Expo push: neispravan JSON odgovor", error);
    return allFailed(batch);
  }

  const tickets = extractTickets(body);
  // Broj tiketa mora da se poklopi sa serijom da bi mapiranje po indeksu bilo
  // ispravno; u suprotnom ne brišemo tokene (samo neuspeh, bez `gone`).
  if (tickets === null || tickets.length !== batch.length) {
    console.error("Expo push: neočekivan oblik odgovora");
    return allFailed(batch);
  }

  const results: Array<DeliveryResult> = [];
  let rateLimited = 0;
  batch.forEach((o, index) => {
    const outcome = classifyTicket(tickets[index]);
    if (outcome === "rate_limited") {
      rateLimited += 1;
      return;
    }
    results.push({ tokenId: o.tokenId, outcome });
  });
  return { results, rateLimited };
}

/** Expo vraća `{ data: [tickets] }` na uspeh. */
function extractTickets(body: unknown): Array<unknown> | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "data" in body &&
    Array.isArray((body as { data: unknown }).data)
  ) {
    return (body as { data: Array<unknown> }).data;
  }
  return null;
}

function classifyTicket(
  ticket: unknown,
): DeliveryOutcome | "rate_limited" {
  if (typeof ticket !== "object" || ticket === null) return "failed";
  const status = (ticket as { status?: unknown }).status;
  if (status === "ok") return "sent";

  const details = (ticket as { details?: { error?: unknown } }).details;
  const errorCode = details?.error;
  if (errorCode === "DeviceNotRegistered") return "gone";
  if (errorCode === "MessageRateExceeded") return "rate_limited";

  // MessageTooBig, MismatchSenderId, InvalidCredentials, nepoznato…
  console.error(
    "Expo push: greška tiketa",
    errorCode ?? (ticket as { message?: unknown }).message,
  );
  return "failed";
}
