import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireRoles } from "@/lib/dal/auth";
import { usageIncrement } from "@/lib/billing/usage";
import { AppError } from "@/lib/errors";
import type {
  appointmentChangeSchema,
  appointmentSchema,
  callbackSchema,
  patientSchema,
} from "@/lib/validation/operations";
import type { z } from "zod";

type PatientInput = z.infer<typeof patientSchema>;
type AppointmentInput = z.infer<typeof appointmentSchema>;
type AppointmentChangeInput = z.infer<typeof appointmentChangeSchema>;
type CallbackInput = z.infer<typeof callbackSchema>;

export async function createPatient(input: PatientInput) {
  const user = await requireRoles(["clinic_admin", "operator"]);
  const sql = db();
  const id = randomUUID();

  try {
    const [rows] = await sql.transaction([
      sql`
        INSERT INTO patients (
          id, tenant_id, full_name, phone, birth_date, preferred_language, notes
        ) VALUES (
          ${id}, ${user.tenantId}, ${input.fullName}, ${input.phone},
          ${input.birthDate || null}, ${input.preferredLanguage}, ${input.notes || null}
        )
        RETURNING id, full_name, phone, birth_date, preferred_language, notes, created_at
      `,
      sql`INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id) VALUES (${user.tenantId}, ${user.id}, 'patient.created', 'patient', ${id})`,
    ]);
    return rows[0];
  } catch (error) {
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") {
      throw new AppError(
        "patient_phone_exists",
        409,
        "Пациент с этим номером уже существует.",
      );
    }
    throw error;
  }
}

export async function createAppointment(input: AppointmentInput) {
  const user = await requireRoles(["clinic_admin", "operator"]);
  return createAppointmentForTenant(user.tenantId, user.id, input, "portal");
}

export async function changeAppointment(
  appointmentId: string,
  input: AppointmentChangeInput,
) {
  const user = await requireRoles(["clinic_admin", "operator"]);
  const sql = db();
  const scope = `appointment.${input.action}`;
  const existing = (await sql`
    SELECT response_body FROM idempotency_keys
    WHERE tenant_id = ${user.tenantId} AND scope = ${scope}
      AND key = ${input.idempotencyKey} AND expires_at > now()
    LIMIT 1
  `) as Array<{ response_body: Record<string, unknown> }>;
  if (existing[0]?.response_body) return existing[0].response_body;

  const appointments = (await sql`
    SELECT id, patient_id, doctor_id, service_id, status
    FROM appointments
    WHERE id = ${appointmentId} AND tenant_id = ${user.tenantId}
    LIMIT 1
  `) as Array<{
    id: string;
    patient_id: string;
    doctor_id: string;
    service_id: string | null;
    status: string;
  }>;
  const appointment = appointments[0];
  if (!appointment) throw new AppError("appointment_not_found", 404, "Запись не найдена.");
  if (!["held", "confirmed"].includes(appointment.status)) {
    throw new AppError("appointment_not_active", 409, "Эту запись уже нельзя изменить.");
  }

  if (input.action === "cancel") {
    const response = { id: appointmentId, status: "cancelled" };
    const [updated] = await sql.transaction([
      sql`UPDATE appointments SET status = 'cancelled', updated_at = now() WHERE id = ${appointmentId} AND tenant_id = ${user.tenantId} AND status IN ('held', 'confirmed') RETURNING id`,
      sql`INSERT INTO appointment_history (tenant_id, appointment_id, from_status, to_status, changed_by, reason) VALUES (${user.tenantId}, ${appointmentId}, ${appointment.status}, 'cancelled', ${user.id}, ${input.reason})`,
      sql`INSERT INTO idempotency_keys (tenant_id, key, scope, response_status, response_body) VALUES (${user.tenantId}, ${input.idempotencyKey}, ${scope}, 200, ${JSON.stringify(response)}::jsonb)`,
      sql`INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload) VALUES (${user.tenantId}, 'appointment.cancelled', 'appointment', ${appointmentId}, ${JSON.stringify({ reason: input.reason })}::jsonb)`,
      sql`INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES (${user.tenantId}, ${user.id}, 'appointment.cancelled', 'appointment', ${appointmentId}, ${JSON.stringify({ reason: input.reason })}::jsonb)`,
    ]);
    if (!updated[0]) throw new AppError("appointment_changed", 409, "Запись уже была изменена другим сотрудником.");
    return response;
  }

  const replacement = await createAppointmentForTenant(
    user.tenantId,
    user.id,
    {
      patientId: appointment.patient_id,
      doctorId: appointment.doctor_id,
      serviceId: appointment.service_id,
      startsAt: input.startsAt,
      reason: input.reason,
      idempotencyKey: `${input.idempotencyKey}:new`,
    },
    "portal",
  );
  const replacementId = String(replacement.id);
  const response = { id: appointmentId, status: "cancelled", replacement };
  const [updated] = await sql.transaction([
    sql`UPDATE appointments SET status = 'cancelled', updated_at = now() WHERE id = ${appointmentId} AND tenant_id = ${user.tenantId} AND status IN ('held', 'confirmed') RETURNING id`,
    sql`INSERT INTO appointment_history (tenant_id, appointment_id, from_status, to_status, changed_by, reason) VALUES (${user.tenantId}, ${appointmentId}, ${appointment.status}, 'cancelled', ${user.id}, ${`Перенос: ${input.reason}`})`,
    sql`INSERT INTO idempotency_keys (tenant_id, key, scope, response_status, response_body) VALUES (${user.tenantId}, ${input.idempotencyKey}, ${scope}, 200, ${JSON.stringify(response)}::jsonb)`,
    sql`INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload) VALUES (${user.tenantId}, 'appointment.rescheduled', 'appointment', ${appointmentId}, ${JSON.stringify({ replacementId, reason: input.reason })}::jsonb)`,
    sql`INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES (${user.tenantId}, ${user.id}, 'appointment.rescheduled', 'appointment', ${appointmentId}, ${JSON.stringify({ replacementId })}::jsonb)`,
  ]);
  if (!updated[0]) {
    await sql`UPDATE appointments SET status = 'cancelled', updated_at = now() WHERE id = ${replacementId} AND tenant_id = ${user.tenantId}`;
    throw new AppError("appointment_changed", 409, "Запись уже была изменена другим сотрудником.");
  }
  return response;
}

