import "server-only";

import { db } from "@/lib/db";
import { requirePermission } from "@/lib/dal/auth";
import { AppError } from "@/lib/errors";
import { safeTimelineText, sortTimeline, type PatientTimelineEvent } from "@/lib/patient-360";
import type { ConsentInput } from "@/lib/validation/patient-360";

type Row = Record<string, unknown>;

function iso(value: unknown) {
  return new Date(String(value)).toISOString();
}

function event(input: Omit<PatientTimelineEvent, "detail"> & { detail?: unknown }): PatientTimelineEvent {
  return { ...input, detail: input.detail ? safeTimelineText(input.detail) : null };
}

export async function getPatient360(patientId: string) {
  const user = await requirePermission("patients.timeline.read");
  const sql = db();
  const [patients, consents, calls, conversations, appointments, notifications, callbacks, waitlist, campaigns, tasks] = await Promise.all([
    sql`SELECT p.id, p.full_name, p.phone, p.email, p.birth_date, p.preferred_language, p.created_at,
      count(DISTINCT a.id)::int AS appointment_count,
      max(a.starts_at) FILTER (WHERE a.starts_at < now()) AS last_appointment_at,
      min(a.starts_at) FILTER (WHERE a.starts_at >= now() AND a.status IN ('held','confirmed')) AS next_appointment_at
      FROM patients p LEFT JOIN appointments a ON a.patient_id = p.id AND a.tenant_id = p.tenant_id
      WHERE p.id = ${patientId} AND p.tenant_id = ${user.tenantId} GROUP BY p.id`,
    sql`SELECT DISTINCT ON (c.purpose) c.id, c.purpose, c.status, c.source, c.text_version, c.recorded_at,
      u.full_name AS recorded_by_name FROM patient_consents c LEFT JOIN users u ON u.id = c.recorded_by AND u.tenant_id = c.tenant_id
      WHERE c.patient_id = ${patientId} AND c.tenant_id = ${user.tenantId}
      ORDER BY c.purpose, c.recorded_at DESC`,
    sql`SELECT c.id, c.direction, c.language, c.status, c.started_at, c.duration_seconds, c.outcome,
      c.external_call_id, COALESCE(u.full_name, 'AI-агент') AS actor
      FROM calls c LEFT JOIN conversations v ON v.id = c.conversation_id AND v.tenant_id = c.tenant_id
      LEFT JOIN users u ON u.id = v.assigned_user_id AND u.tenant_id = c.tenant_id
      WHERE c.patient_id = ${patientId} AND c.tenant_id = ${user.tenantId} ORDER BY c.started_at DESC LIMIT 100`,
    sql`SELECT c.id, c.channel, c.status, c.started_at, c.subject, c.language,
      COALESCE(s.summary, c.subject) AS summary, COALESCE(u.full_name, 'AI-агент') AS actor
      FROM conversations c LEFT JOIN conversation_summaries s ON s.conversation_id = c.id AND s.tenant_id = c.tenant_id
      LEFT JOIN users u ON u.id = c.assigned_user_id AND u.tenant_id = c.tenant_id
      WHERE c.patient_id = ${patientId} AND c.tenant_id = ${user.tenantId} ORDER BY c.started_at DESC LIMIT 100`,
    sql`SELECT a.id, a.starts_at, a.status, a.source, a.reason, a.external_id, a.created_at,
      d.display_name AS doctor_name, s.name AS service_name, b.name AS branch_name,
      COALESCE(u.full_name, 'Система') AS actor
      FROM appointments a JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      LEFT JOIN branches b ON b.id = a.branch_id AND b.tenant_id = a.tenant_id
      LEFT JOIN users u ON u.id = a.created_by AND u.tenant_id = a.tenant_id
      WHERE a.patient_id = ${patientId} AND a.tenant_id = ${user.tenantId} ORDER BY a.created_at DESC LIMIT 100`,
    sql`SELECT n.id, n.channel, n.status, n.template_code, n.created_at, n.sent_at, n.appointment_id,
      da.provider_reference FROM notifications n LEFT JOIN LATERAL (
        SELECT provider_reference FROM delivery_attempts d WHERE d.notification_id = n.id ORDER BY attempted_at DESC LIMIT 1
      ) da ON true WHERE n.patient_id = ${patientId} AND n.tenant_id = ${user.tenantId} ORDER BY n.created_at DESC LIMIT 100`,
    sql`SELECT c.id, c.status, c.priority, c.reason, c.preferred_time, c.created_at,
      COALESCE(u.full_name, 'Регистратура') AS actor FROM callback_requests c
      LEFT JOIN users u ON u.id = c.assigned_user_id AND u.tenant_id = c.tenant_id
      WHERE c.patient_id = ${patientId} AND c.tenant_id = ${user.tenantId} ORDER BY c.created_at DESC LIMIT 100`,
    sql`SELECT w.id, w.status, w.preferred_channel, w.created_at, w.preferred_from, w.preferred_to,
      d.display_name AS doctor_name, s.name AS service_name, b.name AS branch_name
      FROM waitlist_entries w LEFT JOIN doctors d ON d.id = w.doctor_id AND d.tenant_id = w.tenant_id
      LEFT JOIN services s ON s.id = w.service_id AND s.tenant_id = w.tenant_id
      LEFT JOIN branches b ON b.id = w.branch_id AND b.tenant_id = w.tenant_id
      WHERE w.patient_id = ${patientId} AND w.tenant_id = ${user.tenantId} ORDER BY w.created_at DESC LIMIT 100`,
    sql`SELECT cc.id, cc.status, cc.created_at, cc.sent_at, cc.provider_reference, c.name, c.channel
      FROM campaign_contacts cc JOIN campaigns c ON c.id = cc.campaign_id AND c.tenant_id = cc.tenant_id
      WHERE cc.patient_id = ${patientId} AND cc.tenant_id = ${user.tenantId} ORDER BY cc.created_at DESC LIMIT 100`,
    sql`SELECT t.id, t.status, t.kind, t.title, t.description, t.priority, t.created_at, t.due_at,
      COALESCE(u.full_name, 'Не назначено') AS actor FROM staff_tasks t
      LEFT JOIN users u ON u.id = t.assigned_user_id AND u.tenant_id = t.tenant_id
      WHERE t.patient_id = ${patientId} AND t.tenant_id = ${user.tenantId} ORDER BY t.created_at DESC LIMIT 100`,
  ]);
  const patient = patients[0] as Row | undefined;
  if (!patient) throw new AppError("patient_not_found", 404, "Пациент не найден.");

  const events: PatientTimelineEvent[] = [];
  for (const row of calls as Row[]) events.push(event({ id: `call:${row.id}`, type: "call", timestamp: iso(row.started_at), channel: "phone", status: String(row.status), title: row.direction === "outbound" ? "Исходящий звонок" : "Входящий звонок", detail: row.outcome || (row.duration_seconds ? `${row.duration_seconds} сек.` : null), actor: String(row.actor), branch: null, appointmentId: null, externalReference: row.external_call_id ? String(row.external_call_id) : null }));
  for (const row of conversations as Row[]) events.push(event({ id: `conversation:${row.id}`, type: "conversation", timestamp: iso(row.started_at), channel: String(row.channel), status: String(row.status), title: row.subject ? String(row.subject) : "Разговор с пациентом", detail: row.summary, actor: String(row.actor), branch: null, appointmentId: null, externalReference: null }));
  for (const row of appointments as Row[]) events.push(event({ id: `appointment:${row.id}`, type: "appointment", timestamp: iso(row.created_at), channel: String(row.source), status: String(row.status), title: `Запись: ${row.service_name || "приём"}`, detail: `${row.doctor_name} · ${new Date(String(row.starts_at)).toLocaleString("ru-RU", { timeZone: user.timezone })}${row.reason ? ` · ${row.reason}` : ""}`, actor: String(row.actor), branch: row.branch_name ? String(row.branch_name) : null, appointmentId: String(row.id), externalReference: row.external_id ? String(row.external_id) : null }));
  for (const row of notifications as Row[]) events.push(event({ id: `notification:${row.id}`, type: "notification", timestamp: iso(row.sent_at || row.created_at), channel: String(row.channel), status: String(row.status), title: `Уведомление: ${row.template_code}`, actor: "Система", branch: null, appointmentId: row.appointment_id ? String(row.appointment_id) : null, externalReference: row.provider_reference ? String(row.provider_reference) : null }));
  for (const row of callbacks as Row[]) events.push(event({ id: `callback:${row.id}`, type: "callback", timestamp: iso(row.created_at), channel: "phone", status: String(row.status), title: "Запрос на обратный звонок", detail: row.reason, actor: String(row.actor), branch: null, appointmentId: null, externalReference: null }));
  for (const row of waitlist as Row[]) events.push(event({ id: `waitlist:${row.id}`, type: "waitlist", timestamp: iso(row.created_at), channel: String(row.preferred_channel), status: String(row.status), title: "Лист ожидания", detail: `${row.service_name || "Услуга"}${row.doctor_name ? ` · ${row.doctor_name}` : ""}`, actor: "Система", branch: row.branch_name ? String(row.branch_name) : null, appointmentId: null, externalReference: null }));
  for (const row of campaigns as Row[]) events.push(event({ id: `campaign:${row.id}`, type: "campaign", timestamp: iso(row.sent_at || row.created_at), channel: String(row.channel), status: String(row.status), title: `Кампания: ${row.name}`, actor: "Система", branch: null, appointmentId: null, externalReference: row.provider_reference ? String(row.provider_reference) : null }));
  for (const row of tasks as Row[]) events.push(event({ id: `task:${row.id}`, type: "task", timestamp: iso(row.created_at), channel: "portal", status: String(row.status), title: String(row.title), detail: row.description, actor: String(row.actor), branch: null, appointmentId: null, externalReference: null }));
  for (const row of consents as Row[]) events.push(event({ id: `consent:${row.id}`, type: "consent", timestamp: iso(row.recorded_at), channel: String(row.source), status: String(row.status), title: row.status === "granted" ? "Согласие предоставлено" : "Согласие отозвано", detail: `${consentPurposeLabel(String(row.purpose))} · версия ${row.text_version}`, actor: String(row.recorded_by_name || "Система"), branch: null, appointmentId: null, externalReference: null }));

  return { user, patient, consents, events: sortTimeline(events).slice(0, 250) };
}

