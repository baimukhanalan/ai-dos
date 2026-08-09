import "server-only";

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { db } from "@/lib/db";
import { getTenantBranding, type Branding } from "@/lib/branding";
import { usageIncrement } from "@/lib/billing/usage";
import {
  channelReadiness,
  deliver,
  isNotificationChannel,
  notificationChannels,
  providerName,
} from "@/lib/notifications/providers";
import {
  channelPriority,
  maxDeliveryAttempts,
  recipientForChannel,
  retryDelayMs,
} from "@/lib/notifications/routing";
import {
  formatMoment,
  getDefaultTemplate,
  renderTemplate,
  resolveLocale,
  type NotificationChannel,
  type NotificationLocale,
} from "@/lib/notifications/templates";

type Sql = NeonQueryFunction<false, false>;

const minRenderedLength = 12;

export type EnqueueInput = {
  tenantId: string;
  patientId: string | null;
  appointmentId: string | null;
  channel: NotificationChannel;
  recipient: string | null;
  templateCode: string;
  locale: NotificationLocale;
  payload: Record<string, unknown>;
  dedupeKey: string;
  scheduledAt?: string;
};

/**
 * `dedupe_key` делает постановку в очередь идемпотентной: повторная обработка
 * того же outbox-события не создаст второе сообщение пациенту.
 */
export function enqueueNotificationStatement(sql: Sql, input: EnqueueInput) {
  return sql`
    INSERT INTO notifications (
      tenant_id, patient_id, appointment_id, channel, template_code, payload,
      locale, recipient, dedupe_key, status, scheduled_at, next_attempt_at
    ) VALUES (
      ${input.tenantId}, ${input.patientId}, ${input.appointmentId}, ${input.channel},
      ${input.templateCode}, ${JSON.stringify(input.payload)}::jsonb, ${input.locale},
      ${input.recipient}, ${input.dedupeKey}, 'queued',
      COALESCE(${input.scheduledAt || null}::timestamptz, now()), now()
    )
    ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  `;
}

type ClaimedNotification = {
  id: string;
  tenant_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  channel: string;
  template_code: string;
  payload: Record<string, unknown>;
  locale: string;
  recipient: string | null;
  attempts: number;
};

type NotificationContext = {
  clinic_name: string;
  timezone: string;
  patient_name: string | null;
  patient_language: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  doctor_name: string | null;
  service_name: string | null;
  starts_at: string | null;
};

async function loadContext(
  sql: Sql,
  notification: ClaimedNotification,
): Promise<NotificationContext | null> {
  const rows = (await sql`
    SELECT t.name AS clinic_name, t.timezone,
      p.full_name AS patient_name, p.preferred_language AS patient_language,
      p.phone AS patient_phone, p.email AS patient_email,
      d.display_name AS doctor_name, s.name AS service_name,
      a.starts_at
    FROM tenants t
    LEFT JOIN patients p ON p.id = ${notification.patient_id}::uuid AND p.tenant_id = t.id
    LEFT JOIN appointments a ON a.id = ${notification.appointment_id}::uuid AND a.tenant_id = t.id
    LEFT JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = t.id
    LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = t.id
    WHERE t.id = ${notification.tenant_id}
    LIMIT 1
  `) as NotificationContext[];
  return rows[0] ?? null;
}

async function loadTenantTemplate(
  sql: Sql,
  tenantId: string,
  code: string,
  locale: NotificationLocale,
  channel: string,
) {
  const rows = (await sql`
    SELECT subject, body
    FROM notification_templates
    WHERE tenant_id = ${tenantId} AND code = ${code} AND locale = ${locale}
      AND channel = ${channel} AND status = 'published'
    ORDER BY version DESC
    LIMIT 1
  `) as Array<{ subject: string | null; body: string }>;
  return rows[0] || null;
}