export async function createAppointmentForTenant(
  tenantId: string,
  actorUserId: string | null,
  input: AppointmentInput,
  source: "portal" | "web" | "mcp" = "portal",
  /**
   * `allowOutsideSchedule` снимает только проверку рабочего окна врача и
   * применяется единственным путём — явным решением администратора принять
   * пациента вне графика. Защита от пересечения записей остаётся на уровне
   * БД, поэтому чужой приём перезаписать по-прежнему нельзя.
   */
  options: { allowOutsideSchedule?: boolean } = {},
) {
  const sql = db();
  const idempotent = (await sql`
    SELECT response_body
    FROM idempotency_keys
    WHERE tenant_id = ${tenantId}
      AND scope = 'appointment.create'
      AND key = ${input.idempotencyKey}
      AND expires_at > now()
    LIMIT 1
  `) as Array<{ response_body: Record<string, unknown> }>;

  if (idempotent[0]?.response_body) return idempotent[0].response_body;

  const references = (await sql`
    SELECT
      EXISTS(SELECT 1 FROM patients WHERE id = ${input.patientId} AND tenant_id = ${tenantId}) AS patient_exists,
      EXISTS(SELECT 1 FROM doctors WHERE id = ${input.doctorId} AND tenant_id = ${tenantId} AND active = true) AS doctor_exists,
      (${input.serviceId || null}::uuid IS NULL OR EXISTS(
        SELECT 1 FROM services
        WHERE id = ${input.serviceId || null}::uuid
          AND tenant_id = ${tenantId}
          AND active = true
          AND (
            specialty_id IS NULL OR specialty_id = (
              SELECT specialty_id FROM doctors
              WHERE id = ${input.doctorId} AND tenant_id = ${tenantId}
            )
          )
      )) AS service_exists,
      COALESCE((
        SELECT duration_minutes FROM services
        WHERE id = ${input.serviceId || null}::uuid AND tenant_id = ${tenantId} AND active = true
      ), (
        SELECT min(slot_minutes) FROM schedule_rules
        WHERE doctor_id = ${input.doctorId} AND tenant_id = ${tenantId} AND active = true
      ), 30)::int AS duration_minutes,
      (SELECT branch_id FROM doctors WHERE id = ${input.doctorId} AND tenant_id = ${tenantId}) AS branch_id
  `) as Array<{
    patient_exists: boolean;
    doctor_exists: boolean;
    service_exists: boolean;
    duration_minutes: number;
    branch_id: string | null;
  }>;

  const refs = references[0];
  if (!refs?.patient_exists) {
    throw new AppError("patient_not_found", 404, "Пациент не найден.");
  }
  if (!refs.doctor_exists) {
    throw new AppError("doctor_not_found", 404, "Врач не найден.");
  }
  if (!refs.service_exists) {
    throw new AppError("service_not_found", 404, "Услуга не найдена.");
  }

  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now() - 60_000) {
    throw new AppError(
      "invalid_appointment_time",
      400,
      "Выберите будущее время.",
    );
  }
  const end = new Date(start.getTime() + refs.duration_minutes * 60_000);
  const schedule = options.allowOutsideSchedule
    ? [{ valid: true }]
    : ((await sql`
    SELECT EXISTS (
      SELECT 1
      FROM tenants t
      JOIN schedule_rules r
        ON r.tenant_id = t.id
       AND r.doctor_id = ${input.doctorId}
       AND r.active = true
      WHERE t.id = ${tenantId}
        AND r.weekday = extract(dow FROM (${start.toISOString()}::timestamptz AT TIME ZONE t.timezone))::int
        AND (${start.toISOString()}::timestamptz AT TIME ZONE t.timezone)::date =
          (${end.toISOString()}::timestamptz AT TIME ZONE t.timezone)::date
        AND (${start.toISOString()}::timestamptz AT TIME ZONE t.timezone)::time >= r.starts_at
        AND (${end.toISOString()}::timestamptz AT TIME ZONE t.timezone)::time <= r.ends_at
        AND mod(
          (extract(epoch FROM (((${start.toISOString()}::timestamptz AT TIME ZONE t.timezone)::time - r.starts_at))) / 60)::int,
          r.slot_minutes
        ) = 0
        AND NOT EXISTS (
          SELECT 1
          FROM schedule_exceptions e
          WHERE e.tenant_id = ${tenantId}
            AND e.doctor_id = ${input.doctorId}
            AND e.exception_date = (${start.toISOString()}::timestamptz AT TIME ZONE t.timezone)::date
            AND e.available = false
            AND (
              e.starts_at IS NULL OR e.ends_at IS NULL OR (
                (${start.toISOString()}::timestamptz AT TIME ZONE t.timezone)::time < e.ends_at
                AND (${end.toISOString()}::timestamptz AT TIME ZONE t.timezone)::time > e.starts_at
              )
            )
        )
    ) AS valid
  `) as Array<{ valid: boolean }>);
  if (!schedule[0]?.valid) {
    throw new AppError(
      "outside_schedule",
      409,
      "Выбранное время не входит в актуальное расписание врача.",
    );
  }

  const appointmentId = randomUUID();
  const response = {
    id: appointmentId,
    status: "confirmed",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };

  try {
    await sql.transaction([
      sql`
        INSERT INTO appointments (
          id, tenant_id, patient_id, doctor_id, service_id, branch_id,
          starts_at, ends_at, status, source, reason, created_by
        ) VALUES (
          ${appointmentId}, ${tenantId}, ${input.patientId}, ${input.doctorId},
          ${input.serviceId || null}, ${refs.branch_id}, ${start.toISOString()},
          ${end.toISOString()}, 'confirmed', ${source}, ${input.reason || null},
          ${actorUserId}
        )
      `,
      sql`INSERT INTO appointment_history (tenant_id, appointment_id, to_status, changed_by, reason) VALUES (${tenantId}, ${appointmentId}, 'confirmed', ${actorUserId}, 'Запись создана')`,
      sql`INSERT INTO idempotency_keys (tenant_id, key, scope, response_status, response_body) VALUES (${tenantId}, ${input.idempotencyKey}, 'appointment.create', 201, ${JSON.stringify(response)}::jsonb)`,
      sql`INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload) VALUES (${tenantId}, 'appointment.confirmed', 'appointment', ${appointmentId}, ${JSON.stringify(response)}::jsonb)`,
      sql`INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES (${tenantId}, ${actorUserId}, 'appointment.created', 'appointment', ${appointmentId}, ${JSON.stringify({ source, outsideSchedule: Boolean(options.allowOutsideSchedule) })}::jsonb)`,
      usageIncrement(sql, tenantId, "appointments_created"),
    ]);
  } catch (error) {
    const databaseError = error as { code?: string; message?: string };
    if (databaseError.code === "23505" || databaseError.code === "23P01") {
      const stored = (await sql`
        SELECT response_body FROM idempotency_keys
        WHERE tenant_id = ${tenantId} AND scope = 'appointment.create' AND key = ${input.idempotencyKey}
      `) as Array<{ response_body: Record<string, unknown> }>;
      if (stored[0]?.response_body) return stored[0].response_body;
    }
    if (databaseError.code === "23P01" || databaseError.code === "23505") {
      throw new AppError(
        "slot_taken",
        409,
        "Это время уже занято. Выберите другой слот.",
      );
    }
    throw error;
  }

  return response;
}

