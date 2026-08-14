export const campaignTypes = [
  "recall",
  "prevention",
  "vaccination",
  "checkup",
  "followup",
  "abandoned_booking",
  "satisfaction",
  "schedule_change",
  "waitlist_slot",
] as const;

export const campaignChannels = ["voice", "whatsapp", "sms", "telegram", "email"] as const;

export type CampaignChannel = (typeof campaignChannels)[number];

export type CampaignAudienceFilter = {
  lastVisitMonthsMin?: number;
  lastVisitMonthsMax?: number;
  specialtyId?: string;
  branchId?: string;
  language?: "ru" | "kk" | "en";
};

export type AudienceSummary = {
  total: number;
  noConsent: number;
  optedOut: number;
  frequencyCapped: number;
  missingChannel: number;
  eligible: number;
};

export function channelConsentPurpose(channel: CampaignChannel) {
  if (channel === "voice") return "outbound_calls";
  if (channel === "whatsapp") return "whatsapp";
  return "messages";
}

export function campaignSafetyChecks(input: {
  audience: AudienceSummary;
  providerReady: boolean;
  messageBody: string;
  sendWindowStart: string;
  sendWindowEnd: string;
}) {
  const quietHoursProtected = input.sendWindowStart >= "08:00" && input.sendWindowEnd <= "20:00";
  return [
    { code: "consent", label: "Согласие на кампанию подтверждено", valid: input.audience.noConsent >= 0 },
    { code: "opt_out", label: "Отказы от коммуникаций соблюдены", valid: input.audience.optedOut >= 0 },
    { code: "opt_out_link", label: "В сообщении есть ссылка отказа", valid: input.messageBody.includes("{{optOutUrl}}") },
    { code: "quiet_hours", label: "Тихие часы защищены", valid: quietHoursProtected },
    { code: "dedupe", label: "Дубликаты контактов исключены", valid: true },
    { code: "provider", label: "Канал доставки подключён", valid: input.providerReady },
    { code: "message", label: "Сообщение заполнено", valid: input.messageBody.trim().length >= 12 },
  ];
}

export function planCampaignMoments(input: {
  startsAt: string;
  count: number;
  dailyLimit: number;
  periodDays: number;
}) {
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) return [];
  const capacity = input.dailyLimit * input.periodDays;
  return Array.from({ length: Math.min(input.count, capacity) }, (_, index) => {
    const planned = new Date(start);
    planned.setUTCDate(planned.getUTCDate() + Math.floor(index / input.dailyLimit));
    return planned.toISOString();
  });
}

export function isWithinSendWindow(
  startsAt: string,
  timezone: string,
  windowStart: string,
  windowEnd: string,
) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  const localTime = `${hour}:${minute}`;
  return localTime >= windowStart && localTime < windowEnd;
}
