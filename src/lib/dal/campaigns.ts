import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/dal/auth";
import { AppError } from "@/lib/errors";
import { isChannelConfigured } from "@/lib/notifications/providers";
import {
  campaignSafetyChecks,
  channelConsentPurpose,
  isWithinSendWindow,
  planCampaignMoments,
  type AudienceSummary,
  type CampaignChannel,
} from "@/lib/campaigns/policy";
import type {
  campaignDraftSchema,
  campaignPreviewSchema,
  campaignScheduleSchema,
} from "@/lib/validation/automation";
import type { z } from "zod";
import type { AuditRequestContext } from "@/lib/audit-context";

type Sql = NeonQueryFunction<false, false>;
type DraftInput = z.infer<typeof campaignDraftSchema>;
type PreviewInput = z.infer<typeof campaignPreviewSchema>;
type ScheduleInput = z.infer<typeof campaignScheduleSchema>;

type AudienceCandidate = { patient_id: string; recipient: string; patient_name: string };

function providerReady(channel: CampaignChannel) {
  if (channel === "voice") {
    return Boolean(process.env.TELEPHONY_PROVIDER && process.env.TELEPHONY_API_KEY);
  }
  return isChannelConfigured(channel);
}

async function audienceSummary(
  sql: Sql,
  tenantId: string,
  input: Pick<PreviewInput, "audienceFilter" | "channel" | "frequencyCapDays">,
) {
  const filter = input.audienceFilter;
  const channelPurpose = channelConsentPurpose(input.channel);
  const rows = (await sql`
    WITH audience AS (
      SELECT p.id,
        marketing.status AS marketing_status,
        channel_consent.status AS channel_status,
        EXISTS (
          SELECT 1 FROM campaign_contacts history
          WHERE history.tenant_id = p.tenant_id AND history.patient_id = p.id
            AND history.status IN ('sent', 'delivered')
            AND COALESCE(history.sent_at, history.created_at) > now() - make_interval(days => ${input.frequencyCapDays})
        ) AS frequency_capped,
        CASE
          WHEN ${input.channel} IN ('sms', 'whatsapp', 'voice') THEN COALESCE(p.phone, '') ~ '^\\+[1-9][0-9]{7,14}$'
          WHEN ${input.channel} = 'email' THEN COALESCE(p.email, '') ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[A-Za-z]{2,}$'
          ELSE false
        END AS has_recipient
      FROM patients p
      LEFT JOIN LATERAL (
        SELECT status FROM patient_consents c
        WHERE c.tenant_id = p.tenant_id AND c.patient_id = p.id
          AND c.purpose = 'marketing_campaign'
        ORDER BY c.recorded_at DESC LIMIT 1
      ) marketing ON true
      LEFT JOIN LATERAL (
        SELECT status FROM patient_consents c
        WHERE c.tenant_id = p.tenant_id AND c.patient_id = p.id
          AND c.purpose = ${channelPurpose}
        ORDER BY c.recorded_at DESC LIMIT 1
      ) channel_consent ON true
      LEFT JOIN LATERAL (
        SELECT max(a.starts_at) AS last_visit
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
        WHERE a.tenant_id = p.tenant_id AND a.patient_id = p.id
          AND a.starts_at < now() AND a.status <> 'cancelled'
          AND (${filter.specialtyId || null}::uuid IS NULL OR d.specialty_id = ${filter.specialtyId || null}::uuid)
          AND (${filter.branchId || null}::uuid IS NULL OR d.branch_id = ${filter.branchId || null}::uuid)
      ) visit ON true
      WHERE p.tenant_id = ${tenantId}
        AND (${filter.language || null}::text IS NULL OR p.preferred_language = ${filter.language || null})
        AND (${filter.specialtyId || null}::uuid IS NULL OR visit.last_visit IS NOT NULL)
        AND (${filter.branchId || null}::uuid IS NULL OR visit.last_visit IS NOT NULL)
        AND (${filter.lastVisitMonthsMin ?? null}::int IS NULL OR visit.last_visit <= now() - make_interval(months => ${filter.lastVisitMonthsMin ?? 0}))
        AND (${filter.lastVisitMonthsMax ?? null}::int IS NULL OR visit.last_visit >= now() - make_interval(months => ${filter.lastVisitMonthsMax ?? 0}))
    ), classified AS (
      SELECT *, CASE
        WHEN marketing_status = 'withdrawn' OR channel_status = 'withdrawn' THEN 'opted_out'
        WHEN marketing_status IS DISTINCT FROM 'granted' OR channel_status IS DISTINCT FROM 'granted' THEN 'no_consent'
        WHEN frequency_capped THEN 'frequency'
        WHEN NOT has_recipient THEN 'missing_channel'
        ELSE 'eligible'
      END AS outcome
      FROM audience
    )
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE outcome = 'no_consent')::int AS no_consent,
      count(*) FILTER (WHERE outcome = 'opted_out')::int AS opted_out,
      count(*) FILTER (WHERE outcome = 'frequency')::int AS frequency_capped,
      count(*) FILTER (WHERE outcome = 'missing_channel')::int AS missing_channel,
      count(*) FILTER (WHERE outcome = 'eligible')::int AS eligible
    FROM classified
  `) as Array<{
    total: number;
    no_consent: number;
    opted_out: number;
    frequency_capped: number;
    missing_channel: number;
    eligible: number;
  }>;
  const row = rows[0];
  return {
    total: row?.total || 0,
    noConsent: row?.no_consent || 0,
    optedOut: row?.opted_out || 0,
    frequencyCapped: row?.frequency_capped || 0,
    missingChannel: row?.missing_channel || 0,
    eligible: row?.eligible || 0,
  } satisfies AudienceSummary;
}