export async function createCallbackForTenant(
  tenantId: string,
  input: CallbackInput,
  actorUserId: string | null = null,
) {
  const sql = db();
  const existing = (await sql`
    SELECT response_body FROM idempotency_keys
    WHERE tenant_id = ${tenantId} AND scope = 'callback.create'
      AND key = ${input.idempotencyKey} AND expires_at > now()
    LIMIT 1
  `) as Array<{ response_body: Record<string, unknown> }>;
  if (existing[0]?.response_body) return existing[0].response_body;

  const recent = (await sql`
    SELECT count(*)::int AS count
    FROM callback_requests
    WHERE tenant_id = ${tenantId}
      AND phone = ${input.phone}
      AND created_at > now() - interval '10 minutes'
  `) as Array<{ count: number }>;
  if ((recent[0]?.count || 0) >= 3) {
    throw new AppError(
      "callback_rate_limited",
      429,
      "Заявка уже передана. Подождите несколько минут.",
    );
  }

  const callbackId = randomUUID();
  const response = {
    id: callbackId,
    status: "new",
    message: "Заявка передана регистратуре.",
  };

  try {
    await sql.transaction([
      sql`
        INSERT INTO callback_requests (
          id, tenant_id, name, phone, reason, preferred_time, priority, status
        ) VALUES (
          ${callbackId}, ${tenantId}, ${input.name}, ${input.phone}, ${input.reason},
          ${input.preferredTime || null}, ${input.priority}, 'new'
        )
      `,
      sql`INSERT INTO idempotency_keys (tenant_id, key, scope, response_status, response_body) VALUES (${tenantId}, ${input.idempotencyKey}, 'callback.create', 201, ${JSON.stringify(response)}::jsonb)`,
      sql`INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload) VALUES (${tenantId}, 'callback.created', 'callback_request', ${callbackId}, ${JSON.stringify({ priority: input.priority })}::jsonb)`,
      sql`INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id) VALUES (${tenantId}, ${actorUserId}, 'callback.created', 'callback_request', ${callbackId})`,
    ]);
  } catch (error) {
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") {
      const stored = (await sql`
        SELECT response_body FROM idempotency_keys
        WHERE tenant_id = ${tenantId} AND scope = 'callback.create' AND key = ${input.idempotencyKey}
      `) as Array<{ response_body: Record<string, unknown> }>;
      if (stored[0]?.response_body) return stored[0].response_body;
    }
    throw error;
  }

  return response;
}

