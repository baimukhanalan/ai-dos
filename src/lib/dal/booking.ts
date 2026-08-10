import "server-only";

import { db } from "@/lib/db";
import { requireRoles } from "@/lib/dal/auth";
import { createAppointmentForTenant, findAvailableSlots } from "@/lib/dal/operations";
import { recordEscalation } from "@/lib/dal/escalations";
import { AppError } from "@/lib/errors";
import { escalationReasons, type EscalationReason } from "@/lib/ai/escalation";
import type { SupportedLanguage } from "@/lib/ai/language";
import {
  advanceBooking,
  bookedTurn,
  identityBlockedTurn,
  matchDoctor,
  slotTakenTurn,
  type BookingOutcome,
  type BookingStage,
  type BookingState,
  type BookingTurn,
  type DoctorOption,
  type LostReason,
  type OfferedSlot,
} from "@/lib/booking/flow";

const SEARCH_DAYS = 7;

export type BookingTurnInput = {
  message: string;
  patientId?: string | null;
  conversationId?: string | null;
  channel?: "web" | "phone" | "whatsapp" | "telegram" | "portal" | "mcp";
};

export type BookingTurnResult = {
  sessionId: string;
  stage: BookingStage;
  reply: string;
  outcome: BookingOutcome | null;
  lostReason: LostReason | null;
  appointmentId: string | null;
  offeredSlots: OfferedSlot[];
};

type SessionRow = {
  id: string;
  stage: BookingStage;
  language: SupportedLanguage;
  doctor_id: string | null;
  service_id: string | null;
  offered_slots: OfferedSlot[] | null;
  selected_starts_at: string | null;
  misses: number;
  conversation_id: string | null;
  patient_id: string | null;
};

function stateOf(row: SessionRow): BookingState {
  return {
    stage: row.stage,
    language: row.language,
    doctorId: row.doctor_id,
    offeredSlots: Array.isArray(row.offered_slots) ? row.offered_slots : [],
    selectedStartsAt: row.selected_starts_at
      ? new Date(row.selected_starts_at).toISOString()
      : null,
    misses: row.misses,
  };
}

async function assertOwnership(
  sql: ReturnType<typeof db>,
  tenantId: string,
  input: BookingTurnInput,
) {
  if (!input.patientId && !input.conversationId) return;
  const rows = (await sql`
    SELECT
      (${input.patientId ?? null}::uuid IS NULL OR EXISTS(
        SELECT 1 FROM patients WHERE id = ${input.patientId ?? null}::uuid AND tenant_id = ${tenantId}
      )) AS patient_ok,
      (${input.conversationId ?? null}::uuid IS NULL OR EXISTS(
        SELECT 1 FROM conversations WHERE id = ${input.conversationId ?? null}::uuid AND tenant_id = ${tenantId}
      )) AS conversation_ok
  `) as Array<{ patient_ok: boolean; conversation_ok: boolean }>;

  if (!rows[0]?.patient_ok) {
    throw new AppError("patient_not_found", 404, "Пациент не найден.");
  }
  if (!rows[0]?.conversation_ok) {
    throw new AppError("conversation_not_found", 404, "Диалог не найден.");
  }
}

/**
 * Открытая сессия записи на пациента одна: продолжаем начатый диалог, а не
 * начинаем каждый раз заново. Уникальный частичный индекс не даёт гонке
 * создать вторую.
 */
async function openSession(
  sql: ReturnType<typeof db>,
  tenantId: string,
  input: BookingTurnInput,
) {
  if (input.patientId) {
    const existing = (await sql`
      SELECT id, stage, language, doctor_id, service_id, offered_slots,
        selected_starts_at, misses, conversation_id, patient_id
      FROM booking_sessions
      WHERE tenant_id = ${tenantId} AND patient_id = ${input.patientId}
        AND outcome IS NULL
      LIMIT 1
    `) as SessionRow[];
    if (existing[0]) return existing[0];
  }

  const rows = (await sql`
    INSERT INTO booking_sessions (
      tenant_id, conversation_id, patient_id, channel
    ) VALUES (
      ${tenantId}, ${input.conversationId ?? null}, ${input.patientId ?? null},
      ${input.channel ?? "web"}
    )
    RETURNING id, stage, language, doctor_id, service_id, offered_slots,
      selected_starts_at, misses, conversation_id, patient_id
  `) as SessionRow[];
  return rows[0];
}

