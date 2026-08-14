import "server-only";

import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/dal/auth";
import { AppError } from "@/lib/errors";
import type { PlatformTenantStatusInput } from "@/lib/validation/platform";

export async function getPlatformOverview() {
  const admin = await requirePlatformAdmin();
  const sql = db();
  const [tenants, attention, audit, totals, flags] = await Promise.all([
    sql`
      SELECT
        t.id, t.name, t.slug, t.status, t.locale, t.timezone,
        t.created_at, t.updated_at,
        COALESCE(s.plan, 'none') AS plan,
        COALESCE(s.status, 'missing') AS subscription_status,
        s.current_period_end,
        (SELECT count(*)::int FROM users u WHERE u.tenant_id = t.id) AS user_count,
        (SELECT count(*)::int FROM patients p WHERE p.tenant_id = t.id) AS patient_count,
        (SELECT count(*)::int FROM appointments a WHERE a.tenant_id = t.id) AS appointment_count,
        COALESCE((
          SELECT sum(uc.value)::bigint FROM usage_counters uc
          WHERE uc.tenant_id = t.id
            AND uc.period_start >= date_trunc('month', CURRENT_DATE)::date
        ), 0)::bigint AS usage_total,
        (SELECT count(*)::int FROM integrations i WHERE i.tenant_id = t.id) AS integration_total,
        (SELECT count(*)::int FROM integrations i
          WHERE i.tenant_id = t.id AND i.status = 'connected') AS integration_ready,
        (SELECT count(*)::int FROM outbox_events o
          WHERE o.tenant_id = t.id AND o.status IN ('pending', 'processing')) AS queue_pending,
        (SELECT count(*)::int FROM outbox_events o
          WHERE o.tenant_id = t.id AND o.status = 'failed') AS queue_failed,
        GREATEST(
          t.updated_at,
          COALESCE((SELECT max(a.created_at) FROM audit_events a WHERE a.tenant_id = t.id), t.created_at),
          COALESCE((SELECT max(m.created_at) FROM messages m WHERE m.tenant_id = t.id), t.created_at)
        ) AS last_activity_at
      FROM tenants t
      LEFT JOIN subscriptions s ON s.tenant_id = t.id
      ORDER BY
        CASE t.status WHEN 'active' THEN 0 WHEN 'suspended' THEN 1 ELSE 2 END,
        last_activity_at DESC
      LIMIT 100
    `,
    sql`
      SELECT * FROM (
        SELECT i.tenant_id, t.name AS tenant_name, 'integration'::text AS kind,
          i.provider AS subject, i.status AS status,
          COALESCE(i.config->>'lastError', 'Интеграция требует проверки') AS detail,
          COALESCE(i.last_checked_at, i.created_at) AS occurred_at
        FROM integrations i
        JOIN tenants t ON t.id = i.tenant_id
        WHERE i.status = 'error'
        UNION ALL
        SELECT s.tenant_id, t.name, 'subscription', s.plan, s.status,
          'Подписка требует внимания', s.created_at
        FROM subscriptions s
        JOIN tenants t ON t.id = s.tenant_id
        WHERE s.status IN ('past_due', 'cancelled')
        UNION ALL
        SELECT o.tenant_id, t.name, 'queue', o.topic, o.status,
          COALESCE(o.payload->>'lastError', 'Событие не доставлено'),
          COALESCE(o.processed_at, o.created_at)
        FROM outbox_events o
        JOIN tenants t ON t.id = o.tenant_id
        WHERE o.status = 'failed'
      ) issues
      ORDER BY occurred_at DESC
      LIMIT 20
    `,
    sql`
      SELECT a.id, a.action, a.resource_type, a.resource_id, a.result,
        a.metadata, a.created_at, u.full_name AS actor_name
      FROM platform_audit_events a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.created_at DESC
      LIMIT 30
    `,
    sql`
      SELECT
        count(*)::int AS tenant_count,
        count(*) FILTER (WHERE status = 'active')::int AS active_count,
        count(*) FILTER (
          WHERE status <> 'active'
            OR EXISTS (
              SELECT 1 FROM integrations i
              WHERE i.tenant_id = tenants.id AND i.status = 'error'
            )
            OR EXISTS (
              SELECT 1 FROM subscriptions s
              WHERE s.tenant_id = tenants.id
                AND s.status IN ('past_due', 'cancelled')
            )
            OR EXISTS (
              SELECT 1 FROM outbox_events o
              WHERE o.tenant_id = tenants.id AND o.status = 'failed'
            )
        )::int AS attention_count,
        COALESCE((SELECT count(*) FILTER (WHERE status = 'done')::numeric
          / NULLIF(count(*), 0) * 100 FROM outbox_events), 100)::numeric(5,1)
          AS delivery_rate,
        (SELECT count(*)::int FROM feature_flags WHERE enabled = true) AS enabled_flags,
        (SELECT count(*)::int FROM integration_requests
          WHERE status IN ('pending', 'processing')) AS pending_integrations
      FROM tenants
    `,
    sql`
      SELECT f.tenant_id, t.name AS tenant_name, f.key, f.enabled,
        f.config, f.updated_at
      FROM feature_flags f
      JOIN tenants t ON t.id = f.tenant_id
      ORDER BY f.updated_at DESC
      LIMIT 30
    `,
  ]);

  return {
    admin,
    tenants,
    attention,
    audit,
    flags,
    totals: totals[0],
    health: {
      database: "connected",
      voice: process.env.GEMINI_API_KEY ? "ready" : "provider_required",
      telephony:
        process.env.TELEPHONY_PROVIDER && process.env.TELEPHONY_API_KEY
          ? "ready"
          : "provider_required",
      damumed: "official_api_pending",
    },
  };
}

export async function updatePlatformTenantStatus(
  tenantId: string,
  input: PlatformTenantStatusInput,
  context: { ipHash?: string | null; requestId?: string | null } = {},
) {
  const admin = await requirePlatformAdmin();
  if (tenantId === admin.tenantId && input.status !== "active") {
    throw new AppError(
      "platform_home_tenant_protected",
      409,
      "Нельзя приостановить tenant, через который выдан платформенный доступ.",
    );
  }
  const sql = db();
  const current = (await sql`
    SELECT id, name, status FROM tenants WHERE id = ${tenantId} LIMIT 1
  `) as Array<{ id: string; name: string; status: string }>;
  if (!current[0]) {
    throw new AppError("tenant_not_found", 404, "Клиника не найдена.");
  }
  if (current[0].status === input.status) return current[0];

  await sql.transaction([
    sql`
      UPDATE tenants SET status = ${input.status}, updated_at = now()
      WHERE id = ${tenantId}
    `,
    sql`
      INSERT INTO platform_audit_events (
        actor_user_id, action, resource_type, resource_id, metadata,
        ip_hash, request_id
      ) VALUES (
        ${admin.id}, 'platform.tenant.status_changed', 'tenant', ${tenantId},
        ${JSON.stringify({ previous: current[0].status, next: input.status, tenantName: current[0].name })}::jsonb,
        ${context.ipHash || null}, ${context.requestId || null}
      )
    `,
  ]);
  return { ...current[0], status: input.status };
}
