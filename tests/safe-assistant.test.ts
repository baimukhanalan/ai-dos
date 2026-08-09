import { describe, expect, it } from "vitest";
import { safeAssistantReply } from "@/lib/ai/safe-assistant";

describe("AI Dos safe assistant", () => {
  it("escalates urgent symptoms without diagnosing", () => {
    const reply = safeAssistantReply("Пациент не дышит и потерял сознание");

    expect(reply).toContain("112");
    expect(reply).toContain("103");
    expect(reply).toContain("сотруднику клиники");
  });

  it("keeps DAMUMED behind the official API boundary", () => {
    expect(safeAssistantReply("Когда подключите DAMUMED?")).toContain(
      "официального API",
    );
  });

  it("answers appointment requests in Kazakh", () => {
    const reply = safeAssistantReply("Дәрігерге жазылғым келеді");

    expect(reply).toContain("Жазылуға көмектесемін");
    expect(reply).toContain("расталғаннан кейін");
  });

  it("recognizes a request for the nearest available time", () => {
    const reply = safeAssistantReply(
      "Предложи пациенту ближайшее свободное время после 14:00",
    );

    expect(reply).toContain("Помогу с записью");
  });

  it("answers from the tenant knowledge base before using a generic reply", () => {
    const reply = safeAssistantReply("Где находится клиника?", {
      knowledge: [
        {
          id: crypto.randomUUID(),
          title: "Адрес клиники",
          locale: "ru",
          content: "Посёлок Байтерек, улица Комарова, 6А.",
        },
      ],
      services: [],
      doctors: [],
      branches: [],
    });

    expect(reply).toContain("утверждённой базе знаний");
    expect(reply).toContain("Комарова, 6А");
  });

  it("keeps emergency escalation above knowledge grounding", () => {
    const reply = safeAssistantReply("Пациент не дышит, какой адрес?", {
      knowledge: [
        {
          id: crypto.randomUUID(),
          title: "Адрес",
          locale: "ru",
          content: "Улица Комарова, 6А.",
        },
      ],
      services: [],
      doctors: [],
      branches: [],
    });

    expect(reply).toContain("112");
    expect(reply).not.toContain("Комарова");
  });

  it("uses the published staff schedule instead of structured placeholder doctors", () => {
    const reply = safeAssistantReply("Какие врачи работают и какой у них график?", {
      knowledge: [
        {
          id: crypto.randomUUID(),
          title: "График",
          locale: "ru",
          content:
            "ВОП — Дуйсенбаева Жанна Кыргызбековна: Пн 8:00–13:00; Вт 11:00–17:00.",
        },
      ],
      services: [],
      doctors: [
        {
          id: crypto.randomUUID(),
          name: "Тестовый врач",
          specialty: "Терапия",
          branch: null,
          languages: ["ru"],
        },
      ],
      branches: [],
    });

    expect(reply).toContain("Дуйсенбаева Жанна");
    expect(reply).not.toContain("Тестовый врач");
  });
});
