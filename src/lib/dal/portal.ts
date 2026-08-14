import "server-only";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal/auth";

export async function getPortalOverview() {
  const user = await requireUser();
  const sql = db();

  const [conversations, messages, appointments, doctors, services, callbacks] =
    await Promise.all([
      sql`
        SELECT c.id, c.status, c.channel, c.language, c.subject, c.started_at,
          p.id AS patient_id, p.full_name AS patient_name, p.phone, p.birth_date, p.notes
        FROM conversations c
        LEFT JOIN patients p ON p.id = c.patient_id AND p.tenant_id = c.tenant_id
        WHERE c.tenant_id = ${user.tenantId}
        ORDER BY c.started_at DESC
        LIMIT 12
      `,
      sql`
        SELECT m.id, m.conversation_id, m.sender_type, m.content, m.created_at
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id AND c.tenant_id = m.tenant_id
        WHERE m.tenant_id = ${user.tenantId}
          AND m.surface = 'patient_conversation'
          AND c.id = (
            SELECT id FROM conversations
            WHERE tenant_id = ${user.tenantId}
            ORDER BY started_at DESC LIMIT 1
          )
        ORDER BY m.created_at ASC
      `,
      sql`
        SELECT a.id, a.patient_id, a.doctor_id, a.starts_at, a.ends_at,
          a.status, a.source, a.reason,
          p.full_name AS patient_name, d.display_name AS doctor_name,
          s.name AS service_name, b.name AS branch_name
        FROM appointments a
        JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
        JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
        LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
        LEFT JOIN branches b ON b.id = a.branch_id AND b.tenant_id = a.tenant_id
        WHERE a.tenant_id = ${user.tenantId}
          AND a.starts_at >= now() - interval '1 day'
        ORDER BY a.starts_at ASC
        LIMIT 24
      `,
      sql`
        SELECT d.id, d.display_name, d.languages, d.room,
          s.name AS specialty_name, b.name AS branch_name
        FROM doctors d
        LEFT JOIN specialties s ON s.id = d.specialty_id AND s.tenant_id = d.tenant_id
        LEFT JOIN branches b ON b.id = d.branch_id AND b.tenant_id = d.tenant_id
        WHERE d.tenant_id = ${user.tenantId} AND d.active = true
        ORDER BY d.display_name
      `,
      sql`
        SELECT id, name, description, duration_minutes, price_kzt
        FROM services
        WHERE tenant_id = ${user.tenantId} AND active = true
        ORDER BY name
      `,
      sql`
        SELECT id, name, phone, reason, preferred_time, priority, status, created_at
        FROM callback_requests
        WHERE tenant_id = ${user.tenantId} AND status IN ('new', 'in_progress')
        ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, created_at DESC
        LIMIT 12
      `,
    ]);

  return {
    user,
    conversations,
    messages,
    appointments,
    doctors,
    services,
    callbacks,
    integration: {
      provider: "DAMUMED",
      mode: "official_api_pending" as const,
    },
  };
}

export async function getPatients() {
  const user = await requireUser();
  const sql = db();
  const patients = await sql`
    SELECT p.id, p.full_name, p.phone, p.email, p.birth_date, p.preferred_language,
      p.notes, p.created_at,
      count(a.id)::int AS appointment_count,
      max(a.starts_at) AS last_appointment_at
    FROM patients p
    LEFT JOIN appointments a ON a.patient_id = p.id AND a.tenant_id = p.tenant_id
    WHERE p.tenant_id = ${user.tenantId}
    GROUP BY p.id
    ORDER BY p.updated_at DESC
    LIMIT 100
  `;
  return { user, patients };
}

export async function getSchedule() {
  const user = await requireUser();
  const sql = db();
  const [appointments, doctors, patients, services] = await Promise.all([
    sql`
      SELECT a.id, a.starts_at, a.ends_at, a.status, a.source, a.reason,
        p.full_name AS patient_name, p.phone,
        d.id AS doctor_id, d.display_name AS doctor_name, d.room,
        s.name AS service_name
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
      JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = ${user.tenantId}
        AND a.starts_at >= date_trunc('day', now()) - interval '1 day'
        AND a.starts_at < date_trunc('day', now()) + interval '14 days'
      ORDER BY a.starts_at
    `,
    sql`
      SELECT d.id, d.display_name, d.room, d.specialty_id, s.name AS specialty_name
      FROM doctors d
      LEFT JOIN specialties s ON s.id = d.specialty_id AND s.tenant_id = d.tenant_id
      WHERE d.tenant_id = ${user.tenantId} AND d.active = true
      ORDER BY d.display_name
    `,
    sql`
      SELECT id, full_name, phone
      FROM patients
      WHERE tenant_id = ${user.tenantId}
      ORDER BY full_name
      LIMIT 200
    `,
    sql`
      SELECT id, name, duration_minutes, specialty_id
      FROM services
      WHERE tenant_id = ${user.tenantId} AND active = true
      ORDER BY name
    `,
  ]);

  return { user, appointments, doctors, patients, services };
}