async function eligibleAudience(sql: Sql, tenantId: string, input: PreviewInput, limit: number) {
  const filter = input.audienceFilter;
  const channelPurpose = channelConsentPurpose(input.channel);
  return (await sql`
    SELECT p.id AS patient_id, p.full_name AS patient_name,
      CASE WHEN ${input.channel} = 'email' THEN p.email ELSE p.phone END AS recipient
    FROM patients p
    LEFT JOIN LATERAL (
      SELECT max(a.starts_at) AS last_visit
      FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
      WHERE a.tenant_id = p.tenant_id AND a.patient_id = p.id
        AND a.starts_at < now() AND a.status <> 'cancelled'
        AND (${filter.specialtyId || null}::uuid IS NULL OR d.specialty_id = ${filter.specialtyId || null}::uuid)
        AND (${filter.branchId || null}::uuid IS NULL OR d.branch_id = ${filter.branchId || null}::uuid)
    ) visit ON true
    WHERE p.tenant_id = ${tenantId}
      AND (${filter.language || null}::text IS NULL OR p.preferred_language = ${filter.language || null})
      AND (${filter.specialtyId || null}::uuid IS NULL OR visit.last_visit IS NOT NULL)
      AND (${filter.branchId || null}::uuid IS NULL OR visit.last_visit IS NOT NULL)
      AND (${filter.lastVisitMonthsMin ?? null}::int IS NULL OR visit.last_visit <= now() - make_interval(months => ${filter.lastVisitMonthsMin ?? 0}))
      AND (${filter.lastVisitMonthsMax ?? null}::int IS NULL OR visit.last_visit >= now() - make_interval(months => ${filter.lastVisitMonthsMax ?? 0}))
      AND (SELECT c.status FROM patient_consents c WHERE c.tenant_id = p.tenant_id AND c.patient_id = p.id AND c.purpose = 'marketing_campaign' ORDER BY c.recorded_at DESC LIMIT 1) = 'granted'
      AND (SELECT c.status FROM patient_consents c WHERE c.tenant_id = p.tenant_id AND c.patient_id = p.id AND c.purpose = ${channelPurpose} ORDER BY c.recorded_at DESC LIMIT 1) = 'granted'
      AND NOT EXISTS (
        SELECT 1 FROM campaign_contacts history
        WHERE history.tenant_id = p.tenant_id AND history.patient_id = p.id
          AND history.status IN ('sent', 'delivered')
          AND COALESCE(history.sent_at, history.created_at) > now() - make_interval(days => ${input.frequencyCapDays})
      )
      AND CASE
        WHEN ${input.channel} IN ('sms', 'whatsapp', 'voice') THEN COALESCE(p.phone, '') ~ '^\\+[1-9][0-9]{7,14}$'
        WHEN ${input.channel} = 'email' THEN COALESCE(p.email, '') ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[A-Za-z]{2,}$'
        ELSE false
      END
    ORDER BY p.id
    LIMIT ${limit}
  `) as AudienceCandidate[];
}