async function loadDoctors(
  sql: ReturnType<typeof db>,
  tenantId: string,
): Promise<DoctorOption[]> {
  const rows = (await sql`
    SELECT d.id, d.display_name, s.name AS specialty
    FROM doctors d
    LEFT JOIN specialties s ON s.id = d.specialty_id AND s.tenant_id = d.tenant_id
    WHERE d.tenant_id = ${tenantId} AND d.active = true
    ORDER BY d.display_name
    LIMIT 40
  `) as Array<{ id: string; display_name: string; specialty: string | null }>;
  return rows.map((row) => ({
    id: row.id,
    name: row.display_name,
    specialty: row.specialty,
  }));
}

/**
 * Деньги за несостоявшуюся запись: минимальная опубликованная цена среди услуг
 * специальности выбранного врача. Это оценка снизу по прайсу, а не выдуманный
 * средний чек; если цен нет — суммы нет.
 */
async function estimateValueKzt(
  sql: ReturnType<typeof db>,
  tenantId: string,
  doctorId: string | null,
) {
  if (!doctorId) return null;
  const rows = (await sql`
    SELECT min(s.price_kzt)::int AS value
    FROM services s
    JOIN doctors d ON d.id = ${doctorId} AND d.tenant_id = s.tenant_id
    WHERE s.tenant_id = ${tenantId}
      AND s.active = true
      AND s.price_kzt IS NOT NULL
      AND (s.specialty_id IS NULL OR s.specialty_id = d.specialty_id)
  `) as Array<{ value: number | null }>;
  return rows[0]?.value ?? null;
}

/** Обещание «поставлю в лист ожидания» должно стать строкой, а не фразой. */
function waitlistStatement(
  sql: ReturnType<typeof db>,
  tenantId: string,
  session: SessionRow,
  doctorId: string | null,
) {
  return sql`
    INSERT INTO waitlist_entries (
      tenant_id, patient_id, doctor_id, service_id, status, preferred_from, preferred_to
    )
    SELECT ${tenantId}::uuid, ${session.patient_id}::uuid, ${doctorId}::uuid,
      ${session.service_id}::uuid, 'waiting', now(), now() + interval '14 days'
    WHERE ${session.patient_id}::uuid IS NOT NULL
      AND ${doctorId}::uuid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM waitlist_entries w
        WHERE w.tenant_id = ${tenantId}
          AND w.patient_id = ${session.patient_id}
          AND w.doctor_id = ${doctorId}
          AND w.status IN ('waiting', 'offered')
      )
  `;
}

/**
 * Пациент согласился, чтобы его вписали вне графика. Решение принимает
 * человек: карточка уходит администратору в «Операции» со всем контекстом.
 */
