/**
 * ============================================================================
 * OPENREPLY SQL QUERIES MODULE
 * ============================================================================
 *
 * IMPORTANT NOTE / ATTENTION:
 * The SQL queries below are written against the OpenReply open-source schema
 * (github.com/diwenne/openreply — Prisma models: Automation, DmLog, LinkClick,
 * TrackedLink).
 *
 * COLUMN NAMES, TABLE NAMES AND ENUM VALUES MUST BE RE-VERIFIED AGAINST
 * THE LIVE DATABASE ON THE FIRST REAL SYNC.
 *
 * Guidelines followed:
 * 1. Explicit column lists ONLY — NO "SELECT *".
 * 2. Case-sensitive quoted identifiers to match Prisma's default table/column names.
 * 3. Short-lived queries bounded by statement timeouts.
 * ============================================================================
 */

export type RawCampaignRow = {
  orCampaignId: string;
  name: string;
  keywords: string[] | string | null;
  active: boolean;
  dmsSent: number;
  dmsFailed: number;
  linkClicks: number;
};

export type RawDailyTotalRow = {
  date: string;
  dmsSent: number;
  linkClicks: number;
};

/**
 * Fetch all campaigns (Automations) along with aggregate DM sent/failed counts
 * and tracked link click counts.
 */
export const SELECT_CAMPAIGNS_STATS = `
SELECT
  a.id AS "orCampaignId",
  a.name AS "name",
  a.keywords AS "keywords",
  a."isActive" AS "active",
  COALESCE(dm_counts.dms_sent, 0)::int AS "dmsSent",
  COALESCE(dm_counts.dms_failed, 0)::int AS "dmsFailed",
  COALESCE(click_counts.link_clicks, 0)::int AS "linkClicks"
FROM "Automation" a
LEFT JOIN (
  SELECT
    "automationId",
    COUNT(*) FILTER (WHERE status = 'SENT') AS dms_sent,
    COUNT(*) FILTER (WHERE status = 'FAILED') AS dms_failed
  FROM "DmLog"
  GROUP BY "automationId"
) dm_counts ON dm_counts."automationId" = a.id
LEFT JOIN (
  SELECT
    "automationId",
    COUNT(*) AS link_clicks
  FROM "LinkClick"
  GROUP BY "automationId"
) click_counts ON click_counts."automationId" = a.id
ORDER BY a."createdAt" DESC;
`.trim();

/**
 * Fetch daily aggregate totals for sent DMs and link clicks for the last 90 days.
 */
export const SELECT_DAILY_TOTALS_90_DAYS = `
SELECT
  COALESCE(d.date, c.date) AS "date",
  COALESCE(d.dms_sent, 0)::int AS "dmsSent",
  COALESCE(c.link_clicks, 0)::int AS "linkClicks"
FROM (
  SELECT
    TO_CHAR(COALESCE("dmSentAt", "createdAt"), 'YYYY-MM-DD') AS date,
    COUNT(*)::int AS dms_sent
  FROM "DmLog"
  WHERE status = 'SENT'
    AND COALESCE("dmSentAt", "createdAt") >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY TO_CHAR(COALESCE("dmSentAt", "createdAt"), 'YYYY-MM-DD')
) d
FULL OUTER JOIN (
  SELECT
    TO_CHAR("createdAt", 'YYYY-MM-DD') AS date,
    COUNT(*)::int AS link_clicks
  FROM "LinkClick"
  WHERE "createdAt" >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY TO_CHAR("createdAt", 'YYYY-MM-DD')
) c ON d.date = c.date
WHERE COALESCE(d.date, c.date) IS NOT NULL
ORDER BY COALESCE(d.date, c.date) ASC;
`.trim();