export async function getCampaignEditor(campaignId: string) {
  const user = await requirePermission("campaigns.read");
  const sql = db();
  const [rows, specialties, branches, scenarios] = await Promise.all([
    sql`
      SELECT id, name, purpose, campaign_type, channel, locale, status,
        audience_filter, subject, message_body, timezone, send_window_start,
        send_window_end, daily_limit, period_days, max_contacts,
        frequency_cap_days, scheduled_at, revision, results, created_at, updated_at
        , COALESCE((
          SELECT jsonb_build_object(
            'total', count(*), 'queued', count(*) FILTER (WHERE cc.status = 'queued'),
            'sent', count(*) FILTER (WHERE cc.status IN ('sent', 'delivered')),
            'failed', count(*) FILTER (WHERE cc.status = 'failed'),
            'blocked', count(*) FILTER (WHERE cc.status = 'blocked'),
            'cancelled', count(*) FILTER (WHERE cc.status = 'cancelled'),
            'optedOut', count(*) FILTER (WHERE cc.status = 'opted_out')
          ) FROM campaign_contacts cc WHERE cc.campaign_id = campaigns.id AND cc.tenant_id = campaigns.tenant_id
        ), '{}'::jsonb) AS live_results
      FROM campaigns WHERE id = ${campaignId} AND tenant_id = ${user.tenantId} LIMIT 1
    `,
    sql`SELECT id, name FROM specialties WHERE tenant_id = ${user.tenantId} ORDER BY name`,
    sql`SELECT id, name FROM branches WHERE tenant_id = ${user.tenantId} ORDER BY name`,
    sql`SELECT id, name, active_version FROM scenarios WHERE tenant_id = ${user.tenantId} AND status = 'published' ORDER BY name`,
  ]);
  const campaign = rows[0] as Record<string, unknown> | undefined;
  if (!campaign) return null;
  const input = {
    audienceFilter: (campaign.audience_filter || {}) as PreviewInput["audienceFilter"],
    channel: campaign.channel as CampaignChannel,
    frequencyCapDays: Number(campaign.frequency_cap_days),
  };
  const audience = await audienceSummary(sql, user.tenantId, input);
  return { user, campaign, specialties, branches, scenarios, audience, providerReady: providerReady(input.channel) };
}

export async function previewCampaign(input: PreviewInput) {
  const user = await requirePermission("campaigns.read");
  const sql = db();
  const audience = await audienceSummary(sql, user.tenantId, input);
  const ready = providerReady(input.channel);
  return {
    audience,
    providerReady: ready,
    checks: campaignSafetyChecks({
      audience,
      providerReady: ready,
      messageBody: input.messageBody,
      sendWindowStart: input.sendWindowStart,
      sendWindowEnd: input.sendWindowEnd,
    }),
  };
}

