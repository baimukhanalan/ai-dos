import "server-only";

import { requireRoles } from "@/lib/dal/auth";
import { db } from "@/lib/db";
import type { ReportFilters } from "@/lib/analytics/reporting";

export type ReportOption = { id: string; name: string };
export type ReportDaily = {
  day: string;
  label: string;
  calls: number;
  answered: number;
  appointments: number;
  completed: number;
  noShows: number;
};

export type AdvancedReport = {
  clinic: { name: string; timezone: string };
  options: {
    branches: ReportOption[];
    doctors: Array<ReportOption & { specialtyId: string | null }>;
    specialties: ReportOption[];
    scenarios: ReportOption[];
  };
  metrics: {
    totalCalls: number;
    answeredCalls: number;
    missedCalls: number;
    appointments: number;
    completed: number;
    noShows: number;
    avgCallSeconds: number;
    conversionRate: number | null;
  };
  operations: {
    escalations: number;
    callbackTotal: number;
    callbackDone: number;
    waitlistOffers: number;
    waitlistAccepted: number;
    campaignContacts: number;
    campaignDelivered: number;
    integrationErrors: number;
  };
  daily: ReportDaily[];
  demand: Array<{ doctor: string; specialty: string; branch: string; appointments: number; completed: number }>;
  channels: Array<{ key: string; count: number }>;
  languages: Array<{ key: string; count: number }>;
};

const number = (value: unknown) => Number(value || 0);

