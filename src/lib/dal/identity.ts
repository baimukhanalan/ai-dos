import "server-only";

import { randomUUID } from "node:crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { identityDecision, type IdentityInput } from "@/lib/ai/identity";

type Sql = NeonQueryFunction<false, false>;

export type PublicPatientRegistration = {
  fullName: string;
  phone: string;
  birthDate: string;
  preferredLanguage: "ru" | "kk" | "en";
};

export type IdentityResult =
  | { status: "insufficient"; missing: string[] }
  | { status: "verified"; patientId: string }
  | { status: "not_found" };

/**
 * Сверяет личность пациента строго по совпадению телефона плюс второго
 * фактора (фамилия или дата рождения). Возвращает только факт совпадения и id —
 * никаких данных пациента наружу. Никогда не находит пациента по одному имени.
 */
export async function verifyPatientIdentity(
  sql: Sql,
  tenantId: string,
  input: IdentityInput,
): Promise<IdentityResult> {
  const decision = identityDecision(input);
  if (!decision.canAttempt) {
    return { status: "insufficient", missing: decision.missing };
  }

  const phone = String(input.phone).replace(/\D/g, "");
  // Экранируем метасимволы LIKE, чтобы фамилия вроде «%» не расширяла совпадение.
  const surname = input.fullName
    ? input.fullName.trim().split(/\s+/)[0].toLowerCase().replace(/([%_\\])/g, "\\$1")
    : null;

  const birthDate = input.birthDate ?? null;
  let rows: Array<{ id: string }>;

  if (surname && birthDate) {
    rows = (await sql`
      SELECT id FROM patients
      WHERE tenant_id = ${tenantId}
        AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ${phone}
        AND (
          lower(full_name) LIKE '%' || ${surname} || '%' ESCAPE '\'
          OR birth_date::text = ${birthDate}
        )
      LIMIT 1
    `) as Array<{ id: string }>;
  } else if (surname) {
    rows = (await sql`
      SELECT id FROM patients
      WHERE tenant_id = ${tenantId}
        AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ${phone}
        AND lower(full_name) LIKE '%' || ${surname} || '%' ESCAPE '\'
      LIMIT 1
    `) as Array<{ id: string }>;
  } else {
    // Ветка даты рождения намеренно отдельная: NULL в логическом OR не должен
    // превращать проверку второго фактора в совпадение только по телефону.
    rows = (await sql`
      SELECT id FROM patients
      WHERE tenant_id = ${tenantId}
        AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ${phone}
        AND birth_date::text = ${birthDate}
      LIMIT 1
    `) as Array<{ id: string }>;
  }

  return rows[0]
    ? { status: "verified", patientId: rows[0].id }
    : { status: "not_found" };
}

/**
 * Создаёт минимальную карточку пациента только вместе с явным согласием.
 * Номер хранится канонически, а уникальный индекс по цифрам закрывает гонки
 * между разными форматами одного номера.
 */
export async function registerPublicPatient(
  sql: Sql,
  tenantId: string,
  input: PublicPatientRegistration,
) {
  const patientId = randomUUID();
  const digits = input.phone.replace(/\D/g, "");
  const phone = `+${digits}`;
  const rows = (await sql`
    WITH new_patient AS (
      INSERT INTO patients (
        id, tenant_id, full_name, phone, birth_date, preferred_language, notes
      ) VALUES (
        ${patientId}, ${tenantId}, ${input.fullName}, ${phone},
        ${input.birthDate}, ${input.preferredLanguage},
        'Создано пациентом через защищённый web-чат.'
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    ), recorded_consent AS (
      INSERT INTO patient_consents (
        tenant_id, patient_id, purpose, status, source
      )
      SELECT ${tenantId}, id, 'appointment_booking', 'granted', 'public_web_assistant'
      FROM new_patient
      RETURNING patient_id
    ), recorded_audit AS (
      INSERT INTO audit_events (
        tenant_id, actor_user_id, action, resource_type, resource_id, metadata
      )
      SELECT ${tenantId}, null, 'public.patient.created', 'patient', id,
        ${JSON.stringify({ source: "public_web_assistant" })}::jsonb
      FROM new_patient
      RETURNING resource_id
    )
    SELECT id FROM new_patient
  `) as Array<{ id: string }>;

  return rows[0]
    ? { status: "created" as const, patientId: rows[0].id }
    : { status: "exists" as const };
}
