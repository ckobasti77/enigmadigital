"use node";

import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials } from "./lib/crypto";
import { createUsageTracker, type UsageTracker } from "./lib/metaRateLimit";
import {
  getMetaGraphVersion,
  META_GRAPH_BASE_URL,
  extractMetaAdsError,
  normalizeAdAccountId,
  sanitizeApiResponse,
  type RawGraphApiResponse,
} from "./lib/metaAdsApi";
import {
  validateCampaignInput,
  validateAdSetInput,
  validateAdInput,
  evaluateCreateBudgetGate,
  getMetaAdsMaxDailyBudget,
  buildCampaignParams,
  buildAdSetParams,
  buildAdParams,
  runValidateOnly,
  runCreateWithValidateOnly,
  type CampaignCreateInput,
  type AdSetCreateInput,
  type AdCreateInput,
  type AdCreativeInput,
} from "./lib/metaAdsWrite";
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

// ── 5. Kreiranje kampanje / ad seta / oglasa (MA8) ───────────────────────────
//
// Jedini korak koji troši stvarni novac, pa je pod tvrdim ogradama:
//   - assertWriteEnabled() prvi (ADS_WRITE_ENABLED === "true");
//   - sve kod-validacije i budžet-kapija PRE ijednog poziva ka Meti;
//   - svaki create ide kroz runCreateWithValidateOnly (validate_only, pa pravi);
//   - sve se kreira PAUSED (builderi u metaAdsWrite.ts hardkoduju status);
//   - audit red PRE mreže, po svakom objektu; idempotencija preko requestId nonce;
//   - delimičan pad se OZNAČAVA (ne briše): sve je PAUSED, nula potrošnje.
//
// getMetaAdsMaxDailyBudget() se dokumentuje ovde uz ostale env ograde: gornja
// granica dnevnog budžeta za NOVE kampanje, u valuti BUDGET_LIMIT_CURRENCY. Kad
// nije postavljena, vraća null i kreiranje je ISKLJUČENO — odsustvo granice nije
// dozvola.

const creativeArgValidator = v.union(
  v.object({
    kind: v.literal("existing_post"),
    objectStoryId: v.string(),
  }),
  v.object({
    kind: v.literal("link"),
    pageId: v.string(),
    instagramActorId: v.optional(v.string()),
    link: v.string(),
    message: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    imageHash: v.optional(v.string()),
    picture: v.optional(v.string()),
    callToActionType: v.optional(v.string()),
  }),
);

const campaignArgValidator = v.object({
  name: v.string(),
  objective: v.string(),
  specialAdCategories: v.array(v.string()),
});

const adSetArgValidator = v.object({
  name: v.string(),
  dailyBudget: v.number(),
  billingEvent: v.string(),
  optimizationGoal: v.string(),
  targeting: v.any(),
  promotedObject: v.optional(
    v.object({
      pixelId: v.optional(v.string()),
      customEventType: v.optional(v.string()),
      pageId: v.optional(v.string()),
    }),
  ),
});

const adArgValidator = v.object({
  name: v.string(),
  creative: creativeArgValidator,
});

type CampaignArg = { name: string; objective: string; specialAdCategories: string[] };
type AdSetArg = {
  name: string;
  dailyBudget: number;
  billingEvent: string;
  optimizationGoal: string;
  targeting: unknown;
  promotedObject?: { pixelId?: string; customEventType?: string; pageId?: string };
};
type AdArg = { name: string; creative: AdCreativeInput };

function toCampaignInput(c: CampaignArg): CampaignCreateInput {
  return {
    name: c.name,
    objective: c.objective,
    specialAdCategories: c.specialAdCategories,
  };
}

function toAdSetInput(s: AdSetArg): AdSetCreateInput {
  return {
    name: s.name,
    dailyBudget: s.dailyBudget,
    billingEvent: s.billingEvent,
    optimizationGoal: s.optimizationGoal,
    targeting: (s.targeting ?? {}) as Record<string, unknown>,
    promotedObject: s.promotedObject,
  };
}