export function buildVariables(
  context: NotificationContext,
  branding: Branding,
  payload: Record<string, unknown>,
  locale: NotificationLocale,
) {
  const timezone = context.timezone || "Asia/Almaty";
  const startsAtSource =
    (typeof payload.startsAt === "string" ? payload.startsAt : null) ||
    context.starts_at;
  const expiresAtSource =
    typeof payload.expiresAt === "string" ? payload.expiresAt : null;
  return {
    clinic: branding.displayName || context.clinic_name,
    patientName:
      context.patient_name ||
      (typeof payload.patientName === "string" ? payload.patientName : null),
    doctorName:
      context.doctor_name ||
      (typeof payload.doctorName === "string" ? payload.doctorName : null),
    serviceName: context.service_name,
    startsAt: startsAtSource ? formatMoment(startsAtSource, timezone, locale) : null,
    expiresAt: expiresAtSource ? formatMoment(expiresAtSource, timezone, locale) : null,
    supportPhone: branding.supportPhone,
    supportEmail: branding.supportEmail,
  };
}

async function finalizeSuccess(
  sql: Sql,
  notification: ClaimedNotification,
  provider: string,
  reference: string | null,
  durationMs: number,
) {
  await sql.transaction([
    sql`
      UPDATE notifications
      SET status = 'sent', sent_at = now(), provider = ${provider}, last_error = null
      WHERE id = ${notification.id}
    `,
    sql`
      INSERT INTO delivery_attempts (
        tenant_id, notification_id, provider, attempt, status, provider_reference, duration_ms
      ) VALUES (
        ${notification.tenant_id}, ${notification.id}, ${provider},
        ${notification.attempts}, 'sent', ${reference}, ${durationMs}
      )
      ON CONFLICT (notification_id, attempt) DO NOTHING
    `,
    usageIncrement(sql, notification.tenant_id, "notifications_sent"),
  ]);
}

async function finalizeProblem(
  sql: Sql,
  notification: ClaimedNotification,
  outcome: {
    status: "blocked" | "failed";
    provider: string;
    errorCode: string;
    message: string;
    retryable?: boolean;
  },
  durationMs: number,
) {
  const retry =
    outcome.status === "failed" &&
    outcome.retryable !== false &&
    notification.attempts < maxDeliveryAttempts;
  const nextStatus = retry ? "queued" : outcome.status;
  const delay = retry
    ? `${Math.round(retryDelayMs(notification.attempts) / 1000)} seconds`
    : "0 seconds";

  await sql.transaction([
    sql`
      UPDATE notifications
      SET status = ${nextStatus},
        provider = ${outcome.provider},
        last_error = ${`${outcome.errorCode}: ${outcome.message}`.slice(0, 500)},
        next_attempt_at = now() + ${delay}::interval
      WHERE id = ${notification.id}
    `,
    sql`
      INSERT INTO delivery_attempts (
        tenant_id, notification_id, provider, attempt, status, error_code, duration_ms
      ) VALUES (
        ${notification.tenant_id}, ${notification.id}, ${outcome.provider},
        ${notification.attempts}, ${outcome.status}, ${outcome.errorCode}, ${durationMs}
      )
      ON CONFLICT (notification_id, attempt) DO NOTHING
    `,
  ]);
  return nextStatus;
}

export type DispatchSummary = {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
  blocked: number;
};

/**
 * Захват — это аренда на 10 минут. Если процесс упал между `sending` и
 * финальным статусом, следующий запуск вернёт уведомление в очередь, а не
 * оставит его висеть навсегда.
 */
const claimLease = "10 minutes";

