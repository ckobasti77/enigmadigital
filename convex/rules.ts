"use node";

import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Resend as ResendClient } from "resend";
import { decryptCredentials } from "./lib/crypto";
import { createUsageTracker, type UsageTracker } from "./lib/metaRateLimit";
import type { Id } from "./_generated/dataModel";
import {
  getMetaGraphVersion,
  META_GRAPH_BASE_URL,
  extractMetaAdsError,
  type RawGraphApiResponse,
} from "./lib/metaAdsApi";
import { sanitizeSyncError } from "./lib/runSync";
import { CRON_LOCKS, withCronLock } from "./lib/cronLock";
import type { EvaluationRuleContext } from "./rulesStore";

// ── Email Notification Helpers ───────────────────────────────────────────────

function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://app.enigma-it.com"
  );
}

function formatMetricUnit(
  metric: "cpa" | "spend" | "ctr" | "cpc" | "roas",
  val: number,
): string {
  if (metric === "cpa" || metric === "spend" || metric === "cpc") {
    return `${val.toFixed(2)} €`;
  }
  if (metric === "ctr") {
    return `${val.toFixed(2)}%`;
  }
  if (metric === "roas") {
    return `${val.toFixed(2)}x`;
  }
  return String(val);
}

function getOperatorSymbol(op: "gt" | "gte" | "lt" | "lte"): string {
  switch (op) {
    case "gt":
      return ">";
    case "gte":
      return "≥";
    case "lt":
      return "<";
    case "lte":
      return "≤";
  }
}

function getMetricLabel(metric: "cpa" | "spend" | "ctr" | "cpc" | "roas"): string {
  switch (metric) {
    case "cpa":
      return "CPA (Cena po konverziji)";
    case "spend":
      return "Potrošnja (Spend)";
    case "ctr":
      return "CTR (Click-Through Rate)";
    case "cpc":
      return "CPC (Cena po kliku)";
    case "roas":
      return "ROAS (Povrat na uloženo)";
  }
}

function getScopeLabel(scope: "account" | "campaign" | "adset"): string {
  switch (scope) {
    case "account":
      return "Ad Nalog";
    case "campaign":
      return "Kampanja";
    case "adset":
      return "Ad Set";
  }
}

