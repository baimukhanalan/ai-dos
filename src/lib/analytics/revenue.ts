export type RevenueFunnel = {
  conversations: number;
  bookingIntents: number;
  bookings: number;
  completed: number;
};

export type LostDemandItem = {
  key: string;
  count: number;
  estimatedKzt: number;
};

/**
 * Директору важна не «AI обработал 13 821 звонок», а деньги. Все числа здесь —
 * из реальных строк: выручка = завершённые визиты × цена услуги. Там, где цена
 * не опубликована, визит в деньги не попадает, поэтому это оценка снизу.
 */
export function conversionRate(funnel: RevenueFunnel) {
  if (funnel.conversations <= 0) return 0;
  return Math.min(1, funnel.bookings / funnel.conversations);
}

export function formatKztShort(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)} млн ₸`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)} тыс ₸`;
  }
  return `${Math.round(value)} ₸`;
}

export function formatKzt(value: number) {
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
  }).format(value);
}

export const lostDemandLabels: Record<string, string> = {
  no_show: "Неявки (пустой слот)",
  declined_urgent: "Отказано в срочном приёме",
  expired_offer: "Предложение не подтверждено",
  cancelled: "Отмены",
};

/** Сумма потенциально потерянной выручки по всем причинам. */
export function totalLost(items: LostDemandItem[]) {
  return items.reduce((sum, item) => sum + Math.max(0, item.estimatedKzt), 0);
}