function consentPurposeLabel(value: string) {
  return ({
    data_processing: "Обработка данных",
    call_recording: "Запись разговора",
    messages: "Сообщения (SMS, Email)",
    whatsapp: "WhatsApp",
    outbound_calls: "Исходящие звонки",
    marketing_campaign: "Маркетинговые кампании",
  } as Record<string, string>)[value] || value;
}

export async function recordPatientConsent(patientId: string, input: ConsentInput, ipHash?: string | null) {
  const user = await requirePermission("patients.consents.write");
  const sql = db();
  const patient = await sql`SELECT id FROM patients WHERE id = ${patientId} AND tenant_id = ${user.tenantId} LIMIT 1`;
  if (!patient[0]) throw new AppError("patient_not_found", 404, "Пациент не найден.");
  const id = crypto.randomUUID();
  await sql.transaction([
    sql`INSERT INTO patient_consents (id, tenant_id, patient_id, purpose, status, source, text_version, evidence, recorded_by)
      VALUES (${id}, ${user.tenantId}, ${patientId}, ${input.purpose}, ${input.status}, ${input.source}, ${input.textVersion}, ${JSON.stringify({ capturedIn: "patient_360" })}::jsonb, ${user.id})`,
    sql`INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata, ip_hash)
      VALUES (${user.tenantId}, ${user.id}, ${input.status === "granted" ? "patient.consent.granted" : "patient.consent.withdrawn"}, 'patient_consent', ${id}, ${JSON.stringify({ patientId, purpose: input.purpose, source: input.source, textVersion: input.textVersion })}::jsonb, ${ipHash || null})`,
  ]);
  return { id, ...input };
}
