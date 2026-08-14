import "server-only";

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { db } from "@/lib/db";
import { exponentialBackoffMs } from "@/lib/retry";
import {
  getMedicalAdapter,
  type MisAppointmentInput,
  type MisSyncResult,
} from "@/lib/integrations/medical-information-system";

type Sql = NeonQueryFunction<false, false>;

export const maxSyncAttempts = 5;

/** Аренда на захваченную запись, как у остальных воркеров. */
const claimLease = "10 minutes";
/** Ненастроенный адаптер проверяем раз в час, а не каждые 15 минут. */
const unavailableRetry = 3600;

export type SyncState = "pending" | "syncing" | "synced" | "failed" | "not_required";

export type SyncDecision = {
  state: Exclude<SyncState, "syncing">;
  delaySeconds: number;
  createTask: boolean;
  error: string | null;
  /** Ненастроенный адаптер не должен проедать бюджет попыток. */
  countsAsAttempt: boolean;
};

/**
 * Решение о судьбе записи после ответа МИС.
 *
 * Отдельный случай — «отправили, но не смогли перечитать»: повторять запись
 * нельзя, иначе в МИС появится дубль приёма. Такую ситуацию сразу отдаём
 * человеку вместе с внешним идентификатором.
 */
export function decideSyncOutcome(
  result: MisSyncResult,
  attempts: number,
): SyncDecision {
  if (result.status === "not_required") {
    return {
      state: "not_required",
      delaySeconds: 0,
      createTask: false,
      error: null,
      countsAsAttempt: true,
    };
  }

  if (result.status === "unavailable") {
    return {
      state: "pending",
      delaySeconds: unavailableRetry,
      createTask: false,
      error: result.message,
      countsAsAttempt: false,
    };
  }

  if (result.status === "synced") {
    if (result.verified) {
      return {
        state: "synced",
        delaySeconds: 0,
        createTask: false,
        error: null,
        countsAsAttempt: true,
      };
    }
    return {
      state: "failed",
      delaySeconds: 0,
      createTask: true,
      error: "verification_failed: запись отправлена, но не перечитана из МИС",
      countsAsAttempt: true,
    };
  }

  const retry = result.retryable && attempts < maxSyncAttempts;
  return {
    state: retry ? "pending" : "failed",
    delaySeconds: retry ? Math.round(exponentialBackoffMs(attempts) / 1000) : 0,
    createTask: !retry,
    error: `${result.errorCode}: ${result.message}`,
    countsAsAttempt: true,
  };
}

export type ClaimedAppointment = {
  id: string;
  tenant_id: string;
  external_sync_attempts: number;
};

export type SyncPayload = MisAppointmentInput & { tenantId: string; attempts: number };

/** Возвращает записи в очереди и держит их под арендой на время обработки. */
export async function claimSyncBatch(sql: Sql, limit: number) {
  await sql`
    UPDATE appointments SET external_sync_state = 'pending'
    WHERE external_sync_state = 'syncing' AND external_sync_next_at <= now()
  `;

  return (await sql`
    UPDATE appointments
    SET external_sync_state = 'syncing',
      external_sync_attempts = external_sync_attempts + 1,
      external_sync_next_at = now() + ${claimLease}::interval
    WHERE id IN (
      SELECT id FROM appointments
      WHERE external_sync_state = 'pending'
        AND external_sync_next_at <= now()
        AND status IN ('held', 'confirmed')
        AND starts_at > now()
      ORDER BY starts_at
      LIMIT ${Math.min(Math.max(limit, 1), 100)}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tenant_id, external_sync_attempts
  `) as ClaimedAppointment[];
}

/**
 * Данные для заведения приёма во внешней системе. Медицинских подробностей и
 * ИИН здесь нет: наружу уходит только то, без чего запись не создать.
 */
export async function loadSyncPayload(
  sql: Sql,
  appointment: ClaimedAppointment,
): Promise<SyncPayload | null> {
  const rows = (await sql`
    SELECT p.full_name AS patient_full_name, p.phone AS patient_phone,
      p.birth_date AS patient_birth_date,
      d.display_name AS doctor_name, d.external_id AS doctor_external_id,
      s.name AS service_name, a.starts_at, a.ends_at
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
    LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
    WHERE a.id = ${appointment.id} AND a.tenant_id = ${appointment.tenant_id}
    LIMIT 1
  `) as Array<{
    patient_full_name: string;
    patient_phone: string | null;
    patient_birth_date: string | null;
    doctor_name: string;
    doctor_external_id: string | null;
    service_name: string | null;
    starts_at: string;
    ends_at: string;
  }>;

  const details = rows[0];
  if (!details) return null;
  return {
    tenantId: appointment.tenant_id,
    attempts: appointment.external_sync_attempts,
    appointmentId: appointment.id,
    patientFullName: details.patient_full_name,
    patientPhone: details.patient_phone,
    patientBirthDate: details.patient_birth_date,
    doctorName: details.doctor_name,
    doctorExternalId: details.doctor_external_id,
    serviceName: details.service_name,
    startsAt: new Date(details.starts_at).toISOString(),
    endsAt: new Date(details.ends_at).toISOString(),
  };
}

