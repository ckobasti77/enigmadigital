import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { decryptCredentials } from "./lib/crypto";
import { fetchAccessToken, parseYouTubeCredentials } from "./lib/youtubeApi";
import type { MediaContext } from "./ytMedia";

/**
 * A short-lived YouTube access token for the browser (Y6).
 *
 * A video of a few hundred megabytes cannot go through a Convex action — the
 * time and memory are not there — so the file goes STRAIGHT from the browser
 * to Google's resumable upload endpoint. Convex issues the token and records
 * how it ended; the bytes never touch it.
 *
 * Ovaj token nosi pun `youtube.force-ssl` opseg i Google ga ne može suziti.
 * Zato se izdaje samo prijavljenom članu radnog prostora, traje jedan sat, i
 * koristi se isključivo za resumable upload iz browsera. Sve ostale operacije
 * (metapodaci, thumbnail, titlovi, brisanje komentara) idu kroz Convex akcije
 * gde token nikad ne napušta backend.
 */

/**
 * Google's tokens live one hour. Five minutes are shaved off what we promise
 * the client so it never starts a long upload with a token that expires
 * halfway through — the resumable session survives, but every chunk after the
 * expiry is a 401 the browser has to recover from.
 */
const UPLOAD_TOKEN_TTL_MS = 55 * 60 * 1000;

export const issueUploadToken = action({
  args: {},
  returns: v.object({ accessToken: v.string(), expiresAt: v.number() }),
  handler: async (ctx): Promise<{ accessToken: string; expiresAt: number }> => {
    // Membership is checked inside; a caller who is not a member never gets a
    // token, and neither does one whose workspace has no YouTube connected.
    const context: MediaContext = await ctx.runQuery(
      internal.ytMedia.loadMediaContext,
      {},
    );
    if (context === null) {
      throw new ConvexError({
        code: "invalid",
        message: "Prvo poveži YouTube nalog u Podešavanjima.",
      });
    }

    let accessToken: string;
    try {
      const creds = parseYouTubeCredentials(
        await decryptCredentials(context.encryptedCredentials),
      );
      accessToken = await fetchAccessToken(creds);
    } catch (err) {
      throw new ConvexError({
        code: "invalid",
        message:
          err instanceof Error
            ? err.message
            : "Neuspelo izdavanje YouTube tokena.",
      });
    }

    // The workspace, never the token.
    console.log(
      "YouTube: izdat upload token za workspace",
      context.workspaceId,
    );

    return { accessToken, expiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS };
  },
});
