import "server-only";

import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/dal/auth";
import { AppError } from "@/lib/errors";
import type { PlatformTenantStatusInput } from "@/lib/validation/platform";
import type { PlatformOperationInput } from "@/lib/validation/platform-operations";

export async function getPlatformOverview() {
  const admin = await requirePlatformAdmin();
  const sql = db();
  const [tenants, attention, audit, totals, flags, payments, support, limitOverrides, settings, usageByMetric, whiteLabel] = await Promise.all([
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
    sql`
      SELECT p.id, p.tenant_id, t.name AS tenant_name, p.period_start, p.period_end,
        p.amount_kzt, p.status, p.provider, p.external_reference, p.note,
        p.created_at, p.updated_at, u.full_name AS created_by_name
      FROM platform_payment_records p
      JOIN tenants t ON t.id = p.tenant_id
      LEFT JOIN users u ON u.id = p.created_by
      ORDER BY p.updated_at DESC
      LIMIT 30
    `,
    sql`
      SELECT s.id, s.tenant_id, t.name AS tenant_name, s.subject, s.category,
        s.priority, s.status, s.description, s.created_at, s.updated_at,
        u.full_name AS assigned_to_name
      FROM platform_support_tickets s
      JOIN tenants t ON t.id = s.tenant_id
      LEFT JOIN users u ON u.id = s.assigned_to
      ORDER BY
        CASE s.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        CASE s.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        s.updated_at DESC
      LIMIT 40
    `,
    sql`
      SELECT l.tenant_id, t.name AS tenant_name, l.metric, l.limit_value, l.updated_at
      FROM tenant_limit_overrides l
      JOIN tenants t ON t.id = l.tenant_id
      ORDER BY l.updated_at DESC
    `,
    sql`SELECT key, value, updated_at FROM platform_settings ORDER BY key`,
    sql`
      SELECT metric, COALESCE(sum(value), 0)::bigint AS value
      FROM usage_counters
      WHERE period_start >= date_trunc('month', CURRENT_DATE)::date
      GROUP BY metric ORDER BY metric
    `,
    sql`
      SELECT t.id AS tenant_id, t.name AS tenant_name,
        COALESCE(ts.value, '{}'::jsonb) AS branding,
        (ts.value ? 'displayName' OR ts.value ? 'logoUrl' OR ts.value ? 'primaryColor') AS configured
      FROM tenants t
      LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id AND ts.key = 'branding'
      ORDER BY configured DESC, t.name
    `,
  ]);

  return {
    admin,
    tenants,
    attention,
    audit,
    flags,
    payments,
    support,
    limitOverrides,
    settings,
    usageByMetric,
    whiteLabel,
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

export async function applyPlatformOperation(
  input: PlatformOperationInput,
  context: { ipHash?: string | null; requestId?: string | null } = {},
) {
  const admin = await requirePlatformAdmin();
  const sql = db();
  const audit = (action: string, resourceType: string, resourceId: string | number | null, metadata: Record<string, unknown>) => sql`
    INSERT INTO platform_audit_events (
      actor_user_id, action, resource_type, resource_id, metadata, ip_hash, request_id
    ) VALUES (
      ${admin.id}, ${action}, ${resourceType}, ${resourceId == null ? null : String(resourceId)},
      ${JSON.stringify(metadata)}::jsonb, ${context.ipHash || null}, ${context.requestId || null}
    )
  `;

  if ("tenantId" in input) {
    const tenant = await sql`SELECT id, name FROM tenants WHERE id = ${input.tenantId} LIMIT 1`;
    if (!tenant[0]) throw new AppError("tenant_not_found", 404, "Клиника не найдена.");
  }

  switch (input.action) {
    case "subscription.update": {
      await sql.transaction([
        sql`
          INSERT INTO subscriptions (tenant_id, plan, status, current_period_end)
          VALUES (${input.tenantId}, ${input.plan}, ${input.status}, ${input.currentPeriodEnd})
          ON CONFLICT (tenant_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status,
            current_period_end = EXCLUDED.current_period_end
        `,
        audit("platform.subscription.updated", "tenant", input.tenantId, { plan: input.plan, status: input.status, currentPeriodEnd: input.currentPeriodEnd }),
      ]);
      return { ok: true };
    }
    case "limit.update": {
      await sql.transaction([
        sql`
          INSERT INTO tenant_limit_overrides (tenant_id, metric, limit_value, updated_by)
          VALUES (${input.tenantId}, ${input.metric}, ${input.limit}, ${admin.id})
          ON CONFLICT (tenant_id, metric) DO UPDATE SET limit_value = EXCLUDED.limit_value,
            updated_by = EXCLUDED.updated_by, updated_at = now()
        `,
        audit("platform.limit.updated", "tenant", input.tenantId, { metric: input.metric, limit: input.limit }),
      ]);
      return { ok: true };
    }
    case "payment.create": {
      const id = crypto.randomUUID();
      await sql.transaction([
        sql`
          INSERT INTO platform_payment_records (
            id, tenant_id, period_start, period_end, amount_kzt, status, provider, note, created_by
          ) VALUES (
            ${id}, ${input.tenantId}, ${input.periodStart}, ${input.periodEnd}, ${input.amountKzt},
            ${input.status}, 'manual', ${input.note}, ${admin.id}
          )
        `,
        audit("platform.payment.recorded", "payment", id, { tenantId: input.tenantId, amountKzt: input.amountKzt, status: input.status, provider: "manual" }),
      ]);
      return { ok: true, id };
    }
    case "support.create": {
      const id = crypto.randomUUID();
      await sql.transaction([
        sql`
          INSERT INTO platform_support_tickets (
            id, tenant_id, subject, category, priority, description, created_by
          ) VALUES (
            ${id}, ${input.tenantId}, ${input.subject}, ${input.category}, ${input.priority}, ${input.description}, ${admin.id}
          )
        `,
        audit("platform.support.created", "support_ticket", id, { tenantId: input.tenantId, priority: input.priority }),
      ]);
      return { ok: true, id };
    }
    case "support.status": {
      const rows = await sql`
        UPDATE platform_support_tickets SET status = ${input.status}, updated_at = now(),
          resolved_at = CASE WHEN ${input.status} IN ('resolved','closed') THEN now() ELSE null END,
          assigned_to = COALESCE(assigned_to, ${admin.id})
        WHERE id = ${input.ticketId} RETURNING id, tenant_id
      `;
      if (!rows[0]) throw new AppError("support_ticket_not_found", 404, "Тикет не найден.");
      await audit("platform.support.status_changed", "support_ticket", input.ticketId, { status: input.status, tenantId: rows[0].tenant_id });
      return { ok: true };
    }
    case "flag.update": {
      await sql.transaction([
        sql`
          INSERT INTO feature_flags (tenant_id, key, enabled, config)
          VALUES (${input.tenantId}, ${input.key}, ${input.enabled}, '{}'::jsonb)
          ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
        `,
        audit("platform.feature_flag.updated", "tenant", input.tenantId, { key: input.key, enabled: input.enabled }),
      ]);
      return { ok: true };
    }
    case "settings.update": {
      const value = { maintenanceMode: input.maintenanceMode, supportEmail: input.supportEmail, defaultLocale: input.defaultLocale, defaultTimezone: input.defaultTimezone };
      await sql.transaction([
        sql`
          INSERT INTO platform_settings (key, value, updated_by)
          VALUES ('operations', ${JSON.stringify(value)}::jsonb, ${admin.id})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
        `,
        audit("platform.settings.updated", "platform_settings", "operations", { maintenanceMode: input.maintenanceMode, defaultLocale: input.defaultLocale, defaultTimezone: input.defaultTimezone }),
      ]);
      return { ok: true };
    }
    case "branding.update": {
      await sql.transaction([
        sql`
          INSERT INTO tenant_settings (tenant_id, key, value)
          VALUES (${input.tenantId}, 'branding', ${JSON.stringify(input.branding)}::jsonb)
          ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        `,
        audit("platform.branding.updated", "tenant", input.tenantId, { configured: Boolean(input.branding.displayName || input.branding.logoUrl || input.branding.primaryColor) }),
      ]);
      return { ok: true };
    }
  }
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