export async function getKnowledge() {
  const user = await requireUser();
  const sql = db();
  const articles = await sql`
    SELECT a.id, a.title, a.slug, a.status, a.updated_at,
      latest.version::int AS latest_version,
      latest.locale,
      latest.content,
      (
        SELECT count(*)::int
        FROM knowledge_article_versions count_versions
        WHERE count_versions.article_id = a.id
          AND count_versions.tenant_id = a.tenant_id
      ) AS version_count
    FROM knowledge_articles a
    LEFT JOIN LATERAL (
      SELECT v.version, v.locale, v.content
      FROM knowledge_article_versions v
      WHERE v.article_id = a.id AND v.tenant_id = a.tenant_id
      ORDER BY v.version DESC, v.created_at DESC
      LIMIT 1
    ) latest ON true
    WHERE a.tenant_id = ${user.tenantId}
    ORDER BY a.updated_at DESC
  `;
  return { user, articles };
}

export async function getReports() {
  const user = await requireUser();
  const sql = db();
  const [summary, daily] = await Promise.all([
    sql`
      WITH context AS (
        SELECT timezone FROM tenants WHERE id = ${user.tenantId}
      )
      SELECT
        count(a.id) FILTER (
          WHERE (a.starts_at AT TIME ZONE context.timezone) >=
            date_trunc('month', now() AT TIME ZONE context.timezone)
        )::int AS appointments_month,
        count(a.id) FILTER (
          WHERE a.status = 'confirmed' AND a.starts_at >= now()
        )::int AS upcoming,
        count(a.id) FILTER (
          WHERE a.status = 'cancelled'
            AND (a.starts_at AT TIME ZONE context.timezone) >=
              date_trunc('month', now() AT TIME ZONE context.timezone)
        )::int AS cancelled_month,
        (SELECT count(*)::int FROM patients p WHERE p.tenant_id = ${user.tenantId}) AS patients_total
      FROM context
      LEFT JOIN appointments a ON a.tenant_id = ${user.tenantId}
      GROUP BY context.timezone
    `,
    sql`
      WITH context AS (
        SELECT timezone FROM tenants WHERE id = ${user.tenantId}
      ), days AS (
        SELECT generate_series(
          (now() AT TIME ZONE context.timezone)::date - 6,
          (now() AT TIME ZONE context.timezone)::date,
          interval '1 day'
        )::date AS day, context.timezone
        FROM context
      )
      SELECT to_char(days.day, 'DD.MM') AS label,
        count(a.id)::int AS appointments
      FROM days
      LEFT JOIN appointments a
        ON a.tenant_id = ${user.tenantId}
       AND (a.starts_at AT TIME ZONE days.timezone)::date = days.day
      GROUP BY days.day
      ORDER BY days.day
    `,
  ]);
  return { user, summary: summary[0] ?? {}, daily };
}

export async function getVoiceCenter() {
  const user = await requireUser();
  const sql = db();
  const [phoneNumbers, sessions, calls] = await Promise.all([
    sql`
      SELECT id, e164, label, provider, voice, languages, status, updated_at
      FROM phone_numbers
      WHERE tenant_id = ${user.tenantId}
      ORDER BY updated_at DESC
    `,
    sql`
      SELECT id, model, voice, requested_language, detected_language, status,
        latency_ms, started_at, ended_at, summary, next_action,
        jsonb_array_length(transcript) AS transcript_items
      FROM voice_sessions
      WHERE tenant_id = ${user.tenantId}
      ORDER BY started_at DESC
      LIMIT 12
    `,
    sql`
      SELECT id, direction, from_number, to_number, language, status,
        started_at, answered_at, ended_at, duration_seconds, outcome
      FROM calls
      WHERE tenant_id = ${user.tenantId}
      ORDER BY started_at DESC
      LIMIT 12
    `,
  ]);
  return {
    user,
    phoneNumbers,
    sessions,
    calls,
    configuration: {
      geminiKey: Boolean(process.env.GEMINI_API_KEY),
      openaiKey: Boolean(process.env.OPENAI_API_KEY),
      webhookSecret: Boolean(process.env.OPENAI_WEBHOOK_SECRET),
      projectId: process.env.OPENAI_PROJECT_ID || null,
      sipUri: process.env.OPENAI_PROJECT_ID
        ? `sip:${process.env.OPENAI_PROJECT_ID}@sip.api.openai.com;transport=tls`
        : null,
    },
  };
}

