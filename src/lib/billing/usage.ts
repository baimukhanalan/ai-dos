import "server-only";

import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { UsageMetric } from "@/lib/billing/metrics";

type Sql = NeonQueryFunction<false, false>;

/**
 * Возвращает готовый запрос, чтобы счётчик увеличивался в той же транзакции,
 * что и само событие: иначе тариф расходится с фактом.
 */
export function usageIncrement(
  sql: Sql,
  tenantId: string,
  metric: UsageMetric,
  delta = 1,
) {
  return sql`
    INSERT INTO usage_counters (tenant_id, period_start, metric, value)
    VALUES (${tenantId}, date_trunc('month', now())::date, ${metric}, ${delta})
    ON CONFLICT (tenant_id, period_start, metric)
    DO UPDATE SET value = usage_counters.value + EXCLUDED.value
  `;
}

export async function recordUsage(
  sql: Sql,
  tenantId: string,
  metric: UsageMetric,
  delta = 1,
) {
  if (delta <= 0) return;
  await usageIncrement(sql, tenantId, metric, delta);
}