/** Применяет исход попытки: статус записи, журнал интеграции и задача при провале. */
export async function applySyncResult(
  sql: Sql,
  appointment: ClaimedAppointment,
  result: MisSyncResult,
  provider: string,
  durationMs: number,
) {
  const decision = decideSyncOutcome(result, appointment.external_sync_attempts);
  const externalId = result.status === "synced" ? result.externalId : null;
  const delay = `${decision.delaySeconds} seconds`;

  const statements = [
    sql`
      UPDATE appointments
      SET external_sync_state = ${decision.state},
        external_sync_error = ${decision.error},
        external_sync_at = CASE WHEN ${decision.state} = 'synced' THEN now() ELSE external_sync_at END,
        external_id = COALESCE(${externalId}, external_id),
        external_sync_attempts = external_sync_attempts - ${decision.countsAsAttempt ? 0 : 1},
        external_sync_next_at = now() + ${delay}::interval
      WHERE id = ${appointment.id} AND tenant_id = ${appointment.tenant_id}
    `,
    sql`
      INSERT INTO integrations (tenant_id, provider, mode, status)
      VALUES (${appointment.tenant_id}, ${provider}, 'live', 'pending')
      ON CONFLICT (tenant_id, provider) DO NOTHING
    `,
    sql`
      INSERT INTO integration_requests (
        tenant_id, integration_id, operation, request_id, status, error_code, duration_ms
      ) VALUES (
        ${appointment.tenant_id},
        (SELECT id FROM integrations
          WHERE tenant_id = ${appointment.tenant_id} AND provider = ${provider}),
        'appointment.sync', ${appointment.id},
        ${result.status === "synced" ? "ok" : result.status},
        ${decision.error ? decision.error.slice(0, 100) : null},
        ${durationMs}
      )
    `,
  ];

  if (decision.createTask) {
    statements.push(sql`
      INSERT INTO staff_tasks (
        tenant_id, kind, title, description, priority, due_at
      ) VALUES (
        ${appointment.tenant_id}, 'mis_sync_failed',
        'Перенесите запись в МИС вручную',
        ${`Автоматический перенос не удался: ${decision.error || "причина неизвестна"}. Запись подтверждена пациенту и остаётся действительной в AI Dos.`},
        'high', now() + interval '2 hours'
      )
    `);
  }

  await sql.transaction(statements);
  return decision;
}

export type MisSyncSummary = {
  mode: string;
  claimed: number;
  synced: number;
  retrying: number;
  failed: number;
  skipped: number;
};

function emptySummary(mode: string): MisSyncSummary {
  return { mode, claimed: 0, synced: 0, retrying: 0, failed: 0, skipped: 0 };
}

/**
 * Проход синхронизации внутри приложения. В режиме `remote` очередь забирает
 * официальный API-шлюз клиники через `/api/mis/queue`, поэтому здесь
 * работать нечему: интеграция выполняется в отдельном одобренном контуре.
 */
export async function runMisSync(limit = 20): Promise<MisSyncSummary> {
  const mode = process.env.MIS_ADAPTER || "sandbox";
  if (mode === "remote") return emptySummary("remote");

  const sql = db();
  const adapter = getMedicalAdapter(mode);

  /**
   * Без внешней МИС переносить некуда: помечаем записи одним запросом, не
   * засоряя журнал интеграций строкой на каждый приём.
   */
  if (adapter.provider === "sandbox") {
    const marked = (await sql`
      UPDATE appointments SET external_sync_state = 'not_required'
      WHERE external_sync_state IN ('pending', 'syncing') AND starts_at > now()
      RETURNING id
    `) as Array<{ id: string }>;
    return {
      ...emptySummary("sandbox"),
      claimed: marked.length,
      skipped: marked.length,
    };
  }

  const claimed = await claimSyncBatch(sql, limit);
  const summary = { ...emptySummary(mode), claimed: claimed.length };

  for (const appointment of claimed) {
    const startedAt = Date.now();
    let result: MisSyncResult;

    try {
      const payload = await loadSyncPayload(sql, appointment);
      result = payload
        ? await adapter.syncAppointment({ tenantId: appointment.tenant_id }, payload)
        : {
            status: "failed",
            errorCode: "appointment_missing",
            message: "Запись или связанные справочники удалены.",
            retryable: false,
          };
    } catch (error) {
      console.error("mis sync failed", appointment.id, error);
      result = {
        status: "failed",
        errorCode: "adapter_error",
        message: error instanceof Error ? error.message : "Неизвестная ошибка.",
        retryable: true,
      };
    }

    const decision = await applySyncResult(
      sql,
      appointment,
      result,
      adapter.provider,
      Date.now() - startedAt,
    );

    if (decision.state === "synced") summary.synced += 1;
    else if (decision.state === "failed") summary.failed += 1;
    else if (decision.state === "not_required") summary.skipped += 1;
    else summary.retrying += 1;
  }

  return summary;
}