export async function getAdvancedReport(filters: ReportFilters): Promise<AdvancedReport> {
  const user = await requireRoles(["clinic_admin", "operator"]);
  const sql = db();
  const branchId = filters.branchId || null;
  const doctorId = filters.doctorId || null;
  const specialtyId = filters.specialtyId || null;
  const language = filters.language || null;
  const channel = filters.channel || null;
  const result = filters.result || null;
  const scenarioId = filters.scenarioId || null;

  const [contextRows, branchRows, doctorRows, specialtyRows, scenarioRows, callRows, appointmentRows, dailyRows, demandRows, channelRows, languageRows, operationRows] = await Promise.all([
    sql`SELECT COALESCE(c.name, t.name) AS name, t.timezone FROM tenants t LEFT JOIN clinics c ON c.tenant_id = t.id WHERE t.id = ${user.tenantId} ORDER BY c.created_at LIMIT 1`,
    sql`SELECT id, name FROM branches WHERE tenant_id = ${user.tenantId} AND active = true ORDER BY name`,
    sql`SELECT id, display_name AS name, specialty_id FROM doctors WHERE tenant_id = ${user.tenantId} AND active = true ORDER BY display_name`,
    sql`SELECT id, name FROM specialties WHERE tenant_id = ${user.tenantId} ORDER BY name`,
    sql`SELECT id, name FROM scenarios WHERE tenant_id = ${user.tenantId} AND status <> 'archived' ORDER BY name`,
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId})
      SELECT count(DISTINCT ca.id)::int AS total,
        count(DISTINCT ca.id) FILTER (WHERE ca.answered_at IS NOT NULL)::int AS answered,
        count(DISTINCT ca.id) FILTER (WHERE ca.status IN ('missed','rejected','failed'))::int AS missed,
        COALESCE(avg(ca.duration_seconds) FILTER (WHERE ca.duration_seconds IS NOT NULL), 0)::int AS avg_seconds
      FROM context, calls ca
      LEFT JOIN phone_numbers pn ON pn.id = ca.phone_number_id AND pn.tenant_id = ca.tenant_id
      LEFT JOIN booking_sessions bs ON bs.conversation_id = ca.conversation_id AND bs.tenant_id = ca.tenant_id
      LEFT JOIN doctors d ON d.id = bs.doctor_id AND d.tenant_id = bs.tenant_id
      WHERE ca.tenant_id = ${user.tenantId}
        AND (ca.started_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date
        AND (${branchId}::uuid IS NULL OR COALESCE(d.branch_id, pn.branch_id) = ${branchId}::uuid)
        AND (${doctorId}::uuid IS NULL OR d.id = ${doctorId}::uuid)
        AND (${specialtyId}::uuid IS NULL OR d.specialty_id = ${specialtyId}::uuid)
        AND (${language}::text IS NULL OR COALESCE(ca.language, bs.language) = ${language}::text)
        AND (${channel}::text IS NULL OR COALESCE(bs.channel, 'phone') = ${channel}::text)
        AND (${result}::text IS NULL OR COALESCE(bs.outcome, ca.outcome, ca.status) = ${result}::text)
        AND (${scenarioId}::uuid IS NULL OR EXISTS (SELECT 1 FROM scenario_executions se WHERE se.tenant_id = ca.tenant_id AND se.conversation_id = ca.conversation_id AND se.scenario_id = ${scenarioId}::uuid))
    `,
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId})
      SELECT count(DISTINCT a.id)::int AS total,
        count(DISTINCT a.id) FILTER (WHERE a.status = 'completed')::int AS completed,
        count(DISTINCT a.id) FILTER (WHERE a.status = 'no_show')::int AS no_show
      FROM context, appointments a
      JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
      LEFT JOIN booking_sessions bs ON bs.appointment_id = a.id AND bs.tenant_id = a.tenant_id
      WHERE a.tenant_id = ${user.tenantId}
        AND (a.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date
        AND (${branchId}::uuid IS NULL OR COALESCE(a.branch_id, d.branch_id) = ${branchId}::uuid)
        AND (${doctorId}::uuid IS NULL OR a.doctor_id = ${doctorId}::uuid)
        AND (${specialtyId}::uuid IS NULL OR d.specialty_id = ${specialtyId}::uuid)
        AND (${language}::text IS NULL OR bs.language = ${language}::text)
        AND (${channel}::text IS NULL OR COALESCE(bs.channel, a.source) = ${channel}::text)
        AND (${result}::text IS NULL OR COALESCE(bs.outcome, a.status) = ${result}::text)
        AND (${scenarioId}::uuid IS NULL OR EXISTS (SELECT 1 FROM scenario_executions se WHERE se.tenant_id = a.tenant_id AND se.conversation_id = bs.conversation_id AND se.scenario_id = ${scenarioId}::uuid))
    `,
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId}), days AS (
        SELECT generate_series(${filters.from}::date, ${filters.to}::date, interval '1 day')::date AS day
      ), call_daily AS (
        SELECT (ca.started_at AT TIME ZONE context.timezone)::date AS day, count(DISTINCT ca.id)::int AS calls,
          count(DISTINCT ca.id) FILTER (WHERE ca.answered_at IS NOT NULL)::int AS answered
        FROM context, calls ca
        LEFT JOIN phone_numbers pn ON pn.id = ca.phone_number_id AND pn.tenant_id = ca.tenant_id
        LEFT JOIN booking_sessions bs ON bs.conversation_id = ca.conversation_id AND bs.tenant_id = ca.tenant_id
        LEFT JOIN doctors d ON d.id = bs.doctor_id AND d.tenant_id = bs.tenant_id
        WHERE ca.tenant_id = ${user.tenantId} AND (ca.started_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date
          AND (${branchId}::uuid IS NULL OR COALESCE(d.branch_id, pn.branch_id) = ${branchId}::uuid)
          AND (${doctorId}::uuid IS NULL OR d.id = ${doctorId}::uuid) AND (${specialtyId}::uuid IS NULL OR d.specialty_id = ${specialtyId}::uuid)
          AND (${language}::text IS NULL OR COALESCE(ca.language, bs.language) = ${language}::text) AND (${channel}::text IS NULL OR COALESCE(bs.channel, 'phone') = ${channel}::text)
          AND (${result}::text IS NULL OR COALESCE(bs.outcome, ca.outcome, ca.status) = ${result}::text)
          AND (${scenarioId}::uuid IS NULL OR EXISTS (SELECT 1 FROM scenario_executions se WHERE se.tenant_id = ca.tenant_id AND se.conversation_id = ca.conversation_id AND se.scenario_id = ${scenarioId}::uuid))
        GROUP BY 1
      ), appointment_daily AS (
        SELECT (a.created_at AT TIME ZONE context.timezone)::date AS day, count(DISTINCT a.id)::int AS appointments,
          count(DISTINCT a.id) FILTER (WHERE a.status = 'completed')::int AS completed,
          count(DISTINCT a.id) FILTER (WHERE a.status = 'no_show')::int AS no_show
        FROM context, appointments a JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
        LEFT JOIN booking_sessions bs ON bs.appointment_id = a.id AND bs.tenant_id = a.tenant_id
        WHERE a.tenant_id = ${user.tenantId} AND (a.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date
          AND (${branchId}::uuid IS NULL OR COALESCE(a.branch_id, d.branch_id) = ${branchId}::uuid)
          AND (${doctorId}::uuid IS NULL OR a.doctor_id = ${doctorId}::uuid) AND (${specialtyId}::uuid IS NULL OR d.specialty_id = ${specialtyId}::uuid)
          AND (${language}::text IS NULL OR bs.language = ${language}::text) AND (${channel}::text IS NULL OR COALESCE(bs.channel, a.source) = ${channel}::text)
          AND (${result}::text IS NULL OR COALESCE(bs.outcome, a.status) = ${result}::text)
          AND (${scenarioId}::uuid IS NULL OR EXISTS (SELECT 1 FROM scenario_executions se WHERE se.tenant_id = a.tenant_id AND se.conversation_id = bs.conversation_id AND se.scenario_id = ${scenarioId}::uuid))
        GROUP BY 1
      )
      SELECT days.day::text, to_char(days.day, 'DD.MM') AS label, COALESCE(cd.calls,0)::int AS calls,
        COALESCE(cd.answered,0)::int AS answered, COALESCE(ad.appointments,0)::int AS appointments,
        COALESCE(ad.completed,0)::int AS completed, COALESCE(ad.no_show,0)::int AS no_show
      FROM days LEFT JOIN call_daily cd USING(day) LEFT JOIN appointment_daily ad USING(day) ORDER BY days.day
    `,
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId})
      SELECT d.display_name AS doctor, COALESCE(s.name, 'Без специальности') AS specialty,
        COALESCE(br.name, 'Без филиала') AS branch, count(DISTINCT a.id)::int AS appointments,
        count(DISTINCT a.id) FILTER (WHERE a.status = 'completed')::int AS completed
      FROM context, appointments a JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
      LEFT JOIN specialties s ON s.id = d.specialty_id AND s.tenant_id = d.tenant_id
      LEFT JOIN branches br ON br.id = COALESCE(a.branch_id, d.branch_id) AND br.tenant_id = d.tenant_id
      LEFT JOIN booking_sessions bs ON bs.appointment_id = a.id AND bs.tenant_id = a.tenant_id
      WHERE a.tenant_id = ${user.tenantId} AND (a.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date
        AND (${branchId}::uuid IS NULL OR COALESCE(a.branch_id, d.branch_id) = ${branchId}::uuid)
        AND (${doctorId}::uuid IS NULL OR a.doctor_id = ${doctorId}::uuid) AND (${specialtyId}::uuid IS NULL OR d.specialty_id = ${specialtyId}::uuid)
        AND (${language}::text IS NULL OR bs.language = ${language}::text) AND (${channel}::text IS NULL OR COALESCE(bs.channel, a.source) = ${channel}::text)
        AND (${result}::text IS NULL OR COALESCE(bs.outcome, a.status) = ${result}::text)
        AND (${scenarioId}::uuid IS NULL OR EXISTS (SELECT 1 FROM scenario_executions se WHERE se.tenant_id = a.tenant_id AND se.conversation_id = bs.conversation_id AND se.scenario_id = ${scenarioId}::uuid))
      GROUP BY d.display_name, s.name, br.name ORDER BY appointments DESC, doctor LIMIT 20
    `,
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId})
      SELECT c.channel AS key, count(*)::int AS count FROM conversations c, context
      WHERE c.tenant_id = ${user.tenantId} AND (c.started_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date
        AND (${language}::text IS NULL OR c.language = ${language}::text) AND (${channel}::text IS NULL OR c.channel = ${channel}::text)
        AND (${scenarioId}::uuid IS NULL OR EXISTS (SELECT 1 FROM scenario_executions se WHERE se.tenant_id = c.tenant_id AND se.conversation_id = c.id AND se.scenario_id = ${scenarioId}::uuid))
      GROUP BY c.channel ORDER BY count DESC
    `,
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId})
      SELECT c.language AS key, count(*)::int AS count FROM conversations c, context
      WHERE c.tenant_id = ${user.tenantId} AND (c.started_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date
        AND (${language}::text IS NULL OR c.language = ${language}::text) AND (${channel}::text IS NULL OR c.channel = ${channel}::text)
        AND (${scenarioId}::uuid IS NULL OR EXISTS (SELECT 1 FROM scenario_executions se WHERE se.tenant_id = c.tenant_id AND se.conversation_id = c.id AND se.scenario_id = ${scenarioId}::uuid))
      GROUP BY c.language ORDER BY count DESC
    `,
    sql`
      WITH context AS (SELECT timezone FROM tenants WHERE id = ${user.tenantId})
      SELECT
        (SELECT count(*)::int FROM escalations e, context WHERE e.tenant_id = ${user.tenantId} AND (e.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date) AS escalations,
        (SELECT count(*)::int FROM callback_requests c, context WHERE c.tenant_id = ${user.tenantId} AND (c.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date) AS callback_total,
        (SELECT count(*)::int FROM callback_requests c, context WHERE c.tenant_id = ${user.tenantId} AND c.status = 'done' AND (c.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date) AS callback_done,
        (SELECT count(*)::int FROM waitlist_offers w, context WHERE w.tenant_id = ${user.tenantId} AND (w.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date) AS waitlist_offers,
        (SELECT count(*)::int FROM waitlist_offers w, context WHERE w.tenant_id = ${user.tenantId} AND w.status = 'accepted' AND (w.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date) AS waitlist_accepted,
        (SELECT count(*)::int FROM campaign_contacts c, context WHERE c.tenant_id = ${user.tenantId} AND (c.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date) AS campaign_contacts,
        (SELECT count(*)::int FROM campaign_contacts c, context WHERE c.tenant_id = ${user.tenantId} AND c.status = 'delivered' AND (c.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date) AS campaign_delivered,
        (SELECT count(*)::int FROM integration_requests i, context WHERE i.tenant_id = ${user.tenantId} AND i.status = 'failed' AND (i.created_at AT TIME ZONE context.timezone)::date BETWEEN ${filters.from}::date AND ${filters.to}::date) AS integration_errors
    `,
  ]);

  const calls = callRows[0] || {};
  const appointments = appointmentRows[0] || {};
  const operations = operationRows[0] || {};
  const totalCalls = number(calls.total);
  const appointmentTotal = number(appointments.total);

  return {
    clinic: { name: String(contextRows[0]?.name || "Клиника"), timezone: String(contextRows[0]?.timezone || "Asia/Almaty") },
    options: {
      branches: branchRows as ReportOption[],
      doctors: (doctorRows as Array<{ id: string; name: string; specialty_id: string | null }>).map((row) => ({ id: row.id, name: row.name, specialtyId: row.specialty_id })),
      specialties: specialtyRows as ReportOption[], scenarios: scenarioRows as ReportOption[],
    },
    metrics: {
      totalCalls, answeredCalls: number(calls.answered), missedCalls: number(calls.missed),
      appointments: appointmentTotal, completed: number(appointments.completed), noShows: number(appointments.no_show),
      avgCallSeconds: number(calls.avg_seconds), conversionRate: totalCalls ? Math.min(1, appointmentTotal / totalCalls) : null,
    },
    operations: {
      escalations: number(operations.escalations), callbackTotal: number(operations.callback_total), callbackDone: number(operations.callback_done),
      waitlistOffers: number(operations.waitlist_offers), waitlistAccepted: number(operations.waitlist_accepted),
      campaignContacts: number(operations.campaign_contacts), campaignDelivered: number(operations.campaign_delivered), integrationErrors: number(operations.integration_errors),
    },
    daily: (dailyRows as Array<Record<string, unknown>>).map((row) => ({ day: String(row.day), label: String(row.label), calls: number(row.calls), answered: number(row.answered), appointments: number(row.appointments), completed: number(row.completed), noShows: number(row.no_show) })),
    demand: (demandRows as Array<Record<string, unknown>>).map((row) => ({ doctor: String(row.doctor), specialty: String(row.specialty), branch: String(row.branch), appointments: number(row.appointments), completed: number(row.completed) })),
    channels: (channelRows as Array<Record<string, unknown>>).map((row) => ({ key: String(row.key), count: number(row.count) })),
    languages: (languageRows as Array<Record<string, unknown>>).map((row) => ({ key: String(row.key), count: number(row.count) })),
  };
}