function toAdInput(a: AdArg, adSetCreatedInThisFlow: boolean): AdCreateInput {
  return { name: a.name, creative: a.creative, adSetCreatedInThisFlow };
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Neispravni podaci.";
}

function summarizeTargeting(targeting?: Record<string, unknown>): string | undefined {
  const geo = targeting?.geo_locations as { countries?: string[] } | undefined;
  if (geo?.countries && geo.countries.length > 0) {
    return geo.countries.join(", ");
  }
  return undefined;
}

interface ResolvedAccount {
  actId: string;
  accountConvexId: Id<"adAccounts">;
  currency: string;
}

/** Nalazi izabrani Meta ad nalog za radni prostor (act_ id + valuta + Convex id). */
async function resolveMetaAccount(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  accountExternalId: string,
): Promise<ResolvedAccount> {
  const accounts: Array<{ _id: Id<"adAccounts">; externalId: string; currency: string }> =
    await ctx.runQuery(internal.metaAdsStore.getAccounts, {
      workspaceId,
      provider: "meta_ads",
    });
  const normalized = normalizeAdAccountId(accountExternalId);
  const acc = accounts.find(
    (a) => a.externalId === normalized || a.externalId === accountExternalId,
  );
  if (!acc) {
    throw new ConvexError({
      code: "missing_account",
      message:
        "Izabrani Meta nalog nije pronađen u ovom radnom prostoru. Pokreni sinhronizaciju naloga pa pokušaj ponovo.",
    });
  }
  return {
    actId: acc.externalId,
    accountConvexId: acc._id,
    currency: (acc.currency || "").trim(),
  };
}

interface CreateStepResult {
  externalId: string;
  reused: boolean;
}

/**
 * Kreira JEDAN objekat: idempotencija (preskoči već uspelo za isti nonce-ključ),
 * audit PRE mreže, validate_only→pravi poziv, pa complete/fail. Baca na neuspeh.
 */
async function createOneObject(
  ctx: ActionCtx,
  tracker: UsageTracker,
  step: {
    workspaceId: Id<"workspaces">;
    userId: Id<"users">;
    targetType: "campaign" | "adset" | "ad";
    targetId: string;
    action: "create_campaign" | "create_adset" | "create_ad";
    auditParams: string;
    url: string;
    body: URLSearchParams;
  },
): Promise<CreateStepResult> {
  // Idempotencija: ako je isti nonce-ključ već uspeo, vrati kreirani id bez mreže.
  const prior = await ctx.runQuery(internal.adActionsStore.findLatestActionByTarget, {
    workspaceId: step.workspaceId,
    targetType: step.targetType,
    targetId: step.targetId,
  });
  if (prior?.status === "success" && prior.apiResponse) {
    try {
      const parsed = JSON.parse(prior.apiResponse) as { createdExternalId?: string };
      if (parsed.createdExternalId) {
        return { externalId: parsed.createdExternalId, reused: true };
      }
    } catch {
      // pokvaren apiResponse ne sme da zaustavi kreiranje
    }
  }

  const actionId: Id<"adActions"> = await ctx.runMutation(
    internal.adActionsStore.recordPendingAction,
    {
      workspaceId: step.workspaceId,
      userId: step.userId,
      targetType: step.targetType,
      targetId: step.targetId,
      action: step.action,
      params: step.auditParams,
    },
  );

  try {
    const res = await runCreateWithValidateOnly(tracker.fetch, step.url, step.body);
    const externalId = typeof res.id === "string" ? res.id : "";
    if (!externalId) {
      throw new Error("Meta nije vratila ID kreiranog objekta.");
    }
    await ctx.runMutation(internal.adActionsStore.completeAction, {
      actionId,
      apiResponse: sanitizeApiResponse({ createdExternalId: externalId, raw: res }),
    });
    return { externalId, reused: false };
  } catch (err: unknown) {
    const msg = sanitizeSyncError(err);
    await ctx.runMutation(internal.adActionsStore.failAction, { actionId, error: msg });
    throw err instanceof Error ? err : new Error(msg);
  }
}

