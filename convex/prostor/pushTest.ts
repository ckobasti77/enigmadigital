// Preneto iz Devotion packages/backend/convex/pushTest.ts (main @ c05c40f), SPAJANJE S06.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { channelIdFor } from "./lib/notificationChannels";

/**
 * Probno slanje push obaveštenja samom sebi — dijagnostika, ne obaveštenje.
 *
 * Postoji zato što se "ne zvoni mi" ne može rešiti nagađanjem: između telefona i
 * ovog servera stoje Expo, FCM ključ na EAS-u, `google-services.json` u buildu i
 * Android kanal, i svaka od te četiri karike pada drugačije. Ova akcija ide istim
 * putem kao prava dostava (`expoPush.ts`), ali NAMERNO zaobilazi utišane tipove i
 * tihe sate, i vraća tekst greške koji Expo javi — pa se karika koja je pukla vidi
 * na ekranu telefona, ne u logu na tuđoj mašini.
 *
 * Šalje se na kanal `dm` (zvuk `dm.wav`, visoka važnost) jer je to kanal koji
 * korisnik i inače najviše čeka da čuje.
 *
 * SPAJANJE (plan S01 D12): u Devotionu javna akcija za telefon; ovde interna,
 * sa `profileId` kao argumentom, jer web je ne zove, telefon dolazi kasnije (P22),
 * a lični omotač za akciju ne postoji. Bez sačuvanih tokena ne šalje ništa.
 */

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type TestToken = {
  _id: Id<"expoPushTokens">;
  token: string;
  platform: "ios" | "android";
  channelVersion: number;
  deviceName: string | null;
};

type Ticket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

/** Expo/FCM greške su na engleskom i bez konteksta — ovde dobijaju uzrok i lek. */
function explainTicket(error: string | undefined, message: string | undefined): string {
  switch (error) {
    case "DeviceNotRegistered":
      return "Token je mrtav (aplikacija obrisana ili reinstalirana). Pritisni „Registruj uređaj ponovo“.";
    case "MismatchSenderId":
      return "google-services.json u buildu je iz drugog Firebase projekta nego servisni ključ na EAS-u. Napravi nov build.";
    case "InvalidCredentials":
      return "FCM V1 servisni ključ na EAS-u nije ispravan ili nedostaje.";
    case "MessageTooBig":
      return "Poruka je prevelika.";
    case "MessageRateExceeded":
      return "Previše poruka u kratkom roku — sačekaj minut.";
    default:
      return message ?? error ?? "nepoznata greška";
  }
}

export const sendTest = internalAction({
  args: { profileId: v.id("profiles") },
  returns: v.object({ ok: v.boolean(), detail: v.string() }),
  handler: async (ctx, args): Promise<{ ok: boolean; detail: string }> => {
    const tokens: Array<TestToken> = await ctx.runQuery(
      internal.prostor.expoPushTokens.myTokensForTest,
      { profileId: args.profileId },
    );

    if (tokens.length === 0) {
      return {
        ok: false,
        detail:
          "Nijedan uređaj nije registrovan za ovaj nalog. Pritisni „Registruj uređaj ponovo“ pa probaj opet.",
      };
    }

    const messages = tokens.map((token) => {
      const base = {
        to: token.token,
        title: "Probno obaveštenje",
        body: "Ako ovo čuješ i vidiš — push radi.",
        priority: "high",
        // Bez `targetType`/`startupId`: tap ovde ne treba nikuda da vodi
        // (`extractPendingTarget` vrati null i navigacija se ne dešava).
        data: { test: true },
      };
      return token.platform === "ios"
        ? { ...base, sound: "dm.wav", interruptionLevel: "timeSensitive" }
        : { ...base, channelId: channelIdFor("dm", token.channelVersion) };
    });

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(messages),
      });
    } catch (error) {
      return {
        ok: false,
        detail: `Server nije uspeo da dođe do Expo servisa: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        detail: `Expo je odbio zahtev (HTTP ${response.status}). ${text}`.slice(0, 500),
      };
    }

    let body: { data?: Array<Ticket> };
    try {
      body = (await response.json()) as { data?: Array<Ticket> };
    } catch {
      return { ok: false, detail: "Expo je vratio odgovor koji nije JSON." };
    }

    const tickets = Array.isArray(body.data) ? body.data : [];
    const problems: Array<string> = [];
    let sent = 0;

    tickets.forEach((ticket, index) => {
      const device = tokens[index]?.deviceName ?? `uređaj ${index + 1}`;
      if (ticket.status === "ok") {
        sent += 1;
        return;
      }
      problems.push(`${device}: ${explainTicket(ticket.details?.error, ticket.message)}`);
    });

    if (sent === 0) {
      return {
        ok: false,
        detail:
          problems.length > 0
            ? problems.join("\n")
            : "Expo nije vratio nijednu potvrdu slanja.",
      };
    }

    const suffix = problems.length > 0 ? `\n\nNeuspešno:\n${problems.join("\n")}` : "";
    return {
      ok: true,
      detail:
        `Poslato na ${sent} ${sent === 1 ? "uređaj" : "uređaja"}. ` +
        "Ako se za par sekundi ništa ne oglasi, problem je na telefonu (dozvole, kanal, Ne uznemiravaj)." +
        suffix,
    };
  },
});
