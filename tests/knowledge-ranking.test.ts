import { describe, expect, it } from "vitest";
import { rankKnowledgeDocuments } from "@/lib/ai/knowledge-ranking";

describe("knowledge ranking", () => {
  const documents = [
    {
      id: "schedule",
      title: "График",
      locale: "ru",
      content:
        "График работы специалистов: Дуйсенбаева Жанна Кыргызбековна — 8:00–13:00.",
    },
    {
      id: "address",
      title: "Адрес клиники",
      locale: "ru",
      content: "Посёлок Байтерек, улица Комарова, 6А.",
    },
  ];

  it("finds a staff schedule when the wording asks which doctors work", () => {
    const result = rankKnowledgeDocuments(documents, "Какие врачи у вас работают?");

    expect(result[0]?.id).toBe("schedule");
    expect(result.some((document) => document.id === "address")).toBe(false);
  });

  it("keeps unrelated knowledge out of doctor schedule results", () => {
    const result = rankKnowledgeDocuments(documents, "Покажите расписание специалистов");

    expect(result.map((document) => document.id)).toEqual(["schedule"]);
  });
});
