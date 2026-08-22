"use node";

import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials } from "./lib/crypto";
import { createUsageTracker } from "./lib/metaRateLimit";
import {
  getMetaGraphVersion,
  META_GRAPH_BASE_URL,
  extractMetaAdsError,
  normalizeAdAccountId,
  sanitizeApiResponse,
  type RawGraphApiResponse,
} from "./lib/metaAdsApi";
import { sanitizeSyncError } from "./lib/runSync";
import type { Id } from "./_generated/dataModel";

/**
 * ============================================================================
 * META ADS WRITE ACTIONS (Node Runtime)
 * ============================================================================
 *
 * SAFETY FIRST:
 * 1. Kill Switch: process.env.ADS_WRITE_ENABLED === "true".
 *    When NOT exactly "true", ALL write actions fail closed immediately
 *    with "Pisanje je isključeno (ADS_WRITE_ENABLED)" BEFORE creating any
 *    database row or making external HTTP requests.
 * 2. Guardrails on Budget:
 *    - Bounds from BUDGET_MIN_EUR (default 5) / BUDGET_MAX_EUR (default 5000)
 *    - Max ±50% change per single action vs current daily budget
 *    - Rejection with clear Serbian explanation
 * 3. Ad Duplication & Hook Iteration:
 *    - Uses /copies endpoint with status_option: "PAUSED"
 *    - Guardrail: MAX_HOOK_COPIES (default 5) per ad set
 * 4. Audit Trail & Idempotency:
 *    - Writes adActions FIRST with status "pending"
 *    - Idempotency check rejects duplicate pending action
 *    - Updates adActions with apiResponse or error on completion
 * ============================================================================
 */

// ── Environment & Safety Configuration ───────────────────────────────────────

export function getBudgetBounds(): { minBudget: number; maxBudget: number; limitCurrency: string } {
  const envMin = parseFloat(process.env.BUDGET_MIN ?? process.env.BUDGET_MIN_EUR ?? "5");
  const envMax = parseFloat(process.env.BUDGET_MAX ?? process.env.BUDGET_MAX_EUR ?? "5000");
  const minBudget = Number.isFinite(envMin) && envMin > 0 ? envMin : 5;
  const maxBudget = Number.isFinite(envMax) && envMax >= minBudget ? envMax : 5000;
  const limitCurrency = (process.env.BUDGET_LIMIT_CURRENCY ?? "EUR").trim().toUpperCase();
  return { minBudget, maxBudget, limitCurrency };
}

export function getMaxHookCopies(): number {
  const envMax = parseInt(process.env.MAX_HOOK_COPIES ?? "5", 10);
  return Number.isFinite(envMax) && envMax > 0 ? envMax : 5;
}

export function assertWriteEnabled(): void {
  const enabled = process.env.ADS_WRITE_ENABLED;
  if (enabled !== "true") {
    throw new ConvexError({
      code: "write_disabled",
      message: "Pisanje je isključeno (ADS_WRITE_ENABLED)",
    });
  }
}

// ── Auth & Credential Helpers ────────────────────────────────────────────────

interface ResolvedAuth {
  userId: Id<"users">;
  workspaceId: Id<"workspaces">;
  accessToken: string;
}

interface TargetInfo {
  targetType: "campaign" | "adset" | "ad";
  targetId: string;
  name: string;
  status: string;
  dailyBudget?: number;
  currency: string;
  spendToday: number;
  internalId?: string;
}