export async function getOperationsHub() {
  const user = await requireUser();
  const sql = db();
  const [
    escalations,
    calls,
    callbacks,
    waitlist,
    offers,
    urgentRequests,
    tasks,
    notifications,
  ] = await Promise.all([
    sql`
      SELECT e.id, e.channel, e.intent, e.reason, e.priority, e.summary,
        e.attempted_actions, e.patient_context, e.status, e.created_at,
        p.full_name AS patient_name
      FROM escalations e
      LEFT JOIN patients p ON p.id = e.patient_id AND p.tenant_id = e.tenant_id
      WHERE e.tenant_id = ${user.tenantId} AND e.status IN ('open', 'claimed')
      ORDER BY CASE e.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        e.created_at DESC
      LIMIT 30
    `,
      sql`
        SELECT id, direction, from_number, to_number, language, status,
          started_at, duration_seconds, outcome
        FROM calls
        WHERE tenant_id = ${user.tenantId}
        ORDER BY started_at DESC LIMIT 30
      `,
      sql`
        SELECT id, name, phone, preferred_time, reason, priority, status, created_at
        FROM callback_requests
        WHERE tenant_id = ${user.tenantId}
        ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
          CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
          created_at DESC LIMIT 30
      `,
      sql`
        SELECT w.id, w.status, w.preferred_from, w.preferred_to,
          w.preferred_channel, w.priority, w.created_at,
          p.full_name AS patient_name, p.phone,
          d.display_name AS doctor_name, s.name AS service_name
        FROM waitlist_entries w
        JOIN patients p ON p.id = w.patient_id AND p.tenant_id = w.tenant_id
        LEFT JOIN doctors d ON d.id = w.doctor_id AND d.tenant_id = w.tenant_id
        LEFT JOIN services s ON s.id = w.service_id AND s.tenant_id = w.tenant_id
        WHERE w.tenant_id = ${user.tenantId}
        ORDER BY w.priority, w.created_at DESC LIMIT 30
      `,
      sql`
        SELECT o.id, o.starts_at, o.expires_at, o.channel, o.status,
          o.duration_minutes, o.created_at,
          p.full_name AS patient_name, d.display_name AS doctor_name
        FROM waitlist_offers o
        JOIN waitlist_entries w ON w.id = o.waitlist_entry_id AND w.tenant_id = o.tenant_id
        JOIN patients p ON p.id = w.patient_id AND p.tenant_id = o.tenant_id
        LEFT JOIN doctors d ON d.id = o.doctor_id AND d.tenant_id = o.tenant_id
        WHERE o.tenant_id = ${user.tenantId}
        ORDER BY CASE o.status WHEN 'sent' THEN 0 ELSE 1 END, o.created_at DESC
        LIMIT 20
      `,
      sql`
        SELECT u.id, u.reason, u.status, u.requested_at, u.resolution_note,
          u.doctor_id, u.proposed_starts_at,
          p.full_name AS patient_name, d.display_name AS doctor_name
        FROM urgent_requests u
        LEFT JOIN patients p ON p.id = u.patient_id AND p.tenant_id = u.tenant_id
        LEFT JOIN doctors d ON d.id = u.doctor_id AND d.tenant_id = u.tenant_id
        WHERE u.tenant_id = ${user.tenantId}
        ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.requested_at DESC
        LIMIT 30
      `,
      sql`
        SELECT t.id, t.kind, t.title, t.description, t.priority, t.status,
          t.due_at, t.created_at, p.full_name AS patient_name,
          u.full_name AS assignee_name
        FROM staff_tasks t
        LEFT JOIN patients p ON p.id = t.patient_id AND p.tenant_id = t.tenant_id
        LEFT JOIN users u ON u.id = t.assigned_user_id AND u.tenant_id = t.tenant_id
        WHERE t.tenant_id = ${user.tenantId}
        ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
          CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
          t.created_at DESC LIMIT 30
      `,
      sql`
        SELECT n.id, n.channel, n.template_code, n.status, n.scheduled_at,
          n.sent_at, n.attempts, n.provider, n.last_error, n.next_attempt_at,
          p.full_name AS patient_name
        FROM notifications n
        LEFT JOIN patients p ON p.id = n.patient_id AND p.tenant_id = n.tenant_id
        WHERE n.tenant_id = ${user.tenantId}
        ORDER BY n.scheduled_at DESC LIMIT 30
      `,
    ]);
  return {
    user,
    escalations,
    calls,
    callbacks,
    waitlist,
    offers,
    urgentRequests,
    tasks,
    notifications,
  };
}