export async function createCallback(input: CallbackInput) {
  const user = await requireRoles(["clinic_admin", "operator"]);
  return createCallbackForTenant(user.tenantId, input, user.id);
}

export async function resolvePublicTenant() {
  const sql = db();
  const slug = process.env.MCP_TENANT_SLUG;
  if (!slug) {
    throw new AppError(
      "public_clinic_not_configured",
      503,
      "Публичная клиника ещё не настроена.",
    );
  }

  const rows = (await sql`
    SELECT id, name, slug FROM tenants
    WHERE slug = ${slug} AND status = 'active'
    LIMIT 1
  `) as Array<{ id: string; name: string; slug: string }>;

  if (!rows[0]) {
    throw new AppError(
      "public_clinic_not_found",
      503,
      "Публичная клиника недоступна.",
    );
  }
  return rows[0];
}

export async function listPublicDoctors(tenantId: string, specialty?: string) {
  const sql = db();
  return sql`
    SELECT d.id, d.display_name, d.languages, d.room, s.name AS specialty,
      b.name AS branch
    FROM doctors d
    LEFT JOIN specialties s ON s.id = d.specialty_id AND s.tenant_id = d.tenant_id
    LEFT JOIN branches b ON b.id = d.branch_id AND b.tenant_id = d.tenant_id
    WHERE d.tenant_id = ${tenantId} AND d.active = true
      AND (${specialty || null}::text IS NULL OR lower(s.name) LIKE '%' || lower(${specialty || ""}) || '%')
    ORDER BY d.display_name
    LIMIT 30
  `;
}