export async function saveCampaignDraft(campaignId: string, input: DraftInput, context?: AuditRequestContext) {
  const user = await requirePermission("campaigns.write");
  const sql = db();
  const updated = await sql`
    UPDATE campaigns SET name = ${input.name}, purpose = ${input.purpose},
      campaign_type = ${input.campaignType}, channel = ${input.channel}, locale = ${input.locale},
      audience_filter = ${JSON.stringify(input.audienceFilter)}::jsonb,
      subject = ${input.subject || null}, message_body = ${input.messageBody},
      timezone = ${input.timezone}, send_window_start = ${input.sendWindowStart}::time,
      send_window_end = ${input.sendWindowEnd}::time, daily_limit = ${input.dailyLimit},
      period_days = ${input.periodDays}, max_contacts = ${input.maxContacts},
      frequency_cap_days = ${input.frequencyCapDays}, revision = revision + 1,
      updated_by = ${user.id}, updated_at = now()
    WHERE id = ${campaignId} AND tenant_id = ${user.tenantId}
      AND status = 'draft' AND revision = ${input.expectedRevision}
    RETURNING revision
  `;
  if (!updated[0]) throw new AppError("campaign_conflict", 409, "Кампания уже изменена или запущена. Обновите страницу.");
  await sql`
    INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata, ip_hash)
    VALUES (${user.tenantId}, ${user.id}, 'campaign.draft_updated', 'campaign', ${campaignId},
      ${JSON.stringify({ revision: Number(updated[0].revision), requestId: context?.requestId, userAgent: context?.userAgent })}::jsonb,
      ${context?.ipHash || null})
  `;
  return { revision: Number(updated[0].revision) };
}