async function createUrgentRequest(
  sql: ReturnType<typeof db>,
  tenantId: string,
  session: SessionRow,
  doctorId: string | null,
  message: string,
) {
  const rows = (await sql`
    INSERT INTO urgent_requests (
      tenant_id, patient_id, conversation_id, doctor_id, booking_session_id, reason, status
    ) VALUES (
      ${tenantId}, ${session.patient_id}, ${session.conversation_id}, ${doctorId},
      ${session.id},
      ${`Свободных слотов нет, пациент просит принять вне графика. Последняя реплика: ${message.slice(0, 400)}`},
      'pending'
    )
    RETURNING id
  `) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

function messageStatements(
  sql: ReturnType<typeof db>,
  tenantId: string,
  conversationId: string | null,
  patientText: string,
  reply: string,
) {
  if (!conversationId) return [];
  const statements = [
    sql`
      INSERT INTO messages (
        tenant_id, conversation_id, sender_type, content, surface, intent
      ) VALUES (
        ${tenantId}, ${conversationId}, 'patient', ${patientText},
        'patient_conversation', 'book'
      )
    `,
  ];
  if (reply.trim()) {
    statements.push(sql`
      INSERT INTO messages (
        tenant_id, conversation_id, sender_type, content, model, surface
      ) VALUES (
        ${tenantId}, ${conversationId}, 'assistant', ${reply},
        'ai-dos-booking-flow', 'patient_conversation'
      )
    `);
  }
  return statements;
}

/**
 * Один ход разговорной записи для клиники. Решение принимает чистый движок,
 * этот слой только подаёт ему факты из базы и исполняет эффект: бронирование
 * через общий идемпотентный путь либо закрытие сессии с исходом и причиной.
 */
export async function runBookingTurnForTenant(
  tenantId: string,
  actorUserId: string | null,
  input: BookingTurnInput,
): Promise<BookingTurnResult> {
  const sql = db();
  // Пациент и разговор должны принадлежать этой клинике: иначе чужой uuid
  // упёрся бы во внешний ключ уже внутри транзакции.
  await assertOwnership(sql, tenantId, input);
  const session = await openSession(sql, tenantId, input);
  if (!session) {
    throw new AppError("booking_session_failed", 500, "Не удалось открыть диалог записи.");
  }

  const [tenantRows, doctors] = await Promise.all([
    sql`SELECT timezone FROM tenants WHERE id = ${tenantId} LIMIT 1`,
    loadDoctors(sql, tenantId),
  ]);
  const timeZone = (tenantRows[0] as { timezone?: string })?.timezone || "Asia/Almaty";

  const state = stateOf(session);
  // Врач ещё не выбран — пробуем узнать его из этой же реплики, чтобы сразу
  // подтянуть расписание и не терять ход на уточнение.
  const doctorId =
    state.doctorId ??
    matchDoctor(input.message, doctors)?.id ??
    (doctors.length === 1 ? doctors[0].id : null);
  const slots = doctorId ? await findAvailableSlots(tenantId, doctorId, SEARCH_DAYS) : [];

  let turn = advanceBooking(state, {
    message: input.message,
    doctors,
    slots,
    timeZone,
  });
  let appointmentId: string | null = null;

  const booking = turn.effect.kind === "book" ? turn.effect : null;
  if (booking) {
    if (!session.patient_id) {
      turn = identityBlockedTurn(turn.state);
    } else {
      const startsAt = booking.startsAt;
      try {
        const appointment = (await createAppointmentForTenant(
          tenantId,
          actorUserId,
          {
            patientId: session.patient_id,
            doctorId: booking.doctorId,
            serviceId: session.service_id,
            startsAt,
            reason: "Разговорная запись AI Dos",
            idempotencyKey: `booking:${session.id}:${startsAt}`,
          },
          input.channel === "portal" ? "portal" : "web",
        )) as { id?: string };
        appointmentId = appointment.id ? String(appointment.id) : null;
        turn = bookedTurn(turn.state, startsAt, timeZone);
      } catch (error) {
        // Слот заняли между показом и подтверждением — предлагаем оставшиеся,
        // а не сообщаем пациенту об успехе.
        if (error instanceof AppError && ["slot_taken", "outside_schedule"].includes(error.code)) {
          const fresh = await findAvailableSlots(tenantId, booking.doctorId, SEARCH_DAYS);
          turn = slotTakenTurn(turn.state, fresh, timeZone);
        } else {
          throw error;
        }
      }
    }
  }

  const urgentRequestId =
    turn.effect.kind === "urgent"
      ? await createUrgentRequest(
          sql,
          tenantId,
          session,
          turn.effect.doctorId ?? doctorId,
          input.message,
        )
      : null;

  return persistTurn(sql, tenantId, actorUserId, session, turn, {
    doctorId,
    appointmentId,
    urgentRequestId,
    patientText: input.message,
    timeZone,
  });
}

async function persistTurn(
  sql: ReturnType<typeof db>,
  tenantId: string,
  actorUserId: string | null,
  session: SessionRow,
  turn: BookingTurn,
  meta: {
    doctorId: string | null;
    appointmentId: string | null;
    urgentRequestId: string | null;
    patientText: string;
    timeZone: string;
  },
): Promise<BookingTurnResult> {
  const next = turn.state;
  const resolvedDoctorId = next.doctorId ?? meta.doctorId;
  const closing = turn.effect.kind === "close" ? turn.effect : null;
  const messages = messageStatements(
    sql,
    tenantId,
    session.conversation_id,
    meta.patientText,
    turn.reply,
  );

  if (!closing) {
    await sql.transaction([
      sql`
        UPDATE booking_sessions
        SET stage = ${next.stage}, language = ${next.language},
          doctor_id = ${resolvedDoctorId}, offered_slots = ${JSON.stringify(next.offeredSlots)}::jsonb,
          selected_starts_at = ${next.selectedStartsAt}, misses = ${next.misses},
          urgent_request_id = COALESCE(${meta.urgentRequestId}::uuid, urgent_request_id),
          turns = turns + 1, updated_at = now()
        WHERE id = ${session.id} AND tenant_id = ${tenantId} AND outcome IS NULL
      `,
      ...messages,
    ]);
    return {
      sessionId: session.id,
      stage: next.stage,
      reply: turn.reply,
      outcome: null,
      lostReason: null,
      appointmentId: null,
      offeredSlots: next.offeredSlots,
    };
  }

  const valueKzt =
    closing.outcome === "lost"
      ? await estimateValueKzt(sql, tenantId, resolvedDoctorId)
      : null;
  const waitlisted =
    closing.outcome === "lost" && ["no_slot", "wrong_time"].includes(closing.lostReason || "");

  await sql.transaction([
    sql`
      UPDATE booking_sessions
      SET stage = 'done', language = ${next.language}, doctor_id = ${resolvedDoctorId},
        offered_slots = ${JSON.stringify(next.offeredSlots)}::jsonb,
        selected_starts_at = ${next.selectedStartsAt}, misses = ${next.misses},
        turns = turns + 1, appointment_id = ${meta.appointmentId},
        outcome = ${closing.outcome}, lost_reason = ${closing.lostReason},
        outcome_note = ${closing.note}, value_kzt = ${valueKzt},
        updated_at = now(), closed_at = now()
      WHERE id = ${session.id} AND tenant_id = ${tenantId} AND outcome IS NULL
    `,
    ...messages,
    ...(waitlisted ? [waitlistStatement(sql, tenantId, session, resolvedDoctorId)] : []),
    sql`
      INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
      VALUES (${tenantId}, ${actorUserId}, 'booking.closed', 'booking_session', ${session.id},
        ${JSON.stringify({
          outcome: closing.outcome,
          lostReason: closing.lostReason,
          appointmentId: meta.appointmentId,
        })}::jsonb)
    `,
  ]);

  if (closing.outcome === "escalated") {
    // Причину эскалации движок уже распознал — оператор видит её как есть,
    // а не «прочее».
    const reason = escalationReasons.includes(closing.note as EscalationReason)
      ? (closing.note as EscalationReason)
      : "human_request";
    await recordEscalation(tenantId, {
      conversationId: session.conversation_id,
      patientId: session.patient_id,
      channel: "web",
      intent: "book",
      reason,
      priority:
        reason === "emergency" ? "urgent" : reason === "complaint" ? "high" : "normal",
      summary: `Разговорная запись прервана. Последняя реплика пациента: ${meta.patientText.slice(0, 400)}`,
      attemptedActions: [
        {
          action: "booking_flow",
          result: `Стадия ${session.stage}, показано слотов: ${next.offeredSlots.length}`,
        },
      ],
      dedupeKey: `booking:${session.id}`,
    });
  }

  return {
    sessionId: session.id,
    stage: "done",
    reply: turn.reply,
    outcome: closing.outcome,
    lostReason: closing.lostReason,
    appointmentId: meta.appointmentId,
    offeredSlots: next.offeredSlots,
  };
}

export async function runBookingTurn(input: BookingTurnInput) {
  const user = await requireRoles(["clinic_admin", "operator"]);
  return runBookingTurnForTenant(user.tenantId, user.id, input);
}

export type BookingSessionCard = {
  id: string;
  stage: BookingStage;
  outcome: BookingOutcome | null;
  lostReason: LostReason | null;
  patientName: string | null;
  doctorName: string | null;
  updatedAt: string;
  turns: number;
};

/** Живые и недавно закрытые диалоги записи — для раздела «Операции». */
export async function listBookingSessions(limit = 12) {
  const user = await requireRoles(["clinic_admin", "operator", "doctor"]);
  const sql = db();
  const rows = (await sql`
    SELECT b.id, b.stage, b.outcome, b.lost_reason, b.turns, b.updated_at,
      p.full_name AS patient_name, d.display_name AS doctor_name
    FROM booking_sessions b
    LEFT JOIN patients p ON p.id = b.patient_id AND p.tenant_id = b.tenant_id
    LEFT JOIN doctors d ON d.id = b.doctor_id AND d.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${user.tenantId}
    ORDER BY b.outcome IS NOT NULL, b.updated_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 50)}
  `) as Array<{
    id: string;
    stage: BookingStage;
    outcome: BookingOutcome | null;
    lost_reason: LostReason | null;
    turns: number;
    updated_at: string;
    patient_name: string | null;
    doctor_name: string | null;
  }>;

  return rows.map<BookingSessionCard>((row) => ({
    id: row.id,
    stage: row.stage,
    outcome: row.outcome,
    lostReason: row.lost_reason,
    patientName: row.patient_name,
    doctorName: row.doctor_name,
    updatedAt: new Date(row.updated_at).toISOString(),
    turns: row.turns,
  }));
}