async function resolveAuthAndToken(
  ctx: ActionCtx,
  explicitWorkspaceId?: Id<"workspaces">,
): Promise<ResolvedAuth> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError({
      code: "unauthorized",
      message: "Niste prijavljeni.",
    });
  }

  // Get user's active workspace
  const workspaceRes: { workspaceId: Id<"workspaces"> } = await ctx.runQuery(
    internal.adActionsStore.resolveUserWorkspace,
    {
      userId,
      explicitWorkspaceId,
    },
  );
  const workspaceId = workspaceRes.workspaceId;

  // Fetch Meta Ads connection
  const conn: {
    _id: Id<"connections">;
    encryptedCredentials: string;
    status: string;
    externalId?: string;
  } | null = await ctx.runQuery(
    internal.adActionsStore.getMetaConnectionForWorkspace,
    { workspaceId },
  );

  if (!conn) {
    throw new ConvexError({
      code: "missing_connection",
      message: "Meta Ads integracija nije povezana u ovom radnom prostoru.",
    });
  }

  const accessToken = await decryptCredentials(conn.encryptedCredentials);
  if (!accessToken || accessToken.trim().length === 0) {
    throw new ConvexError({
      code: "invalid_credentials",
      message: "Neispravan Meta token za pristup.",
    });
  }

  return {
    userId,
    workspaceId,
    accessToken: accessToken.trim(),
  };
}

// ── 1. Pause / Resume Action ─────────────────────────────────────────────────

export interface PauseResumeResult {
  success: boolean;
  actionId: Id<"adActions">;
  targetType: "campaign" | "adset" | "ad";
  targetId: string;
  status: "ACTIVE" | "PAUSED";
}

export const pauseResume = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    targetType: v.union(
      v.literal("campaign"),
      v.literal("adset"),
      v.literal("ad"),
    ),
    targetId: v.string(), // externalId
    desiredStatus: v.union(
      v.literal("ACTIVE"),
      v.literal("PAUSED"),
      v.literal("active"),
      v.literal("paused"),
    ),
  },
  handler: async (ctx, args): Promise<PauseResumeResult> => {
    // 1. KILL SWITCH: Fail closed immediately if not enabled
    assertWriteEnabled();

    const normalizedStatus = args.desiredStatus.toUpperCase() as
      | "ACTIVE"
      | "PAUSED";
    const actionName = normalizedStatus === "PAUSED" ? "pause" : "resume";

    // 2. Resolve Auth & Access Token
    const { userId, workspaceId, accessToken } = await resolveAuthAndToken(
      ctx,
      args.workspaceId,
    );

    // 3. Fetch Target Details for context
    const target: TargetInfo = await ctx.runQuery(
      internal.adActionsStore.getTargetForAction,
      {
        workspaceId,
        targetType: args.targetType,
        targetId: args.targetId,
      },
    );

    // 4. Record Pending Action in Database (enforces idempotency)
    const actionId: Id<"adActions"> = await ctx.runMutation(
      internal.adActionsStore.recordPendingAction,
      {
        workspaceId,
        userId,
        targetType: args.targetType,
        targetId: args.targetId,
        targetName: target.name,
        action: actionName,
        params: JSON.stringify({
          desiredStatus: normalizedStatus,
          previousStatus: target.status,
          spendToday: target.spendToday,
        }),
      },
    );

    // Every ad write is a call to graph.facebook.com and counts against the
    // same allowance the syncs are rationing (P2).
    const tracker = createUsageTracker();

    // 5. Execute Graph API POST
    const version = getMetaGraphVersion();
    const url = `${META_GRAPH_BASE_URL}/${version}/${args.targetId}`;

    const formData = new URLSearchParams();
    formData.append("status", normalizedStatus);
    formData.append("access_token", accessToken);

    try {
      const res = await tracker.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const json = (await res.json().catch(() => ({}))) as RawGraphApiResponse<Record<string, unknown>>;

      if (!res.ok || json.error) {
        const errorMsg = extractMetaAdsError(json.error || json);
        await ctx.runMutation(internal.adActionsStore.failAction, {
          actionId,
          error: errorMsg,
          apiResponse: sanitizeApiResponse(json),
        });
        throw new ConvexError({
          code: "meta_api_error",
          message: `Greška Meta API-ja: ${errorMsg}`,
        });
      }

      // 6. Complete Action on Success
      await ctx.runMutation(internal.adActionsStore.completeAction, {
        actionId,
        newStatus: normalizedStatus,
        apiResponse: sanitizeApiResponse(json),
      });

      return {
        success: true,
        actionId,
        targetType: args.targetType,
        targetId: args.targetId,
        status: normalizedStatus,
      };
    } catch (err: unknown) {
      if (err instanceof ConvexError) throw err;
      const errorMsg = sanitizeSyncError(err);
      await ctx.runMutation(internal.adActionsStore.failAction, {
        actionId,
        error: errorMsg,
      });
      throw new ConvexError({
        code: "execution_error",
        message: errorMsg,
      });
    } finally {
      await tracker.flush(ctx, workspaceId);
    }
  },
});