/** Ogleda kreirane objekte (šta god da postoji) u lokalnu bazu, sve PAUSED. */
async function mirrorCreatedToDb(
  ctx: ActionCtx,
  p: {
    workspaceId: Id<"workspaces">;
    accountConvexId: Id<"adAccounts">;
    campaignInput: CampaignCreateInput;
    adSetInput: AdSetCreateInput;
    adInput: AdCreateInput;
    campaignId?: string;
    adSetId?: string;
    adId?: string;
  },
): Promise<void> {
  if (!p.campaignId) return;

  const campaigns = [
    {
      externalId: p.campaignId,
      name: p.campaignInput.name,
      objective: p.campaignInput.objective,
      status: "PAUSED",
      syncPriority: "cold" as const,
    },
  ];

  const adSets =
    p.campaignId && p.adSetId
      ? [
          {
            externalId: p.adSetId,
            campaignExternalId: p.campaignId,
            name: p.adSetInput.name,
            status: "PAUSED",
            dailyBudget: p.adSetInput.dailyBudget,
            targetingSummary: summarizeTargeting(p.adSetInput.targeting),
          },
        ]
      : [];

  const ads =
    p.adSetId && p.adId
      ? [
          {
            externalId: p.adId,
            adSetExternalId: p.adSetId,
            name: p.adInput.name,
            status: "PAUSED",
          },
        ]
      : [];

  await ctx.runMutation(internal.metaAdsStore.upsertStructure, {
    workspaceId: p.workspaceId,
    accountId: p.accountConvexId,
    campaigns,
    adSets,
    ads,
  });
}

export interface CreateCampaignFullResult {
  status: "success" | "partial";
  allPaused: true;
  campaign?: { externalId: string; name: string };
  adSet?: { externalId: string; name: string };
  ad?: { externalId: string; name: string };
  created?: { campaignId?: string; adSetId?: string };
  failedAt?: "campaign" | "adset" | "ad";
  message?: string;
}

