import type { PatientIntent } from "@/lib/ai/escalation";

export const ruleCategories = [
  "scheduling",
  "preparation",
  "policy",
  "insurance",
  "pricing",
  "exception",
  "general",
] as const;
export type RuleCategory = (typeof ruleCategories)[number];

export const ruleCategoryLabels: Record<RuleCategory, string> = {
  scheduling: "Расписание и запись",
  preparation: "Подготовка к приёму",
  policy: "Правила клиники",
  insurance: "ОСМС / ГОБМП / платно",
  pricing: "Цены и оплата",
  exception: "Исключения",
  general: "Общее",
};

export type KnowledgeRule = {
  id: string;
  category: RuleCategory;
  scope: "clinic" | "doctor" | "service";
  scopeRef: string | null;
  locale: "ru" | "kk" | "en";
  title: string;
  body: string;
  keywords: string[];
  priority: number;
};

/** Какие категории правил уместны для распознанного intent. */
export const intentCategories: Record<PatientIntent, RuleCategory[]> = {
  book: ["scheduling", "policy", "exception"],
  reschedule: ["scheduling", "policy", "exception"],
  cancel: ["policy", "scheduling"],
  schedule_info: ["scheduling", "general"],
  price: ["pricing", "insurance"],
  address: ["general"],
  preparation: ["preparation"],
  find_doctor: ["scheduling", "general"],
  appointment_info: ["policy", "scheduling"],
  urgent: ["exception", "scheduling", "policy"],
  results: ["policy"],
  complaint: ["policy"],
  human: ["policy"],
  other: ["general"],
};

function tokenize(value: string) {
  return value
    .toLocaleLowerCase("ru-KZ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3);
}

/**
 * Выбирает наиболее подходящее правило под конкретное обращение: сначала по
 * категориям, релевантным intent, затем по совпадению ключевых слов и текста,
 * с учётом приоритета правила. Возвращает адресный ответ, а не весь свод.
 */
export function matchKnowledgeRule(
  rules: KnowledgeRule[],
  message: string,
  intent: PatientIntent,
  locale: "ru" | "kk" | "en" = "ru",
): KnowledgeRule | null {
  const categories = new Set(intentCategories[intent] ?? ["general"]);
  const tokens = tokenize(message);
  let best: { rule: KnowledgeRule; score: number } | null = null;

  for (const rule of rules) {
    let score = 0;
    if (categories.has(rule.category)) score += 5;
    if (rule.locale === locale) score += 2;

    const haystack = `${rule.title} ${rule.body} ${rule.keywords.join(" ")}`.toLocaleLowerCase("ru-KZ");
    for (const token of tokens) {
      if (rule.keywords.some((k) => k.toLocaleLowerCase("ru-KZ") === token)) score += 4;
      else if (haystack.includes(token)) score += 1;
    }
    // Приоритет правила — тонкий тай-брейкер (меньше число = важнее).
    score += Math.max(0, (200 - rule.priority) / 200);

    if (score >= 6 && (!best || score > best.score)) {
      best = { rule, score };
    }
  }

  return best?.rule ?? null;
}
