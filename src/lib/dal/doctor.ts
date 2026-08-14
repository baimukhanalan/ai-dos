import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireRoles, type AuthenticatedUser } from "@/lib/dal/auth";
import { AppError } from "@/lib/errors";
import type { DoctorAvailabilityInput } from "@/lib/validation/doctor";

export async function linkedDoctorId(user: AuthenticatedUser) {
  const sql = db();
  const rows = (await sql`
    SELECT l.doctor_id
    FROM doctor_user_links l
    JOIN doctors d ON d.id = l.doctor_id AND d.tenant_id = l.tenant_id
    WHERE l.tenant_id = ${user.tenantId} AND l.user_id = ${user.id}
      AND d.active = true
    LIMIT 1
  `) as Array<{ doctor_id: string }>;
  if (!rows[0]) {
    throw new AppError(
      "doctor_profile_not_linked",
      403,
      "Учётная запись не привязана к профилю врача.",
    );
  }
  return rows[0].doctor_id;
}

export async function getDoctorHub() {
  const user = await requireRoles(["doctor"]);
  const sql = db();
  const doctorId = await linkedDoctorId(user);
  const [doctor, appointments, urgentRequests, rules, exceptions, notifications] =
    await Promise.all([
      sql`
        SELECT d.id, d.full_name, d.display_name, d.room, d.languages,
          s.name AS specialty, b.name AS branch_name
        FROM doctors d
        LEFT JOIN specialties s ON s.id = d.specialty_id AND s.tenant_id = d.tenant_id
        LEFT JOIN branches b ON b.id = d.branch_id AND b.tenant_id = d.tenant_id
        WHERE d.id = ${doctorId} AND d.tenant_id = ${user.tenantId}
      `,
      sql`
        SELECT a.id, a.starts_at, a.ends_at, a.status, a.reason,
          p.full_name AS patient_name, p.preferred_language,
          s.name AS service_name
        FROM appointments a
        JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
        LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
        WHERE a.tenant_id = ${user.tenantId} AND a.doctor_id = ${doctorId}
          AND a.starts_at >= now() AND a.status IN ('held', 'confirmed')
        ORDER BY a.starts_at LIMIT 40
      `,
      sql`
        SELECT u.id, u.reason, u.status, u.requested_at, u.proposed_starts_at,
          p.full_name AS patient_name, p.preferred_language
        FROM urgent_requests u
        LEFT JOIN patients p ON p.id = u.patient_id AND p.tenant_id = u.tenant_id
        WHERE u.tenant_id = ${user.tenantId} AND u.doctor_id = ${doctorId}
          AND u.status IN ('pending', 'alternative_offered')
        ORDER BY u.requested_at DESC LIMIT 30
      `,
      sql`
        SELECT id, weekday, starts_at, ends_at, slot_minutes, active
        FROM schedule_rules
        WHERE tenant_id = ${user.tenantId} AND doctor_id = ${doctorId}
        ORDER BY weekday, starts_at
      `,
      sql`
        SELECT id, exception_date, starts_at, ends_at, available, reason
        FROM schedule_exceptions
        WHERE tenant_id = ${user.tenantId} AND doctor_id = ${doctorId}
          AND exception_date >= CURRENT_DATE
        ORDER BY exception_date, starts_at LIMIT 60
      `,
      sql`
        SELECT n.id, n.template_code, n.status, n.scheduled_at, n.last_error
        FROM notifications n
        JOIN appointments a ON a.id = n.appointment_id AND a.tenant_id = n.tenant_id
        WHERE n.tenant_id = ${user.tenantId} AND a.doctor_id = ${doctorId}
        ORDER BY n.scheduled_at DESC LIMIT 20
      `,
    ]);
  return {
    user,
    doctor: doctor[0],
    doctorId,
    appointments,
    urgentRequests,
    rules,
    exceptions,
    notifications,
  };
}

export async function createDoctorAvailability(input: DoctorAvailabilityInput) {
  const user = await requireRoles(["doctor"]);
  const sql = db();
  const doctorId = await linkedDoctorId(user);
  const scope = "doctor.availability.create";
  const stored = (await sql`
    SELECT response_body FROM idempotency_keys
    WHERE tenant_id = ${user.tenantId} AND scope = ${scope}
      AND key = ${input.idempotencyKey} AND expires_at > now()
  `) as Array<{ response_body: Record<string, unknown> | null }>;
  if (stored[0]?.response_body) return stored[0].response_body;

  const startsAt = input.kind === "vacation" ? null : input.startsAt || null;
  const endsAt = input.kind === "vacation" ? null : input.endsAt || null;
  const available = input.kind === "extra_slot";
  const id = randomUUID();
  const response = { id, doctorId, available };
  try {
    await sql.transaction([
      sql`
        INSERT INTO schedule_exceptions (
          id, tenant_id, doctor_id, exception_date, starts_at, ends_at, available, reason
        ) VALUES (
          ${id}, ${user.tenantId}, ${doctorId}, ${input.date}, ${startsAt},
          ${endsAt}, ${available}, ${input.reason}
        )
      `,
      sql`
        INSERT INTO idempotency_keys (
          tenant_id, key, scope, response_status, response_body
        ) VALUES (
          ${user.tenantId}, ${input.idempotencyKey}, ${scope}, 201,
          ${JSON.stringify(response)}::jsonb
        )
      `,
      sql`
        INSERT INTO audit_events (
          tenant_id, actor_user_id, action, resource_type, resource_id, metadata
        ) VALUES (
          ${user.tenantId}, ${user.id}, 'doctor.availability.created',
          'schedule_exception', ${id},
          ${JSON.stringify({ kind: input.kind, date: input.date, startsAt, endsAt, available })}::jsonb
        )
      `,
    ]);
  } catch (error) {
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") {
      throw new AppError(
        "availability_exists",
        409,
        "Такое изменение доступности уже существует.",
      );
    }
    throw error;
  }
  return response;
}