export const createCampaignFull = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    accountExternalId: v.string(),
    requestId: v.string(),
    campaign: campaignArgValidator,
    adSet: adSetArgValidator,
    ad: adArgValidator,
  },
  handler: async (ctx, args): Promise<CreateCampaignFullResult> => {
    // 1. KILL SWITCH
    assertWriteEnabled();

    // 2. Auth + izabrani nalog
    const { userId, workspaceId, accessToken } = await resolveAuthAndToken(
      ctx,
      args.workspaceId,
    );
    const account = await resolveMetaAccount(ctx, workspaceId, args.accountExternalId);

    // 3. Mapiranje ulaza
    const campaignInput = toCampaignInput(args.campaign);
    const adSetInput = toAdSetInput(args.adSet);
    const adInput = toAdInput(args.ad, true);

    // 4. Sloj A — kod-validacije PRE mreže (fail-fast)
    try {
      validateCampaignInput(campaignInput);
      validateAdSetInput(adSetInput);
      validateAdInput(adInput);
    } catch (e) {
      throw new ConvexError({ code: "validation_error", message: errMessage(e) });
    }

    // 5. Sloj A — budžet-kapija (valuta + META_ADS_MAX_DAILY_BUDGET + min)
    const { minBudget, limitCurrency } = getBudgetBounds();
    const gate = evaluateCreateBudgetGate({
      accountCurrency: account.currency,
      limitCurrency,
      maxDailyBudget: getMetaAdsMaxDailyBudget(),
      minBudget,
      dailyBudget: adSetInput.dailyBudget ?? 0,
    });
    if (!gate.ok) {
      throw new ConvexError({
        code: gate.code ?? "budget_blocked",
        message: gate.message ?? "Budžet nije dozvoljen.",
      });
    }

    // 6. Sloj B — sekvencijalni validate_only → pravi poziv
    const tracker = createUsageTracker();
    const version = getMetaGraphVersion();
    const base = `${META_GRAPH_BASE_URL}/${version}`;
    const nonce = args.requestId;
    const startTimeIso = new Date().toISOString();

    let campaignId: string | undefined;
    let adSetId: string | undefined;
    let adId: string | undefined;

    try {
      // 6.1 KAMPANJA
      try {
        const body = buildCampaignParams(campaignInput);
        body.set("access_token", accessToken);
        const res = await createOneObject(ctx, tracker, {
          workspaceId,
          userId,
          targetType: "campaign",
          targetId: `new:${nonce}:campaign`,
          action: "create_campaign",
          auditParams: JSON.stringify({
            name: campaignInput.name,
            objective: campaignInput.objective,
            specialAdCategories: campaignInput.specialAdCategories,
            accountExternalId: account.actId,
            createdStatus: "PAUSED",
          }),
          url: `${base}/${account.actId}/campaigns`,
          body,
        });
        campaignId = res.externalId;
      } catch (e) {
        await mirrorCreatedToDb(ctx, {
          workspaceId,
          accountConvexId: account.accountConvexId,
          campaignInput,
          adSetInput,
          adInput,
          campaignId,
          adSetId,
          adId,
        });
        return {
          status: "partial",
          allPaused: true,
          created: { campaignId, adSetId },
          failedAt: "campaign",
          message: errMessage(e),
        };
      }

      // 6.2 AD SET (traži pravi campaignId)
      try {
        const body = buildAdSetParams(adSetInput, campaignId, startTimeIso);
        body.set("access_token", accessToken);
        const res = await createOneObject(ctx, tracker, {
          workspaceId,
          userId,
          targetType: "adset",
          targetId: `new:${nonce}:adset`,
          action: "create_adset",
          auditParams: JSON.stringify({
            name: adSetInput.name,
            campaignId,
            dailyBudget: adSetInput.dailyBudget,
            billingEvent: adSetInput.billingEvent,
            optimizationGoal: adSetInput.optimizationGoal,
            createdStatus: "PAUSED",
          }),
          url: `${base}/${account.actId}/adsets`,
          body,
        });
        adSetId = res.externalId;
      } catch (e) {
        await mirrorCreatedToDb(ctx, {
          workspaceId,
          accountConvexId: account.accountConvexId,
          campaignInput,
          adSetInput,
          adInput,
          campaignId,
          adSetId,
          adId,
        });
        return {
          status: "partial",
          allPaused: true,
          created: { campaignId, adSetId },
          failedAt: "adset",
          message: errMessage(e),
        };
      }

      // 6.3 OGLAS (traži pravi adSetId)
      try {
        const body = buildAdParams(adInput, adSetId);
        body.set("access_token", accessToken);
        const res = await createOneObject(ctx, tracker, {
          workspaceId,
          userId,
          targetType: "ad",
          targetId: `new:${nonce}:ad`,
          action: "create_ad",
          auditParams: JSON.stringify({
            name: adInput.name,
            adSetId,
            creativeKind: adInput.creative.kind,
            createdStatus: "PAUSED",
          }),
          url: `${base}/${account.actId}/ads`,
          body,
        });
        adId = res.externalId;
      } catch (e) {
        await mirrorCreatedToDb(ctx, {
          workspaceId,
          accountConvexId: account.accountConvexId,
          campaignInput,
          adSetInput,
          adInput,
          campaignId,
          adSetId,
          adId,
        });
        return {
          status: "partial",
          allPaused: true,
          created: { campaignId, adSetId },
          failedAt: "ad",
          message: errMessage(e),
        };
      }

      // 6.4 Sve uspelo — mirror u bazu
      await mirrorCreatedToDb(ctx, {
        workspaceId,
        accountConvexId: account.accountConvexId,
        campaignInput,
        adSetInput,
        adInput,
        campaignId,
        adSetId,
        adId,
      });

      return {
        status: "success",
        allPaused: true,
        campaign: { externalId: campaignId, name: campaignInput.name },
        adSet: { externalId: adSetId, name: adSetInput.name },
        ad: { externalId: adId, name: adInput.name },
      };
    } finally {
      await tracker.flush(ctx, workspaceId);
    }
  },
});

