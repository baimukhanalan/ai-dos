import "server-only";

import { db } from "@/lib/db";
import { requireRoles } from "@/lib/dal/auth";
import { AppError } from "@/lib/errors";

/**
 * Ручной повтор даёт ровно одну дополнительную попытку и не обнуляет счётчик:
 * журнал `delivery_attempts` должен оставаться сплошным.
 */
export async function retryNotification(id: string) {
  const user = await requireRoles(["clinic_admin", "operator"]);
  const sql = db();
  const rows = (await sql`
    UPDATE notifications
    SET status = 'queued', next_attempt_at = now(), last_error = null
    WHERE id = ${id} AND tenant_id = ${user.tenantId}
      AND status IN ('failed', 'blocked')
    RETURNING id, status, attempts
  `) as Array<{ id: string; status: string; attempts: number }>;

  if (!rows[0]) {
    throw new AppError(
      "notification_not_retryable",
      409,
      "Повторить можно только неудачное или заблокированное уведомление.",
    );
  }

  await sql`
    INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id)
    VALUES (${user.tenantId}, ${user.id}, 'notification.retried', 'notification', ${id})
  `;
  return rows[0];
}

export async function cancelNotification(id: string) {
  const user = await requireRoles(["clinic_admin", "operator"]);
  const sql = db();
  const rows = (await sql`
    UPDATE notifications
    SET status = 'cancelled'
    WHERE id = ${id} AND tenant_id = ${user.tenantId}
      AND status IN ('queued', 'failed', 'blocked')
    RETURNING id, status
  `) as Array<{ id: string; status: string }>;

  if (!rows[0]) {
    throw new AppError(
      "notification_not_cancellable",
      409,
      "Уведомление уже отправлено или отменено.",
    );
  }

  await sql`
    INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id)
    VALUES (${user.tenantId}, ${user.id}, 'notification.cancelled', 'notification', ${id})
  `;
  return rows[0];
}
