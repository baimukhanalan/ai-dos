import "server-only";

import {
  notificationChannels,
  type NotificationChannel,
} from "@/lib/notifications/templates";

export { notificationChannels };
export type { NotificationChannel };

export type ProviderOutcome =
  | { status: "sent"; provider: string; reference: string | null }
  | { status: "blocked"; provider: string; errorCode: string; message: string }
  | {
      status: "failed";
      provider: string;
      errorCode: string;
      message: string;
      retryable: boolean;
    };

export type DeliveryRequest = {
  notificationId: string;
  tenantId: string;
  templateCode: string;
  locale: string;
  recipient: string | null;
  subject: string | null;
  text: string;
};

export type ProviderReadiness = {
  channel: NotificationChannel;
  provider: string;
  configured: boolean;
  requirements: string[];
};

const gatewayEnv: Record<
  Exclude<NotificationChannel, "portal" | "telegram">,
  { url: string; token: string }
> = {
  sms: { url: "NOTIFY_SMS_WEBHOOK_URL", token: "NOTIFY_SMS_TOKEN" },
  whatsapp: {
    url: "NOTIFY_WHATSAPP_WEBHOOK_URL",
    token: "NOTIFY_WHATSAPP_TOKEN",
  },
  email: { url: "NOTIFY_EMAIL_WEBHOOK_URL", token: "NOTIFY_EMAIL_TOKEN" },
};

const requestTimeoutMs = 8000;

export function isNotificationChannel(value: string): value is NotificationChannel {
  return (notificationChannels as readonly string[]).includes(value);
}

/** E.164 — единственный формат, который принимают SMS/WhatsApp шлюзы. */
export function isE164(value: string | null | undefined) {
  return Boolean(value && /^\+[1-9]\d{7,14}$/.test(value));
}

export function isEmailAddress(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(value));
}

function gatewayConfigured(channel: keyof typeof gatewayEnv) {
  const config = gatewayEnv[channel];
  return Boolean(process.env[config.url] && process.env[config.token]);
}

export function providerName(channel: NotificationChannel) {
  if (channel === "portal") return "portal";
  if (channel === "telegram") return "telegram_bot_api";
  return `${channel}_gateway`;
}

export function isChannelConfigured(channel: NotificationChannel) {
  if (channel === "portal") return true;
  if (channel === "telegram") return Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return gatewayConfigured(channel);
}

export function channelReadiness(): ProviderReadiness[] {
  return notificationChannels.map((channel) => ({
    channel,
    provider: providerName(channel),
    configured: isChannelConfigured(channel),
    requirements:
      channel === "portal"
        ? []
        : channel === "telegram"
          ? ["TELEGRAM_BOT_TOKEN"]
          : [gatewayEnv[channel].url, gatewayEnv[channel].token],
  }));
}

function blocked(
  channel: NotificationChannel,
  errorCode: string,
  message: string,
): ProviderOutcome {
  return { status: "blocked", provider: providerName(channel), errorCode, message };
}

function failure(
  channel: NotificationChannel,
  errorCode: string,
  message: string,
  retryable: boolean,
): ProviderOutcome {
  return {
    status: "failed",
    provider: providerName(channel),
    errorCode,
    message,
    retryable,
  };
}

async function postJson(url: string, token: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(requestTimeoutMs),
    cache: "no-store",
  });
}

/**
 * Ответ 4xx (кроме 429) означает, что запрос не станет валидным при повторе:
 * неверный адресат, отклонённый шаблон, отозванный токен.
 */
function classifyHttp(status: number) {
  return status === 429 || status >= 500;
}

async function sendViaGateway(
  channel: keyof typeof gatewayEnv,
  request: DeliveryRequest,
): Promise<ProviderOutcome> {
  const config = gatewayEnv[channel];
  const url = process.env[config.url];
  const token = process.env[config.token];
  if (!url || !token) {
    return blocked(
      channel,
      "provider_not_configured",
      `Канал ${channel} ждёт учётные данные провайдера.`,
    );
  }
  if (!URL.canParse(url) || !new URL(url).protocol.startsWith("http")) {
    return blocked(channel, "provider_url_invalid", `Проверьте ${config.url}.`);
  }
  if (channel === "email" ? !isEmailAddress(request.recipient) : !isE164(request.recipient)) {
    return failure(
      channel,
      "recipient_invalid",
      "У пациента нет корректного адреса для этого канала.",
      false,
    );
  }

  try {
    const response = await postJson(url, token, {
      channel,
      to: request.recipient,
      subject: request.subject,
      text: request.text,
      locale: request.locale,
      templateCode: request.templateCode,
      notificationId: request.notificationId,
      tenantId: request.tenantId,
    });
    if (!response.ok) {
      return failure(
        channel,
        `gateway_http_${response.status}`,
        `Шлюз ответил ${response.status}.`,
        classifyHttp(response.status),
      );
    }
    const payload = (await response
      .json()
      .catch(() => ({}))) as { id?: unknown; reference?: unknown };
    const reference = payload.id ?? payload.reference;
    return {
      status: "sent",
      provider: providerName(channel),
      reference: reference ? String(reference).slice(0, 200) : null,
    };
  } catch (error) {
    return failure(
      channel,
      error instanceof Error && error.name === "TimeoutError"
        ? "gateway_timeout"
        : "gateway_unreachable",
      "Шлюз недоступен.",
      true,
    );
  }
}

async function sendViaTelegram(request: DeliveryRequest): Promise<ProviderOutcome> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return blocked(
      "telegram",
      "provider_not_configured",
      "Канал telegram ждёт TELEGRAM_BOT_TOKEN.",
    );
  }
  if (!request.recipient || !/^-?\d{5,20}$/.test(request.recipient)) {
    return failure(
      "telegram",
      "recipient_invalid",
      "Для Telegram нужен chat id, полученный после старта диалога пациентом.",
      false,
    );
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: request.recipient,
          text: request.subject
            ? `${request.subject}\n\n${request.text}`
            : request.text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(requestTimeoutMs),
        cache: "no-store",
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };
    if (!response.ok || !payload.ok) {
      return failure(
        "telegram",
        `telegram_http_${response.status}`,
        payload.description || `Telegram ответил ${response.status}.`,
        classifyHttp(response.status),
      );
    }
    return {
      status: "sent",
      provider: providerName("telegram"),
      reference: payload.result?.message_id
        ? String(payload.result.message_id)
        : null,
    };
  } catch (error) {
    return failure(
      "telegram",
      error instanceof Error && error.name === "TimeoutError"
        ? "telegram_timeout"
        : "telegram_unreachable",
      "Telegram API недоступен.",
      true,
    );
  }
}

/**
 * Канал `portal` доставляется внутрь AI Dos: сама строка `notifications`
 * и есть входящее сообщение для сотрудника, внешний провайдер не нужен.
 */
export async function deliver(
  channel: NotificationChannel,
  request: DeliveryRequest,
): Promise<ProviderOutcome> {
  if (channel === "portal") {
    return { status: "sent", provider: providerName("portal"), reference: null };
  }
  if (channel === "telegram") return sendViaTelegram(request);
  return sendViaGateway(channel, request);
}
