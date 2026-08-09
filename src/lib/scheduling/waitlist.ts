import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireRoles } from "@/lib/dal/auth";
import {
  createAppointmentForTenant,
  findAvailableSlots,
} from "@/lib/dal/operations";
import { enqueueNotificationStatement } from "@/lib/notifications/dispatcher";
import { pickChannel } from "@/lib/notifications/routing";
import { resolveLocale } from "@/lib/notifications/templates";
import {
  offerTtlMinutes,
  searchDays,
  selectOfferSlot,
  type MatchWindow,
} from "@/lib/scheduling/matching";

type WaitingEntry = {
  id: string;
  tenant_id: string;
  patient_id: string;
  doctor_id: string;
  service_id: string | null;
  preferred_from: string | null;
  preferred_to: string | null;
  consent_recorded_at: string | null;
  phone: string | null;
  email: string | null;
  preferred_language: string | null;
  doctor_name: string;
};

export type WaitlistSummary = {
  expired: number;
  scanned: number;
  offered: number;
};

export async function expireWaitlistOffers() {
  const sql = db();
  const expired = (await sql`
    UPDATE waitlist_offers
    SET status = 'expired', responded_at = now()
    WHERE status = 'sent' AND expires_at <= now()
    RETURNING id, tenant_id, waitlist_entry_id
  `) as Array<{ id: string; tenant_id: string; waitlist_entry_id: string }>;

  if (expired.length) {
    await sql.transaction(
      expired.map(
        (offer) => sql`
          UPDATE waitlist_entries SET status = 'waiting'
          WHERE id = ${offer.waitlist_entry_id}
            AND tenant_id = ${offer.tenant_id}
            AND status = 'offered'
        `,
      ),
    );
  }
  return expired.length;
}

export async function runWaitlistMatching(limit = 20): Promise<WaitlistSummary> {
  const sql = db();
  const expired = await expireWaitlistOffers();

  const entries = (await sql`
    SELECT w.id, w.tenant_id, w.patient_id, w.doctor_id, w.service_id,
      w.preferred_from, w.preferred_to, w.consent_recorded_at,
      p.phone, p.email, p.preferred_language,
      d.display_name AS doctor_name
    FROM waitlist_entries w
    JOIN patients p ON p.id = w.patient_id AND p.tenant_id = w.tenant_id
    JOIN doctors d ON d.id = w.doctor_id AND d.tenant_id = w.tenant_id AND d.active = true
    JOIN tenants t ON t.id = w.tenant_id AND t.status = 'active'
    WHERE w.status = 'waiting'
      AND w.doctor_id IS NOT NULL
      AND (w.expires_at IS NULL OR w.expires_at > now())
      AND NOT EXISTS (
        SELECT 1 FROM waitlist_offers o
        WHERE o.waitlist_entry_id = w.id AND o.status = 'sent'
      )
    ORDER BY w.priority, w.created_at
    LIMIT ${Math.min(Math.max(limit, 1), 50)}
  `) as WaitingEntry[];

  /**
   * Слот, уже обещанный кому-то действующим предложением, ещё не занят
   * записью — `findAvailableSlots` его вернёт. Резервируем такие слоты, иначе
   * два пациента получат приглашение на одно и то же время.
   */
  const reserved = (await sql`
    SELECT doctor_id, starts_at
    FROM waitlist_offers
    WHERE status = 'sent' AND expires_at > now() AND doctor_id IS NOT NULL
  `) as Array<{ doctor_id: string; starts_at: string }>;
  const taken = new Set(
    reserved.map(
      (offer) => `${offer.doctor_id}|${new Date(offer.starts_at).toISOString()}`,
    ),
  );
  const ttl = offerTtlMinutes();
  let offered = 0;

  for (const entry of entries) {
    const window: MatchWindow = {
      preferredFrom: entry.preferred_from,
      preferredTo: entry.preferred_to,
    };
    const slots = await findAvailableSlots(
      entry.tenant_id,
      entry.doctor_id,
      searchDays(window),
    );
    const slot = selectOfferSlot(slots, window, {
      taken,
      doctorId: entry.doctor_id,
    });
    if (!slot) continue;

    /**
     * Без зафиксированного согласия предложение не уходит пациенту наружу —
     * оно попадает в портал, и сотрудник связывается сам.
     */
    const channel = entry.consent_recorded_at
      ? pickChannel({ phone: entry.phone, email: entry.email })
      : ({ channel: "portal", recipient: null } as const);

    const offerId = randomUUID();
    const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
    const payload = {
      startsAt: slot.startsAt,
      expiresAt,
      doctorName: entry.doctor_name,
    };

    try {
      await sql.transaction([
        sql`
          INSERT INTO waitlist_offers (
            id, tenant_id, waitlist_entry_id, doctor_id, service_id, starts_at,
            duration_minutes, expires_at, channel, status
          ) VALUES (
            ${offerId}, ${entry.tenant_id}, ${entry.id}, ${entry.doctor_id},
            ${entry.service_id}, ${slot.startsAt}, ${slot.durationMinutes},
            ${expiresAt}, ${channel.channel}, 'sent'
          )
        `,
        sql`
          UPDATE waitlist_entries SET status = 'offered'
          WHERE id = ${entry.id} AND tenant_id = ${entry.tenant_id} AND status = 'waiting'
        `,
        enqueueNotificationStatement(sql, {
          tenantId: entry.tenant_id,
          patientId: entry.patient_id,
          appointmentId: null,
          channel: channel.channel,
          recipient: channel.recipient,
          templateCode: "waitlist_offer",
          locale: resolveLocale(entry.preferred_language),
          payload,
          dedupeKey: `waitlist_offer:${offerId}`,
        }),
        sql`
          INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload)
          VALUES (${entry.tenant_id}, 'waitlist.offer.created', 'waitlist_offer', ${offerId},
            ${JSON.stringify(payload)}::jsonb)
        `,
        sql`
          INSERT INTO audit_events (tenant_id, action, resource_type, resource_id, metadata)
          VALUES (${entry.tenant_id}, 'waitlist.offer.created', 'waitlist_offer', ${offerId},
            ${JSON.stringify({ channel: channel.channel })}::jsonb)
        `,
      ]);
      offered += 1;
    } catch (error) {
      const databaseError = error as { code?: string };
      // 23505 — параллельный прогон уже отправил предложение этой записи.
      if (databaseError.code !== "23505") throw error;
    }
  }

  return { expired, scanned: entries.length, offered };
}

