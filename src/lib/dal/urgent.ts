import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireRoles } from "@/lib/dal/auth";
import { createAppointmentForTenant, findAvailableSlots } from "@/lib/dal/operations";
import { enqueueNotificationStatement } from "@/lib/notifications/dispatcher";
import { pickChannel } from "@/lib/notifications/routing";
import { resolveLocale } from "@/lib/notifications/templates";
import { offerTtlMinutes } from "@/lib/scheduling/matching";
import { AppError } from "@/lib/errors";
import { linkedDoctorId } from "@/lib/dal/doctor";

export type UrgentDecisionInput =
  | { action: "approve"; startsAt: string; note?: string | null }
  | { action: "offer"; startsAt: string; note?: string | null }
  | { action: "decline"; note?: string | null };

type UrgentRow = {
  id: string;
  status: string;
  patient_id: string | null;
  doctor_id: string | null;
  booking_session_id: string | null;
  service_id: string | null;
  duration_minutes: number;
  doctor_name: string | null;
  phone: string | null;
  email: string | null;
  preferred_language: string | null;
  consent_recorded_at: string | null;
};

async function loadUrgent(sql: ReturnType<typeof db>, tenantId: string, id: string) {
  const rows = (await sql`
    SELECT u.id, u.status, u.patient_id, u.doctor_id, u.booking_session_id,
      b.service_id,
      COALESCE(
        (SELECT s.duration_minutes FROM services s
          WHERE s.id = b.service_id AND s.tenant_id = u.tenant_id),
        (SELECT min(r.slot_minutes) FROM schedule_rules r
          WHERE r.doctor_id = u.doctor_id AND r.tenant_id = u.tenant_id AND r.active = true),
        30
      )::int AS duration_minutes,
      d.display_name AS doctor_name,
      p.phone, p.email, p.preferred_language,
      (SELECT max(w.consent_recorded_at) FROM waitlist_entries w
        WHERE w.tenant_id = u.tenant_id AND w.patient_id = u.patient_id) AS consent_recorded_at
    FROM urgent_requests u
    LEFT JOIN booking_sessions b ON b.id = u.booking_session_id AND b.tenant_id = u.tenant_id
    LEFT JOIN doctors d ON d.id = u.doctor_id AND d.tenant_id = u.tenant_id
    LEFT JOIN patients p ON p.id = u.patient_id AND p.tenant_id = u.tenant_id
    WHERE u.id = ${id} AND u.tenant_id = ${tenantId}
    LIMIT 1
  `) as UrgentRow[];
  return rows[0];
}

/** Пациент, которому отказали или которого перенесли, остаётся в очереди. */
function ensureWaitlistStatement(
  sql: ReturnType<typeof db>,
  tenantId: string,
  row: UrgentRow,
) {
  return sql`
    INSERT INTO waitlist_entries (
      tenant_id, patient_id, doctor_id, service_id, status, preferred_from, preferred_to
    )
    SELECT ${tenantId}::uuid, ${row.patient_id}::uuid, ${row.doctor_id}::uuid,
      ${row.service_id}::uuid, 'waiting', now(), now() + interval '14 days'
    WHERE NOT EXISTS (
      SELECT 1 FROM waitlist_entries w
      WHERE w.tenant_id = ${tenantId}
        AND w.patient_id = ${row.patient_id}
        AND w.doctor_id = ${row.doctor_id}
        AND w.status IN ('waiting', 'offered')
    )
  `;
}

function closeBookingSessionStatement(
  sql: ReturnType<typeof db>,
  tenantId: string,
  row: UrgentRow,
  outcome: "booked" | "lost" | "escalated",
  lostReason: string | null,
  appointmentId: string | null,
  note: string,
) {
  return sql`
    UPDATE booking_sessions
    SET stage = 'done', outcome = ${outcome}, lost_reason = ${lostReason},
      outcome_note = ${note}, appointment_id = COALESCE(${appointmentId}::uuid, appointment_id),
      updated_at = now(), closed_at = now()
    WHERE id = ${row.booking_session_id}::uuid AND tenant_id = ${tenantId}
      AND outcome IS NULL
  `;
}