export async function getClinicHub() {
  const user = await requireUser();
  const sql = db();
  const [branches, departments, doctors, staff, services, roles] =
    await Promise.all([
      sql`
        SELECT b.id, b.name, b.address, b.phone, b.timezone, b.active,
          c.name AS clinic_name
        FROM branches b
        JOIN clinics c ON c.id = b.clinic_id AND c.tenant_id = b.tenant_id
        WHERE b.tenant_id = ${user.tenantId}
        ORDER BY b.name
      `,
      sql`
        SELECT d.id, d.name, d.description, b.name AS branch_name
        FROM departments d
        LEFT JOIN branches b ON b.id = d.branch_id AND b.tenant_id = d.tenant_id
        WHERE d.tenant_id = ${user.tenantId}
        ORDER BY d.name
      `,
      sql`
        SELECT d.id, d.display_name, d.full_name, d.languages, d.room, d.active,
          s.name AS specialty_name, b.name AS branch_name,
          count(a.id) FILTER (WHERE a.starts_at >= now() AND a.status = 'confirmed')::int AS upcoming_count
        FROM doctors d
        LEFT JOIN specialties s ON s.id = d.specialty_id AND s.tenant_id = d.tenant_id
        LEFT JOIN branches b ON b.id = d.branch_id AND b.tenant_id = d.tenant_id
        LEFT JOIN appointments a ON a.doctor_id = d.id AND a.tenant_id = d.tenant_id
        WHERE d.tenant_id = ${user.tenantId}
        GROUP BY d.id, s.name, b.name
        ORDER BY d.display_name
      `,
      sql`
        SELECT u.id, u.full_name, u.email, u.phone, u.status, u.last_login_at,
          COALESCE(string_agg(DISTINCT r.name, ', '), 'Без роли') AS role_names
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.tenant_id = ${user.tenantId}
        GROUP BY u.id
        ORDER BY u.full_name
      `,
      sql`
        SELECT s.id, s.name, s.duration_minutes, s.price_kzt, s.active,
          sp.name AS specialty_name
        FROM services s
        LEFT JOIN specialties sp ON sp.id = s.specialty_id AND sp.tenant_id = s.tenant_id
        WHERE s.tenant_id = ${user.tenantId}
        ORDER BY s.name
      `,
      sql`
        SELECT r.id, r.code, r.name, r.system,
          count(rp.permission_id)::int AS permission_count,
          count(DISTINCT ur.user_id)::int AS user_count
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN user_roles ur ON ur.role_id = r.id AND ur.tenant_id = r.tenant_id
        WHERE r.tenant_id = ${user.tenantId}
        GROUP BY r.id
        ORDER BY r.name
      `,
    ]);
  return { user, branches, departments, doctors, staff, services, roles };
}