// ── 2. Change Budget Action (with Guardrails) ────────────────────────────────

export interface ChangeBudgetResult {
  success: boolean;
  actionId: Id<"adActions">;
  targetType: "campaign" | "adset";
  targetId: string;
  newDailyBudget: number;
}

export const changeBudget = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    targetType: v.union(v.literal("campaign"), v.literal("adset")),
    targetId: v.string(), // externalId
    newDailyBudget: v.number(), // Daily budget in EUR
  },
  handler: async (ctx, args): Promise<ChangeBudgetResult> => {
    // 1. KILL SWITCH: Fail closed immediately if not enabled
    assertWriteEnabled();

    if (args.newDailyBudget <= 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Dnevni budžet mora biti veći od 0.",
      });
    }

    // 2. Resolve Auth & Access Token
    const { userId, workspaceId, accessToken } = await resolveAuthAndToken(
      ctx,
      args.workspaceId,
    );

    // 3. Fetch Target Details
    const target: TargetInfo = await ctx.runQuery(
      internal.adActionsStore.getTargetForAction,
      {
        workspaceId,
        targetType: args.targetType,
        targetId: args.targetId,
      },
    );

    // 4. GUARDRAILS ENFORCEMENT
    const { minBudget, maxBudget, limitCurrency } = getBudgetBounds();
    const accountCurrency = (target.currency || "").trim().toUpperCase();

    // Nepoznata valuta NIJE dozvola da se nastavi. Granice budžeta su brojevi
    // bez značenja dok se ne zna u čemu su izražene — a ovde se menja iznos
    // koji se stvarno troši. Zato prazna valuta blokira, ne propušta.
    if (!accountCurrency) {
      throw new ConvexError({
        code: "currency_unknown",
        message:
          "Valuta naloga nije poznata, pa granice budžeta ne mogu da se provere. Pokreni sinhronizaciju naloga pa pokušaj ponovo.",
      });
    }

    if (accountCurrency !== limitCurrency) {
      throw new ConvexError({
        code: "currency_mismatch",
        message: `Granica budzeta je zadata u ${limitCurrency}, a nalog radi u ${accountCurrency}. Podesi granicu u valuti naloga pre nego sto menjas budzet.`,
      });
    }

    if (args.newDailyBudget < minBudget) {
      throw new ConvexError({
        code: "guardrail_violation",
        message: `Novi budžet (${args.newDailyBudget} ${limitCurrency}) je ispod minimalno dozvoljenog limita od ${minBudget} ${limitCurrency} (BUDGET_MIN).`,
      });
    }

    if (args.newDailyBudget > maxBudget) {
      throw new ConvexError({
        code: "guardrail_violation",
        message: `Novi budžet (${args.newDailyBudget} ${limitCurrency}) prelazi maksimalno dozvoljeni limit od ${maxBudget} ${limitCurrency} (BUDGET_MAX).`,
      });
    }

    const currentBudget = target.dailyBudget;
    // Bez poznatog trenutnog budzeta ograda od +/-50% ne postoji. Ranije se u
    // tom slucaju preskakala, sto je znacilo da je nepoznato stanje bilo
    // slabije zasticeno od poznatog. Sada blokira.
    if (currentBudget === undefined || currentBudget <= 0) {
      throw new ConvexError({
        code: "current_budget_unknown",
        message:
          "Trenutni dnevni budžet nije poznat, pa ograda od ±50% ne može da se izračuna. Pokreni sinhronizaciju naloga pa pokušaj ponovo.",
      });
    }

    {
      const minAllowed = Math.round(currentBudget * 0.5 * 100) / 100;
      const maxAllowed = Math.round(currentBudget * 1.5 * 100) / 100;
      const percentChange = Math.round(
        ((args.newDailyBudget - currentBudget) / currentBudget) * 100,
      );

      if (args.newDailyBudget < minAllowed || args.newDailyBudget > maxAllowed) {
        const currDisplay = accountCurrency ? `${currentBudget} ${accountCurrency}` : `${currentBudget}`;
        const newDisplay = accountCurrency ? `${args.newDailyBudget} ${accountCurrency}` : `${args.newDailyBudget}`;
        const minDisplay = accountCurrency ? `${minAllowed} ${accountCurrency}` : `${minAllowed}`;
        const maxDisplay = accountCurrency ? `${maxAllowed} ${accountCurrency}` : `${maxAllowed}`;
        throw new ConvexError({
          code: "guardrail_violation",
          message: `Promena budžeta sa ${currDisplay} na ${newDisplay} (${percentChange > 0 ? "+" : ""}${percentChange}%) prelazi dozvoljenu granicu od ±50% po jednoj akciji (dozvoljeno: ${minDisplay} – ${maxDisplay}).`,
        });
      }
    }

    // 5. Record Pending Action in Database (idempotency check)
    const actionId: Id<"adActions"> = await ctx.runMutation(
      internal.adActionsStore.recordPendingAction,
      {
        workspaceId,
        userId,
        targetType: args.targetType,
        targetId: args.targetId,
        targetName: target.name,
        action: "budget_change",
        params: JSON.stringify({
          newDailyBudget: args.newDailyBudget,
          previousDailyBudget: currentBudget,
          spendToday: target.spendToday,
        }),
      },
    );

    // Every ad write is a call to graph.facebook.com and counts against the
    // same allowance the syncs are rationing (P2).
    const tracker = createUsageTracker();

    // 6. Execute Graph API POST (Meta expects daily_budget in cents)
    const budgetCents = Math.round(args.newDailyBudget * 100);
    const version = getMetaGraphVersion();
    const url = `${META_GRAPH_BASE_URL}/${version}/${args.targetId}`;

    const formData = new URLSearchParams();
    formData.append("daily_budget", String(budgetCents));
    formData.append("access_token", accessToken);

    try {
      const res = await tracker.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const json = (await res.json().catch(() => ({}))) as RawGraphApiResponse<Record<string, unknown>>;

      if (!res.ok || json.error) {
        const errorMsg = extractMetaAdsError(json.error || json);
        await ctx.runMutation(internal.adActionsStore.failAction, {
          actionId,
          error: errorMsg,
          apiResponse: sanitizeApiResponse(json),
        });
        throw new ConvexError({
          code: "meta_api_error",
          message: `Greška Meta API-ja: ${errorMsg}`,
        });
      }

      // 7. Complete Action on Success
      await ctx.runMutation(internal.adActionsStore.completeAction, {
        actionId,
        newDailyBudget: args.newDailyBudget,
        apiResponse: sanitizeApiResponse(json),
      });

      return {
        success: true,
        actionId,
        targetType: args.targetType,
        targetId: args.targetId,
        newDailyBudget: args.newDailyBudget,
      };
    } catch (err: unknown) {
      if (err instanceof ConvexError) throw err;
      const errorMsg = sanitizeSyncError(err);
      await ctx.runMutation(internal.adActionsStore.failAction, {
        actionId,
        error: errorMsg,
      });
      throw new ConvexError({
        code: "execution_error",
        message: errorMsg,
      });
    } finally {
      await tracker.flush(ctx, workspaceId);
    }
  },
});

