import "server-only";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal/auth";
import type { LostDemandItem, RevenueFunnel } from "@/lib/analytics/revenue";

/**
 * Выручка и потерянный спрос за текущий календарный месяц клиники. Считается
 * из фактических строк, без выдуманных коэффициентов: средняя цена услуги
 * берётся как запасной вариант, когда у конкретной услуги цена не задана.
 */
export async function getRevenueOverview() {
  const user = await requireUser();
  const sql = db();

  const [funnelRows, capturedRows, lostRows] = await Promise.all([
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId})
      SELECT
        (SELECT count(*)::int FROM conversations c
          WHERE c.tenant_id = ${user.tenantId}
            AND (c.started_at AT TIME ZONE context.timezone) >= date_trunc('month', now() AT TIME ZONE context.timezone)
        ) AS conversations,
        (SELECT count(*)::int FROM appointments a
          WHERE a.tenant_id = ${user.tenantId}
            AND (a.created_at AT TIME ZONE context.timezone) >= date_trunc('month', now() AT TIME ZONE context.timezone)
        ) AS bookings,
        (SELECT count(*)::int FROM appointments a
          WHERE a.tenant_id = ${user.tenantId}
            AND a.status = 'completed'
            AND (a.starts_at AT TIME ZONE context.timezone) >= date_trunc('month', now() AT TIME ZONE context.timezone)
        ) AS completed
      FROM context
    `,
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId}),
      avg_price AS (
        SELECT COALESCE(avg(price_kzt), 0)::numeric AS value
        FROM services WHERE tenant_id = ${user.tenantId} AND price_kzt IS NOT NULL
      )
      SELECT
        COALESCE(sum(COALESCE(s.price_kzt, ap.value)), 0)::bigint AS captured
      FROM context
      CROSS JOIN avg_price ap
      LEFT JOIN appointments a
        ON a.tenant_id = ${user.tenantId}
       AND a.status = 'completed'
       AND (a.starts_at AT TIME ZONE context.timezone) >= date_trunc('month', now() AT TIME ZONE context.timezone)
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
    `,
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId}),
      avg_price AS (
        SELECT COALESCE(avg(price_kzt), 0)::numeric AS value
        FROM services WHERE tenant_id = ${user.tenantId} AND price_kzt IS NOT NULL
      ),
      period AS (
        SELECT date_trunc('month', now() AT TIME ZONE context.timezone) AS start, context.timezone AS tz
        FROM context
      )
      SELECT
        (SELECT count(*)::int FROM appointments a, period p
          WHERE a.tenant_id = ${user.tenantId} AND a.status = 'no_show'
            AND (a.starts_at AT TIME ZONE p.tz) >= p.start) AS no_show,
        (SELECT count(*)::int FROM appointments a, period p
          WHERE a.tenant_id = ${user.tenantId} AND a.status = 'cancelled'
            AND (a.updated_at AT TIME ZONE p.tz) >= p.start) AS cancelled,
        (SELECT count(*)::int FROM urgent_requests u, period p
          WHERE u.tenant_id = ${user.tenantId} AND u.status = 'declined'
            AND (u.requested_at AT TIME ZONE p.tz) >= p.start) AS declined_urgent,
        (SELECT count(*)::int FROM waitlist_offers o, period p
          WHERE o.tenant_id = ${user.tenantId} AND o.status = 'expired'
            AND (o.created_at AT TIME ZONE p.tz) >= p.start) AS expired_offer,
        (SELECT value FROM avg_price) AS avg_price
    `,
  ]);

  const funnelRow = (funnelRows[0] || {}) as {
    conversations: number;
    bookings: number;
    completed: number;
  };
  const funnel: RevenueFunnel = {
    conversations: funnelRow.conversations || 0,
    bookingIntents: funnelRow.bookings || 0,
    bookings: funnelRow.bookings || 0,
    completed: funnelRow.completed || 0,
  };

  const captured = Number((capturedRows[0] as { captured: number })?.captured || 0);
  const lost = (lostRows[0] || {}) as Record<string, number>;
  const avgPrice = Number(lost.avg_price || 0);

  const lostDemand: LostDemandItem[] = [
    { key: "no_show", count: lost.no_show || 0, estimatedKzt: (lost.no_show || 0) * avgPrice },
    { key: "declined_urgent", count: lost.declined_urgent || 0, estimatedKzt: (lost.declined_urgent || 0) * avgPrice },
    { key: "expired_offer", count: lost.expired_offer || 0, estimatedKzt: (lost.expired_offer || 0) * avgPrice },
    { key: "cancelled", count: lost.cancelled || 0, estimatedKzt: (lost.cancelled || 0) * avgPrice },
  ].filter((item) => item.count > 0);

  return {
    user,
    funnel,
    capturedKzt: captured,
    avgPriceKzt: Math.round(avgPrice),
    lostDemand,
  };
}

/**
 * Операционная разведка: что именно спрашивают пациенты и на каком языке.
 * Реальные данные — из распознанных intent сообщений и языка диалогов за месяц.
 */
export async function getDemandIntelligence() {
  const user = await requireUser();
  const sql = db();
  const [intentRows, languageRows] = await Promise.all([
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId})
      SELECT m.intent, count(*)::int AS count
      FROM messages m, context
      WHERE m.tenant_id = ${user.tenantId}
        AND m.intent IS NOT NULL
        AND (m.created_at AT TIME ZONE context.timezone) >= date_trunc('month', now() AT TIME ZONE context.timezone)
      GROUP BY m.intent
      ORDER BY count DESC
      LIMIT 12
    `,
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId})
      SELECT c.language, count(*)::int AS count
      FROM conversations c, context
      WHERE c.tenant_id = ${user.tenantId}
        AND (c.started_at AT TIME ZONE context.timezone) >= date_trunc('month', now() AT TIME ZONE context.timezone)
      GROUP BY c.language
      ORDER BY count DESC
      LIMIT 6
    `,
  ]);
  return {
    user,
    intents: intentRows as Array<{ intent: string; count: number }>,
    languages: languageRows as Array<{ language: string; count: number }>,
  };
}

/**
 * Автономия AI: доля диалогов, закрытых без передачи человеку. Правильный KPI —
 * не «100% без операторов», а максимум безопасного автономного решения. Всё
 * из реальных строк: диалоги за месяц против диалогов с эскалацией.
 */
export async function getAutonomyStats() {
  const user = await requireUser();
  const sql = db();
  const rows = (await sql`
    WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId}),
    period AS (SELECT date_trunc('month', now() AT TIME ZONE context.timezone) AS start, context.timezone AS tz FROM context)
    SELECT
      (SELECT count(*)::int FROM conversations c, period p
        WHERE c.tenant_id = ${user.tenantId}
          AND (c.started_at AT TIME ZONE p.tz) >= p.start) AS conversations,
      (SELECT count(DISTINCT e.conversation_id)::int FROM escalations e, period p
        WHERE e.tenant_id = ${user.tenantId} AND e.conversation_id IS NOT NULL
          AND (e.created_at AT TIME ZONE p.tz) >= p.start) AS escalated_conversations,
      (SELECT count(*)::int FROM escalations e, period p
        WHERE e.tenant_id = ${user.tenantId} AND e.status = 'resolved'
          AND (e.created_at AT TIME ZONE p.tz) >= p.start) AS resolved,
      (SELECT count(*)::int FROM escalations e
        WHERE e.tenant_id = ${user.tenantId} AND e.status IN ('open', 'claimed')) AS open_now
  `) as Array<{
    conversations: number;
    escalated_conversations: number;
    resolved: number;
    open_now: number;
  }>;

  const row = rows[0] || { conversations: 0, escalated_conversations: 0, resolved: 0, open_now: 0 };
  const autonomy =
    row.conversations > 0
      ? Math.max(0, Math.min(1, 1 - row.escalated_conversations / row.conversations))
      : null;
  return {
    user,
    conversations: row.conversations,
    escalatedConversations: row.escalated_conversations,
    resolved: row.resolved,
    openNow: row.open_now,
    autonomyRate: autonomy,
  };
}