export async function getAutomationHub() {
  const user = await requireUser();
  const sql = db();
  const [
    scenarios,
    campaigns,
    templates,
    integrations,
    outbox,
    articles,
    deliveryStats,
    deliveryAttempts,
    misSyncStats,
  ] = await Promise.all([
      sql`
        SELECT s.id, s.name, s.trigger_kind, s.status, s.active_version,
          s.updated_at, count(v.id)::int AS version_count
        FROM scenarios s
        LEFT JOIN scenario_versions v ON v.scenario_id = s.id AND v.tenant_id = s.tenant_id
        WHERE s.tenant_id = ${user.tenantId}
        GROUP BY s.id ORDER BY s.updated_at DESC
      `,
      sql`
        SELECT c.id, c.name, c.purpose, c.channel, c.locale, c.status,
          c.scheduled_at, c.created_at,
          count(cc.id)::int AS audience_count,
          count(cc.id) FILTER (WHERE cc.status = 'delivered')::int AS delivered_count
        FROM campaigns c
        LEFT JOIN campaign_contacts cc ON cc.campaign_id = c.id AND cc.tenant_id = c.tenant_id
        WHERE c.tenant_id = ${user.tenantId}
        GROUP BY c.id ORDER BY c.created_at DESC
      `,
      sql`
        SELECT id, code, locale, channel, subject, version, status, updated_at
        FROM notification_templates
        WHERE tenant_id = ${user.tenantId}
        ORDER BY updated_at DESC LIMIT 50
      `,
      sql`
        SELECT id, provider, mode, status, last_checked_at, created_at
        FROM integrations
        WHERE tenant_id = ${user.tenantId}
        ORDER BY provider
      `,
      sql`
        SELECT id, topic, aggregate_type, status, attempts, available_at, created_at
        FROM outbox_events
        WHERE tenant_id = ${user.tenantId}
        ORDER BY created_at DESC LIMIT 30
      `,
      sql`
        SELECT id, title, status, updated_at
        FROM knowledge_articles
        WHERE tenant_id = ${user.tenantId}
        ORDER BY updated_at DESC LIMIT 20
      `,
      sql`
        SELECT status, count(*)::int AS count
        FROM notifications
        WHERE tenant_id = ${user.tenantId}
          AND scheduled_at > now() - interval '30 days'
        GROUP BY status
      `,
      sql`
        SELECT a.id, a.provider, a.status, a.attempt, a.error_code,
          a.duration_ms, a.attempted_at, n.template_code, n.channel
        FROM delivery_attempts a
        JOIN notifications n ON n.id = a.notification_id AND n.tenant_id = a.tenant_id
        WHERE a.tenant_id = ${user.tenantId}
        ORDER BY a.attempted_at DESC LIMIT 20
      `,
      sql`
        SELECT external_sync_state AS state, count(*)::int AS count
        FROM appointments
        WHERE tenant_id = ${user.tenantId}
          AND starts_at > now() - interval '7 days'
        GROUP BY external_sync_state
      `,
    ]);
  return {
    user,
    scenarios,
    campaigns,
    templates,
    integrations,
    outbox,
    articles,
    deliveryStats: deliveryStats as Array<{ status: string; count: number }>,
    deliveryAttempts,
    misSyncStats: misSyncStats as Array<{ state: string; count: number }>,
  };
}

export async function getAdministrationHub() {
  const user = await requireUser();
  const sql = db();
  const [audit, subscription, usage, flags, integrationHealth] =
    await Promise.all([
      sql`
        SELECT a.id, a.action, a.resource_type, a.resource_id, a.created_at,
          u.full_name AS actor_name
        FROM audit_events a
        LEFT JOIN users u ON u.id = a.actor_user_id AND u.tenant_id = a.tenant_id
        WHERE a.tenant_id = ${user.tenantId}
        ORDER BY a.created_at DESC LIMIT 50
      `,
      sql`
        SELECT id, plan, status, current_period_end, created_at
        FROM subscriptions WHERE tenant_id = ${user.tenantId} LIMIT 1
      `,
      sql`
        SELECT period_start, metric, value
        FROM usage_counters
        WHERE tenant_id = ${user.tenantId}
        ORDER BY period_start DESC, metric LIMIT 50
      `,
      sql`
        SELECT key, enabled, config, updated_at
        FROM feature_flags
        WHERE tenant_id = ${user.tenantId}
        ORDER BY key
      `,
      sql`
        SELECT provider, mode, status, last_checked_at,
          (SELECT count(*)::int FROM integration_requests r
            WHERE r.integration_id = i.id AND r.status = 'error'
              AND r.created_at > now() - interval '24 hours') AS errors_24h
        FROM integrations i
        WHERE tenant_id = ${user.tenantId}
        ORDER BY provider
      `,
    ]);
  return {
    user,
    audit,
    subscription: subscription[0] || null,
    usage,
    flags,
    integrationHealth,
  };
}