export async function dispatchDueNotifications(limit = 25): Promise<DispatchSummary> {
  const sql = db();
  await sql`
    UPDATE notifications
    SET status = 'queued',
      last_error = COALESCE(last_error, 'dispatcher_interrupted: попытка не завершилась')
    WHERE status = 'sending' AND next_attempt_at <= now()
  `;

  const claimed = (await sql`
    UPDATE notifications
    SET status = 'sending', attempts = attempts + 1,
      next_attempt_at = now() + ${claimLease}::interval
    WHERE id IN (
      SELECT id FROM notifications
      WHERE status = 'queued'
        AND scheduled_at <= now()
        AND next_attempt_at <= now()
      ORDER BY scheduled_at
      LIMIT ${Math.min(Math.max(limit, 1), 100)}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tenant_id, patient_id, appointment_id, channel, template_code,
      payload, locale, recipient, attempts
  `) as ClaimedNotification[];

  const summary: DispatchSummary = {
    claimed: claimed.length,
    sent: 0,
    retrying: 0,
    failed: 0,
    blocked: 0,
  };

  const brandingCache = new Map<string, Branding>();

  for (const notification of claimed) {
    const startedAt = Date.now();
    const channel = isNotificationChannel(notification.channel)
      ? notification.channel
      : "portal";
    const locale = resolveLocale(notification.locale);

    try {
      const context = await loadContext(sql, notification);
      if (!context) {
        await finalizeProblem(
          sql,
          notification,
          {
            status: "failed",
            provider: providerName(channel),
            errorCode: "context_missing",
            message: "Клиника или пациент удалены.",
            retryable: false,
          },
          Date.now() - startedAt,
        );
        summary.failed += 1;
        continue;
      }

      let branding = brandingCache.get(notification.tenant_id);
      if (!branding) {
        branding = await getTenantBranding(sql, notification.tenant_id);
        brandingCache.set(notification.tenant_id, branding);
      }

      const template =
        (await loadTenantTemplate(
          sql,
          notification.tenant_id,
          notification.template_code,
          locale,
          channel,
        )) || getDefaultTemplate(notification.template_code, locale);

      if (!template) {
        await finalizeProblem(
          sql,
          notification,
          {
            status: "failed",
            provider: providerName(channel),
            errorCode: "template_missing",
            message: `Нет шаблона ${notification.template_code} (${locale}).`,
            retryable: false,
          },
          Date.now() - startedAt,
        );
        summary.failed += 1;
        continue;
      }

      const variables = buildVariables(context, branding, notification.payload || {}, locale);
      const rendered = renderTemplate(template.body, variables, {
        omitIncompleteSentences: true,
      });
      const subject = template.subject
        ? renderTemplate(template.subject, variables).text
        : null;

      if (rendered.text.length < minRenderedLength) {
        await finalizeProblem(
          sql,
          notification,
          {
            status: "failed",
            provider: providerName(channel),
            errorCode: "render_incomplete",
            message: `Не хватает данных: ${rendered.missing.join(", ") || "нет"}.`,
            retryable: false,
          },
          Date.now() - startedAt,
        );
        summary.failed += 1;
        continue;
      }

      const recipient =
        notification.recipient ||
        recipientForChannel(channel, {
          phone: context.patient_phone,
          email: context.patient_email,
        });

      const outcome = await deliver(channel, {
        notificationId: notification.id,
        tenantId: notification.tenant_id,
        templateCode: notification.template_code,
        locale,
        recipient,
        subject,
        text: rendered.text,
      });

      if (outcome.status === "sent") {
        await finalizeSuccess(
          sql,
          notification,
          outcome.provider,
          outcome.reference,
          Date.now() - startedAt,
        );
        summary.sent += 1;
        continue;
      }

      const nextStatus = await finalizeProblem(
        sql,
        notification,
        outcome,
        Date.now() - startedAt,
      );
      if (nextStatus === "queued") summary.retrying += 1;
      else if (nextStatus === "blocked") summary.blocked += 1;
      else summary.failed += 1;
    } catch (error) {
      console.error("notification dispatch failed", notification.id, error);
      const nextStatus = await finalizeProblem(
        sql,
        notification,
        {
          status: "failed",
          provider: providerName(channel),
          errorCode: "dispatcher_error",
          message: error instanceof Error ? error.message : "Неизвестная ошибка.",
          retryable: true,
        },
        Date.now() - startedAt,
      );
      if (nextStatus === "queued") summary.retrying += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}

export function deliveryReadiness() {
  return {
    channels: channelReadiness(),
    priority: channelPriority(),
    supported: notificationChannels,
  };
}