type OfferRow = {
  id: string;
  waitlist_entry_id: string;
  patient_id: string;
  doctor_id: string | null;
  service_id: string | null;
  starts_at: string;
  status: string;
};

export async function respondToWaitlistOffer(
  offerId: string,
  action: "accept" | "decline" | "cancel",
  idempotencyKey: string,
) {
  const user = await requireRoles(["clinic_admin", "operator"]);
  const sql = db();
  const rows = (await sql`
    SELECT o.id, o.waitlist_entry_id, o.doctor_id, o.service_id, o.starts_at, o.status,
      w.patient_id
    FROM waitlist_offers o
    JOIN waitlist_entries w ON w.id = o.waitlist_entry_id AND w.tenant_id = o.tenant_id
    WHERE o.id = ${offerId} AND o.tenant_id = ${user.tenantId}
    LIMIT 1
  `) as OfferRow[];

  const offer = rows[0];
  if (!offer) throw new AppError("offer_not_found", 404, "Предложение не найдено.");
  if (offer.status !== "sent") {
    throw new AppError(
      "offer_not_active",
      409,
      "Это предложение уже закрыто.",
    );
  }

  if (action === "accept") {
    if (!offer.doctor_id) {
      throw new AppError("offer_doctor_missing", 409, "У предложения нет врача.");
    }
    const appointment = await createAppointmentForTenant(
      user.tenantId,
      user.id,
      {
        patientId: offer.patient_id,
        doctorId: offer.doctor_id,
        serviceId: offer.service_id,
        startsAt: new Date(offer.starts_at).toISOString(),
        reason: "Слот из листа ожидания",
        idempotencyKey,
      },
      "portal",
    );
    const appointmentId = String(appointment.id);
    await sql.transaction([
      sql`
        UPDATE waitlist_offers
        SET status = 'accepted', responded_at = now(), appointment_id = ${appointmentId}
        WHERE id = ${offer.id} AND tenant_id = ${user.tenantId} AND status = 'sent'
      `,
      sql`
        UPDATE waitlist_entries SET status = 'booked'
        WHERE id = ${offer.waitlist_entry_id} AND tenant_id = ${user.tenantId}
      `,
      sql`
        INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload)
        VALUES (${user.tenantId}, 'waitlist.offer.accepted', 'waitlist_offer', ${offer.id},
          ${JSON.stringify({ appointmentId })}::jsonb)
      `,
      sql`
        INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
        VALUES (${user.tenantId}, ${user.id}, 'waitlist.offer.accepted', 'waitlist_offer',
          ${offer.id}, ${JSON.stringify({ appointmentId })}::jsonb)
      `,
    ]);
    return { id: offer.id, status: "accepted", appointment };
  }

  const offerStatus = action === "decline" ? "declined" : "superseded";
  const entryStatus = action === "decline" ? "waiting" : "cancelled";
  await sql.transaction([
    sql`
      UPDATE waitlist_offers SET status = ${offerStatus}, responded_at = now()
      WHERE id = ${offer.id} AND tenant_id = ${user.tenantId} AND status = 'sent'
    `,
    sql`
      UPDATE waitlist_entries SET status = ${entryStatus}
      WHERE id = ${offer.waitlist_entry_id} AND tenant_id = ${user.tenantId}
    `,
    sql`
      INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
      VALUES (${user.tenantId}, ${user.id}, 'waitlist.offer.closed', 'waitlist_offer',
        ${offer.id}, ${JSON.stringify({ action })}::jsonb)
    `,
  ]);
  return { id: offer.id, status: offerStatus };
}