function buildRuleAlertHtml(opts: {
  ruleName: string;
  scope: "account" | "campaign" | "adset";
  targetName: string;
  metric: "cpa" | "spend" | "ctr" | "cpc" | "roas";
  observedValue: number;
  threshold: number;
  operator: "gt" | "gte" | "lt" | "lte";
  windowDays: number;
  impressions: number;
  actionTaken: "notify" | "pause" | "pause_and_notify" | "notify_only_write_disabled";
  deepLinkUrl: string;
}): string {
  const opSymbol = getOperatorSymbol(opts.operator);
  const metricLabel = getMetricLabel(opts.metric);
  const observedFormatted = formatMetricUnit(opts.metric, opts.observedValue);
  const thresholdFormatted = formatMetricUnit(opts.metric, opts.threshold);
  const scopeLabel = getScopeLabel(opts.scope);

  let actionText = "Poslato je email obaveštenje.";
  let actionColor = "#58c4ff";
  if (opts.actionTaken === "pause" || opts.actionTaken === "pause_and_notify") {
    actionText = "Objekat je automatski PAUZIRAN na Meta Ads nalogu.";
    actionColor = "#f59e0b";
  } else if (opts.actionTaken === "notify_only_write_disabled") {
    actionText =
      "Pauziranje je preskočeno (ADS_WRITE_ENABLED je isključen u podešavanjima sistema). Poslato je samo obaveštenje.";
    actionColor = "#94aad2";
  }

  return `<!doctype html>
<html lang="sr">
  <body style="margin:0;background:#070d19;padding:40px 16px;font-family:'Helvetica Neue',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;background:#131d31;border:1px solid rgba(96,128,180,0.28);border-radius:14px;">
      <tr>
        <td style="padding:32px 32px 16px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#58c4ff;">Enigma Command Center · Pravila</p>
          <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:#f3f7ff;font-weight:700;">Upozorenje: ${opts.ruleName}</h1>
          <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:rgba(193,211,245,0.75);">Aktivirano je automatsko pravilo za ${scopeLabel.toLowerCase()} <strong style="color:#f3f7ff;">${opts.targetName}</strong>.</p>
        </td>
      </tr>

      <tr>
        <td style="padding:0 32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1221;border:1px solid rgba(96,128,180,0.2);border-radius:10px;padding:16px;">
            <tr>
              <td style="padding:6px 12px;font-size:13px;color:rgba(193,211,245,0.7);">Ciljani objekat:</td>
              <td style="padding:6px 12px;font-size:13px;color:#f3f7ff;font-weight:600;text-align:right;">${opts.targetName} (${scopeLabel})</td>
            </tr>
            <tr>
              <td style="padding:6px 12px;font-size:13px;color:rgba(193,211,245,0.7);">Izmerena metrika:</td>
              <td style="padding:6px 12px;font-size:13px;color:#58c4ff;font-weight:700;text-align:right;">${observedFormatted} <span style="font-size:11px;color:rgba(193,211,245,0.6);">(${metricLabel})</span></td>
            </tr>
            <tr>
              <td style="padding:6px 12px;font-size:13px;color:rgba(193,211,245,0.7);">Uslov pravila:</td>
              <td style="padding:6px 12px;font-size:13px;color:#f3f7ff;text-align:right;">${opSymbol} ${thresholdFormatted} (prozor: ${opts.windowDays}d)</td>
            </tr>
            <tr>
              <td style="padding:6px 12px;font-size:13px;color:rgba(193,211,245,0.7);">Ukupno impresija:</td>
              <td style="padding:6px 12px;font-size:13px;color:#f3f7ff;text-align:right;">${opts.impressions.toLocaleString("sr-RS")}</td>
            </tr>
            <tr>
              <td style="padding:6px 12px;font-size:13px;color:rgba(193,211,245,0.7);">Izvršena akcija:</td>
              <td style="padding:6px 12px;font-size:13px;color:${actionColor};font-weight:600;text-align:right;">${actionText}</td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:8px 32px 24px;">
          <a href="${opts.deepLinkUrl}" style="display:inline-block;background:#58c4ff;color:#0b1221;font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;">Otvori u Command Center-u →</a>
        </td>
      </tr>

      <tr>
        <td style="padding:16px 32px 32px;border-top:1px solid rgba(96,128,180,0.15);">
          <p style="margin:0;font-size:12px;line-height:1.5;color:rgba(148,170,210,0.6);">Enigma IT Marketing Command Center · Automatski sistem zaštite budžeta.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendRuleNotificationEmail(opts: {
  ruleName: string;
  scope: "account" | "campaign" | "adset";
  targetName: string;
  targetId: string;
  metric: "cpa" | "spend" | "ctr" | "cpc" | "roas";
  observedValue: number;
  threshold: number;
  operator: "gt" | "gte" | "lt" | "lte";
  windowDays: number;
  impressions: number;
  actionTaken: "notify" | "pause" | "pause_and_notify" | "notify_only_write_disabled";
  allowedEmails: string[];
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn(
      `[rules] RESEND_API_KEY nije postavljen — preskačem slanje email notifikacije za pravilo "${opts.ruleName}" (${opts.targetName}).`,
    );
    return false;
  }

  // Resolve recipients
  const envAllowed = process.env.ALLOWED_EMAILS
    ? process.env.ALLOWED_EMAILS.split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const recipientSet = new Set<string>([...opts.allowedEmails, ...envAllowed]);
  const recipients = Array.from(recipientSet);

  if (recipients.length === 0) {
    console.warn(
      `[rules] Nema definisanih email adresa primalaca za pravilo "${opts.ruleName}".`,
    );
    return false;
  }

  const from = process.env.EMAIL_FROM ?? "Enigma <onboarding@resend.dev>";
  const baseUrl = getAppBaseUrl();
  const deepLinkUrl = `${baseUrl}/ads?campaignId=${encodeURIComponent(opts.targetId)}`;

  const subject = `${opts.metric.toUpperCase()} alert: ${opts.targetName}`;
  const html = buildRuleAlertHtml({
    ruleName: opts.ruleName,
    scope: opts.scope,
    targetName: opts.targetName,
    metric: opts.metric,
    observedValue: opts.observedValue,
    threshold: opts.threshold,
    operator: opts.operator,
    windowDays: opts.windowDays,
    impressions: opts.impressions,
    actionTaken: opts.actionTaken,
    deepLinkUrl,
  });

  const text = `Upozorenje pravila: ${opts.ruleName}\n\n` +
    `Objekat: ${opts.targetName} (${opts.scope})\n` +
    `Izmerena metrika: ${opts.metric.toUpperCase()} = ${formatMetricUnit(opts.metric, opts.observedValue)}\n` +
    `Prag pravila: ${getOperatorSymbol(opts.operator)} ${formatMetricUnit(opts.metric, opts.threshold)} (${opts.windowDays} dana, ${opts.impressions} impresija)\n` +
    `Akcija: ${opts.actionTaken}\n\n` +
    `Pregledaj detalje: ${deepLinkUrl}`;

  try {
    const resend = new ResendClient(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: recipients,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("[rules] Resend greška pri slanju emaila:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[rules] Neuspešno slanje email notifikacije:", sanitizeSyncError(err));
    return false;
  }
}

// ── Core Rule Evaluator Runner ───────────────────────────────────────────────

export interface EvaluationResultSummary {
  evaluatedRulesCount: number;
  totalTargetsChecked: number;
  firingsCount: number;
  notificationsSentCount: number;
  pausesExecutedCount: number;
  writeDisabledFallbacksCount: number;
}

async function runRuleEvaluations(
  ctx: ActionCtx,
  opts?: {
    specificRuleId?: string;
    specificWorkspaceId?: string;
  },
): Promise<EvaluationResultSummary> {
  const now = Date.now();
  const isWriteEnabled = process.env.ADS_WRITE_ENABLED === "true";

  const contexts: EvaluationRuleContext[] = await ctx.runQuery(
    internal.rulesStore.getEvaluationContext,
    {
      now,
      specificRuleId: opts?.specificRuleId as Id<"rules"> | undefined,
      specificWorkspaceId: opts?.specificWorkspaceId as
        | Id<"workspaces">
        | undefined,
    },
  );

  // A pause is a POST to graph.facebook.com and counts like any other Meta
  // call (P2). One tracker per workspace rather than one per pause: this loop
  // can walk several workspaces in a pass, and a usage reading belongs to the
  // workspace whose allowance it describes.
  const trackers = new Map<Id<"workspaces">, UsageTracker>();
  const trackerFor = (workspaceId: Id<"workspaces">): UsageTracker => {
    const existing = trackers.get(workspaceId);
    if (existing !== undefined) return existing;
    const created = createUsageTracker();
    trackers.set(workspaceId, created);
    return created;
  };

  let totalTargetsChecked = 0;
  let firingsCount = 0;
  let notificationsSentCount = 0;
  let pausesExecutedCount = 0;
  let writeDisabledFallbacksCount = 0;

  for (const item of contexts) {
    const { rule, targets, connection, allowedEmails } = item;
    const cond = rule.condition;

    for (const target of targets) {
      totalTargetsChecked++;

      // 1. Noise Filter: Check minimum impressions requirement
      if (target.impressions < cond.minImpressions) {
        // Skip decisions on statistical noise
        continue;
      }

      // 2. Compute Metric Value
      let metricValue = 0;
      if (cond.metric === "cpa") {
        if (target.results > 0) {
          metricValue = target.spend / target.results;
        } else if (target.spend > 0) {
          // If spend > 0 with 0 conversions, effective CPA is high
          metricValue = target.spend;
        } else {
          metricValue = 0;
        }
      } else if (cond.metric === "spend") {
        metricValue = target.spend;
      } else if (cond.metric === "ctr") {
        metricValue =
          target.impressions > 0
            ? (target.clicks / target.impressions) * 100
            : 0;
      } else if (cond.metric === "cpc") {
        metricValue = target.clicks > 0 ? target.spend / target.clicks : 0;
      } else if (cond.metric === "roas") {
        metricValue =
          target.spend > 0 ? target.conversionValue / target.spend : 0;
      }

      // 3. Condition Evaluation
      let conditionMet = false;
      switch (cond.operator) {
        case "gt":
          conditionMet = metricValue > cond.value;
          break;
        case "gte":
          conditionMet = metricValue >= cond.value;
          break;
        case "lt":
          conditionMet = metricValue < cond.value;
          break;
        case "lte":
          conditionMet = metricValue <= cond.value;
          break;
      }

      if (!conditionMet) {
        continue;
      }

      // 4. Cooldown Filter (Per target)
      if (target.isCoolingDown) {
        // Target is in active cooldown — do not fire again
        continue;
      }

      // 5. Action Execution & Safety Kill Switch
      let actionTaken: "notify" | "pause" | "pause_and_notify" | "notify_only_write_disabled" =
        "notify";
      let detailsMessage = "";

      const desiresPause =
        rule.action === "pause" || rule.action === "pause_and_notify";

      if (desiresPause) {
        if (isWriteEnabled) {
          // Attempt pause via Meta API
          let pauseSuccess = false;
          // Meta has already refused this workspace in this pass; the next
          // pause cannot land and asking extends the block (P2).
          if (
            connection?.encryptedCredentials &&
            !trackerFor(rule.workspaceId).throttled
          ) {
            try {
              const accessToken = await decryptCredentials(
                connection.encryptedCredentials,
              );
              if (accessToken && accessToken.trim()) {
                const version = getMetaGraphVersion();
                const url = `${META_GRAPH_BASE_URL}/${version}/${target.targetId}`;
                const formData = new URLSearchParams();
                formData.append("status", "PAUSED");
                formData.append("access_token", accessToken.trim());

                const res = await trackerFor(rule.workspaceId).fetch(url, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
                  body: formData.toString(),
                });

                const json = (await res.json().catch(() => ({}))) as RawGraphApiResponse<Record<string, unknown>>;
                if (res.ok && !json.error) {
                  pauseSuccess = true;
                  pausesExecutedCount++;
                  await ctx.runMutation(
                    internal.rulesStore.updateTargetStatusLocally,
                    {
                      workspaceId: rule.workspaceId,
                      targetType: target.targetType,
                      targetId: target.targetId,
                      newStatus: "PAUSED",
                    },
                  );
                } else {
                  const errStr = extractMetaAdsError(json.error || json);
                  console.error(
                    `[rules] Meta API pause call failed for target ${target.targetId}:`,
                    errStr,
                  );
                  detailsMessage = `Greška Meta API pauziranja: ${errStr}`;
                }
              }
            } catch (apiErr) {
              const sanitizedErr = sanitizeSyncError(apiErr);
              console.error("[rules] Decrypt or pause execution error:", sanitizedErr);
              detailsMessage = `Greška pri pauziranju: ${sanitizedErr}`;
            }
          }

          actionTaken = rule.action;
          if (!pauseSuccess && detailsMessage) {
            detailsMessage = `${rule.action === "pause_and_notify" ? "Pauziranje nije uspelo, ali je poslato obaveštenje" : "Pauziranje nije uspelo"}: ${detailsMessage}`;
          }
        } else {
          // Kill switch active: Write disabled -> fallback to notify-only
          actionTaken = "notify_only_write_disabled";
          writeDisabledFallbacksCount++;
          detailsMessage =
            "Pauziranje nije izvršeno: ADS_WRITE_ENABLED nije postavljen na 'true' (kill switch aktivan). Poslata je samo notifikacija.";
        }
      } else {
        actionTaken = "notify";
      }

      // 6. Notification Dispatch (Max 1 email per target per cooldown)
      let notified = false;
      const shouldNotify =
        rule.action === "notify" ||
        rule.action === "pause_and_notify" ||
        actionTaken === "notify_only_write_disabled";

      if (shouldNotify) {
        notified = await sendRuleNotificationEmail({
          ruleName: rule.name,
          scope: rule.scope,
          targetName: target.targetName,
          targetId: target.targetId,
          metric: cond.metric,
          observedValue: metricValue,
          threshold: cond.value,
          operator: cond.operator,
          windowDays: cond.windowDays,
          impressions: target.impressions,
          actionTaken,
          allowedEmails,
        });

        if (notified) {
          notificationsSentCount++;
        }
      }

      // 7. Record Firing Record
      await ctx.runMutation(internal.rulesStore.recordFiring, {
        workspaceId: rule.workspaceId,
        ruleId: rule._id,
        targetId: target.targetId,
        targetName: target.targetName,
        targetType: target.targetType,
        firedAt: now,
        metricValue: Number(metricValue.toFixed(2)),
        actionTaken,
        notified,
        details: detailsMessage || undefined,
      });

      firingsCount++;
    }
  }

  for (const [workspaceId, tracker] of trackers) {
    await tracker.flush(ctx, workspaceId);
  }

  return {
    evaluatedRulesCount: contexts.length,
    totalTargetsChecked,
    firingsCount,
    notificationsSentCount,
    pausesExecutedCount,
    writeDisabledFallbacksCount,
  };
}

// ── Public & Cron Actions ───────────────────────────────────────────────────

/**
 * 30-minute cron job entrypoint.
 */
export const evaluateRulesCron = internalAction({
  args: {},
  handler: async (ctx): Promise<EvaluationResultSummary> => {
    // One run at a time (P2). A pause is a Meta write, and two overlapping
    // evaluations would send the same pause twice.
    let summary: EvaluationResultSummary = {
      evaluatedRulesCount: 0,
      totalTargetsChecked: 0,
      firingsCount: 0,
      notificationsSentCount: 0,
      pausesExecutedCount: 0,
      writeDisabledFallbacksCount: 0,
    };
    await withCronLock(ctx, CRON_LOCKS.adRules, async () => {
      summary = await runRuleEvaluations(ctx);
    });
    return summary;
  },
});

/**
 * Internal action for evaluating specific rules or workspaces.
 */
export const evaluateRulesInternal = internalAction({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    ruleId: v.optional(v.id("rules")),
  },
  handler: async (ctx, args): Promise<EvaluationResultSummary> => {
    return await runRuleEvaluations(ctx, {
      specificRuleId: args.ruleId,
      specificWorkspaceId: args.workspaceId,
    });
  },
});

/**
 * Manual user trigger from UI or testing.
 */
export const manualEvaluateRules = action({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    ruleId: v.optional(v.id("rules")),
  },
  handler: async (ctx, args): Promise<EvaluationResultSummary> => {
    return await runRuleEvaluations(ctx, {
      specificRuleId: args.ruleId,
      specificWorkspaceId: args.workspaceId,
    });
  },
});
