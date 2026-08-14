import "server-only";

import { randomUUID } from "node:crypto";
import {
  parseConfirmation,
  parseSlotChoice,
  type OfferedSlot,
} from "@/lib/booking/flow";
import { detectIntent } from "@/lib/ai/escalation";
import type { SupportedLanguage } from "@/lib/ai/language";
import { db } from "@/lib/db";
import {
  changeAppointmentForTenant,
  findAvailableSlots,
} from "@/lib/dal/operations";

type AppointmentItem = {
  id: string;
  doctor_id: string;
  doctor_name: string;
  service_name: string | null;
  branch_name: string | null;
  address: string | null;
  starts_at: string;
};

type ActionSession = {
  id: string;
  action: "cancel" | "reschedule";
  stage: "select_appointment" | "confirm_cancel" | "select_slot" | "confirm_reschedule";
  appointment_id: string | null;
  offered_appointments: AppointmentItem[];
  offered_slots: OfferedSlot[];
  selected_starts_at: string | null;
};

export type PatientAppointmentTurn = {
  reply: string;
  action: "appointment_info" | "cancel" | "reschedule";
  stage: ActionSession["stage"] | "done" | null;
  outcome: "completed" | "cancelled" | null;
};

function localeName(language: SupportedLanguage) {
  return language === "kk" ? "kk-KZ" : language === "en" ? "en-GB" : "ru-RU";
}

function formatDate(value: string, language: SupportedLanguage, timeZone: string) {
  return new Intl.DateTimeFormat(localeName(language), {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(value));
}

function appointmentLine(
  item: AppointmentItem,
  index: number,
  language: SupportedLanguage,
  timeZone: string,
) {
  const service = item.service_name ? ` — ${item.service_name}` : "";
  const branch = item.branch_name ? `, ${item.branch_name}` : "";
  return `${index + 1}) ${item.doctor_name}${service} — ${formatDate(item.starts_at, language, timeZone)}${branch}`;
}

function chooseAppointment(text: string, items: AppointmentItem[]) {
  const numbered = text.match(/(?:^|[^\d])([1-9])(?!\d)/);
  if (numbered) return items[Number(numbered[1]) - 1] ?? null;
  const lowered = text.toLocaleLowerCase("ru-KZ");
  const matches = items.filter((item) =>
    item.doctor_name
      .toLocaleLowerCase("ru-KZ")
      .split(/[^\p{L}\p{N}]+/u)
      .some((token) => token.length >= 5 && lowered.includes(token.slice(0, -2))),
  );
  return matches.length === 1 ? matches[0] : null;
}

async function activeAppointments(tenantId: string, patientId: string) {
  const sql = db();
  return (await sql`
    SELECT a.id, a.doctor_id, d.display_name AS doctor_name,
      s.name AS service_name, b.name AS branch_name, b.address,
      a.starts_at::text
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
    LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
    LEFT JOIN branches b ON b.id = a.branch_id AND b.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenantId} AND a.patient_id = ${patientId}
      AND a.status IN ('held', 'confirmed') AND a.starts_at > now()
    ORDER BY a.starts_at
    LIMIT 10
  `) as AppointmentItem[];
}

async function saveExchange(
  tenantId: string,
  conversationId: string,
  message: string,
  reply: string,
  intent: string,
) {
  const sql = db();
  await sql.transaction([
    sql`
      INSERT INTO messages (tenant_id, conversation_id, sender_type, content, surface, intent)
      VALUES (${tenantId}, ${conversationId}, 'patient', ${message},
        'patient_conversation', ${intent})
    `,
    sql`
      INSERT INTO messages (tenant_id, conversation_id, sender_type, content, model, surface)
      VALUES (${tenantId}, ${conversationId}, 'assistant', ${reply},
        'ai-dos-patient-appointment-action', 'patient_conversation')
    `,
  ]);
}

function noAppointments(language: SupportedLanguage) {
  if (language === "kk") return "Алдағы белсенді жазбалар табылмады.";
  if (language === "en") return "I couldn’t find any upcoming active appointments.";
  return "Будущих активных записей не найдено.";
}

function appointmentList(
  items: AppointmentItem[],
  language: SupportedLanguage,
  timeZone: string,
) {
  const list = items.map((item, index) => appointmentLine(item, index, language, timeZone)).join("\n");
  if (language === "kk") return `Сіздің алдағы жазбаларыңыз:\n${list}`;
  if (language === "en") return `Your upcoming appointments:\n${list}`;
  return `Ваши предстоящие записи:\n${list}`;
}

function selectAppointmentPrompt(
  action: "cancel" | "reschedule",
  items: AppointmentItem[],
  language: SupportedLanguage,
  timeZone: string,
) {
  const list = appointmentList(items, language, timeZone);
  if (language === "kk") return `${list}\n\nҚай жазба керек? Нөмірін жазыңыз.`;
  if (language === "en") return `${list}\n\nWhich appointment should I ${action}? Reply with its number.`;
  return `${list}\n\nКакую запись нужно ${action === "cancel" ? "отменить" : "перенести"}? Напишите её номер.`;
}

function confirmCancelPrompt(
  item: AppointmentItem,
  language: SupportedLanguage,
  timeZone: string,
) {
  const line = appointmentLine(item, 0, language, timeZone).replace(/^1\)\s*/, "");
  if (language === "kk") return `Осы жазбадан бас тартуды растайсыз ба?\n${line}\n\n«Иә» немесе «жоқ» деп жауап беріңіз.`;
  if (language === "en") return `Confirm cancellation of this appointment?\n${line}\n\nReply “yes” or “no”.`;
  return `Подтверждаете отмену этой записи?\n${line}\n\nОтветьте «да» или «нет».`;
}

