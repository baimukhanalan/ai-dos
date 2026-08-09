import "server-only";

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { db } from "@/lib/db";
import { requireRoles } from "@/lib/dal/auth";
import { AppError } from "@/lib/errors";
import {
  maskPhone,
  type EscalationPriority,
  type EscalationReason,
  type PatientIntent,
} from "@/lib/ai/escalation";

type Sql = NeonQueryFunction<false, false>;

export type AttemptedAction = { action: string; result: string };

export type EscalationInput = {
  conversationId?: string | null;
  callId?: string | null;
  patientId?: string | null;
  channel?: string;
  intent: PatientIntent;
  reason: EscalationReason;
  priority: EscalationPriority;
  summary: string;
  attemptedActions?: AttemptedAction[];
  patientContext?: {
    name?: string | null;
    phone?: string | null;
    language?: string | null;
  };
  dedupeKey?: string | null;
};

/**
 * Создаёт карточку эскалации. Телефон в контексте оператора маскируется —
 * наружу из чувствительных данных уходит только хвост номера. `dedupe_key`
 * не даёт наплодить дубли на один разговор, пока эскалация открыта.
 */
export function createEscalationStatement(sql: Sql, tenantId: string, input: EscalationInput) {
  const context = input.patientContext
    ? {
        name: input.patientContext.name ?? null,
        phone: maskPhone(input.patientContext.phone),
        language: input.patientContext.language ?? null,
      }
    : {};
  return sql`
    INSERT INTO escalations (
      tenant_id, conversation_id, call_id, patient_id, channel, intent, reason,
      priority, summary, attempted_actions, patient_context, dedupe_key
    ) VALUES (
      ${tenantId}, ${input.conversationId ?? null}, ${input.callId ?? null},
      ${input.patientId ?? null}, ${input.channel ?? "web"}, ${input.intent},
      ${input.reason}, ${input.priority}, ${input.summary},
      ${JSON.stringify(input.attemptedActions ?? [])}::jsonb,
      ${JSON.stringify(context)}::jsonb, ${input.dedupeKey ?? null}
    )
    ON CONFLICT (tenant_id, dedupe_key)
      WHERE status IN ('open', 'claimed') AND dedupe_key IS NOT NULL
      DO NOTHING
  `;
}

/** Best-effort создание из фонового пути (чат): не роняет основной ответ. */
export async function recordEscalation(tenantId: string, input: EscalationInput) {
  const sql = db();
  try {
    await sql.transaction([
      createEscalationStatement(sql, tenantId, input),
      sql`
        INSERT INTO audit_events (tenant_id, action, resource_type, metadata)
        VALUES (${tenantId}, 'escalation.created', 'escalation',
          ${JSON.stringify({ reason: input.reason, intent: input.intent })}::jsonb)
      `,
    ]);
  } catch (error) {
    console.error("escalation record failed", error);
  }
}

const resolvableStatuses = new Set(["claimed", "resolved", "dismissed"]);

export async function updateEscalation(
  id: string,
  status: "claimed" | "resolved" | "dismissed",
  note?: string | null,
) {
  const user = await requireRoles(["clinic_admin", "operator", "doctor"]);
  if (!resolvableStatuses.has(status)) {
    throw new AppError("invalid_status", 400, "Недопустимый статус.");
  }
  const sql = db();
  const rows = (await sql`
    UPDATE escalations
    SET status = ${status},
      assigned_user_id = COALESCE(assigned_user_id, ${user.id}),
      resolved_by = CASE WHEN ${status} IN ('resolved', 'dismissed') THEN ${user.id} ELSE resolved_by END,
      resolved_at = CASE WHEN ${status} IN ('resolved', 'dismissed') THEN now() ELSE resolved_at END,
      resolution_note = COALESCE(${note ?? null}, resolution_note)
    WHERE id = ${id} AND tenant_id = ${user.tenantId}
      AND status IN ('open', 'claimed')
    RETURNING id, status
  `) as Array<{ id: string; status: string }>;

  if (!rows[0]) {
    throw new AppError("escalation_not_found", 404, "Эскалация не найдена или уже закрыта.");
  }
  await sql`
    INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
    VALUES (${user.tenantId}, ${user.id}, 'escalation.status.changed', 'escalation', ${id},
      ${JSON.stringify({ status })}::jsonb)
  `;
  return rows[0];
}