export interface ValidateCampaignPlanResult {
  ok: boolean;
  gate: { ok: boolean; code?: string; message?: string };
  campaign: { codeOk: boolean; metaValidateOk?: boolean; error?: string };
  adSet: { codeOk: boolean; error?: string };
  ad: { codeOk: boolean; error?: string };
}

/**
 * Suvi prolaz za REZIME pre dugmeta: kod-validacije za sva tri objekta + kapija
 * + Metin validate_only SAMO za kampanju (bez zavisnosti). Ad set i oglas Meta
 * dodatno proverava tek pri kreiranju (validate_only im traži pravi roditeljski
 * id, koga u suvom prolazu nema). Ništa se ne kreira.
 */
export const validateCampaignPlan = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    accountExternalId: v.string(),
    campaign: campaignArgValidator,
    adSet: adSetArgValidator,
    ad: adArgValidator,
  },
  handler: async (ctx, args): Promise<ValidateCampaignPlanResult> => {
    assertWriteEnabled();

    const { workspaceId, accessToken } = await resolveAuthAndToken(ctx, args.workspaceId);
    const account = await resolveMetaAccount(ctx, workspaceId, args.accountExternalId);

    const campaignInput = toCampaignInput(args.campaign);
    const adSetInput = toAdSetInput(args.adSet);
    const adInput = toAdInput(args.ad, true);

    const campaign: ValidateCampaignPlanResult["campaign"] = { codeOk: true };
    const adSet: ValidateCampaignPlanResult["adSet"] = { codeOk: true };
    const ad: ValidateCampaignPlanResult["ad"] = { codeOk: true };

    try {
      validateCampaignInput(campaignInput);
    } catch (e) {
      campaign.codeOk = false;
      campaign.error = errMessage(e);
    }
    try {
      validateAdSetInput(adSetInput);
    } catch (e) {
      adSet.codeOk = false;
      adSet.error = errMessage(e);
    }
    try {
      validateAdInput(adInput);
    } catch (e) {
      ad.codeOk = false;
      ad.error = errMessage(e);
    }

    const { minBudget, limitCurrency } = getBudgetBounds();
    const gateResult = evaluateCreateBudgetGate({
      accountCurrency: account.currency,
      limitCurrency,
      maxDailyBudget: getMetaAdsMaxDailyBudget(),
      minBudget,
      dailyBudget: adSetInput.dailyBudget ?? 0,
    });

    // Metin validate_only samo za kampanju (bez zavisnosti), i to tek ako kod
    // i kapija dozvoljavaju — inače nema svrhe trošiti poziv.
    if (campaign.codeOk && gateResult.ok) {
      const tracker = createUsageTracker();
      const version = getMetaGraphVersion();
      try {
        const body = buildCampaignParams(campaignInput);
        body.set("access_token", accessToken);
        const vr = await runValidateOnly(
          tracker.fetch,
          `${META_GRAPH_BASE_URL}/${version}/${account.actId}/campaigns`,
          body,
        );
        campaign.metaValidateOk = vr.ok;
        if (!vr.ok && vr.error) campaign.error = vr.error;
      } finally {
        await tracker.flush(ctx, workspaceId);
      }
    }

    const ok =
      campaign.codeOk &&
      adSet.codeOk &&
      ad.codeOk &&
      gateResult.ok &&
      campaign.metaValidateOk !== false;

    return {
      ok,
      gate: { ok: gateResult.ok, code: gateResult.code, message: gateResult.message },
      campaign,
      adSet,
      ad,
    };
  },
});