function slotPrompt(
  item: AppointmentItem,
  slots: OfferedSlot[],
  language: SupportedLanguage,
  timeZone: string,
) {
  if (!slots.length) {
    if (language === "kk") return "Бұл дәрігерде алдағы 7 күнге бос уақыт жоқ. Клиника қызметкерінен кері қоңырау сұрай аласыз.";
    if (language === "en") return "This doctor has no availability in the next 7 days. You can request a callback from clinic staff.";
    return "У этого врача нет свободных окон на ближайшие 7 дней. Можно запросить обратный звонок сотрудника.";
  }
  const list = slots.map((slot, index) => `${index + 1}) ${formatDate(slot.startsAt, language, timeZone)}`).join("\n");
  if (language === "kk") return `${item.doctor_name} дәрігерінің бос уақыты:\n${list}\n\nҚолайлы нұсқаның нөмірін немесе уақытын жазыңыз.`;
  if (language === "en") return `Available times with ${item.doctor_name}:\n${list}\n\nReply with a number or time.`;
  return `Свободные окна у врача ${item.doctor_name}:\n${list}\n\nНапишите номер или время подходящего варианта.`;
}

function confirmReschedulePrompt(
  item: AppointmentItem,
  startsAt: string,
  language: SupportedLanguage,
  timeZone: string,
) {
  const date = formatDate(startsAt, language, timeZone);
  if (language === "kk") return `${item.doctor_name} дәрігеріне жазбаны ${date} уақытына ауыстыруды растайсыз ба? «Иә» немесе «жоқ» деп жауап беріңіз.`;
  if (language === "en") return `Confirm moving the appointment with ${item.doctor_name} to ${date}? Reply “yes” or “no”.`;
  return `Подтверждаете перенос записи к врачу ${item.doctor_name} на ${date}? Ответьте «да» или «нет».`;
}

function completedReply(action: "cancel" | "reschedule", language: SupportedLanguage) {
  if (action === "cancel") {
    if (language === "kk") return "Жазба тоқтатылды. Бос уақыт енді күту тізіміне ұсынылуы мүмкін. Қаласаңыз, жаңа уақытты таңдай аламын.";
    if (language === "en") return "The appointment is cancelled. The released time can now be offered to the waitlist. I can help you choose another time.";
    return "Запись отменена. Освободившееся время теперь может быть предложено листу ожидания. Могу помочь выбрать другое время.";
  }
  if (language === "kk") return "Жазба жаңа уақытқа ауыстырылды. Растау хабарламасы жіберу кезегіне қойылды.";
  if (language === "en") return "The appointment has been moved. A confirmation is queued for delivery.";
  return "Запись перенесена на новое время. Подтверждение поставлено в очередь отправки.";
}

function cancelledReply(language: SupportedLanguage) {
  if (language === "kk") return "Жақсы, ештеңе өзгерткен жоқпын.";
  if (language === "en") return "Okay, I didn’t change anything.";
  return "Хорошо, ничего не изменено.";
}

