import "server-only";

import { db } from "@/lib/db";
import { enqueueNotificationStatement } from "@/lib/notifications/dispatcher";
import { pickChannel } from "@/lib/notifications/routing";
import { resolveLocale } from "@/lib/notifications/templates";

const reminderLeadHours = 24;

type ReminderCandidate = {
  id: string;
  tenant_id: string;
  patient_id: string;
  starts_at: string;
  phone: string | null;
  email: string | null;
  preferred_language: string | null;
};

/**
 * Ставит напоминание в очередь на момент «за сутки до визита», а не на время
 * запуска cron: пациент получает сообщение тогда, когда оно полезно.
 */
export async function enqueueAppointmentReminders(limit = 100) {
  const sql = db();
  const candidates = (await sql`
    SELECT a.id, a.tenant_id, a.patient_id, a.starts_at,
      p.phone, p.email, p.preferred_language
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    WHERE a.status = 'confirmed'
      AND a.starts_at > now() + interval '24 hours'
      AND a.starts_at <= now() + interval '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.appointment_id = a.id AND n.template_code = 'appointment_reminder'
      )
    ORDER BY a.starts_at
    LIMIT ${Math.min(Math.max(limit, 1), 500)}
  `) as ReminderCandidate[];

  if (!candidates.length) return { created: 0 };

  await sql.transaction(
    candidates.map((candidate) => {
      const startsAt = new Date(candidate.starts_at);
      const channel = pickChannel({
        phone: candidate.phone,
        email: candidate.email,
      });
      return enqueueNotificationStatement(sql, {
        tenantId: candidate.tenant_id,
        patientId: candidate.patient_id,
        appointmentId: candidate.id,
        channel: channel.channel,
        recipient: channel.recipient,
        templateCode: "appointment_reminder",
        locale: resolveLocale(candidate.preferred_language),
        payload: { startsAt: startsAt.toISOString() },
        dedupeKey: `appointment_reminder:${candidate.id}`,
        scheduledAt: new Date(
          startsAt.getTime() - reminderLeadHours * 3_600_000,
        ).toISOString(),
      });
    }),
  );

  return { created: candidates.length };
}
