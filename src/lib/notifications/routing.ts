import { exponentialBackoffMs } from "@/lib/retry";
import {
  isChannelConfigured,
  isE164,
  isEmailAddress,
  isNotificationChannel,
  type NotificationChannel,
} from "@/lib/notifications/providers";

export const maxDeliveryAttempts = 5;

/** Достаточно, чтобы пережить перезапуск шлюза. */
export function retryDelayMs(attempt: number) {
  return exponentialBackoffMs(attempt, maxDeliveryAttempts);
}

export type PatientContact = {
  phone?: string | null;
  email?: string | null;
  telegramChatId?: string | null;
};

export type ChannelCandidate = {
  channel: NotificationChannel;
  recipient: string | null;
};

export function channelPriority(): NotificationChannel[] {
  const configured = (process.env.NOTIFY_CHANNEL_PRIORITY || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(isNotificationChannel);
  const priority = configured.length
    ? configured
    : (["whatsapp", "sms", "email", "portal"] as NotificationChannel[]);
  return priority.includes("portal") ? priority : [...priority, "portal"];
}

export function recipientForChannel(
  channel: NotificationChannel,
  contact: PatientContact,
): string | null {
  if (channel === "portal") return null;
  if (channel === "email") return isEmailAddress(contact.email) ? contact.email! : null;
  if (channel === "telegram") return contact.telegramChatId || null;
  return isE164(contact.phone) ? contact.phone! : null;
}

/**
 * Выбирает первый канал, который одновременно настроен провайдером и имеет
 * пригодный адрес пациента. Портал — гарантированный запасной вариант: он не
 * уходит наружу, но и не теряет уведомление.
 */
export function pickChannel(
  contact: PatientContact,
  options: {
    priority?: NotificationChannel[];
    configured?: (channel: NotificationChannel) => boolean;
  } = {},
): ChannelCandidate {
  const priority = options.priority ?? channelPriority();
  const configured = options.configured ?? isChannelConfigured;
  for (const channel of priority) {
    if (!configured(channel)) continue;
    if (channel === "portal") return { channel, recipient: null };
    const recipient = recipientForChannel(channel, contact);
    if (recipient) return { channel, recipient };
  }
  return { channel: "portal", recipient: null };
}
