import { describe, expect, it } from "vitest";
import {
  intentCategories,
  matchKnowledgeRule,
  ruleCategories,
  type KnowledgeRule,
} from "@/lib/ai/knowledge-rules";
import { patientIntents } from "@/lib/ai/escalation";

const rules: KnowledgeRule[] = [
  {
    id: "1",
    category: "preparation",
    scope: "service",
    scopeRef: null,
    locale: "ru",
    title: "Подготовка к УЗИ брюшной полости",
    body: "Натощак, не есть за 8 часов.",
    keywords: ["узи", "подготовка", "натощак"],
    priority: 50,
  },
  {
    id: "2",
    category: "policy",
    scope: "clinic",
    scopeRef: null,
    locale: "ru",
    title: "Опоздание",
    body: "При опоздании более 15 минут приём переносится.",
    keywords: ["опоздание", "задержка"],
    priority: 100,
  },
  {
    id: "3",
    category: "pricing",
    scope: "clinic",
    scopeRef: null,
    locale: "ru",
    title: "Оплата ОСМС",
    body: "Приём по ОСМС бесплатный при наличии направления.",
    keywords: ["осмс", "бесплатно", "направление"],
    priority: 100,
  },
];

describe("матчинг структурированных правил", () => {
  it("находит правило подготовки по ключевому слову и intent", () => {
    const rule = matchKnowledgeRule(rules, "как подготовиться к УЗИ", "preparation");
    expect(rule?.id).toBe("1");
  });

  it("под intent цены достаёт правило об оплате", () => {
    const rule = matchKnowledgeRule(rules, "сколько стоит приём по ОСМС", "price");
    expect(rule?.id).toBe("3");
  });

  it("нерелевантное обращение не вытягивает случайное правило", () => {
    const rule = matchKnowledgeRule(rules, "спасибо большое", "other");
    expect(rule).toBeNull();
  });

  it("каждому intent сопоставлены допустимые категории", () => {
    for (const intent of patientIntents) {
      const cats = intentCategories[intent];
      expect(cats.length).toBeGreaterThan(0);
      for (const c of cats) expect(ruleCategories).toContain(c);
    }
  });
});
