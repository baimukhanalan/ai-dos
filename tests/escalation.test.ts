import { describe, expect, it } from "vitest";
import {
  classifyEscalation,
  detectIntent,
  escalationReasons,
  maskPhone,
} from "@/lib/ai/escalation";

describe("классификатор эскалации", () => {
  it("экстренные симптомы — высший приоритет, минуя запись", () => {
    for (const text of [
      "у меня сильная боль в груди",
      "не могу дышать",
      "кеудем қатты ауырып тұр",
      "chest pain and can't breathe",
    ]) {
      const d = classifyEscalation(text);
      expect(d.shouldEscalate, text).toBe(true);
      expect(d.reason).toBe("emergency");
      expect(d.priority).toBe("urgent");
    }
  });

  it("жалоба уходит человеку с высоким приоритетом", () => {
    const d = classifyEscalation("Хочу оставить жалобу, врач был груб");
    expect(d.reason).toBe("complaint");
    expect(d.priority).toBe("high");
  });

  it("явная просьба о человеке передаётся без спора", () => {
    for (const text of ["соедините с оператором", "нужен живой человек", "talk to a human", "нақты адаммен сөйлескім келеді"]) {
      expect(classifyEscalation(text).reason, text).toBe("human_request");
    }
  });

  it("запрос результатов анализов — чувствительные данные", () => {
    const d = classifyEscalation("скажите результаты моих анализов");
    expect(d.reason).toBe("sensitive_data");
    expect(d.intent).toBe("results");
  });

  it("обычная запись не эскалируется", () => {
    const d = classifyEscalation("хочу записаться к терапевту на среду");
    expect(d.shouldEscalate).toBe(false);
    expect(d.intent).toBe("book");
  });

  it("любая причина входит в разрешённый набор", () => {
    const d = classifyEscalation("привет");
    expect(escalationReasons).toContain(d.reason);
  });

  it("intent различает перенос, отмену и цену", () => {
    expect(detectIntent("хочу перенести приём на другое время")).toBe("reschedule");
    expect(detectIntent("отмените мою запись")).toBe("cancel");
    expect(detectIntent("сколько стоит УЗИ")).toBe("price");
    expect(detectIntent("как к вам добраться")).toBe("address");
  });

  it("телефон маскируется до последних цифр", () => {
    expect(maskPhone("+77001234567")).toBe("••• 4567");
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone("12")).toBe("•••");
  });
});
