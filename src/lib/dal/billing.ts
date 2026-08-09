import "server-only";

import type { z } from "zod";
import { db } from "@/lib/db";
import { requireRoles, requireUser } from "@/lib/dal/auth";
import {
  brandingSettingsKey,
  defaultBranding,
  getTenantBranding,
} from "@/lib/branding";
import { getPlan, plans, planUsageState } from "@/lib/billing/plans";
import { usageMetricLabels, type UsageMetric } from "@/lib/billing/metrics";
import type { brandingSchema, planChangeSchema } from "@/lib/validation/billing";

type PlanChangeInput = z.infer<typeof planChangeSchema>;
type BrandingInput = z.infer<typeof brandingSchema>;

/**
 * Платёж выполняется вне AI Dos, пока владелец не подключит провайдера, —
 * поэтому смена тарифа фиксирует намерение и оставляет счёт на выставление.
 */
export function paymentState(planCode: string) {
  if (planCode === "pilot") return "not_required";
  return process.env.BILLING_PROVIDER ? "provider_pending" : "invoice_pending";
}

export async function getBillingOverview() {
  const user = await requireUser();
  const sql = db();
  const [subscriptions, counters, branding] = await Promise.all([
    sql`
      SELECT plan, status, current_period_end, billing_email, payment_provider,
        payment_state, cancel_at_period_end, created_at, updated_at
      FROM subscriptions WHERE tenant_id = ${user.tenantId} LIMIT 1
    `,
    sql`
      SELECT metric, value::int AS value
      FROM usage_counters
      WHERE tenant_id = ${user.tenantId}
        AND period_start = date_trunc('month', now())::date
    `,
    getTenantBranding(sql, user.tenantId),
  ]);

  const subscription = (subscriptions[0] || null) as {
    plan: string;
    status: string;
    current_period_end: string | null;
    billing_email: string | null;
    payment_provider: string;
    payment_state: string;
    cancel_at_period_end: boolean;
  } | null;

  const usage: Partial<Record<UsageMetric, number>> = {};
  for (const row of counters as Array<{ metric: string; value: number }>) {
    usage[row.metric as UsageMetric] = row.value;
  }

  const plan = getPlan(subscription?.plan);
  return {
    user,
    subscription,
    plan,
    plans: Object.values(plans),
    usage: planUsageState(plan, usage, usageMetricLabels),
    branding,
    billingProviderConfigured: Boolean(process.env.BILLING_PROVIDER),
  };
}

export async function changePlan(input: PlanChangeInput) {
  const user = await requireRoles(["clinic_admin"]);
  const sql = db();
  const state = paymentState(input.plan);

  const [rows] = await sql.transaction([
    sql`
      INSERT INTO subscriptions (tenant_id, plan, status, billing_email, payment_state, updated_at)
      VALUES (${user.tenantId}, ${input.plan}, 'trial', ${input.billingEmail}, ${state}, now())
      ON CONFLICT (tenant_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        billing_email = COALESCE(EXCLUDED.billing_email, subscriptions.billing_email),
        payment_state = EXCLUDED.payment_state,
        updated_at = now()
      RETURNING plan, status, payment_state, billing_email
    `,
    sql`
      INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload)
      VALUES (${user.tenantId}, 'subscription.plan.changed', 'subscription', null,
        ${JSON.stringify({ plan: input.plan, paymentState: state })}::jsonb)
    `,
    sql`
      INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
      VALUES (${user.tenantId}, ${user.id}, 'subscription.plan.changed', 'subscription',
        ${user.tenantId}, ${JSON.stringify({ plan: input.plan })}::jsonb)
    `,
  ]);

  return rows[0];
}

export async function updateBranding(input: BrandingInput) {
  const user = await requireRoles(["clinic_admin"]);
  const sql = db();
  const value = { ...defaultBranding, ...input };

  await sql.transaction([
    sql`
      INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
      VALUES (${user.tenantId}, ${brandingSettingsKey}, ${JSON.stringify(value)}::jsonb, now())
      ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `,
    sql`
      INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload)
      VALUES (${user.tenantId}, 'branding.updated', 'tenant', ${user.tenantId}, '{}'::jsonb)
    `,
    sql`
      INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id)
      VALUES (${user.tenantId}, ${user.id}, 'branding.updated', 'tenant', ${user.tenantId})
    `,
  ]);

  return value;
}
