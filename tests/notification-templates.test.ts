import { describe, expect, it } from "vitest";
import {
  defaultTemplates,
  formatMoment,
  getDefaultTemplate,
  notificationTemplateCodes,
  renderTemplate,
  resolveLocale,
} from "@/lib/notifications/templates";

describe("шаблоны уведомлений", () => {
  it("подставляет переменные и не оставляет плейсхолдеров", () => {
    const result = renderTemplate(
      "{{patientName}}, вы записаны к {{doctorName}} на {{startsAt}}.",
      {
        patientName: "Айгуль",
        doctorName: "Ержан Сериков",
        startsAt: "12 мая, 10:00",
      },
    );
    expect(result.text).toBe(
      "Айгуль, вы записаны к Ержан Сериков на 12 мая, 10:00.",
    );
    expect(result.missing).toEqual([]);
    expect(result.omitted).toBe(0);
  });

  it("выбрасывает предложение целиком, если переменной нет", () => {
    const result = renderTemplate(
      "Айгуль, вы записаны на приём. Отменить или перенести: {{supportPhone}}.",
      { supportPhone: null },
      { omitIncompleteSentences: true },
    );
    expect(result.text).toBe("Айгуль, вы записаны на приём.");
    expect(result.text).not.toContain("{{");
    expect(result.missing).toEqual(["supportPhone"]);
    expect(result.omitted).toBe(1);
  });

  it("без omitIncompleteSentences подставляет пустую строку, но сообщает о пропуске", () => {
    const result = renderTemplate("Телефон: {{supportPhone}}", {});
    expect(result.text).toBe("Телефон:");
    expect(result.missing).toEqual(["supportPhone"]);
  });

  it("нормализует локаль пациента и падает обратно на русский", () => {
    expect(resolveLocale("kk-KZ")).toBe("kk");
    expect(resolveLocale("EN")).toBe("en");
    expect(resolveLocale("tr")).toBe("ru");
    expect(resolveLocale(null)).toBe("ru");
  });

  it("для каждого кода есть текст на трёх языках", () => {
    for (const code of notificationTemplateCodes) {
      for (const locale of ["ru", "kk", "en"] as const) {
        const template = getDefaultTemplate(code, locale);
        expect(template?.body.length, `${code}/${locale}`).toBeGreaterThan(20);
      }
    }
  });

  it("встроенные тексты не содержат медицинских утверждений", () => {
    const bodies = Object.values(defaultTemplates)
      .flatMap((locales) => Object.values(locales))
      .map((template) => template.body.toLowerCase());
    for (const body of bodies) {
      expect(body).not.toContain("диагноз");
      expect(body).not.toContain("лечение");
    }
  });

  it("показывает время в часовом поясе клиники", () => {
    const formatted = formatMoment(
      "2026-05-12T04:00:00.000Z",
      "Asia/Almaty",
      "ru",
    );
    expect(formatted).toContain("2026");
    expect(formatted).toContain("09:00");
  });

  it("не форматирует некорректную дату", () => {
    expect(formatMoment("не дата", "Asia/Almaty", "ru")).toBeNull();
  });
});
