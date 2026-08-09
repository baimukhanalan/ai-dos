export const usageMetrics = [
  "appointments_created",
  "notifications_sent",
  "voice_minutes",
  "ai_messages",
] as const;
export type UsageMetric = (typeof usageMetrics)[number];

export const usageMetricLabels: Record<UsageMetric, string> = {
  appointments_created: "Записи на приём",
  notifications_sent: "Доставленные уведомления",
  voice_minutes: "Минуты голоса",
  ai_messages: "Ответы ассистента",
};
