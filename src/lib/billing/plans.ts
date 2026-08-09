import { usageMetrics, type UsageMetric } from "@/lib/billing/metrics";

export const planCodes = ["pilot", "clinic", "network"] as const;
export type PlanCode = (typeof planCodes)[number];

/** `null` — метрика без ограничения в этом тарифе. */
export type PlanLimits = Record<UsageMetric, number | null>;

export type Plan = {
  code: PlanCode;
  name: string;
  /**
   * Ориентировочная цена в тенге. Значения — заготовка продукта: коммерческие
   * условия подтверждает владелец, оплата проходит вне AI Dos.
   * `null` — тариф по договору.
   */
  priceKzt: number | null;
  description: string;
  limits: PlanLimits;
  features: string[];
};

export const plans: Record<PlanCode, Plan> = {
  pilot: {
    code: "pilot",
    name: "Пилот",
    priceKzt: 0,
    description:
      "Бесплатный запуск на одну клинику: портал, web-канал и голосовая лаборатория.",
    limits: {
      appointments_created: 300,
      notifications_sent: 500,
      voice_minutes: 120,
      ai_messages: 2000,
    },
    features: [
      "Один филиал и до 5 сотрудников",
      "Портальные уведомления",
      "Голосовая лаборатория и MCP",
    ],
  },
  clinic: {
    code: "clinic",
    name: "Клиника",
    priceKzt: 149_000,
    description:
      "Рабочий контур регистратуры: внешние каналы, лист ожидания и кампании.",
    limits: {
      appointments_created: 3000,
      notifications_sent: 8000,
      voice_minutes: 1500,
      ai_messages: 30_000,
    },
    features: [
      "До 3 филиалов и 25 сотрудников",
      "SMS, WhatsApp, Telegram и email через ваши шлюзы",
      "Автоподбор слотов из листа ожидания",
    ],
  },
  network: {
    code: "network",
    name: "Сеть",
    priceKzt: null,
    description:
      "Для сетей клиник: без лимитов по объёму, с white-label и приоритетной поддержкой.",
    limits: {
      appointments_created: null,
      notifications_sent: null,
      voice_minutes: null,
      ai_messages: null,
    },
    features: [
      "Неограниченные филиалы и сотрудники",
      "White-label портала",
      "Индивидуальный SLA и выделенная интеграция МИС",
    ],
  },
};

export function isPlanCode(value: string): value is PlanCode {
  return (planCodes as readonly string[]).includes(value);
}

export function getPlan(code: string | null | undefined): Plan {
  return isPlanCode(String(code)) ? plans[String(code) as PlanCode] : plans.pilot;
}

export type UsageState = {
  metric: UsageMetric;
  label: string;
  used: number;
  limit: number | null;
  ratio: number;
  state: "ok" | "warning" | "exceeded";
};

export function planUsageState(
  plan: Plan,
  usage: Partial<Record<UsageMetric, number>>,
  labels: Record<UsageMetric, string>,
): UsageState[] {
  return usageMetrics.map((metric) => {
    const used = Math.max(0, usage[metric] ?? 0);
    const limit = plan.limits[metric];
    const ratio = limit && limit > 0 ? used / limit : 0;
    return {
      metric,
      label: labels[metric],
      used,
      limit,
      ratio: Math.min(ratio, 1),
      state: limit === null ? "ok" : used >= limit ? "exceeded" : ratio >= 0.8 ? "warning" : "ok",
    };
  });
}

/** Тенге показываем без копеек — так их печатают в счетах клиник. */
export function formatKzt(value: number) {
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
  }).format(value);
}