// ── 3. Duplicate Ad Action (Created PAUSED) ──────────────────────────────────

export interface DuplicateAdResult {
  success: boolean;
  actionId: Id<"adActions">;
  originalAdId: string;
  copiedAdId?: string;
  name: string;
  status: "PAUSED";
}

export const duplicateAd = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    adId: v.string(), // externalId of ad
    newName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<DuplicateAdResult> => {
    // 1. KILL SWITCH: Fail closed immediately if not enabled
    assertWriteEnabled();

    // 2. Resolve Auth & Access Token
    const { userId, workspaceId, accessToken } = await resolveAuthAndToken(
      ctx,
      args.workspaceId,
    );

    // 3. Fetch Target Details
    const target: TargetInfo = await ctx.runQuery(
      internal.adActionsStore.getTargetForAction,
      {
        workspaceId,
        targetType: "ad",
        targetId: args.adId,
      },
    );

    const generatedName = args.newName?.trim() || `${target.name} (Kopija)`;

    // 4. Record Pending Action in Database
    const actionId: Id<"adActions"> = await ctx.runMutation(
      internal.adActionsStore.recordPendingAction,
      {
        workspaceId,
        userId,
        targetType: "ad",
        targetId: args.adId,
        targetName: target.name,
        action: "duplicate",
        params: JSON.stringify({
          newName: generatedName,
          originalStatus: target.status,
          createdStatus: "PAUSED",
        }),
      },
    );

    // Every ad write is a call to graph.facebook.com and counts against the
    // same allowance the syncs are rationing (P2).
    const tracker = createUsageTracker();

    // 5. Execute Graph API POST /<ad_id>/copies
    const version = getMetaGraphVersion();
    const url = `${META_GRAPH_BASE_URL}/${version}/${args.adId}/copies`;

    const formData = new URLSearchParams();
    formData.append("status_option", "PAUSED");
    if (generatedName) {
      formData.append("name", generatedName);
    }
    formData.append("access_token", accessToken);

    try {
      const res = await tracker.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const json = (await res.json().catch(() => ({}))) as {
        copied_ad_id?: string;
        id?: string;
        success?: boolean;
        error?: unknown;
      };

      if (!res.ok || json.error) {
        const errorMsg = extractMetaAdsError(json.error || json);
        await ctx.runMutation(internal.adActionsStore.failAction, {
          actionId,
          error: errorMsg,
          apiResponse: sanitizeApiResponse(json),
        });
        throw new ConvexError({
          code: "meta_api_error",
          message: `Greška Meta API-ja: ${errorMsg}`,
        });
      }

      const copiedExternalId = json.copied_ad_id || json.id;

      // 6. Complete Action on Success
      await ctx.runMutation(internal.adActionsStore.completeAction, {
        actionId,
        apiResponse: sanitizeApiResponse(json),
      });

      return {
        success: true,
        actionId,
        originalAdId: args.adId,
        copiedAdId: copiedExternalId,
        name: generatedName,
        status: "PAUSED",
      };
    } catch (err: unknown) {
      if (err instanceof ConvexError) throw err;
      const errorMsg = sanitizeSyncError(err);
      await ctx.runMutation(internal.adActionsStore.failAction, {
        actionId,
        error: errorMsg,
      });
      throw new ConvexError({
        code: "execution_error",
        message: errorMsg,
      });
    } finally {
      await tracker.flush(ctx, workspaceId);
    }
  },
});

