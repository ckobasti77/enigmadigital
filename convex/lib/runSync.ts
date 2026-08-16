import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { Provider } from "./providers";

/**
 * Strip anything that could carry a secret out of an error message before it
 * is stored on a `syncRuns` row (the Sync Health widget shows it). Sync code
 * must ALSO never interpolate a credential into a thrown error in the first
 * place — this is defense in depth, not the primary guarantee.
 */
export function sanitizeSyncError(err: unknown): string {
  let message = err instanceof Error ? err.message : String(err);
  message = message
    .replace(/postgres(?:ql)?:\/\/\S*/gi, "postgres://<redacted>")
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      "<redacted-private-key>",
    )
    .replace(
      /(access_token|refresh_token|client_secret|api[_-]?key|authorization|bearer|code|password|secret)(\s*[=:]\s*)[^\s&]+/gi,
      "$1$2<redacted>",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>")
    .replace(/v1:[0-9a-fA-F]{24,}/g, "<redacted-ciphertext>");
  if (message.length > 400) message = message.slice(0, 400) + "…";
  return message;
}

/**
 * Generic sync wrapper every sync action (now the no-op "Sync now", later the
 * real GA4 / OpenReply / IG node actions) runs through. Records a `syncRuns`
 * row: "running" on start, "ok" + itemsWritten on success, "error" + sanitized
 * message on failure. Three separate transactions on purpose, so the "running"
 * row is visible immediately.
 */
export async function runSync(
  ctx: ActionCtx,
  args: {
    workspaceId: Id<"workspaces">;
    provider: Provider;
    connectionId?: Id<"connections">;
  },
  fn: () => Promise<number>,
): Promise<void> {
  const syncRunId = await ctx.runMutation(internal.sync.startSyncRun, args);
  try {
    const itemsWritten = await fn();
    await ctx.runMutation(internal.sync.finishSyncRun, {
      syncRunId,
      itemsWritten,
    });
  } catch (err) {
    await ctx.runMutation(internal.sync.failSyncRun, {
      syncRunId,
      error: sanitizeSyncError(err),
    });
    throw err;
  }
}
