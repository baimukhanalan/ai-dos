import "server-only";

import { db } from "@/lib/db";

/**
 * Пациент может вернуться в диалог через час — закрывать сессию сразу нельзя.
 * Но и висеть открытой вечно она не должна: иначе «почему не записались»
 * молча теряет самый частый исход — разговор просто оборвался.
 */
export function abandonAfterHours() {
  const configured = Number(process.env.BOOKING_ABANDON_HOURS);
  return Number.isFinite(configured) && configured >= 1 && configured <= 72
    ? Math.round(configured)
    : 6;
}

export type AbandonSummary = { closed: number };

export async function closeAbandonedBookingSessions(limit = 100): Promise<AbandonSummary> {
  const sql = db();
  const idle = `${abandonAfterHours()} hours`;

  const closed = (await sql`
    UPDATE booking_sessions b
    SET stage = 'done', outcome = 'lost', lost_reason = 'abandoned',
      -- Деньги считаем по тому же правилу, что и в живом диалоге: минимальная
      -- опубликованная цена услуг специальности врача, иначе суммы нет.
      value_kzt = (
        SELECT min(s.price_kzt)::int
        FROM services s
        JOIN doctors d ON d.id = b.doctor_id AND d.tenant_id = s.tenant_id
        WHERE s.tenant_id = b.tenant_id
          AND s.active = true
          AND s.price_kzt IS NOT NULL
          AND (s.specialty_id IS NULL OR s.specialty_id = d.specialty_id)
      ),
      updated_at = now(), closed_at = now()
    WHERE b.id IN (
      SELECT id FROM booking_sessions
      WHERE outcome IS NULL
        AND updated_at < now() - ${idle}::interval
      ORDER BY updated_at
      LIMIT ${Math.min(Math.max(limit, 1), 500)}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING b.id, b.tenant_id
  `) as Array<{ id: string; tenant_id: string }>;

  for (const session of closed) {
    await sql`
      INSERT INTO audit_events (tenant_id, action, resource_type, resource_id, metadata)
      VALUES (${session.tenant_id}, 'booking.closed', 'booking_session', ${session.id},
        ${JSON.stringify({ outcome: "lost", lostReason: "abandoned", automatic: true })}::jsonb)
    `;
  }

  return { closed: closed.length };
}