// ── 4. Create Hook Version Action (Duplicate with New Hook Copy) ─────────────

export interface CreateHookVersionResult {
  success: boolean;
  actionId: Id<"adActions">;
  originalAdId: string;
  copiedAdId?: string;
  name: string;
  hookLabel: string;
  status: "PAUSED";
}

export const createHookVersion = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    sourceAdId: v.string(), // externalId of source ad
    newName: v.string(),
    hookLabel: v.string(),
    primaryText: v.string(),
    headline: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CreateHookVersionResult> => {
    // 1. KILL SWITCH: Fail closed immediately if not enabled
    assertWriteEnabled();

    // 2. Validate inputs
    const trimmedHookLabel = args.hookLabel.trim();
    if (!trimmedHookLabel) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Oznaka hook-a (Hook Label) ne sme biti prazna.",
      });
    }

    const trimmedName = args.newName.trim();
    if (!trimmedName) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Naziv novog oglasa ne sme biti prazan.",
      });
    }

    const trimmedPrimaryText = args.primaryText.trim();
    if (!trimmedPrimaryText) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Primarni tekst (hook tekst) ne sme biti prazan.",
      });
    }

    const trimmedHeadline = args.headline?.trim();

    // 3. Resolve Auth & Access Token
    const { userId, workspaceId, accessToken } = await resolveAuthAndToken(
      ctx,
      args.workspaceId,
    );

    // 4. GUARDRAIL: Max copies per ad set (MAX_HOOK_COPIES, default 5)
    const maxCopies = getMaxHookCopies();
    const existingCount: number = await ctx.runQuery(
      internal.adActionsStore.countAdsInAdSetByAdExternalId,
      {
        workspaceId,
        adExternalId: args.sourceAdId,
      },
    );

    if (existingCount >= maxCopies) {
      throw new ConvexError({
        code: "max_copies_exceeded",
        message: `Dostignut je maksimalan broj kopija po Ad Setu (${maxCopies}, definisano preko MAX_HOOK_COPIES).`,
      });
    }

    // 5. Fetch Source Ad details
    const sourceAd = await ctx.runQuery(
      internal.adActionsStore.getSourceAdForHookVersion,
      {
        workspaceId,
        adExternalId: args.sourceAdId,
      },
    );

    // 6. Record Pending Action in Database (idempotency check)
    const actionId: Id<"adActions"> = await ctx.runMutation(
      internal.adActionsStore.recordPendingAction,
      {
        workspaceId,
        userId,
        targetType: "ad",
        targetId: args.sourceAdId,
        targetName: sourceAd.name,
        action: "duplicate",
        params: JSON.stringify({
          newName: trimmedName,
          hookLabel: trimmedHookLabel,
          primaryText: trimmedPrimaryText,
          headline: trimmedHeadline,
          sourceAdId: args.sourceAdId,
          createdStatus: "PAUSED",
        }),
      },
    );

    // Every ad write is a call to graph.facebook.com and counts against the
    // same allowance the syncs are rationing (P2).
    const tracker = createUsageTracker();

    const version = getMetaGraphVersion();

    // 7. Execute Graph API POST /<sourceAdId>/copies (status_option: "PAUSED")
    const copiesUrl = `${META_GRAPH_BASE_URL}/${version}/${args.sourceAdId}/copies`;
    const formData = new URLSearchParams();
    formData.append("status_option", "PAUSED");
    formData.append("name", trimmedName);
    formData.append("access_token", accessToken);

    try {
      const copyRes = await tracker.fetch(copiesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const copyJson = (await copyRes.json().catch(() => ({}))) as {
        copied_ad_id?: string;
        id?: string;
        success?: boolean;
        error?: unknown;
      };

      if (!copyRes.ok || copyJson.error) {
        const errorMsg = extractMetaAdsError(copyJson.error || copyJson);
        await ctx.runMutation(internal.adActionsStore.failAction, {
          actionId,
          error: errorMsg,
          apiResponse: sanitizeApiResponse(copyJson),
        });
        throw new ConvexError({
          code: "meta_api_error",
          message: `Greška Meta API-ja pri dupliranju: ${errorMsg}`,
        });
      }

      const copiedExternalId = copyJson.copied_ad_id || copyJson.id || `copy_${Date.now()}`;
      let createdCreativeId = sourceAd.creativeId;

      // 8. Update creative fields on the fresh unpublished copy
      try {
        if (sourceAd.accountExternalId && sourceAd.creativeId) {
          const actId = normalizeAdAccountId(sourceAd.accountExternalId);
          // Fetch source creative details
          const creativeUrl = `${META_GRAPH_BASE_URL}/${version}/${sourceAd.creativeId}?fields=id,name,object_story_spec,asset_feed_spec,image_url,thumbnail_url,video_id&access_token=${accessToken}`;
          const crRes = await tracker.fetch(creativeUrl);
          if (crRes.ok) {
            const crJson = (await crRes.json().catch(() => ({}))) as {
              object_story_spec?: Record<string, unknown>;
              asset_feed_spec?: Record<string, unknown>;
            };

            if (crJson.object_story_spec) {
              const spec = JSON.parse(JSON.stringify(crJson.object_story_spec)) as Record<string, unknown>;
              if (spec.link_data && typeof spec.link_data === "object") {
                const linkData = spec.link_data as Record<string, unknown>;
                linkData.message = trimmedPrimaryText;
                if (trimmedHeadline) linkData.name = trimmedHeadline;
              }
              if (spec.video_data && typeof spec.video_data === "object") {
                const videoData = spec.video_data as Record<string, unknown>;
                videoData.message = trimmedPrimaryText;
                if (trimmedHeadline) videoData.title = trimmedHeadline;
              }

              // Create fresh creative on ad account
              const createCrUrl = `${META_GRAPH_BASE_URL}/${version}/${actId}/adcreatives`;
              const crFormData = new URLSearchParams();
              crFormData.append("name", `${trimmedName} (Creative)`);
              crFormData.append("object_story_spec", JSON.stringify(spec));
              crFormData.append("access_token", accessToken);

              const newCrRes = await tracker.fetch(createCrUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: crFormData.toString(),
              });

              const newCrJson = (await newCrRes.json().catch(() => ({}))) as { id?: string };
              if (newCrJson.id) {
                createdCreativeId = newCrJson.id;
                // Attach new creative to duplicated ad
                const updateAdUrl = `${META_GRAPH_BASE_URL}/${version}/${copiedExternalId}`;
                const adUpdateData = new URLSearchParams();
                adUpdateData.append("creative", JSON.stringify({ creative_id: newCrJson.id }));
                adUpdateData.append("access_token", accessToken);
                await tracker.fetch(updateAdUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: adUpdateData.toString(),
                });
              }
            }
          }
        }
      } catch (crErr) {
        console.warn("Creative update attempt on Meta Graph API:", sanitizeSyncError(crErr));
      }

      // 9. Complete Action on Success & Save new ad in Convex DB
      await ctx.runMutation(internal.adActionsStore.completeHookVersionAction, {
        actionId,
        createdAd: {
          externalId: copiedExternalId,
          name: trimmedName,
          status: "PAUSED",
          adSetId: sourceAd.adSetId,
          hookLabel: trimmedHookLabel,
          primaryText: trimmedPrimaryText,
          headline: trimmedHeadline,
          creativeId: createdCreativeId,
          thumbnailUrl: sourceAd.thumbnailUrl,
          previewUrl: sourceAd.previewUrl,
        },
        apiResponse: sanitizeApiResponse({ copy: copyJson, creativeId: createdCreativeId }),
      });

      return {
        success: true,
        actionId,
        originalAdId: args.sourceAdId,
        copiedAdId: copiedExternalId,
        name: trimmedName,
        hookLabel: trimmedHookLabel,
        status: "PAUSED",
      };
    } catch (err: unknown) {
      if (err instanceof ConvexError) throw err;
      const errorMsg = sanitizeSyncError(err);
      await ctx.runMutation(internal.adActionsStore.failAction, {
        actionId,
        error: errorMsg,
      });
      throw new ConvexError({
        code: "execution_error",
        message: errorMsg,
      });
    } finally {
      await tracker.flush(ctx, workspaceId);
    }
  },
});