export async function scheduleCampaign(campaignId: string, input: ScheduleInput, context?: AuditRequestContext) {
  const user = await requirePermission("campaigns.publish");
  const sql = db();
  const rows = await sql`
    SELECT name, purpose, campaign_type, channel, locale, audience_filter, subject,
      message_body, timezone, send_window_start::text, send_window_end::text,
      daily_limit, period_days, max_contacts, frequency_cap_days, revision, status
    FROM campaigns WHERE id = ${campaignId} AND tenant_id = ${user.tenantId} LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new AppError("campaign_not_found", 404, "Кампания не найдена.");
  if (row.status !== "draft" || Number(row.revision) !== input.expectedRevision) {
    throw new AppError("campaign_conflict", 409, "Кампания уже изменена или запущена.");
  }
  const previewInput: PreviewInput = {
    name: String(row.name), purpose: String(row.purpose), campaignType: row.campaign_type as PreviewInput["campaignType"],
    channel: row.channel as PreviewInput["channel"], locale: row.locale as PreviewInput["locale"],
    audienceFilter: row.audience_filter as PreviewInput["audienceFilter"], subject: row.subject ? String(row.subject) : undefined,
    messageBody: String(row.message_body), timezone: String(row.timezone),
    sendWindowStart: String(row.send_window_start).slice(0, 5), sendWindowEnd: String(row.send_window_end).slice(0, 5),
    dailyLimit: Number(row.daily_limit), periodDays: Number(row.period_days), maxContacts: Number(row.max_contacts),
    frequencyCapDays: Number(row.frequency_cap_days),
  };
  if (!providerReady(previewInput.channel)) {
    throw new AppError("campaign_provider_missing", 409, "Канал не подключён. Добавьте официальные учётные данные провайдера.");
  }
  if (!previewInput.messageBody.includes("{{optOutUrl}}")) {
    throw new AppError("campaign_opt_out_missing", 422, "Добавьте {{optOutUrl}}, чтобы пациент мог отказаться от необязательных коммуникаций.");
  }
  if (previewInput.channel === "voice") {
    throw new AppError("campaign_voice_gateway_pending", 409, "Исходящий voice-шлюз ещё не подключён к исполнителю кампаний.");
  }
  if (!isWithinSendWindow(input.startsAt, previewInput.timezone, previewInput.sendWindowStart, previewInput.sendWindowEnd)) {
    throw new AppError("campaign_quiet_hours", 422, "Начало кампании должно попадать в разрешённое окно отправки.");
  }
  const capacity = Math.min(previewInput.maxContacts, previewInput.dailyLimit * previewInput.periodDays);
  const summary = await audienceSummary(sql, user.tenantId, previewInput);
  const candidates = await eligibleAudience(sql, user.tenantId, previewInput, capacity);
  if (!candidates.length) throw new AppError("campaign_empty_audience", 422, "После consent, opt-out и frequency-проверок нет доступных контактов.");
  const moments = planCampaignMoments({ startsAt: input.startsAt, count: candidates.length, dailyLimit: previewInput.dailyLimit, periodDays: previewInput.periodDays });
  const publicUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const batch = candidates.map((candidate, index) => {
    const token = randomBytes(32).toString("base64url");
    return {
      contact_id: randomUUID(), notification_id: randomUUID(), token_id: randomUUID(),
      token_hash: createHash("sha256").update(token).digest("hex"), patient_id: candidate.patient_id,
      recipient: candidate.recipient, scheduled_at: moments[index],
      payload: { campaignId, body: previewInput.messageBody, subject: previewInput.subject, optOutUrl: `${publicUrl}/opt-out?token=${token}` },
    };
  });
  const result = await sql`
    WITH activated AS (
      UPDATE campaigns SET status = 'scheduled', scheduled_at = ${input.startsAt}::timestamptz,
        revision = revision + 1, results = ${JSON.stringify({ audience: summary })}::jsonb,
        updated_by = ${user.id}, updated_at = now()
      WHERE id = ${campaignId} AND tenant_id = ${user.tenantId} AND status = 'draft' AND revision = ${input.expectedRevision}
      RETURNING id
    ), batch AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
        AS x(contact_id uuid, notification_id uuid, token_id uuid, token_hash text, patient_id uuid, recipient text, scheduled_at timestamptz, payload jsonb)
    ), inserted_notifications AS (
      INSERT INTO notifications (id, tenant_id, patient_id, channel, template_code, payload,
        locale, recipient, dedupe_key, status, scheduled_at, next_attempt_at)
      SELECT b.notification_id, ${user.tenantId}, b.patient_id, ${previewInput.channel}, 'campaign_message',
        b.payload,
        ${previewInput.locale}, b.recipient, 'campaign:' || ${campaignId}::text || ':' || b.patient_id::text,
        'queued', b.scheduled_at, b.scheduled_at
      FROM batch b WHERE EXISTS (SELECT 1 FROM activated)
      ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING id, patient_id, scheduled_at
    ), inserted_tokens AS (
      INSERT INTO campaign_opt_out_tokens (id, tenant_id, campaign_id, patient_id, token_hash)
      SELECT b.token_id, ${user.tenantId}, ${campaignId}, b.patient_id, b.token_hash
      FROM batch b JOIN inserted_notifications n ON n.id = b.notification_id
      ON CONFLICT (token_hash) DO NOTHING
      RETURNING id
    ), inserted_contacts AS (
      INSERT INTO campaign_contacts (id, tenant_id, campaign_id, patient_id, status, notification_id, scheduled_at)
      SELECT b.contact_id, ${user.tenantId}, ${campaignId}, b.patient_id, 'queued', n.id, n.scheduled_at
      FROM batch b JOIN inserted_notifications n ON n.id = b.notification_id
      ON CONFLICT (campaign_id, patient_id) DO NOTHING
      RETURNING id
    ), recorded_audit AS (
      INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata, ip_hash)
      SELECT ${user.tenantId}, ${user.id}, 'campaign.scheduled', 'campaign', ${campaignId},
        ${JSON.stringify({ startsAt: input.startsAt, audience: candidates.length, requestId: context?.requestId, userAgent: context?.userAgent })}::jsonb,
        ${context?.ipHash || null} FROM activated
      RETURNING id
    )
    INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload)
    SELECT ${user.tenantId}, 'campaign.started', 'campaign', ${campaignId},
      ${JSON.stringify({ campaignId, startsAt: input.startsAt, audience: candidates.length })}::jsonb
    FROM activated
    RETURNING id
  `;
  if (!result[0]) throw new AppError("campaign_conflict", 409, "Кампания уже запущена в другой вкладке.");
  return { scheduled: candidates.length, startsAt: input.startsAt };
}

export async function stopCampaign(campaignId: string, context?: AuditRequestContext) {
  const user = await requirePermission("campaigns.publish");
  const sql = db();
  const result = await sql`
    WITH stopped AS (
      UPDATE campaigns SET status = 'cancelled', stopped_at = now(), updated_by = ${user.id}, updated_at = now()
      WHERE id = ${campaignId} AND tenant_id = ${user.tenantId} AND status IN ('scheduled', 'running', 'paused')
      RETURNING id
    ), cancelled_notifications AS (
      UPDATE notifications n SET status = 'cancelled'
      FROM campaign_contacts cc
      WHERE cc.campaign_id = ${campaignId} AND cc.tenant_id = ${user.tenantId}
        AND cc.notification_id = n.id AND n.status IN ('queued', 'failed', 'blocked')
        AND EXISTS (SELECT 1 FROM stopped)
      RETURNING n.id
    ), cancelled_contacts AS (
      UPDATE campaign_contacts SET status = 'cancelled', updated_at = now()
      WHERE campaign_id = ${campaignId} AND tenant_id = ${user.tenantId} AND status = 'queued'
        AND EXISTS (SELECT 1 FROM stopped)
      RETURNING id
    )
    INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata, ip_hash)
    SELECT ${user.tenantId}, ${user.id}, 'campaign.stopped', 'campaign', ${campaignId},
      ${JSON.stringify({ requestId: context?.requestId, userAgent: context?.userAgent })}::jsonb, ${context?.ipHash || null}
    FROM stopped RETURNING id
  `;
  if (!result[0]) throw new AppError("campaign_not_stoppable", 409, "Остановить можно только запланированную или активную кампанию.");
  return { status: "cancelled" as const };
}

export async function syncCampaignResults() {
  const sql = db();
  await sql`
    UPDATE campaign_contacts cc SET
      status = CASE n.status WHEN 'sent' THEN 'sent' WHEN 'failed' THEN 'failed'
        WHEN 'blocked' THEN 'blocked' WHEN 'cancelled' THEN 'cancelled' ELSE cc.status END,
      sent_at = CASE WHEN n.status = 'sent' THEN n.sent_at ELSE cc.sent_at END,
      updated_at = now()
    FROM notifications n
    WHERE cc.notification_id = n.id AND cc.status = 'queued' AND n.status IN ('sent', 'failed', 'blocked', 'cancelled')
  `;
  await sql`
    UPDATE campaigns SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
    WHERE status = 'scheduled' AND scheduled_at <= now()
  `;
  const completed = await sql`
    WITH stats AS (
      SELECT c.id, jsonb_build_object(
        'total', count(cc.id), 'queued', count(*) FILTER (WHERE cc.status = 'queued'),
        'sent', count(*) FILTER (WHERE cc.status IN ('sent', 'delivered')),
        'failed', count(*) FILTER (WHERE cc.status = 'failed'),
        'blocked', count(*) FILTER (WHERE cc.status = 'blocked'),
        'cancelled', count(*) FILTER (WHERE cc.status = 'cancelled')
      ) AS result, count(*) FILTER (WHERE cc.status = 'queued') AS pending
      FROM campaigns c JOIN campaign_contacts cc ON cc.campaign_id = c.id AND cc.tenant_id = c.tenant_id
      WHERE c.status IN ('scheduled', 'running') GROUP BY c.id
    )
    UPDATE campaigns c SET results = c.results || stats.result,
      status = CASE WHEN stats.pending = 0 THEN 'completed' ELSE c.status END,
      updated_at = now()
    FROM stats WHERE c.id = stats.id
    RETURNING c.id, c.status
  `;
  return { synced: completed.length, completed: completed.filter((row) => row.status === "completed").length };
}
