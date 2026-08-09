import "server-only";

import { db } from "@/lib/db";

/**
 * Пациент может опоздать, поэтому визит закрывается как пропущенный только
 * после буфера от конца приёма. Значение настраивается клиникой.
 */
export function noShowGraceMinutes() {
  const configured = Number(process.env.NO_SHOW_GRACE_MINUTES);
  return Number.isFinite(configured) && configured >= 5 && configured <= 240
    ? Math.round(configured)
    : 30;
}

/** Старые визиты не размечаем: это была бы правка истории, а не операция дня. */
export const noShowLookbackDays = 7;

export type NoShowSummary = { marked: number; tasks: number };

type MarkedAppointment = {
  id: string;
  tenant_id: string;
  patient_id: string;
  starts_at: string;
};

export async function runNoShowSweep(limit = 50): Promise<NoShowSummary> {
  const sql = db();
  const grace = `${noShowGraceMinutes()} minutes`;
  const lookback = `${noShowLookbackDays} days`;

  const marked = (await sql`
    UPDATE appointments
    SET status = 'no_show', updated_at = now()
    WHERE id IN (
      SELECT id FROM appointments
      WHERE status = 'confirmed'
        AND ends_at < now() - ${grace}::interval
        AND ends_at > now() - ${lookback}::interval
      ORDER BY ends_at
      LIMIT ${Math.min(Math.max(limit, 1), 200)}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tenant_id, patient_id, starts_at
  `) as MarkedAppointment[];

  let tasks = 0;
  for (const appointment of marked) {
    await sql.transaction([
      sql`
        INSERT INTO appointment_history (
          tenant_id, appointment_id, from_status, to_status, reason
        ) VALUES (
          ${appointment.tenant_id}, ${appointment.id}, 'confirmed', 'no_show',
          'Автоматическая отметка: пациент не пришёл'
        )
      `,
      sql`
        INSERT INTO staff_tasks (
          tenant_id, patient_id, kind, title, description, priority, due_at
        ) VALUES (
          ${appointment.tenant_id}, ${appointment.patient_id}, 'no_show_followup',
          'Пропущенный визит — свяжитесь с пациентом',
          'Визит закрыт как no-show автоматически. Уточните причину и предложите новое время.',
          'normal', now() + interval '1 day'
        )
      `,
      sql`
        INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload)
        VALUES (${appointment.tenant_id}, 'appointment.no_show', 'appointment', ${appointment.id},
          ${JSON.stringify({ startsAt: new Date(appointment.starts_at).toISOString() })}::jsonb)
      `,
      sql`
        INSERT INTO audit_events (tenant_id, action, resource_type, resource_id, metadata)
        VALUES (${appointment.tenant_id}, 'appointment.no_show', 'appointment', ${appointment.id},
          ${JSON.stringify({ automatic: true })}::jsonb)
      `,
    ]);
    tasks += 1;
  }

  return { marked: marked.length, tasks };
}
