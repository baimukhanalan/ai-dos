import "server-only";

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { identityDecision, type IdentityInput } from "@/lib/ai/identity";

type Sql = NeonQueryFunction<false, false>;

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

  const rows = (await sql`
    SELECT id FROM patients
    WHERE tenant_id = ${tenantId}
      AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ${phone}
      AND (
        ${surname}::text IS NULL
        OR lower(full_name) LIKE '%' || ${surname} || '%' ESCAPE '\'
        OR birth_date::text = ${input.birthDate ?? null}
      )
    LIMIT 1
  `) as Array<{ id: string }>;

  return rows[0]
    ? { status: "verified", patientId: rows[0].id }
    : { status: "not_found" };
}