/**
 * Решение администратора по срочному запросу — три исхода вместо одного
 * «одобрено»:
 * - **approve**: пациента вписывают вне графика. Проверка рабочего окна
 *   снимается только здесь и только явным решением человека; защита от
 *   пересечения записей остаётся на уровне БД.
 * - **offer**: администратор предлагает другое штатное время. Оно проверяется
 *   по живому расписанию, иначе пациент получил бы предложение, которое
 *   невозможно подтвердить.
 * - **decline**: отказ. Пациент остаётся в листе ожидания, а сотруднику
 *   ставится задача связаться и объяснить.
 */
export async function resolveUrgentRequest(id: string, decision: UrgentDecisionInput) {
  const user = await requireRoles(["clinic_admin", "operator", "doctor"]);
  const sql = db();
  const row = await loadUrgent(sql, user.tenantId, id);

  if (!row) throw new AppError("urgent_not_found", 404, "Срочный запрос не найден.");
  if (user.role === "doctor") {
    const doctorId = await linkedDoctorId(user);
    if (row.doctor_id !== doctorId) {
      throw new AppError(
        "urgent_not_found",
        404,
        "Срочный запрос не найден.",
      );
    }
  }
  if (row.status !== "pending") {
    throw new AppError("urgent_not_pending", 409, "Этот запрос уже обработан.");
  }
  if (!row.patient_id) {
    throw new AppError("urgent_patient_missing", 409, "В запросе нет пациента.");
  }
  if (decision.action !== "decline" && !row.doctor_id) {
    throw new AppError("urgent_doctor_missing", 409, "В запросе не выбран врач.");
  }

  const note = decision.note?.trim() || null;

  if (decision.action === "approve") {
    const appointment = (await createAppointmentForTenant(
      user.tenantId,
      user.id,
      {
        patientId: row.patient_id,
        doctorId: row.doctor_id as string,
        serviceId: row.service_id,
        startsAt: decision.startsAt,
        reason: "Приём вне графика по решению администратора",
        idempotencyKey: `urgent:${row.id}`,
      },
      "portal",
      { allowOutsideSchedule: true },
    )) as { id?: string };
    const appointmentId = appointment.id ? String(appointment.id) : null;

    await sql.transaction([
      sql`
        UPDATE urgent_requests
        SET status = 'approved', resolved_by = ${user.id}, resolved_at = now(),
          resolution_note = ${note}, proposed_starts_at = ${decision.startsAt},
          appointment_id = ${appointmentId}
        WHERE id = ${row.id} AND tenant_id = ${user.tenantId} AND status = 'pending'
      `,
      ...(row.booking_session_id
        ? [
            closeBookingSessionStatement(
              sql,
              user.tenantId,
              row,
              "booked",
              null,
              appointmentId,
              "Принят вне графика решением администратора",
            ),
          ]
        : []),
      sql`
        INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
        VALUES (${user.tenantId}, ${user.id}, 'urgent.approved', 'urgent_request', ${row.id},
          ${JSON.stringify({ appointmentId, startsAt: decision.startsAt, outsideSchedule: true })}::jsonb)
      `,
    ]);

    return { id: row.id, status: "approved", appointmentId };
  }

  if (decision.action === "offer") {
    // Предложение должно быть подтверждаемым: принимает его пациент обычным
    // путём листа ожидания, где проверка расписания действует.
    const slots = await findAvailableSlots(user.tenantId, row.doctor_id as string, 14);
    const target = new Date(decision.startsAt).getTime();
    const slot = slots.find((item) => new Date(item.startsAt).getTime() === target);
    if (!slot) {
      throw new AppError(
        "slot_not_available",
        409,
        "Это время недоступно в расписании врача. Чтобы принять вне графика, используйте «Одобрить».",
      );
    }

    const entryRows = (await sql`
      SELECT id FROM waitlist_entries
      WHERE tenant_id = ${user.tenantId} AND patient_id = ${row.patient_id}
        AND doctor_id = ${row.doctor_id} AND status IN ('waiting', 'offered')
      ORDER BY created_at DESC
      LIMIT 1
    `) as Array<{ id: string }>;
    const entryId =
      entryRows[0]?.id ??
      (
        (await sql`
          INSERT INTO waitlist_entries (
            tenant_id, patient_id, doctor_id, service_id, status, preferred_from, preferred_to
          ) VALUES (
            ${user.tenantId}, ${row.patient_id}, ${row.doctor_id}, ${row.service_id},
            'waiting', now(), now() + interval '14 days'
          )
          RETURNING id
        `) as Array<{ id: string }>
      )[0]?.id;

    if (!entryId) {
      throw new AppError("waitlist_entry_failed", 500, "Не удалось поставить пациента в очередь.");
    }

    const offerId = randomUUID();
    const expiresAt = new Date(Date.now() + offerTtlMinutes() * 60_000).toISOString();
    const payload = {
      startsAt: slot.startsAt,
      expiresAt,
      doctorName: row.doctor_name,
    };
    // Без зафиксированного согласия предложение остаётся в портале — то же
    // правило, что и в воркере листа ожидания.
    const channel = row.consent_recorded_at
      ? pickChannel({ phone: row.phone, email: row.email })
      : ({ channel: "portal", recipient: null } as const);

    await sql.transaction([
      sql`
        INSERT INTO waitlist_offers (
          id, tenant_id, waitlist_entry_id, doctor_id, service_id, starts_at,
          duration_minutes, expires_at, channel, status
        ) VALUES (
          ${offerId}, ${user.tenantId}, ${entryId}, ${row.doctor_id}, ${row.service_id},
          ${slot.startsAt}, ${slot.durationMinutes}, ${expiresAt}, ${channel.channel}, 'sent'
        )
      `,
      sql`
        UPDATE waitlist_entries SET status = 'offered'
        WHERE id = ${entryId} AND tenant_id = ${user.tenantId} AND status = 'waiting'
      `,
      enqueueNotificationStatement(sql, {
        tenantId: user.tenantId,
        patientId: row.patient_id,
        appointmentId: null,
        channel: channel.channel,
        recipient: channel.recipient,
        templateCode: "waitlist_offer",
        locale: resolveLocale(row.preferred_language),
        payload,
        dedupeKey: `waitlist_offer:${offerId}`,
      }),
      sql`
        UPDATE urgent_requests
        SET status = 'alternative_offered', resolved_by = ${user.id}, resolved_at = now(),
          resolution_note = ${note}, proposed_starts_at = ${slot.startsAt}
        WHERE id = ${row.id} AND tenant_id = ${user.tenantId} AND status = 'pending'
      `,
      ...(row.booking_session_id
        ? [
            // Решение принял человек и предложил конкретное время — исход
            // разговора «передан человеку», а не «потерян»: результат теперь
            // отслеживает лист ожидания.
            closeBookingSessionStatement(
              sql,
              user.tenantId,
              row,
              "escalated",
              null,
              null,
              "Администратор предложил другое время",
            ),
          ]
        : []),
      sql`
        INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload)
        VALUES (${user.tenantId}, 'waitlist.offer.created', 'waitlist_offer', ${offerId},
          ${JSON.stringify(payload)}::jsonb)
      `,
      sql`
        INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
        VALUES (${user.tenantId}, ${user.id}, 'urgent.alternative_offered', 'urgent_request', ${row.id},
          ${JSON.stringify({ offerId, startsAt: slot.startsAt })}::jsonb)
      `,
    ]);

    return { id: row.id, status: "alternative_offered", offerId };
  }

  await sql.transaction([
    sql`
      UPDATE urgent_requests
      SET status = 'declined', resolved_by = ${user.id}, resolved_at = now(),
        resolution_note = ${note}
      WHERE id = ${row.id} AND tenant_id = ${user.tenantId} AND status = 'pending'
    `,
    ...(row.booking_session_id
      ? [
          closeBookingSessionStatement(
            sql,
            user.tenantId,
            row,
            "lost",
            "no_slot",
            null,
            note || "Администратор отказал в приёме вне графика",
          ),
        ]
      : []),
    ensureWaitlistStatement(sql, user.tenantId, row),
    sql`
      INSERT INTO staff_tasks (
        tenant_id, patient_id, kind, title, description, priority, due_at
      ) VALUES (
        ${user.tenantId}, ${row.patient_id}, 'urgent_declined',
        'Отказ во внеплановом приёме — свяжитесь с пациентом',
        ${`Пациент просил принять вне графика, администратор отказал. ${note || "Причина не указана."} Пациент оставлен в листе ожидания.`},
        'high', now() + interval '4 hours'
      )
    `,
    sql`
      INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
      VALUES (${user.tenantId}, ${user.id}, 'urgent.declined', 'urgent_request', ${row.id},
        ${JSON.stringify({ note })}::jsonb)
    `,
  ]);

  return { id: row.id, status: "declined" };
}
