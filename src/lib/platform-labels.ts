export const platformPlanLabels: Record<string, string> = {
  none: "Без тарифа",
  pilot: "Pilot",
  trial: "Пробный",
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

export const platformSubscriptionLabels: Record<string, string> = {
  missing: "Нет подписки",
  trialing: "Пробный период",
  active: "Активна",
  past_due: "Просрочена",
  cancelled: "Отменена",
};

export function platformPlanLabel(value: string) {
  return platformPlanLabels[value] || value;
}

export function platformSubscriptionLabel(value: string) {
  return platformSubscriptionLabels[value] || value;
}