export async function runPatientAppointmentTurnForTenant(
  tenantId: string,
  input: {
    message: string;
    patientId: string;
    conversationId: string;
    language: SupportedLanguage;
    channel?: "web" | "phone" | "whatsapp" | "telegram" | "mcp";
  },
): Promise<PatientAppointmentTurn> {
  const sql = db();
  const tenants = (await sql`SELECT timezone FROM tenants WHERE id = ${tenantId} LIMIT 1`) as Array<{ timezone: string }>;
  const timeZone = tenants[0]?.timezone ?? "Asia/Almaty";

  await sql`
    UPDATE patient_appointment_actions
    SET outcome = 'expired', completed_at = now(), updated_at = now()
    WHERE tenant_id = ${tenantId} AND conversation_id = ${input.conversationId}
      AND outcome IS NULL AND expires_at <= now()
  `;
  const sessions = (await sql`
    SELECT id, action, stage, appointment_id, offered_appointments,
      offered_slots, selected_starts_at
    FROM patient_appointment_actions
    WHERE tenant_id = ${tenantId} AND conversation_id = ${input.conversationId}
      AND patient_id = ${input.patientId} AND outcome IS NULL AND expires_at > now()
    LIMIT 1
  `) as ActionSession[];
  const session = sessions[0];

  if (!session) {
    const intent = detectIntent(input.message);
    const items = await activeAppointments(tenantId, input.patientId);
    if (intent === "appointment_info") {
      const reply = items.length ? appointmentList(items, input.language, timeZone) : noAppointments(input.language);
      await saveExchange(tenantId, input.conversationId, input.message, reply, intent);
      return { reply, action: "appointment_info", stage: null, outcome: null };
    }
    const action = intent === "reschedule" ? "reschedule" : "cancel";
    if (!items.length) {
      const reply = noAppointments(input.language);
      await saveExchange(tenantId, input.conversationId, input.message, reply, action);
      return { reply, action, stage: null, outcome: null };
    }
    const id = randomUUID();
    if (items.length > 1) {
      const reply = selectAppointmentPrompt(action, items, input.language, timeZone);
      await sql`
        INSERT INTO patient_appointment_actions (
          id, tenant_id, conversation_id, patient_id, action, stage, offered_appointments
        ) VALUES (
          ${id}, ${tenantId}, ${input.conversationId}, ${input.patientId},
          ${action}, 'select_appointment', ${JSON.stringify(items)}::jsonb
        )
      `;
      await saveExchange(tenantId, input.conversationId, input.message, reply, action);
      return { reply, action, stage: "select_appointment", outcome: null };
    }
    const item = items[0];
    if (action === "cancel") {
      const reply = confirmCancelPrompt(item, input.language, timeZone);
      await sql`
        INSERT INTO patient_appointment_actions (
          id, tenant_id, conversation_id, patient_id, action, stage,
          appointment_id, offered_appointments
        ) VALUES (
          ${id}, ${tenantId}, ${input.conversationId}, ${input.patientId},
          'cancel', 'confirm_cancel', ${item.id}, ${JSON.stringify(items)}::jsonb
        )
      `;
      await saveExchange(tenantId, input.conversationId, input.message, reply, action);
      return { reply, action, stage: "confirm_cancel", outcome: null };
    }
    const slots = (await findAvailableSlots(tenantId, item.doctor_id, 7)).slice(0, 3);
    const reply = slotPrompt(item, slots, input.language, timeZone);
    await sql`
      INSERT INTO patient_appointment_actions (
        id, tenant_id, conversation_id, patient_id, action, stage,
        appointment_id, offered_appointments, offered_slots, outcome, completed_at
      ) VALUES (
        ${id}, ${tenantId}, ${input.conversationId}, ${input.patientId},
        'reschedule', 'select_slot', ${item.id}, ${JSON.stringify(items)}::jsonb,
        ${JSON.stringify(slots)}::jsonb, ${slots.length ? null : "cancelled"},
        ${slots.length ? null : new Date().toISOString()}
      )
    `;
    await saveExchange(tenantId, input.conversationId, input.message, reply, action);
    return { reply, action, stage: slots.length ? "select_slot" : null, outcome: null };
  }

  const items = session.offered_appointments;
  let item = items.find((candidate) => candidate.id === session.appointment_id) ?? null;
  if (session.stage === "select_appointment") {
    item = chooseAppointment(input.message, items);
    if (!item) {
      const reply = selectAppointmentPrompt(session.action, items, input.language, timeZone);
      await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
      return { reply, action: session.action, stage: session.stage, outcome: null };
    }
    if (session.action === "cancel") {
      const reply = confirmCancelPrompt(item, input.language, timeZone);
      await sql`
        UPDATE patient_appointment_actions
        SET appointment_id = ${item.id}, stage = 'confirm_cancel', updated_at = now()
        WHERE id = ${session.id} AND tenant_id = ${tenantId} AND outcome IS NULL
      `;
      await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
      return { reply, action: session.action, stage: "confirm_cancel", outcome: null };
    }
    const slots = (await findAvailableSlots(tenantId, item.doctor_id, 7)).slice(0, 3);
    const reply = slotPrompt(item, slots, input.language, timeZone);
    await sql`
      UPDATE patient_appointment_actions
      SET appointment_id = ${item.id}, stage = 'select_slot',
        offered_slots = ${JSON.stringify(slots)}::jsonb,
        outcome = ${slots.length ? null : "cancelled"},
        completed_at = ${slots.length ? null : new Date().toISOString()}, updated_at = now()
      WHERE id = ${session.id} AND tenant_id = ${tenantId} AND outcome IS NULL
    `;
    await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
    return { reply, action: session.action, stage: slots.length ? "select_slot" : null, outcome: null };
  }

  if (!item) {
    const reply = noAppointments(input.language);
    await sql`UPDATE patient_appointment_actions SET outcome = 'expired', completed_at = now(), updated_at = now() WHERE id = ${session.id} AND tenant_id = ${tenantId}`;
    await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
    return { reply, action: session.action, stage: null, outcome: "cancelled" };
  }

  if (session.stage === "confirm_cancel") {
    const confirmation = parseConfirmation(input.message);
    if (confirmation === "unclear") {
      const reply = confirmCancelPrompt(item, input.language, timeZone);
      await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
      return { reply, action: session.action, stage: session.stage, outcome: null };
    }
    if (confirmation === "no") {
      const reply = cancelledReply(input.language);
      await sql`UPDATE patient_appointment_actions SET outcome = 'cancelled', completed_at = now(), updated_at = now() WHERE id = ${session.id} AND tenant_id = ${tenantId} AND outcome IS NULL`;
      await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
      return { reply, action: session.action, stage: "done", outcome: "cancelled" };
    }
    await changeAppointmentForTenant(
      tenantId,
      null,
      item.id,
      {
        action: "cancel",
        reason: "Отменено пациентом после явного подтверждения",
        idempotencyKey: `patient-action:${session.id}`,
      },
      { patientId: input.patientId, source: input.channel ?? "web" },
    );
    const reply = completedReply("cancel", input.language);
    await sql`UPDATE patient_appointment_actions SET outcome = 'completed', completed_at = now(), updated_at = now() WHERE id = ${session.id} AND tenant_id = ${tenantId} AND outcome IS NULL`;
    await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
    return { reply, action: session.action, stage: "done", outcome: "completed" };
  }

  if (session.stage === "select_slot") {
    const slot = parseSlotChoice(input.message, session.offered_slots, timeZone);
    if (!slot) {
      const reply = slotPrompt(item, session.offered_slots, input.language, timeZone);
      await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
      return { reply, action: session.action, stage: session.stage, outcome: null };
    }
    const reply = confirmReschedulePrompt(item, slot.startsAt, input.language, timeZone);
    await sql`
      UPDATE patient_appointment_actions
      SET selected_starts_at = ${slot.startsAt}, stage = 'confirm_reschedule', updated_at = now()
      WHERE id = ${session.id} AND tenant_id = ${tenantId} AND outcome IS NULL
    `;
    await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
    return { reply, action: session.action, stage: "confirm_reschedule", outcome: null };
  }

  const confirmation = parseConfirmation(input.message);
  if (confirmation === "unclear" || !session.selected_starts_at) {
    const reply = confirmReschedulePrompt(item, session.selected_starts_at ?? session.offered_slots[0]?.startsAt, input.language, timeZone);
    await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
    return { reply, action: session.action, stage: session.stage, outcome: null };
  }
  if (confirmation === "no") {
    const reply = cancelledReply(input.language);
    await sql`UPDATE patient_appointment_actions SET outcome = 'cancelled', completed_at = now(), updated_at = now() WHERE id = ${session.id} AND tenant_id = ${tenantId} AND outcome IS NULL`;
    await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
    return { reply, action: session.action, stage: "done", outcome: "cancelled" };
  }
  await changeAppointmentForTenant(
    tenantId,
    null,
    item.id,
    {
      action: "reschedule",
      startsAt: session.selected_starts_at,
      reason: "Перенесено пациентом после явного подтверждения",
      idempotencyKey: `patient-action:${session.id}`,
    },
    { patientId: input.patientId, source: input.channel ?? "web" },
  );
  const reply = completedReply("reschedule", input.language);
  await sql`UPDATE patient_appointment_actions SET outcome = 'completed', completed_at = now(), updated_at = now() WHERE id = ${session.id} AND tenant_id = ${tenantId} AND outcome IS NULL`;
  await saveExchange(tenantId, input.conversationId, input.message, reply, session.action);
  return { reply, action: session.action, stage: "done", outcome: "completed" };
}
