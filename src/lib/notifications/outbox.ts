import "server-only";

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { db } from "@/lib/db";
import { enqueueNotificationStatement } from "@/lib/notifications/dispatcher";
import {
  maxDeliveryAttempts,
  pickChannel,
  retryDelayMs,
} from "@/lib/notifications/routing";
import { resolveLocale } from "@/lib/notifications/templates";

type Sql = NeonQueryFunction<false, false>;

/**
 * Соответствие события пациенто-ориентированному шаблону. `null` — событие
 * обрабатывается другим воркером и в очереди уведомлений не нуждается.
 */
export const outboxTemplates: Record<string, string | null> = {
  "appointment.confirmed": "appointment_confirmed",
  "appointment.rescheduled": "appointment_rescheduled",
  "appointment.cancelled": "appointment_cancelled",
  "appointment.no_show": "no_show_followup",
  "callback.created": "callback_received",
  "waitlist.offer.created": null,
  "waitlist.offer.expired": null,
  "waitlist.offer.accepted": null,
  "subscription.plan.changed": null,
  "branding.updated": null,
};

type OutboxEvent = {
  id: string;
  tenant_id: string;
  topic: string;
  aggregate_type: string;
  aggregate_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

type Recipient = {
  patientId: string | null;
  appointmentId: string | null;
  phone: string | null;
  email: string | null;
  language: string | null;
  payload: Record<string, unknown>;
};

/** Перенос уведомляет о новом времени, поэтому берём запись-замену. */
export function targetAppointmentId(event: OutboxEvent) {
  if (event.topic === "appointment.rescheduled") {
    const replacement = event.payload?.replacementId;
    if (typeof replacement === "string") return replacement;
  }
  return event.aggregate_id;
}

async function resolveAppointmentRecipient(
  sql: Sql,
  event: OutboxEvent,
): Promise<Recipient | null> {
  const appointmentId = targetAppointmentId(event);
  if (!appointmentId) return null;
  const rows = (await sql`
    SELECT a.id, a.patient_id, a.starts_at, p.phone, p.email, p.preferred_language
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    WHERE a.id = ${appointmentId} AND a.tenant_id = ${event.tenant_id}
    LIMIT 1
  `) as Array<{
    id: string;
    patient_id: string;
    starts_at: string;
    phone: string | null;
    email: string | null;
    preferred_language: string | null;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    patientId: row.patient_id,
    appointmentId: row.id,
    phone: row.phone,
    email: row.email,
    language: row.preferred_language,
    payload: { startsAt: new Date(row.starts_at).toISOString() },
  };
}

async function resolveCallbackRecipient(
  sql: Sql,
  event: OutboxEvent,
): Promise<Recipient | null> {
  if (!event.aggregate_id) return null;
  const rows = (await sql`
    SELECT c.id, c.phone, c.name,
      (SELECT p.id FROM patients p
        WHERE p.tenant_id = c.tenant_id AND p.phone = c.phone LIMIT 1) AS patient_id,
      (SELECT p.preferred_language FROM patients p
        WHERE p.tenant_id = c.tenant_id AND p.phone = c.phone LIMIT 1) AS preferred_language
    FROM callback_requests c
    WHERE c.id = ${event.aggregate_id} AND c.tenant_id = ${event.tenant_id}
    LIMIT 1
  `) as Array<{
    id: string;
    phone: string;
    name: string;
    patient_id: string | null;
    preferred_language: string | null;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    patientId: row.patient_id,
    appointmentId: null,
    phone: row.phone,
    email: null,
    language: row.preferred_language,
    payload: { patientName: row.name },
  };
}

export type OutboxSummary = {
  claimed: number;
  enqueued: number;
  skipped: number;
  unknown: number;
  failed: number;
};

/** Аренда на захваченное событие — как и в диспетчере уведомлений. */
const claimLease = "10 minutes";

export async function processOutbox(limit = 25): Promise<OutboxSummary> {
  const sql = db();
  await sql`
    UPDATE outbox_events SET status = 'pending'
    WHERE status = 'processing' AND available_at <= now()
  `;

  const claimed = (await sql`
    UPDATE outbox_events
    SET status = 'processing', attempts = attempts + 1,
      available_at = now() + ${claimLease}::interval
    WHERE id IN (
      SELECT id FROM outbox_events
      WHERE status IN ('pending', 'failed') AND available_at <= now()
      ORDER BY available_at
      LIMIT ${Math.min(Math.max(limit, 1), 100)}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tenant_id, topic, aggregate_type, aggregate_id, payload, attempts
  `) as OutboxEvent[];

  const summary: OutboxSummary = {
    claimed: claimed.length,
    enqueued: 0,
    skipped: 0,
    unknown: 0,
    failed: 0,
  };

  const done = (id: string) =>
    sql`UPDATE outbox_events SET status = 'done', processed_at = now() WHERE id = ${id}`;

  for (const event of claimed) {
    try {
      const template = outboxTemplates[event.topic];

      if (template === undefined) {
        await done(event.id);
        summary.unknown += 1;
        continue;
      }
      if (template === null) {
        await done(event.id);
        summary.skipped += 1;
        continue;
      }

      const recipient = event.topic.startsWith("appointment.")
        ? await resolveAppointmentRecipient(sql, event)
        : await resolveCallbackRecipient(sql, event);

      if (!recipient) {
        await done(event.id);
        summary.skipped += 1;
        continue;
      }

      const channel = pickChannel({
        phone: recipient.phone,
        email: recipient.email,
      });

      await sql.transaction([
        enqueueNotificationStatement(sql, {
          tenantId: event.tenant_id,
          patientId: recipient.patientId,
          appointmentId: recipient.appointmentId,
          channel: channel.channel,
          recipient: channel.recipient,
          templateCode: template,
          locale: resolveLocale(recipient.language),
          payload: recipient.payload,
          dedupeKey: `${event.topic}:${event.id}`,
        }),
        done(event.id),
      ]);
      summary.enqueued += 1;
    } catch (error) {
      console.error("outbox processing failed", event.id, error);
      const delay =
        event.attempts >= maxDeliveryAttempts
          ? "1 day"
          : `${Math.round(retryDelayMs(event.attempts) / 1000)} seconds`;
      await sql`
        UPDATE outbox_events
        SET status = 'failed', available_at = now() + ${delay}::interval
        WHERE id = ${event.id}
      `;
      summary.failed += 1;
    }
  }

  return summary;
}