export async function listPublicServices(tenantId: string) {
  const sql = db();
  return sql`
    SELECT id, name, description, duration_minutes, price_kzt
    FROM services
    WHERE tenant_id = ${tenantId} AND active = true
    ORDER BY name
    LIMIT 50
  `;
}

export async function findAvailableSlots(
  tenantId: string,
  doctorId: string,
  days = 7,
) {
  const sql = db();
  const boundedDays = Math.min(Math.max(days, 1), 14);
  const rows = (await sql`
    WITH context AS (
      SELECT id AS tenant_id, timezone
      FROM tenants
      WHERE id = ${tenantId} AND status = 'active'
    ), candidates AS (
      SELECT
        (slot.local_start AT TIME ZONE context.timezone) AS starts_at,
        r.slot_minutes
      FROM context
      CROSS JOIN generate_series(0, ${boundedDays - 1}) AS day_offset(value)
      JOIN schedule_rules r
        ON r.tenant_id = context.tenant_id
       AND r.doctor_id = ${doctorId}
       AND r.active = true
       AND r.weekday = extract(
         dow FROM ((now() AT TIME ZONE context.timezone)::date + day_offset.value)
       )::int
      CROSS JOIN LATERAL generate_series(
        ((now() AT TIME ZONE context.timezone)::date + day_offset.value) + r.starts_at,
        ((now() AT TIME ZONE context.timezone)::date + day_offset.value) + r.ends_at
          - make_interval(mins => r.slot_minutes),
        make_interval(mins => r.slot_minutes)
      ) AS slot(local_start)
      WHERE NOT EXISTS (
        SELECT 1
        FROM schedule_exceptions e
        WHERE e.tenant_id = context.tenant_id
          AND e.doctor_id = ${doctorId}
          AND e.exception_date = slot.local_start::date
          AND e.available = false
          AND (
            e.starts_at IS NULL OR e.ends_at IS NULL OR (
              slot.local_start::time < e.ends_at
              AND (slot.local_start + make_interval(mins => r.slot_minutes))::time > e.starts_at
            )
          )
      )
    )
    SELECT starts_at, slot_minutes
    FROM candidates c
    WHERE c.starts_at > now() + interval '15 minutes'
      AND NOT EXISTS (
        SELECT 1
        FROM appointments a
        WHERE a.tenant_id = ${tenantId}
          AND a.doctor_id = ${doctorId}
          AND a.status IN ('held', 'confirmed')
          AND a.starts_at < c.starts_at + make_interval(mins => c.slot_minutes)
          AND a.ends_at > c.starts_at
      )
    ORDER BY starts_at
    LIMIT 24
  `) as Array<{ starts_at: Date | string; slot_minutes: number }>;

  return rows.map((row) => ({
    startsAt: new Date(row.starts_at).toISOString(),
    durationMinutes: row.slot_minutes,
  }));
}
